import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TOLERANCE_FRACTION,
  MIN_TOLERANCE_FRACTION,
  POINTER_RADIUS_PX,
  TAP_RESULT,
  clampTolerance,
  resolveTap,
  toleranceForPointer,
} from '../../functions/shared/graphFeatureHitTest.mjs';
import {
  RUSH_AUTO_SKIP_MISSES,
  RUSH_LIMITS,
  RUSH_VERDICT,
  applyRushAttempts,
  autoSkipAttemptId,
  rushLockoutMs,
  rushPlayerTotals,
  rushRoundState,
} from '../../functions/shared/graphFeatureRush.mjs';
import { correctCountStrategy, grandPrixStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { generateRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';

/*
 * TAP -> FEEDBACK -> TAP -> COMPLETE -> NEXT GRAPH.
 *
 * The device grades every tap the instant it happens; the server grades it
 * again from its own copy of the question and alone decides what counts.
 * These tests hold both halves: the hit test is forgiving by screen pixels
 * and strict about random tapping, and a batch of taps becomes exactly the
 * receipts — and exactly one completion per graph — that the rules say.
 */

const VIEW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 2, yStep: 2 });
const ZEROS = Object.freeze([{ id: 'x1', x: -4, y: 0 }, { id: 'x2', x: 1, y: 0 }, { id: 'x3', x: 5, y: 0 }]);

// Pixels per graph unit for a square plot of `size` CSS pixels on VIEW.
const scaleFor = (size) => ({ pxPerUnitX: size / 20, pxPerUnitY: size / 20 });

test('a tap a few pixels off a target is that target, on every device', () => {
  for (const [device, size, pointer] of [
    ['narrow phone', 300, 'touch'],
    ['phone', 360, 'touch'],
    ['iPad', 700, 'touch'],
    ['Chromebook touchpad', 560, 'mouse'],
    ['wide desktop', 820, 'mouse'],
  ]) {
    const tolerance = toleranceForPointer({ pointer, ...scaleFor(size), view: VIEW });
    const unitsPerPx = 20 / size;
    // Two pixels off, diagonally: always a hit.
    const near = resolveTap({ targets: ZEROS, tap: { x: 1 + 2 * unitsPerPx, y: 2 * unitsPerPx }, tolerance, view: VIEW });
    assert.deepEqual([near.result, near.targetId], [TAP_RESULT.HIT, 'x2'], device);
    // Most of a fingertip away (80% of the radius) still finds it.
    const radiusPx = Math.min(POINTER_RADIUS_PX[pointer], MAX_TOLERANCE_FRACTION * size);
    assert.equal(resolveTap({ targets: ZEROS, tap: { x: 1 + 0.8 * radiusPx * unitsPerPx, y: 0 }, tolerance, view: VIEW }).result, TAP_RESULT.HIT, device);
    // Twice the radius away is a miss.
    assert.equal(resolveTap({ targets: ZEROS, tap: { x: 1, y: 2 * radiusPx * unitsPerPx }, tolerance, view: VIEW }).result, TAP_RESULT.MISS, device);
  }
});

test('tolerance is clamped into a band no device can widen or shrink past', () => {
  const huge = clampTolerance({ x: 9, y: 9 }, VIEW);
  assert.deepEqual(huge, { x: MAX_TOLERANCE_FRACTION * 20, y: MAX_TOLERANCE_FRACTION * 20 }, 'a device claiming giant pixels gets the cap');
  const tiny = clampTolerance({ x: 0, y: -1 }, VIEW);
  assert.deepEqual(tiny, { x: MIN_TOLERANCE_FRACTION * 20, y: MIN_TOLERANCE_FRACTION * 20 }, 'and a device claiming none gets the floor');
  const missing = clampTolerance({}, VIEW);
  assert.equal(missing.x, MAX_TOLERANCE_FRACTION * 20, 'an absent tolerance is not zero');
  // Different axis scales get different graph-unit tolerances, one screen circle.
  const stretched = toleranceForPointer({ pointer: 'mouse', pxPerUnitX: 30, pxPerUnitY: 15, view: { xMin: -10, xMax: 10, yMin: -20, yMax: 20 } });
  assert.ok(Math.abs(stretched.y / stretched.x - 2) < 1e-9);
});

test('a tap resolves to the nearest target, and a found one is neither credit nor penalty', () => {
  const tolerance = { x: 1.4, y: 1.4 };
  assert.equal(resolveTap({ targets: ZEROS, tap: { x: -3.2, y: 0.3 }, tolerance, view: VIEW }).targetId, 'x1');
  const between = resolveTap({ targets: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }], tap: { x: 1.2, y: 0 }, tolerance, view: VIEW });
  assert.equal(between.targetId, 'b', 'the closer target wins');
  const again = resolveTap({ targets: ZEROS, found: ['x1'], tap: { x: -4, y: 0 }, tolerance, view: VIEW });
  assert.deepEqual([again.result, again.targetId], [TAP_RESULT.ALREADY_FOUND, 'x1']);
  assert.equal(resolveTap({ targets: [], tap: { x: 0, y: 0 }, tolerance, view: VIEW }).result, TAP_RESULT.MISS, 'nothing to find on a "does not exist" graph');
  assert.equal(resolveTap({ targets: ZEROS, tap: { x: 'left', y: 0 }, tolerance, view: VIEW }).result, TAP_RESULT.MISS);
});

test('random tapping is hopeless even at the widest tolerance', () => {
  // Over real generated questions, a uniformly random tap at the maximum
  // tolerance finds a target well under one time in twenty.
  const config = { families: ['linear', 'quadratic', 'absolute', 'cubic'], features: ['xIntercept', 'yIntercept', 'vertex', 'maximum', 'minimum'], difficulty: 'standard' };
  let taps = 0;
  let hits = 0;
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let questionIndex = 0; questionIndex < 60; questionIndex += 1) {
    const question = generateRushQuestion({ seed: 'random', studentKey: 'bot', roundIndex: 0, questionIndex, config });
    const tolerance = clampTolerance({ x: 99, y: 99 }, question.view);
    for (let tap = 0; tap < 200; tap += 1) {
      const x = question.view.xMin + random() * (question.view.xMax - question.view.xMin);
      const y = question.view.yMin + random() * (question.view.yMax - question.view.yMin);
      taps += 1;
      if (resolveTap({ targets: question.targets, tap: { x, y }, tolerance, view: question.view }).result === TAP_RESULT.HIT) hits += 1;
    }
  }
  assert.ok(hits / taps < 0.05, `random hit rate ${(hits / taps).toFixed(4)}`);
});

/* ------------------------------ the pipeline ------------------------------ */

const question = (overrides = {}) => ({
  questionIndex: 0, feature: 'xIntercept', family: 'cubic', tier: 'standard', view: VIEW, targets: ZEROS, targetCount: 3, ...overrides,
});
const tap = (attemptId, questionIndex, x, y = 0, extra = {}) => ({
  attemptId, questionIndex, kind: 'tap', x, y, tolerance: { x: 0.8, y: 0.8 }, pointer: 'touch', clientElapsedMs: 5_000, ...extra,
});
const press = (attemptId, questionIndex, kind, extra = {}) => ({ attemptId, questionIndex, kind, clientElapsedMs: 5_000, ...extra });

const play = (player, attempts, { questions = [question()], strategy = correctCountStrategy, arrivalElapsedMs = 20_000 } = {}) => applyRushAttempts({
  player,
  roundIndex: 0,
  roundVersion: 1,
  attempts,
  questionFor: (index) => questions[index] || null,
  arrivedAtMs: 1_000_000,
  arrivalElapsedMs,
  roundDurationMs: 60_000,
  strategy,
  poolSize: 50,
});

const carry = (player, outcome) => ({ ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence });

test('find all the zeros: right, wrong, right, right completes the graph exactly once', () => {
  const outcome = play({}, [tap('a', 0, -4), tap('b', 0, 3), tap('c', 0, 1), tap('d', 0, 5)]);
  assert.deepEqual(outcome.verdicts.map((row) => row.verdict), ['hit', 'miss', 'hit', 'hit']);
  assert.deepEqual(outcome.verdicts.map((row) => row.completesQuestion), [false, false, false, true]);
  assert.equal(outcome.recorded, 4, 'attempts are recorded separately from completion');
  assert.equal(outcome.completed, 1);
  assert.equal(outcome.state.cursor, 1, 'on to the next graph');
  assert.equal(outcome.state.questionsCorrect, 1);
  assert.equal(outcome.state.attempts, 4);
  assert.equal(outcome.state.hits, 3);
  const completing = Object.values(outcome.receipts).filter((receipt) => receipt.completesQuestion);
  assert.equal(completing.length, 1);
  assert.equal(completing[0].pointsAwarded, 1);
  assert.equal(completing[0].receiptKind, 'targetAttempt');
  assert.equal(completing[0].targetCount, 3);
  assert.equal(completing[0].feature, 'xIntercept', 'the receipt says what was asked, for the report');
});

test('a found target tapped again, or a retried request, changes nothing', () => {
  const first = play({}, [tap('a', 0, -4)]);
  const player = carry({}, first);
  const again = play(player, [tap('b', 0, -4.1)]);
  assert.equal(again.verdicts[0].verdict, RUSH_VERDICT.ALREADY_FOUND);
  assert.equal(again.recorded, 0, 'not an attempt: no receipt, no penalty');
  const replay = play(player, [tap('a', 0, -4)]);
  assert.equal(replay.verdicts[0].verdict, RUSH_VERDICT.HIT);
  assert.equal(replay.verdicts[0].replay, true);
  assert.equal(replay.recorded, 0, 'the same attempt id is a replay, never a second attempt');
  assert.deepEqual(replay.receipts, first.receipts);
});

test('two last taps racing in one batch complete the graph once', () => {
  const player = carry({}, play({}, [tap('a', 0, -4), tap('b', 0, 1)]));
  const race = play(player, [tap('c', 0, 5), tap('d', 0, 5.1), tap('e', 0, 2)]);
  assert.deepEqual(race.verdicts.map((row) => row.verdict), ['hit', 'resolved', 'resolved']);
  assert.equal(race.completed, 1);
  assert.equal(Object.values(race.receipts).filter((receipt) => receipt.completesQuestion).length, 1);
});

test('"Does Not Exist" completes a graph that has none, and is a miss on one that does', () => {
  const none = question({ targets: [], targetCount: 1, feature: 'maximum', family: 'linear' });
  const wrong = play({}, [press('a', 0, 'dne')], { questions: [question()] });
  assert.equal(wrong.verdicts[0].verdict, RUSH_VERDICT.MISS);
  assert.equal(wrong.state.cursor, 0, 'still on the graph');
  const right = play({}, [press('a', 0, 'dne')], { questions: [none] });
  assert.deepEqual([right.verdicts[0].verdict, right.verdicts[0].completesQuestion, right.verdicts[0].targetId], [RUSH_VERDICT.HIT, true, 'dne']);
  assert.equal(right.state.cursor, 1);
  // Tapping the graph of a question whose answer is "does not exist" finds nothing.
  assert.equal(play({}, [tap('t', 0, 1)], { questions: [none] }).verdicts[0].verdict, RUSH_VERDICT.MISS);
  const dneReceipt = Object.values(right.receipts)[0];
  assert.equal(dneReceipt.attemptKind, 'dne');
});

test('a skipped graph is given up: done, not correct, partial targets kept', () => {
  const player = carry({}, play({}, [tap('a', 0, -4)]));
  const skipped = play(player, [press('s', 0, 'skip'), tap('late', 0, 1)], { questions: [question(), question({ questionIndex: 1 })] });
  assert.deepEqual(skipped.verdicts.map((row) => row.verdict), [RUSH_VERDICT.SKIPPED, RUSH_VERDICT.RESOLVED]);
  assert.equal(skipped.state.cursor, 1);
  assert.equal(skipped.state.questionsCorrect, 0);
  assert.equal(skipped.state.skipped, 1);
  assert.equal(skipped.state.attempts, 2, 'the skip counts against accuracy');
  assert.ok(Math.abs(skipped.state.scoreTotal - 1 / 3) < 1e-9, 'the zero found before skipping still counts');
});

test('attempts for a graph the server has not reached are refused, not recorded', () => {
  const outcome = play({}, [tap('a', 1, 0)], { questions: [question(), question({ questionIndex: 1 })] });
  assert.equal(outcome.verdicts[0].verdict, RUSH_VERDICT.OUT_OF_ORDER);
  assert.equal(outcome.recorded, 0);
  assert.equal(play({}, [{ attemptId: '', questionIndex: 0, kind: 'tap', x: 1, y: 0 }]).verdicts[0].verdict, RUSH_VERDICT.INVALID);
  assert.equal(play({}, [{ attemptId: 'x', questionIndex: 0, kind: 'teleport' }]).verdicts[0].verdict, RUSH_VERDICT.INVALID);
  assert.equal(play({}, [{ attemptId: 'x', questionIndex: 0, kind: 'tap', x: 'NaN' }]).verdicts[0].verdict, RUSH_VERDICT.INVALID);
  assert.equal(play({}, [tap('a', 0, 1)], { questions: [] }).verdicts[0].verdict, RUSH_VERDICT.INVALID, 'no question, no grading');
});

test('spraying one graph ends in its automatic skip, recorded by the server', () => {
  // The eighth miss on a graph skips it, in the same transaction: a device
  // that never sends the skip still moves on, and a refresh resumes on the
  // next graph.
  const spray = Array.from({ length: RUSH_LIMITS.batch }, (_, index) => tap(`spray-${index}`, 0, 8, 8));
  const graphs = [question(), question({ questionIndex: 1 })];
  const sprayed = play({}, spray, { questions: graphs });
  const verdicts = sprayed.verdicts.map((row) => row.verdict);
  assert.deepEqual(verdicts.slice(0, RUSH_AUTO_SKIP_MISSES), Array(RUSH_AUTO_SKIP_MISSES).fill(RUSH_VERDICT.MISS));
  assert.equal(sprayed.verdicts.findIndex((row) => row.autoSkipped === true), RUSH_AUTO_SKIP_MISSES - 1, 'the eighth miss skips the graph');
  assert.ok(verdicts.slice(RUSH_AUTO_SKIP_MISSES).every((verdict) => verdict === RUSH_VERDICT.RESOLVED), 'taps after it change nothing');
  assert.equal(sprayed.state.cursor, 1);
  assert.equal(sprayed.state.skipped, 1);
  assert.equal(sprayed.state.attempts, RUSH_AUTO_SKIP_MISSES + 1, 'the misses, and the one skip');
  const skip = sprayed.receipts[autoSkipAttemptId(`spray-${RUSH_AUTO_SKIP_MISSES - 1}`)];
  assert.deepEqual([skip.forfeit, skip.automatic, skip.attemptKind, skip.isCorrect], [true, true, 'skip', false]);
  // Retried, the eighth miss reports the skip again and records nothing.
  const replay = play(carry({}, sprayed), [spray[RUSH_AUTO_SKIP_MISSES - 1]], { questions: graphs });
  assert.deepEqual([replay.verdicts[0].verdict, replay.verdicts[0].autoSkipped, replay.recorded], [RUSH_VERDICT.MISS, true, 0]);
  // Seven misses and a hit: no skip.
  const close = play({}, [...spray.slice(0, RUSH_AUTO_SKIP_MISSES - 1), tap('found', 0, -4)], { questions: graphs });
  assert.ok(close.verdicts.every((row) => row.autoSkipped !== true));
  assert.equal(close.state.cursor, 0);
  // A device's attempt ids cannot take the server's own.
  assert.equal(play({}, [tap('a~auto-skip', 0, -4)]).verdicts[0].verdict, RUSH_VERDICT.INVALID);
});

test('the per-graph and per-round limits bound the private record', () => {
  // Per graph: a backstop behind the automatic skip, which no live graph
  // reaches (at most 19 hits and 8 misses before it completes or is skipped).
  // A record that holds the limit already — written under older rules —
  // takes no more.
  const legacy = Object.fromEntries(Array.from({ length: RUSH_LIMITS.perQuestion }, (_, index) => [`old-${index}`, {
    receiptKind: 'targetAttempt', roundIndex: 0, roundVersion: 1, questionIndex: 0, targetId: 'miss', targetCount: 3,
    isCorrect: false, completesQuestion: false, sequence: index + 1, elapsedMs: 1_000, serverConfirmed: true,
  }]));
  const full = { submissionReceipts: legacy, attemptSequence: RUSH_LIMITS.perQuestion };
  assert.equal(rushRoundState({ receipts: legacy, roundIndex: 0, poolSize: 50 }).cursor, 0);
  const more = play(full, [tap('one-more', 0, -4)]);
  assert.deepEqual([more.verdicts[0].verdict, more.recorded], [RUSH_VERDICT.LIMIT, 0]);
  // Per round: graph after graph of misses stops at the round's limit.
  const pool = Array.from({ length: 50 }, (_, index) => question({ questionIndex: index }));
  let player = {};
  let limited = 0;
  for (let graph = 0; graph < 50 && !limited; graph += 1) {
    const outcome = play(player, Array.from({ length: RUSH_AUTO_SKIP_MISSES }, (_, index) => tap(`g${graph}-${index}`, graph, 8, 8)), { questions: pool });
    player = carry(player, outcome);
    limited = outcome.verdicts.filter((row) => row.verdict === RUSH_VERDICT.LIMIT).length;
  }
  assert.ok(limited > 0, 'the round limit is reached');
  assert.equal(rushRoundState({ receipts: player.submissionReceipts, roundIndex: 0, poolSize: 50 }).attempts, RUSH_LIMITS.perRound);
  assert.equal(play({}, Array.from({ length: 40 }, (_, index) => tap(`b${index}`, 0, 8, 8))).verdicts.length, RUSH_LIMITS.batch, 'one request carries at most a batch');
});

test('attempt times are server-bounded: never after arrival, never backwards', () => {
  const outcome = play({}, [
    tap('a', 0, -4, 0, { clientElapsedMs: 99_999 }),
    tap('b', 0, 3, 0, { clientElapsedMs: 100 }),
    tap('c', 0, 1, 0, { clientElapsedMs: 16_000 }),
  ], { arrivalElapsedMs: 20_000 });
  const times = ['a', 'b', 'c'].map((id) => outcome.receipts[id].elapsedMs);
  assert.equal(times[0], 20_000, 'a claim from the future is capped at arrival');
  assert.equal(times[1], 20_000, 'a claim earlier than the previous attempt is lifted to it');
  assert.ok(times.every((value, index) => index === 0 || value >= times[index - 1]));
  const old = play({}, [tap('z', 0, -4, 0, { clientElapsedMs: 0 })], { arrivalElapsedMs: 20_000 });
  assert.equal(old.receipts.z.elapsedMs, 20_000 - RUSH_LIMITS.claimWindowMs, 'no claim older than the window');
});

test('Correct Count banks one point per completed graph; Grand Prix waits for placement', () => {
  const graphs = [question(), question({ questionIndex: 1, targets: [{ id: 'v', x: 2, y: 3 }], targetCount: 1, feature: 'vertex', family: 'quadratic' })];
  const run = (strategy) => play({}, [tap('a', 0, -4), tap('b', 0, 1), tap('c', 0, 5), tap('d', 1, 2, 3)], { questions: graphs, strategy });
  const count = run(correctCountStrategy);
  assert.deepEqual([count.totals.score, count.totals.rawScore, count.totals.correctCount], [2, 2, 2]);
  const prix = run(grandPrixStrategy);
  assert.deepEqual([prix.totals.score, prix.totals.rawScore, prix.totals.correctCount], [0, 2, 2], 'a placement score changes only at round close');
  assert.equal(prix.totals.matchAccuracy, 1);
  assert.deepEqual(prix.totals.answeredRounds, [0]);
  const totals = rushPlayerTotals({ player: { score: 24 }, receipts: prix.receipts, strategy: grandPrixStrategy });
  assert.equal(totals.score, 24, 'the championship total is kept as it was');
});

test('the cooldown: a mistake is free, a spray gets slower and slower', () => {
  assert.deepEqual([0, 1].map(rushLockoutMs), [0, 0], 'one wrong tap costs nothing');
  const schedule = [2, 3, 4, 5, 6, 10, 40].map(rushLockoutMs);
  assert.ok(schedule[0] > 0 && schedule[0] <= 1_000, 'a second in a row costs a moment');
  assert.ok(schedule.every((value, index) => index === 0 || value >= schedule[index - 1]), 'never shrinks while the misses continue');
  assert.ok(schedule[schedule.length - 1] <= 3_000, 'and is never a punishment that ends the round');
});
