import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { catalogSupportsFeature } from '../../functions/shared/graphFeatureCatalog.mjs';
import { FEATURE_STATUS, familyVariants, getGraphFamily, listGraphFamilies } from '../../functions/shared/graphFeatureFamilies.mjs';
import { generateQuestionForSlot, generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { FEATURE_READING, rushReadingGuide } from '../../functions/shared/graphFeatureReading.mjs';
import {
  GRAPH_FEATURE,
  INTERVAL_FEATURE_IDS,
  QUESTION_TIER,
  QUESTION_TIER_ORDER,
  SET_FEATURE_AXIS,
  getGraphFeature,
  isIntervalFeature,
  isSetFeature,
} from '../../functions/shared/graphFeatureRegistry.mjs';
import { applyRushAttempts } from '../../functions/shared/graphFeatureRush.mjs';
import { getRushPreset, normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_ATTEMPT_KIND, RUSH_SET_AUTO_SKIP_MISSES, isNumberLineQuestion, rushAutoSkipMisses } from '../../functions/shared/graphFeatureRushRules.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import * as N from '../../functions/shared/numberLineSets.mjs';
import { axisSetDrawing, graphDrawing, setLandmarks, setStops, setTapAt } from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  RUSH_FEEDBACK,
  RUSH_INPUT,
  acknowledge,
  answerDrawing,
  createRushSession,
  currentQuestion,
  differsFromServer,
  drawingReady,
  feedbackMessage,
  inputState,
  isSetQuestion,
  lineNotation,
  newAttemptId,
  nextBatch,
  recordCheck,
  recordDoesNotExist,
  recordSetTap,
  recordSkip,
  settle,
} from '../../src/platform/liveChallenge/rushSession.js';
import { rushCreateRequest, rushSetupFromPreset } from '../../src/platform/liveChallenge/rushSetupModel.js';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * WHERE A GRAPH RISES, FALLS OR STAYS LEVEL, AND WHERE IT IS ABOVE OR BELOW
 * THE x-AXIS: five interval features, each a set of x marked on the graph
 * exactly as a domain is, any of which can be empty ("Does Not Exist").
 *
 * Every generated answer is found again from the curve alone in
 * graphFeatureRushMath (the oracle samples every sixteenth from −16 to 16).
 * Here: the conventions on graphs a teacher would draw on the board, the
 * "Does Not Exist" question playing exactly like the rest, a perfect student
 * in exactly the points each item is worth, device and server agreeing on
 * random play, and the presets and guide that bring the features to a class.
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const r = (n, d = 1) => Q.rat(n, d);
const answers = (family, params) => {
  const analysis = getGraphFamily(family).analyze(params);
  return Object.fromEntries(INTERVAL_FEATURE_IDS.map((id) => {
    const entry = analysis[id];
    return [id, entry.status === FEATURE_STATUS.EXISTS ? N.intervalNotation(entry.points[0].set) : entry.status];
  }));
};
const slotQuestion = (family, feature, variant, tier, seedText = 'intervals') => generateQuestionForSlot({ slot: { family, feature, variant, tier }, seedText });
const freshSession = (question) => createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [{ ...question, questionIndex: 0 }, { ...question, questionIndex: 1 }], poolSize: 2 });
const serverPlay = (server, attempts, { player = {} } = {}) => applyRushAttempts({
  player,
  roundIndex: 0,
  roundVersion: 1,
  attempts,
  questionFor: (index) => (index <= 1 ? { ...server, questionIndex: index } : null),
  arrivedAtMs: 600_000,
  arrivalElapsedMs: 600_000,
  roundDurationMs: 900_000,
  strategy: correctCountStrategy,
  poolSize: 2,
});

/* ------------------------------- the features ------------------------------- */

test('five interval features: sets of x on the x-axis, asked as "Mark where it is …", and any of them can be empty', () => {
  assert.deepEqual([...INTERVAL_FEATURE_IDS], ['increasing', 'decreasing', 'constant', 'positive', 'negative']);
  for (const id of INTERVAL_FEATURE_IDS) {
    const feature = getGraphFeature(id);
    assert.deepEqual([feature.geometry, feature.canNotExist, feature.multiTarget], ['set', true, false], id);
    assert.equal(feature.vocabulary[0].prompt, `Mark where it is ${id}`);
    assert.equal(feature.label, `${id} intervals`);
    assert.equal(SET_FEATURE_AXIS[id], 'x');
    assert.ok(isSetFeature(id) && isIntervalFeature(id));
  }
  assert.ok(!isIntervalFeature('domain') && isSetFeature('domain') && SET_FEATURE_AXIS.range === 'y');
});

test('the conventions a class writes: open where it turns or stops, a zero never positive, a closed end kept, one interval through a flat point', () => {
  // A parabola: falling to its vertex, rising after; between its zeros below the axis.
  assert.deepEqual(answers('quadratic', { a: r(1), h: r(1), k: r(-4) }), {
    increasing: '(1, ∞)', decreasing: '(−∞, 1)', constant: 'none', positive: '(−∞, −1) ∪ (3, ∞)', negative: '(−1, 3)',
  });
  // Touching the axis at its vertex: positive everywhere but there.
  assert.deepEqual(answers('quadratic', { a: r(1), h: r(2), k: r(0) }).positive, '(−∞, 2) ∪ (2, ∞)');
  // A segment: open at both ends for which way it goes, a closed end kept for its sign.
  const segment = { m: r(-1), b: r(2), domain: { from: { x: r(-3), closed: true }, to: { x: r(4), closed: false } } };
  assert.deepEqual(answers('linear', segment), { increasing: 'none', decreasing: '(−3, 4)', constant: 'none', positive: '[−3, 2)', negative: '(2, 4)' });
  // A level line is constant everywhere, and positive everywhere above the axis.
  assert.deepEqual(answers('linear', { m: r(0), b: r(3) }), { increasing: 'none', decreasing: 'none', constant: '(−∞, ∞)', positive: '(−∞, ∞)', negative: 'none' });
  // A square root from (−4, −2): rising from its start (open there); below the axis from it (closed).
  assert.deepEqual(answers('squareRoot', { a: r(1), s: 1, h: r(-4), k: r(-2) }), {
    increasing: '(−4, ∞)', decreasing: 'none', constant: 'none', positive: '(0, ∞)', negative: '[−4, 0)',
  });
  // (x − 1)³ rises through its flat point: one interval. (x + 2)²(x − 1) turns at −2 and 0.
  assert.equal(answers('cubic', { a: r(1), roots: [r(1), r(1), r(1)], quadratic: null }).increasing, '(−∞, ∞)');
  assert.deepEqual(answers('cubic', { a: r(1), roots: [r(-2), r(-2), r(1)], quadratic: null }), {
    increasing: '(−∞, −2) ∪ (0, ∞)', decreasing: '(−2, 0)', constant: 'none', positive: '(1, ∞)', negative: '(−∞, −2) ∪ (−2, 1)',
  });
  // Turning at irrational x (±√3): never asked which way it goes.
  assert.equal(answers('cubic', { a: r(1), roots: [r(-3), r(0), r(3)], quadratic: null }).increasing, FEATURE_STATUS.INEXACT);
  // A cube root rises through its steep center: one interval.
  assert.equal(answers('cubeRoot', { a: r(1), h: r(1), k: r(0) }).increasing, '(−∞, ∞)');
  // A rational falls on both branches: two intervals, never joined across the asymptote.
  assert.deepEqual(answers('rational', { a: r(2), h: r(1), k: r(1) }), {
    increasing: 'none', decreasing: '(−∞, 1) ∪ (1, ∞)', constant: 'none', positive: '(−∞, −1) ∪ (1, ∞)', negative: '(−1, 1)',
  });
  // Exponentials grow or decay everywhere.
  assert.equal(answers('exponential', { a: r(-1), base: r(1, 2), h: r(0), k: r(2) }).increasing, '(−∞, ∞)');
  // A piecewise rise then level: the split is in neither; its owned end keeps its sign.
  const riseThenLevel = { s: r(1), pieces: [{ m: r(2), b: r(0), from: null, to: { x: r(1), closed: true } }, { m: r(0), b: r(-1), from: { x: r(1), closed: false }, to: null }] };
  assert.deepEqual(answers('piecewise', riseThenLevel), { increasing: '(−∞, 1)', decreasing: 'none', constant: '(1, ∞)', positive: '(0, 1]', negative: '(−∞, 0) ∪ (1, ∞)' });
  // Two rising pieces across a jump: one interval to some classes, two to others — never asked.
  const jump = { s: r(1), pieces: [{ m: r(1), b: r(0), from: null, to: { x: r(1), closed: false } }, { m: r(1), b: r(2), from: { x: r(1), closed: true }, to: null }] };
  assert.equal(answers('piecewise', jump).increasing, FEATURE_STATUS.AMBIGUOUS);
  assert.equal(answers('piecewise', jump).positive, '(0, ∞)', 'its sign is still plain');
  // Joined where the pieces meet going the same way.
  const corner = { s: r(0), pieces: [{ m: r(-1), b: r(2), from: null, to: { x: r(0), closed: true } }, { m: r(2), b: r(2), from: { x: r(0), closed: false }, to: null }] };
  assert.deepEqual([answers('piecewise', corner).decreasing, answers('piecewise', corner).positive], ['(−∞, 0)', '(−∞, ∞)']);
});

test('every family asks the intervals it has, the catalog says from which difficulty, and "constant" is never asked of a curve', () => {
  for (const family of listGraphFamilies()) {
    for (const feature of INTERVAL_FEATURE_IDS) {
      for (const tier of QUESTION_TIER_ORDER) {
        const real = familyVariants(family.id, feature, tier).some((entry) => entry.exists);
        assert.equal(catalogSupportsFeature(family.id, feature, tier), real, `${family.id} ${feature} ${tier}`);
      }
    }
  }
  const constant = listGraphFamilies().filter((family) => catalogSupportsFeature(family.id, GRAPH_FEATURE.CONSTANT)).map((family) => family.id);
  assert.deepEqual(constant, ['linear', 'piecewise'], 'only a level line or a level piece');
  // Algebra I at Easy: lines, parabolas, absolute values and exponentials rise and fall.
  for (const family of ['linear', 'quadratic', 'absolute', 'exponential']) {
    assert.ok(catalogSupportsFeature(family, GRAPH_FEATURE.INCREASING, QUESTION_TIER.EASY), family);
    assert.ok(catalogSupportsFeature(family, GRAPH_FEATURE.DECREASING, QUESTION_TIER.EASY), family);
  }
});

/* ------------------------- "Does Not Exist" plays alike ------------------------- */

test('a "Does Not Exist" interval question plays exactly like the rest: set controls, points to tap, three misses, and its own words', () => {
  const server = slotQuestion('quadratic', GRAPH_FEATURE.CONSTANT, 'none', QUESTION_TIER.STANDARD, 'never-level');
  const question = publicRushQuestion(server);
  assert.deepEqual([question.targets.length, question.setAxis, question.weight], [0, 'x', 1], 'no target, its axis, one press');
  assert.ok(question.landmarks.length > 0, 'the same points to tap as any interval question');
  assert.ok(isSetQuestion(question) && isNumberLineQuestion(question) && isNumberLineQuestion(server));
  assert.equal(rushAutoSkipMisses(question), RUSH_SET_AUTO_SKIP_MISSES, 'three misses, like every set question');
  assert.equal(rushAutoSkipMisses(server), RUSH_SET_AUTO_SKIP_MISSES, 'on the server too');
  // A tap on the vertex drops a dot, as on any question.
  const vertex = setLandmarks(question).find((point) => point.x === question.graph.h);
  const hit = setTapAt({ question, drawing: graphDrawing(question), x: vertex.x, y: vertex.y, tolerance: { x: 0.2, y: 0.2 } });
  assert.deepEqual([hit.kind, hit.value], ['value', question.graph.h]);
  // A drawing checked is a miss with a nudge to test it — on the device and the server alike.
  let session = freshSession(question);
  session = recordSetTap(session, { hit, nowMs: 0 }).session;
  session = Object.freeze({ ...session, drawing: N.toggleArrow(session.drawing, 'right') });
  assert.ok(drawingReady(session));
  assert.deepEqual(axisSetDrawing(question, session.drawing).axis, 'x', 'the drawing shows on the x-axis');
  const checked = recordCheck(session, { nowMs: 10, elapsedMs: 10, attemptId: 'c1' });
  assert.equal(checked.session.feedback.kind, RUSH_FEEDBACK.MISS);
  assert.equal(feedbackMessage(checked.session.feedback, question), 'Check a part you marked: is the graph level there?');
  const reply = serverPlay(server, [checked.attempt]);
  assert.equal(reply.receipts.c1.isCorrect, false);
  assert.equal(differsFromServer(checked.session, reply.state), false, 'the server agrees');
  // "Does Not Exist" is right: one point, in its own words.
  const pressed = recordDoesNotExist(freshSession(question), { nowMs: 0, elapsedMs: 0, attemptId: 'd1' });
  assert.equal(pressed.session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(feedbackMessage(pressed.session.feedback, question), 'Correct — it is never constant.');
  assert.equal(pressed.session.counts.points, 1);
  assert.equal(serverPlay(server, [pressed.attempt]).receipts.d1.pointsAwarded, 1);
  // The third miss shows the answer: an empty axis, said in words.
  let missing = checked.session;
  for (const id of ['c2', 'c3']) {
    const now = Math.max(missing.lockedUntil, 20);
    missing = recordCheck(Object.freeze({ ...missing, drawing: session.drawing }), { nowMs: now, elapsedMs: now, attemptId: id }).session;
  }
  assert.equal(missing.feedback.kind, RUSH_FEEDBACK.AUTO_SKIPPED);
  assert.equal(feedbackMessage(missing.feedback, question), 'It is never constant. Next graph.');
  assert.deepEqual(answerDrawing(question), N.EMPTY_DRAWING);
  assert.deepEqual(lineNotation(question, null, { revealing: true }), ['never constant', '∅']);
});

test('an interval that exists: "Does Not Exist" is a miss in its own words, and the answer is read back and revealed in both notations', () => {
  const server = slotQuestion('linear', GRAPH_FEATURE.POSITIVE, 'ray', QUESTION_TIER.EASY, 'above');
  const question = publicRushQuestion(server);
  const answer = N.setFromPlain(question.targets[0].set);
  const pressed = recordDoesNotExist(freshSession(question), { nowMs: 0, elapsedMs: 0, attemptId: 'd1' });
  assert.equal(feedbackMessage(pressed.session.feedback, question), 'It is positive somewhere — look again.');
  const right = recordCheck(Object.freeze({ ...freshSession(question), drawing: N.drawingForSet(answer) }), { nowMs: 0, elapsedMs: 0, attemptId: 'r1' });
  assert.equal(feedbackMessage(right.session.feedback, question), `Correct — ${N.inequalityNotation(answer, 'x')} · ${N.intervalNotation(answer)}.`);
  let missing = freshSession(question);
  const wrong = N.drawingForSet(N.ALL_REALS);
  for (const id of ['w1', 'w2', 'w3']) {
    const now = Math.max(missing.lockedUntil, 1);
    missing = recordCheck(Object.freeze({ ...missing, drawing: wrong }), { nowMs: now, elapsedMs: now, attemptId: id }).session;
  }
  assert.equal(feedbackMessage(missing.feedback, question), `Positive: ${N.inequalityNotation(answer, 'x')} · ${N.intervalNotation(answer)}. Next graph.`);
});

/* ----------------------- a perfect student, and the server ----------------------- */

const DEALT = (() => {
  const dealt = [];
  const configs = [
    normalizeGraphFeatureRushConfig({ presetId: 'algebra1Intervals' }),
    normalizeGraphFeatureRushConfig({ presetId: 'intervals' }),
    normalizeGraphFeatureRushConfig({ families: listGraphFamilies().map((family) => family.id), features: [...INTERVAL_FEATURE_IDS], difficulty: 'challenge' }),
  ];
  configs.forEach((config, which) => {
    for (let student = 0; student < 6; student += 1) {
      for (let questionIndex = 0; questionIndex < 30; questionIndex += 1) {
        const server = generateRushQuestion({ seed: `intervals-${which}`, studentKey: `s${student}`, roundIndex: 0, questionIndex, config });
        dealt.push({ server, question: publicRushQuestion(server), where: `${config.difficulty} s${student} #${questionIndex} ${server.family} ${server.feature} ${server.variant}` });
      }
    }
  });
  return dealt;
})();

test('a perfect student answers every interval question from the graph alone — taps at the keyboard\'s stops, or "Does Not Exist" — in exactly its points', () => {
  const kinds = new Set();
  let none = 0;
  for (const { server, question, where } of DEALT) {
    assert.ok(isIntervalFeature(question.feature), where);
    kinds.add(question.feature);
    let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [{ ...question, questionIndex: 0 }], poolSize: 1 });
    let attempt;
    let taps = 0;
    if (!question.targets.length) {
      none += 1;
      ({ session, attempt } = recordDoesNotExist(session, { nowMs: 0, elapsedMs: 4_000, attemptId: 'perfect' }));
      taps = 1;
    } else {
      const picture = graphDrawing(question);
      const stops = setStops(question, picture).map((stop) => ({ stop, hit: setTapAt({ question, drawing: picture, x: stop.x, y: stop.y, tolerance: { x: 0.01 * (question.view.xMax - question.view.xMin), y: 0.01 * (question.view.yMax - question.view.yMin) } }) }));
      const drawing = N.drawingForSet(N.setFromPlain(question.targets[0].set));
      const plan = [];
      drawing.points.forEach((point) => {
        const at = stops.find((entry) => entry.hit?.kind === 'value' && entry.hit.value === point.value);
        assert.ok(at, `${where}: a stop for ${point.value}`);
        plan.push(at.hit, ...(point.closed ? [] : [at.hit]));
      });
      ['left', 'right'].filter((side) => drawing[side]).forEach((side) => {
        const at = stops.find((entry) => entry.hit?.kind === 'arrow' && entry.hit.side === side);
        assert.ok(at, `${where}: an arrow ${side}`);
        plan.push(at.hit);
      });
      plan.forEach((hit) => { session = recordSetTap(session, { hit, nowMs: 0 }).session; });
      ({ session, attempt } = recordCheck(session, { nowMs: 0, elapsedMs: 4_000, attemptId: 'perfect' }));
      taps = plan.length + N.SET_CHECK_TAPS;
    }
    assert.equal(taps, question.weight, `${where}: taps`);
    assert.equal(session.feedback.kind, RUSH_FEEDBACK.COMPLETE, where);
    assert.equal(session.counts.points, question.weight, where);
    const outcome = applyRushAttempts({
      player: {}, roundIndex: 0, roundVersion: 1, attempts: [attempt],
      questionFor: (index) => (index === 0 ? { ...server, questionIndex: 0 } : null),
      arrivedAtMs: 4_000, arrivalElapsedMs: 4_000, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 1,
    });
    assert.deepEqual([outcome.receipts.perfect.isCorrect, outcome.receipts.perfect.pointsAwarded], [true, question.weight], `${where}: the server`);
  }
  assert.deepEqual([...kinds].sort(), [...INTERVAL_FEATURE_IDS].sort(), 'every interval feature is dealt');
  assert.ok(none > 10, `"Does Not Exist" comes up (${none} times)`);
});

test('device and server agree on every step of random play on interval questions', () => {
  const config = normalizeGraphFeatureRushConfig({ presetId: 'intervals' });
  let replies = 0;
  let resyncs = 0;
  let checks = 0;
  for (let student = 0; student < 6; student += 1) {
    const studentKey = `agree-int-${student}`;
    const serverQuestion = (index) => generateRushQuestion({ seed: 'agree-int', studentKey, roundIndex: 0, questionIndex: index, config });
    const questions = Array.from({ length: 30 }, (_, index) => publicRushQuestion(serverQuestion(index)));
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
      const roll = random();
      const answer = question.targets.length ? N.setFromPlain(question.targets[0].set) : null;
      let input;
      if (roll < 0.05) input = recordSkip(session, context);
      else if (roll < 0.25) input = answer ? { session: Object.freeze({ ...session, drawing: N.drawingForSet(answer) }) } : recordDoesNotExist(session, context);
      else if (roll < 0.35) input = recordDoesNotExist(session, context);
      else if (roll < 0.75) {
        const { view } = question;
        const picture = graphDrawing(question);
        const stops = setStops(question, picture);
        const spot = stops.length && random() < 0.75 ? stops[Math.floor(random() * stops.length)] : { x: view.xMin + random() * (view.xMax - view.xMin), y: view.yMin + random() * (view.yMax - view.yMin) };
        input = recordSetTap(session, { hit: setTapAt({ question, drawing: picture, x: spot.x, y: spot.y, tolerance: { x: 0.03 * (view.xMax - view.xMin), y: 0.03 * (view.yMax - view.yMin) } }), nowMs: now });
      } else if (drawingReady(session)) { input = recordCheck(session, context); checks += 1; }
      else input = recordSkip(session, context);
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 30, strategy: correctCountStrategy }).state), false, studentKey);
  }
  assert.ok(checks > 40, `${checks} checks`);
  assert.ok(replies > 80, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
});

/* ---------------------------- presets and guide ---------------------------- */

test('two presets bring the intervals to a class, accepted unchanged; the Algebra I one plays at Easy with every interval there to find', () => {
  for (const id of ['intervals', 'algebra1Intervals']) {
    const preset = getRushPreset(id);
    const accepted = normalizeGraphFeatureRushConfig(rushCreateRequest(rushSetupFromPreset(preset)).graphFeatureRush);
    assert.equal(accepted.presetId, id);
    assert.ok(preset.features.every(isIntervalFeature), id);
  }
  assert.deepEqual([...getRushPreset('intervals').features], [...INTERVAL_FEATURE_IDS]);
  const algebra1 = getRushPreset('algebra1Intervals');
  assert.deepEqual([algebra1.difficulty, algebra1.course, [...algebra1.features]], ['easy', 'algebra1', ['increasing', 'decreasing', 'positive', 'negative']]);
});

test('the reading guide reads each interval in one short line, and names them all on its "Does Not Exist" line', () => {
  for (const id of INTERVAL_FEATURE_IDS) {
    assert.ok(FEATURE_READING[id].line.length <= 100 && FEATURE_READING[id].slip.length <= 80, id);
  }
  assert.match(FEATURE_READING.increasing.line, /left to right/);
  assert.match(FEATURE_READING.positive.line, /zero is left out/);
  const guide = rushReadingGuide({ features: [...INTERVAL_FEATURE_IDS], difficulty: 'standard' }).solutionReview;
  assert.equal(guide.reasoning.length, 6, 'five lines and the answers line');
  assert.match(guide.reasoning.at(-1), /^If the graph has no increasing intervals, decreasing intervals, constant intervals, positive intervals or negative intervals, choose Does Not Exist\./);
});

test('the round offers "Does Not Exist" on every interval question and says so in its hint; the setup lists the new features', () => {
  const round = executableSource(read('src/components/liveChallenge/GraphFeatureRushRound.jsx'));
  assert.match(round, /const setCanBeEmpty = setQuestion && \(inequalityItem \|\| getGraphFeature\(question\?\.feature\)\?\.canNotExist === true\);/);
  assert.match(round, /\$\{setCanBeEmpty \? ' Nowhere\? Does Not Exist\.' : ''\}/);
  assert.match(round, /const vertical = setAxisOf\(question\) === 'y';/, 'the axis from the question, target or not');
  assert.match(read('src/components/liveChallenge/GraphFeatureRushSetup.jsx'), /\{GRAPH_FEATURE_IDS\.map\(\(id\) => \(/, 'every registered feature is offered');
  assert.equal(RUSH_ATTEMPT_KIND.CHECK, 'check');
});
