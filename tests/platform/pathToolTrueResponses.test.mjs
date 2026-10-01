// What two Path tools really send, graded the way the tool itself judges it.
//
// "Is this relation a function?" is answered with a reason, and the server
// knew only yes / no: every function was marked wrong and every non-function
// right, whatever the student chose (My Math Path and Live Challenge). An
// `algebra` question is shown with the balance workspace, which ends on an
// equation, and the server read only the retired answer box's value. Both
// came in with PR #47, and both graded correct work as wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { FUNCTION_CHOICES, correctFunctionChoice, functionAnswerIsCorrect } from '../../functions/shared/relationFunctionChoice.mjs';
import { buildRawPathResponse } from '../../src/platform/path/pathToolResponses.js';

const relation = (pairs) => ({
  type: 'relationMapping',
  prompt: 'Is this relation a function?',
  pairs: pairs.map(([x, y]) => ({ x, y })),
  ask: ['isFunction'],
});
const FUNCTION = relation([[-2, 3], [1, 2], [3, 2]]); // a repeated output, still a function
const NOT_A_FUNCTION = relation([[1, 2], [1, 5], [3, -1]]); // the input 1 has two outputs

const gradeFunctionAnswer = (question, isFunction) => gradePathResponse({
  privateGrading: buildPrivateToolGrading(question),
  raw: { isFunction },
});

test('a function is right only with the definition as its reason', () => {
  assert.equal(gradeFunctionAnswer(FUNCTION, 'yes-definition').isCorrect, true);
  assert.equal(gradeFunctionAnswer(FUNCTION, 'yes-output-rule').isCorrect, false, 'the one-to-one misconception');
  assert.equal(gradeFunctionAnswer(FUNCTION, 'no-input-repeat').isCorrect, false);
  assert.equal(gradeFunctionAnswer(FUNCTION, 'no-output-repeat').isCorrect, false, 'a repeated output does not stop a function');
});

test('a relation that is not a function is right only for the reason that it is not', () => {
  assert.equal(gradeFunctionAnswer(NOT_A_FUNCTION, 'no-input-repeat').isCorrect, true);
  assert.equal(gradeFunctionAnswer(NOT_A_FUNCTION, 'no-output-repeat').isCorrect, false);
  assert.equal(gradeFunctionAnswer(NOT_A_FUNCTION, 'yes-definition').isCorrect, false);
  assert.equal(gradeFunctionAnswer(NOT_A_FUNCTION, 'yes-output-rule').isCorrect, false);
});

test('the server agrees with the tool on every choice, for both kinds of relation', () => {
  for (const [question, isFunction] of [[FUNCTION, true], [NOT_A_FUNCTION, false]]) {
    for (const { value } of FUNCTION_CHOICES) {
      const toolSays = value === correctFunctionChoice(isFunction); // RelationMapping.jsx's own check
      assert.equal(gradeFunctionAnswer(question, value).isCorrect, toolSays, `${value} on ${isFunction ? 'a function' : 'a non-function'}`);
    }
  }
});

test('a bare verdict from before the reasons is still read; no answer is never right', () => {
  for (const yes of ['yes', 'Yes', ' true ', true]) {
    assert.equal(gradeFunctionAnswer(FUNCTION, yes).isCorrect, true, JSON.stringify(yes));
    assert.equal(gradeFunctionAnswer(NOT_A_FUNCTION, yes).isCorrect, false, JSON.stringify(yes));
  }
  for (const no of ['no', 'NO', 'false', false]) {
    assert.equal(gradeFunctionAnswer(NOT_A_FUNCTION, no).isCorrect, true, JSON.stringify(no));
    assert.equal(gradeFunctionAnswer(FUNCTION, no).isCorrect, false, JSON.stringify(no));
  }
  for (const nothing of ['', '   ', 'maybe', 'constructor']) {
    assert.equal(functionAnswerIsCorrect(nothing, true), false, JSON.stringify(nothing));
    assert.equal(functionAnswerIsCorrect(nothing, false), false, JSON.stringify(nothing));
  }
});

const ALGEBRA = {
  type: 'algebra',
  prompt: 'Solve for x.',
  equationLatex: '2x + 5 = 13',
  variable: 'x',
  answer: '4',
};
const gradeAlgebra = (raw, question = ALGEBRA) => gradePathResponse({ privateGrading: buildPrivateToolGrading(question), raw });
// The balance workspace's answer state, as StepByStepAlgebraCore reports it.
const workspaceFinishedOn = (latex) => ({
  isComplete: true,
  responseKey: `${latex}|{}`,
  parts: [{ id: 'algebra-objective', label: 'Isolate x', isComplete: true, isCorrect: true, response: latex }],
});

test('an algebra question sends the equation the workspace finished on', () => {
  assert.deepEqual(buildRawPathResponse({ pathToolId: 'algebra', answerState: workspaceFinishedOn(' x = 4') }), { finalEquation: ' x = 4' });
});

test('the finished equation is graded by the value it isolates', () => {
  assert.equal(gradeAlgebra({ finalEquation: ' x = 4' }).isCorrect, true);
  assert.equal(gradeAlgebra({ finalEquation: '4 = x' }).isCorrect, true);
  assert.equal(gradeAlgebra({ finalEquation: 'x=\\frac{8}{2}' }).isCorrect, true);
  assert.equal(gradeAlgebra({ finalEquation: ' x = 5' }).isCorrect, false);
  assert.equal(gradeAlgebra({ finalEquation: '2x = 8' }).isCorrect, false, 'not solved yet');
  assert.equal(gradeAlgebra({ finalEquation: 'y = 4' }).isCorrect, false, 'another variable');
  const forY = { ...ALGEBRA, prompt: 'Solve for y.', equationLatex: '3y = 12', variable: 'y' };
  assert.equal(gradeAlgebra({ finalEquation: 'y = 4' }, forY).isCorrect, true);
  const fraction = { ...ALGEBRA, equationLatex: '4x = 3', answer: '3/4' };
  assert.equal(gradeAlgebra({ finalEquation: 'x=\\frac{3}{4}' }, fraction).isCorrect, true);
  assert.equal(gradeAlgebra({ finalEquation: 'x=0.75' }, fraction).isCorrect, true);
  // Content that writes its answer as the finished equation.
  const writtenAsEquation = { ...ALGEBRA, answer: 'x = 4' };
  assert.equal(gradeAlgebra({ finalEquation: ' x = 4' }, writtenAsEquation).isCorrect, true);
  assert.equal(gradeAlgebra({ finalEquation: ' x = 5' }, writtenAsEquation).isCorrect, false);
});

test('the round trip: what the workspace reports is what the server accepts', () => {
  const raw = buildRawPathResponse({ pathToolId: 'algebra', answerState: workspaceFinishedOn(' x = 4') });
  assert.equal(gradeAlgebra(raw).isCorrect, true);
  const wrong = buildRawPathResponse({ pathToolId: 'algebra', answerState: workspaceFinishedOn(' x = 9') });
  assert.equal(gradeAlgebra(wrong).isCorrect, false);
});

test('a value from the retired answer box is still graded; an empty response is refused', () => {
  assert.equal(gradeAlgebra({ value: '4' }).isCorrect, true);
  assert.equal(gradeAlgebra({ value: '5' }).isCorrect, false);
  const empty = gradeAlgebra({ finalEquation: '  ' });
  assert.equal(empty.isCorrect, false);
});
