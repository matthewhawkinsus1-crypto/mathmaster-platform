import test from 'node:test';
import assert from 'node:assert/strict';

import { sameExpandedPolynomialExpression } from '../../functions/shared/expandedPolynomialExpressionEquivalence.mjs';

test('accepts reordered expanded terms', () => {
  assert.equal(sameExpandedPolynomialExpression('3x^2-2x+5', '5+3x^2-2x'), true);
});

test('accepts equivalent coefficient arithmetic in expanded form', () => {
  assert.equal(sameExpandedPolynomialExpression('1.5x^2+3x-4', '3/2x^2+6/2x-4'), true);
});

test('rejects a different polynomial', () => {
  assert.equal(sameExpandedPolynomialExpression('3x^2-2x+5', '3x^2-2x+6'), false);
});

test('rejects factored/grouped form when expanded form is required', () => {
  assert.equal(sameExpandedPolynomialExpression('x^2+5x+6', '(x+2)(x+3)'), false);
});

test('rejects equations because this helper is expression-only', () => {
  assert.equal(sameExpandedPolynomialExpression('y=x^2+5x+6', 'y=x^2+5x+6'), false);
});
