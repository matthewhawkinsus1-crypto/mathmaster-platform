import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  needsMultiRelationWorkspace,
  parseRelationSource,
  relationSourceFromQuestion,
} from '../../src/algebraRelationFoundation.js';
import { multiRelationSource } from './helpers/solverSource.mjs';

test('advanced relation source reads equation', () => {
  assert.equal(relationSourceFromQuestion({ equation: '2*x^2 - 12*x + 7 = 0' }), '2*x^2 - 12*x + 7 = 0');
});

test('advanced relation source reads equationLatex after assignment normalization', () => {
  const source = relationSourceFromQuestion({ equationLatex: '2*x^{2}-12*x+7=0' });
  const state = parseRelationSource(source, 'x');
  assert.equal(state.branches.length, 1);
  assert.deepEqual(state.branches[0].relations, ['=']);
  assert.equal(state.branches[0].expressions.length, 2);
});

test('advanced relation source reads equationAscii and initialEquation', () => {
  assert.equal(relationSourceFromQuestion({ equationAscii: '-8 < x <= 18' }), '-8 < x <= 18');
  assert.equal(relationSourceFromQuestion({ initialEquation: '|x| = 4' }), '|x| = 4');
});

test('advanced relation source reconstructs left and right expressions', () => {
  assert.equal(relationSourceFromQuestion({ leftExpression: 'x^2 + 6*x', rightExpression: '7' }), 'x^2 + 6*x = 7');
  assert.equal(relationSourceFromQuestion({ leftExpression: '3*x - 4', relation: '>=', rightExpression: '11' }), '3*x - 4 >= 11');
});

test('advanced relation source reconstructs a three-expression compound relation', () => {
  assert.equal(relationSourceFromQuestion({ expressions: ['-8', '3 - 2*(4*x - 1)', '18'], relations: ['<', '<='] }), '-8 < 3 - 2*(4*x - 1) <= 18');
});

test('workspace routing sees normalized equationLatex too', () => {
  assert.equal(needsMultiRelationWorkspace({ type: 'stepAlgebra', equationLatex: '2*x^{2}-12*x+7=0' }), true);
});

test('MultiRelationAlgebra uses the shared source resolver', () => {
  const src = multiRelationSource();
  assert.match(src, /relationSourceFromQuestion\(question\)/);
});
