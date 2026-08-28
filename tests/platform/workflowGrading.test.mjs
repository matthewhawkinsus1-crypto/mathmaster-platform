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
