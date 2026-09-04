// Pure Live Challenge rules shared by Cloud Functions and tests.
//
// The game is deliberately accuracy-first. A correct answer is worth 1000
// points; speed can add at most 100 and a streak can add at most another 100.
// That means a fast guess can never outweigh actually knowing one more problem.

export const LIVE_CHALLENGE_STATUS = Object.freeze({
  LOBBY: 'lobby',
  RUNNING: 'running',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
});

export const DEFAULT_ROUND_COUNT = 10;
export const MIN_ROUND_COUNT = 3;
export const MAX_ROUND_COUNT = 20;
export const DEFAULT_ROUND_SECONDS = 45;
export const MIN_ROUND_SECONDS = 15;
export const MAX_ROUND_SECONDS = 120;

/*
 * PERSEVERANCE POINTS.
 *
 * Every bonus in the original scoring was gated on being fully correct: speed
 * only pays on a correct answer, and a streak only exists while you keep
 * getting them right. So the student having the hardest time could not reach a
 * single bonus in the game, and a student who missed four in a row scored
 * identically whether they fought each one or typed anything to make it stop.
 *
 * These two rules put points on the behaviour of not giving up.
 */

// Paid for a correct answer immediately after a miss. Deliberately larger than
// the streak bonus: recovering is the harder thing and the design should say
// so. It cannot be farmed — missing on purpose costs a 1000-point base to win
// 150 back, which is a bad trade in every direction.
export const COMEBACK_BONUS = 150;

// A replayed question is worth most of its points to the student who missed it
// the first time...
export const SECOND_CHANCE_RECOVERY_SHARE = 0.75;
// ...and a little to the student who already had it right, so the round is not
// dead time for them. The shares are chosen so first-time-correct still outranks
// missed-then-recovered on the same question (1000 + 250 against 0 + 750): the
// leaderboard keeps meaning what it means, and the recovery is still worth
// fighting for.
export const SECOND_CHANCE_CONFIRM_SHARE = 0.25;

// Enough to matter, few enough that the game still ends.
export const MAX_SECOND_CHANCE_ROUNDS = 3;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeRoundCount = (value) => clamp(
  Math.round(Number(value) || DEFAULT_ROUND_COUNT),
  MIN_ROUND_COUNT,
  MAX_ROUND_COUNT,
);

export const normalizeRoundSeconds = (value) => clamp(
  Math.round(Number(value) || DEFAULT_ROUND_SECONDS),
  MIN_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
);

export const canonicalChallengeStandard = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'mixed') return 'mixed';
  return raw.replace(/^texas:/i, '').toUpperCase().replace(/\s+/g, '');
};

const ADJECTIVES = Object.freeze([
  'Vector', 'Prime', 'Rapid', 'Clever', 'Delta', 'Bright', 'Nimble', 'Logic',
  'Sigma', 'Graph', 'Algebra', 'Cosmic', 'Golden', 'Silver', 'Turbo', 'Nova',
]);
const NOUNS = Object.freeze([
  'Falcon', 'Fox', 'Owl', 'Panther', 'Wolf', 'Eagle', 'Comet', 'Rocket',
  'Solver', 'Ranger', 'Pilot', 'Tiger', 'Hawk', 'Dragon', 'Orbit', 'Vertex',
]);

export const challengeAlias = (index = 0, seed = 0) => {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const safeSeed = Math.abs(Math.floor(Number(seed) || 0));
  const adjective = ADJECTIVES[(safeIndex + safeSeed) % ADJECTIVES.length];
  const noun = NOUNS[(safeIndex * 3 + safeSeed) % NOUNS.length];
  const number = ((safeIndex + safeSeed) % 89) + 11;
  return `${adjective} ${noun} ${number}`;
};

/**
 * Accuracy-first round scoring.
 *
 * gradeScore is the server grader's 0..1 score, so multipart tools can earn
 * partial credit without pretending the whole response was correct. Speed and
 * streak bonuses are reserved for fully correct work.
 *
 * A SECOND-CHANCE ROUND IS SCORED AS A DIFFERENT KIND OF ROUND. It pays no
 * speed bonus, because a replay exists to be learned from rather than raced,
 * and it leaves the streak untouched in both directions — a bonus round should
 * neither rescue a broken streak nor break an intact one. What it pays instead
 * is recovery: most of the question's value to whoever missed it first time.
 */
export const scoreChallengeRound = ({
  gradeScore = 0,
  isCorrect = false,
  remainingMs = 0,
  totalMs = DEFAULT_ROUND_SECONDS * 1000,
  previousStreak = 0,
  // Whether this player's previous answered round was a miss. Passed rather
  // than inferred from previousStreak === 0, which is also true of a player's
  // very first round — and paying a comeback bonus for turning up would empty
  // the word of meaning.
  previousRoundMissed = false,
  secondChance = false,
  missedOriginally = false,
} = {}) => {
  const ratio = clamp(Number(gradeScore) || 0, 0, 1);
  const safeTotal = Math.max(1, Number(totalMs) || 1);
  const remainingRatio = clamp((Number(remainingMs) || 0) / safeTotal, 0, 1);
  const carriedStreak = Math.max(0, Math.floor(Number(previousStreak) || 0));

  if (secondChance) {
    const share = missedOriginally ? SECOND_CHANCE_RECOVERY_SHARE : SECOND_CHANCE_CONFIRM_SHARE;
    const recoveryPoints = isCorrect ? Math.round(1000 * ratio * share) : 0;
    return {
      basePoints: 0,
      speedBonus: 0,
      streakBonus: 0,
      comebackBonus: 0,
      recoveryPoints,
      pointsAwarded: recoveryPoints,
      newStreak: carriedStreak,
      secondChance: true,
    };
  }

  const basePoints = Math.round(1000 * ratio);
  const speedBonus = isCorrect ? Math.round(100 * remainingRatio) : 0;
  const newStreak = isCorrect ? carriedStreak + 1 : 0;
  // The first correct answer establishes the streak; bonuses begin with the
  // second and cap quickly so the game never becomes mostly a speed contest.
  const streakBonus = isCorrect ? Math.min(100, Math.max(0, newStreak - 1) * 25) : 0;
  const comebackBonus = isCorrect && previousRoundMissed === true ? COMEBACK_BONUS : 0;
  return {
    basePoints,
    speedBonus,
    streakBonus,
    comebackBonus,
    recoveryPoints: 0,
    pointsAwarded: basePoints + speedBonus + streakBonus + comebackBonus,
    newStreak,
    secondChance: false,
  };
};

/**
 * Which rounds to replay at the end, most-missed first.
 *
 * Class-level rather than per-student, because every player sees the same
 * question each round — a personal replay would break the one thing that makes
 * this a shared game. Replaying what the room got wrong most is also the better
 * teaching choice: it is the question the class needs a second look at.
 *
 * A question nobody missed is never replayed, so a strong class simply finishes
 * early rather than sitting through a recap of work it already did.
 */
export const planSecondChanceRounds = ({
  roundMisses = {},
  scheduledRoundCount = 0,
  limit = MAX_SECOND_CHANCE_ROUNDS,
} = {}) => {
  const scheduled = Math.max(0, Math.floor(Number(scheduledRoundCount) || 0));
  const cap = clamp(Math.floor(Number(limit) || 0), 0, MAX_SECOND_CHANCE_ROUNDS);
  if (!scheduled || !cap) return [];

  return Object.entries(roundMisses || {})
    .map(([index, misses]) => ({ roundIndex: Number(index), misses: Math.floor(Number(misses) || 0) }))
    .filter((entry) => Number.isInteger(entry.roundIndex)
      && entry.roundIndex >= 0
      && entry.roundIndex < scheduled
      && entry.misses > 0)
    // Most missed first; ties resolve by the order the class met them, so the
    // replay reads as a recap rather than an arbitrary shuffle.
    .sort((a, b) => b.misses - a.misses || a.roundIndex - b.roundIndex)
    .slice(0, cap)
    .map((entry) => entry.roundIndex);
};

export const publicLeaderboard = (players = {}) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false)
  .map((player) => ({
    playerKey: player?.playerKey ? String(player.playerKey).slice(0, 80) : null,
    alias: String(player.alias || 'Player').slice(0, 60),
    score: Math.max(0, Math.round(Number(player.score) || 0)),
    correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)),
    roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)),
    streak: Math.max(0, Math.round(Number(player.streak) || 0)),
    answeredRound: Number.isInteger(Number(player.answeredRound)) ? Number(player.answeredRound) : -1,
  }))
  .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.alias.localeCompare(b.alias))
  .map((player, index) => ({ ...player, rank: index + 1 }));

export const joinedPlayerCount = (players = {}) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false).length;

export const currentAnsweredCount = (players = {}, roundIndex = null) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false && (roundIndex == null ? player?.answeredCurrent === true : Number(player?.answeredRound) === Number(roundIndex))).length;

export const challengeCanAdvance = ({ joinedCount = 0, answeredCount = 0, roundEndsAtMs = 0, nowMs = Date.now() } = {}) => (
  Number(joinedCount) > 0
  && (Number(answeredCount) >= Number(joinedCount) || Number(nowMs) >= Number(roundEndsAtMs || 0))
);
