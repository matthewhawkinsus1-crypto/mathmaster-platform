import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';

test('forces LaTeX after a display rewrite introduces a LaTeX fraction', () => {
  assert.equal(resolveMathDisplayFormat('(\\frac{f}{g})(x)', 'ascii-math'), 'latex');
});

test('keeps ordinary ASCIIMath in ASCIIMath mode', () => {
  assert.equal(resolveMathDisplayFormat('(f+g)(x)', 'ascii-math'), 'ascii-math');
});

test('honors an explicit LaTeX request', () => {
  assert.equal(resolveMathDisplayFormat('x^2', 'latex'), 'latex');
});
