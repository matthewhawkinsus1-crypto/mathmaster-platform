import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { graphAsymptotes } from '../../functions/shared/graphFeatureCurves.mjs';
import { generateQuestionForSlot, generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { GRAPH_FEATURE, QUESTION_TIER } from '../../functions/shared/graphFeatureRegistry.mjs';
import { applyRushAttempts } from '../../functions/shared/graphFeatureRush.mjs';
import { normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_MAX_QUESTION_WEIGHT, rushQuestionWeight } from '../../functions/shared/graphFeatureRushRules.mjs';
import { NUMBER_LINE } from '../../functions/shared/inequalityRush.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import * as N from '../../functions/shared/numberLineSets.mjs';
import { describeLineCursor, lineCursorEnd, lineEndAtPixel, moveLineCursor, numberLineLayout } from '../../src/platform/liveChallenge/numberLineModel.js';
import {
  SET_TAP_TIP,
  describeSetStop,
  graphDrawing,
  graphPointAt,
  setAxisOf,
  setLandmarks,
  setStopAfter,
  setStops,
  setTapAt,
} from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  RUSH_FEEDBACK,
  createRushSession,
  drawingReady,
  feedbackMessage,
  lineNotation,
  recordCheck,
  recordSetTap,
} from '../../src/platform/liveChallenge/rushSession.js';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * A DOMAIN OR RANGE IS TAPPED ON THE GRAPH ITSELF — no bar of arrow buttons.
 *
 * Every graph shows where it goes: an arrow where it runs off the screen, a
 * dot where it starts or stops. So a student taps one of the graph's arrows
 * for "keeps going" (−∞ or ∞ along the axis asked about), and a point where
 * the graph starts, stops, turns or crosses — or an asymptote — for a number
 * (rushGraphModel.setTapAt). The drawing builds on the axis as before, with
 * both notations under it, and ✓ Check sends it.
 *
 * These tests hold that the arrows tell the truth (the set keeps going
 * exactly where an arrow heads), that every answer can be built from taps on
 * the graph alone — and from the keyboard's stops alone — in exactly the
 * taps the item is worth, and that the server agrees with every one.
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const FAMILIES = ['linear', 'quadratic', 'absolute', 'cubic', 'exponential', 'squareRoot', 'cubeRoot', 'rational', 'piecewise'];
const slotQuestion = (family, feature, variant, tier, seedText = 'tap') => publicRushQuestion(generateQuestionForSlot({ slot: { family, feature, variant, tier }, seedText }));
const setOf = (question) => N.setFromPlain(question.targets.find((target) => target.geometry === 'set').set);
const spanOf = (question) => ({ x: question.view.xMax - question.view.xMin, y: question.view.yMax - question.view.yMin });
// A careful tap: 1% of the view each way.
const precise = (question) => ({ x: 0.01 * spanOf(question).x, y: 0.01 * spanOf(question).y });
const tapAt = (question, point, tolerance = precise(question)) => setTapAt({ question, drawing: graphDrawing(question), x: point.x, y: point.y, tolerance });
const tipOf = (question, arrow) => graphPointAt(question.view, arrow.u, arrow.v);
const session1 = (question) => createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [{ ...question, questionIndex: 0 }], poolSize: 1 });

// Every domain and range a game deals: every family, every difficulty.
const DEALT = (() => {
  const dealt = [];
  for (const difficulty of ['easy', 'standard', 'challenge']) {
    const config = normalizeGraphFeatureRushConfig({ families: FAMILIES, features: [GRAPH_FEATURE.DOMAIN, GRAPH_FEATURE.RANGE], difficulty });
    for (let student = 0; student < 8; student += 1) {
      for (let questionIndex = 0; questionIndex < 30; questionIndex += 1) {
        const server = generateRushQuestion({ seed: `tap-${difficulty}`, studentKey: `s${student}`, roundIndex: 0, questionIndex, config });
        dealt.push({ server, question: publicRushQuestion(server), where: `${difficulty} s${student} #${questionIndex} ${server.family} ${server.feature} ${server.variant}` });
      }
    }
  }
  return dealt;
})();

/* ------------------------------ the arrows ------------------------------ */

test('every arrow tells the truth: a set keeps going exactly where one of the graph\'s arrows heads along its axis', () => {
  const families = new Set();
  for (const { question, where } of DEALT) {
    families.add(question.family);
    const set = setOf(question);
    const axis = setAxisOf(question);
    const arrows = graphDrawing(question).arrows;
    const heads = (direction) => arrows.some((arrow) => arrow.heads[axis] === direction);
    assert.equal(heads(-1), set.length > 0 && set[0].lo === null, `${where}: toward −∞`);
    assert.equal(heads(1), set.length > 0 && set[set.length - 1].hi === null, `${where}: toward ∞`);
    assert.ok(arrows.every((arrow) => typeof arrow.id === 'string' && arrow.heads), where);
  }
  assert.deepEqual([...families].sort(), [...FAMILIES].sort(), 'every family deals a domain or a range');
});

test('every point a student can tap drops a dot: none between half-units along the set\'s axis', () => {
  for (const { question, where } of DEALT) {
    const axis = setAxisOf(question);
    assert.ok(Array.isArray(question.landmarks), where);
    assert.ok(question.landmarks.every((point) => N.onDrawingGrid(point[axis])), where);
    assert.equal(setLandmarks(question).length, question.landmarks.filter((point) => point.x >= question.view.xMin && point.x <= question.view.xMax && point.y >= question.view.yMin && point.y <= question.view.yMax).length, where);
  }
  // A point from elsewhere (an older question) that could not be drawn is no landmark at all.
  const odd = { targets: [{ id: 'dom', geometry: 'set', axis: 'x', set: [[null, false, null, false]] }], view: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, landmarks: [{ x: 2.25, y: 0, closed: true }, { x: 2, y: 1, closed: true }] };
  assert.deepEqual(setLandmarks(odd).map((point) => point.x), [2]);
});

/* ---------------------------- what a tap means ---------------------------- */

test('a point is its number (x for a domain, y for a range), an arrow its infinity, and a tap on nothing says so without counting', () => {
  const domain = slotQuestion('squareRoot', GRAPH_FEATURE.DOMAIN, 'endpoint', QUESTION_TIER.EASY, 'tap-meaning');
  const { h, k, s, a } = domain.graph;
  const start = setLandmarks(domain).find((point) => point.x === h && point.y === k);
  assert.ok(start, 'the square root\'s start is a landmark');
  assert.deepEqual(tapAt(domain, start), { kind: 'value', value: h, point: start });
  const [arrow] = graphDrawing(domain).arrows;
  assert.deepEqual(tapAt(domain, tipOf(domain, arrow)), { kind: 'arrow', id: arrow.id, side: s > 0 ? 'right' : 'left' });
  // The same graph's range: the start's y, and the arrow up or down.
  const range = { ...domain, targets: [{ id: 'ran', geometry: 'set', axis: 'y', set: [[k, true, null, false]] }] };
  assert.deepEqual(tapAt(range, start), { kind: 'value', value: k, point: start });
  assert.equal(tapAt(range, tipOf(range, arrow)).side, a > 0 ? 'right' : 'left', 'up is toward ∞ on the y-axis');
  // Nothing in reach: the corner farthest from every landmark and arrow tip.
  const spots = [...setLandmarks(domain), ...graphDrawing(domain).arrows.map((entry) => tipOf(domain, entry))];
  const { view } = domain;
  const corners = [[view.xMin, view.yMin], [view.xMin, view.yMax], [view.xMax, view.yMin], [view.xMax, view.yMax]]
    .map(([x, y]) => ({ x: x + (x === view.xMin ? 0.05 : -0.05) * spanOf(domain).x, y: y + (y === view.yMin ? 0.05 : -0.05) * spanOf(domain).y }));
  const lonely = [...corners].sort((p, q) => Math.min(...spots.map((spot) => Math.hypot(q.x - spot.x, q.y - spot.y))) - Math.min(...spots.map((spot) => Math.hypot(p.x - spot.x, p.y - spot.y))))[0];
  const nothing = tapAt(domain, lonely);
  assert.deepEqual(nothing, { kind: 'tip', tip: SET_TAP_TIP.NOTHING });
  const session = session1(domain);
  const told = recordSetTap(session, { hit: nothing, nowMs: 0 });
  assert.equal(told.attempt, null, 'never sent');
  assert.equal(told.session.feedback.kind, RUSH_FEEDBACK.TIP);
  assert.deepEqual([told.session.counts.attempts, told.session.missesOnGraph, told.session.missesInARow], [0, 0, 0], 'never a miss');
  assert.deepEqual(told.session.drawing, N.EMPTY_DRAWING);
  assert.match(feedbackMessage(told.session.feedback, domain), /Tap an arrow for "keeps going", or a point where the graph starts, stops, turns or crosses\./);
});

test('an asymptote is a number on its own axis and a tip on the other; an arrow that levels off is "heads nowhere" in a range', () => {
  const range = slotQuestion('rational', GRAPH_FEATURE.RANGE, 'allButOne', QUESTION_TIER.STANDARD, 'tap-asymptote');
  const { vertical: [h], horizontal: [k] } = graphAsymptotes(range.graph);
  const middleY = (range.view.yMin + range.view.yMax) / 2;
  const awayFromK = k < middleY ? k + 0.3 * spanOf(range).y : k - 0.3 * spanOf(range).y;
  const awayFromH = h < 0 ? h + 0.3 * spanOf(range).x : h - 0.3 * spanOf(range).x;
  assert.deepEqual(tapAt(range, { x: awayFromH, y: k }), { kind: 'value', value: k, asymptote: 'horizontal' });
  const across = tapAt(range, { x: h, y: awayFromK });
  assert.equal(across.tip, SET_TAP_TIP.OTHER_AXIS);
  assert.match(feedbackMessage({ kind: RUSH_FEEDBACK.TIP, tip: across.tip, line: across.line }, range), /^x = −?\d+(\.5)? marks an x-value — this set is on the y-axis\.$/);
  const domain = { ...range, targets: [{ id: 'dom', geometry: 'set', axis: 'x', set: N.setToPlain(N.allExcept(h)) }] };
  assert.deepEqual(tapAt(domain, { x: h, y: awayFromK }), { kind: 'value', value: h, asymptote: 'vertical' });
  assert.equal(tapAt(domain, { x: awayFromH, y: k }).tip, SET_TAP_TIP.OTHER_AXIS);
  // Beside the vertical asymptote a branch's arrow heads up or down, not sideways:
  // in reach of the asymptote the tap is its number (a meaning wins); out of reach it says so.
  // y = 4/(x − 2) + 1 leaves the top at x = 2 + 4/9 and the bottom at x = 2 − 4/11.
  const branches = {
    feature: GRAPH_FEATURE.DOMAIN,
    graph: { kind: 'rational', a: 4, h: 2, k: 1 },
    view: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 2, yStep: 2 },
    targets: [{ id: 'dom', geometry: 'set', axis: 'x', set: N.setToPlain(N.allExcept(2)) }],
    landmarks: [],
  };
  const beside = graphDrawing(branches).arrows.filter((arrow) => arrow.heads.x === 0);
  assert.equal(beside.length, 2, 'one up, one down, both beside x = 2');
  beside.forEach((arrow) => {
    const tip = tipOf(branches, arrow);
    const gap = Math.abs(tip.x - 2);
    assert.ok(gap > 0.3 && gap < 0.5, `the arrow sits ${gap} from the asymptote`);
    assert.deepEqual(tapAt(branches, tip, { x: gap * 1.5, y: 0.2 }), { kind: 'value', value: 2, asymptote: 'vertical' });
    assert.deepEqual(tapAt(branches, tip, { x: gap * 0.5, y: 0.2 }), { kind: 'tip', tip: SET_TAP_TIP.GOES_NOWHERE });
  });
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.TIP, tip: SET_TAP_TIP.GOES_NOWHERE }, domain), 'That end runs along an asymptote — it doesn\'t keep going left or right.');

  const growth = slotQuestion('exponential', GRAPH_FEATURE.RANGE, 'asymptote', QUESTION_TIER.STANDARD, 'tap-level');
  const arrows = graphDrawing(growth).arrows;
  const flat = arrows.find((arrow) => arrow.heads.y === 0);
  const steep = arrows.find((arrow) => arrow.heads.y !== 0);
  assert.ok(flat && steep, 'one end levels off, the other runs away');
  assert.equal(tapAt(growth, tipOf(growth, steep)).kind, 'arrow');
  const flatTip = tipOf(growth, flat);
  const level = graphAsymptotes(growth.graph).horizontal[0];
  const rise = Math.abs(flatTip.y - level);
  const narrow = { x: precise(growth).x, y: Math.max(0.006 * spanOf(growth).y, rise * 0.5) };
  if (rise * 0.5 >= 0.006 * spanOf(growth).y) {
    assert.deepEqual(tapAt(growth, flatTip, narrow), { kind: 'tip', tip: SET_TAP_TIP.GOES_NOWHERE });
  }
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.TIP, tip: SET_TAP_TIP.GOES_NOWHERE }, growth), 'That end levels off — it doesn\'t keep going up or down.');
  // Where it levels off is the asymptote's number: the end of the range, never reached.
  assert.deepEqual(tapAt(growth, flatTip, { x: precise(growth).x, y: rise + 0.01 * spanOf(growth).y }), { kind: 'value', value: level, asymptote: 'horizontal' });
});

test('each arrow is picked on its own: both arms of a parabola say "keeps going up", and the range keeps it until both are taken back', () => {
  const range = slotQuestion('quadratic', GRAPH_FEATURE.RANGE, 'fromVertex', QUESTION_TIER.EASY, 'tap-arms');
  const side = range.graph.a > 0 ? 'right' : 'left';
  const [left, right] = [...graphDrawing(range).arrows].sort((p, q) => p.u - q.u);
  const tap = (session, arrow) => recordSetTap(session, { hit: tapAt(range, tipOf(range, arrow)), nowMs: 0 }).session;
  let session = session1(range);
  session = tap(session, left);
  assert.deepEqual([session.drawing[side], session.arrowPicks.length], [true, 1]);
  session = tap(session, right);
  assert.deepEqual([session.drawing[side], session.arrowPicks.length], [true, 2], 'the other arm says the same');
  session = tap(session, left);
  assert.deepEqual([session.drawing[side], session.arrowPicks.length], [true, 1], 'one arm taken back: the other still says it');
  session = tap(session, right);
  assert.deepEqual([session.drawing[side], session.arrowPicks.length], [false, 0]);
  assert.equal(session.drawing[side === 'right' ? 'left' : 'right'], false, 'neither arm ever meant the other way');

  // The same arms in a domain: one runs left, one runs right — all real numbers.
  const domain = { ...range, targets: [{ id: 'dom', geometry: 'set', axis: 'x', set: N.setToPlain(N.ALL_REALS) }] };
  let built = session1(domain);
  built = recordSetTap(built, { hit: tapAt(domain, tipOf(domain, left)), nowMs: 0 }).session;
  built = recordSetTap(built, { hit: tapAt(domain, tipOf(domain, right)), nowMs: 0 }).session;
  assert.deepEqual([built.drawing.left, built.drawing.right], [true, true]);
  assert.ok(drawingReady(built));
  assert.deepEqual(lineNotation(domain, built.drawing), ['all real numbers', '(−∞, ∞)']);
});

/* ----------------------- a perfect student, and points ----------------------- */

// The taps that build a set's drawing from the graph alone, each made at one
// of the keyboard's stops (a landmark, an arrow's tip, an asymptote's middle),
// so a keyboard reaches every answer too: a ● is one tap, a ○ two, an arrow one.
const plannedTaps = (question, where) => {
  const picture = graphDrawing(question);
  const stops = setStops(question, picture).map((stop) => ({ stop, hit: tapAt(question, stop) }));
  const drawing = N.drawingForSet(setOf(question));
  const taps = [];
  drawing.points.forEach((point) => {
    const at = stops.find((entry) => entry.hit?.kind === 'value' && entry.hit.value === point.value);
    assert.ok(at, `${where}: a stop for ${point.value}`);
    taps.push(at, ...(point.closed ? [] : [at]));
  });
  ['left', 'right'].filter((side) => drawing[side]).forEach((side) => {
    const at = stops.find((entry) => entry.hit?.kind === 'arrow' && entry.hit.side === side);
    assert.ok(at, `${where}: an arrow ${side}`);
    taps.push(at);
  });
  return taps;
};

test('a perfect student builds every domain and range from taps on the graph alone, in exactly the points the item is worth — and the server agrees', () => {
  let checked = 0;
  for (const { server, question, where } of DEALT) {
    const taps = plannedTaps(question, where);
    let session = session1(question);
    taps.forEach(({ hit }) => { session = recordSetTap(session, { hit, nowMs: 0 }).session; });
    const checkedOut = recordCheck(session, { nowMs: 0, elapsedMs: 4_000, attemptId: `perfect-${checked}` });
    // A point a tap: every tap on the graph, and ✓ Check.
    assert.equal(taps.length + N.SET_CHECK_TAPS, question.weight, `${where}: taps`);
    assert.equal(question.weight, N.setAnswerTaps(setOf(question)), where);
    assert.ok(question.weight <= RUSH_MAX_QUESTION_WEIGHT, where);
    assert.equal(checkedOut.session.feedback.kind, RUSH_FEEDBACK.COMPLETE, where);
    assert.equal(checkedOut.session.counts.points, question.weight, `${where}: the device's points`);
    const outcome = applyRushAttempts({
      player: {},
      roundIndex: 0,
      roundVersion: 1,
      attempts: [checkedOut.attempt],
      questionFor: (index) => (index === 0 ? { ...server, questionIndex: 0 } : null),
      arrivedAtMs: 4_000,
      arrivalElapsedMs: 4_000,
      roundDurationMs: 600_000,
      strategy: correctCountStrategy,
      poolSize: 1,
    });
    const receipt = outcome.receipts[checkedOut.attempt.attemptId];
    assert.deepEqual([receipt.isCorrect, receipt.pointsAwarded, receipt.questionWeight], [true, question.weight, question.weight], `${where}: the server's points`);
    checked += 1;
  }
  assert.equal(checked, DEALT.length);
});

test('a set is worth its taps: a ● 1, a ○ 2, an arrow 1, and ✓ Check 1 — more than a point to find, never more than the cap', () => {
  const worth = (plain) => rushQuestionWeight({ targets: [{ id: 'set', geometry: 'set', axis: 'x', set: plain }] });
  assert.equal(worth([[2, true, null, false]]), 3, '[2, ∞): ●, an arrow, ✓');
  assert.equal(worth([[2, false, null, false]]), 4, '(2, ∞): ○ is two taps');
  assert.equal(worth([[null, false, null, false]]), 3, 'all real numbers: two arrows, ✓');
  assert.equal(worth([[null, false, 3, false], [3, false, null, false]]), 5, 'all but 3: ○, two arrows, ✓');
  assert.equal(worth([[-2, false, 4, false]]), 5, '(−2, 4): two ○, ✓');
  assert.equal(worth([[-2, true, 4, true]]), 3, '[−2, 4]: two ●, ✓');
  assert.equal(rushQuestionWeight({ targets: [{ id: 'a', x: 1, y: 0 }, { id: 'b', x: 3, y: 0 }] }), 2, 'two zeros: two taps');
  assert.equal(rushQuestionWeight({ targets: [] }), 1, 'Does Not Exist: one press');
  // The heaviest set a drawing makes: two ○ and both arrows.
  assert.equal(worth([[null, false, -1, false], [5, false, null, false]]), 7);
  assert.ok(7 <= RUSH_MAX_QUESTION_WEIGHT);
});

/* ------------------------------- the keyboard ------------------------------- */

test('the keyboard steps through what can be tapped, left to right, and says what is there — never what it means', () => {
  const range = slotQuestion('rational', GRAPH_FEATURE.RANGE, 'allButOne', QUESTION_TIER.STANDARD, 'tap-keys');
  const picture = graphDrawing(range);
  const stops = setStops(range, picture);
  const { vertical: [h], horizontal: [k] } = graphAsymptotes(range.graph);
  assert.equal(stops.length, setLandmarks(range).length + picture.arrows.length + 2, 'landmarks, arrow tips and both asymptotes');
  assert.ok(stops.every((stop, index) => index === 0 || stop.x >= stops[index - 1].x), 'left to right');
  const said = stops.map((stop) => describeSetStop(range, picture, stop));
  assert.ok(said.includes(`Asymptote x = ${String(h).replace('-', '−')}.`), said.join(' | '));
  assert.ok(said.includes(`Asymptote y = ${String(k).replace('-', '−')}.`), said.join(' | '));
  assert.ok(said.filter((line) => line.startsWith('Arrow at the ')).length === picture.arrows.length);
  said.forEach((line) => assert.doesNotMatch(line, /∞|domain|range|keeps going/i, line));
  // Page Down from the last stop wraps to the first; Page Up from the first to the last.
  assert.deepEqual(setStopAfter(stops, stops[stops.length - 1], 1), stops[0]);
  assert.deepEqual(setStopAfter(stops, stops[0], -1), stops[stops.length - 1]);
  const round = executableSource(read('src/components/liveChallenge/GraphFeatureRushGraph.jsx'));
  assert.match(round, /PageDown/);
  assert.match(round, /PageUp/);
});

/* ------------------------- an inequality's number line ------------------------- */

test('an inequality\'s number line: its own end arrows are tapped for "keeps going", and the keyboard steps past the last tick onto them', () => {
  const line = NUMBER_LINE;
  for (const width of [320, 900]) {
    const layout = numberLineLayout(line, width);
    const spacing = layout.usable / ((line.max - line.min) / line.step);
    assert.equal(lineEndAtPixel(line, width, layout.left), 'left', `${width}: the left arrowhead`);
    assert.equal(lineEndAtPixel(line, width, layout.right), 'right', `${width}: the right arrowhead`);
    assert.equal(lineEndAtPixel(line, width, layout.xOf(line.min)), null, 'the first tick is a number');
    assert.equal(lineEndAtPixel(line, width, layout.xOf(line.min) - spacing / 2 + 0.5), null, 'nearer the tick: the tick');
    assert.equal(lineEndAtPixel(line, width, layout.xOf(line.min) - spacing / 2 - 0.5), 'left', 'past half a tick: the arrow');
    assert.equal(lineEndAtPixel(line, width, layout.xOf(line.max) + spacing / 2 + 0.5), 'right');
    assert.equal(lineEndAtPixel(line, width, layout.xOf(0)), null);
  }
  assert.equal(moveLineCursor(line, line.min, 'ArrowLeft'), Number.NEGATIVE_INFINITY, 'one step past −10: the left arrow');
  assert.equal(moveLineCursor(line, Number.NEGATIVE_INFINITY, 'ArrowLeft'), Number.NEGATIVE_INFINITY, 'and no further');
  assert.equal(moveLineCursor(line, Number.NEGATIVE_INFINITY, 'ArrowRight'), line.min, 'back onto the line');
  assert.equal(moveLineCursor(line, line.max, 'ArrowRight'), Number.POSITIVE_INFINITY);
  assert.equal(moveLineCursor(line, Number.POSITIVE_INFINITY, 'Home'), line.min);
  assert.deepEqual([lineCursorEnd(Number.NEGATIVE_INFINITY), lineCursorEnd(Number.POSITIVE_INFINITY), lineCursorEnd(10)], ['left', 'right', null]);
  assert.equal(describeLineCursor(N.EMPTY_DRAWING, Number.NEGATIVE_INFINITY), 'Left arrow: off — Enter to keep going left');
  assert.equal(describeLineCursor(N.toggleArrow(N.EMPTY_DRAWING, 'right'), Number.POSITIVE_INFINITY), 'Right arrow: keeps going right');
});

/* --------------------------------- the screen --------------------------------- */

test('the round has no bar of arrow buttons: a set\'s controls are ✓ Check, Does Not Exist when it can be empty, and Skip', () => {
  const round = executableSource(read('src/components/liveChallenge/GraphFeatureRushRound.jsx'));
  assert.doesNotMatch(round, /onArrow|mm-rush-arrow|[◀▶▲▼]/, 'no arrow buttons, no arrow glyphs');
  assert.doesNotMatch(read('src/components/liveChallenge/InequalityNumberLine.jsx'), /[◀▶]/);
  assert.match(round, /recordSetTap\(current, \{ \.\.\.context, hit: setTapAt\(/, 'a set question\'s tap is read on the graph');
  const start = round.indexOf('{setQuestion ? (');
  const controls = round.slice(start, round.indexOf(') : (', start));
  assert.match(controls, /data-set="1"/);
  assert.deepEqual(controls.match(/>(✓ Check|No Solution|Does Not Exist|Skip)</g), ['>✓ Check<', '>No Solution<', '>Does Not Exist<', '>Skip<']);
  assert.match(controls, /\{setCanBeEmpty && !inequalityItem && \(/, 'Does Not Exist only for a set that can be empty');
  assert.match(round, /const setCanBeEmpty = setQuestion && \(inequalityItem \|\| getGraphFeature\(question\?\.feature\)\?\.canNotExist === true\);/);
});
