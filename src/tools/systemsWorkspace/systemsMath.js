const EPS = 1e-9;

export const satisfiesLinearInequality = (inequality = {}, x, y, tolerance = 1e-8) => {
  const lhs = Number(y);
  const rhs = Number(inequality.m ?? 0) * Number(x) + Number(inequality.b ?? 0);
  switch (inequality.relation || '>=') {
    case '>': return lhs > rhs + tolerance;
    case '>=': return lhs >= rhs - tolerance;
    case '<': return lhs < rhs - tolerance;
    case '<=': return lhs <= rhs + tolerance;
    default: return false;
  }
};

const signedBoundaryValue = (ineq, point) => {
  const [x, y] = point;
  return y - (Number(ineq.m ?? 0) * x + Number(ineq.b ?? 0));
};

const insideHalfPlane = (ineq, point) => {
  const value = signedBoundaryValue(ineq, point);
  return (ineq.relation || '>=').includes('>') ? value >= -EPS : value <= EPS;
};

const boundaryIntersection = (ineq, start, end) => {
  const s = signedBoundaryValue(ineq, start);
  const e = signedBoundaryValue(ineq, end);
  const denominator = s - e;
  if (Math.abs(denominator) < EPS) return start;
  const t = s / denominator;
  return [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])];
};

export const clipPolygonWithInequality = (polygon = [], inequality = {}) => {
  if (!polygon.length) return [];
  const output = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const previous = polygon[(i + polygon.length - 1) % polygon.length];
    const currentInside = insideHalfPlane(inequality, current);
    const previousInside = insideHalfPlane(inequality, previous);
    if (currentInside) {
      if (!previousInside) output.push(boundaryIntersection(inequality, previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(boundaryIntersection(inequality, previous, current));
    }
  }
  return output;
};

export const feasibleRegionPolygon = (inequalities = [], bounds = {}) => {
  const xMin = Number(bounds.xMin ?? -10);
  const xMax = Number(bounds.xMax ?? 10);
  const yMin = Number(bounds.yMin ?? -10);
  const yMax = Number(bounds.yMax ?? 10);
  let polygon = [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]];
  inequalities.forEach((inequality) => {
    polygon = clipPolygonWithInequality(polygon, inequality);
  });
  return polygon;
};

export const solveLinearQuadratic = ({ line = {}, quadratic = {} } = {}) => {
  const m = Number(line.m ?? 0);
  const lineB = Number(line.b ?? 0);
  const a = Number(quadratic.a ?? 1);
  const qb = Number(quadratic.b ?? 0);
  const qc = Number(quadratic.c ?? 0);
  if (Math.abs(a) < EPS) return [];
  const A = a;
  const B = qb - m;
  const C = qc - lineB;
  const discriminant = B ** 2 - 4 * A * C;
  if (discriminant < -EPS) return [];
  if (Math.abs(discriminant) <= EPS) {
    const x = -B / (2 * A);
    return [{ x, y: m * x + lineB }];
  }
  const root = Math.sqrt(discriminant);
  const x1 = (-B - root) / (2 * A);
  const x2 = (-B + root) / (2 * A);
  return [{ x: x1, y: m * x1 + lineB }, { x: x2, y: m * x2 + lineB }].sort((p, q) => p.x - q.x);
};

export const solve2x2System = (matrix = {}) => {
  const a = Number(matrix.a11 ?? 1);
  const b = Number(matrix.a12 ?? 0);
  const c = Number(matrix.b1 ?? 0);
  const d = Number(matrix.a21 ?? 0);
  const e = Number(matrix.a22 ?? 1);
  const f = Number(matrix.b2 ?? 0);
  const det = a * e - b * d;
  if (Math.abs(det) > EPS) {
    return { type: 'one', determinant: det, x: (c * e - b * f) / det, y: (a * f - c * d) / det };
  }
  const consistent1 = Math.abs(a * f - c * d) <= EPS;
  const consistent2 = Math.abs(b * f - c * e) <= EPS;
  return { type: consistent1 && consistent2 ? 'infinite' : 'none', determinant: det };
};

export const samePointSet = (studentPoints = [], expectedPoints = [], tolerance = 0.08) => {
  if (studentPoints.length !== expectedPoints.length) return false;
  const remaining = expectedPoints.map((point) => ({ ...point }));
  for (const point of studentPoints) {
    const index = remaining.findIndex((expected) => Math.hypot(Number(point.x) - expected.x, Number(point.y) - expected.y) <= tolerance);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
};
