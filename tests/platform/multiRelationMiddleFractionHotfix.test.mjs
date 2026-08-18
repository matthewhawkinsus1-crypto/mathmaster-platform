import test from 'node:test';
import assert from 'node:assert/strict';

import {
  relationExpressionToLatex,
} from '../../src/algebraRelationFoundation.js';

test('middle compound expression remains visible after division', () => {
  const latex = relationExpressionToLatex('(-2 * (4*x - 1)) / (-2)');

  assert.match(latex, /\\frac/);
  assert.match(latex, /x/);
  assert.match(latex, /4/);
  assert.match(latex, /2/);
  assert.ok(latex.length > 12, `unexpectedly short TeX: ${latex}`);
});

test('grouped polynomial quotient still renders as a fraction', () => {
  const latex = relationExpressionToLatex('(2*x^2 - 12*x) / 2');

  assert.match(latex, /\\frac/);
  assert.match(latex, /x/);
  assert.match(latex, /12/);
});

test('simple signed numeric fraction keeps its conventional display', () => {
  assert.equal(relationExpressionToLatex('-4/3'), '-\\frac{4}{3}');
});
