import { createHash } from 'node:crypto';
import { SOURCE_TYPES } from './classPoints.mjs';

// Class Points Phase 5A: the first spendable reward. A Practice Pass lets a
// student EXCUSE the Practice section of one eligible assignment — it is a
// waiver, never academic credit. This file is the ONE authoritative place
// that decides:
//
//   is this student/assignment/moment eligible to redeem a Practice Pass?
//   what does the redemption record and its ledger spend look like?
//   which question indices does a granted waiver remove from the count?
//
// It deliberately does NOT decide what a student's grade or completion IS —
// that stays exactly where it already lived (calculateAssignmentGrade,
// assignmentGradeProgress here; splitGrade/gradeWeightTotals/
// splitGradesBySection in src/platform/teacher/gradeEvidence.js). A caller on
// either side computes its OWN current-content practice indices (server via
// functions/lib/assignmentRuntime.js, browser via
// src/platform/assignments/currentContentProjection.js — the same
// each-side-has-its-own-projection split functions/shared/
// assignmentProjections.mjs already uses for classwork) and asks this module
// either "are these eligible?" or "remove the waived ones from this set" —
// the RULE of what counts as waived is what must not differ, not the
// projection that feeds it.
//
// This module pulls in node:crypto for the deterministic redemption id, so —
// exactly like functions/shared/classPoints.mjs — it is server-only and is
// never bundled for the browser. Browser surfaces that need to *display*
// reward state (the wallet, the assignment result) read the redemption
// document a server callable already wrote, or receive a precomputed
// eligibility list from that same server data; they do not recompute this
// module's verdict from scratch.

export const PRACTICE_PASS_REWARD_CODE = 'practicePass';
export const PRACTICE_PASS_COST = 100;
export const PRACTICE_SECTION_ROLE = 'practice';
export const REWARD_REDEMPTION_SCHEMA_VERSION = 1;
export const REDEMPTION_STATUS = Object.freeze({ REDEEMED: 'redeemed' });

/** Ordinary, expected redemption refusals — never a bug, always a business rule. */
export const PRACTICE_PASS_INELIGIBLE_CODES = Object.freeze({
  NOT_ASSIGNED_TO_CLASS: 'not-assigned-to-class',
  REWARD_POLICY_DISABLED: 'reward-policy-disabled',
  NO_PRACTICE_SECTION: 'no-practice-section',
  QUIZ_ASSIGNMENT: 'quiz-assignment',
  TEST_ASSIGNMENT: 'test-assignment',
  TEST_CYCLE_ASSIGNMENT: 'test-cycle-assignment',
  ASSIGNMENT_SCHEDULED: 'assignment-scheduled',
  ASSIGNMENT_PRACTICE_MODE: 'assignment-practice-mode',
  ASSIGNMENT_NOT_CREDIT_ELIGIBLE: 'assignment-not-credit-eligible',
  ALREADY_ATTEMPTED: 'practice-already-attempted',
  ALREADY_REDEEMED: 'already-redeemed',
  INSUFFICIENT_BALANCE: 'insufficient-balance',
});

export class PracticePassInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PracticePassInputError';
  }
}

const reject = (message) => { throw new PracticePassInputError(message); };
const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * The `classPointRewardRedemptions` document id for one (student, class,
 * assignment, reward). Deterministic, exactly like
 * `classPoints.classPointIdempotencyKey` — a network retry, a double click, or
 * a browser retry after an uncertain response all resolve to this SAME
 * document, so the redemption callable can check existence instead of a
 * caller-supplied requestId. This is also the whole "one Practice Pass per
 * assignment" guarantee: a second attempt is not a new document, it is a
 * write to a document that already exists.
 */
export const practicePassRedemptionId = ({
  studentId, classId, assignmentId, rewardCode = PRACTICE_PASS_REWARD_CODE,
}) => createHash('sha256')
  .update(`${cleanText(studentId, 64)}\u0000${cleanText(classId, 120)}\u0000${cleanText(assignmentId, 200)}\u0000${cleanText(rewardCode, 40)}`)
  .digest('hex');

export const validateRedeemPracticePassInput = (input = {}) => {
  const assignmentId = cleanText(input.assignmentId, 200);
  if (!assignmentId) reject('An assignment is required.');
  return { assignmentId };
};

/*
 * ASSIGNMENT CREDIT LIFECYCLE, MIRRORED FROM src/assignmentLifecycle.js.
 *
 * getAssignmentLifecycle() cannot be imported here: Cloud Functions deploy
 * only functions/ (see AGENTS.md), so a server module can never depend on
 * src/. The status ladder itself is intentionally small and is restated here
 * rather than guessed at — same field names (dueAt/lateDueAt/releaseAt), same
 * three-way status, same isPracticeOnly/creditEligible/isScheduled meanings.
 * tests/platform/classPointRewards.test.mjs cross-checks this against the
 * browser implementation on a shared fixture matrix so the two cannot drift
 * silently.
 */
const toInstant = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const assignmentCreditLifecycle = (assignment = {}, nowValue = Date.now()) => {
  const now = Number(nowValue instanceof Date ? nowValue.getTime() : nowValue) || Date.now();
  const releaseAt = toInstant(assignment?.releaseAt || assignment?.releaseDate);
  const dueAt = toInstant(assignment?.dueAt || assignment?.dueDate);
  const lateDueAt = toInstant(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
  );

  let status = 'onTime';
  if (releaseAt && now < releaseAt) status = 'scheduled';
  else if (lateDueAt && now > lateDueAt) status = 'closed';
  else if (dueAt && now > dueAt) status = 'late';

  return {
    status,
    isScheduled: status === 'scheduled',
    isPracticeOnly: status === 'closed',
    creditEligible: status === 'onTime' || status === 'late',
  };
};

/** True when any authored section on this assignment is a Quiz or Test section role. */
export const assignmentHasAssessmentSection = (assignment = {}) => {
  const sections = Array.isArray(assignment?.sections) ? assignment.sections : [];
  return {
    hasQuiz: sections.some((section) => cleanText(section?.role, 40).toLowerCase() === 'quiz'),
    hasTest: sections.some((section) => cleanText(section?.role, 40).toLowerCase() === 'test'),
  };
};

/**
 * The teacher-authored override at `assignment.rewardPolicy.practicePassEligible`.
 * Returns `true`/`false` only for an explicit boolean; `null` means the
 * teacher said nothing and the default policy applies.
 */
export const practicePassPolicyOverride = (assignment = {}) => {
  const value = assignment?.rewardPolicy?.practicePassEligible;
  return typeof value === 'boolean' ? value : null;
};

/**
 * Remove waived indices from an included-question index set. One line, but
 * every consumer (server Classroom passback, browser grade split, browser
 * section-progress/completion) calls this SAME function rather than writing
 * its own `.filter(...)`, so "what counts as waived" cannot drift between
 * them even though each side still supplies its own index arrays.
 */
export const excludeWaivedIndices = (indices = [], waivedIndices = []) => {
  if (!Array.isArray(waivedIndices) || !waivedIndices.length) return Array.isArray(indices) ? indices : [];
  const waived = new Set(waivedIndices.map(Number));
  return (Array.isArray(indices) ? indices : []).filter((index) => !waived.has(Number(index)));
};

/**
 * All Practice indices a granted Practice Pass waives. Empty when there is no
 * redemption — the caller decides that from its own authoritative read of
 * `classPointRewardRedemptions`, this function only decides WHICH indices a
 * granted waiver covers once one exists.
 */
export const waivedPracticeIndices = ({ hasRedemption = false, practiceIndices = [] } = {}) => (
  hasRedemption ? (Array.isArray(practiceIndices) ? practiceIndices : []) : []
);

/**
 * The full server-side eligibility decision (Practice Pass rules 4-13, 15,
 * 16). Rules 1-3 (real authenticated student, canonical studentId, canonical
 * classId) and rule 14 (not already redeemed) are checked by the caller
 * BEFORE this runs — see functions/index.js `redeemPracticePass`, which
 * resolves identity from the verified token/grade record and treats an
 * existing redemption document as an idempotent replay rather than reaching
 * this function at all.
 *
 * `hasCreditBearingAttempt` must come from the AUTHORITATIVE canonical
 * tracker (grades/{studentId}.gradesByAssignment), never from the existence
 * of a local/in-progress draft — see functions/shared/attemptPolicy.mjs
 * `normalizeQuestionRecord(...).totalAttempts`.
 */
export const evaluatePracticePassEligibility = ({
  assignment = {},
  assignedToClass = false,
  isTestCycleAssignment = false,
  practiceIndices = [],
  hasCreditBearingAttempt = false,
  alreadyRedeemed = false,
  balance = 0,
  nowValue = Date.now(),
} = {}) => {
  const fail = (code, message) => ({ eligible: false, code, message });

  if (alreadyRedeemed) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.ALREADY_REDEEMED,
      'A Practice Pass has already been redeemed for this assignment.',
    );
  }
  if (!assignedToClass) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.NOT_ASSIGNED_TO_CLASS,
      'This assignment is not assigned to your class.',
    );
  }

  const override = practicePassPolicyOverride(assignment);
  if (override === false) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.REWARD_POLICY_DISABLED,
      'A Practice Pass cannot be used on this assignment.',
    );
  }

  const indices = Array.isArray(practiceIndices) ? practiceIndices : [];
  if (!indices.length) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.NO_PRACTICE_SECTION,
      'This assignment has no Practice section to excuse.',
    );
  }

  // Test Cycle is an absolute boundary: its secure runtime and grading are a
  // completely separate system, and no authoring override may reach past it.
  if (isTestCycleAssignment) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.TEST_CYCLE_ASSIGNMENT,
      'A Practice Pass cannot be used on a Test Cycle assessment.',
    );
  }

  // An explicit `true` override is a teacher deliberately widening eligibility
  // past the ordinary-lesson default — it still cannot reach past Test Cycle
  // (above) or past the lifecycle/attempt/balance safety rules (below).
  if (override !== true) {
    const { hasQuiz, hasTest } = assignmentHasAssessmentSection(assignment);
    if (hasQuiz) {
      return fail(PRACTICE_PASS_INELIGIBLE_CODES.QUIZ_ASSIGNMENT, 'A Practice Pass cannot be used on a quiz.');
    }
    if (hasTest) {
      return fail(PRACTICE_PASS_INELIGIBLE_CODES.TEST_ASSIGNMENT, 'A Practice Pass cannot be used on a test.');
    }
  }

  const lifecycle = assignmentCreditLifecycle(assignment, nowValue);
  if (lifecycle.isScheduled) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.ASSIGNMENT_SCHEDULED,
      'This assignment has not opened yet.',
    );
  }
  if (lifecycle.isPracticeOnly) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.ASSIGNMENT_PRACTICE_MODE,
      'This assignment is past its final deadline and open only for voluntary practice, which a Practice Pass cannot excuse.',
    );
  }
  if (!lifecycle.creditEligible) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.ASSIGNMENT_NOT_CREDIT_ELIGIBLE,
      'This assignment is not currently credit-eligible.',
    );
  }

  if (hasCreditBearingAttempt) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.ALREADY_ATTEMPTED,
      'A Practice response has already been recorded for this assignment, so a Practice Pass can no longer be used on it.',
    );
  }

  if (!(Number.isInteger(Number(balance)) && Number(balance) >= PRACTICE_PASS_COST)) {
    return fail(
      PRACTICE_PASS_INELIGIBLE_CODES.INSUFFICIENT_BALANCE,
      `You need ${Math.max(0, PRACTICE_PASS_COST - (Number(balance) || 0))} more Class Points.`,
    );
  }

  return { eligible: true, code: null, message: null };
};

/** A safe, short label for the redemption record and ledger entry — never the full authored content. */
export const safeAssignmentTitle = (assignment = {}) => cleanText(assignment?.title, 140) || 'this assignment';

/** The Practice Pass spend, as a Class Points ledger transaction. Built the same shape buildAwardTransaction produces, but a real spend. */
export const buildPracticePassLedgerTransaction = ({
  studentId,
  classId,
  assignmentId,
  assignmentTitle,
  redemptionId,
  requestId,
  issuedByUid,
  issuedByEmail,
  originTeacherEmail,
  authorizedTeacherEmails,
  at,
}) => ({
  schemaVersion: REWARD_REDEMPTION_SCHEMA_VERSION,
  studentId,
  classId,
  amount: -PRACTICE_PASS_COST,
  reasonCode: PRACTICE_PASS_REWARD_CODE,
  reasonLabel: `Practice Pass — ${assignmentTitle}`,
  sourceType: SOURCE_TYPES.REWARD_REDEMPTION,
  isReversal: false,
  reversalOf: null,
  issuedByUid: issuedByUid || null,
  issuedByEmail: issuedByEmail || null,
  requestId: requestId || redemptionId,
  originTeacherEmail,
  authorizedTeacherEmails,
  rewardCode: PRACTICE_PASS_REWARD_CODE,
  assignmentId,
  assignmentTitle,
  redemptionId,
  createdAt: at,
});

/** The `classPointRewardRedemptions` document a granted Practice Pass writes. It doubles as the authoritative Practice waiver projection every grading/completion consumer reads. */
export const buildPracticePassRedemption = ({
  redemptionId,
  studentId,
  classId,
  assignmentId,
  assignmentTitle,
  transactionId,
  at,
}) => ({
  schemaVersion: REWARD_REDEMPTION_SCHEMA_VERSION,
  redemptionId,
  rewardCode: PRACTICE_PASS_REWARD_CODE,
  studentId,
  classId,
  assignmentId,
  assignmentTitle,
  cost: PRACTICE_PASS_COST,
  transactionId,
  redeemedAt: at,
  status: REDEMPTION_STATUS.REDEEMED,
});
