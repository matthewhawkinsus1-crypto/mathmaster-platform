import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { gradeStage } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';

// A compiled function workflow asks for the RULE its table and graph are built
// from. `g(n) = 2n`, `2x` and `y = 2x` are that rule for a key of `f(x) = 2x`;
// before this, the compiled equation stage marked all three wrong because it
// lacked acceptEquivalentFunctionRule (PR #375 review, pass-3 PR-3).

const compileOne = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Equivalent rules', courseId: 'algebra1' },
  sections: [{ role: 'practice', questions: [{
    standard: 'A.3C',
    studentActions: ['writeEquation', 'completeTable'],
    ...question,
  }] }],
}).package.sections[0].questions[0];

const equationStage = (question) => question.workflow.find((stage) => stage.id === 'equation');

// Marked by the shared server grader, through the exact bytes the browser's
// Check sends — the verdict the gradebook records.
const equationMark = (question, equation) => gradeComposedWorkflowCheck(question, composedWorkflowWork({ equation }))
  .parts.find((part) => part.id === 'equation').isCorrect;

test('a compiled function workflow accepts the same rule under another name or as a bare right side', () => {
  const question = compileOne({ prompt: 'Model the cost.', answerModel: { equation: 'f(x)=2x', tableXValues: [0, 1, 2] } });
  assert.equal(equationStage(question).acceptEquivalentFunctionRule, true);
  for (const equation of ['f(x)=2x', 'g(n)=2n', '2x', 'y=2x']) {
    assert.equal(equationMark(question, equation), true, equation);
  }
  // Still a check of the mathematics.
  for (const equation of ['3x', 'g(n)=2n+1', 'x=2y', '2y']) {
    assert.equal(equationMark(question, equation), false, equation);
  }
});

test('a prompt that asks for a particular form keeps the equation stage strict', () => {
  for (const prompt of [
    'Write the rule in slope-intercept form.',
    'Write the function in point-slope form.',
    'Write the equation in the form y = mx + b.',
    'Write the rule in simplest form.',
  ]) {
    const question = compileOne({ prompt, answerModel: { equation: 'f(x)=2x+2', tableXValues: [0, 1, 2] } });
    assert.equal(equationStage(question).acceptEquivalentFunctionRule, false, prompt);
    // The flag would compare rules algebraically and accept the unexpanded form.
    assert.equal(equationMark(question, 'f(x)=2(x+1)'), false, prompt);
    assert.equal(equationMark(question, 'f(x)=2x+2'), true, prompt);
  }
  // The form may also be asked in the stage's own prompt.
  const staged = compileOne({ prompt: 'Model the cost.', equationPrompt: 'Write it in standard form.', answerModel: { equation: 'f(x)=2x+2', tableXValues: [0, 1] } });
  assert.equal(equationStage(staged).acceptEquivalentFunctionRule, false);
});

test('an authored acceptEquivalentFunctionRule decides either way', () => {
  const strict = compileOne({ prompt: 'Model the cost.', acceptEquivalentFunctionRule: false, answerModel: { equation: 'f(x)=2x', tableXValues: [0, 1] } });
  assert.equal(equationStage(strict).acceptEquivalentFunctionRule, false);
  assert.equal(equationMark(strict, 'g(n)=2n'), false);

  const lenient = compileOne({ prompt: 'Write the rule in simplest form.', acceptEquivalentFunctionRule: true, answerModel: { equation: 'f(x)=2x', tableXValues: [0, 1] } });
  assert.equal(equationStage(lenient).acceptEquivalentFunctionRule, true);
  assert.equal(equationMark(lenient, 'g(n)=2n'), true);
});

test('with the flag, x and y keep their axis roles: x = 2y and x = 3 are different lines', () => {
  const stage = { id: 'equation', kind: 'equationInput', acceptEquivalentFunctionRule: true };
  const mark = (rule, equation) => gradeStage({ stage, rule, responses: { equation } }).isCorrect;
  assert.equal(mark('f(x)=2x', 'x=2y'), false);
  assert.equal(mark('f(x)=2x', '2y'), false);
  assert.equal(mark('y=3', 'x=3'), false);
  // The renaming the flag exists for still works.
  assert.equal(mark('y=3', 'f(x)=3'), true);
  assert.equal(mark('C(n)=5n+40', 'y=5x+40'), true);
  assert.equal(mark('f(x)=2x', '2t'), true);
});
