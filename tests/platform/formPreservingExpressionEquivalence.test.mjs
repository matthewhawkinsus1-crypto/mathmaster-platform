import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sameFormPreservingExpression,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

test('difference-of-cubes expression accepts MathLive exponent braces', () => {
  const bank = '(x-11)*(x^2+11*x+121)';
  const student = '(x-11)(x^{2}+11x+121)';

  assert.equal(sameFormPreservingExpression(student, bank), true);
  assert.equal(sameValue(student, bank), true);
});

test('explicit multiplication and implicit multiplication are the same factored form', () => {
  assert.equal(
    sameValue('(x-5)(x^2+5x+25)', '(x-5)*(x^2+5*x+25)'),
    true,
  );
});

test('sum-of-cubes form also survives MathLive exponent formatting', () => {
  assert.equal(
    sameValue('(x+8)(x^{2}-8x+64)', '(x+8)*(x^2-8*x+64)'),
    true,
  );
});

test('form-preserving expression comparison does not expand a factored answer', () => {
  assert.equal(
    sameFormPreservingExpression('(x-5)(x^2+5x+25)', 'x^3-125'),
    false,
  );
  assert.equal(
    sameValue('(x-5)(x^2+5x+25)', 'x^3-125'),
    false,
  );
});

test('form-preserving expression comparison does not reorder factors', () => {
  assert.equal(
    sameFormPreservingExpression('(x-5)(x^2+5x+25)', '(x^2+5x+25)(x-5)'),
    false,
  );
});

test('wrong factor remains wrong', () => {
  assert.equal(
    sameValue('(x-4)(x^2+5x+25)', '(x-5)*(x^2+5*x+25)'),
    false,
  );
});
