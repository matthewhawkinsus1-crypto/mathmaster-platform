import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exactFractionText } from '../../src/tools/shared/toolMath.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// EXACT VALUES IN THE LEGACY NUMERIC SOLVER (Job 2).
//
// Stored {a, b, c} stepAlgebra2 questions still open the legacy ax + b = c
// solver (issue #297 kept it so in-progress work is not disturbed). It showed
// every value rounded to three places, so 9x = 20 ÷ 9 read "x = 2.222".

test('rational values are shown as exact fractions', () => {
  assert.equal(exactFractionText(20 / 9), '20/9');
  assert.equal(exactFractionText(-5 / 2), '-5/2');
  assert.equal(exactFractionText(0.1 + 0.2), '3/10');
  assert.equal(exactFractionText(21 / 3), '7');
  assert.equal(exactFractionText(-0), '0');
  assert.equal(exactFractionText(Math.PI), '3.1416', 'a value that is not a small ratio falls back to a decimal');
});

test('the legacy solver formats every value it shows through the exact formatter', () => {
  const source = fs.readFileSync('src/tools/stepAlgebra2/StepAlgebra2.jsx', 'utf8');
  const format = region(source, 'const formatEquation = (state) => {', '\n};', 'formatEquation');
  assert.match(format, /exactFractionText\(Math\.abs\(a\)\)/);
  assert.match(format, /exact\(state\.c\)/);
  assert.doesNotMatch(executableSource(source), /\bround\(/, 'no rounded value reaches the student');
});
