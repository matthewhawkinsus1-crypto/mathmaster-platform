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
    if (x < minimum || (domain.minInclusive === false && Math.abs(x - minimum) < 1e-8)) return Number.NaN;
  }
  if (finite(domain.max)) {
    const maximum = Number(domain.max);
    if (x > maximum || (domain.maxInclusive === false && Math.abs(x - maximum) < 1e-8)) return Number.NaN;
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

export const auditStaticGraphViewport = (graph = {}, { label = 'graph', strictBoundaryVisibility = false } = {}) => {
  const errors = [];
  const warnings = [];
  const { xMin, xMax, yMin, yMax } = graphBounds(graph);

  if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) {
    errors.push(`${label} has invalid graph bounds; require finite xMin < xMax and yMin < yMax`);
    return { errors, warnings };
  }

  const functions = Array.isArray(graph.functions) ? graph.functions : [];
  const points = Array.isArray(graph.points) ? graph.points : [];
  const segments = Array.isArray(graph.segments) ? graph.segments : [];
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
      errors.push(`${fnLabel} is clipped by its viewport (${clipped.join(', ')}). Expand the y-range, narrow the x-range, or set \`allowClipping: true\` only when cropping is intentional.`);
    }
  });

  return { errors, warnings };
};
