import test from 'node:test';
import assert from 'node:assert/strict';

import testCycle from '../../functions/lib/testCycle.js';

const { reviewProgress } = testCycle;

const assignment = {
  schemaVersion: 5,
  sections: [
    {
      id: 'review',
      role: 'review',
      questions: [
        { questionId: 'r1' },
        { questionId: 'r2' },
        { questionId: 'r3' },
      ],
    },
    {
      id: 'classwork',
      role: 'classwork',
      questions: [{ questionId: 'cw1' }],
    },
  ],
};

test('Review is not complete until every Review question has been attempted', () => {
  assert.deepEqual(
    reviewProgress(assignment, {
      0: { status: 'attempted', totalAttempts: 1 },
      1: { status: 'correct', totalAttempts: 1 },
      2: { status: 'unattempted', totalAttempts: 0 },
    }),
    { total: 3, attempted: 2, complete: false },
  );
});

test('Review completion does not require correct answers or a perfect score', () => {
  assert.deepEqual(
    reviewProgress(assignment, {
      0: { status: 'attempted', totalAttempts: 1, bestPartialCredit: 0 },
      1: { status: 'attempted', totalAttempts: 1, bestPartialCredit: 40 },
      2: { status: 'attempted', totalAttempts: 1, bestPartialCredit: 0 },
      3: { status: 'correct', totalAttempts: 1 },
    }),
    { total: 3, attempted: 3, complete: true },
  );
});

test('Review completion ignores non-Review questions and needs no final Submit action', () => {
  const progress = reviewProgress(assignment, {
    0: { status: 'correct', totalAttempts: 1 },
    1: { status: 'expired', totalAttempts: 3 },
    2: { status: 'attempted', totalAttempts: 1 },
  });
  assert.equal(progress.complete, true);
  assert.equal(progress.attempted, 3);
  assert.equal(progress.total, 3);
});

test('A Test Cycle with no Review content reports zero Review questions', () => {
  const noReview = {
    schemaVersion: 5,
    sections: [{ id: 'classwork', role: 'classwork', questions: [{ questionId: 'cw' }] }],
  };
  assert.deepEqual(reviewProgress(noReview, {}), { total: 0, attempted: 0, complete: false });
});
