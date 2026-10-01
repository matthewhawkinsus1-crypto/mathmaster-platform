import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { MAX_REFERENCE_POINTS, studentPlottedPoints } from '../../src/platform/workflow/workflowGraphVisuals.js';

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
  const branch = region(workspace, 'if (outcomesWithheld && !construction.pointsValidated) {', 'const matches = roughSketchMatchesGraph', 'own-points acceptance');
  assert.match(branch, /requiredScreenPoints: ownPoints/);
  assert.match(branch, /idealScreenPaths: \[\]/);
  // Consulting the function here is exactly the oracle being removed: a curve
  // that would only be accepted through the right points.
  assert.doesNotMatch(branch, /requiredGraphPoints|idealScreenPointPaths|functionSpec/);
  const inverse = region(workspace, "if (stage === 'analysis' && inverseReflectionEnabled && outcomesWithheld", "if (stage === 'analysis' && inverseReflectionEnabled) {", 'inverse own-points acceptance');
  assert.match(inverse, /idealScreenPaths: \[\]/);
  assert.doesNotMatch(inverse, /inverseRequiredGraphPoints|inverseIdealScreenPointPaths/);
});

test('that curve is graded at submission as practice would have required before its snap', () => {
  const verdict = region(workspace, 'const sketchFollowsFunction = useMemo', 'const inverseSketchFollowsInverse', 'curve verdict');
  // Against the function...
  assert.match(verdict, /requiredScreenPoints: requiredGraphPoints, idealScreenPaths: idealScreenPointPaths/);
  // ...and through right points, because the sketch tolerance alone accepts a
  // line through a point a grid unit off.
  assert.match(verdict, /const curveCorrect = construction\.snapped\s*&& \(!curveAcceptedOwnPoints \|\| \(sketchFollowsFunction === true && pointParts\.every\(\(part\) => part\.isCorrect\)\)\)/);
  const inverseVerdict = region(workspace, 'const inverseSketchFollowsInverse', 'const checkInversePoints', 'inverse verdict');
  assert.match(inverseVerdict, /requiredScreenPoints: inverseRequiredGraphPoints, idealScreenPaths: inverseIdealScreenPointPaths/);
  assert.match(inverseVerdict, /inverseSketchFollowsInverse === true && inversePointsCorrect/);
  const report = region(workspace, 'const constructionParts = constructionEnabled ? [', 'const parts = [', 'graded parts');
  assert.match(report, /id: 'graph-curve'[^\n]*isCorrect: curveCorrect/);
  assert.match(report, /id: 'inverse-line-sketch'[^\n]*isCorrect: inverseCurveCorrect/);
});

test('whether a curve was drawn through the student\'s own points is read from the work, not the policy', () => {
  // A teacher releasing feedback later must not swap the true function in for
  // the curve the student drew.
  assert.match(workspace, /const curveAcceptedOwnPoints = Boolean\(construction\.snapped\) && !construction\.pointsValidated;/);
  assert.match(workspace, /const inverseAcceptedOwnPoints = Boolean\(analysis\.inverseSnapped\) && !analysis\.inversePointsValidated;/);
  assert.match(workspace, /const showPredrawnGraph = [^\n]*!curveAcceptedOwnPoints/);
});

test('graph ends: no pull, no pulse, no symbol hint where outcomes are withheld — and the same reach as practice', () => {
  const place = region(workspace, 'const placeMarkerAt = ', 'const handleGridClick', 'placeMarkerAt');
  assert.match(place, /const magnetic = !outcomesWithheld && nearTheEnd;/);
  // Where the marker counts as "at the end" is unchanged: practice's radius.
  assert.match(place, /const nearTheEnd = nearest\.distance <= MARKER_SNAP_PIXELS;/);
  assert.match(place, /locationCorrect: nearTheEnd/);
  assert.match(workspace, /\{!placement && !outcomesWithheld && <><circle[^\n]*mathmaster-endpoint-pulse/);
  assert.match(workspace, /const endsDescribedForStudent = revealPointCorrectness;/);
  assert.match(workspace, /const availableMarkerTypes = !endsDescribedForStudent \? \['arrow', 'open', 'closed'\]/);
  assert.match(workspace, /const endpointCompletionNoun = !endsDescribedForStudent \? 'end marker'/);
});

test('the click that ends a stroke is not also a placement', () => {
  const click = region(workspace, 'const handleGridClick = (event) => {', 'const eventToGraphPoint', 'handleGridClick');
  const guard = click.indexOf('if (strokeJustEndedRef.current)');
  assert.ok(guard > -1 && guard < click.indexOf('eventToGraphPoint(event)'), 'the guard runs before anything is placed');
  const end = region(workspace, 'const endDrawing = (event) => {', 'const showPredrawnGraph', 'endDrawing');
  assert.ok(end.indexOf('strokeJustEndedRef.current = true') > end.indexOf('if (finished.length < 2) return;'), 'only a real stroke swallows its click');
  assert.match(region(workspace, 'const beginDrawing = (event) => {', 'const continueDrawing', 'beginDrawing'), /strokeJustEndedRef\.current = false;/);
});

test('the graph-coordinate copy of a sketch stays out of the response key', () => {
  // The key is stored with every attempt; work saved before the copy existed
  // must keep the key it was submitted under.
  assert.match(workspace, /const SKETCH_COPY_FIELDS = new Set\(\['sketchGraph', 'inverseSketchGraph'\]\);/);
  assert.match(workspace, /responseKey: JSON\.stringify\(\{ construction: responseKeyState\(construction\), analysis: responseKeyState\(analysis\) \}\)/);
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
  const magnets = runner.match(/const magneticSnapTargets = revealCorrectness\s*&&/g) || [];
  assert.equal(magnets.length, 2, 'the magnet (on only for an agreeing table) is off where outcomes are withheld, in both graph steps');
  const block = region(runner, '<strong>Your table and function do not agree yet.</strong>', null, 'disagreement block');
  assert.ok(block);
  assert.match(runner, /if \(revealCorrectness && sourceIsTable && \(source\.sourceModel \|\| source\.sourceFunctionSpec\) && source\.sourceChecked > 0 && source\.sourceConsistent === false\)/);
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
