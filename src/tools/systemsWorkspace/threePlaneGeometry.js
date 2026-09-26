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
