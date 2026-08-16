import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEquationAfterKeepingMove,
  resolveEquationAfterStudentSimplification,
} from '../../src/algebraSupportLevels.js';

test('explicit legacy cancellation is honored without rewriting the uncancelled side', () => {
  const move = {
    simplified: { left: 'I / P', right: 'r * t' },
    unsimplified: { left: 'I / P', right: '(P * r * t) / P' },
    requiredCancellationSides: ['right'],
    simplificationTargets: [],
  };

  assert.deepEqual(
    resolveEquationAfterKeepingMove(move, ['right']),
    { left: 'I / P', right: 'r * t' },
  );
  assert.deepEqual(
    resolveEquationAfterKeepingMove(move, []),
    { left: 'I / P', right: '(P * r * t) / P' },
  );
});

test('modern token-level cancellation result wins over a broader simplified form', () => {
  const move = {
    simplified: { left: 'I / P', right: 'r * (t + 1)' },
    unsimplified: { left: 'I / P', right: '(P * r * t + P * r) / P' },
    requiredCancellationSides: ['right'],
    cancellationTargets: [{
      side: 'right',
      cancellationResultExpression: 'r * t + r',
    }],
  };

  assert.deepEqual(
    resolveEquationAfterKeepingMove(move, ['right']),
    { left: 'I / P', right: 'r * t + r' },
  );
});

test('student-entered simplification stays in the student form while cancellation is honored elsewhere', () => {
  const move = {
    simplified: { left: 'x', right: '18' },
    unsimplified: { left: 'x + 3 - 3', right: '21 - 3' },
    requiredCancellationSides: ['left'],
    cancellationTargets: [{ side: 'left', cancellationResultExpression: 'x' }],
  };

  assert.deepEqual(
    resolveEquationAfterStudentSimplification(move, { right: '21-3' }, ['left']),
    { left: 'x', right: '21-3' },
  );
});
