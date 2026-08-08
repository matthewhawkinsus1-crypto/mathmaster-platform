export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const nearlyEqual = (a, b, tolerance = 1e-6) =>
  Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= tolerance;

export const round = (value, digits = 4) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};

export const mean = (values = []) => values.length
  ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
  : 0;

export const correlation = (points = []) => {
  if (points.length < 2) return 0;
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const mx = mean(xs);
  const my = mean(ys);
  let numerator = 0;
  let xSq = 0;
  let ySq = 0;
  points.forEach(([x, y]) => {
    const dx = Number(x) - mx;
    const dy = Number(y) - my;
    numerator += dx * dy;
    xSq += dx * dx;
    ySq += dy * dy;
  });
  const denominator = Math.sqrt(xSq * ySq);
  return denominator ? numerator / denominator : 0;
};

export const linearRegression = (points = []) => {
  if (points.length < 2) return { m: 0, b: mean(points.map(([, y]) => y)), r: 0 };
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const mx = mean(xs);
  const my = mean(ys);
  let numerator = 0;
  let denominator = 0;
  points.forEach(([x, y]) => {
    numerator += (Number(x) - mx) * (Number(y) - my);
    denominator += (Number(x) - mx) ** 2;
  });
  const m = denominator ? numerator / denominator : 0;
  const b = my - m * mx;
  return { m, b, r: correlation(points) };
};

export const residualsForLine = (points = [], m = 0, b = 0) =>
  points.map(([x, y]) => ({ x: Number(x), y: Number(y), predicted: m * Number(x) + b, residual: Number(y) - (m * Number(x) + b) }));

export const evaluatePolynomial = (coefficients = [], x = 0) =>
  coefficients.reduce((acc, coefficient) => acc * Number(x) + Number(coefficient), 0);

export const syntheticDivide = (coefficients = [], root = 0) => {
  if (!coefficients.length) return { quotient: [], remainder: 0 };
  const quotient = [Number(coefficients[0])];
  for (let i = 1; i < coefficients.length; i += 1) {
    quotient.push(Number(coefficients[i]) + quotient[quotient.length - 1] * Number(root));
  }
  return { quotient: quotient.slice(0, -1), remainder: quotient[quotient.length - 1] };
};

export const solveTwoLines = ({ m1, b1, m2, b2 }) => {
  const a = Number(m1);
  const c = Number(b1);
  const b = Number(m2);
  const d = Number(b2);
  if (nearlyEqual(a, b)) return nearlyEqual(c, d) ? { type: 'infinite' } : { type: 'none' };
  const x = (d - c) / (a - b);
  return { type: 'one', x, y: a * x + c };
};

export const arithmeticTerm = ({ first = 1, difference = 1 }, n) => Number(first) + (Number(n) - 1) * Number(difference);
export const geometricTerm = ({ first = 1, ratio = 2 }, n) => Number(first) * Number(ratio) ** (Number(n) - 1);

export const complexMultiply = (a, b) => ({
  re: Number(a.re) * Number(b.re) - Number(a.im) * Number(b.im),
  im: Number(a.re) * Number(b.im) + Number(a.im) * Number(b.re),
});

export const complexMagnitude = (z) => Math.hypot(Number(z.re), Number(z.im));
export const complexConjugate = (z) => ({ re: Number(z.re), im: -Number(z.im) });

export const evaluateFunctionSpec = (spec = {}, x) => {
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  const value = Number(x);
  if (type === 'linear') return a * (value - h) + k;
  if (type === 'quadratic') return a * (value - h) ** 2 + k;
  if (type === 'absolute') return a * Math.abs(value - h) + k;
  if (type === 'cubic') return a * (value - h) ** 3 + k;
  if (type === 'cubeRoot') return a * Math.cbrt(value - h) + k;
  if (type === 'squareRoot') return value < h ? Number.NaN : a * Math.sqrt(value - h) + k;
  if (type === 'exponential') return a * base ** (value - h) + k;
  if (type === 'logarithmic') return value <= h || base <= 0 || base === 1 ? Number.NaN : a * (Math.log(value - h) / Math.log(base)) + k;
  if (type === 'rational') return nearlyEqual(value, h) ? Number.NaN : a / (value - h) + k;
  return Number.NaN;
};

export const inverseFunctionSpec = (spec = {}) => {
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (type === 'linear') {
    if (nearlyEqual(a, 0)) return null;
    return { type: 'linear', a: 1 / a, h: k, k: h };
  }
  if (type === 'exponential') {
    return { type: 'logarithmic', a: 1, h: k, k: h, base, inputScale: a };
  }
  if (type === 'logarithmic') {
    return { type: 'exponential', a: 1, h: k, k: h, base, inputScale: a };
  }
  return null;
};

export const signAt = (factors = [], x = 0) => factors.reduce((sign, factor) => {
  const root = Number(factor.root);
  const multiplicity = Number(factor.multiplicity ?? 1);
  const factorSign = Number(x) - root < 0 && multiplicity % 2 === 1 ? -1 : 1;
  return sign * factorSign;
}, 1);

export const intervalFromSigns = (factors = [], relation = '>') => {
  const roots = [...new Set(factors.map((factor) => Number(factor.root)).filter(Number.isFinite))].sort((a, b) => a - b);
  const bounds = [-Infinity, ...roots, Infinity];
  const intervals = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const left = bounds[i];
    const right = bounds[i + 1];
    const probe = !Number.isFinite(left) ? right - 1 : !Number.isFinite(right) ? left + 1 : (left + right) / 2;
    const sign = signAt(factors, probe);
    const include = relation.includes('>') ? sign > 0 : sign < 0;
    if (include) intervals.push({ left, right });
  }
  return intervals;
};

export const formatNumber = (value, digits = 2) => Number.isFinite(Number(value)) ? round(Number(value), digits).toString() : '—';

// `Number('')` is 0 and `Number.isFinite(0)` is true, so comparing a raw input
// string with nearlyEqual scored an untouched box as correct whenever the
// expected value happened to be 0 — and a vertex at the origin is the default
// in several labs. Every tool that grades a typed number goes through here.
export const parseNumericAnswer = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export const matchesNumericAnswer = (value, expected, tolerance = 0.01) => {
  const parsed = parseNumericAnswer(value);
  if (parsed == null || !Number.isFinite(Number(expected))) return false;
  return Math.abs(parsed - Number(expected)) <= tolerance;
};

export const isBlankAnswer = (value) => parseNumericAnswer(value) == null;
