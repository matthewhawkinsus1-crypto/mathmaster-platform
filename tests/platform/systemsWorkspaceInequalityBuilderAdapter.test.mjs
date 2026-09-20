import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authoredBoundaryFromInequality,
  boundaryFromHorizontal,
  boundaryFromSlopeIntercept,
  boundaryFromTwoPoints,
  boundaryFromVertical,
  boundaryWithChosenSide,
  classifyFeasibleRegion,
  feasibleRegionPolygon,
  feasibleRegionVertices,
  lineSegmentForBounds,
  pointOnBoundaryLine,
  satisfiesBoundary,
  sideOfBoundaryLine,
} from '../../src/tools/systemsWorkspace/inequalityBuilderAdapter.js';

const BOUNDS = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

// --- build slanted / vertical / horizontal lines, from more than one method ---

test('a slanted boundary built from two points matches the one built from slope-intercept', () => {
  const fromPoints = boundaryFromTwoPoints([0, 1], [2, 5]); // y = 2x + 1
  const fromSlopeIntercept = boundaryFromSlopeIntercept(2, 1);
  const [p1, p2] = lineSegmentForBounds(fromSlopeIntercept, BOUNDS);
  assert.ok(pointOnBoundaryLine(fromPoints, p1[0], p1[1], 1e-6));
  assert.ok(pointOnBoundaryLine(fromPoints, p2[0], p2[1], 1e-6));
});

test('a vertical boundary can be built from two points sharing an x-coordinate', () => {
  const fromPoints = boundaryFromTwoPoints([4, -3], [4, 6]);
  const fromConstant = boundaryFromVertical(4);
  assert.ok(pointOnBoundaryLine(fromPoints, 4, 100, 1e-6));
  assert.ok(pointOnBoundaryLine(fromConstant, 4, -100, 1e-6));
  assert.ok(!pointOnBoundaryLine(fromPoints, 4.5, 0, 1e-6));
});

test('a horizontal boundary can be built from two points sharing a y-coordinate', () => {
  const fromPoints = boundaryFromTwoPoints([-2, 3], [7, 3]);
  const fromConstant = boundaryFromHorizontal(3);
  assert.ok(pointOnBoundaryLine(fromPoints, 500, 3, 1e-6));
  assert.ok(pointOnBoundaryLine(fromConstant, -500, 3, 1e-6));
});

test('two coincident points do not determine a line', () => {
  assert.equal(boundaryFromTwoPoints([1, 1], [1, 1]), null);
});

test('a missing coordinate does not silently resolve to the origin', () => {
  // Number(null) is 0 and finite, which previously let an unfilled field slip
  // through as if the student had clicked (0, 0). Guard this explicitly.
  assert.equal(boundaryFromTwoPoints([null, 1], [2, 5]), null);
  assert.equal(boundaryFromTwoPoints([0, 1], [undefined, 5]), null);
});

// --- solid vs dashed (boundary inclusion) ---

test('a solid (non-strict) boundary includes its own points; a dashed one excludes them', () => {
  const solid = { ...boundaryFromSlopeIntercept(-1, 3), relation: '<=' }; // y <= -x + 3
  const dashed = { ...boundaryFromSlopeIntercept(-1, 3), relation: '<' }; // y < -x + 3
  // The (0, 3) vs (2, 3) contrast from the task's boundary-inclusion-probe spec.
  assert.ok(satisfiesBoundary(solid, 0, 3));
  assert.ok(!satisfiesBoundary(dashed, 0, 3));
});

test('the y <= 2x - 1 / (2, 3) boundary point IS included', () => {
  const boundary = boundaryWithChosenSide(boundaryFromSlopeIntercept(2, -1), -1, false); // y <= 2x - 1
  assert.equal(boundary.relation, '<=');
  assert.ok(pointOnBoundaryLine(boundary, 2, 3, 1e-6));
  assert.ok(satisfiesBoundary(boundary, 2, 3));
});

// --- shading: above/below (slanted, horizontal) and left/right (vertical) ---

test('shading resolves to a side for a slanted boundary and grades a chosen point against it', () => {
  const line = boundaryFromSlopeIntercept(1, 0); // y = x
  const above = sideOfBoundaryLine(line, 0, 5); // (0,5) is above y = x
  const below = sideOfBoundaryLine(line, 5, 0);
  assert.equal(above, 1);
  assert.equal(below, -1);
  const shadedAbove = boundaryWithChosenSide(line, above, false);
  assert.ok(satisfiesBoundary(shadedAbove, 0, 5));
  assert.ok(!satisfiesBoundary(shadedAbove, 5, 0));
});

test('shading resolves to left/right for a vertical boundary', () => {
  const line = boundaryFromVertical(2); // x = 2
  const right = sideOfBoundaryLine(line, 8, 0);
  const left = sideOfBoundaryLine(line, -8, 0);
  assert.equal(right, 1);
  assert.equal(left, -1);
  const shadedRight = boundaryWithChosenSide(line, right, false);
  assert.ok(satisfiesBoundary(shadedRight, 8, 0));
  assert.ok(!satisfiesBoundary(shadedRight, -8, 0));
});

// --- valid vs invalid points against a small system ---

const ticketSystem = [
  { A: 1, B: 0, C: 0, relation: '>=' }, // a >= 0
  { A: 0, B: 1, C: 0, relation: '>=' }, // s >= 0
  { A: 1, B: 1, C: 300, relation: '<=' }, // a + s <= 300
  { A: 15, B: 11, C: 3630, relation: '>=' }, // 15a + 11s >= 3630
];

test('an interior point can satisfy every inequality in a system at once', () => {
  assert.ok(ticketSystem.every((b) => satisfiesBoundary(b, 250, 30)));
});

test('a point failing even one inequality is not a system solution', () => {
  // Fails a + s <= 300.
  assert.ok(!ticketSystem.every((b) => satisfiesBoundary(b, 250, 100)));
});

// --- 2-constraint overlap, 3-constraint bounded polygon, 4-constraint model ---

test('two half-planes overlap into a clipped polygon', () => {
  const polygon = feasibleRegionPolygon([
    boundaryWithChosenSide(boundaryFromSlopeIntercept(1, 1), 1, false), // y >= x + 1
    boundaryWithChosenSide(boundaryFromSlopeIntercept(-0.5, 6), -1, false), // y <= -0.5x + 6
  ], { xMin: -6, xMax: 8, yMin: -4, yMax: 10 });
  assert.ok(polygon.length >= 3);
  assert.ok(polygon.every(([x, y]) => y >= x + 1 - 1e-6 && y <= -0.5 * x + 6 + 1e-6));
});

test('three constraints can close into a bounded triangle', () => {
  const boundaries = [
    { A: 0, B: 1, C: 0, relation: '>=' }, // y >= 0
    { A: 1, B: 0, C: 0, relation: '>=' }, // x >= 0
    { A: 1, B: 1, C: 4, relation: '<=' }, // x + y <= 4
  ];
  const polygon = feasibleRegionPolygon(boundaries, BOUNDS);
  assert.equal(classifyFeasibleRegion(polygon, BOUNDS), 'bounded');
});

test('the four-constraint ticket model produces a real feasible region', () => {
  const polygon = feasibleRegionPolygon(ticketSystem, { xMin: 0, xMax: 400, yMin: 0, yMax: 400 });
  assert.ok(polygon.length >= 3);
  assert.ok(polygon.some(([a, s]) => a + s <= 300 + 1e-6 && 15 * a + 11 * s >= 3630 - 1e-6));
});

// --- classification: bounded / unbounded / no solution ---

test('an empty intersection classifies as no solution', () => {
  const boundaries = [
    { A: 0, B: 1, C: 5, relation: '>=' }, // y >= 5
    { A: 0, B: 1, C: 1, relation: '<=' }, // y <= 1 (contradicts the above)
  ];
  const polygon = feasibleRegionPolygon(boundaries, BOUNDS);
  assert.equal(classifyFeasibleRegion(polygon, BOUNDS), 'none');
});

test('a region that keeps going to the edge of the window classifies as unbounded', () => {
  const boundaries = [
    { A: 0, B: 1, C: 0, relation: '>=' }, // y >= 0 only — nothing closes off the top
  ];
  const polygon = feasibleRegionPolygon(boundaries, BOUNDS);
  assert.equal(classifyFeasibleRegion(polygon, BOUNDS), 'unbounded');
});

// --- vertices: integer, fractional, and excluded-by-a-dashed-boundary ---

test('an integer vertex is found exactly from two intersecting boundaries', () => {
  const boundaries = [
    boundaryWithChosenSide(boundaryFromSlopeIntercept(1, 0), 1, false), // y >= x
    boundaryWithChosenSide(boundaryFromHorizontal(4), -1, false), // y <= 4
    boundaryWithChosenSide(boundaryFromVertical(-4), 1, false), // x >= -4
  ];
  const vertices = feasibleRegionVertices(boundaries);
  assert.ok(vertices.some((v) => Math.abs(v.x - 4) < 1e-6 && Math.abs(v.y - 4) < 1e-6));
});

test('a fractional vertex is found exactly, not rounded', () => {
  const boundaries = [
    boundaryWithChosenSide(boundaryFromSlopeIntercept(1, 0), 1, false), // y >= x
    boundaryWithChosenSide(boundaryFromSlopeIntercept(-1, 3), -1, false), // y <= -x + 3
  ];
  const vertices = feasibleRegionVertices(boundaries);
  const expected = { x: 1.5, y: 1.5 };
  assert.ok(vertices.some((v) => Math.abs(v.x - expected.x) < 1e-9 && Math.abs(v.y - expected.y) < 1e-9));
});

test('a geometric vertex on a dashed boundary is excluded from the solution set', () => {
  const boundaries = [
    boundaryWithChosenSide(boundaryFromHorizontal(0), 1, true), // y > 0 (dashed)
    boundaryWithChosenSide(boundaryFromVertical(0), 1, false), // x >= 0 (solid)
  ];
  const vertices = feasibleRegionVertices(boundaries);
  const origin = vertices.find((v) => Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9);
  assert.ok(origin, 'the two lines still cross geometrically at the origin');
  assert.equal(origin.included, false, 'excluded because the y > 0 boundary is strict at that exact corner');
});

test('a vertex where both meeting boundaries are solid is included', () => {
  const boundaries = [
    boundaryWithChosenSide(boundaryFromHorizontal(0), 1, false), // y >= 0
    boundaryWithChosenSide(boundaryFromVertical(0), 1, false), // x >= 0
  ];
  const vertices = feasibleRegionVertices(boundaries);
  const origin = vertices.find((v) => Math.abs(v.x) < 1e-9 && Math.abs(v.y) < 1e-9);
  assert.equal(origin.included, true);
});

// --- authoring shape compatibility ---

test('the existing {m, b, relation} authoring shape still converts correctly', () => {
  const boundary = authoredBoundaryFromInequality({ m: 2, b: -1, relation: '<=' });
  assert.ok(satisfiesBoundary(boundary, 0, -1));
  assert.ok(!satisfiesBoundary(boundary, 0, 0));
});

test('the new orientation:"vertical" and "horizontal" authoring shapes convert correctly', () => {
  const vertical = authoredBoundaryFromInequality({ orientation: 'vertical', x: 3, relation: '<=' });
  assert.ok(satisfiesBoundary(vertical, 2, 999));
  assert.ok(!satisfiesBoundary(vertical, 4, 0));

  const horizontal = authoredBoundaryFromInequality({ orientation: 'horizontal', y: -2, relation: '>=' });
  assert.ok(satisfiesBoundary(horizontal, 0, 5));
  assert.ok(!satisfiesBoundary(horizontal, 0, -10));
});
