import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferRelationVariable,
  withPromptRelationSource,
} from '../../src/stepAlgebraRelationRouting.js';

test('promotes canonical inequality fields into the runtime equation source', () => {
  const compound = withPromptRelationSource({
    type: 'stepAlgebra',
    inequality: '10 <= 3y - 2 < 19',
  });
  assert.equal(compound.equation, '10 <= 3y - 2 < 19');
  assert.equal(compound.solveFor, 'y');

  const absolute = withPromptRelationSource({
    type: 'stepAlgebra',
    inequalityText: '|d| < 2',
  });
  assert.equal(absolute.equation, '|d| < 2');
  assert.equal(absolute.solveFor, 'd');
});

test('infers the single algebra variable instead of defaulting every relation to x', () => {
  assert.equal(inferRelationVariable('10 <= 3y - 2 < 19'), 'y');
  assert.equal(inferRelationVariable('|d| > 3'), 'd');
  assert.equal(inferRelationVariable('|L - 24| <= 0.15'), 'L');
});

test('does not guess when a relation genuinely contains multiple unknown symbols', () => {
  assert.equal(inferRelationVariable('a + b > 7'), null);
});

test('keeps an explicitly authored solving variable', () => {
  const question = {
    type: 'stepAlgebra',
    equation: '2y + 1 > 5',
    solveFor: 't',
  };
  assert.equal(withPromptRelationSource(question), question);
});
