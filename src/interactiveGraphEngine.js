import {
  buildGraphWindow,
  evaluateGraphFunction,
  getEffectiveDomain,
  getGraphKeyPoint,
  getSuggestedGraphPoints,
} from './functionGraphUtils.js';

const round = (value, places = 6) => Number(Number(value).toFixed(places));
export const pointDistance = (first, second) => Math.hypot(Number(first[0]) - Number(second[0]), Number(first[1]) - Number(second[1]));

const reorderWithKeyInMiddle = (points, keyPoint) => {
  const copy = [...points];
  let keyIndex = copy.findIndex((point) => pointDistance(point, keyPoint) < 1e-5);
  if (keyIndex < 0) {
    copy.splice(Math.min(2, copy.length), 0, keyPoint);
    keyIndex = Math.min(2, copy.length - 1);
  }
  const [key] = copy.splice(keyIndex, 1);
  const output = copy.slice(0, 4);
  output.splice(2, 0, key);
  return output.slice(0, 5);
};

export const buildInteractivePointTasks = (spec, options = {}) => {
  const keyPoint = getGraphKeyPoint(spec);
  const suggested = Array.isArray(options.points) && options.points.length ? options.points : getSuggestedGraphPoints(spec);
  const studentChoosesX = Boolean(options.studentChoosesX || options.chooseXValues);
  const tasks = [];

  if (spec.type === 'rational') {
    tasks.push({ id: 'point-center', label: 'Center', role: 'center', x: round(keyPoint[0]), expected: keyPoint.map((value) => round(value)), lockedX: true });
    suggested.slice(0, 4).forEach((point, index) => tasks.push({
      id: `point-${index + 1}`,
      label: `P${index + 1}`,
      role: 'point',
      x: studentChoosesX ? null : round(point[0]),
      expected: studentChoosesX ? null : point.map((value) => round(value)),
      studentChoosesX,
    }));
  } else {
    reorderWithKeyInMiddle(suggested, keyPoint).forEach((point, index) => {
      const isKey = index === 2 || pointDistance(point, keyPoint) < 1e-5;
      tasks.push({
        id: isKey ? 'point-key' : `point-${index + 1}`,
        label: isKey ? 'Center / Key Point' : `P${index + 1}`,
        role: isKey ? 'key' : 'point',
        x: studentChoosesX && !isKey ? null : round(point[0]),
        expected: studentChoosesX && !isKey ? null : point.map((value) => round(value)),
        lockedX: isKey,
        studentChoosesX: studentChoosesX && !isKey,
      });
    });
  }

  const includeUndefinedChecks = options.includeUndefinedChecks !== false;
  if (includeUndefinedChecks && ['squareRoot', 'logarithmic'].includes(spec.type)) {
    const h = Number(spec.h ?? 0);
    const probes = spec.type === 'squareRoot' ? [h - 1, h - 4] : [h, h - 1];
    probes.slice(0, Number(options.undefinedCount ?? 1)).forEach((x, index) => tasks.push({ id: `undefined-${index + 1}`, label: `Undefined ${index + 1}`, role: 'undefined', x: round(x), expected: 'undefined', lockedX: true }));
  }
  return tasks;
};

export const buildInteractiveGraphWindow = (spec, tasks, graph = {}) => {
  const explicitBounds = ['xMin', 'xMax', 'yMin', 'yMax'].every((key) => Number.isFinite(Number(graph[key])));
  if (explicitBounds) return graph;
  const fixedPoints = tasks.filter((task) => Array.isArray(task.expected)).map((task) => task.expected);
  const studentSelectsOuterValues = tasks.some((task) => task.studentChoosesX);
  const anticipatedPoints = studentSelectsOuterValues ? getSuggestedGraphPoints(spec) : [];
  const points = [...fixedPoints, ...anticipatedPoints];
  return { ...buildGraphWindow(spec, points.length ? points : getSuggestedGraphPoints(spec)), ...graph };
};

export const resolveTaskExpected = (task, spec, chosenXValues = {}) => {
  if (task.expected === 'undefined') return 'undefined';
  if (Array.isArray(task.expected)) return task.expected;
  const x = Number(chosenXValues[task.id]);
  if (!Number.isFinite(x)) return null;
  const y = evaluateGraphFunction(spec, x);
  return Number.isFinite(y) ? [round(x), round(y)] : 'undefined';
};

export const gradePointPlacements = (tasks, placements, spec, chosenXValues = {}, tolerance = 0.26) => {
  const parts = tasks.map((task) => {
    const expected = resolveTaskExpected(task, spec, chosenXValues);
    const placement = placements[task.id];
    const isComplete = placement === 'undefined' || Array.isArray(placement);
    const dynamicValueIsOutsideDomain = task.studentChoosesX && expected === 'undefined';
    const isCorrect = dynamicValueIsOutsideDomain
      ? false
      : expected === 'undefined'
        ? placement === 'undefined'
        : Array.isArray(expected) && Array.isArray(placement) && pointDistance(placement, expected) <= tolerance;
    return { id: task.id, label: task.label, isComplete, isCorrect, response: placement === 'undefined' ? 'Undefined' : Array.isArray(placement) ? `(${placement[0]}, ${placement[1]})` : '' };
  });

  const chosenXs = tasks.filter((task) => task.studentChoosesX).map((task) => Number(chosenXValues[task.id])).filter(Number.isFinite);
  const dynamicParts = parts.filter((part) => tasks.find((task) => task.id === part.id)?.studentChoosesX);
  const uniqueXs = new Set(chosenXs.map((value) => round(value, 5))).size === chosenXs.length;
  const centerX = Number(spec.h ?? getGraphKeyPoint(spec)?.[0] ?? 0);
  const requiresBothSides = ['absolute', 'quadratic', 'cubic', 'cubeRoot', 'rational'].includes(spec.type);
  const leftCount = chosenXs.filter((value) => value < centerX).length;
  const rightCount = chosenXs.filter((value) => value > centerX).length;
  const balancedAroundCenter = !requiresBothSides || (leftCount >= 2 && rightCount >= 2);
  if (!uniqueXs || !balancedAroundCenter) dynamicParts.forEach((part) => { part.isCorrect = false; });
  return parts;
};

export const placementsMatchTasks = (tasks, placements, tolerance = 0.26, spec = {}, chosenXValues = {}) => gradePointPlacements(tasks, placements, spec, chosenXValues, tolerance).every((part) => part.isComplete && part.isCorrect);

export const sampleVisibleFunctionPaths = (spec, window, sampleCount = 560) => {
  const paths = [];
  let current = [];
  const xSpan = window.xMax - window.xMin;
  const ySpan = window.yMax - window.yMin;
  const xInset = xSpan * 0.045;
  const yInset = ySpan * 0.055;
  const visibleMinX = window.xMin + xInset;
  const visibleMaxX = window.xMax - xInset;
  const visibleMinY = window.yMin + yInset;
  const visibleMaxY = window.yMax - yInset;

  for (let index = 0; index <= sampleCount; index += 1) {
    const x = visibleMinX + (index / sampleCount) * (visibleMaxX - visibleMinX);
    const y = evaluateGraphFunction(spec, x);
    const visible = Number.isFinite(y) && y >= visibleMinY && y <= visibleMaxY;
    if (!visible) {
      if (current.length > 1) paths.push(current);
      current = [];
      continue;
    }
    const point = [round(x, 5), round(y, 5)];
    if (current.length) {
      const previous = current[current.length - 1];
      if (Math.abs(point[1] - previous[1]) > ySpan * 0.28) {
        if (current.length > 1) paths.push(current);
        current = [];
      }
    }
    current.push(point);
  }
  if (current.length > 1) paths.push(current);
  return paths;
};

export const buildSmoothGraphPath = (points, toScreenX, toScreenY) => {
  if (!Array.isArray(points) || points.length < 2) return '';
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${toScreenX(x)} ${toScreenY(y)}`).join(' ');
};

const evaluateIgnoringExplicitRestriction = (spec, x) => {
  const unrestricted = { ...spec };
  delete unrestricted.domain;
  delete unrestricted.restrictedDomain;
  return evaluateGraphFunction(unrestricted, x);
};

export const getDefaultEndpointRequirements = (spec, visiblePaths, options = {}) => {
  if (options.requireEndpointMarkers === false || !visiblePaths.length) return [];
  const explicitDomain = spec.domain || spec.restrictedDomain || {};
  const effectiveDomain = getEffectiveDomain(spec);
  const xSpan = Math.max(1, Number(options.graph?.xMax ?? 10) - Number(options.graph?.xMin ?? -10));
  const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= xSpan * 0.06;
  const endpoint = (path, pathIndex, end, marker = 'arrow', pointOverride = null) => {
    const point = pointOverride || (end === 'start' ? path[0] : path[path.length - 1]);
    const neighbor = end === 'start' ? path[Math.min(8, path.length - 1)] : path[Math.max(0, path.length - 9)];
    return { id: `endpoint-${pathIndex}-${end}`, pathIndex, end, marker, point, vector: [point[0] - neighbor[0], point[1] - neighbor[1]] };
  };
  const result = [];
  visiblePaths.forEach((path, pathIndex) => {
    ['start', 'end'].forEach((end) => {
      const current = end === 'start' ? path[0] : path[path.length - 1];
      let marker = 'arrow';
      let point = current;
      const atMinimum = end === 'start' && Number.isFinite(effectiveDomain.min) && near(current[0], effectiveDomain.min);
      const atMaximum = end === 'end' && Number.isFinite(effectiveDomain.max) && near(current[0], effectiveDomain.max);
      const squareRootNaturalStart = spec.type === 'squareRoot' && end === 'start' && near(current[0], Number(spec.h ?? 0));
      const explicitMinimum = Number.isFinite(Number(explicitDomain.min));
      const explicitMaximum = Number.isFinite(Number(explicitDomain.max));
      if ((atMinimum && explicitMinimum) || squareRootNaturalStart) {
        const bound = atMinimum ? effectiveDomain.min : Number(spec.h ?? 0);
        const y = evaluateIgnoringExplicitRestriction(spec, bound);
        if (Number.isFinite(y)) point = [bound, y];
        marker = effectiveDomain.minInclusive ? 'closed' : 'open';
      } else if (atMaximum && explicitMaximum) {
        const y = evaluateIgnoringExplicitRestriction(spec, effectiveDomain.max);
        if (Number.isFinite(y)) point = [effectiveDomain.max, y];
        marker = effectiveDomain.maxInclusive ? 'closed' : 'open';
      }
      result.push(endpoint(path, pathIndex, end, marker, point));
    });
  });
  return result;
};

const nearestDistanceToStroke = (point, strokes) => {
  let minimum = Number.POSITIVE_INFINITY;
  strokes.forEach((stroke) => stroke.forEach((candidate) => { minimum = Math.min(minimum, pointDistance(point, candidate)); }));
  return minimum;
};

export const roughSketchMatchesGraph = ({ strokes, requiredScreenPoints, idealScreenPaths = [], requiredStrokeCount = 1, tolerance = 64 }) => {
  const usefulStrokes = strokes.filter((stroke) => stroke.length >= 6);
  if (usefulStrokes.length < requiredStrokeCount) return false;
  if (!requiredScreenPoints.every((point) => nearestDistanceToStroke(point, usefulStrokes) <= tolerance)) return false;
  const idealPoints = idealScreenPaths.flat();
  if (!idealPoints.length) return true;
  const sampledStrokePoints = usefulStrokes.flatMap((stroke) => stroke.filter((_, index) => index % Math.max(1, Math.floor(stroke.length / 45)) === 0));
  if (!sampledStrokePoints.length) return false;
  const distances = sampledStrokePoints.map((point) => Math.min(...idealPoints.map((candidate) => pointDistance(point, candidate))));
  const averageDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const nearPathRatio = distances.filter((value) => value <= tolerance * 1.2).length / distances.length;
  return averageDistance <= tolerance * 0.95 && nearPathRatio >= 0.64;
};

const dedupePoints = (points, tolerance = 0.08) => {
  const output = [];
  points.forEach((point) => { if (!output.some((existing) => pointDistance(existing, point) <= tolerance)) output.push(point); });
  return output;
};

const findXIntercepts = (spec, window) => {
  const roots = [];
  const steps = 1200;
  let previousX = window.xMin;
  let previousY = evaluateGraphFunction(spec, previousX);
  for (let index = 1; index <= steps; index += 1) {
    const x = window.xMin + (index / steps) * (window.xMax - window.xMin);
    const y = evaluateGraphFunction(spec, x);
    if (Number.isFinite(y) && Math.abs(y) < 0.012) roots.push([x, 0]);
    if (Number.isFinite(previousY) && Number.isFinite(y) && previousY * y < 0) {
      let left = previousX; let right = x;
      for (let iteration = 0; iteration < 38; iteration += 1) {
        const middle = (left + right) / 2;
        const middleY = evaluateGraphFunction(spec, middle);
        if (!Number.isFinite(middleY)) break;
        if (previousY * middleY <= 0) right = middle; else left = middle;
      }
      roots.push([(left + right) / 2, 0]);
    }
    previousX = x; previousY = y;
  }
  return dedupePoints(roots.map(([x, y]) => [round(x, 4), y]), 0.12);
};

export const getGraphFeaturePoints = (spec, feature, window) => {
  const h = Number(spec.h ?? 0); const k = Number(spec.k ?? 0);
  if (feature === 'vertex' || feature === 'center') return [[h, k]];
  if (feature === 'localMaximum') return Number(spec.a ?? 1) < 0 && ['absolute', 'quadratic'].includes(spec.type) ? [[h, k]] : [];
  if (feature === 'localMinimum') return Number(spec.a ?? 1) > 0 && ['absolute', 'quadratic'].includes(spec.type) ? [[h, k]] : [];
  if (feature === 'yIntercept') {
    const y = evaluateGraphFunction(spec, 0);
    return Number.isFinite(y) ? [[0, round(y, 5)]] : [];
  }
  if (feature === 'xIntercepts') return findXIntercepts(spec, window);
  return [];
};

export const analysisSelectionsAreCorrect = (selected, expected, tolerance = 0.3, noneSelected = false) => {
  if (!expected.length) return noneSelected === true;
  return !noneSelected && Array.isArray(selected) && selected.length === expected.length && expected.every((point) => selected.some((candidate) => pointDistance(point, candidate) <= tolerance));
};

const cleanSetAnswer = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/\\left|\\right/g, '')
  .replace(/\\infty|∞/g, 'inf')
  .replace(/\\cup|∪/g, 'u')
  .replace(/\\cap|∩/g, 'n')
  .replace(/\\leq?|≤/g, '<=')
  .replace(/\\geq?|≥/g, '>=')
  .replace(/\\neq?|≠/g, '!=')
  .replace(/[−–—]/g, '-')
  .replace(/\\,/g, '')
  .replace(/\s+/g, '');

const formatNumber = (value) => Number.isInteger(Number(value)) ? String(Number(value)) : String(round(value, 5));
const intervalEndpoint = (value) => Number.isFinite(value) ? formatNumber(value) : Number(value) < 0 ? '-inf' : 'inf';
// Infinity is never reached, so it never takes a square bracket. Without this
// an unbounded domain was accepted only as "[-inf,inf]" and a student writing
// the correct (-∞, ∞) was marked wrong.
const intervalString = (min, max, minInclusive, maxInclusive) => (
  `${minInclusive && Number.isFinite(min) ? '[' : '('}${intervalEndpoint(min)},${intervalEndpoint(max)}${maxInclusive && Number.isFinite(max) ? ']' : ')'}`
);

const domainIntervals = (spec) => {
  const domain = getEffectiveDomain(spec);
  const h = Number(spec.h ?? 0);
  if (spec.type === 'rational' && h > domain.min && h < domain.max) {
    return [
      { min: domain.min, max: h, minInclusive: domain.minInclusive, maxInclusive: false },
      { min: h, max: domain.max, minInclusive: false, maxInclusive: domain.maxInclusive },
    ];
  }
  return [domain];
};

export const getDomainRangeAcceptedAnswers = (spec, kind, notation = 'interval') => {
  const variable = kind === 'domain' ? 'x' : 'y';
  if (kind === 'domain') {
    const intervals = domainIntervals(spec);
    const interval = intervals.map((part) => intervalString(part.min, part.max, part.minInclusive, part.maxInclusive)).join('u');
    if (notation === 'interval') return [interval];
    if (intervals.length === 2 && spec.type === 'rational') return [`${variable}!=${formatNumber(spec.h ?? 0)}`];
    const domain = intervals[0];
    const answers = [];
    if (Number.isFinite(domain.min) && Number.isFinite(domain.max)) answers.push(`${formatNumber(domain.min)}${domain.minInclusive ? '<=' : '<'}${variable}${domain.maxInclusive ? '<=' : '<'}${formatNumber(domain.max)}`);
    else if (Number.isFinite(domain.min)) answers.push(`${variable}${domain.minInclusive ? '>=' : '>'}${formatNumber(domain.min)}`);
    else if (Number.isFinite(domain.max)) answers.push(`${variable}${domain.maxInclusive ? '<=' : '<'}${formatNumber(domain.max)}`);
    else answers.push('-inf<x<inf', 'allrealnumbers');
    return answers;
  }

  const h = Number(spec.h ?? 0); const k = Number(spec.k ?? 0); const a = Number(spec.a ?? 1);
  const domain = getEffectiveDomain(spec);
  const explicitDomain = spec.domain || spec.restrictedDomain || {};
  const hasExplicitFiniteRestriction = Number.isFinite(Number(explicitDomain.min)) || Number.isFinite(Number(explicitDomain.max));
  const unrestrictedValue = (x) => {
    const unrestricted = { ...spec };
    delete unrestricted.domain;
    delete unrestricted.restrictedDomain;
    return evaluateGraphFunction(unrestricted, x);
  };
  if (hasExplicitFiniteRestriction && Number.isFinite(domain.min) && Number.isFinite(domain.max)) {
    if (spec.type === 'rational' && domain.min < h && domain.max > h) {
      const leftValue = round(unrestrictedValue(domain.min), 5);
      const rightValue = round(unrestrictedValue(domain.max), 5);
      let intervals;
      if (a > 0) {
        intervals = [
          `(-inf,${formatNumber(leftValue)}${domain.minInclusive ? ']' : ')'}`,
          `${domain.maxInclusive ? '[' : '('}${formatNumber(rightValue)},inf)`,
        ];
      } else {
        intervals = [
          `(-inf,${formatNumber(rightValue)}${domain.maxInclusive ? ']' : ')'}`,
          `${domain.minInclusive ? '[' : '('}${formatNumber(leftValue)},inf)`,
        ];
      }
      if (notation === 'interval') return [intervals.join('u')];
      return [intervals.join('u')];
    }

    const candidates = [
      { x: domain.min, y: unrestrictedValue(domain.min), included: domain.minInclusive },
      { x: domain.max, y: unrestrictedValue(domain.max), included: domain.maxInclusive },
    ].filter((candidate) => Number.isFinite(candidate.y));
    if (['absolute', 'quadratic'].includes(spec.type) && h > domain.min && h < domain.max) candidates.push({ x: h, y: unrestrictedValue(h), included: true });
    if (candidates.length) {
      const minimum = round(Math.min(...candidates.map((candidate) => candidate.y)), 5);
      const maximum = round(Math.max(...candidates.map((candidate) => candidate.y)), 5);
      const minIncluded = candidates.some((candidate) => candidate.included && Math.abs(candidate.y - minimum) < 1e-6);
      const maxIncluded = candidates.some((candidate) => candidate.included && Math.abs(candidate.y - maximum) < 1e-6);
      if (notation === 'interval') return [intervalString(minimum, maximum, minIncluded, maxIncluded)];
      return [`${formatNumber(minimum)}${minIncluded ? '<=' : '<'}${variable}${maxIncluded ? '<=' : '<'}${formatNumber(maximum)}`];
    }
  }

  let interval = ['(-inf,inf)'];
  let inequality = ['-inf<y<inf', 'allrealnumbers'];
  if (['absolute', 'quadratic', 'squareRoot'].includes(spec.type)) {
    interval = a >= 0 ? [`[${formatNumber(k)},inf)`] : [`(-inf,${formatNumber(k)}]`];
    inequality = a >= 0 ? [`${variable}>=${formatNumber(k)}`] : [`${variable}<=${formatNumber(k)}`];
  }
  if (spec.type === 'exponential') {
    interval = a >= 0 ? [`(${formatNumber(k)},inf)`] : [`(-inf,${formatNumber(k)})`];
    inequality = a >= 0 ? [`${variable}>${formatNumber(k)}`] : [`${variable}<${formatNumber(k)}`];
  }
  if (spec.type === 'rational') {
    interval = [`(-inf,${formatNumber(k)})u(${formatNumber(k)},inf)`];
    inequality = [`${variable}!=${formatNumber(k)}`];
  }
  return notation === 'inequality' ? inequality : interval;
};

const intersectInterval = (min, max, domain) => ({
  min: Math.max(min, domain.min),
  max: Math.min(max, domain.max),
  minInclusive: min < domain.min ? domain.minInclusive : false,
  maxInclusive: max > domain.max ? domain.maxInclusive : false,
});

// Where a function sits above or below the x-axis. The lesson teaches
// positive/negative intervals alongside increasing/decreasing, so an authored
// graphAnalysis can request them the same way.
//
// Zeros are found numerically rather than per family: bisecting a sign change
// works for every family the grapher supports, including the restricted domains
// and rational branches that closed-form root formulas would each need special
// handling for.
const SIGN_SAMPLES = 900;
const SIGN_EPSILON = 1e-7;

const bisectZero = (spec, low, high) => {
  let a = low;
  let b = high;
  let fa = evaluateGraphFunction(spec, a);
  for (let i = 0; i < 60; i += 1) {
    const mid = (a + b) / 2;
    const fm = evaluateGraphFunction(spec, mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < SIGN_EPSILON || (b - a) < 1e-9) return round(mid, 6);
    if ((fa < 0) === (fm < 0)) { a = mid; fa = fm; } else { b = mid; }
  }
  return round((a + b) / 2, 6);
};

export const getSignAcceptedAnswers = (spec, kind, notation = 'interval') => {
  if (notation !== 'interval') return [];
  const wantPositive = kind === 'positive';
  const parts = [];

  domainIntervals(spec).forEach((piece) => {
    // Sampling needs a finite window; unbounded ends are probed far enough out
    // that any remaining sign change would be off the classroom graph anyway.
    const low = Number.isFinite(piece.min) ? piece.min : -60;
    const high = Number.isFinite(piece.max) ? piece.max : 60;
    if (!(high > low)) return;

    const cuts = [];
    let previousX = low + (high - low) * 1e-6;
    let previousY = evaluateGraphFunction(spec, previousX);
    for (let i = 1; i <= SIGN_SAMPLES; i += 1) {
      const x = low + ((high - low) * i) / SIGN_SAMPLES;
      const y = evaluateGraphFunction(spec, x);
      if (Number.isFinite(previousY) && Number.isFinite(y) && (previousY < 0) !== (y < 0)) {
        const zero = bisectZero(spec, previousX, x);
        if (zero != null) cuts.push(zero);
      }
      previousX = x;
      previousY = y;
    }

    const bounds = [piece.min, ...cuts, piece.max];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      const segMin = bounds[i];
      const segMax = bounds[i + 1];
      const sampleLow = Number.isFinite(segMin) ? segMin : Math.min(segMax - 1, low);
      const sampleHigh = Number.isFinite(segMax) ? segMax : Math.max(segMin + 1, high);
      if (!(sampleHigh > sampleLow)) continue;
      const probe = evaluateGraphFunction(spec, (sampleLow + sampleHigh) / 2);
      if (!Number.isFinite(probe) || Math.abs(probe) < SIGN_EPSILON) continue;
      if ((probe > 0) !== wantPositive) continue;
      parts.push({
        min: segMin,
        max: segMax,
        // A zero is never part of "positive" or "negative"; a domain endpoint
        // keeps whatever inclusivity the domain gave it.
        minInclusive: i === 0 ? piece.minInclusive === true : false,
        maxInclusive: i === bounds.length - 2 ? piece.maxInclusive === true : false,
      });
    }
  });

  if (!parts.length) return ['none', 'doesnotexist', 'emptyset', '∅'];
  const domainAware = parts.map((part) => intervalString(part.min, part.max, part.minInclusive, part.maxInclusive)).join('u');
  const openConvention = parts.map((part) => intervalString(part.min, part.max, false, false)).join('u');
  return [...new Set([domainAware, openConvention])];
};

export const getMonotonicAcceptedAnswers = (spec, kind, notation = 'interval') => {
  if (notation !== 'interval') return [];
  const domain = getEffectiveDomain(spec);
  const h = Number(spec.h ?? 0);
  const a = Number(spec.a ?? 1);
  const base = Number(spec.base ?? 2);
  let increasing = [];
  let decreasing = [];
  const all = domainIntervals(spec);
  const left = intersectInterval(Number.NEGATIVE_INFINITY, h, domain);
  const right = intersectInterval(h, Number.POSITIVE_INFINITY, domain);
  const valid = (part) => part.min < part.max;
  const twoSidedTurning = ['absolute', 'quadratic'].includes(spec.type);
  if (twoSidedTurning) {
    if (a > 0) { if (valid(left)) decreasing.push(left); if (valid(right)) increasing.push(right); }
    else { if (valid(left)) increasing.push(left); if (valid(right)) decreasing.push(right); }
  } else if (['cubic', 'cubeRoot', 'squareRoot'].includes(spec.type)) {
    (a > 0 ? increasing : decreasing).push(...all);
  } else if (spec.type === 'logarithmic' || spec.type === 'exponential') {
    const direction = a * (base > 1 ? 1 : -1);
    (direction > 0 ? increasing : decreasing).push(...all);
  } else if (spec.type === 'rational') {
    (a > 0 ? decreasing : increasing).push(...all);
  }
  const selected = kind === 'increasing' ? increasing : kind === 'decreasing' ? decreasing : [];
  if (!selected.length) return ['none', 'doesnotexist', 'emptyset', '∅'];
  const domainAware = selected.map((part) => intervalString(part.min, part.max, part.minInclusive, part.maxInclusive)).join('u');
  const openConvention = selected.map((part) => intervalString(part.min, part.max, false, false)).join('u');
  return [...new Set([domainAware, openConvention])];
};

export const setAnswerMatches = (answer, accepted = []) => {
  const normalized = cleanSetAnswer(answer);
  return accepted.map(cleanSetAnswer).includes(normalized);
};

const parseCoordinatePairs = (value) => {
  const text = String(value ?? '').replace(/[−–—]/g, '-');
  const matches = [...text.matchAll(/\(\s*(-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*,\s*(-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*\)/g)];
  const numeric = (raw) => raw.includes('/') ? Number(raw.split('/')[0]) / Number(raw.split('/')[1]) : Number(raw);
  return matches.map((match) => [numeric(match[1]), numeric(match[2])]).filter((point) => point.every(Number.isFinite));
};

export const pointSetInputMatches = (answer, expected, tolerance = 0.3) => {
  const normalized = cleanSetAnswer(answer);
  if (!expected.length) return ['none', 'doesnotexist', 'dne', '∅', 'emptyset'].includes(normalized);
  const parsed = parseCoordinatePairs(answer);
  return parsed.length === expected.length && expected.every((point) => parsed.some((candidate) => pointDistance(point, candidate) <= tolerance));
};
