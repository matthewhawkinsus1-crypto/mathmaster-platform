import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import {
  GRAPH_KIND,
  curveSegments,
  evaluateGraph,
  graphMarkers,
  sampleGraph,
} from '../../functions/shared/graphFeatureCurves.mjs';
import {
  FEATURE_STATUS,
  GRAPH_FAMILY_IDS,
  familyVariants,
  getGraphFamily,
  listGraphFamilies,
} from '../../functions/shared/graphFeatureFamilies.mjs';
import {
  GRAPH_FEATURE,
  GRAPH_FEATURE_IDS,
  QUESTION_TIER,
  QUESTION_TIER_ORDER,
  featureWordings,
} from '../../functions/shared/graphFeatureRegistry.mjs';
import {
  DOES_NOT_EXIST_SHARE,
  SCHEDULE_BLOCK_SIZE,
  VIEW_RULES,
  createRng,
  generateQuestionForSlot,
  generateRushQuestion,
  publicRushQuestion,
  roundBlockTemplate,
  scheduledSlot,
  slotCatalog,
} from '../../functions/shared/graphFeatureGenerator.mjs';

/*
 * THE ANSWER KEY OF EVERY GENERATED GRAPH IS CHECKED BY A SECOND, INDEPENDENT
 * METHOD.
 *
 * The families compute features exactly, from their parameters. These tests
 * do not trust that: they take only what a student's device receives — the
 * render spec and the view — and find the features again numerically, by
 * sampling the curve (sign changes for zeros, wide sweeps for extremes,
 * domain probes for "does not exist"). A family whose exact analysis drifted
 * from the curve it actually draws fails here.
 */

const SEEDS_PER_SLOT = 40;
const EPS = 1e-9;

// Every slot the families offer, at every tier.
const ALL_SLOTS = listGraphFamilies().flatMap((family) => GRAPH_FEATURE_IDS.flatMap((feature) => QUESTION_TIER_ORDER.flatMap((tier) => (
  familyVariants(family.id, feature, tier).map((variant) => ({ family: family.id, feature, variant: variant.id, tier, exists: variant.exists, flags: variant.flags }))
))));

const generateAll = (slot) => Array.from({ length: SEEDS_PER_SLOT }, (_, seed) => generateQuestionForSlot({
  slot, seedText: `math-test|${slot.family}|${slot.feature}|${slot.variant}|${slot.tier}|${seed}`,
}));

// The continuous pieces of the graph over a wide window, from the render spec.
const wideSegments = (graph, half = 120) => curveSegments(graph, { xMin: -half, xMax: half });

/*
 * Numerical zeros: samples on a dyadic grid where the curve is EXACTLY zero
 * (dyadic parameters evaluate exactly at a dyadic zero — tangent zeros
 * included), plus bisected sign changes for crossings that are not exact in
 * floating point. Never "close to zero": an asymptote along the x-axis gets
 * arbitrarily close without ever being a zero.
 */
const numericZeros = (graph) => {
  const zeros = [];
  const step = 1 / 64;
  wideSegments(graph).forEach((segment) => {
    let previous = null;
    for (let x = Math.ceil(segment.from / step) * step; x <= segment.to + EPS; x += step) {
      if (x === segment.from && !segment.fromClosed) continue;
      if (Math.abs(x - segment.to) < EPS && !segment.toClosed) continue;
      const y = evaluateGraph(graph, x);
      if (!Number.isFinite(y)) { previous = null; continue; }
      if (y === 0) zeros.push(x);
      else if (previous && previous.y !== 0 && Math.sign(previous.y) !== Math.sign(y)) {
        let low = previous.x;
        let high = x;
        for (let i = 0; i < 60; i += 1) {
          const mid = (low + high) / 2;
          if (Math.sign(evaluateGraph(graph, mid)) === Math.sign(previous.y)) low = mid; else high = mid;
        }
        zeros.push((low + high) / 2);
      }
      previous = { x, y };
    }
  });
  return zeros.sort((a, b) => a - b).filter((x, index, all) => index === 0 || x - all[index - 1] > 1e-6);
};

const sampledValues = (graph, half) => {
  const values = [];
  wideSegments(graph, half).forEach((segment) => {
    const count = 4000;
    for (let i = 0; i <= count; i += 1) {
      let x = segment.from + ((segment.to - segment.from) * i) / count;
      if (i === 0 && !segment.fromClosed) x += 1e-7;
      if (i === count && !segment.toClosed) x -= 1e-7;
      const y = evaluateGraph(graph, x);
      // Where the sample sits: at the window's edge, or at an end the graph
      // only approaches (an asymptote or an open endpoint).
      const openEnd = (i <= 2 && !segment.fromClosed) || (i >= count - 2 && !segment.toClosed);
      const windowEdge = Math.abs(x) >= 0.85 * half;
      if (Number.isFinite(y)) values.push({ x, y, approachedOnly: openEnd || windowEdge });
    }
  });
  return values;
};

const checkQuestion = (question, slot) => {
  const where = `${slot.family}/${slot.feature}/${slot.variant}/${slot.tier}: ${JSON.stringify(question.graph)}`;
  const { graph, view, targets } = question;
  assert.equal(question.fallback, false, `fallback used for ${where}`);
  assert.equal(question.doesNotExist, !slot.exists, where);
  assert.equal(question.targetCount, Math.max(1, targets.length), where);

  // On the grid, inside the view, away from the edges; both axes visible.
  const grid = slot.tier === QUESTION_TIER.EASY ? 1 : 2;
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  assert.ok(view.xMin < 0 && view.xMax > 0 && view.yMin < 0 && view.yMax > 0, `both axes visible: ${where}`);
  for (const target of targets) {
    assert.ok(Number.isInteger(target.x * grid) && Number.isInteger(target.y * grid), `target on the grid: ${JSON.stringify(target)} ${where}`);
    assert.equal(String(target.x).length < 8 && String(target.y).length < 8, true, `no float artifacts: ${JSON.stringify(target)}`);
    for (const [value, min, span] of [[target.x, view.xMin, xSpan], [target.y, view.yMin, ySpan]]) {
      assert.ok(value - min >= VIEW_RULES.targetInset * span - EPS && min + span - value >= VIEW_RULES.targetInset * span - EPS, `target inset: ${JSON.stringify(target)} in ${JSON.stringify(view)} ${where}`);
    }
  }
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      const distance = Math.hypot((targets[i].x - targets[j].x) / xSpan, (targets[i].y - targets[j].y) / ySpan);
      assert.ok(distance >= VIEW_RULES.targetSeparation - EPS, `targets apart: ${where}`);
    }
  }

  // The feature, found again from the curve alone.
  switch (slot.feature) {
    case GRAPH_FEATURE.X_INTERCEPT: {
      const zeros = numericZeros(graph);
      assert.equal(zeros.length, targets.length, `zero count ${zeros} vs ${JSON.stringify(targets)}: ${where}`);
      zeros.forEach((zero, index) => {
        assert.ok(Math.abs(zero - targets[index].x) < 1e-6, `zero at ${zero}, target ${targets[index].x}: ${where}`);
        assert.equal(targets[index].y, 0);
        assert.ok(Math.abs(evaluateGraph(graph, targets[index].x)) < 1e-9, `f(target) = 0: ${where}`);
      });
      break;
    }
    case GRAPH_FEATURE.Y_INTERCEPT: {
      const atZero = evaluateGraph(graph, 0);
      if (slot.exists) {
        assert.equal(targets.length, 1);
        assert.equal(targets[0].x, 0);
        assert.ok(Math.abs(atZero - targets[0].y) < 1e-9, `f(0) = ${atZero} vs ${targets[0].y}: ${where}`);
      } else {
        assert.ok(!Number.isFinite(atZero), `x = 0 is outside the domain: ${where}`);
      }
      break;
    }
    case GRAPH_FEATURE.VERTEX:
      assert.deepEqual(targets.map(({ x, y }) => [x, y]), [[graph.h, graph.k]], where);
      break;
    case GRAPH_FEATURE.MAXIMUM:
    case GRAPH_FEATURE.MINIMUM: {
      const sign = slot.feature === GRAPH_FEATURE.MAXIMUM ? 1 : -1;
      const extreme = (values) => {
        const best = values.reduce((top, entry) => (sign * entry.y > sign * top.y ? entry : top));
        // Every sample that attains the extreme value: in floating point a
        // curve creeping toward an asymptote saturates into a plateau.
        const ties = values.filter((entry) => entry.y === best.y);
        return { ...best, approachedOnly: ties.some((entry) => entry.approachedOnly) };
      };
      const near = extreme(sampledValues(graph, 50));
      const far = extreme(sampledValues(graph, 110));
      if (slot.exists) {
        const [target] = targets;
        assert.ok(Math.abs(evaluateGraph(graph, target.x) - target.y) < 1e-9, `attained at the target: ${where}`);
        assert.ok(sign * (far.y - target.y) <= 1e-9, `nothing beyond the extreme: ${where}`);
        // Unique: no other sampled point comes near the extreme value.
        const rivals = sampledValues(graph, 50).filter((entry) => Math.abs(entry.y - target.y) < 1e-6 && Math.abs(entry.x - target.x) > 0.05);
        assert.equal(rivals.length, 0, `a unique extreme point: ${where}`);
      } else {
        // Not attained: the most extreme value sampled sits where the graph
        // only APPROACHES — off toward infinity at the window's edge, or
        // against an asymptote or open endpoint — never at a point the graph
        // reaches and turns back from. (Comparing values cannot tell: a curve
        // creeping toward y = 3 saturates to exactly 3 in floating point.)
        assert.ok(near.approachedOnly && far.approachedOnly, `no ${slot.feature}, but sampled extreme at x = ${far.x}: ${where}`);
      }
      break;
    }
    default:
      assert.fail(`unexpected feature ${slot.feature}`);
  }
};

test('every family, feature, variant and tier generates valid, independently verified questions', () => {
  let checked = 0;
  for (const slot of ALL_SLOTS) {
    for (const question of generateAll(slot)) {
      checkQuestion(question, slot);
      checked += 1;
    }
  }
  assert.ok(ALL_SLOTS.length >= 100, `the catalog covers the families (${ALL_SLOTS.length} slots)`);
  assert.ok(checked >= 4000);
});

test('every supported family is in the catalog, and each can ask an existing feature', () => {
  assert.deepEqual(GRAPH_FAMILY_IDS, ['linear', 'quadratic', 'absolute', 'cubic', 'exponential', 'squareRoot', 'cubeRoot', 'rational', 'piecewise']);
  for (const family of GRAPH_FAMILY_IDS) {
    assert.ok(ALL_SLOTS.some((slot) => slot.family === family && slot.exists), `${family} has an existing-answer question`);
  }
  for (const feature of GRAPH_FEATURE_IDS) {
    assert.ok(ALL_SLOTS.some((slot) => slot.feature === feature && slot.exists), `${feature} is askable`);
  }
});

test('special cases come out exactly as the mathematics says', () => {
  const only = (family, feature, variant, tier = QUESTION_TIER.CHALLENGE) => generateQuestionForSlot({
    slot: { family, feature, variant, tier }, seedText: `special|${family}|${variant}`,
  });
  // A tangent parabola has ONE x-intercept: the repeated zero is one point.
  const tangent = only('quadratic', 'xIntercept', 'tangent');
  assert.equal(tangent.targets.length, 1);
  assert.equal(tangent.targets[0].x, tangent.graph.h);
  assert.equal(tangent.graph.k, 0);
  // A triple root: one zero, the curve flattening through it.
  const triple = only('cubic', 'xIntercept', 'triple');
  assert.equal(triple.targets.length, 1);
  // Double root plus single root: two zeros, one of them a touch.
  const touch = only('cubic', 'xIntercept', 'tangent');
  assert.equal(touch.targets.length, 2);
  const roots = touch.graph.roots;
  assert.equal(new Set(roots).size, 2, 'one root repeated');
  // An exponential above its asymptote has no x-intercept.
  const growth = only('exponential', 'xIntercept', 'none', QUESTION_TIER.STANDARD);
  assert.equal(growth.targets.length, 0);
  assert.ok(Math.sign(growth.graph.a) === Math.sign(growth.graph.k) && growth.graph.k !== 0);
  // A square root's endpoint is its minimum, closed and drawn.
  const root = only('squareRoot', 'minimum', 'one');
  assert.deepEqual(root.targets.map(({ x, y }) => [x, y]), [[root.graph.h, root.graph.k]]);
  assert.ok(graphMarkers(root.graph, root.view).some((marker) => marker.closed && marker.x === root.graph.h));
  // A square root whose domain starts right of the y-axis has no y-intercept.
  const gap = only('squareRoot', 'yIntercept', 'none');
  assert.equal(gap.targets.length, 0);
  assert.ok(!Number.isFinite(evaluateGraph(gap.graph, 0)));
  // 1/x-type: the vertical asymptote is the y-axis.
  const reciprocal = only('rational', 'yIntercept', 'none', QUESTION_TIER.STANDARD);
  assert.equal(reciprocal.graph.h, 0);
  assert.equal(reciprocal.targets.length, 0);
  // Piecewise: an attained maximum sits on a closed dot, never an open one.
  const peak = only('piecewise', 'maximum', 'one');
  const [top] = peak.targets;
  const markers = graphMarkers(peak.graph, peak.view);
  assert.ok(!markers.some((marker) => !marker.closed && marker.x === top.x && marker.y === top.y), 'the maximum is not an open endpoint');
  assert.ok(Number.isFinite(evaluateGraph(peak.graph, top.x)));
});

test('a rational graph is never drawn across its asymptote', () => {
  const graph = { kind: GRAPH_KIND.RATIONAL, a: 2, h: 1, k: -1 };
  const lines = sampleGraph(graph, { xMin: -8, xMax: 8, yMin: -8, yMax: 8 });
  assert.equal(lines.length, 2, 'one polyline per branch');
  for (const line of lines) {
    const xs = line.map(([x]) => x);
    assert.ok(xs.every((x) => x < 1) || xs.every((x) => x > 1), 'a branch stays on its side');
  }
  // A piecewise jump is never bridged either.
  const step = {
    kind: GRAPH_KIND.PIECEWISE,
    pieces: [
      { m: 1, b: 0, from: null, to: { x: 1, closed: false } },
      { m: 1, b: 3, from: { x: 1, closed: true }, to: null },
    ],
  };
  assert.equal(sampleGraph(step, { xMin: -6, xMax: 6, yMin: -6, yMax: 10 }).length, 2);
  assert.deepEqual(graphMarkers(step, { xMin: -6, xMax: 6, yMin: -6, yMax: 10 }), [
    { x: 1, y: 1, closed: false },
    { x: 1, y: 4, closed: true },
  ]);
});

test('exact arithmetic: features are fractions until the last step', () => {
  assert.deepEqual(Q.add(Q.rat(1, 2), Q.rat(1, 3)), { n: 5, d: 6 });
  assert.deepEqual(Q.rat(4, -8), { n: -1, d: 2 });
  assert.deepEqual(Q.exactSqrt(Q.rat(9, 4)), { n: 3, d: 2 });
  assert.equal(Q.exactSqrt(Q.rat(2)), null, 'an irrational root is refused, never approximated');
  assert.deepEqual(Q.exactCbrt(Q.rat(-8)), { n: -2, d: 1 });
  assert.deepEqual(Q.pow(Q.rat(1, 2), -3), { n: 8, d: 1 });
  assert.equal(Q.onGrid(Q.rat(5, 2), 2), true);
  assert.equal(Q.onGrid(Q.rat(5, 4), 2), false);
  assert.throws(() => Q.div(1, 0), /Division by zero/);
  assert.throws(() => Q.mul(2 ** 52, 2 ** 52), /exact integer range/);
  // A parabola through 1/2 and 7/2: its analysis lands exactly on the grid.
  const family = getGraphFamily('quadratic');
  const analysis = family.analyze({ a: Q.rat(1), h: Q.rat(2), k: Q.rat(-9, 4) });
  assert.equal(analysis.xIntercept.status, FEATURE_STATUS.EXISTS);
  assert.deepEqual(analysis.xIntercept.points.map((p) => [Q.format(p.x), Q.format(p.y)]), [['1/2', '0'], ['7/2', '0']]);
  // √2 zeros are inexact and can never be issued.
  assert.equal(family.analyze({ a: Q.rat(1), h: Q.rat(0), k: Q.rat(-2) }).xIntercept.status, FEATURE_STATUS.INEXACT);
});

test('wording is classroom vocabulary, and "roots" belongs to polynomials only', () => {
  assert.deepEqual(featureWordings('xIntercept', { family: 'quadratic', tier: 'easy' }).map((entry) => entry.id), ['xIntercepts'], 'Easy uses the plain name');
  assert.deepEqual(featureWordings('xIntercept', { family: 'quadratic', tier: 'standard' }).map((entry) => entry.id), ['xIntercepts', 'zeros', 'roots']);
  assert.deepEqual(featureWordings('xIntercept', { family: 'exponential', tier: 'challenge' }).map((entry) => entry.id), ['xIntercepts', 'zeros']);
  assert.deepEqual(featureWordings('vertex', { family: 'linear', tier: 'challenge' }), [], 'a line has no vertex to ask about');
  for (const slot of ALL_SLOTS) {
    const question = generateQuestionForSlot({ slot, seedText: `wording|${slot.family}|${slot.variant}` });
    if (question.wording === 'roots') assert.ok(['linear', 'quadratic', 'cubic'].includes(question.family), `roots of a ${question.family}`);
    // The prompt never gives away how many targets there are.
    assert.doesNotMatch(question.prompt, /\b(one|two|three|both)\b/i);
    if (slot.feature === GRAPH_FEATURE.X_INTERCEPT) assert.match(question.prompt, /^Find all /);
  }
});

test('generation is deterministic, individual, and never ships the variant name', () => {
  const config = { families: ['linear', 'quadratic', 'absolute'], features: ['xIntercept', 'yIntercept', 'vertex'], difficulty: 'standard' };
  const ask = (studentKey, questionIndex) => generateRushQuestion({ seed: 'room-secret', studentKey, roundIndex: 0, questionIndex, config });
  assert.deepEqual(ask('student-a', 3), ask('student-a', 3), 'the same inputs give the same question');
  const graphsA = Array.from({ length: 12 }, (_, index) => JSON.stringify(ask('student-a', index).graph));
  const graphsB = Array.from({ length: 12 }, (_, index) => JSON.stringify(ask('student-b', index).graph));
  assert.ok(graphsA.filter((graph, index) => graph === graphsB[index]).length <= 1, 'two students do not see the same graph in the same place');
  const other = generateRushQuestion({ seed: 'another-room', studentKey: 'student-a', roundIndex: 0, questionIndex: 3, config });
  assert.notDeepEqual(other.graph, ask('student-a', 3).graph, 'the room secret matters');
  const publicCopy = publicRushQuestion(ask('student-a', 0));
  assert.ok(!('variant' in publicCopy) && !('tier' in publicCopy) && !('doesNotExist' in publicCopy), 'the device gets the graph, not the generator\'s labels');
});

test('every student gets the same mix in every block, in their own order', () => {
  const config = { families: [...GRAPH_FAMILY_IDS], features: [...GRAPH_FEATURE_IDS], difficulty: 'mixed' };
  const students = Array.from({ length: 30 }, (_, index) => `student-${index}`);
  for (const blockIndex of [0, 1, 2, 5]) {
    const template = roundBlockTemplate({ seed: 'room', roundIndex: 1, blockIndex, config });
    assert.equal(template.length, SCHEDULE_BLOCK_SIZE);
    const expected = template.map((slot) => JSON.stringify(slot)).sort();
    const orders = new Set();
    for (const studentKey of students) {
      const slots = Array.from({ length: SCHEDULE_BLOCK_SIZE }, (_, offset) => scheduledSlot({
        seed: 'room', studentKey, roundIndex: 1, questionIndex: blockIndex * SCHEDULE_BLOCK_SIZE + offset, config,
      }));
      assert.deepEqual(slots.map((slot) => JSON.stringify(slot)).sort(), expected, 'the same slots for everyone');
      orders.add(slots.map((slot) => JSON.stringify(slot)).join('|'));
    }
    assert.ok(orders.size > 5, `students work the block in different orders (block ${blockIndex})`);
  }
  // Mixed difficulty ramps: the first block is gentler than later ones.
  const tierCount = (blockIndex, tier) => roundBlockTemplate({ seed: 'room', roundIndex: 0, blockIndex, config }).filter((slot) => slot.tier === tier).length;
  assert.ok(tierCount(0, 'easy') >= 2 && tierCount(0, 'challenge') === 0);
  assert.ok(tierCount(3, 'challenge') >= 2 && tierCount(3, 'easy') === 0);
});

test('"Does Not Exist" is the answer at the tier\'s share — never at Easy', () => {
  const config = { families: [...GRAPH_FAMILY_IDS], features: [...GRAPH_FEATURE_IDS] };
  for (const tier of QUESTION_TIER_ORDER) {
    const catalog = slotCatalog(config, tier);
    const total = catalog.reduce((sum, slot) => sum + slot.weight, 0);
    const absent = catalog.filter((slot) => !slot.exists).reduce((sum, slot) => sum + slot.weight, 0);
    assert.ok(Math.abs(absent / total - DOES_NOT_EXIST_SHARE[tier]) < 1e-9, `${tier}: ${absent / total}`);
  }
  // Drawn over many blocks, the share holds.
  let absentDrawn = 0;
  let drawn = 0;
  for (let blockIndex = 0; blockIndex < 400; blockIndex += 1) {
    roundBlockTemplate({ seed: 'share', roundIndex: 0, blockIndex, config: { ...config, difficulty: 'challenge' } }).forEach((slot) => {
      drawn += 1;
      if (!familyVariants(slot.family, slot.feature, slot.tier).find((entry) => entry.id === slot.variant).exists) absentDrawn += 1;
    });
  }
  assert.ok(Math.abs(absentDrawn / drawn - DOES_NOT_EXIST_SHARE.challenge) < 0.05, `drawn share ${absentDrawn / drawn}`);
  // A feature only lines can ask (their maximum) never makes a whole game of "Does Not Exist".
  const linesOnly = slotCatalog({ families: ['linear'], features: ['maximum'] }, 'standard');
  assert.deepEqual(linesOnly, [], 'no existing answer means no catalog — the config is refused upstream');
});

test('the PRNG is deterministic and spreads', () => {
  const a = createRng('seed');
  const b = createRng('seed');
  const draws = Array.from({ length: 50 }, () => a.next());
  assert.deepEqual(draws, Array.from({ length: 50 }, () => b.next()));
  assert.ok(draws.every((value) => value >= 0 && value < 1));
  const counts = [0, 0, 0, 0];
  const rng = createRng('spread');
  for (let i = 0; i < 4000; i += 1) counts[rng.int(0, 3)] += 1;
  assert.ok(counts.every((count) => count > 850 && count < 1150), JSON.stringify(counts));
  assert.notEqual(createRng('seed-1').next(), createRng('seed-2').next());
});
