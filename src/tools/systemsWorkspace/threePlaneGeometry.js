/*
 * LIGHTWEIGHT 3D GEOMETRY FOR THE THREE-PLANE VISUALIZER (#359).
 *
 * No 3D rendering dependency — plain vector math plus an SVG polygon per
 * plane. Each plane (from `linearEquationForm`, i.e. `ax + by + cz = d`) is
 * clipped against a cube `[-R, R]^3` to a convex polygon (0, or 3-6
 * vertices), the polygon and the axes are rotated by two camera angles and
 * projected orthographically, and the caller renders the result as SVG.
 *
 * This module is pure math: it knows nothing about React, drag handling, or
 * persistence.
 */

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => {
  const len = length(a);
  return len > 1e-9 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
};

/** The 8 corners of `[-R, R]^3`, indexed by a 3-bit sign pattern (bit2=x, bit1=y, bit0=z). */
export const cubeCorners = (R) => {
  const corners = [];
  for (let i = 0; i < 8; i += 1) {
    corners.push([(i & 4) ? R : -R, (i & 2) ? R : -R, (i & 1) ? R : -R]);
  }
  return corners;
};

/** The 12 unique edges of the cube, as pairs of corner indices. */
export const cubeEdges = () => {
  const edges = [];
  for (let i = 0; i < 8; i += 1) {
    [4, 2, 1].forEach((bit) => {
      const j = i ^ bit;
      if (j > i) edges.push([i, j]);
    });
  }
  return edges;
};

/**
 * Clip a plane `a·x + b·y + c·z = d` (from a `linearEquationForm` result and
 * an [x,y,z]-ordered variable list) against the cube `[-R, R]^3`, returning
 * an ordered convex polygon (as 3D points), or null if the plane misses the
 * cube or only touches it along an edge/corner.
 */
export const clipPlaneToCube = (form, variables, R) => {
  const [vx, vy, vz] = variables;
  const a = form?.coefficients?.[vx] ?? 0;
  const b = form?.coefficients?.[vy] ?? 0;
  const c = form?.coefficients?.[vz] ?? 0;
  const d = form?.constant ?? 0;
  if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12 && Math.abs(c) < 1e-12) return null;
  const value = ([x, y, z]) => a * x + b * y + c * z - d;

  const corners = cubeCorners(R);
  const values = corners.map(value);
  const points = [];
  cubeEdges().forEach(([i, j]) => {
    const vi = values[i];
    const vj = values[j];
    if (Math.abs(vi) < 1e-9) points.push(corners[i]);
    if (Math.abs(vj) < 1e-9) points.push(corners[j]);
    if ((vi > 0 && vj < 0) || (vi < 0 && vj > 0)) {
      const t = vi / (vi - vj);
      points.push([
        corners[i][0] + t * (corners[j][0] - corners[i][0]),
        corners[i][1] + t * (corners[j][1] - corners[i][1]),
        corners[i][2] + t * (corners[j][2] - corners[i][2]),
      ]);
    }
  });

  const unique = [];
  points.forEach((point) => {
    if (!unique.some((existing) => Math.hypot(point[0] - existing[0], point[1] - existing[1], point[2] - existing[2]) < 1e-6)) {
      unique.push(point);
    }
  });
  if (unique.length < 3) return null;

  const centroid = unique.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]], [0, 0, 0])
    .map((sum) => sum / unique.length);
  const normal = normalize([a, b, c]);
  const reference = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(normal, reference));
  const v = cross(normal, u);
  const angleOf = (point) => {
    const delta = [point[0] - centroid[0], point[1] - centroid[1], point[2] - centroid[2]];
    return Math.atan2(dot(delta, v), dot(delta, u));
  };
  return [...unique].sort((left, right) => angleOf(left) - angleOf(right));
};

/**
 * Rotate a 3D point by camera azimuth (around the vertical axis) and
 * elevation (tilt), then drop the depth axis for an orthographic 2D
 * projection. `screenY` is negated so positive world-y renders upward.
 */
export const projectPoint = ([x, y, z], { azimuth, elevation }) => {
  const cosA = Math.cos(azimuth);
  const sinA = Math.sin(azimuth);
  const x1 = x * cosA - z * sinA;
  const z1 = x * sinA + z * cosA;
  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);
  const y2 = y * cosE - z1 * sinE;
  const depth = y * sinE + z1 * cosE;
  return { screenX: x1, screenY: -y2, depth };
};

/** The plane's polygon, projected to 2D and tagged with a depth for back-to-front sorting. */
export const projectPolygon = (points3D, camera) => {
  const projected = points3D.map((point) => projectPoint(point, camera));
  const depth = projected.reduce((sum, point) => sum + point.depth, 0) / (projected.length || 1);
  return { points: projected.map(({ screenX, screenY }) => [screenX, screenY]), depth };
};

/** `[a, b, c, d]` for `a·x + b·y + c·z = d`, from a `linearEquationForm` result and an [x,y,z]-ordered variable list. */
const planeVector = (form, variables) => {
  const [vx, vy, vz] = variables;
  return [form?.coefficients?.[vx] ?? 0, form?.coefficients?.[vy] ?? 0, form?.coefficients?.[vz] ?? 0, form?.constant ?? 0];
};

/**
 * The line where two planes meet, clipped to the cube `[-R, R]^3` — the
 * pairwise intersection cue every reviewer of #359/#360 asked for: two
 * translucent polygons alone do not show a student WHERE they meet.
 *
 * Returns `{ points: [p1, p2] }` (two 3D endpoints) if the planes are not
 * parallel and their line crosses the cube, or `null` if they are parallel
 * (including coincident) or the line misses the cube entirely.
 */
export const planePlaneIntersection = (formA, formB, variables, R) => {
  const [a1, b1, c1, d1] = planeVector(formA, variables);
  const [a2, b2, c2, d2] = planeVector(formB, variables);
  const n1 = [a1, b1, c1];
  const n2 = [a2, b2, c2];
  const direction = cross(n1, n2);
  if (length(direction) < 1e-9) return null;

  // The point on the line closest to the origin: the minimum-norm solution
  // of the two plane equations, found by inverting the 2×2 Gram matrix of
  // the two normals.
  const m11 = dot(n1, n1);
  const m12 = dot(n1, n2);
  const m22 = dot(n2, n2);
  const det = m11 * m22 - m12 * m12;
  if (Math.abs(det) < 1e-12) return null;
  const alpha = (d1 * m22 - d2 * m12) / det;
  const beta = (d2 * m11 - d1 * m12) / det;
  const p0 = [
    alpha * n1[0] + beta * n2[0],
    alpha * n1[1] + beta * n2[1],
    alpha * n1[2] + beta * n2[2],
  ];

  // Clip the parametric line p0 + t*direction to the cube: intersect the
  // t-interval each axis allows.
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const u = direction[axis];
    const p = p0[axis];
    if (Math.abs(u) < 1e-12) {
      if (p < -R - 1e-9 || p > R + 1e-9) return null;
      continue;
    }
    const t1 = (-R - p) / u;
    const t2 = (R - p) / u;
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    tMin = Math.max(tMin, lo);
    tMax = Math.min(tMax, hi);
  }
  if (!(tMin <= tMax)) return null;

  const at = (t) => [p0[0] + t * direction[0], p0[1] + t * direction[1], p0[2] + t * direction[2]];
  return { points: [at(tMin), at(tMax)] };
};

/**
 * The single point where all three planes meet, by Cramer's rule — `null`
 * when the system has no unique solution (parallel or dependent planes), the
 * same condition `linearSystemSolution` already tests algebraically. This is
 * a plain geometric restatement so the visualizer can mark the point without
 * importing the algebra engine.
 */
export const threePlaneCommonPoint = (formA, formB, formC, variables) => {
  const [a1, b1, c1, d1] = planeVector(formA, variables);
  const [a2, b2, c2, d2] = planeVector(formB, variables);
  const [a3, b3, c3, d3] = planeVector(formC, variables);
  const det3 = (m) => (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
  const A = [[a1, b1, c1], [a2, b2, c2], [a3, b3, c3]];
  const detA = det3(A);
  if (Math.abs(detA) < 1e-9) return null;
  const withColumn = (col, values) => A.map((row, index) => row.map((value, colIndex) => (colIndex === col ? values[index] : value)));
  const x = det3(withColumn(0, [d1, d2, d3])) / detA;
  const y = det3(withColumn(1, [d1, d2, d3])) / detA;
  const z = det3(withColumn(2, [d1, d2, d3])) / detA;
  return [x, y, z];
};
