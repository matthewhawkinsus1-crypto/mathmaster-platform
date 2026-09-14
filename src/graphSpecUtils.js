import { readGraphPointCoordinates, validateGraphPoint } from './graphPointUtils.js';
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const finite = (value) => Number.isFinite(Number(value));

export const STATIC_GRAPH_FUNCTION_TYPES = Object.freeze([
  'line', 'quadratic', 'absolute', 'squareRoot', 'cubic', 'cubeRoot',
  'logarithmic', 'exponential', 'reciprocal', 'rational',
]);

export const getQuadraticParameterization = (spec = {}) => {
  const hasVertex = hasOwn(spec, 'h') || hasOwn(spec, 'k');
  const hasStandard = hasOwn(spec, 'b') || hasOwn(spec, 'c');
  if (hasVertex && hasStandard) return 'ambiguous';
  return hasVertex ? 'vertex' : 'standard';
};

/**
 * Canonical evaluator for the small read-only graphs rendered by GraphDisplay.
 * Quadratics intentionally accept BOTH public forms because MathMaster's
 * function-investigation tools use vertex form while older static-graph JSON
 * used standard form.
 *
 *   standard: y = ax² + bx + c
 *   vertex:   y = a(x - h)² + k
 */
export const evaluateStaticGraphFunction = (spec = {}, xValue) => {
  const x = Number(xValue);
  if (!Number.isFinite(x)) return Number.NaN;

  const type = spec.type || spec.kind || 'line';
  const domain = spec.domain || spec.restrictedDomain || {};
  if (finite(domain.min)) {
    const minimum = Number(domain.min);
    const minimumInclusive = domain.minInclusive !== false && domain.minClosed !== false;
    if (x < minimum || (!minimumInclusive && Math.abs(x - minimum) < 1e-8)) return Number.NaN;
  }
  if (finite(domain.max)) {
    const maximum = Number(domain.max);
    const maximumInclusive = domain.maxInclusive !== false && domain.maxClosed !== false;
    if (x > maximum || (!maximumInclusive && Math.abs(x - maximum) < 1e-8)) return Number.NaN;
  }

  if (type === 'line') return Number(spec.m ?? 1) * x + Number(spec.b ?? 0);
  if (type === 'quadratic') {
    const a = Number(spec.a ?? 1);
    if (getQuadraticParameterization(spec) === 'vertex') {
      return a * (x - Number(spec.h ?? 0)) ** 2 + Number(spec.k ?? 0);
    }
    return a * x * x + Number(spec.b ?? 0) * x + Number(spec.c ?? 0);
  }
  if (type === 'absolute') return Number(spec.a ?? 1) * Math.abs(x - Number(spec.h ?? 0)) + Number(spec.k ?? 0);
  if (type === 'squareRoot') {
    const radicand = x - Number(spec.h ?? 0);
    if (radicand < 0) return Number.NaN;
    return Number(spec.a ?? 1) * Math.sqrt(radicand) + Number(spec.k ?? 0);
  }
  if (type === 'cubic') return Number(spec.a ?? 1) * (x - Number(spec.h ?? 0)) ** 3 + Number(spec.k ?? 0);
  if (type === 'cubeRoot') return Number(spec.a ?? 1) * Math.cbrt(x - Number(spec.h ?? 0)) + Number(spec.k ?? 0);
  if (type === 'logarithmic') {
    const argument = x - Number(spec.h ?? 0);
    const base = Number(spec.base ?? 2);
    if (argument <= 0 || base <= 0 || base === 1) return Number.NaN;
    return Number(spec.a ?? 1) * (Math.log(argument) / Math.log(base)) + Number(spec.k ?? 0);
  }
  if (type === 'exponential') {
    const base = Number(spec.base ?? 2);
    if (base <= 0 || base === 1) return Number.NaN;
    return Number(spec.a ?? 1) * base ** (x - Number(spec.h ?? 0)) + Number(spec.k ?? 0);
  }
  if (type === 'reciprocal' || type === 'rational') {
    const denominator = x - Number(spec.h ?? 0);
    if (Math.abs(denominator) < 0.0001) return Number.NaN;
    return Number(spec.a ?? 1) / denominator + Number(spec.k ?? 0);
  }

  return Number.NaN;
};

/**
 * The asymptotes a function family has, as lines to draw.
 *
 * WHY THIS EXISTS. A student asked for the range of \(f(x)=5(3^x)-4\) has to
 * see where the curve stops. Without the asymptote drawn, the graph just looks
 * like it flattens somewhere near the bottom of the window, and the student is
 * guessing at a boundary the mathematics defines exactly. Every graphing
 * calculator they will ever use draws it; ours did not.
 *
 * The line is drawn but deliberately NOT labelled with its equation, because
 * several questions ask for the asymptote as an answer. Showing the boundary is
 * reading the graph; printing "y = -4" beside it is giving away the response.
 */
export const staticGraphAsymptotes = (spec = {}) => {
  if (!spec || typeof spec !== 'object') return [];
  const type = spec.type || spec.kind || 'line';
  const k = Number(spec.k ?? 0);
  const h = Number(spec.h ?? 0);

  if (type === 'exponential') {
    return finite(k) ? [{ axis: 'horizontal', value: k }] : [];
  }
  if (type === 'logarithmic') {
    return finite(h) ? [{ axis: 'vertical', value: h }] : [];
  }
  if (type === 'reciprocal' || type === 'rational') {
    return [
      ...(finite(h) ? [{ axis: 'vertical', value: h }] : []),
      ...(finite(k) ? [{ axis: 'horizontal', value: k }] : []),
    ];
  }
  return [];
};

/** Every asymptote on a graph, de-duplicated so overlapping specs draw once. */
export const graphAsymptoteLines = (graph = {}) => {
  if (graph?.showAsymptotes === false) return [];
  const functions = Array.isArray(graph?.functions) ? graph.functions : [];
  const seen = new Set();
  return functions.flatMap((spec) => staticGraphAsymptotes(spec)).filter((line) => {
    const key = `${line.axis}:${line.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const validateStaticGraphFunctionSpec = (spec = {}, { label = 'function' } = {}) => {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return [`${label} must be an object`];
  const type = spec.type || spec.kind || 'line';
  if (!STATIC_GRAPH_FUNCTION_TYPES.includes(type)) return [`${label} uses unsupported graph function type ${type}`];

  const numeric = (key, { required = false } = {}) => {
    if (!hasOwn(spec, key)) {
      if (required) errors.push(`${label} needs finite \`${key}\``);
      return;
    }
    if (!finite(spec[key])) errors.push(`${label}.\`${key}\` must be finite`);
  };

  if (type === 'line') {
    numeric('m'); numeric('b');
  } else if (type === 'quadratic') {
    numeric('a');
    const form = getQuadraticParameterization(spec);
    if (form === 'ambiguous') {
      errors.push(`${label} mixes quadratic standard-form fields (b/c) with vertex-form fields (h/k); choose exactly one form`);
    } else if (form === 'vertex') {
      numeric('h', { required: true });
      numeric('k', { required: true });
    } else {
      numeric('b'); numeric('c');
    }
  } else if (type === 'exponential' || type === 'logarithmic') {
    numeric('a'); numeric('h'); numeric('k'); numeric('base');
    const base = Number(spec.base ?? 2);
    if (!Number.isFinite(base) || base <= 0 || base === 1) errors.push(`${label}.\`base\` must be > 0 and not equal to 1`);
  } else {
    numeric('a'); numeric('h'); numeric('k');
  }

  return errors;
};

const graphBounds = (graph = {}) => {
  const xMin = Number(graph.xMin ?? -10);
  const xMax = Number(graph.xMax ?? 10);
  const yMin = Number(graph.yMin ?? -10);
  const yMax = Number(graph.yMax ?? 10);
  return { xMin, xMax, yMin, yMax };
};

const inside = (value, min, max, tolerance = 1e-7) => Number.isFinite(value) && value >= min - tolerance && value <= max + tolerance;

const normalizedViewportFunction = (spec = {}) => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null;
  if (spec.type === 'linear') return { ...spec, type: 'line' };
  return spec;
};

const unrestrictedViewportFunction = (spec = {}) => {
  const copy = { ...spec };
  delete copy.domain;
  delete copy.restrictedDomain;
  return copy;
};

const staticViewportFunctions = (graph = {}) => {
  const functions = (Array.isArray(graph.functions) ? graph.functions : [])
    .map(normalizedViewportFunction)
    .filter(Boolean);

  if (graph.functionSpec && typeof graph.functionSpec === 'object') {
    const nested = normalizedViewportFunction(graph.functionSpec);
    if (nested) functions.push(nested);
  }
  if (graph.line && typeof graph.line === 'object') {
    functions.push({ type: 'line', ...graph.line });
  }
  if (finite(graph.m) || finite(graph.b)) {
    functions.push({ type: 'line', m: Number(graph.m || 0), b: Number(graph.b || 0) });
  }
  return functions;
};

const uniqueCoordinatePairs = (points = []) => {
  const seen = new Set();
  const output = [];
  points.forEach((point) => {
    const coordinates = readGraphPointCoordinates(point);
    if (!coordinates) return;
    const [x, y] = coordinates.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const key = `${x}|${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push([x, y]);
  });
  return output;
};

/**
 * Coordinates that must remain readable, not merely technically drawable.
 *
 * The authored function can continue forever; the student's answer cannot.
 * Domain endpoints, feature points, segment ends and explicitly-declared
 * readability points therefore outrank distant samples when a viewport is
 * chosen. This is intentionally display metadata only — nothing here is shown
 * as an answer.
 */
export const staticGraphViewportLandmarks = (graph = {}, functionsOverride = null) => {
  const functions = Array.isArray(functionsOverride)
    ? functionsOverride.map(normalizedViewportFunction).filter(Boolean)
    : staticViewportFunctions(graph);
  const candidates = [
    ...(Array.isArray(graph.points) ? graph.points : []),
    ...(Array.isArray(graph.readabilityPoints) ? graph.readabilityPoints : []),
    ...(Array.isArray(graph.answerCriticalPoints) ? graph.answerCriticalPoints : []),
  ];

  (Array.isArray(graph.segments) ? graph.segments : []).forEach((segment) => {
    [segment?.start, segment?.end, segment?.from, segment?.to].forEach((point) => {
      if (point) candidates.push(point);
    });
  });
  (Array.isArray(graph.endpointRequirements) ? graph.endpointRequirements : []).forEach((requirement) => {
    if (requirement?.point) candidates.push(requirement.point);
  });

  functions.forEach((spec) => {
    const domain = spec?.domain || spec?.restrictedDomain || {};
    const unrestricted = unrestrictedViewportFunction(spec);
    [Number(domain.min), Number(domain.max)].forEach((x) => {
      if (!Number.isFinite(x)) return;
      const y = evaluateStaticGraphFunction(unrestricted, x);
      if (Number.isFinite(y)) candidates.push([x, y]);
    });
  });

  return uniqueCoordinatePairs(candidates);
};


const AUTO_FIT_FUNCTION_TYPES = new Set([
  'line', 'quadratic', 'absolute', 'squareRoot', 'cubic', 'cubeRoot', 'exponential',
]);

const niceBound = (value, direction = 'out') => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return number;
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(number)));
  const scaled = number / magnitude;
  if (direction === 'down') return Math.floor(scaled) * magnitude;
  if (direction === 'up') return Math.ceil(scaled) * magnitude;
  return Math.round(scaled) * magnitude;
};

/**
 * Expand a static graph's y-window when authored bounds would hide the
 * mathematics. AI authors should describe the model; the renderer owns the
 * final student-friendly viewport. `lockViewport: true` is the explicit opt-out
 * for rare lessons where cropping itself is instructional.
 */
export const fitStaticGraphViewport = (graph = {}, { sampleCount = 160, paddingRatio = 0.08 } = {}) => {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return graph;
  if (graph.lockViewport === true || graph.autoFit === false) return graph;

  const functions = staticViewportFunctions(graph);
  const landmarks = staticGraphViewportLandmarks(graph, functions);
  const landmarkXs = landmarks.map(([x]) => x);
  const landmarkYs = landmarks.map(([, y]) => y);

  const authoredXMin = finite(graph.xMin);
  const authoredXMax = finite(graph.xMax);
  let xMin = authoredXMin ? Number(graph.xMin) : Number.NaN;
  let xMax = authoredXMax ? Number(graph.xMax) : Number.NaN;

  // Answer-critical coordinates choose the first frame whenever the author did
  // not pin an axis. For example a quadratic whose vertex/intercepts live from
  // x=-1 to x=3 should not inherit a generic h±5 window that balloons the y-axis
  // merely to keep distant, unassessed wings in frame.
  if (!authoredXMin || !authoredXMax) {
    let suggestedMin = -5;
    let suggestedMax = 5;

    if (landmarkXs.length) {
      const landmarkMin = Math.min(...landmarkXs);
      const landmarkMax = Math.max(...landmarkXs);
      const landmarkSpan = Math.max(2, landmarkMax - landmarkMin);
      const pad = Math.max(1, landmarkSpan * 0.25);
      suggestedMin = Math.floor(landmarkMin - pad);
      suggestedMax = Math.ceil(landmarkMax + pad);
    } else if (functions.length === 1) {
      const spec = functions[0] || {};
      const type = spec.type || spec.kind || 'line';
      const h = Number(spec.h ?? 0);
      if (type === 'exponential') [suggestedMin, suggestedMax] = [h - 4, h + 4];
      else if (type === 'squareRoot') [suggestedMin, suggestedMax] = [h - 1, h + 8];
      else if (type === 'logarithmic') [suggestedMin, suggestedMax] = [h + 0.25, h + 8];
      else if (['quadratic', 'absolute', 'cubic', 'cubeRoot', 'reciprocal', 'rational'].includes(type)) {
        [suggestedMin, suggestedMax] = [h - 5, h + 5];
      }
    }

    if (!authoredXMin) xMin = suggestedMin;
    if (!authoredXMax) xMax = suggestedMax;
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) [xMin, xMax] = [-5, 5];

  // A visible marker needs breathing room. "Contained" is not enough when an
  // open/closed endpoint is centered on the SVG border and half of the circle
  // is clipped. Authored bounds are therefore a minimum useful frame, not a
  // cage, unless lockViewport/autoFit:false explicitly opted out above.
  if (landmarkXs.length) {
    const xSpan = Math.max(1, xMax - xMin);
    const markerPad = Math.max(0.5, Math.min(2, xSpan * 0.08));
    xMin = Math.min(xMin, Math.min(...landmarkXs) - markerPad);
    xMax = Math.max(xMax, Math.max(...landmarkXs) + markerPad);
  }

  const authoredYMin = finite(graph.yMin);
  const authoredYMax = finite(graph.yMax);
  let yMin = authoredYMin ? Number(graph.yMin) : Number.NaN;
  let yMax = authoredYMax ? Number(graph.yMax) : Number.NaN;

  const yValues = [...landmarkYs];
  functions.forEach((spec) => {
    const type = spec?.type || spec?.kind || 'line';
    if (!AUTO_FIT_FUNCTION_TYPES.has(type)) return;
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const x = xMin + ((xMax - xMin) * sample) / sampleCount;
      const y = evaluateStaticGraphFunction(spec, x);
      if (Number.isFinite(y) && Math.abs(y) < 1e9) yValues.push(y);
    }
  });

  if (!yValues.length) {
    if (!authoredYMin) yMin = -10;
    if (!authoredYMax) yMax = 10;
    return { ...graph, xMin, xMax, yMin, yMax };
  }

  const observedMin = Math.min(...yValues);
  const observedMax = Math.max(...yValues);
  let baseMin = authoredYMin ? Math.min(yMin, observedMin) : observedMin;
  let baseMax = authoredYMax ? Math.max(yMax, observedMax) : observedMax;

  // Keep zero visible for common school graphs when all observed values are on
  // one side of the axis and the author did not explicitly choose otherwise.
  if (!authoredYMin && observedMin >= 0) baseMin = 0;
  if (!authoredYMax && observedMax <= 0) baseMax = 0;

  if (Math.abs(baseMax - baseMin) < 1e-9) {
    baseMin -= 1;
    baseMax += 1;
  }

  const span = Math.max(1, baseMax - baseMin);
  const padding = Math.max(span * paddingRatio, 0.5);
  let nextMin = authoredYMin && observedMin >= yMin ? yMin : niceBound(baseMin - padding, 'down');
  let nextMax = authoredYMax && observedMax <= yMax ? yMax : niceBound(baseMax + padding, 'up');

  if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax) || nextMin >= nextMax) {
    nextMin = Number.isFinite(yMin) ? yMin : -10;
    nextMax = Number.isFinite(yMax) ? yMax : 10;
  }

  // Readable feature markers also need vertical breathing room, even when the
  // author happened to choose a bound exactly equal to the correct coordinate.
  if (landmarkYs.length) {
    const visibleSpan = Math.max(1, nextMax - nextMin);
    const markerPad = Math.max(0.5, Math.min(2, visibleSpan * 0.08));
    nextMin = Math.min(nextMin, Math.min(...landmarkYs) - markerPad);
    nextMax = Math.max(nextMax, Math.max(...landmarkYs) + markerPad);
  }

  if ((authoredYMin && yMin === 0 && observedMin >= 0) || (!authoredYMin && observedMin >= 0)) nextMin = 0;
  if ((authoredYMax && yMax === 0 && observedMax <= 0) || (!authoredYMax && observedMax <= 0)) nextMax = 0;

  return { ...graph, xMin, xMax, yMin: nextMin, yMax: nextMax };
};

export const auditStaticGraphViewport = (graph = {}, { label = 'graph', strictBoundaryVisibility = false } = {}) => {
  graph = fitStaticGraphViewport(graph);
  const errors = [];
  const warnings = [];
  const { xMin, xMax, yMin, yMax } = graphBounds(graph);

  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) {
    errors.push(`${label} has invalid graph bounds; require finite xMin < xMax and yMin < yMax`);
    return { errors, warnings };
  }

  const functions = staticViewportFunctions(graph);
  const points = Array.isArray(graph.points) ? graph.points : [];
  const segments = Array.isArray(graph.segments) ? graph.segments : [];
  points.forEach((point, index) => {
    errors.push(...validateGraphPoint(point, { label: `${label}.points[${index}]` }));
  });

  // A deliberately locked assessment graph may not park an answer-critical
  // marker on the border. Auto-fit repairs ordinary graphs; locked graphs must
  // be rejected instead of forcing a student to infer a clipped coordinate.
  if (graph.lockViewport === true && strictBoundaryVisibility) {
    const critical = staticGraphViewportLandmarks({
      ...graph,
      points: [],
    }, functions);
    const xMargin = Math.max(1e-6, (xMax - xMin) * 0.015);
    const yMargin = Math.max(1e-6, (yMax - yMin) * 0.015);
    critical.forEach(([x, y]) => {
      if (x <= xMin + xMargin || x >= xMax - xMargin || y <= yMin + yMargin || y >= yMax - yMargin) {
        errors.push(`${label} locks answer-critical point (${x}, ${y}) on or too near the viewport edge; expand the bounds so the marker is fully readable`);
      }
    });
  }
  if (!functions.length && !points.length && !segments.length && !graph.line && !finite(graph.m) && !finite(graph.b)) {
    errors.push(`${label} contains no drawable function, points, or segments`);
    return { errors, warnings };
  }

  functions.forEach((spec, index) => {
    const fnLabel = `${label}.functions[${index}]`;
    errors.push(...validateStaticGraphFunctionSpec(spec, { label: fnLabel }));
    if (errors.some((message) => message.startsWith(fnLabel))) return;

    const sampleCount = 160;
    let finiteCount = 0;
    let visibleCount = 0;
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const x = xMin + ((xMax - xMin) * sample) / sampleCount;
      const y = evaluateStaticGraphFunction(spec, x);
      if (!Number.isFinite(y)) continue;
      finiteCount += 1;
      if (inside(y, yMin, yMax)) visibleCount += 1;
    }
    if (finiteCount > 0 && visibleCount === 0) {
      errors.push(`${fnLabel} is completely outside the visible y-range [${yMin}, ${yMax}]`);
    } else if (finiteCount > 0 && visibleCount / finiteCount < 0.55) {
      warnings.push(`${fnLabel} is mostly outside the visible y-range; students will see less than 55% of the sampled curve`);
    }

    if (graph.allowClipping === true) return;
    const type = spec.type || spec.kind || 'line';
    if (!strictBoundaryVisibility || ['reciprocal', 'rational', 'logarithmic'].includes(type)) return;

    const leftY = evaluateStaticGraphFunction(spec, xMin);
    const rightY = evaluateStaticGraphFunction(spec, xMax);
    const clipped = [];
    if (Number.isFinite(leftY) && !inside(leftY, yMin, yMax)) clipped.push(`xMin gives y=${Number(leftY.toFixed(4))}`);
    if (Number.isFinite(rightY) && !inside(rightY, yMin, yMax)) clipped.push(`xMax gives y=${Number(rightY.toFixed(4))}`);
    if (clipped.length) {
      errors.push(`${fnLabel} is clipped by its locked viewport (${clipped.join(', ')}). Expand the y-range or narrow the x-range.`);
    }
  });

  return { errors, warnings };
};

/**
 * The colour a plotted point should be drawn in.
 *
 * A point arrives either as `[x, y]` or as an object carrying its own styling,
 * and `point.fill` has to be read carefully: on an ARRAY, `.fill` is
 * `Array.prototype.fill`. That is a function, and it is truthy, so
 * `point.fill || fallback` returned the built-in method. React refuses a
 * function as an attribute value and drops the attribute, so every point
 * plotted from an array pair rendered with no fill at all — silently, because
 * the only symptom was a dev-mode warning and a colourless dot.
 */
export const resolvePointFill = (point, fallback) => (
  typeof point?.fill === 'string' && point.fill ? point.fill : fallback
);

/** The radius for a plotted point, from either shape, never NaN. */
export const resolvePointRadius = (point, fallback) => {
  const radius = Number(point?.r ?? point?.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : fallback;
};
