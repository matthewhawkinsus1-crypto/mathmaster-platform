import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  sameInverseFunctionEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

test('the reported inverse answer is accepted across MathLive and bank formatting', () => {
  const student = 'f^{-1}(x)=\\frac{x-7}{3}';
  const bank = 'f^-1(x)=(x-(7))/3';
  assert.equal(sameInverseFunctionEquation(student, bank), true);
  assert.equal(sameValue(student, bank), true);
});

test('negative intercept algebra is also equivalent without hand-authored variants', () => {
  assert.equal(
    sameValue('f^{-1}(x)=\\frac{x+7}{3}', 'f^-1(x)=(x-(-7))/3'),
    true,
  );
});

test('a genuinely wrong inverse equation is still rejected', () => {
  assert.equal(
    sameValue('f^{-1}(x)=\\frac{x+7}{3}', 'f^-1(x)=(x-7)/3'),
    false,
  );
  assert.equal(
    sameValue('g^{-1}(x)=\\frac{x-7}{3}', 'f^-1(x)=(x-7)/3'),
    false,
  );
});

test('equation keypad includes inverse-function notation and cannot exceed its own width', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(source, /label: 'f⁻¹\(x\)'/);
  assert.match(source, /command: 'f\^\{-1\}\(x\)'/);
  assert.match(source, /const EQUATION_ENTRY_KEYS/);
  assert.match(source, /boxSizing: 'border-box'/);
  assert.match(source, /repeat\(auto-fit, minmax\(48px, 1fr\)\)/);
});

test('Path horizontal lock catches delayed and nested Chromium scrolling', () => {
  const source = readFileSync('src/components/student/PathSessionPlayer.jsx', 'utf8');
  assert.match(source, /document\.addEventListener\('scroll', scheduleRestore, true\)/);
  assert.match(source, /visualViewport\?\./);
  assert.match(source, /node\.scrollLeft = 0/);
  assert.match(source, /setTimeout\(restoreHorizontalOrigin, 40\)/);
});
