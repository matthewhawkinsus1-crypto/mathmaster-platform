import {
  assignmentIsForStudent,
  getAssignmentLifecycle,
} from '../../assignmentLifecycle.js';
import {
  gradeWeightTotals,
  splitGrade,
  splitGradesBySection,
} from '../teacher/gradeEvidence.js';
import {
  buildTestCycleGradeState,
  isTestCycleAssignment,
} from '../assessment/testCycle.js';
import {
  groupAssignmentsByGradingPeriod,
  normalizeGradingPeriodSettings,
  resolveAssignmentGradingPeriod,
} from './gradingPeriods.js';

/*
 * THE STUDENT GRADE CENTER, AS A MODEL.
 *
 * A student has four questions and no screen that answers them:
 *
 *   What is my grade right now?
 *   What did I earn on each assignment, and on each part of it?
 *   What changed?
 *   What can I still do about it?
 *
 * Everything needed to answer them already exists — it was just never gathered
 * in one place a student could open. This module gathers it. It computes
 * NOTHING new about a grade.
 *
 *   the grade          splitGrade()           — the same number the teacher
 *                                               gradebook and Classroom
 *                                               passback read
 *   the section grades splitGradesBySection() — the same four numbers
 *   the points         gradeWeightTotals()    — the same question weights
 *   the deadlines      getAssignmentLifecycle()
 *   the evidence       grades/{studentId}.gradesByAssignment, via `tracker`
 *
 * There is no second grade store and no second copy of grade math here. If the
 * number on this screen ever disagrees with the teacher's, one of those
 * functions changed, not this one.
 *
 * WHAT THIS MODULE DELIBERATELY CANNOT SEE.
 *
 * It takes the canonical tracker and nothing else. Post-deadline practice runs
 * against a SEPARATE practice tracker held in App state, which is never passed
 * in and has no parameter here. That is the isolation, expressed as an absence:
 * a student can practise a closed assignment all afternoon and the Grade Center
 * cannot change, because the data that changed is not reachable from here.
 *
 * NO FAKE ZEROS.
 *
 * The hardest rule, and the one every gradebook gets wrong. Work that has not
 * been graded is not work that scored zero:
 *
 *   nothing attempted yet      -> Not Started. No number.
 *   overdue, nothing attempted -> Missing. Counted, named, still no number.
 *   attempted, feedback held   -> Pending Grade / Awaiting Teacher Release.
 *   past final close, never    -> Practice Only. The window is gone, no credit
 *   attempted                     is recoverable, and a permanent red zero a
 *                                 student can never clear would be a lie about
 *                                 what MathMaster recorded.
 *
 * None of those contribute a value to the period average. Within an assignment
 * that IS counted, an unanswered question is still worth zero — that is
 * existing MathMaster grading semantics and this module does not touch it.
 *
 * ROOM FOR GRADE HISTORY, WITHOUT BUILDING IT YET.
 *
 * Phase 1 has no trend chart, and adding one must not mean rewriting this. Each
 * entry already carries everything a snapshot would need — the assignment id,
 * the status, the earned/possible weight, and whether it counted — so a future
 * history writer can record `{ assignmentId, status, earnedWeight,
 * possibleWeight, countsTowardPeriodGrade }` at the moments that actually
 * change a student's grade (a grade first becoming visible, a teacher override,
 * missing -> completed, a retest, a period closing) and a trend view can read
 * those snapshots beside this model rather than instead of it.
 *
 * What must NOT happen is a snapshot per render or per autosave: this function
 * runs on every dashboard clock tick, and it deliberately returns a value and
 * writes nothing.
 */

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

export const GRADE_STATUS = Object.freeze({
  NOT_STARTED: 'notStarted',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  GRADED: 'graded',
  PENDING_GRADE: 'pendingGrade',
  MISSING: 'missing',
  LATE: 'late',
  EXCUSED: 'excused',
  REOPENED: 'reopened',
  PRACTICE_ONLY: 'practiceOnly',
  LOCKED: 'locked',
});

export const GRADE_STATUS_LABEL = Object.freeze({
  [GRADE_STATUS.NOT_STARTED]: 'Not Started',
  [GRADE_STATUS.IN_PROGRESS]: 'In Progress',
  [GRADE_STATUS.COMPLETED]: 'Completed',
  [GRADE_STATUS.GRADED]: 'Graded',
  [GRADE_STATUS.PENDING_GRADE]: 'Pending Grade',
  [GRADE_STATUS.MISSING]: 'Missing',
  [GRADE_STATUS.LATE]: 'Late',
  [GRADE_STATUS.EXCUSED]: 'Excused',
  [GRADE_STATUS.REOPENED]: 'Reopened',
  [GRADE_STATUS.PRACTICE_ONLY]: 'Practice Only',
  [GRADE_STATUS.LOCKED]: 'Not Open Yet',
});

// Why an assignment is not in the period average. Shown to the student, because
// "this one is not counted" without a reason reads as a mistake.
export const EXCLUSION_REASON = Object.freeze({
  NO_EVIDENCE: 'noEvidence',
  FEEDBACK_HELD: 'feedbackHeld',
  PRACTICE_ONLY: 'practiceOnly',
  EXCUSED: 'excused',
  NOT_GRADEABLE: 'notGradeable',
});

export const EXCLUSION_REASON_TEXT = Object.freeze({
  [EXCLUSION_REASON.NO_EVIDENCE]: 'Not counted yet — nothing has been recorded for this assignment.',
  [EXCLUSION_REASON.FEEDBACK_HELD]: 'Not counted yet — your teacher has not released this grade.',
  [EXCLUSION_REASON.PRACTICE_ONLY]: 'Not counted — this closed with no recorded work, so it is practice only now.',
  [EXCLUSION_REASON.EXCUSED]: 'Not counted — your teacher excused this assignment.',
  [EXCLUSION_REASON.NOT_GRADEABLE]: 'Not counted — this assignment has no gradeable questions.',
});

/*
 * EXCUSED AND REOPENED ARE READ, NEVER INFERRED.
 *
 * "Excused" changes what a grade means and "reopened" changes what a student is
 * allowed to do. Guessing either from dates or from an empty tracker would put
 * words in a teacher's mouth, so both are read only from explicit per-student
 * platform data. No such data means neither state, which is the truthful answer
 * until a teacher records one.
 */
const studentOverrideFor = (assignment, studentId) => {
  const id = clean(studentId);
  if (!id) return {};
  const overrides = assignment?.studentOverrides;
  return (overrides && typeof overrides === 'object' && overrides[id]) || {};
};

export const assignmentIsExcusedForStudent = (assignment, studentId) => {
  const id = clean(studentId);
  if (!id) return false;
  if (list(assignment?.excusedStudentIds).map(clean).includes(id)) return true;
  return studentOverrideFor(assignment, studentId).excused === true;
};

export const assignmentIsReopenedForStudent = (assignment, studentId) => {
  const id = clean(studentId);
  if (!id) return false;
  if (list(assignment?.reopenedStudentIds).map(clean).includes(id)) return true;
  return studentOverrideFor(assignment, studentId).reopened === true;
};

/**
 * One assignment's status, decided once so no component decides it again.
 *
 * The ladder is priority order, and every rung is a different thing a student
 * would do about it.
 */
export const resolveGradeStatus = ({
  overall,
  lifecycle,
  feedbackHeld = false,
  excused = false,
  reopened = false,
  locked = false,
} = {}) => {
  if (excused) return GRADE_STATUS.EXCUSED;

  const attempted = Number(overall?.attempted) || 0;
  const total = Number(overall?.total) || 0;
  const terminal = total > 0 && attempted === total;

  // Past the final grading cutoff with nothing recorded. Not "missing": there
  // is no longer any credit to recover, and marking it missing forever would be
  // a punishment the gradebook never actually applied.
  if (lifecycle?.isPracticeOnly && attempted === 0) return GRADE_STATUS.PRACTICE_ONLY;

  // A teacher holding feedback is the reason there is no number. It outranks
  // every "done" state precisely so the screen never fills the gap with 0%.
  if (feedbackHeld && attempted > 0) return GRADE_STATUS.PENDING_GRADE;

  if (lifecycle?.isPracticeOnly) return GRADE_STATUS.GRADED;
  if (reopened) return GRADE_STATUS.REOPENED;
  if (locked && attempted === 0) return GRADE_STATUS.LOCKED;
  if (terminal) return GRADE_STATUS.GRADED;
  if (attempted > 0) return lifecycle?.isLate ? GRADE_STATUS.LATE : GRADE_STATUS.IN_PROGRESS;
  if (lifecycle?.isLate) return GRADE_STATUS.MISSING;
  return GRADE_STATUS.NOT_STARTED;
};

/**
 * Does this assignment's grade belong in the period average, and if not, why?
 *
 * One function, one policy. Every count on the summary bar and every row badge
 * reads its answer from here.
 */
export const gradeCountsTowardPeriod = ({ status, overall, weights } = {}) => {
  if (status === GRADE_STATUS.EXCUSED) return { counts: false, reason: EXCLUSION_REASON.EXCUSED };
  if (status === GRADE_STATUS.PRACTICE_ONLY) return { counts: false, reason: EXCLUSION_REASON.PRACTICE_ONLY };
  if (status === GRADE_STATUS.PENDING_GRADE) return { counts: false, reason: EXCLUSION_REASON.FEEDBACK_HELD };
  if (!(Number(weights?.possibleWeight) > 0)) return { counts: false, reason: EXCLUSION_REASON.NOT_GRADEABLE };
  if (!(Number(overall?.attempted) > 0)) return { counts: false, reason: EXCLUSION_REASON.NO_EVIDENCE };
  return { counts: true, reason: null };
};

/**
 * The period grade: total points earned over total points possible.
 *
 * MathMaster already weights questions inside an assignment, and this is the
 * only aggregation policy that preserves those weights without inventing a
 * second one — a twelve-question investigation carries twelve questions' worth
 * of weight, exactly as it does inside its own grade. Averaging the rounded
 * percentages instead would make a one-question warm-up worth as much, which is
 * a weighting decision MathMaster has never made and this feature must not make
 * on a district's behalf.
 *
 * Returns null, never 0, when nothing counts yet. A student with no graded work
 * does not have a 0% average; they have no average.
 *
 * Work in progress IS included, at the score it currently holds. That is not a
 * new decision: the student dashboard has always shown "current grade · if
 * stopped now" for started work, and excluding it here would make the header
 * number disagree with the rows underneath it. What is excluded is work with no
 * evidence at all — see gradeCountsTowardPeriod.
 */
export const summarizeGradeEntries = (entries = []) => {
  let earnedWeight = 0;
  let possibleWeight = 0;
  let graded = 0;
  let missing = 0;
  let pending = 0;

  list(entries).forEach((entry) => {
    if (entry.status === GRADE_STATUS.MISSING) missing += 1;
    if (entry.status === GRADE_STATUS.PENDING_GRADE) pending += 1;
    if (!entry.countsTowardPeriodGrade) return;
    graded += 1;
    earnedWeight += Number(entry.weights?.earnedWeight) || 0;
    possibleWeight += Number(entry.weights?.possibleWeight) || 0;
  });

  return {
    score: possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : null,
    earnedWeight,
    possibleWeight,
    graded,
    missing,
    pending,
    total: list(entries).length,
  };
};

/**
 * Everything the Grade Center renders, computed once.
 *
 * `tracker` is the canonical `grades/{studentId}.gradesByAssignment` map that
 * App already holds. There is intentionally no practice-tracker parameter.
 */
export const buildStudentGradeCenter = ({
  assignments = [],
  classId = null,
  classPeriod = null,
  studentId = null,
  courseLabel = '',
  nowValue = Date.now(),
  tracker = {},
  /*
   * THE CANONICAL TEST CYCLE GRADE, READ AND NEVER RECOMPUTED.
   *
   * `grades/{studentId}.testCycleGrades` is written by the secure release path
   * from the one rule in testCycleGrade.mjs. The tracker cannot produce this
   * number — a Test Cycle's tracker holds Review and Corrections work, which
   * carry no assessment points — so a Test Cycle row reads the record instead.
   * Passing it in keeps this module's "computes nothing about a grade" promise
   * intact: it is still reading somebody else's answer.
   */
  testCycleGrades = {},
  classworkGradesByAssignment = {},
  gradingPeriodSettings = null,
  classroomSyncStatusByAssignment = {},
  providers = {},
} = {}) => {
  const {
    // App holds the client copy of the teacher-release policy, so it arrives as
    // a provider exactly as it does for the student dashboard model.
    assignmentHasHeldTeacherFeedback = () => false,
    prerequisiteAccess = null,
  } = providers;

  const settings = normalizeGradingPeriodSettings(gradingPeriodSettings || {});
  const visible = list(assignments)
    .filter((assignment) => assignmentIsForStudent(assignment, { classId, classPeriod }));

  const buildEntry = (assignment) => {
    const assignmentTracker = tracker?.[assignment.id] || null;
    const lifecycle = getAssignmentLifecycle(assignment, nowValue);
    const overall = splitGrade({ tracker: assignmentTracker, assignment });
    const sections = splitGradesBySection({ tracker: assignmentTracker, assignment });
    const weights = gradeWeightTotals({ tracker: assignmentTracker, assignment });
    const excused = assignmentIsExcusedForStudent(assignment, studentId);
    const reopened = assignmentIsReopenedForStudent(assignment, studentId);
    const feedbackHeld = !lifecycle.isPracticeOnly && assignmentHasHeldTeacherFeedback(assignment) === true;
    const access = prerequisiteAccess
      ? prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue })
      : { open: true, reason: null };
    const locked = lifecycle.isScheduled || access?.open === false;

    /*
     * A Test Cycle row shows the recorded assessment grade, not the tracker.
     *
     * Everything the row needs is derived from the canonical projection so the
     * Grade Center, the Assignment Result screen, the teacher gradebook and
     * Google Classroom all show the same number. A cycle with no released Test
     * has no number at all — Pending Grade, never 0%.
     */
    const testCycle = isTestCycleAssignment(assignment)
      ? buildTestCycleGradeState({
        originalTestGrade: testCycleGrades?.[assignment.id]?.originalTestGrade ?? null,
        rawRetestGrade: testCycleGrades?.[assignment.id]?.rawRetestGrade ?? null,
        policy: assignment.assessmentPolicy,
      })
      : null;
    const cycleRecorded = testCycle?.recordedGrade ?? null;
    /*
     * A SUBMITTED SECURE TEST IS EVIDENCE, EVEN BEFORE IT IS RELEASED.
     *
     * The recorded grade does not exist until a teacher releases the result, so
     * reading "attempted" off the grade alone would call a student who sat the
     * whole test "Not Started" — and, past the final deadline, "Practice Only",
     * which tells them no credit is recoverable while their teacher is still
     * holding the score. The stage on the projection is what knows better.
     */
    const cycleStage = clean(testCycleGrades?.[assignment.id]?.stage);
    const cycleEvidenceStages = [
      'awaitingRelease', 'passed', 'corrections', 'retestReady',
      'retest', 'retestSubmitted', 'complete', 'retestClosed',
    ];
    const cycleAttempted = cycleRecorded !== null || cycleEvidenceStages.includes(cycleStage);
    const effectiveOverall = testCycle
      ? {
        score: cycleRecorded,
        attempted: cycleAttempted ? 1 : 0,
        total: 1,
        unanswered: cycleRecorded === null ? 1 : 0,
        creditOnAttempted: cycleRecorded === null ? null : cycleRecorded,
        shape: cycleRecorded === null ? (cycleAttempted ? 'incomplete' : 'notStarted') : 'complete',
      }
      : overall;
    // One assessment's worth of weight, so a Test Cycle carries the same
    // influence on a period average as any other single assessment grade.
    const effectiveWeights = testCycle
      ? {
        possibleWeight: cycleRecorded === null ? 0 : 100,
        earnedWeight: cycleRecorded === null ? 0 : cycleRecorded,
        score: cycleRecorded,
      }
      : weights;
    const cycleFeedbackHeld = Boolean(testCycle) && cycleRecorded === null;

    const status = resolveGradeStatus({
      overall: effectiveOverall,
      lifecycle,
      feedbackHeld: feedbackHeld || cycleFeedbackHeld,
      excused,
      reopened,
      locked,
    });
    const { counts, reason } = gradeCountsTowardPeriod({ status, overall: effectiveOverall, weights: effectiveWeights });

    return {
      assignment,
      assignmentId: assignment.id,
      title: assignment.title || 'MathMaster assignment',
      dueAt: assignment.dueAt || assignment.dueDate || null,
      lateDueAt: assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate || null,
      lifecycle,
      overall: effectiveOverall,
      sections,
      weights: effectiveWeights,
      // The Test Cycle breakdown a student and a teacher both read: original
      // Test, corrections state, raw retest, the cap, and the recorded grade.
      // Null on every ordinary assignment, so nothing else changes shape.
      testCycle,
      isTestCycle: Boolean(testCycle),
      status,
      statusLabel: GRADE_STATUS_LABEL[status],
      countsTowardPeriodGrade: counts,
      exclusionReason: reason,
      exclusionText: reason ? EXCLUSION_REASON_TEXT[reason] : null,
      feedbackHeld: feedbackHeld || cycleFeedbackHeld,
      excused,
      reopened,
      locked,
      // Past the final close the recorded grade can never move again. The
      // screen says "frozen" because "final" reads as a judgement and this is
      // just a fact about the deadline.
      frozen: lifecycle.isPracticeOnly,
      practiceOnly: lifecycle.isPracticeOnly,
      // A number only when there is a released grade to show. Anything else is
      // a status word, never a percentage.
      displayGrade: counts || (lifecycle.isPracticeOnly && Number(effectiveOverall.attempted) > 0)
        ? effectiveOverall.score
        : null,
      // Practice is available once the final deadline has passed, and it is the
      // only remaining action on a closed assignment.
      practiceAvailable: lifecycle.isPracticeOnly,
      reviewAvailable: Number(effectiveOverall.attempted) > 0,
      classroomReceipt: classroomSyncStatusByAssignment?.[assignment.id] || null,
      gradingPeriod: resolveAssignmentGradingPeriod(assignment, settings),
    };
  };

  const groups = groupAssignmentsByGradingPeriod(visible, settings).map((group) => {
    const entries = group.assignments
      .map(buildEntry)
      .sort((a, b) => String(b.dueAt || '').localeCompare(String(a.dueAt || '')));
    return {
      period: group.period,
      entries,
      summary: summarizeGradeEntries(entries),
      // Current period open, past periods collapsed — including archived ones,
      // which stay collapsed but never stop being readable.
      defaultOpen: group.period.isCurrent === true,
    };
  });

  const currentGroup = groups.find((group) => group.period.isCurrent) || null;
  const entriesByAssignmentId = Object.fromEntries(
    groups.flatMap((group) => group.entries).map((entry) => [entry.assignmentId, entry]),
  );

  return {
    courseLabel: clean(courseLabel) || clean(classPeriod),
    settings,
    periodGroups: groups,
    currentPeriod: currentGroup?.period || null,
    currentSummary: currentGroup?.summary || summarizeGradeEntries([]),
    pastPeriodGroups: groups.filter((group) => group !== currentGroup),
    entries: groups.flatMap((group) => group.entries),
    entriesByAssignmentId,
  };
};

/**
 * One assignment's result, for the Assignment Result screen and the closed
 * Google Classroom link that lands on it.
 *
 * Returns the SAME entry object the Grade Center row was built from, so the
 * result screen can never show a different grade from the list that linked to
 * it. Null when the assignment is not one of this student's.
 */
export const findGradeCenterEntry = (gradeCenter, assignmentId) => (
  gradeCenter?.entriesByAssignmentId?.[clean(assignmentId)] || null
);

export default buildStudentGradeCenter;
