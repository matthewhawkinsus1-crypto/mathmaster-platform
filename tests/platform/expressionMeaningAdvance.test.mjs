import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { firstIncompleteExpressionId, nextIncompleteExpressionId } from '../../src/tools/expressionMeaning/expressionMeaningMath.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

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

// Platform quirks audit PQ-028: the work restored exactly, but the tool always
// reopened on row 1, so a student mid-way through row 3 came back to row 1.
test('restored work reopens on the first row still missing a choice', () => {
  assert.equal(firstIncompleteExpressionId(exprs, {}), 't', 'no work: the first row');
  assert.equal(firstIncompleteExpressionId(exprs, { t: full, G: full, '15': { unit: 'u' } }), '15', 'mid-way through row 3');
  assert.equal(firstIncompleteExpressionId(exprs, { t: full, '15': full }), 'G', 'a gap before later finished rows comes first');
  assert.equal(firstIncompleteExpressionId(exprs, { t: full, G: full, '15': full, adj: full }), null, 'every row complete');
  assert.equal(firstIncompleteExpressionId(exprs, { t: { unit: 'u', contextMeaning: '  ', mathRole: 'r' } }), 't', 'a blank choice is not a choice');
  assert.equal(firstIncompleteExpressionId(undefined, { t: full }), null);
});

test('the tool opens on that row, computed from the restored answers', () => {
  const source = executableSource(read('src/tools/expressionMeaning/ExpressionMeaning.jsx'));
  // The open row's initial state is derived from the answers usePersistentToolState
  // restored in the same render, and falls back to row 1 only when every row is done.
  const restored = source.indexOf("usePersistentToolState('assignments'");
  const opened = region(source, 'const [activeId, setActiveId] = useState(', '));', 'the open-row state');
  assert.ok(restored !== -1 && restored < source.indexOf('const [activeId, setActiveId] = useState('), 'the answers are restored before the open row is chosen');
  assert.match(opened, /firstIncompleteExpressionId\(expressions, assignments\)\s*\|\|\s*expressions\[0\]\?\.id/);
});
