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

const BOUNDS = { xMin:-10, xMax:10, yMin:-10, yMax:10 };

test('construction helpers emit PR #293 canonical inequalities', () => {
  assert.deepEqual(boundaryFromSlopeIntercept(2, 1), { A:-2, B:1, C:-1, relation:'>=' });
  assert.deepEqual(boundaryFromVertical(4), { A:1, B:0, C:-4, relation:'>=' });
  assert.deepEqual(boundaryFromHorizontal(3), { A:0, B:1, C:-3, relation:'>=' });
});

test('two points, slope-intercept, vertical, and horizontal construction describe the same mathematical lines', () => {
  const fromPoints = boundaryFromTwoPoints([0,1],[2,5]);
  const fromSlope = boundaryFromSlopeIntercept(2,1);
  const [p1,p2] = lineSegmentForBounds(fromSlope, BOUNDS);
  assert.ok(pointOnBoundaryLine(fromPoints,p1[0],p1[1],1e-6));
  assert.ok(pointOnBoundaryLine(fromPoints,p2[0],p2[1],1e-6));
  assert.ok(pointOnBoundaryLine(boundaryFromTwoPoints([4,-3],[4,6]),4,100,1e-6));
  assert.ok(pointOnBoundaryLine(boundaryFromTwoPoints([-2,3],[7,3]),500,3,1e-6));
  assert.equal(boundaryFromTwoPoints([1,1],[1,1]), null);
  assert.equal(boundaryFromTwoPoints([null,1],[2,5]), null);
});

test('solid boundaries include their line and dashed boundaries exclude it through the canonical evaluator', () => {
  const solid = { ...boundaryFromSlopeIntercept(-1,3), relation:'<=' };
  const dashed = { ...boundaryFromSlopeIntercept(-1,3), relation:'<' };
  assert.ok(satisfiesBoundary(solid,0,3));
  assert.ok(!satisfiesBoundary(dashed,0,3));
});

test('shading side selection works for slanted and vertical boundaries', () => {
  const slanted = boundaryFromSlopeIntercept(1,0);
  const above = sideOfBoundaryLine(slanted,0,5);
  const below = sideOfBoundaryLine(slanted,5,0);
  assert.equal(above,1);
  assert.equal(below,-1);
  assert.ok(satisfiesBoundary(boundaryWithChosenSide(slanted,above,false),0,5));

  const vertical = boundaryFromVertical(2);
  assert.equal(sideOfBoundaryLine(vertical,8,0),1);
  assert.equal(sideOfBoundaryLine(vertical,-8,0),-1);
  assert.ok(satisfiesBoundary(boundaryWithChosenSide(vertical,1,false),8,0));
});

const ticketSystem = [
  { A:1, B:0, C:0, relation:'>=' },
  { A:0, B:1, C:0, relation:'>=' },
  { A:1, B:1, C:-300, relation:'<=' },
  { A:15, B:11, C:-3630, relation:'>=' },
];

test('the four-constraint model uses canonical C signs and produces a feasible polygon', () => {
  assert.ok(ticketSystem.every((b)=>satisfiesBoundary(b,250,30)));
  assert.ok(!ticketSystem.every((b)=>satisfiesBoundary(b,250,100)));
  const polygon=feasibleRegionPolygon(ticketSystem,{xMin:0,xMax:400,yMin:0,yMax:400});
  assert.ok(polygon.length>=3);
});

test('classification comes from the viewport-independent canonical engine', () => {
  const bounded=[
    { A:1,B:0,C:0,relation:'>=' },
    { A:0,B:1,C:0,relation:'>=' },
    { A:1,B:1,C:-4,relation:'<=' },
  ];
  const empty=[
    { A:0,B:1,C:-5,relation:'>=' },
    { A:0,B:1,C:-1,relation:'<=' },
  ];
  const unbounded=[{ A:0,B:1,C:0,relation:'>=' }];
  assert.equal(classifyFeasibleRegion(bounded),'bounded');
  assert.equal(classifyFeasibleRegion(empty),'empty');
  assert.equal(classifyFeasibleRegion(unbounded),'unbounded');
});

test('vertex adapter preserves geometric intersections excluded by dashed boundaries', () => {
  const fractional=[
    boundaryWithChosenSide(boundaryFromSlopeIntercept(1,0),1,false),
    boundaryWithChosenSide(boundaryFromSlopeIntercept(-1,3),-1,false),
  ];
  assert.ok(feasibleRegionVertices(fractional).some((v)=>Math.abs(v.x-1.5)<1e-9 && Math.abs(v.y-1.5)<1e-9));

  const dashed=[
    boundaryWithChosenSide(boundaryFromHorizontal(0),1,true),
    boundaryWithChosenSide(boundaryFromVertical(0),1,false),
  ];
  const origin=feasibleRegionVertices(dashed).find((v)=>Math.abs(v.x)<1e-9 && Math.abs(v.y)<1e-9);
  assert.ok(origin);
  assert.equal(origin.included,false);
});

test('legacy and vertical/horizontal authoring shapes normalize into the canonical engine', () => {
  assert.ok(satisfiesBoundary(authoredBoundaryFromInequality({m:2,b:-1,relation:'<='}),0,-1));
  assert.ok(satisfiesBoundary(authoredBoundaryFromInequality({orientation:'vertical',x:3,relation:'<='}),2,999));
  assert.ok(!satisfiesBoundary(authoredBoundaryFromInequality({orientation:'vertical',x:3,relation:'<='}),4,0));
  assert.ok(satisfiesBoundary(authoredBoundaryFromInequality({orientation:'horizontal',y:-2,relation:'>='}),0,5));
});
