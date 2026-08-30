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


const matrix3Row = (row = {}) => (
  Array.isArray(row) ? row.slice(0, 4).map(Number) : [row.a, row.b, row.c, row.d].map(Number)
);

export const normalizeMatrix3 = (matrix = {}) => {
  const rows = Array.isArray(matrix) ? matrix : (Array.isArray(matrix.rows) ? matrix.rows : []);
  if (rows.length !== 3) return [];
  const normalized = rows.map(matrix3Row);
  return normalized.every((row) => row.length === 4 && row.every(Number.isFinite)) ? normalized : [];
};

export const rref3x4 = (matrix = {}) => {
  const rows = normalizeMatrix3(matrix);
  if (!rows.length) return { type: null, matrix: [] };
  const a = rows.map((row) => [...row]);
  let pivotRow = 0;
  const pivotColumns = [];
  for (let col = 0; col < 3 && pivotRow < 3; col += 1) {
    let best = pivotRow;
    for (let row = pivotRow + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[best][col])) best = row;
    }
    if (Math.abs(a[best][col]) <= EPS) continue;
    [a[pivotRow], a[best]] = [a[best], a[pivotRow]];
    const pivot = a[pivotRow][col];
    a[pivotRow] = a[pivotRow].map((entry) => entry / pivot);
    for (let row = 0; row < 3; row += 1) {
      if (row === pivotRow) continue;
      const factor = a[row][col];
      if (Math.abs(factor) <= EPS) continue;
      a[row] = a[row].map((entry, index) => entry - factor * a[pivotRow][index]);
    }
    pivotColumns.push(col);
    pivotRow += 1;
  }
  const reduced = a.map((row) => row.map((entry) => (Math.abs(entry) <= EPS ? 0 : entry)));
  if (reduced.some((row) => row.slice(0, 3).every((entry) => Math.abs(entry) <= EPS) && Math.abs(row[3]) > EPS)) {
    return { type: 'none', matrix: reduced };
  }
  if (pivotColumns.length < 3) return { type: 'infinite', matrix: reduced };
  return { type: 'one', matrix: reduced, x: reduced[0][3], y: reduced[1][3], z: reduced[2][3] };
};

export const applyMatrix3RowOperation = (matrix = {}, operation = {}) => {
  const rows = normalizeMatrix3(matrix);
  if (!rows.length) return null;
  const target = Number(operation.targetRow);
  const source = Number(operation.sourceRow);
  const factor = Number(operation.factor);
  if (![target, source, factor].every(Number.isFinite) || target < 0 || target > 2 || source < 0 || source > 2 || target === source) return null;
  return rows[target].map((entry, index) => entry - factor * rows[source][index]);
};

export const applyMatrix3RowOperationToMatrix = (matrix = {}, operation = {}) => {
  const rows = normalizeMatrix3(matrix);
  if (!rows.length) return null;
  const target = Number(operation.targetRow);
  const nextRow = applyMatrix3RowOperation({ rows }, operation);
  if (!nextRow || !Number.isInteger(target) || target < 0 || target > 2) return null;
  const next = rows.map((row) => [...row]);
  next[target] = nextRow;
  return next;
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
