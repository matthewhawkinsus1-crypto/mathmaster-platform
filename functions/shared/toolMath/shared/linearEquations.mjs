// React-free canonical-line helpers shared by graphing2, stepAlgebra2, and
// representationMatch, so "are these two lines the same line" is answered one
// way across all three tools instead of three times with three tolerances.
//
// A canonical line is either:
//   { vertical: true,  x: Fraction }
//   { vertical: false, m: Fraction, b: Fraction }
// Fractions are exact rationals { n, d } (d > 0, gcd(|n|,d) === 1) so integer
// or simple-fraction authored input (the overwhelming majority of Algebra I
// content) never drifts into floating-point "close enough" territory. A
// numeric fallback tolerance is used only when a value cannot be captured as
// a small-denominator rational (e.g. an irrational slope), never as the
// default comparison.

import { parse } from 'mathjs';

const MAX_DENOMINATOR = 100000;

const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) { [x, y] = [y, x % y]; }
  return x || 1;
};

export const makeFraction = (n, d = 1) => {
  if (!Number.isFinite(Number(n)) || !Number.isFinite(Number(d)) || Number(d) === 0) return null;
  let numerator = Number(n);
  let denominator = Number(d);
  if (denominator < 0) { numerator = -numerator; denominator = -denominator; }
  const divisor = gcd(numerator, denominator);
  return { n: numerator / divisor, d: denominator / divisor };
};

// Convert an arbitrary finite number into an exact rational when it already
// is one to within floating-point noise (the normal case for authored
// content), otherwise fall back to a bounded-denominator approximation so
// irrational/decimal slopes still compare sanely.
export const toFraction = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (Number.isInteger(number)) return makeFraction(number, 1);
  for (let denominator = 2; denominator <= MAX_DENOMINATOR; denominator += 1) {
    const numerator = number * denominator;
    if (Math.abs(numerator - Math.round(numerator)) < 1e-7) return makeFraction(Math.round(numerator), denominator);
  }
  return makeFraction(Math.round(number * 1e6), 1e6);
};

export const fractionToNumber = (fraction) => (fraction ? fraction.n / fraction.d : NaN);

export const addFractions = (a, b) => makeFraction(a.n * b.d + b.n * a.d, a.d * b.d);
export const subFractions = (a, b) => makeFraction(a.n * b.d - b.n * a.d, a.d * b.d);
export const mulFractions = (a, b) => makeFraction(a.n * b.n, a.d * b.d);
export const divFractions = (a, b) => (b.n === 0 ? null : makeFraction(a.n * b.d, a.d * b.n));
export const negFraction = (a) => makeFraction(-a.n, a.d);
export const fractionsEqual = (a, b) => Boolean(a && b && a.n === b.n && a.d === b.d);

export const formatFraction = (fraction) => {
  if (!fraction) return '';
  if (fraction.d === 1) return String(fraction.n);
  return `${fraction.n}/${fraction.d}`;
};

const numberOrFraction = (value) => (
  value && typeof value === 'object' && Number.isFinite(value.n) && Number.isFinite(value.d)
    ? value
    : toFraction(value)
);

// --- Canonicalization --------------------------------------------------

export const canonicalFromSlopeIntercept = (m, b) => {
  const mf = numberOrFraction(m);
  const bf = numberOrFraction(b);
  if (!mf || !bf) return null;
  return { vertical: false, m: mf, b: bf };
};

export const canonicalFromVertical = (x) => {
  const xf = numberOrFraction(x);
  return xf ? { vertical: true, x: xf } : null;
};

// Ax + By = C
export const canonicalFromStandard = (A, B, C) => {
  const a = Number(A);
  const b = Number(B);
  const c = Number(C);
  if (![a, b, c].every(Number.isFinite) || (a === 0 && b === 0)) return null;
  if (b === 0) return canonicalFromVertical(c / a);
  if (a === 0) return canonicalFromSlopeIntercept(0, c / b);
  return canonicalFromSlopeIntercept(-a / b, c / b);
};

export const canonicalFromPointSlope = (point, slope) => {
  if (!Array.isArray(point) || point.length !== 2) return null;
  const [x1, y1] = point.map(Number);
  const m = Number(slope);
  if (![x1, y1, m].every(Number.isFinite)) return null;
  return canonicalFromSlopeIntercept(m, y1 - m * x1);
};

// Derive the canonical line described by an arbitrary linear equation in x
// and y, in whatever surface form it was authored — "y=-2x+5",
// "y-1=-2(x-2)", "2x+y=5" all resolve to the same canonical line. Rather than
// pattern-matching each form, both sides are evaluated at three points and
// the implicit Ax + By = C this equation traces is recovered from those
// samples; a fourth point confirms the equation really is linear (affine) in
// x and y before the result is trusted, so a mistyped nonlinear "equation" is
// rejected instead of silently canonicalized as a nearby line.
export const standardCoefficientsFromEquationText = (text) => {
  try {
    const parts = String(text).split('=');
    if (parts.length !== 2) return null;
    const left = parse(parts[0].trim());
    const right = parse(parts[1].trim());
    const residual = (x, y) => Number(left.evaluate({ x, y })) - Number(right.evaluate({ x, y }));
    const f00 = residual(0, 0);
    const f10 = residual(1, 0);
    const f01 = residual(0, 1);
    if (![f00, f10, f01].every(Number.isFinite)) return null;
    const C = -f00;
    const A = f10 - f00;
    const B = f01 - f00;
    const sample = residual(3, -2);
    if (!Number.isFinite(sample) || Math.abs((A * 3 + B * -2 - C) - sample) > 1e-6) return null;
    if (Math.abs(A) <= 1e-12 && Math.abs(B) <= 1e-12) return null;
    return { A, B, C };
  } catch {
    return null;
  }
};

export const canonicalFromEquationText = (text) => {
  const standard = standardCoefficientsFromEquationText(text);
  return standard ? canonicalFromStandard(standard.A, standard.B, standard.C) : null;
};

export const canonicalFromPoints = (first, second, tolerance = 1e-9) => {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== 2 || second.length !== 2) return null;
  const [x1, y1] = first.map(Number);
  const [x2, y2] = second.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  if (Math.abs(x1 - x2) <= tolerance && Math.abs(y1 - y2) <= tolerance) return null;
  if (Math.abs(x1 - x2) <= tolerance) return canonicalFromVertical((x1 + x2) / 2);
  const m = (y2 - y1) / (x2 - x1);
  return canonicalFromSlopeIntercept(m, y1 - m * x1);
};

// --- Derivation ----------------------------------------------------------

export const isVertical = (line) => Boolean(line?.vertical);
export const isHorizontal = (line) => Boolean(line && !line.vertical && line.m && line.m.n === 0);

export const slopeOf = (line) => (line && !line.vertical ? line.m : null);
export const yInterceptOf = (line) => (line && !line.vertical ? line.b : null);

// x-intercept is undefined for a horizontal line off the x-axis, and every
// point for y = 0; a vertical line's x-intercept is its own x.
export const xInterceptOf = (line) => {
  if (!line) return null;
  if (line.vertical) return line.x;
  if (line.m.n === 0) return line.b.n === 0 ? makeFraction(0, 1) : null;
  return negFraction(divFractions(line.b, line.m));
};

export const pointOnCanonicalLine = (line, point, tolerance = 1e-6) => {
  if (!line || !Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (line.vertical) return Math.abs(x - fractionToNumber(line.x)) <= tolerance;
  return Math.abs(y - (fractionToNumber(line.m) * x + fractionToNumber(line.b))) <= tolerance;
};

export const linesEquivalent = (left, right, tolerance = 1e-6) => {
  if (!left || !right) return false;
  if (left.vertical !== right.vertical) return false;
  if (left.vertical) return fractionsEqual(left.x, right.x) || Math.abs(fractionToNumber(left.x) - fractionToNumber(right.x)) <= tolerance;
  const slopeMatches = fractionsEqual(left.m, right.m) || Math.abs(fractionToNumber(left.m) - fractionToNumber(right.m)) <= tolerance;
  const interceptMatches = fractionsEqual(left.b, right.b) || Math.abs(fractionToNumber(left.b) - fractionToNumber(right.b)) <= tolerance;
  return slopeMatches && interceptMatches;
};

// --- Formatting (display only; never used for equivalence) ---------------

export const formatSlopeIntercept = (line) => {
  if (!line || line.vertical) return null;
  const m = formatFraction(line.m);
  const b = line.b.n === 0 ? '' : ` ${line.b.n >= 0 ? '+' : '−'} ${formatFraction({ n: Math.abs(line.b.n), d: line.b.d })}`;
  return `y = ${m}x${b}`;
};

export const formatStandardForm = (line) => {
  if (!line) return null;
  if (line.vertical) return `x = ${formatFraction(line.x)}`;
  // Clear denominators so authored-style integer standard form is legible:
  // m = a/c, b = e/f -> use common denominator to build A/B/C integers.
  const denom = (line.m.d * line.b.d) / gcd(line.m.d, line.b.d);
  const A = (line.m.n / line.m.d) * denom;
  const C = (line.b.n / line.b.d) * denom;
  return `${formatFraction(makeFraction(A, 1))}x + y = ${formatFraction(makeFraction(C, 1))}`;
};

export const formatPointSlope = (point, slope) => {
  if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(Number(slope))) return null;
  const [x1, y1] = point;
  return `y ${y1 >= 0 ? '-' : '+'} ${Math.abs(y1)} = ${slope}(x ${x1 >= 0 ? '-' : '+'} ${Math.abs(x1)})`;
};
