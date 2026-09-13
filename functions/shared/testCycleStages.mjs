/*
 * ONE CARD, ONE STAGE. THE WHOLE STUDENT-FACING MODEL IS THIS FILE.
 *
 * A student never sees Review, Test, Corrections and Retest as four unrelated
 * assignments. They see one card, and the card shows the ONE stage they are
 * eligible to enter right now. That is not a styling decision — four cards is
 * how a student ends up taking a retest they were not eligible for, or doing
 * corrections for a test they passed.
 *
 * So this returns a single `stage`, and `resolveTestCycleStage` is the only
 * thing allowed to decide it. Every surface — the Assignments card, the
 * Assignment Result screen, the teacher gradebook's "current stage" column —
 * reads that one answer.
 *
 * THE GATES, IN ORDER, AND WHAT EACH ONE PROTECTS.
 *
 *   review          Review is required and unfinished. The Test is not merely
 *                   hidden, it is not enterable: the launch path checks the
 *                   same stage this returns.
 *   test            Secure. One attempt per item, no hints, no AI.
 *   awaitingRelease The student has submitted. There is no score to show yet,
 *                   and crucially NO SIGN that a retest exists — telling a
 *                   student "you'll get a retest" is telling them they failed,
 *                   before their teacher has released anything.
 *   passed          Released at or above passing. The cycle is done. Corrections
 *                   and Retest are not shown at all.
 *   corrections     Released below passing, corrections required, not complete.
 *                   Instructional. Hints allowed. Cannot change the grade.
 *   retestReady     Corrections complete or waived, or a teacher unlocked it.
 *   retest          Secure again, same runtime as the Test.
 *   retestSubmitted Retest submitted, retest feedback not released.
 *   complete        Everything released; recorded grade is final.
 *   retestClosed    A teacher disabled the retest for this student.
 *
 * Pure by construction: no Firestore, no network, no React.
 */

import { normalizeTeacherControls, normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { SESSION_STATE, normalizeTestCycleRecord, recordGradeState } from './testCycleRecord.mjs';

export const TEST_CYCLE_STAGE = Object.freeze({
  REVIEW: 'review',
  TEST: 'test',
  AWAITING_RELEASE: 'awaitingRelease',
  PASSED: 'passed',
  CORRECTIONS: 'corrections',
  RETEST_READY: 'retestReady',
  RETEST: 'retest',
  RETEST_SUBMITTED: 'retestSubmitted',
  COMPLETE: 'complete',
  RETEST_CLOSED: 'retestClosed',
});

/** The stages that run inside the secure exam runtime. Nothing else may. */
export const SECURE_STAGES = Object.freeze([TEST_CYCLE_STAGE.TEST, TEST_CYCLE_STAGE.RETEST]);

/** The stages that are instruction, where hints and rich tools are correct. */
export const INSTRUCTIONAL_STAGES = Object.freeze([TEST_CYCLE_STAGE.REVIEW, TEST_CYCLE_STAGE.CORRECTIONS]);

export const stageIsSecure = (stage) => SECURE_STAGES.includes(String(stage || ''));

const activeSession = (stage) => stage.state === SESSION_STATE.ASSIGNED || stage.state === SESSION_STATE.IN_PROGRESS;

/**
 * The one answer.
 *
 * `reviewProgress` is passed in rather than read, because review is ordinary
 * MathMaster instructional work tracked by the existing assignment tracker and
 * this module must not grow a second opinion about what "finished" means there.
 */
export const resolveTestCycleStage = ({
  policy = null,
  record = null,
  reviewProgress = null,
} = {}) => {
  const resolved = normalizeTestCyclePolicy(policy);
  if (!resolved) return null;
  const normalized = normalizeTestCycleRecord(record);
  const controls = normalizeTeacherControls(normalized.teacherControls);
  const grade = recordGradeState(normalized, resolved);

  const base = {
    policy: resolved,
    grade,
    teacherControls: controls,
    recordedGrade: grade.recordedGrade,
    // Stage-independent facts the card needs so it never has to re-derive them.
    testExamSessionId: normalized.test.examSessionId,
    retestExamSessionId: normalized.retest.examSessionId,
    correctionPlanId: normalized.corrections.planId,
  };

  const reviewRequired = resolved.review.required && normalized.review.required !== false;
  const reviewComplete = normalized.review.complete === true
    || (reviewProgress ? reviewProgress.complete === true : false)
    // A Test Cycle with no Review content cannot be gated on Review.
    || (reviewProgress ? Number(reviewProgress.total || 0) === 0 : false);

  if (reviewRequired && !reviewComplete) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.REVIEW,
      secure: false,
      hintsAllowed: true,
      canEnter: true,
      actionLabel: reviewProgress && Number(reviewProgress.attempted || 0) > 0 ? 'Continue Review' : 'Start Review',
      statusLabel: 'Review',
      detail: 'Finish the review to unlock your test. Hints and tools are available here.',
    };
  }

  if (normalized.test.state !== SESSION_STATE.SUBMITTED && normalized.test.state !== SESSION_STATE.RELEASED) {
    const assigned = activeSession(normalized.test);
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.TEST,
      secure: true,
      hintsAllowed: false,
      canEnter: assigned,
      actionLabel: normalized.test.state === SESSION_STATE.IN_PROGRESS ? 'Resume Test' : 'Start Test',
      statusLabel: 'Test',
      detail: assigned
        ? 'Secure test: one attempt per question, no hints or help, and your score is held until your teacher releases it.'
        : 'Your teacher has not opened the secure test session yet.',
    };
  }

  if (normalized.test.state === SESSION_STATE.SUBMITTED) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.AWAITING_RELEASE,
      secure: false,
      hintsAllowed: false,
      canEnter: false,
      actionLabel: 'Submitted',
      statusLabel: 'Test submitted',
      // Deliberately says nothing about corrections or a retest. A student who
      // has not been given a score has not been told they failed.
      detail: 'Your test is submitted. Your score and your next step appear once your teacher releases results.',
    };
  }

  const passed = grade.originalTestGrade !== null && grade.originalTestGrade >= resolved.passingScore;
  if (passed && !controls.retestAllowedAfterPass && !controls.retestUnlocked) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.PASSED,
      secure: false,
      hintsAllowed: false,
      canEnter: true,
      actionLabel: 'Review Test',
      statusLabel: 'Passed',
      detail: `Test complete · recorded grade ${grade.recordedGrade}%.`,
      complete: true,
    };
  }

  if (normalized.retest.state === SESSION_STATE.RELEASED) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.COMPLETE,
      secure: false,
      hintsAllowed: false,
      canEnter: true,
      actionLabel: 'Review Retest',
      statusLabel: 'Retest complete',
      detail: grade.reason,
      complete: true,
    };
  }

  if (normalized.retest.state === SESSION_STATE.SUBMITTED) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.RETEST_SUBMITTED,
      secure: false,
      hintsAllowed: false,
      canEnter: false,
      actionLabel: 'Submitted',
      statusLabel: 'Retest submitted',
      detail: 'Your retest is submitted. Your final recorded grade appears once your teacher releases retest results.',
    };
  }

  // A teacher closing the retest is an explicit decision and outranks the gate.
  if (controls.retestDisabled) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.RETEST_CLOSED,
      secure: false,
      hintsAllowed: false,
      canEnter: false,
      actionLabel: 'Retest closed',
      statusLabel: 'Retest closed',
      detail: `Your teacher has closed retesting for this assessment. Recorded grade ${grade.recordedGrade}%.`,
      complete: true,
    };
  }

  const correctionsRequired = normalized.corrections.required
    && resolved.corrections.requiredForRetest
    && controls.requireCorrections
    && !controls.correctionsWaived;
  const correctionsDone = normalized.corrections.complete === true || controls.correctionsWaived;

  if (correctionsRequired && !correctionsDone && !controls.retestUnlocked) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.CORRECTIONS,
      // Instruction. Hints, worked guidance and rich tools are correct here,
      // and the secure container is never launched for this stage.
      secure: false,
      hintsAllowed: true,
      canEnter: Boolean(normalized.corrections.planId),
      actionLabel: normalized.corrections.completedTargets > 0 ? 'Continue Corrections' : 'Start Corrections',
      statusLabel: 'Corrections',
      detail: `Your test was ${grade.originalTestGrade}%. Work through your corrections to unlock a retest. Corrections do not change your recorded grade.`,
      correctionsProgress: {
        total: normalized.corrections.total,
        complete: normalized.corrections.completedTargets,
      },
    };
  }

  if (normalized.retest.state === SESSION_STATE.IN_PROGRESS) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.RETEST,
      secure: true,
      hintsAllowed: false,
      canEnter: true,
      actionLabel: 'Resume Retest',
      statusLabel: 'Retest',
      detail: `Secure retest: one attempt per question, no hints. The highest grade retesting can record is ${resolved.retest.maxRecordedGrade}%.`,
    };
  }

  const retestAssigned = activeSession(normalized.retest);
  return {
    ...base,
    stage: retestAssigned ? TEST_CYCLE_STAGE.RETEST : TEST_CYCLE_STAGE.RETEST_READY,
    secure: true,
    hintsAllowed: false,
    canEnter: retestAssigned,
    actionLabel: retestAssigned ? 'Start Retest' : 'Retest pending',
    statusLabel: 'Retest',
    detail: retestAssigned
      ? `Secure retest: one attempt per question, no hints. The highest grade retesting can record is ${resolved.retest.maxRecordedGrade}%.`
      : 'Your retest is being prepared and will appear here when it opens.',
  };
};

/**
 * What a student is allowed to see on this card, as ids.
 *
 * The stage machine already returns one stage; this is the assertion form of
 * the same fact, so a test can prove Review/Test/Corrections/Retest are never
 * simultaneously offered rather than inspecting rendered markup for it.
 */
export const visibleStageIds = (state) => (state?.stage ? [state.stage] : []);

/** Does this stage launch the secure exam runtime? */
export const stageLaunchesSecureRuntime = (state) => Boolean(
  state && stageIsSecure(state.stage) && state.canEnter === true,
);
