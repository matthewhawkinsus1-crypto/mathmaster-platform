/*
 * GAME MODES: WHAT A MODE DECLARES, AND WHAT IT MUST NEVER OWN.
 *
 * A Live Challenge game mode is a DECLARATION, not a copy of the engine. A
 * mode states:
 *
 *   identity           id, labels, version
 *   roundStructure     what a round is (one synchronized question, or a set
 *                      of questions a student works through against the clock)
 *   questionSource     which server planner builds the private question list
 *   questionSpec       how many targets a question has and what completes it
 *   scoring            its default strategy and the strategies it allows
 *   capabilities       second chance, progress milestones, pace timing, ...
 *   normalizeConfig    its own teacher settings, validated
 *
 * The engine owns everything else and a mode must not reimplement it:
 * session lifecycle, joins and reconnects, the authoritative timer, attempt
 * receipts and idempotency, leaderboards, persistence, round and match
 * results, and reward delivery. A new mode that needs any of those to behave
 * differently should extend a contract here — a round structure, a completion
 * rule, a scoring strategy — rather than branch on its own id somewhere else.
 *
 * Built-in modes: `standard` (the classic secure-bank challenge),
 * `solverRace` (generated algebra-workspace races with milestone speed) and
 * `graphFeatureRush` (individually generated graphs; tap every feature
 * against the round clock).
 *
 * Pure: shared by Cloud Functions and the browser. The server holds the
 * question planners keyed by `questionSource`; nothing here touches Firestore.
 */

import {
  DEFAULT_ROUND_COUNT,
  DEFAULT_ROUND_SECONDS,
  MAX_ROUND_COUNT,
  MAX_ROUND_SECONDS,
  MIN_ROUND_COUNT,
  MIN_ROUND_SECONDS,
  canonicalQuestionStyle,
} from './liveChallenge.mjs';
import {
  COMPLETION_RULE,
  MAX_QUESTIONS_PER_ROUND,
  SCORE_UNIT,
  normalizeRoundQuestionSpecs,
  questionSetRoundOutcome,
  questionSpecsFromReceipts,
} from './liveChallengeResponses.mjs';
import { RANK_DIRECTION, normalizeRankingSpec } from './liveChallengeRanking.mjs';
import { PLACEMENT_CURVE, SCORING_STRATEGY_ID, getScoringStrategy, isRegisteredScoringStrategy } from './liveChallengeScoring.mjs';
import { canonicalSolverRaceDifficulty, canonicalSolverRaceFocus } from './solverRace.mjs';
import { RUSH_ROUND_LIMITS, normalizeGraphFeatureRushConfig } from './graphFeatureRushConfig.mjs';

export class ChallengeModeContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChallengeModeContractError';
  }
}

export const CHALLENGE_MODE_ID = Object.freeze({
  STANDARD: 'standard',
  SOLVER_RACE: 'solverRace',
  GRAPH_FEATURE_RUSH: 'graphFeatureRush',
});

export const QUESTION_SOURCE = Object.freeze({
  SECURE_BANK: 'secureBank',
  SOLVER_RACE_GENERATOR: 'solverRaceGenerator',
  GRAPH_FEATURE_GENERATOR: 'graphFeatureGenerator',
});

/*
 * WHO GETS WHICH QUESTION.
 *
 *   shared     every player answers the round's question(s); the mode's specs
 *              describe them
 *   perPlayer  every player is issued their own questions. The round's specs
 *              are read per player from their attempt receipts, which record
 *              each question's target count (questionSpecsFromReceipts).
 *              Question-set rounds only.
 */
export const QUESTION_ISSUE = Object.freeze({
  SHARED: 'shared',
  PER_PLAYER: 'perPlayer',
});

/*
 * ROUND STRUCTURES.
 *
 * A structure turns one player's round progress (liveChallengeResponses.mjs
 * summarizeRoundProgress) into ranking METRICS, and says how a round's players
 * are ranked against each other. Every metric set includes `performance`, the
 * single number that says whether a player earned anything at all — a
 * placement strategy pays nothing for zero performance.
 */
export const ROUND_STRUCTURE = Object.freeze({
  // Everyone answers the same single question; one graded response each.
  SYNCHRONIZED_QUESTION: 'synchronizedQuestion',
  // Each player works through several questions against the round clock and
  // may not finish them all. Placement is decided when the round closes.
  QUESTION_SET: 'questionSet',
});

const finiteOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/*
 * WHAT A WRONG ATTEMPT COSTS IN A QUESTION-SET ROUND: one twentieth of a
 * question. A mistake or two is a rounding error; spraying taps across a graph
 * hoping to land on a feature costs more than the lucky hits are worth. (The
 * device adds a brief cooldown after repeated misses; this is the part that
 * holds even for a device that skips it.) Exact, in score units.
 */
export const QUESTION_SET_MISS_PENALTY = 1 / 20;
const MISS_PENALTY_UNITS = SCORE_UNIT / 20;

/** Completed work minus the miss penalty, never below zero. Exact. */
export const questionSetWorkScore = (summary = {}) => {
  const units = Number.isInteger(summary.scoreUnits) ? summary.scoreUnits : Math.round((Number(summary.scoreTotal) || 0) * SCORE_UNIT);
  const misses = Math.max(0, Math.floor(Number(summary.incorrectAttempts) || 0));
  return Math.max(0, units - misses * MISS_PENALTY_UNITS) / SCORE_UNIT;
};

const ROUND_STRUCTURES = Object.freeze({
  [ROUND_STRUCTURE.SYNCHRONIZED_QUESTION]: Object.freeze({
    id: ROUND_STRUCTURE.SYNCHRONIZED_QUESTION,
    questionsPerRound: 1,
    performance: (summary = {}) => Object.freeze({
      performance: Number(summary.scoreTotal) || 0,
      scoreTotal: Number(summary.scoreTotal) || 0,
      // Speed separates only students with fully correct work. A wrong answer
      // has no completion time, which ranks as the slowest possible.
      correctElapsedMs: summary.questionsCorrect > 0 ? finiteOrNull(summary.lastCorrectCompletionElapsedMs) : null,
    }),
    ranking: normalizeRankingSpec({
      id: 'synchronizedQuestion.round',
      metrics: [
        { key: 'scoreTotal', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
        { key: 'correctElapsedMs', direction: RANK_DIRECTION.LOWER_IS_BETTER },
      ],
    }),
  }),
  [ROUND_STRUCTURE.QUESTION_SET]: Object.freeze({
    id: ROUND_STRUCTURE.QUESTION_SET,
    questionsPerRound: null,
    performance: (summary = {}) => Object.freeze({
      // Completed work, less 1/20 of a question per wrong attempt — whether
      // anything was earned at all, and the first thing the round ranks by.
      performance: questionSetWorkScore(summary),
      workScore: questionSetWorkScore(summary),
      // Completed work (targets found count fractionally), then how cleanly it
      // was done, then how early the last correct completion came.
      scoreTotal: Number(summary.scoreTotal) || 0,
      accuracy: finiteOrNull(summary.accuracy),
      lastCorrectCompletionElapsedMs: summary.questionsCorrect > 0 || summary.scoreTotal > 0
        ? finiteOrNull(summary.lastCorrectCompletionElapsedMs)
        : null,
      // Shown on round results; not ranked on directly (scoreTotal is).
      questionsCorrect: Number(summary.questionsCorrect) || 0,
      attempts: Number(summary.attempts) || 0,
    }),
    ranking: normalizeRankingSpec({
      id: 'questionSet.round',
      metrics: [
        { key: 'workScore', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
        { key: 'accuracy', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
        { key: 'lastCorrectCompletionElapsedMs', direction: RANK_DIRECTION.LOWER_IS_BETTER },
      ],
    }),
  }),
});

export const getRoundStructure = (id) => ROUND_STRUCTURES[id] || null;

const CAPABILITY_KEYS = Object.freeze([
  'secondChance',
  'progressMilestones',
  'paceTiming',
  'closingThreshold',
  'dryRun',
  // May run as an assignment's Warm-Up. The Warm-Up credit counts rounds
  // answered and rounds correct, which only means something for one graded
  // response per round.
  'warmupLink',
]);

const DEFAULT_ROUND_LIMITS = Object.freeze({
  minRounds: MIN_ROUND_COUNT,
  maxRounds: MAX_ROUND_COUNT,
  defaultRounds: DEFAULT_ROUND_COUNT,
  minSeconds: MIN_ROUND_SECONDS,
  maxSeconds: MAX_ROUND_SECONDS,
  defaultSeconds: DEFAULT_ROUND_SECONDS,
});

const normalizeRoundLimits = (id, raw) => {
  if (!raw) return DEFAULT_ROUND_LIMITS;
  const int = (value, fallback) => (Number.isInteger(Number(value)) ? Number(value) : fallback);
  const limits = {
    minRounds: int(raw.minRounds, DEFAULT_ROUND_LIMITS.minRounds),
    maxRounds: int(raw.maxRounds, DEFAULT_ROUND_LIMITS.maxRounds),
    defaultRounds: int(raw.defaultRounds, DEFAULT_ROUND_LIMITS.defaultRounds),
    minSeconds: int(raw.minSeconds, DEFAULT_ROUND_LIMITS.minSeconds),
    maxSeconds: int(raw.maxSeconds, DEFAULT_ROUND_LIMITS.maxSeconds),
    defaultSeconds: int(raw.defaultSeconds, DEFAULT_ROUND_LIMITS.defaultSeconds),
  };
  const ordered = limits.minRounds >= 1 && limits.minRounds <= limits.defaultRounds && limits.defaultRounds <= limits.maxRounds
    && limits.minSeconds >= 5 && limits.minSeconds <= limits.defaultSeconds && limits.defaultSeconds <= limits.maxSeconds;
  if (!ordered) throw new ChallengeModeContractError(`Game mode "${id}" has inconsistent round limits.`);
  return Object.freeze(limits);
};

const MODE_ID_PATTERN = /^[a-z][A-Za-z0-9]{1,40}$/;

/** Validate and freeze a mode declaration. Throws on anything malformed. */
export const defineChallengeMode = (definition = {}) => {
  const id = String(definition.id || '').trim();
  if (!MODE_ID_PATTERN.test(id)) throw new ChallengeModeContractError(`Invalid game mode id "${id}".`);
  const label = String(definition.label || '').trim();
  if (!label) throw new ChallengeModeContractError(`Game mode "${id}" needs a label.`);
  const structure = getRoundStructure(definition.roundStructure);
  if (!structure) throw new ChallengeModeContractError(`Game mode "${id}" has unknown round structure "${definition.roundStructure}".`);
  const questionSource = String(definition.questionSource || '').trim();
  if (!questionSource) throw new ChallengeModeContractError(`Game mode "${id}" needs a question source.`);

  const questionsPerRound = structure.questionsPerRound ?? Math.max(1, Math.floor(Number(definition.questionsPerRound) || 1));
  const questionSpecs = normalizeRoundQuestionSpecs(
    Array.from({ length: questionsPerRound }, (_, index) => ({ ...definition.questionSpec, questionIndex: index })),
  );
  if (structure.id === ROUND_STRUCTURE.SYNCHRONIZED_QUESTION && questionSpecs[0].completionRule !== COMPLETION_RULE.SINGLE_RESPONSE) {
    throw new ChallengeModeContractError(`Game mode "${id}" uses one synchronized question, which is completed by a single response.`);
  }

  const scoringStrategies = [...new Set(definition.scoringStrategies || [])];
  if (!scoringStrategies.length || !scoringStrategies.every(isRegisteredScoringStrategy)) {
    throw new ChallengeModeContractError(`Game mode "${id}" must list registered scoring strategies.`);
  }
  if (!scoringStrategies.includes(definition.defaultScoringStrategy)) {
    throw new ChallengeModeContractError(`Game mode "${id}" default scoring strategy must be one it allows.`);
  }
  if (typeof definition.normalizeConfig !== 'function') {
    throw new ChallengeModeContractError(`Game mode "${id}" must define normalizeConfig().`);
  }

  const capabilities = Object.freeze(Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, definition.capabilities?.[key] === true]),
  ));

  const questionIssue = definition.questionIssue === QUESTION_ISSUE.PER_PLAYER ? QUESTION_ISSUE.PER_PLAYER : QUESTION_ISSUE.SHARED;
  if (questionIssue === QUESTION_ISSUE.PER_PLAYER && structure.id !== ROUND_STRUCTURE.QUESTION_SET) {
    throw new ChallengeModeContractError(`Game mode "${id}" issues questions per player, which needs a question-set round.`);
  }

  // Strategy settings a mode starts its rooms with (a teacher's request may
  // still override them field by field).
  const scoringDefaults = Object.freeze(Object.fromEntries(Object.entries(definition.scoringDefaults || {}).map(([strategyId, config]) => {
    if (!scoringStrategies.includes(strategyId)) {
      throw new ChallengeModeContractError(`Game mode "${id}" sets defaults for "${strategyId}", a strategy it does not allow.`);
    }
    return [strategyId, Object.freeze({ ...config })];
  })));

  return Object.freeze({
    id,
    label,
    projectorLabel: String(definition.projectorLabel || label),
    description: String(definition.description || ''),
    version: Math.max(1, Math.floor(Number(definition.version) || 1)),
    teacherSelectable: definition.teacherSelectable !== false,
    roundStructure: structure.id,
    questionSource,
    questionIssue,
    questionSpecs,
    defaultScoringStrategy: definition.defaultScoringStrategy,
    scoringStrategies: Object.freeze(scoringStrategies),
    scoringDefaults,
    roundLimits: normalizeRoundLimits(id, definition.roundLimits),
    capabilities,
    normalizeConfig: definition.normalizeConfig,
  });
};

export const standardMode = defineChallengeMode({
  id: CHALLENGE_MODE_ID.STANDARD,
  label: 'Standard Challenge',
  projectorLabel: 'Live Challenge',
  description: 'Everyone answers the same securely graded question each round.',
  roundStructure: ROUND_STRUCTURE.SYNCHRONIZED_QUESTION,
  questionSource: QUESTION_SOURCE.SECURE_BANK,
  questionSpec: { completionRule: COMPLETION_RULE.SINGLE_RESPONSE, targetCount: 1 },
  defaultScoringStrategy: SCORING_STRATEGY_ID.ACCURACY_FIRST,
  scoringStrategies: [SCORING_STRATEGY_ID.ACCURACY_FIRST, SCORING_STRATEGY_ID.GRAND_PRIX, SCORING_STRATEGY_ID.CORRECT_COUNT],
  capabilities: { secondChance: true, progressMilestones: false, paceTiming: true, closingThreshold: true, dryRun: true, warmupLink: true },
  normalizeConfig: (raw = {}) => Object.freeze({
    questionStyle: canonicalQuestionStyle(raw?.questionStyle),
    solverRaceFocus: null,
    solverRaceDifficulty: null,
  }),
});

export const solverRaceMode = defineChallengeMode({
  id: CHALLENGE_MODE_ID.SOLVER_RACE,
  label: 'Solver Race',
  projectorLabel: 'Solver Race',
  description: 'Generated algebra-workspace races; validated intermediate steps bank speed as students work.',
  roundStructure: ROUND_STRUCTURE.SYNCHRONIZED_QUESTION,
  questionSource: QUESTION_SOURCE.SOLVER_RACE_GENERATOR,
  questionSpec: { completionRule: COMPLETION_RULE.SINGLE_RESPONSE, targetCount: 1 },
  defaultScoringStrategy: SCORING_STRATEGY_ID.ACCURACY_FIRST,
  scoringStrategies: [SCORING_STRATEGY_ID.ACCURACY_FIRST, SCORING_STRATEGY_ID.GRAND_PRIX],
  capabilities: { secondChance: true, progressMilestones: true, paceTiming: true, closingThreshold: true, dryRun: true, warmupLink: true },
  normalizeConfig: (raw = {}) => Object.freeze({
    // Every Solver Race round is an interactive algebra workspace.
    questionStyle: 'tools',
    solverRaceFocus: canonicalSolverRaceFocus(raw?.solverRaceFocus),
    solverRaceDifficulty: canonicalSolverRaceDifficulty(raw?.solverRaceDifficulty),
  }),
});

/*
 * GRAPH FEATURE RUSH. Each student races the round clock through their own
 * generated graphs, tapping every requested feature; a graph completes the
 * moment its last target is found. Ranking is the question-set structure's:
 * work completed (found targets count fractionally), then accuracy, then the
 * time of the last completion. Grand Prix scales its placement points to the
 * field that raced. See docs/architecture/graph-feature-rush.md.
 */
export const GRAPH_FEATURE_RUSH_QUESTION_POOL = MAX_QUESTIONS_PER_ROUND;

export const graphFeatureRushMode = defineChallengeMode({
  id: CHALLENGE_MODE_ID.GRAPH_FEATURE_RUSH,
  label: 'Graph Feature Rush',
  projectorLabel: 'Graph Feature Rush',
  description: 'Every student gets their own graphs and races the clock to tap intercepts, vertices and extremes.',
  roundStructure: ROUND_STRUCTURE.QUESTION_SET,
  questionsPerRound: GRAPH_FEATURE_RUSH_QUESTION_POOL,
  questionSource: QUESTION_SOURCE.GRAPH_FEATURE_GENERATOR,
  questionIssue: QUESTION_ISSUE.PER_PLAYER,
  questionSpec: { completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: 1 },
  defaultScoringStrategy: SCORING_STRATEGY_ID.GRAND_PRIX,
  scoringStrategies: [SCORING_STRATEGY_ID.GRAND_PRIX, SCORING_STRATEGY_ID.CORRECT_COUNT],
  scoringDefaults: { [SCORING_STRATEGY_ID.GRAND_PRIX]: { placementCurve: PLACEMENT_CURVE.FIELD } },
  roundLimits: RUSH_ROUND_LIMITS,
  capabilities: { secondChance: false, progressMilestones: false, paceTiming: false, closingThreshold: false, dryRun: false, warmupLink: false },
  normalizeConfig: (raw = {}) => Object.freeze({
    questionStyle: 'any',
    solverRaceFocus: null,
    solverRaceDifficulty: null,
    graphFeatureRush: normalizeGraphFeatureRushConfig(raw?.graphFeatureRush),
  }),
});

const REGISTRY = new Map([
  [standardMode.id, standardMode],
  [solverRaceMode.id, solverRaceMode],
  [graphFeatureRushMode.id, graphFeatureRushMode],
]);

export const DEFAULT_CHALLENGE_MODE_ID = CHALLENGE_MODE_ID.STANDARD;

/** Add a mode. Ids are permanent: a registered id can never be replaced. */
export const registerChallengeMode = (definition) => {
  const mode = defineChallengeMode(definition);
  if (REGISTRY.has(mode.id)) throw new ChallengeModeContractError(`Game mode "${mode.id}" is already registered.`);
  REGISTRY.set(mode.id, mode);
  return mode;
};

export const isRegisteredChallengeMode = (id) => REGISTRY.has(String(id || ''));

/**
 * The mode for an id. Anything unknown — including every room created before
 * modes existed — is the standard game, which is what those rooms always were.
 */
export const getChallengeMode = (id) => REGISTRY.get(String(id || '')) || REGISTRY.get(DEFAULT_CHALLENGE_MODE_ID);

export const listChallengeModes = ({ teacherSelectable = null } = {}) => [...REGISTRY.values()]
  .filter((mode) => teacherSelectable === null || mode.teacherSelectable === teacherSelectable);

/** The scoring strategy a room will use: the requested one when the mode allows it. */
export const resolveModeScoringStrategy = (mode, requested) => {
  const resolved = mode || getChallengeMode(null);
  const id = String(requested || '').trim();
  return resolved.scoringStrategies.includes(id) ? id : resolved.defaultScoringStrategy;
};

export const roundStructureFor = (mode) => getRoundStructure((mode || getChallengeMode(null)).roundStructure);

/**
 * Question specs for one round. A shared-question mode's rounds all have the
 * mode's specs; a per-player mode's specs are read from one player's receipts
 * for that round, so pass `{ receipts, roundIndex }`.
 */
export const roundQuestionSpecsFor = (mode, { receipts = null, roundIndex = null } = {}) => {
  const resolved = mode || getChallengeMode(null);
  if (resolved.questionIssue !== QUESTION_ISSUE.PER_PLAYER) return resolved.questionSpecs;
  return questionSpecsFromReceipts({
    receipts,
    roundIndex,
    poolSize: resolved.questionSpecs.length,
    completionRule: resolved.questionSpecs[0]?.completionRule,
  });
};

/** One player's round outcome, as a match result records it. */
export const modeRoundOutcome = (mode, summary) => (
  roundStructureFor(mode).id === ROUND_STRUCTURE.QUESTION_SET ? questionSetRoundOutcome(summary) : null
);

/** The round count and seconds a room of this mode may be created with. */
export const modeRoundLimits = (mode) => (mode || getChallengeMode(null)).roundLimits;

// The same arithmetic as liveChallenge.normalizeRoundCount/Seconds, so a mode
// on the default limits normalizes exactly as rooms always have.
const clampTo = (value, fallback, low, high) => Math.max(low, Math.min(high, Math.round(Number(value) || fallback)));

export const normalizeModeRoundCount = (mode, value) => {
  const limits = modeRoundLimits(mode);
  return clampTo(value, limits.defaultRounds, limits.minRounds, limits.maxRounds);
};

export const normalizeModeRoundSeconds = (mode, value) => {
  const limits = modeRoundLimits(mode);
  return clampTo(value, limits.defaultSeconds, limits.minSeconds, limits.maxSeconds);
};

/** A room's strategy settings: the mode's defaults, then the request's own. */
export const modeScoringConfig = (mode, strategyId, raw = {}) => {
  const resolved = mode || getChallengeMode(null);
  const defaults = resolved.scoringDefaults?.[strategyId] || {};
  return getScoringStrategy(strategyId).normalizeConfig({ ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) });
};

export const roundPerformanceFor = (mode, summary) => roundStructureFor(mode).performance(summary);

export const roundRankingFor = (mode) => roundStructureFor(mode).ranking;

/** A mode's normalized teacher settings from a create request. */
export const normalizeModeConfig = (mode, raw = {}) => (mode || getChallengeMode(null)).normalizeConfig(raw || {});
