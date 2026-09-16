import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classworkModel,
  classworkPositionForStorageIndex,
  describeClassworkPace,
} from '../../src/platform/teacher/classworkModel.js';

// Warm-Up (1) + Classwork (3) + Practice (2) + DOL (1), in storage order.
// Storage indices: 0=warmup, 1..3=classwork, 4..5=practice, 6=dol.
const assignment = ({ excludeStorageIndex = null } = {}) => ({
  id: 'a1',
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1', teacherExcluded: excludeStorageIndex === 0 }] },
    {
      id: 'classwork',
      role: 'classwork',
      questions: [
        { questionId: 'c1', teacherExcluded: excludeStorageIndex === 1 },
        { questionId: 'c2', teacherExcluded: excludeStorageIndex === 2 },
        { questionId: 'c3', teacherExcluded: excludeStorageIndex === 3 },
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      questions: [
        { questionId: 'p1', teacherExcluded: excludeStorageIndex === 4 },
        { questionId: 'p2', teacherExcluded: excludeStorageIndex === 5 },
      ],
    },
    { id: 'dol', role: 'dol', questions: [{ questionId: 'd1', teacherExcluded: excludeStorageIndex === 6 }] },
  ],
});

test('classworkModel extracts only Classwork questions, in storage order', () => {
  const model = classworkModel(assignment());
  assert.deepEqual(model.questions.map((entry) => entry.questionIndex), [1, 2, 3]);
  assert.deepEqual(model.questions.map((entry) => entry.question.questionId), ['c1', 'c2', 'c3']);
});

test('classworkModel progress positions are positions within the FULL included list, not the Classwork-only list', () => {
  const model = classworkModel(assignment());
  // Storage index 1 is the 2nd included question overall (after the Warm-Up
  // question at storage index 0), so its progress position is 1, not 0.
  assert.deepEqual(model.progressPositions, [1, 2, 3]);
});

test('an empty or missing assignment yields an empty model instead of throwing', () => {
  assert.deepEqual(classworkModel(null), { questions: [], progressPositions: [] });
  assert.deepEqual(classworkModel({}), { questions: [], progressPositions: [] });
});

test('classworkPositionForStorageIndex maps a Classwork storage index to its 0-based Classwork position', () => {
  assert.equal(classworkPositionForStorageIndex(assignment(), 1), 0);
  assert.equal(classworkPositionForStorageIndex(assignment(), 2), 1);
  assert.equal(classworkPositionForStorageIndex(assignment(), 3), 2);
});

test('classworkPositionForStorageIndex returns null for a storage index outside Classwork — the exact bug this seam prevents', () => {
  // Storage index 0 is Warm-Up, index 4 is Practice, index 6 is DOL. None of
  // these have a Classwork position; comparing them directly against a
  // Classwork-relative teacher pace number would be comparing two different
  // index systems.
  assert.equal(classworkPositionForStorageIndex(assignment(), 0), null);
  assert.equal(classworkPositionForStorageIndex(assignment(), 4), null);
  assert.equal(classworkPositionForStorageIndex(assignment(), 6), null);
});

test('an excluded Classwork question shifts storage indices but positions stay correct', () => {
  // Excluding storage index 1 (c1) removes it from Classwork entirely; the
  // remaining Classwork questions are still numbered 0, 1 in order.
  const excluded = assignment({ excludeStorageIndex: 1 });
  assert.equal(classworkPositionForStorageIndex(excluded, 2), 0);
  assert.equal(classworkPositionForStorageIndex(excluded, 3), 1);
  assert.equal(classworkPositionForStorageIndex(excluded, 1), null);
});

test('describeClassworkPace reports the human pace label', () => {
  assert.equal(
    describeClassworkPace({ assignment: assignment(), classworkQuestionPosition: 1 }),
    'Classwork Q2 of 3',
  );
});

test('describeClassworkPace distinguishes "not yet in Classwork" from "no Classwork in this lesson"', () => {
  assert.equal(
    describeClassworkPace({ assignment: assignment(), classworkQuestionPosition: null }),
    'Not yet in Classwork (3 questions)',
  );
  const noClasswork = { id: 'a2', schemaVersion: 5, sections: [{ id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1' }] }] };
  assert.equal(describeClassworkPace({ assignment: noClasswork, classworkQuestionPosition: null }), 'No Classwork questions in this lesson');
});
