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
 *
 * No grader reads it. It sits in functions/shared because every pure tool
 * module moved here (src/tools/systemsWorkspace/threePlaneGeometry.js is its
 * `export *` shim), and the idle-orbit timing below stays beside
 * advanceIdleCamera because both clamp a frame by the same
 * IDLE_ORBIT_MAX_FRAME_MS: the budget has to measure exactly the turn the
 * camera made.
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

/** The longest single step the idle orbit takes, however long the gap since the last frame. */
export const IDLE_ORBIT_MAX_FRAME_MS = 80;

/**
 * Advance the camera during the pre-interaction idle orbit.
 *
 * This is deliberately a camera-only cue: it reveals no solution/classification
 * and stops as soon as the student takes control. The frame delta is clamped so
 * returning to a backgrounded tab never causes a sudden jump.
 */
export const advanceIdleCamera = (camera, elapsedMs, speedRadiansPerSecond = 0.22) => {
  const safeCamera = camera && Number.isFinite(camera.azimuth) && Number.isFinite(camera.elevation)
    ? camera
    : { azimuth: 0, elevation: 0.5 };
  const deltaMs = Math.max(0, Math.min(IDLE_ORBIT_MAX_FRAME_MS, Number(elapsedMs) || 0));
  const speed = Number.isFinite(speedRadiansPerSecond) ? speedRadiansPerSecond : 0.22;
  return {
    azimuth: safeCamera.azimuth + (deltaMs / 1000) * speed,
    elevation: safeCamera.elevation,
  };
};

/*
 * HOW LONG THE IDLE ORBIT RUNS, AND WHEN IT WAITS (deep dive 2026-10-01, §10.6).
 *
 * The orbit exists so the flat SVG reads as a 3D object the moment it appears.
 * It used to run from mount until the student's first touch — which may never
 * come — re-rendering the whole model about sixty times a second for the rest
 * of the class period, including while it was scrolled off-screen. On a school
 * Chromebook that is a core kept busy all day for a cue that has done its job
 * in the first few seconds.
 *
 * TEN SECONDS OF ORBIT, THEN IT STOPS WHERE IT IS. Depth from rotation is
 * seen within the first second or two of motion; the rest of the ten seconds
 * is for a student whose eyes reach the model late, because the layout puts
 * the three equations first and a student reads them before looking across.
 * At the orbit's 0.22 rad/s, ten seconds is 2.2 rad (about 126°) — more than
 * a quarter turn, so each plane is seen from clearly different sides. It costs
 * about 600 renders per model instead of about 216,000 an hour, and the model
 * is still by the time the student is working the questions beneath it, with
 * nothing moving at the edge of their eye. The camera is left where it ends —
 * snapping back would be a jump nobody asked for — and "Reset view" returns to
 * the opening angle.
 *
 * ONLY ORBIT SOMEONE COULD SEE IS SPENT. While the model is off-screen or the
 * tab is hidden the orbit waits, unspent, and a model first scrolled into view
 * minutes later still gets all ten seconds. A long gap between frames counts
 * as one clamped step, the same IDLE_ORBIT_MAX_FRAME_MS advanceIdleCamera
 * allows, so the budget measures exactly the turn the camera made.
 */
export const IDLE_ORBIT_BUDGET_MS = 10_000;

/**
 * Whether the idle orbit should be animating right now.
 *
 *   'off'      the student has taken control, or prefers reduced motion —
 *              these decide first, exactly as before the budget existed
 *   'finished' the budget is spent; the camera stays where the orbit left it
 *   'paused'   the model is off-screen or the page hidden; nothing is spent
 *   'running'  animate
 */
export const idleOrbitPhase = ({
  hasInteracted = false,
  reduceMotion = false,
  budgetSpent = false,
  onScreen = true,
  pageHidden = false,
} = {}) => {
  if (hasInteracted || reduceMotion) return 'off';
  if (budgetSpent) return 'finished';
  if (!onScreen || pageHidden) return 'paused';
  return 'running';
};

/**
 * Whether the orbit is still to come: under way, or waiting to be seen. Only
 * then may the model say it is auto-rotating — a paused orbit resumes the
 * moment anyone can see the model, but a finished or switched-off one never
 * turns again.
 */
export const idleOrbitPending = (phase) => phase === 'running' || phase === 'paused';

/**
 * Spend one animation frame of the orbit budget.
 *
 * `spentMs` is the orbit already shown and `elapsedMs` the time since the
 * previous frame. Returns `{ stepMs, spentMs, budgetSpent }`: `stepMs` is how
 * far to turn the camera (pass it to advanceIdleCamera) — clamped like a frame
 * there, and never past what is left of the budget, so the final frame turns
 * only the remainder and the orbit ends exactly on budget.
 */
export const spendIdleOrbitFrame = (spentMs, elapsedMs, budgetMs = IDLE_ORBIT_BUDGET_MS) => {
  const budget = Number.isFinite(Number(budgetMs)) && Number(budgetMs) >= 0 ? Number(budgetMs) : IDLE_ORBIT_BUDGET_MS;
  const spent = Math.min(budget, Math.max(0, Number(spentMs) || 0));
  const frame = Math.max(0, Math.min(IDLE_ORBIT_MAX_FRAME_MS, Number(elapsedMs) || 0));
  const stepMs = Math.min(frame, budget - spent);
  return { stepMs, spentMs: spent + stepMs, budgetSpent: spent + stepMs >= budget };
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

/** The world-space direction a `{ azimuth, elevation }` camera looks along (the `depth` axis of projectPoint). */
export const cameraViewDirection = ({ azimuth, elevation }) => [
  Math.sin(azimuth) * Math.cos(elevation),
  Math.sin(elevation),
  Math.cos(azimuth) * Math.cos(elevation),
];

/**
 * How face-on each plane is from `camera`: |n̂ · view|, 1 for a plane seen
 * square-on, 0 for one seen edge-on (a line). Planes with no normal are skipped.
 */
export const planeFacing = (forms, variables, camera) => {
  const view = cameraViewDirection(camera);
  return forms.map((form) => {
    const normal = planeVector(form, variables).slice(0, 3);
    const size = length(normal);
    if (size < 1e-9) return null;
    return Math.abs((normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2]) / size);
  });
};

/**
 * THE OPENING VIEW OF THE THREE-PLANE MODEL (#361).
 *
 * One fixed angle for every system showed the Day 1 system with two of its
 * three planes almost edge-on — thin slivers — so the first 3D picture a
 * first-time learner saw was one big plane and two lines. This picks, among
 * upright views (no roll, moderate elevation), the one in which the LEAST
 * face-on plane is as face-on as possible, preferring the old default on a
 * tie. It is a camera choice only: nothing about the system is computed for
 * the student, and they can still rotate anywhere.
 */
export const legibleCamera = (forms, variables, fallback = { azimuth: -0.7, elevation: 0.5 }) => {
  const usable = (forms || []).filter((form) => form && length(planeVector(form, variables).slice(0, 3)) > 1e-9);
  if (!usable.length) return { ...fallback };
  let best = null;
  for (let step = -36; step < 36; step += 1) {
    const azimuth = (step * Math.PI) / 36;
    for (let tenth = 4; tenth <= 18; tenth += 1) {
      const elevation = tenth / 20;
      const facing = planeFacing(usable, variables, { azimuth, elevation }).filter((value) => value != null);
      const score = Math.min(...facing);
      const distance = Math.hypot(azimuth - fallback.azimuth, elevation - fallback.elevation);
      if (!best || score > best.score + 1e-6 || (Math.abs(score - best.score) <= 1e-6 && distance < best.distance)) {
        best = { azimuth, elevation, score, distance };
      }
    }
  }
  return { azimuth: best.azimuth, elevation: best.elevation };
};
