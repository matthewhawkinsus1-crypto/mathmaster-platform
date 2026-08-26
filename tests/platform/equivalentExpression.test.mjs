import test from 'node:test';
import assert from 'node:assert/strict';
import { sameEquivalentExpression } from '../../src/equivalentExpression.js';

test('accepts MathLive implicit multiplication for an authored polynomial', () => {
  assert.equal(sameEquivalentExpression('5x^{2}+6x-1', '5*x^2+6*x-1'), true);
});

test('accepts reordered but equivalent polynomial terms', () => {
  assert.equal(sameEquivalentExpression('6x+5x^2-1', '5*x^2+6*x-1'), true);
});

test('accepts a stacked MathLive quotient when numerator and denominator are equivalent', () => {
  assert.equal(
    sameEquivalentExpression('\\frac{3x^{2}-2x+1}{x-4}', '(3*x^2-2*x+1)/(x-4)'),
    true,
  );
});

test('does not treat a different rational expression as equivalent', () => {
  assert.equal(
    sameEquivalentExpression('\\frac{3x^{2}-2x+1}{x+4}', '(3*x^2-2*x+1)/(x-4)'),
    false,
  );
});

test('does not turn equations into expression-equivalence questions', () => {
  assert.equal(sameEquivalentExpression('y=x+1', 'y=x+1'), false);
});
