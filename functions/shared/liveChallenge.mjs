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
 */
export const scoreChallengeRound = ({
  gradeScore = 0,
  isCorrect = false,
  remainingMs = 0,
  totalMs = DEFAULT_ROUND_SECONDS * 1000,
  previousStreak = 0,
} = {}) => {
  const ratio = clamp(Number(gradeScore) || 0, 0, 1);
  const safeTotal = Math.max(1, Number(totalMs) || 1);
  const remainingRatio = clamp((Number(remainingMs) || 0) / safeTotal, 0, 1);
  const basePoints = Math.round(1000 * ratio);
  const speedBonus = isCorrect ? Math.round(100 * remainingRatio) : 0;
  const newStreak = isCorrect ? Math.max(0, Math.floor(Number(previousStreak) || 0)) + 1 : 0;
  // The first correct answer establishes the streak; bonuses begin with the
  // second and cap quickly so the game never becomes mostly a speed contest.
  const streakBonus = isCorrect ? Math.min(100, Math.max(0, newStreak - 1) * 25) : 0;
  return {
    basePoints,
    speedBonus,
    streakBonus,
    pointsAwarded: basePoints + speedBonus + streakBonus,
    newStreak,
  };
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
