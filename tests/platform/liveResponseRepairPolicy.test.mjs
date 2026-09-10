import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSafeResponseEntryRepair } from '../../functions/shared/liveResponseRepairPolicy.mjs';

test('shared safe-response policy accepts the same prose-to-choice conversion', () => {
  const before = {
    questionId: 'q1',
    type: 'multiAnswer',
    answerFields: [{ id: 'kind', label: 'Type', answer: 'interpolation', inputProfile: 'text' }],
  };
  const after = {
    questionId: 'q1',
    type: 'multiAnswer',
    answerFields: [{
      id: 'kind',
      label: 'Type',
      answer: 'interpolation',
      inputProfile: 'choice',
      type: 'choice',
      options: ['interpolation', 'extrapolation'],
    }],
  };
  const result = analyzeSafeResponseEntryRepair(before, after);
  assert.equal(result.safe, true);
  assert.deepEqual(result.affectedFieldIds, ['kind']);
});

test('shared safe-response policy rejects prompt changes', () => {
  const before = {
    questionId: 'q1',
    type: 'multiAnswer',
    prompt: 'Original',
    answerFields: [{ id: 'kind', answer: 'interpolation', inputProfile: 'text' }],
  };
  const after = {
    ...before,
    prompt: 'Changed',
    answerFields: [{
      id: 'kind',
      answer: 'interpolation',
      inputProfile: 'choice',
      type: 'choice',
      options: ['interpolation', 'extrapolation'],
    }],
  };
  assert.equal(analyzeSafeResponseEntryRepair(before, after).safe, false);
});
