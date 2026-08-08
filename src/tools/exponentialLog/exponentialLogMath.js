import { nearlyEqual } from '../shared/toolMath.js';

export const isValidLogBase = (base) => Number.isFinite(Number(base)) && Number(base) > 0 && !nearlyEqual(Number(base), 1);

export const logBase = (value, base = 10) => {
  const x = Number(value); const b = Number(base);
  if (!isValidLogBase(b)) throw new Error('Logarithm base must be positive and not equal to 1.');
  if (!(x > 0)) return Number.NaN;
  return Math.log(x) / Math.log(b);
};

export const equivalentExpLogValues = ({ base = 2, exponent = 3 } = {}) => {
  const b = Number(base); const x = Number(exponent);
  if (!isValidLogBase(b) || !Number.isFinite(x)) throw new Error('Equivalent forms require a valid base and finite exponent.');
  const value = b ** x;
  return { base: b, exponent: x, value, logValue: logBase(value, b) };
};

export const solveExponentialLinearExponent = ({ base = 2, m = 1, c = 0, rhs = 1 } = {}) => {
  const b = Number(base); const M = Number(m); const C = Number(c); const R = Number(rhs);
  if (!isValidLogBase(b)) throw new Error('Exponential equation requires a valid base.');
  if (!Number.isFinite(M) || nearlyEqual(M, 0) || !Number.isFinite(C)) throw new Error('Exponent must have a finite nonzero x coefficient.');
  if (!(R > 0) || !Number.isFinite(R)) return { hasRealSolution: false, x: Number.NaN, exponentValue: Number.NaN };
  const exponentValue = logBase(R, b);
  return { hasRealSolution: true, x: (exponentValue - C) / M, exponentValue };
};

export const solveLogLinearArgument = ({ base = 2, m = 1, c = 0, result = 0 } = {}) => {
  const b = Number(base); const M = Number(m); const C = Number(c); const y = Number(result);
  if (!isValidLogBase(b)) throw new Error('Logarithmic equation requires a valid base.');
  if (!Number.isFinite(M) || nearlyEqual(M, 0) || !Number.isFinite(C) || !Number.isFinite(y)) throw new Error('Logarithmic equation parameters must be finite and the argument x coefficient nonzero.');
  const argumentValue = b ** y;
  const x = (argumentValue - C) / M;
  return { x, argumentValue, domainSatisfied: M * x + C > 0 };
};

export const normalizeExponentialSpec = (spec = {}) => {
  const normalized = {
    a: Number(spec.a ?? 1),
    base: Number(spec.base ?? 2),
    h: Number(spec.h ?? 0),
    k: Number(spec.k ?? 0),
  };
  if (![normalized.a, normalized.h, normalized.k].every(Number.isFinite) || nearlyEqual(normalized.a, 0)) throw new Error('Transformed exponential requires finite parameters and a nonzero vertical scale a.');
  if (!isValidLogBase(normalized.base)) throw new Error('Transformed exponential requires a valid base.');
  return normalized;
};

export const transformedExponentialValue = (spec = {}, x = 0) => {
  const s = normalizeExponentialSpec(spec);
  return s.a * s.base ** (Number(x) - s.h) + s.k;
};

export const inverseLogValue = (spec = {}, y = 1) => {
  const s = normalizeExponentialSpec(spec);
  const ratio = (Number(y) - s.k) / s.a;
  if (!(ratio > 0)) return Number.NaN;
  return s.h + logBase(ratio, s.base);
};

export const inversePairFeatures = (spec = {}) => {
  const s = normalizeExponentialSpec(spec);
  const above = s.a > 0;
  return {
    exponentialDomain: 'all real numbers',
    exponentialRangeSide: above ? 'greater' : 'less',
    exponentialRangeBoundary: s.k,
    exponentialHorizontalAsymptote: s.k,
    logarithmDomainSide: above ? 'greater' : 'less',
    logarithmDomainBoundary: s.k,
    logarithmVerticalAsymptote: s.k,
    logarithmRange: 'all real numbers',
  };
};

export const inversePoint = (spec = {}, x = 0) => {
  const y = transformedExponentialValue(spec, x);
  return { exponential: [Number(x), y], logarithm: [y, Number(x)] };
};

export const composeInverseAfterForward = (spec = {}, x = 0) => inverseLogValue(spec, transformedExponentialValue(spec, x));

export const composeForwardAfterInverse = (spec = {}, y = 1) => {
  const inverseInput = inverseLogValue(spec, y);
  return Number.isFinite(inverseInput) ? transformedExponentialValue(spec, inverseInput) : Number.NaN;
};
