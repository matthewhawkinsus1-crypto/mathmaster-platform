import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { latticePointsInView, slopeOf, yInterceptOf } from '../../functions/shared/lineGraphMath.mjs';
import { normalizeLineGraphConfig, lineRoundQuestionCount } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import {
  LINE_TARGET_ID,
  applyLineGraphAttempts,
  buildLineGraphReport,
  lineGraphPlayerTotals,
  lineRoundState,
  normalizeLineGraphAttempt,
} from '../../functions/shared/lineGraphAttempts.mjs';
import {
  LINE_ANSWER_STYLE,
  LINE_ATTEMPT_KIND,
  LINE_AUTO_SKIP_MISSES,
  LINE_GRAPH_FORMAT,
  LINE_LIMITS,
  LINE_VERDICT,
  lineLockoutMs,
} from '../../functions/shared/lineGraphRules.mjs';
import { questionSpecsFromReceipts, summarizeRoundProgress } from '../../functions/shared/liveChallengeResponses.mjs';
import { questionSetMatchSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { questionSetWorkScore } from '../../functions/shared/liveChallengeModes.mjs';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { createRng } from '../../functions/shared/seededRandom.mjs';

/*
 * THE ATTEMPT PIPELINE, THROUGH THE FUNCTION THE SUBMIT TRANSACTION RUNS.
 *
 * A right answer completes its item once; a wrong one is one miss with the
 * mistake it showed; the miss that uses the last try ends the item in the
 * same receipt; the same wrong answer again, a right line past the key points
 * and unfinished boxes are neither credit nor a miss. Retries replay; late
 * and early attempts resolve; claimed times are bounded; the record is
 * bounded. And reading the equation beats guessing.
 */

const { CLASSIC, SPRINT, RUSH } = LINE_GRAPH_FORMAT;
const grandPrix = getScoringStrategy('grandPrix');
const correctCount = getScoringStrategy('correctCount');

let attemptCounter = 0;
const nextId = () => `attempt-${(attemptCounter += 1)}`;

const gameFor = (settings = {}, { format = SPRINT, seed = 'play-room', studentKey = 'ana', strategy = grandPrix } = {}) => {
  const config = normalizeLineGraphConfig({ presetId: 'allThreeForms', ...settings }, { format });
  const poolSize = lineRoundQuestionCount(format, config);
  let player = { submissionReceipts: {}, attemptSequence: 0, score: 0 };
  const items = new Map();
  const itemAt = (roundIndex, questionIndex) => {
    const key = `${roundIndex}:${questionIndex}`;
    if (!items.has(key)) items.set(key, generateLineQuestion({ seed, studentKey, roundIndex, questionIndex, config }));
    return items.get(key);
  };
  const submit = (attempts, { roundIndex = 0, elapsedMs = 5_000 } = {}) => {
    const outcome = applyLineGraphAttempts({
      player,
      roundIndex,
      roundVersion: roundIndex + 1,
      attempts,
      questionFor: (questionIndex) => itemAt(roundIndex, questionIndex),
      config,
      arrivedAtMs: 1_000_000 + elapsedMs,
      arrivalElapsedMs: elapsedMs,
      roundDurationMs: 300_000,
      strategy,
      poolSize,
    });
    player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
    return outcome;
  };
  return {
    config,
    poolSize,
    itemAt,
    submit,
    player: () => player,
    state: (roundIndex = 0) => lineRoundState({ receipts: player.submissionReceipts, roundIndex, poolSize }),
  };
};

// What a student who knows the answer does with an item.
const rightAttempt = (item, questionIndex) => {
  if (item.answerStyle === LINE_ANSWER_STYLE.CHOICE) return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.CHOICE, choice: item.answerChoice };
  if (item.answerStyle === LINE_ANSWER_STYLE.BUILD) {
    const m = slopeOf(item.line);
    const fields = item.build.form === 'standard'
      ? { A: String(item.line.a), B: String(item.line.b), C: String(item.line.c) }
      : item.build.form === 'pointSlope'
        ? { x1: String(item.marked.x), y1: String(item.marked.y), m: Q.format(m) }
        : { m: Q.format(m), b: Q.format(yInterceptOf(item.line)) };
    return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.EQUATION, fields };
  }
  const points = item.anchors.length === 2
    ? item.anchors
    : [...item.anchors, ...latticePointsInView(item.line, item.view)].filter((point, index, all) => all.findIndex((other) => other.x === point.x && other.y === point.y) === index).slice(0, 2);
  return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.LINE, points };
};

// A wrong line, different for each n (up to ten): from the item's first grid
// point, a step that is not along the line and stays on the grid.
const WRONG_STEPS = [[1, 1], [1, -1], [2, 1], [1, 2], [-1, 2], [2, -1], [1, 3], [3, 1], [-2, 1], [1, -3], [3, -1], [-1, 3]];
const wrongLineAttempt = (item, questionIndex, n = 0) => {
  const [p] = latticePointsInView(item.line, item.view, { inset: 2 });
  const slope = slopeOf(item.line);
  const usable = WRONG_STEPS
    .map(([dx, dy]) => ({ dx, dy, q: { x: p.x + dx, y: p.y + dy } }))
    .filter(({ dx, dy, q }) => (slope ? !Q.eq(Q.rat(dy, dx), slope) : dx !== 0)
      && Math.abs(q.x) <= item.view.xMax && Math.abs(q.y) <= item.view.yMax);
  if (n >= usable.length) throw new Error('no wrong line found');
  return { attemptId: nextId(), questionIndex, kind: LINE_ATTEMPT_KIND.LINE, points: [p, usable[n].q] };
};

// The first item of a game whose answer style is `style`.
const firstItem = (game, style, roundIndex = 0) => {
  for (let index = 0; index < 40; index += 1) {
    const item = game.itemAt(roundIndex, index);
    if (item.answerStyle === style) return { item, index };
  }
  throw new Error(`no ${style} item`);
};

test('a right line completes its item, once, and the next item is current', () => {
  const game = gameFor({ itemTypes: ['graph'] });
  const item = game.itemAt(0, 0);
  const outcome = game.submit([rightAttempt(item, 0)]);
  assert.equal(outcome.verdicts[0].verdict, LINE_VERDICT.CORRECT);
  assert.equal(outcome.verdicts[0].completesQuestion, true);
  assert.equal(outcome.recorded, 1);
  assert.equal(outcome.state.cursor, 1);
  const [receipt] = Object.values(outcome.receipts);
  assert.equal(receipt.receiptKind, 'targetAttempt');
  assert.equal(receipt.targetId, LINE_TARGET_ID);
  assert.equal(receipt.targetCount, 1);
  assert.equal(receipt.roundQuestionCount, 10, 'the Sprint\'s length travels on the receipt');
  assert.deepEqual(receipt.reportTags, { form: item.form, itemType: 'graph', variant: item.variant });
  assert.equal(receipt.tier, item.tier);
  assert.equal(receipt.points.length, 4);
  assert.equal(receipt.answerKey, undefined, 'only misses keep their answer key');
  // A second right answer for the same item is late: resolved, not recorded.
  const again = game.submit([rightAttempt(item, 0)]);
  assert.equal(again.verdicts[0].verdict, LINE_VERDICT.RESOLVED);
  assert.equal(again.recorded, 0);
});

test('a wrong line is one miss with its mistake; the same wrong line again is not a second miss', () => {
  const game = gameFor({ itemTypes: ['graph'] });
  const item = game.itemAt(0, 0);
  const wrong = wrongLineAttempt(item, 0);
  const first = game.submit([wrong]);
  assert.equal(first.verdicts[0].verdict, LINE_VERDICT.INCORRECT);
  assert.ok(first.verdicts[0].diagnosis, 'a miss says what went wrong');
  assert.equal(first.verdicts[0].revealed, false);
  assert.equal(game.state().cursorMisses, 1);
  // Letting go where the point already was — the same line — is no attempt.
  const same = game.submit([{ ...wrong, attemptId: nextId() }]);
  assert.equal(same.verdicts[0].verdict, LINE_VERDICT.REPEATED);
  assert.equal(same.recorded, 0);
  // A device restores that answer after a refresh (LC10): the state carries
  // the student's own last miss, never the key.
  assert.equal(game.state().cursorLastMissKey, Object.values(first.receipts).find((receipt) => receipt.isCorrect === false).answerKey);
  // So is the same line drawn through two other of its points.
  const [p, q] = wrong.points;
  const further = { x: q.x + (q.x - p.x), y: q.y + (q.y - p.y) };
  if (Math.abs(further.x) <= item.view.xMax && Math.abs(further.y) <= item.view.yMax) {
    assert.equal(game.submit([{ ...wrong, attemptId: nextId(), points: [q, further] }]).verdicts[0].verdict, LINE_VERDICT.REPEATED);
  }
  assert.equal(game.state().cursorMisses, 1);
});

test('the miss that uses the last try ends the item — one receipt, counted once', () => {
  const game = gameFor({ itemTypes: ['graph'], triesPerItem: 3 });
  const item = game.itemAt(0, 0);
  const outcomes = [0, 1, 2].map((n) => game.submit([wrongLineAttempt(item, 0, n)]));
  assert.deepEqual(outcomes.map((outcome) => outcome.verdicts[0].revealed), [false, false, true]);
  assert.ok(outcomes.every((outcome) => outcome.verdicts[0].verdict === LINE_VERDICT.INCORRECT));
  const state = game.state();
  assert.equal(state.cursor, 1, 'the next item is current');
  assert.equal(state.ended, 1);
  assert.equal(state.attempts, 3, 'three wrong lines are three attempts, not four');
  const receipts = Object.values(game.player().submissionReceipts);
  assert.equal(receipts.length, 3);
  assert.equal(receipts.filter((receipt) => receipt.forfeit === true && receipt.revealed === true).length, 1);
  // Past the end, the item takes nothing more.
  assert.equal(game.submit([rightAttempt(item, 0)]).verdicts[0].verdict, LINE_VERDICT.RESOLVED);
});

test('tries are the teacher\'s: one, two, or until right (ended after eight)', () => {
  for (const [triesPerItem, expected] of [[1, 1], [2, 2], [0, LINE_AUTO_SKIP_MISSES]]) {
    const game = gameFor({ itemTypes: ['graph'], triesPerItem }, { seed: `tries-${triesPerItem}` });
    const item = game.itemAt(0, 0);
    let ended = 0;
    for (let n = 0; n < expected; n += 1) {
      const outcome = game.submit([wrongLineAttempt(item, 0, n)]);
      if (outcome.verdicts[0].revealed) ended = n + 1;
    }
    assert.equal(ended, expected, `${triesPerItem} tries end on miss ${expected}`);
    assert.equal(game.state().cursor, 1);
  }
});

test('a chosen option gets one try, whatever the tries setting', () => {
  const game = gameFor({ itemTypes: ['name'], nameStyle: 'choice', triesPerItem: 3 });
  const { item, index } = firstItem(game, LINE_ANSWER_STYLE.CHOICE);
  assert.equal(index, 0);
  const wrongChoice = item.choices.find((choice) => choice.id !== item.answerChoice).id;
  const outcome = game.submit([{ attemptId: nextId(), questionIndex: 0, kind: LINE_ATTEMPT_KIND.CHOICE, choice: wrongChoice }]);
  assert.equal(outcome.verdicts[0].verdict, LINE_VERDICT.INCORRECT);
  assert.equal(outcome.verdicts[0].revealed, true);
  assert.ok(outcome.verdicts[0].diagnosis);
  assert.equal(game.state().cursor, 1);
  const right = game.submit([rightAttempt(game.itemAt(0, 1), 1)]);
  assert.equal(right.verdicts[0].verdict, LINE_VERDICT.CORRECT);
});

test('built equations: right however written; unfinished boxes are neither credit nor a miss', () => {
  const game = gameFor({ itemTypes: ['name'], nameStyle: 'build', forms: ['standard'] });
  const { item, index } = firstItem(game, LINE_ANSWER_STYLE.BUILD);
  const fraction = game.submit([{ attemptId: nextId(), questionIndex: index, kind: LINE_ATTEMPT_KIND.EQUATION, fields: { A: '1/2', B: '1', C: '3' } }]);
  assert.equal(fraction.verdicts[0].verdict, LINE_VERDICT.FORM);
  assert.equal(fraction.recorded, 0);
  const doubled = { A: String(2 * item.line.a), B: String(2 * item.line.b), C: String(2 * item.line.c) };
  const right = game.submit([{ attemptId: nextId(), questionIndex: index, kind: LINE_ATTEMPT_KIND.EQUATION, fields: doubled }]);
  assert.equal(right.verdicts[0].verdict, LINE_VERDICT.CORRECT);
  const [receipt] = Object.values(right.receipts).filter((entry) => entry.isCorrect);
  assert.deepEqual(Object.keys(receipt.fields).sort(), ['A', 'B', 'C']);
});

test('show your method: the right line past the key points is neither credit nor a miss', () => {
  const game = gameFor({ itemTypes: ['graph'], forms: ['slopeIntercept'], difficulty: 'easy', showMethod: true });
  const item = game.itemAt(0, 0);
  assert.equal(item.anchors.length, 1);
  const elsewhere = latticePointsInView(item.line, item.view)
    .filter((point) => !(point.x === item.anchors[0].x && point.y === item.anchors[0].y))
    .slice(0, 2);
  const method = game.submit([{ attemptId: nextId(), questionIndex: 0, kind: LINE_ATTEMPT_KIND.LINE, points: elsewhere }]);
  assert.equal(method.verdicts[0].verdict, LINE_VERDICT.METHOD);
  assert.equal(method.recorded, 0);
  assert.equal(game.state().cursorMisses, 0);
  assert.equal(game.submit([rightAttempt(item, 0)]).verdicts[0].verdict, LINE_VERDICT.CORRECT);
});

test('a retry replays; early, late, malformed and mismatched attempts record nothing', () => {
  const game = gameFor({ itemTypes: ['graph'] });
  const item = game.itemAt(0, 0);
  const wrong = wrongLineAttempt(item, 0);
  const first = game.submit([wrong]);
  const replay = game.submit([wrong]);
  assert.equal(replay.verdicts[0].replay, true);
  assert.equal(replay.verdicts[0].verdict, first.verdicts[0].verdict);
  assert.equal(replay.verdicts[0].diagnosis, first.verdicts[0].diagnosis);
  assert.equal(replay.recorded, 0);

  const early = game.submit([rightAttempt(game.itemAt(0, 2), 2)]);
  assert.equal(early.verdicts[0].verdict, LINE_VERDICT.OUT_OF_ORDER);
  const choiceForLine = game.submit([{ attemptId: nextId(), questionIndex: 0, kind: LINE_ATTEMPT_KIND.CHOICE, choice: 'a' }]);
  assert.equal(choiceForLine.verdicts[0].verdict, LINE_VERDICT.INVALID, 'an option for a graph item');
  const beyond = game.submit([{ ...rightAttempt(item, 0), questionIndex: game.poolSize }]);
  assert.equal(beyond.verdicts[0].verdict, LINE_VERDICT.INVALID, 'past the end of the Sprint');
  const malformed = [
    { attemptId: 'has spaces', questionIndex: 0, kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    { attemptId: nextId(), questionIndex: -1, kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    { attemptId: nextId(), questionIndex: 0, kind: 'tap' },
    { attemptId: nextId(), questionIndex: 0, kind: 'line', points: [{ x: 0, y: 0 }] },
    { attemptId: nextId(), questionIndex: 0, kind: 'line', points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }] },
    { attemptId: nextId(), questionIndex: 0, kind: 'choice', choice: 'z' },
    { attemptId: nextId(), questionIndex: 0, kind: 'equation', fields: 'm=2' },
  ];
  const outcome = game.submit(malformed);
  assert.deepEqual(outcome.verdicts.map((row) => row.verdict), Array(malformed.length).fill(LINE_VERDICT.INVALID));
  assert.equal(outcome.recorded, 0);
  assert.equal(normalizeLineGraphAttempt({ attemptId: 'ok', questionIndex: 0, kind: 'equation', fields: { m: '2', b: '1', overlong: 'x' } }).fields.overlong, undefined, 'only short field ids');
});

test('a skip ends the item and is recorded as given up', () => {
  const game = gameFor({ itemTypes: ['graph'] });
  const outcome = game.submit([{ attemptId: nextId(), questionIndex: 0, kind: LINE_ATTEMPT_KIND.SKIP }]);
  assert.equal(outcome.verdicts[0].verdict, LINE_VERDICT.SKIPPED);
  const [receipt] = Object.values(outcome.receipts);
  assert.equal(receipt.forfeit, true);
  assert.equal(receipt.isCorrect, false);
  assert.equal(receipt.diagnosis, undefined);
  assert.equal(game.state().cursor, 1);
});

test('a batch is graded in order, one item at a time', () => {
  const game = gameFor({ itemTypes: ['graph'] });
  const batch = [0, 1, 2].map((index) => rightAttempt(game.itemAt(0, index), index));
  const outcome = game.submit(batch);
  assert.deepEqual(outcome.verdicts.map((row) => row.verdict), [LINE_VERDICT.CORRECT, LINE_VERDICT.CORRECT, LINE_VERDICT.CORRECT]);
  assert.equal(outcome.state.cursor, 3);
  const extra = Array.from({ length: LINE_LIMITS.batch + 5 }, () => ({ attemptId: nextId(), questionIndex: 3, kind: 'skip' }));
  assert.equal(game.submit(extra).verdicts.length, LINE_LIMITS.batch, 'a request holds at most one batch');
});

test('claimed times are bounded by what the server saw', () => {
  const game = gameFor({ itemTypes: ['graph'] });
  const early = game.submit([{ ...wrongLineAttempt(game.itemAt(0, 0), 0), clientElapsedMs: 0 }], { elapsedMs: 30_000 });
  const [first] = Object.values(early.receipts);
  assert.equal(first.elapsedMs, 30_000 - LINE_LIMITS.claimWindowMs, 'never earlier than the claim window');
  const late = game.submit([{ ...rightAttempt(game.itemAt(0, 0), 0), clientElapsedMs: 99_999 }], { elapsedMs: 31_000 });
  const second = Object.values(late.receipts).find((receipt) => receipt.isCorrect);
  assert.equal(second.elapsedMs, 31_000, 'never after arrival');
  const backwards = game.submit([{ ...rightAttempt(game.itemAt(0, 1), 1), clientElapsedMs: 1_000 }], { elapsedMs: 32_000 });
  const third = Object.values(backwards.receipts).find((receipt) => receipt.questionIndex === 1);
  assert.ok(third.elapsedMs >= second.elapsedMs, 'never before the previous attempt');
});

test('the record is bounded: per item, per round, per match', () => {
  const game = gameFor({ itemTypes: ['graph'], triesPerItem: 0 });
  const filler = Object.fromEntries(Array.from({ length: LINE_LIMITS.perMatch }, (_, index) => [`old-${index}`, {
    receiptKind: 'targetAttempt', serverConfirmed: true, roundIndex: 7, questionIndex: index, targetCount: 1, isCorrect: true, targetId: 'line', sequence: index + 1,
  }]));
  const full = applyLineGraphAttempts({
    player: { submissionReceipts: filler, attemptSequence: LINE_LIMITS.perMatch },
    roundIndex: 0,
    attempts: [rightAttempt(game.itemAt(0, 0), 0)],
    questionFor: (index) => game.itemAt(0, index),
    config: game.config,
    arrivalElapsedMs: 5_000,
    roundDurationMs: 60_000,
    poolSize: game.poolSize,
  });
  assert.equal(full.verdicts[0].verdict, LINE_VERDICT.LIMIT);
  assert.equal(full.recorded, 0);
});

/*
 * THE ENGINE READS A SPRINT'S LENGTH BACK FROM ITS RECEIPTS. The mode
 * declares the longest Sprint; a room's own length travels on every attempt
 * (roundQuestionCount), so a student who finished their ten is finished, and
 * a round of students who all have is ready to close.
 */

test('a Sprint round is over for a student after its length — the engine agrees', () => {
  const game = gameFor({ itemTypes: ['graph'], sprintLength: 5 });
  assert.equal(game.poolSize, 5);
  for (let index = 0; index < 4; index += 1) game.submit([rightAttempt(game.itemAt(0, index), index)]);
  const specsAfterFour = questionSpecsFromReceipts({ receipts: game.player().submissionReceipts, roundIndex: 0, poolSize: 20 });
  assert.equal(specsAfterFour.length, 5, 'five items, not the mode\'s twenty');
  assert.equal(summarizeRoundProgress({ receipts: game.player().submissionReceipts, roundIndex: 0, questionSpecs: specsAfterFour }).finished, false);
  game.submit([{ attemptId: nextId(), questionIndex: 4, kind: 'skip' }]);
  const receipts = game.player().submissionReceipts;
  const specs = questionSpecsFromReceipts({ receipts, roundIndex: 0, poolSize: 20 });
  assert.equal(summarizeRoundProgress({ receipts, roundIndex: 0, questionSpecs: specs }).finished, true);
  assert.equal(game.state().finished, true);
  // Nothing past the end.
  assert.equal(game.submit([rightAttempt(game.itemAt(0, 5), 5)]).verdicts[0].verdict, LINE_VERDICT.INVALID);
  // Another round, or another player, is unaffected.
  assert.equal(questionSpecsFromReceipts({ receipts, roundIndex: 1, poolSize: 20 }).length, 20);
  assert.equal(questionSpecsFromReceipts({ receipts: {}, roundIndex: 0, poolSize: 20 }).length, 20);
});

test('receipts without a recorded length keep the mode\'s pool (Graph Feature Rush is unchanged)', () => {
  const rushReceipts = {
    a: { receiptKind: 'targetAttempt', serverConfirmed: true, roundIndex: 0, questionIndex: 0, targetCount: 2, isCorrect: true, targetId: 'x', sequence: 1 },
  };
  const specs = questionSpecsFromReceipts({ receipts: rushReceipts, roundIndex: 0, poolSize: 150 });
  assert.equal(specs.length, 150);
  assert.equal(specs[0].targetCount, 2);
  const summary = questionSetMatchSummary({ submissionReceipts: rushReceipts });
  assert.deepEqual(summary.byTag, {});
  assert.deepEqual(summary.mistakes, {});
  assert.deepEqual(summary.byFeature, {});
});

test('a Classic round is one item; a Rush round more than anyone finishes', () => {
  assert.equal(gameFor({}, { format: CLASSIC }).poolSize, 1);
  const classic = gameFor({ itemTypes: ['graph'] }, { format: CLASSIC });
  classic.submit([rightAttempt(classic.itemAt(0, 0), 0)]);
  assert.equal(classic.state().finished, true);
  assert.equal(gameFor({}, { format: RUSH }).poolSize, 150);
});

test('the match summary and the teacher\'s report break the game down by form, item type and mistake', () => {
  const game = gameFor({ presetId: 'graphAndName', triesPerItem: 2 });
  for (let index = 0; index < 8; index += 1) {
    const item = game.itemAt(0, index);
    if (item.answerStyle === LINE_ANSWER_STYLE.GRAPH && index % 2 === 0) {
      game.submit([wrongLineAttempt(item, index, 0)]);
    }
    game.submit([rightAttempt(item, index)]);
  }
  const summary = questionSetMatchSummary(game.player());
  assert.equal(summary.questions, 8);
  assert.equal(summary.completed, 8);
  const formItems = Object.values(summary.byTag.form).reduce((sum, bucket) => sum + bucket.questions, 0);
  assert.equal(formItems, 8);
  assert.ok(summary.byTag.itemType.graph.questions >= 1);
  const misses = Object.values(summary.mistakes).reduce((sum, count) => sum + count, 0);
  assert.equal(misses, summary.attempts - summary.hits, 'every miss has its mistake counted');

  const report = buildLineGraphReport({ standings: [{ studentId: 'ana', alias: 'Comet', joined: true, rank: 1, score: 12, questionSetSummary: summary }] });
  assert.equal(report.itemsCompleted, 8);
  assert.ok(report.byForm.every((row) => typeof row.label === 'string' && !row.label.includes('undefined')));
  assert.ok(report.byForm.some((row) => /form/.test(row.label)));
  assert.ok(report.mistakes.every((row) => row.label && row.count >= 1));
  assert.equal(report.players[0].itemsCompleted, 8);
  assert.equal(report.players[0].topMistake, report.mistakes[0]?.label ?? null);
});

test('player totals: a placement strategy\'s score moves only at a close', () => {
  const game = gameFor({ itemTypes: ['graph'] }, { strategy: correctCount });
  game.submit([rightAttempt(game.itemAt(0, 0), 0)]);
  const counted = lineGraphPlayerTotals({ player: game.player(), receipts: game.player().submissionReceipts, strategy: correctCount });
  assert.equal(counted.correctCount, 1);
  assert.equal(counted.score, counted.rawScore);
  const placed = lineGraphPlayerTotals({ player: { score: 24 }, receipts: game.player().submissionReceipts, strategy: grandPrix });
  assert.equal(placed.score, 24);
  assert.equal(placed.matchAccuracy, 1);
});

/*
 * THE PRIVATE RECORD IS ONE DOCUMENT (Firestore: 1 MiB). The largest receipt
 * this mode writes, times the match limit, must stay well under it — the
 * rush's budget is about 800 KiB.
 */

// Firestore's storage size: strings are their UTF-8 bytes + 1, numbers 8,
// booleans and null 1, maps and arrays the sum of their parts (+ names).
const storedSize = (value) => {
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8') + 1;
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + storedSize(entry), 0);
  return Object.entries(value).reduce((sum, [name, entry]) => sum + Buffer.byteLength(name, 'utf8') + 1 + storedSize(entry), 0);
};

test('the largest receipts this mode writes fit the match limit in one document', () => {
  const game = gameFor({ itemTypes: ['name'], nameStyle: 'build', forms: ['pointSlope'] });
  const { item, index } = firstItem(game, LINE_ANSWER_STYLE.BUILD);
  const longId = 'x'.repeat(40);
  // Every box at its 16-character limit, still a readable (wrong) answer.
  const outcome = game.submit([{
    attemptId: longId,
    questionIndex: index,
    kind: LINE_ATTEMPT_KIND.EQUATION,
    fields: { x1: '-123456 /-123456', y1: '-123456 /-123455', m: '-123456 /-123457' },
  }]);
  assert.equal(outcome.recorded, 1, JSON.stringify(outcome.verdicts));
  const receipt = outcome.receipts[longId];
  const biggest = storedSize({ [longId]: receipt });
  assert.ok(biggest * LINE_LIMITS.perMatch < 800 * 1024, `${biggest} bytes × ${LINE_LIMITS.perMatch} receipts fits the 800 KiB budget`);
  // A longer id than a device ever sends is refused, not stored.
  const overlong = game.submit([{ attemptId: 'y'.repeat(41), questionIndex: index, kind: LINE_ATTEMPT_KIND.SKIP }]);
  assert.equal(overlong.verdicts[0].verdict, LINE_VERDICT.INVALID);
  assert.ok(item);
});

test('boxes whose numbers are too large together are a writing problem, never a crash', () => {
  const game = gameFor({ itemTypes: ['name'], nameStyle: 'build', forms: ['pointSlope'] });
  const { index } = firstItem(game, LINE_ANSWER_STYLE.BUILD);
  const outcome = game.submit([{
    attemptId: nextId(),
    questionIndex: index,
    kind: LINE_ATTEMPT_KIND.EQUATION,
    fields: { x1: '-123456/123455', y1: '-123456/123457', m: '-999999.9999' },
  }]);
  assert.equal(outcome.verdicts[0].verdict, LINE_VERDICT.FORM);
  assert.equal(outcome.recorded, 0);
});

/*
 * FAIRNESS: READING THE EQUATION BEATS GUESSING.
 *
 * Simulated 60-second Rush rounds through the real pipeline. The careful
 * student takes six seconds a line and slips one time in ten (fixing it on
 * the next try). The guesser places the right starting point — the easy
 * part — and tries slopes students commonly use until one works or the tries
 * run out, a second and a half each, with the device's pause after repeated
 * misses. The sprayer draws two random grid points. Work is the engine's:
 * lines completed, less a twentieth per miss.
 */

const GUESS_SLOPES = [1, -1, 2, -2, 3, -3, Q.rat(1, 2), Q.rat(-1, 2), Q.rat(1, 3), Q.rat(-1, 3), Q.rat(2, 3), Q.rat(-2, 3), Q.rat(3, 2), Q.rat(-3, 2)];

const simulate = (behaviour, { seed, tries = 3 }) => {
  const game = gameFor({ itemTypes: ['graph'], forms: ['slopeIntercept', 'pointSlope', 'standard'], triesPerItem: tries }, { format: RUSH, seed, studentKey: behaviour });
  const rng = createRng(`${seed}|${behaviour}`);
  let clock = 0;
  let consecutive = 0;
  const limit = 60_000;
  while (clock < limit) {
    const { cursor } = game.state();
    const item = game.itemAt(0, cursor);
    let attempt;
    if (behaviour === 'careful') {
      clock += 6_000;
      attempt = rng.chance(0.1) && consecutive === 0 ? wrongLineAttempt(item, cursor, rng.int(0, 9)) : rightAttempt(item, cursor);
    } else if (behaviour === 'guesser') {
      clock += 1_500;
      const start = item.anchors.length ? item.anchors[0] : latticePointsInView(item.line, item.view, { inset: 2 })[0];
      const slope = Q.toRational(rng.pick(GUESS_SLOPES));
      const end = { x: start.x + slope.d, y: start.y + slope.n };
      attempt = { attemptId: nextId(), questionIndex: cursor, kind: LINE_ATTEMPT_KIND.LINE, points: [start, end] };
    } else {
      clock += 1_200;
      const p = { x: rng.int(-8, 8), y: rng.int(-8, 8) };
      const q = { x: rng.int(-8, 8), y: rng.int(-8, 8) };
      attempt = { attemptId: nextId(), questionIndex: cursor, kind: LINE_ATTEMPT_KIND.LINE, points: [p, q] };
    }
    if (clock > limit) break;
    const [row] = game.submit([attempt], { elapsedMs: clock }).verdicts;
    if (row.verdict === LINE_VERDICT.INCORRECT) {
      consecutive = row.revealed ? 0 : consecutive + 1;
      clock += lineLockoutMs(consecutive);
    } else if (row.verdict === LINE_VERDICT.CORRECT) {
      consecutive = 0;
    }
  }
  const receipts = game.player().submissionReceipts;
  const specs = questionSpecsFromReceipts({ receipts, roundIndex: 0, poolSize: 150 });
  const summary = summarizeRoundProgress({ receipts, roundIndex: 0, questionSpecs: specs });
  return { work: questionSetWorkScore(summary), completed: summary.questionsCorrect, accuracy: summary.accuracy ?? 0 };
};

test('reading the equation beats guessing slopes and spraying points', () => {
  const mean = (behaviour, tries) => {
    const runs = Array.from({ length: 12 }, (_, index) => simulate(behaviour, { seed: `fair-${index}`, tries }));
    return {
      work: runs.reduce((sum, run) => sum + run.work, 0) / runs.length,
      accuracy: runs.reduce((sum, run) => sum + run.accuracy, 0) / runs.length,
    };
  };
  for (const tries of [3, 0]) {
    const careful = mean('careful', tries);
    const guesser = mean('guesser', tries);
    const sprayer = mean('sprayer', tries);
    assert.ok(careful.work >= 8, `careful: ${careful.work}`);
    assert.ok(careful.work > 2 * guesser.work, `tries ${tries}: careful ${careful.work.toFixed(2)} vs guesser ${guesser.work.toFixed(2)}`);
    assert.ok(sprayer.work < 0.5, `tries ${tries}: sprayer ${sprayer.work.toFixed(2)}`);
    assert.ok(guesser.accuracy < careful.accuracy / 2, 'the report shows who guessed');
  }
});
