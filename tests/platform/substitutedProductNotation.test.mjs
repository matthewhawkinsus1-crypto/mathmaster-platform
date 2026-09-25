import test from 'node:test';
import assert from 'node:assert/strict';

import { expressionToLatex } from '../../src/algebraAstEngine.js';

const tex = (expression) => expressionToLatex(expression).replace(/\s+/g, '');

// Live QA round 2, systems substitution y = 2x into 3x + 4y = 11: the step chip
// read 3x + 4(2x) = 11 but the balance board showed the term 4·2·x as 4x(2) —
// the letter was moved in front of a grouped number as if it were a scalar.
test('a letter after a grouped number stays after it', () => {
  assert.equal(tex('4 * 2 * x'), '4\\left(2\\right)x');
  assert.equal(tex('3 * (-2) * x'), '3\\left(-2\\right)x');
  assert.equal(tex('-4 * 2 * x'), '-4\\left(2\\right)x');
});

test('a scalar after a grouped expression still moves in front', () => {
  assert.equal(tex('(x + 1) * 5'), '5\\left(x+1\\right)');
  assert.equal(tex('(x + 1) * y'), 'y\\left(x+1\\right)');
  assert.equal(tex('(5/2) * x'), '\\left(\\frac{5}{2}\\right)x');
});
