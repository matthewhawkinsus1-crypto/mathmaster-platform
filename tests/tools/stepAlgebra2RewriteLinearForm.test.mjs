import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyRewriteBalancedOperation,
  buildInitialEquationState,
  checkSideRewrite,
  describeRewriteGap,
  isRewriteComplete,
  isSimplifiedSlopeInterceptForm,
} from '../../src/tools/stepAlgebra2/rewriteLinearFormMath.js';

const applyOperation = (state, operation, operand) => {
  const result = applyRewriteBalancedOperation(state, operation, operand);
  return { ...state, left: result.unsimplified.left, right: result.unsimplified.right };
};

const commitRewrite = (state, scope, expressions) => {
  const result = checkSideRewrite(state, scope, expressions);
  assert.equal(result.ok, true, `expected rewrite to be accepted for ${JSON.stringify(expressions)}`);
  return result.equationState;
};

// 8. 5x + 2y = 6 => y = -(5/2)x + 3
test('5x + 2y = 6 rewrites to y = -(5/2)x + 3', () => {
  let state = buildInitialEquationState({ equation: '5x + 2y = 6' });
  state = applyOperation(state, 'subtract', '5x');
  state = applyOperation(state, 'divide', '2');
  state = commitRewrite(state, 'left', 'y');
  state = commitRewrite(state, 'right', '-(5/2)x + 3');
  assert.equal(isRewriteComplete(state), true);
  assert.equal(isSimplifiedSlopeInterceptForm(state.right), true);
});

// 9. -5x + 7y = 11 => y = (5/7)x + 11/7
test('-5x + 7y = 11 rewrites to y = (5/7)x + 11/7', () => {
  let state = buildInitialEquationState({ equation: '-5x + 7y = 11' });
  state = applyOperation(state, 'add', '5x');
  state = applyOperation(state, 'divide', '7');
  state = commitRewrite(state, 'both', { left: 'y', right: '(5/7)x + 11/7' });
  assert.equal(isRewriteComplete(state), true);
});

// 10. Negative division does not create duplicated negative display/state.
test('dividing by a negative coefficient does not double a negative sign', () => {
  let state = buildInitialEquationState({ equation: '2x - 4y = 8' });
  state = applyOperation(state, 'subtract', '2x');
  state = applyOperation(state, 'divide', '-4');
  state = commitRewrite(state, 'left', 'y');
  state = commitRewrite(state, 'right', '(1/2)x - 2');
  assert.equal(isRewriteComplete(state), true);

  let negState = buildInitialEquationState({ equation: '-3x - 6y = 12' });
  negState = applyOperation(negState, 'add', '3x');
  negState = applyOperation(negState, 'divide', '-6');
  negState = commitRewrite(negState, 'left', 'y');
  // A student who wrote a stray extra negative ("(1/2)x - 2" instead of the
  // correct "-(1/2)x - 2") must be rejected, not accepted as "close enough".
  const wrongSign = checkSideRewrite(negState, 'right', '(1/2)x - 2');
  assert.equal(wrongSign.ok, false);
  negState = commitRewrite(negState, 'right', '-(1/2)x - 2');
  assert.equal(isRewriteComplete(negState), true);
});

// Point-slope form with a negative slope and distribution.
test('y - 7 = -(2/3)(x + 3) rewrites to y = -(2/3)x + 5', () => {
  let state = buildInitialEquationState({ equation: 'y - 7 = -(2/3)(x + 3)' });
  state = applyOperation(state, 'add', '7');
  state = commitRewrite(state, 'both', { left: 'y', right: '-(2/3)x + 5' });
  assert.equal(isRewriteComplete(state), true);
});

// 11. Equivalence is preserved at every committed step (a wrong rewrite is refused).
test('equivalence is checked and enforced at every committed step', () => {
  let state = buildInitialEquationState({ equation: '5x + 2y = 6' });
  state = applyOperation(state, 'subtract', '5x');
  const badRewrite = checkSideRewrite(state, 'right', '6 - 6x');
  assert.equal(badRewrite.ok, false);
  // The rejected rewrite must not have mutated state.
  assert.equal(state.right, '(6) - (5 x)');

  const goodRewrite = checkSideRewrite(state, 'right', '6 - 5x');
  assert.equal(goodRewrite.ok, true);
});

// A response that is equivalent but not yet structurally mx + b is not complete.
test('an equivalent but unsimplified right side is not yet a complete rewrite', () => {
  let state = buildInitialEquationState({ equation: '5x + 2y = 6' });
  state = applyOperation(state, 'subtract', '5x');
  state = applyOperation(state, 'divide', '2');
  state = commitRewrite(state, 'left', 'y');
  // (6 - 5x) / 2 is mathematically correct but still a single fraction spanning
  // the whole numerator — the student has not yet performed the "simplify
  // rational coefficients" step this mode requires.
  state = commitRewrite(state, 'right', '(6 - 5x) / 2');
  assert.equal(describeRewriteGap(state), 'needsSimplification');
  assert.equal(isRewriteComplete(state), false);
});

// 12. Legacy ax + b = c questions remain unchanged (rewriteLinearForm is opt-in by mode).
//
// Node cannot import a .jsx file (see AGENTS.md), so this asserts the actual
// dispatch behavior — rewriteLinearForm routes to its own component and
// returns before the legacy ax + b = c state is even constructed — by
// reading the source rather than by guessing at its wording.
test('rewriteLinearForm mode is dispatched before the legacy ax + b = c workspace is built', () => {
  const source = fs.readFileSync(new URL('../../src/tools/stepAlgebra2/StepAlgebra2.jsx', import.meta.url), 'utf8');
  const dispatchIndex = source.indexOf("questionData.mode === 'rewriteLinearForm'");
  const legacyOriginalIndex = source.indexOf('const original = questionData.equation');
  assert.ok(dispatchIndex >= 0, 'expected an explicit rewriteLinearForm mode check');
  assert.ok(legacyOriginalIndex >= 0, 'expected the legacy ax + b = c default to remain present');
  assert.ok(dispatchIndex < legacyOriginalIndex, 'rewriteLinearForm must return before the legacy equation state is constructed');
  assert.match(source, /return <RewriteLinearForm questionData=\{questionData\} onAction=\{onAction\} \/>/);
});

// 13. Undo/persistence works in rewrite mode: the equation state and the
// committed-step history are both persistent-tool-state fields, and Universal
// Undo restores both together (not just the equation, which would desync the
// "Your steps" list from the equation it explains).
test('rewriteLinearForm wires the equation state and history through persistence and Universal Undo', () => {
  const source = fs.readFileSync(new URL('../../src/tools/stepAlgebra2/RewriteLinearForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /usePersistentToolState\('rewriteEquationState', initialEquationState\)/);
  assert.match(source, /usePersistentToolState\('rewriteHistory', \[\]\)/);
  assert.match(source, /useMathUndoHistory\(\{[\s\S]{0,200}state: \{ equationState, history \}/);
  assert.match(source, /onRestore: restoreWork/);
  assert.match(source, /resetKey: questionData\.questionId \?\? questionData\.id \?\? null/);
  assert.match(source, /undo: undoHistory\.capability/);
});

test('isSimplifiedSlopeInterceptForm rejects un-distributed and single-fraction right sides', () => {
  assert.equal(isSimplifiedSlopeInterceptForm('-(2/3)*(x+3)+7'), false);
  assert.equal(isSimplifiedSlopeInterceptForm('(6-5*x)/2'), false);
  assert.equal(isSimplifiedSlopeInterceptForm('-(5/2)*x+3'), true);
  assert.equal(isSimplifiedSlopeInterceptForm('3 - (5/2)*x'), true);
});
