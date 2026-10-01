/**
 * Viewport-independent mathematics for Systems Workspace inequalities.
 *
 * The canonical form is `A*x + B*y + C relation 0`.  The legacy
 * `{ m, b, relation }` form remains accepted and means `y relation m*x + b`.
 */

export const DEFAULT_INEQUALITY_TOLERANCE = 1e-8;

const RELATIONS = new Set(['<', '<=', '>', '>=']);
const relationToken = (value) => String(value ?? '>=').trim()
  .replace('≤', '<=').replace('≥', '>=');
const finite = (value) => Number.isFinite(Number(value));

const flipRelation = (relation) => ({
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
}[String(relation || '')] || String(relation || ''));

const formatGraphNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  if (Math.abs(number) <= 1e-10) return '0';
  const roundedInteger = Math.round(number);
  if (Math.abs(number - roundedInteger) <= 1e-10) {
    return String(roundedInteger).replace('-', '−');
  }

  const sign = number < 0 ? '−' : '';
  const magnitude = Math.abs(number);
  for (let denominator = 2; denominator <= 24; denominator += 1) {
    const numerator = Math.round(magnitude * denominator);
    if (Math.abs(magnitude - numerator / denominator) <= 1e-10) {
      return `${sign}${numerator}/${denominator}`;
    }
  }
  return String(Number(number.toFixed(4))).replace('-', '−');
};

export const formatSlopeInterceptInequality = (input = {}) => {
  const { A, B, C, relation: canonicalRelation } = normalizeLinearInequality(input);
  if (Math.abs(B) <= DEFAULT_INEQUALITY_TOLERANCE) {
    const x = -C / A;
    const relation = A < 0 ? flipRelation(canonicalRelation) : canonicalRelation;
    return `x ${relation.replace('<=', '≤').replace('>=', '≥')} ${formatGraphNumber(x)}`;
  }

  const relation = B < 0 ? flipRelation(canonicalRelation) : canonicalRelation;
  const m = -A / B;
  const b = -C / B;

  let right = '';
  if (Math.abs(m) > 1e-10) {
    if (Math.abs(m - 1) <= 1e-10) right = 'x';
    else if (Math.abs(m + 1) <= 1e-10) right = '−x';
    else right = `${formatGraphNumber(m)}x`;
  }

  if (Math.abs(b) > 1e-10 || !right) {
    const constant = formatGraphNumber(Math.abs(b));
    if (!right) right = b < 0 ? `−${constant}` : constant;
    else right += b < 0 ? ` − ${constant}` : ` + ${constant}`;
  }

  return `y ${relation.replace('<=', '≤').replace('>=', '≥')} ${right}`;
};

export const normalizeLinearInequality = (input = {}) => {
  const relation = relationToken(input.relation);
  if (!RELATIONS.has(relation)) throw new TypeError(`Unsupported inequality relation: ${input.relation}`);

  let A;
  let B;
  let C;
  if (finite(input.A) || finite(input.B) || finite(input.C)) {
    A = Number(input.A ?? 0);
    B = Number(input.B ?? 0);
    C = Number(input.C ?? 0);
  } else if (finite(input.m) || finite(input.b)) {
    A = -Number(input.m ?? 0);
    B = 1;
    C = -Number(input.b ?? 0);
  } else {
    throw new TypeError('A linear inequality requires A/B/C or legacy m/b coefficients.');
  }
  if (![A, B, C].every(Number.isFinite)) throw new TypeError('Linear inequality coefficients must be finite numbers.');
  if (A === 0 && B === 0) throw new TypeError('A linear inequality boundary requires a nonzero A or B coefficient.');
  return Object.freeze({ A, B, C, relation });
};

export const getBoundaryMetadata = (inequality) => {
  const normalized = normalizeLinearInequality(inequality);
  const { A, B, C, relation } = normalized;
  const inclusive = relation.includes('=');
  const orientation = Math.abs(B) <= DEFAULT_INEQUALITY_TOLERANCE
    ? 'vertical'
    : Math.abs(A) <= DEFAULT_INEQUALITY_TOLERANCE ? 'horizontal' : 'general';
  return {
    ...normalized,
    equation: { A, B, C },
    orientation,
    lineStyle: inclusive ? 'solid' : 'dashed',
    boundaryIncluded: inclusive,
    // The satisfying side is expressed without assuming a screen coordinate system.
    satisfyingHalfPlane: relation.startsWith('>') ? 'positive' : 'negative',
  };
};

export const evaluatePoint = (inequality, x, y, tolerance = DEFAULT_INEQUALITY_TOLERANCE) => {
  const { A, B, C, relation } = normalizeLinearInequality(inequality);
  const value = A * Number(x) + B * Number(y) + C;
  if (!Number.isFinite(value)) throw new TypeError('Point coordinates must be finite numbers.');
  if (Math.abs(value) <= Math.abs(tolerance)) {
    return relation.includes('=') ? 'onBoundaryIncluded' : 'onBoundaryExcluded';
  }
  const inside = relation.startsWith('>') ? value > 0 : value < 0;
  return inside ? 'inside' : 'outside';
};

export const isPointInInequality = (inequality, x, y, tolerance = DEFAULT_INEQUALITY_TOLERANCE) => {
  const result = evaluatePoint(inequality, x, y, tolerance);
  return result === 'inside' || result === 'onBoundaryIncluded';
};

const asLessThan = (inequality) => {
  const normalized = normalizeLinearInequality(inequality);
  const flip = normalized.relation.startsWith('>') ? -1 : 1;
  return {
    a: flip * normalized.A,
    b: flip * normalized.B,
    c: -flip * normalized.C,
    strict: !normalized.relation.includes('='),
    normalized,
  };
};

const intersectLines = (left, right, tolerance) => {
  const det = left.A * right.B - right.A * left.B;
  if (Math.abs(det) <= tolerance) return null;
  return {
    x: (left.B * right.C - right.B * left.C) / det,
    y: (left.C * right.A - right.C * left.A) / det,
  };
};

export const boundaryIntersections = (inequalities = [], tolerance = DEFAULT_INEQUALITY_TOLERANCE) => {
  const normalized = inequalities.map(normalizeLinearInequality);
  const intersections = [];
  for (let first = 0; first < normalized.length; first += 1) {
    for (let second = first + 1; second < normalized.length; second += 1) {
      const coordinate = intersectLines(normalized[first], normalized[second], tolerance);
      if (!coordinate) continue;
      const evaluations = normalized.map((constraint) => evaluatePoint(constraint, coordinate.x, coordinate.y, tolerance));
      const excludedBy = evaluations
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result === 'outside' || result === 'onBoundaryExcluded');
      intersections.push({
        constraints: [first, second],
        coordinate,
        includedInSolution: excludedBy.length === 0,
        ...(excludedBy.length ? { reason: `Excluded by constraint${excludedBy.length === 1 ? '' : 's'} ${excludedBy.map(({ index }) => index + 1).join(', ')}.` } : {}),
      });
    }
  }
  return intersections;
};

const tighterLower = (current, next, tolerance) => {
  if (!current || next.value > current.value + tolerance) return next;
  if (Math.abs(next.value - current.value) <= tolerance) return { value: current.value, strict: current.strict || next.strict };
  return current;
};
const tighterUpper = (current, next, tolerance) => {
  if (!current || next.value < current.value - tolerance) return next;
  if (Math.abs(next.value - current.value) <= tolerance) return { value: current.value, strict: current.strict || next.strict };
  return current;
};
const intervalEmpty = (lower, upper, tolerance) => lower && upper && (
  lower.value > upper.value + tolerance
  || (Math.abs(lower.value - upper.value) <= tolerance && (lower.strict || upper.strict))
);

// Fourier-Motzkin elimination in two dimensions supplies a real feasibility
// witness. Unlike clipping, this result does not depend on graph bounds.
export const findFeasiblePoint = (inequalities = [], tolerance = DEFAULT_INEQUALITY_TOLERANCE) => {
  const constraints = inequalities.map(asLessThan);
  let xLower = null;
  let xUpper = null;
  const yLower = [];
  const yUpper = [];

  constraints.forEach((constraint) => {
    const { a, b, c, strict } = constraint;
    if (Math.abs(b) <= tolerance) {
      if (Math.abs(a) <= tolerance) return;
      const bound = { value: c / a, strict };
      if (a > 0) xUpper = tighterUpper(xUpper, bound, tolerance);
      else xLower = tighterLower(xLower, bound, tolerance);
    } else if (b > 0) yUpper.push(constraint);
    else yLower.push(constraint);
  });

  yLower.forEach((lower) => yUpper.forEach((upper) => {
    // (cL-aL*x)/bL <= (cU-aU*x)/bU, with bL<0 and bU>0.
    const a = lower.a * upper.b - upper.a * lower.b;
    const c = lower.c * upper.b - upper.c * lower.b;
    const strict = lower.strict || upper.strict;
    if (Math.abs(a) <= tolerance) {
      if (c < -tolerance || (Math.abs(c) <= tolerance && strict)) {
        xLower = { value: 1, strict: false };
        xUpper = { value: 0, strict: false };
      }
    } else {
      const bound = { value: c / a, strict };
      // Multiplication above yields a*x <= c.
      if (a > 0) xUpper = tighterUpper(xUpper, bound, tolerance);
      else xLower = tighterLower(xLower, bound, tolerance);
    }
  }));
  if (intervalEmpty(xLower, xUpper, tolerance)) return null;

  let x = 0;
  if (xLower && xUpper) x = Math.abs(xLower.value - xUpper.value) <= tolerance
    ? (xLower.value + xUpper.value) / 2 : (xLower.value + xUpper.value) / 2;
  else if (xLower) x = xLower.value + (xLower.strict ? 1 : 0);
  else if (xUpper) x = xUpper.value - (xUpper.strict ? 1 : 0);

  let lowerAtX = null;
  let upperAtX = null;
  yLower.forEach(({ a, b, c, strict }) => { lowerAtX = tighterLower(lowerAtX, { value: (c - a * x) / b, strict }, tolerance); });
  yUpper.forEach(({ a, b, c, strict }) => { upperAtX = tighterUpper(upperAtX, { value: (c - a * x) / b, strict }, tolerance); });
  if (intervalEmpty(lowerAtX, upperAtX, tolerance)) return null;
  let y = 0;
  if (lowerAtX && upperAtX) y = Math.abs(lowerAtX.value - upperAtX.value) <= tolerance
    ? (lowerAtX.value + upperAtX.value) / 2 : (lowerAtX.value + upperAtX.value) / 2;
  else if (lowerAtX) y = lowerAtX.value + (lowerAtX.strict ? 1 : 0);
  else if (upperAtX) y = upperAtX.value - (upperAtX.strict ? 1 : 0);

  return constraints.every(({ normalized }) => isPointInInequality(normalized, x, y, tolerance)) ? { x, y } : null;
};

const hasRecessionDirection = (inequalities, tolerance) => {
  const constraints = inequalities.map(asLessThan);
  if (!constraints.length) return true;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  constraints.forEach(({ a, b }) => {
    directions.push([b, -a], [-b, a]);
  });
  return directions.some(([x, y]) => Math.hypot(x, y) > tolerance
    && constraints.every(({ a, b }) => a * x + b * y <= tolerance));
};

export const classifyFeasibleRegion = (inequalities = [], tolerance = DEFAULT_INEQUALITY_TOLERANCE) => {
  const feasiblePoint = findFeasiblePoint(inequalities, tolerance);
  if (!feasiblePoint) return 'empty';
  return hasRecessionDirection(inequalities, tolerance) ? 'unbounded' : 'bounded';
};

export const analyzeInequalitySystem = (inequalities = [], options = {}) => {
  const tolerance = options.tolerance ?? DEFAULT_INEQUALITY_TOLERANCE;
  const constraints = inequalities.map(normalizeLinearInequality);
  const feasiblePoint = findFeasiblePoint(constraints, tolerance);
  const classification = feasiblePoint
    ? (hasRecessionDirection(constraints, tolerance) ? 'unbounded' : 'bounded')
    : 'empty';
  return {
    constraints,
    boundaries: constraints.map(getBoundaryMetadata),
    classification,
    feasiblePoint,
    intersections: boundaryIntersections(constraints, tolerance),
  };
};

export const normalizeSystemsWorkspaceInequalityConfig = (question = {}) => {
  const legacyAllOn = question.studentBuild === true;
  return {
    mode: question.mode || 'linear',
    studentBuild: {
      rewrite: Boolean(question.studentBuild?.rewrite),
      boundary: legacyAllOn || Boolean(question.studentBuild?.boundary),
      lineStyle: legacyAllOn || Boolean(question.studentBuild?.lineStyle),
      shading: legacyAllOn || Boolean(question.studentBuild?.shading),
    },
    reasoning: {
      testPoint: Boolean(question.reasoning?.testPoint),
      boundaryProbe: Boolean(question.reasoning?.boundaryProbe),
      classifyRegion: legacyAllOn || Boolean(question.reasoning?.classifyRegion),
      vertices: Boolean(question.reasoning?.vertices),
    },
  };
};
