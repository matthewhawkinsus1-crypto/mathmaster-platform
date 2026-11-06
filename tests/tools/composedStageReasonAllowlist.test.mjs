import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STAGE_REASON_ALLOWLIST,
  failedStageReasons,
  stageReasonFor,
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
  return failedStageReasons([part], [stage], { [stage.id]: rule }, responses)[stage.id] || '';
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
    // Keyed as a braced set (the zeros step): a plain list is told to write a
    // set, right values or not; a braced miss is red only (F-SET-NOTATION-UNSAID).
    [{ id: 's', kind: 'valueSet', notation: 'set' }, '{-1, 5}', '-1, 5'],
    [{ id: 's', kind: 'valueSet', notation: 'set' }, '{-1, 5}', '2, 3'],
    [{ id: 's', kind: 'valueSet', notation: 'set' }, '{-1, 5}', '{2, 3}'],
  ],
  figureMatch: [
    [FIGURE_STAGE, { match: FIGURE_KEY }, buildFigureMatchResponse(FIGURE_STAGE, { ...FIGURE_KEY, k1: 'exponential' })],
  ],
  // An equation step says its form and nothing else (FB08): a wrong line is red only.
  equationInput: [
    [{ id: 'e', kind: 'equationInput' }, 'y=2x+1', 'y=3x'],
    [{ id: 'e', kind: 'equationInput', prompt: 'Write the equation of the line in slope-intercept form.' }, 'y=-3x+5', 'y=-3x+4'],
    [{ id: 'e', kind: 'equationInput', prompt: 'Write the equation of the line in slope-intercept form.' }, 'y=-3x+5', 'y-5=-3\\left(x-0\\right)'],
    [{ id: 'e', kind: 'equationInput', prompt: 'Write the equation of the line.' }, 'y=-3x+5', '3x+y=5'],
    [{ id: 'e', kind: 'equationInput', prompt: 'Write the equation of the axis of symmetry.', placeholder: 'x = ' }, 'x=2', '2'],
    [{ id: 'e', kind: 'equationInput', prompt: 'Write the equation of the axis of symmetry.', placeholder: 'x = ' }, 'x=2', 'x=5'],
  ],
  // A domain or range step keyed as a braced set says so of a plain list,
  // and nothing else: an interval's miss is "Not correct yet.", red only.
  domainInput: [
    [{ id: 'd', kind: 'domainInput' }, '(-\\infty, \\infty)', '[0, 5]'],
    [{ id: 'd', kind: 'domainInput', notation: 'set' }, '{−2, 0, 2, 4}', '-2, 0, 2, 4'],
    [{ id: 'd', kind: 'domainInput', notation: 'set' }, '{−2, 0, 2, 4}', '{-2, 0, 2}'],
  ],
  rangeInput: [
    [{ id: 'd', kind: 'rangeInput' }, '[0, 5]', '[1, 5]'],
    [{ id: 'd', kind: 'rangeInput', notation: 'set' }, '{0, 1, 2, 3}', '0, 1, 2, 4'],
  ],
  // Kinds with no reason at all: their miss is "Not correct yet.".
  numberLine: [[{ id: 'n', kind: 'numberLine' }, 'x>2', 'x<2']],
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
  valueSet: ['That is not the set of values in this relation — list each one once.', 'Write this step as a set, with the values inside braces { }.'],
  domainInput: ['Write this step as a set, with the values inside braces { }.'],
  rangeInput: ['Write this step as a set, with the values inside braces { }.'],
  figureMatch: ['3 of 4 figures are in the right category.'],
  equationInput: ['Right line, wrong form: write it as y = mx + b.', 'Write this step as an equation, with an = sign.'],
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

test('the axes sentence names only the fields the student sees and that are graded (review N1)', () => {
  const said = (stage, rule) => stageReasonFor(stage, 'Check the x-axis quantity.', rule);
  // Units shown and graded unless either side says requireUnits: false; a
  // scale only when both the stage shows it and the rule grades it.
  assert.equal(said({ kind: 'axisSetup' }, {}), 'Check each axis: its quantity and its unit.');
  assert.equal(said({ kind: 'axisSetup', requireUnits: false }, {}), 'Check each axis: its quantity.');
  assert.equal(said({ kind: 'axisSetup' }, { requireUnits: false }), 'Check each axis: its quantity.');
  assert.equal(said({ kind: 'axisSetup', requireScale: true }, { requireScale: true }), 'Check each axis: its quantity, its unit and its scale.');
  assert.equal(said({ kind: 'axisSetup', requireScale: true }, {}), 'Check each axis: its quantity and its unit.', 'shown, not graded');
  assert.equal(said({ kind: 'axisSetup' }, { requireScale: true }), 'Check each axis: its quantity and its unit.', 'graded, not shown');
  assert.equal(said({ kind: 'axisSetup', requireUnits: false, requireScale: true }, { requireUnits: false, requireScale: true }), 'Check each axis: its quantity and its scale.');
  // Through gradeStage and the real failing branch, with units off on both sides.
  const stage = { id: 'a', kind: 'axisSetup', requireUnits: false };
  const rule = { xLabel: ['Time'], yLabel: ['Volume'], requireUnits: false };
  assert.equal(shown(stage, rule, axes({ xLabel: 'Volume', yLabel: 'Volume' })), 'Check each axis: its quantity.');
});

/* ------------------------------ an equation step says its form, never its value (FB08) */

const SLOPE_WORDS = 'Write the equation of the line in slope-intercept form.';
const SLOPE_SAYS = 'Right line, wrong form: write it as y = mx + b.';
const POINT_SAYS = 'Right line, wrong form: write it as y − y₁ = m(x − x₁).';
const STANDARD_SAYS = 'Right line, wrong form: write it as Ax + By = C.';
const EQUATION_SAYS = 'Write this step as an equation, with an = sign.';
const equationStep = (prompt, extra = {}) => ({ id: 'e', kind: 'equationInput', prompt, ...extra });

test('an equation step names the form its words (else its key) ask for, when the line is the key\'s', () => {
  [
    // [the step's words, the key, what the student wrote, what the screen says]
    [SLOPE_WORDS, 'y=-3x+5', 'y-5=-3\\left(x-0\\right)', SLOPE_SAYS],
    [SLOPE_WORDS, 'y=-3x+5', '3x+y=5', SLOPE_SAYS],
    ['Write the equation in point-slope form.', 'y-2=4(x-1)', 'y=4x-2', POINT_SAYS],
    ['Write the equation in standard form.', '4x-y=2', 'y=4x-2', STANDARD_SAYS],
    // The words name no form: the form the key is written in.
    ['Write the equation of the line.', 'y=-3x+5', '3x+y=5', SLOPE_SAYS],
    ['Write the equation of the line.', '3x+y=5', 'y=-3x+5', STANDARD_SAYS],
  ].forEach(([words, key, written, says]) => {
    assert.equal(shown(equationStep(words), key, written), says, `${words} | ${key} | ${written}`);
  });
});

test('an equation step says nothing for another line, an inequality or a blank step', () => {
  const axis = equationStep('Write the equation of the axis of symmetry.', { placeholder: 'x = ' });
  assert.equal(shown(equationStep(SLOPE_WORDS), 'y=-3x+5', 'y=-3x+4'), '', 'a different line is red only');
  assert.equal(shown(equationStep(SLOPE_WORDS), 'y=-3x+5', 'y=3x+5'), '', 'a different slope is red only');
  // Another line written in another form is not "the right line in the wrong form".
  assert.equal(shown(equationStep(SLOPE_WORDS), 'y=-3x+5', '3x+y=4'), '', 'a different line in standard form is red only');
  assert.equal(shown(equationStep(SLOPE_WORDS), 'y=-3x+5', 'y-4=-3(x-0)'), '', 'a different line in point-slope form is red only');
  assert.equal(shown(axis, 'x=2', 'x=5'), '');
  assert.equal(shown(axis, 'x=2', 'x>2'), '', 'an inequality is not a missing = sign');
  // A blank step is "Not answered.", not a miss of form.
  assert.deepEqual(failedStageReasons([{ id: 'e', graded: true, isCorrect: false, detail: 'Not answered.' }], [axis], { e: 'x=2' }, { e: '' }), {});
});

test('the sentence holds no number, and it is the same for every key written in that form', () => {
  // [the key, the same line in another form]
  const pairs = [['y=-3x+5', '3x+y=5'], ['y=7x-2', '7x-y=2'], ['y=0.5x+12', '0.5x-y=-12'], ['y=2x+1', 'y-1=2x'], ['y=\\frac{2}{3}x-4', '2x-3y=12']];
  const said = pairs.map(([key, written]) => shown(equationStep('Write the equation of the line.'), key, written));
  assert.deepEqual([...new Set(said)], [SLOPE_SAYS], 'one sentence for the form, whatever the key\'s numbers');
  said.forEach((sentence) => assert.doesNotMatch(sentence, /\d/, sentence));
  assert.doesNotMatch(EQUATION_SAYS, /\d/);
});

test('when the words and the key, or two keys, disagree about the form, no form is named', () => {
  // Slope-intercept asked, the key written in standard form: which is wanted is
  // unknown, whichever other form the student used.
  assert.equal(shown(equationStep(SLOPE_WORDS), '3x+y=5', 'y-5=-3(x-0)'), '');
  assert.equal(shown(equationStep('Write the equation in point-slope form.'), '3x+y=5', 'y=-3x+5'), '');
  // Two accepted keys in two forms.
  assert.equal(shown(equationStep('Write the equation of the line.'), { anyOf: ['y=2x+1', '2x-y=-1'] }, 'y-1=2(x-0)'), '');
  // A vertical line has no slope: never told to use a form that needs one.
  assert.equal(shown(equationStep(SLOPE_WORDS), 'x=2', 'x-2=0'), '');
  assert.equal(shown(equationStep('Write the equation in point-slope form.'), 'x=2', 'x-2=0'), '');
  assert.equal(shown(equationStep('Write the equation in standard form.'), 'x=2', 'x-2=0'), STANDARD_SAYS);
});

test('a bare number is told to write an equation, except on a function rule, which takes a bare right side', () => {
  const axis = equationStep('Write the equation of the axis of symmetry.', { placeholder: 'x = ' });
  assert.equal(shown(axis, 'x=2', '2'), EQUATION_SAYS);
  assert.equal(shown(axis, 'x=2', '5'), EQUATION_SAYS, 'whatever number: it says nothing about the value');
  assert.equal(shown(equationStep('Write the function.'), 'V(t)=40+5t', '5t+41'), EQUATION_SAYS);
  const rule = equationStep('Write a function that models this situation.', { acceptEquivalentFunctionRule: true });
  assert.equal(shown(rule, 'V(t)=40+5t', '5t+41'), '');
  assert.equal(shown(rule, 'y=2x+1', '7'), '');
  // A key that is not an equation (an expression, an inequality) is never "an equation to write".
  assert.equal(shown(equationStep('Simplify.'), '2x+3', '2x+4'), '');
  assert.equal(shown(equationStep('Write the inequality.'), 'x>2', '5'), '');
});

test('the browser Check and the device marking both carry an equation step\'s reason; the mark is unchanged', () => {
  const question = {
    type: 'relationshipModel',
    prompt: 'A line crosses the y-axis at 5 and falls 3 for each 1 across.',
    workflow: [{ id: 'line', kind: 'equationInput', prompt: SLOPE_WORDS }],
    grading: { line: 'y=-3x+5' },
  };
  const wrongForm = { line: '3x+y=5' };
  const check = gradeComposedWorkflowCheck(question, composedWorkflowWork(wrongForm));
  assert.deepEqual(check.stageReasons, { line: SLOPE_SAYS });
  assert.deepEqual([check.parts[0].id, check.parts[0].isCorrect], ['line', false], 'the form is still required: a reason is words, not a verdict');
  assert.deepEqual(runner(question, wrongForm).stageReasons, { line: SLOPE_SAYS });
  // Right work and a wrong line say nothing.
  assert.deepEqual(gradeComposedWorkflowCheck(question, composedWorkflowWork({ line: 'y=-3x+5' })).stageReasons, {});
  assert.deepEqual(gradeComposedWorkflowCheck(question, composedWorkflowWork({ line: 'y=-3x+4' })).stageReasons, {});
  // A question the device marks (a stage named `solution` is a key the contract would strip).
  const device = { ...question, workflow: [{ id: 'solution', kind: 'equationInput', prompt: SLOPE_WORDS }], grading: { solution: 'y=-3x+5' } };
  const deviceWork = { solution: '3x+y=5' };
  assert.equal(gradeComposedWorkflowCheck(device, composedWorkflowWork(deviceWork)).supported, false, 'declared client-graded');
  assert.deepEqual(runner(device, deviceWork).stageReasons, { solution: SLOPE_SAYS });
});

/* ------------- a set step says to write a set, never anything about its values (F-SET-NOTATION-UNSAID) */

const SET_SAYS = 'Write this step as a set, with the values inside braces { }.';
const setStep = (kind = 'valueSet', extra = {}) => ({ id: 's', kind, notation: 'set', ...extra });

test('a plain list in a step keyed as a braced set is told to write a set, whatever its values', () => {
  [
    // [the key, what the student wrote]
    ['{-1, 5}', '-1, 5'],
    ['{-1, 5}', '5, -1'],
    ['{-1, 5}', '2, 3'],
    ['{-1, 5}', '-1, 5, 7'],
    ['{-1, 5}', '-1,5'],
    ['{-1, 5}', '(-1, 5)'],
    ['{3}', '3, 4'],
    ['{−2, 0, 2, 4}', '−2, 0, 2, 4'],
    // Written out without the ellipsis, a long list is still only a list.
    ['{0, 1, 2, ..., 48}', '0, 1, 2, 3'],
  ].forEach(([key, written]) => assert.equal(shown(setStep(), key, written), SET_SAYS, `${key} | ${written}`));
  assert.equal(shown(setStep('domainInput'), '{−2, 0, 2, 4}', '-2, 0, 2, 4'), SET_SAYS);
  assert.equal(shown(setStep('rangeInput'), '{0, 1, 2, 3}', '0, 1, 2, 3'), SET_SAYS);
  assert.doesNotMatch(SET_SAYS, /\d/, 'it holds no value');
});

test('a set step says nothing for a braced miss, one value, a list with an ellipsis, a choice or a key that is not a set', () => {
  assert.equal(shown(setStep(), '{-1, 5}', '{2, 3}'), '', 'a braced miss is about its values: red only');
  assert.equal(shown(setStep(), '{-1, 5}', '\\left\\lbrace2,3\\right\\rbrace'), '', 'the editor\'s braces are braces');
  assert.equal(shown(setStep(), '{-1, 5}', '\\{2,3\\}'), '');
  assert.equal(shown(setStep(), '{3}', '4'), '', 'one value is taken without braces when it is right, so its miss is its value');
  assert.equal(shown(setStep(), '{0, 1, 2, ..., 48}', '0, 1, 2, ..., 47'), '', 'a list with an ellipsis is taken without braces');
  assert.equal(shown(setStep(), '{0, 1, 2, ..., 48}', '0,1,2,\\ldots,47'), '');
  assert.equal(shown(setStep('domainInput', { notation: 'interval' }), '(-\\infty, 3]', '-1, 5'), '', 'an interval key is not a set');
  assert.equal(shown(setStep('domainInput', { notation: 'inequality' }), '0 \\le x \\le 10', '0, 10'), '');
  assert.equal(shown(setStep('domainInput', { choices: ['{0, 1, 2}', '0, 1, 2, 3'] }), '{0, 1, 2}', '0, 1, 2, 3'), '', 'a choice is picked, not written');
  assert.equal(shown(setStep(), { anyOf: ['{-1, 5}', 'none'] }, '-1, 5'), '', 'only when every key is a set');
  // A blank step is "Not answered.", not a miss of form.
  assert.deepEqual(failedStageReasons([{ id: 's', graded: true, isCorrect: false, detail: 'Not answered.' }], [setStep()], { s: '{-1, 5}' }, { s: '' }), {});
});

const DAY2 = compileAuthoringIntentV5(JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json', import.meta.url), 'utf8'))).package;

test('the walkthrough\'s set steps: a plain list misses and says to write a set, right values or not, on the device and in the browser\'s Check', () => {
  const probed = [];
  [['Day 2', DAY2], ['DOL1', DOL1]].forEach(([lesson, pkg]) => pkg.sections.forEach((section) => section.questions.forEach((question, index) => {
    const { composed, workflow, grading } = readComposedQuestion(question);
    if (!composed) return;
    workflow.filter((stage) => stage.notation === 'set' && !(Array.isArray(stage.choices) && stage.choices.length)).forEach((stage) => {
      const key = grading[stage.id];
      if (typeof key !== 'string' || !/^\{.*\}$/.test(key)) return;
      const values = key.slice(1, -1).split(',').map((value) => value.trim());
      const branch = stage.showWhen?.stage ? { [stage.showWhen.stage]: stage.showWhen.is } : {};
      // [what the student wrote, right?, what the screen says]
      const cases = [[key, true, undefined], ['{100, 200}', false, undefined]];
      if (values.some((value) => /\.\.\.|…/.test(value))) {
        cases.push([values.join(', '), true, undefined], ['0, 1, ..., 7', false, undefined], ['100, 200', false, SET_SAYS]);
      } else if (values.length === 1) {
        cases.push([values[0], true, undefined], ['100', false, undefined], ['100, 200', false, SET_SAYS]);
      } else {
        cases.push([values.join(', '), false, SET_SAYS], [[...values].reverse().join(', '), false, SET_SAYS], ['100, 200', false, SET_SAYS]);
      }
      cases.forEach(([written, right, says]) => {
        const responses = { ...branch, [stage.id]: written };
        const label = `${lesson} ${section.role} ${index + 1} ${stage.id} ${key} | ${written}`;
        const check = gradeComposedWorkflowCheck(question, composedWorkflowWork(responses));
        assert.equal(check.parts.find((part) => part.id === stage.id)?.isCorrect, right, `${label}: the mark is unchanged`);
        assert.equal(check.stageReasons[stage.id], says, `${label}: the browser's Check`);
        assert.equal(runner(question, responses).stageReasons[stage.id], says, `${label}: the device`);
      });
      probed.push(`${lesson} ${section.role} ${index + 1} ${stage.id}`);
    });
  })));
  // Day 2 CW 5 (domain and range) and PR 4; the District's zeros (CW 3, 7, 8;
  // PR 2, 4, 5; DOL 2, 4) and its discrete domains and range (CW 2, CW 13).
  assert.ok(probed.includes('Day 2 classwork 5 domainDiscrete') && probed.includes('Day 2 classwork 5 rangeDiscrete') && probed.includes('Day 2 practice 4 rangeDiscrete'), probed.join('\n'));
  assert.equal(probed.filter((entry) => entry.startsWith('DOL1') && entry.endsWith(' zeros')).length, 8, probed.join('\n'));
  assert.ok(probed.includes('DOL1 classwork 2 domainDiscrete') && probed.includes('DOL1 classwork 13 rangeDiscrete'), probed.join('\n'));
});
