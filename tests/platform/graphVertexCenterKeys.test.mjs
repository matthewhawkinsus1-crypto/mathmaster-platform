// GR18: A VERTEX OR A CENTER IS KEYED ONLY WHERE THE FUNCTION HAS ONE
// (the owner, 2026-10-23).
//
// getGraphFeaturePoints keyed (h, k) as the "vertex" and the "center" of every
// function type, so a student asked for the vertex of an exponential, a
// logarithm or a line was right only by clicking a point that is no feature
// of the graph. (h, k) is the vertex of a parabola and of an absolute-value
// graph, and the center of a rational, cubic or cube-root graph; anywhere
// else the right answer is "Does not exist". A graph-analysis question that
// names no feature asks for the function's own: its center where it has one,
// else the vertex, so the (h, k) a student clicked on a rational, cubic or
// cube-root graph stays right.
//
// Graded through gradeToolWork, the graph workspace's shared grader (the
// browser and the server run the same one).

import test from 'node:test';
import assert from 'node:assert/strict';

import { FUNCTION_TYPES_WITH_FEATURE, getGraphFeaturePoints } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';
import { normalizeAnalysisRequests } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const window = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
const SPECS = {
  quadratic: { type: 'quadratic', a: 1, h: 2, k: -3 },
  absolute: { type: 'absolute', a: -1, h: 1, k: 4 },
  rational: { type: 'rational', a: 2, h: 1, k: 2 },
  cubic: { type: 'cubic', a: 1, h: -1, k: 2 },
  cubeRoot: { type: 'cubeRoot', a: 1, h: 2, k: 1 },
  squareRoot: { type: 'squareRoot', a: 1, h: 2, k: 1 },
  exponential: { type: 'exponential', a: 1, base: 2, h: 0, k: 1 },
  logarithmic: { type: 'logarithmic', a: 1, base: 2, h: 0, k: 1 },
  linear: { type: 'linear', a: 2, h: 0, k: 1 },
};
const HAS = { vertex: ['quadratic', 'absolute'], center: ['rational', 'cubic', 'cubeRoot'] };

test('the vertex is keyed for a parabola and an absolute value only; the center for a rational, cubic or cube root only', () => {
  assert.deepEqual(FUNCTION_TYPES_WITH_FEATURE, HAS);
  for (const [name, spec] of Object.entries(SPECS)) {
    for (const feature of ['vertex', 'center']) {
      const expected = HAS[feature].includes(name) ? [[spec.h, spec.k]] : [];
      assert.deepEqual(getGraphFeaturePoints(spec, feature, window), expected, `${feature} of ${name}`);
    }
  }
});

const graded = (spec, work, extra = {}) => gradeToolWork({
  toolId: 'graphAnalysis',
  question: { type: 'graphAnalysis', prompt: 'Use the graph.', functionSpec: spec, graph: window, ...extra },
  work: { analysis: work },
}).isCorrect;
const clicked = (point, id = 'feature') => ({ selections: { [id]: [point] } });
const none = (id = 'feature') => ({ noneSelections: { [id]: true }, selections: { [id]: [] } });

test('asked for a vertex the graph does not have, "Does not exist" is right and (h, k) is not', () => {
  for (const name of ['exponential', 'logarithmic', 'linear', 'squareRoot']) {
    const spec = SPECS[name];
    const ask = { analysisRequests: [{ id: 'v', kind: 'point', feature: 'vertex' }] };
    assert.equal(graded(spec, none('v'), ask), true, `${name}: none`);
    assert.equal(graded(spec, clicked([spec.h, spec.k], 'v'), ask), false, `${name}: (h, k)`);
  }
  // A parabola's and an absolute value's vertex are unchanged.
  for (const name of ['quadratic', 'absolute']) {
    const spec = SPECS[name];
    const ask = { analysisRequests: [{ id: 'v', kind: 'point', feature: 'vertex' }] };
    assert.equal(graded(spec, clicked([spec.h, spec.k], 'v'), ask), true, `${name}: (h, k)`);
    assert.equal(graded(spec, none('v'), ask), false, `${name}: none`);
  }
  // A rational, cubic or cube-root center is unchanged; it has no vertex.
  for (const name of ['rational', 'cubic', 'cubeRoot']) {
    const spec = SPECS[name];
    assert.equal(graded(spec, clicked([spec.h, spec.k], 'c'), { analysisRequests: [{ id: 'c', kind: 'point', feature: 'center' }] }), true, `${name}: center (h, k)`);
    assert.equal(graded(spec, none('v'), { analysisRequests: [{ id: 'v', kind: 'point', feature: 'vertex' }] }), true, `${name}: no vertex`);
  }
});

test('a question that names no feature asks for the function\'s own: (h, k) stays right where it is one', () => {
  const defaultFeature = (spec) => normalizeAnalysisRequests({}, spec, window, true)[0].feature;
  assert.equal(defaultFeature(SPECS.quadratic), 'vertex');
  assert.equal(defaultFeature(SPECS.absolute), 'vertex');
  for (const name of ['rational', 'cubic', 'cubeRoot']) {
    assert.equal(defaultFeature(SPECS[name]), 'center', name);
    const spec = SPECS[name];
    assert.equal(graded(spec, clicked([spec.h, spec.k])), true, `${name}: the (h, k) a student clicked stays right`);
  }
  for (const name of ['quadratic', 'absolute']) {
    const spec = SPECS[name];
    assert.equal(graded(spec, clicked([spec.h, spec.k])), true, name);
  }
  // A function with neither: the request is still the vertex, which it does
  // not have, so (h, k) is no longer right and "Does not exist" is.
  assert.equal(defaultFeature(SPECS.exponential), 'vertex');
  assert.equal(graded(SPECS.exponential, clicked([0, 1])), false);
  assert.equal(graded(SPECS.exponential, none()), true);
  // An authored analysisFeature is kept as written.
  assert.equal(normalizeAnalysisRequests({ analysisFeature: 'yIntercept' }, SPECS.rational, window, true)[0].feature, 'yIntercept');
});

test('an unrecognised point request falls back to the function\'s own feature, not always the vertex', () => {
  const [part] = normalizeAnalysisRequests({ analysisRequests: [{ id: 'p', kind: 'keyPoint' }] }, SPECS.cubic, window, false);
  assert.equal(part.feature, 'center');
  assert.deepEqual(part.expected, [[SPECS.cubic.h, SPECS.cubic.k]]);
  assert.equal(normalizeAnalysisRequests({ analysisRequests: [{ id: 'p', kind: 'keyPoint' }] }, SPECS.quadratic, window, false)[0].feature, 'vertex');
});
