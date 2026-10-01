import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_MODE_ID,
  ChallengeModeContractError,
  QUESTION_SOURCE,
  ROUND_STRUCTURE,
  defineChallengeMode,
  getChallengeMode,
  listChallengeModes,
  normalizeModeConfig,
  registerChallengeMode,
  resolveModeScoringStrategy,
  roundPerformanceFor,
  roundQuestionSpecsFor,
  roundRankingFor,
  solverRaceMode,
  standardMode,
} from '../../functions/shared/liveChallengeModes.mjs';
import { COMPLETION_RULE, summarizeRoundProgress } from '../../functions/shared/liveChallengeResponses.mjs';
import { rankEntries } from '../../functions/shared/liveChallengeRanking.mjs';

/*
 * A game mode is a declaration the engine reads, not a branch in a callable.
 * These tests hold the two shipped modes to what they did before the engine,
 * and hold the contract a new mode must meet — by declaring one.
 */

const sequenceOf = (() => { let n = 0; return () => { n += 1; return n; }; })();
const answer = (overrides = {}) => ({ serverConfirmed: true, roundIndex: 0, questionIndex: 0, sequence: sequenceOf(), ...overrides });

const roundEntry = (mode, id, receipts) => ({
  participantId: id,
  metrics: roundPerformanceFor(mode, summarizeRoundProgress({ receipts, roundIndex: 0, questionSpecs: roundQuestionSpecsFor(mode) })),
});

test('the registry resolves every room, including ones from before modes existed', () => {
  assert.equal(getChallengeMode('standard'), standardMode);
  assert.equal(getChallengeMode('solverRace'), solverRaceMode);
  assert.equal(getChallengeMode(undefined), standardMode, 'a room without challengeMode is a standard room');
  assert.equal(getChallengeMode('retired-mode'), standardMode);
  assert.deepEqual(listChallengeModes({ teacherSelectable: true }).map((mode) => mode.id).slice(0, 2), ['standard', 'solverRace']);
  assert.equal(standardMode.projectorLabel, 'Live Challenge');
  assert.equal(solverRaceMode.projectorLabel, 'Solver Race');
});

test('the shipped modes declare what they did before the engine', () => {
  assert.equal(standardMode.questionSource, QUESTION_SOURCE.SECURE_BANK);
  assert.equal(solverRaceMode.questionSource, QUESTION_SOURCE.SOLVER_RACE_GENERATOR);
  for (const mode of [standardMode, solverRaceMode]) {
    assert.equal(mode.roundStructure, ROUND_STRUCTURE.SYNCHRONIZED_QUESTION);
    assert.deepEqual(roundQuestionSpecsFor(mode), [{ questionIndex: 0, targetCount: 1, completionRule: COMPLETION_RULE.SINGLE_RESPONSE }]);
    assert.equal(mode.defaultScoringStrategy, 'accuracyFirst');
    assert.equal(mode.capabilities.secondChance, true);
  }
  assert.equal(solverRaceMode.capabilities.progressMilestones, true, 'only Solver Race banks mid-round speed');
  assert.equal(standardMode.capabilities.progressMilestones, false);
  assert.ok(Object.isFrozen(standardMode) && Object.isFrozen(standardMode.capabilities));
});

test('a room plays a scoring strategy its mode allows, or the mode default', () => {
  assert.equal(resolveModeScoringStrategy(standardMode, 'grandPrix'), 'grandPrix');
  assert.equal(resolveModeScoringStrategy(standardMode, 'correctCount'), 'correctCount');
  assert.equal(resolveModeScoringStrategy(solverRaceMode, 'correctCount'), 'accuracyFirst', 'Solver Race does not offer Correct Count');
  assert.equal(resolveModeScoringStrategy(standardMode, undefined), 'accuracyFirst');
  assert.equal(resolveModeScoringStrategy(null, 'grandPrix'), 'grandPrix', 'no mode reads as standard');
});

test('each mode normalizes its own teacher settings', () => {
  assert.deepEqual(normalizeModeConfig(standardMode, { questionStyle: 'noTools', solverRaceFocus: 'linearEquation' }), {
    questionStyle: 'noTools', solverRaceFocus: null, solverRaceDifficulty: null,
  });
  assert.equal(normalizeModeConfig(standardMode, {}).questionStyle, 'any');
  const race = normalizeModeConfig(solverRaceMode, { questionStyle: 'noTools', solverRaceFocus: 'linearEquation', solverRaceDifficulty: 'advanced' });
  assert.equal(race.questionStyle, 'tools', 'every Solver Race round is an algebra workspace');
  assert.equal(race.solverRaceFocus, 'linearEquation');
  assert.equal(race.solverRaceDifficulty, 'advanced');
  assert.equal(normalizeModeConfig(solverRaceMode, { solverRaceFocus: 'nonsense' }).solverRaceFocus, 'mixed');
  assert.deepEqual(normalizeModeConfig(null, null).questionStyle, 'any');
});

test('a synchronized round ranks full credit first, then the faster correct answer', () => {
  const ranked = rankEntries([
    roundEntry(standardMode, 'slow-right', { s: answer({ isCorrect: true, elapsedMs: 20_000 }) }),
    roundEntry(standardMode, 'fast-right', { f: answer({ isCorrect: true, elapsedMs: 3_000 }) }),
    roundEntry(standardMode, 'fast-partial', { p: answer({ isCorrect: false, scorePercent: 60, elapsedMs: 1_000 }) }),
    roundEntry(standardMode, 'wrong-a', { w: answer({ isCorrect: false, scorePercent: 0, elapsedMs: 2_000 }) }),
    roundEntry(standardMode, 'wrong-b', { v: answer({ isCorrect: false, scorePercent: 0, elapsedMs: 9_000 }) }),
    roundEntry(standardMode, 'absent', {}),
  ], roundRankingFor(standardMode));
  assert.deepEqual(ranked.map((row) => [row.participantId, row.rank]), [
    ['fast-right', 1],
    ['slow-right', 2],
    ['fast-partial', 3],
    // Speed separates only correct work; two wrong answers tie whatever their speed.
    ['absent', 4],
    ['wrong-a', 4],
    ['wrong-b', 4],
  ]);
});

test('the mode contract rejects a malformed declaration', () => {
  const valid = {
    id: 'contractProbe',
    label: 'Probe',
    roundStructure: ROUND_STRUCTURE.SYNCHRONIZED_QUESTION,
    questionSource: QUESTION_SOURCE.SECURE_BANK,
    defaultScoringStrategy: 'accuracyFirst',
    scoringStrategies: ['accuracyFirst'],
    normalizeConfig: () => ({}),
  };
  assert.doesNotThrow(() => defineChallengeMode(valid));
  const rejects = (patch, pattern) => assert.throws(() => defineChallengeMode({ ...valid, ...patch }), (error) => error instanceof ChallengeModeContractError && pattern.test(error.message));
  rejects({ id: 'has spaces' }, /Invalid game mode id/);
  rejects({ label: '' }, /needs a label/);
  rejects({ roundStructure: 'freeForAll' }, /unknown round structure/);
  rejects({ questionSource: '' }, /question source/);
  rejects({ questionSpec: { completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: 3 } }, /single response/);
  rejects({ scoringStrategies: ['noSuchStrategy'] }, /registered scoring strategies/);
  rejects({ defaultScoringStrategy: 'grandPrix' }, /default scoring strategy/);
  rejects({ normalizeConfig: null }, /normalizeConfig/);
});

test('a new mode is a declaration: a question-set round with multi-target questions', () => {
  // Shaped like the future Graph Feature Rush: several questions per round,
  // each with several targets to find, placement scoring. Nothing in the
  // engine changes to support it.
  const featureRush = registerChallengeMode({
    id: 'featureRushProbe',
    label: 'Feature Rush (test)',
    teacherSelectable: false,
    roundStructure: ROUND_STRUCTURE.QUESTION_SET,
    questionsPerRound: 3,
    questionSource: 'graphFeatureGenerator',
    questionSpec: { completionRule: COMPLETION_RULE.ALL_TARGETS, targetCount: 2 },
    defaultScoringStrategy: 'grandPrix',
    scoringStrategies: ['grandPrix'],
    normalizeConfig: () => Object.freeze({}),
  });
  assert.equal(getChallengeMode('featureRushProbe'), featureRush);
  assert.ok(!listChallengeModes({ teacherSelectable: true }).includes(featureRush), 'not offered to teachers until it ships');
  assert.deepEqual(roundQuestionSpecsFor(featureRush).map((spec) => [spec.questionIndex, spec.targetCount, spec.completionRule]), [
    [0, 2, 'allTargets'], [1, 2, 'allTargets'], [2, 2, 'allTargets'],
  ]);
  assert.equal(resolveModeScoringStrategy(featureRush, 'accuracyFirst'), 'grandPrix');

  // More targets found wins; equal work is decided by accuracy, then by time.
  const found = (questionIndex, targetId, elapsedMs, isCorrect = true) => answer({ questionIndex, targetId, elapsedMs, isCorrect });
  const ranked = rankEntries([
    roundEntry(featureRush, 'thorough', { a: found(0, 'x1', 4_000), b: found(0, 'x2', 9_000), c: found(1, 'y1', 15_000) }),
    roundEntry(featureRush, 'sloppy', { d: found(0, 'x1', 2_000), e: found(0, 'q', 3_000, false), f: found(0, 'x2', 5_000), g: found(1, 'y1', 6_000) }),
    roundEntry(featureRush, 'one-find', { h: found(2, 'z1', 1_000) }),
  ], roundRankingFor(featureRush));
  assert.deepEqual(ranked.map((row) => row.participantId), ['thorough', 'sloppy', 'one-find']);
  assert.equal(ranked[0].metrics.scoreTotal, 1.5);

  assert.throws(() => registerChallengeMode({ ...featureRush, id: 'standard' }), /already registered/, 'a shipped mode can never be replaced');
  assert.equal(CHALLENGE_MODE_ID.STANDARD, 'standard');
});
