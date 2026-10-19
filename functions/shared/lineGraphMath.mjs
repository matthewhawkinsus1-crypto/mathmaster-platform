/*
 * GRAPH THE LINE: EXACT LINES.
 *
 * Every line in the game — the one an equation describes and the one a
 * student draws through two grid points — is held as three integers:
 *
 *   a·x + b·y = c,   gcd(|a|, |b|, |c|) = 1,   a > 0, or a = 0 and b > 0
 *
 * One line has exactly one such triple, so "is the student's line the
 * equation's line?" is three integer comparisons. No slope is ever a float,
 * no tolerance decides a grade, and a vertical line is an ordinary line
 * (b = 0) rather than an infinite slope. (The assignment graphing tool
 * compares floats within 0.12; a game graded on every release cannot afford
 * a line that is "close enough" on one device and not on another.)
 *
 * Two grid points give the triple directly (a = y₂ − y₁, b = x₁ − x₂); an
 * equation's exact rational coefficients are scaled to integers. Everything a
 * prompt, a hint or a reveal needs — slope, intercepts, a point at a given x,
 * the grid points inside a view — is read back from the triple exactly.
 *
 * Pure: Cloud Functions, the student device and tests.
 */

import * as Q from './graphFeatureRational.mjs';

export class LineGraphMathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LineGraphMathError';
  }
}

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

const lcm = (left, right) => Math.abs(left * right) / (gcd(left, right) || 1);

const requireSafe = (value) => {
  if (!Number.isSafeInteger(value)) throw new LineGraphMathError('A line coefficient left the exact integer range.');
  return value;
};

// Signed zero would make Object.is comparisons (and deepEqual) disagree with
// the arithmetic; a line never holds -0.
const plain = (value) => (value === 0 ? 0 : value);

const canonical = (a, b, c) => {
  if (a === 0 && b === 0) throw new LineGraphMathError('A line needs an x or a y term.');
  const divisor = gcd(gcd(a, b), c) || 1;
  const sign = a < 0 || (a === 0 && b < 0) ? -1 : 1;
  return Object.freeze({
    a: plain(requireSafe((sign * a) / divisor)),
    b: plain(requireSafe((sign * b) / divisor)),
    c: plain(requireSafe((sign * c) / divisor)),
  });
};

export const isLine = (value) => Boolean(value)
  && typeof value === 'object'
  && Number.isSafeInteger(value.a)
  && Number.isSafeInteger(value.b)
  && Number.isSafeInteger(value.c)
  && (value.a !== 0 || value.b !== 0);

/** The line A·x + B·y = C for exact rationals A, B, C (integers, rationals or [n, d]). */
export const lineFromCoefficients = (A, B, C) => {
  const [ra, rb, rc] = [A, B, C].map(Q.toRational);
  const scale = [ra, rb, rc].reduce((acc, value) => lcm(acc, value.d), 1);
  return canonical(
    requireSafe((ra.n * scale) / ra.d),
    requireSafe((rb.n * scale) / rb.d),
    requireSafe((rc.n * scale) / rc.d),
  );
};

/** A line in canonical form from any (a, b, c) triple a caller already holds. */
export const normalizeLine = (raw = {}) => lineFromCoefficients(raw.a ?? 0, raw.b ?? 0, raw.c ?? 0);

const coordinate = (value, label) => {
  try {
    return Q.toRational(value);
  } catch {
    throw new LineGraphMathError(`${label} is not an exact number.`);
  }
};

/** A point as exact rationals: { x, y }. */
export const exactPoint = (point = {}) => Object.freeze({ x: coordinate(point.x, 'An x-coordinate'), y: coordinate(point.y, 'A y-coordinate') });

export const samePoint = (left, right) => Q.eq(coordinate(left.x, 'x'), coordinate(right.x, 'x'))
  && Q.eq(coordinate(left.y, 'y'), coordinate(right.y, 'y'));

/** The line through two points, or null when they are the same point. */
export const lineThroughPoints = (first, second) => {
  const p = exactPoint(first);
  const q = exactPoint(second);
  if (Q.eq(p.x, q.x) && Q.eq(p.y, q.y)) return null;
  const a = Q.sub(q.y, p.y);
  const b = Q.sub(p.x, q.x);
  const c = Q.add(Q.mul(a, p.x), Q.mul(b, p.y));
  return lineFromCoefficients(a, b, c);
};

/** y = m·x + b, i.e. −m·x + y = b. */
export const lineFromSlopeIntercept = (m, b) => lineFromCoefficients(Q.neg(Q.toRational(m)), 1, b);

/** y − y₁ = m(x − x₁), i.e. −m·x + y = y₁ − m·x₁. */
export const lineFromPointSlope = (point, m) => {
  const p = exactPoint(point);
  const slope = Q.toRational(m);
  return lineFromCoefficients(Q.neg(slope), 1, Q.sub(p.y, Q.mul(slope, p.x)));
};

export const verticalLine = (h) => lineFromCoefficients(1, 0, h);
export const horizontalLine = (k) => lineFromCoefficients(0, 1, k);

export const sameLine = (left, right) => Boolean(left && right)
  && left.a === right.a && left.b === right.b && left.c === right.c;

export const lineKey = (line) => `${line.a}|${line.b}|${line.c}`;

export const isVertical = (line) => line.b === 0;
export const isHorizontal = (line) => line.a === 0;

/** The exact slope, or null for a vertical line. */
export const slopeOf = (line) => (line.b === 0 ? null : Q.rat(-line.a, line.b));

/**
 * Where the line crosses the y-axis, or null when it does not cross it at one
 * point (a vertical line; x = 0 lies ALONG the axis).
 */
export const yInterceptOf = (line) => (line.b === 0 ? null : Q.rat(line.c, line.b));

/** Where the line crosses the x-axis, or null (a horizontal line). */
export const xInterceptOf = (line) => (line.a === 0 ? null : Q.rat(line.c, line.a));

export const yAt = (line, x) => (line.b === 0 ? null : Q.div(Q.sub(line.c, Q.mul(line.a, Q.toRational(x))), line.b));
export const xAt = (line, y) => (line.a === 0 ? null : Q.div(Q.sub(line.c, Q.mul(line.b, Q.toRational(y))), line.a));

export const containsPoint = (line, point) => {
  const p = exactPoint(point);
  return Q.eq(Q.add(Q.mul(line.a, p.x), Q.mul(line.b, p.y)), line.c);
};

/** True when two lines never meet (equal slopes, different lines). */
export const parallelLines = (left, right) => !sameLine(left, right) && left.a * right.b === right.a * left.b;

/*
 * A VIEW is the square of the coordinate plane a student sees:
 * { xMin, xMax, yMin, yMax } in whole units. `inset` shrinks it on every side
 * (a point one unit from the edge is still easy to place; a point ON the edge
 * is half off a phone's graph).
 */
const viewRange = (view = {}, inset = 0) => ({
  xLow: Math.ceil(Number(view.xMin) + inset),
  xHigh: Math.floor(Number(view.xMax) - inset),
  yLow: Math.ceil(Number(view.yMin) + inset),
  yHigh: Math.floor(Number(view.yMax) - inset),
});

export const pointInView = (point, view, { inset = 0 } = {}) => {
  const p = exactPoint(point);
  const { xLow, xHigh, yLow, yHigh } = viewRange(view, inset);
  return Q.cmp(p.x, xLow) >= 0 && Q.cmp(p.x, xHigh) <= 0 && Q.cmp(p.y, yLow) >= 0 && Q.cmp(p.y, yHigh) <= 0;
};

export const isLatticePoint = (point) => {
  const p = exactPoint(point);
  return p.x.d === 1 && p.y.d === 1;
};

/**
 * Every grid point (whole-number coordinates) of the line inside the view,
 * in order of x (of y for a vertical line). These are the points a student
 * can place, and the points a reader can trust on a drawn graph.
 */
export const latticePointsInView = (line, view, { inset = 0 } = {}) => {
  const { xLow, xHigh, yLow, yHigh } = viewRange(view, inset);
  const points = [];
  if (line.b === 0) {
    if (line.c % line.a !== 0) return points;
    const x = line.c / line.a;
    if (x < xLow || x > xHigh) return points;
    for (let y = yLow; y <= yHigh; y += 1) points.push(Object.freeze({ x: plain(x), y }));
    return points;
  }
  for (let x = xLow; x <= xHigh; x += 1) {
    const top = line.c - line.a * x;
    if (top % line.b !== 0) continue;
    const y = plain(top / line.b);
    if (y >= yLow && y <= yHigh) points.push(Object.freeze({ x, y }));
  }
  return points;
};

/** A grid point as plain numbers, or null when a coordinate is not a whole number. */
export const integerPoint = (point = {}) => {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? Object.freeze({ x: plain(x), y: plain(y) }) : null;
};

/** Everything the rest of the game reads from a line, exactly. */
export const describeLine = (line) => Object.freeze({
  vertical: isVertical(line),
  horizontal: isHorizontal(line),
  slope: slopeOf(line),
  yIntercept: yInterceptOf(line),
  xIntercept: xInterceptOf(line),
});
