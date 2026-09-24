import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ALGEBRA_ENGINES,
  ALGEBRA_WORKSPACE_ROUTES,
  prepareQuestionForRuntimeRouting,
  resolveAlgebraWorkspaceRoute,
  usesRelationWorkspace,
} from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { needsMultiRelationWorkspace } from '../../src/algebraRelationFoundation.js';
import { withPromptRelationSource } from '../../src/stepAlgebraRelationRouting.js';
import { region } from './helpers/sourceContract.mjs';

// ONE AUTHORITATIVE ALGEBRA ROUTE (Job 1, phase 4).
//
// The same stored question used to open different engines depending on which
// host rendered it: the student player migrated stored `stepAlgebra2` questions
// onto the mature engine, Teacher Question Review and the other hosts did not.
// These tests pin the decision itself (by calling it) and the two call sites
// that must consult it.

const route = (question) => resolveAlgebraWorkspaceRoute(question).route;
const engine = (question) => resolveAlgebraWorkspaceRoute(question).engine;

test('every algebra family resolves to the engine that owns its interactions', () => {
  assert.equal(route({ type: 'stepAlgebra', equation: '3x + 6 = 21' }), ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA);
  assert.equal(route({ type: 'algebra', equation: '3x + 6 = 21' }), ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA);
  assert.equal(route({ type: 'stepAlgebra', equation: '|2x - 3| <= 7' }), ALGEBRA_WORKSPACE_ROUTES.RELATION);
  assert.equal(route({ type: 'stepAlgebra', equation: '-7 < 2x + 1 <= 9' }), ALGEBRA_WORKSPACE_ROUTES.RELATION);
  assert.equal(route({ type: 'stepAlgebra', equation: 'x^2 = 49' }), ALGEBRA_WORKSPACE_ROUTES.RELATION);
  assert.equal(route({ type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y = 12' }), ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS);
  assert.equal(route({ type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 15x - 45' }), ALGEBRA_WORKSPACE_ROUTES.REWRITE_LINEAR_FORM);
  assert.equal(route({ type: 'systemsWorkspace', mode: 'algebraic' }), ALGEBRA_WORKSPACE_ROUTES.SYSTEMS_WORKSPACE);
  assert.equal(route({ type: 'literal', equation: 'A = lw', solveFor: 'w', workspace: true }), ALGEBRA_WORKSPACE_ROUTES.LITERAL_WORKSPACE);
  assert.equal(route({ type: 'literal', equation: 'A = lw', solveFor: 'w' }), ALGEBRA_WORKSPACE_ROUTES.LITERAL_ANSWER);
  assert.equal(route({ type: 'graphing2', mode: 'slopeIntercept' }), ALGEBRA_WORKSPACE_ROUTES.OTHER_REGISTRY_TOOL);
  assert.equal(route({ type: 'multipleChoice' }), ALGEBRA_WORKSPACE_ROUTES.NOT_ALGEBRA);

  assert.equal(engine({ type: 'stepAlgebra', equation: '3x + 6 = 21' }), ALGEBRA_ENGINES.STEP_ALGEBRA_CORE);
  assert.equal(engine({ type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 2(x - 3)' }), ALGEBRA_ENGINES.STEP_ALGEBRA_CORE);
  assert.equal(engine({ type: 'stepAlgebra', equation: '|x| = 4' }), ALGEBRA_ENGINES.MULTI_RELATION);
});

test('an inequality authored only in the prompt reaches the relation workspace', () => {
  assert.equal(route({ type: 'stepAlgebra', prompt: 'Solve -2x + 3 > 7.' }), ALGEBRA_WORKSPACE_ROUTES.RELATION);
  // usesRelationWorkspace is exactly the predicate StepByStepAlgebra used to
  // compute inline, so the second check cannot drift from the first.
  for (const question of [
    { type: 'stepAlgebra', prompt: 'Solve -2x + 3 > 7.' },
    { type: 'stepAlgebra', equation: '4x - 7 = 9' },
    { type: 'stepAlgebra', equation: '|x| = 4' },
  ]) {
    assert.equal(usesRelationWorkspace(question), needsMultiRelationWorkspace(withPromptRelationSource(question)));
  }
});

test('the relation route wins over the intercept route', () => {
  assert.equal(route({ type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y > 12' }), ALGEBRA_WORKSPACE_ROUTES.RELATION);
});

test('legacy mini-solvers are reported as legacy, never as the mature engine', () => {
  const numeric = resolveAlgebraWorkspaceRoute({ type: 'stepAlgebra2', equation: { a: 3, b: 6, c: 21 } });
  assert.equal(numeric.route, ALGEBRA_WORKSPACE_ROUTES.LEGACY_NUMERIC);
  assert.equal(numeric.legacy, true);
  assert.ok(!numeric.capabilities.includes('exactFractions'));
  assert.ok(!numeric.capabilities.includes('factoring'));

  const intercepts = resolveAlgebraWorkspaceRoute({ type: 'stepAlgebra2', mode: 'linearIntercepts', equation: '2x + 3y = 12' });
  assert.equal(intercepts.route, ALGEBRA_WORKSPACE_ROUTES.LEGACY_LINEAR_INTERCEPTS);
  assert.equal(intercepts.legacy, true);
});

test('every host sees the stored stepAlgebra2 intercept question on the mature engine', () => {
  const stored = Object.freeze({ type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 } });
  // Before: Teacher Question Review handed QuestionEngine the literal record.
  assert.equal(route(stored), ALGEBRA_WORKSPACE_ROUTES.LEGACY_LINEAR_INTERCEPTS);
  // After: QuestionEngine prepares every question the way the player did.
  const prepared = prepareQuestionForRuntimeRouting(stored);
  assert.equal(route(prepared), ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS);
  assert.equal(resolveAlgebraWorkspaceRoute(prepared).engine, ALGEBRA_ENGINES.STEP_ALGEBRA_CORE);
  assert.deepEqual(prepared.standard, stored.standard, 'the authored math is untouched');
});

test('the runtime view is idempotent and keeps identity when nothing needs repair', () => {
  const current = { type: 'stepAlgebra', equation: '3x + 6 = 21', questionId: 'q1' };
  assert.equal(prepareQuestionForRuntimeRouting(current), current, 'an already-current question passes through by identity');

  const stored = { type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 1, B: 1, C: 4 } };
  const once = prepareQuestionForRuntimeRouting(stored);
  const twice = prepareQuestionForRuntimeRouting(once);
  assert.equal(twice, once, 'the player already repaired it; QuestionEngine must not change it again');
});

test('server-graded questions keep the tool contract the server grades', () => {
  const stored = { type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 1, B: 1, C: 4 } };
  assert.equal(prepareQuestionForRuntimeRouting(stored, { serverGraded: true }), stored);
});

test('QuestionEngine routes the question it renders through the resolver, after the runtime view', () => {
  const source = fs.readFileSync('src/QuestionEngine.jsx', 'utf8');
  assert.match(source, /import \{[^}]*prepareQuestionForRuntimeRouting[^}]*\} from '\.\/platform\/algebra\/algebraWorkspaceRoute\.js'/s);
  assert.match(source, /import \{[^}]*resolveAlgebraWorkspaceRoute[^}]*\} from '\.\/platform\/algebra\/algebraWorkspaceRoute\.js'/s);

  const runtime = region(source, 'const runtimeQuestion = useMemo(', ');', 'the runtime question memo');
  assert.match(runtime, /prepareQuestionForRuntimeRouting\(stableQuestion, \{ serverGraded \}\)/);
  const processed = region(source, 'const processedQuestion = useMemo(', ');', 'the processed question memo');
  assert.match(processed, /generateQuestion\(runtimeQuestion,/, 'generation must start from the runtime view, not the literal record');

  const stepAlgebraCase = region(source, "case 'stepAlgebra':", "case 'algebra':", 'the stepAlgebra case');
  assert.match(region(stepAlgebraCase, 'ALGEBRA_WORKSPACE_ROUTES.RELATION', '/>', 'relation branch'), /<MultiRelationAlgebra/);
  assert.match(region(stepAlgebraCase, 'ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS', '/>', 'intercept branch'), /<LinearInterceptsOrchestrator/);

  // The route is published on the workspace so browser certification can read
  // which engine a student actually got.
  assert.match(source, /data-algebra-route=\{algebraWorkspaceRoute\.route\}/);
});

test('StepByStepAlgebra hands off to the relation workspace through the same predicate', () => {
  const source = fs.readFileSync('src/StepByStepAlgebra.jsx', 'utf8');
  assert.match(source, /import \{ usesRelationWorkspace \} from '\.\/platform\/algebra\/algebraWorkspaceRoute\.js'/);
  const memo = region(source, 'const shouldUseRelationWorkspace = useMemo(', ');', 'the relation handoff memo');
  assert.match(memo, /usesRelationWorkspace\(question\)/);
  const handoff = region(source, 'if (shouldUseRelationWorkspace) {', '}', 'the handoff');
  assert.match(handoff, /<MultiRelationAlgebra/);
});
