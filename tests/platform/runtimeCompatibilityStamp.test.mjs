import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalV5PersistencePatch,
  storedAssignmentToV5,
} from '../../src/platform/contract/storedAssignmentV5.js';

const stored = () => ({
  id: 'assignment-1',
  schemaVersion: 5,
  title: 'Runtime stamp fixture',
  courseId: 'algebra1',
  runtimeCompatibility: {
    repairVersion: 1,
    repairedAt: '2026-09-09T20:00:00.000Z',
    repairKeys: ['function-modeling-exact-ask-no-synthetic-graph-v1'],
  },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{
      questionId: 'q1',
      type: 'multiAnswer',
      prompt: 'Solve x + 2 = 5.',
      studentActions: ['multipleResponses'],
      answerFields: [{ id: 'x', label: 'x', answer: '3' }],
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
    }],
  }],
});

test('same-record reconstruction preserves a valid compatibility stamp', () => {
  const v5 = storedAssignmentToV5(stored(), { resetAssignmentKey: false });
  assert.equal(v5.runtimeCompatibility.repairVersion, 1);
  assert.equal(v5.runtimeCompatibility.repairKeys.length, 1);
  assert.deepEqual(canonicalV5PersistencePatch(v5).runtimeCompatibility, v5.runtimeCompatibility);
});

test('portable duplication clears an old compatibility stamp', () => {
  const v5 = storedAssignmentToV5(stored(), { resetAssignmentKey: true });
  assert.equal(v5.runtimeCompatibility, undefined);
});

test('malformed compatibility state is treated as absent instead of trusted', () => {
  const record = stored();
  record.runtimeCompatibility = { repairVersion: 'banana', repairKeys: 'all of them' };
  const v5 = storedAssignmentToV5(record, { resetAssignmentKey: false });
  assert.equal(v5.runtimeCompatibility, undefined);
  assert.equal(canonicalV5PersistencePatch(v5).runtimeCompatibility, undefined);
});
