/*
 * ISSUE #359, PART C — THREE-PLANE VISUALIZER GEOMETRY.
 *
 * Pure math tests for threePlaneGeometry.js: clipping a plane to a cube
 * produces a correct convex polygon, and rotation/projection behave
 * sensibly, using the Day 1 system's own planes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { linearEquationForm } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import {
  IDLE_ORBIT_BUDGET_MS,
  IDLE_ORBIT_MAX_FRAME_MS,
  advanceIdleCamera,
  clipPlaneToCube,
  cubeCorners,
  cubeEdges,
  idleOrbitPending,
  idleOrbitPhase,
  planePlaneIntersection,
  projectPoint,
  projectPolygon,
  spendIdleOrbitFrame,
  threePlaneCommonPoint,
} from '../../src/tools/systemsWorkspace/threePlaneGeometry.js';

const XYZ = ['x', 'y', 'z'];

test('cubeCorners and cubeEdges describe a proper cube', () => {
  const corners = cubeCorners(5);
  assert.equal(corners.length, 8);
  assert.ok(corners.every(([x, y, z]) => [x, y, z].every((v) => Math.abs(v) === 5)));
  const edges = cubeEdges();
  assert.equal(edges.length, 12);
  edges.forEach(([i, j]) => {
    const a = corners[i];
    const b = corners[j];
    const differing = a.filter((value, index) => value !== b[index]).length;
    assert.equal(differing, 1, 'a cube edge differs in exactly one coordinate');
  });
});

test('a coordinate plane (z = 0) clips to a square face-diagonal polygon spanning the whole cube', () => {
  const form = { coefficients: { x: 0, y: 0, z: 1 }, constant: 0 };
  const polygon = clipPlaneToCube(form, XYZ, 5);
  assert.ok(polygon);
  assert.equal(polygon.length, 4);
  polygon.forEach(([x, y, z]) => {
    assert.ok(Math.abs(z) < 1e-9, 'every vertex lies on z = 0');
    assert.ok(Math.abs(x) <= 5 + 1e-9 && Math.abs(y) <= 5 + 1e-9);
  });
});

test('a plane entirely outside the cube does not clip to a polygon', () => {
  const form = { coefficients: { x: 1, y: 0, z: 0 }, constant: 100 };
  assert.equal(clipPlaneToCube(form, XYZ, 5), null);
});

test('a degenerate "plane" with all-zero coefficients is refused, never treated as z = -d', () => {
  const form = { coefficients: { x: 0, y: 0, z: 0 }, constant: 7 };
  assert.equal(clipPlaneToCube(form, XYZ, 5), null);
});

test('every vertex of a clipped polygon actually satisfies the plane equation', () => {
  // A diagonal plane through the Day 1 system's first equation.
  const form = linearEquationForm('2x - y + 2z = 15', XYZ);
  const R = 10;
  const polygon = clipPlaneToCube(form, XYZ, R);
  assert.ok(polygon && polygon.length >= 3, 'the Day 1 plane must intersect a cube this large');
  polygon.forEach(([x, y, z]) => {
    const residual = 2 * x - y + 2 * z - 15;
    assert.ok(Math.abs(residual) < 1e-6, `vertex (${x},${y},${z}) is not on the plane (residual ${residual})`);
    assert.ok(Math.abs(x) <= R + 1e-6 && Math.abs(y) <= R + 1e-6 && Math.abs(z) <= R + 1e-6, 'vertex must lie inside the cube');
  });
});

test('the clipped polygon is convex and simple (its vertices are already in angular order)', () => {
  const form = linearEquationForm('-x + y + z = 3', XYZ);
  const polygon = clipPlaneToCube(form, XYZ, 8);
  assert.ok(polygon && polygon.length >= 3);
  // Cross products of consecutive edges (projected onto the plane's own
  // normal-aligned winding) should all point the same way for a convex,
  // correctly-ordered polygon — check via signed area sign consistency using
  // the shoelace-style triple product against the plane normal.
  const normal = (() => {
    const a = form.coefficients.x;
    const b = form.coefficients.y;
    const c = form.coefficients.z;
    const len = Math.hypot(a, b, c);
    return [a / len, b / len, c / len];
  })();
  const cross3 = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const n = polygon.length;
  const signs = polygon.map((point, index) => {
    const prev = polygon[(index - 1 + n) % n];
    const next = polygon[(index + 1) % n];
    const edgeIn = [point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]];
    const edgeOut = [next[0] - point[0], next[1] - point[1], next[2] - point[2]];
    return Math.sign(dot3(cross3(edgeIn, edgeOut), normal));
  });
  const nonZero = signs.filter((sign) => sign !== 0);
  assert.ok(nonZero.every((sign) => sign === nonZero[0]), `polygon turns are not all consistent: ${signs.join(',')}`);
});

test('projectPoint at zero rotation drops z and keeps x, flips y for screen coordinates', () => {
  const projected = projectPoint([3, 4, 5], { azimuth: 0, elevation: 0 });
  assert.equal(projected.screenX, 3);
  assert.equal(projected.screenY, -4);
  assert.equal(projected.depth, 5);
});

test('a full 2π rotation returns a point to its original projection', () => {
  const camera = { azimuth: Math.PI / 3, elevation: Math.PI / 5 };
  const cameraFull = { azimuth: Math.PI / 3 + 2 * Math.PI, elevation: Math.PI / 5 + 2 * Math.PI };
  const a = projectPoint([1, 2, 3], camera);
  const b = projectPoint([1, 2, 3], cameraFull);
  assert.ok(Math.abs(a.screenX - b.screenX) < 1e-9);
  assert.ok(Math.abs(a.screenY - b.screenY) < 1e-9);
  assert.ok(Math.abs(a.depth - b.depth) < 1e-9);
});

test('idle camera orbit advances azimuth gently without changing elevation', () => {
  const camera = { azimuth: -0.7, elevation: 0.55 };
  const advanced = advanceIdleCamera(camera, 50, 0.2);
  assert.ok(Math.abs(advanced.azimuth - (-0.69)) < 1e-9);
  assert.equal(advanced.elevation, camera.elevation);
  assert.deepEqual(camera, { azimuth: -0.7, elevation: 0.55 }, 'helper must not mutate the live camera object');
});

test('idle camera orbit clamps long frame gaps so returning to the tab never jumps', () => {
  const camera = { azimuth: 1, elevation: 0.4 };
  const advanced = advanceIdleCamera(camera, 5000, 0.25);
  assert.ok(Math.abs(advanced.azimuth - 1.02) < 1e-9, '5000ms gap should clamp to an 80ms visual step');
  assert.equal(advanced.elevation, 0.4);
});

/* ------------------------------------------- the idle orbit's budget (§10.6) */

// The component's loop, frame by frame: it runs only while the phase is
// 'running', and the first frame after starting or resuming only sets the clock.
const simulateIdleOrbit = ({ frames, frameMs = 1000 / 60, seen = () => true, speed = 0.22 }) => {
  const opening = { azimuth: -0.7, elevation: 0.55 };
  let camera = opening;
  let shownMs = 0;
  let budgetSpent = false;
  let previous = null;
  let rendersWhileUnseen = 0;
  const pendingAt = [];
  for (let index = 0; index < frames; index += 1) {
    const timestamp = index * frameMs;
    const visible = seen(timestamp);
    const phase = idleOrbitPhase({ budgetSpent, onScreen: visible });
    pendingAt.push(idleOrbitPending(phase));
    if (phase !== 'running') {
      previous = null;
      continue;
    }
    const frame = spendIdleOrbitFrame(shownMs, previous == null ? 0 : timestamp - previous);
    previous = timestamp;
    shownMs = frame.spentMs;
    if (frame.stepMs > 0) {
      camera = advanceIdleCamera(camera, frame.stepMs, speed);
      if (!visible) rendersWhileUnseen += 1;
    }
    if (frame.budgetSpent) budgetSpent = true;
  }
  return { camera, opening, shownMs, budgetSpent, rendersWhileUnseen, pendingAt };
};

test('the idle orbit has a budget of seconds, long enough to turn the model more than a quarter turn', () => {
  assert.ok(Number.isFinite(IDLE_ORBIT_BUDGET_MS) && IDLE_ORBIT_BUDGET_MS > 0, 'the orbit must end');
  assert.ok(IDLE_ORBIT_BUDGET_MS <= 12_000, 'seconds of motion, not the whole class period');
  assert.ok((IDLE_ORBIT_BUDGET_MS / 1000) * 0.22 > Math.PI / 2, 'at the orbit speed the model turns past a quarter turn before it stops');
});

test('the orbit stops after its budget and leaves the camera exactly where the budget took it', () => {
  // Three times the budget's worth of 60 fps frames: the orbit must not run on.
  const frames = Math.ceil((IDLE_ORBIT_BUDGET_MS / 1000) * 60 * 3);
  const run = simulateIdleOrbit({ frames });
  assert.equal(run.budgetSpent, true);
  assert.equal(run.shownMs, IDLE_ORBIT_BUDGET_MS);
  const turned = run.camera.azimuth - run.opening.azimuth;
  assert.ok(Math.abs(turned - (IDLE_ORBIT_BUDGET_MS / 1000) * 0.22) < 1e-9, `the camera turned ${turned} rad, not the budget's worth`);
  assert.equal(run.camera.elevation, run.opening.elevation);
  // Pending until the budget runs out, then never again.
  const lastPending = run.pendingAt.lastIndexOf(true);
  assert.ok(lastPending > 0 && run.pendingAt.slice(lastPending + 1).every((pending) => pending === false));
  assert.ok(lastPending < frames / 2, 'the orbit was over long before the simulation ended');
});

test('time off-screen or in a hidden tab spends none of the budget, and resuming never jumps', () => {
  // Seen for 3 s, unseen for 20 s, then seen again.
  const seen = (timestamp) => timestamp < 3000 || timestamp >= 23_000;
  const run = simulateIdleOrbit({ frames: Math.ceil(40_000 / (1000 / 60)), seen });
  assert.equal(run.rendersWhileUnseen, 0, 'no frame turns the camera while nobody can see it');
  assert.equal(run.shownMs, IDLE_ORBIT_BUDGET_MS, 'the full budget is still shown once the model is seen again');
  const turned = run.camera.azimuth - run.opening.azimuth;
  assert.ok(Math.abs(turned - (IDLE_ORBIT_BUDGET_MS / 1000) * 0.22) < 1e-9, 'the 20 s pause added no rotation');
  // While paused the orbit is still to come, so the cue may keep saying so.
  assert.equal(run.pendingAt[Math.round(10_000 / (1000 / 60))], true);
});

test('idleOrbitPhase: interaction and reduced motion switch the orbit off before anything else is considered', () => {
  for (const extra of [{}, { budgetSpent: true }, { onScreen: false }, { pageHidden: true }]) {
    assert.equal(idleOrbitPhase({ hasInteracted: true, ...extra }), 'off');
    assert.equal(idleOrbitPhase({ reduceMotion: true, ...extra }), 'off');
  }
  assert.equal(idleOrbitPhase({ budgetSpent: true }), 'finished');
  assert.equal(idleOrbitPhase({ budgetSpent: true, onScreen: false, pageHidden: true }), 'finished', 'a spent budget is not a pause');
  assert.equal(idleOrbitPhase({ onScreen: false }), 'paused');
  assert.equal(idleOrbitPhase({ pageHidden: true }), 'paused');
  assert.equal(idleOrbitPhase({}), 'running', 'with no IntersectionObserver the model counts as on-screen');
  assert.equal(idleOrbitPhase(), 'running');
});

test('idleOrbitPending: the cue may claim rotation only while the orbit is under way or waiting to be seen', () => {
  assert.equal(idleOrbitPending('running'), true);
  assert.equal(idleOrbitPending('paused'), true);
  assert.equal(idleOrbitPending('finished'), false);
  assert.equal(idleOrbitPending('off'), false);
  assert.equal(idleOrbitPending(idleOrbitPhase({ budgetSpent: true })), false);
  assert.equal(idleOrbitPending(idleOrbitPhase({ reduceMotion: true })), false);
});

test('spendIdleOrbitFrame clamps a long gap like the camera does and ends exactly on budget', () => {
  assert.deepEqual(spendIdleOrbitFrame(0, 16), { stepMs: 16, spentMs: 16, budgetSpent: false });
  assert.deepEqual(spendIdleOrbitFrame(1000, 5000), { stepMs: IDLE_ORBIT_MAX_FRAME_MS, spentMs: 1000 + IDLE_ORBIT_MAX_FRAME_MS, budgetSpent: false });
  // The final frame turns only what is left.
  assert.deepEqual(spendIdleOrbitFrame(IDLE_ORBIT_BUDGET_MS - 10, 16), { stepMs: 10, spentMs: IDLE_ORBIT_BUDGET_MS, budgetSpent: true });
  assert.deepEqual(spendIdleOrbitFrame(IDLE_ORBIT_BUDGET_MS, 16), { stepMs: 0, spentMs: IDLE_ORBIT_BUDGET_MS, budgetSpent: true });
  // A clock that runs backwards, or garbage, moves nothing.
  assert.deepEqual(spendIdleOrbitFrame(500, -40), { stepMs: 0, spentMs: 500, budgetSpent: false });
  assert.deepEqual(spendIdleOrbitFrame(500, Number.NaN), { stepMs: 0, spentMs: 500, budgetSpent: false });
  assert.deepEqual(spendIdleOrbitFrame(0, 30, 50), { stepMs: 30, spentMs: 30, budgetSpent: false }, 'the budget is a parameter');
  assert.deepEqual(spendIdleOrbitFrame(30, 30, 50), { stepMs: 20, spentMs: 50, budgetSpent: true });
});

test('projectPolygon reports the average depth of its projected vertices', () => {
  const points3D = [[0, 0, 1], [0, 0, 3], [0, 0, 5]];
  const { points, depth } = projectPolygon(points3D, { azimuth: 0, elevation: 0 });
  assert.equal(points.length, 3);
  assert.equal(depth, 3);
});

/* ---------------------------------------------- pairwise plane intersections */

test('planePlaneIntersection finds the line where two coordinate planes cross, clipped to the cube', () => {
  // x = 0 and y = 0 meet exactly on the z-axis.
  const planeX = { coefficients: { x: 1, y: 0, z: 0 }, constant: 0 };
  const planeY = { coefficients: { x: 0, y: 1, z: 0 }, constant: 0 };
  const line = planePlaneIntersection(planeX, planeY, XYZ, 5);
  assert.ok(line && line.points.length === 2);
  line.points.forEach(([x, y, z]) => {
    assert.ok(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9, 'every point on the line has x = y = 0');
    assert.ok(Math.abs(z) <= 5 + 1e-9);
  });
  const zValues = line.points.map((point) => point[2]).sort((a, b) => a - b);
  assert.ok(Math.abs(zValues[0] - -5) < 1e-9 && Math.abs(zValues[1] - 5) < 1e-9, 'the segment spans the full cube');
});

test('planePlaneIntersection returns null for parallel (and coincident) planes', () => {
  const planeA = { coefficients: { x: 1, y: 1, z: 1 }, constant: 3 };
  const planeParallel = { coefficients: { x: 1, y: 1, z: 1 }, constant: 9 };
  const planeCoincident = { coefficients: { x: 2, y: 2, z: 2 }, constant: 6 };
  assert.equal(planePlaneIntersection(planeA, planeParallel, XYZ, 8), null);
  assert.equal(planePlaneIntersection(planeA, planeCoincident, XYZ, 8), null);
});

test('planePlaneIntersection returns null when the line misses the cube', () => {
  // z = 0 and z = 100 are parallel (no line); use two non-parallel planes
  // whose shared line runs far outside a small cube instead.
  const planeA = { coefficients: { x: 1, y: 0, z: 0 }, constant: 100 };
  const planeB = { coefficients: { x: 0, y: 1, z: 0 }, constant: 100 };
  assert.equal(planePlaneIntersection(planeA, planeB, XYZ, 5), null);
});

test('every point returned by planePlaneIntersection satisfies both plane equations, for the Day 1 system', () => {
  const formA = linearEquationForm('2x - y + 2z = 15', XYZ);
  const formB = linearEquationForm('-x + y + z = 3', XYZ);
  const line = planePlaneIntersection(formA, formB, XYZ, 10);
  assert.ok(line);
  line.points.forEach(([x, y, z]) => {
    assert.ok(Math.abs(2 * x - y + 2 * z - 15) < 1e-6);
    assert.ok(Math.abs(-x + y + z - 3) < 1e-6);
  });
});

/* -------------------------------------------------------- three-plane point */

test('threePlaneCommonPoint finds the unique solution of the Day 1 system', () => {
  const forms = ['2x - y + 2z = 15', '-x + y + z = 3', '3x - y + 2z = 18'].map((equation) => linearEquationForm(equation, XYZ));
  const point = threePlaneCommonPoint(forms[0], forms[1], forms[2], XYZ);
  assert.ok(point);
  const [x, y, z] = point;
  assert.ok(Math.abs(x - 3) < 1e-9 && Math.abs(y - 1) < 1e-9 && Math.abs(z - 5) < 1e-9);
});

test('threePlaneCommonPoint returns null when the three planes have no unique common point', () => {
  const parallelTrio = ['x + y + z = 1', 'x + y + z = 2', '2x + 2y + 2z = 3'].map((equation) => linearEquationForm(equation, XYZ));
  assert.equal(threePlaneCommonPoint(parallelTrio[0], parallelTrio[1], parallelTrio[2], XYZ), null);
});
