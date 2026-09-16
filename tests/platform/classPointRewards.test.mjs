import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTransaction, emptyAccount, SOURCE_TYPES } from '../../functions/shared/classPoints.mjs';
import {
  PRACTICE_PASS_COST,
  PRACTICE_PASS_REWARD_CODE,
  PRACTICE_PASS_INELIGIBLE_CODES,
  assignmentCreditLifecycle,
  assignmentHasAssessmentSection,
  buildPracticePassLedgerTransaction,
  buildPracticePassRedemption,
  evaluatePracticePassEligibility,
  excludeWaivedIndices,
  practicePassPolicyOverride,
  practicePassRedemptionId,
  validateRedeemPracticePassInput,
  waivedPracticeIndices,
} from '../../functions/shared/classPointRewards.mjs';

// The Practice Pass domain rules, proven directly — no callable, no
// emulator — exactly the way tests/platform/classPoints.test.mjs proves the
// award/reversal ledger rules. The callable itself (functions/index.js
// `redeemPracticePass`) is a thin transaction shell around this module; what
// belongs here is "is this eligible, and what does a grant look like",
// because that is the ONE place both the server callable and (indirectly,
// through the redemption document it writes) every display surface must
// agree.

const ordinaryLesson = (overrides = {}) => ({
  title: 'Solving Multi-Step Equations',
  sections: [
    { role: 'warmup', questions: [{}] },
    { role: 'classwork', questions: [{}, {}] },
    { role: 'practice', questions: [{}, {}, {}] },
    { role: 'dol', questions: [{}] },
  ],
  dueAt: '2026-09-20T23:59:00.000Z',
  lateDueAt: '2026-09-27T23:59:00.000Z',
  ...overrides,
});

const baseArgs = (overrides = {}) => ({
  assignment: ordinaryLesson(),
  assignedToClass: true,
  isTestCycleAssignment: false,
  practiceIndices: [2, 3, 4],
  hasCreditBearingAttempt: false,
  alreadyRedeemed: false,
  balance: PRACTICE_PASS_COST,
  nowValue: new Date('2026-09-16T12:00:00.000Z').getTime(),
  ...overrides,
});

test('the cost is exactly 100', () => {
  assert.equal(PRACTICE_PASS_COST, 100);
});

test('an eligible request with exactly 100 points is granted', () => {
  const decision = evaluatePracticePassEligibility(baseArgs());
  assert.deepEqual(decision, { eligible: true, code: null, message: null });
});

test('99 points is rejected as insufficient balance', () => {
  const decision = evaluatePracticePassEligibility(baseArgs({ balance: 99 }));
  assert.equal(decision.eligible, false);
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.INSUFFICIENT_BALANCE);
  assert.match(decision.message, /1 more Class Points/);
});

test('an assignment not assigned to the requesting class is rejected before any other rule', () => {
  const decision = evaluatePracticePassEligibility(baseArgs({ assignedToClass: false, balance: 0 }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.NOT_ASSIGNED_TO_CLASS);
});

test('a quiz section rejects the assignment', () => {
  const assignment = ordinaryLesson({ sections: [...ordinaryLesson().sections, { role: 'quiz', questions: [{}] }] });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.QUIZ_ASSIGNMENT);
});

test('a test section rejects the assignment', () => {
  const assignment = ordinaryLesson({ sections: [...ordinaryLesson().sections, { role: 'test', questions: [{}] }] });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.TEST_ASSIGNMENT);
});

test('a Test Cycle assessment is rejected even with an explicit reward policy override', () => {
  const assignment = ordinaryLesson({ rewardPolicy: { practicePassEligible: true } });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment, isTestCycleAssignment: true }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.TEST_CYCLE_ASSIGNMENT);
});

test('an assignment with no Practice section is rejected', () => {
  const assignment = ordinaryLesson({ sections: [{ role: 'classwork', questions: [{}] }] });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment, practiceIndices: [] }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.NO_PRACTICE_SECTION);
});

test('a scheduled/unreleased assignment is rejected', () => {
  const assignment = ordinaryLesson({ releaseAt: '2099-01-01T00:00:00.000Z' });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.ASSIGNMENT_SCHEDULED);
});

test('an assignment past its final deadline (voluntary Practice Mode) is rejected', () => {
  const assignment = ordinaryLesson({ lateDueAt: '2020-01-01T00:00:00.000Z', dueAt: '2019-12-31T00:00:00.000Z' });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.ASSIGNMENT_PRACTICE_MODE);
});

test('a late-but-still-open assignment remains eligible', () => {
  const assignment = ordinaryLesson({
    dueAt: '2020-01-01T00:00:00.000Z',
    lateDueAt: '2099-01-01T00:00:00.000Z',
  });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment }));
  assert.equal(decision.eligible, true);
});

test('explicit rewardPolicy.practicePassEligible=false is never eligible', () => {
  const assignment = ordinaryLesson({ rewardPolicy: { practicePassEligible: false } });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.REWARD_POLICY_DISABLED);
});

test('explicit rewardPolicy.practicePassEligible=true still enforces the safety rules', () => {
  const assignment = ordinaryLesson({ rewardPolicy: { practicePassEligible: true } });
  const decision = evaluatePracticePassEligibility(baseArgs({ assignment, balance: 0 }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.INSUFFICIENT_BALANCE);
});

test('an authoritative credit-bearing Practice attempt rejects redemption', () => {
  const decision = evaluatePracticePassEligibility(baseArgs({ hasCreditBearingAttempt: true }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.ALREADY_ATTEMPTED);
});

test('a Practice Pass already redeemed for this assignment is rejected', () => {
  const decision = evaluatePracticePassEligibility(baseArgs({ alreadyRedeemed: true, balance: 0 }));
  assert.equal(decision.code, PRACTICE_PASS_INELIGIBLE_CODES.ALREADY_REDEEMED);
});

test('assignmentCreditLifecycle mirrors the credit-eligible window: onTime, late, closed, scheduled', () => {
  const dueAt = '2026-09-20T00:00:00.000Z';
  const lateDueAt = '2026-09-27T00:00:00.000Z';
  const assignment = { dueAt, lateDueAt };
  assert.equal(assignmentCreditLifecycle(assignment, new Date('2026-09-10T00:00:00.000Z').getTime()).status, 'onTime');
  assert.equal(assignmentCreditLifecycle(assignment, new Date('2026-09-22T00:00:00.000Z').getTime()).status, 'late');
  assert.equal(assignmentCreditLifecycle(assignment, new Date('2026-09-30T00:00:00.000Z').getTime()).status, 'closed');
  assert.equal(
    assignmentCreditLifecycle({ ...assignment, releaseAt: '2099-01-01T00:00:00.000Z' }, Date.now()).status,
    'scheduled',
  );
  assert.equal(assignmentCreditLifecycle(assignment, new Date('2026-09-30T00:00:00.000Z').getTime()).isPracticeOnly, true);
  assert.equal(assignmentCreditLifecycle(assignment, new Date('2026-09-22T00:00:00.000Z').getTime()).creditEligible, true);
});

test('assignmentHasAssessmentSection reads real section roles, never a title', () => {
  const withQuizTitledPractice = ordinaryLesson({ title: 'Quiz Review Practice' });
  assert.deepEqual(assignmentHasAssessmentSection(withQuizTitledPractice), { hasQuiz: false, hasTest: false });
  const realQuiz = ordinaryLesson({ sections: [{ role: 'quiz', questions: [{}] }] });
  assert.equal(assignmentHasAssessmentSection(realQuiz).hasQuiz, true);
});

test('practicePassPolicyOverride reads only an explicit boolean', () => {
  assert.equal(practicePassPolicyOverride({}), null);
  assert.equal(practicePassPolicyOverride({ rewardPolicy: {} }), null);
  assert.equal(practicePassPolicyOverride({ rewardPolicy: { practicePassEligible: true } }), true);
  assert.equal(practicePassPolicyOverride({ rewardPolicy: { practicePassEligible: false } }), false);
});

// --- Waiver application to grading/completion -------------------------------

test('excludeWaivedIndices removes only the waived indices, in either order', () => {
  assert.deepEqual(excludeWaivedIndices([0, 1, 2, 3, 4], [2, 3]), [0, 1, 4]);
  assert.deepEqual(excludeWaivedIndices([0, 1, 2], []), [0, 1, 2]);
  assert.deepEqual(excludeWaivedIndices([], [1]), []);
});

test('waivedPracticeIndices is empty without a granted redemption, and the full Practice set with one', () => {
  assert.deepEqual(waivedPracticeIndices({ hasRedemption: false, practiceIndices: [2, 3, 4] }), []);
  assert.deepEqual(waivedPracticeIndices({ hasRedemption: true, practiceIndices: [2, 3, 4] }), [2, 3, 4]);
});

test('a granted waiver excludes Practice from a mixed denominator without touching other sections', () => {
  // Warm-Up 0-0, Classwork 1-2, Practice 2-4 (waived), DOL 5.
  const allIncluded = [0, 1, 2, 3, 4, 5];
  const practiceIndices = [2, 3, 4];
  const denominator = excludeWaivedIndices(allIncluded, waivedPracticeIndices({ hasRedemption: true, practiceIndices }));
  assert.deepEqual(denominator, [0, 1, 5]);
});

// --- Redemption identity, idempotency, ledger shape -------------------------

test('the redemption id is deterministic per student+class+assignment+reward, and distinct across each', () => {
  const base = { studentId: 's1', classId: 'c1', assignmentId: 'a1' };
  const first = practicePassRedemptionId(base);
  const retry = practicePassRedemptionId(base);
  assert.equal(first, retry);
  assert.notEqual(first, practicePassRedemptionId({ ...base, studentId: 's2' }));
  assert.notEqual(first, practicePassRedemptionId({ ...base, classId: 'c2' }));
  assert.notEqual(first, practicePassRedemptionId({ ...base, assignmentId: 'a2' }));
});

test('the ledger transaction is a real spend of exactly -100 under rewardRedemption, never a reversal', () => {
  const transaction = buildPracticePassLedgerTransaction({
    studentId: 's1',
    classId: 'c1',
    assignmentId: 'a1',
    assignmentTitle: 'Solving Multi-Step Equations',
    redemptionId: 'r1',
    issuedByUid: 'uid-1',
    issuedByEmail: null,
    originTeacherEmail: 'teacher@school.org',
    authorizedTeacherEmails: ['teacher@school.org'],
    at: '2026-09-16T12:00:00.000Z',
  });
  assert.equal(transaction.amount, -100);
  assert.equal(transaction.sourceType, SOURCE_TYPES.REWARD_REDEMPTION);
  assert.equal(transaction.sourceType, 'rewardRedemption');
  assert.equal(transaction.isReversal, false);
  assert.equal(transaction.rewardCode, PRACTICE_PASS_REWARD_CODE);
  assert.equal(transaction.assignmentId, 'a1');
  assert.match(transaction.reasonLabel, /Practice Pass/);
});

test('applying the redemption transaction to a 100-point account leaves balance 0 and lifetimeSpent +100', () => {
  const account = applyTransaction(
    { ...emptyAccount({ studentId: 's1', classId: 'c1' }), balance: 100, lifetimeEarned: 100 },
    buildPracticePassLedgerTransaction({
      studentId: 's1', classId: 'c1', assignmentId: 'a1', assignmentTitle: 'Lesson',
      redemptionId: 'r1', originTeacherEmail: null, authorizedTeacherEmails: [], at: '2026-09-16T12:00:00.000Z',
    }),
  );
  assert.equal(account.balance, 0);
  assert.equal(account.lifetimeSpent, 100);
  assert.equal(account.lifetimeEarned, 100);
});

test('a redemption record is the authoritative waiver projection, and carries no answer/response text', () => {
  const redemption = buildPracticePassRedemption({
    redemptionId: 'r1',
    studentId: 's1',
    classId: 'c1',
    assignmentId: 'a1',
    assignmentTitle: 'Lesson',
    transactionId: 't1',
    at: '2026-09-16T12:00:00.000Z',
  });
  assert.equal(redemption.rewardCode, PRACTICE_PASS_REWARD_CODE);
  assert.equal(redemption.cost, 100);
  assert.equal(redemption.status, 'redeemed');
  assert.deepEqual(Object.keys(redemption).sort(), [
    'assignmentId', 'assignmentTitle', 'classId', 'cost', 'redeemedAt', 'redemptionId',
    'rewardCode', 'schemaVersion', 'status', 'studentId', 'transactionId',
  ].sort());
});

test('validateRedeemPracticePassInput requires an assignmentId', () => {
  assert.throws(() => validateRedeemPracticePassInput({}), /assignment is required/);
  assert.deepEqual(validateRedeemPracticePassInput({ assignmentId: ' a1 ' }), { assignmentId: 'a1' });
});

// --- Cross-parity with the browser's own lifecycle implementation -----------
// src/assignmentLifecycle.js's getAssignmentLifecycle() cannot be imported
// here (functions/ cannot depend on src/), so the ladder above is a
// restatement. This proves the restatement agrees with it on a representative
// matrix, so the two cannot silently drift into different answers about
// whether an assignment is still credit-eligible.
test('assignmentCreditLifecycle agrees with src/assignmentLifecycle.js on a fixture matrix', async () => {
  const { getAssignmentLifecycle } = await import('../../src/assignmentLifecycle.js');
  const assignment = {
    dueAt: '2026-09-20T23:59:00.000Z',
    lateDueAt: '2026-09-27T23:59:00.000Z',
  };
  const moments = [
    '2026-09-10T12:00:00.000Z',
    '2026-09-21T12:00:00.000Z',
    '2026-09-28T12:00:00.000Z',
  ];
  moments.forEach((moment) => {
    const now = new Date(moment).getTime();
    const browser = getAssignmentLifecycle(assignment, now);
    const server = assignmentCreditLifecycle(assignment, now);
    assert.equal(server.status, browser.status, `status mismatch at ${moment}`);
    assert.equal(server.isPracticeOnly, browser.isPracticeOnly, `isPracticeOnly mismatch at ${moment}`);
    assert.equal(server.creditEligible, browser.creditEligible, `creditEligible mismatch at ${moment}`);
    assert.equal(server.isScheduled, browser.isScheduled, `isScheduled mismatch at ${moment}`);
  });
});
