/*
 * EXACT RATIONAL ARITHMETIC FOR GENERATED GRAPH FEATURES.
 *
 * A generated graph question is only as trustworthy as its answer key. The
 * features a student taps — intercepts, vertices, endpoints — are computed
 * here exactly, as fractions, and only turned into JavaScript numbers at the
 * very end. That is what keeps an answer key from saying x = 1.9999999998
 * when the graph plainly crosses at 2.
 *
 * The generators choose every parameter so that features land on a clean
 * grid (integers, halves); this module is how they prove it rather than
 * hope it. Numerators and denominators stay small — the families never
 * multiply more than a handful of small integers together — so ordinary
 * safe integers are enough. Anything that leaves the safe-integer range
 * throws instead of silently losing precision.
 *
 * Pure: shared by Cloud Functions and tests. No Firebase, no browser.
 */

export class RationalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RationalError';
  }
}

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

const requireSafe = (value, label) => {
  if (!Number.isSafeInteger(value)) throw new RationalError(`${label} left the exact integer range.`);
  return value;
};

/** A reduced fraction n/d with d > 0. `0` is always 0/1. */
export const rat = (numerator, denominator = 1) => {
  const n = requireSafe(Number(numerator), 'A numerator');
  const d = requireSafe(Number(denominator), 'A denominator');
  if (d === 0) throw new RationalError('A fraction cannot have a zero denominator.');
  if (n === 0) return Object.freeze({ n: 0, d: 1 });
  const sign = d < 0 ? -1 : 1;
  const divisor = gcd(n, d);
  return Object.freeze({ n: (sign * n) / divisor, d: Math.abs(d) / divisor });
};

export const ZERO = rat(0);
export const ONE = rat(1);

export const isRational = (value) => Boolean(value)
  && typeof value === 'object'
  && Number.isSafeInteger(value.n)
  && Number.isSafeInteger(value.d)
  && value.d > 0;

/** Accept a rational, an integer, or [n, d]. */
export const toRational = (value) => {
  if (isRational(value)) return rat(value.n, value.d);
  if (Array.isArray(value)) return rat(value[0], value[1] ?? 1);
  if (Number.isSafeInteger(value)) return rat(value);
  throw new RationalError(`${String(value)} is not an exact rational.`);
};

export const add = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  return rat(requireSafe(a.n * b.d + b.n * a.d, 'A sum'), requireSafe(a.d * b.d, 'A sum'));
};

export const neg = (value) => {
  const a = toRational(value);
  return rat(-a.n, a.d);
};

export const sub = (left, right) => add(left, neg(right));

export const mul = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  return rat(requireSafe(a.n * b.n, 'A product'), requireSafe(a.d * b.d, 'A product'));
};

export const div = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  if (b.n === 0) throw new RationalError('Division by zero.');
  return rat(requireSafe(a.n * b.d, 'A quotient'), requireSafe(a.d * b.n, 'A quotient'));
};

/** An integer power, negative exponents included. */
export const pow = (base, exponent) => {
  const e = Number(exponent);
  if (!Number.isInteger(e)) throw new RationalError('Exact powers need an integer exponent.');
  let result = ONE;
  const factor = e < 0 ? div(ONE, base) : toRational(base);
  for (let index = 0; index < Math.abs(e); index += 1) result = mul(result, factor);
  return result;
};

export const cmp = (left, right) => {
  const difference = sub(left, right);
  return difference.n === 0 ? 0 : (difference.n < 0 ? -1 : 1);
};

export const eq = (left, right) => cmp(left, right) === 0;
export const isZero = (value) => toRational(value).n === 0;
export const sign = (value) => Math.sign(toRational(value).n);
export const abs = (value) => {
  const a = toRational(value);
  return rat(Math.abs(a.n), a.d);
};
export const min = (left, right) => (cmp(left, right) <= 0 ? toRational(left) : toRational(right));
export const max = (left, right) => (cmp(left, right) >= 0 ? toRational(left) : toRational(right));

export const isInteger = (value) => toRational(value).d === 1;

/** Whether the value is a whole multiple of 1/denominator (2 → halves). */
export const onGrid = (value, denominator = 1) => {
  const a = toRational(value);
  return Number.isInteger(denominator) && denominator > 0 && denominator % a.d === 0;
};

/**
 * The exact square root of a perfect-square rational, or null. Used where a
 * generator must prove a radical lands on the grid (√(x − h) at an intercept).
 */
export const exactSqrt = (value) => {
  const a = toRational(value);
  if (a.n < 0) return null;
  const rootN = Math.round(Math.sqrt(a.n));
  const rootD = Math.round(Math.sqrt(a.d));
  return rootN * rootN === a.n && rootD * rootD === a.d ? rat(rootN, rootD) : null;
};

/** The exact real cube root of a perfect-cube rational, or null. */
export const exactCbrt = (value) => {
  const a = toRational(value);
  const rootN = Math.round(Math.cbrt(a.n));
  const rootD = Math.round(Math.cbrt(a.d));
  return rootN ** 3 === a.n && rootD ** 3 === a.d ? rat(rootN, rootD) : null;
};

/**
 * The JavaScript number for a rational. Every value the families produce is a
 * small dyadic rational (integers and halves, occasionally quarters), so the
 * conversion is exact; anything else is still the nearest double.
 */
export const toNumber = (value) => {
  const a = toRational(value);
  return a.n / a.d;
};

/** A teacher-readable string: 3, -5/2. */
export const format = (value) => {
  const a = toRational(value);
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
};
