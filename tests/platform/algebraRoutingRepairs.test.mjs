import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  RUNTIME_REPAIR_KEYS,
  repairAssignmentForCurrentRuntime,
  repairQuestionForCurrentRuntime,
} from '../../src/platform/assignments/assignmentRuntimeRepair.js';
import { ALGEBRA_WORKSPACE_ROUTES, resolveAlgebraWorkspaceRoute } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { parseRelationSource, relationStateToLatex, relationStateToText } from '../../src/algebraRelationFoundation.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// ROUTES THAT OPENED THE WRONG MATHEMATICS (Job 1 routing + Job 4 mismatches).
//
// 1. `interactiveAlgebra` with equation TEXT compiled to the legacy numeric
//    stepAlgebra2 solver, which reads only {a, b, c}: the student saw NaN.
// 2. `solveInequality` for a linear inequality compiled to the Sign & Solution
//    Analyzer with no factors — and dropped the inequality. The analyzer drew
//    its demo factors (x + 2)(x − 3): a different problem from the prompt.
// Both are fixed at compile time for new content and at runtime (never
// persisted) for stored content.

const compileOne = (question) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Algebra routing', courseId: 'algebra1' },
  sections: [{ role: 'classwork', questions: [{ standard: 'A.5B', ...question }] }],
}).package.sections[0].questions[0];

test('interactiveAlgebra with equation text compiles to the mature Step Algebra engine', () => {
  const question = compileOne({ prompt: 'Solve 3x + 6 = 21.', studentActions: ['interactiveAlgebra'], equation: '3x + 6 = 21' });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.equation, '3x + 6 = 21');
  assert.equal(resolveAlgebraWorkspaceRoute(question).route, ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA);
});

test('an {a, b, c} equation model still compiles to the legacy numeric shell (issue #297 kept it)', () => {
  const question = compileOne({ prompt: 'Solve.', studentActions: ['interactiveAlgebra'], equationModel: { a: 3, b: 6, c: 21 } });
  assert.equal(question.type, 'stepAlgebra2');
});

test('a linear solveInequality compiles to the relation workspace and keeps the inequality', () => {
  const question = compileOne({ prompt: 'Solve -2x + 3 > 7.', studentActions: ['solveInequality'], inequality: '-2x + 3 > 7' });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(question.equation, '-2x + 3 > 7');
  assert.equal(resolveAlgebraWorkspaceRoute(question).route, ALGEBRA_WORKSPACE_ROUTES.RELATION);
});

test('an absolute-value solveInequality compiles to the relation workspace', () => {
  const question = compileOne({ prompt: 'Solve |2x - 1| <= 9.', studentActions: ['solveInequality'], inequality: '|2x - 1| <= 9' });
  assert.equal(question.type, 'stepAlgebra');
  assert.equal(resolveAlgebraWorkspaceRoute(question).route, ALGEBRA_WORKSPACE_ROUTES.RELATION);
});

test('a sign-chart inequality with factors still compiles to the Sign & Solution Analyzer', () => {
  const question = compileOne({ prompt: 'Solve (x+2)(x-3) >= 0.', studentActions: ['solveInequality'], signChart: { mode: 'polynomial', factors: [-2, 3], relation: '>=' } });
  assert.equal(question.type, 'signSolutionAnalyzer');
  const byFactors = compileOne({ prompt: 'Solve.', studentActions: ['solveInequality'], factors: [{ root: 1, multiplicity: 2 }], relation: '<' });
  assert.equal(byFactors.type, 'signSolutionAnalyzer');
});

test('a stored text-equation stepAlgebra2 opens on the mature engine at runtime, without being persisted', () => {
  const stored = { type: 'stepAlgebra2', equation: '3x + 6 = 21', prompt: 'Solve.' };
  const result = repairQuestionForCurrentRuntime(stored);
  assert.equal(result.changed, true);
  assert.ok(result.repairKeys.includes(RUNTIME_REPAIR_KEYS.STEP_ALGEBRA_2_TEXT_EQUATION));
  assert.equal(result.question.type, 'stepAlgebra');
  assert.equal(result.question.equation, stored.equation, 'authored math untouched');
  assert.equal(result.safeToPersist, false, 'runtime-only');
  assert.equal(repairQuestionForCurrentRuntime(result.question).changed, false, 'idempotent');
});

test('a stored {a, b, c} stepAlgebra2 is left on the legacy solver so in-progress work is kept', () => {
  assert.equal(repairQuestionForCurrentRuntime({ type: 'stepAlgebra2', equation: { a: 2, b: 3, c: 7 } }).changed, false);
});

test('a stored factor-less sign analyzer opens the prompt inequality on the relation workspace', () => {
  const stored = { type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Solve -2x + 3 > 7.', questionId: 'q7' };
  const result = repairQuestionForCurrentRuntime(stored);
  assert.equal(result.changed, true);
  assert.ok(result.repairKeys.includes(RUNTIME_REPAIR_KEYS.SIGN_ANALYZER_WITHOUT_FACTORS));
  assert.equal(result.question.type, 'stepAlgebra');
  assert.equal(result.question.equation, '-2x + 3 > 7');
  assert.equal(result.question.questionId, 'q7');
  assert.equal(result.safeToPersist, false, 'read from the prompt, so never written back automatically');
  assert.equal(resolveAlgebraWorkspaceRoute(result.question).route, ALGEBRA_WORKSPACE_ROUTES.RELATION);
});

test('a sign analyzer with authored factors, or with no readable inequality, is left alone', () => {
  assert.equal(repairQuestionForCurrentRuntime({ type: 'signSolutionAnalyzer', factors: [-2, 3], relation: '>=' }).changed, false);
  assert.equal(repairQuestionForCurrentRuntime({ type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Make a sign chart.' }).changed, false);
});

test('an assignment with a runtime-only repair is not offered for automatic write-back', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [{ role: 'classwork', questions: [{ type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Solve 4 - x <= 9.' }] }],
  };
  const result = repairAssignmentForCurrentRuntime(assignment);
  assert.equal(result.changed, true);
  assert.equal(result.safeToPersist, false);
  assert.ok(result.repairManifest.every((entry) => entry.runtimeVersion === ASSIGNMENT_RUNTIME_REPAIR_VERSION));
});

test('the relation work history renders classroom math, not solver syntax', () => {
  const state = parseRelationSource('|2x - 3| <= 7', 'x');
  assert.match(relationStateToText(state), /abs\(/, 'the grading payload keeps raw mathematics');
  const latex = relationStateToLatex(state);
  assert.doesNotMatch(latex, /abs\(|<=|\*/, 'history must not show abs(…), <= or *');
  assert.match(latex, /\\left\|/);
  assert.match(latex, /\\le/);

  const core = fs.readFileSync('src/MultiRelationAlgebraCore.jsx', 'utf8');
  const emit = region(core, 'onRelationDisplayChange?.(', ')', 'the display emission');
  assert.match(emit, /relationStateToLatex\(relationState/);

  const wrapper = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(wrapper, /onRelationDisplayChange=\{handleRelationDisplayChange\}/);
  const list = region(wrapper, 'workHistory.map((relation, index) => (', '))}', 'the history list');
  assert.match(list, /<MathDisplay value=\{relation\} format="latex"/);
  const stateHandler = region(wrapper, 'const handleStateChange = useCallback(', '}, [onStateChange]);', 'the state handler');
  assert.doesNotMatch(executableSource(stateHandler), /setWorkHistory/, 'history is not fed the raw relation text any more');
});
