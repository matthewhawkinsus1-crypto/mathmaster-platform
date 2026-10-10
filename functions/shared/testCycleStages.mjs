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
 *   test            Secure. No hints, no AI. Answers stay editable until the
 *                   student submits; graded once, on the server, at submit.
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
import { describeTestCycleGradePolicy } from './testCycleGrade.mjs';
import { SESSION_STATE, normalizeTestCycleRecord, recordGradeState } from './testCycleRecord.mjs';
import { ASSESSMENT_AVAILABILITY } from './assessmentAvailability.mjs';

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
    // The score policy in one sentence a student can read. Shown on the card
    // from the start, so "what can a retest do for me?" never needs asking.
    policySummary: describeTestCycleGradePolicy(resolved).studentSummary,
    passingScore: resolved.passingScore,
  };

  // The first MathMaster secure session is the retest of this external original.
  // Missing evidence and passing originals are ineligible even after a waiver.
  const external = Boolean(resolved.externalAssessment);
  if (external && (grade.originalTestGrade === null || grade.originalTestGrade >= resolved.passingScore)) {
    return { ...base, stage: TEST_CYCLE_STAGE.RETEST_CLOSED, secure: false, hintsAllowed: false, canEnter: false,
      actionLabel: 'Retest unavailable', statusLabel: 'Retest unavailable',
      detail: grade.originalTestGrade === null ? 'Your teacher must enter your original district score before retesting.'
        : `Retesting is available only for original scores below ${resolved.passingScore}%.` };
  }
  if (external && controls.retestDisabled) {
    return { ...base, stage: TEST_CYCLE_STAGE.RETEST_CLOSED, secure: false, hintsAllowed: false, canEnter: false,
      actionLabel: 'Retest closed', statusLabel: 'Retest closed', detail: 'Your teacher has closed this retest.' };
  }

  const reviewRequired = resolved.review.required && normalized.review.required !== false;
  /*
   * A STUDENT WHO HAS STARTED THE SECURE TEST IS PAST REVIEW BY CONSTRUCTION.
   *
   * Review completion lives in the ordinary assignment tracker, which only the
   * student's own card passes in. Every other reader — the teacher gradebook
   * most of all — resolves a stage without it, and used to get "Review" back
   * for a student who had finished the whole cycle, because an absent
   * `reviewProgress` read as an unfinished Review.
   *
   * The record itself already answers the question. The secure Test cannot be
   * entered until the Review gate opens (the server enforces that at entry), so
   * a Test that has been started, submitted or released is proof the gate was
   * passed. Reading it from the record makes the stage correct for every caller
   * instead of only the one holding a tracker.
   */
  const testMovedPastReview = [
    SESSION_STATE.IN_PROGRESS, SESSION_STATE.SUBMITTED, SESSION_STATE.RELEASED,
  ].includes(normalized.test.state);
  const reviewComplete = normalized.review.complete === true
    || controls.reviewWaived
    || testMovedPastReview
    || (reviewProgress ? reviewProgress.complete === true : false)
    // A Test Cycle with no Review content cannot be gated on Review.
    || (resolved.review.minimumMastery === undefined && reviewProgress ? Number(reviewProgress.total || 0) === 0 : false);

  if (reviewRequired && !reviewComplete) {
    return {
      ...base,
      stage: TEST_CYCLE_STAGE.REVIEW,
      secure: false,
      hintsAllowed: true,
      canEnter: true,
      actionLabel: reviewProgress && Number(reviewProgress.attempted || 0) > 0 ? 'Continue Review' : 'Start Review',
      statusLabel: 'Review',
      detail: resolved.review.minimumMastery !== undefined
        ? `Attempt every review task and earn at least ${resolved.review.minimumMastery}% to unlock your ${external ? 'retest' : 'test'}. Current review mastery: ${Math.floor(Number(reviewProgress?.mastery) || 0)}%. Hints and tools are available here.`
        : 'Finish the review to unlock your test. Hints and tools are available here.',
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
      actionLabel: normalized.test.state === SESSION_STATE.IN_PROGRESS ? `Resume ${external ? 'Retest' : 'Test'}` : `Start ${external ? 'Retest' : 'Test'}`,
      statusLabel: external ? 'Retest' : 'Test',
      detail: assigned
        ? 'Secure test: no hints or help. You can skip, flag and go back to any question until you submit, and your score is held until your teacher releases it.'
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
      statusLabel: external ? 'Retest submitted' : 'Test submitted',
      // Deliberately says nothing about corrections or a retest. A student who
      // has not been given a score has not been told they failed.
      detail: 'Your test is submitted. Your score and your next step appear once your teacher releases results.',
    };
  }

  if (external) {
    return { ...base, stage: TEST_CYCLE_STAGE.COMPLETE, secure: false, hintsAllowed: false, canEnter: true,
      actionLabel: 'Review Retest', statusLabel: 'Retest complete', detail: grade.reason, complete: true };
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

  // A teacher closing the retest is an explicit decision and outranks the gate
  // — and a retest the student submitted after (or while) it was closed. Only
  // a RELEASED retest, which is itself a later teacher decision, outranks it.
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
      actionLabel: !normalized.corrections.planId
        ? 'Corrections being prepared'
        : normalized.corrections.completedTargets > 0 ? 'Continue Corrections' : 'Start Corrections',
      statusLabel: 'Corrections',
      // Why they are here (the score against passing), what to do, and what it
      // will and will not change — the three questions a student actually has.
      detail: normalized.corrections.planId
        ? `Your test was ${grade.originalTestGrade}% (passing is ${resolved.passingScore}%). Finish your corrections to unlock a retest. Corrections do not change your recorded grade.`
        : `Your test was ${grade.originalTestGrade}% (passing is ${resolved.passingScore}%). Your corrections are being prepared and will appear here.`,
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
      detail: `Secure retest: no hints. You can skip, flag and go back to any question until you submit. The highest grade retesting can record is ${resolved.retest.maxRecordedGrade}%.`,
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
      ? `Secure retest: no hints. You can skip, flag and go back to any question until you submit. The highest grade retesting can record is ${resolved.retest.maxRecordedGrade}%.`
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

/**
 * Question-free phase strip shared by student and teacher views.  It describes
 * the whole cycle while `resolveTestCycleStage` remains the sole authority for
 * the one action a student may take.  Consequently a locked client cannot turn
 * a phase to ready by editing this display model.
 */
export const buildTestCyclePhaseStatus = ({ state = null, record = null } = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  const current = state?.stage || null;
  if (state?.policy?.externalAssessment) {
    const finished = [SESSION_STATE.SUBMITTED, SESSION_STATE.RELEASED].includes(normalized.test.state);
    return [
      { id: 'review', label: 'Review', status: normalized.review.complete || normalized.test.state === SESSION_STATE.IN_PROGRESS || finished ? 'completed' : current === TEST_CYCLE_STAGE.REVIEW ? 'available' : 'locked' },
      { id: 'test', label: 'Retest', secure: true, status: finished ? 'completed' : current === TEST_CYCLE_STAGE.TEST && state.canEnter ? 'ready' : 'locked',
        reason: current === TEST_CYCLE_STAGE.REVIEW ? state.detail : !state?.canEnter && !finished ? state.detail : null },
    ];
  }
  const controls = normalizeTeacherControls(normalized.teacherControls);
  const reviewComplete = normalized.review.complete === true || current !== TEST_CYCLE_STAGE.REVIEW;
  const testComplete = [SESSION_STATE.SUBMITTED, SESSION_STATE.RELEASED].includes(normalized.test.state);
  const testInProgress = normalized.test.state === SESSION_STATE.IN_PROGRESS;
  const correctionsKnown = normalized.test.state === SESSION_STATE.RELEASED;
  const correctionsRequired = normalized.corrections.required === true;
  const correctionsComplete = normalized.corrections.complete === true || normalized.corrections.waived === true || controls.correctionsWaived;
  const retestStarted = normalized.retest.state !== SESSION_STATE.NONE;
  const retestComplete = normalized.retest.state === SESSION_STATE.RELEASED;
  const retestSubmitted = normalized.retest.state === SESSION_STATE.SUBMITTED;
  const passed = current === TEST_CYCLE_STAGE.PASSED;
  const correctionsTotal = normalized.corrections.total;
  const correctionsDone = normalized.corrections.completedTargets;

  // Every phase that is not available says why, in words a student can act on,
  // and none of them reveals a score before the teacher has released it.
  const testStatus = testComplete
    ? 'completed'
    : current === TEST_CYCLE_STAGE.TEST
      ? (state?.canEnter ? (testInProgress ? 'inProgress' : 'ready') : 'locked')
      : 'locked';
  const testReason = testComplete
    ? (normalized.test.state === SESSION_STATE.SUBMITTED ? 'Submitted. Your score appears when your teacher releases results.' : null)
    : !reviewComplete
      ? 'Complete Review to unlock Test.'
      : !state?.canEnter ? (state?.availabilityMessage || 'Your teacher is preparing the secure Test.') : null;

  let correctionsStatus = 'pending';
  let correctionsReason = 'Decided after your teacher releases your Test score.';
  if (correctionsKnown) {
    if (passed || !correctionsRequired) {
      correctionsStatus = 'notRequired';
      correctionsReason = passed ? null : 'Not required for you.';
    } else if (correctionsComplete) {
      correctionsStatus = 'completed';
      correctionsReason = null;
    } else {
      correctionsStatus = 'required';
      correctionsReason = correctionsTotal > 0
        ? `${correctionsDone} of ${correctionsTotal} skills corrected. Finish them to unlock your retest.`
        : 'Your corrections are being prepared.';
    }
  }

  let retestStatus;
  let retestReason = null;
  if (retestComplete) {
    retestStatus = 'completed';
  } else if (controls.retestDisabled && correctionsKnown && !passed) {
    retestStatus = 'closed';
    retestReason = 'Your teacher has closed retesting for this assessment.';
  } else if (retestSubmitted) {
    retestStatus = 'completed';
    retestReason = 'Submitted. Your final grade appears when your teacher releases retest results.';
  } else if (current === TEST_CYCLE_STAGE.RETEST && state?.canEnter) {
    retestStatus = normalized.retest.state === SESSION_STATE.IN_PROGRESS ? 'inProgress' : 'ready';
  } else if (retestStarted) {
    retestStatus = 'locked';
    retestReason = state?.availabilityMessage || null;
  } else if (correctionsKnown && (passed || !correctionsRequired) && current !== TEST_CYCLE_STAGE.RETEST_READY) {
    retestStatus = 'notRequired';
  } else {
    retestStatus = 'pending';
    retestReason = correctionsKnown
      ? (correctionsRequired && !correctionsComplete ? 'Unlocks when your corrections are complete.' : 'Your retest is being prepared.')
      : null;
  }

  return [
    { id: 'review', label: 'Review', status: reviewComplete ? 'completed' : (current === TEST_CYCLE_STAGE.REVIEW ? 'available' : 'locked') },
    { id: 'test', label: 'Test', secure: true, status: testStatus, reason: testReason },
    { id: 'corrections', label: 'Corrections', status: correctionsStatus, reason: correctionsReason },
    { id: 'retest', label: 'Retest', secure: true, status: retestStatus, reason: retestReason },
  ];
};

/*
 * THE ASSIGNMENT-LEVEL GATE, LAID OVER THE ONE STAGE.
 *
 * `resolveAssessmentAvailability` answers "is this assessment open to students
 * at all?"; the stage machine answers "which part has this student earned?".
 * A closed assessment keeps its stage — a student whose Test is submitted is
 * still "submitted" after the teacher archives it — but nothing secure or
 * instructional can be ENTERED. Reviewing results already released stays
 * possible: it is a read of the student's own released work, not an attempt.
 */
const REVIEW_ONLY_STAGES = Object.freeze([TEST_CYCLE_STAGE.PASSED, TEST_CYCLE_STAGE.COMPLETE]);

export const applyAssessmentAvailability = (state, availability = null) => {
  if (!state || !availability || availability.open !== false) {
    return state ? { ...state, availability: availability || null } : state;
  }
  const reviewOnly = REVIEW_ONLY_STAGES.includes(state.stage);
  const label = availability.reason === ASSESSMENT_AVAILABILITY.SCHEDULED
    ? 'Opens later'
    : availability.reason === ASSESSMENT_AVAILABILITY.UNPUBLISHED
      ? 'Paused by teacher'
      : availability.reason === ASSESSMENT_AVAILABILITY.ARCHIVED ? 'Archived' : 'Unavailable';
  return {
    ...state,
    availability,
    availabilityMessage: availability.message,
    canEnter: reviewOnly ? state.canEnter : false,
    actionLabel: reviewOnly ? state.actionLabel : label,
    detail: reviewOnly ? state.detail : availability.message,
  };
};
