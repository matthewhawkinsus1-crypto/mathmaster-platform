import { evaluateModelAt } from './platform/workflow/modelExpression.js';
const round = (value, places = 6) => Number(Number(value).toFixed(places));

export const FUNCTION_GRAPH_TYPES = [
  'linear',
  'absolute',
  'quadratic',
  'squareRoot',
  'cubic',
  'cubeRoot',
  'logarithmic',
  'exponential',
  'rational',
  'expression',
];

export const FUNCTION_GRAPH_LABELS = {
  linear: 'Linear',
  absolute: 'Absolute Value',
  quadratic: 'Quadratic',
  squareRoot: 'Square Root',
  cubic: 'Cubic',
  cubeRoot: 'Cube Root',
  logarithmic: 'Logarithmic',
  exponential: 'Exponential',
  rational: 'Rational',
  expression: 'Your Model',
};

const normalizeDomain = (spec = {}) => {
  const domain = spec.domain || spec.restrictedDomain || {};
  const minimum = Number(domain.min);
  const maximum = Number(domain.max);
  const inclusiveFlag = (inclusiveKey, closedKey) => {
    if (domain[inclusiveKey] !== undefined) return domain[inclusiveKey] !== false;
    if (domain[closedKey] !== undefined) return domain[closedKey] !== false;
    return true;
  };
  return {
    min: Number.isFinite(minimum) ? minimum : Number.NEGATIVE_INFINITY,
    max: Number.isFinite(maximum) ? maximum : Number.POSITIVE_INFINITY,
    // V4 historically used minInclusive/maxInclusive while Authoring Intent V5
    // uses the more natural minClosed/maxClosed names. Accept both so an open
    // endpoint cannot silently turn into a closed endpoint at runtime.
    minInclusive: inclusiveFlag('minInclusive', 'minClosed'),
    maxInclusive: inclusiveFlag('maxInclusive', 'maxClosed'),
  };
};

export const getEffectiveDomain = (spec = {}) => {
  const restricted = normalizeDomain(spec);
  const h = Number(spec.h ?? 0);
  let naturalMin = Number.NEGATIVE_INFINITY;
  let naturalMinInclusive = true;
  if (spec.type === 'squareRoot') {
    naturalMin = h;
    naturalMinInclusive = true;
  } else if (spec.type === 'logarithmic') {
    naturalMin = h;
    naturalMinInclusive = false;
  }
  const min = Math.max(restricted.min, naturalMin);
  const minInclusive = min === restricted.min && min === naturalMin
    ? restricted.minInclusive && naturalMinInclusive
    : min === restricted.min
      ? restricted.minInclusive
      : naturalMinInclusive;
  return {
    min,
    max: restricted.max,
    minInclusive,
    maxInclusive: restricted.maxInclusive,
  };
};

export const xIsInFunctionDomain = (spec, x, tolerance = 1e-9) => {
  const value = Number(x);
  if (!Number.isFinite(value)) return false;
  const domain = getEffectiveDomain(spec);
  const aboveMinimum = domain.minInclusive ? value >= domain.min - tolerance : value > domain.min + tolerance;
  const belowMaximum = domain.maxInclusive ? value <= domain.max + tolerance : value < domain.max - tolerance;
  if (!aboveMinimum || !belowMaximum) return false;
  if (spec.type === 'rational' && Math.abs(value - Number(spec.h ?? 0)) <= tolerance) return false;
  return true;
};

export const evaluateGraphFunction = (spec, x) => {
  if (!xIsInFunctionDomain(spec, x)) return Number.NaN;
  const type = spec.type;
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  // Exponential/logarithmic authoring historically used both `base` and
  // `b`. New content uses `base`, but accept `b` here so already-published
  // graph questions do not silently fall back to base 2.
  const base = Number(spec.base ?? spec.b ?? 2);

  // A line is the most common function in these courses and was the one family
  // the spec evaluator did not implement, so any authored line graphed blank.
  if (type === 'linear' || type === 'line') {
    const slope = Number(spec.m ?? spec.a ?? 1);
    const intercept = spec.b !== undefined ? Number(spec.b) : k;
    return slope * (x - h) + intercept;
  }
  if (type === 'absolute') return a * Math.abs(x - h) + k;
  if (type === 'quadratic') return a * (x - h) ** 2 + k;
  if (type === 'squareRoot') return a * Math.sqrt(x - h) + k;
  if (type === 'cubic') return a * (x - h) ** 3 + k;
  if (type === 'cubeRoot') return a * Math.cbrt(x - h) + k;
  if (type === 'logarithmic') {
    if (base <= 0 || base === 1) return Number.NaN;
    return a * (Math.log(x - h) / Math.log(base)) + k;
  }
  if (type === 'exponential') return a * base ** (x - h) + k;
  if (type === 'rational') return a / (x - h) + k;
  if (type === 'expression') {
    const value = evaluateModelAt({
      expression: String(spec.expression || ''),
      variable: String(spec.variable || 'x'),
      cacheKey: `${String(spec.variable || 'x')}|${String(spec.expression || '')}`,
    }, x);
    return value === null ? Number.NaN : value;
  }
  return Number.NaN;
};

export const getGraphKeyPoint = (spec) => {
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const a = Number(spec.a ?? 1);
  if (spec.type === 'linear' || spec.type === 'line') {
    const intercept = spec.b !== undefined ? Number(spec.b) : k;
    return [h, intercept];
  }
  if (spec.type === 'expression') {
    const points = Array.isArray(spec.referencePoints) ? spec.referencePoints.filter((point) => Array.isArray(point) && point.length === 2) : [];
    if (points.length) return points[Math.floor(points.length / 2)].map(Number);
    const y = evaluateGraphFunction(spec, 0);
    return [0, Number.isFinite(y) ? y : 0];
  }
  if (spec.type === 'logarithmic') return [h + 1, k];
  if (spec.type === 'exponential') return [h, k + a];
  return [h, k];
};

const fillToFive = (values, spec) => {
  const output = [];
  values.forEach((x) => {
    const y = evaluateGraphFunction(spec, x);
    if (Number.isFinite(y) && !output.some(([existingX]) => Math.abs(existingX - x) < 1e-7)) output.push([round(x), round(y)]);
  });
  const domain = getEffectiveDomain(spec);
  const center = Number(spec.h ?? 0);
  let step = 1;
  while (output.length < (spec.type === 'rational' ? 4 : 5) && step < 80) {
    [center - step, center + step].forEach((x) => {
      if (xIsInFunctionDomain(spec, x)) {
        const y = evaluateGraphFunction(spec, x);
        if (Number.isFinite(y) && !output.some(([existingX]) => Math.abs(existingX - x) < 1e-7)) output.push([round(x), round(y)]);
      }
    });
    step += 1;
  }
  if (Number.isFinite(domain.min) && domain.minInclusive && output.length < 5) {
    const y = evaluateGraphFunction(spec, domain.min);
    if (Number.isFinite(y)) output.unshift([round(domain.min), round(y)]);
  }
  return output.slice(0, spec.type === 'rational' ? 4 : 5);
};

export const getSuggestedGraphPoints = (spec) => {
  const h = Number(spec.h ?? 0);
  if (spec.type === 'expression') {
    const reference = Array.isArray(spec.referencePoints)
      ? spec.referencePoints.filter((point) => Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(Number(value))))
      : [];
    if (reference.length) return reference.slice(0, 5).map(([x, y]) => [round(x), round(y)]);
    return fillToFive([-2, -1, 0, 1, 2], spec);
  }
  let xValues;
  switch (spec.type) {
    case 'absolute':
    case 'quadratic':
    case 'cubic':
      xValues = [h - 2, h - 1, h, h + 1, h + 2];
      break;
    case 'squareRoot':
      xValues = [h, h + 1, h + 4, h + 9, h + 16];
      break;
    case 'cubeRoot':
      xValues = [h - 8, h - 1, h, h + 1, h + 8];
      break;
    case 'logarithmic': {
      const base = Number(spec.base ?? spec.b ?? 2);
      xValues = [h + 1 / base, h + 1, h + base, h + base ** 2, h + base ** 3];
      break;
    }
    case 'exponential':
      xValues = [h - 2, h - 1, h, h + 1, h + 2];
      break;
    case 'rational':
      xValues = [h - 2, h - 1, h + 1, h + 2];
      break;
    default:
      xValues = [h - 2, h - 1, h, h + 1, h + 2];
  }
  return fillToFive(xValues, spec);
};

const termWithShift = (variable, h) => {
  if (h === 0) return variable;
  return h > 0 ? `${variable}-${h}` : `${variable}+${Math.abs(h)}`;
};
const appendK = (expression, k) => k === 0 ? expression : `${expression}${k > 0 ? `+${k}` : `${k}`}`;
const coefficientPrefix = (a) => a === 1 ? '' : a === -1 ? '-' : String(a);
const domainConditionLatex = (spec) => {
  const domain = getEffectiveDomain(spec);
  const pieces = [];
  if (Number.isFinite(domain.min)) pieces.push(`x${domain.minInclusive ? '\\ge' : '>'}${domain.min}`);
  if (Number.isFinite(domain.max)) pieces.push(`x${domain.maxInclusive ? '\\le' : '<'}${domain.max}`);
  if (!pieces.length) return '';
  if (pieces.length === 2) return `,\\quad ${domain.min}${domain.minInclusive ? '\\le' : '<'}x${domain.maxInclusive ? '\\le' : '<'}${domain.max}`;
  return `,\\quad ${pieces[0]}`;
};

export const formatGraphEquationLatex = (spec) => {
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? spec.b ?? 2);
  const shiftedX = termWithShift('x', h);
  const prefix = coefficientPrefix(a);
  let expression = 'y=f(x)';
  if (spec.type === 'expression') return String(spec.originalEquation || `y=${spec.expression || ''}`);
  if (spec.type === 'linear' || spec.type === 'line') {
    const slope = Number(spec.m ?? spec.a ?? 1);
    const intercept = spec.b !== undefined ? Number(spec.b) : k;
    const linearPrefix = coefficientPrefix(slope);
    expression = `y=${appendK(`${linearPrefix}${shiftedX}`, intercept)}`;
  }
  if (spec.type === 'absolute') expression = `y=${appendK(`${prefix}\\left|${shiftedX}\\right|`, k)}`;
  if (spec.type === 'quadratic') expression = `y=${appendK(`${prefix}\\left(${shiftedX}\\right)^2`, k)}`;
  if (spec.type === 'squareRoot') expression = `y=${appendK(`${prefix}\\sqrt{${shiftedX}}`, k)}`;
  if (spec.type === 'cubic') expression = `y=${appendK(`${prefix}\\left(${shiftedX}\\right)^3`, k)}`;
  if (spec.type === 'cubeRoot') expression = `y=${appendK(`${prefix}\\sqrt[3]{${shiftedX}}`, k)}`;
  if (spec.type === 'logarithmic') expression = `y=${appendK(`${prefix}\\log_{${base}}\\left(${shiftedX}\\right)`, k)}`;
  if (spec.type === 'exponential') expression = `y=${appendK(`${prefix}${base}^{${shiftedX}}`, k)}`;
  if (spec.type === 'rational') expression = `y=${appendK(`\\frac{${a}}{${shiftedX}}`, k)}`;
  return `${expression}${domainConditionLatex(spec)}`;
};

export const buildGraphWindow = (spec, points = getSuggestedGraphPoints(spec)) => {
  const center = getGraphKeyPoint(spec);
  const domain = getEffectiveDomain(spec);
  const allPoints = [...points, center].filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const xValues = allPoints.map(([x]) => x);
  const yValues = allPoints.map(([, y]) => y);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  if (Number.isFinite(domain.min)) {
    xValues.push(domain.min);
    const unrestricted = { ...spec };
    delete unrestricted.domain;
    delete unrestricted.restrictedDomain;
    const boundaryY = evaluateGraphFunction(unrestricted, domain.min);
    if (Number.isFinite(boundaryY)) yValues.push(boundaryY);
  }
  if (Number.isFinite(domain.max)) {
    xValues.push(domain.max);
    const unrestricted = { ...spec };
    delete unrestricted.domain;
    delete unrestricted.restrictedDomain;
    const boundaryY = evaluateGraphFunction(unrestricted, domain.max);
    if (Number.isFinite(boundaryY)) yValues.push(boundaryY);
  }
  if (spec.type === 'rational') {
    xValues.push(h - 5, h + 5);
    yValues.push(k - 6, k + 6);
  }
  const safeX = xValues.length ? xValues : [-5, 5];
  const safeY = yValues.length ? yValues : [-5, 5];
  const xMin = Math.floor(Math.min(...safeX) - 2);
  const xMax = Math.ceil(Math.max(...safeX) + 2);
  const yMin = Math.floor(Math.min(...safeY) - 2);
  const yMax = Math.ceil(Math.max(...safeY) + 2);
  return {
    xMin: Math.min(xMin, -2),
    xMax: Math.max(xMax, 2),
    yMin: Math.min(yMin, -2),
    yMax: Math.max(yMax, 2),
    xStep: xMax - xMin > 24 ? 2 : 1,
    yStep: yMax - yMin > 24 ? 2 : 1,
    snapStep: 0.5,
  };
};

export const pointIsOnFunction = (spec, point, tolerance = 0.18) => {
  if (!Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const expectedY = evaluateGraphFunction(spec, x);
  return Number.isFinite(expectedY) && Math.abs(expectedY - y) <= tolerance;
};

export const pointsAreDistinct = (points, tolerance = 0.08) => points.every((point, index) => points.every((other, otherIndex) => index === otherIndex || Math.abs(point[0] - other[0]) > tolerance || Math.abs(point[1] - other[1]) > tolerance));

export const graphSelectionsAreCorrect = ({ spec, center, points, tolerance = 0.18 }) => {
  const expectedCenter = getGraphKeyPoint(spec);
  const centerCorrect = Array.isArray(center) && Math.abs(Number(center[0]) - expectedCenter[0]) <= tolerance && Math.abs(Number(center[1]) - expectedCenter[1]) <= tolerance;
  if (!centerCorrect || !Array.isArray(points) || points.length < 4 || !pointsAreDistinct(points)) return false;
  if (!points.every((point) => pointIsOnFunction(spec, point, tolerance))) return false;
  const h = Number(spec.h ?? 0);
  if (['absolute', 'quadratic', 'cubic', 'cubeRoot', 'rational'].includes(spec.type)) return points.some(([x]) => x < h - tolerance) && points.some(([x]) => x > h + tolerance);
  return true;
};
