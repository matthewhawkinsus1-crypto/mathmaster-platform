import { nearlyEqual } from '../shared/toolMath.js';

export const toComplex = (value = {}) => ({ re: Number(value.re ?? 0), im: Number(value.im ?? 0) });

export const isFiniteComplex = (value = {}) => Number.isFinite(Number(value.re)) && Number.isFinite(Number(value.im));

export const complexAdd = (a, b) => {
  const z = toComplex(a); const w = toComplex(b);
  return { re: z.re + w.re, im: z.im + w.im };
};

export const complexSubtract = (a, b) => {
  const z = toComplex(a); const w = toComplex(b);
  return { re: z.re - w.re, im: z.im - w.im };
};

export const complexMultiplyValues = (a, b) => {
  const z = toComplex(a); const w = toComplex(b);
  return { re: z.re * w.re - z.im * w.im, im: z.re * w.im + z.im * w.re };
};

export const complexConjugateValue = (value) => {
  const z = toComplex(value);
  return { re: z.re, im: -z.im };
};

export const complexMagnitudeValue = (value) => {
  const z = toComplex(value);
  return Math.hypot(z.re, z.im);
};

export const complexArgumentDegrees = (value) => {
  const z = toComplex(value);
  if (nearlyEqual(z.re, 0) && nearlyEqual(z.im, 0)) return Number.NaN;
  return Math.atan2(z.im, z.re) * 180 / Math.PI;
};

export const complexDivide = (a, b) => {
  const z = toComplex(a); const w = toComplex(b);
  const denominator = w.re ** 2 + w.im ** 2;
  if (nearlyEqual(denominator, 0)) throw new Error('Cannot divide by 0 + 0i.');
  return {
    re: (z.re * w.re + z.im * w.im) / denominator,
    im: (z.im * w.re - z.re * w.im) / denominator,
  };
};

export const complexNearlyEqual = (a, b, tolerance = 1e-8) => {
  const z = toComplex(a); const w = toComplex(b);
  return nearlyEqual(z.re, w.re, tolerance) && nearlyEqual(z.im, w.im, tolerance);
};

export const complexPower = (value, exponent = 1) => {
  const n = Number(exponent);
  if (!Number.isInteger(n)) throw new Error('Complex powers in this lab require an integer exponent.');
  if (n === 0) return { re: 1, im: 0 };

  // CRIT-03: 0 to a negative power is a division by zero. Returning NaN keeps
  // the lab renderable instead of throwing mid-render.
  const zeroCheck = toComplex(value);
  if (nearlyEqual(zeroCheck.re, 0, 1e-9) && nearlyEqual(zeroCheck.im, 0, 1e-9)) {
    return n < 0 ? { re: Number.NaN, im: Number.NaN } : { re: 0, im: 0 };
  }

  if (n < 0) return complexDivide({ re: 1, im: 0 }, complexPower(value, -n));
  let result = { re: 1, im: 0 };
  let factor = toComplex(value);
  let power = n;
  while (power > 0) {
    if (power % 2 === 1) result = complexMultiplyValues(result, factor);
    factor = complexMultiplyValues(factor, factor);
    power = Math.floor(power / 2);
  }
  return result;
};

export const rotateByPowerOfI = (value, quarterTurns = 1) => complexMultiplyValues(value, complexPower({ re: 0, im: 1 }, Number(quarterTurns)));

export const normalizedQuarterTurns = (quarterTurns = 0) => ((Number(quarterTurns) % 4) + 4) % 4;

export const quarterTurnLabel = (quarterTurns = 0) => {
  const normalized = normalizedQuarterTurns(quarterTurns);
  if (normalized === 1) return '90° counterclockwise';
  if (normalized === 2) return '180°';
  if (normalized === 3) return '90° clockwise';
  return 'no net rotation';
};

export const quadraticRootsComplex = ({ a = 1, b = 0, c = 0 } = {}) => {
  const A = Number(a); const B = Number(b); const C = Number(c);
  if (![A, B, C].every(Number.isFinite) || nearlyEqual(A, 0)) throw new Error('Quadratic roots require finite coefficients and a nonzero leading coefficient.');
  const discriminant = B ** 2 - 4 * A * C;
  const denominator = 2 * A;
  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    return [{ re: (-B + root) / denominator, im: 0 }, { re: (-B - root) / denominator, im: 0 }];
  }
  const imaginary = Math.sqrt(-discriminant) / denominator;
  const real = -B / denominator;
  return [{ re: real, im: imaginary }, { re: real, im: -imaginary }];
};

export const sameComplexSet = (actual = [], expected = [], tolerance = 1e-8) => {
  if (actual.length !== expected.length) return false;
  const used = new Set();
  return actual.every((value) => {
    const index = expected.findIndex((candidate, i) => !used.has(i) && complexNearlyEqual(value, candidate, tolerance));
    if (index < 0) return false;
    used.add(index);
    return true;
  });
};

export const formatComplex = (value, digits = 2) => {
  const z = toComplex(value);
  const tidy = (number) => Number(Number(number).toFixed(digits));
  const re = tidy(z.re); const im = tidy(z.im);
  if (nearlyEqual(im, 0)) return `${re}`;
  if (nearlyEqual(re, 0)) return `${im}i`;
  return `${re} ${im >= 0 ? '+' : '−'} ${Math.abs(im)}i`;
};
