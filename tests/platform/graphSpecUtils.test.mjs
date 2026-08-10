import assert from 'node:assert/strict';
import {
  auditStaticGraphViewport,
  evaluateStaticGraphFunction,
  getQuadraticParameterization,
  validateStaticGraphFunctionSpec,
} from '../../src/graphSpecUtils.js';

assert.equal(evaluateStaticGraphFunction({ type: 'quadratic', a: -1, h: 4, k: 16 }, 4), 16,
  'vertex-form static quadratics place the vertex at (h,k)');
assert.equal(evaluateStaticGraphFunction({ type: 'quadratic', a: -1, h: 4, k: 16 }, 0), 0,
  'vertex form uses (x-h), not ax^2 with ignored h/k');
assert.equal(evaluateStaticGraphFunction({ type: 'quadratic', a: -1, b: 8, c: 0 }, 4), 16,
  'standard-form static quadratics remain backward compatible');
assert.equal(getQuadraticParameterization({ type: 'quadratic', a: 1, h: 2, k: 3 }), 'vertex');
assert.equal(getQuadraticParameterization({ type: 'quadratic', a: 1, b: 2, c: 3 }), 'standard');
assert.ok(validateStaticGraphFunctionSpec({ type: 'quadratic', a: 1, b: 2, h: 3, k: 4 })
  .some((message) => /mixes quadratic/.test(message)), 'ambiguous quadratic parameterizations are rejected');

const visibleArch = auditStaticGraphViewport({
  xMin: 0, xMax: 8, yMin: 0, yMax: 20,
  functions: [{ type: 'quadratic', a: -1, h: 4, k: 16 }],
}, { strictBoundaryVisibility: true });
assert.deepEqual(visibleArch.errors, [], 'a fully visible vertex-form arch passes strict viewport validation');

const clippedGrowth = auditStaticGraphViewport({
  xMin: 0, xMax: 7, yMin: 0, yMax: 140,
  functions: [{ type: 'exponential', a: 2, base: 2, h: 0, k: 0 }],
}, { strictBoundaryVisibility: true });
assert.ok(clippedGrowth.errors.some((message) => /clipped by its viewport/.test(message)),
  'graph cards reject a finite curve that runs outside the authored viewport');

console.log('graphSpecUtils.test.mjs: all assertions passed');
