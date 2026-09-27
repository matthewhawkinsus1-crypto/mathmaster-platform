import test from 'node:test';
import assert from 'node:assert/strict';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import {
  checkTableConsistency, evaluateModelAt, gradeStage, gradeWorkflow, toEvaluableExpression,
} from '../../src/platform/workflow/workflowGrading.js';

// The question from the architecture note: model the situation, build a table
// from your own model, interpret it, classify it.
const CHOCOLATE = {
  content: { scenario: 'A student group sells chocolate bars for $2 each.' },
  workflow: [
    { kind: 'equationInput', prompt: 'Write a function for the money raised.' },
    { kind: 'tableInput', xValues: [0, 1, 2, 3], source: { fromStage: 'equation' } },
    { kind: 'interpretation', prompt: 'What does your table show?' },
    { kind: 'classification', choices: ['discrete', 'continuous'] },
  ],
  grading: {
    equation: 'f(x)=2x',
    table: { consistentWith: 'equation' },
    interpretation: { manual: true },
    classification: 'discrete',
  },
};

const gradeChocolate = (responses) => {
  const { workflow, grading } = readComposedQuestion(CHOCOLATE);
  return gradeWorkflow({ stages: workflow, responses, grading });
};

// --- Reading the student's own model ---------------------------------------

test('a function definition is reduced to the part that can be evaluated', () => {
  assert.equal(toEvaluableExpression('f(x)=x+2'), 'x+2');
  assert.equal(toEvaluableExpression('f\\left(x\\right)=2x'), '2x');
  assert.equal(toEvaluableExpression('\\frac{x}{2}'), '((x)/(2))');
  assert.equal(toEvaluableExpression(''), null);
  assert.equal(toEvaluableExpression('y = 2x = 4'), null, 'two equals signs is not a function');
});

test('the student model is evaluated, not the answer key', () => {
  assert.equal(evaluateModelAt('f(x)=x+2', 3), 5);
  assert.equal(evaluateModelAt('f(x)=2x', 3), 6);
  assert.equal(evaluateModelAt('f(x)=???', 3), null, 'nonsense evaluates to nothing, not to zero');
});

// --- The point of the whole layer -------------------------------------------

test('a table that follows the student\'s WRONG function is consistent', () => {
  const check = checkTableConsistency({
    response: { '0:y': '2', '1:y': '3', '2:y': '4', '3:y': '5' },
    xValues: [0, 1, 2, 3],
    model: 'f(x)=x+2',
  });
  assert.equal(check.checked, 4);
  assert.equal(check.consistent, true);
  assert.equal(check.mismatches.length, 0);
});

test('a table filled from the ANSWER KEY is inconsistent with the student\'s own function', () => {
  // The student wrote f(x) = x + 2 and then wrote the correct doubling table.
  // That is not the same work, and the check must not silently accept it.
  const check = checkTableConsistency({
    response: { '0:y': '0', '1:y': '2', '2:y': '4', '3:y': '6' },
    xValues: [0, 1, 2, 3],
    model: 'f(x)=x+2',
  });
  assert.equal(check.consistent, false);
  assert.equal(check.mismatches.length, 3);
});

test('one mistake is counted once: wrong model, right table', () => {
  const result = gradeChocolate({
    equation: 'f(x)=x+2',
    table: { '0:y': '2', '1:y': '3', '2:y': '4', '3:y': '5' },
    interpretation: 'It goes up by one each time.',
    classification: 'discrete',
  });
  const byId = Object.fromEntries(result.parts.map((part) => [part.id, part]));
  assert.equal(byId.equation.isCorrect, false, 'the model does not fit the situation');
  assert.equal(byId.table.isCorrect, true, 'but the table does follow the model they wrote');
  assert.equal(byId.classification.isCorrect, true);
  assert.equal(result.isCorrect, false);
  // Two of the three markable stages, not one of four.
  assert.equal(result.partialCreditPercent, 67);
});

test('the whole question can still be right', () => {
  const result = gradeChocolate({
    equation: 'f(x)=2x',
    table: { '0:y': '0', '1:y': '2', '2:y': '4', '3:y': '6' },
    interpretation: 'Each bar adds two dollars.',
    classification: 'discrete',
  });
  assert.equal(result.isCorrect, true);
  assert.equal(result.partialCreditPercent, 100);
});

test('an equivalent model is accepted', () => {
  const result = gradeChocolate({
    equation: 'f(x)=x+x',
    table: { '0:y': '0', '1:y': '2', '2:y': '4', '3:y': '6' },
    interpretation: 'Two dollars a bar.',
    classification: 'discrete',
  });
  assert.equal(result.parts[0].isCorrect, true, 'x + x is 2x');
});

// --- Never mark what was not checked ----------------------------------------

test('written interpretation is ungraded, not incorrect', () => {
  const result = gradeChocolate({
    equation: 'f(x)=2x',
    table: { '0:y': '0', '1:y': '2', '2:y': '4', '3:y': '6' },
    interpretation: 'Anything at all.',
    classification: 'discrete',
  });
  const prose = result.parts.find((part) => part.id === 'interpretation');
  assert.equal(prose.graded, false);
  assert.equal(result.gradedCount, 3);
  assert.equal(result.isCorrect, true, 'an unmarked stage must not block a correct verdict');
});

test('a question with no grading section reports no verdict rather than a wrong one', () => {
  const { workflow } = readComposedQuestion(CHOCOLATE);
  const result = gradeWorkflow({ stages: workflow, responses: { equation: 'f(x)=2x' }, grading: null });
  assert.equal(result.gradedCount, 0);
  assert.equal(result.isCorrect, false);
  assert.equal(result.partialCreditPercent, null);
  assert.ok(result.parts.every((part) => part.graded === false));
});

test('a table that cannot be checked against an unusable model is ungraded', () => {
  const { workflow, grading } = readComposedQuestion(CHOCOLATE);
  const result = gradeWorkflow({
    stages: workflow,
    responses: { equation: 'f(x)=', table: { '0:y': '2' }, interpretation: 'x', classification: 'discrete' },
    grading,
  });
  const table = result.parts.find((part) => part.id === 'table');
  assert.equal(table.graded, false);
  assert.equal(table.isCorrect, false);
  assert.match(table.detail, /Could not be checked/);
});

test('an unanswered stage leaves the question incomplete', () => {
  const result = gradeChocolate({ equation: 'f(x)=2x' });
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false, 'incomplete work is never marked correct');
});

// --- The other rule shapes --------------------------------------------------

test('a table with its own key is graded cell by cell', () => {
  const stage = { id: 'table', kind: 'tableInput', xValues: [0, 1] };
  const rule = { values: { '0:y': '0', '1:y': '2' } };
  assert.equal(gradeStage({ stage, rule, responses: { table: { '0:y': '0', '1:y': '2' } } }).isCorrect, true);
  const wrong = gradeStage({ stage, rule, responses: { table: { '0:y': '0', '1:y': '3' } } });
  assert.equal(wrong.isCorrect, false);
  assert.match(wrong.detail, /1 of 2/);
});

test('quantity roles are graded per role', () => {
  const stage = { id: 'roles', kind: 'quantityRoles' };
  const rule = { independent: 'time', dependent: 'volume' };
  assert.equal(
    gradeStage({ stage, rule, responses: { roles: { independent: 'time', dependent: 'volume' } } }).isCorrect,
    true,
  );
  const swapped = gradeStage({ stage, rule, responses: { roles: { independent: 'volume', dependent: 'time' } } });
  assert.equal(swapped.isCorrect, false);
  assert.match(swapped.detail, /independent and dependent/);
});

test('axis setup grades labels, units, and scale on one graph stage', () => {
  const stage = { id: 'axes', kind: 'axisSetup' };
  const rule = {
    xLabel: ['Time'],
    yLabel: ['Amount of water added'],
    xUnit: ['minutes'],
    yUnit: ['gallons'],
    xStep: ['1'],
    yStep: ['12'],
    requireUnits: true,
    requireScale: true,
  };
  const response = {
    __mathmasterWorkflowArtifact: 'axes',
    isComplete: true,
    xLabel: 'Time',
    yLabel: 'Amount of water added',
    xUnit: 'minutes',
    yUnit: 'gallons',
    xStep: '1',
    yStep: '12',
  };
  assert.equal(gradeStage({ stage, rule, responses: { axes: response } }).isCorrect, true);
  assert.equal(
    gradeStage({ stage, rule, responses: { axes: { ...response, yStep: '10' } } }).isCorrect,
    false,
  );

  const openScaleRule = { ...rule, xStep: [], yStep: [] };
  assert.equal(
    gradeStage({ stage, rule: openScaleRule, responses: { axes: { ...response, xStep: '2', yStep: '15' } } }).isCorrect,
    true,
    'when no exact scale is prescribed, any positive reasonable count-by values are accepted',
  );
});

test('several accepted answers are allowed', () => {
  const stage = { id: 'domain', kind: 'domainInput' };
  assert.equal(
    gradeStage({ stage, rule: { anyOf: ['[0,10]', '0 \\le x \\le 10'] }, responses: { domain: '[0,10]' } }).isCorrect,
    true,
  );
});

test('a graph derived from student work is graded by its student-derived stage verdict', () => {
  const stage = { id: 'graph', kind: 'functionGraph', sourceStageId: 'table' };
  const rule = { consistentWith: 'table', useStageVerdict: true };
  const correct = gradeStage({
    stage,
    rule,
    responses: {
      table: { __mathmasterWorkflowArtifact: 'table', isComplete: true, cells: { '0:y': '0' }, sourceModel: 'f(x)=2x' },
      graph: { __mathmasterWorkflowArtifact: 'graph', isComplete: true, isCorrect: true },
    },
  });
  assert.equal(correct.graded, true);
  assert.equal(correct.isCorrect, true);

  const wrong = gradeStage({
    stage,
    rule,
    responses: {
      table: { __mathmasterWorkflowArtifact: 'table', isComplete: true, cells: { '0:y': '0' }, sourceModel: 'f(x)=2x' },
      graph: { __mathmasterWorkflowArtifact: 'graph', isComplete: true, isCorrect: false },
    },
  });
  assert.equal(wrong.isCorrect, false);
});

test('a table workflow artifact is checked using its cells, not its metadata', () => {
  const stage = { id: 'table', kind: 'tableInput', xValues: [0, 1], responseColumn: 'y' };
  const rule = { consistentWith: 'equation' };
  const mark = gradeStage({
    stage,
    rule,
    responses: {
      equation: 'f(x)=2x',
      table: {
        __mathmasterWorkflowArtifact: 'table',
        isComplete: true,
        cells: { '0:y': '0', '1:y': '2' },
        points: [[0, 0], [1, 2]],
        sourceModel: 'f(x)=2x',
      },
    },
  });
  assert.equal(mark.isCorrect, true);
});

test('a nonnumeric table entry is wrong, not silently uncheckable, when the model is evaluable', () => {
  const check = checkTableConsistency({
    response: { '0:y': '0', '1:y': 'banana' },
    xValues: [0, 1],
    model: 'f(x)=2x',
  });
  assert.equal(check.checked, 2);
  assert.equal(check.consistent, false);
  assert.equal(check.mismatches.length, 1);
});

test('a fraction typed in the table can stay consistent with the student function', () => {
  const check = checkTableConsistency({
    response: { '0:y': '1/3', '1:y': '2/3' },
    xValues: [1, 2],
    model: 'f(x)=x/3',
  });
  assert.equal(check.checked, 2);
  assert.equal(check.consistent, true);
});

test('workflow domain/range stages grade roster-form sets semantically', () => {
  const stage = { id: 'range', kind: 'rangeInput', notation: 'set' };
  const rule = '{0, 1, 2, 3}';
  assert.equal(
    gradeStage({ stage, rule, responses: { range: '\\left\\{3,2,1,0\\right\\}' } }).isCorrect,
    true,
    'MathLive braces and reordered members should represent the same finite set',
  );
  assert.equal(
    gradeStage({ stage, rule, responses: { range: '{0, 1, 2, 4}' } }).isCorrect,
    false,
    'a different member must still fail',
  );
});


test('axis setup awards fractional stage credit instead of all-or-nothing', () => {
  const stage = { id: 'axes', kind: 'axisSetup' };
  const rule = {
    xLabel: ['Time'],
    yLabel: ['Amount'],
    xUnit: ['minutes'],
    yUnit: ['gallons'],
    xStep: ['1'],
    yStep: ['12'],
    requireUnits: true,
    requireScale: true,
  };
  const response = {
    __mathmasterWorkflowArtifact: 'axes',
    isComplete: true,
    xLabel: 'Time',
    yLabel: 'Amount',
    xUnit: 'minutes',
    yUnit: 'gallons',
    xStep: '1',
    yStep: '10',
  };
  const mark = gradeStage({ stage, rule, responses: { axes: response } });
  assert.equal(mark.isCorrect, false);
  assert.equal(mark.credit, 5 / 6);
});

test('table consistency awards credit for the rows that follow the student model', () => {
  const stage = { id: 'table', kind: 'tableInput', xValues: [0, 1, 2, 3], responseColumn: 'y' };
  const rule = { consistentWith: 'equation' };
  const mark = gradeStage({
    stage,
    rule,
    responses: {
      equation: 'f(x)=2x',
      table: {
        __mathmasterWorkflowArtifact: 'table',
        isComplete: true,
        cells: { '0:y': '0', '1:y': '2', '2:y': '5', '3:y': '6' },
        sourceModel: 'f(x)=2x',
      },
    },
  });
  assert.equal(mark.isCorrect, false);
  assert.equal(mark.credit, 0.75);
});

test('workflow scoreWeight changes partial-credit contribution without changing correctness', () => {
  const stages = [
    { id: 'equation', kind: 'equationInput', scoreWeight: 3 },
    { id: 'classification', kind: 'classification', scoreWeight: 1 },
  ];
  const result = gradeWorkflow({
    stages,
    grading: { equation: 'f(x)=2x', classification: 'continuous' },
    responses: { equation: 'f(x)=2x', classification: 'discrete' },
  });
  assert.equal(result.isCorrect, false);
  assert.equal(result.partialCreditPercent, 75);
});

// --- The names the student was shown ----------------------------------------
//
// Live QA, Algebra I District DOL #2, Classwork Q1. The key is written in the
// context's letters (V(t)=40+5t, 0 ≤ t ≤ 12, 40 ≤ V ≤ 100), but the screen
// offered "f(x) = …", built the table under x | f(x) and drew the graph on x
// and y axes. A student who followed the screen built a correct table and
// graph from `5x+40` and then lost the equation, the domain and the range.

const TANK = {
  type: 'relationshipModel',
  recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'table', 'continuity', 'graph', 'domain', 'range'] },
  prompt: 'A tank contains 40 gallons of water and is filled at 5 gallons per minute for 12 minutes.',
  quantities: [{ id: 'time', label: 'Time', unit: 'minutes' }, { id: 'volume', label: 'Water volume', unit: 'gallons' }],
  correctIndependentId: 'time',
  correctDependentId: 'volume',
  correctEquation: 'V(t)=40+5t',
  tableXValues: [0, 4, 8, 12],
  continuity: 'continuous',
  notation: 'inequality',
  correctDomain: '0 ≤ t ≤ 12',
  correctRange: '40 ≤ V ≤ 100',
};

const gradeTank = (responses) => {
  const { workflow, grading } = readComposedQuestion(TANK);
  const parts = gradeWorkflow({ stages: workflow, responses, grading }).parts;
  return Object.fromEntries(parts.map((part) => [part.id, part.isCorrect]));
};

// Domain and range branch on the continuity call; this situation is continuous.
const tankStageId = (kind) => readComposedQuestion(TANK).workflow
  .find((stage) => stage.kind === kind && (!stage.showWhen || stage.showWhen.is === 'continuous')).id;

test('a bare right side is graded as the model the table and graph were built from', () => {
  const equation = tankStageId('equationInput');
  for (const written of ['5x+40', '5t+40', '40+5n', 'f(x)=5x+40', 'V=40+5t']) {
    assert.equal(gradeTank({ [equation]: written })[equation], true, written);
  }
  assert.equal(gradeTank({ [equation]: '5x+41' })[equation], false);
  assert.equal(gradeTank({ [equation]: '5x+40y' })[equation], false, 'two inputs is not this model');
  assert.equal(evaluateModelAt('5t+40', 4), 60, 'a bare rule in t evaluates in t');
});

test('a bare number is not a solved equation', () => {
  const stage = { id: 'solve', kind: 'equationInput' };
  assert.equal(gradeStage({ stage, rule: 'x=3', responses: { solve: '3' } }).isCorrect, false);
});

test('generic equation stages do not accept a bare side or renamed dependent variable', () => {
  const stage = { id: 'equation', kind: 'equationInput' };
  assert.equal(gradeStage({ stage, rule: 'y=2x+1', responses: { equation: '2x+1' } }).isCorrect, false);
  assert.equal(gradeStage({ stage, rule: 'y=2x+1', responses: { equation: 'f(x)=2x+1' } }).isCorrect, false);
  assert.equal(gradeStage({ stage, rule: 'x=3', responses: { equation: 'y=3' } }).isCorrect, false);
});

test('function-modelling equation stages accept equivalent function-rule notation only when opted in', () => {
  const stage = { id: 'equation', kind: 'equationInput', acceptEquivalentFunctionRule: true };
  for (const response of ['5x+40', 'f(x)=5x+40', 'g(n)=5n+40']) {
    assert.equal(gradeStage({ stage, rule: 'V(t)=5t+40', responses: { equation: response } }).isCorrect, true, response);
  }
  assert.equal(gradeStage({ stage, rule: 'V(t)=5t+40', responses: { equation: '5x+41' } }).isCorrect, false);
  assert.equal(gradeStage({ stage, rule: 'V(t)=5t+40', responses: { equation: '5x+40y' } }).isCorrect, false);
});

test('a domain or range in the letters the screen used is the same answer', () => {
  const [equation, domain, range] = ['equationInput', 'domainInput', 'rangeInput'].map(tankStageId);
  const graded = (model, domainText, rangeText) => gradeTank({
    [equation]: model, continuity: 'continuous', [domain]: domainText, [range]: rangeText,
  });

  // x and y are the graph's axes; the student's own function names count too.
  assert.deepEqual(
    [graded('5x+40', '0\\le x\\le12', '40\\le y\\le100')[domain], graded('5x+40', '0\\le x\\le12', '40\\le y\\le100')[range]],
    [true, true],
  );
  assert.equal(graded('5x+40', '0\\le x\\le12', '40\\le f(x)\\le100')[range], true);
  assert.equal(graded('g(n)=5n+40', '0\\le n\\le12', '40\\le g\\le100')[domain], true);
  assert.equal(graded('5x+40', '0\\le t\\le12', '40\\le V\\le100')[domain], true, 'the key letters still work');

  // The wrong side's name, a letter nobody showed, or the wrong numbers.
  assert.equal(graded('5x+40', '0\\le y\\le12', '')[domain], false);
  assert.equal(graded('5x+40', '', '40\\le x\\le100')[range], false);
  assert.equal(graded('V(t)=5t+40', '', '40\\le t\\le100')[range], false);
  assert.equal(graded('5x+40', '0\\le n\\le12', '')[domain], false);
  assert.equal(graded('5x+40', '0\\le x\\le13', '')[domain], false);
  assert.equal(graded('5x+40', '0<x\\le12', '')[domain], false, 'the endpoint is part of the answer');
});
