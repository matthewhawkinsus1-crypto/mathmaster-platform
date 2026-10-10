import {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  studentDueDates,
} from '../../assignmentLifecycle.js';
import {
  SECTION_GRADE_KEYS,
  gradeWeightTotals,
  splitGrade,
  splitGradesBySection,
} from '../teacher/gradeEvidence.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import {
  buildTestCycleGradeState,
  isTestCycleAssignment,
} from '../assessment/testCycle.js';
import {
  groupAssignmentsByGradingPeriod,
  normalizeGradingPeriodSettings,
  resolveAssignmentGradingPeriod,
} from './gradingPeriods.js';
import { resolveStudentOverride } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { heldSectionRecoveries } from '../../../functions/shared/sectionRecoveryProjection.mjs';
import { assignmentGradeOverrideFor } from '../grading/canonicalGradeProjection.js';

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
  // A Practice-based Recovery is held for the teacher: MathMaster could not
  // grade part of it, so this grade can still move.
  RECOVERY_HELD: 'recoveryHeld',
});

export const EXCLUSION_REASON_TEXT = Object.freeze({
  [EXCLUSION_REASON.NO_EVIDENCE]: 'Not counted yet — nothing has been recorded for this assignment.',
  [EXCLUSION_REASON.FEEDBACK_HELD]: 'Not counted yet — your teacher has not released this grade.',
  [EXCLUSION_REASON.PRACTICE_ONLY]: 'Not counted — this closed with no recorded work, so it is practice only now.',
  [EXCLUSION_REASON.EXCUSED]: 'Not counted — your teacher excused this assignment.',
  [EXCLUSION_REASON.NOT_GRADEABLE]: 'Not counted — this assignment has no gradeable questions.',
  [EXCLUSION_REASON.RECOVERY_HELD]: 'Not counted yet — your Recovery work is saved, and your teacher is reviewing it because MathMaster could not grade part of it.',
});

/*
 * AN ASSIGNMENT-LEVEL TEACHER GRADE: THE ONE STUDENT-VISIBLE REASON.
 *
 * grades/{sid}.teacherGradeOverridesByAssignment[aid].__assignment is written
 * by the server's integrity action (functions/index.js, scope "assignment")
 * with a fixed reasonCode. A student sees only the fixed label for that code
 * (the same map as ASSIGNMENT_ZERO_REASONS, asserted equal by
 * tests/platform/studentGradeCenterTeacherGrade.test.mjs) — never the note,
 * never who set it. An unknown code shows no reason at all.
 */
export const ASSIGNMENT_ZERO_REASON_LABELS = Object.freeze({
  cellPhoneUse: 'Prohibited cellphone use',
  academicDishonesty: 'Unauthorized assistance / cheating',
  accountSwitching: 'Account or laptop switching',
});

export const teacherGradeReasonLabel = (override) => {
  const code = clean(override?.reasonCode);
  return Object.prototype.hasOwnProperty.call(ASSIGNMENT_ZERO_REASON_LABELS, code)
    ? ASSIGNMENT_ZERO_REASON_LABELS[code]
    : null;
};

const teacherGradeText = (reasonLabel) => (
  `${reasonLabel ? `Grade set by your teacher: ${reasonLabel}.` : 'Grade set by your teacher.'} More work on this assignment won't change it.`
);

/*
 * The teacher's score replaces the whole grade, exactly as
 * canonicalPresentedAssignmentGrade (gradebook, Classroom) and
 * canonicalPresentedSectionGrade (Grade Transfer) read it: every real section
 * carries the same score, and the assignment's points are earned at that
 * percent of what it is worth, so the period average reconciles with it.
 */
const overriddenOverall = (overall, score) => {
  const total = Number(overall?.total) || 0;
  return {
    ...overall,
    score,
    attempted: total,
    unanswered: 0,
    creditOnAttempted: score,
    shape: total > 0 ? 'complete' : overall?.shape,
  };
};

const overriddenWeights = (weights, score, possibleFallback = 0) => {
  const possible = Number(weights?.possibleWeight) > 0 ? Number(weights.possibleWeight) : possibleFallback;
  return { ...weights, possibleWeight: possible, earnedWeight: (possible * score) / 100, score };
};

const overriddenSections = (sections, score) => Object.fromEntries(
  Object.entries(sections || {}).map(([key, split]) => [
    key,
    Number(split?.total) > 0 && split?.excused !== true
      ? { ...split, score, attempted: split.total, unanswered: 0, creditOnAttempted: score }
      : split,
  ]),
);

/*
 * EXCUSED AND REOPENED ARE READ, NEVER INFERRED.
 *
 * "Excused" changes what a grade means and "reopened" changes what a student is
 * allowed to do. Guessing either from dates or from an empty tracker would put
 * words in a teacher's mouth, so both are read only from explicit per-student
 * platform data — the student's own controls as the one override resolver
 * (functions/shared/studentAssignmentOverrides.mjs) answers them, from their
 * private record and any copy still on the shared document, in every form a
 * teacher's flag has been stored. No such data means neither state, which is
 * the truthful answer until a teacher records one.
 */
const studentControlsFor = (assignment, studentId, privateOverride) => (
  clean(studentId) ? resolveStudentOverride({ assignment, studentId: clean(studentId), privateOverride }) : null
);

export const assignmentIsExcusedForStudent = (assignment, studentId, privateOverride = undefined) => (
  studentControlsFor(assignment, studentId, privateOverride)?.excused === true
);

export const assignmentIsReopenedForStudent = (assignment, studentId, privateOverride = undefined) => (
  studentControlsFor(assignment, studentId, privateOverride)?.reopened === true
);

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
  let excused = 0;
  // Closed with nothing recorded (Practice Only). Named apart from "not
  // started", because closed work is not waiting to be started.
  let closed = 0;
  // Counted work that is still open and unfinished: it is in the average at
  // the score it holds right now, and "How this grade is figured" names it so
  // a student knows that number can still move.
  const inProgress = [];

  list(entries).forEach((entry) => {
    if (entry.status === GRADE_STATUS.MISSING) missing += 1;
    if (entry.status === GRADE_STATUS.PENDING_GRADE) pending += 1;
    if (entry.status === GRADE_STATUS.EXCUSED) excused += 1;
    if (entry.status === GRADE_STATUS.PRACTICE_ONLY) closed += 1;
    if (!entry.countsTowardPeriodGrade) return;
    graded += 1;
    earnedWeight += Number(entry.weights?.earnedWeight) || 0;
    possibleWeight += Number(entry.weights?.possibleWeight) || 0;
    if (IN_PROGRESS_STATUSES.has(entry.status)) {
      inProgress.push({ assignmentId: entry.assignmentId, title: entry.title, score: entry.displayGrade ?? null });
    }
  });

  const total = list(entries).length;
  return {
    score: possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : null,
    earnedWeight,
    possibleWeight,
    graded,
    missing,
    pending,
    excused,
    closed,
    inProgress,
    // Everything else that is not in the average: not started, not open yet,
    // or nothing gradeable. Not a zero in THIS average — Google Classroom is a
    // different record (see describeGradeMath).
    notCountedOther: Math.max(0, total - graded - missing - pending - excused - closed),
    total,
  };
};

// Started, open and not finished: counted at the score it holds now.
const IN_PROGRESS_STATUSES = new Set([GRADE_STATUS.IN_PROGRESS, GRADE_STATUS.LATE, GRADE_STATUS.REOPENED]);

const formatPoints = (value) => {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * "How this grade is figured", in a student's words, from the summary's own
 * numbers. It explains summarizeGradeEntries; it never computes a second
 * grade — the percent it prints IS summary.score.
 */
export const describeGradeMath = (summary = {}) => {
  const score = summary?.score ?? null;
  const lines = [];
  const headline = score === null
    ? 'Nothing is counted yet, so there is no grade to figure.'
    : `You've earned ${formatPoints(summary.earnedWeight)} of ${formatPoints(summary.possibleWeight)} points on counted work = ${score}%.`;
  if (score !== null) {
    lines.push('Bigger questions are worth more points, so every assignment counts by its size.');
  }
  const inProgress = list(summary?.inProgress);
  if (inProgress.length) {
    lines.push(`Work you've started counts at its current score until you finish: ${inProgress.map((item) => item.title).join(', ')}.`);
  }
  const notCounted = [
    [summary?.missing, 'missing'],
    [summary?.pending, 'waiting on your teacher'],
    [summary?.excused, 'excused'],
    [summary?.closed, 'closed with no work recorded'],
    [summary?.notCountedOther, 'not started or not open yet'],
  ].filter(([count]) => Number(count) > 0)
    .map(([count, label]) => `${count} ${label}`);
  if (notCounted.length) {
    /*
     * True for THIS average only. After the due date the server's Classroom
     * passback (functions/lib/classroomGradeRuntime.js due-checkpoint /
     * final-deadline) posts unfinished work, so Classroom can show missing
     * work as 0 even though MathMaster leaves it out of this number.
     */
    lines.push(`Not counted in this grade: ${notCounted.join(', ')}. These aren't in this MathMaster average, but after the due date Google Classroom may record missing work as 0.`);
  }
  return {
    headline,
    lines,
    score,
    earnedPoints: formatPoints(summary?.earnedWeight),
    possiblePoints: formatPoints(summary?.possibleWeight),
    inProgressTitles: inProgress.map((item) => item.title),
  };
};

/*
 * EACH SECTION'S SHARE OF ONE ASSIGNMENT'S GRADE.
 *
 * Read through gradeWeightTotals() — the same function that weighs the whole
 * assignment — on a view of the assignment holding only that section's current
 * questions (every other question is treated as teacher-excluded, so storage
 * indices and the tracker still line up). No question weight or credit is
 * computed here.
 *
 * The shares are only returned when they RECONCILE: the sections' possible and
 * earned points must add up to exactly the assignment's own. When they cannot
 * (a Test Cycle, whose grade is not the tracker; a reduced-item accommodation
 * that plans over the whole assignment) the row shows no shares rather than
 * numbers that disagree with its grade.
 */
const sectionOnlyAssignment = (assignment, keep) => {
  let storageIndex = 0;
  return {
    ...assignment,
    sections: list(assignment?.sections).map((section) => ({
      ...section,
      questions: list(section?.questions).map((question) => {
        const index = storageIndex;
        storageIndex += 1;
        return keep.has(index) ? question : { ...question, teacherExcluded: true };
      }),
    })),
  };
};

const sectionWeightShares = ({ assignment, tracker, practicePassRedeemed, supportProfile, weights }) => {
  const possible = Number(weights?.possibleWeight) || 0;
  if (!(possible > 0)) return null;
  const entries = projectCurrentAssignmentContent(assignment).entries;
  const shares = {};
  let possibleSum = 0;
  let earnedSum = 0;
  SECTION_GRADE_KEYS.forEach((key) => {
    const keep = new Set(entries.filter((entry) => entry.logicalRole === key).map((entry) => entry.storageIndex));
    if (!keep.size) return;
    const part = gradeWeightTotals({
      tracker, assignment: sectionOnlyAssignment(assignment, keep), practicePassRedeemed, supportProfile,
    });
    possibleSum += part.possibleWeight;
    earnedSum += part.earnedWeight;
    shares[key] = {
      possibleWeight: part.possibleWeight,
      earnedWeight: part.earnedWeight,
      sharePercent: Math.round((part.possibleWeight / possible) * 100),
    };
  });
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  if (!close(possibleSum, possible) || !close(earnedSum, Number(weights?.earnedWeight) || 0)) return null;
  return shares;
};

/*
 * WHAT A ROW OFFERS, DECIDED HERE SO NO COMPONENT DECIDES IT.
 *
 *   start            open, unlocked, unfinished work the student can still do
 *                    for credit: Start (nothing recorded) or Continue.
 *   viewResults      hidden only on work that has never been started and is
 *                    still open — a result page with nothing on it is a dead end.
 *   practiceNoCredit the closed assignment's voluntary re-try, which can never
 *                    change the recorded grade.
 */
const START_STATUSES = new Set([
  GRADE_STATUS.MISSING, GRADE_STATUS.NOT_STARTED, GRADE_STATUS.IN_PROGRESS,
  GRADE_STATUS.LATE, GRADE_STATUS.REOPENED,
]);

export const resolveGradeRowActions = ({ status, overall, lifecycle, locked = false, excused = false } = {}) => {
  const attempted = Number(overall?.attempted) || 0;
  const frozen = lifecycle?.isPracticeOnly === true;
  const canStart = START_STATUSES.has(status) && lifecycle?.isOpen === true && !locked && !excused && !frozen;
  const noEvidenceYet = (status === GRADE_STATUS.NOT_STARTED || status === GRADE_STATUS.MISSING)
    && attempted === 0 && !frozen;
  return {
    start: canStart ? { label: attempted > 0 ? 'Continue' : 'Start' } : null,
    viewResults: !noEvidenceYet,
    practiceNoCredit: frozen,
  };
};

/**
 * THE ONE "TODAY" RULE, APPLIED TO A GRADE ROW'S START BUTTON.
 *
 * resolveGradeRowActions knows the grade status and the assignment's dates, not
 * whether anything in the lesson can be worked this minute. A lesson whose
 * Classwork is done and whose DOL opens at 2:15 read "Continue" on Grades and
 * landed the student on the result page. Given the dashboard's entry for the
 * same assignment (buildStudentDashboardModel allEntries: actionable,
 * nextQuestionIndex, action, waitText — the rule Home and Assignments use),
 * the row:
 *
 *   - offers Start/Continue only when the lesson is actionable now, and says
 *     where it lands (`questionIndex`);
 *   - offers "Open Recovery" (the result page) instead when the open work is a
 *     Recovery, and drops the second button to that same page;
 *   - offers no Start on waiting work, and carries its wait line instead.
 *
 * Without a dashboard entry (or for a Test Cycle, whose card owns its stages)
 * the actions are returned unchanged. It never ADDS a Start the grade rules
 * refused.
 */
export const applyTodayToGradeActions = (actions = {}, today = null) => {
  if (!actions?.start || !today || today.testCycle) return actions;
  if (today.excused === true || today.finished === true) return { ...actions, start: null };
  if (today.actionable !== true) {
    return { ...actions, start: null, waitText: clean(today.waitText) || null };
  }
  if (today.action === 'recovery') {
    return { ...actions, start: { label: 'Open Recovery', opensResult: true }, viewResults: false };
  }
  return {
    ...actions,
    start: {
      ...actions.start,
      questionIndex: Number.isInteger(today.nextQuestionIndex) ? today.nextQuestionIndex : null,
    },
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
  /*
   * PRACTICE PASS REDEMPTIONS, READ AND NEVER RECOMPUTED.
   *
   * `classPointRewardRedemptions/{redemptionId}` is server-written the moment
   * a Practice Pass is granted (functions/index.js `redeemPracticePass`), and
   * IS the authoritative waiver -- this model only asks "does one exist for
   * this assignment?" the same way it asks for testCycleGrades. Keyed by
   * assignmentId because a student can hold at most one Practice Pass per
   * assignment (see PRACTICE_PASS_INELIGIBLE_CODES.ALREADY_REDEEMED).
   */
  practicePassRedemptionsByAssignment = {},
  /*
   * THE STUDENT'S OWN SUPPORT PROFILE (`user.profile`). A reduced-item-count
   * accommodation removes items from this student's denominator exactly the
   * way a Practice Pass removes Practice (functions/shared/reducedWorkload.mjs,
   * through gradeEvidence.js) — the Grades tab, the gradebook and Classroom
   * therefore agree on the same number.
   */
  supportProfile = null,
  /*
   * PRACTICE-BASED RECOVERY RECORDS, READ AND NEVER RECOMPUTED.
   *
   * `grades/{studentId}.sectionRecoveryByAssignment` (server-written). A
   * completed Recovery already reached `tracker` through the display
   * projection; this is read only to know whether one is HELD — submitted,
   * not gradable enough to score, waiting for the teacher. A held Recovery's
   * assignment is Pending Grade: a status word, never a percentage, and not
   * in the period average, exactly like a grade a teacher is holding.
   */
  sectionRecoveryByAssignment = {},
  // The student's teacher overrides: an assignment-level one decides the whole
  // grade, so a held Recovery does not make that assignment Pending Grade
  // (as for Classroom and Grade Transfer — canonicalGradeProjection.js).
  teacherGradeOverridesByAssignment = {},
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
    const lifecycle = getAssignmentLifecycle(assignment, nowValue, { studentId });
    const practicePassRedeemed = Boolean(practicePassRedemptionsByAssignment?.[assignment.id]);
    const overall = splitGrade({ tracker: assignmentTracker, assignment, practicePassRedeemed, supportProfile });
    const sections = splitGradesBySection({ tracker: assignmentTracker, assignment, practicePassRedeemed, supportProfile });
    const weights = gradeWeightTotals({ tracker: assignmentTracker, assignment, practicePassRedeemed, supportProfile });
    const excused = assignmentIsExcusedForStudent(assignment, studentId);
    const reopened = assignmentIsReopenedForStudent(assignment, studentId);
    const feedbackHeld = !lifecycle.isPracticeOnly && assignmentHasHeldTeacherFeedback(assignment) === true;
    // An active assignment-level teacher grade (an integrity zero) decides the
    // whole grade, as it does for the gradebook, Classroom and Grade Transfer.
    const gradeOverride = assignmentGradeOverrideFor({ teacherGradeOverridesByAssignment }, assignment.id);
    const recoveryHeld = Object.keys(heldSectionRecoveries(sectionRecoveryByAssignment?.[assignment.id])).length > 0
      && !gradeOverride;
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
    const cycleOverall = testCycle
      ? {
        score: cycleRecorded,
        attempted: cycleAttempted ? 1 : 0,
        total: 1,
        unanswered: cycleRecorded === null ? 1 : 0,
        creditOnAttempted: cycleRecorded === null ? null : cycleRecorded,
        shape: cycleRecorded === null ? (cycleAttempted ? 'incomplete' : 'notStarted') : 'complete',
      }
      : overall;
    const effectiveOverall = gradeOverride ? overriddenOverall(cycleOverall, gradeOverride.score) : cycleOverall;
    // One assessment's worth of weight, so a Test Cycle carries the same
    // influence on a period average as any other single assessment grade.
    const cycleWeights = testCycle
      ? {
        possibleWeight: cycleRecorded === null ? 0 : 100,
        earnedWeight: cycleRecorded === null ? 0 : cycleRecorded,
        score: cycleRecorded,
      }
      : weights;
    const effectiveWeights = gradeOverride
      ? overriddenWeights(cycleWeights, gradeOverride.score, testCycle ? 100 : 0)
      : cycleWeights;
    // The teacher's grade is recorded, so an unreleased Test is not a hold.
    const cycleFeedbackHeld = Boolean(testCycle) && cycleRecorded === null && !gradeOverride;
    const teacherGrade = gradeOverride
      ? { score: gradeOverride.score, reasonLabel: teacherGradeReasonLabel(gradeOverride) }
      : null;

    const status = resolveGradeStatus({
      overall: effectiveOverall,
      lifecycle,
      // A held Recovery is a grade waiting on the teacher, like held feedback.
      feedbackHeld: feedbackHeld || cycleFeedbackHeld || recoveryHeld,
      excused,
      // Reopening lets a student work again; it cannot move a grade the
      // teacher has set for the whole assignment.
      reopened: reopened && !gradeOverride,
      locked,
    });
    const counted = gradeCountsTowardPeriod({ status, overall: effectiveOverall, weights: effectiveWeights });
    const counts = counted.counts;
    const reason = recoveryHeld && status === GRADE_STATUS.PENDING_GRADE && !feedbackHeld && !cycleFeedbackHeld
      ? EXCLUSION_REASON.RECOVERY_HELD
      : counted.reason;

    return {
      assignment,
      assignmentId: assignment.id,
      title: assignment.title || 'MathMaster assignment',
      // This student's dates, read off the same lifecycle that decided the
      // status: an individualized due date or an attendance extension moves
      // what the Grades tab and the result screen print, not just the status.
      ...studentDueDates(assignment, lifecycle),
      lifecycle,
      overall: effectiveOverall,
      sections: gradeOverride ? overriddenSections(sections, gradeOverride.score) : sections,
      weights: effectiveWeights,
      // The Test Cycle breakdown a student and a teacher both read: original
      // Test, corrections state, raw retest, the cap, and the recorded grade.
      // Null on every ordinary assignment, so nothing else changes shape.
      testCycle,
      isTestCycle: Boolean(testCycle),
      practicePassRedeemed,
      status,
      statusLabel: GRADE_STATUS_LABEL[status],
      countsTowardPeriodGrade: counts,
      exclusionReason: reason,
      exclusionText: reason ? EXCLUSION_REASON_TEXT[reason] : null,
      // { score, reasonLabel } when an assignment-level teacher grade decides
      // this row, with the one line the row prints (fixed label only).
      teacherGrade,
      teacherGradeText: teacherGrade ? teacherGradeText(teacherGrade.reasonLabel) : null,
      feedbackHeld: feedbackHeld || cycleFeedbackHeld,
      recoveryHeld,
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
      // The row's buttons (Start/Continue, View Results, Try it again — no
      // credit), decided once here.
      // A teacher-set grade offers results only: no work can change it.
      actions: gradeOverride
        ? { ...resolveGradeRowActions({ status, overall: effectiveOverall, lifecycle, locked, excused }), start: null }
        : resolveGradeRowActions({ status, overall: effectiveOverall, lifecycle, locked, excused }),
      // Each section's share of this assignment's grade, or null when the
      // shares would not add up to the grade shown.
      sectionShares: testCycle || gradeOverride ? null : sectionWeightShares({
        assignment, tracker: assignmentTracker, practicePassRedeemed, supportProfile, weights,
      }),
      // The server-written Test Cycle stage, so "Ways to raise your grade" can
      // offer corrections or a retest. Null on every ordinary assignment.
      testCycleStage: cycleStage || null,
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
