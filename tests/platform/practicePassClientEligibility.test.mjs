import test from 'node:test';
import assert from 'node:assert/strict';
import {
  practicePassEligibleAssignments,
  practicePassLooksEligible,
} from '../../src/platform/rewards/practicePassClientEligibility.js';
import { normalizeQuestionRecord as clientNormalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { normalizeQuestionRecord as serverNormalizeQuestionRecord } from '../../functions/shared/attemptPolicy.mjs';

// This module is a UX-only filter for the wallet's assignment picker -- it
// never spends a point and never grants a waiver. The authoritative decision
// is functions/shared/classPointRewards.mjs, proven directly in
// tests/platform/classPointRewards.test.mjs. What matters here is only that
// the wallet does not dangle an assignment the server is certain to refuse.

const lesson = (overrides = {}) => ({
  id: 'a1',
  title: 'Solving Equations',
  assignedClassIds: ['class-a'],
  sections: [
    { role: 'classwork', questions: [{}] },
    { role: 'practice', questions: [{}, {}] },
  ],
  dueAt: '2026-09-20T23:59:00.000Z',
  lateDueAt: '2026-09-27T23:59:00.000Z',
  ...overrides,
});

test('an ordinary open lesson with a Practice section looks eligible', () => {
  assert.equal(practicePassLooksEligible({ assignment: lesson(), classId: 'class-a' }), true);
});

test('an assignment not assigned to the class never looks eligible', () => {
  assert.equal(practicePassLooksEligible({ assignment: lesson(), classId: 'class-b' }), false);
});

test('a quiz-shaped assignment is filtered out', () => {
  const assignment = lesson({ sections: [...lesson().sections, { role: 'quiz', questions: [{}] }] });
  assert.equal(practicePassLooksEligible({ assignment, classId: 'class-a' }), false);
});

test('an explicit true override still cannot make a quiz or test selectable', () => {
  const quiz = lesson({
    rewardPolicy: { practicePassEligible: true },
    sections: [...lesson().sections, { role: 'quiz', questions: [{}] }],
  });
  const testAssignment = lesson({
    rewardPolicy: { practicePassEligible: true },
    sections: [...lesson().sections, { role: 'test', questions: [{}] }],
  });
  assert.equal(practicePassLooksEligible({ assignment: quiz, classId: 'class-a' }), false);
  assert.equal(practicePassLooksEligible({ assignment: testAssignment, classId: 'class-a' }), false);
});

test('an assignment with no Practice section is filtered out', () => {
  const assignment = lesson({ sections: [{ role: 'classwork', questions: [{}] }] });
  assert.equal(practicePassLooksEligible({ assignment, classId: 'class-a' }), false);
});

test('a scheduled assignment is filtered out', () => {
  const assignment = lesson({ releaseAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(
    practicePassLooksEligible({ assignment, classId: 'class-a', nowValue: Date.now() }),
    false,
  );
});

test('an assignment already redeemed for this student is filtered out', () => {
  assert.equal(
    practicePassLooksEligible({ assignment: lesson(), classId: 'class-a', alreadyRedeemed: true }),
    false,
  );
});

test('a recorded Practice attempt filters the assignment out, but a fresh tracker does not', () => {
  const assignment = lesson();
  const attemptedTracker = { 1: { status: 'attempted', totalAttempts: 1 } };
  assert.equal(
    practicePassLooksEligible({ assignment, classId: 'class-a', assignmentTracker: attemptedTracker }),
    false,
  );
  assert.equal(
    practicePassLooksEligible({ assignment, classId: 'class-a', assignmentTracker: {} }),
    true,
  );
});

// --- Server/client credit-bearing-attempt parity (item 10) -----------------
// src/attemptPolicy.js is a straight re-export of
// functions/shared/attemptPolicy.mjs -- proving that here means a future
// accidental fork of one file cannot silently reintroduce a mismatch.

test('the client and server normalizeQuestionRecord are the exact same function', () => {
  assert.equal(clientNormalizeQuestionRecord, serverNormalizeQuestionRecord);
});

test('a mere draft (no totalAttempts, no canonical status) never blocks a redemption on either side', () => {
  const draftOnly = { draft: true };
  assert.equal(Number(clientNormalizeQuestionRecord(draftOnly).totalAttempts) > 0, false);
  assert.equal(
    practicePassLooksEligible({
      assignment: lesson(),
      classId: 'class-a',
      assignmentTracker: { 1: draftOnly },
    }),
    true,
  );
});

test('a canonical attempted response (totalAttempts > 0) blocks a redemption on both sides identically', () => {
  const attempted = { status: 'attempted', totalAttempts: 1 };
  assert.equal(Number(serverNormalizeQuestionRecord(attempted).totalAttempts) > 0, true);
  assert.equal(
    practicePassLooksEligible({
      assignment: lesson(),
      classId: 'class-a',
      assignmentTracker: { 1: attempted },
    }),
    false,
  );
});

test('practicePassEligibleAssignments returns a picklist shape sorted by due date', () => {
  const older = lesson({ id: 'a1', title: 'Older', dueAt: '2026-09-10T00:00:00.000Z', lateDueAt: '2026-09-17T00:00:00.000Z' });
  const newer = lesson({ id: 'a2', title: 'Newer', dueAt: '2026-09-20T00:00:00.000Z', lateDueAt: '2026-09-27T00:00:00.000Z' });
  const closed = lesson({ id: 'a3', title: 'Closed', lateDueAt: '2020-01-01T00:00:00.000Z', dueAt: '2019-12-31T00:00:00.000Z' });
  const list = practicePassEligibleAssignments({
    assignments: [older, newer, closed],
    classId: 'class-a',
    nowValue: Date.parse('2026-09-01T00:00:00.000Z'),
  });
  assert.deepEqual(list.map((entry) => entry.assignmentId), ['a2', 'a1']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['assignmentId', 'dueAt', 'title'].sort());
});
