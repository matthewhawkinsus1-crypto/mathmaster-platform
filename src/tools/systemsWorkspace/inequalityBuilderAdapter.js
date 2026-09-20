/*
 * Systems Workspace student-build bridge.
 *
 * PR #293 owns the canonical inequality mathematics. This module now contains
 * only UI-facing construction/rendering adapters around that engine; it does
 * not maintain a second feasibility, classification, or intersection engine.
 *
 * Canonical form everywhere below:
 *   A*x + B*y + C relation 0
 */
import {
  boundaryIntersections,
  classifyFeasibleRegion as classifyCanonicalFeasibleRegion,
  evaluatePoint,
  isPointInInequality,
  normalizeLinearInequality,
} from './linearInequalityEngine.js';
import {
  clipPolygonWithInequality,
  feasibleRegionPolygon as canonicalFeasibleRegionPolygon,
} from './systemsMath.js';

const EPS = 1e-9;

export const boundaryKind = (boundary) => {
  const { A, B } = normalizeLinearInequality(boundary);
  if (Math.abs(B) <= EPS) return 'vertical';
  if (Math.abs(A) <= EPS) return 'horizontal';
  return 'slanted';
};

export const boundaryFromSlopeIntercept = (m, b, relation = '>=') => (
  normalizeLinearInequality({ m:Number(m), b:Number(b), relation })
);

export const boundaryFromVertical = (c, relation = '>=') => (
  normalizeLinearInequality({ A:1, B:0, C:-Number(c), relation })
);

export const boundaryFromHorizontal = (c, relation = '>=') => (
  normalizeLinearInequality({ A:0, B:1, C:-Number(c), relation })
);

export const boundaryFromTwoPoints = (p1, p2, relation = '>=') => {
  const [x1, y1] = p1 || [];
  const [x2, y2] = p2 || [];
  if ([x1, y1, x2, y2].some((value) => value == null || !Number.isFinite(Number(value)))) return null;
  if (Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1)) <= EPS) return null;
  if (Math.abs(Number(x2) - Number(x1)) <= EPS) return boundaryFromVertical(x1, relation);
  const m = (Number(y2) - Number(y1)) / (Number(x2) - Number(x1));
  const b = Number(y1) - m * Number(x1);
  return boundaryFromSlopeIntercept(m, b, relation);
};

export const authoredBoundaryFromInequality = (inequality = {}) => {
  if (inequality.orientation === 'vertical') return boundaryFromVertical(inequality.x, inequality.relation || '>=');
  if (inequality.orientation === 'horizontal') return boundaryFromHorizontal(inequality.y, inequality.relation || '>=');
  return normalizeLinearInequality(inequality);
};

export const satisfiesBoundary = (boundary = {}, x, y, tolerance = 1e-6) => (
  isPointInInequality(boundary, x, y, tolerance)
);

export const distanceToBoundaryLine = (boundary = {}, x, y) => {
  const { A, B, C } = normalizeLinearInequality(boundary);
  const norm = Math.hypot(A, B);
  if (norm <= EPS) return Infinity;
  return Math.abs(A * Number(x) + B * Number(y) + C) / norm;
};

export const pointOnBoundaryLine = (boundary, x, y, tolerance = 0.08) => (
  distanceToBoundaryLine(boundary, x, y) <= tolerance
);

export const clipPolygonWithBoundary = (polygon = [], boundary = {}) => (
  clipPolygonWithInequality(polygon, normalizeLinearInequality(boundary))
);

export const feasibleRegionPolygon = (boundaries = [], bounds = {}) => (
  canonicalFeasibleRegionPolygon(boundaries.map(authoredBoundaryFromInequality), bounds)
);

// Mathematical classification is viewport-independent and always comes from
// the canonical PR #293 engine.
export const classifyFeasibleRegion = (boundaries = []) => (
  classifyCanonicalFeasibleRegion(boundaries.map(authoredBoundaryFromInequality))
);

export const intersectBoundaryLines = (first, second) => {
  const intersection = boundaryIntersections([
    authoredBoundaryFromInequality(first),
    authoredBoundaryFromInequality(second),
  ])[0];
  return intersection ? [intersection.coordinate.x, intersection.coordinate.y] : null;
};

// Keep only intersections that are geometric corners of the feasible region:
// points may sit on a strict boundary (excluded) but may not lie outside any
// other constraint. Inclusion itself comes directly from the canonical engine.
export const feasibleRegionVertices = (boundaries = [], tolerance = 1e-6) => {
  const canonical = boundaries.map(authoredBoundaryFromInequality);
  const vertices = [];
  boundaryIntersections(canonical, tolerance).forEach((intersection) => {
    const { x, y } = intersection.coordinate;
    const evaluations = canonical.map((constraint) => evaluatePoint(constraint, x, y, Math.max(tolerance, 1e-8)));
    if (evaluations.some((result) => result === 'outside')) return;
    if (vertices.some((existing) => Math.hypot(existing.x - x, existing.y - y) <= tolerance)) return;
    vertices.push({
      x,
      y,
      included: intersection.includedInSolution,
      boundaries: intersection.constraints,
      reason: intersection.reason || null,
    });
  });
  return vertices;
};

export const lineSegmentForBounds = (boundary, bounds = {}) => {
  const { A, B, C } = normalizeLinearInequality(boundary);
  const xMin = Number(bounds.xMin ?? -10);
  const xMax = Number(bounds.xMax ?? 10);
  const yMin = Number(bounds.yMin ?? -10);
  const yMax = Number(bounds.yMax ?? 10);
  if (Math.abs(B) <= EPS) {
    const x = -C / A;
    return [[x, yMin], [x, yMax]];
  }
  if (Math.abs(A) <= EPS) {
    const y = -C / B;
    return [[xMin, y], [xMax, y]];
  }
  const m = -A / B;
  const b = -C / B;
  return [[xMin, m * xMin + b], [xMax, m * xMax + b]];
};

export const sideOfBoundaryLine = (boundary, x, y, tolerance = 1e-6) => {
  const { A, B, C } = normalizeLinearInequality(boundary);
  const value = A * Number(x) + B * Number(y) + C;
  if (Math.abs(value) <= tolerance) return 0;
  return value > 0 ? 1 : -1;
};

export const boundaryWithChosenSide = (boundary, side, strict) => ({
  ...normalizeLinearInequality(boundary),
  relation: side >= 0 ? (strict ? '>' : '>=') : (strict ? '<' : '<='),
});
