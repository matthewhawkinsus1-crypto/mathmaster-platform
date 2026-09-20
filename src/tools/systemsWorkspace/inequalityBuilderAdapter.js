/*
 * TEMPORARY ADAPTER — isolated on purpose, expected rebase point below.
 *
 * Codex owns the canonical systems-of-inequalities math engine (normalization,
 * half-plane tests, feasible-region/vertex geometry, bounded/unbounded/empty
 * classification — see the "CODEX PARALLEL WORK" section of the Systems
 * Workspace 2.0 task). That engine was not merged at the time this file was
 * written, and the engine that DOES already exist in this repo
 * (`./systemsMath.js`) only models a boundary as `y R m*x + b`, which cannot
 * express a vertical line (`x = c`) — something the student boundary-builder
 * is explicitly required to support.
 *
 * Rather than bolt vertical-line special cases onto every call site, this file
 * defines one generalized standard-form boundary — `{ A, B, C, relation }`
 * meaning `A*x + B*y  R  C` — that a slanted, horizontal, OR vertical line can
 * be expressed in, and reimplements (not duplicates for its own sake, but
 * because the existing engine's shape cannot hold a vertical line) the same
 * half-plane clipping idea `systemsMath.js` already uses.
 *
 * REBASE POINT: once Codex's engine lands, `StudentBuildInequalityMode` (in
 * `SystemsWorkspace.jsx`) should import feasible-region/classification/vertex
 * geometry from that engine instead of this file. The exported names below are
 * the seam — keep them stable, or update the two call sites in
 * `SystemsWorkspace.jsx` that import from here.
 */

const EPS = 1e-9;

/** A boundary's "kind" from its standard-form coefficients. */
export const boundaryKind = (boundary) => {
  const A = Number(boundary?.A ?? 0);
  const B = Number(boundary?.B ?? 0);
  if (Math.abs(B) <= EPS) return 'vertical'; // A*x = C  ->  x = C/A
  if (Math.abs(A) <= EPS) return 'horizontal'; // B*y = C  ->  y = C/B
  return 'slanted';
};

/** y = m x + b, R the relation (e.g. '<=', '>'). Encoded as -m*x + 1*y R b. */
export const boundaryFromSlopeIntercept = (m, b, relation = '>=') => ({
  A: -Number(m), B: 1, C: Number(b), relation,
});

/** x = c (a vertical line), R applied to x directly. */
export const boundaryFromVertical = (c, relation = '>=') => ({
  A: 1, B: 0, C: Number(c), relation,
});

/** y = c (a horizontal line). Same shape as slope-intercept with m = 0. */
export const boundaryFromHorizontal = (c, relation = '>=') => ({
  A: 0, B: 1, C: Number(c), relation,
});

/**
 * The boundary through two distinct points, oriented so a vertical pair of
 * points still produces a legitimate boundary. Returns null only when the two
 * points coincide (no line is determined).
 */
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

/**
 * Converts the platform's existing authored inequality shape into a standard
 * boundary. Accepts the long-standing `{ m, b, relation }` shape unchanged
 * (so every existing authored question keeps working), plus two new optional
 * authoring shapes this feature introduces for lines the old shape cannot
 * express: `{ orientation: 'vertical', x, relation }` and
 * `{ orientation: 'horizontal', y, relation }`.
 */
export const authoredBoundaryFromInequality = (inequality = {}) => {
  if (inequality.orientation === 'vertical') return boundaryFromVertical(inequality.x, inequality.relation || '>=');
  if (inequality.orientation === 'horizontal') return boundaryFromHorizontal(inequality.y, inequality.relation || '>=');
  return boundaryFromSlopeIntercept(inequality.m ?? 0, inequality.b ?? 0, inequality.relation || '>=');
};

const evaluate = (boundary, x, y) => Number(boundary.A ?? 0) * Number(x) + Number(boundary.B ?? 0) * Number(y);

/** Does (x, y) satisfy A*x + B*y R C, within tolerance? */
export const satisfiesBoundary = (boundary = {}, x, y, tolerance = 1e-6) => {
  const lhs = evaluate(boundary, x, y);
  const rhs = Number(boundary.C ?? 0);
  switch (boundary.relation || '>=') {
    case '>': return lhs > rhs + tolerance;
    case '>=': return lhs >= rhs - tolerance;
    case '<': return lhs < rhs - tolerance;
    case '<=': return lhs <= rhs + tolerance;
    default: return false;
  }
};

/** Perpendicular distance from (x, y) to the boundary's line, ignoring its relation. */
export const distanceToBoundaryLine = (boundary = {}, x, y) => {
  const A = Number(boundary.A ?? 0);
  const B = Number(boundary.B ?? 0);
  const norm = Math.hypot(A, B);
  if (norm <= EPS) return Infinity;
  return Math.abs(evaluate(boundary, x, y) - Number(boundary.C ?? 0)) / norm;
};

export const pointOnBoundaryLine = (boundary, x, y, tolerance = 0.08) => (
  distanceToBoundaryLine(boundary, x, y) <= tolerance
);

const insideHalfPlane = (boundary, point) => {
  const value = evaluate(boundary, point[0], point[1]) - Number(boundary.C ?? 0);
  return String(boundary.relation || '>=').includes('>') ? value >= -EPS : value <= EPS;
};

const edgeIntersection = (boundary, start, end) => {
  const s = evaluate(boundary, start[0], start[1]) - Number(boundary.C ?? 0);
  const e = evaluate(boundary, end[0], end[1]) - Number(boundary.C ?? 0);
  const denominator = s - e;
  if (Math.abs(denominator) < EPS) return start;
  const t = s / denominator;
  return [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])];
};

/** Sutherland-Hodgman clip of `polygon` against one half-plane. */
export const clipPolygonWithBoundary = (polygon = [], boundary = {}) => {
  if (!polygon.length) return [];
  const output = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const previous = polygon[(i + polygon.length - 1) % polygon.length];
    const currentInside = insideHalfPlane(boundary, current);
    const previousInside = insideHalfPlane(boundary, previous);
    if (currentInside) {
      if (!previousInside) output.push(edgeIntersection(boundary, previous, current));
      output.push(current);
    } else if (previousInside) {
      output.push(edgeIntersection(boundary, previous, current));
    }
  }
  return output;
};

/** Clips the authored bounds rectangle through every boundary, in order. */
export const feasibleRegionPolygon = (boundaries = [], bounds = {}) => {
  const xMin = Number(bounds.xMin ?? -10);
  const xMax = Number(bounds.xMax ?? 10);
  const yMin = Number(bounds.yMin ?? -10);
  const yMax = Number(bounds.yMax ?? 10);
  let polygon = [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]];
  boundaries.forEach((boundary) => { polygon = clipPolygonWithBoundary(polygon, boundary); });
  return polygon;
};

/**
 * `feasibleRegionPolygon` clips against the authored viewing window, so a
 * genuinely unbounded region and a bounded one that merely reaches the edge of
 * the graph both produce a polygon touching that window's border. Treat
 * "touches the border" as unbounded — the same proxy the existing
 * `systemsMath.js` engine's rendering already relies on, made explicit here so
 * a classification question can be graded from it instead of just drawn.
 */
export const classifyFeasibleRegion = (polygon = [], bounds = {}) => {
  if (!polygon || polygon.length < 3) return 'none';
  const xMin = Number(bounds.xMin ?? -10);
  const xMax = Number(bounds.xMax ?? 10);
  const yMin = Number(bounds.yMin ?? -10);
  const yMax = Number(bounds.yMax ?? 10);
  const margin = Math.max(xMax - xMin, yMax - yMin) * 1e-4;
  const touchesEdge = polygon.some(([x, y]) => (
    x <= xMin + margin || x >= xMax - margin || y <= yMin + margin || y >= yMax - margin
  ));
  return touchesEdge ? 'unbounded' : 'bounded';
};

/**
 * Where two boundary LINES cross (ignoring both relations) — a candidate
 * vertex. Returns null for parallel (including identical) lines.
 */
export const intersectBoundaryLines = (first, second) => {
  const A1 = Number(first?.A ?? 0); const B1 = Number(first?.B ?? 0); const C1 = Number(first?.C ?? 0);
  const A2 = Number(second?.A ?? 0); const B2 = Number(second?.B ?? 0); const C2 = Number(second?.C ?? 0);
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) <= EPS) return null;
  return [(C1 * B2 - C2 * B1) / det, (A1 * C2 - A2 * C1) / det];
};

/**
 * Every pairwise intersection of the given boundaries that itself satisfies
 * every OTHER boundary (non-strictly) — i.e. every geometric corner of the
 * region those boundaries bound, whether or not the corner survives strict
 * inequalities. `included` additionally requires the two boundaries meeting at
 * that corner to both be non-strict there, which is the "a vertex can exist
 * geometrically while being excluded by a dashed boundary" distinction the
 * vertex mode needs.
 */
export const feasibleRegionVertices = (boundaries = [], tolerance = 1e-6) => {
  const vertices = [];
  for (let i = 0; i < boundaries.length; i += 1) {
    for (let j = i + 1; j < boundaries.length; j += 1) {
      const point = intersectBoundaryLines(boundaries[i], boundaries[j]);
      if (!point) continue;
      const [x, y] = point;
      const onEveryOtherBoundary = boundaries.every((boundary, index) => (
        index === i || index === j || satisfiesBoundary(boundary, x, y, 1e-4)
      ));
      if (!onEveryOtherBoundary) continue;
      const strictHere = (boundary) => !String(boundary.relation || '>=').includes('=');
      const included = !strictHere(boundaries[i]) && !strictHere(boundaries[j]);
      const duplicate = vertices.some((existing) => Math.hypot(existing.x - x, existing.y - y) <= tolerance);
      if (!duplicate) vertices.push({ x, y, included, boundaries: [i, j] });
    }
  }
  return vertices;
};

/** The visible line segment for a boundary, clipped to a rectangular window — for drawing, not grading. */
export const lineSegmentForBounds = (boundary, bounds = {}) => {
  const xMin = Number(bounds.xMin ?? -10);
  const xMax = Number(bounds.xMax ?? 10);
  const yMin = Number(bounds.yMin ?? -10);
  const yMax = Number(bounds.yMax ?? 10);
  const kind = boundaryKind(boundary);
  if (kind === 'vertical') {
    const x = Number(boundary.C) / Number(boundary.A || 1);
    return [[x, yMin], [x, yMax]];
  }
  if (kind === 'horizontal') {
    const y = Number(boundary.C) / Number(boundary.B || 1);
    return [[xMin, y], [xMax, y]];
  }
  const m = -Number(boundary.A) / Number(boundary.B);
  const b = Number(boundary.C) / Number(boundary.B);
  return [[xMin, m * xMin + b], [xMax, m * xMax + b]];
};

/** Which side of a boundary LINE a point is on, as a plain +1/-1/0 sign (0 = on the line). */
export const sideOfBoundaryLine = (boundary, x, y, tolerance = 1e-6) => {
  const value = evaluate(boundary, x, y) - Number(boundary.C ?? 0);
  if (Math.abs(value) <= tolerance) return 0;
  return value > 0 ? 1 : -1;
};

/** Builds a boundary with the relation implied by which side a chosen point is on. */
export const boundaryWithChosenSide = (boundary, side, strict) => ({
  ...boundary,
  relation: side >= 0 ? (strict ? '>' : '>=') : (strict ? '<' : '<='),
});
