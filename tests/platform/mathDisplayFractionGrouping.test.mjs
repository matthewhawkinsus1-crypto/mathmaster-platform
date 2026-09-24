import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/MathDisplay.jsx', 'utf8');

test('fraction grouping is removed only for coefficient-style fractions followed by a variable', () => {
  const start = source.indexOf('const stripRedundantStackedFractionParens');
  const end = source.indexOf('const stripMathDelimiters', start);
  const region = source.slice(start, end);
  assert.match(region, /\(\?=\\s\*\(\?:\[A-Za-z\]/);
  assert.match(region, /3\(20\/9\)/);
});
