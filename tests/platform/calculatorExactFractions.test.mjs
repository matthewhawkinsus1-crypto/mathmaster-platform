// THE CALCULATOR GIVES THE EXACT FRACTION, NOT ONLY A DECIMAL.
//
// 1/3 + 1/6 came back 0.5 and 1/3 as 0.333333333333: a student working with
// fractions had to convert back by hand. The decimal answer is unchanged
// (evaluateCalculatorExpression is untouched); beside it the panel shows the
// exact fraction whenever the result is a non-integer rational.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCalculatorExpression, evaluateCalculatorExpressionExact } from '../../src/platform/policies/calculatorExpression.js';

const exact = (expression) => evaluateCalculatorExpressionExact(expression, 'basic').fraction;

test('a rational result has its exact fraction; the decimal is the calculator\'s own', () => {
  assert.equal(exact('1/3 + 1/6'), '1/2');
  assert.equal(exact('0.1 + 0.2'), '3/10', 'a decimal is read exactly');
  assert.equal(exact('2^-2'), '1/4');
  assert.equal(exact('(2/3)^3'), '8/27');
  assert.equal(exact('-5/10'), '-1/2');
  assert.equal(exact('\\frac{3}{4}+\\frac{1}{8}'), '7/8');
  assert.equal(exact('1/3'), '1/3');
  ['1/3 + 1/6', '0.1 + 0.2', '2^-2', '12 ÷ 3', 'sqrt(2)'].forEach((expression) => {
    const result = evaluateCalculatorExpressionExact(expression, 'basic');
    assert.equal(result.value, evaluateCalculatorExpression(expression, 'basic'), expression);
    assert.equal(result.decimal, String(result.value));
  });
});

test('an integer, an irrational or an unsupported result has no fraction; errors are unchanged', () => {
  assert.equal(exact('7/7'), null, 'an integer needs no fraction');
  assert.equal(exact('12 ÷ 3'), null);
  assert.equal(exact('sqrt(2)'), null);
  assert.equal(exact('2^(1/2)'), null, 'a non-integer power is not kept rational');
  assert.equal(exact('pi/2'), null);
  assert.throws(() => evaluateCalculatorExpressionExact('1/0', 'basic'), /finite number/);
  assert.throws(() => evaluateCalculatorExpressionExact('abc', 'basic'), /Unsupported calculator function/);
});

test('the panel shows the exact fraction beside the result, and only while that result is on screen', () => {
  const panel = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /^import \{ evaluateCalculatorExpressionExact \} from '\.\.\/platform\/policies\/calculatorExpression';$/m);
  assert.equal((panel.match(/setExactResult\(evaluated\.fraction \? \{ decimal: (?:result|evaluated\.decimal), fraction: evaluated\.fraction \} : null\);/g) || []).length, 2, 'Enter and the = key both record it');
  assert.match(panel, /\{exactResult && exactResult\.decimal === display \? \(\s*<p data-calculator-exact="" role="status"/);
});
