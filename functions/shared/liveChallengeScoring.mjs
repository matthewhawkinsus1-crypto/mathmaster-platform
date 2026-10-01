/*
 * SCORING STRATEGIES.
 *
 * Game score is not the rewards ledger and is not a grade. It is the number a
 * leaderboard ranks by, and different games need different arithmetic for it.
 * A strategy owns exactly three decisions:
 *
 *   scoreResponse         points for one graded response (receipt-ready)
 *   matchPointsForPlacement  how a finished round's rank converts into match
 *                            points (0 for strategies that accumulate per
 *                            response)
 *   matchRanking          how the match leaderboard is ordered
 *
 * Everything else — who may answer, when a round closes, what a round's
 * performance metrics are, how results are persisted — belongs to the engine
 * and the game mode, not to the strategy.
 *
 * THE STRATEGIES.
 *
 *   accuracyFirst  The existing game, unchanged in its arithmetic: 1000 for
 *                  correctness, bounded speed, streak and comeback bonuses,
 *                  second-chance recovery shares. The match total is the sum
 *                  of every response.
 *
 *   grandPrix      Race-style. Round performance -> round rank -> a bounded
 *                  number of placement points -> championship total. One
 *                  runaway round cannot decide the match. Speed breaks ties
 *                  only between students with equal correct work, because the
 *                  mode's round ranking puts correctness first.
 *
 *   correctCount   One point per fully correct response. The plainest raw
 *                  total, for modes where bonuses would be noise.
 *
 * SPEED INFLUENCE IS NATIVE. The teacher's speed setting (0-50% of the 1000
 * correctness base) used to be applied AFTER the mature scorer returned, by a
 * wrapper that edited the stored receipt, with a Firestore trigger that
 * reverse-engineered the bonus from score deltas as a fallback. That trigger
 * assumed this exact point table and would have corrupted any other strategy.
 * The strategy now scales speed itself, using the very same arithmetic the
 * wrapper used, so a Standard room pays precisely what it paid before.
 */

import { ACCURACY_FIRST_MATCH_RANKING, scoreChallengeRound } from './liveChallenge.mjs';
import { LEGACY_SPEED_INFLUENCE_PERCENT, scaleLegacySpeedPoints } from './liveChallengeExperience.mjs';
import {
  DEFAULT_PLACEMENT_POINTS,
  MAX_PLACEMENT_POINTS,
  RANK_DIRECTION,
  normalizePlacementTable,
  normalizeRankingSpec,
  placementPoints,
} from './liveChallengeRanking.mjs';

export { LEGACY_SPEED_INFLUENCE_PERCENT, scaleLegacySpeedPoints };

export const SCORING_STRATEGY_ID = Object.freeze({
  ACCURACY_FIRST: 'accuracyFirst',
  GRAND_PRIX: 'grandPrix',
  CORRECT_COUNT: 'correctCount',
});

export const SCORE_ACCUMULATION = Object.freeze({
  PER_RESPONSE: 'perResponse',
  PER_ROUND: 'perRound',
});

export class ScoringStrategyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScoringStrategyError';
  }
}

const int = (value) => Math.max(0, Math.round(Number(value) || 0));

const requireFunction = (definition, name) => {
  if (typeof definition[name] !== 'function') {
    throw new ScoringStrategyError(`Scoring strategy "${definition.id}" must define ${name}().`);
  }
};

/** Validate and freeze a strategy definition. */
export const defineScoringStrategy = (definition = {}) => {
  const id = String(definition.id || '').trim();
  if (!/^[a-z][A-Za-z0-9]{1,40}$/.test(id)) throw new ScoringStrategyError(`Invalid scoring strategy id "${id}".`);
  if (!Object.values(SCORE_ACCUMULATION).includes(definition.accumulation)) {
    throw new ScoringStrategyError(`Scoring strategy "${id}" needs an accumulation of perResponse or perRound.`);
  }
  requireFunction(definition, 'scoreResponse');
  requireFunction(definition, 'matchPointsForPlacement');
  requireFunction(definition, 'normalizeConfig');
  return Object.freeze({
    ...definition,
    id,
    label: String(definition.label || id),
    description: String(definition.description || ''),
    matchRanking: normalizeRankingSpec(definition.matchRanking),
  });
};

/*
 * The shared pieces of a response score. `bankedLegacyMilestoneSpeed` is speed
 * a Solver Race student already banked mid-round, on the 100-point scale; the
 * final answer pays only the remainder so the same speed is never paid twice.
 */
const speedPortion = (legacy, { speedInfluencePercent, bankedLegacyMilestoneSpeed = 0 }) => {
  const legacyRemainder = legacy.secondChance ? 0 : Math.max(0, int(legacy.speedBonus) - int(bankedLegacyMilestoneSpeed));
  return {
    legacySpeedBonus: legacyRemainder,
    speedBonus: scaleLegacySpeedPoints(legacyRemainder, speedInfluencePercent ?? LEGACY_SPEED_INFLUENCE_PERCENT),
  };
};

export const accuracyFirstStrategy = defineScoringStrategy({
  id: SCORING_STRATEGY_ID.ACCURACY_FIRST,
  label: 'Accuracy First',
  description: 'Correctness earns up to 1,000 points per round; speed, streak and comeback bonuses are bounded. The match total is the sum of every round.',
  accumulation: SCORE_ACCUMULATION.PER_RESPONSE,
  normalizeConfig: () => Object.freeze({}),
  scoreResponse: (input = {}) => {
    const legacy = scoreChallengeRound(input);
    const speed = speedPortion(legacy, input);
    const pointsAwarded = legacy.pointsAwarded - legacy.speedBonus + speed.speedBonus;
    return Object.freeze({
      basePoints: legacy.basePoints,
      speedBonus: speed.speedBonus,
      legacySpeedBonus: speed.legacySpeedBonus,
      speedTier: legacy.speedTier,
      streakBonus: legacy.streakBonus,
      comebackBonus: legacy.comebackBonus,
      recoveryPoints: legacy.recoveryPoints,
      pointsAwarded,
      newStreak: legacy.newStreak,
      secondChance: legacy.secondChance,
      matchPointsDelta: pointsAwarded,
    });
  },
  matchPointsForPlacement: () => 0,
  matchRanking: ACCURACY_FIRST_MATCH_RANKING,
});

export const DEFAULT_GRAND_PRIX_CONFIG = Object.freeze({
  placementPoints: DEFAULT_PLACEMENT_POINTS,
  // Anyone with real work beyond the table still scores something.
  beyondTablePoints: 1,
  // No placement points for a round with no credit at all: a wrong answer must
  // not collect 10 points because only two classmates got it right.
  zeroPerformancePoints: 0,
});

const boundedInt = (value, fallback, max) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= max ? numeric : fallback;
};

export const grandPrixStrategy = defineScoringStrategy({
  id: SCORING_STRATEGY_ID.GRAND_PRIX,
  label: 'Grand Prix',
  description: 'Each round is a race. Round placement earns bounded championship points, so a runaway round cannot decide the match.',
  accumulation: SCORE_ACCUMULATION.PER_ROUND,
  normalizeConfig: (raw = {}) => Object.freeze({
    placementPoints: normalizePlacementTable(raw?.placementPoints ?? DEFAULT_GRAND_PRIX_CONFIG.placementPoints),
    beyondTablePoints: boundedInt(raw?.beyondTablePoints, DEFAULT_GRAND_PRIX_CONFIG.beyondTablePoints, MAX_PLACEMENT_POINTS),
    zeroPerformancePoints: boundedInt(raw?.zeroPerformancePoints, DEFAULT_GRAND_PRIX_CONFIG.zeroPerformancePoints, 5),
  }),
  scoreResponse: (input = {}) => {
    // Round performance only. A streak or comeback bonus would carry an
    // advantage from one round into the next, which is what placement scoring
    // exists to prevent. The streak is still tracked for the record.
    const legacy = scoreChallengeRound({
      ...input,
      previousStreak: 0,
      previousRoundMissed: false,
      secondChance: false,
      missedOriginally: false,
    });
    const speed = speedPortion(legacy, input);
    const pointsAwarded = legacy.basePoints + speed.speedBonus;
    const carriedStreak = int(input.previousStreak);
    return Object.freeze({
      basePoints: legacy.basePoints,
      speedBonus: speed.speedBonus,
      legacySpeedBonus: speed.legacySpeedBonus,
      speedTier: legacy.speedTier,
      streakBonus: 0,
      comebackBonus: 0,
      recoveryPoints: 0,
      pointsAwarded,
      newStreak: input.secondChance ? carriedStreak : (input.isCorrect ? carriedStreak + 1 : 0),
      secondChance: input.secondChance === true,
      matchPointsDelta: 0,
    });
  },
  matchPointsForPlacement: ({ rank, participated, performance } = {}, config = DEFAULT_GRAND_PRIX_CONFIG) => {
    if (participated !== true) return 0;
    const normalized = grandPrixStrategy.normalizeConfig(config);
    if (!(Number(performance) > 0)) return normalized.zeroPerformancePoints;
    return placementPoints(rank, { table: normalized.placementPoints, beyondTablePoints: normalized.beyondTablePoints });
  },
  matchRanking: {
    id: 'grandPrix.match',
    metrics: [
      { key: 'matchPoints', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
      { key: 'roundWins', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
      { key: 'rawScore', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
    ],
  },
});

export const correctCountStrategy = defineScoringStrategy({
  id: SCORING_STRATEGY_ID.CORRECT_COUNT,
  label: 'Correct Count',
  description: 'One point for every fully correct response. No speed or streak bonuses.',
  accumulation: SCORE_ACCUMULATION.PER_RESPONSE,
  normalizeConfig: () => Object.freeze({}),
  scoreResponse: (input = {}) => {
    const correct = input.isCorrect === true;
    const carriedStreak = int(input.previousStreak);
    const pointsAwarded = correct ? 1 : 0;
    return Object.freeze({
      basePoints: pointsAwarded,
      speedBonus: 0,
      legacySpeedBonus: 0,
      speedTier: 'none',
      streakBonus: 0,
      comebackBonus: 0,
      recoveryPoints: 0,
      pointsAwarded,
      newStreak: input.secondChance ? carriedStreak : (correct ? carriedStreak + 1 : 0),
      secondChance: input.secondChance === true,
      matchPointsDelta: pointsAwarded,
    });
  },
  matchPointsForPlacement: () => 0,
  matchRanking: {
    id: 'correctCount.match',
    metrics: [
      { key: 'liveScore', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
      { key: 'roundsAnswered', direction: RANK_DIRECTION.LOWER_IS_BETTER },
    ],
  },
});

const REGISTRY = new Map([
  [accuracyFirstStrategy.id, accuracyFirstStrategy],
  [grandPrixStrategy.id, grandPrixStrategy],
  [correctCountStrategy.id, correctCountStrategy],
]);

export const DEFAULT_SCORING_STRATEGY_ID = SCORING_STRATEGY_ID.ACCURACY_FIRST;

/** Add a strategy. Ids are permanent: a registered id can never be replaced. */
export const registerScoringStrategy = (definition) => {
  const strategy = defineScoringStrategy(definition);
  if (REGISTRY.has(strategy.id)) throw new ScoringStrategyError(`Scoring strategy "${strategy.id}" is already registered.`);
  REGISTRY.set(strategy.id, strategy);
  return strategy;
};

export const isRegisteredScoringStrategy = (id) => REGISTRY.has(String(id || ''));

/** The strategy for an id. Rooms created before strategies existed are accuracyFirst. */
export const getScoringStrategy = (id) => REGISTRY.get(String(id || '')) || REGISTRY.get(DEFAULT_SCORING_STRATEGY_ID);

export const listScoringStrategies = () => [...REGISTRY.values()];

/** The strategy id a room actually plays with, reading rooms that predate the field. */
export const roomScoringStrategyId = (room = {}) => (
  isRegisteredScoringStrategy(room?.scoringStrategyId) ? room.scoringStrategyId : DEFAULT_SCORING_STRATEGY_ID
);

/**
 * How a leaderboard for this strategy is built. Work-in-progress points are
 * raw round points, so they belong on a per-response board and never on a
 * championship board.
 */
export const leaderboardOptionsFor = (strategyOrId) => {
  const strategy = typeof strategyOrId === 'string' || !strategyOrId
    ? getScoringStrategy(strategyOrId)
    : strategyOrId;
  return Object.freeze({
    ranking: strategy.matchRanking,
    includeProvisional: strategy.accumulation === SCORE_ACCUMULATION.PER_RESPONSE,
  });
};
