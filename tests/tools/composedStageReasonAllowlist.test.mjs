import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STAGE_REASON_ALLOWLIST,
  failedStageReasons,
  gradeComposedWorkflowCheck,
} from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { POINT_INPUT_NONE_TOKEN, gradeStage } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { buildWorkflowAnswerState } from '../../src/platform/workflow/workflowAnswerState.js';
import { buildFigureMatchResponse } from '../../src/platform/workflow/figureMatch.js';

/*
 * A RED STEP'S REASON NEVER GIVES AWAY AN ANSWER (wave 7, review B1).
 *
 * The screen's reasons are an allowlist by stage kind (composedWorkflow.mjs,
 * STAGE_REASON_ALLOWLIST). These tests run every failing branch gradeStage has,
 * for every stage kind, and require: a kind not on the list shows nothing; a
 * feature step (graphFeatureSelect, pointInput) shows nothing for any miss, so
 * no outcome — "the graph has none", "it has one", a wrong point — can be told
 * from another; roles and axes say one sentence whatever is wrong. And on
 * real district Classwork (DOL1 review, the gym question) no reason says
 * whether the graph has an x-intercept while the student still has tries.
 */

const ARTIFACT = '__mathmasterWorkflowArtifact';
const feature = (selections, none = false) => ({ [ARTIFACT]: 'featureSelection', selections, none, isComplete: true });
const axes = (fields) => ({ ...fields, [ARTIFACT]: 'axes', isComplete: true });
const table = (cells, xValues = [0, 1, 2]) => ({ [ARTIFACT]: 'table', isComplete: true, cells, xValues, points: [], sourceModel: null, sourceChecked: 0, sourceConsistent: true });
const graph = (fields) => ({ [ARTIFACT]: 'graph', isComplete: true, ...fields });

// One failing outcome of one branch: what the screen says for it.
const shown = (stage, rule, response, extra = {}) => {
  const responses = { [stage.id]: response, ...extra };
  const part = gradeStage({ stage, rule, responses, stages: [stage] });
  assert.equal(part.isCorrect, false, `${stage.kind}: the fixture is a miss (${part.detail})`);
  assert.notEqual(part.graded, false, `${stage.kind}: the fixture is graded`);
  return failedStageReasons([part], [stage])[stage.id] || '';
};

const FIGURE_STAGE = {
  id: 'sort',
  kind: 'figureMatch',
  items: [{ id: 'k1', math: 'y=2x' }, { id: 'k2', math: 'y=2^x' }, { id: 'k3', math: 'y=x+5' }, { id: 'k4', math: 'y=3(0.5)^x' }],
  categories: [{ id: 'linear', label: 'Linear' }, { id: 'exponential', label: 'Exponential' }],
};
const FIGURE_KEY = { k1: 'linear', k2: 'exponential', k3: 'linear', k4: 'exponential' };

// Every failing branch of gradeStage, by kind. Each entry: [stage, rule,
// response, other responses]. Outcomes in one list must not be told apart
// where the kind shows one fixed sentence (or nothing).
const BRANCHES = {
  graphFeatureSelect: [
    [{ id: 'f', kind: 'graphFeatureSelect' }, { none: true }, feature([[2, 0]])],
    [{ id: 'f', kind: 'graphFeatureSelect' }, { points: [[2, 0]] }, feature([], true)],
    [{ id: 'f', kind: 'graphFeatureSelect' }, { points: [[1, 0], [4, 0]] }, feature([[1, 0]])],
    [{ id: 'f', kind: 'graphFeatureSelect' }, { points: [[2, 0]] }, feature([[2, 0], [5, 0]])],
    [{ id: 'f', kind: 'graphFeatureSelect' }, { points: [[2, 0]] }, feature([[7, 0]])],
  ],
  pointInput: [
    [{ id: 'p', kind: 'pointInput' }, { none: true }, '(2, 0)'],
    [{ id: 'p', kind: 'pointInput' }, { points: [[2, 0]] }, POINT_INPUT_NONE_TOKEN],
    [{ id: 'p', kind: 'pointInput' }, { points: [[1, 0], [4, 0]] }, '(1, 0)'],
    [{ id: 'p', kind: 'pointInput' }, { points: [[2, 0]] }, '(7, 0)'],
  ],
  quantityRoles: [
    [{ id: 'r', kind: 'quantityRoles' }, { independent: 't', dependent: 'v' }, { independent: 'v', dependent: 'v' }],
    [{ id: 'r', kind: 'quantityRoles' }, { independent: 't', dependent: 'v' }, { independent: 't', dependent: 't' }],
    [{ id: 'r', kind: 'quantityRoles' }, { independent: 't', dependent: 'v' }, { independent: 'v', dependent: 't' }],
  ],
  axisSetup: [
    [{ id: 'a', kind: 'axisSetup' }, { xLabel: ['Time'], yLabel: ['Volume'], xUnit: ['minutes'], yUnit: ['gallons'] }, axes({ xLabel: 'Volume', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'gallons' })],
    [{ id: 'a', kind: 'axisSetup' }, { xLabel: ['Time'], yLabel: ['Volume'], xUnit: ['minutes'], yUnit: ['gallons'] }, axes({ xLabel: 'Time', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'liters' })],
    [{ id: 'a', kind: 'axisSetup' }, { xLabel: ['Time'], yLabel: ['Volume'], xUnit: ['minutes'], yUnit: ['gallons'] }, axes({ xLabel: 'Volume', yLabel: 'Time', xUnit: 'gallons', yUnit: 'minutes' })],
  ],
  tableInput: [
    [{ id: 't', kind: 'tableInput', xValues: [0, 1, 2] }, { values: { '0:y': '3', '1:y': '5', '2:y': '7' } }, table({ '0:y': '3', '1:y': '5', '2:y': '8' })],
    [{ id: 't', kind: 'tableInput', xValues: [0, 1, 2] }, { values: { '0:y': '3', '1:y': '5', '2:y': '7' } }, table({ '0:y': '1', '1:y': '1', '2:y': '1' })],
  ],
  coordinatePlot: [
    [{ id: 'g', kind: 'coordinatePlot' }, { useStageVerdict: true }, graph({ isCorrect: false })],
    [{ id: 'g', kind: 'coordinatePlot' }, { pairs: [[1, 2], [2, 4]] }, graph({ isCorrect: false, construction: { placements: { a: [1, 2], b: [5, 5] } } })],
    [{ id: 'g', kind: 'coordinatePlot' }, { pairs: [[1, 2], [2, 4]] }, graph({ isCorrect: false, construction: { placements: { a: [3, 3] } } })],
  ],
  functionGraph: [
    [{ id: 'g', kind: 'functionGraph', sourceStageId: 't' }, { useStageVerdict: true }, graph({ isCorrect: false })],
    [{ id: 'g', kind: 'functionGraph' }, { useStageVerdict: true, consistentWith: 'm' }, graph({ isCorrect: false })],
  ],
  mappingDiagram: [
    [{ id: 'm', kind: 'mappingDiagram' }, { pairs: [[1, 2], [2, 4]] }, [[1, 3]]],
    [{ id: 'm', kind: 'mappingDiagram' }, { pairs: [[1, 2], [2, 4]] }, [[1, 2], [2, 4], [3, 6]]],
  ],
  valueSet: [
    [{ id: 's', kind: 'valueSet' }, { set: ['1', '2', '3'] }, '{1, 2}'],
    [{ id: 's', kind: 'valueSet' }, { set: ['1', '2', '3'] }, '{1, 2, 3, 4}'],
  ],
  figureMatch: [
    [FIGURE_STAGE, { match: FIGURE_KEY }, buildFigureMatchResponse(FIGURE_STAGE, { ...FIGURE_KEY, k1: 'exponential' })],
  ],
  // Kinds with no reason at all: their miss is "Not correct yet.".
  equationInput: [[{ id: 'e', kind: 'equationInput' }, 'y=2x+1', 'y=3x']],
  numberLine: [[{ id: 'n', kind: 'numberLine' }, 'x>2', 'x<2']],
  domainInput: [[{ id: 'd', kind: 'domainInput' }, '(-\\infty, \\infty)', '[0, 5]']],
  rangeInput: [[{ id: 'd', kind: 'rangeInput' }, '[0, 5]', '[1, 5]']],
  intervalInput: [[{ id: 'i', kind: 'intervalInput' }, '[0, 5]', '(0, 5)']],
  classification: [[{ id: 'c', kind: 'classification' }, 'Yes', 'No']],
  multipleChoice: [[{ id: 'c', kind: 'multipleChoice' }, 'c1', 'c2']],
};

// What each kind may say: [] is nothing at all.
const EXPECTED = {
  graphFeatureSelect: [],
  pointInput: [],
  quantityRoles: ['Check which quantity is independent and which is dependent.'],
  axisSetup: ['Check each axis: its quantity and its unit.'],
  tableInput: ['Some values in your table do not match.'],
  coordinatePlot: ['Some points are not where the ordered pairs put them.'],
  functionGraph: ['Some points are not where the table puts them.', 'Revise the graph so it matches the model and table you built.'],
  mappingDiagram: ['The arrows do not match the relation — check which value each one is joined to.'],
  valueSet: ['That is not the set of values in this relation — list each one once.'],
  figureMatch: ['3 of 4 figures are in the right category.'],
};

test('every failing branch of every stage kind shows only what its kind may say', () => {
  for (const [kind, branches] of Object.entries(BRANCHES)) {
    const said = [...new Set(branches.map(([stage, rule, response, extra]) => shown(stage, rule, response, extra)))].filter(Boolean);
    assert.deepEqual(said.sort(), [...(EXPECTED[kind] || [])].sort(), kind);
  }
});

test('a feature step says nothing for any miss, so no outcome can be told from another', () => {
  for (const kind of ['graphFeatureSelect', 'pointInput']) {
    BRANCHES[kind].forEach(([stage, rule, response]) => assert.equal(shown(stage, rule, response), '', `${kind} ${JSON.stringify(rule)}`));
    assert.deepEqual(STAGE_REASON_ALLOWLIST[kind], [], `${kind} has nothing on the list`);
  }
});

test('a kind or a shape that is not on the list shows nothing', () => {
  // A line that is allowed for one kind is nothing for another.
  assert.deepEqual(failedStageReasons([{ id: 'n', isCorrect: false, detail: 'Some values in your table do not match.' }], [{ id: 'n', kind: 'numberLine' }]), {});
  assert.deepEqual(failedStageReasons([{ id: 'x', isCorrect: false, detail: 'This graph does not have one.' }], [{ id: 'x', kind: 'tableInput' }]), {});
  // An unknown stage (no kind) and an unlisted shape on a listed kind.
  assert.deepEqual(failedStageReasons([{ id: 'x', isCorrect: false, detail: 'Check the x-axis unit.' }], []), {});
  assert.deepEqual(failedStageReasons([{ id: 'v', isCorrect: false, detail: 'The answer is 7.' }], [{ id: 'v', kind: 'valueSet' }]), {});
  // Kinds listed without a reason, and every listed kind is a real stage kind.
  Object.keys(STAGE_REASON_ALLOWLIST).forEach((kind) => assert.ok(BRANCHES[kind], `${kind} has its failing branches here`));
});

test('the table count against the student\'s own function is shown; it says nothing about the key', () => {
  const stage = { id: 't', kind: 'tableInput', xValues: [0, 1, 2] };
  const said = shown(stage, { consistentWith: 'model' }, table({ '0:y': '1', '1:y': '9', '2:y': '5' }), { model: 'y=2x+1' });
  assert.equal(said, '1 value(s) do not follow the function you wrote.');
});

test('axes with a scale asked say so, still one sentence', () => {
  const stage = { id: 'a', kind: 'axisSetup', requireScale: true };
  const rule = { xLabel: ['Time'], yLabel: ['Volume'], xUnit: ['minutes'], yUnit: ['gallons'], xStep: ['1'], yStep: ['10'], requireScale: true };
  const said = new Set([
    shown(stage, rule, axes({ xLabel: 'Time', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'gallons', xStep: '2', yStep: '10' })),
    shown(stage, rule, axes({ xLabel: 'Volume', yLabel: 'Volume', xUnit: 'minutes', yUnit: 'gallons', xStep: '1', yStep: '10' })),
  ]);
  assert.deepEqual([...said], ['Check each axis: its quantity, its unit and its scale.']);
});

/* --------------------------------- district Classwork: DOL1 graph analysis */

const DOL1 = compileAuthoringIntentV5(JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json', import.meta.url), 'utf8'))).package;
const runner = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return buildWorkflowAnswerState({ question, stages: activeStages(workflow, responses), responses, grading });
};
const EXISTENCE = /does (not )?have one|has none|\bnone\b|\d+ of \d+ correct/i;

test('the gym question (DOL1 Classwork): no reason says whether the graph has an x-intercept', () => {
  const classwork = DOL1.sections.find((section) => section.role === 'classwork');
  const gym = classwork.questions.find((question) => /gym charges a one-time sign-up fee/i.test(question.prompt || ''));
  assert.ok(gym, 'the gym question is in the Classwork');
  const { grading } = readComposedQuestion(gym);
  assert.equal(grading.xIntercept?.none, true, 'its key: no x-intercept');
  // The student says "Yes" and marks (2, 0) in both x-intercept steps.
  const responses = { xInterceptExists: 'Yes', xIntercept: feature([[2, 0]]), xInterceptValue: '(2, 0)' };
  const state = runner(gym, responses);
  const marked = Object.fromEntries(state.parts.map((part) => [part.id, part.isCorrect]));
  assert.equal(marked.xIntercept, false);
  assert.equal(marked.xInterceptValue, false);
  assert.equal(state.stageReasons.xIntercept, undefined);
  assert.equal(state.stageReasons.xInterceptValue, undefined);
  Object.values(state.stageReasons).forEach((reason) => assert.doesNotMatch(reason, EXISTENCE, reason));
  // The same through the shared Check the browser runs.
  const check = gradeComposedWorkflowCheck(gym, composedWorkflowWork(responses));
  assert.deepEqual(Object.keys(check.stageReasons).filter((id) => /Intercept|extreme/i.test(id)), []);
});

test('every DOL1 feature step, missed either way, says nothing', () => {
  let probed = 0;
  DOL1.sections.forEach((section) => section.questions.forEach((question) => {
    const { composed, workflow, grading } = readComposedQuestion(question);
    if (!composed) return;
    workflow.filter((stage) => ['graphFeatureSelect', 'pointInput'].includes(stage.kind)).forEach((stage) => {
      const rule = grading[stage.id] || {};
      // Miss it the other way: "none" where there is one, a point where there is none.
      const wrong = rule.none === true
        ? (stage.kind === 'pointInput' ? '(2, 0)' : feature([[2, 0]]))
        : (stage.kind === 'pointInput' ? POINT_INPUT_NONE_TOKEN : feature([], true));
      const state = runner(question, { [stage.id]: wrong });
      assert.equal(state.stageReasons[stage.id], undefined, `${section.role} "${(question.prompt || '').slice(0, 40)}" ${stage.id}`);
      Object.values(state.stageReasons).forEach((reason) => assert.doesNotMatch(reason, EXISTENCE, reason));
      probed += 1;
    });
  }));
  assert.ok(probed >= 20, `probed ${probed} feature steps`);
});
