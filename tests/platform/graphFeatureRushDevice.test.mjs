import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateGraph } from '../../functions/shared/graphFeatureCurves.mjs';
import { generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { MAX_TOLERANCE_FRACTION, POINTER_RADIUS_PX, clampTolerance } from '../../functions/shared/graphFeatureHitTest.mjs';
import { applyRushAttempts, normalizeRushAttempt } from '../../functions/shared/graphFeatureRush.mjs';
import { normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import {
  RUSH_AUTO_SKIP_MISSES,
  RUSH_COMPLETE_FLASH_MS,
  RUSH_LIMITS,
  RUSH_LOCKOUT,
  RUSH_MODE_ID,
  RUSH_SKIP_PAUSE_MS,
} from '../../functions/shared/graphFeatureRushRules.mjs';
import { CHALLENGE_MODE_ID } from '../../functions/shared/liveChallengeModes.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import {
  KEYBOARD_STEP,
  axisLabels,
  curvePaths,
  describeCursor,
  formatCoordinate,
  formatPoint,
  graphDrawing,
  graphPointAt,
  gridLines,
  initialCursor,
  moveCursor,
  pointerKindOf,
  tapPoint,
  tapTolerance,
  unitX,
  unitY,
} from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  RUSH_FEEDBACK,
  RUSH_INPUT,
  RUSH_PREFETCH,
  acknowledge,
  createRushSession,
  currentQuestion,
  differsFromServer,
  effectiveCursor,
  feedbackMessage,
  inputState,
  newAttemptId,
  nextBatch,
  parseStoredQueue,
  prefetchRequest,
  recordDoesNotExist,
  recordSkip,
  recordTap,
  settle,
  withQuestions,
} from '../../src/platform/liveChallenge/rushSession.js';

/*
 * THE STUDENT'S DEVICE: WHAT IT DRAWS, AND WHAT IT BELIEVES.
 *
 * The device answers every tap at once, before the server has seen it. That
 * is only honest if the device and the server grade alike — so the central
 * test here plays thousands of random taps through BOTH and requires them to
 * agree at every step, including after the device's batches arrive in pieces.
 */

const VIEW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 2, yStep: 2 });

/* ------------------------------- drawing --------------------------------- */

test('screen and graph coordinates convert both ways on a square plot', () => {
  assert.equal(unitX(VIEW, -10), 0);
  assert.equal(unitX(VIEW, 10), 1);
  assert.equal(unitY(VIEW, 10), 0, 'graph y grows up; screen v grows down');
  assert.equal(unitY(VIEW, -10), 1);
  assert.deepEqual(graphPointAt(VIEW, 0.5, 0.5), { x: 0, y: 0 });
  const rect = { left: 100, top: 40, width: 400, height: 400 };
  assert.deepEqual(tapPoint({ clientX: 300, clientY: 240, rect, view: VIEW }), { x: 0, y: 0 });
  assert.deepEqual(tapPoint({ clientX: 120, clientY: 60, rect, view: VIEW }), { x: -9, y: 9 });
  assert.equal(tapPoint({ clientX: 99, clientY: 240, rect, view: VIEW }), null, 'a tap in the margin is not an answer');
  assert.equal(tapPoint({ clientX: 300, clientY: 441, rect, view: VIEW }), null);
  assert.equal(tapPoint({ clientX: 300, clientY: 240, rect: { left: 0, top: 0, width: 0, height: 0 }, view: VIEW }), null);
});

test('the drawn curve is the graded curve, and never bridges a break', () => {
  const parabola = { kind: 'quadratic', a: 1, h: 1, k: -4 };
  const [path] = curvePaths(parabola, VIEW);
  const points = path.slice(1).split('L').map((pair) => pair.split(' ').map(Number));
  assert.ok(points.length > 50);
  for (const [u, v] of points) {
    const { x, y } = graphPointAt(VIEW, u, v);
    assert.ok(Math.abs(evaluateGraph(parabola, x) - y) < 1e-3, `(${x}, ${y}) is on the parabola`);
  }
  // A rational graph is two pieces, one each side of its asymptote.
  const rational = graphDrawing({ graph: { kind: 'rational', a: 2, h: 3, k: 1 }, view: VIEW });
  assert.equal(rational.paths.length, 2);
  assert.deepEqual(rational.asymptotes, { vertical: [unitX(VIEW, 3)], horizontal: [unitY(VIEW, 1)] });
  // A square root's endpoint is a closed dot; a piecewise jump shows its hole.
  assert.deepEqual(graphDrawing({ graph: { kind: 'squareRoot', a: 1, s: 1, h: -2, k: -1 }, view: VIEW }).dots, [{ u: unitX(VIEW, -2), v: unitY(VIEW, -1), closed: true }]);
  const piecewise = graphDrawing({
    graph: { kind: 'piecewise', pieces: [{ m: 1, b: 0, from: null, to: { x: 2, closed: false } }, { m: 0, b: 5, from: { x: 2, closed: true }, to: null }] },
    view: VIEW,
  });
  assert.equal(piecewise.paths.length, 2, 'no vertical line drawn across the jump');
  assert.deepEqual(piecewise.dots.map((dot) => dot.closed).sort(), [false, true]);
  assert.equal(graphDrawing({ graph: null, view: VIEW }), null);
});

test('grid lines sit on the ticks, axes cross at the origin, labels thin on small screens', () => {
  const grid = gridLines(VIEW);
  assert.deepEqual(grid.verticals.map((line) => line.value), [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]);
  assert.equal(grid.axisU, 0.5);
  assert.equal(grid.axisV, 0.5);
  const tenths = gridLines({ xMin: -1, xMax: 2, yMin: -1, yMax: 2, xStep: 1, yStep: 1 });
  assert.deepEqual(tenths.verticals.map((line) => line.value), [-1, 0, 1, 2], 'no float drift in tick values');
  const wide = axisLabels(VIEW, 600);
  assert.deepEqual(wide.x.map((label) => label.value), [-8, -6, -4, -2, 2, 4, 6, 8], 'every tick but zero and the two at the very edge');
  assert.ok(!wide.x.some((label) => label.value === 0), 'zero is labelled once, at the origin');
  const busy = { xMin: -24, xMax: 24, yMin: -24, yMax: 24, xStep: 2, yStep: 2 };
  const narrow = axisLabels(busy, 300);
  assert.ok(narrow.x.length < axisLabels(busy, 900).x.length, 'a phone shows fewer numbers than a projector');
  assert.ok(narrow.x.every((label) => Math.abs(label.value / 2) % 2 === 0 || Math.abs(label.value / 2) % 5 === 0));
});

test('numbers read the way students write them', () => {
  assert.equal(formatCoordinate(-4), '−4');
  assert.equal(formatCoordinate(2.5), '2.5');
  assert.equal(formatCoordinate(-0), '0');
  assert.equal(formatCoordinate(0.1 + 0.2), '0.3');
  assert.equal(formatPoint({ x: -0.5, y: 3 }), '(−0.5, 3)');
});

test('a fingertip reaches further than a mouse, in screen pixels, on every plot size', () => {
  for (const side of [280, 360, 600, 900]) {
    const rect = { left: 0, top: 0, width: side, height: side };
    const touch = tapTolerance({ pointer: pointerKindOf('touch'), rect, view: VIEW });
    const mouse = tapTolerance({ pointer: pointerKindOf('mouse'), rect, view: VIEW });
    const unitsPerPx = 20 / side;
    assert.ok(touch.x > mouse.x, `${side}px`);
    const expectedTouch = Math.min(POINTER_RADIUS_PX.touch * unitsPerPx, MAX_TOLERANCE_FRACTION * 20);
    assert.ok(Math.abs(touch.x - expectedTouch) < 1e-9, `${side}px touch reach`);
  }
  assert.equal(pointerKindOf('pen'), 'pen');
  assert.equal(pointerKindOf(undefined), 'mouse', 'a touchpad and anything unknown is a mouse');
});

test('the keyboard cursor moves on the half grid, stays in view, and can land on any target', () => {
  const view = { xMin: -6, xMax: 6, yMin: -6, yMax: 6, xStep: 1, yStep: 1 };
  let cursor = initialCursor(view);
  assert.deepEqual(cursor, { x: 0, y: 0 });
  cursor = moveCursor(view, cursor, 'ArrowRight');
  assert.deepEqual(cursor, { x: KEYBOARD_STEP, y: 0 });
  cursor = moveCursor(view, cursor, 'ArrowUp', { large: true });
  assert.deepEqual(cursor, { x: 0.5, y: 1 });
  for (let press = 0; press < 40; press += 1) cursor = moveCursor(view, cursor, 'ArrowLeft');
  assert.deepEqual(cursor, { x: -6, y: 1 }, 'the edge of the view stops it');
  assert.deepEqual(moveCursor(view, cursor, 'Home'), { x: 0, y: 0 });
  assert.equal(moveCursor(view, cursor, 'a'), cursor);
  // Every generated target is on the half grid, so the keyboard can reach it exactly.
  const config = normalizeGraphFeatureRushConfig({ presetId: 'algebra2Challenge' });
  for (let index = 0; index < 40; index += 1) {
    const question = generateRushQuestion({ seed: 'keys', studentKey: 'k', roundIndex: 0, questionIndex: index, config });
    question.targets.forEach((target) => {
      assert.ok(Number.isInteger(target.x / KEYBOARD_STEP), `x ${target.x}`);
      assert.ok(Number.isInteger(target.y / KEYBOARD_STEP), `y ${target.y}`);
    });
  }
  assert.match(describeCursor({ graph: { kind: 'linear', m: 2, b: 1 } }, { x: 1, y: 0 }), /Pointer at \(1, 0\)\. The curve is at y 3\./);
  assert.match(describeCursor({ graph: { kind: 'squareRoot', a: 1, s: 1, h: 2, k: 0 } }, { x: -1, y: 0 }), /does not reach/);
  // A curve hugging the x-axis is never announced as ON it: y = 2·(1/3)^(x+1)
  // is 0.0027 at x = 5, which rounds to 0 — and "y 0" there would announce an
  // x-intercept the graph does not have.
  const hugging = { graph: { kind: 'exponential', a: 2, base: [1, 3], h: -1, k: 0 } };
  assert.match(describeCursor(hugging, { x: 5, y: 0 }), /The curve is just above y 0\.$/);
  assert.match(describeCursor({ graph: { ...hugging.graph, a: -2 } }, { x: 5, y: 0 }), /The curve is just below y 0\.$/);
  // A real zero is still a zero.
  assert.match(describeCursor({ graph: { kind: 'linear', m: 2, b: -2 } }, { x: 1, y: 0 }), /The curve is at y 0\.$/);
});

/* ------------------------------ the session ------------------------------ */

const ZEROS = Object.freeze([{ id: 'x1', x: -4, y: 0 }, { id: 'x2', x: 1, y: 0 }, { id: 'x3', x: 5, y: 0 }]);
const cubic = (questionIndex = 0, extra = {}) => ({
  questionIndex, feature: 'xIntercept', family: 'cubic', prompt: 'Find all zeros', view: VIEW, targets: ZEROS, targetCount: 3, ...extra,
});
const TOL = { x: 0.6, y: 0.6 };
let ids = 0;
const nextId = () => `t-${(ids += 1)}`;
const tap = (session, x, y, nowMs = 1_000) => recordTap(session, { x, y, tolerance: TOL, pointer: 'touch', nowMs, elapsedMs: nowMs, attemptId: nextId() });

const fresh = (questions = [cubic(0), cubic(1)]) => createRushSession({ roundIndex: 0, serverState: { cursor: 0, cursorTargetsFound: [] }, questions, poolSize: 50 });

test('find all the zeros on the device: instant feedback, one completion, then the next graph', () => {
  let session = fresh();
  ({ session } = tap(session, -4, 0.2));
  assert.equal(session.feedback.kind, RUSH_FEEDBACK.HIT);
  assert.equal(feedbackMessage(session.feedback, currentQuestion(session)), 'Found (−4, 0).');
  ({ session } = tap(session, 3, 0));
  assert.equal(session.feedback.kind, RUSH_FEEDBACK.MISS);
  assert.equal(feedbackMessage(session.feedback, currentQuestion(session)), 'Not an x-intercept — try again.');
  assert.equal(inputState(session, 1_000), RUSH_INPUT.READY, 'one wrong tap costs no time');
  ({ session } = tap(session, 1, 0));
  ({ session } = tap(session, 5, -0.3));
  assert.equal(session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(session.counts.completed, 1);
  assert.equal(session.queue.length, 4, 'every recorded attempt is queued for the server');
  assert.equal(inputState(session, 1_000), RUSH_INPUT.TRANSITION);
  const during = tap(session, 2, 2);
  assert.equal(during.attempt, null, 'a tap during the success flash is ignored, not a second completion');
  assert.equal(during.refused, RUSH_INPUT.TRANSITION);
  assert.equal(effectiveCursor(session), 1);
  assert.equal(settle(session, 1_000 + RUSH_COMPLETE_FLASH_MS - 1), session);
  session = settle(session, 1_000 + RUSH_COMPLETE_FLASH_MS);
  assert.deepEqual([session.cursor, session.found.length, session.transition], [1, 0, null]);
});

test('a found target tapped again sends nothing and costs nothing', () => {
  let session = fresh();
  ({ session } = tap(session, -4, 0));
  const again = tap(session, -4.2, 0.1);
  assert.equal(again.attempt, null);
  assert.equal(again.session.feedback.kind, RUSH_FEEDBACK.ALREADY_FOUND);
  assert.equal(again.session.queue.length, 1);
  assert.equal(again.session.counts.attempts, 1);
});

test('misses in a row pause input; the last allowed miss skips the graph', () => {
  let session = fresh();
  ({ session } = tap(session, 8, 8, 1_000));
  ({ session } = tap(session, 8, 8, 1_100));
  assert.equal(inputState(session, 1_100), RUSH_INPUT.LOCKED, 'a second miss in a row pauses input');
  assert.equal(session.lockedUntil, 1_100 + RUSH_LOCKOUT.baseMs);
  assert.equal(tap(session, -4, 0, 1_200).attempt, null, 'taps during the pause are not attempts');
  assert.equal(inputState(session, 1_100 + RUSH_LOCKOUT.baseMs), RUSH_INPUT.READY);
  let now = 2_000;
  for (let miss = 3; miss <= RUSH_AUTO_SKIP_MISSES; miss += 1) {
    now += 4_000;
    ({ session } = tap(session, 8, 8, now));
  }
  assert.equal(session.feedback.kind, RUSH_FEEDBACK.AUTO_SKIPPED);
  assert.equal(session.transition.kind, RUSH_FEEDBACK.AUTO_SKIPPED);
  assert.equal(session.counts.skipped, 1);
  assert.equal(session.counts.attempts, RUSH_AUTO_SKIP_MISSES + 1, 'the misses and the server\'s skip record');
  session = settle(session, now + RUSH_SKIP_PAUSE_MS);
  assert.equal(session.cursor, 1);
});

test('"Does Not Exist" and Skip on the device', () => {
  const none = cubic(0, { targets: [], targetCount: 1, feature: 'maximum', family: 'linear', prompt: 'Find the maximum' });
  let session = fresh([none, cubic(1)]);
  const wrongFirst = recordDoesNotExist(fresh([cubic(0), cubic(1)]), { nowMs: 0, elapsedMs: 0, attemptId: 'w' });
  assert.equal(wrongFirst.session.feedback.kind, RUSH_FEEDBACK.MISS);
  assert.equal(feedbackMessage(wrongFirst.session.feedback, cubic(0)), 'It is on this graph — look again.');
  ({ session } = recordDoesNotExist(session, { nowMs: 0, elapsedMs: 0, attemptId: 'd' }));
  assert.equal(session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(feedbackMessage(session.feedback, none), 'Correct — it does not exist on this graph.');
  session = settle(session, RUSH_COMPLETE_FLASH_MS);
  const skipped = recordSkip(session, { nowMs: 5_000, elapsedMs: 5_000, attemptId: 's' });
  assert.deepEqual([skipped.attempt.kind, skipped.session.counts.skipped, skipped.session.transition.kind], ['skip', 1, RUSH_FEEDBACK.SKIPPED]);
});

test('prefetching keeps graphs ready ahead, and stops at the end of the pool', () => {
  let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [cubic(0)], poolSize: 4 });
  assert.deepEqual(prefetchRequest(session), { fromIndex: 1, count: RUSH_PREFETCH.batch });
  session = withQuestions(session, [cubic(1), cubic(2), cubic(0, { prompt: 'replaced?' })]);
  assert.equal(session.questions[0].prompt, 'Find all zeros', 'a graph on hand is never replaced');
  assert.equal(prefetchRequest(session), null, 'three ready, counting the one on screen');
  session = withQuestions(session, [cubic(3)]);
  session = { ...session, cursor: 4 };
  assert.equal(inputState(session, 0), RUSH_INPUT.EXHAUSTED);
  assert.equal(prefetchRequest(session), null, 'nothing past the pool is asked for');
  const empty = createRushSession({ serverState: { cursor: 2 }, questions: [] });
  assert.equal(inputState(empty, 0), RUSH_INPUT.WAITING);
});

test('the server\'s reply clears the queue; when nothing is waiting, its state is the truth', () => {
  let session = fresh();
  let first;
  ({ session, attempt: first } = tap(session, -4, 0));
  ({ session } = tap(session, 1, 0));
  // Reply to the first only: the second is still waiting, so no comparison.
  const partial = acknowledge(session, { sent: [first], reply: { state: { cursor: 0, cursorTargetsFound: ['x1'] } } });
  assert.equal(partial.resynced, false);
  assert.equal(partial.session.queue.length, 1);
  // The server says something else happened (here: nothing found at all).
  const disagree = acknowledge(partial.session, { sent: partial.session.queue, reply: { state: { cursor: 0, cursorTargetsFound: [], cursorAttempts: 3, questionsCorrect: 0, attempts: 3, hits: 0 } } });
  assert.equal(disagree.resynced, true);
  assert.deepEqual(disagree.session.found, []);
  assert.equal(disagree.session.missesOnGraph, 3, 'misses on the graph come from the server too');
  assert.equal(disagree.session.feedback.kind, RUSH_FEEDBACK.RESYNCED);
  assert.equal(disagree.session.counts.attempts, 3);
  assert.equal(differsFromServer(disagree.session, { cursor: 0, cursorTargetsFound: [] }), false);
  // During a completion flash the device is already on the next graph.
  let flashing = fresh();
  for (const x of [-4, 1, 5]) ({ session: flashing } = tap(flashing, x, 0));
  assert.equal(differsFromServer(flashing, { cursor: 1, cursorTargetsFound: [] }), false);
  assert.equal(differsFromServer(flashing, { cursor: 0, cursorTargetsFound: ['x1', 'x2'] }), true);
});

test('a stored queue is shape-checked before it is resent', () => {
  const good = { attemptId: 'a-1', questionIndex: 0, kind: 'tap', x: 1, y: 0 };
  assert.deepEqual(parseStoredQueue(JSON.stringify([good, { attemptId: 7 }, null, { attemptId: 'b', questionIndex: 1, kind: 'teleport' }])), [good]);
  assert.deepEqual(parseStoredQueue('not json'), []);
  assert.deepEqual(parseStoredQueue('{"a":1}'), []);
  // Fallback ids use the server's alphabet.
  const id = newAttemptId({});
  assert.ok(normalizeRushAttempt({ attemptId: id, questionIndex: 0, kind: 'skip' }), id);
  assert.ok(normalizeRushAttempt({ attemptId: newAttemptId(), questionIndex: 0, kind: 'skip' }));
  assert.equal(RUSH_MODE_ID, CHALLENGE_MODE_ID.GRAPH_FEATURE_RUSH, 'the student screen and the registry name the mode alike');
});

test('feedback never says how many targets remain', () => {
  let session = fresh();
  ({ session } = tap(session, -4, 0));
  const message = feedbackMessage(session.feedback, currentQuestion(session));
  assert.doesNotMatch(message, /\b(two|three|more|remaining|left|of 3|1 of)\b/i);
  assert.equal(feedbackMessage(null, null), '');
});

/* -------------------- the device and the server agree -------------------- */

/*
 * A random student — right taps, near misses, wild taps, "Does Not Exist"
 * presses and skips — plays real generated graphs. Every input goes through
 * the device session; its queue reaches the server in random batch sizes,
 * through the server's own applyRushAttempts. After every reply the device
 * must already agree with the server: no resync, ever, and the same counts.
 */
test('device and server agree on every step of thousands of random taps', () => {
  const config = normalizeGraphFeatureRushConfig({ presetId: 'algebra2Challenge' });
  let resyncs = 0;
  let replies = 0;
  for (let student = 0; student < 12; student += 1) {
    const studentKey = `agree-${student}`;
    const serverQuestion = (index) => generateRushQuestion({ seed: 'agree', studentKey, roundIndex: 0, questionIndex: index, config });
    const deviceQuestions = Array.from({ length: 50 }, (_, index) => publicRushQuestion(serverQuestion(index)));
    let seed = 7 + student * 101;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: deviceQuestions.slice(0, 50), poolSize: 50 });
    let player = {};
    let now = 0;
    const deliver = () => {
      while (session.queue.length) {
        const size = 1 + Math.floor(random() * Math.min(RUSH_LIMITS.batch, session.queue.length));
        const batch = nextBatch(session).slice(0, size);
        const outcome = applyRushAttempts({
          player, roundIndex: 0, roundVersion: 1, attempts: batch, questionFor: serverQuestion,
          arrivedAtMs: now, arrivalElapsedMs: now, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 50,
        });
        player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
        const reply = { verdicts: outcome.verdicts, state: outcome.state };
        const acked = acknowledge(session, { sent: batch, reply });
        replies += 1;
        if (acked.resynced) resyncs += 1;
        session = acked.session;
        if (!session.queue.length) {
          assert.deepEqual(session.counts, {
            completed: outcome.state.questionsCorrect, skipped: outcome.state.skipped, attempts: outcome.state.attempts, hits: outcome.state.hits,
          });
        }
      }
    };
    for (let step = 0; step < 260 && session.cursor < 48; step += 1) {
      now += 50 + Math.floor(random() * 900);
      session = settle(session, now);
      if (inputState(session, now) === RUSH_INPUT.LOCKED) now = session.lockedUntil;
      if (inputState(session, now) !== RUSH_INPUT.READY) continue;
      const question = currentQuestion(session);
      const span = { x: question.view.xMax - question.view.xMin, y: question.view.yMax - question.view.yMin };
      const tolerance = clampTolerance({ x: span.x * 0.03, y: span.y * 0.03 }, question.view);
      const roll = random();
      const open = question.targets.filter((target) => !session.found.includes(target.id));
      let input;
      if (roll < 0.05) input = recordSkip(session, { nowMs: now, elapsedMs: now, attemptId: newAttemptId() });
      else if (roll < 0.15) input = recordDoesNotExist(session, { nowMs: now, elapsedMs: now, attemptId: newAttemptId() });
      else {
        const aim = open.length && roll < 0.7 ? open[Math.floor(random() * open.length)] : question.targets[0];
        // Right on, near the edge of the reach, or anywhere at all.
        const jitter = roll < 0.55 ? 0.3 : roll < 0.75 ? 0.98 : 6;
        const x = aim && roll < 0.85 ? aim.x + (random() - 0.5) * 2 * jitter * tolerance.x : question.view.xMin + random() * span.x;
        const y = aim && roll < 0.85 ? aim.y + (random() - 0.5) * 2 * jitter * tolerance.y : question.view.yMin + random() * span.y;
        input = recordTap(session, { x, y, tolerance, pointer: 'touch', nowMs: now, elapsedMs: now, attemptId: newAttemptId() });
      }
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 50, strategy: correctCountStrategy }).state), false, studentKey);
  }
  assert.ok(replies > 300, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
});
