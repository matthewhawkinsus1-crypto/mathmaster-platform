import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { MAX_REFERENCE_POINTS, studentPlottedPoints } from '../../src/platform/workflow/workflowGraphVisuals.js';
import {
  buildGraphWorkspaceModel,
  constructionSketchMatches,
  constructionSketchThroughOwnPoints,
  graphToViewBox,
} from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { gradeGraphWorkspace } from '../../functions/shared/serverGrading/tools/graphWorkspace.mjs';
import { resolveTaskExpected } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';

const LINE = { type: 'functionGraph', functionSpec: { type: 'linear', m: 2, b: -1 }, requireEndpointMarkers: false };

// ON A DOL, QUIZ OR TEST NO GRAPH SURFACE SAYS WHETHER THE WORK IS RIGHT
// BEFORE IT IS SUBMITTED (PQ-036 and the composed-question leaks found with it).
//
// The behaviour is exercised end to end in a real browser by
// tests/browser/graphPointCheck.mjs (the graph workspace, practice against
// DOL, including that a correct DOL graph earns full credit) and
// tests/browser/composedOutcomePolicy.mjs (multi-step questions). Node cannot
// render these components, so what CI holds here is the wiring each of those
// behaviours depends on, bound to the code that has to do the work.

const code = (path) => executableSource(readFileSync(path, 'utf8'));
const workspace = code('src/InteractiveGraphWorkspace.jsx');
const runner = code('src/platform/workflow/WorkflowRunner.jsx');
const engine = code('src/QuestionEngine.jsx');

const graphResponse = (parts) => ({ __mathmasterWorkflowArtifact: 'graph', isComplete: true, isCorrect: false, parts });

test('the later steps read the student\'s own points back from the graph step\'s record', () => {
  const points = studentPlottedPoints(graphResponse([
    { id: 'p1', label: 'Point placement: P1', response: '(0, 1)' },
    { id: 'p2', label: 'Point placement: P2', response: '(-2.5, 1e-7)' },
    { id: 'p3', label: 'Point placement: Undefined 1', response: 'Undefined' },
    { id: 'p4', label: 'Point placement: P4', response: '' },
    { id: 'graph-curve', label: 'Freehand curve and snap', response: 'snapped' },
    { id: 'endpoint-0-start-placement', label: 'Graph end 1: symbol placement', response: '(4, 9)' },
  ]));
  assert.deepEqual(points, [[0, 1], [-2.5, 1e-7]]);
});

test('the read-back reads the graph step\'s own work first: its placements, as the workspace left them', () => {
  // The graph step's artifact carries the workspace's work
  // (workflowGraphStage.mjs workflowGraphArtifact); parts are only a fallback
  // for a step stored before that.
  const artifact = {
    __mathmasterWorkflowArtifact: 'graph',
    isComplete: true,
    isCorrect: false,
    construction: { placements: { 'point-1': [0, 1], 'point-2': 'undefined', 'point-3': [-2.5, 4] } },
    analysis: {},
  };
  assert.deepEqual(studentPlottedPoints(artifact), [[0, 1], [-2.5, 4]]);
  assert.deepEqual(studentPlottedPoints({ ...artifact, construction: { placements: {} }, parts: [{ label: 'Point placement: P1', response: '(3, 3)' }] }), [[3, 3]]);
});

test('the read-back matches exactly what the graph workspace writes for a placement', () => {
  // gradePointPlacements formats a placement as `(${x}, ${y})`; anything it
  // can produce for a finite placement must come back as the same numbers.
  const placements = [[0.30000000000000004, -0.5], [-12, 12], [1.5e21, -3.25e-9]];
  const parts = placements.map(([x, y], index) => ({ label: `Point placement: P${index + 1}`, response: `(${x}, ${y})` }));
  assert.deepEqual(studentPlottedPoints(graphResponse(parts)), placements.map(([x, y]) => [x, y]));
});

test('the read-back is bounded and tolerates a malformed or missing record', () => {
  const many = Array.from({ length: MAX_REFERENCE_POINTS + 25 }, (_, index) => ({ label: 'Point placement: P', response: `(${index}, 0)` }));
  assert.equal(studentPlottedPoints(graphResponse(many)).length, MAX_REFERENCE_POINTS);
  assert.deepEqual(studentPlottedPoints(null), []);
  assert.deepEqual(studentPlottedPoints({ parts: 'not a list' }), []);
  assert.deepEqual(studentPlottedPoints(graphResponse([{ label: 'Point placement: P1', response: '(Infinity, 2)' }])), []);
});

test('the graph workspace takes its policy from the activity, and offers no check where outcomes are withheld', () => {
  assert.match(workspace, /const outcomesWithheld = !revealPointCorrectness;/);
  // Each check is a control whose only job is to answer "am I right?".
  const pointCheck = workspace.match(/\{([^{}]*)&& <button type="button" onClick=\{checkPoints\}/);
  assert.ok(pointCheck, 'the point check button is rendered behind a condition');
  assert.match(pointCheck[1], /!outcomesWithheld/);
  const reflection = region(workspace, '{inverseReflectionEnabled && !analysis.inversePointsValidated', 'Check Reflected Points', 'reflection check');
  assert.match(reflection, /!outcomesWithheld/);
  assert.match(reflection, /onClick=\{checkInversePoints\}/);
});

test('a curve drawn where outcomes are withheld is accepted through the student\'s own points, never the function', () => {
  const branch = region(workspace, 'if (outcomesWithheld && !construction.pointsValidated) {', 'const matches = constructionSketchMatches', 'own-points acceptance');
  assert.match(branch, /constructionSketchThroughOwnPoints\(model, \{ strokes: completed, camera: sketchCamera, placements: construction\.placements \}\)/);
  // Consulting the function here is exactly the oracle being removed: a curve
  // that would only be accepted through the right points.
  assert.doesNotMatch(branch, /constructionSketchMatches|functionSpec/);
  const inverse = region(workspace, 'if (outcomesWithheld && !analysis.inversePointsValidated) {', 'const matches = inverseSketchMatches', 'inverse own-points acceptance');
  assert.match(inverse, /inverseSketchThroughOwnPoints\(model, \{ strokes: completed, camera: sketchCamera, selections: analysis\.selections \}\)/);
  assert.doesNotMatch(inverse, /inverseSketchMatches\(/);
  // And the check itself knows nothing of the function: a straight stroke
  // through wrong points passes it, the true curve through them does not.
  const model = buildGraphWorkspaceModel(LINE);
  const authored = { xMin: model.viewWindow.xMin, xMax: model.viewWindow.xMax, yMin: model.viewWindow.yMin, yMax: model.viewWindow.yMax };
  const wrong = Object.fromEntries(model.tasks.map((task) => [task.id, [Number(task.x), 0]]));
  const flat = [[...Array(25)].map((_, step) => graphToViewBox(authored)([authored.xMin + ((authored.xMax - authored.xMin) * step) / 24, 0]))];
  assert.equal(constructionSketchThroughOwnPoints(model, { strokes: flat, camera: authored, placements: wrong }), true);
  assert.equal(constructionSketchMatches(model, { strokes: flat, camera: authored }), false);
});

test('that curve is graded at submission as practice would have required before its snap', () => {
  // The verdict is the shared grader's (serverGrading/tools/graphWorkspace.mjs,
  // pinned in detail by tests/tools/graphWorkspaceSharedGrading.test.mjs): the
  // work says the construction is graded as placed, and the grader marks the
  // curve against the function in the question's own window, through right
  // points. The workspace keeps the rule after feedback is released for a
  // curve drawn that way, so the work reads as what was submitted.
  assert.match(workspace, /const pointsGradedAsPlaced = outcomesWithheld \|\| curveAcceptedOwnPoints;/);
  assert.match(workspace, /graphWorkspaceWorkFromState\(\{ construction: \{ \.\.\.construction, pointsGradedAsPlaced \}, analysis \}\)/);
  const model = buildGraphWorkspaceModel(LINE);
  const authored = { xMin: model.viewWindow.xMin, xMax: model.viewWindow.xMax, yMin: model.viewWindow.yMin, yMax: model.viewWindow.yMax };
  const right = Object.fromEntries(model.tasks.map((task) => [task.id, resolveTaskExpected(task, model.functionSpec, {})]));
  const traced = model.visiblePaths.map((path) => path.map(graphToViewBox(authored)));
  const work = (placements) => ({ construction: { placements, pointsGradedAsPlaced: true, strokes: traced, sketchView: authored, sketchLocked: true } });
  const curve = (grade) => grade.parts.find((part) => part.id === 'graph-curve');
  assert.equal(curve(gradeGraphWorkspace(LINE, work(right))).isCorrect, true);
  // The same true line, but drawn through a point a unit off: still not
  // credited, because the sketch tolerance alone accepts that.
  const [firstTask] = model.tasks;
  const off = { ...right, [firstTask.id]: [right[firstTask.id][0], right[firstTask.id][1] + 1] };
  assert.deepEqual([curve(gradeGraphWorkspace(LINE, work(off))).isComplete, curve(gradeGraphWorkspace(LINE, work(off))).isCorrect], [true, false]);
});

test('whether a curve was drawn through the student\'s own points is read from the work, not the policy', () => {
  // A teacher releasing feedback later must not swap the true function in for
  // the curve the student drew.
  assert.match(workspace, /const curveAcceptedOwnPoints = Boolean\(construction\.snapped\) && !construction\.pointsValidated;/);
  assert.match(workspace, /const inverseAcceptedOwnPoints = Boolean\(analysis\.inverseSnapped\) && !analysis\.inversePointsValidated;/);
  assert.match(workspace, /const showPredrawnGraph = [^\n]*!curveAcceptedOwnPoints/);
});

test('graph ends: no pull, no pulse, no symbol hint where outcomes are withheld — the drop is judged where it lands', () => {
  const place = region(workspace, 'const placeMarkerAt = ', 'const handleGridClick', 'placeMarkerAt');
  assert.match(place, /const magnetic = !outcomesWithheld && nearest\.distance <= MARKER_SNAP_PIXELS;/);
  // No verdict about the drop is stored: the grader judges the dropped point
  // against the end, as it judges any marker that did not snap.
  assert.doesNotMatch(place, /locationCorrect/);
  assert.match(workspace, /\{!placement && !outcomesWithheld && <><circle[^\n]*mathmaster-endpoint-pulse/);
  assert.match(workspace, /const endsDescribedForStudent = revealPointCorrectness;/);
  assert.match(workspace, /const availableMarkerTypes = !endsDescribedForStudent \? \['arrow', 'open', 'closed'\]/);
  assert.match(workspace, /const endpointCompletionNoun = !endsDescribedForStudent \? 'end marker'/);
});

test('the click that ends a stroke is not also a placement', () => {
  const click = region(workspace, 'const handleGridClick = (event) => {', 'const placeAtCoordinate', 'handleGridClick');
  const guard = click.indexOf('if (strokeJustEndedRef.current)');
  assert.ok(guard > -1 && guard < click.indexOf('eventToGraphPoint(event)'), 'the guard runs before anything is placed');
  const end = region(workspace, 'const endDrawing = (event) => {', 'const showPredrawnGraph', 'endDrawing');
  assert.ok(end.indexOf('strokeJustEndedRef.current = true') > end.indexOf('if (finished.length < 2) return;'), 'only a real stroke swallows its click');
  assert.match(region(workspace, 'const beginDrawing = (event) => {', 'const continueDrawing', 'beginDrawing'), /strokeJustEndedRef\.current = false;/);
});

test('a zoom after drawing cannot move the curve judged at submission: each stroke travels with its camera', () => {
  // The strokes are stored in the drawing's own units with the window they
  // were drawn under (sketchView), in both branches of every stroke's end, and
  // the grader carries them from that camera into the question's own window.
  const end = region(workspace, 'const endDrawing = (event) => {', 'const showPredrawnGraph', 'endDrawing');
  assert.equal((end.match(/sketchView: sketchCamera/g) || []).length >= 3, true, 'construction: drawn, own points, snapped');
  assert.equal((end.match(/inverseSketchView: sketchCamera/g) || []).length >= 3, true, 'inverse: own points, drawn, snapped');
  assert.doesNotMatch(workspace, /sketchGraph|inverseSketchGraph/, 'no second copy of the sketch');
});

test('a multi-step question\'s graph steps get the activity policy', () => {
  const mounts = runner.match(/<InteractiveGraphWorkspace\b/g) || [];
  const told = runner.match(/revealPointCorrectness=\{revealCorrectness\}/g) || [];
  assert.ok(mounts.length >= 2);
  assert.equal(told.length, mounts.length, 'every graph workspace a step mounts is told the policy');
  assert.match(region(runner, 'function StageBody(', 'switch (stage.kind)', 'StageBody'), /delegate\(\{[^}]*revealCorrectness[^}]*\}\)/);
  assert.match(region(runner, '<StageBody', '/>', 'StageBody call'), /revealCorrectness=\{revealCorrectness\}/);
});

test('a multi-step question reveals nothing about a table through the graph step built from it', () => {
  // The runner sets its graph steps up through the shared module, told when
  // outcomes are withheld; there the magnet (on only for an agreeing table)
  // and the "do not agree" block are never offered (behaviour:
  // tests/platform/workflowDraftProjection.test.mjs).
  assert.match(runner, /resolveWorkflowGraphStages\(\{[\s\S]*?outcomesWithheld: !revealCorrectness,/);
  const stageModule = readFileSync('functions/shared/toolMath/workflow/workflowGraphStage.mjs', 'utf8');
  assert.equal((stageModule.match(/const magneticSnapTargets = !outcomesWithheld\s*&&/g) || []).length, 2, 'both graph steps');
  assert.match(stageModule, /if \(!outcomesWithheld && sourceIsTable && \(source\.sourceModel \|\| source\.sourceFunctionSpec\) && source\.sourceChecked > 0 && source\.sourceConsistent === false\)/);
  // The submitted work says so, so the server sets the steps up the same way.
  assert.match(runner, /buildWorkflowAnswerState\(\{[\s\S]*?outcomesWithheld: !revealCorrectness,/);
});

test('the later-step graph is the student\'s own where outcomes are withheld, and never only when right', () => {
  const reference = region(runner, 'const checkedGraphReference = ', 'export default function WorkflowRunner', 'checkedGraphReference');
  const withheld = reference.indexOf('if (!revealCorrectness) {');
  const correctGate = reference.indexOf('if (graphResponse.isCorrect !== true) return null;');
  assert.ok(withheld > -1 && correctGate > withheld, 'the withheld branch returns before correctness is consulted');
  assert.doesNotMatch(reference.slice(0, withheld), /isCorrect/, 'nothing on the way to the withheld branch reads the verdict');
  assert.match(reference.slice(withheld, correctGate), /studentPlottedPoints\(graphResponse\)/);
  assert.doesNotMatch(reference.slice(withheld, correctGate), /isCorrect|functionSpec|sampleModelSegments/);
});

test('a composed question is mounted inside the tool runtime policy, like every registry tool', () => {
  const composed = region(engine, 'if (isComposed) {', 'if (missingToolDefinition)', 'composed branch');
  const provider = composed.indexOf('<ToolRuntimeProvider');
  const runnerAt = composed.indexOf('<WorkflowRunner');
  assert.ok(provider > -1 && runnerAt > provider, 'the runner is inside the provider');
  assert.match(composed, /showImmediateFeedback=\{showOutcomeFeedback && !serverGrading\}/);
  assert.match(composed, /revealCorrectness=\{showOutcomeFeedback\}/);
});
