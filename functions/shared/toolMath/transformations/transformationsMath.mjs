import { evaluateFunctionSpec, nearlyEqual, parseNumericAnswer, round } from '../shared/toolMath.mjs';

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

/*
 * ONE GRAPH, MANY PARAMETER SETS.
 *
 * y = a·f(b(x − h)) + k does not always fix a, b, h, k: 2·2^(x−1) is 2^x,
 * |2x| is 2|x|, (2x)² is 4x², a line's h and k slide along it, and
 * log(2x) is log(x) + log 2. equivalentParameters rewrites the student's
 * function with the target's own b (and, where the family lets h trade
 * away, the target's own h) — the same function, exactly:
 *
 *   linear       slope m = ab, intercept c = k − abh → a = m/b, k = c + m·h
 *   quadratic    a(b/b')²         absolute     a|b/b'|
 *   cubic        a(b/b')³         cubeRoot     a∛(b/b')
 *   squareRoot   a√(b/b')         rational     a·b'/b
 *   exponential  a·base^(b(h' − h)), keeping its own b (the graph fixes it)
 *   logarithmic  k + a·log|b/b'|
 *
 * (b', h' the target's). A square root or logarithm whose b has the other
 * sign is the mirror image, and a = 0 (a constant, whatever b and h are) or a
 * base that is not a positive number other than 1 is not rewritten (null):
 * those are compared parameter by parameter only.
 *
 * The rewritten set is then compared with the target's own parameters at the
 * caller's tolerance, so the tolerance stays in the question's own units: a
 * set is accepted only when it draws a function that the question's own form,
 * within that tolerance, also draws — and every exact rewrite is accepted.
 * (Comparing a canonical coefficient such as ab² instead would scale the
 * tolerance on a by 1/b², and pass graphs the old check rejected.)
 */
const equivalentParameters = (student, target) => {
  const { type, base } = target;
  const { a, b, h, k } = student;
  if (![a, b, h, k, target.a, target.b, target.h].every(Number.isFinite)) return null;
  if ([a, b, target.a, target.b].some((value) => nearlyEqual(value, 0, 1e-12))) return null;
  const ratio = b / target.b;
  const own = { a, b: target.b, h, k };
  if (type === 'linear') return { a: (a * b) / target.b, b: target.b, h: target.h, k: k - a * b * h + a * b * target.h };
  if (type === 'quadratic') return { ...own, a: a * ratio ** 2 };
  if (type === 'absolute') return { ...own, a: a * Math.abs(ratio) };
  if (type === 'cubic') return { ...own, a: a * ratio ** 3 };
  if (type === 'cubeRoot') return { ...own, a: a * Math.cbrt(ratio) };
  if (type === 'rational') return { ...own, a: a / ratio };
  if (type === 'squareRoot') return ratio > 0 ? { ...own, a: a * Math.sqrt(ratio) } : null;
  if (!(base > 0) || nearlyEqual(base, 1, 1e-12)) return null;
  if (type === 'exponential') return { a: a * base ** (b * (target.h - h)), b, h: target.h, k };
  if (type === 'logarithmic') return ratio > 0 ? { ...own, k: k + (a * Math.log(ratio)) / Math.log(base) } : null;
  return null;
};

/** The student's a, b, h, k (b defaults to 1) rewritten in the target's form, or null. */
const rewrittenForTarget = (student, target) => {
  if (!TRANSFORMATION_FAMILIES.includes(target?.type)) return null;
  const [a, b, h, k] = ['a', 'b', 'h', 'k'].map((key) => Number(student?.[key] ?? (key === 'b' ? 1 : undefined)));
  const own = normalizeTransformationSpec(target, target.type);
  const rewritten = equivalentParameters({ a, b, h, k }, own);
  return rewritten && { rewritten, own };
};

/**
 * Whether `student` (a, b, h, k — b defaults to 1) draws the same function as
 * `target` in the target's family and base: rewritten in the target's form,
 * every parameter is within `tolerance` of the target's own. A target that
 * names no supported family compares nothing (false).
 */
export const sameTransformedFunction = (student = {}, target = {}, tolerance = 1e-6) => {
  const pair = rewrittenForTarget(student, target);
  return Boolean(pair) && ['a', 'b', 'h', 'k'].every((key) => nearlyEqual(pair.rewritten[key], pair.own[key], tolerance));
};

/*
 * identify: each of a, b, h, k is a check against the drawn function's own
 * parameters — unless the student's parameters draw that same function
 * (sameTransformedFunction), in which case every check holds: the graph is all
 * the student was shown, and it does not single out the question's own set.
 */
export const transformationParameterScore = (student = {}, target = {}, tolerance = 1e-6) => {
  const ownChecks = ['a', 'b', 'h', 'k'].map((key) => nearlyEqual(Number(student[key] ?? (key === 'b' ? 1 : undefined)), Number(target[key] ?? (key === 'b' ? 1 : undefined)), tolerance));
  const checks = ownChecks.every(Boolean) || !sameTransformedFunction(student, target, tolerance) ? ownChecks : ownChecks.map(() => true);
  return { checks, score: checks.filter(Boolean).length / checks.length, isCorrect: checks.every(Boolean) };
};

/*
 * describe: the spec a full set of the lab's ten descriptions stands for —
 * a = ±|a| (reflection across the x-axis), b = ±1/(horizontal factor)
 * (reflection across the y-axis), h = ±distance (right/left), k = ±distance
 * (up/down) — in `target`'s family and base. Null when any description is
 * missing or unreadable, a factor is not positive, a distance is negative, or
 * a choice contradicts its own number (a stretch by a factor ≤ 1, "None" with
 * a nonzero distance, ...), judged at `tolerance`.
 */
export const describedTransformationSpec = (description = {}, target = {}, tolerance = 1e-6) => {
  const d = description && typeof description === 'object' ? description : {};
  const number = (value) => (typeof value === 'string' || typeof value === 'number' ? parseNumericAnswer(String(value)) : null);
  const sign = (choice) => (choice === 'yes' ? -1 : choice === 'no' ? 1 : null);
  const scaleFits = (kind, factor) => (kind === 'unchanged' ? nearlyEqual(factor, 1, tolerance)
    : kind === 'stretch' ? factor > 1 : kind === 'compression' ? factor < 1 : false);
  const shift = (direction, distance, positive, negative) => {
    if (direction === 'none') return nearlyEqual(distance, 0, tolerance) ? 0 : null;
    if (direction !== positive && direction !== negative) return null;
    return distance > 0 ? (direction === positive ? distance : -distance) : null;
  };
  const verticalFactor = number(d.scaleFactor);
  const horizontalFactor = number(d.horizontalScaleFactor);
  const horizontalDistance = number(d.horizontalDistance);
  const verticalDistance = number(d.verticalDistance);
  const aSign = sign(d.reflection);
  const bSign = sign(d.horizontalReflection);
  if ([verticalFactor, horizontalFactor, horizontalDistance, verticalDistance].some((value) => value == null)) return null;
  if (aSign == null || bSign == null || !(verticalFactor > 0) || !(horizontalFactor > 0)) return null;
  if (horizontalDistance < 0 || verticalDistance < 0) return null;
  if (!scaleFits(d.scaleKind, verticalFactor) || !scaleFits(d.horizontalScaleKind, horizontalFactor)) return null;
  const h = shift(d.horizontalDirection, horizontalDistance, 'right', 'left');
  const k = shift(d.verticalDirection, verticalDistance, 'up', 'down');
  if (h == null || k == null) return null;
  return { type: target?.type, a: aSign * verticalFactor, b: bSign / horizontalFactor, h, k, base: Number(target?.base ?? 2) };
};

/** describe: whether the ten descriptions describe the same function as `target`. */
// Compared in describe's own units — the vertical factor |a|, the horizontal
// factor 1/|b|, h, k, and both reflections — as the describe grader compares
// them, so a description is never accepted that is further from the target's
// own than the per-field check allows.
export const descriptionDrawsSameFunction = (description, target = {}, tolerance = 1e-6) => {
  const described = describedTransformationSpec(description, target, tolerance);
  const pair = described && rewrittenForTarget(described, target);
  if (!pair) return false;
  const { rewritten, own } = pair;
  return Math.sign(rewritten.a) === Math.sign(own.a) && Math.sign(rewritten.b) === Math.sign(own.b)
    && nearlyEqual(Math.abs(rewritten.a), Math.abs(own.a), tolerance)
    && nearlyEqual(1 / Math.abs(rewritten.b), 1 / Math.abs(own.b), tolerance)
    && nearlyEqual(rewritten.h, own.h, tolerance) && nearlyEqual(rewritten.k, own.k, tolerance);
};

export const mappedPointIsCorrect = (studentPoint, parentPoint, spec, tolerance = 1e-6) => {
  const expected = mapParentPoint(parentPoint, spec);
  if (!expected || !Array.isArray(studentPoint) || studentPoint.length !== 2) return false;
  return nearlyEqual(studentPoint[0], expected[0], tolerance) && nearlyEqual(studentPoint[1], expected[1], tolerance);
};

/** Every source point carried through the transformation, in source order (unmappable points dropped). */
export const transformedSourcePoints = (sourcePoints, spec) => (Array.isArray(sourcePoints) ? sourcePoints : [])
  .map((point) => mapParentPoint(point, spec))
  .filter(Boolean);

/*
 * HOW THE TRANSFORMATIONS LAB READS ITS QUESTION — ONE DEFINITION.
 *
 * TransformationsLab.jsx draws from this and the shared grader
 * (serverGrading/tools/transformationsLab.mjs) marks from it, so the graph a
 * student matches, the function they read and the point they map are, by
 * construction, the ones the server grades against:
 *
 *   family             `family`, else `function.type`, else `type`, when it
 *                      names a supported family; otherwise quadratic
 *   targetSpec         the match target: { type: family, ...target }
 *   investigationSpec  every other mode: { type: family, ...(function || target) }
 *   graphBounds        the drawn window (and match mode's sampling window)
 *   showB              whether the lab shows a `b` box at all
 *   startingValues     the parameter boxes' starting text (`initial`, else 1, 1, 0, 0)
 *   anchor / parentPoint / sourcePoints   the pointMap, anchor and plotTransform givens
 */
export const resolveTransformationsQuestion = (question = {}) => {
  const source = question && typeof question === 'object' ? question : {};
  const requestedFamily = source.family || source.function?.type || source.type;
  const family = TRANSFORMATION_FAMILIES.includes(requestedFamily) ? requestedFamily : 'quadratic';
  const targetSpec = normalizeTransformationSpec({ type: family, ...source.target }, family);
  const investigationSpec = normalizeTransformationSpec({ type: family, ...(source.function || source.target) }, family);
  const anchor = transformedAnchor(investigationSpec);
  return {
    family,
    targetSpec,
    investigationSpec,
    graphBounds: source.graphBounds || { xMin: -7, xMax: 7, yMin: -7, yMax: 9 },
    showB: source.includeHorizontalScale === true
      || source.target?.b != null
      || source.function?.b != null
      || source.initial?.b != null,
    startingValues: {
      a: String(source.initial?.a ?? 1),
      b: String(source.initial?.b ?? 1),
      h: String(source.initial?.h ?? 0),
      k: String(source.initial?.k ?? 0),
    },
    anchor,
    parentPoint: source.parentPoint || anchor.parentPoint,
    sourcePoints: Array.isArray(source.sourcePoints) ? source.sourcePoints : [],
  };
};

/**
 * The graph a student's parameter boxes draw (and match mode grades): the
 * lab's family, the target's base, and the boxes' text read with Number().
 */
export const studentTransformationSpec = ({ family, base }, { a, b, h, k } = {}) => (
  normalizeTransformationSpec({ type: family, a, b, h, k, base }, family)
);
