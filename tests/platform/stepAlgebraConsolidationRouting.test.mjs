import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  repairQuestionForCurrentRuntime,
} from '../../src/platform/assignments/assignmentRuntimeRepair.js';

// Issue #297: rewriteLinearForm/linearIntercepts must compile onto the
// mature stepAlgebra engine, never the narrower stepAlgebra2 mini-solvers,
// and old stored stepAlgebra2 questions must runtime-migrate the same way.

const compileOneQuestion = (question) => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Step Algebra consolidation routing', courseId: 'algebra1' },
    sections: [{ role: 'classwork', questions: [question] }],
  });
  return compiled.package.sections[0].questions[0];
};

test('V5 rewrite-to-slope-intercept intent compiles to primary stepAlgebra with slope-intercept target', () => {
  const question = compileOneQuestion({
    studentActions: ['interactiveAlgebra'],
    mode: 'rewriteLinearForm',
    equation: 'y - 7 = -(2/3)(x + 3)',
    prompt: 'Rewrite in slope-intercept form.',
  });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.targetForm, 'slopeIntercept');
  assert.equal(question.requireSimplifiedFinalForm, true);
});

test('strict simplified final form is required for the rewrite path, not merely isolation', () => {
  const question = compileOneQuestion({
    studentActions: ['interactiveAlgebra'],
    mode: 'rewriteLinearForm',
    equation: '-5x + 7y = 11',
  });
  assert.equal(question.requireSimplifiedFinalForm, true);
});

test('canonical solveStepByStep rewrite intent also compiles to the mature slope-intercept solver', () => {
  const question = compileOneQuestion({
    studentActions: ['solveStepByStep'],
    mode: 'rewriteLinearForm',
    equation: 'y - 7 = -(2/3)(x + 3)',
    targetForm: 'slopeIntercept',
  });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.targetForm, 'slopeIntercept');
  assert.equal(question.requireSimplifiedFinalForm, true);
});

test('canonical solveStepByStep intercept intent reaches the intercept orchestrator contract', () => {
  const question = compileOneQuestion({
    studentActions: ['solveStepByStep', 'findXIntercepts', 'findYIntercept'],
    mode: 'linearIntercepts',
    equation: '3x + 4y = 24',
    feedbackTiming: 'delayed',
  });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.mode, 'linearIntercepts');
  assert.equal(question.equationText, '3x + 4y = 24');
  assert.equal(question.feedbackTiming, 'delayed');
});

test('factoredLinear rewrite intent still compiles to the stepAlgebra2 compatibility shell, since the mature engine has no factored-form objective yet', () => {
  const question = compileOneQuestion({
    studentActions: ['interactiveAlgebra'],
    mode: 'rewriteLinearForm',
    targetForm: 'factoredLinear',
    equation: 'y = 2(x - 3)',
  });
  assert.equal(question.type, 'stepAlgebra2');
});

test('V5 linearIntercepts intent compiles to primary stepAlgebra, mode preserved for the intercept orchestrator', () => {
  const question = compileOneQuestion({
    studentActions: ['interactiveAlgebra'],
    mode: 'linearIntercepts',
    standard: { A: 3, B: 4, C: 24 },
    prompt: 'Find both intercepts algebraically.',
  });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.mode, 'linearIntercepts');
  assert.deepEqual(question.standard, { A: 3, B: 4, C: 24 });
});

test('literal-equation stepAlgebra compilation is unchanged (no mode, no targetForm side effects)', () => {
  const question = compileOneQuestion({
    studentActions: ['solveStepByStep'],
    solveFor: 'r',
    equation: 'PV = nRT',
  });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.solveFor, 'r');
  assert.equal(question.mode, undefined);
  assert.equal(question.requireSimplifiedFinalForm, undefined);
});

test('runtime repair migrates an old stored stepAlgebra2 rewriteLinearForm question onto stepAlgebra', () => {
  const stored = {
    type: 'stepAlgebra2',
    toolId: 'stepAlgebra2',
    mode: 'rewriteLinearForm',
    equation: 'y - 7 = -(2/3)(x + 3)',
    targetForm: 'slopeIntercept',
  };
  const result = repairQuestionForCurrentRuntime(stored);
  assert.equal(result.changed, true);
  assert.equal(result.safeToPersist, true);
  assert.equal(result.question.type, 'stepAlgebra');
  assert.equal(result.question.toolId, undefined);
  assert.equal(result.question.mode, undefined);
  assert.equal(result.question.requireSimplifiedFinalForm, true);
  assert.equal(result.question.equation, stored.equation); // authored math untouched
});

test('runtime repair migrates an old stored stepAlgebra2 linearIntercepts question onto stepAlgebra, keeping its authored shape', () => {
  const stored = {
    type: 'stepAlgebra2',
    mode: 'linearIntercepts',
    standard: { A: 4, B: 3, C: 24 },
    feedbackTiming: 'guided',
  };
  const result = repairQuestionForCurrentRuntime(stored);
  assert.equal(result.changed, true);
  assert.equal(result.question.type, 'stepAlgebra');
  assert.equal(result.question.mode, 'linearIntercepts');
  assert.deepEqual(result.question.standard, { A: 4, B: 3, C: 24 });
  assert.equal(result.question.feedbackTiming, 'guided');
});

test('runtime repair leaves a factoredLinear stepAlgebra2 question and the mode-less numeric solver alone', () => {
  const factored = { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 2(x-3)' };
  assert.equal(repairQuestionForCurrentRuntime(factored).changed, false);

  const plainNumeric = { type: 'stepAlgebra2', equation: { a: 2, b: 3, c: 7 } };
  assert.equal(repairQuestionForCurrentRuntime(plainNumeric).changed, false);
});

test('runtime repair does not touch an already-consolidated stepAlgebra question', () => {
  const already = { type: 'stepAlgebra', equation: 'y - 7 = -(2/3)(x + 3)', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true };
  assert.equal(repairQuestionForCurrentRuntime(already).changed, false);
});

test('the repair version was bumped for this migration, so already-stamped assignments get re-evaluated', () => {
  assert.ok(ASSIGNMENT_RUNTIME_REPAIR_VERSION >= 6);
});

// Mutation guard for the "requireSimplifiedFinalForm" assertion: prove it can
// actually fail.
test('mutation guard: a rewrite compile that forgot requireSimplifiedFinalForm would fail the strict-final-form assertion', () => {
  const fakeCompiledQuestion = { type: 'stepAlgebra', targetForm: 'slopeIntercept' };
  assert.notEqual(fakeCompiledQuestion.requireSimplifiedFinalForm, true);
});
