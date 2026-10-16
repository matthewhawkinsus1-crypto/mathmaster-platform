import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_MODE_ID,
  QUESTION_ISSUE,
  QUESTION_SOURCE,
  ROUND_STRUCTURE,
  getChallengeMode,
  listChallengeModes,
  modeScoringConfig,
  normalizeModeConfig,
  normalizeModeRoundCount,
  normalizeModeRoundSeconds,
  roundQuestionSpecsFor,
} from '../../functions/shared/liveChallengeModes.mjs';
import { MAX_QUESTIONS_PER_ROUND } from '../../functions/shared/liveChallengeResponses.mjs';
import { buildRoundResult } from '../../functions/shared/liveChallengeResults.mjs';
import { LINE_ROUND_LIMITS, LINE_SPRINT_MAX_POOL, LineGraphConfigError, lineRoundQuestionCount } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { applyLineGraphAttempts } from '../../functions/shared/lineGraphAttempts.mjs';
import { latticePointsInView } from '../../functions/shared/lineGraphMath.mjs';
import { LINE_GRAPH_FORMAT, LINE_GRAPH_MODE_IDS, lineGraphFormatOfMode } from '../../functions/shared/lineGraphRules.mjs';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';

/*
 * GRAPH THE LINE ON THE ENGINE'S CONTRACTS: three declarations, one per
 * format, each a question-set mode whose items are one target — so ranking,
 * Grand Prix, results and readiness are the engine's, unchanged.
 */

const MODES = LINE_GRAPH_MODE_IDS.map(getChallengeMode);

test('the three formats are registered under their permanent ids, not yet offered to teachers', () => {
  assert.deepEqual(MODES.map((mode) => mode.id), [
    CHALLENGE_MODE_ID.LINE_GRAPH_CLASSIC,
    CHALLENGE_MODE_ID.LINE_GRAPH_SPRINT,
    CHALLENGE_MODE_ID.LINE_GRAPH_RUSH,
  ]);
  const offered = listChallengeModes({ teacherSelectable: true });
  for (const mode of MODES) {
    assert.equal(mode.teacherSelectable, false, `${mode.id} waits for its screens`);
    assert.ok(!offered.includes(mode));
    assert.equal(mode.roundStructure, ROUND_STRUCTURE.QUESTION_SET);
    assert.equal(mode.questionIssue, QUESTION_ISSUE.PER_PLAYER);
    assert.equal(mode.questionSource, QUESTION_SOURCE.LINE_GRAPH_GENERATOR);
    assert.ok(mode.questionSpecs.every((spec) => spec.completionRule === 'allTargets' && spec.targetCount === 1));
    assert.deepEqual(mode.scoringStrategies, ['grandPrix', 'correctCount']);
    assert.equal(mode.defaultScoringStrategy, 'grandPrix');
    assert.equal(modeScoringConfig(mode, 'grandPrix').placementCurve, 'field', 'Grand Prix scales to the class');
    assert.ok(Object.values(mode.capabilities).every((enabled) => enabled === false), `${mode.id} opts into nothing yet`);
  }
});

test('each format holds its own pool and limits', () => {
  const [classic, sprint, rush] = MODES;
  assert.equal(classic.questionSpecs.length, 1);
  assert.equal(sprint.questionSpecs.length, LINE_SPRINT_MAX_POOL);
  assert.equal(rush.questionSpecs.length, MAX_QUESTIONS_PER_ROUND);
  for (const mode of MODES) {
    const limits = LINE_ROUND_LIMITS[lineGraphFormatOfMode(mode.id)];
    for (const key of ['minRounds', 'maxRounds', 'defaultRounds', 'minSeconds', 'maxSeconds', 'defaultSeconds']) {
      assert.equal(mode.roundLimits[key], limits[key], `${mode.id} ${key}`);
    }
  }
  // A Sprint of ten may run five minutes; a Classic round never more than two.
  assert.equal(normalizeModeRoundSeconds(sprint, 300), 300);
  assert.equal(normalizeModeRoundSeconds(classic, 300), 120);
  assert.equal(normalizeModeRoundCount(classic, 1), 3);
  assert.equal(normalizeModeRoundCount(sprint, 9), 5);
});

test('a room\'s settings are validated by its mode, with the format the mode\'s own', () => {
  for (const mode of MODES) {
    const config = normalizeModeConfig(mode, { lineGraph: { presetId: 'graphAndName', format: 'rush' } });
    // The room write needs these three keys, null or not.
    assert.equal(config.questionStyle, 'any');
    assert.equal(config.solverRaceFocus, null);
    assert.equal(config.solverRaceDifficulty, null);
    assert.equal(config.lineGraph.format, lineGraphFormatOfMode(mode.id));
    assert.equal(config.lineGraph.presetId, 'graphAndName');
  }
  assert.throws(() => normalizeModeConfig(MODES[0], { lineGraph: { forms: [] } }), LineGraphConfigError);
  assert.equal(getChallengeMode('lineGraphMarathon').id, 'standard', 'an unknown id is still the standard game');
});

/*
 * A SPRINT ROUND, RANKED BY THE ENGINE. Three students through the real
 * pipeline: one finishes all five cleanly, one finishes with a miss, one
 * finishes four. The round reads its length from their receipts.
 */

const sprintMode = getChallengeMode(CHALLENGE_MODE_ID.LINE_GRAPH_SPRINT);
const sprintConfig = normalizeModeConfig(sprintMode, { lineGraph: { presetId: 'allThreeForms', itemTypes: ['graph'], sprintLength: 5 } }).lineGraph;
const poolSize = lineRoundQuestionCount(LINE_GRAPH_FORMAT.SPRINT, sprintConfig);

let ids = 0;
const playSprint = (studentId, { finish = 5, misses = 0, seconds = 4 } = {}) => {
  let player = { studentId, joined: true, playerKey: `key-${studentId}`, alias: studentId, submissionReceipts: {}, attemptSequence: 0 };
  let clock = 0;
  const item = (index) => generateLineQuestion({ seed: 'engine-room', studentKey: studentId, roundIndex: 0, questionIndex: index, config: sprintConfig });
  const send = (attempt) => {
    clock += seconds * 1000;
    const outcome = applyLineGraphAttempts({
      player, roundIndex: 0, attempts: [attempt], questionFor: item, config: sprintConfig,
      arrivalElapsedMs: clock, roundDurationMs: 180_000, strategy: getScoringStrategy('grandPrix'), poolSize,
    });
    player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
  };
  for (let index = 0; index < finish; index += 1) {
    const current = item(index);
    const points = latticePointsInView(current.line, current.view);
    if (index === 0 && misses) {
      const [p] = latticePointsInView(current.line, current.view, { inset: 2 });
      send({ attemptId: `m-${(ids += 1)}`, questionIndex: 0, kind: 'line', points: [p, { x: p.x + 1, y: p.y + (current.line.b === 0 ? 0 : 7) }] });
    }
    send({ attemptId: `a-${(ids += 1)}`, questionIndex: index, kind: 'line', points: [points[0], points[1]] });
  }
  return player;
};

test('a Sprint round is ranked by the engine: work, then accuracy, then time; finishing is readiness', () => {
  const clean = playSprint('clean', { seconds: 6 });
  const slip = playSprint('slip', { misses: 1, seconds: 3 });
  const short = playSprint('short', { finish: 4, seconds: 2 });
  for (const player of [clean, slip, short]) {
    assert.equal(roundQuestionSpecsFor(sprintMode, { receipts: player.submissionReceipts, roundIndex: 0 }).length, 5);
  }
  // The slip really is a recorded miss (otherwise its speed would win).
  assert.equal(Object.values(slip.submissionReceipts).filter((receipt) => receipt.isCorrect === false).length, 1);
  assert.equal(Object.values(clean.submissionReceipts).filter((receipt) => receipt.isCorrect === false).length, 0);
  const result = buildRoundResult({
    roomId: 'engine-room', roundIndex: 0, modeId: sprintMode.id, scoringStrategyId: 'grandPrix',
    scoringConfig: modeScoringConfig(sprintMode, 'grandPrix'), players: [short, slip, clean],
  });
  const order = result.standings.map((standing) => standing.studentId);
  // Five clean lines beat five with a miss, whatever the speed; both beat four.
  assert.deepEqual(order, ['clean', 'slip', 'short']);
  const finished = Object.fromEntries(result.standings.map((standing) => [standing.studentId, standing.finished]));
  assert.deepEqual(finished, { clean: true, slip: true, short: false });
  assert.equal(result.fieldSize, 3);
  assert.ok(result.standings[0].matchPointsAwarded > result.standings[2].matchPointsAwarded);
});
