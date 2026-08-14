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

export const BUCKET = Object.freeze({ DO_NOW: 'doNow', COMING_UP: 'comingUp', COMPLETED: 'completed' });

/**
 * Everything the dashboard needs, in one pass.
 *
 * The providers are the existing App-level helpers, passed in rather than
 * imported, because several of them close over Firestore-backed state.
 */
export const buildStudentDashboardModel = ({
  assignments = [],
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
    getIncludedQuestionIndices,
    normalizeQuestionRecord,
    questionIsIncluded,
    assignmentHasHeldTeacherFeedback,
    matchesSmartView,
  } = providers;

  const visible = list(assignments).filter((assignment) => assignmentIsForStudent(assignment, classPeriod));

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
    return assignment.questions?.some((question, index) => questionIsIncluded(question)
      && !['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status));
  });
  const resumeAssignment = savedResume || fallbackResume || null;

  const fallbackQuestionIndex = resumeAssignment?.questions?.findIndex((question, index) => questionIsIncluded(question)
    && !['correct', 'expired'].includes(normalizeQuestionRecord(tracker[resumeAssignment.id]?.[index]).status)) ?? -1;
  const savedResumeIncluded = savedResume ? getIncludedQuestionIndices(savedResume) : [];
  const requestedResumeIndex = Number(resumeAction?.questionIndex) || 0;
  const resumeQuestionIndex = savedResume
    ? (savedResumeIncluded.includes(requestedResumeIndex) ? requestedResumeIndex : (savedResumeIncluded[0] ?? 0))
    : Math.max(0, fallbackQuestionIndex);

  const activeDols = visible
    .map((assignment) => {
      const state = getDOLState({ assignment, schedule: classSchedule, classPeriod, nowValue });
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

  const isDone = (assignment, assignmentTracker, lifecycle) => {
    if (assignment.assignmentType === 'notesClasswork') {
      return classworkGradesByAssignment[assignment.id]?.score === 100 || lifecycle.isClosed;
    }
    const included = getIncludedQuestionIndices(assignment);
    const fullyTerminal = included.length > 0 && assignmentTracker
      && included.every((index) => ['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status));
    return fullyTerminal || lifecycle.isClosed;
  };

  const entries = visible
    .filter((assignment) => assignment.id !== resumeAssignment?.id && !activeDolIds.has(assignment.id))
    .map((assignment) => {
      const assignmentTracker = tracker[assignment.id];
      const isAttempted = Boolean(assignmentTracker);
      const lifecycle = getAssignmentLifecycle(assignment, nowValue);
      const access = prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue });
      const recordedGrade = calculateGrade(assignmentTracker, assignment);
      const activity = assignmentActivity[assignment.id] || {};
      const classwork = classworkGradesByAssignment[assignment.id];
      const dol = getDOLState({ assignment, schedule: classSchedule, classPeriod, nowValue });
      const disabled = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
      const done = isDone(assignment, assignmentTracker, lifecycle);
      const feedbackHeld = assignmentHasHeldTeacherFeedback(assignment);
      const dueSoon = matchesSmartView(assignment, 'today', { nowValue }) || lifecycle.isLate;
      const bucket = done
        ? BUCKET.COMPLETED
        : (!lifecycle.isScheduled && access.open && dueSoon) ? BUCKET.DO_NOW : BUCKET.COMING_UP;

      // "How much is left" was invisible until a student opened the
      // assignment, so a 1-question and a 12-question assignment looked
      // identical on the dashboard.
      const includedIndices = getIncludedQuestionIndices(assignment);
      const questionsTotal = includedIndices.length;
      const questionsDone = assignmentTracker
        ? includedIndices.filter((index) => ['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status)).length
        : 0;

      return {
        assignment, assignmentTracker, isAttempted, lifecycle, access, recordedGrade,
        activity, classwork, dol, disabled, feedbackHeld, bucket, questionsTotal, questionsDone,
      };
    });

  return {
    visibleAssignments: visible,
    resumeAssignment,
    resumeQuestionIndex,
    resumeLifecycle: getAssignmentLifecycle(resumeAssignment, nowValue),
    activeDols,
    entries,
    doNowEntries: entries.filter((entry) => entry.bucket === BUCKET.DO_NOW),
    comingUpEntries: entries.filter((entry) => entry.bucket === BUCKET.COMING_UP),
    completedEntries: entries.filter((entry) => entry.bucket === BUCKET.COMPLETED),
  };
};
