import {
  getStoredAssignmentQuestions,
} from './platform/contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from './platform/policies/activityPolicies.js';
import { localDateKey, studentDueDateLines, studentDueDates } from './assignmentLifecycle.js';
import { studentAssignmentAvailability } from './platform/assignments/assignmentAvailability.js';
import { filterStudentRequiredIndices, studentOmittedIndices } from '../functions/shared/reducedWorkload.mjs';
import { assignmentIsArchived, assignmentIsUnpublished } from '../functions/shared/assessmentAvailability.mjs';
import { describeTestCycleForStudent } from './platform/student/testCycleDiscovery.js';
import { SECTION_STATE, describeLessonSections, describeSectionWait } from './platform/student/lessonSections.js';
import { firstOpenLiveQuestionIndex } from './platform/student/liveSectionEntry.js';
import { questionIsTerminal } from './platform/student/studentWorkState.js';
import { resolveStudentOverride } from '../functions/shared/studentAssignmentOverrides.mjs';

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
  [BUCKET.PRACTICE]: 'Closed — try again (no credit)',
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
  /*
   * PRACTICE PASS REDEMPTIONS, READ AND NEVER RECOMPUTED.
   *
   * `classPointRewardRedemptions/{redemptionId}` is server-written the moment
   * a Practice Pass is granted; this model only asks "does one exist for this
   * assignment?" — the same read-only role testCycleGrades already plays for
   * studentGradeCenterModel.js. A waived Practice question is removed from
   * REQUIRED completion/resume here (Home must never say "Finish what you
   * started" or "In Progress" about a section a student paid to excuse), but
   * this manufactures no completion record for Practice itself and never
   * touches Warm-Up/Classwork/DOL.
   */
  practicePassRedemptionsByAssignment = {},
  /*
   * THE STUDENT'S OWN SUPPORT PROFILE (`user.profile`): a reduced-item-count
   * accommodation leaves fewer required items (functions/shared/
   * reducedWorkload.mjs). Omitted items are never "left to do", never resume
   * targets and never keep an assignment out of Finished.
   */
  supportProfile = null,
  /*
   * The server-written Test Cycle projection (grades/{id}.testCycleGrades).
   * Read only to DESCRIBE a cycle on the list — "Test ready", "Corrections 1
   * of 3" — never to decide what a student may enter; the card asks the server.
   */
  testCycleGrades = {},
  /*
   * WHO THE STUDENT IS, so a whole-assignment excusal recorded for them (the
   * one override resolver, studentAssignmentOverrides.mjs) is honoured: Grades
   * says "Excused", and Home must never call the same work past due.
   */
  studentId = null,
  /*
   * PRACTICE-BASED RECOVERY STATE PER SECTION, { [assignmentId]: { warmup:
   * 'unlocked', dol: 'locked', … } }, from buildStudentRecoverySummary. A
   * Recovery the student can start or continue now keeps its closed section
   * open (decision 4); nothing here decides eligibility — the server does.
   */
  recoveryStateByAssignment = {},
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
    // The teacher's per-class Classwork/Practice lock (getSectionAccessState).
    // Optional so synthetic callers (the Path Simulator) keep working; without
    // it every Classwork/Practice section reads as open, which is what they
    // showed before.
    getSectionAccessState = null,
  } = providers;
  const todayKey = localDateKey(nowValue);
  /*
   * ONE Warm-Up/DOL window per assignment per build. Each is read by Resume,
   * the "Today" rule, the live DOL/Warm-Up cards and the entry itself, and
   * every read re-normalizes the bell schedule; a 60-lesson student spent a
   * third of the build doing that again and again (job C verification: 25 ms
   * → see tests). Same arguments, same answer, so it is computed once.
   */
  const windowCache = new Map();
  const windowOf = (kind, provider, assignment) => {
    if (typeof provider !== 'function') return null;
    const key = `${kind}:${assignment?.id}`;
    if (!windowCache.has(key)) {
      windowCache.set(key, provider({ assignment, schedule: classSchedule, classId, classPeriod, nowValue }));
    }
    return windowCache.get(key);
  };
  const dolStateOf = (assignment) => windowOf('dol', getDOLState, assignment);
  const warmupStateOf = (assignment) => windowOf('warmup', getWarmupState, assignment);
  // Finished = correct, or out of tries under the maximum the workspace
  // enforces (a teacher-granted extra DOL try reopens an expired DOL item).
  const terminalFor = (assignment, index) => {
    const questions = getStoredAssignmentQuestions(assignment);
    return questionIsTerminal({
      record: tracker?.[assignment?.id]?.[index],
      role: resolveQuestionActivityRole({ question: questions[index], assignment }),
      question: questions[index],
      assignment,
      classId,
      studentId,
    });
  };
  const isExcused = (assignment) => Boolean(studentId)
    && resolveStudentOverride({ assignment, studentId })?.excused === true;

  // An assignment the teacher has ARCHIVED or PAUSED is closed to students, and
  // the server refuses its secure parts; listing it as work to do would offer a
  // student something they cannot open. Its recorded grade stays in the Grade
  // Center, which does not read this list.
  const visible = list(assignments).filter((assignment) => assignmentIsForStudent(assignment, { classId, classPeriod })
    && !assignmentIsArchived(assignment)
    && !assignmentIsUnpublished(assignment));

  const hasPracticePassFor = (assignmentId) => Boolean(practicePassRedemptionsByAssignment?.[assignmentId]);

  /*
   * THE ONE PLACE THIS MODEL ASKS "WHAT IS REQUIRED, GIVEN A PRACTICE PASS?"
   *
   * `getIncludedQuestionIndices` is this file's own (pre-existing, simpler)
   * inclusion definition — a raw `teacherExcluded` filter over stored
   * questions, not the current-content replacement projection gradeEvidence.js
   * uses. Extending that SAME definition with the SAME per-question role
   * resolver `activeWarmups`/`activeDols` already use below keeps one
   * inclusion rule in this file rather than introducing a second projection.
   */
  const withoutOmitted = (assignment, indices) => (supportProfile
    ? filterStudentRequiredIndices(indices, studentOmittedIndices({
      assignment, profile: supportProfile, tracker: tracker?.[assignment?.id] || null, nowValue,
    }))
    : indices);
  const requiredIndicesFor = (assignment) => {
    const included = getIncludedQuestionIndices(assignment);
    if (!hasPracticePassFor(assignment?.id)) return withoutOmitted(assignment, included);
    const questions = getStoredAssignmentQuestions(assignment);
    return withoutOmitted(
      assignment,
      included.filter((index) => resolveQuestionActivityRole({ question: questions[index], assignment }) !== 'practice'),
    );
  };
  // The grade a card shows counts the student's own required items (the
  // reduced-item denominator). A Practice Pass keeps its existing card
  // treatment; this change does not alter it.
  const gradeOptionsFor = () => ({ supportProfile });

  /*
   * RESUME MEANS "TAKE ME TO WORK I CAN ACTUALLY DO NOW."
   *
   * Warm-Up and DOL can remain unfinished in the tracker after their classroom
   * windows close. They still belong in grade/history evidence, but they must
   * not become the fallback destination for Continue while Classwork/Practice
   * is open. Explicit live Warm-Up/DOL cards remain handled separately.
   */
  const resumeEligibleIndicesFor = (assignment) => {
    const required = requiredIndicesFor(assignment);
    const questions = getStoredAssignmentQuestions(assignment);
    const warmupState = warmupStateOf(assignment);
    const dolState = dolStateOf(assignment);
    return required.filter((index) => {
      const role = resolveQuestionActivityRole({ question: questions[index], assignment });
      if (role === 'warmup' && warmupState?.enabled) return warmupState.status === 'active';
      if (role === 'dol' && dolState?.enabled) return dolState.status === 'active';
      return true;
    });
  };

  // "Locked" and "can resume" come from the one availability rule Live
  // Classroom's Walkthrough also uses (platform/assignments/assignmentAvailability.js),
  // fed the providers this model was handed so its tests can still inject them.
  const availabilityOf = (assignment) => studentAssignmentAvailability({
    assignment,
    classId,
    classPeriod,
    nowValue,
    classworkGradesByAssignment,
    isForStudent: assignmentIsForStudent,
    lifecycleOf: getAssignmentLifecycle,
    prerequisiteOf: prerequisiteAccess,
  });
  /*
   * THE ONE "TODAY" RULE, PER ASSIGNMENT (platform/student/lessonSections.js).
   *
   * Every section's state — done, excused, open, opens later, locked by the
   * teacher, closed, or in Recovery — from the same facts the entry point
   * uses: Warm-Up/DOL windows, the teacher's Classwork/Practice lock, release
   * and prerequisite, the student's excusal and Recovery. Card, groups, next
   * action and Resume all read this; none re-decides it.
   */
  const lessonCache = new Map();
  const lessonOf = (assignment) => {
    if (lessonCache.has(assignment.id)) return lessonCache.get(assignment.id);
    const availability = availabilityOf(assignment);
    const questions = getStoredAssignmentQuestions(assignment);
    const lessonEntries = getIncludedQuestionIndices(assignment).map((storageIndex) => ({
      storageIndex,
      role: resolveQuestionActivityRole({ question: questions[storageIndex], assignment }),
    }));
    const assignmentTracker = tracker?.[assignment.id] || null;
    const lesson = describeLessonSections({
      entries: lessonEntries,
      requiredIndices: requiredIndicesFor(assignment),
      statusOf: (index) => normalizeQuestionRecord(assignmentTracker?.[index]).status,
      isTerminal: (index) => terminalFor(assignment, index),
      lifecycle: availability.lifecycle,
      access: availability.access,
      excused: isExcused(assignment),
      warmupState: warmupStateOf(assignment),
      dolState: dolStateOf(assignment),
      sectionAccessOf: typeof getSectionAccessState === 'function'
        ? (role) => getSectionAccessState({ assignment, activityRole: role, classId, classPeriod, studentId, nowValue })
        : null,
      recoveryBySection: recoveryStateByAssignment?.[assignment.id] || {},
      todayKey,
    });
    lessonCache.set(assignment.id, lesson);
    return lesson;
  };
  // Resume offers only a question the student can work on this minute.
  const canResume = (assignment) => availabilityOf(assignment).workable && lessonOf(assignment).workableNow;

  const savedResume = visible.find((assignment) => assignment.id === resumeAction?.assignmentId && canResume(assignment));
  // Started work (a tracker exists) with something workable now.
  const fallbackResume = visible.find((assignment) => canResume(assignment) && Boolean(tracker[assignment.id])
    && resumeEligibleIndicesFor(assignment).some((index) => lessonOf(assignment).workableQuestionIndices.includes(index)));
  const resumeAssignment = savedResume || fallbackResume || null;

  const resumeIncluded = resumeAssignment ? requiredIndicesFor(resumeAssignment) : [];
  const resumeTracker = resumeAssignment ? tracker?.[resumeAssignment.id] || {} : {};
  const resumeQuestionsAttempted = resumeIncluded.filter((index) => {
    const record = normalizeQuestionRecord(resumeTracker?.[index]);
    return Number(record.totalAttempts || record.attemptCount || 0) > 0
      || record.status !== 'unattempted';
  }).length;
  const resumeRecordedGrade = resumeAssignment ? calculateGrade(resumeTracker, resumeAssignment, gradeOptionsFor(resumeAssignment)) : 0;
  const resumeFeedbackHeld = resumeAssignment ? assignmentHasHeldTeacherFeedback(resumeAssignment) : false;
  /*
   * RESUME LANDS ON THE FIRST UNFINISHED QUESTION THE STUDENT CAN DO NOW.
   *
   * The saved position wins only while it is still such a question; a
   * finished question, a closed Warm-Up or a locked section is never a
   * resume target (the "landed on the closed Warm-Up" QA finding).
   */
  const requestedResumeIndex = Number(resumeAction?.questionIndex);
  const resumeWorkable = resumeAssignment
    ? lessonOf(resumeAssignment).workableQuestionIndices.filter((index) => resumeEligibleIndicesFor(resumeAssignment).includes(index))
    : [];
  const resumeQuestionIndex = savedResume && resumeWorkable.includes(requestedResumeIndex)
    ? requestedResumeIndex
    : (resumeWorkable[0] ?? 0);

  const activeDols = visible
    .map((assignment) => {
      const state = dolStateOf(assignment);
      // Only this student's own DOL items: one their accommodation omits is
      // not unfinished work that keeps the DOL card up.
      const questionIndices = withoutOmitted(assignment, (state.questionIndices || [state.questionIndex])
        .filter((index) => Number.isInteger(index) && index >= 0));
      const records = questionIndices.map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
      // Still to do: never tried, or out of tries until the teacher granted
      // another one (the attempt policy reopens it with "1 try left").
      const openQuestionIndices = questionIndices.filter((index, position) => (
        records[position].totalAttempts === 0
        || (records[position].status === 'expired' && !terminalFor(assignment, index))
      ));
      return {
        assignment,
        lifecycle: getAssignmentLifecycle(assignment, nowValue),
        state,
        // This student's own DOL items, aligned with `records`.
        questionIndices,
        records,
        openQuestionIndices,
      };
    })
    .filter(({ assignment, state, lifecycle, openQuestionIndices }) => lifecycle.isOpen && state.status === 'active' && !isExcused(assignment) && openQuestionIndices.length > 0);
  const activeDolIds = new Set(activeDols.map(({ assignment }) => assignment.id));

  const activeWarmups = typeof getWarmupState === 'function'
    ? visible
      .map((assignment) => {
        const state = warmupStateOf(assignment);
        const questions = getStoredAssignmentQuestions(assignment);
        const questionIndices = withoutOmitted(assignment, questions.reduce((indices, question, index) => {
          if (
            questionIsIncluded(question)
            && resolveQuestionActivityRole({ question, assignment }) === 'warmup'
          ) indices.push(index);
          return indices;
        }, []));
        const records = questionIndices.map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
        return {
          assignment,
          lifecycle: getAssignmentLifecycle(assignment, nowValue),
          state,
          questionIndices,
          records,
        };
      })
      .filter(({ assignment, state, lifecycle, records }) => (
        lifecycle.isOpen
        && !isExcused(assignment)
        && state.status === 'active'
        && records.some((record) => !['correct', 'expired'].includes(record.status))
      ))
    : [];
  const activeWarmupIds = new Set(activeWarmups.map(({ assignment }) => assignment.id));

  /*
   * FINISHED MEANS EVERY SECTION IS DONE, AT ANY ACCURACY (decision 4).
   *
   * This replaced two rules that disagreed with it. A lesson bundle with a
   * Classwork section was "finished" the moment Classwork reached 100 —
   * Practice 1/10 and DOL 0/3 still waiting (QA round 2, "lesson bundles filed
   * as Finished") — and a closed lesson with unfinished questions was never
   * finished at all. Now a section is done when it is complete, or when it can
   * no longer be worked (closed with no Recovery to take now, or excused).
   *
   * An assignment with no required questions at all (a notes-only lesson)
   * keeps its old signals: the server's classwork completion, or its close.
   */
  const isDone = (assignment, lifecycle) => {
    const lesson = lessonOf(assignment);
    if (lesson.sections.length) return lesson.finished;
    if (isExcused(assignment)) return true;
    if (hasPracticePassFor(assignment?.id) && getIncludedQuestionIndices(assignment).length > 0) return true;
    return classworkGradesByAssignment[assignment.id]?.score === 100 || lifecycle.isClosed;
  };

  /*
   * EVERY assignment, computed once, then filtered for Home.
   *
   * Home deliberately hides three of them: the one already offered as Resume,
   * and any with a live DOL or Warm-Up, because each already has its own card
   * above the list and showing it twice reads as two pieces of work.
   *
   * That omission is correct for Home and wrong for an archive. The Assignments
   * Center has to show a student ALL of their work, so the exclusion moved from
   * the input of this computation to its output: `allEntries` is the complete
   * list, `entries` is Home's view of it, and both come from the same pass —
   * there is no second bucketing rule to drift.
   */
  const allEntries = visible
    .map((assignment) => {
      const assignmentTracker = tracker[assignment.id];
      const isAttempted = Boolean(assignmentTracker);
      const availability = availabilityOf(assignment);
      const { lifecycle, access } = availability;
      const recordedGrade = calculateGrade(assignmentTracker, assignment, gradeOptionsFor(assignment));
      const activity = assignmentActivity[assignment.id] || {};
      const classwork = classworkGradesByAssignment[assignment.id];
      const dol = dolStateOf(assignment);
      const feedbackHeld = assignmentHasHeldTeacherFeedback(assignment);
      const dueSoon = matchesSmartView(assignment, 'today', { nowValue });

      // "How much is left" was invisible until a student opened the
      // assignment, so a 1-question and a 12-question assignment looked
      // identical on the dashboard.
      const includedIndices = requiredIndicesFor(assignment);
      const questionsTotal = includedIndices.length;
      const questionsDone = assignmentTracker
        ? includedIndices.filter((index) => terminalFor(assignment, index)).length
        : 0;
      const questionsAttempted = assignmentTracker
        ? includedIndices.filter((index) => {
          const record = normalizeQuestionRecord(assignmentTracker[index]);
          return Number(record.totalAttempts || record.attemptCount || 0) > 0
            || record.status !== 'unattempted';
        }).length
        : 0;
      /*
       * A TEST CYCLE IS PLACED BY ITS STAGE, NOT BY ITS REVIEW.
       *
       * Its stored questions are only the Review, so the ordinary rules said
       * "Finished" the moment Review was all correct — with the secure Test
       * still waiting — and "Practice only" past the final date, although the
       * secure Test and Retest are never practice. The stage description puts
       * an unlocked Test, required corrections or an open retest in front of
       * the student, and work waiting on the teacher out of the way.
       */
      const testCycle = describeTestCycleForStudent({
        assignment,
        projection: testCycleGrades?.[assignment.id] || null,
        questions: getStoredAssignmentQuestions(assignment),
        tracker: assignmentTracker,
        nowValue,
      });
      const excused = isExcused(assignment);
      // An excused Test Cycle is finished like any excused work: its stage
      // description knows nothing of the excusal, and without this it was
      // filed under "Past due — still counts" with a Start Review button.
      const done = testCycle ? (excused || testCycle.done === true) : isDone(assignment, lifecycle);
      const lesson = testCycle ? null : lessonOf(assignment);
      // A Recovery the student can take now is the lesson's remaining work,
      // taken from the result page where the Recovery panel lives.
      const recoveryReady = Boolean(lesson?.recoverySection) && !lesson?.workableNow;
      /*
       * ACTIONABLE: pressing the card's button lands on work the student can
       * do this minute. Nothing else is ever offered as Start/Continue — that
       * is what removes the "Nothing open right now" dead end.
       */
      const actionable = testCycle
        ? !excused && testCycle.actionRequired === true && !['opensLater', 'paused'].includes(testCycle.key)
        // No question to land on (a notes-only lesson, or every question
        // removed): never actionable. Entry has nothing to open — Start did
        // nothing at all (startAssignment returns on an empty assignment) —
        // so it must not be the button Home leads with.
        : !done && !excused && Boolean(lesson?.sections.length)
          && (Boolean(lesson.workableNow) || recoveryReady);
      const started = testCycle
        ? testCycle.started && testCycle.actionRequired === true && !['testReady', 'retestReady'].includes(testCycle.key)
        : questionsAttempted > 0 && !done;
      const byDueDate = lifecycle.isLate ? BUCKET.PAST_DUE : dueSoon ? BUCKET.DO_NOW : BUCKET.COMING_UP;

      /*
       * WHICH GROUP. Finished first. Then only work the student can act on
       * now goes in "Keep going"; a Test Cycle stage is placed like any other
       * work — by whether it is underway and by its due date — never forced
       * into "Due today". Work that is waiting (a section opens later, the
       * teacher opens it, the teacher holds the next Test Cycle step) stays
       * under its due-date group and its card says what it is waiting for.
       */
      // Finished by the deadline rather than by the student: the lesson asks
      // nothing more (decision 4), but it is filed apart from work the student
      // completed, under the closed group they can still practise from.
      const closedUnfinished = done && !testCycle && lifecycle.isPracticeOnly && !excused
        && (lesson?.sections || []).some((section) => section.state === SECTION_STATE.CLOSED);
      const bucket = closedUnfinished
        ? BUCKET.PRACTICE
        : done
        ? BUCKET.COMPLETED
        : testCycle && (['opensLater', 'paused'].includes(testCycle.key) || !testCycle.actionRequired)
          ? BUCKET.COMING_UP
          : actionable && started
            ? BUCKET.IN_PROGRESS
            : byDueDate;

      const waitText = !done && !actionable && lesson ? describeSectionWait(lesson.nextOpening, { nowValue }) : null;

      return {
        started,
        assignment, assignmentTracker, isAttempted, lifecycle, access, recordedGrade,
        activity, classwork, dol,
        disabled: testCycle ? testCycle.key === 'opensLater' : (!done && !actionable),
        feedbackHeld, bucket, questionsTotal, questionsDone, questionsAttempted,
        testCycle,
        // The "Today" rule's answer for this assignment.
        lesson,
        finished: done,
        excused,
        actionable,
        // Where Start/Continue lands: the first unfinished question the
        // student can do now (null when the action is a Recovery or nothing).
        nextQuestionIndex: lesson?.nextQuestionIndex ?? null,
        // 'recovery' when the remaining work is a Recovery on the result page.
        action: recoveryReady ? 'recovery' : null,
        waitText,
      };
    });

  const entries = allEntries.filter(({ assignment }) => (
    assignment.id !== resumeAssignment?.id
    && !activeDolIds.has(assignment.id)
    && !activeWarmupIds.has(assignment.id)
  ));

  return {
    visibleAssignments: visible,
    // The complete list, for surfaces whose job is finding work rather than
    // choosing what to do next. Home must keep reading `entries`.
    allEntries,
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
const resolveNextActionCore = ({ dashboard, weeklyProgress = null } = {}) => {
  // The card prints a due date under the decision, and it has to be this
  // student's: an individualized (extra-time) due date lives on the lifecycle
  // each candidate was bucketed with, not on the assignment's class fields.
  const dueFor = (assignment, lifecycle) => studentDueDates(assignment, lifecycle).dueAt;

  const activeDol = (dashboard?.activeDols || [])[0];
  if (activeDol) {
    // Name the DOL question to open. Without one the card started the
    // assignment at question 0 — a closed Warm-Up — and entry fell through to
    // Classwork Q1, spending the timed DOL on a finished question (live QA,
    // Algebra I DOL #2). `records` is built from these same indices, in order.
    // `records` line up with the student's own DOL items (an accommodation
    // can omit some), so the first not-yet-tried one is read from those.
    const firstUnattempted = activeDol.openQuestionIndices?.[0] ?? firstOpenLiveQuestionIndex({
      indices: activeDol.questionIndices || activeDol.state?.questionIndices || [activeDol.state?.questionIndex],
      records: activeDol.records,
      section: 'dol',
    });
    return {
      kind: 'dol',
      assignment: activeDol.assignment,
      dueAt: dueFor(activeDol.assignment, activeDol.lifecycle),
      questionIndex: firstUnattempted ?? 0,
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
      dueAt: dueFor(activeWarmup.assignment, activeWarmup.lifecycle),
      // The first Warm-Up question still to do, never a finished one.
      questionIndex: firstOpenLiveQuestionIndex({ indices: activeWarmup.questionIndices, records: activeWarmup.records, section: 'warmup' }) ?? 0,
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
      dueAt: dueFor(dashboard.resumeAssignment, dashboard.resumeLifecycle),
      questionIndex: dashboard.resumeQuestionIndex,
      headline: 'Pick up where you left off',
      detail: dashboard.resumeAssignment.title,
      actionLabel: 'Continue',
      urgency: 'now',
    };
  }

  /*
   * ONLY WORK THE STUDENT CAN DO THIS MINUTE IS EVER RECOMMENDED.
   *
   * Every candidate below must be `actionable` under the one "Today" rule:
   * excused work, finished lessons, sections the teacher has locked and
   * Warm-Ups/DOLs outside their window are never the next action. A card that
   * recommended them sent the student into "Nothing open right now".
   * (An entry built by an older caller without the flag stays eligible.)
   */
  const firstActionable = (bucket) => (dashboard?.groups?.[bucket] || [])
    .find((entry) => entry.actionable !== false && !entry.excused && !entry.disabled) || null;
  const entryAction = (entry, fields) => ({
    assignment: entry.assignment,
    dueAt: dueFor(entry.assignment, entry.lifecycle),
    // Where Start/Continue lands: the first unfinished question open now.
    questionIndex: entry.nextQuestionIndex ?? undefined,
    // A Recovery is taken from the assignment's result page.
    opensResult: entry.action === 'recovery',
    ...fields,
    ...(entry.action === 'recovery' ? (entry.lesson?.recoverySection?.recoveryState === 'locked' ? {
      // A locked Recovery is still available (it keeps the lesson open); the
      // next action is the unlock path, on the result page's Recovery panel.
      headline: `Practice to unlock your ${entry.lesson.recoverySection.label} Recovery`,
      detail: `${entry.assignment.title} — a little more Practice unlocks a second try.`,
      actionLabel: 'Open Recovery',
    } : {
      headline: 'A Recovery is ready',
      detail: `${entry.assignment.title} — ${entry.lesson?.recoverySection?.label || 'a closed section'} can be raised with a Recovery.`,
      actionLabel: 'Open Recovery',
    }) : {}),
  });

  const inProgress = firstActionable(BUCKET.IN_PROGRESS);
  if (inProgress) {
    return entryAction(inProgress, {
      kind: 'inProgress',
      headline: 'Finish what you started',
      detail: `${inProgress.assignment.title} — ${inProgress.questionsDone} of ${inProgress.questionsTotal} done`,
      actionLabel: 'Continue',
      urgency: 'now',
    });
  }

  const pastDue = firstActionable(BUCKET.PAST_DUE);
  if (pastDue) {
    return entryAction(pastDue, {
      kind: 'pastDue',
      headline: 'This one is past due',
      // Late, not lost. A student who believes it no longer counts stops.
      detail: `${pastDue.assignment.title} — late work is still open and still counts.`,
      actionLabel: pastDue.questionsAttempted > 0 ? 'Continue' : 'Start it',
      urgency: 'late',
    });
  }

  const dueToday = firstActionable(BUCKET.DO_NOW);
  if (dueToday) {
    return entryAction(dueToday, {
      kind: 'dueToday',
      headline: 'Due today',
      detail: dueToday.assignment.title,
      actionLabel: dueToday.questionsAttempted > 0 ? 'Continue' : 'Start it',
      urgency: 'today',
    });
  }

  // Work that is assigned now does not become invisible just because its due
  // date is tomorrow (or next week). If it is open, it is a legitimate next
  // action and belongs ahead of independent Path work.
  const assignedLater = firstActionable(BUCKET.COMING_UP);
  if (assignedLater) {
    return entryAction(assignedLater, {
      kind: 'assignedLater',
      headline: 'Assigned work is ready',
      detail: assignedLater.assignment.title,
      actionLabel: assignedLater.questionsAttempted > 0 ? 'Continue' : 'Start assignment',
      urgency: 'thisWeek',
    });
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

  /*
   * WAITING IS AN ANSWER, NOT A DEAD END.
   *
   * Unfinished work exists but none of it can be done this minute — a DOL
   * opens at 2:15, the teacher opens Classwork in class, a release date is
   * tomorrow. Say exactly that, with the real time, and offer the one thing
   * that is open: My Math Path. Never a "caught up" celebration above it.
   */
  const waiting = BUCKET_ORDER
    .filter((bucket) => bucket !== BUCKET.COMPLETED && bucket !== BUCKET.PRACTICE)
    .flatMap((bucket) => dashboard?.groups?.[bucket] || [])
    .find((entry) => !entry.excused && entry.finished !== true) || null;
  if (waiting) {
    return {
      kind: 'assignedSoon',
      assignmentId: waiting.assignment.id,
      headline: 'Nothing to start this minute',
      detail: waiting.waitText
        ? `${waiting.assignment.title} — ${waiting.waitText}. My Math Path is open until then.`
        : `${waiting.assignment.title} is assigned but not open yet. My Math Path is open until then.`,
      actionLabel: 'Open My Math Path',
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

/*
 * THE STUDENT'S OWN DEADLINE ON THE ONE PRIMARY CARD.
 *
 * Late work names the student's last day to turn it in — their own, with an
 * extension or individualized date folded in (studentDueDateLines) — not the
 * class due date that has already passed. Before the next-action card became
 * the single primary action, a separate Resume card said this; merging the
 * duplicate must not lose it (private-controls journey P1/P2).
 */
export const resolveNextAction = (args = {}) => {
  const action = resolveNextActionCore(args);
  if (!action?.assignment) return action;
  const dashboard = args.dashboard || {};
  const id = action.assignment.id;
  const lifecycle = (dashboard.allEntries || dashboard.entries || []).find((entry) => entry.assignment?.id === id)?.lifecycle
    || (dashboard.resumeAssignment?.id === id ? dashboard.resumeLifecycle : null)
    || [...(dashboard.activeDols || []), ...(dashboard.activeWarmups || [])].find((live) => live.assignment?.id === id)?.lifecycle
    || null;
  if (!lifecycle?.isLate) return action;
  const lines = studentDueDateLines(action.assignment, lifecycle);
  return { ...action, lateLine: `${lines.finalLabel}: ${lines.finalText}` };
};

/**
 * UP NEXT — the next action once the student is done with `assignmentId`.
 *
 * The continuation bar at the end of an assignment and the result page hand
 * off here, so finishing one piece of work leads to the next one the same
 * "Today" rule would put on Home, never back to the assignment just closed.
 * Null when nothing assigned is actionable (Path and waiting cards are Home's
 * job, not a hand-off).
 */
export const resolveUpNext = ({ dashboard, assignmentId = null } = {}) => {
  if (!dashboard) return null;
  const id = String(assignmentId || '');
  const keep = (entry) => String(entry?.assignment?.id || '') !== id;
  const resumeKept = dashboard.resumeAssignment && String(dashboard.resumeAssignment.id) !== id;
  // The resume assignment is not in Home's groups; put it back as an ordinary
  // entry when it is the one being left, so nothing else is lost.
  const groups = Object.fromEntries(Object.entries(dashboard.groups || {})
    .map(([bucket, entries]) => [bucket, (entries || []).filter(keep)]));
  const next = resolveNextAction({
    dashboard: {
      ...dashboard,
      resumeAssignment: resumeKept ? dashboard.resumeAssignment : null,
      activeDols: (dashboard.activeDols || []).filter(keep),
      activeWarmups: (dashboard.activeWarmups || []).filter(keep),
      groups,
    },
    // Up Next only hands off to assigned work.
    weeklyProgress: { completed: 1, required: 1, remaining: 0 },
  });
  return next?.assignment ? next : null;
};
