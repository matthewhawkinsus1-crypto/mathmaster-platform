const EPS = 1e-9;

export const evaluateSpecWithDomain = (spec = {}, x) => {
  const value = Number(x);
  if (!Number.isFinite(value)) return Number.NaN;
  if (spec.domain?.min != null && value < Number(spec.domain.min) - EPS) return Number.NaN;
  if (spec.domain?.max != null && value > Number(spec.domain.max) + EPS) return Number.NaN;

  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (type === 'linear') return a * (value - h) + k;
  if (type === 'quadratic') return a * (value - h) ** 2 + k;
  if (type === 'absolute') return a * Math.abs(value - h) + k;
  if (type === 'cubic') return a * (value - h) ** 3 + k;
  if (type === 'squareRoot') return value < h ? Number.NaN : a * Math.sqrt(value - h) + k;
  if (type === 'exponential') return base > 0 && base !== 1 ? a * base ** (value - h) + k : Number.NaN;
  if (type === 'logarithmic') return value > h && base > 0 && base !== 1 ? a * (Math.log(value - h) / Math.log(base)) + k : Number.NaN;
  if (type === 'rational') return Math.abs(value - h) < EPS ? Number.NaN : a / (value - h) + k;
  return Number.NaN;
};

export const inverseValue = (spec = {}, y) => {
  const value = Number(y);
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (!Number.isFinite(value) || Math.abs(a) < EPS) return Number.NaN;

  if (type === 'linear') return ((value - k) / a) + h;
  if (type === 'exponential') {
    const ratio = (value - k) / a;
    return ratio > 0 && base > 0 && base !== 1 ? h + Math.log(ratio) / Math.log(base) : Number.NaN;
  }
  if (type === 'logarithmic') {
    return base > 0 && base !== 1 ? h + base ** ((value - k) / a) : Number.NaN;
  }
  if (type === 'quadratic') {
    const ratio = (value - k) / a;
    if (ratio < -EPS) return Number.NaN;
    const branch = spec.inverseBranch === 'left' || spec.domain?.max === h ? -1 : 1;
    return h + branch * Math.sqrt(Math.max(0, ratio));
  }
  if (type === 'squareRoot') {
    const rootOutput = (value - k) / a;
    if (rootOutput < -EPS) return Number.NaN;
    return h + rootOutput ** 2;
  }
  return Number.NaN;
};

export const hasFunctionalInverse = (spec = {}) => {
  const type = spec.type || 'linear';
  if (type === 'linear') return Math.abs(Number(spec.a ?? 1)) > EPS;
  if (['exponential', 'logarithmic', 'squareRoot'].includes(type)) return Math.abs(Number(spec.a ?? 1)) > EPS;
  if (type === 'quadratic') {
    const h = Number(spec.h ?? 0);
    return spec.inverseBranch === 'left' || spec.inverseBranch === 'right' || Number(spec.domain?.min) === h || Number(spec.domain?.max) === h;
  }
  return false;
};

export const composeValue = (outer, inner, x) => {
  const innerValue = evaluateSpecWithDomain(inner, x);
  return Number.isFinite(innerValue) ? evaluateSpecWithDomain(outer, innerValue) : Number.NaN;
};

export const functionLabel = (spec = {}, name = 'f') => {
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  const shifted = (variable = 'x') => h === 0 ? variable : `(${variable} ${h > 0 ? '−' : '+'} ${Math.abs(h)})`;
  const tail = k === 0 ? '' : ` ${k > 0 ? '+' : '−'} ${Math.abs(k)}`;
  if (type === 'linear') return `${name}(x) = ${a}${shifted()}${tail}`;
  if (type === 'quadratic') return `${name}(x) = ${a}${shifted()}²${tail}`;
  if (type === 'exponential') return `${name}(x) = ${a}·${base}^${shifted()}${tail}`;
  if (type === 'logarithmic') return `${name}(x) = ${a}·log_${base}${shifted()}${tail}`;
  if (type === 'squareRoot') return `${name}(x) = ${a}√${shifted()}${tail}`;
  return `${name}(x) = ${type}`;
};

export const restrictionDescription = (spec = {}) => {
  if ((spec.type || 'linear') !== 'quadratic') return 'No special domain restriction is required for this function family.';
  const h = Number(spec.h ?? 0);
  if (spec.inverseBranch === 'left' || Number(spec.domain?.max) === h) return `Restrict the original domain to x ≤ ${h}.`;
  if (spec.inverseBranch === 'right' || Number(spec.domain?.min) === h) return `Restrict the original domain to x ≥ ${h}.`;
  return 'A quadratic must be restricted to one side of its vertex before its inverse is a function.';
};
