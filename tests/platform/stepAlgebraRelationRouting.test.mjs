import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPromptRelationSource,
  withPromptRelationSource,
} from '../../src/stepAlgebraRelationRouting.js';

test('extracts a prompt-only inequality from legacy stepAlgebra', () => {
  const question = {
    type: 'stepAlgebra',
    prompt: 'Solve 3x + 7 > 22, then graph the solution on the MathMaster number line.',
  };
  assert.equal(extractPromptRelationSource(question), '3x + 7 > 22');
  assert.equal(withPromptRelationSource(question).equation, '3x + 7 > 22');
});

test('extracts a prompt-only absolute-value inequality and normalizes unicode minus', () => {
  const question = {
    type: 'stepAlgebra',
    prompt: 'Solve 5|2x − 1| + 4 > 19, then graph the complete solution set.',
  };
  assert.equal(extractPromptRelationSource(question), '5|2x - 1| + 4 > 19');
});

test('routes an absolute-value equation even when its relation is equality', () => {
  const question = { type: 'stepAlgebra', prompt: 'Solve |x - 2| = 5.' };
  assert.equal(extractPromptRelationSource(question), '|x - 2| = 5');
});

test('stops before step-by-step instructional prose in a prompt-only absolute-value equation', () => {
  const question = {
    type: 'stepAlgebra',
    prompt: 'Solve |x − 4| = 7 step by step. Give the complete solution set.',
  };
  assert.equal(extractPromptRelationSource(question), '|x - 4| = 7');
  assert.equal(withPromptRelationSource(question).equation, '|x - 4| = 7');
});

test('stops before graphing directions even when the author omitted a comma', () => {
  const question = {
    type: 'stepAlgebra',
    prompt: 'Solve |d| > 3 then graph the complete solution set.',
  };
  assert.equal(extractPromptRelationSource(question), '|d| > 3');
});

test('does not reroute an ordinary prompt-only equation', () => {
  const question = { type: 'stepAlgebra', prompt: 'Solve 3x + 7 = 22.' };
  assert.equal(extractPromptRelationSource(question), '');
  assert.equal(withPromptRelationSource(question), question);
});

test('preserves an authored structured relation', () => {
  const question = {
    type: 'stepAlgebra',
    equation: '2x - 1 <= 9',
    prompt: 'Solve the inequality.',
  };
  assert.equal(withPromptRelationSource(question), question);
});

test('does not infer relation source for unrelated question types', () => {
  const question = { type: 'multiAnswer', prompt: 'Solve x > 4, then explain.' };
  assert.equal(extractPromptRelationSource(question), '');
});
