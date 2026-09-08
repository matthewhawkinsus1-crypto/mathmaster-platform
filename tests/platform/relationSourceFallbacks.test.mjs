import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferRelationVariable,
  parseRelationSource,
  relationSolutionSummary,
  relationSourceFromQuestion,
} from '../../src/algebraRelationFoundation.js';

test('reads canonical inequality fields as relation sources', () => {
  assert.equal(
    relationSourceFromQuestion({ inequality: '10 <= 3y - 2 < 19' }),
    '10 <= 3y - 2 < 19',
  );
  assert.equal(
    relationSourceFromQuestion({ inequalityText: '|d| < 2' }),
    '|d| < 2',
  );
});

test('infers the single algebra variable instead of defaulting every relation to x', () => {
  assert.equal(inferRelationVariable('10 <= 3y - 2 < 19'), 'y');
  assert.equal(inferRelationVariable('|d| > 3'), 'd');
  assert.equal(inferRelationVariable('|L - 24| <= 0.15'), 'L');
});

test('does not guess when a relation genuinely contains multiple unknown symbols', () => {
  assert.equal(inferRelationVariable('a + b > 7'), null);
});

test('parses a non-x compound inequality with the inferred variable', () => {
  const state = parseRelationSource('4 <= y < 7');
  assert.equal(state.variable, 'y');
  assert.deepEqual(relationSolutionSummary(state), {
    solved: true,
    kind: 'intervals',
    intervals: [{ min: 4, max: 7, minClosed: true, maxClosed: false }],
  });
});
