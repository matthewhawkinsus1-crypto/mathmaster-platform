import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { curveSegments, evaluateGraph, graphAsymptotes, graphDomain, graphMarkers, unrestrictedGraph } from '../../functions/shared/graphFeatureCurves.mjs';
import { GRAPH_FAMILY_CATALOG_IDS, GRAPH_FAMILY_OFF_SCREEN, catalogOffScreenFeature } from '../../functions/shared/graphFeatureCatalog.mjs';
import { FEATURE_STATUS, familyVariants, getGraphFamily, inDomain, listGraphFamilies } from '../../functions/shared/graphFeatureFamilies.mjs';
import {
  GRAPH_FEATURE_GENERATOR_VERSION,
  VIEW_RULES,
  generateQuestionForSlot,
  generateRushQuestion,
  publicRushQuestion,
  slotCatalog,
} from '../../functions/shared/graphFeatureGenerator.mjs';
import { TAP_RESULT, clampTolerance, resolveTap } from '../../functions/shared/graphFeatureHitTest.mjs';
import { FEATURE_READING, OFF_SCREEN_READING, OPEN_DOT_READING, rushReadingGuide } from '../../functions/shared/graphFeatureReading.mjs';
import {
  CLASSIC_GRAPH_FEATURE_IDS,
  GRAPH_FEATURE,
  GRAPH_FEATURE_IDS,
  QUESTION_TIER,
  QUESTION_TIER_ORDER,
  featureWordings,
} from '../../functions/shared/graphFeatureRegistry.mjs';
import { applyRushAttempts } from '../../functions/shared/graphFeatureRush.mjs';
import { GRAPH_FEATURE_RUSH_PRESETS, normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_ATTEMPT_KIND } from '../../functions/shared/graphFeatureRushRules.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { curveArrows, formatTarget, graphDrawing, lineLabelSpot, nearOpenDot } from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  OPEN_DOT_MESSAGE,
  RUSH_FEEDBACK,
  RUSH_INPUT,
  acknowledge,
  createRushSession,
  currentQuestion,
  differsFromServer,
  feedbackMessage,
  inputState,
  newAttemptId,
  nextBatch,
  recordDoesNotExist,
  recordOffScreen,
  recordSkip,
  recordTap,
  settle,
} from '../../src/platform/liveChallenge/rushSession.js';
import { rushCreateRequest, rushSetupFromPreset, changeRushSetup } from '../../src/platform/liveChallenge/rushSetupModel.js';
import { region } from './helpers/sourceContract.mjs';

/*
 * ARROWS AND ENDPOINTS, RESTRICTED DOMAINS, ASYMPTOTES, AND FEATURES OFF THE
 * SCREEN (generator 3).
 *
 *   - Every graph leaves the screen only at its ends: each piece of the curve
 *     is on screen as one stretch, so the arrowhead where it leaves always
 *     means "keeps going", and every end inside the screen is a dot.
 *   - Lines, parabolas, absolute value graphs and exponentials can be rays
 *     and segments. An intercept on a closed end counts (Standard); on an
 *     open end it does not, and a parabola can be cut to one zero (Challenge).
 *     A tap on an open dot is told it is not on the graph.
 *   - "Find all asymptotes": two for a rational graph, one for an
 *     exponential, none for the rest. A tap near the line counts. The dashed
 *     lines are hidden on those questions and drawn, labelled, when found.
 *   - Off-screen features (a layer a teacher turns on): the feature exists past
 *     the edge, and the answer is "Off screen".
 *
 * Each answer key is found again from the curve alone, as in
 * graphFeatureRushMath (whose oracle checks every slot, these included).
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const ALL_SLOTS = listGraphFamilies().flatMap((family) => GRAPH_FEATURE_IDS.flatMap((feature) => QUESTION_TIER_ORDER.flatMap((tier) => (
  familyVariants(family.id, feature, tier)
    .filter((variant) => variant.minTier === tier)
    .map((variant) => ({ family: family.id, feature, variant: variant.id, tier, exists: variant.exists, flags: variant.flags }))
))));
const generate = (slot, count = 12) => Array.from({ length: count }, (_, seed) => generateQuestionForSlot({ slot, seedText: `arrows|${slot.family}|${slot.feature}|${slot.variant}|${slot.tier}|${seed}` }));

/* ------------------------------ arrows and dots ----------------------------- */

// The stretches of a piece of the curve that are on screen, sampled densely
// and independently of the generator's own analysis.
const onScreenStretches = (graph, view, segment) => {
  const samples = 3000;
  let stretches = 0;
  let inside = false;
  const nudge = (segment.to - segment.from) / 1e6;
  for (let step = 0; step <= samples; step += 1) {
    let x = segment.from + ((segment.to - segment.from) * step) / samples;
    if (step === 0 && !segment.fromClosed) x += nudge;
    if (step === samples && !segment.toClosed) x -= nudge;
    const y = evaluateGraph(graph, x);
    const now = Number.isFinite(y) && y >= view.yMin && y <= view.yMax;
    if (now && !inside) stretches += 1;
    inside = now;
  }
  return stretches;
};

test('every generated graph leaves the screen only at its ends, so an arrow always means "keeps going"', () => {
  let checked = 0;
  for (const slot of ALL_SLOTS) {
    for (const question of generate(slot, 8)) {
      const where = `${slot.family}/${slot.feature}/${slot.variant}/${slot.tier}: ${JSON.stringify(question.graph)} in ${JSON.stringify(question.view)}`;
      curveSegments(question.graph, question.view).forEach((segment) => {
        assert.equal(onScreenStretches(question.graph, question.view, segment), 1, `one stretch on screen per piece: ${where}`);
      });
      // Every end of a restricted graph is a dot well inside the screen.
      const domain = graphDomain(question.graph);
      [domain?.from, domain?.to].filter(Boolean).forEach((end) => {
        const y = evaluateGraph(unrestrictedGraph(question.graph), end.x);
        const { view } = question;
        assert.ok(end.x - view.xMin >= VIEW_RULES.domainEndInset * (view.xMax - view.xMin) - 1e-9 && view.xMax - end.x >= VIEW_RULES.domainEndInset * (view.xMax - view.xMin) - 1e-9, `end x inside: ${where}`);
        assert.ok(y - view.yMin >= VIEW_RULES.domainEndInset * (view.yMax - view.yMin) - 1e-9 && view.yMax - y >= VIEW_RULES.domainEndInset * (view.yMax - view.yMin) - 1e-9, `end y inside: ${where}`);
        assert.ok(graphMarkers(question.graph, question.view).some((marker) => marker.x === end.x && marker.closed === end.closed), `a ${end.closed ? 'closed' : 'open'} dot at x = ${end.x}: ${where}`);
      });
      checked += 1;
    }
  }
  assert.ok(checked > 600, `${checked} graphs`);
});

test('the device draws an arrowhead where each stretch leaves the screen, pointing out, and none where the curve ends in a dot', () => {
  const view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 2, yStep: 2 };
  // A line crosses the whole screen: two arrows, one out each side.
  const line = curveArrows({ kind: 'linear', m: 0.5, b: 1 }, view);
  assert.equal(line.length, 2);
  assert.deepEqual(line.map((arrow) => arrow.edge).sort(), ['left', 'right']);
  line.forEach((arrow) => assert.ok(arrow.edge === 'right' ? arrow.dx > 0.8 : arrow.dx < -0.8, 'pointing out of the screen'));
  // A ray from a closed dot: one arrow, at the far end only.
  const ray = curveArrows({ kind: 'linear', m: 1, b: 1, domain: { from: { x: -1, closed: true }, to: null } }, view);
  assert.equal(ray.length, 1);
  assert.equal(ray[0].edge, 'top');
  assert.ok(ray[0].dy < -0.5, 'up and out of the top');
  // A segment: dots at both ends, no arrows at all.
  assert.equal(curveArrows({ kind: 'linear', m: 1, b: 1, domain: { from: { x: -3, closed: false }, to: { x: 4, closed: true } } }, view).length, 0);
  // A rational graph: each branch leaves twice, near the asymptote and out to the side.
  const rational = curveArrows({ kind: 'rational', a: 2, h: 1, k: -1 }, view);
  assert.equal(rational.length, 4);
  // A square root: a closed dot at its start, an arrow where it leaves.
  assert.equal(curveArrows({ kind: 'squareRoot', a: 1, s: 1, h: -2, k: 1 }, view).length, 1);
  // Generated questions: the drawing carries one arrow per exit the generator checked.
  const config = normalizeGraphFeatureRushConfig({ presetId: 'algebra2Challenge' });
  for (let index = 0; index < 30; index += 1) {
    const question = publicRushQuestion(generateRushQuestion({ seed: 'arrows-device', studentKey: 's1', roundIndex: 0, questionIndex: index, config }));
    const drawing = graphDrawing(question);
    assert.ok(drawing.arrows.length >= 0 && drawing.arrows.length <= 4, JSON.stringify(question.graph));
    drawing.arrows.forEach((arrow) => assert.ok([arrow.u, arrow.v].some((value) => Math.abs(value) < 1e-6 || Math.abs(value - 1) < 1e-6), 'every arrow sits on an edge'));
  }
});

/* ---------------------------- restricted domains ---------------------------- */

const first = (slot) => generate(slot, 1)[0];

test('an intercept on a closed end counts; on an open end it does not, and a parabola can be cut to one zero', () => {
  for (const family of ['linear', 'quadratic', 'absolute', 'exponential']) {
    for (const question of generate({ family, feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'rayFromZero', tier: QUESTION_TIER.STANDARD }, 10)) {
      const domain = graphDomain(question.graph);
      const end = domain.from || domain.to;
      assert.equal(end.closed, true, family);
      assert.deepEqual(question.targets.map(({ x, y }) => [x, y]), [[end.x, 0]], `${family}: the closed end on the axis is the zero, and the only one`);
    }
    for (const question of generate({ family, feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'rayOpenAtZero', tier: QUESTION_TIER.CHALLENGE }, 10)) {
      const domain = graphDomain(question.graph);
      const end = domain.from || domain.to;
      assert.equal(end.closed, false, family);
      assert.ok(Math.abs(evaluateGraph(unrestrictedGraph(question.graph), end.x)) < 1e-9, `${family}: the open dot sits on the axis`);
      assert.equal(question.doesNotExist, true, `${family}: an open end on the axis is not a zero: Does Not Exist`);
    }
  }
  for (const family of ['quadratic', 'absolute']) {
    for (const question of generate({ family, feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'cutOneZero', tier: QUESTION_TIER.CHALLENGE }, 10)) {
      const { graph } = question;
      const domain = graphDomain(graph);
      assert.equal((domain.from || domain.to).x, graph.h, `${family}: cut at the vertex`);
      assert.equal(question.targets.length, 1, `${family}: of its two zeros, one is on the graph`);
      assert.ok(Math.abs(evaluateGraph(unrestrictedGraph(graph), 2 * graph.h - question.targets[0].x)) < 1e-9, `${family}: its other zero is cut off`);
    }
  }
  // y-intercepts on a ray from the y-axis: a closed end there is the y-intercept; an open one is Does Not Exist.
  for (const family of ['linear', 'quadratic', 'absolute', 'exponential']) {
    const closed = first({ family, feature: GRAPH_FEATURE.Y_INTERCEPT, variant: 'rayFromAxis', tier: QUESTION_TIER.STANDARD });
    assert.deepEqual(closed.targets.map(({ x, y }) => [x, y]), [[0, evaluateGraph(closed.graph, 0)]], family);
    const open = first({ family, feature: GRAPH_FEATURE.Y_INTERCEPT, variant: 'rayOpenAtAxis', tier: QUESTION_TIER.CHALLENGE });
    assert.ok(!Number.isFinite(evaluateGraph(open.graph, 0)) && open.doesNotExist, family);
  }
  // A segment that stops short of the axis it heads for.
  for (const question of generate({ family: 'linear', feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'segmentShort', tier: QUESTION_TIER.CHALLENGE }, 10)) {
    const domain = graphDomain(question.graph);
    assert.ok(domain.from && domain.to && question.doesNotExist);
    const nearer = Math.min(...[domain.from.x, domain.to.x].map((x) => Math.abs(evaluateGraph(unrestrictedGraph(question.graph), x))));
    assert.ok(nearer >= 1.5, `its nearer end is 1.5 or more off the axis (${nearer})`);
  }
});

test('restricted graphs are new only above Easy, and a graph cut by its domain is never asked for its "roots"', () => {
  ALL_SLOTS.filter((slot) => slot.flags?.restricted).forEach((slot) => {
    assert.notEqual(slot.tier, QUESTION_TIER.EASY, `${slot.family}/${slot.variant}`);
    const wordings = new Set(generate(slot, 16).map((question) => question.prompt));
    assert.ok(![...wordings].some((prompt) => /roots/.test(prompt)), `${slot.family}/${slot.variant}: ${[...wordings]}`);
  });
  // Where it would otherwise be offered: the polynomials at Standard.
  assert.ok(featureWordings(GRAPH_FEATURE.X_INTERCEPT, { family: 'quadratic', tier: QUESTION_TIER.STANDARD }).some((entry) => entry.id === 'roots'));
});

test('a restricted graph\'s maximum and minimum are worked out exactly: attained at a closed end or the turn, never at an open end', () => {
  const linear = getGraphFamily('linear');
  const end = (x, closed) => ({ x: Q.rat(x), closed });
  const segment = { m: Q.rat(1, 2), b: Q.rat(1), domain: { from: end(-2, true), to: end(4, true) } };
  const status = (analysis) => [analysis.status, analysis.points.map((p) => [Q.toNumber(p.x), Q.toNumber(p.y)])];
  assert.deepEqual(status(linear.analyze(segment)[GRAPH_FEATURE.MAXIMUM]), [FEATURE_STATUS.EXISTS, [[4, 3]]]);
  assert.deepEqual(status(linear.analyze(segment)[GRAPH_FEATURE.MINIMUM]), [FEATURE_STATUS.EXISTS, [[-2, 0]]]);
  const openTop = { ...segment, domain: { from: end(-2, true), to: end(4, false) } };
  assert.deepEqual(status(linear.analyze(openTop)[GRAPH_FEATURE.MAXIMUM]), [FEATURE_STATUS.NONE, []], 'approached at the open end, never reached');
  const ray = { ...segment, domain: { from: end(-2, true), to: null } };
  assert.deepEqual(status(linear.analyze(ray)[GRAPH_FEATURE.MAXIMUM]), [FEATURE_STATUS.NONE, []], 'it keeps rising');
  const quadratic = getGraphFamily('quadratic');
  const arm = { a: Q.rat(1), h: Q.rat(1), k: Q.rat(-2), domain: { from: end(3, true), to: null } };
  assert.deepEqual(status(quadratic.analyze(arm)[GRAPH_FEATURE.MINIMUM]), [FEATURE_STATUS.EXISTS, [[3, 2]]], 'the arm past the vertex: lowest at its closed end');
  assert.deepEqual(status(quadratic.analyze(arm)[GRAPH_FEATURE.VERTEX]), [FEATURE_STATUS.NONE, []], 'the vertex is cut off');
  const throughVertex = { ...arm, domain: { from: end(-1, false), to: end(3, false) } };
  assert.deepEqual(status(quadratic.analyze(throughVertex)[GRAPH_FEATURE.MINIMUM]), [FEATURE_STATUS.EXISTS, [[1, -2]]]);
  assert.deepEqual(status(quadratic.analyze(throughVertex)[GRAPH_FEATURE.MAXIMUM]), [FEATURE_STATUS.NONE, []], 'both ends open');
  const exponential = getGraphFamily('exponential');
  const growth = { a: Q.rat(1), base: Q.rat(2), h: Q.ZERO, k: Q.rat(-3), domain: { from: end(0, true), to: null } };
  assert.deepEqual(status(exponential.analyze(growth)[GRAPH_FEATURE.MINIMUM]), [FEATURE_STATUS.EXISTS, [[0, -2]]]);
  assert.deepEqual(status(exponential.analyze(growth)[GRAPH_FEATURE.ASYMPTOTE]), [FEATURE_STATUS.NONE, []], 'its approach to y = −3 is cut off');
  assert.deepEqual(graphAsymptotes(exponential.toGraph(growth)), { vertical: [], horizontal: [] }, 'so none is drawn');
  assert.equal(inDomain(growth.domain, Q.rat(-1)), false);
});

/* -------------------------------- asymptotes -------------------------------- */

test('"Find all asymptotes": two for a rational graph, one for an exponential, none for every other family', () => {
  const counts = {};
  for (const slot of ALL_SLOTS.filter((entry) => entry.feature === GRAPH_FEATURE.ASYMPTOTE)) {
    for (const question of generate(slot, 10)) {
      counts[slot.family] = counts[slot.family] || new Set();
      counts[slot.family].add(question.targets.length);
      assert.equal(question.prompt, 'Find all asymptotes');
    }
  }
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([family, set]) => [family, [...set]])), {
    linear: [0], quadratic: [0], absolute: [0], cubic: [0], exponential: [1], squareRoot: [0], cubeRoot: [0], rational: [2], piecewise: [0],
  });
  // Lines, in a stable order: the vertical one first.
  const rational = first({ family: 'rational', feature: GRAPH_FEATURE.ASYMPTOTE, variant: 'two', tier: QUESTION_TIER.STANDARD });
  assert.deepEqual(rational.targets, [
    { id: 'a1', geometry: 'line', orientation: 'vertical', x: rational.graph.h },
    { id: 'a2', geometry: 'line', orientation: 'horizontal', y: rational.graph.k },
  ]);
  // On an axis: still a target, and still drawn, in its own colour, on other questions.
  const onAxis = generate({ family: 'exponential', feature: GRAPH_FEATURE.ASYMPTOTE, variant: 'oneOnAxis', tier: QUESTION_TIER.CHALLENGE }, 1)[0];
  assert.deepEqual(onAxis.targets, [{ id: 'a1', geometry: 'line', orientation: 'horizontal', y: 0 }]);
});

test('an asymptote question hides its dashed lines, and each is drawn, labelled "x = 2", once found', () => {
  const rational = publicRushQuestion(generateQuestionForSlot({ slot: { family: 'rational', feature: GRAPH_FEATURE.ASYMPTOTE, variant: 'two', tier: QUESTION_TIER.STANDARD }, seedText: 'hide' }));
  assert.deepEqual(graphDrawing(rational).asymptotes, { vertical: [], horizontal: [] }, 'the answer is not drawn');
  const other = { ...rational, feature: GRAPH_FEATURE.X_INTERCEPT };
  assert.equal(graphDrawing(other).asymptotes.vertical.length, 1, 'on any other question they are drawn');
  assert.equal(formatTarget(rational.targets[0]), `x = ${String(rational.graph.h).replace('-', '−')}`);
  assert.equal(formatTarget({ geometry: 'line', orientation: 'horizontal', y: -3 }), 'y = −3');
  // A found line is drawn with its label; the feedback names it.
  let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [rational, { ...rational, questionIndex: 1 }], poolSize: 2 });
  const tolerance = { x: 0.3, y: 0.3 };
  const { view } = rational;
  const hit = recordTap(session, { x: rational.graph.h + 0.1, y: view.yMax - 1, tolerance, pointer: 'touch', nowMs: 1, elapsedMs: 1, attemptId: 'line-1' });
  assert.equal(hit.session.feedback.kind, RUSH_FEEDBACK.HIT, 'a tap anywhere near the line');
  assert.equal(feedbackMessage(hit.session.feedback, rational), `Found ${formatTarget(rational.targets[0])}.`);
  session = hit.session;
  // Its label sits clear of the curve: a rational branch climbs one side of
  // its vertical asymptote (the right when a > 0), so the label takes the other.
  const labelled = (a) => {
    const question = { graph: { kind: 'rational', a, h: -1, k: -2 }, view: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 } };
    return lineLabelSpot(question, { geometry: 'line', orientation: 'vertical', x: -1 }).side;
  };
  assert.equal(labelled(2), 'left');
  assert.equal(labelled(-2), 'right');
  const flat = { graph: { kind: 'exponential', a: 1, base: [1, 2], h: 0, k: -2 }, view: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 } };
  assert.equal(lineLabelSpot(flat, { geometry: 'line', orientation: 'horizontal', y: -2 }).side, 'below', 'the curve settles onto y = −2 from above');
  const graph = read('src/components/liveChallenge/GraphFeatureRushGraph.jsx');
  const found = region(graph, 'function FoundLine(', '\n}\n', 'a found line');
  assert.match(found, /const label = formatTarget\(target\);/);
  assert.match(found, /const spot = lineLabelSpot\(question, target\);/);
  assert.match(region(graph, 'function FoundMark(', '\n}\n', 'a found mark'), /if \(target\?\.geometry === 'line'\) return <FoundLine /);
});

test('a tap near an asymptote counts, measured across the line; at the crossing it finds the one not yet found', () => {
  const view = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const targets = [{ id: 'a1', geometry: 'line', orientation: 'vertical', x: 2 }, { id: 'a2', geometry: 'line', orientation: 'horizontal', y: -1 }];
  const tolerance = clampTolerance({ x: 0.6, y: 0.6 }, view);
  const tap = (x, y, found = []) => resolveTap({ targets, found, tap: { x, y }, tolerance, view });
  assert.deepEqual([tap(2.4, 9).result, tap(2.4, 9).targetId], [TAP_RESULT.HIT, 'a1'], 'anywhere along it');
  assert.equal(tap(2.8, 9).result, TAP_RESULT.MISS, 'not off to the side');
  assert.deepEqual([tap(-8, -1.3).result, tap(-8, -1.3).targetId], [TAP_RESULT.HIT, 'a2']);
  assert.equal(tap(2.1, -1.1).targetId, 'a1', 'the crossing finds the nearer line first');
  assert.equal(tap(2.1, -1.1, ['a1']).targetId, 'a2', 'and then the other');
  assert.equal(tap(2.1, -1.1, ['a1', 'a2']).result, TAP_RESULT.ALREADY_FOUND);
  // Points are never both in reach (15% apart against at most 7%): nothing changes for them.
  const points = [{ id: 'x1', x: -4, y: 0 }, { id: 'x2', x: 4, y: 0 }];
  assert.equal(resolveTap({ targets: points, found: ['x1'], tap: { x: -4, y: 0 }, tolerance, view }).result, TAP_RESULT.ALREADY_FOUND);
});

/* --------------------------------- open dots -------------------------------- */

test('a tap on an open dot is told "Open dot — that point isn\'t on the graph."', () => {
  const question = publicRushQuestion(generateQuestionForSlot({ slot: { family: 'linear', feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'rayOpenAtZero', tier: QUESTION_TIER.CHALLENGE }, seedText: 'open-dot' }));
  const [open] = graphMarkers(question.graph, question.view).filter((marker) => !marker.closed);
  assert.ok(open, 'the ray has its open dot');
  const tolerance = clampTolerance({ x: 0.4, y: 0.4 }, question.view);
  assert.equal(nearOpenDot({ question, x: open.x + 0.1, y: open.y, tolerance }), true);
  const session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [question], poolSize: 1 });
  const tapped = recordTap(session, { x: open.x + 0.1, y: open.y - 0.05, tolerance, pointer: 'touch', nowMs: 1, elapsedMs: 1, attemptId: 'open' });
  assert.equal(tapped.session.feedback.kind, RUSH_FEEDBACK.MISS, 'a miss like any other: the server agrees');
  assert.equal(feedbackMessage(tapped.session.feedback, question), OPEN_DOT_MESSAGE);
  assert.equal(OPEN_DOT_MESSAGE, 'Open dot — that point isn\'t on the graph.');
  const elsewhere = recordTap(session, { x: open.x + 3, y: open.y + 3, tolerance, pointer: 'touch', nowMs: 1, elapsedMs: 1, attemptId: 'elsewhere' });
  assert.equal(feedbackMessage(elsewhere.session.feedback, question), 'Not an x-intercept — try again.', 'away from the dot, the usual words');
  // The server records the tap on the dot as a miss.
  const graded = applyRushAttempts({ player: {}, roundIndex: 0, attempts: [tapped.attempt], questionFor: () => generateQuestionForSlot({ slot: { family: 'linear', feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'rayOpenAtZero', tier: QUESTION_TIER.CHALLENGE }, seedText: 'open-dot' }), arrivedAtMs: 5_000, arrivalElapsedMs: 5_000, poolSize: 1, strategy: correctCountStrategy });
  assert.equal(graded.verdicts[0].verdict, 'miss');
});

/* ----------------------------- off the screen ----------------------------- */

test('off-screen features: a layer a teacher turns on, from Standard, for the graphs that can hide one', () => {
  // The catalog's table is what the families' off-screen variants say.
  const fromFamilies = {};
  listGraphFamilies().forEach((family) => GRAPH_FEATURE_IDS.forEach((feature) => {
    const tier = QUESTION_TIER_ORDER.find((candidate) => familyVariants(family.id, feature, candidate).some((variant) => variant.flags?.offScreen));
    if (tier) fromFamilies[family.id] = { ...fromFamilies[family.id], [feature]: tier };
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(GRAPH_FAMILY_OFF_SCREEN)), fromFamilies);
  GRAPH_FAMILY_CATALOG_IDS.forEach((family) => GRAPH_FEATURE_IDS.forEach((feature) => QUESTION_TIER_ORDER.forEach((tier) => {
    const declared = familyVariants(family, feature, tier).some((variant) => variant.flags?.offScreen);
    assert.equal(catalogOffScreenFeature(family, feature, tier), declared, `${family}/${feature}/${tier}`);
  })));
  // Never in a game that has not turned it on; in one that has, beside the on-screen ones.
  const off = slotCatalog({ families: ['linear', 'quadratic'], features: ['xIntercept', 'vertex'] }, QUESTION_TIER.STANDARD);
  const on = slotCatalog({ families: ['linear', 'quadratic'], features: ['xIntercept', 'vertex'], offScreen: true }, QUESTION_TIER.STANDARD);
  assert.equal(off.some((slot) => slot.variant === 'offScreen'), false);
  assert.ok(on.some((slot) => slot.variant === 'offScreen'));
  assert.ok(on.some((slot) => slot.variant !== 'offScreen' && slot.exists));
  // The presets a class already played keep their features; no preset turns it on.
  const ORIGINAL_PRESETS = ['algebra1Quick', 'algebra1Functions', 'interceptSprint', 'algebra2Mixed', 'algebra2Challenge'];
  for (const preset of GRAPH_FEATURE_RUSH_PRESETS) {
    if (ORIGINAL_PRESETS.includes(preset.id)) assert.ok(preset.features.every((feature) => CLASSIC_GRAPH_FEATURE_IDS.includes(feature)), `${preset.id} keeps its features`);
    assert.equal(normalizeGraphFeatureRushConfig({ presetId: preset.id }).offScreen, false);
  }
  // The setup carries it to the request, and a preset turned up is a custom game.
  const setup = changeRushSetup(rushSetupFromPreset(GRAPH_FEATURE_RUSH_PRESETS[0]), { offScreen: true });
  assert.equal(setup.presetId, 'custom');
  assert.equal(rushCreateRequest(setup).graphFeatureRush.offScreen, true);
  assert.equal(rushCreateRequest(rushSetupFromPreset(GRAPH_FEATURE_RUSH_PRESETS[0])).graphFeatureRush.offScreen, false);
});

test('an off-screen question has nothing to tap; "Off screen" completes it, "Does Not Exist" is a miss, and the reveal says where it is', () => {
  const slot = { family: 'linear', feature: GRAPH_FEATURE.X_INTERCEPT, variant: 'offScreen', tier: QUESTION_TIER.STANDARD };
  const serverQuestion = generateQuestionForSlot({ slot, seedText: 'off-screen' });
  const question = publicRushQuestion(serverQuestion);
  assert.equal(question.offScreen, true);
  assert.deepEqual(question.targets, []);
  assert.equal(question.targetCount, 1);
  const [hidden] = question.offScreenTargets;
  assert.ok(hidden.x < question.view.xMin || hidden.x > question.view.xMax, 'past a side');
  assert.equal(serverQuestion.doesNotExist, false, 'it exists');
  const session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [question], poolSize: 1 });
  const dne = recordDoesNotExist(session, { nowMs: 1, elapsedMs: 1, attemptId: 'dne' });
  assert.equal(dne.session.feedback.kind, RUSH_FEEDBACK.MISS);
  assert.equal(feedbackMessage(dne.session.feedback, question), 'It exists — follow the arrows.');
  const off = recordOffScreen(session, { nowMs: 1, elapsedMs: 1, attemptId: 'off' });
  assert.equal(off.attempt.kind, RUSH_ATTEMPT_KIND.OFF_SCREEN);
  assert.equal(off.session.feedback.kind, RUSH_FEEDBACK.COMPLETE);
  assert.equal(feedbackMessage(off.session.feedback, question), `Correct — it is off the screen, at (${String(hidden.x).replace('-', '−')}, 0).`);
  // The server agrees, on its own copy.
  const grade = (attempt) => applyRushAttempts({ player: {}, roundIndex: 0, attempts: [attempt], questionFor: () => serverQuestion, arrivedAtMs: 5_000, arrivalElapsedMs: 5_000, poolSize: 1, strategy: correctCountStrategy }).verdicts[0];
  assert.equal(grade(off.attempt).verdict, 'hit');
  assert.equal(grade(off.attempt).completesQuestion, true);
  assert.equal(grade(dne.attempt).verdict, 'miss');
  // "Off screen" on a graph whose feature is on screen, or absent, is a miss.
  const onScreen = publicRushQuestion(generateQuestionForSlot({ slot: { ...slot, variant: 'one' }, seedText: 'on-screen' }));
  const wrong = recordOffScreen(createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions: [onScreen], poolSize: 1 }), { nowMs: 1, elapsedMs: 1, attemptId: 'w' });
  assert.equal(feedbackMessage(wrong.session.feedback, onScreen), 'Not off the screen — look again.');
  const absent = generateQuestionForSlot({ slot: { ...slot, variant: 'none' }, seedText: 'absent' });
  assert.equal(applyRushAttempts({ player: {}, roundIndex: 0, attempts: [{ ...wrong.attempt, attemptId: 'w2' }], questionFor: () => absent, arrivedAtMs: 5_000, arrivalElapsedMs: 5_000, poolSize: 1, strategy: correctCountStrategy }).verdicts[0].verdict, 'miss');
});

test('device and server agree on every step of random play with asymptotes, rays and off-screen features', () => {
  const config = normalizeGraphFeatureRushConfig({ families: ['linear', 'quadratic', 'absolute', 'exponential', 'rational'], features: ['xIntercept', 'yIntercept', 'vertex', 'asymptote'], difficulty: 'challenge', offScreen: true });
  let replies = 0;
  let resyncs = 0;
  const kinds = new Set();
  for (let student = 0; student < 8; student += 1) {
    const studentKey = `agree-new-${student}`;
    const serverQuestion = (index) => generateRushQuestion({ seed: 'agree-new', studentKey, roundIndex: 0, questionIndex: index, config });
    const questions = Array.from({ length: 40 }, (_, index) => publicRushQuestion(serverQuestion(index)));
    questions.forEach((question) => kinds.add(question.offScreen ? 'offScreen' : (question.targets[0]?.geometry || (question.targets.length ? 'point' : 'none'))));
    let seed = 11 + student * 97;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions, poolSize: 40 });
    let player = {};
    let now = 0;
    const deliver = () => {
      while (session.queue.length) {
        const batch = nextBatch(session).slice(0, 1 + Math.floor(random() * Math.min(6, session.queue.length)));
        const outcome = applyRushAttempts({ player, roundIndex: 0, roundVersion: 1, attempts: batch, questionFor: serverQuestion, arrivedAtMs: now, arrivalElapsedMs: now, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 40 });
        player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
        const acked = acknowledge(session, { sent: batch, reply: { verdicts: outcome.verdicts, state: outcome.state } });
        replies += 1;
        if (acked.resynced) resyncs += 1;
        session = acked.session;
      }
    };
    for (let step = 0; step < 220 && session.cursor < 38; step += 1) {
      now += 50 + Math.floor(random() * 900);
      session = settle(session, now);
      if (inputState(session, now) === RUSH_INPUT.LOCKED) now = session.lockedUntil;
      if (inputState(session, now) !== RUSH_INPUT.READY) continue;
      const question = currentQuestion(session);
      const span = { x: question.view.xMax - question.view.xMin, y: question.view.yMax - question.view.yMin };
      const tolerance = clampTolerance({ x: span.x * 0.03, y: span.y * 0.03 }, question.view);
      const roll = random();
      const open = question.targets.filter((target) => !session.found.includes(target.id));
      const context = { nowMs: now, elapsedMs: now, attemptId: newAttemptId() };
      let input;
      if (roll < 0.05) input = recordSkip(session, context);
      else if (roll < 0.12) input = recordDoesNotExist(session, context);
      else if (roll < 0.2) input = recordOffScreen(session, context);
      else {
        const aim = open.length && roll < 0.75 ? open[Math.floor(random() * open.length)] : null;
        const jitter = roll < 0.55 ? 0.3 : 0.98;
        // A line is aimed at anywhere along it; a point, at itself.
        const along = (low, size) => low + random() * size;
        const x = aim ? (aim.x ?? along(question.view.xMin, span.x)) + (aim.x === undefined ? 0 : (random() - 0.5) * 2 * jitter * tolerance.x) : along(question.view.xMin, span.x);
        const y = aim ? (aim.y ?? along(question.view.yMin, span.y)) + (aim.y === undefined ? 0 : (random() - 0.5) * 2 * jitter * tolerance.y) : along(question.view.yMin, span.y);
        input = recordTap(session, { x, y, tolerance, pointer: 'touch', ...context });
      }
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 40, strategy: correctCountStrategy }).state), false, studentKey);
  }
  assert.ok(replies > 150, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
  assert.deepEqual([...kinds].sort(), ['line', 'none', 'offScreen', 'point'], 'the play covered every kind of question');
});

/* ------------------------------- reading guide ------------------------------ */

test('the reading guide has a line on asymptotes, and its answers line says when to choose Off screen and what an open dot means', () => {
  assert.ok(FEATURE_READING.asymptote.line.length <= 100 && FEATURE_READING.asymptote.slip.length <= 80);
  const easy = rushReadingGuide({ features: ['xIntercept', 'asymptote'], difficulty: 'easy' }).solutionReview.reasoning;
  assert.deepEqual(easy, [FEATURE_READING.xIntercept.line, FEATURE_READING.asymptote.line, 'If the graph has no x-intercepts or asymptotes, choose Does Not Exist.']);
  // Above Easy, graphs end in dots (rays, segments, splits): the answers line says what an open one means.
  const standard = rushReadingGuide({ features: ['xIntercept'], difficulty: 'standard' }).solutionReview.reasoning;
  assert.equal(standard.at(-1), `If the graph has no x-intercepts, choose Does Not Exist. ${OPEN_DOT_READING}`);
  // With off-screen features, when to choose Off screen.
  const offScreen = rushReadingGuide({ features: ['xIntercept', 'vertex'], difficulty: 'challenge', offScreen: true }).solutionReview.reasoning;
  assert.equal(offScreen.at(-1), `If the graph has no x-intercepts, choose Does Not Exist. ${OFF_SCREEN_READING} ${OPEN_DOT_READING}`);
  assert.equal(offScreen.length, 3, 'still one line for the answers');
  // A vertex-only game with off-screen features has only the Off screen sentence to say.
  assert.deepEqual(rushReadingGuide({ features: ['vertex'], difficulty: 'standard', offScreen: true }).solutionReview.reasoning.at(-1), OFF_SCREEN_READING);
  // A line a feature, and the answers line last (the projector keeps it: graphFeatureReading.test.mjs).
  const every = rushReadingGuide({ features: GRAPH_FEATURE_IDS, difficulty: 'challenge', offScreen: true }).solutionReview.reasoning;
  assert.equal(every.length, GRAPH_FEATURE_IDS.length + 1);
  assert.match(every.at(-1), /Off screen/);
});

/* --------------------------------- screens --------------------------------- */

test('the screens draw arrows, asymptotes in their own colour, and offer Off screen only in a game that has it', () => {
  const graph = read('src/components/liveChallenge/GraphFeatureRushGraph.jsx');
  const layer = region(graph, 'const GraphLayer = memo(function GraphLayer(', '\n});\n', 'the graph layer');
  assert.match(layer, /\(drawing\.arrows \|\| \[\]\)\.map\(\(arrow\) => \(\s*<polygon[^>]*points=\{arrowPoints\(arrow, side\)\}/);
  assert.match(layer, /drawing\.asymptotes\.vertical\.map\(\(u\) => \(\s*<line[^>]*\{\.\.\.ASYMPTOTE_STROKE\} \/>/);
  assert.match(graph, /const ASYMPTOTE_STROKE = \{ stroke: 'var\(--mm-rush-asymptote\)'/);
  // Drawn after the axes, so an asymptote on an axis shows over it.
  assert.ok(layer.indexOf('drawing.asymptotes.vertical') > layer.indexOf('stroke="var(--mm-graph-axis)"'));
  const round = read('src/components/liveChallenge/GraphFeatureRushRound.jsx');
  assert.match(round, /--mm-rush-asymptote: var\(--mm-accent\);/);
  assert.match(round, /const offScreenGame = room\.graphFeatureRush\?\.config\?\.offScreen === true;/);
  assert.match(region(round, '<div className="mm-rush-buttons" data-off-screen=', '</div>', 'the answer buttons'), /\{offScreenGame && \(\s*<button type="button" className="mm-rush-off" disabled=\{buttonsDisabled\} onClick=\{onOffScreen\}/);
  assert.match(round, /const onOffScreen = \(\) => act\(recordOffScreen\);/);
  // Practice reads the same setting from the room it builds: the settings go
  // where the game's room carries them, which for this game is graphFeatureRush.
  const practice = read('src/components/liveChallenge/GraphFeatureRushPractice.jsx');
  assert.match(practice, /\[practiceGame\.key\]: \{ config: JSON\.parse\(configKey\) \},/);
  assert.match(practice, /\[RUSH_MODE_ID\]: Object\.freeze\(\{ key: 'graphFeatureRush',/);
  // The setup offers the toggle and checks it with the server's own rule.
  const setup = read('src/components/liveChallenge/GraphFeatureRushSetup.jsx');
  assert.match(setup, /rushConfigProblem\(\{ families: setup\.families, features: setup\.features, difficulty: setup\.difficulty, offScreen: setup\.offScreen === true \}\)/);
  assert.match(setup, /onChange=\{\(\) => update\(\{ offScreen: setup\.offScreen !== true \}\)\}/);
});

test('generator 3: rooms created under an older generator refuse to play rather than grade a different graph', () => {
  // 3 brought every change in this file; a later version keeps them (a bump
  // must not turn this red: AGENTS.md, versioned constants).
  assert.ok(GRAPH_FEATURE_GENERATOR_VERSION >= 3);
  const index = read('functions/index.js');
  // A room is played only under the generator version it was created with —
  // its own game's: for Graph Feature Rush, this generator's.
  const context = region(index, 'async function loadGraphFeatureRushContext(', '\n}\n', 'the rush context');
  assert.match(context, /if \(!rushState\.seed \|\| Number\(rushState\.generatorVersion\) !== questions\.version\) \{\s*throw new HttpsError\("failed-precondition"/);
  const games = region(index, 'const RUSH_QUESTION_SOURCES = Object.freeze({', '\n});\n', 'the rush games');
  const graphs = region(games, 'graphFeatureGenerator: Object.freeze({', '\n  }),', 'the graph game');
  assert.match(graphs, /stateKey: "graphFeatureRush",/);
  assert.match(graphs, /return \{ version: generator\.GRAPH_FEATURE_GENERATOR_VERSION, generate: generator\.generateRushQuestion, publicQuestion: generator\.publicRushQuestion \};/);
});
