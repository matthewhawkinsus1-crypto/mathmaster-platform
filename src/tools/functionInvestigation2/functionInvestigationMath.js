import { evaluateFunctionSpec, nearlyEqual, round } from '../shared/toolMath.js';

export const INVESTIGATION_FAMILIES = [
  'linear', 'quadratic', 'absolute', 'cubic', 'cubeRoot',
  'squareRoot', 'exponential', 'logarithmic', 'rational',
];

export const FUNCTION_FAMILY_LABELS = {
  linear: 'Linear', quadratic: 'Quadratic', absolute: 'Absolute Value', cubic: 'Cubic',
  cubeRoot: 'Cube Root', squareRoot: 'Square Root', exponential: 'Exponential',
  logarithmic: 'Logarithmic', rational: 'Rational',
};

export const normalizeInvestigationSpec = (spec = {}) => ({
  type: INVESTIGATION_FAMILIES.includes(spec.type) ? spec.type : 'rational',
  a: Number(spec.a ?? 1),
  h: Number(spec.h ?? 0),
  k: Number(spec.k ?? 0),
  base: Number(spec.base ?? 2),
});

export const domainRangeForSpec = (spec = {}) => {
  const f = normalizeInvestigationSpec(spec);
  if (f.type === 'squareRoot') return { domainCode: 'xGteH', rangeCode: f.a > 0 ? 'yGteK' : 'yLteK' };
  if (f.type === 'logarithmic') return { domainCode: 'xGtH', rangeCode: 'allReal' };
  if (f.type === 'rational') return { domainCode: 'xNotH', rangeCode: 'yNotK' };
  if (f.type === 'quadratic' || f.type === 'absolute') return { domainCode: 'allReal', rangeCode: f.a > 0 ? 'yGteK' : 'yLteK' };
  if (f.type === 'exponential') return { domainCode: 'allReal', rangeCode: f.a > 0 ? 'yGtK' : 'yLtK' };
  return { domainCode: 'allReal', rangeCode: 'allReal' };
};

export const relationLabel = (code, spec = {}) => {
  const f = normalizeInvestigationSpec(spec);
  const labels = {
    allReal: 'all real numbers',
    xGteH: 'x ≥ ' + f.h,
    xGtH: 'x > ' + f.h,
    xNotH: 'x ≠ ' + f.h,
    yGteK: 'y ≥ ' + f.k,
    yLteK: 'y ≤ ' + f.k,
    yGtK: 'y > ' + f.k,
    yLtK: 'y < ' + f.k,
    yNotK: 'y ≠ ' + f.k,
  };
  return labels[code] || code;
};

export const investigationFeatures = (spec = {}) => {
  const f = normalizeInvestigationSpec(spec);
  let anchor = { label: 'reference point', point: [f.h, f.k], isOnGraph: true };
  if (f.type === 'linear') anchor = { label: 'y-intercept', point: [0, round(evaluateFunctionSpec(f, 0), 6)], isOnGraph: true };
  if (f.type === 'quadratic' || f.type === 'absolute') anchor = { label: 'vertex', point: [f.h, f.k], isOnGraph: true };
  if (f.type === 'squareRoot') anchor = { label: 'endpoint', point: [f.h, f.k], isOnGraph: true };
  if (f.type === 'cubic' || f.type === 'cubeRoot') anchor = { label: 'inflection point', point: [f.h, f.k], isOnGraph: true };
  if (f.type === 'exponential') anchor = { label: 'reference point', point: [f.h, round(f.k + f.a, 6)], isOnGraph: true };
  if (f.type === 'logarithmic') anchor = { label: 'reference point', point: [round(f.h + 1, 6), f.k], isOnGraph: true };
  if (f.type === 'rational') anchor = { label: 'asymptote intersection', point: [f.h, f.k], isOnGraph: false };
  return {
    type: f.type,
    anchor,
    verticalAsymptotes: ['logarithmic', 'rational'].includes(f.type) ? [f.h] : [],
    horizontalAsymptotes: ['exponential', 'rational'].includes(f.type) ? [f.k] : [],
    ...domainRangeForSpec(f),
  };
};

const uniqueSorted = (values) => [...new Set(values.filter(Number.isFinite).map((value) => round(value, 6)))].sort((a, b) => a - b);

export const interceptsForSpec = (spec = {}) => {
  const f = normalizeInvestigationSpec(spec);
  let roots = [];
  if (f.type === 'linear' && !nearlyEqual(f.a, 0)) roots = [f.h - f.k / f.a];
  if (f.type === 'quadratic') {
    const ratio = -f.k / f.a;
    if (ratio >= 0) roots = nearlyEqual(ratio, 0) ? [f.h] : [f.h - Math.sqrt(ratio), f.h + Math.sqrt(ratio)];
  }
  if (f.type === 'absolute') {
    const ratio = -f.k / f.a;
    if (ratio >= 0) roots = nearlyEqual(ratio, 0) ? [f.h] : [f.h - ratio, f.h + ratio];
  }
  if (f.type === 'squareRoot') {
    const ratio = -f.k / f.a;
    if (ratio >= 0) roots = [f.h + ratio ** 2];
  }
  if (f.type === 'cubic') roots = [f.h + Math.cbrt(-f.k / f.a)];
  if (f.type === 'cubeRoot') roots = [f.h + (-f.k / f.a) ** 3];
  if (f.type === 'exponential') {
    const ratio = -f.k / f.a;
    if (ratio > 0 && f.base > 0 && !nearlyEqual(f.base, 1)) roots = [f.h + Math.log(ratio) / Math.log(f.base)];
  }
  if (f.type === 'logarithmic' && f.base > 0 && !nearlyEqual(f.base, 1)) roots = [f.h + f.base ** (-f.k / f.a)];
  if (f.type === 'rational' && !nearlyEqual(f.k, 0)) roots = [f.h - f.a / f.k];
  const y = evaluateFunctionSpec(f, 0);
  return { x: uniqueSorted(roots), y: Number.isFinite(y) ? round(y, 6) : null };
};

export const parseNumericList = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || ['none', 'no', '∅', 'empty'].includes(text)) return [];
  const values = text.split(/[;,\s]+/).filter(Boolean).map(Number);
  return values.every(Number.isFinite) ? uniqueSorted(values) : null;
};

export const numericSetsMatch = (left, right, tolerance = 1e-4) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.every((value, index) => nearlyEqual(value, b[index], tolerance));
};

export const behaviorForSpec = (spec = {}) => {
  const f = normalizeInvestigationSpec(spec);
  if (f.type === 'quadratic' || f.type === 'absolute') return f.a > 0 ? 'minimum' : 'maximum';
  if (f.type === 'rational') return f.a > 0 ? 'decreasingBranches' : 'increasingBranches';
  let increasing = f.a > 0;
  if ((f.type === 'exponential' || f.type === 'logarithmic') && f.base > 0 && f.base < 1) increasing = !increasing;
  return increasing ? 'increasing' : 'decreasing';
};

export const behaviorLabel = (code) => ({
  minimum: 'has a minimum at its defining point',
  maximum: 'has a maximum at its defining point',
  increasing: 'increases across its natural domain',
  decreasing: 'decreases across its natural domain',
  increasingBranches: 'increases on each side of its vertical asymptote',
  decreasingBranches: 'decreases on each side of its vertical asymptote',
}[code] || code);

export const compareFunctionValues = (left, right, x, tolerance = 1e-6) => {
  const leftValue = evaluateFunctionSpec(normalizeInvestigationSpec(left), Number(x));
  const rightValue = evaluateFunctionSpec(normalizeInvestigationSpec(right), Number(x));
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return { relation: 'undefined', leftValue, rightValue };
  if (nearlyEqual(leftValue, rightValue, tolerance)) return { relation: 'equal', leftValue: round(leftValue, 6), rightValue: round(rightValue, 6) };
  return { relation: leftValue > rightValue ? 'left' : 'right', leftValue: round(leftValue, 6), rightValue: round(rightValue, 6) };
};
