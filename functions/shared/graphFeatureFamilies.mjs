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
 * RESTRICTED DOMAINS (rays and segments). A line, parabola, absolute value or
 * exponential may be built with `domain: { from, to }`, each end
 * `{ x, closed }` or null. Its analysis is the same graph's, restricted: an
 * intercept counts only where the domain includes it (on a closed end yes, on
 * an open end no), the vertex only if it is on the graph, and a maximum or
 * minimum is worked out exactly from the closed ends, the turning point and
 * where the graph heads past an open side (restrictedExtreme).
 *
 * ASYMPTOTES are lines, not points: `{ orientation: 'vertical', x }` or
 * `{ orientation: 'horizontal', y }`. A rational graph has two, an
 * exponential one (on the side it approaches y = k, if its domain keeps that
 * side), every other family none.
 *
 * DOMAIN AND RANGE are sets of numbers (numberLineSets.mjs), worked out
 * exactly: `{ status: 'exists', points: [{ axis, set }] }` — one target, the
 * set, drawn on the x-axis (domain) or the y-axis (range). A continuous graph
 * on an interval reaches every value between the lowest and the highest it
 * reaches or approaches; each end of its range is closed exactly when some
 * closed end, or the turn, attains it (rangeOver).
 *
 * OFF THE SCREEN. A variant flagged `offScreen` builds a graph whose feature
 * exists where the generator will choose a view that leaves it out: the
 * student answers "Off screen" (a game with off-screen features turned on).
 * `offScreenAnchors` names what must stay on screen so the graph still shows
 * where it is heading.
 *
 * Pure: Cloud Functions and tests. The student device never generates.
 */

import * as Q from './graphFeatureRational.mjs';
import { GRAPH_KIND, evaluateGraph } from './graphFeatureCurves.mjs';
import { GRAPH_FEATURE, QUESTION_TIER, isIntervalFeature, tierRank } from './graphFeatureRegistry.mjs';
import { ALL_REALS, allExcept, canonicalSet, intervalSet, pointSet, unionSets } from './numberLineSets.mjs';

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

export const LINE_ORIENTATION = Object.freeze({ VERTICAL: 'vertical', HORIZONTAL: 'horizontal' });

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

// An asymptote: a vertical line x = value or a horizontal line y = value.
const asymptoteLine = (orientation, value) => Object.freeze(orientation === LINE_ORIENTATION.VERTICAL
  ? { orientation, x: Q.toRational(value) }
  : { orientation, y: Q.toRational(value) });
const NO_ASYMPTOTES = () => none();

/* ------------------------------ domain and range ----------------------------- */

// A domain or range: one target, the set, on its axis.
const setFeature = (axis, set) => (set
  ? Object.freeze({ status: FEATURE_STATUS.EXISTS, points: Object.freeze([Object.freeze({ axis, set })]) })
  : inexact());

const UNBOUNDED = Object.freeze({ from: null, to: null });

/** A restricted domain as a set (null: every number). */
const domainSet = (domain) => (domain
  ? intervalSet(domain.from ? domain.from.x : null, domain.from?.closed === true, domain.to ? domain.to.x : null, domain.to?.closed === true)
  : ALL_REALS);

/*
 * THE RANGE OF A CONTINUOUS GRAPH ON AN INTERVAL (the shape restrictedExtreme
 * reads). Every value between the lowest and the highest it reaches or
 * approaches is taken; an end of the range is closed when some closed end of
 * the domain, or a turning point inside it, attains that value, and open when
 * it is only approached (an open end, an asymptote). Null where a value is not
 * exact.
 */
const rangeOver = (shape, domain = UNBOUNDED) => {
  const candidates = [];
  for (const side of ['left', 'right']) {
    if ((side === 'left' && domain.from) || (side === 'right' && domain.to)) continue;
    const tail = shape.tail(side);
    if (tail.kind === 'infinite') candidates.push({ infinite: tail.sign });
    else if (tail.kind === 'approach') candidates.push({ value: tail.value, closed: false });
  }
  for (const end of [domain.from, domain.to]) {
    if (!end) continue;
    const value = shape.valueAt(end.x);
    if (value === null) return null;
    candidates.push({ value, closed: end.closed });
  }
  (shape.critical || []).forEach((x) => {
    const strictlyInside = inDomain(domain, x)
      && !(domain.from && Q.eq(x, domain.from.x)) && !(domain.to && Q.eq(x, domain.to.x));
    if (strictlyInside) candidates.push({ value: shape.valueAt(x), closed: true });
  });
  const finite = candidates.filter((entry) => !entry.infinite);
  const end = (sign) => {
    if (candidates.some((entry) => entry.infinite === sign)) return { value: null, closed: false };
    if (!finite.length) return null;
    const best = finite.reduce((top, entry) => (sign * Q.cmp(entry.value, top.value) > 0 ? entry : top)).value;
    return { value: best, closed: finite.some((entry) => entry.closed && Q.eq(entry.value, best)) };
  };
  const low = end(-1);
  const high = end(1);
  if (!low || !high) return null;
  return intervalSet(low.value, low.closed, high.value, high.closed);
};

/* ---------------------------- restricted domains --------------------------- */

const domainEnd = (x, closed) => Object.freeze({ x: Q.toRational(x), closed: closed === true });

/** A ray from x: to the right (direction 1) or the left (−1). */
const rayDomain = (x, closed, direction) => Object.freeze(direction < 0
  ? { from: null, to: domainEnd(x, closed) }
  : { from: domainEnd(x, closed), to: null });

/** Whether an exact x is on a restricted domain (null: everywhere). */
export const inDomain = (domain, x) => {
  if (!domain) return true;
  const value = Q.toRational(x);
  if (domain.from) {
    const order = Q.cmp(value, domain.from.x);
    if (order < 0 || (order === 0 && !domain.from.closed)) return false;
  }
  if (domain.to) {
    const order = Q.cmp(value, domain.to.x);
    if (order > 0 || (order === 0 && !domain.to.closed)) return false;
  }
  return true;
};

const domainToGraph = (domain) => (domain ? {
  domain: {
    from: domain.from ? { x: num(domain.from.x), closed: domain.from.closed === true } : null,
    to: domain.to ? { x: num(domain.to.x), closed: domain.to.closed === true } : null,
  },
} : {});

// The points of a feature that the domain keeps.
const keepInDomain = (entry, domain) => {
  if (!domain || entry.status !== FEATURE_STATUS.EXISTS) return entry;
  const kept = entry.points.filter((p) => inDomain(domain, p.x));
  return kept.length ? exists(...kept) : none();
};

/*
 * THE MAXIMUM (sign 1) OR MINIMUM (sign −1) OF A RESTRICTED GRAPH, exactly.
 *
 * `shape` describes the family: `valueAt(x)` (exact, or null where it is not),
 * the turning points it may have (`critical`), and where it heads past each
 * side (`tail('left' | 'right')`: { kind: 'infinite', sign }, { kind:
 * 'approach', value } for an asymptote it never reaches, or { kind:
 * 'constant' }). The extreme exists only where it is ATTAINED at one point:
 * a closed end or a turning point inside the domain, beaten by nothing the
 * graph only approaches (an open end, an asymptote) or heads past.
 */
const restrictedExtreme = (shape, domain, sign) => {
  const attained = [];
  const approached = [];
  for (const side of ['left', 'right']) {
    if ((side === 'left' && domain.from) || (side === 'right' && domain.to)) continue;
    const tail = shape.tail(side);
    if (tail.kind === 'constant') return ambiguous();
    if (tail.kind === 'infinite' && tail.sign === sign) return none();
    if (tail.kind === 'approach') approached.push(tail.value);
  }
  for (const end of [domain.from, domain.to]) {
    if (!end) continue;
    const value = shape.valueAt(end.x);
    if (value === null) return inexact();
    if (end.closed) attained.push(point(end.x, value));
    else approached.push(value);
  }
  (shape.critical || []).forEach((x) => {
    const strictlyInside = inDomain(domain, x)
      && !(domain.from && Q.eq(x, domain.from.x)) && !(domain.to && Q.eq(x, domain.to.x));
    if (strictlyInside) attained.push(point(x, shape.valueAt(x)));
  });
  if (!attained.length) return none();
  const best = attained.reduce((top, entry) => (sign * Q.cmp(entry.y, top.y) > 0 ? entry : top));
  const atBest = attained.filter((entry) => Q.eq(entry.y, best.y));
  if (atBest.some((entry) => !Q.eq(entry.x, best.x))) return ambiguous();
  if (approached.some((value) => sign * Q.cmp(value, best.y) > 0)) return none();
  return exists(best);
};

/* ------------------------ intervals: where and which way ------------------------ */

/*
 * WHERE A GRAPH RISES, FALLS OR STAYS LEVEL, AND WHERE IT IS ABOVE OR BELOW
 * THE x-AXIS — the interval features, sets of x drawn on the x-axis.
 *
 * The x-axis is cut at every exact x where an answer can change: the zeros,
 * the turning points, where the domain or a piece starts or stops, and a
 * vertical asymptote. Between two neighbouring cuts the graph is one
 * unbroken stretch that neither crosses the axis nor turns, so samples there
 * only say which side of the axis it is on and which way it goes. A stretch
 * whose samples disagree (a zero or a turn that is not exact, so not among
 * the cuts) makes those features inexact: never issued. Every end of an
 * answer is a cut — an exact number — never a sampled approximation.
 *
 *   increasing, decreasing, constant   open intervals, the convention a class
 *     writes: where the graph turns, starts or stops is never in the set.
 *     Two stretches going the same way are one where the graph runs unbroken
 *     between them (x³ is increasing on (−∞, ∞)). Where it jumps between two
 *     pieces going the same way, classes disagree (one interval or two?):
 *     ambiguous, never issued.
 *   positive, negative                 f(x) > 0, f(x) < 0: a zero is never in
 *     the set; a closed end of the domain, or the end a piece owns, is in it
 *     when the graph is above (below) the axis there.
 *
 * An empty set is the feature not existing: "Does Not Exist".
 *
 *   graph    the plain graph (toGraph), sampled between cuts
 *   zeros    the x-intercept analysis on the graph: every zero (EXISTS), none
 *            (NONE); AMBIGUOUS (zero along a stretch) or INEXACT make the
 *            sign features inexact
 *   turns    the exact x of every turning point, or null when they are not
 *            exact (a cubic turning at irrational x)
 *   breaks   exact x where the graph starts, stops, jumps or breaks
 */
const STRETCH_FRACTIONS = Object.freeze([0.1, 0.3, 0.5, 0.7, 0.9]);
const TAIL_STEPS = Object.freeze([0.5, 1, 2, 4, 8]);
const WHOLE_LINE = Object.freeze([-8, -4, -2, -1, 0, 1, 2, 4, 8]);
// A value this close to 0 away from every exact zero means a zero was missed.
const NEAR_ZERO = 1e-9;
// Unbroken at x: the values just either side agree with f(x) to well under
// the smallest jump a family draws (half a unit; relative, far up a steep
// curve), even where the graph is vertical for an instant (∛x at its center
// moves 2·10⁻³ over 10⁻⁹).
const CONTINUITY_STEP = 1e-9;
const CONTINUITY_TOLERANCE = 1e-2;

const stretchSamples = (low, high) => {
  if (low === null && high === null) return WHOLE_LINE;
  if (low === null) return [...TAIL_STEPS].reverse().map((step) => high - step);
  if (high === null) return TAIL_STEPS.map((step) => low + step);
  return STRETCH_FRACTIONS.map((fraction) => low + (high - low) * fraction);
};

const signOf = (values) => {
  if (values.every((value) => value > NEAR_ZERO)) return 1;
  if (values.every((value) => value < -NEAR_ZERO)) return -1;
  return null;
};

const directionOf = (values) => {
  const scale = Math.max(1, ...values.map(Math.abs));
  const steps = values.slice(1).map((value, index) => value - values[index]);
  const level = (step) => Math.abs(step) <= 1e-9 * scale;
  if (steps.every(level)) return 0;
  if (steps.every((step) => step > 0 && !level(step))) return 1;
  if (steps.every((step) => step < 0 && !level(step))) return -1;
  return null;
};

const continuousAt = (graph, x) => {
  const at = evaluateGraph(graph, x);
  if (!Number.isFinite(at)) return false;
  return [x - CONTINUITY_STEP, x + CONTINUITY_STEP].every((near) => {
    const value = evaluateGraph(graph, near);
    return Number.isFinite(value) && Math.abs(value - at) <= CONTINUITY_TOLERANCE * Math.max(1, Math.abs(at));
  });
};

const intervalAnswer = (set) => (set.length ? setFeature('x', set) : none());

const intervalFeatures = ({ graph, zeros, turns, breaks = [] }) => {
  const zeroXs = zeros?.status === FEATURE_STATUS.EXISTS ? zeros.points.map((p) => p.x) : [];
  const signKnown = zeros?.status === FEATURE_STATUS.EXISTS || zeros?.status === FEATURE_STATUS.NONE;
  const cuts = uniqueX([...zeroXs, ...(turns || []), ...breaks]);
  const stretches = [];
  let broken = false;
  for (let index = 0; index <= cuts.length; index += 1) {
    const low = index === 0 ? null : cuts[index - 1];
    const high = index === cuts.length ? null : cuts[index];
    const values = stretchSamples(low === null ? null : num(low), high === null ? null : num(high))
      .map((x) => evaluateGraph(graph, x));
    const defined = values.filter(Number.isFinite);
    if (!defined.length) continue;
    // Defined in part: the graph starts or stops somewhere not among the cuts.
    if (defined.length !== values.length) broken = true;
    stretches.push({ low, high, sign: signOf(values), direction: directionOf(values) });
  }
  const neighbours = (cut) => [
    stretches.find((stretch) => stretch.high !== null && Q.eq(stretch.high, cut)),
    stretches.find((stretch) => stretch.low !== null && Q.eq(stretch.low, cut)),
  ];

  const signSet = (sign) => {
    if (broken || !signKnown || stretches.some((stretch) => stretch.sign === null)) return inexact();
    const parts = stretches.filter((stretch) => stretch.sign === sign)
      .map((stretch) => intervalSet(stretch.low, false, stretch.high, false));
    for (const cut of cuts) {
      const value = evaluateGraph(graph, num(cut));
      if (!Number.isFinite(value) || zeroXs.some((zero) => Q.eq(zero, cut))) continue;
      if (Math.abs(value) <= NEAR_ZERO) return inexact();
      if (Math.sign(value) === sign) parts.push(pointSet(cut));
    }
    return intervalAnswer(unionSets(...parts));
  };

  const ambiguousJump = cuts.some((cut) => {
    const [before, after] = neighbours(cut);
    return before && after && before.direction !== 0 && before.direction === after.direction
      && Number.isFinite(evaluateGraph(graph, num(cut))) && !continuousAt(graph, num(cut));
  });
  const directionSet = (direction) => {
    if (broken || !Array.isArray(turns) || stretches.some((stretch) => stretch.direction === null)) return inexact();
    if (ambiguousJump) return ambiguous();
    const parts = stretches.filter((stretch) => stretch.direction === direction)
      .map((stretch) => intervalSet(stretch.low, false, stretch.high, false));
    cuts.forEach((cut) => {
      const [before, after] = neighbours(cut);
      if (before?.direction === direction && after?.direction === direction && continuousAt(graph, num(cut))) parts.push(pointSet(cut));
    });
    return intervalAnswer(unionSets(...parts));
  };

  return {
    [F.INCREASING]: directionSet(1),
    [F.DECREASING]: directionSet(-1),
    [F.CONSTANT]: directionSet(0),
    [F.POSITIVE]: signSet(1),
    [F.NEGATIVE]: signSet(-1),
  };
};

// The exact x where a restricted domain starts and stops.
const domainBreaks = (domain) => (domain ? [domain.from, domain.to].filter(Boolean).map((end) => end.x) : []);

// Which way a monotone feature asks (1 rising, −1 falling, 0 level), and
// which side of the axis a sign feature asks (1 above, −1 below).
const askedDirection = (feature) => ({ [F.INCREASING]: 1, [F.DECREASING]: -1, [F.CONSTANT]: 0 })[feature];
const askedSign = (feature) => ({ [F.POSITIVE]: 1, [F.NEGATIVE]: -1 })[feature];
const isMonotoneFeature = (feature) => askedDirection(feature) !== undefined;

/*
 * The variants every family offers for the interval features, by name:
 * `exists` ones whose answer is a set, and 'none' where the honest answer is
 * "Does Not Exist" (a parabola is never constant). Each family's
 * `intervalBuild` gives the shape its variant names; the analysis above
 * decides the answer, and the generator issues it only when they agree.
 */
const intervalVariants = (spec) => Object.freeze(Object.fromEntries(
  Object.entries(spec).map(([feature, entries]) => [feature, entries.map(([id, options = {}]) => variant(id, options))]),
));

/* -------------------------------- families -------------------------------- */

const LINEAR_SLOPES = Object.freeze({
  [EASY]: [[1], [-1], [2], [-2], [1, 2], [-1, 2]],
  [STANDARD]: [[1], [-1], [2], [-2], [3], [-3], [1, 2], [-1, 2], [3, 2], [-3, 2]],
  [CHALLENGE]: [[1], [-1], [2], [-2], [3], [-3], [1, 2], [-1, 2], [3, 2], [-3, 2], [1, 3], [-1, 3], [2, 3], [-2, 3], [1, 4], [-1, 4], [4], [-4]],
});

const linearShape = ({ m, b }) => ({
  valueAt: (x) => Q.add(Q.mul(m, x), b),
  critical: [],
  tail: (side) => (Q.isZero(m)
    ? { kind: 'constant' }
    : { kind: 'infinite', sign: Q.sign(m) * (side === 'right' ? 1 : -1) }),
});

/*
 * A line for a domain or range question. Whole-number slopes and ends, so
 * every end of the answer is a whole number a student can drop a dot on.
 */
const linearSetBuild = (rng, { feature, variant: id, tier }) => {
  const m = Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(1, tier === EASY ? 2 : 3));
  const b = Q.rat(rng.int(-4, 4));
  if (id === 'all') return { m, b };
  if (id === 'constant') return { m: Q.ZERO, b: Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(1, 4)) };
  const start = Q.rat(rng.int(-4, 3));
  if (id === 'ray') return { m, b, domain: rayDomain(start, true, rng.chance(0.5) ? 1 : -1) };
  const stop = Q.add(start, Q.rat(rng.int(3, 6)));
  // A segment with closed ends at Standard; at Challenge, at least one open.
  const openEnds = id === 'openEnds' || (feature === F.RANGE && id === 'segment');
  const openLeft = openEnds && rng.chance(0.5);
  const openRight = openEnds && (!openLeft || rng.chance(0.5));
  if (id === 'openEnds' && rng.chance(0.4)) return { m, b, domain: rayDomain(start, false, rng.chance(0.5) ? 1 : -1) };
  return { m, b, domain: { from: domainEnd(start, !openLeft), to: domainEnd(stop, !openRight) } };
};

/*
 * A line for an interval question. A whole-number zero (a half above Easy)
 * and a slope that keeps its y-intercept on the grid, so the answer's end is
 * a point a student can tap.
 */
const linearIntervalBuild = (rng, { feature, variant: id, tier }) => {
  const sign = (wanted) => (wanted === undefined || wanted === 0 ? (rng.chance(0.5) ? 1 : -1) : wanted);
  const slope = (direction) => Q.mul(Q.rat(direction), Q.rat(rng.int(1, tier === EASY ? 2 : 3)));
  const level = (side) => Q.mul(Q.rat(side), Q.rat(rng.int(1, 4)));
  if (isMonotoneFeature(feature)) {
    const wanted = askedDirection(feature);
    if (id === 'none') {
      // The other way, or level for a rising or falling question.
      if (wanted !== 0 && rng.chance(0.3)) return { m: Q.ZERO, b: level(sign()) };
      return { m: slope(wanted === 0 ? sign() : -wanted), b: Q.rat(rng.int(-4, 4)) };
    }
    const m = wanted === 0 ? Q.ZERO : slope(wanted);
    const b = wanted === 0 ? level(sign()) : Q.rat(rng.int(-4, 4));
    if (id !== 'segment') return { m, b };
    const start = Q.rat(rng.int(-5, 1));
    const stop = Q.add(start, Q.rat(rng.int(3, 6)));
    return { m, b, domain: { from: domainEnd(start, rng.chance(0.6)), to: domainEnd(stop, rng.chance(0.6)) } };
  }
  const wanted = askedSign(feature);
  if (id === 'level') return { m: Q.ZERO, b: level(wanted) };
  if (id === 'none') return { m: Q.ZERO, b: level(-wanted) };
  const zero = coordinate(rng, tier, { min: -4, max: 4 });
  const m = slope(sign());
  const b = Q.neg(Q.mul(m, zero));
  if (id !== 'segment') return { m, b };
  // A segment across the axis: its zero strictly inside, two or more from each end.
  const start = Q.sub(zero, Q.rat(rng.int(2, 4)));
  const stop = Q.add(zero, Q.rat(rng.int(2, 4)));
  return { m, b, domain: { from: domainEnd(start, rng.chance(0.5)), to: domainEnd(stop, rng.chance(0.5)) } };
};

// Gentle slopes for a line whose zero is past the edge: it still visibly
// heads for the axis across a small window.
const OFF_SCREEN_SLOPES = Object.freeze({ [STANDARD]: [[1, 2], [-1, 2]], [CHALLENGE]: [[1, 2], [-1, 2], [1, 3], [-1, 3], [1, 4], [-1, 4]] });
const STEEP_SLOPES = Object.freeze({ [STANDARD]: [[2], [-2], [3], [-3]], [CHALLENGE]: [[2], [-2], [3], [-3], [4], [-4]] });

const linear = Object.freeze({
  id: GRAPH_FAMILY.LINEAR,
  label: 'Linear',
  kind: GRAPH_KIND.LINEAR,
  variants: Object.freeze({
    [F.X_INTERCEPT]: [
      variant('one'),
      variant('none', { exists: false, minTier: STANDARD, weight: 0.8 }),
      // A ray whose closed end sits on the x-axis: that end is the zero.
      variant('rayFromZero', { minTier: STANDARD, weight: 0.5, flags: { restricted: true, endpointZero: true } }),
      // The same ray with an OPEN end there: the point is not on the graph.
      variant('rayOpenAtZero', { exists: false, minTier: CHALLENGE, weight: 0.5, flags: { restricted: true, openEndOnAxis: true } }),
      // A segment that stops before the axis it is heading for.
      variant('segmentShort', { exists: false, minTier: CHALLENGE, weight: 0.4, flags: { restricted: true } }),
      // The zero is past the edge; the line visibly heads for it.
      variant('offScreen', { minTier: STANDARD, weight: 0.7, flags: { offScreen: true } }),
    ],
    [F.Y_INTERCEPT]: [
      variant('one'),
      variant('rayFromAxis', { minTier: STANDARD, weight: 0.5, flags: { restricted: true } }),
      variant('rayOpenAtAxis', { exists: false, minTier: CHALLENGE, weight: 0.5, flags: { restricted: true, openEndOnAxis: true } }),
      variant('offScreen', { minTier: STANDARD, weight: 0.7, flags: { offScreen: true } }),
    ],
    [F.MAXIMUM]: [variant('none', { exists: false, minTier: STANDARD })],
    [F.MINIMUM]: [variant('none', { exists: false, minTier: STANDARD })],
    // A slanted line has no asymptote (a horizontal one is never asked).
    [F.ASYMPTOTE]: [variant('none', { exists: false, minTier: STANDARD })],
    // Every number, a ray, a segment; open ends at Challenge.
    [F.DOMAIN]: [
      variant('all'),
      variant('ray', { minTier: STANDARD, flags: { restricted: true } }),
      variant('segment', { minTier: STANDARD, flags: { restricted: true } }),
      variant('openEnds', { minTier: CHALLENGE, flags: { restricted: true } }),
    ],
    // Every number; one number (a level line); the y-values of a ray or segment.
    [F.RANGE]: [
      variant('all'),
      variant('constant', { minTier: STANDARD, weight: 0.6 }),
      variant('ray', { minTier: STANDARD, flags: { restricted: true } }),
      variant('segment', { minTier: CHALLENGE, flags: { restricted: true } }),
    ],
    // A slanted line rises or falls everywhere; a level one is constant
    // everywhere; a segment does it between its ends (open, either way).
    ...intervalVariants({
      [F.INCREASING]: [['slanted'], ['segment', { minTier: STANDARD, flags: { restricted: true } }], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['slanted'], ['segment', { minTier: STANDARD, flags: { restricted: true } }], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['level', { minTier: STANDARD }], ['segment', { minTier: CHALLENGE, flags: { restricted: true } }], ['none', { exists: false, minTier: STANDARD }]],
      // Past its zero one way; a level line above (or below) the axis is
      // everything; a segment across the axis keeps a closed end.
      [F.POSITIVE]: [['ray'], ['level', { minTier: STANDARD, weight: 0.5 }], ['segment', { minTier: CHALLENGE, flags: { restricted: true } }], ['none', { exists: false, minTier: STANDARD, weight: 0.6 }]],
      [F.NEGATIVE]: [['ray'], ['level', { minTier: STANDARD, weight: 0.5 }], ['segment', { minTier: CHALLENGE, flags: { restricted: true } }], ['none', { exists: false, minTier: STANDARD, weight: 0.6 }]],
    }),
  }),
  build(rng, { feature, variant: id, tier }) {
    if (feature === F.DOMAIN || feature === F.RANGE) return linearSetBuild(rng, { feature, variant: id, tier });
    if (isIntervalFeature(feature)) return linearIntervalBuild(rng, { feature, variant: id, tier });
    if (feature === F.X_INTERCEPT && id === 'none') {
      // A horizontal line clearly away from the x-axis.
      return { m: Q.ZERO, b: signedInt(rng, 2, range(tier) - 1) };
    }
    if (feature === F.X_INTERCEPT && id === 'offScreen') {
      const m = Q.toRational(rng.pick(OFF_SCREEN_SLOPES[tier] || OFF_SCREEN_SLOPES[STANDARD]));
      const x0 = Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(7, 11));
      return { m, b: Q.neg(Q.mul(m, x0)) };
    }
    if (feature === F.Y_INTERCEPT && id === 'offScreen') {
      return { m: Q.toRational(rng.pick(STEEP_SLOPES[tier] || STEEP_SLOPES[STANDARD])), b: Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(7, 11)) };
    }
    const m = Q.toRational(rng.pick(LINEAR_SLOPES[tier] || LINEAR_SLOPES[STANDARD]));
    if (feature === F.X_INTERCEPT && (id === 'rayFromZero' || id === 'rayOpenAtZero')) {
      // The ray starts on the axis and runs away from it either way.
      const x0 = coordinate(rng, tier, { min: -range(tier) + 2, max: range(tier) - 2, nonZero: true });
      return { m, b: Q.neg(Q.mul(m, x0)), domain: rayDomain(x0, id === 'rayFromZero', rng.chance(0.5) ? 1 : -1) };
    }
    if (feature === F.X_INTERCEPT && id === 'segmentShort') {
      // The zero, then a segment of the line on one side of it, ending at
      // least two units short of it.
      const x0 = coordinate(rng, tier, { min: -3, max: 3 });
      const side = rng.chance(0.5) ? 1 : -1;
      const near = Q.add(x0, Q.rat(side * rng.int(2, 3)));
      // Plainly short of the axis: its nearer end at least 1.5 units off it.
      if (Math.abs(num(Q.mul(m, Q.sub(near, x0)))) < 1.5) return null;
      const far = Q.add(near, Q.rat(side * rng.int(3, 6)));
      const [left, right] = Q.cmp(near, far) < 0 ? [near, far] : [far, near];
      return { m, b: Q.neg(Q.mul(m, x0)), domain: { from: domainEnd(left, rng.chance(0.5)), to: domainEnd(right, rng.chance(0.5)) } };
    }
    if (feature === F.X_INTERCEPT) {
      // Start from the answer: the intercept, then the line through it.
      const x0 = coordinate(rng, tier, { nonZero: tier === EASY });
      return { m, b: Q.neg(Q.mul(m, x0)) };
    }
    const b = coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 });
    if (feature === F.Y_INTERCEPT && (id === 'rayFromAxis' || id === 'rayOpenAtAxis')) {
      return { m, b, domain: rayDomain(Q.ZERO, id === 'rayFromAxis', rng.chance(0.5) ? 1 : -1) };
    }
    // A slanted line for "Find all asymptotes": it has none.
    return { m, b };
  },
  toGraph: ({ m, b, domain }) => ({ kind: GRAPH_KIND.LINEAR, m: num(m), b: num(b), ...domainToGraph(domain) }),
  analyze(params) {
    const { m, b, domain = null } = params;
    const constant = Q.isZero(m);
    const shape = linearShape({ m, b });
    const xIntercept = keepInDomain(constant
      ? (Q.isZero(b) ? ambiguous() : none())
      : exists(point(Q.div(Q.neg(b), m), 0)), domain);
    return {
      ...intervalFeatures({ graph: this.toGraph(params), zeros: xIntercept, turns: [], breaks: domainBreaks(domain) }),
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: keepInDomain(exists(point(0, b)), domain),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: domain ? restrictedExtreme(shape, domain, 1) : (constant ? ambiguous() : none()),
      [F.MINIMUM]: domain ? restrictedExtreme(shape, domain, -1) : (constant ? ambiguous() : none()),
      // Whether a horizontal line is its own asymptote is a debate, not a
      // reading: never asked.
      [F.ASYMPTOTE]: constant ? ambiguous() : NO_ASYMPTOTES(),
      [F.DOMAIN]: setFeature('x', domainSet(domain)),
      [F.RANGE]: setFeature('y', constant ? pointSet(b) : rangeOver(shape, domain || UNBOUNDED)),
    };
  },
  keyPoints({ m, b, domain = null }) {
    const points = [point(0, b)];
    if (!Q.isZero(m)) points.push(point(Q.div(Q.neg(b), m), 0));
    if (!domain) return points;
    // A restricted line shows its ends; the intercepts frame it only where
    // they are on it.
    const shape = linearShape({ m, b });
    return [
      ...points.filter((p) => inDomain(domain, p.x)),
      ...[domain.from, domain.to].filter(Boolean).map((end) => point(end.x, shape.valueAt(end.x))),
    ];
  },
  // What must stay in view while the feature is off the screen: the
  // y-intercept for a hidden zero, the zero for a hidden y-intercept.
  offScreenAnchors({ m, b }, feature) {
    if (feature === F.X_INTERCEPT) return [point(0, b)];
    return Q.isZero(m) ? [] : [point(Q.div(Q.neg(b), m), 0)];
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
const vertexFamily = ({ id, label, kind, leads, zeroDistance, zeroDepth, noZerosMeansComplexRoots = false, offScreenVertexTier = STANDARD, offScreenZeros = false }) => Object.freeze({
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
      // One arm, ending at a closed dot on one of its zeros: that end counts.
      variant('rayFromZero', { minTier: STANDARD, weight: 0.5, flags: { restricted: true, endpointZero: true } }),
      // The same arm ending at an OPEN dot there: no zero on the graph.
      variant('rayOpenAtZero', { exists: false, minTier: CHALLENGE, weight: 0.5, flags: { restricted: true, openEndOnAxis: true } }),
      // Cut at the vertex, so only one of its two zeros is on the graph.
      variant('cutOneZero', { minTier: CHALLENGE, weight: 0.6, flags: { restricted: true } }),
      // Both zeros past the edges, the vertex on screen below (or above)
      // the axis with the arms heading for it.
      ...(offScreenZeros ? [variant('offScreen', { minTier: CHALLENGE, weight: 0.6, flags: { offScreen: true } })] : []),
    ],
    [F.Y_INTERCEPT]: [
      variant('one'),
      variant('rayFromAxis', { minTier: STANDARD, weight: 0.5, flags: { restricted: true } }),
      variant('rayOpenAtAxis', { exists: false, minTier: CHALLENGE, weight: 0.5, flags: { restricted: true, openEndOnAxis: true } }),
    ],
    [F.VERTEX]: [
      variant('one'),
      // Every parabola and absolute value graph has one, so a vertex not on
      // the screen is past the edge.
      variant('offScreen', { minTier: offScreenVertexTier, weight: 0.7, flags: { offScreen: true } }),
    ],
    [F.MAXIMUM]: [variant('one'), variant('none', { exists: false, minTier: STANDARD })],
    [F.MINIMUM]: [variant('one'), variant('none', { exists: false, minTier: STANDARD })],
    [F.ASYMPTOTE]: [variant('none', { exists: false, minTier: STANDARD })],
    // Every number; at Challenge, a ray of it.
    [F.DOMAIN]: [variant('all'), variant('ray', { minTier: CHALLENGE, flags: { restricted: true } })],
    // From the vertex up (or down); at Challenge, an arm cut short of it.
    [F.RANGE]: [variant('fromVertex'), variant('cut', { minTier: CHALLENGE, flags: { restricted: true } })],
    // One side of the vertex each way; at Challenge, a ray through the vertex
    // (open at its start too). Never constant.
    ...intervalVariants({
      [F.INCREASING]: [['vertex'], ['ray', { minTier: CHALLENGE, flags: { restricted: true } }]],
      [F.DECREASING]: [['vertex'], ['ray', { minTier: CHALLENGE, flags: { restricted: true } }]],
      [F.CONSTANT]: [['none', { exists: false, minTier: STANDARD }]],
      // Between its zeros or outside them; everything when it clears the
      // axis; everything but the vertex when it touches; never, the other way.
      [F.POSITIVE]: [['crossing'], ['clear', { minTier: STANDARD, weight: 0.6 }], ['touching', { minTier: CHALLENGE, weight: 0.5 }], ['none', { exists: false, minTier: STANDARD }]],
      [F.NEGATIVE]: [['crossing'], ['clear', { minTier: STANDARD, weight: 0.6 }], ['touching', { minTier: CHALLENGE, weight: 0.5 }], ['none', { exists: false, minTier: STANDARD }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    if (feature === F.DOMAIN || feature === F.RANGE) {
      // Whole-number vertex and leads, so the range's end is a whole number.
      const a = Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(1, 2));
      const h = Q.rat(rng.int(-4, 4));
      const k = Q.rat(rng.int(-4, 4));
      if (chosen === 'ray') return { a, h, k, domain: rayDomain(Q.rat(rng.int(-4, 4)), rng.chance(0.6), rng.chance(0.5) ? 1 : -1) };
      if (chosen === 'cut') {
        // An arm from a point past the vertex, heading away from it.
        const side = rng.chance(0.5) ? 1 : -1;
        return { a, h, k, domain: rayDomain(Q.add(h, Q.rat(side * rng.int(1, 2))), rng.chance(0.5), side) };
      }
      return { a, h, k };
    }
    const pickLead = (sign = 0) => {
      const options = (leads[tier] || leads[STANDARD]).map((entry) => Q.toRational(entry))
        .filter((lead) => sign === 0 || Q.sign(lead) === sign);
      return rng.pick(options);
    };
    const twoZeros = () => {
      const a = pickLead();
      const r1 = coordinate(rng, tier, { min: -range(tier), max: range(tier) - 2 });
      const separation = Q.rat(rng.int(2, Math.min(8, range(tier))));
      const r2 = Q.add(r1, separation);
      const h = Q.div(Q.add(r1, r2), 2);
      const k = Q.neg(zeroDepth(a, Q.div(separation, 2)));
      if (Math.abs(num(k)) > VERTEX_DEPTH_LIMIT[tier]) return null;
      return { a, h, k, r1, r2 };
    };
    if (feature === F.X_INTERCEPT && chosen === 'two') {
      const shape = twoZeros();
      return shape && { a: shape.a, h: shape.h, k: shape.k };
    }
    if (isMonotoneFeature(feature)) {
      // Rises on one side of the vertex and falls on the other.
      const a = pickLead();
      const h = coordinate(rng, tier, { min: -range(tier) + 2, max: range(tier) - 2 });
      const k = coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 });
      if (chosen !== 'ray') return { a, h, k };
      // A ray that starts one to three units before the vertex and runs through it.
      const side = rng.chance(0.5) ? 1 : -1;
      return { a, h, k, domain: rayDomain(Q.sub(h, Q.rat(side * rng.int(1, 3))), rng.chance(0.5), side) };
    }
    if (isIntervalFeature(feature)) {
      const wanted = askedSign(feature);
      if (chosen === 'crossing') {
        const shape = twoZeros();
        return shape && { a: shape.a, h: shape.h, k: shape.k };
      }
      // Clear of the axis on the side asked (or, for 'none', the other side);
      // touching it at the vertex, opening the way asked.
      const side = chosen === 'none' ? -wanted : wanted;
      const a = pickLead(side);
      const h = coordinate(rng, tier, { min: -range(tier) + 2, max: range(tier) - 2 });
      if (chosen === 'touching') return { a, h, k: Q.ZERO };
      return { a, h, k: Q.mul(Q.rat(side), Q.rat(rng.int(1, Math.max(2, range(tier) - 2)))) };
    }
    if (feature === F.X_INTERCEPT && (chosen === 'rayFromZero' || chosen === 'rayOpenAtZero')) {
      // One arm: from a zero, away from the other one.
      const shape = twoZeros();
      if (!shape) return null;
      const left = rng.chance(0.5);
      return {
        a: shape.a,
        h: shape.h,
        k: shape.k,
        domain: rayDomain(left ? shape.r1 : shape.r2, chosen === 'rayFromZero', left ? -1 : 1),
      };
    }
    if (feature === F.X_INTERCEPT && chosen === 'cutOneZero') {
      const shape = twoZeros();
      if (!shape) return null;
      return { a: shape.a, h: shape.h, k: shape.k, domain: rayDomain(shape.h, rng.chance(0.5), rng.chance(0.5) ? 1 : -1) };
    }
    if (feature === F.X_INTERCEPT && chosen === 'offScreen') {
      // A wide V: the vertex on screen, its zeros 2|k| either side of it.
      const a = Q.mul(Q.rat(rng.chance(0.5) ? 1 : -1), Q.rat(1, 2));
      const k = Q.mul(Q.rat(-Q.sign(a)), Q.rat(rng.int(3, 5)));
      return { a, h: Q.rat(rng.int(-1, 1)), k };
    }
    if (feature === F.X_INTERCEPT && chosen === 'tangent') {
      return { a: pickLead(), h: coordinate(rng, tier, { nonZero: true }), k: Q.ZERO };
    }
    if (feature === F.X_INTERCEPT && chosen === 'none') {
      const a = pickLead();
      return { a, h: coordinate(rng, tier), k: Q.mul(Q.rat(Q.sign(a)), Q.rat(rng.int(2, Math.max(3, range(tier) - 1)))) };
    }
    if (feature === F.VERTEX && chosen === 'offScreen') {
      // The vertex well past a side edge, so one arm crosses the screen. A
      // lead below 1 keeps the arm wide enough to read across a small window.
      const options = (leads[tier] || leads[STANDARD]).map((entry) => Q.toRational(entry))
        .filter((lead) => Q.cmp(Q.abs(lead), Q.ONE) < 0);
      const a = rng.pick(options);
      return { a, h: Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(7, 10)), k: Q.mul(Q.rat(-Q.sign(a)), Q.rat(rng.int(0, 4))) };
    }
    // Vertex, maximum, minimum, y-intercept: a vertex on the grid and an
    // opening direction that makes the requested extremum exist or not.
    let direction = 0;
    if (feature === F.MAXIMUM) direction = chosen === 'one' ? -1 : 1;
    if (feature === F.MINIMUM) direction = chosen === 'one' ? 1 : -1;
    const a = pickLead(direction);
    const h = coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 });
    const k = coordinate(rng, tier, { min: -range(tier) + 1, max: range(tier) - 1 });
    if (feature === F.Y_INTERCEPT && (chosen === 'rayFromAxis' || chosen === 'rayOpenAtAxis')) {
      return { a, h, k, domain: rayDomain(Q.ZERO, chosen === 'rayFromAxis', rng.chance(0.5) ? 1 : -1) };
    }
    return { a, h, k };
  },
  toGraph: ({ a, h, k, domain }) => ({ kind, a: num(a), h: num(h), k: num(k), ...domainToGraph(domain) }),
  valueAt: ({ a, h, k }, x) => Q.add(Q.mul(a, kind === GRAPH_KIND.QUADRATIC ? Q.mul(Q.sub(x, h), Q.sub(x, h)) : Q.abs(Q.sub(x, h))), k),
  analyze(params) {
    const { a, h, k, domain = null } = params;
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
    const yValue = this.valueAt(params, Q.ZERO);
    const shape = {
      valueAt: (x) => this.valueAt(params, x),
      critical: [h],
      tail: () => ({ kind: 'infinite', sign: Q.sign(a) }),
    };
    const zeros = keepInDomain(xIntercept, domain);
    return {
      ...intervalFeatures({ graph: this.toGraph(params), zeros, turns: inDomain(domain, h) ? [h] : [], breaks: domainBreaks(domain) }),
      [F.X_INTERCEPT]: zeros,
      [F.Y_INTERCEPT]: keepInDomain(exists(point(0, yValue)), domain),
      [F.VERTEX]: keepInDomain(exists(vertex), domain),
      [F.MAXIMUM]: domain ? restrictedExtreme(shape, domain, 1) : (Q.sign(a) < 0 ? exists(vertex) : none()),
      [F.MINIMUM]: domain ? restrictedExtreme(shape, domain, -1) : (Q.sign(a) > 0 ? exists(vertex) : none()),
      [F.ASYMPTOTE]: NO_ASYMPTOTES(),
      [F.DOMAIN]: setFeature('x', domainSet(domain)),
      [F.RANGE]: setFeature('y', rangeOver(shape, domain || UNBOUNDED)),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    const { domain = null } = params;
    if (!domain) return [point(params.h, params.k), ...analysis[F.X_INTERCEPT].points];
    // A cut graph shows its end and what of it is on the graph.
    return [
      ...(inDomain(domain, params.h) ? [point(params.h, params.k)] : []),
      ...analysis[F.X_INTERCEPT].points,
      ...[domain.from, domain.to].filter(Boolean).map((end) => point(end.x, this.valueAt(params, end.x))),
    ];
  },
  // The y-intercept frames the view only when it is close enough to matter;
  // a far one would shrink the parabola to a sliver.
  optionalKeyPoints(params) {
    return this.analyze(params)[F.Y_INTERCEPT].points;
  },
  // Where the graph turns: the vertex, when the graph has it.
  turningPoints(params) {
    return inDomain(params.domain || null, params.h) ? [point(params.h, params.k)] : [];
  },
  // A hidden vertex keeps nothing in particular on screen (the arm crossing
  // it is checked by how much of the curve shows); hidden zeros keep the
  // vertex, so the turn below the axis is in view.
  offScreenAnchors(params, feature) {
    return feature === F.X_INTERCEPT ? [point(params.h, params.k)] : [];
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
  // One straight arm on screen reads like a line: only the prompt says a
  // vertex is out there, so a hidden one waits for Challenge.
  offScreenVertexTier: CHALLENGE,
  // A V crossing the screen with its vertex below the axis must meet it twice.
  offScreenZeros: true,
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

/*
 * The cubic's turning points exactly, when they are on the half grid: the
 * float roots of f′ rounded to the nearest half, then kept only if f′ is
 * EXACTLY zero there (the coefficients expanded in exact rationals), so a
 * float that lands near a half is never taken for one. Empty when they are
 * irrational, or when it never turns.
 */
const cubicExactCoefficients = ({ a, roots = [], quadratic: factor = null }) => {
  let poly = [Q.toRational(a)];
  const multiply = (left, right) => {
    const out = Array.from({ length: left.length + right.length - 1 }, () => Q.ZERO);
    left.forEach((lc, li) => right.forEach((rc, ri) => { out[li + ri] = Q.add(out[li + ri], Q.mul(lc, rc)); }));
    return out;
  };
  roots.forEach((root) => { poly = multiply(poly, [Q.neg(root), Q.ONE]); });
  if (factor) poly = multiply(poly, [Q.add(Q.mul(factor.p, factor.p), factor.q), Q.mul(Q.rat(-2), factor.p), Q.ONE]);
  return poly;
};

const cubicExactTurningPoints = (params) => {
  const [, c1, c2, c3] = cubicExactCoefficients(params);
  const slopeAt = (x) => Q.add(Q.add(Q.mul(Q.rat(3), Q.mul(c3, Q.mul(x, x))), Q.mul(Q.rat(2), Q.mul(c2, x))), c1);
  const candidates = cubicTurningPoints(params).map(({ x }) => Q.rat(Math.round(x * 2), 2));
  if (!candidates.length || !candidates.every((x) => Q.isZero(slopeAt(x)))) return [];
  return candidates.map((x) => point(x, cubicValueAt(params, x)));
};

/*
 * Where the cubic turns, exactly: [] when it never does (f′ has no two
 * distinct roots — a triple root only flattens), the two x when they are on
 * the half grid, null when it turns somewhere irrational.
 */
const cubicTurnXs = (params) => {
  const [, c1, c2, c3] = cubicExactCoefficients(params);
  // f′(x) = 3c3·x² + 2c2·x + c1: two distinct roots when 4c2² − 12c3·c1 > 0.
  const discriminant = Q.sub(Q.mul(Q.rat(4), Q.mul(c2, c2)), Q.mul(Q.rat(12), Q.mul(c3, c1)));
  if (Q.sign(discriminant) <= 0) return [];
  const exact = cubicExactTurningPoints(params);
  return exact.length === 2 ? exact.map((p) => p.x) : null;
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
    [F.ASYMPTOTE]: [variant('none', { exists: false, minTier: STANDARD })],
    [F.DOMAIN]: [variant('all', { minTier: STANDARD })],
    [F.RANGE]: [variant('all', { minTier: STANDARD })],
    // Rising (or falling) everywhere through a flat point; at Challenge one
    // that turns twice, at grid points. Above and below its axis: past a
    // single zero, or around one it touches.
    ...intervalVariants({
      [F.INCREASING]: [['monotone', { minTier: STANDARD }], ['turns', { minTier: CHALLENGE }], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['monotone', { minTier: STANDARD }], ['turns', { minTier: CHALLENGE }], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['none', { exists: false, minTier: STANDARD }]],
      [F.POSITIVE]: [['crossing', { minTier: STANDARD }], ['touching', { minTier: CHALLENGE }]],
      [F.NEGATIVE]: [['crossing', { minTier: STANDARD }], ['touching', { minTier: CHALLENGE }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const lead = () => Q.toRational(rng.pick(CUBIC_LEADS));
    if (isIntervalFeature(feature)) {
      const wanted = askedDirection(feature);
      const signedLead = (sign) => Q.mul(Q.rat(sign), Q.abs(lead()));
      if (chosen === 'monotone' || chosen === 'none') {
        // a(x − r)³: rising everywhere for a > 0, falling for a < 0 (either,
        // for a question about where it is constant: never).
        const r = Q.rat(rng.int(-3, 3));
        const way = wanted === 0 ? (rng.chance(0.5) ? 1 : -1) : wanted;
        return { a: signedLead(chosen === 'none' && wanted !== 0 ? -way : way), roots: [r, r, r], quadratic: null };
      }
      if (chosen === 'turns' || chosen === 'touching') {
        // a(x − p)²(x − q) with q = p ± 3: it turns at p and at (p + 2q)/3 = p ± 2.
        const p = Q.rat(rng.int(-3, 3));
        const q = Q.add(p, Q.rat(rng.chance(0.5) ? 3 : -3));
        return { a: lead(), roots: [p, p, q], quadratic: null };
      }
      // Crossing once: a flat crossing, or one real zero beside a factor that never vanishes.
      const r = Q.rat(rng.int(-3, 3));
      if (rng.chance(0.5)) return { a: lead(), roots: [r, r, r], quadratic: null };
      return { a: lead(), roots: [r], quadratic: { p: Q.rat(rng.int(-2, 2)), q: Q.rat(rng.int(1, 3)) } };
    }
    const shape = feature === F.Y_INTERCEPT || feature === F.ASYMPTOTE || feature === F.DOMAIN || feature === F.RANGE
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
    const xIntercept = zeros.length ? exists(...zeros) : none();
    return {
      ...intervalFeatures({ graph: this.toGraph(params), zeros: xIntercept, turns: cubicTurnXs(params) }),
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: exists(point(0, cubicValueAt(params, Q.ZERO))),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: notApplicable(),
      [F.MINIMUM]: notApplicable(),
      [F.ASYMPTOTE]: NO_ASYMPTOTES(),
      [F.DOMAIN]: setFeature('x', ALL_REALS),
      [F.RANGE]: setFeature('y', ALL_REALS),
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
  // Where it turns, when that is a grid point (a double root and its partner
  // turn there; three distinct roots usually turn somewhere irrational).
  turningPoints: (params) => cubicExactTurningPoints(params),
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

// The exact value a · base^(x − h) + k, where the exponent is a whole number.
const exponentialValueAt = ({ a, base, h, k }, x) => {
  const exponent = Q.sub(x, h);
  return Q.isInteger(exponent) ? Q.add(Q.mul(a, Q.pow(base, exponent.n)), k) : null;
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
      // A ray from its zero (a closed dot on the axis), or from an open dot there.
      variant('rayFromZero', { minTier: STANDARD, weight: 0.5, flags: { restricted: true, endpointZero: true } }),
      variant('rayOpenAtZero', { exists: false, minTier: CHALLENGE, weight: 0.5, flags: { restricted: true, openEndOnAxis: true } }),
    ],
    [F.Y_INTERCEPT]: [
      variant('one'),
      variant('rayFromAxis', { minTier: STANDARD, weight: 0.5, flags: { restricted: true } }),
      variant('rayOpenAtAxis', { exists: false, minTier: CHALLENGE, weight: 0.5, flags: { restricted: true, openEndOnAxis: true } }),
    ],
    [F.MAXIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
    [F.MINIMUM]: [variant('none', { exists: false, minTier: CHALLENGE })],
    [F.ASYMPTOTE]: [
      // One horizontal asymptote, y = k, off the axis.
      variant('one', { weight: 1.2 }),
      // y = 0: the asymptote is the x-axis itself.
      variant('oneOnAxis', { minTier: CHALLENGE, weight: 0.6, flags: { asymptoteOnAxis: true } }),
    ],
    [F.DOMAIN]: [variant('all', { minTier: STANDARD })],
    // Up to its asymptote, never reaching it: an open end.
    [F.RANGE]: [variant('asymptote', { minTier: STANDARD })],
    // Growth or decay: rising or falling everywhere, never level. Above the
    // axis past its zero, or everywhere when it never crosses.
    ...intervalVariants({
      [F.INCREASING]: [['monotone'], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['monotone'], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['none', { exists: false, minTier: STANDARD }]],
      [F.POSITIVE]: [['crossing', { minTier: STANDARD }], ['clear', { minTier: STANDARD, weight: 0.6 }], ['none', { exists: false, minTier: STANDARD }]],
      [F.NEGATIVE]: [['crossing', { minTier: STANDARD }], ['clear', { minTier: STANDARD, weight: 0.6 }], ['none', { exists: false, minTier: STANDARD }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const base = Q.toRational(rng.pick(EXPONENTIAL_BASES[tier] || EXPONENTIAL_BASES[STANDARD]));
    const a = Q.toRational(rng.pick(EXPONENTIAL_LEADS[tier] || EXPONENTIAL_LEADS[STANDARD]));
    const h = tier === CHALLENGE && rng.chance(0.35) ? Q.rat(rng.pick([-1, 1])) : Q.ZERO;
    if (isMonotoneFeature(feature)) {
      // Rising when a > 0 grows (base above 1) or a < 0 decays; the sign of a
      // is chosen to make it go the way asked (or, for 'none', the other way).
      const grows = Q.cmp(base, Q.ONE) > 0 ? 1 : -1;
      const wanted = askedDirection(feature) || (rng.chance(0.5) ? 1 : -1);
      const way = chosen === 'none' && askedDirection(feature) !== 0 ? -wanted : wanted;
      const lead = Q.mul(Q.rat(way * grows), Q.abs(a));
      return { a: lead, base, h, k: Q.rat(rng.int(-3, 3)) };
    }
    if (isIntervalFeature(feature)) {
      const wanted = askedSign(feature);
      if (chosen === 'crossing') return this.build(rng, { feature: F.X_INTERCEPT, variant: 'one', tier });
      // Never crossing: above the axis (a > 0, k ≥ 0) or below it (a < 0, k ≤ 0).
      const side = chosen === 'none' ? -wanted : wanted;
      return { a: Q.mul(Q.rat(side), Q.abs(a)), base, h, k: Q.mul(Q.rat(side), Q.rat(rng.int(0, 3))) };
    }
    if (feature === F.X_INTERCEPT && ['one', 'rayFromZero', 'rayOpenAtZero'].includes(chosen)) {
      // Start from the intercept x = h + e, then the shift that puts it there.
      // base^e between 2 and 9 keeps the asymptote y = k clear of the axis,
      // so the crossing reads as a crossing and not as the curve flattening.
      const exponents = [-3, -2, -1, 1, 2, 3].filter((e) => {
        const power = Q.toNumber(Q.pow(base, e));
        return power >= 2 && power <= 9;
      });
      const e = rng.pick(exponents);
      const k = Q.neg(Q.mul(a, Q.pow(base, e)));
      if (chosen === 'one') return { a, base, h, k };
      return { a, base, h, k, domain: rayDomain(Q.add(h, Q.rat(e)), chosen === 'rayFromZero', rng.chance(0.5) ? 1 : -1) };
    }
    if (feature === F.X_INTERCEPT && chosen === 'noneOnAxis') return { a, base, h, k: Q.ZERO };
    if (feature === F.X_INTERCEPT && chosen === 'none') {
      return { a, base, h, k: Q.mul(Q.rat(Q.sign(a)), Q.rat(rng.int(2, 4))) };
    }
    if (feature === F.ASYMPTOTE && chosen === 'oneOnAxis') return { a, base, h, k: Q.ZERO };
    if (feature === F.ASYMPTOTE || feature === F.DOMAIN || feature === F.RANGE) return { a, base, h, k: Q.rat((rng.chance(0.5) ? 1 : -1) * rng.int(1, 4)) };
    const k = Q.rat(rng.int(-4, 4));
    if (feature === F.Y_INTERCEPT && (chosen === 'rayFromAxis' || chosen === 'rayOpenAtAxis')) {
      return { a, base, h, k, domain: rayDomain(Q.ZERO, chosen === 'rayFromAxis', rng.chance(0.5) ? 1 : -1) };
    }
    return { a, base, h, k };
  },
  toGraph: ({ a, base, h, k, domain }) => ({
    kind: GRAPH_KIND.EXPONENTIAL,
    a: num(a),
    base: [base.n, base.d],
    h: num(h),
    k: num(k),
    ...domainToGraph(domain),
  }),
  analyze(params) {
    const { a, base, h, k, domain = null } = params;
    let xIntercept;
    const ratio = Q.div(Q.neg(k), a);
    if (Q.sign(ratio) <= 0) xIntercept = none();
    else {
      const exponent = exactLogarithm(base, ratio);
      xIntercept = exponent === null ? inexact() : exists(point(Q.add(h, Q.rat(exponent)), 0));
    }
    const atZero = exponentialValueAt(params, Q.ZERO);
    const yIntercept = atZero === null ? inexact() : exists(point(0, atZero));
    // It approaches y = k as x heads left for a base above 1, right below 1.
    const growsRight = Q.cmp(base, Q.ONE) > 0;
    const approachSide = growsRight ? 'left' : 'right';
    const shape = {
      valueAt: (x) => exponentialValueAt(params, x),
      critical: [],
      tail: (side) => (side === approachSide ? { kind: 'approach', value: k } : { kind: 'infinite', sign: Q.sign(a) }),
    };
    const keepsApproach = !domain || (approachSide === 'left' ? !domain.from : !domain.to);
    const zeros = keepInDomain(xIntercept, domain);
    return {
      ...intervalFeatures({ graph: this.toGraph(params), zeros, turns: [], breaks: domainBreaks(domain) }),
      [F.X_INTERCEPT]: zeros,
      [F.Y_INTERCEPT]: keepInDomain(yIntercept, domain),
      [F.VERTEX]: notApplicable(),
      // Unbounded one way, approaching (never reaching) the asymptote the other.
      [F.MAXIMUM]: domain ? restrictedExtreme(shape, domain, 1) : none(),
      [F.MINIMUM]: domain ? restrictedExtreme(shape, domain, -1) : none(),
      [F.ASYMPTOTE]: keepsApproach ? exists(asymptoteLine(LINE_ORIENTATION.HORIZONTAL, k)) : none(),
      [F.DOMAIN]: setFeature('x', domainSet(domain)),
      [F.RANGE]: setFeature('y', rangeOver(shape, domain || UNBOUNDED)),
    };
  },
  keyPoints(params) {
    const analysis = this.analyze(params);
    const ends = params.domain
      ? [params.domain.from, params.domain.to].filter(Boolean)
        .map((end) => exponentialValueAt(params, end.x) === null ? null : point(end.x, exponentialValueAt(params, end.x)))
        .filter(Boolean)
      : [];
    return [...analysis[F.Y_INTERCEPT].points, ...analysis[F.X_INTERCEPT].points, ...ends];
  },
  // y = k frames the view only while the graph still approaches it.
  asymptotes(params) {
    return { vertical: [], horizontal: this.analyze(params)[F.ASYMPTOTE].points.map((line) => num(line.y)) };
  },
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
    [F.ASYMPTOTE]: [variant('none', { exists: false, minTier: STANDARD })],
    // From its endpoint on: a closed end, either way.
    [F.DOMAIN]: [variant('endpoint')],
    [F.RANGE]: [variant('endpoint')],
    // From its endpoint on, one way only (open at the endpoint): rising for
    // an Easy lead, falling from Standard. Above or below the axis from the
    // endpoint (closed there when it is off the axis) or from its zero.
    ...intervalVariants({
      [F.INCREASING]: [['endpoint'], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['endpoint', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['none', { exists: false, minTier: STANDARD }]],
      [F.POSITIVE]: [['crossing'], ['clear', { minTier: STANDARD, weight: 0.6 }], ['none', { exists: false, minTier: STANDARD }]],
      [F.NEGATIVE]: [['crossing'], ['clear', { minTier: STANDARD, weight: 0.6 }], ['none', { exists: false, minTier: STANDARD }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const s = tier === CHALLENGE && rng.chance(0.4) ? -1 : 1;
    const leads = (ROOT_LEADS[tier] || ROOT_LEADS[STANDARD]).map((entry) => Q.toRational(entry));
    if (isMonotoneFeature(feature)) {
      // Rising when a and s agree in sign.
      const wanted = askedDirection(feature) || (rng.chance(0.5) ? 1 : -1);
      const way = chosen === 'none' && askedDirection(feature) !== 0 ? -wanted : wanted;
      const options = leads.filter((lead) => Q.sign(lead) * s === way);
      if (!options.length) return null;
      return { a: rng.pick(options), s, h: Q.rat(rng.int(-5, 3)), k: Q.rat(rng.int(-4, 4)) };
    }
    if (isIntervalFeature(feature)) {
      const wanted = askedSign(feature);
      if (chosen === 'crossing') return this.build(rng, { feature: F.X_INTERCEPT, variant: 'one', tier });
      // Never crossing: from an endpoint on the side asked (or, for 'none',
      // the other side), heading away from the axis — or from the axis itself.
      const side = chosen === 'none' ? -wanted : wanted;
      const options = leads.filter((lead) => Q.sign(lead) === side);
      if (!options.length) return null;
      return { a: rng.pick(options), s, h: Q.rat(rng.int(-5, 3)), k: Q.mul(Q.rat(side), Q.rat(rng.int(0, 4))) };
    }
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
  analyze(params) {
    const { a, s, h, k } = params;
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
      ...intervalFeatures({ graph: this.toGraph(params), zeros: xIntercept, turns: [], breaks: [h] }),
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: yIntercept,
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: Q.sign(a) < 0 ? exists(endpoint) : none(),
      [F.MINIMUM]: Q.sign(a) > 0 ? exists(endpoint) : none(),
      // It grows without bound, ever more slowly: no asymptote.
      [F.ASYMPTOTE]: NO_ASYMPTOTES(),
      [F.DOMAIN]: setFeature('x', s === -1 ? intervalSet(null, false, h, true) : intervalSet(h, true, null, false)),
      [F.RANGE]: setFeature('y', Q.sign(a) < 0 ? intervalSet(null, false, k, true) : intervalSet(k, true, null, false)),
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
    [F.ASYMPTOTE]: [variant('none', { exists: false, minTier: STANDARD })],
    [F.DOMAIN]: [variant('all', { minTier: STANDARD })],
    [F.RANGE]: [variant('all', { minTier: STANDARD })],
    // Rising (or falling) everywhere, even through its steep center; one
    // side of its zero above the axis, the other below.
    ...intervalVariants({
      [F.INCREASING]: [['monotone', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['monotone', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['none', { exists: false, minTier: STANDARD }]],
      [F.POSITIVE]: [['crossing', { minTier: STANDARD }]],
      [F.NEGATIVE]: [['crossing', { minTier: STANDARD }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const a = Q.toRational(rng.pick((ROOT_LEADS[tier] || ROOT_LEADS[STANDARD]).filter((lead) => lead.length === 1)));
    if (isMonotoneFeature(feature)) {
      const wanted = askedDirection(feature) || (rng.chance(0.5) ? 1 : -1);
      const way = chosen === 'none' && askedDirection(feature) !== 0 ? -wanted : wanted;
      return { a: Q.mul(Q.rat(way), Q.abs(a)), h: Q.rat(rng.int(-4, 4)), k: Q.rat(rng.int(-4, 4)) };
    }
    if (isIntervalFeature(feature)) return this.build(rng, { feature: F.X_INTERCEPT, variant: 'one', tier });
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
  analyze(params) {
    const { a, h, k } = params;
    const t = Q.div(Q.neg(k), a);
    const root = Q.exactCbrt(Q.neg(h));
    const xIntercept = exists(point(Q.add(h, Q.mul(t, Q.mul(t, t))), 0));
    return {
      ...intervalFeatures({ graph: this.toGraph(params), zeros: xIntercept, turns: [] }),
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: root ? exists(point(0, Q.add(Q.mul(a, root), k))) : inexact(),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: none(),
      [F.MINIMUM]: none(),
      [F.ASYMPTOTE]: NO_ASYMPTOTES(),
      [F.DOMAIN]: setFeature('x', ALL_REALS),
      [F.RANGE]: setFeature('y', ALL_REALS),
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
    [F.ASYMPTOTE]: [
      // A vertical asymptote x = h and a horizontal one y = k.
      variant('two', { minTier: STANDARD, weight: 1.4 }),
      // One of the two is an axis: x = 0 or y = 0.
      variant('twoOnAxis', { minTier: CHALLENGE, weight: 0.6, flags: { asymptoteOnAxis: true } }),
    ],
    // Every number but the one the graph cannot take: an open dot with both arrows.
    [F.DOMAIN]: [variant('allButOne', { minTier: STANDARD })],
    [F.RANGE]: [variant('allButOne', { minTier: STANDARD })],
    // Each branch rises (or falls), on both sides of the asymptote: two
    // intervals, never joined across it. Above the axis between (or outside)
    // its zero and the asymptote.
    ...intervalVariants({
      [F.INCREASING]: [['branches', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['branches', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['none', { exists: false, minTier: STANDARD }]],
      [F.POSITIVE]: [['branches', { minTier: STANDARD }]],
      [F.NEGATIVE]: [['branches', { minTier: STANDARD }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const a = Q.rat(rng.pick(RATIONAL_LEADS));
    if (isMonotoneFeature(feature)) {
      // a > 0 falls on both branches, a < 0 rises.
      const wanted = askedDirection(feature) || (rng.chance(0.5) ? 1 : -1);
      const way = chosen === 'none' && askedDirection(feature) !== 0 ? -wanted : wanted;
      return { a: Q.mul(Q.rat(-way), Q.abs(a)), h: Q.rat(rng.pick([-3, -2, -1, 1, 2, 3])), k: Q.rat(rng.pick([-3, -2, 2, 3])) };
    }
    if (isIntervalFeature(feature)) {
      // Its zero a whole step or more from the asymptote; now and then the
      // x-axis is the horizontal asymptote, and one branch is the answer.
      if (rng.chance(0.25)) return { a, h: Q.rat(rng.pick([-3, -2, -1, 1, 2, 3])), k: Q.ZERO };
      return this.build(rng, { feature: F.X_INTERCEPT, variant: 'one', tier });
    }
    if (feature === F.ASYMPTOTE && chosen === 'twoOnAxis') {
      return rng.chance(0.5)
        ? { a, h: Q.ZERO, k: Q.rat(rng.pick([-3, -2, 2, 3])) }
        : { a, h: Q.rat(rng.pick([-3, -2, 2, 3])), k: Q.ZERO };
    }
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
  analyze(params) {
    const { a, h, k } = params;
    const xIntercept = Q.isZero(k) ? none() : exists(point(Q.sub(h, Q.div(a, k)), 0));
    return {
      ...intervalFeatures({ graph: this.toGraph(params), zeros: xIntercept, turns: [], breaks: [h] }),
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: Q.isZero(h) ? none() : exists(point(0, Q.sub(k, Q.div(a, h)))),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: none(),
      [F.MINIMUM]: none(),
      [F.ASYMPTOTE]: exists(asymptoteLine(LINE_ORIENTATION.VERTICAL, h), asymptoteLine(LINE_ORIENTATION.HORIZONTAL, k)),
      [F.DOMAIN]: setFeature('x', allExcept(h)),
      [F.RANGE]: setFeature('y', allExcept(k)),
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
    // Two slanted pieces (no slope is ever 0): no asymptote.
    [F.ASYMPTOTE]: [variant('none', { exists: false, minTier: STANDARD })],
    [F.DOMAIN]: [variant('all', { minTier: STANDARD })],
    // The two pieces' y-values together: a ray, everything, or two rays with
    // a gap — the dots at the split decide.
    [F.RANGE]: [variant('pieces', { minTier: CHALLENGE })],
    // One piece each way (or one level): the split is never in a rising,
    // falling or level interval. Two pieces going the same way across a jump
    // are one interval to some classes and two to others: never asked.
    ...intervalVariants({
      [F.INCREASING]: [['pieces', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.DECREASING]: [['pieces', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.CONSTANT]: [['level', { minTier: STANDARD }], ['none', { exists: false, minTier: STANDARD }]],
      [F.POSITIVE]: [['pieces', { minTier: STANDARD }]],
      [F.NEGATIVE]: [['pieces', { minTier: STANDARD }]],
    }),
  }),
  build(rng, { feature, variant: chosen, tier }) {
    const s = Q.rat(rng.int(-3, 3));
    const slope = (sign = 0) => rng.pick(PIECE_SLOPES.map((entry) => Q.toRational(entry))
      .filter((m) => sign === 0 || Q.sign(m) === sign));
    const leftClosed = rng.chance(0.5);
    if (isMonotoneFeature(feature)) {
      // Two pieces that go different ways: rising, falling or level.
      const wanted = askedDirection(feature);
      const ways = (() => {
        if (chosen === 'none') {
          // Neither piece goes the way asked.
          const others = [1, -1, 0].filter((way) => way !== wanted);
          return rng.chance(0.5) ? others : [...others].reverse();
        }
        const other = rng.pick([1, -1, 0].filter((way) => way !== wanted));
        return rng.chance(0.5) ? [wanted, other] : [other, wanted];
      })();
      const pieceSlope = (way) => (way === 0 ? Q.ZERO : slope(way));
      return {
        s,
        pieces: makePieces({ s, leftSlope: pieceSlope(ways[0]), rightSlope: pieceSlope(ways[1]), leftValue: Q.rat(rng.int(-4, 4)), rightValue: Q.rat(rng.int(-4, 4)), leftClosed }),
      };
    }
    if (isIntervalFeature(feature)) return this.build(rng, { feature: F.X_INTERCEPT, variant: rng.chance(0.6) ? 'two' : 'one', tier });
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
    const xIntercept = zeroAmbiguous ? ambiguous() : (zeros.length ? exists(...uniqueX(zeros).map((x) => point(x, 0))) : none());
    const breaks = pieces.flatMap((piece) => [piece.from, piece.to]).filter(Boolean).map((end) => end.x);
    return {
      ...intervalFeatures({ graph: this.toGraph({ s, pieces }), zeros: xIntercept, turns: [], breaks }),
      [F.X_INTERCEPT]: xIntercept,
      [F.Y_INTERCEPT]: owner ? exists(point(0, pieceValue(owner, Q.ZERO))) : none(),
      [F.VERTEX]: notApplicable(),
      [F.MAXIMUM]: extreme(1),
      [F.MINIMUM]: extreme(-1),
      // A level piece would be its own asymptote to some readers: never asked.
      [F.ASYMPTOTE]: pieces.some((piece) => Q.isZero(piece.m)) ? ambiguous() : NO_ASYMPTOTES(),
      [F.DOMAIN]: setFeature('x', canonicalSet(pieces.map((piece) => ({
        lo: piece.from ? piece.from.x : null,
        loClosed: piece.from?.closed === true,
        hi: piece.to ? piece.to.x : null,
        hiClosed: piece.to?.closed === true,
      })))),
      [F.RANGE]: setFeature('y', (() => {
        const images = pieces.map((piece) => rangeOver(linearShape(piece), { from: piece.from, to: piece.to }));
        return images.every(Boolean) ? unionSets(...images) : null;
      })()),
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
  // A corner where the pieces meet (a jump is drawn as dots instead).
  turningPoints: ({ s, pieces }) => {
    const [left, right] = pieces;
    return Q.eq(pieceValue(left, s), pieceValue(right, s)) ? [point(s, pieceValue(left, s))] : [];
  },
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

/**
 * Whether a family can ever ask a feature with a real (existing) answer. An
 * off-screen variant does not count: it plays only in a game that turns
 * off-screen features on, and always beside the on-screen ones.
 */
export const familySupportsFeature = (familyId, featureId, tier = CHALLENGE) => familyVariants(familyId, featureId, tier)
  .some((entry) => entry.exists && entry.flags?.offScreen !== true);
