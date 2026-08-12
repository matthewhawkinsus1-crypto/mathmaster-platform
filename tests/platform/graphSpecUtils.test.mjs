import assert from 'node:assert/strict';
import {
  auditStaticGraphViewport,
  evaluateStaticGraphFunction,
  fitStaticGraphViewport,
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

const authoredTooSmall = {
  xMin: 0, xMax: 7, yMin: 0, yMax: 140,
  functions: [{ type: 'exponential', a: 2, base: 2, h: 0, k: 0 }],
};
const fittedGrowth = fitStaticGraphViewport(authoredTooSmall);
assert.ok(fittedGrowth.yMax >= 256,
  'the renderer expands a routine authored y-window instead of sending the AI back to engineer viewport bounds');
const autoFitAudit = auditStaticGraphViewport(authoredTooSmall, { strictBoundaryVisibility: true });
assert.deepEqual(autoFitAudit.errors, [], 'an ordinary clipped graph is repaired by platform auto-fit');

const intentionallyLocked = auditStaticGraphViewport({
  ...authoredTooSmall,
  lockViewport: true,
}, { strictBoundaryVisibility: true });
assert.ok(intentionallyLocked.errors.some((message) => /clipped by its locked viewport/.test(message)),
  'a deliberately locked instructional viewport is still validated strictly');

const omittedWindow = fitStaticGraphViewport({
  functions: [{ type: 'exponential', a: 2, base: 2, h: 0, k: 0 }],
});
assert.ok(omittedWindow.xMin < 0 && omittedWindow.xMax > 0, 'MathMaster chooses a useful x-window when the AI omits it');
assert.ok(omittedWindow.yMax > 2, 'MathMaster chooses a useful y-window from the function');

console.log('graphSpecUtils.test.mjs: all assertions passed');
