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

// Grader spellings (2026-11): the same factors in another order are the same
// factored form, as the factoredForm grading mode has always taken them, and
// a student who wrote them so was refused. The comparison still expands
// nothing (above), and nothing moves inside a factor.
test('form-preserving expression comparison takes the same factors in another order, and nothing else', () => {
  assert.equal(
    sameFormPreservingExpression('(x-5)(x^2+5x+25)', '(x^2+5x+25)(x-5)'),
    true,
  );
  assert.equal(
    sameFormPreservingExpression('(x-5)(x^2+5x+25)', '(x^2+5x+25)(x+5)'),
    false,
  );
  assert.equal(
    sameFormPreservingExpression('(x-5)(x^2+5x+25)', '(25+5x+x^2)(x-5)'),
    false,
  );
});

test('wrong factor remains wrong', () => {
  assert.equal(
    sameValue('(x-4)(x^2+5x+25)', '(x-5)*(x^2+5*x+25)'),
    false,
  );
});
