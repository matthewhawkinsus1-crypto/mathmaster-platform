import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareFiniteChoiceSet } from '../../src/platform/interaction/choiceOptions.js';

test('explicit Yes/No options remain exactly the authored binary set', () => {
  assert.deepEqual(
    prepareFiniteChoiceSet(['Yes', 'No'], { authored: true }),
    ['Yes', 'No'],
  );
});

test('explicit finite options are never expanded with platform distractors', () => {
  const options = ['discrete', 'continuous'];
  assert.deepEqual(prepareFiniteChoiceSet(options, { authored: true }), options);
});

test('platform-inferred binary choices may still receive misconception distractors', () => {
  assert.deepEqual(
    prepareFiniteChoiceSet(['yes', 'no']),
    ['yes', 'no', 'both yes and no', 'cannot be determined'],
  );
});
