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

export const normalizeTransformationSpec = (spec = {}, fallbackType = 'quadratic') => {
  const rawB = Number(spec.b ?? spec.inputScale ?? 1);
  return {
    type: TRANSFORMATION_FAMILIES.includes(spec.type) ? spec.type : fallbackType,
    a: Number(spec.a ?? 1),
    b: Number.isFinite(rawB) && !nearlyEqual(rawB, 0) ? rawB : 1,
    h: Number(spec.h ?? 0),
    k: Number(spec.k ?? 0),
    base: Number(spec.base ?? 2),
  };
};

export const evaluateParentFunction = (type, x, base = 2) =>
  evaluateFunctionSpec({ type, a: 1, h: 0, k: 0, base }, Number(x));

export const evaluateTransformedFunction = (spec, x) => {
  const normalized = normalizeTransformationSpec(spec, spec?.type || 'quadratic');
  const inside = normalized.b * (Number(x) - normalized.h);
  const parentValue = evaluateParentFunction(normalized.type, inside, normalized.base);
  return Number.isFinite(parentValue) ? normalized.a * parentValue + normalized.k : Number.NaN;
};

const pointCoordinates = (point) => (
  Array.isArray(point)
    ? [Number(point[0]), Number(point[1])]
    : [Number(point?.x), Number(point?.y)]
);

export const mapParentPoint = (point, spec = {}) => {
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const [x, y] = pointCoordinates(point);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [round(x / normalized.b + normalized.h, 6), round(normalized.a * y + normalized.k, 6)];
};

export const unmapTransformedPoint = (point, spec = {}) => {
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const [x, y] = pointCoordinates(point);
  if (!Number.isFinite(x) || !Number.isFinite(y) || nearlyEqual(normalized.a, 0) || nearlyEqual(normalized.b, 0)) return null;
  return [round(normalized.b * (x - normalized.h), 6), round((y - normalized.k) / normalized.a, 6)];
};

export const transformationDescriptor = (spec = {}) => {
  const normalized = normalizeTransformationSpec(spec, spec.type || 'quadratic');
  const verticalScale = Math.abs(normalized.a);
  const horizontalScale = 1 / Math.abs(normalized.b);
  return {
    reflection: normalized.a < 0,
    verticalScale,
    verticalScaleKind: nearlyEqual(verticalScale, 1) ? 'unchanged' : verticalScale > 1 ? 'stretch' : 'compression',
    horizontalReflection: normalized.b < 0,
    horizontalScale,
    horizontalScaleKind: nearlyEqual(horizontalScale, 1) ? 'unchanged' : horizontalScale > 1 ? 'stretch' : 'compression',
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

export const transformationGraphScore = (student = {}, target = {}, {
  xMin = -7,
  xMax = 7,
  samples = 81,
  tolerance = 0.02,
} = {}) => {
  let compared = 0;
  let matched = 0;
  for (let index = 0; index <= samples; index += 1) {
    const x = Number(xMin) + ((Number(xMax) - Number(xMin)) * index) / samples;
    const studentY = evaluateTransformedFunction(student, x);
    const targetY = evaluateTransformedFunction(target, x);
    const studentFinite = Number.isFinite(studentY);
    const targetFinite = Number.isFinite(targetY);
    if (!studentFinite && !targetFinite) continue;
    compared += 1;
    if (studentFinite && targetFinite && Math.abs(studentY - targetY) <= tolerance) matched += 1;
  }
  const score = compared ? matched / compared : 0;
  return { compared, matched, score, isCorrect: compared > 0 && score >= 0.999 };
};

export const transformationParameterScore = (student = {}, target = {}, tolerance = 1e-6) => {
  const checks = ['a', 'b', 'h', 'k'].map((key) => nearlyEqual(Number(student[key] ?? (key === 'b' ? 1 : undefined)), Number(target[key] ?? (key === 'b' ? 1 : undefined)), tolerance));
  return { checks, score: checks.filter(Boolean).length / checks.length, isCorrect: checks.every(Boolean) };
};

export const mappedPointIsCorrect = (studentPoint, parentPoint, spec, tolerance = 1e-6) => {
  const expected = mapParentPoint(parentPoint, spec);
  if (!expected || !Array.isArray(studentPoint) || studentPoint.length !== 2) return false;
  return nearlyEqual(studentPoint[0], expected[0], tolerance) && nearlyEqual(studentPoint[1], expected[1], tolerance);
};
