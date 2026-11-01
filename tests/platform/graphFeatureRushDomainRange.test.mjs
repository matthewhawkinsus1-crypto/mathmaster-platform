import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { getGraphFamily, familyVariants, listGraphFamilies } from '../../functions/shared/graphFeatureFamilies.mjs';
import { generateQuestionForSlot, generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { FEATURE_READING, rushReadingGuide } from '../../functions/shared/graphFeatureReading.mjs';
import { CLASSIC_GRAPH_FEATURE_IDS, GRAPH_FEATURE, QUESTION_TIER, QUESTION_TIER_ORDER, SET_FEATURE_AXIS, getGraphFeature } from '../../functions/shared/graphFeatureRegistry.mjs';
import { applyRushAttempts, normalizeRushAttempt } from '../../functions/shared/graphFeatureRush.mjs';
import { GRAPH_FEATURE_RUSH_PRESETS, getRushPreset, normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_ATTEMPT_KIND, RUSH_REVEAL_PAUSE_MS, RUSH_SET_AUTO_SKIP_MISSES, rushAutoSkipMisses } from '../../functions/shared/graphFeatureRushRules.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import * as N from '../../functions/shared/numberLineSets.mjs';
import { axisSetDrawing } from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  RUSH_FEEDBACK,
  RUSH_INPUT,
  acknowledge,
  axisValueAt,
  createRushSession,
  currentQuestion,
  differsFromServer,
  drawingReady,
  feedbackMessage,
  inputState,
  isSetQuestion,
  newAttemptId,
  nextBatch,
  recordAxisTap,
  recordCheck,
  recordSkip,
  recordTap,
  settle,
  toggleAxisArrow,
} from '../../src/platform/liveChallenge/rushSession.js';
import { rushCreateRequest, rushSetupFromPreset } from '../../src/platform/liveChallenge/rushSetupModel.js';
import { region } from './helpers/sourceContract.mjs';

/*
 * DOMAIN AND RANGE, CLICK ONLY (plan part 3).
 *
 * A domain is marked on the x-axis and a range on the y-axis. A tap anywhere
 * drops a dot onto the axis at the nearest grid line: once for ● closed, twice
 * for ○ open, a third time to take it away, two dots at most. ◀ ▶ (▼ ▲ for a
 * range) mean "keeps going". Two dots shade between them; two dots and both
 * arrows shade the outside. The interval notation shows live. ✓ Check sends
 * the drawing; a wrong one gets a hint about the one thing that is off, and
 * the third shows the answer and moves on. "Domain & Range Rush" is a preset,
 * and the merge with intercepts is another; the existing presets keep their
 * features.
 *
 * Every family's answer is found again from the curve alone in
 * graphFeatureRushMath (the oracle covers every domain and range slot).
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const notation = (set) => N.intervalNotation(set);

/* ------------------------------ the number line ----------------------------- */

test('a tap is ● the first time, ○ the second, gone the third; two dots at most, a third tap moves the nearer one', () => {
  let drawing = N.tapNumber(N.EMPTY_DRAWING, -3);
  assert.deepEqual(drawing.points, [{ value: -3, closed: true }]);
  drawing = N.tapNumber(drawing, -3);
  assert.deepEqual(drawing.points, [{ value: -3, closed: false }]);
  drawing = N.tapNumber(drawing, -3);
  assert.deepEqual(drawing.points, []);
  const two = N.tapNumber(N.tapNumber(N.EMPTY_DRAWING, -3), 5);
  assert.equal(two.points.length, 2);
  assert.deepEqual(N.tapNumber(two, 4).points, [{ value: -3, closed: true }, { value: 4, closed: true }], 'the nearer dot moves, keeping its style');
});

test('what a drawing means: two dots shade between them, two dots and both arrows the outside, an arrow keeps going', () => {
  const dots = (...points) => points.reduce((drawing, [value, open]) => (open ? N.tapNumber(N.tapNumber(drawing, value), value) : N.tapNumber(drawing, value)), N.EMPTY_DRAWING);
  const arrows = (drawing, ...sides) => sides.reduce((current, side) => N.toggleArrow(current, side), drawing);
  assert.equal(notation(N.drawingSet(dots([-3], [5]))), '[−3, 5]');
  assert.equal(notation(N.drawingSet(dots([-3, true], [5]))), '(−3, 5]');
  assert.equal(notation(N.drawingSet(arrows(dots([-1], [3, true]), 'left', 'right'))), '(−∞, −1] ∪ (3, ∞)', 'both arrows: the outside');
  assert.equal(N.inequalityNotation(N.drawingSet(arrows(dots([-1], [3, true]), 'left', 'right'))), 'x ≤ −1 or x > 3');
  assert.equal(notation(N.drawingSet(arrows(dots([-3]), 'right'))), '[−3, ∞)');
  assert.equal(notation(N.drawingSet(arrows(dots([2, true]), 'left', 'right'))), '(−∞, 2) ∪ (2, ∞)', 'every number but one');
  assert.equal(notation(N.drawingSet(arrows(N.EMPTY_DRAWING, 'left', 'right'))), '(−∞, ∞)');
  assert.equal(notation(N.drawingSet(dots([4]))), '{4}', 'a lone closed dot: that number (a level line\'s range)');
  // Not yet a set: nothing, a lone arrow, a lone open dot.
  assert.equal(N.drawingSet(N.EMPTY_DRAWING), null);
  assert.equal(N.drawingSet(arrows(N.EMPTY_DRAWING, 'left')), null);
  assert.equal(N.drawingSet(dots([4, true])), null);
  // Every set a question asks is drawn exactly one way back, and means itself.
  for (const set of [N.ALL_REALS, N.allExcept(2), N.raySet(-3, true, 1), N.intervalSet(-1, false, 4, true), N.pointSet(3), N.unionSets(N.raySet(-1, true, -1), N.raySet(3, false, 1))]) {
    assert.ok(N.setsEqual(N.drawingSet(N.drawingForSet(set)), set), notation(set));
  }
});

test('a hint asks about the one thing that is off, at the end it is off — never the answer', () => {
  const hint = (student, key, axis = 'x') => N.setHint(student, key, { axis });
  assert.equal(hint(N.intervalSet(-3, false, null, false), N.intervalSet(-3, true, null, false)), 'Open or closed at the left end?');
  assert.equal(hint(N.intervalSet(-3, true, 4, false), N.intervalSet(-3, true, 4, true), 'y'), 'Open or closed at the top end?');
  assert.equal(hint(N.intervalSet(-3, false, 4, false), N.intervalSet(-3, true, 4, true)), 'Open or closed at each end?');
  assert.equal(hint(N.raySet(-3, true, -1), N.raySet(-3, true, 1)), 'Which way does it keep going?');
  assert.equal(hint(N.intervalSet(-3, true, 4, true), N.raySet(-3, true, 1)), 'Does it keep going, or does it stop?');
  assert.equal(hint(N.pointSet(1), N.intervalSet(1, false, null, false), 'y'), 'Does it keep going, or does it stop?', 'the arrow before the dot');
  assert.equal(hint(N.intervalSet(-2, true, 4, true), N.intervalSet(-3, true, 4, true)), 'Check the number at the left end.');
  assert.equal(hint(N.raySet(-2, true, 1), N.raySet(-3, true, 1), 'y'), 'Check the number at the bottom end.');
  // No hint ever names a number of the answer.
  for (const [student, key] of [[N.raySet(-2, true, 1), N.raySet(-3, true, 1)], [N.pointSet(7), N.allExcept(2)]]) {
    assert.doesNotMatch(hint(student, key), /\d/);
  }
});

test('a drawing from a device is shape-checked: two dots at most, on the half grid, each once', () => {
  assert.equal(N.normalizeDrawing({ points: [[0.3, true]] }), null);
  assert.equal(N.normalizeDrawing({ points: [[1, true], [1, false]] }), null);
  assert.equal(N.normalizeDrawing({ points: [[1, true], [2, true], [3, true]] }), null);
  assert.equal(N.normalizeDrawing({ points: [[5000, true]] }), null);
  assert.equal(N.normalizeDrawing('nope'), null);
  assert.deepEqual(N.drawingToPlain(N.normalizeDrawing({ points: [[1.5, false], [-2, true]], left: true })), { points: [{ value: -2, closed: true }, { value: 1.5, closed: false }], left: true, right: false });
  // The plain form reads back as itself.
  const plain = N.drawingToPlain(N.normalizeDrawing({ points: [{ value: 3, closed: false }], right: true }));
  assert.deepEqual(N.drawingToPlain(N.normalizeDrawing(plain)), plain);
  assert.equal(normalizeRushAttempt({ attemptId: 'c1', questionIndex: 0, kind: RUSH_ATTEMPT_KIND.CHECK, drawing: { points: [[0.25, true]] } }), null, 'a check with a malformed drawing is refused');
});

/* -------------------------------- the families ------------------------------ */

test('every family\'s domain and range, exactly — rays, segments, open ends, asymptotes, a gap', () => {
  const sets = (family, params) => {
    const analysis = getGraphFamily(family).analyze(params);
    return [notation(analysis.domain.points[0].set), notation(analysis.range.points[0].set)];
  };
  const end = (x, closed) => ({ x: Q.rat(x), closed });
  assert.deepEqual(sets('linear', { m: Q.rat(2), b: Q.rat(1) }), ['(−∞, ∞)', '(−∞, ∞)']);
  assert.deepEqual(sets('linear', { m: Q.ZERO, b: Q.rat(3) }), ['(−∞, ∞)', '{3}']);
  assert.deepEqual(sets('linear', { m: Q.rat(-1), b: Q.rat(1), domain: { from: end(-2, true), to: end(3, false) } }), ['[−2, 3)', '(−2, 3]'], 'a falling segment: its ends swap');
  assert.deepEqual(sets('quadratic', { a: Q.rat(1), h: Q.rat(1), k: Q.rat(-2) }), ['(−∞, ∞)', '[−2, ∞)']);
  assert.deepEqual(sets('quadratic', { a: Q.rat(-1), h: Q.rat(1), k: Q.rat(-2), domain: { from: end(2, false), to: null } }), ['(2, ∞)', '(−∞, −3)'], 'an arm past the vertex, from an open end');
  assert.deepEqual(sets('absolute', { a: Q.rat(2), h: Q.ZERO, k: Q.rat(1), domain: { from: null, to: end(-1, true) } }), ['(−∞, −1]', '[3, ∞)']);
  assert.deepEqual(sets('exponential', { a: Q.rat(1), base: Q.rat(2), h: Q.ZERO, k: Q.rat(-3) }), ['(−∞, ∞)', '(−3, ∞)'], 'up from its asymptote, never reaching it');
  assert.deepEqual(sets('squareRoot', { a: Q.rat(-1), s: -1, h: Q.rat(2), k: Q.rat(1) }), ['(−∞, 2]', '(−∞, 1]']);
  assert.deepEqual(sets('rational', { a: Q.rat(2), h: Q.rat(1), k: Q.rat(-1) }), ['(−∞, 1) ∪ (1, ∞)', '(−∞, −1) ∪ (−1, ∞)']);
  assert.deepEqual(sets('cubic', { a: Q.rat(1), roots: [Q.rat(1), Q.rat(2), Q.rat(3)], quadratic: null }), ['(−∞, ∞)', '(−∞, ∞)']);
  const split = (leftValue, rightValue, leftClosed) => ({
    s: Q.ZERO,
    pieces: [
      { m: Q.rat(1), b: Q.rat(leftValue), from: null, to: { x: Q.ZERO, closed: leftClosed } },
      { m: Q.rat(1), b: Q.rat(rightValue), from: { x: Q.ZERO, closed: !leftClosed }, to: null },
    ],
  });
  assert.deepEqual(sets('piecewise', split(-1, 2, true)), ['(−∞, ∞)', '(−∞, −1] ∪ (2, ∞)'], 'a jump up leaves a gap');
  assert.deepEqual(sets('piecewise', split(2, -1, false)), ['(−∞, ∞)', '(−∞, ∞)'], 'a jump down overlaps');
});

test('domain and range: the families that have them, from the tier their variants start, and the presets', () => {
  for (const feature of [GRAPH_FEATURE.DOMAIN, GRAPH_FEATURE.RANGE]) {
    const meta = getGraphFeature(feature);
    assert.equal(meta.geometry, 'set');
    assert.equal(meta.canNotExist, false, 'every function has one');
    assert.equal(SET_FEATURE_AXIS[feature], feature === GRAPH_FEATURE.DOMAIN ? 'x' : 'y');
    listGraphFamilies().forEach((family) => {
      const variants = QUESTION_TIER_ORDER.flatMap((tier) => familyVariants(family.id, feature, tier));
      assert.ok(variants.length > 0, `${family.id} has a ${feature}`);
      assert.ok(variants.every((entry) => entry.exists), 'never "Does Not Exist"');
    });
  }
  const dr = getRushPreset('domainRange');
  assert.deepEqual([dr.label, [...dr.features]], ['Domain & Range Rush', ['domain', 'range']]);
  const merge = getRushPreset('domainRangeIntercepts');
  assert.deepEqual([...merge.features], ['xIntercept', 'yIntercept', 'domain', 'range'], 'the merge: intercepts with domain and range');
  for (const id of ['domainRange', 'domainRangeIntercepts']) {
    const preset = getRushPreset(id);
    const request = rushCreateRequest(rushSetupFromPreset(preset));
    const accepted = normalizeGraphFeatureRushConfig(request.graphFeatureRush);
    assert.equal(accepted.presetId, id, `${id} is accepted unchanged`);
  }
  for (const id of ['algebra1Quick', 'algebra1Functions', 'interceptSprint', 'algebra2Mixed', 'algebra2Challenge']) {
    assert.ok(getRushPreset(id).features.every((feature) => CLASSIC_GRAPH_FEATURE_IDS.includes(feature)), `${id} keeps its features`);
  }
  assert.equal(GRAPH_FEATURE_RUSH_PRESETS.length, 7);
});

/* -------------------------------- questions -------------------------------- */

const slotQuestion = (family, feature, variant, tier, seed = 'dr') => generateQuestionForSlot({ slot: { family, feature, variant, tier }, seedText: seed });

test('a domain or range question is "Mark the domain/range", one target, the set, on its axis', () => {
  const domain = publicRushQuestion(slotQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY));
  assert.equal(domain.prompt, 'Mark the domain');
  assert.equal(domain.targetCount, 1);
  assert.deepEqual(domain.targets.map(({ id, geometry, axis }) => [id, geometry, axis]), [['dom', 'set', 'x']]);
  assert.ok(N.setFromPlain(domain.targets[0].set));
  const range = publicRushQuestion(slotQuestion('exponential', GRAPH_FEATURE.RANGE, 'asymptote', QUESTION_TIER.STANDARD));
  assert.equal(range.prompt, 'Mark the range');
  assert.deepEqual(range.targets.map(({ geometry, axis }) => [geometry, axis]), [['set', 'y']]);
  assert.equal(isSetQuestion(range), true);
  assert.equal(rushAutoSkipMisses(range), RUSH_SET_AUTO_SKIP_MISSES);
  assert.equal(rushAutoSkipMisses(publicRushQuestion(slotQuestion('linear', GRAPH_FEATURE.X_INTERCEPT, 'one', QUESTION_TIER.EASY))), 8);
});

/* --------------------------- grading on the server --------------------------- */

const play = (serverQuestion, attempts) => applyRushAttempts({
  player: {}, roundIndex: 0, attempts, questionFor: () => serverQuestion, arrivedAtMs: 30_000, arrivalElapsedMs: 30_000, poolSize: 1, strategy: correctCountStrategy,
});
const check = (attemptId, drawing) => ({ attemptId, questionIndex: 0, kind: RUSH_ATTEMPT_KIND.CHECK, drawing: N.drawingToPlain(drawing), clientElapsedMs: 0 });

test('the server grades a check by the set the drawing means: the same set drawn another way is right', () => {
  const question = slotQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY, 'grade');
  const answer = N.setFromPlain(question.targets[0].set);
  const right = play(question, [check('c-right', N.drawingForSet(answer))]);
  assert.deepEqual([right.verdicts[0].verdict, right.verdicts[0].completesQuestion], ['hit', true]);
  // [h, ∞) drawn with a redundant second dot inside the ray: still [h, ∞).
  const h = answer[0].lo.n / answer[0].lo.d;
  const roundabout = N.toggleArrow(N.tapNumber(N.tapNumber(N.EMPTY_DRAWING, h), h + 2), 'right');
  assert.ok(N.setsEqual(N.drawingSet(roundabout), answer));
  assert.equal(play(question, [check('c-other-way', roundabout)]).verdicts[0].verdict, 'hit');
  // Wrong: a miss, recorded with what was drawn and what was off.
  const wrong = play(question, [check('c-wrong', N.toggleArrow(N.tapNumber(N.tapNumber(N.EMPTY_DRAWING, h), h), 'right'))]);
  assert.equal(wrong.verdicts[0].verdict, 'miss');
  const receipt = wrong.receipts['c-wrong'];
  assert.equal(receipt.diagnosis, N.SET_DIAGNOSIS.INCLUSION);
  assert.deepEqual(receipt.drawing, { points: [{ value: h, closed: false }], left: false, right: true });
  // A tap on a domain question is not an answer: a miss.
  assert.equal(play(question, [{ attemptId: 't', questionIndex: 0, kind: 'tap', x: h, y: 0, tolerance: { x: 1, y: 1 }, pointer: 'touch', clientElapsedMs: 0 }]).verdicts[0].verdict, 'miss');
});

// Whether a value holds an array directly inside an array, anywhere: Firestore refuses to write one.
const nestsArrays = (value) => {
  if (Array.isArray(value)) return value.some((entry) => Array.isArray(entry) || nestsArrays(entry));
  return Boolean(value) && typeof value === 'object' && Object.values(value).some(nestsArrays);
};

test('every receipt a check writes can be stored: no array directly inside an array', () => {
  // Firestore rejects a document holding [[…]] ("Cannot convert an array value
  // in an array value"): a receipt carrying its drawing as [value, closed]
  // pairs failed every domain and range check against the database.
  const question = slotQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY, 'storable');
  const answer = N.setFromPlain(question.targets[0].set);
  const wrong = N.drawingForSet(N.intervalSet(-3, true, 3, false));
  const outcome = applyRushAttempts({
    player: {}, roundIndex: 0, roundVersion: 1, questionFor: () => question, arrivedAtMs: 600_000, arrivalElapsedMs: 600_000, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 50,
    attempts: [check('w1', wrong), check('w2', wrong), check('w3', wrong)],
  });
  const receipts = Object.values(outcome.receipts);
  assert.ok(receipts.some((receipt) => receipt.drawing), 'checks record their drawing');
  receipts.forEach((receipt) => assert.equal(nestsArrays(receipt), false, JSON.stringify(receipt)));
  assert.equal(nestsArrays(check('ok', N.drawingForSet(answer))), false, 'nor does the attempt a device sends');
});

test('the third wrong check skips the graph, recorded by the server with that check', () => {
  const question = slotQuestion('rational', GRAPH_FEATURE.DOMAIN, 'allButOne', QUESTION_TIER.STANDARD, 'three');
  const wrongDrawing = N.tapNumber(N.EMPTY_DRAWING, 1);
  let player = {};
  let elapsed = 30_000;
  const verdicts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    elapsed += 6_000;
    const outcome = applyRushAttempts({ player, roundIndex: 0, attempts: [check(`w${attempt}`, wrongDrawing)], questionFor: () => question, arrivedAtMs: elapsed, arrivalElapsedMs: elapsed, poolSize: 2, strategy: correctCountStrategy });
    player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
    verdicts.push(outcome.verdicts[0]);
  }
  assert.deepEqual(verdicts.map((verdict) => [verdict.verdict, verdict.autoSkipped === true]), [['miss', false], ['miss', false], ['miss', true]]);
  assert.equal(player.submissionReceipts['w3~auto-skip'].automatic, true);
});

/* ------------------------------- the device -------------------------------- */

const freshSession = (question) => createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [question, { ...question, questionIndex: 1 }], poolSize: 2 });

test('on the device a tap anywhere drops a dot on the axis at the nearest grid line in view; nothing is sent until ✓ Check', () => {
  const question = publicRushQuestion(slotQuestion('exponential', GRAPH_FEATURE.RANGE, 'asymptote', QUESTION_TIER.STANDARD, 'device'));
  const { view } = question;
  assert.equal(axisValueAt(question, { x: view.xMin + 0.3, y: 2.3 * view.yStep }), 2 * view.yStep, 'a range: the y of the tap, to the nearest y grid line');
  assert.ok(axisValueAt(question, { x: 0, y: view.yMax + 5 }) <= view.yMax, 'never past the view');
  let session = freshSession(question);
  const tapped = recordAxisTap(session, { x: 1, y: view.yStep, nowMs: 0 });
  assert.equal(tapped.attempt, null, 'a tap edits the drawing on this device only');
  session = tapped.session;
  assert.deepEqual(session.drawing.points, [{ value: view.yStep, closed: true }]);
  assert.equal(drawingReady(session), true);
  session = recordAxisTap(session, { x: -3, y: view.yStep, nowMs: 0 }).session;
  assert.equal(drawingReady(session), false, 'a lone open dot names no set yet');
  session = toggleAxisArrow(session, 'right', { nowMs: 0 }).session;
  assert.equal(drawingReady(session), true);
  // A domain is the x of the tap.
  const domain = publicRushQuestion(slotQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY, 'device'));
  assert.equal(axisValueAt(domain, { x: 2.4 * domain.view.xStep, y: 99 }), 2 * domain.view.xStep);
});

test('✓ Check on the device: right completes the graph; wrong gets a hint; the third shows the answer and moves on', () => {
  const question = publicRushQuestion(slotQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY, 'device-check'));
  const answer = N.setFromPlain(question.targets[0].set);
  const h = answer[0].lo.n / answer[0].lo.d;
  const drawWith = (session, drawing) => Object.freeze({ ...session, drawing });
  // Right.
  const right = recordCheck(drawWith(freshSession(question), N.drawingForSet(answer)), { nowMs: 0, elapsedMs: 0, attemptId: 'r' });
  assert.equal(right.attempt.kind, RUSH_ATTEMPT_KIND.CHECK);
  assert.equal(right.session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(feedbackMessage(right.session.feedback, question), `Correct — ${notation(answer)}.`);
  // Wrong: an open end where it is closed.
  const openEnd = N.toggleArrow(N.tapNumber(N.tapNumber(N.EMPTY_DRAWING, h), h), 'right');
  let session = drawWith(freshSession(question), openEnd);
  let outcome = recordCheck(session, { nowMs: 0, elapsedMs: 0, attemptId: 'w1' });
  assert.equal(outcome.session.feedback.kind, RUSH_FEEDBACK.MISS);
  assert.equal(feedbackMessage(outcome.session.feedback, question), 'Open or closed at the left end?');
  session = outcome.session;
  outcome = recordCheck(session, { nowMs: 1, elapsedMs: 1, attemptId: 'w2' });
  session = outcome.session;
  assert.equal(inputState(session, 2), RUSH_INPUT.LOCKED, 'the second miss in a row pauses input');
  outcome = recordCheck(session, { nowMs: session.lockedUntil, elapsedMs: session.lockedUntil, attemptId: 'w3' });
  assert.equal(outcome.session.feedback.kind, RUSH_FEEDBACK.AUTO_SKIPPED);
  assert.equal(feedbackMessage(outcome.session.feedback, question), `The domain is ${notation(answer)}. Next graph.`);
  assert.equal(outcome.session.transition.until - session.lockedUntil, RUSH_REVEAL_PAUSE_MS, 'long enough to read the answer');
  // The next graph starts with a clean drawing.
  const next = settle(outcome.session, outcome.session.transition.until);
  assert.equal(next.cursor, 1);
  assert.deepEqual(next.drawing, N.EMPTY_DRAWING);
  // The answer, drawn as the graph moves on.
  const shown = axisSetDrawing(question, N.drawingForSet(answer));
  assert.equal(shown.axis, 'x');
  assert.deepEqual(shown.dots.map((dot) => [dot.value, dot.closed]), [[h, true]]);
  assert.equal(shown.arrows.high, 1);
});

test('device and server agree on every step of random play on domain, range and intercept questions', () => {
  const config = normalizeGraphFeatureRushConfig({ presetId: 'domainRangeIntercepts' });
  let replies = 0;
  let resyncs = 0;
  let checks = 0;
  for (let student = 0; student < 8; student += 1) {
    const studentKey = `agree-dr-${student}`;
    const serverQuestion = (index) => generateRushQuestion({ seed: 'agree-dr', studentKey, roundIndex: 0, questionIndex: index, config });
    const questions = Array.from({ length: 30 }, (_, index) => publicRushQuestion(serverQuestion(index)));
    let seed = 5 + student * 211;
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
      const roll = random();
      let input;
      if (isSetQuestion(question)) {
        const answer = N.setFromPlain(question.targets[0].set);
        if (roll < 0.05) input = recordSkip(session, context);
        else if (roll < 0.35) input = { session: Object.freeze({ ...session, drawing: N.drawingForSet(answer) }) };
        else if (roll < 0.6) {
          const { view } = question;
          input = recordAxisTap(session, { x: view.xMin + random() * (view.xMax - view.xMin), y: view.yMin + random() * (view.yMax - view.yMin), nowMs: now });
        } else if (roll < 0.7) input = toggleAxisArrow(session, random() < 0.5 ? 'left' : 'right', context);
        else if (drawingReady(session)) { input = recordCheck(session, context); checks += 1; }
        else input = recordSkip(session, context);
      } else {
        const open = question.targets.filter((target) => !session.found.includes(target.id));
        const aim = open.length && roll < 0.7 ? open[0] : null;
        const { view } = question;
        input = recordTap(session, { x: aim ? aim.x : view.xMin + random() * (view.xMax - view.xMin), y: aim ? aim.y : view.yMin + random() * (view.yMax - view.yMin), tolerance: { x: 0.03 * (view.xMax - view.xMin), y: 0.03 * (view.yMax - view.yMin) }, pointer: 'touch', ...context });
      }
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 30, strategy: correctCountStrategy }).state), false, studentKey);
  }
  assert.ok(checks > 60, `${checks} checks`);
  assert.ok(replies > 100, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
});

/* ---------------------------- guide and screens ---------------------------- */

test('the reading guide says how to read a domain and a range', () => {
  for (const feature of ['domain', 'range']) {
    assert.ok(FEATURE_READING[feature].line.length <= 100 && FEATURE_READING[feature].slip.length <= 80, feature);
  }
  const guide = rushReadingGuide({ features: ['domain', 'range'], difficulty: 'standard' }).solutionReview;
  assert.deepEqual(guide.reasoning, [FEATURE_READING.domain.line, FEATURE_READING.range.line], 'two lines: neither is ever "Does Not Exist"');
  assert.match(FEATURE_READING.domain.line, /open dot/);
});

test('the round shows the set as drawn, its notation, the arrows and ✓ Check on a domain or range — and Does Not Exist only elsewhere', () => {
  const round = read('src/components/liveChallenge/GraphFeatureRushRound.jsx');
  const setControls = region(round, '<div className="mm-rush-buttons" data-set="1">', '</div>', 'the set controls');
  assert.match(setControls, /onClick=\{\(\) => onArrow\('left'\)\}[^>]*>\{vertical \? '▼' : '◀'\}/);
  assert.match(setControls, /onClick=\{\(\) => onArrow\('right'\)\}[^>]*>\{vertical \? '▲' : '▶'\}/);
  assert.match(setControls, /disabled=\{buttonsDisabled \|\| !drawingReady\(session\)\} onClick=\{onCheck\}>✓ Check</);
  assert.doesNotMatch(setControls, /mm-rush-dne/, 'no Does Not Exist on a domain or range');
  assert.match(round, /\{setQuestion \? \(\s*<div className="mm-rush-buttons" data-set="1">/);
  assert.match(round, /\(isSetQuestion\(currentQuestion\(current\)\)\s*\? recordAxisTap\(current, \{ \.\.\.context, x, y \}\)\s*: recordTap\(/);
  assert.match(round, /drawnSet \? intervalNotation\(drawnSet\) : 'Tap the graph to place a dot\.'/);
  const graph = read('src/components/liveChallenge/GraphFeatureRushGraph.jsx');
  assert.match(graph, /\{revealSet\s*\? <AxisSet shape=\{revealSet\} side=\{side\} tone="var\(--mm-rush-found\)" \/>\s*: <AxisSet shape=\{axisSet\} side=\{side\} tone="var\(--mm-rush-curve\)" \/>\}/);
});
