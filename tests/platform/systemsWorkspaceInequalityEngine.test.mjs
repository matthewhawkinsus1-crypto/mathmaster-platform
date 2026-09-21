import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInequalitySystem,
  boundaryIntersections,
  classifyFeasibleRegion,
  evaluatePoint,
  findFeasiblePoint,
  formatSlopeInterceptInequality,
  getBoundaryMetadata,
  normalizeLinearInequality,
  normalizeSystemsWorkspaceInequalityConfig,
} from '../../src/tools/systemsWorkspace/linearInequalityEngine.js';
import { feasibleRegionPolygon } from '../../src/tools/systemsWorkspace/systemsMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

test('normalizes legacy slope-intercept and general standard-form inequalities', () => {
  assert.deepEqual(normalizeLinearInequality({ m: 2, b: -1, relation: '>' }), { A: -2, B: 1, C: 1, relation: '>' });
  assert.deepEqual(normalizeLinearInequality({ m: -1, b: 4, relation: '≤' }), { A: 1, B: 1, C: -4, relation: '<=' });
  assert.deepEqual(normalizeLinearInequality({ A: 2, B: -3, C: 6, relation: '>' }), { A: 2, B: -3, C: 6, relation: '>' });
  assert.equal(evaluatePoint({ A: 2, B: -3, C: 6, relation: '>' }, 0, 0), 'inside');
});

test('boundary metadata covers vertical, horizontal, general, solid, and dashed boundaries', () => {
  assert.deepEqual(getBoundaryMetadata({ A: 1, B: 0, C: -1, relation: '<' }), {
    A: 1, B: 0, C: -1, relation: '<', equation: { A: 1, B: 0, C: -1 },
    orientation: 'vertical', lineStyle: 'dashed', boundaryIncluded: false, satisfyingHalfPlane: 'negative',
  });
  assert.equal(getBoundaryMetadata({ A: 0, B: 1, C: 1, relation: '>=' }).orientation, 'horizontal');
  assert.equal(getBoundaryMetadata({ A: 1, B: 1, C: -4, relation: '<=' }).orientation, 'general');
  assert.equal(getBoundaryMetadata({ A: 1, B: 1, C: -4, relation: '<=' }).lineStyle, 'solid');
});

test('point evaluation distinguishes both kinds of boundary from inside and outside', () => {
  const dashed = { A: 1, B: 0, C: -1, relation: '<' };
  const solid = { A: 1, B: 0, C: 2, relation: '>=' };
  assert.equal(evaluatePoint(dashed, 0, 100), 'inside');
  assert.equal(evaluatePoint(dashed, 2, 100), 'outside');
  assert.equal(evaluatePoint(dashed, 1, -7), 'onBoundaryExcluded');
  assert.equal(evaluatePoint(solid, -2, 8), 'onBoundaryIncluded');
  assert.equal(evaluatePoint({ A: 0, B: 1, C: 1, relation: '<' }, 9, -2), 'inside');
});

test('negative and fractional coefficients retain their mathematical meaning', () => {
  const inequality = { A: -1.5, B: -0.5, C: 2, relation: '>=' };
  assert.equal(evaluatePoint(inequality, 0, 0), 'inside');
  assert.equal(evaluatePoint(inequality, 2, 0), 'outside');
});

test('completed rewrite display is canonical, simplified, and keeps inequality direction correct', () => {
  assert.equal(
    formatSlopeInterceptInequality({ A: 1, B: -1, C: 1, relation: '>=' }),
    'y ≤ x + 1',
    'x - y ≥ -1 must display as y ≤ x + 1 after division by -1',
  );
  assert.equal(
    formatSlopeInterceptInequality({ A: 3, B: -1, C: -4, relation: '<=' }),
    'y ≥ 3x − 4',
  );
  assert.equal(
    formatSlopeInterceptInequality({ A: -2, B: 3, C: 0, relation: '>' }),
    'y > 2/3x',
    'simple fractional slopes stay readable instead of becoming long decimals',
  );
  assert.equal(
    formatSlopeInterceptInequality({ A: 1, B: 0, C: 2, relation: '>' }),
    'x > −2',
    'vertical boundaries remain clean when a rewrite ever hands one off',
  );
});

test('classifies a two-line feasible region and a three-line bounded triangle', () => {
  assert.equal(classifyFeasibleRegion([
    { m: 1, b: 0, relation: '>=' },
    { m: -1, b: 0, relation: '>=' },
  ]), 'unbounded');
  const triangle = [
    { A: 1, B: 0, C: 0, relation: '>=' },
    { A: 0, B: 1, C: 0, relation: '>=' },
    { A: 1, B: 1, C: -6, relation: '<=' },
  ];
  assert.equal(classifyFeasibleRegion(triangle), 'bounded');
  assert.deepEqual(findFeasiblePoint(triangle), { x: 3, y: 1.5 });
});

test('supports a four-constraint modeling region without a two-line assumption', () => {
  const model = [
    { A: 1, B: 0, C: 0, relation: '>=' },
    { A: 0, B: 1, C: 0, relation: '>=' },
    { A: 1, B: 1, C: -300, relation: '<=' },
    { A: 15, B: 11, C: -3630, relation: '>=' },
  ];
  const analysis = analyzeInequalitySystem(model);
  assert.equal(analysis.classification, 'bounded');
  assert.equal(analysis.constraints.length, 4);
  assert.ok(analysis.feasiblePoint);
});

test('detects an empty strict system rather than inventing a solution point', () => {
  const empty = [
    { m: 2, b: -1, relation: '<' },
    { m: 2, b: 3, relation: '>' },
  ];
  assert.equal(classifyFeasibleRegion(empty), 'empty');
  assert.equal(findFeasiblePoint(empty), null);
});

test('handles parallel compatible boundaries and an unbounded wedge', () => {
  assert.equal(classifyFeasibleRegion([
    { A: 1, B: 0, C: 0, relation: '>=' },
    { A: 1, B: 0, C: -2, relation: '<=' },
  ]), 'unbounded');
  assert.equal(classifyFeasibleRegion([
    { m: 1, b: 0, relation: '>=' },
    { m: -1, b: 0, relation: '>=' },
  ]), 'unbounded');
  assert.equal(classifyFeasibleRegion([
    { A: 0, B: 1, C: 0, relation: '>=' },
    { A: 0, B: 1, C: -1, relation: '<=' },
  ]), 'unbounded');
});

test('reports fractional geometric intersections and whether each vertex is included', () => {
  const solid = boundaryIntersections([
    { A: 2, B: 0, C: -1, relation: '>=' },
    { A: 0, B: 1, C: -1 / 3, relation: '<=' },
  ]);
  assert.deepEqual(solid[0].coordinate, { x: 0.5, y: 1 / 3 });
  assert.equal(solid[0].includedInSolution, true);

  const dashed = boundaryIntersections([
    { A: 1, B: 0, C: 0, relation: '>' },
    { A: 0, B: 1, C: 0, relation: '>=' },
  ]);
  assert.equal(dashed[0].includedInSolution, false);
  assert.match(dashed[0].reason, /constraint 1/);
});

test('mathematical classification is independent from viewport clipping', () => {
  const system = [
    { A: 1, B: 0, C: -100, relation: '>=' },
    { A: 0, B: 1, C: -100, relation: '>=' },
  ];
  assert.deepEqual(feasibleRegionPolygon(system, { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }), []);
  assert.equal(classifyFeasibleRegion(system), 'unbounded');
});

test('new construction and reasoning schema is opt-in while legacy JSON defaults off', () => {
  assert.deepEqual(normalizeSystemsWorkspaceInequalityConfig({ mode: 'inequalities' }), {
    mode: 'inequalities',
    studentBuild: { rewrite: false, boundary: false, lineStyle: false, shading: false },
    reasoning: { testPoint: false, boundaryProbe: false, classifyRegion: false, vertices: false },
  });
  const question = {
    type: 'systemsWorkspace', mode: 'inequalities',
    inequalities: [{ A: 1, B: 0, C: -1, relation: '<' }, { m: 1, b: 2, relation: '>=' }],
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    reasoning: { testPoint: true, boundaryProbe: true, classifyRegion: true, vertices: true },
    testPoint: { x: 1, y: 3 },
  };
  assert.deepEqual(validateToolQuestion(question).errors, []);
});
