import test from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_TYPES, applyTransaction, emptyAccount } from '../../functions/shared/classPoints.mjs';
import {
  PRACTICE_PASS_PAYMENT,
  buildPracticePassRefundTransaction,
  evaluatePracticePassEligibility,
  isActivePracticePassRedemption,
  practicePassRefundTransactionId,
  redemptionCycle,
} from '../../functions/shared/classPointRewards.mjs';
import { REWARD_DEFINITIONS, pickGrantToSpend } from '../../functions/shared/rewardGrants.mjs';
import { isActivePracticePassRedemption as clientIsActive } from '../../src/platform/classPointsClient.js';
import { PROGRESS_STATE, classGradeProgress, studentAssignmentProgress } from '../../src/platform/teacher/assignmentProgress.js';

/*
 * The rules a redeemed, refunded or undone Practice Pass must obey wherever
 * it is read: in the ledger, in eligibility, and in the teacher's grade views.
 */

const NOW = Date.parse('2026-10-01T15:00:00.000Z');
const DAY = 86_400_000;

const openAssignment = {
  id: 'a1',
  classIds: ['c1'],
  releaseAt: new Date(NOW - DAY).toISOString(),
  dueAt: new Date(NOW + DAY).toISOString(),
  sections: [{ role: 'classwork' }, { role: 'practice' }],
};

test('a pass the student holds needs no Class Points; buying one still does', () => {
  const base = { assignment: openAssignment, assignedToClass: true, practiceIndices: [1], balance: 0, nowValue: NOW };
  assert.equal(evaluatePracticePassEligibility({ ...base, paymentMethod: PRACTICE_PASS_PAYMENT.PASS }).eligible, true);
  const buying = evaluatePracticePassEligibility({ ...base, paymentMethod: PRACTICE_PASS_PAYMENT.CLASS_POINTS });
  assert.equal(buying.code, 'insufficient-balance');
  // Every other rule is the same rule for both payments.
  assert.equal(evaluatePracticePassEligibility({ ...base, paymentMethod: PRACTICE_PASS_PAYMENT.PASS, hasCreditBearingAttempt: true }).code, 'practice-already-attempted');
  assert.equal(evaluatePracticePassEligibility({ ...base, paymentMethod: PRACTICE_PASS_PAYMENT.PASS, assignedToClass: false }).code, 'not-assigned-to-class');
});

test('only a live redemption is a waiver, on the server and in the browser', () => {
  for (const isActive of [isActivePracticePassRedemption, clientIsActive]) {
    assert.equal(isActive({ status: 'redeemed' }), true);
    assert.equal(isActive({}), true, 'records written before a use could be undone are live');
    assert.equal(isActive({ status: 'reversed' }), false);
    assert.equal(isActive(null), false);
  }
});

test('a refund cancels the spend: the balance returns and lifetime totals stay honest', () => {
  let account = emptyAccount({ studentId: 's', classId: 'c' });
  account = applyTransaction(account, { amount: 120, sourceType: SOURCE_TYPES.TEACHER_AWARD });
  account = applyTransaction(account, { amount: -100, sourceType: SOURCE_TYPES.REWARD_REDEMPTION });
  assert.deepEqual([account.balance, account.lifetimeEarned, account.lifetimeSpent], [20, 120, 100]);
  const refund = buildPracticePassRefundTransaction({
    redemption: { studentId: 's', classId: 'c', cost: 100, assignmentId: 'a1', assignmentTitle: 'Lesson', redemptionId: 'r', transactionId: 'tx' },
    reason: 'Wrong lesson',
    at: '2026-10-01T00:00:00Z',
  });
  assert.equal(refund.amount, 100);
  assert.equal(refund.sourceType, SOURCE_TYPES.REWARD_REFUND);
  assert.equal(refund.reversalOf, 'tx');
  account = applyTransaction(account, refund);
  assert.deepEqual([account.balance, account.lifetimeEarned, account.lifetimeSpent], [120, 120, 0], 'a refund is not new earnings');
});

test('each undone use gets its own refund id, so a retried undo refunds once', () => {
  assert.equal(practicePassRefundTransactionId('r', redemptionCycle({})), 'rfd_r_0');
  assert.equal(practicePassRefundTransactionId('r', redemptionCycle({ previousRedemptions: [{}] })), 'rfd_r_1');
});

test('the soonest-expiring usable pass is spent first, and only passes are spent', () => {
  const pass = (grantId, expiresAt, status = 'available', rewardCode = 'practicePass') => ({ grantId, expiresAt, status, rewardCode, awardedAt: '2026-09-01T00:00:00Z' });
  const chosen = pickGrantToSpend([
    pass('never', null),
    pass('late', new Date(NOW + 20 * DAY).toISOString()),
    pass('soon', new Date(NOW + 2 * DAY).toISOString()),
    pass('gone', new Date(NOW - DAY).toISOString()),
    pass('used', new Date(NOW + DAY).toISOString(), 'redeemed'),
    pass('badge', new Date(NOW + DAY).toISOString(), 'available', 'badge'),
  ], 'practicePass', NOW);
  assert.equal(chosen.grantId, 'soon');
  assert.equal(pickGrantToSpend([], 'practicePass', NOW), null);
});

test('every reward explains itself to students and teachers, including its grade effect', () => {
  for (const definition of Object.values(REWARD_DEFINITIONS)) {
    assert.ok(definition.studentDescription, `${definition.rewardCode} has student copy`);
    assert.ok(definition.teacherDescription, `${definition.rewardCode} has teacher copy`);
    assert.doesNotMatch(definition.studentDescription, /grant|ledger|redemption|transaction/i, 'no machinery in student words');
  }
  assert.match(REWARD_DEFINITIONS.practicePass.gradeEffect, /excused, not scored/);
  assert.match(REWARD_DEFINITIONS.practicePass.gradeEffect, /never counted as a correct answer/);
});

/*
 * ASSIGNMENT INTEGRATION. A student who used a Practice Pass is excused from
 * Practice everywhere. The teacher's progress views were the one place that
 * still counted Practice: the same student read "complete, 100%" to
 * themselves and to Google Classroom, and "in progress, 50%" to the teacher.
 */
const gradeAssignment = {
  id: 'a1',
  sections: [
    { id: 'core', role: 'classwork', questions: [{ id: 'q1', activityRole: 'classwork' }] },
    { id: 'practice', role: 'practice', questions: [{ id: 'q2', activityRole: 'practice' }] },
  ],
};
const student = { id: 's1', gradesByAssignment: { a1: { 0: { status: 'correct', totalAttempts: 1, variantIndex: 0 } } } };

test("a Practice Pass makes the teacher's progress agree with the student's grade", () => {
  const without = studentAssignmentProgress({ student, assignment: gradeAssignment });
  assert.equal(without.state, PROGRESS_STATE.IN_PROGRESS);
  const excused = studentAssignmentProgress({ student, assignment: gradeAssignment, practicePassRedeemed: true });
  assert.equal(excused.state, PROGRESS_STATE.COMPLETE, 'excused Practice is not missing work');
  assert.equal(excused.score, 100, 'Practice is out of the denominator, not scored as 100 or 0');
  assert.equal(excused.practicePassExcused, true, 'the teacher can see why');

  const progress = classGradeProgress({
    assignment: gradeAssignment,
    roster: [student, { ...student, id: 's2' }],
    hasPracticePass: (row) => row.id === 's1',
  });
  assert.deepEqual(progress.complete.map((row) => row.id), ['s1']);
  assert.deepEqual(progress.inProgress.map((row) => row.id), ['s2'], 'only the student who used a pass is excused');
});
