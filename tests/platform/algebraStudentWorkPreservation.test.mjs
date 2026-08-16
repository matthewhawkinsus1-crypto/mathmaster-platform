import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperation,
  expressionsEquivalent,
  parseEquationInput,
} from '../../src/algebraAstEngine.js';
import {
  resolveEquationAfterMove,
  resolveEquationAfterStudentSimplification,
} from '../../src/algebraSupportLevels.js';

const literal = () => parseEquationInput({ equation: 'I = P*r*t', solveFor: 'r', workspaceDifficulty: 2 });

test('symbolic addition is preserved instead of being automatically factored', () => {
  const move = applyBalancedOperation({ equationState: literal(), operation: 'add', operand: 't' });
  // MathJS may know the canonical form t(P*r + 1), but that is internal only.
  const shown = resolveEquationAfterMove(move, 2, []);
  assert.match(shown.left, /I/);
  assert.match(shown.left, /t/);
  assert.match(shown.right, /P/);
  assert.match(shown.right, /r/);
  assert.match(shown.right, /t/);
  assert.ok(!/P\s*\*\s*r\s*\+\s*1/.test(shown.right), 'the workspace must not factor a common t for the student');
  assert.ok(expressionsEquivalent(shown.right, 'P*r*t + t', 'r'));
});

test('a second balanced operation preserves the visible symbolic structure', () => {
  const first = applyBalancedOperation({ equationState: literal(), operation: 'add', operand: 't' });
  const afterFirst = resolveEquationAfterMove(first, 2, []);
  const second = applyBalancedOperation({ equationState: afterFirst, operation: 'multiply', operand: '5' });
  const shown = resolveEquationAfterMove(second, 2, []);
  assert.ok(expressionsEquivalent(shown.left, '5*(I+t)', 'r'));
  assert.ok(expressionsEquivalent(shown.right, '5*(P*r*t+t)', 'r'));
  assert.match(shown.right, /P/);
  assert.match(shown.right, /r/);
});

test('division exposes only cancellation factors that are already visible', () => {
  const move = applyBalancedOperation({ equationState: literal(), operation: 'divide', operand: 'P*t' });
  const right = move.cancellationTargets.find((target) => target.side === 'right');
  assert.equal(right.canCancel, true);
  assert.equal(right.cancellationPairs.length, 2);
  assert.ok(expressionsEquivalent(right.cancellationResultExpression, 'r', 'r'));

  const shown = resolveEquationAfterMove(move, 2, ['right']);
  assert.ok(expressionsEquivalent(shown.right, 'r', 'r'));
  assert.ok(expressionsEquivalent(shown.left, 'I/(P*t)', 'r'));
});

test('the engine never invents factoring just to create a cancellation', () => {
  const state = parseEquationInput({ equation: 'I = P*r*t + t', solveFor: 'r' });
  const move = applyBalancedOperation({ equationState: state, operation: 'divide', operand: 't' });
  const right = move.cancellationTargets.find((target) => target.side === 'right');
  assert.equal(right.canCancel, false, 't cannot cancel across an addition unless the student factors first');
  const shown = resolveEquationAfterMove(move, 2, []);
  assert.ok(expressionsEquivalent(shown.right, '(P*r*t+t)/t', 'r'));
  assert.ok(!/P\s*\*\s*r\s*\+\s*1/.test(shown.right));
});

test('visible additive inverse cancellation still works without global simplification', () => {
  const state = parseEquationInput({ equation: '3*x + 6 = 21', solveFor: 'x' });
  const move = applyBalancedOperation({ equationState: state, operation: 'subtract', operand: '6' });
  const left = move.cancellationTargets.find((target) => target.side === 'left');
  assert.equal(left.canCancel, true);
  const shown = resolveEquationAfterMove(move, 3, ['left']);
  assert.ok(expressionsEquivalent(shown.left, '3*x', 'x'));
  assert.ok(expressionsEquivalent(shown.right, '21-6', 'x'));
});

test('an accepted student simplification is preserved in the form the student entered', () => {
  const state = parseEquationInput({ equation: 'x + 3 = 21', solveFor: 'x' });
  const move = applyBalancedOperation({ equationState: state, operation: 'subtract', operand: '3' });
  const shown = resolveEquationAfterStudentSimplification(move, { right: '18' }, ['left']);
  assert.ok(expressionsEquivalent(shown.left, 'x', 'x'));
  assert.equal(shown.right, '18');
});
