/*
 * THE CALCULATOR COMPUTES THE FRACTION IT SHOWS (student pass 3, Batch 2).
 *
 * A bracket now ends a typed fraction (typedFractionEntry.js, R-11), so typing
 * `6/2(1+2)` in the calculator shows six-halves times (1 + 2). MathLive writes
 * that \frac{6}{2}\left(1+2\right) as `(6)/(2)(1+2)`, which mathjs reads with
 * the implicit product first: 6/(2·3) = 1 on a screen that shows 9. `3/4(8)`
 * showed (3/4)·8 and answered 0.09375; `\frac{1}{2}\pi` answered 1/(2π). Each
 * built fraction is now one factor (groupBuiltFractions);
 * tests/browser/mathEntryContract.mjs types the same cases into the real
 * calculator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { evaluateCalculatorExpressionExact, groupBuiltFractions } from '../../src/platform/policies/calculatorExpression.js';

const value = (ascii) => evaluateCalculatorExpressionExact(groupBuiltFractions(ascii), 'scientific').value;

test('a built fraction stays one factor, whatever follows it', () => {
  // What MathLive 0.110 writes for each (probed in Chromium).
  assert.equal(groupBuiltFractions('(6)/(2)(1+2)'), '((6)/(2))(1+2)');
  assert.equal(value('(6)/(2)(1+2)'), 9);
  assert.equal(value('(3)/(4)(8)'), 6);
  assert.equal(value('(1)/(2)pi'), Number((Math.PI / 2).toPrecision(12)));
  assert.equal(value('(1)/(2)(3)/(4)'), 0.375, 'two fractions side by side are their product');
  // Already the same reading: unchanged values.
  assert.equal(value('(6)/(2(1+2))'), 1, 'a bracket built inside the denominator stays there');
  assert.equal(value('2(1)/(3)'), Number((2 / 3).toPrecision(12)));
  assert.equal(value('(1)/(2)^2'), 0.25);
  assert.equal(value('((1)/(2))/(3)'), Number((1 / 6).toPrecision(12)), 'a fraction over a number');
  assert.equal(value('(6)/(2) * 3'), 9);
});

test('nothing else is rewritten, and a grouped fraction is not grouped again', () => {
  // Typed text (no built fraction) keeps mathjs's own reading, which
  // kAudit_calculatorExact pins.
  for (const ascii of ['3+4', '(1+2)(3)', '6/2(1+2)', '2^3', 'sqrt(16)', '((6)/(2))(1+2)', '((x)', '']) {
    assert.equal(groupBuiltFractions(ascii), ascii, ascii);
  }
  assert.equal(groupBuiltFractions(groupBuiltFractions('(1)/(2)(3)/(4)')), '((1)/(2))((3)/(4))');
  assert.equal(groupBuiltFractions('((1)/(2))/(3)'), '(((1)/(2))/(3))');
  assert.equal(groupBuiltFractions(null), '');
});

test('the calculator panel groups what it reads from its math field', () => {
  const panel = executableSource(readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8'));
  const read = region(panel, 'const expressionFromMathField = (mathField, fallback = \'\') => {', '\n};', 'the math field reader');
  assert.match(read, /const ascii = mathField\?\.getValue\?\.\('ascii-math'\);/);
  assert.match(read, /return groupBuiltFractions\(String\(ascii\)\.trim\(\)\);/);
  assert.match(panel, /import \{[^}]*\bgroupBuiltFractions\b[^}]*\} from '\.\.\/platform\/policies\/calculatorExpression';/);
  // Both ways to evaluate (Enter in the field, the = key) read through it.
  assert.equal((panel.match(/evaluateCalculatorExpressionExact\(expression, policy\.mode\)/g) || []).length, 2);
  assert.equal((panel.match(/const expression = expressionFromMathField\(/g) || []).length, 2);
});
