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

/*
 * WORK-IN-PROGRESS POINTS, AND WHY THEY ARE NOT SCORE.
 *
 * A board that only moves when somebody submits is a board that sits still for
 * forty seconds and then jumps. To make the room feel alive while students are
 * still working, a player may publish a provisional total: what their partial
 * credit is worth SO FAR, from the step credit their solver has already
 * accepted.
 *
 * It is display only. It is reported by the browser, so it is not trusted: it
 * is clamped here, it never reaches `score`, and the server recomputes the real
 * points from the real response at submit. A student who tampered with it would
 * move a number on a leaderboard for a few seconds and earn nothing. That is a
 * deliberate trade — the alternative is grading every step on the server, which
 * would cost a round trip per click and still be gameable by whoever wrote the
 * step.
 */
/*
 * WHAT KIND OF QUESTION A GAME SHOULD DRAW.
 *
 * Roughly three quarters of the bank is typed or chosen answers, so a random
 * ten-round draw is almost always ten of those. That is a fine game, but it is
 * not the game a teacher means when they say they want students plotting points
 * or working a solver — and no amount of shuffling makes a rare thing common.
 *
 * So the style is a choice rather than a hope. It is applied to candidates
 * before selection, which means a game that cannot be filled says so at create
 * time instead of quietly serving the wrong kind of round.
 */
export const CHALLENGE_QUESTION_STYLES = ['any', 'tools', 'noTools'];

export const canonicalQuestionStyle = (value) => {
  const style = String(value ?? '').trim();
  return CHALLENGE_QUESTION_STYLES.includes(style) ? style : 'any';
};

// Bank records spell the tool three different ways depending on their vintage.
export const pathToolIdOf = (question) => {
  const id = question?.pathToolId || question?.toolId || question?.tool?.id || '';
  const trimmed = String(id).trim();
  return trimmed || null;
};

export const matchesQuestionStyle = (question, style) => {
  const normalized = canonicalQuestionStyle(style);
  if (normalized === 'any') return true;
  const hasTool = pathToolIdOf(question) !== null;
  return normalized === 'tools' ? hasTool : !hasTool;
};

export const LIVE_PROVISIONAL_MAX_POINTS = 1000;

export const provisionalPointsFor = (player, activeRound = null) => {
  if (activeRound == null) return 0;
  if (Number(player?.provisionalRound) !== Number(activeRound)) return 0;
  // Once the round is actually answered the real score is authoritative. A
  // provisional left lying around must never stack on top of it.
  if (Number(player?.answeredRound) === Number(activeRound)) return 0;
  const points = Math.round(Number(player?.provisionalPoints) || 0);
  return Math.max(0, Math.min(LIVE_PROVISIONAL_MAX_POINTS, points));
};

/*
 * `activeRound` is optional and defaults to off, so every existing caller —
 * the report, the export, the finished standings — keeps ranking on banked
 * score alone and cannot accidentally publish an in-progress number.
 */
export const publicLeaderboard = (players = {}, { activeRound = null } = {}) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false)
  .map((player) => {
    const score = Math.max(0, Math.round(Number(player.score) || 0));
    const provisionalPoints = provisionalPointsFor(player, activeRound);
    return {
      playerKey: player?.playerKey ? String(player.playerKey).slice(0, 80) : null,
      alias: String(player.alias || 'Player').slice(0, 60),
      score,
      provisionalPoints,
      liveScore: score + provisionalPoints,
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)),
      streak: Math.max(0, Math.round(Number(player.streak) || 0)),
      answeredRound: Number.isInteger(Number(player.answeredRound)) ? Number(player.answeredRound) : -1,
    };
  })
  .sort((a, b) => b.liveScore - a.liveScore || b.correctCount - a.correctCount || a.alias.localeCompare(b.alias))
  .map((player, index) => ({ ...player, rank: index + 1 }));

export const joinedPlayerCount = (players = {}) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false).length;

export const currentAnsweredCount = (players = {}, roundIndex = null) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false && (roundIndex == null ? player?.answeredCurrent === true : Number(player?.answeredRound) === Number(roundIndex))).length;

export const challengeCanAdvance = ({ joinedCount = 0, answeredCount = 0, roundEndsAtMs = 0, nowMs = Date.now() } = {}) => (
  Number(joinedCount) > 0
  && (Number(answeredCount) >= Number(joinedCount) || Number(nowMs) >= Number(roundEndsAtMs || 0))
);

/*
 * HOW MANY ANSWERED EACH ROUND, AND HOW MANY MISSED IT — DERIVED, NOT COUNTED.
 *
 * These two tallies used to be maintained on the private state document: every
 * submission incremented them inside its transaction. That made one document
 * take a write per student per round. A class of 24 answering within a couple of
 * seconds is roughly 24 writes to a single document in that window, and
 * Firestore's guidance for sustained writes to one document is about one per
 * second. Correctness held — a concurrency suite proved no increment was lost —
 * but the shape was a hot spot waiting for a bad day, and the failure mode is a
 * student being told their correct answer did not count.
 *
 * The counts were always redundant. Each player document already records which
 * rounds that student answered and which they missed, because mastery evidence
 * needs both. The room-level numbers are just those arrays added up, and both
 * consumers — the second-chance planner and the post-game report — already load
 * every player. So this deletes state rather than sharding it.
 *
 * REPLAYS ARE EXCLUDED, exactly as the increments excluded them. A second-chance
 * round is the same question offered again; counting it would inflate the
 * denominator of a question the class has already been measured on, and could
 * put a round back on the replay list for being "missed" twice.
 */
export const deriveRoundTallies = ({
  players = [],
  secondChanceOf = {},
  storedRoundAnswers = null,
  storedRoundMisses = null,
} = {}) => {
  const replays = new Set(
    Object.keys(secondChanceOf || {})
      .map((key) => Math.round(Number(key)))
      .filter((value) => Number.isFinite(value)),
  );

  const roundAnswers = {};
  const roundMisses = {};
  const bump = (target, round) => {
    const key = String(round);
    target[key] = (target[key] || 0) + 1;
  };

  (Array.isArray(players) ? players : []).forEach((player) => {
    const answered = Array.isArray(player?.answeredRounds) ? player.answeredRounds : [];
    const missed = new Set(
      (Array.isArray(player?.missedRounds) ? player.missedRounds : [])
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value)),
    );
    const seen = new Set();
    answered
      .map((value) => Math.round(Number(value)))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .forEach((round) => {
        if (replays.has(round) || seen.has(round)) return;
        seen.add(round);
        bump(roundAnswers, round);
        if (missed.has(round)) bump(roundMisses, round);
      });
  });

  /*
   * A ROOM THAT WAS ALREADY RUNNING WHEN THIS SHIPPED.
   *
   * Its early answers were counted the old way and never recorded a per-player
   * answeredRounds entry, so deriving alone would report zero for those rounds
   * and could drop a genuinely missed question off the replay list mid-game.
   * Where a stored count exists and the derived one cannot see it, the stored
   * number is kept. This is a fallback for rooms in flight across one deploy,
   * not a second source of truth: nothing writes these fields any more, so it
   * stops mattering as soon as those rooms end.
   */
  const withFallback = (derived, stored) => {
    if (!stored || typeof stored !== 'object') return derived;
    const merged = { ...derived };
    Object.entries(stored).forEach(([key, value]) => {
      const legacy = Math.round(Number(value)) || 0;
      if (legacy > (merged[key] || 0)) merged[key] = legacy;
    });
    return merged;
  };

  return {
    roundAnswers: withFallback(roundAnswers, storedRoundAnswers),
    roundMisses: withFallback(roundMisses, storedRoundMisses),
  };
};
