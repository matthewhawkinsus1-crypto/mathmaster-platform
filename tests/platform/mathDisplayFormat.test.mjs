import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMathDisplayFormat } from '../../src/mathDisplayFormat.js';
import { readFileSync } from 'node:fs';

test('forces LaTeX after a display rewrite introduces a LaTeX fraction', () => {
  assert.equal(resolveMathDisplayFormat('(\\frac{f}{g})(x)', 'ascii-math'), 'latex');
});

test('keeps ordinary ASCIIMath in ASCIIMath mode', () => {
  assert.equal(resolveMathDisplayFormat('(f+g)(x)', 'ascii-math'), 'ascii-math');
});

test('honors an explicit LaTeX request', () => {
  assert.equal(resolveMathDisplayFormat('x^2', 'latex'), 'latex');
});


test('student math display repairs legacy joined inequality command text', () => {
  const source = readFileSync('src/MathDisplay.jsx', 'utf8');
  assert.match(source, /repairLegacyMathLiveRelations/);
  assert.match(source, /replace\(\/\\\\let\\b\/g, '\\\\le t'\)/);
  assert.match(source, /replace\(\/\\\\get\\b\/g, '\\\\ge t'\)/);
});
