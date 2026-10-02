/*
 * FUNCTION FAMILIES FOR GENERATED GRAPH-FEATURE QUESTIONS.
 *
 * A family knows two things, and keeps them apart on purpose:
 *
 *   build(rng, { feature, variant, tier })   choose EXACT parameters that are
 *                                            meant to give the requested shape —
 *                                            two zeros, a tangent, no maximum
 *   analyze(params)                          compute every feature of those
 *                                            parameters exactly, from scratch
 *
 * The generator (graphFeatureGenerator.mjs) asks for a variant, then checks the
 * analysis agrees: a quadratic built "to have two zeros" is only issued when the
 * independent analysis finds exactly two, on the grid. A family that intends
 * one thing and builds another cannot reach a student.
 *
 * Every coordinate a student can be asked to tap is an exact rational on the
 * question's grid (integers, or halves above Easy). Nothing here is a
 * floating-point approximation of an answer. Turning points of cubics, which
 * are irrational in general, are used only to frame the view — they are never
 * targets.
 *
 * WHAT IS DELIBERATELY NOT ASKED (v1), and why:
 *
 *   vertex of anything but a parabola or an absolute value graph — "vertex" is
 *     not defined for a line or a cubic, so asking would be a trick question.
 *   maximum/minimum of a cubic — its turning points are relative extrema; the
 *     answer to "the maximum" would be Does Not Exist while the graph shows an
 *     obvious peak. That is a vocabulary trap, not a reading skill, until a
 *     relative-extremum feature exists to ask about it honestly.
 *   maximum/minimum of a constant function — every point attains it.
 *   a piecewise extremum approached only at an OPEN endpoint (supremum not
 *     attained) — correct mathematics, but one pixel of open circle decides
 *     it; deferred until it can be taught deliberately.
 *   vertical lines — not functions; this game is about functions.
 *
 * Pure: Cloud Functions and tests. The student device never generates.
 */

import * as Q from './graphFeatureRational.mjs';
import { GRAPH_KIND } from './graphFeatureCurves.mjs';
import { GRAPH_FEATURE, QUESTION_TIER, tierRank } from './graphFeatureRegistry.mjs';

export const GRAPH_FAMILY = Object.freeze({
  LINEAR: 'linear',
  QUADRATIC: 'quadratic',
  ABSOLUTE: 'absolute',
  CUBIC: 'cubic',
  EXPONENTIAL: 'exponential',
  SQUARE_ROOT: 'squareRoot',
  CUBE_ROOT: 'cubeRoot',
  RATIONAL: 'rational',
  PIECEWISE: 'piecewise',
});

export const FEATURE_STATUS = Object.freeze({
  EXISTS: 'exists',
  NONE: 'none',
  // Every point qualifies (a constant's maximum), or infinitely many targets.
  AMBIGUOUS: 'ambiguous',
  // The feature exists but is not on the grid: never issued.
  INEXACT: 'inexact',
  // The feature is not a concept for this family (a line's vertex).
  NOT_APPLICABLE: 'notApplicable',
});

const { EASY, STANDARD, CHALLENGE } = QUESTION_TIER;
const F = GRAPH_FEATURE;

/* ----------------------------- shared helpers ----------------------------- */

// The grid targets live on: integers at Easy, halves above.
export const tierGridDenominator = (tier) => (tier === EASY ? 1 : 2);

// How far from the origin a feature coordinate may be drawn.
const FEATURE_RANGE = Object.freeze({ [EASY]: 5, [STANDARD]: 7, [CHALLENGE]: 9 });
const HALF_CHANCE = Object.freeze({ [EASY]: 0, [STANDARD]: 0.2, [CHALLENGE]: 0.35 });

const range = (tier) => FEATURE_RANGE[tier] ?? FEATURE_RANGE[STANDARD];

/** A grid coordinate in [-limit, limit], sometimes a half above Easy. */
const coordinate = (rng, tier, { min = -range(tier), max = range(tier), nonZero = false } = {}) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const whole = rng.int(Math.ceil(min), Math.floor(max));
    const half = rng.chance(HALF_CHANCE[tier] ?? 0) ? (rng.chance(0.5) ? 1 : -1) : 0;
    const value = half ? Q.rat(2 * whole + half, 2) : Q.rat(whole);
    const numeric = Q.toNumber(value);
    if (numeric < min || numeric > max) continue;
    if (nonZero && numeric === 0) continue;
    return value;
  }
  return Q.rat(nonZero ? 1 : 0);
};

const signedInt = (rng, low, high) => Q.rat((rng.chance(0.5) ? -1 : 1) * rng.int(low, high));

const point = (x, y) => Object.freeze({ x: Q.toRational(x), y: Q.toRational(y) });
const exists = (...points) => Object.freeze({ status: FEATURE_STATUS.EXISTS, points: Object.freeze(points) });
const none = () => Object.freeze({ status: FEATURE_STATUS.NONE, points: Object.freeze([]) });
const ambiguous = () => Object.freeze({ status: FEATURE_STATUS.AMBIGUOUS, points: Object.freeze([]) });
const inexact = () => Object.freeze({ status: FEATURE_STATUS.INEXACT, points: Object.freeze([]) });
const notApplicable = () => Object.freeze({ status: FEATURE_STATUS.NOT_APPLICABLE, points: Object.freeze([]) });

const uniqueX = (values) => {
  const out = [];
  values.forEach((value) => { if (!out.some((existing) => Q.eq(existing, value))) out.push(Q.toRational(value)); });
  return out.sort(Q.cmp);
};

const variant = (id, { exists: present = true, minTier = EASY, weight = 1, flags = {} } = {}) => Object.freeze({
  id, exists: present, minTier, weight, flags: Object.freeze(flags),
});

const num = (value) => Q.toNumber(value);

/* -------------------------------- families -------------------------------- */

const LINEAR_SLOPES = Object.freeze({
  [EASY]: [[1], [-1], [2], [-2], [1, 2], [-1, 2]],
  [STANDARD]: [[1], [-1], [2], [-2], [3], [-3], [1, 2], [-1, 2], [3, 2], [-3, 2]],
  [CHALLENGE]: [[1], [-1], [2], [-2], [3], [-3], [1, 2], [-1, 2], [3, 2], [-3, 2], [1, 3], [-1, 3], [2, 3], [-2, 3], [1, 4], [-1, 4], [4], [-4]],
});

const linear = Object.freeze({
  id: GRAPH_FAMILY.LINEAR,
  label: 'Linear',
  kind: GRAPH_KIND.LINEAR,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [variant('one'), variant('none', { exists: false, minTier: STANDARD, weight: 0.8 })],
    [F.Y_INTERCEPT]: [variant('one')],
    [F.MAXIMUM]: [variant('none', { exists: false, minTier: STANDARD })],
    [F.MINIMUM]: [variant('none', { exists: false, minTier: STANDARD })],
  }),
  build(rng, { feature, variant: id, tier }) {
    if (feature === F.X_INTERCEPT && id === 'none') {
      // A horizontal line clearly away from the x-axis.
      return { m: Q.ZERO, b: signedInt(rng, 2, range(tier) - 1) };
    }
    const m = Q.toRational(rng.pick(LINEAR_SLOPES[tier] || LINEAR_SLOPES[STANDARD]));
    if (feature === F.X_INTERCEPT) {
      // Start from the answer: the intercept, then the line through it.
      const x0 = coordinate(rng, tier, { nonZero: tier === EASY });
      return { m, b: Q.neg(Q.mul(m, x0)) };
    }
    return { m, b: coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 }) };
  },
  toGraph: ({ m, b }) => ({ kind: GRAPH_KIND.LINEAR, m: num(m), b: num(b) }),
  analyze({ m, b }) {
    const constant = Q.isZero(m);
    return {
      [F.X_INTERCEPT]: constant
        ? (Q.isZero(b) ? ambiguous() : none())
        : exists(point(Q.div(Q.neg(b), m), 0)),
      [F.Y_INTERCEPT]: exists(point(0, b)),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: constant ? ambiguous() : none(),
      [F.MINIMUM]: constant ? ambiguous() : none(),
    };
  },
  keyPoints({ m, b }) {
    const points = [point(0, b)];
    if (!Q.isZero(m)) points.push(point(Q.div(Q.neg(b), m), 0));
    return points;
  },
  asymptotes: () => ({ vertical: [], horizontal: [] }),
  minVisibleFraction: 0.3,
});

const QUADRATIC_LEADS = Object.freeze({
  [EASY]: [[1], [-1], [1, 2], [-1, 2]],
  [STANDARD]: [[1], [-1], [1, 2], [-1, 2], [2], [-2]],
  [CHALLENGE]: [[1], [-1], [1, 2], [-1, 2], [2], [-2], [1, 4], [-1, 4], [3], [-3]],
});
const VERTEX_DEPTH_LIMIT = Object.freeze({ [EASY]: 6, [STANDARD]: 12, [CHALLENGE]: 18 });

/*
 * Parabolas and absolute value graphs share their structure exactly: a vertex
 * (h, k), an opening direction, and zeros at an exact distance from the
 * vertex. Only the distance rule differs (√(−k/a) against −k/a).
 */
const vertexFamily = ({ id, label, kind, leads, zeroDistance, zeroDepth, noZerosMeansComplexRoots = false }) => Object.freeze({
  id,
  label,
  kind,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [
      variant('two', { minTier: STANDARD, weight: 2 }),
      // The vertex sits on the axis: the curve touches and turns there.
      variant('tangent', { minTier: STANDARD, weight: 0.6, flags: { flatZero: true } }),
      // A parabola that never meets the axis still has two (complex) roots.
      variant('none', { exists: false, minTier: STANDARD, flags: noZerosMeansComplexRoots ? { nonRealRoots: true } : {} }),
    ],
    [F.Y_INTERCEPT]: [variant('one')],
    [F.VERTEX]: [variant('one')],
    [F.MAXIMUM]: [variant('one'), variant('none', { exists: false, minTier: STANDARD })],
    [F.MINIMUM]: [variant('one'), variant('none', { exists: false, minTier: STANDARD })],
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const pickLead = (sign = 0) => {
      const options = (leads[tier] || leads[STANDARD]).map((entry) => Q.toRational(entry))
        .filter((lead) => sign === 0 || Q.sign(lead) === sign);
      return rng.pick(options);
    };
    if (feature === F.X_INTERCEPT && chosen === 'two') {
      const a = pickLead();
      const r1 = coordinate(rng, tier, { min: -range(tier), max: range(tier) - 2 });
      const separation = Q.rat(rng.int(2, Math.min(8, range(tier))));
      const r2 = Q.add(r1, separation);
      const h = Q.div(Q.add(r1, r2), 2);
      const k = Q.neg(zeroDepth(a, Q.div(separation, 2)));
      if (Math.abs(num(k)) > VERTEX_DEPTH_LIMIT[tier]) return null;
      return { a, h, k };
    }
    if (feature === F.X_INTERCEPT && chosen === 'tangent') {
      return { a: pickLead(), h: coordinate(rng, tier, { nonZero: true }), k: Q.ZERO };
    }
    if (feature === F.X_INTERCEPT && chosen === 'none') {
      const a = pickLead();
      return { a, h: coordinate(rng, tier), k: Q.mul(Q.rat(Q.sign(a)), Q.rat(rng.int(2, Math.max(3, range(tier) - 1)))) };
    }
    // Vertex, maximum, minimum, y-intercept: a vertex on the grid and an
    // opening direction that makes the requested extremum exist or not.
    let direction = 0;
    if (feature === F.MAXIMUM) direction = chosen === 'one' ? -1 : 1;
    if (feature === F.MINIMUM) direction = chosen === 'one' ? 1 : -1;
    const a = pickLead(direction);
    const h = coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 });
    const k = coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 });
    return { a, h, k };
  },
  toGraph: ({ a, h, k }) => ({ kind, a: num(a), h: num(h), k: num(k) }),
  analyze({ a, h, k }) {
    let xIntercept;
    const ratio = Q.div(Q.neg(k), a);
    if (Q.isZero(k)) xIntercept = exists(point(h, 0));
    else if (Q.sign(ratio) < 0) xIntercept = none();
    else {
      const distance = zeroDistance(ratio);
      xIntercept = distance
        ? exists(point(Q.sub(h, distance), 0), point(Q.add(h, distance), 0))
        : inexact();
    }
    const vertex = point(h, k);
    const yValue = Q.add(Q.mul(a, kind === GRAPH_KIND.QUADRATIC ? Q.mul(h, h) : Q.abs(h)), k);
    return {
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: exists(point(0, yValue)),
      [F.VERTEX]: exists(vertex),
      [F.MAXIMUM]: Q.sign(a) < 0 ? exists(vertex) : none(),
      [F.MINIMUM]: Q.sign(a) > 0 ? exists(vertex) : none(),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    return [
      point(params.h, params.k),
      ...analysis[F.X_INTERCEPT].points,
    ];
  },
  // The y-intercept frames the view only when it is close enough to matter;
  // a far one would shrink the parabola to a sliver.
  optionalKeyPoints(params) {
    return this.analyze(params)[F.Y_INTERCEPT].points;
  },
  asymptotes: () => ({ vertical: [], horizontal: [] }),
  minVisibleFraction: 0.15,
});

const quadratic = vertexFamily({
  id: GRAPH_FAMILY.QUADRATIC,
  label: 'Quadratic',
  kind: GRAPH_KIND.QUADRATIC,
  leads: QUADRATIC_LEADS,
  zeroDistance: (ratio) => Q.exactSqrt(ratio),
  zeroDepth: (a, halfSeparation) => Q.mul(a, Q.mul(halfSeparation, halfSeparation)),
  noZerosMeansComplexRoots: true,
});

const ABSOLUTE_LEADS = Object.freeze({
  [EASY]: [[1], [-1], [2], [-2]],
  [STANDARD]: [[1], [-1], [2], [-2], [1, 2], [-1, 2], [3], [-3]],
  [CHALLENGE]: [[1], [-1], [2], [-2], [1, 2], [-1, 2], [3], [-3], [3, 2], [-3, 2]],
});

const absolute = vertexFamily({
  id: GRAPH_FAMILY.ABSOLUTE,
  label: 'Absolute value',
  kind: GRAPH_KIND.ABSOLUTE,
  leads: ABSOLUTE_LEADS,
  zeroDistance: (ratio) => Q.toRational(ratio),
  zeroDepth: (a, halfSeparation) => Q.mul(a, halfSeparation),
});

/* Cubic: a · Π(x − rᵢ) · ((x − p)² + q)?, integer roots. */
const CUBIC_LEADS = Object.freeze([[1, 4], [-1, 4], [1, 2], [-1, 2], [1], [-1], [1, 8], [-1, 8]]);
const CUBIC_VALUE_LIMIT = Object.freeze({ [EASY]: 12, [STANDARD]: 16, [CHALLENGE]: 24 });

const cubicCoefficients = ({ a, roots = [], quadratic: factor = null }) => {
  // Expand a · Π(x − r) · (x² − 2px + p² + q) into [c0, c1, c2, c3] (floats).
  let poly = [num(a)];
  const multiply = (left, right) => {
    const out = Array.from({ length: left.length + right.length - 1 }, () => 0);
    left.forEach((lc, li) => right.forEach((rc, ri) => { out[li + ri] += lc * rc; }));
    return out;
  };
  roots.forEach((root) => { poly = multiply(poly, [-num(root), 1]); });
  if (factor) poly = multiply(poly, [num(factor.p) ** 2 + num(factor.q), -2 * num(factor.p), 1]);
  return poly;
};

/** Real turning points of the cubic (floats) — framing only, never targets. */
export const cubicTurningPoints = (params) => {
  const [, c1, c2, c3] = cubicCoefficients(params);
  // f'(x) = 3c3 x² + 2c2 x + c1
  const A = 3 * c3;
  const B = 2 * c2;
  const C = c1;
  const discriminant = B * B - 4 * A * C;
  if (!A || discriminant <= 0) return [];
  const root = Math.sqrt(discriminant);
  const evaluate = (x) => cubicCoefficients(params).reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0);
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)].map((x) => ({ x, y: evaluate(x) }));
};

const cubicValueAt = ({ a, roots = [], quadratic: factor = null }, x) => {
  let value = Q.toRational(a);
  roots.forEach((root) => { value = Q.mul(value, Q.sub(x, root)); });
  if (factor) value = Q.mul(value, Q.add(Q.mul(Q.sub(x, factor.p), Q.sub(x, factor.p)), factor.q));
  return value;
};

const distinctIntegers = (rng, count, { min, max, gap }) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const values = Array.from({ length: count }, () => rng.int(min, max)).sort((x, y) => x - y);
    if (values.every((value, index) => index === 0 || value - values[index - 1] >= gap)) return values;
  }
  return null;
};

const cubic = Object.freeze({
  id: GRAPH_FAMILY.CUBIC,
  label: 'Cubic',
  kind: GRAPH_KIND.CUBIC,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [
      variant('three', { minTier: STANDARD, weight: 1.6 }),
      // Flat through its zero (a triple root), or touching and turning at
      // one of them (a double root).
      variant('triple', { minTier: STANDARD, weight: 0.5, flags: { flatZero: true } }),
      variant('tangent', { minTier: CHALLENGE, weight: 1, flags: { flatZero: true } }),
      // One real root; the other two are complex.
      variant('single', { minTier: CHALLENGE, weight: 0.6, flags: { nonRealRoots: true } }),
    ],
    [F.Y_INTERCEPT]: [variant('one')],
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const lead = () => Q.toRational(rng.pick(CUBIC_LEADS));
    const shape = feature === F.Y_INTERCEPT
      ? rng.pick(tier === EASY ? ['triple'] : ['three', 'triple', 'tangent'])
      : chosen;
    if (shape === 'three') {
      const roots = distinctIntegers(rng, 3, { min: -5, max: 5, gap: 2 });
      return roots ? { a: lead(), roots: roots.map((root) => Q.rat(root)), quadratic: null } : null;
    }
    if (shape === 'triple') {
      const r = Q.rat(rng.int(-4, 4));
      return { a: lead(), roots: [r, r, r], quadratic: null };
    }
    if (shape === 'tangent') {
      const pair = distinctIntegers(rng, 2, { min: -5, max: 5, gap: 3 });
      if (!pair) return null;
      const [double, single] = rng.chance(0.5) ? pair : [...pair].reverse();
      return { a: lead(), roots: [Q.rat(double), Q.rat(double), Q.rat(single)], quadratic: null };
    }
    // One real zero; the other factor never vanishes.
    const r = Q.rat(rng.int(-4, 4));
    const p = Q.rat(rng.int(-3, 3));
    return { a: lead(), roots: [r], quadratic: { p, q: Q.rat(rng.int(1, 4)) } };
  },
  toGraph: ({ a, roots, quadratic: factor }) => ({
    kind: GRAPH_KIND.CUBIC,
    a: num(a),
    roots: roots.map(num),
    quadratic: factor ? { p: num(factor.p), q: num(factor.q) } : null,
  }),
  analyze(params) {
    const zeros = uniqueX(params.roots).map((x) => point(x, 0));
    return {
      [F.X_INTERCEPT]: zeros.length ? exists(...zeros) : none(),
      [F.Y_INTERCEPT]: exists(point(0, cubicValueAt(params, Q.ZERO))),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: notApplicable(),
      [F.MINIMUM]: notApplicable(),
    };
  },
  keyPoints(params) {
    return this.analyze(params)[F.X_INTERCEPT].points;
  },
  optionalKeyPoints(params) {
    return this.analyze(params)[F.Y_INTERCEPT].points;
  },
  // Turning points frame the view so the shape between zeros is visible.
  framingPoints: (params) => cubicTurningPoints(params),
  valueLimit: (tier) => CUBIC_VALUE_LIMIT[tier],
  asymptotes: () => ({ vertical: [], horizontal: [] }),
  minVisibleFraction: 0.15,
});

/* Exponential: a · base^(x − h) + k. Bases are exact: 2, 3, 1/2, 1/3. */
const EXPONENTIAL_BASES = Object.freeze({
  [EASY]: [[2], [1, 2]],
  [STANDARD]: [[2], [1, 2], [3]],
  [CHALLENGE]: [[2], [1, 2], [3], [1, 3]],
});
const EXPONENTIAL_LEADS = Object.freeze({
  [EASY]: [[1], [2], [-1]],
  [STANDARD]: [[1], [-1], [2], [-2], [1, 2]],
  [CHALLENGE]: [[1], [-1], [2], [-2], [1, 2], [-1, 2], [3]],
});

/** The integer e with base^e = value, if any (|e| ≤ 8). */
const exactLogarithm = (base, value) => {
  for (let exponent = -8; exponent <= 8; exponent += 1) {
    if (Q.eq(Q.pow(base, exponent), value)) return exponent;
  }
  return null;
};

const exponential = Object.freeze({
  id: GRAPH_FAMILY.EXPONENTIAL,
  label: 'Exponential',
  kind: GRAPH_KIND.EXPONENTIAL,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [
      variant('one', { minTier: STANDARD, weight: 1.2 }),
      variant('none', { exists: false, minTier: STANDARD }),
      // The asymptote IS the x-axis: the curve approaches it and never
      // arrives. Correct and worth teaching, but visually subtle.
      variant('noneOnAxis', { exists: false, minTier: CHALLENGE, weight: 0.6, flags: { asymptoteOnAxis: true } }),
    ],
    [F.Y_INTERCEPT]: [variant('one')],
    [F.MAXIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
    [F.MINIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const base = Q.toRational(rng.pick(EXPONENTIAL_BASES[tier] || EXPONENTIAL_BASES[STANDARD]));
    const a = Q.toRational(rng.pick(EXPONENTIAL_LEADS[tier] || EXPONENTIAL_LEADS[STANDARD]));
    const h = tier === CHALLENGE && rng.chance(0.35) ? Q.rat(rng.pick([-1, 1])) : Q.ZERO;
    if (feature === F.X_INTERCEPT && chosen === 'one') {
      // Start from the intercept x = h + e, then the shift that puts it there.
      // base^e between 2 and 9 keeps the asymptote y = k clear of the axis,
      // so the crossing reads as a crossing and not as the curve flattening.
      const exponents = [-3, -2, -1, 1, 2, 3].filter((e) => {
        const power = Q.toNumber(Q.pow(base, e));
        return power >= 2 && power <= 9;
      });
      const e = rng.pick(exponents);
      const k = Q.neg(Q.mul(a, Q.pow(base, e)));
      return { a, base, h, k };
    }
    if (feature === F.X_INTERCEPT && chosen === 'noneOnAxis') return { a, base, h, k: Q.ZERO };
    if (feature === F.X_INTERCEPT && chosen === 'none') {
      return { a, base, h, k: Q.mul(Q.rat(Q.sign(a)), Q.rat(rng.int(2, 4))) };
    }
    const k = Q.rat(rng.int(-4, 4));
    return { a, base, h, k };
  },
  toGraph: ({ a, base, h, k }) => ({
    kind: GRAPH_KIND.EXPONENTIAL,
    a: num(a),
    base: [base.n, base.d],
    h: num(h),
    k: num(k),
  }),
  analyze({ a, base, h, k }) {
    let xIntercept;
    const ratio = Q.div(Q.neg(k), a);
    if (Q.sign(ratio) <= 0) xIntercept = none();
    else {
      const exponent = exactLogarithm(base, ratio);
      xIntercept = exponent === null ? inexact() : exists(point(Q.add(h, Q.rat(exponent)), 0));
    }
    const shift = Q.neg(h);
    const yIntercept = Q.isInteger(shift)
      ? exists(point(0, Q.add(Q.mul(a, Q.pow(base, shift.n)), k)))
      : inexact();
    return {
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: yIntercept,
      [F.VERTEX]: notApplicable(),
      // Unbounded one way, approaching (never reaching) the asymptote the other.
      [F.MAXIMUM]: none(),
      [F.MINIMUM]: none(),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    return [...analysis[F.Y_INTERCEPT].points, ...analysis[F.X_INTERCEPT].points];
  },
  asymptotes: ({ k }) => ({ vertical: [], horizontal: [num(k)] }),
  minVisibleFraction: 0.2,
});

/* Square root: a√(s(x − h)) + k, endpoint (h, k), s = ±1. */
const ROOT_LEADS = Object.freeze({
  [EASY]: [[1], [2]],
  [STANDARD]: [[1], [-1], [2], [-2], [1, 2]],
  [CHALLENGE]: [[1], [-1], [2], [-2], [1, 2], [-1, 2], [3]],
});

const squareRoot = Object.freeze({
  id: GRAPH_FAMILY.SQUARE_ROOT,
  label: 'Square root',
  kind: GRAPH_KIND.SQUARE_ROOT,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [variant('one'), variant('none', { exists: false, minTier: STANDARD })],
    [F.Y_INTERCEPT]: [
      variant('one'),
      // The domain starts to the right of the y-axis (or ends left of it).
      variant('none', { exists: false, minTier: STANDARD, flags: { domainExcludesZero: true } }),
    ],
    // The closed endpoint is the extreme value; the other way is unbounded.
    [F.MAXIMUM]: [variant('one', { minTier: STANDARD }), variant('none', { exists: false, minTier: STANDARD })],
    [F.MINIMUM]: [variant('one'), variant('none', { exists: false, minTier: STANDARD })],
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const s = tier === CHALLENGE && rng.chance(0.4) ? -1 : 1;
    const leads = (ROOT_LEADS[tier] || ROOT_LEADS[STANDARD]).map((entry) => Q.toRational(entry));
    let sign = 0;
    if (feature === F.MAXIMUM) sign = chosen === 'one' ? -1 : 1;
    if (feature === F.MINIMUM) sign = chosen === 'one' ? 1 : -1;
    if (feature === F.X_INTERCEPT) sign = 0;
    const a = rng.pick(leads.filter((lead) => sign === 0 || Q.sign(lead) === sign));
    if (feature === F.X_INTERCEPT) {
      if (chosen === 'none') {
        return { a, s, h: Q.rat(rng.int(-4, 3)), k: Q.mul(Q.rat(Q.sign(a)), Q.rat(rng.int(2, 4))) };
      }
      // The intercept is t² from the endpoint, with t = −k/a a whole number.
      const t = rng.int(tier === EASY ? 1 : 0, 3);
      return { a, s, h: Q.rat(rng.int(-6, 2) * s), k: Q.neg(Q.mul(a, Q.rat(t))) };
    }
    if (feature === F.Y_INTERCEPT) {
      if (chosen === 'none') {
        // Endpoint at least two units off the y-axis, on the far side.
        return { a, s, h: Q.rat(s * rng.int(2, 5)), k: Q.rat(rng.int(-4, 4)) };
      }
      const u = rng.int(0, 3);
      return { a, s, h: Q.rat(-s * u * u), k: Q.rat(rng.int(-4, 4)) };
    }
    return { a, s, h: Q.rat(rng.int(-5, 4)), k: Q.rat(rng.int(-5, 5)) };
  },
  toGraph: ({ a, s, h, k }) => ({ kind: GRAPH_KIND.SQUARE_ROOT, a: num(a), s, h: num(h), k: num(k) }),
  analyze({ a, s, h, k }) {
    const ratio = Q.div(Q.neg(k), a);
    const xIntercept = Q.sign(ratio) < 0
      ? none()
      : exists(point(Q.add(h, Q.mul(Q.rat(s), Q.mul(ratio, ratio))), 0));
    const inside = Q.mul(Q.rat(s), Q.neg(h));
    let yIntercept;
    if (Q.sign(inside) < 0) yIntercept = none();
    else {
      const root = Q.exactSqrt(inside);
      yIntercept = root ? exists(point(0, Q.add(Q.mul(a, root), k))) : inexact();
    }
    const endpoint = point(h, k);
    return {
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: yIntercept,
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: Q.sign(a) < 0 ? exists(endpoint) : none(),
      [F.MINIMUM]: Q.sign(a) > 0 ? exists(endpoint) : none(),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    return [point(params.h, params.k), ...analysis[F.X_INTERCEPT].points, ...analysis[F.Y_INTERCEPT].points];
  },
  // Show enough of the curve past its endpoint to read its direction.
  framingPoints: ({ a, s, h, k }) => [{ x: num(h) + s * 6, y: num(k) + num(a) * Math.sqrt(6) }],
  asymptotes: () => ({ vertical: [], horizontal: [] }),
  minVisibleFraction: 0.25,
});

/* Cube root: a∛(x − h) + k — one zero, one y-intercept, no extrema. */
const cubeRoot = Object.freeze({
  id: GRAPH_FAMILY.CUBE_ROOT,
  label: 'Cube root',
  kind: GRAPH_KIND.CUBE_ROOT,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [variant('one', { minTier: STANDARD })],
    [F.Y_INTERCEPT]: [variant('one', { minTier: STANDARD })],
    [F.MAXIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
    [F.MINIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
  }),
  build(rng, { feature, tier }) {
    const a = Q.toRational(rng.pick((ROOT_LEADS[tier] || ROOT_LEADS[STANDARD]).filter((lead) => lead.length === 1)));
    if (feature === F.X_INTERCEPT) {
      // The zero is (−k/a)³ from the center: 0, ±1 or ±8.
      const t = rng.pick([0, 1, -1, 1, -1, 2, -2]);
      return { a, h: Q.rat(rng.int(-3, 3)), k: Q.neg(Q.mul(a, Q.rat(t))) };
    }
    if (feature === F.Y_INTERCEPT) {
      return { a, h: Q.rat(rng.pick([0, 1, -1, 1, -1])), k: Q.rat(rng.int(-4, 4)) };
    }
    return { a, h: Q.rat(rng.int(-4, 4)), k: Q.rat(rng.int(-4, 4)) };
  },
  toGraph: ({ a, h, k }) => ({ kind: GRAPH_KIND.CUBE_ROOT, a: num(a), h: num(h), k: num(k) }),
  analyze({ a, h, k }) {
    const t = Q.div(Q.neg(k), a);
    const root = Q.exactCbrt(Q.neg(h));
    return {
      [F.X_INTERCEPT]: exists(point(Q.add(h, Q.mul(t, Q.mul(t, t))), 0)),
      [F.Y_INTERCEPT]: root ? exists(point(0, Q.add(Q.mul(a, root), k))) : inexact(),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: none(),
      [F.MINIMUM]: none(),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    return [point(params.h, params.k), ...analysis[F.X_INTERCEPT].points, ...analysis[F.Y_INTERCEPT].points];
  },
  framingPoints: ({ a, h, k }) => [
    { x: num(h) - 8, y: num(k) - 2 * num(a) },
    { x: num(h) + 8, y: num(k) + 2 * num(a) },
  ],
  asymptotes: () => ({ vertical: [], horizontal: [] }),
  minVisibleFraction: 0.35,
});

/* Rational: a / (x − h) + k. Asymptotes x = h and y = k are drawn. */
const RATIONAL_LEADS = Object.freeze([1, -1, 2, -2, 3, -3, 4, -4, 6, -6]);

const rational = Object.freeze({
  id: GRAPH_FAMILY.RATIONAL,
  label: 'Rational',
  kind: GRAPH_KIND.RATIONAL,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [
      variant('one', { minTier: STANDARD, weight: 1.2 }),
      variant('noneOnAxis', { exists: false, minTier: CHALLENGE, weight: 0.6, flags: { asymptoteOnAxis: true } }),
    ],
    [F.Y_INTERCEPT]: [
      variant('one', { minTier: STANDARD }),
      // The vertical asymptote is the y-axis.
      variant('none', { exists: false, minTier: STANDARD, flags: { asymptoteOnAxis: true } }),
    ],
    [F.MAXIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
    [F.MINIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
  }),
  build(rng, { feature, variant: chosen }) {
    const a = Q.rat(rng.pick(RATIONAL_LEADS));
    if (feature === F.X_INTERCEPT && chosen === 'noneOnAxis') {
      return { a, h: Q.rat(rng.pick([-3, -2, 2, 3])), k: Q.ZERO };
    }
    if (feature === F.X_INTERCEPT) {
      // The zero sits `distance` from the vertical asymptote and the
      // horizontal asymptote is well off the axis: a = k · distance.
      const distance = Q.rat(rng.pick([2, 3, 4, -2, -3, -4]));
      const k = Q.rat(rng.pick([-3, -2, -1, 1, 2, 3]));
      return { a: Q.mul(k, distance), h: Q.rat(rng.int(-3, 3)), k };
    }
    if (feature === F.Y_INTERCEPT && chosen === 'none') {
      return { a, h: Q.ZERO, k: Q.rat(rng.pick([-3, -2, 2, 3])) };
    }
    if (feature === F.Y_INTERCEPT) {
      // a is a multiple of h, so the intercept k − a/h lands on the grid a
      // whole step or more from the horizontal asymptote.
      const h = Q.rat(rng.pick([-4, -3, -2, 2, 3, 4]));
      const steps = Q.rat(rng.pick([-3, -2, -1, 1, 2, 3]));
      return { a: Q.mul(h, steps), h, k: Q.rat(rng.int(-4, 4)) };
    }
    return { a, h: Q.rat(rng.pick([-3, -2, -1, 1, 2, 3])), k: Q.rat(rng.pick([-3, -2, 2, 3])) };
  },
  toGraph: ({ a, h, k }) => ({ kind: GRAPH_KIND.RATIONAL, a: num(a), h: num(h), k: num(k) }),
  analyze({ a, h, k }) {
    return {
      [F.X_INTERCEPT]: Q.isZero(k) ? none() : exists(point(Q.sub(h, Q.div(a, k)), 0)),
      [F.Y_INTERCEPT]: Q.isZero(h) ? none() : exists(point(0, Q.sub(k, Q.div(a, h)))),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: none(),
      [F.MINIMUM]: none(),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    return [...analysis[F.X_INTERCEPT].points, ...analysis[F.Y_INTERCEPT].points];
  },
  // Both branches readable: a point on each side of the vertical asymptote.
  framingPoints: ({ a, h, k }) => {
    const reach = Math.max(1, Math.abs(num(a)));
    return [
      { x: num(h) - 3, y: num(k) - num(a) / 3 },
      { x: num(h) + 3, y: num(k) + num(a) / 3 },
      { x: num(h) + 0.5 * Math.sign(num(a) || 1), y: num(k) + Math.min(4, reach) },
    ];
  },
  asymptotes: ({ h, k }) => ({ vertical: [num(h)], horizontal: [num(k)] }),
  minVisibleFraction: 0.2,
});

/*
 * Piecewise: two linear pieces split at x = s. Exactly one side owns s
 * (closed dot); the other approaches it (open dot) unless the pieces meet.
 * Built from the values at the split, so every endpoint is on the grid.
 */
const PIECE_SLOPES = Object.freeze([[1], [-1], [2], [-2], [1, 2], [-1, 2], [3], [-3]]);

const pieceValue = (piece, x) => Q.add(Q.mul(piece.m, x), piece.b);
const pieceOwns = (piece, x) => {
  if (piece.from && (Q.cmp(x, piece.from.x) < 0 || (Q.eq(x, piece.from.x) && !piece.from.closed))) return false;
  if (piece.to && (Q.cmp(x, piece.to.x) > 0 || (Q.eq(x, piece.to.x) && !piece.to.closed))) return false;
  return true;
};

const makePieces = ({ s, leftSlope, rightSlope, leftValue, rightValue, leftClosed }) => [
  { m: leftSlope, b: Q.sub(leftValue, Q.mul(leftSlope, s)), from: null, to: { x: s, closed: leftClosed } },
  { m: rightSlope, b: Q.sub(rightValue, Q.mul(rightSlope, s)), from: { x: s, closed: !leftClosed }, to: null },
];

const piecewise = Object.freeze({
  id: GRAPH_FAMILY.PIECEWISE,
  label: 'Piecewise',
  kind: GRAPH_KIND.PIECEWISE,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [
      variant('one', { minTier: STANDARD }),
      variant('two', { minTier: STANDARD, weight: 1.2 }),
      variant('none', { exists: false, minTier: CHALLENGE }),
    ],
    [F.Y_INTERCEPT]: [variant('one', { minTier: STANDARD })],
    [F.MAXIMUM]: [variant('one', { minTier: CHALLENGE }), variant('none', { exists: false, minTier: CHALLENGE })],
    [F.MINIMUM]: [variant('one', { minTier: CHALLENGE }), variant('none', { exists: false, minTier: CHALLENGE })],
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const s = Q.rat(rng.int(-3, 3));
    const slope = (sign = 0) => rng.pick(PIECE_SLOPES.map((entry) => Q.toRational(entry))
      .filter((m) => sign === 0 || Q.sign(m) === sign));
    const leftClosed = rng.chance(0.5);
    if (feature === F.X_INTERCEPT && chosen !== 'none') {
      // Zeros placed first, strictly inside each piece's own interval.
      const leftZero = Q.sub(s, Q.rat(rng.int(2, 5)));
      const rightZero = Q.add(s, Q.rat(rng.int(2, 5)));
      const leftSlope = slope();
      const rightSlope = slope();
      const leftValue = Q.mul(leftSlope, Q.sub(s, leftZero));
      let rightValue = Q.mul(rightSlope, Q.sub(s, rightZero));
      if (chosen === 'one') {
        // The right piece stays off the axis: its zero is behind the split.
        rightValue = Q.mul(Q.rat(Q.sign(rightSlope)), Q.rat(rng.int(2, 4)));
        if (Q.eq(rightValue, leftValue)) rightValue = Q.add(rightValue, Q.rat(Q.sign(rightSlope)));
      }
      return { s, pieces: makePieces({ s, leftSlope, rightSlope, leftValue, rightValue, leftClosed }) };
    }
    if (feature === F.X_INTERCEPT) {
      // A "V" or step that stays above (or below) the axis.
      const up = rng.chance(0.5) ? 1 : -1;
      const leftSlope = slope(-up);
      const rightSlope = slope(up);
      const leftValue = Q.mul(Q.rat(up), Q.rat(rng.int(2, 4)));
      const rightValue = Q.mul(Q.rat(up), Q.rat(rng.int(2, 4)));
      return { s, pieces: makePieces({ s, leftSlope, rightSlope, leftValue, rightValue, leftClosed }) };
    }
    if (feature === F.MAXIMUM || feature === F.MINIMUM) {
      const peak = feature === F.MAXIMUM ? 1 : -1;
      if (chosen === 'none') {
        // Either both pieces head the same way (no extremes at all) or the
        // shape opens toward the extreme asked for.
        if (rng.chance(0.5)) {
          const direction = rng.chance(0.5) ? 1 : -1;
          return { s, pieces: makePieces({ s, leftSlope: slope(direction), rightSlope: slope(direction), leftValue: Q.rat(rng.int(-3, 3)), rightValue: Q.rat(rng.int(-3, 3)), leftClosed }) };
        }
        return { s, pieces: makePieces({ s, leftSlope: slope(-peak), rightSlope: slope(peak), leftValue: Q.rat(rng.int(-3, 3)), rightValue: Q.rat(rng.int(-3, 3)), leftClosed }) };
      }
      // An attained extreme: continuous, or the CLOSED side strictly beyond
      // the open side's limit.
      const owned = Q.rat(rng.int(-3, 4) * peak);
      const continuous = rng.chance(0.5);
      const other = continuous ? owned : Q.sub(owned, Q.mul(Q.rat(peak), Q.rat(rng.int(2, 3))));
      return {
        s,
        pieces: makePieces({
          s,
          leftSlope: slope(peak),
          rightSlope: slope(-peak),
          leftValue: leftClosed ? owned : other,
          rightValue: leftClosed ? other : owned,
          leftClosed,
        }),
      };
    }
    // y-intercept: any two pieces. At Challenge the split sometimes sits on
    // the y-axis, so the open/closed endpoint is what decides the answer;
    // below Challenge it never does (a split drawn at 0 moves off the axis).
    const offAxis = Q.eq(s, Q.ZERO) ? Q.rat(rng.pick([-3, -2, -1, 1, 2, 3])) : s;
    const split = tier === CHALLENGE ? (rng.chance(0.4) ? Q.ZERO : s) : offAxis;
    return {
      s: split,
      pieces: makePieces({
        s: split, leftSlope: slope(), rightSlope: slope(), leftValue: Q.rat(rng.int(-4, 4)), rightValue: Q.rat(rng.int(-4, 4)), leftClosed,
      }),
    };
  },
  toGraph: ({ pieces }) => ({
    kind: GRAPH_KIND.PIECEWISE,
    pieces: pieces.map((piece) => ({
      m: num(piece.m),
      b: num(piece.b),
      from: piece.from ? { x: num(piece.from.x), closed: piece.from.closed === true } : null,
      to: piece.to ? { x: num(piece.to.x), closed: piece.to.closed === true } : null,
    })),
  }),
  analyze({ s, pieces }) {
    const zeros = [];
    let zeroAmbiguous = false;
    pieces.forEach((piece) => {
      if (Q.isZero(piece.m)) {
        if (Q.isZero(piece.b)) zeroAmbiguous = true;
        return;
      }
      const x = Q.div(Q.neg(piece.b), piece.m);
      if (pieceOwns(piece, x)) zeros.push(x);
    });
    const owner = pieces.find((piece) => pieceOwns(piece, Q.ZERO));
    // Extremes of two monotone linear pieces can only be at the split.
    const atSplit = pieces.map((piece) => ({ value: pieceValue(piece, s), owns: pieceOwns(piece, s), piece }));
    const owned = atSplit.find((entry) => entry.owns);
    const unowned = atSplit.find((entry) => !entry.owns);
    const [left, right] = pieces;
    const extreme = (sign) => {
      // A maximum (sign 1) needs the left piece rising into s and the right
      // falling away from it; the attained value at s must beat the limit.
      if (Q.isZero(left.m) || Q.isZero(right.m)) return ambiguous();
      if (Q.sign(left.m) !== sign || Q.sign(right.m) !== -sign) return none();
      const beats = Q.cmp(owned.value, unowned.value) * sign;
      if (beats > 0 || Q.eq(owned.value, unowned.value)) return exists(point(s, owned.value));
      // The supremum sits at the open endpoint: not attained. Never issued.
      return ambiguous();
    };
    return {
      [F.X_INTERCEPT]: zeroAmbiguous ? ambiguous() : (zeros.length ? exists(...uniqueX(zeros).map((x) => point(x, 0))) : none()),
      [F.Y_INTERCEPT]: owner ? exists(point(0, pieceValue(owner, Q.ZERO))) : none(),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: extreme(1),
      [F.MINIMUM]: extreme(-1),
    };
  },
  keyPoints({ s, pieces }) {
    const analysis = this.analyze({ s, pieces });
    return [
      ...pieces.map((piece) => point(s, pieceValue(piece, s))),
      ...analysis[F.X_INTERCEPT].points,
    ];
  },
  optionalKeyPoints({ s, pieces }) {
    return this.analyze({ s, pieces })[F.Y_INTERCEPT].points;
  },
  framingPoints: ({ s, pieces }) => pieces.map((piece, index) => {
    const x = num(s) + (index === 0 ? -4 : 4);
    return { x, y: num(piece.m) * x + num(piece.b) };
  }),
  asymptotes: () => ({ vertical: [], horizontal: [] }),
  minVisibleFraction: 0.3,
});

const FAMILY_LIST = Object.freeze([linear, quadratic, absolute, cubic, exponential, squareRoot, cubeRoot, rational, piecewise]);
const FAMILIES = new Map(FAMILY_LIST.map((family) => [family.id, family]));

export const GRAPH_FAMILY_IDS = Object.freeze(FAMILY_LIST.map((family) => family.id));
export const getGraphFamily = (id) => FAMILIES.get(String(id || '')) || null;
export const listGraphFamilies = () => [...FAMILY_LIST];

/** The variants a family offers for a feature at a tier (or below). */
export const familyVariants = (familyId, featureId, tier = STANDARD) => {
  const family = getGraphFamily(familyId);
  const variants = family?.variants?.[featureId] || [];
  return variants.filter((entry) => tierRank(entry.minTier) <= tierRank(tier));
};

/** Whether a family can ever ask a feature with a real (existing) answer. */
export const familySupportsFeature = (familyId, featureId, tier = CHALLENGE) => familyVariants(familyId, featureId, tier)
  .some((entry) => entry.exists);
