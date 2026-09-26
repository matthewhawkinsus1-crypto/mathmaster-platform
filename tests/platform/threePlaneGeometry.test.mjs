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
  clipPlaneToCube,
  cubeCorners,
  cubeEdges,
  planePlaneIntersection,
  projectPoint,
  projectPolygon,
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
