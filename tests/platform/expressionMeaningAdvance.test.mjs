import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { nextIncompleteExpressionId } from '../../src/tools/expressionMeaning/expressionMeaningMath.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const full = { unit: 'u', contextMeaning: 'c', mathRole: 'r' };
const exprs = ['t', 'G', '15', 'adj'].map((id) => ({ id, expression: id }));

// Live QA round 2: the matrix sits above the choices, so each next expression
// meant scrolling up to the matrix and back down — six times per question.
test('completing a row opens the next incomplete expression', () => {
  assert.equal(nextIncompleteExpressionId(exprs, { t: full }, 't'), 'G');
  assert.equal(nextIncompleteExpressionId(exprs, { t: full, G: full }, 'G'), '15');
  assert.equal(nextIncompleteExpressionId(exprs, { '15': full, adj: full }, 'adj'), 't', 'wraps to the first gap');
  assert.equal(nextIncompleteExpressionId(exprs, { t: full, G: full, '15': full, adj: full }, 'adj'), null);
  assert.equal(nextIncompleteExpressionId(exprs, { t: { unit: 'u' }, G: full }, 'G'), '15', 'partial rows still count as open');
});

test('the tool advances only when a row becomes complete', () => {
  const source = read('src/tools/expressionMeaning/ExpressionMeaning.jsx');
  const assign = source.slice(source.indexOf('const assign = (exprId, dimension, value) => {'), source.indexOf('const completedCount'));
  assert.match(assign, /if \(!isRowComplete\(assignments\[exprId\]\) && isRowComplete\(next\[exprId\]\)\) \{\s*const nextId = nextIncompleteExpressionId\(expressions, next, exprId\);\s*if \(nextId\) setActiveId\(nextId\);/);
});
