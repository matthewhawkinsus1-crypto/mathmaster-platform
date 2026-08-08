import { evaluateFunctionSpec, nearlyEqual, round } from '../shared/toolMath.js';

export const TRANSFORMATION_FAMILIES = [
  'linear', 'quadratic', 'absolute', 'cubic', 'cubeRoot',
  'squareRoot', 'exponential', 'logarithmic', 'rational',
];

export const TRANSFORMATION_FAMILY_LABELS = {
  linear: 'Linear', quadratic: 'Quadratic', absolute: 'Absolute Value', cubic: 'Cubic',
  cubeRoot: 'Cube Root', squareRoot: 'Square Root', exponential: 'Exponential',
  logarithmic: 'Logarithmic', rational: 'Rational',
};

export const normalizeTransformationSpec = (spec = {}, fallbackType = 'quadratic') => ({
  type: TRANSFORMATION_FAMILIES.includes(spec.type) ? spec.type : fallbackType,
  a: Number(spec.a ?? 1),
  h: Number(spec.h ?? 0),
  k: Number(spec.k ?? 0),
  base: Number(spec.base ?? 2),
});

export const evaluateParentFunction = (type, x, base = 2) =>
  evaluateFunctionSpec({ type, a: 1, h: 0, k: 0, base }, Number(x));

export const evaluateTransformedFunction = (spec, x) =>
  evaluateFunctionSpec(normalizeTransformationSpec(spec, spec?.type || 'quadratic'), Number(x));

export const mapParentPoint = (point, spec = {}) => {
  if (!Array.isArray(point) || point.length !== 2) return null;
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const [x, y] = point.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [round(x + normalized.h, 6), round(normalized.a * y + normalized.k, 6)];
};

export const unmapTransformedPoint = (point, spec = {}) => {
  if (!Array.isArray(point) || point.length !== 2) return null;
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const [x, y] = point.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y) || nearlyEqual(normalized.a, 0)) return null;
  return [round(x - normalized.h, 6), round((y - normalized.k) / normalized.a, 6)];
};

export const transformationDescriptor = (spec = {}) => {
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const scale = Math.abs(normalized.a);
  return {
    reflection: normalized.a < 0,
    verticalScale: scale,
    verticalScaleKind: nearlyEqual(scale, 1) ? 'unchanged' : scale > 1 ? 'stretch' : 'compression',
    horizontalDirection: nearlyEqual(normalized.h, 0) ? 'none' : normalized.h > 0 ? 'right' : 'left',
    horizontalDistance: Math.abs(normalized.h),
    verticalDirection: nearlyEqual(normalized.k, 0) ? 'none' : normalized.k > 0 ? 'up' : 'down',
    verticalDistance: Math.abs(normalized.k),
  };
};

const parentAnchorFor = (type) => {
  if (type === 'exponential') return { label: 'reference point', point: [0, 1], isOnGraph: true };
  if (type === 'logarithmic') return { label: 'reference point', point: [1, 0], isOnGraph: true };
  if (type === 'rational') return { label: 'asymptote intersection', point: [0, 0], isOnGraph: false };
  if (type === 'quadratic' || type === 'absolute') return { label: 'vertex', point: [0, 0], isOnGraph: true };
  if (type === 'squareRoot') return { label: 'endpoint', point: [0, 0], isOnGraph: true };
  if (type === 'cubic' || type === 'cubeRoot') return { label: 'inflection point', point: [0, 0], isOnGraph: true };
  return { label: 'reference point', point: [0, 0], isOnGraph: true };
};

export const transformedAnchor = (spec = {}) => {
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const parent = parentAnchorFor(normalized.type);
  return {
    label: parent.label,
    parentPoint: parent.point,
    point: mapParentPoint(parent.point, normalized),
    isOnGraph: parent.isOnGraph,
  };
};

export const transformationParameterScore = (student = {}, target = {}, tolerance = 1e-6) => {
  const checks = ['a', 'h', 'k'].map((key) => nearlyEqual(Number(student[key]), Number(target[key]), tolerance));
  return { checks, score: checks.filter(Boolean).length / checks.length, isCorrect: checks.every(Boolean) };
};

export const mappedPointIsCorrect = (studentPoint, parentPoint, spec, tolerance = 1e-6) => {
  const expected = mapParentPoint(parentPoint, spec);
  if (!expected || !Array.isArray(studentPoint) || studentPoint.length !== 2) return false;
  return nearlyEqual(studentPoint[0], expected[0], tolerance) && nearlyEqual(studentPoint[1], expected[1], tolerance);
};
