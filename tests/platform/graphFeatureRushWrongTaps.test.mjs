import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { curveSegments, evaluateGraph, graphAsymptotes } from '../../functions/shared/graphFeatureCurves.mjs';
import { catalogSupportsFeature, GRAPH_FAMILY_CATALOG_IDS } from '../../functions/shared/graphFeatureCatalog.mjs';
import { generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { clampTolerance, targetDistance } from '../../functions/shared/graphFeatureHitTest.mjs';
import { GRAPH_FEATURE, GRAPH_FEATURE_IDS, TARGET_GEOMETRY, getGraphFeature } from '../../functions/shared/graphFeatureRegistry.mjs';
import { WRONG_TAP_WORDS, applyRushAttempts, buildRushReport, rushRoundPace, rushTapDiagnosis, wrongTapLabel } from '../../functions/shared/graphFeatureRush.mjs';
import { normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_LIMITS, RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';
import { INEQUALITY_REPORT_LABELS } from '../../functions/shared/inequalityRush.mjs';
import { buildMatchResult, questionSetMatchSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import {
  RUSH_INPUT,
  acknowledge,
  createRushSession,
  currentQuestion,
  differsFromServer,
  inputState,
  newAttemptId,
  nextBatch,
  recordDoesNotExist,
  recordTap,
  settle,
} from '../../src/platform/liveChallenge/rushSession.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * WHERE WRONG RUSH TAPS LAND (N42).
 *
 * A wrong tap within the round's tolerance of ANOTHER feature of the same
 * graph — the y-intercept tapped on a question that asked for the zeros — is
 * recorded on its receipt as that feature, from the server's own copy of the
 * question, and the teacher's report groups them: "Tapped the y-intercept
 * when asked for zeros (x-intercepts): 7". The diagnosis is the teacher's
 * alone, and it moves no verdict, no point and no clock.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const TAPPABLE = Object.freeze(['xIntercept', 'yIntercept', 'vertex', 'maximum', 'minimum', 'asymptote']);
const VIEW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 2, yStep: 2 });
const TOL = Object.freeze({ x: 0.5, y: 0.5 });

// Every family, every point and line feature, every tier, the off-screen layer on.
const EVERYTHING = normalizeGraphFeatureRushConfig({
  families: [...GRAPH_FAMILY_CATALOG_IDS],
  features: TAPPABLE,
  difficulty: 'mixed',
  offScreen: true,
});
const serverQuestions = (studentKey, count, config = EVERYTHING) => Array.from({ length: count }, (_, questionIndex) => generateRushQuestion({
  seed: 'wrong-taps', studentKey, roundIndex: 0, questionIndex, config,
}));

const sameNumber = (left, right) => Math.abs(left - right) < 1e-6;

/* ------------------------- the graph's own features ------------------------ */

test('the server\'s copy of every question carries its graph\'s own features, found on the curve; the device\'s copy never does', () => {
  let checked = 0;
  let irrational = 0;
  for (let student = 0; student < 6; student += 1) {
    for (const question of serverQuestions(`features-${student}`, 36)) {
      const where = `${question.family}/${question.feature}/${question.variant}: ${JSON.stringify(question.graph)}`;
      assert.ok(question.graphFeatures && typeof question.graphFeatures === 'object', where);
      assert.equal('graphFeatures' in publicRushQuestion(question), false, 'the device never receives them');
      const { graph, view, graphFeatures: features } = question;
      Object.entries(features).forEach(([featureId, targets]) => {
        assert.ok(TAPPABLE.includes(featureId), `${featureId}: only features a student taps (${where})`);
        targets.forEach((target) => {
          if (featureId === 'asymptote') {
            const lines = graphAsymptotes(graph);
            const fixed = target.orientation === 'vertical' ? lines.vertical : lines.horizontal;
            assert.ok(fixed.some((value) => sameNumber(value, target.orientation === 'vertical' ? target.x : target.y)), `an asymptote the curve has (${where})`);
            return;
          }
          // Every point is on the drawn curve (an extreme at a closed end included).
          assert.ok(sameNumber(evaluateGraph(graph, target.x), target.y), `${featureId} (${target.x}, ${target.y}) is on the curve (${where})`);
          if (featureId === 'yIntercept') assert.equal(target.x, 0);
          if (featureId === 'xIntercept') assert.equal(target.y, 0);
          if (!Number.isInteger(target.x * 2) && featureId === 'xIntercept') irrational += 1;
        });
        checked += 1;
      });
      // An independent reading of the curve: every crossing of the x-axis in
      // the view, and the y-intercept when the curve has one there, is listed.
      curveSegments(graph, view).forEach((segment) => {
        const steps = 2000;
        let previous = null;
        for (let index = 1; index < steps; index += 1) {
          const x = segment.from + ((segment.to - segment.from) * index) / steps;
          const y = evaluateGraph(graph, x);
          if (previous && Number.isFinite(y) && Number.isFinite(previous.y) && previous.y !== 0 && y !== 0 && Math.sign(y) !== Math.sign(previous.y)) {
            assert.ok((features.xIntercept || []).some((zero) => zero.x >= previous.x - 1e-9 && zero.x <= x + 1e-9), `the crossing near x = ${x} is a zero (${where})`);
          }
          previous = { x, y };
        }
      });
      const y0 = evaluateGraph(graph, 0);
      if (Number.isFinite(y0) && y0 >= view.yMin && y0 <= view.yMax && view.xMin <= 0 && view.xMax >= 0) {
        assert.ok((features.yIntercept || []).some((point) => sameNumber(point.y, y0)), `the y-intercept (0, ${y0}) is listed (${where})`);
      }
      // The feature asked, where it is on screen, is exactly the question's own targets.
      if (question.targets.length && question.offScreen !== true) {
        const asked = features[question.feature] || [];
        assert.equal(asked.length, question.targets.length, where);
        question.targets.forEach((target) => assert.ok(asked.some((entry) => (target.geometry === 'line'
          ? entry.orientation === target.orientation && sameNumber(entry.x ?? entry.y, target.x ?? target.y)
          : sameNumber(entry.x, target.x) && sameNumber(entry.y, target.y))), where));
      }
    }
  }
  assert.ok(checked > 300, `${checked} features checked`);
  assert.ok(irrational > 0, 'zeros that are not rational numbers are found on the curve too');
});

/* -------------------------------- the rule --------------------------------- */

// y = (x − 1)² − 4: zeros −1 and 3, y-intercept (0, −3), vertex and minimum (1, −4).
const PARABOLA = Object.freeze({ kind: 'quadratic', a: 1, h: 1, k: -4 });
const PARABOLA_FEATURES = Object.freeze({
  xIntercept: [{ x: -1, y: 0 }, { x: 3, y: 0 }],
  yIntercept: [{ x: 0, y: -3 }],
  vertex: [{ x: 1, y: -4 }],
  minimum: [{ x: 1, y: -4 }],
});
const parabolaQuestion = (feature, extra = {}) => ({
  questionIndex: 0,
  feature,
  family: 'quadratic',
  tier: 'standard',
  graph: PARABOLA,
  view: VIEW,
  targets: feature === 'xIntercept' ? [{ id: 'x0', x: -1, y: 0 }, { id: 'x1', x: 3, y: 0 }] : [],
  targetCount: feature === 'xIntercept' ? 2 : 1,
  weight: feature === 'xIntercept' ? 2 : 1,
  graphFeatures: PARABOLA_FEATURES,
  ...extra,
});
const diagnose = (question, x, y, tolerance = TOL) => rushTapDiagnosis({ question, tap: { x, y }, tolerance });

test('a wrong tap within the round\'s tolerance of another feature of the graph names it; anywhere else it names nothing', () => {
  const zeros = parabolaQuestion('xIntercept');
  assert.equal(diagnose(zeros, 0, -3), 'yIntercept', 'the y-intercept tapped when asked for the zeros');
  assert.equal(diagnose(zeros, 0.2, -3.3), 'yIntercept', 'anywhere a tap on it would have found it');
  // The edge of the reach is the hit test's: inside it names the feature, past it nothing.
  const limits = clampTolerance(TOL, VIEW);
  assert.equal(diagnose(zeros, 0.99 * limits.x, -3), 'yIntercept');
  assert.equal(diagnose(zeros, 1.01 * limits.x, -3), null);
  assert.ok(targetDistance({ x: 0, y: -3 }, { x: 1.01 * limits.x, y: -3 }, limits) > 1, 'the same distance the hit test measures');
  assert.equal(diagnose(zeros, 6, 6), null, 'nowhere near a feature');
  // Coinciding features: the vertex is named over the minimum it also is …
  assert.equal(diagnose(zeros, 1, -4), 'vertex');
  assert.equal(diagnose(parabolaQuestion('yIntercept'), 1, -4), 'vertex');
  // … except that, asked for one extreme, the other one is the slip: an
  // upward parabola's vertex tapped for its maximum is its minimum, and a
  // downward one's tapped for its minimum is its maximum.
  assert.equal(diagnose(parabolaQuestion('maximum'), 1, -4), 'minimum', 'the minimum tapped when asked for the maximum');
  const downward = parabolaQuestion('minimum', {
    graph: { kind: 'quadratic', a: -1, h: 1, k: 4 },
    graphFeatures: { xIntercept: [{ x: -1, y: 0 }, { x: 3, y: 0 }], yIntercept: [{ x: 0, y: 3 }], vertex: [{ x: 1, y: 4 }], maximum: [{ x: 1, y: 4 }] },
  });
  assert.equal(diagnose(downward, 1, 4), 'maximum', 'the maximum tapped when asked for the minimum');
  // Never the feature asked: a zero is never "a zero" on a question that asked for the zeros.
  assert.equal(diagnose(parabolaQuestion('xIntercept'), 3, 0), null);
  assert.equal(diagnose(parabolaQuestion('yIntercept'), 3, 0), 'xIntercept', 'and a zero tapped when asked for the y-intercept is named');
  // Nothing to name with: the device's copy, a practice round, an inequality.
  assert.equal(diagnose({ ...zeros, graphFeatures: undefined }, 0, -3), null);
  assert.equal(diagnose(publicRushQuestion({ ...zeros, generatorVersion: 4 }), 0, -3), null);
});

test('only what the catalog asks of the family, only in view, the nearest first — and an asymptote is a line', () => {
  // A cubic's turning point is a relative extreme: the catalog never asks a
  // cubic's maximum, so a tap on it is never "the maximum".
  const cubic = {
    questionIndex: 0, feature: 'xIntercept', family: 'cubic', view: VIEW, targets: [],
    graphFeatures: { maximum: [{ x: -2, y: 5 }], yIntercept: [{ x: 0, y: 2 }] },
  };
  assert.equal(catalogSupportsFeature('cubic', 'maximum'), false);
  assert.equal(diagnose(cubic, -2, 5), null);
  assert.equal(diagnose(cubic, 0, 2), 'yIntercept');
  // A feature past the edge of the view cannot be tapped, so it is never named.
  const wide = { ...parabolaQuestion('xIntercept'), graphFeatures: { yIntercept: [{ x: 0, y: -12 }] } };
  assert.equal(diagnose(wide, 0, -12), null);
  // The nearest of two in reach, whichever is named first when they coincide.
  const close = { ...parabolaQuestion('xIntercept'), graphFeatures: { yIntercept: [{ x: 0, y: -3 }], vertex: [{ x: 0.6, y: -3 }] } };
  assert.equal(diagnose(close, 0.5, -3, { x: 0.7, y: 0.7 }), 'vertex');
  assert.equal(diagnose(close, 0.1, -3, { x: 0.7, y: 0.7 }), 'yIntercept', 'nearer than the vertex, which is named first');
  // y = 2/(x − 3) + 1, asked for its zero: the vertical asymptote is reached anywhere along it.
  const rational = {
    questionIndex: 0, feature: 'xIntercept', family: 'rational', view: VIEW, targets: [{ id: 'x0', x: 1, y: 0 }],
    graphFeatures: {
      xIntercept: [{ x: 1, y: 0 }],
      yIntercept: [{ x: 0, y: 1 / 3 }],
      asymptote: [{ geometry: 'line', orientation: 'vertical', x: 3 }, { geometry: 'line', orientation: 'horizontal', y: 1 }],
    },
  };
  assert.equal(diagnose(rational, 3.1, 0), 'asymptote', 'where the asymptote crosses the axis');
  assert.equal(diagnose(rational, 2.9, -7), 'asymptote', 'or anywhere along it');
  assert.equal(diagnose(rational, 0, 1 / 3), 'yIntercept', 'a point is named before a line through it');
});

/* ------------------------ recorded, and only there ------------------------- */

const play = (question, attempts, { player = {}, nowMs = 60_000 } = {}) => applyRushAttempts({
  player,
  roundIndex: 0,
  roundVersion: 1,
  attempts,
  questionFor: (index) => (index === question.questionIndex ? question : null),
  arrivedAtMs: nowMs,
  arrivalElapsedMs: nowMs,
  roundDurationMs: 600_000,
  strategy: correctCountStrategy,
  poolSize: 50,
});
const tapAt = (attemptId, x, y, extra = {}) => ({ attemptId, questionIndex: 0, kind: 'tap', x, y, tolerance: TOL, pointer: 'touch', clientElapsedMs: 50_000, ...extra });

test('the server records the feature on the miss\'s receipt; the reply to the device never carries it', () => {
  const question = parabolaQuestion('xIntercept');
  const outcome = play(question, [tapAt('a1', 0.1, -3.1), tapAt('a2', 7, 7), tapAt('a3', -1, 0)]);
  assert.deepEqual(outcome.verdicts.map((row) => row.verdict), ['miss', 'miss', 'hit']);
  assert.equal(outcome.receipts.a1.diagnosis, 'yIntercept');
  assert.equal(outcome.receipts.a1.feature, 'xIntercept', 'beside what was asked');
  assert.equal(outcome.receipts.a1.isCorrect, false);
  assert.equal('diagnosis' in outcome.receipts.a2, false, 'a tap near nothing records none');
  assert.equal('diagnosis' in outcome.receipts.a3, false, 'a hit records none');
  assert.doesNotMatch(JSON.stringify(outcome.verdicts), /diagnosis|yIntercept/, 'the device is told hit or miss, never where the tap landed');
  assert.doesNotMatch(JSON.stringify(outcome.state), /diagnosis|yIntercept/);
  // "Does Not Exist" is answered with a button, not a tap: no diagnosis.
  const dne = play(parabolaQuestion('maximum'), [{ attemptId: 'd1', questionIndex: 0, kind: 'dne', clientElapsedMs: 50_000 }]);
  assert.equal(dne.receipts.d1.isCorrect, true);
  assert.equal('diagnosis' in dne.receipts.d1, false);
  // The eighth miss on a graph is diagnosed like any other; the skip it brings is not.
  let player = {};
  let last = null;
  for (let miss = 0; miss < 8; miss += 1) {
    last = play(question, [tapAt(`m${miss}`, 0, -3)], { player, nowMs: 60_000 + miss * 10_000 });
    player = { submissionReceipts: last.receipts, attemptSequence: last.attemptSequence };
  }
  assert.equal(last.verdicts[0].autoSkipped, true);
  assert.equal(last.receipts.m7.diagnosis, 'yIntercept');
  assert.equal('diagnosis' in last.receipts['m7~auto-skip'], false);
});

/*
 * The same taps, graded against the same question with and without the
 * graph's other features known: every verdict, every point, every recorded
 * time and the pace the device must keep are identical; the receipts differ
 * only by the diagnosis.
 */
test('the diagnosis never changes a verdict, a point or the timing', () => {
  const config = normalizeGraphFeatureRushConfig({ families: [...GRAPH_FAMILY_CATALOG_IDS], features: TAPPABLE, difficulty: 'mixed' });
  let diagnosed = 0;
  let misses = 0;
  for (let student = 0; student < 8; student += 1) {
    const questions = serverQuestions(`same-${student}`, 30, config);
    const stripped = questions.map((question) => {
      const copy = { ...question };
      delete copy.graphFeatures;
      return copy;
    });
    let seed = 11 + student * 37;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const attempts = [];
    // Taps on targets, on other features, near them and anywhere, in order.
    questions.forEach((question, questionIndex) => {
      const others = Object.entries(question.graphFeatures || {})
        .filter(([featureId]) => featureId !== question.feature)
        .flatMap(([, targets]) => targets.filter((target) => target.geometry !== 'line'));
      const span = { x: question.view.xMax - question.view.xMin, y: question.view.yMax - question.view.yMin };
      const tolerance = clampTolerance({ x: span.x * 0.04, y: span.y * 0.04 }, question.view);
      for (let index = 0; index < 4; index += 1) {
        const aim = others.length && random() < 0.6 ? others[Math.floor(random() * others.length)] : null;
        const x = aim ? aim.x + (random() - 0.5) * tolerance.x : question.view.xMin + random() * span.x;
        const y = aim ? aim.y + (random() - 0.5) * tolerance.y : question.view.yMin + random() * span.y;
        attempts.push({ attemptId: newAttemptId(), questionIndex, kind: 'tap', x, y, tolerance, pointer: 'touch', clientElapsedMs: 1_000 * attempts.length });
      }
      // Then the answer: every target (a line anywhere along it), or "Does Not Exist".
      if (!question.targets.length) attempts.push({ attemptId: newAttemptId(), questionIndex, kind: 'dne', clientElapsedMs: 1_000 * attempts.length });
      question.targets.forEach((target) => attempts.push({
        attemptId: newAttemptId(), questionIndex, kind: 'tap',
        x: target.geometry === 'line' ? (target.orientation === 'vertical' ? target.x : question.view.xMin + 0.3 * span.x) : target.x,
        y: target.geometry === 'line' ? (target.orientation === 'horizontal' ? target.y : question.view.yMin + 0.3 * span.y) : target.y,
        tolerance, pointer: 'mouse', clientElapsedMs: 1_000 * attempts.length,
      }));
    });
    const grade = (pool) => {
      let player = {};
      const verdicts = [];
      for (let start = 0; start < attempts.length; start += RUSH_LIMITS.batch) {
        const nowMs = 1_000 * (start + RUSH_LIMITS.batch) + 400_000;
        const outcome = applyRushAttempts({
          player, roundIndex: 0, roundVersion: 1, attempts: attempts.slice(start, start + RUSH_LIMITS.batch),
          questionFor: (index) => pool[index] || null, arrivedAtMs: nowMs, arrivalElapsedMs: nowMs, roundDurationMs: 6_000_000, strategy: correctCountStrategy, poolSize: 50,
        });
        verdicts.push(...outcome.verdicts);
        player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence, last: outcome };
      }
      return { verdicts, receipts: player.submissionReceipts || {}, last: player.last };
    };
    const withFeatures = grade(questions);
    const without = grade(stripped);
    assert.deepEqual(withFeatures.verdicts, without.verdicts, 'the same verdict for every attempt');
    const undiagnosed = Object.fromEntries(Object.entries(withFeatures.receipts).map(([id, receipt]) => {
      const copy = { ...receipt };
      if (copy.diagnosis) diagnosed += 1;
      delete copy.diagnosis;
      return [id, copy];
    }));
    assert.deepEqual(undiagnosed, without.receipts, 'the same receipts — points, times, sequence — but for the diagnosis');
    assert.equal(Object.values(without.receipts).some((receipt) => receipt.diagnosis), false);
    assert.deepEqual(withFeatures.last.state, without.last.state);
    assert.deepEqual(withFeatures.last.totals, without.last.totals);
    assert.deepEqual(rushRoundPace({ receipts: withFeatures.receipts, roundIndex: 0 }), rushRoundPace({ receipts: without.receipts, roundIndex: 0 }), 'the cooldowns and pauses the device keeps');
    misses += withFeatures.verdicts.filter((row) => row.verdict === 'miss').length;
  }
  assert.ok(diagnosed > 40, `${diagnosed} wrong taps diagnosed`);
  assert.ok(misses > diagnosed, 'and plenty of misses near nothing');
});

/* ------------------------ the device and the server ------------------------ */

/*
 * A student whose wrong taps go to the graph's other features — the
 * y-intercept for the zeros, the minimum for the maximum — plays through the
 * device session, and its queue reaches the server in random batches. The
 * device must agree with the server after every reply (no resync, the same
 * counts), the server must have diagnosed those taps, and nothing the device
 * sends or is sent back names one.
 */
test('device and server agree on taps aimed at the graph\'s other features, and only the server\'s receipts name them', () => {
  const config = normalizeGraphFeatureRushConfig({ families: ['linear', 'quadratic', 'absolute', 'exponential', 'rational', 'squareRoot'], features: ['xIntercept', 'yIntercept', 'vertex', 'maximum', 'minimum', 'asymptote'], difficulty: 'standard' });
  let resyncs = 0;
  let replies = 0;
  let diagnosed = 0;
  for (let student = 0; student < 8; student += 1) {
    const studentKey = `aim-${student}`;
    const serverQuestion = (index) => generateRushQuestion({ seed: 'aim', studentKey, roundIndex: 0, questionIndex: index, config });
    const deviceQuestions = Array.from({ length: 50 }, (_, index) => publicRushQuestion(serverQuestion(index)));
    let seed = 3 + student * 211;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: deviceQuestions, poolSize: 50 });
    let player = {};
    let now = 0;
    const deliver = () => {
      while (session.queue.length) {
        const size = 1 + Math.floor(random() * Math.min(RUSH_LIMITS.batch, session.queue.length));
        const batch = nextBatch(session).slice(0, size);
        assert.equal(batch.some((attempt) => 'diagnosis' in attempt || 'graphFeatures' in attempt), false, 'the device sends a tap, never a diagnosis');
        const outcome = applyRushAttempts({
          player, roundIndex: 0, roundVersion: 1, attempts: batch, questionFor: serverQuestion,
          arrivedAtMs: now, arrivalElapsedMs: now, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 50,
        });
        assert.doesNotMatch(JSON.stringify(outcome.verdicts), /diagnosis/, 'and is never sent one');
        player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
        const acked = acknowledge(session, { sent: batch, reply: { verdicts: outcome.verdicts, state: outcome.state } });
        replies += 1;
        if (acked.resynced) resyncs += 1;
        session = acked.session;
        if (!session.queue.length) {
          assert.deepEqual(session.counts, {
            completed: outcome.state.questionsCorrect, skipped: outcome.state.skipped, attempts: outcome.state.attempts, hits: outcome.state.hits, points: outcome.state.scoreTotal,
          });
        }
      }
    };
    for (let step = 0; step < 220 && session.cursor < 48; step += 1) {
      now += 50 + Math.floor(random() * 900);
      session = settle(session, now);
      if (inputState(session, now) === RUSH_INPUT.LOCKED) now = session.lockedUntil;
      if (inputState(session, now) !== RUSH_INPUT.READY) continue;
      const question = currentQuestion(session);
      // What the device has cannot say where the other features are; the
      // server's copy can, and this student aims there.
      const server = serverQuestion(session.cursor);
      const span = { x: question.view.xMax - question.view.xMin, y: question.view.yMax - question.view.yMin };
      const tolerance = clampTolerance({ x: span.x * 0.03, y: span.y * 0.03 }, question.view);
      const others = Object.entries(server.graphFeatures || {})
        .filter(([featureId]) => featureId !== server.feature)
        .flatMap(([, targets]) => targets.filter((target) => target.geometry !== 'line'))
        .filter((point) => point.x >= question.view.xMin && point.x <= question.view.xMax && point.y >= question.view.yMin && point.y <= question.view.yMax);
      const open = question.targets.filter((target) => !session.found.includes(target.id) && target.geometry !== 'line');
      const roll = random();
      let input;
      if (!question.targets.length && roll < 0.3) input = recordDoesNotExist(session, { nowMs: now, elapsedMs: now, attemptId: newAttemptId() });
      else {
        const aim = roll < 0.55 && others.length ? others[Math.floor(random() * others.length)] : (open[0] || null);
        const x = aim ? aim.x + (random() - 0.5) * tolerance.x : question.view.xMin + random() * span.x;
        const y = aim ? aim.y + (random() - 0.5) * tolerance.y : question.view.yMin + random() * span.y;
        input = recordTap(session, { x, y, tolerance, pointer: 'touch', nowMs: now, elapsedMs: now, attemptId: newAttemptId() });
      }
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 50, strategy: correctCountStrategy }).state), false, studentKey);
    diagnosed += Object.values(player.submissionReceipts || {}).filter((receipt) => receipt.diagnosis).length;
  }
  assert.ok(replies > 200, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
  assert.ok(diagnosed > 60, `${diagnosed} wrong taps on other features diagnosed`);
});

/* -------------------------------- the report ------------------------------- */

const tapReceipt = (index, feature, diagnosis, extra = {}) => ({
  serverConfirmed: true, receiptKind: 'targetAttempt', roundIndex: 0, questionIndex: index, sequence: index + 1, targetCount: 1, questionWeight: 1,
  feature, family: 'quadratic', tier: 'standard', attemptKind: 'tap', targetId: 'miss', isCorrect: false, completesQuestion: false,
  x: 0, y: -3, pointer: 'touch', pointsAwarded: 0, elapsedMs: 1_000 * (index + 1), ...(diagnosis ? { diagnosis } : {}), ...extra,
});
const rushPlayer = (studentId, receipts) => ({
  studentId, playerKey: `key-${studentId}`, alias: studentId, joined: true, joinedAtRound: 0, submissionReceipts: receipts, answeredRounds: [0], roundsAnswered: 1,
});

test('the report groups where wrong taps landed, by what was asked and what was tapped, beside the mistakes for sets', () => {
  const a = rushPlayer('a', {
    t1: tapReceipt(0, 'xIntercept', 'yIntercept'),
    t2: tapReceipt(1, 'xIntercept', 'yIntercept'),
    t3: tapReceipt(2, 'maximum', 'minimum'),
    t4: tapReceipt(3, 'xIntercept', null),
    // A wrong check of a set keeps its own list.
    c1: { ...tapReceipt(4, 'domain', 'leftEnd'), attemptKind: 'check', x: undefined, y: undefined },
  });
  const b = rushPlayer('b', {
    t1: tapReceipt(0, 'xIntercept', 'yIntercept'),
    t2: tapReceipt(1, 'yIntercept', 'xIntercept'),
    // Malformed: a tap "diagnosed" as the very feature asked counts nowhere.
    t3: tapReceipt(2, 'vertex', 'vertex'),
  });
  const summary = questionSetMatchSummary(a);
  assert.deepEqual(summary.wrongTaps, { xIntercept: { yIntercept: 2 }, maximum: { minimum: 1 } });
  assert.deepEqual(summary.mistakes, { leftEnd: 1 }, 'set mistakes are counted as before, and only they');
  assert.deepEqual(questionSetMatchSummary(b).wrongTaps, { xIntercept: { yIntercept: 1 }, yIntercept: { xIntercept: 1 } });
  const result = buildMatchResult({
    roomId: 'wrong-taps', status: 'finished',
    room: { challengeMode: RUSH_MODE_ID, scoringStrategyId: 'grandPrix', currentRound: 0, roundCount: 1 },
    privateState: { questionIds: ['graphFeatureRush:round:1'] },
    players: [a, b],
  });
  const report = buildRushReport(result);
  assert.deepEqual(report.wrongTaps, [
    { key: 'xIntercept:yIntercept', asked: 'xIntercept', tapped: 'yIntercept', count: 3, label: 'Tapped the y-intercept when asked for zeros (x-intercepts)' },
    { key: 'maximum:minimum', asked: 'maximum', tapped: 'minimum', count: 1, label: 'Tapped the minimum when asked for the maximum' },
    { key: 'yIntercept:xIntercept', asked: 'yIntercept', tapped: 'xIntercept', count: 1, label: 'Tapped a zero (x-intercept) when asked for the y-intercept' },
  ], 'most common first, class counts');
  assert.deepEqual(report.mistakes.map((row) => [row.key, row.count]), [['leftEnd', 1]]);
  assert.doesNotMatch(JSON.stringify(report.wrongTaps), /"a"|"b"|key-/, 'no student in the grouped rows');
  // A match result from before wrong taps were grouped, and an inequality game, have none.
  assert.deepEqual(buildRushReport({ standings: [{ studentId: 'old', questionSetSummary: { attempts: 3, hits: 1 } }] }).wrongTaps, []);
  assert.deepEqual(buildRushReport({ standings: [{ studentId: 'i', questionSetSummary: { mistakes: { signFlip: 2 } } }] }, INEQUALITY_REPORT_LABELS).wrongTaps, []);
  // Another question-set mode's diagnosis (Graph the Line's lines) stays a mistake.
  const line = questionSetMatchSummary({ submissionReceipts: { l1: { ...tapReceipt(0, null, 'slopeSign'), attemptKind: 'line' } } });
  assert.deepEqual(line.mistakes, { slopeSign: 1 });
  assert.deepEqual(line.wrongTaps, {});
});

test('every feature a student taps has words as tapped and as asked', () => {
  const tappable = GRAPH_FEATURE_IDS.filter((id) => [TARGET_GEOMETRY.POINT, TARGET_GEOMETRY.LINE].includes(getGraphFeature(id).geometry));
  assert.deepEqual([...tappable].sort(), [...TAPPABLE].sort());
  tappable.forEach((id) => {
    assert.ok(WRONG_TAP_WORDS.tapped[id], `${id} as tapped`);
    assert.ok(WRONG_TAP_WORDS.asked[id], `${id} as asked`);
  });
  assert.equal(wrongTapLabel(GRAPH_FEATURE.ASYMPTOTE, GRAPH_FEATURE.VERTEX), 'Tapped the vertex when asked for asymptotes');
  assert.equal(wrongTapLabel(GRAPH_FEATURE.X_INTERCEPT, GRAPH_FEATURE.ASYMPTOTE), 'Tapped an asymptote when asked for zeros (x-intercepts)');
});

test('the teacher\'s report shows them; no screen a student or the class sees reads them', () => {
  const host = executableSource(read('src/components/liveChallenge/GraphFeatureRushHost.jsx'));
  const report = region(host, 'export function RushReport', '\n}\n', 'the rush report');
  // One table row for each place wrong taps landed: what was tapped for what
  // was asked, then how often (rendered row by row in rushReportAccessibility.test.mjs).
  const block = region(report, '<RushReportTable block="wrongTaps"', '/>', 'the block of wrong taps');
  assert.match(block, /rows=\{rush\.wrongTaps\}/, 'one row for each place wrong taps landed');
  assert.match(block, /value=\{count\}/, 'and how often');
  assert.match(report, /const count = \(row\) => row\.count;/);
  assert.match(report, /!inequality && rush\.wrongTaps\?\.length > 0/, 'a rush with taps; an inequality game has none');
  // The report is the console's (ChallengeReport) and never the projector's or a student's.
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(region(teacher, 'function ChallengeReport({ report })', '\n}\n', 'the console report'), /<RushReport report=\{report\} \/>/);
  for (const screen of ['LiveChallengeArenaProjector.jsx', 'LiveChallengeStudent.jsx', 'GraphFeatureRushRound.jsx', 'ChallengeStudentShell.jsx']) {
    const source = executableSource(read(`src/components/liveChallenge/${screen}`));
    assert.doesNotMatch(source, /RushReport|wrongTaps|graphFeatures|\.diagnosis\b/, screen);
  }
});
