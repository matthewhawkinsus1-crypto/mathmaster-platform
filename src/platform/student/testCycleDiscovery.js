import {
  isTestCycleAssignment,
  normalizeTestCyclePolicy,
  resolveAssessmentAvailability,
} from '../assessment/testCycle.js';
import { normalizeQuestionRecord } from '../../../functions/shared/attemptPolicy.mjs';

/*
 * WHERE IS THIS STUDENT IN THIS TEST CYCLE — AS A LIST CAN SAY IT.
 *
 * Home and the Assignments Center showed a Test Cycle like any lesson: a
 * "PRACTICE" chip, "Current grade · if stopped now" computed from the Review,
 * a Start button, and — once every Review item was correct — a move to the
 * collapsed "Finished" group while the secure Test was still waiting. A student
 * could not tell from the list that their Test had unlocked, that results were
 * released, or that corrections were now required.
 *
 * This reads two things the student's own device already holds, and nothing
 * else:
 *
 *   the PROJECTION   grades/{studentId}.testCycleGrades[assignmentId], written
 *                    only by the server: stage, session states, correction
 *                    progress, the recorded grade once released, and when the
 *                    stage last changed
 *   the TRACKER      the same canonical Review records the server gates the
 *                    Test on (answered = attempted, correctness irrelevant)
 *
 * It is a DESCRIPTION, never a gate: the card still asks the server which stage
 * is open, and the server still enforces it. Nothing here can reveal a score
 * the teacher has not released, because the projection carries none until then.
 */

export const TEST_CYCLE_DISCOVERY = Object.freeze({
  OPENS_LATER: 'opensLater',
  PAUSED: 'paused',
  REVIEW: 'review',
  TEST_PENDING: 'testPending',
  TEST_READY: 'testReady',
  TEST_IN_PROGRESS: 'testInProgress',
  AWAITING_RESULTS: 'awaitingResults',
  CORRECTIONS: 'corrections',
  RETEST_PREPARING: 'retestPreparing',
  RETEST_READY: 'retestReady',
  RETEST_IN_PROGRESS: 'retestInProgress',
  AWAITING_RETEST_RESULTS: 'awaitingRetestResults',
  COMPLETE: 'complete',
});

const clean = (value) => String(value ?? '').trim();

/** Review progress from the tracker, the way the server counts it. */
export const reviewProgressFromTracker = ({ questions = [], tracker = null } = {}) => {
  const indices = (Array.isArray(questions) ? questions : []).reduce((found, question, index) => {
    if (question?.teacherExcluded !== true && clean(question?.activityRole).toLowerCase() === 'review') found.push(index);
    return found;
  }, []);
  const attempted = indices.filter((index) => {
    const record = normalizeQuestionRecord(tracker?.[index]);
    if (record.status !== 'unattempted') return true;
    if (Number(record.totalAttempts || record.attemptCount || 0) > 0) return true;
    return Number(record.bestPartialCredit ?? record.partialCredit ?? 0) > 0;
  }).length;
  return { total: indices.length, attempted, complete: indices.length > 0 && attempted === indices.length };
};

const percent = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

export const describeTestCycleForStudent = ({
  assignment = null,
  projection = null,
  questions = [],
  tracker = null,
  nowValue = Date.now(),
} = {}) => {
  if (!isTestCycleAssignment(assignment)) return null;
  const policy = normalizeTestCyclePolicy(assignment.assessmentPolicy);
  const availability = resolveAssessmentAvailability({ assignment, now: nowValue });
  const review = reviewProgressFromTracker({ questions, tracker });
  const view = projection && typeof projection === 'object' ? projection : null;
  const stage = clean(view?.stage);
  const testState = clean(view?.testState) || 'none';
  const retestState = clean(view?.retestState) || 'none';
  const recorded = percent(view?.recordedGrade);
  const reviewRequired = policy ? policy.review.required : true;
  const reviewDone = !reviewRequired || review.total === 0 || review.complete || view?.reviewComplete === true
    || ['inProgress', 'submitted', 'released'].includes(testState);

  const result = (key, fields) => ({
    key,
    stage: stage || null,
    availability,
    review,
    recordedGrade: recorded,
    stageChangedAt: Number(view?.stageChangedAt) || null,
    tone: 'notStarted',
    actionRequired: false,
    done: false,
    started: true,
    waitingOnTeacher: false,
    ...fields,
  });

  if (!availability.open && availability.reason === 'scheduled') {
    return result(TEST_CYCLE_DISCOVERY.OPENS_LATER, {
      label: 'Opens later', detail: 'Review and Test open at the scheduled time.', tone: 'locked', started: false, actionLabel: 'Not open yet',
    });
  }
  if (!availability.open) {
    return result(TEST_CYCLE_DISCOVERY.PAUSED, {
      label: availability.reason === 'archived' ? 'Closed' : 'Paused', detail: availability.message, tone: 'locked', started: false, actionLabel: 'View',
    });
  }

  if (['passed', 'complete', 'retestClosed'].includes(stage)) {
    return result(TEST_CYCLE_DISCOVERY.COMPLETE, {
      label: recorded === null ? 'Complete' : `Complete · ${recorded}%`,
      detail: stage === 'retestClosed' ? 'Your teacher has closed retesting. Your recorded grade is final.' : 'Your recorded grade is final.',
      tone: 'complete', done: true, actionLabel: 'View results',
    });
  }
  if (stage === 'retestSubmitted' || retestState === 'submitted') {
    return result(TEST_CYCLE_DISCOVERY.AWAITING_RETEST_RESULTS, {
      label: 'Retest submitted', detail: 'Your final grade appears when your teacher releases retest results.',
      tone: 'pending', done: true, waitingOnTeacher: true, actionLabel: 'View',
    });
  }
  if (stage === 'retest' || retestState === 'assigned' || retestState === 'inProgress') {
    const resuming = retestState === 'inProgress';
    return result(resuming ? TEST_CYCLE_DISCOVERY.RETEST_IN_PROGRESS : TEST_CYCLE_DISCOVERY.RETEST_READY, {
      label: resuming ? 'Retest in progress' : 'Retest ready',
      detail: resuming ? 'Your answers are saved. Resume your retest.' : 'Your retest is unlocked.',
      tone: 'inProgress', actionRequired: true, actionLabel: resuming ? 'Resume Retest' : 'Start Retest',
    });
  }
  if (stage === 'retestReady') {
    return result(TEST_CYCLE_DISCOVERY.RETEST_PREPARING, {
      label: 'Retest being prepared', detail: 'It will appear here when it opens.', tone: 'pending', waitingOnTeacher: true, actionLabel: 'View',
    });
  }
  if (stage === 'corrections') {
    const total = Number(view?.correctionsTotal || 0);
    const doneCount = Number(view?.correctionsCompleted || 0);
    return result(TEST_CYCLE_DISCOVERY.CORRECTIONS, {
      label: total ? `Corrections · ${doneCount} of ${total}` : 'Corrections required',
      detail: 'Finish your corrections to unlock a retest.',
      tone: 'inProgress', actionRequired: true, actionLabel: doneCount > 0 ? 'Continue Corrections' : 'Start Corrections',
    });
  }
  if (stage === 'awaitingRelease' || testState === 'submitted') {
    return result(TEST_CYCLE_DISCOVERY.AWAITING_RESULTS, {
      // Deliberately says nothing about corrections or a retest: a student who
      // has not been given a score has not been told they failed.
      label: 'Test submitted', detail: 'Your score appears when your teacher releases results.',
      tone: 'pending', done: true, waitingOnTeacher: true, actionLabel: 'View',
    });
  }
  if (testState === 'inProgress') {
    return result(TEST_CYCLE_DISCOVERY.TEST_IN_PROGRESS, {
      label: 'Test in progress', detail: 'Your answers are saved. Resume your test.', tone: 'inProgress', actionRequired: true, actionLabel: 'Resume Test',
    });
  }
  if (reviewDone) {
    // The Test opens when the teacher has opened sessions (a projection
    // exists, so a record exists) — otherwise Review is done and the Test is
    // waiting on the teacher, which is a different thing to tell a student.
    return view && testState === 'assigned'
      ? result(TEST_CYCLE_DISCOVERY.TEST_READY, {
        label: 'Test ready', detail: 'Your Review is complete. Your secure test is unlocked.', tone: 'inProgress', actionRequired: true, actionLabel: 'Start Test',
      })
      : result(TEST_CYCLE_DISCOVERY.TEST_PENDING, {
        label: 'Review complete', detail: 'Your teacher has not opened the secure test yet.', tone: 'pending', waitingOnTeacher: true, actionLabel: 'View',
      });
  }
  return result(TEST_CYCLE_DISCOVERY.REVIEW, {
    label: review.total ? `Review · ${review.attempted} of ${review.total}` : 'Review',
    detail: 'Answer every Review question to unlock your test.',
    tone: review.attempted > 0 ? 'inProgress' : 'notStarted',
    started: review.attempted > 0,
    actionRequired: true,
    actionLabel: review.attempted > 0 ? 'Continue Review' : 'Start Review',
  });
};

/*
 * "NEW" WITHOUT A NOTIFICATION SYSTEM.
 *
 * The projection says when the stage last changed. The device remembers when
 * the student last opened this cycle's card. If the first is later, something
 * happened they have not seen — Test unlocked, results released, retest open —
 * and the list says so once. Per device, best effort: losing it only loses a
 * badge, never a state.
 */
const SEEN_PREFIX = 'mm-test-cycle-seen:';

export const markTestCycleSeen = (studentId, assignmentId, at = Date.now()) => {
  try { window.localStorage.setItem(`${SEEN_PREFIX}${studentId}:${assignmentId}`, String(at)); } catch { /* best effort */ }
};

export const testCycleHasUnseenChange = (studentId, assignmentId, stageChangedAt) => {
  if (!stageChangedAt) return false;
  try {
    const seen = Number(window.localStorage.getItem(`${SEEN_PREFIX}${studentId}:${assignmentId}`) || 0);
    return Number(stageChangedAt) > seen;
  } catch { return false; }
};
