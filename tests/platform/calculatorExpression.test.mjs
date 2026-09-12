import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCalculatorExpression } from '../../src/platform/policies/calculatorExpression.js';

test('calculator evaluates slash, legacy division, and stacked fractions', () => {
  assert.equal(evaluateCalculatorExpression('12/3', 'basic'), 4);
  assert.equal(evaluateCalculatorExpression('12 ÷ 3', 'basic'), 4);
  assert.equal(evaluateCalculatorExpression('12 \\div 3', 'basic'), 4);
  assert.equal(evaluateCalculatorExpression('\\frac{12}{3}', 'basic'), 4);
  assert.equal(evaluateCalculatorExpression('\\frac{1+5}{2}', 'basic'), 3);
  assert.equal(evaluateCalculatorExpression('\\frac{\\frac{12}{3}}{2}', 'basic'), 2);
});
