import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  runtimeIncludedQuestionIndices,
  runtimeIncludedQuestionIndicesForSection,
} = require('../../functions/lib/assignmentRuntime.js');

const assignment = {
  schemaVersion: 5,
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        { id: 'w1' },
        { id: 'w2', teacherExcluded: true },
      ],
    },
    {
      id: 'lesson',
      role: 'classwork',
      title: 'Classwork',
      questions: [{ id: 'c1' }, { id: 'c2', activityRole: 'practice' }],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{ id: 'p1' }],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [{ id: 'd1' }],
    },
  ],
};

test('whole publication keeps every included V5 runtime question', () => {
  assert.deepEqual(
    runtimeIncludedQuestionIndicesForSection(assignment, 'whole'),
    runtimeIncludedQuestionIndices(assignment)
  );
});

test('section publication selects only included questions with the matching effective activity role', () => {
  assert.deepEqual(runtimeIncludedQuestionIndicesForSection(assignment, 'warmup'), [0]);
  assert.deepEqual(runtimeIncludedQuestionIndicesForSection(assignment, 'classwork'), [2]);
  assert.deepEqual(runtimeIncludedQuestionIndicesForSection(assignment, 'practice'), [3, 4]);
  assert.deepEqual(runtimeIncludedQuestionIndicesForSection(assignment, 'dol'), [5]);
});

test('unknown publication sections return no grade-bearing questions', () => {
  assert.deepEqual(runtimeIncludedQuestionIndicesForSection(assignment, 'quiz'), []);
  assert.deepEqual(runtimeIncludedQuestionIndicesForSection(assignment, 'not-real'), []);
});
