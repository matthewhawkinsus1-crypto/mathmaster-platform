/*
 * THE REVIEW, AS A GRADE A TEACHER CAN USE.
 *
 * `reviewSummary` (functions/lib/testCycle.js) reads the ordinary assignment
 * tracker — the one place Review answers are saved, and the same record the
 * Test gate reads. These hold it to that: its "complete" is the gate's, its
 * credit is the gradebook's, other sections never leak in, and it changes
 * nothing it reads.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import testCycle from '../../functions/lib/testCycle.js';
import gradeRuntime from '../../functions/lib/classroomGradeRuntime.js';

const { reviewProgress, reviewSummary, REVIEW_SUMMARY_STATUS } = testCycle;

const assignment = {
  schemaVersion: 5,
  sections: [
    { id: 'review', role: 'review', questions: [{ questionId: 'r1' }, { questionId: 'r2', questionWeight: 3 }, { questionId: 'r3' }, { questionId: 'r4' }] },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'cw1' }] },
  ],
};

test('attempted/total, earned/possible points, percent, status and the last saved time', () => {
  const tracker = {
    0: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-08T14:00:00.000Z' },
    // The heavier question, half right.
    1: { status: 'attempted', totalAttempts: 2, bestPartialCredit: 50, lastAttemptAt: '2026-10-09T15:04:05.000Z' },
    2: { status: 'unattempted' },
    // The classwork question is not Review.
    4: { status: 'correct', totalAttempts: 1, lastAttemptAt: '2026-10-11T09:00:00.000Z' },
  };
  const frozen = JSON.stringify(tracker);
  const summary = reviewSummary(assignment, tracker);
  assert.deepEqual(summary, {
    total: 4,
    attempted: 2,
    correct: 1,
    earnedPoints: 2.5,   // 1 + (3 × 0.5)
    possiblePoints: 6,   // 1 + 3 + 1 + 1
    percent: 42,
    complete: false,
    status: REVIEW_SUMMARY_STATUS.IN_PROGRESS,
    lastSavedAt: Date.parse('2026-10-09T15:04:05.000Z'),
  });
  assert.equal(JSON.stringify(tracker), frozen, 'reading the summary changes nothing');
});

test('its "complete" is the Test gate\'s own answer, and its credit is the gradebook\'s', () => {
  const trackers = [
    {},
    { 0: { status: 'attempted', totalAttempts: 1 }, 1: { status: 'attempted', totalAttempts: 1 } },
    { 0: { status: 'attempted', totalAttempts: 1 }, 1: { status: 'correct' }, 2: { status: 'expired', attemptCount: 3 }, 3: { status: 'attempted', totalAttempts: 1, bestPartialCredit: 25 } },
    { 0: 'correct', 1: 'incorrect', 2: 'correct', 3: 'correct' },
  ];
  for (const tracker of trackers) {
    const summary = reviewSummary(assignment, tracker);
    const gate = reviewProgress(assignment, tracker);
    assert.deepEqual([summary.total, summary.attempted, summary.complete], [gate.total, gate.attempted, gate.complete]);
    // The same credit the gradebook gives each stored record, by weight.
    const weights = [1, 3, 1, 1];
    const expected = weights.reduce((sum, weight, index) => sum + weight * gradeRuntime.getQuestionCredit(tracker[index]), 0);
    assert.equal(summary.earnedPoints, Math.round(expected * 100) / 100);
  }
  assert.equal(reviewSummary(assignment, {}).status, REVIEW_SUMMARY_STATUS.NOT_STARTED);
  assert.deepEqual([reviewSummary(assignment, {}).percent, reviewSummary(assignment, {}).lastSavedAt], [0, null]);
  const finished = reviewSummary(assignment, trackers[3]);
  assert.deepEqual([finished.status, finished.complete, finished.percent], [REVIEW_SUMMARY_STATUS.COMPLETE, true, 50], 'finished is not the same as all right');
});

test('a mastery-gated Review reports its mastery, and a cycle with no Review says so', () => {
  const gated = { ...assignment, assessmentPolicy: { mode: 'testCycle', review: { minimumMastery: 80 } } };
  const tracker = Object.fromEntries([0, 1, 2, 3].map((index) => [index, { status: 'attempted', totalAttempts: 1, bestPartialCredit: 90, bestRawPartialCredit: 90 }]));
  const summary = reviewSummary(gated, tracker);
  assert.deepEqual([summary.mastery, summary.minimumMastery, summary.complete, summary.status], [90, 80, true, REVIEW_SUMMARY_STATUS.COMPLETE]);
  const none = reviewSummary({ schemaVersion: 5, sections: [{ id: 'classwork', role: 'classwork', questions: [{ questionId: 'cw1' }] }] }, { 0: { status: 'correct' } });
  assert.deepEqual([none.total, none.possiblePoints, none.percent, none.status], [0, 0, null, REVIEW_SUMMARY_STATUS.NO_REVIEW]);
});

test('the last saved time is read from whatever form the record stored it in', () => {
  const read = (record) => reviewSummary(assignment, { 0: record }).lastSavedAt;
  assert.equal(read({ status: 'correct', lastAttemptAt: 1760000000000 }), 1760000000000);
  assert.equal(read({ status: 'correct', lastAttemptAt: { toMillis: () => 42 } }), 42);
  assert.equal(read({ status: 'correct', updatedAt: '2026-10-09T15:04:05.000Z', lastAttemptAt: '2026-10-08T15:04:05.000Z' }), Date.parse('2026-10-09T15:04:05.000Z'));
  assert.equal(read({ status: 'correct', lastAttemptAt: 'not a date' }), null);
  assert.equal(read('correct'), null, 'a legacy string record has no time, and none is invented');
});
