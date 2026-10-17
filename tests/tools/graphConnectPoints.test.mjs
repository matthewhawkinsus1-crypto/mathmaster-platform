/*
 * "CONNECT MY POINTS" (pass 3, TOOL-1; src/graphConnectPoints.js).
 *
 * A function-graph question could be finished only with a mouse or a finger:
 * points by arrow keys and Enter, but the curve by drawing. "Connect my points"
 * builds the stroke through the student's OWN placed points and hands it to
 * the same checks a drawn stroke meets, so the student still has to choose the
 * right points. Proven here against those checks; the rendered button, by
 * keyboard, in tests/browser/graphKeyboardRoute.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectPointsStrokes,
  constructionBranchSplitX,
  constructionPointsToConnect,
  inversePointsToConnect,
  smoothCurveThrough,
} from '../../src/graphConnectPoints.js';
import {
  constructionSketchMatches,
  constructionSketchThroughOwnPoints,
  graphWorkspaceModelFor,
  inverseSketchMatches,
  inverseSketchThroughOwnPoints,
} from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { resolveTaskExpected } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';

const QUADRATIC = { type: 'functionGraph', prompt: 'Graph f(x) = (x - 1)^2 - 2.', functionSpec: { type: 'quadratic', a: 1, h: 1, k: -2 } };
const SQUARE_ROOT = { type: 'functionGraph', functionSpec: { type: 'squareRoot', a: 1, h: 2, k: 0 } };
const RATIONAL = { type: 'functionGraph', functionSpec: { type: 'rational', a: 2, h: 1, k: 1 } };
const ABSOLUTE = { type: 'functionGraph', functionSpec: { type: 'absolute', a: -1, h: -1, k: 3 } };
const LINE = { type: 'functionGraph', functionSpec: { type: 'linear', m: 2, b: -1 } };
const INVERSE = {
  type: 'functionInvestigation',
  functionSpec: { type: 'linear', m: 2, b: 1 },
  graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
  pointTasks: [
    { id: 'p0', label: 'x = 0', x: 0, expected: [0, 1] },
    { id: 'p1', label: 'x = 1', x: 1, expected: [1, 3] },
  ],
  inverseReflection: { enabled: true, sourceTaskIds: ['p0', 'p1'], requireInverseSketch: true, requireInverseEquation: true, equationPartId: 'inverse-equation' },
  analysisRequests: [
    { id: 'inverse-reflect-p0', kind: 'inversePoint', sourceTaskId: 'p0', responseMode: 'click' },
    { id: 'inverse-reflect-p1', kind: 'inversePoint', sourceTaskId: 'p1', responseMode: 'click' },
    { id: 'inverse-equation', kind: 'value', notation: 'equation', responseMode: 'text', expected: ['y=(x-1)/2'] },
  ],
};

// The camera on screen when the button is pressed: the authored window.
const cameraOf = (model) => ({ xMin: model.viewWindow.xMin, xMax: model.viewWindow.xMax, yMin: model.viewWindow.yMin, yMax: model.viewWindow.yMax });
// Every task placed where it belongs: what a student who got the points right has.
const rightPlacements = (model) => Object.fromEntries(model.tasks.map((task) => [task.id, resolveTaskExpected(task, model.functionSpec, {})]));
const connect = (model, placements) => connectPointsStrokes({
  points: constructionPointsToConnect(model, placements),
  camera: cameraOf(model),
  splitX: constructionBranchSplitX(model, placements),
});

for (const [name, question] of Object.entries({ QUADRATIC, SQUARE_ROOT, RATIONAL, ABSOLUTE, LINE })) {
  test(`${name}: the right points, connected, pass the same check a drawn curve meets`, () => {
    const model = graphWorkspaceModelFor(question);
    const placements = rightPlacements(model);
    const strokes = connect(model, placements);
    assert.equal(strokes.length, model.requiredStrokeCount, 'one stroke per branch');
    strokes.forEach((stroke) => assert.ok(stroke.length >= 6, 'long enough to count as a stroke'));
    // Outcomes shown: snaps to the function. Withheld: through the student's points.
    assert.equal(constructionSketchMatches(model, { strokes, camera: cameraOf(model) }), true);
    assert.equal(constructionSketchThroughOwnPoints(model, { strokes, camera: cameraOf(model), placements }), true);
  });
}

test('wrong points, connected, are refused by the check that refuses a wrong drawn curve', () => {
  const model = graphWorkspaceModelFor(QUADRATIC);
  const right = rightPlacements(model);
  // Every point three units too high: a parabola, but not this one.
  const wrong = Object.fromEntries(Object.entries(right).map(([id, [x, y]]) => [id, [x, y + 3]]));
  const strokes = connect(model, wrong);
  assert.equal(constructionSketchMatches(model, { strokes, camera: cameraOf(model) }), false, 'it does not snap to the function');
  // Where outcomes are withheld it is accepted as a curve through the
  // student's own points — and then graded against the function at submission,
  // exactly as a drawn one is.
  assert.equal(constructionSketchThroughOwnPoints(model, { strokes, camera: cameraOf(model), placements: wrong }), true);
  // It never goes through the true points instead of the student's.
  assert.equal(constructionSketchThroughOwnPoints(model, { strokes, camera: cameraOf(model), placements: right }), false);
});

test('a point off the curve is not smoothed away: the curve goes through every point the student placed', () => {
  const model = graphWorkspaceModelFor(QUADRATIC);
  const placements = rightPlacements(model);
  const [firstId] = Object.keys(placements);
  placements[firstId] = [placements[firstId][0], placements[firstId][1] - 4];
  const strokes = connect(model, placements);
  assert.equal(constructionSketchThroughOwnPoints(model, { strokes, camera: cameraOf(model), placements }), true);
  assert.equal(constructionSketchMatches(model, { strokes, camera: cameraOf(model) }), false);
});

test('a rational with every point on one side of the center draws one branch and does not pass', () => {
  const model = graphWorkspaceModelFor(RATIONAL);
  const placements = rightPlacements(model);
  const split = constructionBranchSplitX(model, placements);
  const centerIds = new Set(model.tasks.filter((task) => task.role === 'center').map((task) => task.id));
  const oneSide = Object.fromEntries(Object.entries(placements).filter(([id, [x]]) => x < split || centerIds.has(id)));
  const strokes = connect(model, oneSide);
  assert.ok(strokes.length < model.requiredStrokeCount);
  assert.equal(constructionSketchMatches(model, { strokes, camera: cameraOf(model) }), false);
});

test('the inverse sketch is connected through the reflected points the student placed', () => {
  const model = graphWorkspaceModelFor(INVERSE);
  const camera = cameraOf(model);
  const right = { 'inverse-reflect-p0': [[1, 0]], 'inverse-reflect-p1': [[3, 1]] };
  const strokes = connectPointsStrokes({ points: inversePointsToConnect(model, right), camera });
  assert.equal(inverseSketchMatches(model, { strokes, camera }), true);
  assert.equal(inverseSketchThroughOwnPoints(model, { strokes, camera, selections: right }), true);
  const wrong = { 'inverse-reflect-p0': [[0, 1]], 'inverse-reflect-p1': [[1, 3]] }; // not reflected
  const wrongStrokes = connectPointsStrokes({ points: inversePointsToConnect(model, wrong), camera });
  assert.equal(inverseSketchMatches(model, { strokes: wrongStrokes, camera }), false);
});

test('the curve passes exactly through each point and never overshoots between two of them', () => {
  const points = [[-2, 4], [0, 0], [1, 1], [2, 4]];
  const curve = smoothCurveThrough(points, 20);
  points.forEach(([x, y]) => assert.ok(curve.some(([cx, cy]) => Math.abs(cx - x) < 1e-9 && Math.abs(cy - y) < 1e-9), `through (${x}, ${y})`));
  // Between (0, 0) and (1, 1), and between (1, 1) and (2, 4), y stays inside the two values.
  curve.filter(([x]) => x >= 0 && x <= 2).forEach(([x, y]) => {
    const [lo, hi] = x <= 1 ? [0, 1] : [1, 4];
    assert.ok(y >= lo - 1e-9 && y <= hi + 1e-9, `no overshoot at x = ${x}`);
  });
  assert.deepEqual(smoothCurveThrough([[1, 2]]), [], 'one point is not a curve');
});

test('a rational is split where the STUDENT put its center, never at the true one', () => {
  // Where outcomes are withheld, splitting at the true asymptote would hand the
  // answer to a student whose center is wrong (pass 3 review).
  const model = graphWorkspaceModelFor(RATIONAL);
  const placements = rightPlacements(model);
  const center = model.tasks.find((task) => task.role === 'center');
  assert.ok(center, 'the rational has a center task');
  const trueX = Number(model.functionSpec.h);
  placements[center.id] = [trueX + 3, placements[center.id][1]];
  assert.equal(constructionBranchSplitX(model, placements), trueX + 3);
  const strokes = connect(model, placements);
  // Every point left of the student's center is in the first stroke, including
  // the ones right of the true asymptote.
  const toX = (stroke) => stroke.map(([x]) => x);
  const firstMax = Math.max(...toX(strokes[0]));
  const camera = cameraOf(model);
  const studentSplitInViewBox = 56 + ((trueX + 3 - camera.xMin) / (camera.xMax - camera.xMin)) * (760 - 112);
  assert.ok(firstMax < studentSplitInViewBox && firstMax > 56 + ((trueX - camera.xMin) / (camera.xMax - camera.xMin)) * (760 - 112),
    'the first branch runs past the true asymptote up to the student\'s center');
});
