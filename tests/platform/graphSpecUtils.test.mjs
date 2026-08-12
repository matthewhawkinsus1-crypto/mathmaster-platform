import assert from 'node:assert/strict';
import {
  resolvePointFill,
  resolvePointRadius,
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

// A plotted point arrives either as [x, y] or as an object carrying its own
// styling, and reading `.fill` off the array form is a trap: on an ARRAY,
// `.fill` is Array.prototype.fill. It is a function and it is truthy, so
// `point.fill || fallback` returned the built-in method, React refused it as an
// attribute value and dropped it, and every point plotted from an array pair
// rendered with no fill. The only symptom was a dev-mode warning.
assert.equal(resolvePointFill([2, 3], '#1a73e8'), '#1a73e8',
  'an array pair has no authored fill, whatever Array.prototype says');
assert.equal(typeof resolvePointFill([2, 3], '#1a73e8'), 'string',
  'the resolved fill is always something React can render');
assert.equal(resolvePointFill({ fill: '#d93025' }, '#1a73e8'), '#d93025');
assert.equal(resolvePointFill({ fill: '' }, '#1a73e8'), '#1a73e8');
assert.equal(resolvePointFill({ fill: { r: 1 } }, '#1a73e8'), '#1a73e8', 'an object is not a colour');
assert.equal(resolvePointFill(undefined, '#1a73e8'), '#1a73e8');

assert.equal(resolvePointRadius([2, 3], 6), 6);
assert.equal(resolvePointRadius({ r: 9 }, 6), 9);
assert.equal(resolvePointRadius({ radius: 4 }, 6), 4);
assert.equal(resolvePointRadius({ r: 'wide' }, 6), 6, 'never NaN into an SVG attribute');

console.log('graphSpecUtils.test.mjs: point-style assertions passed');
