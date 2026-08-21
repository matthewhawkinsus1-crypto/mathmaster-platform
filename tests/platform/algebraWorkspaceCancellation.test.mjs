import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperation,
  parseEquationInput,
  splitMultiplicativeFactors,
  expressionsEquivalent,
} from '../../src/algebraAstEngine.js';
import { resolveEquationAfterMove } from '../../src/algebraSupportLevels.js';

const literal = (equation, solveFor) => parseEquationInput({
  equation,
  solveFor,
  objective: { kind: 'isolate', variable: solveFor, simplifyRequired: true },
});

test('dividing d = rt by r creates cancellation only on rt/r and no redundant left-side response box', () => {
  const move = applyBalancedOperation({
    equationState: literal('d = r*t', 't'),
    operation: 'divide',
    operand: 'r',
  });

  assert.deepEqual(move.requiredCancellationSides, ['right']);
  assert.deepEqual(move.simplificationTargets.map((target) => target.side), []);

  const factors = splitMultiplicativeFactors(move.unsimplified.right);
  assert.deepEqual(factors.numerator.map((factor) => factor.text), ['r', 't']);
  assert.deepEqual(factors.denominator.map((factor) => factor.text), ['r']);

  const after = resolveEquationAfterMove(move, 2, ['right']);
  assert.equal(expressionsEquivalent(after.left, 'd/r', 'd'), true, `left side should remain equivalent to d/r, got ${after.left}`);
  assert.equal(after.right, 't');
});

test('compound symbolic division exposes every matching factor in the actual fraction', () => {
  const move = applyBalancedOperation({
    equationState: literal('I = P*r*t', 'r'),
    operation: 'divide',
    operand: 'P*t',
  });

  assert.deepEqual(move.requiredCancellationSides, ['right']);
  const factors = splitMultiplicativeFactors(move.unsimplified.right);
  assert.deepEqual(factors.numerator.map((factor) => factor.text), ['P', 'r', 't']);
  assert.deepEqual(factors.denominator.map((factor) => factor.text), ['P', 't']);
});

test('multiplying reciprocal symbolic coefficients exposes factor cancellations', () => {
  const move = applyBalancedOperation({
    equationState: literal('F - 32 = (9/5)*C', 'C'),
    operation: 'multiply',
    operand: '5/9',
  });
  const factors = splitMultiplicativeFactors(move.unsimplified.right);
  assert.ok(factors.numerator.some((factor) => factor.text === '5'));
  assert.ok(factors.numerator.some((factor) => factor.text === '9'));
  assert.ok(factors.numerator.some((factor) => factor.text === 'C'));
  assert.ok(factors.denominator.some((factor) => factor.text === '9'));
  assert.ok(factors.denominator.some((factor) => factor.text === '5'));
});


test('pure symbolic quotient formatting does not create a fake simplification target', () => {
  const move = applyBalancedOperation({
    equationState: literal('d = r*t', 't'),
    operation: 'divide',
    operand: 'r',
  });

  const leftTarget = move.cancellationTargets.find((target) => target.side === 'left');
  assert.equal(leftTarget.canCancel, false);
  assert.equal(leftTarget.needsSimplification, false);
});

test('real arithmetic reduction still creates a manual simplification target', () => {
  const move = applyBalancedOperation({
    equationState: literal('x + 6 = 21', 'x'),
    operation: 'subtract',
    operand: '6',
  });

  assert.ok(move.simplificationTargets.some((target) => target.side === 'right'));
});

test('MathLive fraction syntax is accepted as equivalent algebra', () => {
  // A real simplification response may come back from MathInput in LaTeX.
  // The grader must compare the mathematics, not the input serialization.
  return import('../../src/algebraAstEngine.js').then(({ expressionsEquivalent }) => {
    assert.equal(expressionsEquivalent('\\frac{d}{r}', 'd/r', 'd'), true);
  });
});
