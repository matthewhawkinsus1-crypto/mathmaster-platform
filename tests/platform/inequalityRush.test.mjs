import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import * as N from '../../functions/shared/numberLineSets.mjs';
import * as I from '../../functions/shared/inequalityRush.mjs';
import { INEQUALITY_GUIDE_TITLE, INEQUALITY_READING, inequalityReadingGuide, inequalityRoundSolutionRecord } from '../../functions/shared/inequalityReading.mjs';
import { applyRushAttempts, buildRushReport } from '../../functions/shared/graphFeatureRush.mjs';
import {
  INEQUALITY_RUSH_MODE_ID,
  RUSH_ATTEMPT_KIND,
  RUSH_MODE_ID,
  RUSH_REVEAL_PAUSE_MS,
  RUSH_SET_AUTO_SKIP_MISSES,
  RUSH_SIGN_FLIP,
  isRushModeId,
  rushAutoSkipMisses,
} from '../../functions/shared/graphFeatureRushRules.mjs';
import {
  CHALLENGE_MODE_ID,
  QUESTION_ISSUE,
  QUESTION_SOURCE,
  ROUND_STRUCTURE,
  getChallengeMode,
  listChallengeModes,
  normalizeModeConfig,
} from '../../functions/shared/liveChallengeModes.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { REPORT_STUDENT_ROW_PATHS, reportRowsWithout, reportStudentIds } from '../../functions/shared/liveChallengeReport.mjs';
import { publicSolutionDocument } from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import { solutionTitle, projectorSteps } from '../../src/platform/liveChallenge/challengeSolutionModel.js';
import { QUESTION_SET_GAME, isRushGame, questionSetGameOf, roomRoundsEndOnTheClock, roomRunsQuestionSets, rushGameWords } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { replayRequestFromRoom, replaySummary } from '../../src/platform/liveChallenge/challengeReplayModel.js';
import { changeInequalitySetup, defaultInequalitySetup, inequalityCreateRequest, inequalitySetupFromPreset, inequalitySetupProblem } from '../../src/platform/liveChallenge/inequalitySetupModel.js';
import { describeLineCursor, moveLineCursor, numberAtPixel, numberLineLayout, numberLineMarks } from '../../src/platform/liveChallenge/numberLineModel.js';
import {
  NO_SOLUTION_RIGHT,
  RUSH_FEEDBACK,
  answerDrawing,
  RUSH_INPUT,
  acknowledge,
  axisValueAt,
  createRushSession,
  currentQuestion,
  differsFromServer,
  drawingReady,
  feedbackMessage,
  inputState,
  lineNotation,
  newAttemptId,
  nextBatch,
  recordAxisTap,
  recordCheck,
  recordDoesNotExist,
  recordSkip,
  settle,
  toggleAxisArrow,
} from '../../src/platform/liveChallenge/rushSession.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * INEQUALITY GRAPHING RUSH (docs/architecture/inequality-rush.md).
 *
 * Every item's answer is checked against an independent reading of its own
 * text: the inequality is turned into a JavaScript predicate and evaluated at
 * every half-integer from −12 to 12 and far out both ways — every endpoint is
 * a whole number in [−9, 9], so those probes decide the set exactly — and the
 * answer the generator built must agree at every one.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const predicateOf = (text) => {
  let source = text.replace(/−/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=');
  source = source.replace(/\|([^|]+)\|/g, 'Math.abs($1)').replace(/(\d)x/g, '$1*x');
  const joiner = source.includes(' and ') ? ' and ' : (source.includes(' or ') ? ' or ' : null);
  const chain = (part) => {
    const tokens = part.split(/\s*(<=|>=|<|>)\s*/);
    const pieces = [];
    for (let index = 1; index < tokens.length; index += 2) pieces.push(`(${tokens[index - 1]}) ${tokens[index]} (${tokens[index + 1]})`);
    return pieces.join(' && ');
  };
  const body = (joiner ? source.split(joiner) : [source]).map((part) => `(${chain(part)})`).join(joiner === ' or ' ? ' || ' : ' && ');
  // eslint-disable-next-line no-new-func
  return new Function('x', `return ${body};`);
};
const PROBES = [-1000, -12.5, ...Array.from({ length: 49 }, (_, index) => -12 + index * 0.5), 12.5, 1000];
const answerOf = (question) => (question.targets.length ? N.setFromPlain(question.targets[0].set) : N.EMPTY_SET);
const configOf = (itemTypes, difficulty) => I.normalizeInequalityRushConfig({ itemTypes, difficulty });
const DIFFICULTIES = ['easy', 'standard', 'challenge', 'mixed'];

// Items of one kind at one difficulty, from several rooms and students.
const sample = (itemType, difficulty, { rooms = 6, length = 18 } = {}) => {
  const config = configOf([itemType], difficulty);
  const items = [];
  for (let room = 0; room < rooms; room += 1) {
    for (let index = 0; index < length; index += 1) {
      items.push(I.generateInequalityQuestion({ seed: `oracle-${room}`, studentKey: `s${room % 3}`, roundIndex: room % 2, questionIndex: index, config }));
    }
  }
  return items;
};

/* ------------------------------- the answers ------------------------------- */

test('every item\'s answer is exactly the set its own text describes, at every difficulty', () => {
  let checked = 0;
  for (const difficulty of DIFFICULTIES) {
    for (const itemType of I.INEQUALITY_ITEM_IDS) {
      for (const question of sample(itemType, difficulty)) {
        const holds = predicateOf(question.inequality);
        const answer = answerOf(question);
        PROBES.forEach((x) => {
          assert.equal(Boolean(holds(x)), N.setContains(answer, Q.rat(Math.round(x * 2), 2)), `${question.inequality} at x = ${x}`);
        });
        // Whole-number ends, a tick inside the line, so every dot is clear of its edge.
        N.setEndpoints(answer).forEach((end) => {
          assert.ok(Number.isInteger(end) && end >= -9 && end <= 9, `${question.inequality}: end ${end}`);
        });
        checked += 1;
      }
    }
  }
  assert.ok(checked > 3000, `${checked} items`);
});

test('every answer is drawn with the tap model, and an item with no solution has no target to draw', () => {
  for (const difficulty of DIFFICULTIES) {
    for (const itemType of I.INEQUALITY_ITEM_IDS) {
      for (const question of sample(itemType, difficulty, { rooms: 3 })) {
        const answer = answerOf(question);
        if (!answer.length) {
          assert.deepEqual(question.targets, [], question.inequality);
          continue;
        }
        assert.equal(question.targets.length, 1);
        assert.equal(question.targets[0].geometry, 'set');
        assert.equal(question.targets[0].axis, 'x');
        const drawing = N.drawingForSet(answer);
        assert.ok(drawing, `${question.inequality} can be drawn`);
        assert.ok(N.setsEqual(N.drawingSet(drawing), answer), `${question.inequality} draws as itself`);
      }
    }
  }
});

test('difficulty decides the variants: Easy is always solvable and never flips; Standard flips and has no solution; Challenge has points and every number but one', () => {
  const variantsAt = (difficulty) => {
    const seen = new Set();
    I.INEQUALITY_ITEM_IDS.forEach((itemType) => sample(itemType, difficulty).forEach((question) => seen.add(`${question.family}/${question.variant}`)));
    return seen;
  };
  const easy = I.INEQUALITY_ITEM_IDS.flatMap((itemType) => sample(itemType, 'easy'));
  assert.ok(easy.every((question) => question.targets.length === 1), 'every Easy item has solutions');
  assert.ok(easy.every((question) => !question.flipSet), 'no Easy item divides by a negative');
  assert.ok(easy.every((question) => !N.isAllReals(answerOf(question))), 'no Easy item is every number');
  assert.ok(easy.filter((question) => question.family === 'absolute').every((question) => question.inequality.startsWith('|x|')), 'an Easy absolute value is centered at 0');
  const standard = variantsAt('standard');
  ['compoundAnd/none', 'compoundOr/all', 'absolute/none', 'absolute/all'].forEach((variant) => assert.ok(standard.has(variant), variant));
  assert.ok(!standard.has('absolute/point') && !standard.has('absolute/scaled'), 'Challenge variants stay at Challenge');
  assert.ok(sample('oneStep', 'standard').some((question) => question.flipSet), 'Standard divides by a negative');
  const challenge = variantsAt('challenge');
  ['absolute/point', 'absolute/allBut', 'absolute/scaled', 'compoundAnd/sameWay', 'compoundOr/sameWay'].forEach((variant) => assert.ok(challenge.has(variant), variant));
  // Every kind has an Easy variant, so any kind plays at any difficulty.
  I.INEQUALITY_ITEM_IDS.forEach((itemType) => assert.ok(I.inequalityVariantsOf(itemType).some((variant) => variant.minTier === 'easy'), itemType));
});

test('a sign-flip slip is named exactly: the ray from the same number, the other way, with the same dot', () => {
  let flips = 0;
  ['oneStep', 'twoStep'].forEach((itemType) => sample(itemType, 'challenge').filter((question) => question.flipSet).forEach((question) => {
    const answer = answerOf(question);
    const flip = N.setFromPlain(question.flipSet);
    assert.equal(answer.length, 1);
    const [piece] = answer;
    const end = piece.lo ?? piece.hi;
    const closed = piece.lo !== null ? piece.loClosed : piece.hiClosed;
    assert.ok(N.setsEqual(flip, N.raySet(end, closed, piece.lo !== null ? -1 : 1)), question.inequality);
    // And the item really multiplies or divides by a negative: −2x, −x, 5 − 2x, −x/3.
    assert.match(question.inequality, /−\s?\d*x/, question.inequality);
    flips += 1;
  }));
  assert.ok(flips > 40, `${flips} items flip`);
});

/* ------------------------------ the schedule ------------------------------- */

test('items are deterministic, every student shares each block\'s slots in their own order, and none repeats the last', () => {
  const config = I.normalizeInequalityRushConfig({ presetId: 'everything' });
  const itemOf = (studentKey, questionIndex, roundIndex = 0) => I.generateInequalityQuestion({ seed: 'room', studentKey, roundIndex, questionIndex, config });
  assert.deepEqual(itemOf('a', 4), itemOf('a', 4));
  const slots = (studentKey, block) => Array.from({ length: 6 }, (_, offset) => {
    const question = itemOf(studentKey, block * 6 + offset);
    return `${question.family}/${question.variant}/${question.tier}`;
  });
  for (let block = 0; block < 4; block += 1) {
    assert.deepEqual(slots('a', block).sort(), slots('b', block).sort(), `block ${block}: the same six slots for everyone`);
  }
  const texts = (studentKey, roundIndex) => Array.from({ length: 24 }, (_, index) => itemOf(studentKey, index, roundIndex).inequality);
  assert.notDeepEqual(texts('a', 0), texts('b', 0), 'each student has their own numbers');
  assert.notDeepEqual(texts('a', 0), texts('a', 1), 'and each round its own items');
  ['a', 'b', 'c'].forEach((studentKey) => {
    const run = Array.from({ length: 150 }, (_, index) => itemOf(studentKey, index).inequality);
    run.slice(1).forEach((text, index) => assert.notEqual(text, run[index], `${studentKey}: item ${index + 1} repeats item ${index}`));
  });
  // A block of six spreads across the kinds chosen.
  const kinds = new Set(Array.from({ length: 6 }, (_, index) => itemOf('a', index).family));
  assert.ok(kinds.size >= 5, `${kinds.size} kinds in the first block`);
});

test('the share of "no solution" items is the catalog\'s own: none at Easy, some at Standard and Challenge', () => {
  const shareAt = (difficulty) => {
    const config = configOf(['absolute', 'compoundAnd'], difficulty);
    let none = 0;
    let total = 0;
    for (let room = 0; room < 40; room += 1) {
      for (let index = 0; index < 12; index += 1) {
        none += I.generateInequalityQuestion({ seed: `share-${room}`, studentKey: 's', roundIndex: 0, questionIndex: index, config }).targets.length === 0 ? 1 : 0;
        total += 1;
      }
    }
    return none / total;
  };
  assert.equal(shareAt('easy'), 0);
  const standard = shareAt('standard');
  assert.ok(standard > 0.08 && standard < 0.3, `${standard} at Standard`);
  assert.ok(shareAt('challenge') > 0.05, 'and at Challenge');
});

/* ------------------------------- the settings ------------------------------ */

test('settings: presets fill in, stay named only while they match, and a game needs one kind', () => {
  const preset = I.normalizeInequalityRushConfig({ presetId: 'solveAndGraph' });
  assert.deepEqual({ ...preset, itemTypes: [...preset.itemTypes] }, { presetId: 'solveAndGraph', itemTypes: ['oneStep', 'twoStep'], difficulty: 'standard' });
  assert.equal(I.normalizeInequalityRushConfig({ presetId: 'solveAndGraph', difficulty: 'challenge' }).presetId, 'custom');
  // Kinds in any order, duplicated or unknown: canonical, known, once each.
  const custom = I.normalizeInequalityRushConfig({ itemTypes: ['absolute', 'simple', 'simple', 'graphs'], difficulty: 'easy' });
  assert.deepEqual([...custom.itemTypes], ['simple', 'absolute']);
  assert.equal(I.normalizeInequalityRushConfig({ itemTypes: ['twoStep', 'oneStep'], difficulty: 'standard', presetId: 'solveAndGraph' }).presetId, 'solveAndGraph');
  assert.equal(I.normalizeInequalityRushConfig({ itemTypes: ['simple'] }).difficulty, 'standard', 'Standard by default');
  assert.throws(() => I.normalizeInequalityRushConfig({ itemTypes: [] }), (error) => error instanceof I.InequalityRushConfigError && /at least one kind/.test(error.message));
  assert.equal(I.inequalityConfigProblem({ itemTypes: [] }), 'Choose at least one kind of inequality.');
  assert.equal(I.inequalityConfigProblem({ presetId: 'graphIt' }), null);
  // Every preset is valid as it stands, and names itself.
  I.INEQUALITY_RUSH_PRESETS.forEach((entry) => assert.equal(I.normalizeInequalityRushConfig({ presetId: entry.id }).presetId, entry.id));
  assert.equal(I.defaultInequalityPresetFor('algebra2').id, 'absoluteValue');
  assert.equal(I.defaultInequalityPresetFor('algebra1').id, 'graphIt');
  // The teacher's toggles: the seven kinds of the plan.
  assert.deepEqual([...I.INEQUALITY_ITEM_IDS], ['simple', 'reversed', 'compoundAnd', 'compoundOr', 'oneStep', 'twoStep', 'absolute']);
});

test('the mode is a per-player question-set race on the rush\'s terms, with its own source and settings', () => {
  const mode = getChallengeMode(INEQUALITY_RUSH_MODE_ID);
  const rush = getChallengeMode(RUSH_MODE_ID);
  assert.equal(mode.id, CHALLENGE_MODE_ID.INEQUALITY_RUSH);
  assert.equal(mode.questionSource, QUESTION_SOURCE.INEQUALITY_GENERATOR);
  assert.equal(mode.roundStructure, ROUND_STRUCTURE.QUESTION_SET);
  assert.equal(mode.questionIssue, QUESTION_ISSUE.PER_PLAYER);
  assert.equal(mode.questionSpecs.length, rush.questionSpecs.length, 'the rush\'s pool');
  assert.deepEqual(mode.scoringStrategies, rush.scoringStrategies);
  assert.deepEqual(mode.scoringDefaults, rush.scoringDefaults, 'Grand Prix on the field curve');
  assert.equal(mode.teacherSelectable, true);
  assert.ok(listChallengeModes({ teacherSelectable: true }).some((entry) => entry.id === INEQUALITY_RUSH_MODE_ID));
  assert.equal(mode.capabilities.warmupLink, false);
  assert.equal(mode.capabilities.secondChance, false);
  assert.equal(normalizeModeConfig(mode, { inequalityRush: { presetId: 'compound' } }).inequalityRush.presetId, 'compound');
  assert.throws(() => normalizeModeConfig(mode, { inequalityRush: { itemTypes: [] } }), (error) => error.name === 'InequalityRushConfigError');
  // The client's one place for mode ids agrees.
  assert.ok(isRushModeId(INEQUALITY_RUSH_MODE_ID) && isRushModeId(RUSH_MODE_ID) && !isRushModeId('lineGraphRush'));
  assert.equal(questionSetGameOf({ challengeMode: INEQUALITY_RUSH_MODE_ID }), QUESTION_SET_GAME.INEQUALITY_RUSH);
  assert.equal(roomRunsQuestionSets({ challengeMode: INEQUALITY_RUSH_MODE_ID }), true);
  assert.equal(roomRoundsEndOnTheClock({ challengeMode: INEQUALITY_RUSH_MODE_ID }), true, 'a rush ends on the clock');
});

/* --------------------------------- grading --------------------------------- */

const itemWith = (itemType, variant, tier, test = () => true, seedPrefix = 'pick') => {
  for (let index = 0; index < 400; index += 1) {
    const question = I.generateInequalityItem({ slot: { itemType, variant, tier }, seedText: `${seedPrefix}-${index}` });
    if (test(question)) return question;
  }
  throw new Error(`no ${itemType}/${variant} item passed the test`);
};

// An item as the k-th of a student's round (a session keys items by their index).
const asItem = (question, questionIndex) => I.publicInequalityQuestion({ ...question, questionIndex });

const grade = (questions, attempts, player = {}) => applyRushAttempts({
  player,
  roundIndex: 0,
  roundVersion: 1,
  attempts,
  questionFor: (index) => questions[index] || null,
  arrivedAtMs: 600_000,
  arrivalElapsedMs: 600_000,
  roundDurationMs: 600_000,
  strategy: correctCountStrategy,
  poolSize: questions.length,
});
const check = (questionIndex, drawing) => ({ attemptId: newAttemptId(), questionIndex, kind: RUSH_ATTEMPT_KIND.CHECK, drawing: N.drawingToPlain(drawing) });
const press = (questionIndex) => ({ attemptId: newAttemptId(), questionIndex, kind: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST });

test('the server grades a check by set equality, names a sign-flip slip, and takes "No solution" only where nothing works', () => {
  const flipping = itemWith('oneStep', 'basic', 'standard', (question) => Boolean(question.flipSet));
  const none = itemWith('absolute', 'none', 'standard');
  const solvable = itemWith('simple', 'basic', 'easy');
  const questions = [flipping, none, solvable];
  // The slip: the forgot-to-flip drawing is a miss diagnosed as the flip.
  let outcome = grade(questions, [check(0, N.drawingForSet(N.setFromPlain(flipping.flipSet)))]);
  assert.equal(outcome.verdicts[0].verdict, 'miss');
  assert.equal(Object.values(outcome.receipts)[0].diagnosis, RUSH_SIGN_FLIP);
  // The answer completes it.
  outcome = grade(questions, [check(0, N.drawingForSet(answerOf(flipping)))], { submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence });
  assert.equal(outcome.verdicts[0].verdict, 'hit');
  assert.equal(outcome.verdicts[0].completesQuestion, true);
  // No solution: any drawing is wrong; the press is right.
  let player = { submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
  outcome = grade(questions, [check(1, N.drawingForSet(N.ALL_REALS))], player);
  assert.equal(outcome.verdicts[0].verdict, 'miss');
  player = { submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
  outcome = grade(questions, [press(1)], player);
  assert.equal(outcome.verdicts[0].verdict, 'hit');
  assert.equal(outcome.state.cursor, 2);
  // On an item that has solutions the press is a miss.
  player = { submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
  outcome = grade(questions, [press(2)], player);
  assert.equal(outcome.verdicts[0].verdict, 'miss');
});

test('three wrong answers show the answer and move on — on the device and on the server alike, "No solution" items included', () => {
  [itemWith('compoundOr', 'outside', 'standard'), itemWith('compoundAnd', 'none', 'standard')].forEach((question) => {
    assert.equal(rushAutoSkipMisses(question), RUSH_SET_AUTO_SKIP_MISSES);
    const wrong = question.targets.length ? N.drawingForSet(N.raySet(0, true, 1)) : N.drawingForSet(N.pointSet(1));
    const attempts = Array.from({ length: 3 }, () => check(0, wrong));
    const outcome = grade([question, question], attempts);
    assert.deepEqual(outcome.verdicts.map((row) => row.verdict), ['miss', 'miss', 'miss']);
    assert.equal(outcome.verdicts[2].autoSkipped, true);
    assert.equal(outcome.state.cursor, 1);
    // The device holds the answer on screen as it moves on.
    let session = createRushSession({ serverState: { cursor: 0 }, questions: [asItem(question, 0), asItem(question, 1)], poolSize: 2 });
    let now = 0;
    for (let miss = 0; miss < 3; miss += 1) {
      now = Math.max(now + 10, session.lockedUntil);
      session = Object.freeze({ ...session, drawing: wrong });
      session = recordCheck(session, { nowMs: now, elapsedMs: now, attemptId: newAttemptId() }).session;
    }
    assert.equal(session.feedback.kind, RUSH_FEEDBACK.AUTO_SKIPPED);
    assert.equal(session.transition.until - now, RUSH_REVEAL_PAUSE_MS);
    assert.equal(feedbackMessage(session.feedback, I.publicInequalityQuestion(question)), `Answer: ${I.inequalityAnswerText(question)}. Next one.`);
    // The line shows the answer — for "no solution", an empty line, never the student's wrong shading.
    const shownDrawing = answerDrawing(I.publicInequalityQuestion(question));
    if (question.targets.length) assert.deepEqual(shownDrawing, N.drawingForSet(answerOf(question)));
    else {
      assert.deepEqual(shownDrawing, N.EMPTY_DRAWING);
      const marks = numberLineMarks(I.NUMBER_LINE, 900, shownDrawing);
      assert.deepEqual([marks.bands, marks.dots, marks.arrows.left, marks.arrows.right], [[], [], null, null]);
    }
    const shown = lineNotation(I.publicInequalityQuestion(question), session.drawing, { revealing: true });
    assert.equal(shown[0], I.inequalityAnswerText(question), 'the answer, as an inequality');
    assert.equal(shown[1], N.intervalNotation(answerOf(question)), 'and in interval notation');
  });
  assert.equal(I.inequalityAnswerText(itemWith('absolute', 'none', 'standard')), 'no solution');
  assert.equal(I.inequalityAnswerText(itemWith('absolute', 'all', 'standard')), 'all real numbers');
  assert.match(I.inequalityAnswerText(itemWith('absolute', 'allBut', 'challenge')), /^x ≠ −?\d$/);
});

/* ---------------------------------- hints ---------------------------------- */

test('hints name the one thing that is off: the flip, which way, open or closed, and/or — never the answer', () => {
  const hint = (question, set) => I.inequalityHint(question, set);
  const flipping = itemWith('twoStep', 'basic', 'challenge', (question) => Boolean(question.flipSet));
  assert.equal(hint(flipping, N.setFromPlain(flipping.flipSet)), 'Did you multiply or divide by a negative? That flips the sign.');
  // Which way: the same dot shaded the other way, on an item with no flip.
  const simple = itemWith('simple', 'basic', 'easy');
  const [piece] = answerOf(simple);
  const end = piece.lo ?? piece.hi;
  const closed = piece.lo !== null ? piece.loClosed : piece.hiClosed;
  assert.equal(hint(simple, N.raySet(end, closed, piece.lo !== null ? -1 : 1)), 'Which way? Test a number: does it make the inequality true?');
  assert.equal(hint(simple, N.raySet(end, !closed, piece.lo !== null ? 1 : -1)), `Open or closed at the ${piece.lo !== null ? 'left' : 'right'} end? ≤ and ≥ include the number; < and > leave it out.`);
  // "And" between, "or" outside: the same two dots, shaded the wrong shape.
  const or = itemWith('compoundOr', 'outside', 'easy');
  const [low, high] = answerOf(or);
  assert.equal(hint(or, N.intervalSet(low.hi, low.hiClosed, high.lo, high.loClosed)), '"Or": either part can be true — shade outside.');
  const and = itemWith('compoundAnd', 'between', 'easy');
  const [between] = answerOf(and);
  assert.equal(hint(and, N.unionSets(N.raySet(between.lo, between.loClosed, -1), N.raySet(between.hi, between.hiClosed, 1))), '"And": both parts must be true — shade between.');
  const beyond = itemWith('absolute', 'beyond', 'standard');
  const [left, right] = answerOf(beyond);
  assert.equal(hint(beyond, N.intervalSet(left.hi, left.hiClosed, right.lo, right.loClosed)), 'More than a distance from the center: shade outside.');
  // A wrong number on a solve-first item: solve again.
  const solve = itemWith('oneStep', 'basic', 'easy');
  const [solved] = answerOf(solve);
  const shifted = solved.lo !== null ? N.raySet(Q.toNumber(solved.lo) + 1, solved.loClosed, 1) : N.raySet(Q.toNumber(solved.hi) + 1, solved.hiClosed, -1);
  assert.equal(hint(solve, shifted), 'Check the number: solve for x first.');
  // A drawing on an item with no solution, and the press on one that has some.
  assert.equal(hint(itemWith('absolute', 'none', 'standard'), N.ALL_REALS), 'Test a number you shaded: does it make the inequality true?');
  assert.equal(I.NO_SOLUTION_MISS, 'It has solutions — test a number.');
  // Never the answer: no hint names a number.
  [flipping, simple, or, and, beyond, solve].forEach((question) => {
    assert.doesNotMatch(hint(question, N.pointSet(9)), /\d/, question.inequality);
  });
});

/* ------------------------------ on the device ------------------------------ */

test('on the device: a tap drops a dot on the line, the arrows toggle, Check grades, and No Solution answers an item with none', () => {
  const none = asItem(itemWith('absolute', 'none', 'standard'), 0);
  const ray = asItem(itemWith('simple', 'basic', 'easy', (question) => answerOf(question)[0].lo !== null && answerOf(question)[0].loClosed), 1);
  let session = createRushSession({ serverState: { cursor: 0 }, questions: [none, ray], poolSize: 2 });
  // An item with no solution still draws on the line: nothing says what it is.
  assert.equal(axisValueAt(none, { x: 2.4, y: 0 }), 2);
  assert.equal(axisValueAt(none, { x: 10.6, y: 0 }), 10, 'a tap just past the end is held on the line');
  session = recordAxisTap(session, { x: 2.4, y: 0, nowMs: 10 }).session;
  session = toggleAxisArrow(session, 'right', { nowMs: 11 }).session;
  assert.ok(drawingReady(session));
  assert.deepEqual(lineNotation(none, session.drawing), ['x ≥ 2', '[2, ∞)']);
  assert.equal(lineNotation(none, N.EMPTY_DRAWING), null, 'nothing drawn: nothing to say');
  assert.deepEqual(lineNotation(none, N.EMPTY_DRAWING, { revealing: true }), ['no solution', '∅']);
  // A domain or range keeps its one form, interval notation.
  const domain = { targets: [{ id: 'dom1', geometry: 'set', axis: 'x', set: [[1, false, null, false]] }] };
  assert.deepEqual(lineNotation(domain, N.drawingForSet(N.raySet(1, true, 1))), ['[1, ∞)']);
  assert.deepEqual(lineNotation(domain, null, { revealing: true }), ['(1, ∞)']);
  let outcome = recordCheck(session, { nowMs: 20, elapsedMs: 20, attemptId: 'c1' });
  assert.equal(outcome.attempt.kind, RUSH_ATTEMPT_KIND.CHECK);
  assert.equal(feedbackMessage(outcome.session.feedback, none), 'Test a number you shaded: does it make the inequality true?');
  outcome = recordDoesNotExist(outcome.session, { nowMs: 40, elapsedMs: 40, attemptId: 'n1' });
  assert.equal(outcome.session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(feedbackMessage(outcome.session.feedback, none), NO_SOLUTION_RIGHT);
  session = settle(outcome.session, 1_000);
  assert.equal(currentQuestion(session).questionIndex, ray.questionIndex);
  assert.deepEqual(session.drawing, N.EMPTY_DRAWING, 'a fresh line for the next item');
  // "No solution" on an item that has solutions.
  outcome = recordDoesNotExist(session, { nowMs: 1_100, elapsedMs: 1_100, attemptId: 'n2' });
  assert.equal(feedbackMessage(outcome.session.feedback, ray), I.NO_SOLUTION_MISS);
  // The answer, drawn, completes it and reads back as an inequality.
  session = Object.freeze({ ...outcome.session, drawing: N.drawingForSet(answerOf(ray)) });
  outcome = recordCheck(session, { nowMs: 1_200, elapsedMs: 1_200, attemptId: 'c2' });
  assert.equal(outcome.session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(feedbackMessage(outcome.session.feedback, ray), `Correct — ${I.inequalityAnswerText(ray)}.`);
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.SKIPPED, questionIndex: 1 }, ray), 'Skipped. Next one.');
});

test('device and server agree on every step of random play on inequalities', () => {
  const config = I.normalizeInequalityRushConfig({ presetId: 'everything' });
  let replies = 0;
  let resyncs = 0;
  let checks = 0;
  let presses = 0;
  for (let student = 0; student < 8; student += 1) {
    const studentKey = `agree-ineq-${student}`;
    const serverQuestion = (index) => I.generateInequalityQuestion({ seed: 'agree-ineq', studentKey, roundIndex: 0, questionIndex: index, config });
    const questions = Array.from({ length: 30 }, (_, index) => I.publicInequalityQuestion(serverQuestion(index)));
    let seed = 11 + student * 389;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions, poolSize: 30 });
    let player = {};
    let now = 0;
    const deliver = () => {
      while (session.queue.length) {
        const batch = nextBatch(session).slice(0, 1 + Math.floor(random() * Math.min(5, session.queue.length)));
        const outcome = applyRushAttempts({ player, roundIndex: 0, roundVersion: 1, attempts: batch, questionFor: serverQuestion, arrivedAtMs: now, arrivalElapsedMs: now, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 30 });
        player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
        const acked = acknowledge(session, { sent: batch, reply: { verdicts: outcome.verdicts, state: outcome.state } });
        replies += 1;
        if (acked.resynced) resyncs += 1;
        session = acked.session;
      }
    };
    for (let step = 0; step < 260 && session.cursor < 28; step += 1) {
      now += 60 + Math.floor(random() * 900);
      session = settle(session, now);
      if (inputState(session, now) === RUSH_INPUT.LOCKED) now = session.lockedUntil;
      if (inputState(session, now) !== RUSH_INPUT.READY) continue;
      const question = currentQuestion(session);
      const context = { nowMs: now, elapsedMs: now, attemptId: newAttemptId() };
      const answer = answerOf(question);
      const roll = random();
      let input;
      if (roll < 0.05) input = recordSkip(session, context);
      else if (roll < 0.15) { input = recordDoesNotExist(session, context); presses += 1; }
      else if (roll < 0.4 && answer.length) input = { session: Object.freeze({ ...session, drawing: N.drawingForSet(answer) }) };
      else if (roll < 0.6) input = recordAxisTap(session, { x: -10 + random() * 20, y: 0, nowMs: now });
      else if (roll < 0.7) input = toggleAxisArrow(session, random() < 0.5 ? 'left' : 'right', context);
      else if (drawingReady(session)) { input = recordCheck(session, context); checks += 1; }
      else input = recordSkip(session, context);
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 30, strategy: correctCountStrategy }).state), false, studentKey);
  }
  assert.ok(checks > 60, `${checks} checks`);
  assert.ok(presses > 20, `${presses} No Solution presses`);
  assert.ok(replies > 100, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
});

/* ------------------------------- number line ------------------------------- */

test('the number line: every whole number a tick, labels that fit, taps and keys on the ticks', () => {
  const line = I.NUMBER_LINE;
  const wide = numberLineLayout(line, 900);
  assert.equal(wide.ticks.length, 21);
  assert.ok(wide.ticks.every((tick) => tick.labeled), 'every number labeled when there is room');
  const narrow = numberLineLayout(line, 320);
  assert.ok(narrow.ticks.filter((tick) => tick.labeled).length < 21, 'fewer labels on a phone');
  assert.ok(narrow.ticks.find((tick) => tick.value === 0).labeled, '0 always labeled');
  const zeroX = wide.ticks.find((tick) => tick.value === 0).x;
  assert.equal(numberAtPixel(line, 900, zeroX + 3), 0);
  assert.equal(numberAtPixel(line, 900, wide.xOf(3.4)), 3);
  assert.equal(numberAtPixel(line, 900, 2), -10, 'past the end: the end');
  assert.equal(moveLineCursor(line, 0, 'ArrowRight'), 1);
  assert.equal(moveLineCursor(line, 0, 'ArrowLeft', { large: true }), -5);
  assert.equal(moveLineCursor(line, 9, 'ArrowRight', { large: true }), 10);
  assert.equal(moveLineCursor(line, 3, 'Home'), -10);
  const drawing = N.tapNumber(N.tapNumber(N.EMPTY_DRAWING, -2), -2);
  assert.equal(describeLineCursor(drawing, -2), '−2, open dot');
  assert.equal(describeLineCursor(drawing, 4), '4');
  // Marks: a ray runs to the line's end with its arrow; both arrows alone are every number.
  const ray = numberLineMarks(line, 900, N.toggleArrow(drawing, 'right'));
  assert.equal(ray.bands.length, 1);
  assert.equal(ray.bands[0].from, wide.xOf(-2));
  assert.equal(ray.bands[0].to, wide.right);
  assert.equal(ray.arrows.right, wide.right);
  assert.equal(ray.arrows.left, null);
  const everything = numberLineMarks(line, 900, N.toggleArrow(N.toggleArrow(N.EMPTY_DRAWING, 'left'), 'right'));
  assert.deepEqual(everything.bands.map((band) => [band.from, band.to]), [[wide.left, wide.right]]);
  // A lone arrow shows at once, before it names a set.
  const lone = numberLineMarks(line, 900, N.toggleArrow(N.EMPTY_DRAWING, 'left'));
  assert.deepEqual(lone.bands, []);
  assert.equal(lone.arrows.left, wide.left);
});

/* ------------------------------ report, guide ------------------------------ */

test('the report names kinds of inequality and counts what wrong checks got wrong; student rows leave with a deletion', () => {
  const standing = (studentId, summary) => ({ studentId, alias: studentId, joined: true, rank: 1, score: 1, questionSetSummary: summary });
  const report = buildRushReport({
    standings: [
      standing('s1', { questions: 4, completed: 3, skipped: 1, attempts: 6, hits: 3, dnePresses: 2, dneCorrect: 1, byFeature: { inequality: { questions: 4, completed: 3, attempts: 6, hits: 3 } }, byFamily: { oneStep: { questions: 2, completed: 1, attempts: 4, hits: 1 }, simple: { questions: 2, completed: 2, attempts: 2, hits: 2 } }, mistakes: { signFlip: 2, inclusion: 1 } }),
      standing('s2', { questions: 2, completed: 2, attempts: 3, hits: 2, byFamily: { absolute: { questions: 2, completed: 2, attempts: 3, hits: 2 } }, mistakes: { signFlip: 1 } }),
    ],
  }, I.INEQUALITY_REPORT_LABELS);
  assert.deepEqual(report.byFamily.map((row) => row.label), ['Solve first: one step', 'Absolute value (Algebra II)', 'Simple']);
  assert.deepEqual(report.mistakes, [{ key: 'signFlip', label: 'Did not flip the sign', count: 3 }, { key: 'inclusion', label: 'Open or closed dot', count: 1 }]);
  assert.equal(report.doesNotExist.presses, 2);
  // Graph Feature Rush's report keeps its own labels.
  assert.equal(buildRushReport({ standings: [standing('s1', { byFamily: { linear: { questions: 1, completed: 1, attempts: 1, hits: 1 } }, mistakes: { direction: 1 } })] }).mistakes[0].label, 'Shaded the wrong way');
  // A deleted student leaves this report's rows too (SI07).
  assert.ok(REPORT_STUDENT_ROW_PATHS.includes('inequalityRush.players'));
  const stored = { studentIds: ['s1', 's2'], inequalityRush: { players: [{ studentId: 's1' }, { studentId: 's2' }], graphsCompleted: 5 } };
  assert.deepEqual(reportStudentIds(stored), ['s1', 's2']);
  const patch = reportRowsWithout(stored, (id) => id === 's1');
  assert.deepEqual(patch.inequalityRush.players, [{ studentId: 's2' }]);
  assert.equal(patch.inequalityRush.graphsCompleted, 5, 'the class\'s totals stay');
});

test('a round publishes a guide to graphing the kinds in the game, titled as one, short enough for the projector', () => {
  const easy = inequalityReadingGuide({ itemTypes: ['simple', 'oneStep'], difficulty: 'easy' }).solutionReview.reasoning;
  assert.deepEqual(easy, [INEQUALITY_READING.dots, INEQUALITY_READING.direction], 'Easy: no flip to explain, no "no solution"');
  const all = inequalityReadingGuide({ itemTypes: I.INEQUALITY_ITEM_IDS, difficulty: 'mixed' }).solutionReview.reasoning;
  assert.ok(all.includes(INEQUALITY_READING.flip) && all.includes(INEQUALITY_READING.compound) && all.includes(INEQUALITY_READING.absolute));
  assert.equal(all[all.length - 1], INEQUALITY_READING.noSolution, 'the answers line last');
  assert.ok(all.length <= 7, 'every line fits the projector');
  all.forEach((line) => assert.ok(line.length <= 110, line));
  assert.equal(inequalityReadingGuide({ itemTypes: [] }), null);
  const record = inequalityRoundSolutionRecord({ itemTypes: ['absolute'], difficulty: 'standard' });
  assert.equal(record.guide, true);
  const published = publicSolutionDocument({ roundIndex: 0, record });
  assert.equal(solutionTitle(published), INEQUALITY_GUIDE_TITLE);
  assert.deepEqual(projectorSteps(published), [...record.solutionReview.reasoning]);
  // A Graph Feature Rush guide keeps its own title.
  assert.equal(solutionTitle(publicSolutionDocument({ roundIndex: 0, record: { solutionReview: { reasoning: ['a'] }, guide: true } })), 'How to read the features');
});

/* ------------------------------ the server ------------------------------ */

test('the server plans, issues, grades, reveals and reports an inequality room through the rush\'s own code', () => {
  const index = executableSource(read('functions/index.js'));
  const planners = region(index, 'const GENERATED_QUESTION_PLANNERS = Object.freeze({', '\n});', 'the generated planners');
  assert.match(planners, /\binequalityGenerator: INEQUALITY_RUSH_PLANNER,/);
  const planner = region(index, 'const INEQUALITY_RUSH_PLANNER = Object.freeze({', '\n});\n', 'the planner');
  assert.match(planner, /privateFields: \{ inequalityRush: \{ seed: crypto\.randomUUID\(\), config, generatorVersion \} \}/, 'the seed stays on the server');
  assert.match(planner, /roomFields: \{ inequalityRush: \{ config, generatorVersion \} \}/);
  assert.match(planner, /solution: reading\.inequalityRoundSolutionRecord\(\{ itemTypes: config\.itemTypes, difficulty: config\.difficulty \}\)/);
  // Issued and graded by the rush's two callables, from this game's generator.
  const games = region(index, 'const RUSH_QUESTION_SOURCES = Object.freeze({', '\n});\n', 'the rush games');
  const inequalities = region(games, 'inequalityGenerator: Object.freeze({', '\n  }),', 'the inequality game');
  assert.match(inequalities, /stateKey: "inequalityRush",/);
  assert.match(inequalities, /return \{ version: generator\.INEQUALITY_GENERATOR_VERSION, generate: generator\.generateInequalityQuestion, publicQuestion: generator\.publicInequalityQuestion \};/);
  const context = region(index, 'async function loadGraphFeatureRushContext(', '\n}\n', 'the rush context');
  assert.match(context, /Object\.hasOwn\(RUSH_QUESTION_SOURCES, mode\.questionSource\)/);
  assert.match(context, /const rushState = \(privateSnapshot\.data\(\) \|\| \{\}\)\[source\.stateKey\] \|\| \{\};/);
  // Its guide is published at the round's close, as a rush's is.
  const revealable = region(index, 'function liveChallengeRevealableRounds(', '\n}\n', 'revealable rounds');
  assert.match(revealable, /mode\.questionSource === engine\.modes\.QUESTION_SOURCE\.INEQUALITY_GENERATOR\) \{/);
  // Its report: the rush's, named for inequalities, under its own key.
  const report = region(index, 'async function questionSetModeReport(', '\n}\n', 'the mode report');
  assert.match(report, /if \(mode\.questionSource === "inequalityGenerator"\) \{[\s\S]*?return \{ key: "inequalityRush", report: \(await graphFeatureRushRules\(\)\)\.rush\.buildRushReport\(result, generator\.INEQUALITY_REPORT_LABELS\) \};/);
  // A teacher's settings errors are a sentence, not a crash.
  assert.match(index, /const LIVE_CHALLENGE_CONFIG_ERRORS = new Set\(\[[^\]]*"InequalityRushConfigError"/);
  // The preview is a teacher's, writes nothing, and names the settings it used.
  const preview = region(index, 'exports.previewInequalityRush = onCall(', '\n});\n', 'the preview');
  assert.match(preview, /await requireTeacher\(request\);/);
  assert.doesNotMatch(preview, /\.set\(|\.update\(|runTransaction/);
  const service = read('src/platform/liveChallenge/liveChallengeService.js');
  const bridge = read('tests/browser/emulator/liveChallengeBridgeService.js');
  [service, bridge].forEach((source) => assert.match(source, /export const previewInequalityRush = call\('previewInequalityRush'\);/));
});

/* ------------------------------- the screens ------------------------------- */

test('the teacher sets it up from presets and toggles, practises it, and plays it again with the same settings', () => {
  const setup = defaultInequalitySetup('algebra1');
  assert.equal(setup.presetId, 'graphIt');
  const toggled = changeInequalitySetup(setup, { itemTypes: [...setup.itemTypes, 'compoundOr'] });
  assert.equal(toggled.presetId, 'custom', 'a preset is not named over settings it no longer describes');
  assert.equal(changeInequalitySetup(toggled, { itemTypes: setup.itemTypes }).presetId, 'custom', 'and stays custom once changed');
  assert.equal(inequalitySetupProblem({ ...setup, itemTypes: [] }), 'Choose at least one kind of inequality.');
  const request = inequalityCreateRequest(inequalitySetupFromPreset(I.getInequalityPreset('absoluteValue')), { rewardPolicy: { rule: 'x' } });
  assert.deepEqual(request, {
    challengeMode: INEQUALITY_RUSH_MODE_ID,
    inequalityRush: { presetId: 'absoluteValue', itemTypes: ['absolute', 'compoundAnd', 'compoundOr'], difficulty: 'standard' },
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    rewardPolicy: { rule: 'x' },
  });
  // Play Again: the same kinds and difficulty.
  const room = { classId: 'c1', challengeMode: INEQUALITY_RUSH_MODE_ID, roundCount: 3, roundSeconds: 90, scoringStrategyId: 'grandPrix', inequalityRush: { config: { presetId: 'custom', itemTypes: ['oneStep'], difficulty: 'challenge' } } };
  assert.deepEqual(replayRequestFromRoom(room).inequalityRush, { presetId: 'custom', itemTypes: ['oneStep'], difficulty: 'challenge' });
  assert.equal(replayRequestFromRoom({ ...room, inequalityRush: undefined }), null, 'a room without its settings cannot be replayed');
  assert.match(replaySummary(room), /^Inequality Graphing Rush · 3 rounds · 90s each · Grand Prix/);
  // The console offers it, sets it up, practises it on the rush's practice screen.
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /<option value=\{INEQUALITY_RUSH_MODE_ID\}>Inequality Graphing Rush<\/option>/);
  assert.match(teacher, /const InequalityRushSetup = lazy\(\(\) => import\('\.\/InequalityRushSetup\.jsx'\)\);/);
  const create = region(teacher, 'if (ownSettingsGame) {', 'if (warmupAssignmentId && warmupDeliveryMode', 'own-settings create');
  assert.match(create, /if \(inequalityProblem\) throw new Error\(inequalityProblem\);/);
  assert.match(create, /inequalityMode\s*\?\s*inequalityCreateRequest\(inequalitySetup, \{ rewardPolicy: buildChallengeRewardPolicy\(rewardChoice\) \}\)/);
  const practice = region(teacher, 'if (dryRunOpen && inequalityMode) {', '\n    }', 'practice');
  assert.match(practice, /<GraphFeatureRushPractice\s+game=\{INEQUALITY_RUSH_MODE_ID\}\s+config=\{inequalityCreateRequest\(inequalitySetup\)\.inequalityRush\}/);
  assert.match(read('src/components/liveChallenge/GraphFeatureRushPractice.jsx'), /\[INEQUALITY_RUSH_MODE_ID\]: Object\.freeze\(\{ key: 'inequalityRush', preview: \(config, count\) => previewInequalityRush\(\{ inequalityRush: config, count \}\)/);
  assert.match(teacher, /\{\(report\.graphFeatureRush \|\| report\.inequalityRush\) && <RushReport report=\{report\} \/>\}/);
  // A class's course picks the starting preset, as for graphs: Algebra II opens on absolute value.
  assert.match(teacher, /useEffect\(\(\) => \{ setInequalitySetup\(defaultInequalitySetup\(courseId\)\); \}, \[courseId\]\);/);
  assert.equal(defaultInequalitySetup('algebra2').presetId, 'absoluteValue');
});

test('students race on the rush\'s screen with a number line and No Solution; every screen says inequalities', () => {
  const round = read('src/components/liveChallenge/GraphFeatureRushRound.jsx');
  assert.match(round, /\{question && inequalityItem && started && phase === 'ready' \? \(/);
  assert.match(region(round, '<InequalityNumberLine', '/>', 'the number line'), /drawing=\{studentDrawing\}[\s\S]*reveal=\{revealDrawing\}[\s\S]*onTap=\{onTap\}/);
  // The reveal draws the answer from the session's own rule (answerDrawing): an empty line for "no solution".
  assert.match(round, /const revealDrawing = useMemo\(\(\) => \(revealing \? answerDrawing\(question\) : null\), \[revealing, question\]\);/);
  // No Solution on every inequality item, whatever its answer.
  assert.match(round, /\{inequalityItem && \(\s*<button type="button" className="mm-rush-dne" disabled=\{buttonsDisabled\} onClick=\{onDoesNotExist\}[^>]*>No Solution<\/button>/);
  // Words for the game, from the client's one place.
  const words = rushGameWords({ challengeMode: INEQUALITY_RUSH_MODE_ID });
  assert.equal(words.game, 'Inequality Graphing Rush');
  assert.deepEqual([words.one, words.many], ['inequality', 'inequalities']);
  assert.equal(rushGameWords({ challengeMode: RUSH_MODE_ID }).many, 'graphs');
  // The final card counts what the game's items are: inequalities, not graphs.
  const shell = read('src/components/liveChallenge/ChallengeStudentShell.jsx');
  assert.match(region(shell, 'export function StudentFinalCard(', '\n}\n', 'the final card'), /if \(rush\) units = rushGameWords\(room\);/);
  assert.equal(isRushGame(QUESTION_SET_GAME.INEQUALITY_RUSH), true);
  const projector = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  assert.match(projector, /const words = rushGameWords\(room\);/);
  const host = read('src/components/liveChallenge/GraphFeatureRushHost.jsx');
  assert.match(region(host, 'export function RushHostStatus(', '\n}\n', 'host status'), /\{words\.game\}/);
  // The number line never reaches past what the item carries.
  const lineScreen = executableSource(read('src/components/liveChallenge/InequalityNumberLine.jsx'));
  assert.doesNotMatch(lineScreen, /\.targets\b|flipSet|inequalityRush\.mjs/, 'the line draws what the student draws, never the answer by itself');
});
