import assert from 'node:assert/strict';
import test from 'node:test';

import { sameFactoredPolynomialExpression } from '../../functions/shared/factoredPolynomialExpressionEquivalence.mjs';

test('accepts swapped factor order in factored polynomial expressions', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', '(x-5)(x+2)'), true);
});

test('accepts equivalent term order within a factor', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', '(2+x)(-5+x)'), true);
});

test('accepts a repeated factor written as a square', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+3)^2', '(x+3)(x+3)'), true);
});

test('preserves an outside scalar coefficient', () => {
  assert.equal(sameFactoredPolynomialExpression('2(x+1)(x-4)', '2(x-4)(x+1)'), true);
  assert.equal(sameFactoredPolynomialExpression('2(x+1)(x-4)', '3(x-4)(x+1)'), false);
});

test('rejects expanded form even when algebraically equivalent', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', 'x^2-3x-10'), false);
});

test('rejects a different factorization', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', '(x+1)(x-10)'), false);
});

test('rejects equations and non-products', () => {
  assert.equal(sameFactoredPolynomialExpression('y=(x+2)(x-5)', 'y=(x-5)(x+2)'), false);
  assert.equal(sameFactoredPolynomialExpression('x^2-3x-10', 'x^2-3x-10'), false);
});
