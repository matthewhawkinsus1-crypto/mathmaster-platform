import {
  getStoredAssignmentQuestions,
  getStoredAssignmentTypeProjection,
} from './platform/contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from './platform/policies/activityPolicies.js';

// What a student's assignment dashboard actually contains, computed once.
//
// This was inline in App.jsx, which meant the only way to see a student's
// dashboard was to be a student: the Teacher Path Simulator could not render
// it without copying the block, and a copied block drifts. Pulling the
// computation out makes the same dashboard reachable from live Firestore data
// and from a synthetic learner, with no second implementation to keep in step.
//
// Pure: providers are injected, the clock is a parameter, and nothing here
// reads Firestore or React.
//
// One distinction is load-bearing and must not be lost in the move:
// an ASSIGNMENT prerequisite (finish the notes before the practice opens) is
// not a mathematical SKILL prerequisite. A teacher-required practice can stay
// locked by classwork even when the student's own path considers that skill
// mathematically available. Both survive here — `access` is the assignment
// gate, and nothing in this file consults the path engine.

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * WHY THREE BUCKETS WAS NOT ENOUGH.
 *
 * The dashboard sorted everything into do-now / coming-up / completed, which
 * works for a student with four assignments and stops working at twenty. Two
 * distinctions were being lost inside "do now", and both change what a student
 * should actually do:
 *
 *   PAST_DUE  — late work is not the same as work due today. Burying an overdue
 *               assignment among today's is how it stays overdue.
 *   IN_PROGRESS — a half-finished assignment is cheaper to finish than a new one
 *               is to start, and a student who cannot see which ones are already
 *               open re-starts things instead.
 *
 * And one was being lost entirely: PRACTICE, work that is past its deadline but
 * still open to practise. Showing it beside graded work makes a student think
 * they are late for something that no longer carries a grade.
 *
 * The order below is the priority order. It is the order the buckets are
 * offered in and the order `nextAction` searches.
 */
export const BUCKET = Object.freeze({
  IN_PROGRESS: 'inProgress',
  PAST_DUE: 'pastDue',
  DO_NOW: 'doNow',
  COMING_UP: 'comingUp',
  PRACTICE: 'practice',
  COMPLETED: 'completed',
});

export const BUCKET_LABEL = Object.freeze({
  [BUCKET.IN_PROGRESS]: 'Keep going',
  [BUCKET.PAST_DUE]: 'Past due',
  [BUCKET.DO_NOW]: 'Due today',
  [BUCKET.COMING_UP]: 'Assigned — due later',
  [BUCKET.PRACTICE]: 'Practice available',
  [BUCKET.COMPLETED]: 'Finished',
});

/**
 * Which groups open by default.
 *
 * Progressive disclosure, and the rule is what a student needs to ACT on.
 * Finished work and optional practice stay collapsed. Teacher-assigned work
 * stays visible even when its due date is later, because "assigned" is the
 * classroom contract and students should not have to discover it in a drawer.
 */
export const BUCKET_OPEN_BY_DEFAULT = Object.freeze({
  [BUCKET.IN_PROGRESS]: true,
  [BUCKET.PAST_DUE]: true,
  [BUCKET.DO_NOW]: true,
  [BUCKET.COMING_UP]: true,
  [BUCKET.PRACTICE]: false,
  [BUCKET.COMPLETED]: false,
});

export const BUCKET_ORDER = Object.freeze([
  BUCKET.IN_PROGRESS, BUCKET.PAST_DUE, BUCKET.DO_NOW,
  BUCKET.COMING_UP, BUCKET.PRACTICE, BUCKET.COMPLETED,
]);

/**
 * Everything the dashboard needs, in one pass.
 *
 * The providers are the existing App-level helpers, passed in rather than
 * imported, because several of them close over Firestore-backed state.
 */
export const buildStudentDashboardModel = ({
  assignments = [],
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  tracker = {},
  assignmentActivity = {},
  classworkGradesByAssignment = {},
  classSchedule = null,
  resumeAction = null,
  providers = {},
} = {}) => {
  const {
    assignmentIsForStudent,
    getAssignmentLifecycle,
    prerequisiteAccess,
    calculateGrade,
    getDOLState,
    getWarmupState,
    getIncludedQuestionIndices,
    normalizeQuestionRecord,
    questionIsIncluded,
    assignmentHasHeldTeacherFeedback,
    matchesSmartView,
  } = providers;

  const visible = list(assignments).filter((assignment) => assignmentIsForStudent(assignment, { classId, classPeriod }));

  const canResume = (assignment) => {
    const lifecycle = getAssignmentLifecycle(assignment, nowValue);
    if (lifecycle.isPracticeOnly) return false;
    const access = prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue });
    return access.open && (!lifecycle.isScheduled || access.reason === 'prerequisiteMet');
  };

  const savedResume = visible.find((assignment) => assignment.id === resumeAction?.assignmentId && canResume(assignment));
  const fallbackResume = visible.find((assignment) => {
    if (!canResume(assignment)) return false;
    const assignmentTracker = tracker[assignment.id];
    if (!assignmentTracker) return false;
    return getStoredAssignmentQuestions(assignment).some((question, index) => questionIsIncluded(question)
      && !['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status));
  });
  const resumeAssignment = savedResume || fallbackResume || null;

  const fallbackQuestionIndex = getStoredAssignmentQuestions(resumeAssignment)
    .findIndex((question, index) => questionIsIncluded(question)
      && !['correct', 'expired'].includes(normalizeQuestionRecord(tracker[resumeAssignment?.id]?.[index]).status));
  const savedResumeIncluded = savedResume ? getIncludedQuestionIndices(savedResume) : [];
  const resumeIncluded = resumeAssignment ? getIncludedQuestionIndices(resumeAssignment) : [];
  const resumeTracker = resumeAssignment ? tracker?.[resumeAssignment.id] || {} : {};
  const resumeQuestionsAttempted = resumeIncluded.filter((index) => {
    const record = normalizeQuestionRecord(resumeTracker?.[index]);
    return Number(record.totalAttempts || record.attemptCount || 0) > 0
      || record.status !== 'unattempted';
  }).length;
  const resumeRecordedGrade = resumeAssignment ? calculateGrade(resumeTracker, resumeAssignment) : 0;
  const resumeFeedbackHeld = resumeAssignment ? assignmentHasHeldTeacherFeedback(resumeAssignment) : false;
  const requestedResumeIndex = Number(resumeAction?.questionIndex) || 0;
  const resumeQuestionIndex = savedResume
    ? (savedResumeIncluded.includes(requestedResumeIndex) ? requestedResumeIndex : (savedResumeIncluded[0] ?? 0))
    : Math.max(0, fallbackQuestionIndex);

  const activeDols = visible
    .map((assignment) => {
      const state = getDOLState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue });
      const records = (state.questionIndices || [state.questionIndex])
        .filter((index) => Number.isInteger(index) && index >= 0)
        .map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
      return {
        assignment,
        lifecycle: getAssignmentLifecycle(assignment, nowValue),
        state,
        records,
      };
    })
    .filter(({ state, lifecycle, records }) => lifecycle.isOpen && state.status === 'active' && records.some((record) => record.totalAttempts === 0));
  const activeDolIds = new Set(activeDols.map(({ assignment }) => assignment.id));

  const activeWarmups = typeof getWarmupState === 'function'
    ? visible
      .map((assignment) => {
        const state = getWarmupState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue });
        const questions = getStoredAssignmentQuestions(assignment);
        const questionIndices = questions.reduce((indices, question, index) => {
          if (
            questionIsIncluded(question)
            && resolveQuestionActivityRole({ question, assignment }) === 'warmup'
          ) indices.push(index);
          return indices;
        }, []);
        const records = questionIndices.map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
        return {
          assignment,
          lifecycle: getAssignmentLifecycle(assignment, nowValue),
          state,
          questionIndices,
          records,
        };
      })
      .filter(({ state, lifecycle, records }) => (
        lifecycle.isOpen
        && state.status === 'active'
        && records.some((record) => !['correct', 'expired'].includes(record.status))
      ))
    : [];
  const activeWarmupIds = new Set(activeWarmups.map(({ assignment }) => assignment.id));

  const isDone = (assignment, assignmentTracker, lifecycle) => {
    if (getStoredAssignmentTypeProjection(assignment) === 'notesClasswork') {
      return classworkGradesByAssignment[assignment.id]?.score === 100 || lifecycle.isClosed;
    }
    const included = getIncludedQuestionIndices(assignment);
    const fullyTerminal = included.length > 0 && assignmentTracker
      && included.every((index) => ['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status));
    return fullyTerminal || lifecycle.isClosed;
  };

  const entries = visible
    .filter((assignment) => (
      assignment.id !== resumeAssignment?.id
      && !activeDolIds.has(assignment.id)
      && !activeWarmupIds.has(assignment.id)
    ))
    .map((assignment) => {
      const assignmentTracker = tracker[assignment.id];
      const isAttempted = Boolean(assignmentTracker);
      const lifecycle = getAssignmentLifecycle(assignment, nowValue);
      const access = prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue });
      const recordedGrade = calculateGrade(assignmentTracker, assignment);
      const activity = assignmentActivity[assignment.id] || {};
      const classwork = classworkGradesByAssignment[assignment.id];
      const dol = getDOLState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue });
      const disabled = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
      const done = isDone(assignment, assignmentTracker, lifecycle);
      const feedbackHeld = assignmentHasHeldTeacherFeedback(assignment);
      const dueSoon = matchesSmartView(assignment, 'today', { nowValue });

      // "How much is left" was invisible until a student opened the
      // assignment, so a 1-question and a 12-question assignment looked
      // identical on the dashboard.
      const includedIndices = getIncludedQuestionIndices(assignment);
      const questionsTotal = includedIndices.length;
      const questionsDone = assignmentTracker
        ? includedIndices.filter((index) => ['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status)).length
        : 0;
      const questionsAttempted = assignmentTracker
        ? includedIndices.filter((index) => {
          const record = normalizeQuestionRecord(assignmentTracker[index]);
          return Number(record.totalAttempts || record.attemptCount || 0) > 0
            || record.status !== 'unattempted';
        }).length
        : 0;
      const started = questionsAttempted > 0 && questionsDone < questionsTotal;

      // Order matters and encodes the priority a student should read off the
      // screen. Finished first (nothing else applies to it), then practice-only
      // — which is past its deadline but no longer graded, and must not sit in
      // "past due" making a student anxious about a grade they cannot change.
      const bucket = done
        ? BUCKET.COMPLETED
        : lifecycle.isPracticeOnly
          ? BUCKET.PRACTICE
          : disabled
            ? BUCKET.COMING_UP
            : started
              ? BUCKET.IN_PROGRESS
              : lifecycle.isLate
                ? BUCKET.PAST_DUE
                : dueSoon
                  ? BUCKET.DO_NOW
                  : BUCKET.COMING_UP;

      return {
        started,
        assignment, assignmentTracker, isAttempted, lifecycle, access, recordedGrade,
        activity, classwork, dol, disabled, feedbackHeld, bucket, questionsTotal, questionsDone, questionsAttempted,
      };
    });

  return {
    visibleAssignments: visible,
    resumeAssignment,
    resumeQuestionIndex,
    resumeLifecycle: getAssignmentLifecycle(resumeAssignment, nowValue),
    resumeRecordedGrade,
    resumeQuestionsAttempted,
    resumeFeedbackHeld,
    activeDols,
    activeWarmups,
    entries,
    doNowEntries: entries.filter((entry) => entry.bucket === BUCKET.DO_NOW),
    comingUpEntries: entries.filter((entry) => entry.bucket === BUCKET.COMING_UP),
    completedEntries: entries.filter((entry) => entry.bucket === BUCKET.COMPLETED),
    inProgressEntries: entries.filter((entry) => entry.bucket === BUCKET.IN_PROGRESS),
    pastDueEntries: entries.filter((entry) => entry.bucket === BUCKET.PAST_DUE),
    practiceEntries: entries.filter((entry) => entry.bucket === BUCKET.PRACTICE),
    // One list keyed by bucket, so a screen can render the groups by walking
    // BUCKET_ORDER instead of naming six props and forgetting the seventh.
    groups: Object.fromEntries(BUCKET_ORDER.map((bucket) => [
      bucket, entries.filter((entry) => entry.bucket === bucket),
    ])),
  };
};

/**
 * WHAT SHOULD I DO NOW? — one answer, not a dashboard.
 *
 * "Do not turn Home into a dashboard full of equally important boxes." A
 * student opening MathMaster has one question, and a screen that offers six
 * equally-weighted panels answers it by making them choose. This picks.
 *
 * The order is about consequence, not about recency:
 *
 *   1. A live DOL. It is timed and it closes. Nothing else can wait less.
 *   2. Unfinished work. Cheaper to finish than a new thing is to start, and the
 *      half-done state is itself a small cost the student is carrying.
 *   3. Past due. Still gradeable, and every day it stays here it gets worse.
 *   4. Due today.
 *   5. The weekly Path goal, if it is not met.
 *   6. Nothing pressing — which is a real answer, and is said as one rather
 *      than left as an empty screen.
 */
export const resolveNextAction = ({ dashboard, weeklyProgress = null } = {}) => {
  const first = (bucket) => (dashboard?.groups?.[bucket] || [])[0] || null;

  const activeDol = (dashboard?.activeDols || [])[0];
  if (activeDol) {
    return {
      kind: 'dol',
      assignment: activeDol.assignment,
      headline: 'Your exit ticket is open',
      detail: 'It is timed, so do this one first.',
      actionLabel: 'Start the exit ticket',
      urgency: 'now',
    };
  }

  const activeWarmup = (dashboard?.activeWarmups || [])[0];
  if (activeWarmup) {
    return {
      kind: 'warmup',
      assignment: activeWarmup.assignment,
      questionIndex: activeWarmup.questionIndices?.[0] ?? 0,
      headline: 'Warm-Up is open now',
      detail: 'Start with the Warm-Up while its class timer is running.',
      actionLabel: 'Start Warm-Up',
      urgency: 'now',
    };
  }

  if (dashboard?.resumeAssignment) {
    return {
      kind: 'resume',
      assignment: dashboard.resumeAssignment,
      questionIndex: dashboard.resumeQuestionIndex,
      headline: 'Pick up where you left off',
      detail: dashboard.resumeAssignment.title,
      actionLabel: 'Continue',
      urgency: 'now',
    };
  }

  const inProgress = first(BUCKET.IN_PROGRESS);
  if (inProgress) {
    return {
      kind: 'inProgress',
      assignment: inProgress.assignment,
      headline: 'Finish what you started',
      detail: `${inProgress.assignment.title} — ${inProgress.questionsDone} of ${inProgress.questionsTotal} done`,
      actionLabel: 'Continue',
      urgency: 'now',
    };
  }

  const pastDue = first(BUCKET.PAST_DUE);
  if (pastDue) {
    return {
      kind: 'pastDue',
      assignment: pastDue.assignment,
      headline: 'This one is past due',
      // Late, not lost. A student who believes it no longer counts stops.
      detail: `${pastDue.assignment.title} — late work is still open and still counts.`,
      actionLabel: 'Start it',
      urgency: 'late',
    };
  }

  const dueToday = first(BUCKET.DO_NOW);
  if (dueToday) {
    return {
      kind: 'dueToday',
      assignment: dueToday.assignment,
      headline: 'Due today',
      detail: dueToday.assignment.title,
      actionLabel: 'Start it',
      urgency: 'today',
    };
  }

  // Work that is assigned now does not become invisible just because its due
  // date is tomorrow (or next week). If it is open, it is a legitimate next
  // action and belongs ahead of independent Path work.
  const assignedLater = (dashboard?.groups?.[BUCKET.COMING_UP] || [])
    .find((entry) => !entry.disabled) || null;
  if (assignedLater) {
    return {
      kind: 'assignedLater',
      assignment: assignedLater.assignment,
      headline: 'Assigned work is ready',
      detail: assignedLater.assignment.title,
      actionLabel: assignedLater.isAttempted ? 'Continue' : 'Start assignment',
      urgency: 'thisWeek',
    };
  }

  if (weeklyProgress && weeklyProgress.remaining > 0) {
    return {
      kind: 'weeklyPath',
      headline: 'Your Math Path this week',
      detail: `${weeklyProgress.completed} of ${weeklyProgress.required} sessions done. ${weeklyProgress.remaining} to go.`,
      actionLabel: 'Open My Math Path',
      urgency: weeklyProgress.overdue ? 'late' : 'thisWeek',
    };
  }

  // A scheduled/locked assignment is still pending work even though the
  // student cannot start it yet. Never put a "caught up" celebration above it.
  const scheduledAssignment = first(BUCKET.COMING_UP);
  if (scheduledAssignment) {
    return {
      kind: 'assignedSoon',
      headline: 'You have assigned work coming up',
      detail: `${scheduledAssignment.assignment.title} is already assigned. Its due date and availability are shown below.`,
      actionLabel: null,
      urgency: 'thisWeek',
    };
  }

  // Unknown Path status is not the same thing as a completed Path goal. Home
  // must fail safe: until it can confirm the weekly commitment is complete, it
  // invites the student into Path instead of issuing a false congratulations.
  if (!weeklyProgress) {
    return {
      kind: 'weeklyPathStatus',
      headline: 'Check your Math Path',
      detail: 'Your weekly Path goal has not been confirmed complete yet.',
      actionLabel: 'Open My Math Path',
      urgency: 'thisWeek',
    };
  }

  return {
    kind: 'clear',
    headline: 'You are caught up',
    detail: 'All assigned class work is complete, and this week\'s Math Path goal is complete.',
    actionLabel: 'Open My Math Path',
    urgency: 'none',
  };
};
