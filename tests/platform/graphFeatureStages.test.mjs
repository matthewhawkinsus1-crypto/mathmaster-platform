import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { INTERACTION_STAGES, STAGE_KINDS, isKnownStageKind } from '../../src/platform/workflow/interactionStages.js';
import { expandRecipe, RECIPE_NAMES } from '../../src/platform/workflow/questionRecipes.js';
import { gradeFeaturePoints, gradeWorkflow, parsePointList } from '../../src/platform/workflow/workflowGrading.js';
import { summarizeStageResponse } from '../../src/platform/workflow/workflowFocusMode.js';

const selection = (points, none = false) => ({
  __mathmasterWorkflowArtifact: 'featureSelection',
  selections: points,
  none,
  isComplete: true,
});

// y = -(x - 2)^2 + 9: zeros at -1 and 5, y-intercept (0, 5), maximum (2, 9).
const QUADRATIC = {
  recipe: 'functionCharacteristics',
  pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
  functionFamily: 'Quadratic',
  extreme: { kind: 'maximum' },
  behavior: 'Increasing, then decreasing',
  correctDomain: 'all real numbers',
  correctRange: 'y <= 9',
};

// Everything a student who understands this graph would answer. Kept in one
// place because two grading tests differ only by the mistake they inject.
const RIGHT = {
  plot: { __mathmasterWorkflowArtifact: 'graph', isComplete: true, isCorrect: true },
  model: 'Quadratic',
  xInterceptExists: 'Yes',
  xIntercept: selection([[-1, 0], [5, 0]]),
  xInterceptValue: '(-1, 0), (5, 0)',
  zeros: '{-1, 5}',
  yInterceptExists: 'Yes',
  yIntercept: selection([[0, 5]]),
  yInterceptValue: '(0, 5)',
  extremeKind: 'Maximum',
  extremePoint: selection([[2, 9]]),
  extremeValue: '(2, 9)',
  axisOfSymmetry: 'x = 2',
  // A parabola has no horizontal asymptote, so this stage carries no key and
  // reports as reviewed rather than wrong; it still has to be answered.
  asymptote: 'none',
  behavior: 'Increasing, then decreasing',
  domain: 'all real numbers',
  range: 'y <= 9',
};

const expand = (question) => expandRecipe(question, { label: 'Q' });
const stageById = (workflow) => Object.fromEntries(workflow.map((stage) => [stage.id, stage]));

test('both feature primitives are registered and reachable', () => {
  assert.ok(STAGE_KINDS.includes('graphFeatureSelect'));
  assert.ok(STAGE_KINDS.includes('pointInput'));
  assert.ok(isKnownStageKind('graphFeatureSelect'));
  assert.equal(INTERACTION_STAGES.graphFeatureSelect.produces, 'points');
  assert.equal(INTERACTION_STAGES.pointInput.produces, 'points');
});

test('the recipe expands the whole flow with no authoring errors', () => {
  const { workflow, errors } = expand(QUADRATIC);
  assert.deepEqual(errors, []);
  // The order a teacher asks in: does it exist, where is it, what is it. Each
  // is a different thing a student can get wrong, and rolled into one step a
  // student who does not know an exponential never crosses the axis scores the
  // same as one who knows and misses the click.
  assert.deepEqual(workflow.map((stage) => stage.id), [
    'plot', 'model',
    'xInterceptExists', 'xIntercept', 'xInterceptValue', 'zeros',
    'yInterceptExists', 'yIntercept', 'yInterceptValue',
    'extremeKind', 'extremePoint', 'extremeValue', 'axisOfSymmetry',
    'asymptote', 'behavior', 'domain', 'range',
  ]);
  // The locating and stating steps are only shown to a student who said there
  // is something there, so pressing them is an act of locating rather than a
  // second chance to reconsider.
  assert.deepEqual(
    workflow.filter((stage) => stage.showWhen).map((stage) => [stage.id, stage.showWhen.stage, stage.showWhen.is]),
    [
      ['xIntercept', 'xInterceptExists', 'Yes'],
      ['xInterceptValue', 'xInterceptExists', 'Yes'],
      ['zeros', 'xInterceptExists', 'Yes'],
      ['yIntercept', 'yInterceptExists', 'Yes'],
      ['yInterceptValue', 'yInterceptExists', 'Yes'],
    ],
  );
  // And the "there isn't one" button belongs to whichever step asks the
  // existence question — never to two steps at once.
  assert.equal(workflow.find((stage) => stage.id === 'xIntercept').allowNone, false);
  assert.equal(workflow.find((stage) => stage.id === 'extremePoint').allowNone, true);
  // Four or more stages is what puts the runner into focus mode: one stage on
  // screen at a time, which is the whole screen-real-estate answer.
  assert.ok(workflow.length >= 4);
});

test('the recipe derives every key it can from the table alone', () => {
  const { grading } = expand(QUADRATIC);
  assert.deepEqual(grading.xIntercept, { points: [[-1, 0], [5, 0]] });
  assert.deepEqual(grading.yIntercept, { points: [[0, 5]] });
  assert.deepEqual(grading.extremePoint, { points: [[2, 9]] });
  assert.equal(grading.extremeKind, 'Maximum');
  assert.equal(grading.model, 'Quadratic');
});

test('what a student may mark always matches what is marked correct', () => {
  // The failure this prevents: a key holding two x-intercepts while the stage
  // lets the student place only one, which is unanswerable.
  const { workflow, grading } = expand(QUADRATIC);
  const stages = stageById(workflow);
  assert.equal(stages.xIntercept.selectionCount, grading.xIntercept.points.length);
  assert.equal(stages.xInterceptValue.pointCount, grading.xInterceptValue.points.length);
  assert.equal(stages.yIntercept.selectionCount, grading.yIntercept.points.length);
});

test('an x-intercept that is not in the table is never keyed as absent', () => {
  // y = 2x + 1 crosses at (-0.5, 0), which the table never samples. Claiming
  // "no x-intercept" here would mark a correct student wrong.
  const { grading } = expand({
    recipe: 'functionCharacteristics',
    pairs: [[-2, -3], [-1, -1], [0, 1], [1, 3], [2, 5]],
    functionFamily: 'Linear',
    extreme: { kind: 'neither' },
  });
  assert.ok(!('xIntercept' in grading), 'should be left for the teacher, not guessed');
  assert.deepEqual(grading.extremePoint, { none: true });
});

test('an extreme value at the edge of the table is not treated as a turning point', () => {
  // On this table the largest y is the LAST row: the biggest value sampled, not
  // a maximum. Keying it would ask the student to click a point that is not one.
  const { grading } = expand({
    recipe: 'functionCharacteristics',
    pairs: [[0, 0], [1, 1], [2, 4], [3, 9]],
    functionFamily: 'Quadratic',
    extreme: { kind: 'maximum' },
  });
  assert.ok(!('extremePoint' in grading));
});

test('an author may state a vertex the table does not contain', () => {
  const { grading } = expand({
    recipe: 'functionCharacteristics',
    pairs: [[0, 7], [1, 4], [3, 4], [4, 7]],
    functionFamily: 'Quadratic',
    extreme: { kind: 'minimum', point: [2, 3] },
  });
  assert.deepEqual(grading.extremePoint, { points: [[2, 3]] });
});

test('"there is none" is a scoreable answer in both directions', () => {
  assert.equal(gradeFeaturePoints(selection([], true), { none: true }).isCorrect, true);
  assert.equal(gradeFeaturePoints(selection([], true), { points: [[0, 3]] }).isCorrect, false);
  assert.equal(gradeFeaturePoints(selection([[2, 0]]), { none: true }).isCorrect, false);
  // Graded, not silently dropped: a stage reported ungraded would vanish from
  // the score rather than counting against the student.
  assert.equal(gradeFeaturePoints(selection([], true), { none: true }).graded, true);
});

test('intercepts are a set, and partial credit is per point', () => {
  const key = { points: [[-1, 0], [5, 0]] };
  assert.equal(gradeFeaturePoints(selection([[5, 0], [-1, 0]]), key).isCorrect, true, 'order must not matter');
  assert.equal(gradeFeaturePoints(selection([[-1, 0]]), key).credit, 0.5);
  // Marking one right and one invented must not score the same as marking one
  // right, or a student can shotgun the plane.
  assert.equal(gradeFeaturePoints(selection([[-1, 0], [7, 0]]), key).credit, 0);
  // Naming the same intercept twice is one intercept, not two.
  assert.equal(gradeFeaturePoints(selection([[-1, 0], [-1, 0]]), key).isCorrect, false);
});

test('a typed answer grades the same as a marked one', () => {
  assert.deepEqual(parsePointList('(1, 0), (4, 0)'), [[1, 0], [4, 0]]);
  assert.equal(gradeFeaturePoints('(0, 5)', { points: [[0, 5]] }).isCorrect, true);
  assert.equal(gradeFeaturePoints('__none__', { none: true }).isCorrect, true);
  assert.equal(gradeFeaturePoints('(1,0), (4,0)', { points: [[4, 0], [1, 0]] }).isCorrect, true);
});

test('an unkeyed feature stage is reviewed, never marked wrong', () => {
  const result = gradeFeaturePoints(selection([[1, 0]]), {});
  assert.equal(result.graded, false);
  assert.equal(result.credit, 0);
});

test('a student who gets everything right scores every stage', () => {
  const { workflow, grading } = expand(QUADRATIC);
  const result = gradeWorkflow({ stages: workflow, responses: RIGHT, grading });
  const wrong = result.parts.filter((part) => part.graded && !part.isCorrect);
  assert.deepEqual(wrong.map((part) => part.id), [], 'every graded stage should be correct');
  assert.equal(result.isCorrect, true);
});

test('one mis-marked intercept costs one stage, not the question', () => {
  const { workflow, grading } = expand(QUADRATIC);
  const responses = { ...RIGHT, xIntercept: selection([[-1, 0], [4, 0]]) };
  const result = gradeWorkflow({ stages: workflow, responses, grading });
  assert.equal(result.isCorrect, false);
  assert.deepEqual(
    result.parts.filter((part) => part.graded && !part.isCorrect).map((part) => part.id),
    ['xIntercept'],
  );
  assert.ok(result.partialCreditPercent >= 80, `expected most of the credit, got ${result.partialCreditPercent}`);
});

test('the summary strip never prints a coordinate the student has still to write', () => {
  // The strip stays on screen through later stages. Printing what was marked
  // would hand over the "write the intercepts" answer exactly as a readout on
  // the plane would.
  const summary = summarizeStageResponse(
    { kind: 'graphFeatureSelect', label: 'x-intercepts' },
    selection([[-1, 0], [5, 0]]),
  );
  assert.ok(summary);
  assert.ok(!/-1|5|\(/.test(summary.text), `leaked coordinates: ${summary.text}`);
  assert.match(summary.text, /2 marked/);

  // The student's own typed answer is already committed, so it shows in full.
  assert.match(summarizeStageResponse({ kind: 'pointInput', label: 'y' }, '(0, 5)').text, /\(0, 5\)/);
  // ...and the stored token is never shown raw.
  assert.equal(summarizeStageResponse({ kind: 'pointInput', label: 'Max' }, '__none__').text, 'Does not exist');
});

test('the feature plane cannot be built with its coordinate readout on', () => {
  // The suppression is the reason the stage exists, so it is hardcoded rather
  // than configurable. If this ever becomes a prop, this test should fail.
  const source = readFileSync('src/platform/workflow/GraphFeatureSelectStage.jsx', 'utf8');
  assert.match(source, /revealCoordinates=\{false\}/);
  assert.ok(
    !/revealCoordinates=\{(?!false\})/.test(source),
    'revealCoordinates must not be wired to a prop or variable',
  );
});

test('CoordinatePlane hides both readouts when coordinates are suppressed', () => {
  const source = readFileSync('src/tools/shared/CoordinatePlane.jsx', 'utf8');
  // The preview chip and the hovered-point label are two separate leaks.
  assert.match(source, /revealCoordinates \? \(/, 'the preview chip must be gated');
  assert.match(source, /hovered && revealCoordinates \?/, 'the hover readout must be gated');
  // The live region is deliberately NOT gated: it is the only rendering of the
  // plane a screen-reader student has, so removing it makes the question
  // impossible rather than harder.
  assert.match(source, /aria-live="polite" className="mm-sr-only">\{previewText\}/);
});

test('every recipe still expands, so the new one did not disturb the others', () => {
  assert.deepEqual(RECIPE_NAMES, ['functionModeling', 'relationRepresentations', 'functionCharacteristics']);
  const relation = expandRecipe(
    { recipe: 'relationRepresentations', pairs: [[1, 2], [2, 4], [3, 6]] },
    { label: 'R' },
  );
  assert.deepEqual(relation.errors, []);
  assert.equal(relation.grading.isFunction, 'Yes');
});

/* ---------- enlarging must not strand the student ---------- */

test('enlarging a feature stage brings the answering with it', () => {
  // CoordinatePlane can enlarge itself, but that opens a modal holding only the
  // plane: a student who went full-window to find an intercept accurately then
  // had to close it again to press "this graph has none". On a phone that is
  // the difference between a usable question and an unusable one.
  const source = readFileSync('src/platform/workflow/GraphFeatureSelectStage.jsx', 'utf8');

  // The plane's own enlarge is off...
  assert.match(source, /enlargeable=\{false\}/);
  // ...and the whole stage is what gets enlarged instead.
  assert.match(source, /<EnlargeableFigure/);
  const wrapper = source.slice(source.indexOf('<EnlargeableFigure'));
  assert.match(wrapper, /\{body\}/, 'the marks, the buttons and the count all go in');

  // The modal covers the question that sent them there, so the prompt rides
  // along rather than being lost behind the backdrop.
  assert.match(wrapper, /taskText=\{stage\?\.prompt/);

  // The body must actually contain the response controls, not just the plane.
  const body = source.slice(source.indexOf('const body = ('), source.indexOf('<EnlargeableFigure'));
  assert.match(body, /Clear my marks/);
  assert.match(body, /noneButtonLabel\(stage\)/, 'the "there is none" answer must be inside the enlarged view');
});

test('saying there is no intercept skips finding one, and is not wrong', () => {
  // An exponential never crosses the x-axis. A student who knows that answers
  // the existence question and is never shown a plane to hunt on — and the
  // steps they were never asked are not counted against them.
  const exponential = {
    recipe: { name: 'functionCharacteristics', ask: ['xInterceptExists', 'xIntercept', 'xInterceptValue', 'zeros', 'yInterceptExists', 'yIntercept', 'yInterceptValue'] },
    pairs: [[0, 3], [1, 6], [2, 12]],
    graph: { xMin: -4, xMax: 5, yMin: -2, yMax: 16 },
    xIntercepts: 'none',
  };
  const { workflow, grading } = expand(exponential);
  assert.equal(grading.xInterceptExists, 'No');
  assert.equal(grading.yInterceptExists, 'Yes');
  assert.equal(grading.zeros, undefined, 'a graph with no x-intercept has no zeros to key');

  const result = gradeWorkflow({
    stages: workflow,
    responses: {
      xInterceptExists: 'No',
      yInterceptExists: 'Yes',
      yIntercept: selection([[0, 3]]),
      yInterceptValue: '(0, 3)',
    },
    grading,
  });
  assert.deepEqual(result.parts.map((part) => part.id), ['xInterceptExists', 'yInterceptExists', 'yIntercept', 'yInterceptValue']);
  assert.equal(result.isCorrect, true);
});

test('the zeros are the x-values, not the ordered pairs', () => {
  // Writing "(4, 0)" where the zero was asked for is the single most common way
  // this is confused, and asking only for the ordered pair never finds out.
  const { grading, workflow } = expand(QUADRATIC);
  assert.equal(grading.zeros, '{-1, 5}');
  assert.equal(workflow.find((stage) => stage.id === 'zeros').kind, 'valueSet');

  const wrongForm = gradeWorkflow({
    stages: workflow,
    responses: { ...RIGHT, zeros: '(-1, 0), (5, 0)' },
    grading,
  });
  assert.deepEqual(
    wrongForm.parts.filter((part) => part.graded && !part.isCorrect).map((part) => part.id),
    ['zeros'],
  );
});

test('the axis of symmetry is an equation, and the vertex is a point', () => {
  // A student who writes "2" has named the vertex's x-coordinate — a correct
  // fact about a different question. The two are asked and marked apart, and
  // the key is derived from the vertex so they cannot disagree.
  const { workflow, grading } = expand(QUADRATIC);
  assert.equal(workflow.find((stage) => stage.id === 'axisOfSymmetry').kind, 'equationInput');
  assert.equal(grading.axisOfSymmetry, 'x = 2');

  const bare = gradeWorkflow({ stages: workflow, responses: { ...RIGHT, axisOfSymmetry: '2' }, grading });
  assert.deepEqual(
    bare.parts.filter((part) => part.graded && !part.isCorrect).map((part) => part.id),
    ['axisOfSymmetry'],
  );
});
