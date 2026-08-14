const MIN_USABLE_SNAP = 0.05;
const REACHABLE_SAMPLE_TARGET = 4;
const EXACT_SNAP_EPSILON = 1e-6;
const FRIENDLY_SNAP_STEPS = [1, 0.5, 0.25, 0.2, 0.125, 0.1, 0.05];

export const MAGNETIC_POINT_SNAP_PIXELS = 18;
export const MAGNETIC_AMBIGUITY_PIXELS = 4;

export const positiveStep = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export const snapValue = (value, step) => Number((Math.round(value / step) * step).toFixed(6));

export const snapError = (point, step) => {
  if (!Array.isArray(point) || point.length !== 2) return 0;
  const dx = Number(point[0]) - snapValue(Number(point[0]), step);
  const dy = Number(point[1]) - snapValue(Number(point[1]), step);
  return Math.hypot(dx, dy);
};

const fixedPointsReachExactly = (points, step) =>
  points.every((point) => snapError(point, step) <= EXACT_SNAP_EPSILON);

/**
 * Resolve the FREE-PLACEMENT lattice. This is deliberately separate from the
 * visible grid and from magnetic targets. A clean graph can display unit grid
 * lines while still accepting tenths, and a student-known target may magnetize
 * to an exact value without drawing a tenths grid across the whole plane.
 */
export const resolveReachableSnapStep = (requestedStep, tasks = [], curveSamples = []) => {
  const authored = Number(requestedStep);
  const authorWasExplicit = Number.isFinite(authored) && authored > 0;
  let step = positiveStep(requestedStep, 0.5);

  const chooses = tasks.some((task) => task?.studentChoosesX);
  if (chooses && !authorWasExplicit) step = Math.min(step, 0.25);

  const expectedPoints = tasks.map((task) => task?.expected).filter(Array.isArray);
  if (expectedPoints.length && !fixedPointsReachExactly(expectedPoints, step)) {
    const candidates = [...new Set([
      step,
      ...FRIENDLY_SNAP_STEPS.filter((candidate) => candidate <= step + EXACT_SNAP_EPSILON),
    ])].sort((a, b) => b - a);
    const exactCandidate = candidates.find((candidate) =>
      candidate >= MIN_USABLE_SNAP && fixedPointsReachExactly(expectedPoints, candidate));

    if (exactCandidate) {
      step = exactCandidate;
    } else {
      while (step > MIN_USABLE_SNAP && expectedPoints.some((point) => snapError(point, step) > 0.2)) step /= 2;
    }
  }

  if (chooses && expectedPoints.length === 0 && curveSamples.length) {
    const reachable = (candidate) => curveSamples.filter((point) => snapError(point, candidate) <= 0.2).length;
    while (step > MIN_USABLE_SNAP && reachable(step) < Math.min(REACHABLE_SAMPLE_TARGET, curveSamples.length)) {
      step /= 2;
    }
  }

  return Math.max(MIN_USABLE_SNAP, step);
};

const normalizePoint = (value) => {
  if (Array.isArray(value) && value.length >= 2) {
    const point = [Number(value[0]), Number(value[1])];
    return point.every(Number.isFinite) ? point : null;
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.point)) return normalizePoint(value.point);
    const point = [Number(value.x), Number(value.y)];
    return point.every(Number.isFinite) ? point : null;
  }
  return null;
};

/**
 * Magnetic targets are OPT-IN student-known coordinates. We intentionally do
 * not derive them from task.expected or an answer key. The caller must pass a
 * target only after the coordinate is already visible to the student or was
 * produced by the student's own completed/validated prior stage.
 */
export const normalizeMagneticSnapTargets = (targets = [], tasks = []) => {
  if (!Array.isArray(targets)) return [];
  return targets.map((entry, index) => {
    const point = normalizePoint(entry);
    if (!point) return null;
    const explicitTaskId = entry && typeof entry === 'object' && !Array.isArray(entry)
      ? String(entry.taskId || '') || null
      : null;
    const matchingTask = tasks.find((task) => Array.isArray(task?.expected)
      && Math.abs(Number(task.expected[0]) - point[0]) <= EXACT_SNAP_EPSILON
      && Math.abs(Number(task.expected[1]) - point[1]) <= EXACT_SNAP_EPSILON);
    return {
      taskId: explicitTaskId || matchingTask?.id || tasks[index]?.id || null,
      point,
      source: entry && typeof entry === 'object' && !Array.isArray(entry)
        ? String(entry.source || 'student-known')
        : 'student-known',
    };
  }).filter(Boolean);
};

/**
 * Find a nearby magnetic target using CSS-pixel distance, so the hit area
 * feels consistent on a phone, Chromebook and desktop even though the SVG
 * viewBox is always 760x540. Ambiguous targets do not snap.
 */
export const findMagneticSnapTarget = ({
  taskId,
  rawScreenPoint,
  targets = [],
  toScreenPoint,
  cssScaleX = 1,
  cssScaleY = 1,
  radiusPixels = MAGNETIC_POINT_SNAP_PIXELS,
  ambiguityPixels = MAGNETIC_AMBIGUITY_PIXELS,
}) => {
  if (!Array.isArray(rawScreenPoint) || rawScreenPoint.length !== 2 || typeof toScreenPoint !== 'function') return null;
  const eligible = targets.filter((target) => !target.taskId || !taskId || target.taskId === taskId);
  if (!eligible.length) return null;

  const ranked = eligible.map((target) => {
    const targetScreen = toScreenPoint(target.point);
    const dx = (Number(rawScreenPoint[0]) - Number(targetScreen[0])) * cssScaleX;
    const dy = (Number(rawScreenPoint[1]) - Number(targetScreen[1])) * cssScaleY;
    return { ...target, distancePixels: Math.hypot(dx, dy) };
  }).filter((target) => Number.isFinite(target.distancePixels))
    .sort((a, b) => a.distancePixels - b.distancePixels);

  const nearest = ranked[0];
  if (!nearest || nearest.distancePixels > radiusPixels) return null;
  const second = ranked[1];
  if (second && second.distancePixels <= radiusPixels && Math.abs(second.distancePixels - nearest.distancePixels) < ambiguityPixels) return null;
  return nearest;
};

export const buildStudentTableMagneticTargets = (points = []) =>
  (Array.isArray(points) ? points : []).map((point) => ({
    point: normalizePoint(point),
    source: 'validated-table',
  })).filter((entry) => Array.isArray(entry.point));

export const graphPrecisionConstants = Object.freeze({
  MIN_USABLE_SNAP,
  EXACT_SNAP_EPSILON,
  FRIENDLY_SNAP_STEPS: [...FRIENDLY_SNAP_STEPS],
});
