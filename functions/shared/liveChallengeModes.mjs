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
 * Built-in modes: `standard` (the classic secure-bank challenge) and
 * `solverRace` (generated algebra-workspace races with milestone speed).
 *
 * Pure: shared by Cloud Functions and the browser. The server holds the
 * question planners keyed by `questionSource`; nothing here touches Firestore.
 */

import { canonicalQuestionStyle } from './liveChallenge.mjs';
import { COMPLETION_RULE, normalizeRoundQuestionSpecs } from './liveChallengeResponses.mjs';
import { RANK_DIRECTION, normalizeRankingSpec } from './liveChallengeRanking.mjs';
import { SCORING_STRATEGY_ID, isRegisteredScoringStrategy } from './liveChallengeScoring.mjs';
import { canonicalSolverRaceDifficulty, canonicalSolverRaceFocus } from './solverRace.mjs';

export class ChallengeModeContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChallengeModeContractError';
  }
}

export const CHALLENGE_MODE_ID = Object.freeze({
  STANDARD: 'standard',
  SOLVER_RACE: 'solverRace',
});

export const QUESTION_SOURCE = Object.freeze({
  SECURE_BANK: 'secureBank',
  SOLVER_RACE_GENERATOR: 'solverRaceGenerator',
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
      performance: Number(summary.scoreTotal) || 0,
      // Completed work first (targets found count fractionally), then how
      // cleanly it was done, then how early the last correct completion came.
      scoreTotal: Number(summary.scoreTotal) || 0,
      accuracy: finiteOrNull(summary.accuracy),
      lastCorrectCompletionElapsedMs: summary.questionsCorrect > 0 || summary.scoreTotal > 0
        ? finiteOrNull(summary.lastCorrectCompletionElapsedMs)
        : null,
    }),
    ranking: normalizeRankingSpec({
      id: 'questionSet.round',
      metrics: [
        { key: 'scoreTotal', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
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
]);

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

  return Object.freeze({
    id,
    label,
    projectorLabel: String(definition.projectorLabel || label),
    description: String(definition.description || ''),
    version: Math.max(1, Math.floor(Number(definition.version) || 1)),
    teacherSelectable: definition.teacherSelectable !== false,
    roundStructure: structure.id,
    questionSource,
    questionSpecs,
    defaultScoringStrategy: definition.defaultScoringStrategy,
    scoringStrategies: Object.freeze(scoringStrategies),
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
  capabilities: { secondChance: true, progressMilestones: false, paceTiming: true, closingThreshold: true, dryRun: true },
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
  capabilities: { secondChance: true, progressMilestones: true, paceTiming: true, closingThreshold: true, dryRun: true },
  normalizeConfig: (raw = {}) => Object.freeze({
    // Every Solver Race round is an interactive algebra workspace.
    questionStyle: 'tools',
    solverRaceFocus: canonicalSolverRaceFocus(raw?.solverRaceFocus),
    solverRaceDifficulty: canonicalSolverRaceDifficulty(raw?.solverRaceDifficulty),
  }),
});

const REGISTRY = new Map([
  [standardMode.id, standardMode],
  [solverRaceMode.id, solverRaceMode],
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

/** Question specs for one round. Every round of a built-in mode has the mode's specs. */
export const roundQuestionSpecsFor = (mode) => (mode || getChallengeMode(null)).questionSpecs;

export const roundPerformanceFor = (mode, summary) => roundStructureFor(mode).performance(summary);

export const roundRankingFor = (mode) => roundStructureFor(mode).ranking;

/** A mode's normalized teacher settings from a create request. */
export const normalizeModeConfig = (mode, raw = {}) => (mode || getChallengeMode(null)).normalizeConfig(raw || {});
