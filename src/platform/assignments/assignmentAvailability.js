import {
  assignmentIsForStudent,
  getAssignmentDate,
  getAssignmentLifecycle,
  getDOLInstructionDateKey,
  getWarmupInstructionDateKey,
  localDateKey,
  prerequisiteAccess,
} from '../../assignmentLifecycle.js';
import { isArchived } from '../../assignmentSmartViews.js';
import { AUTHORING_STATES } from '../preflight/assignmentAuthoringState.js';
import { normalizeGradingPeriodSettings, resolveAssignmentGradingPeriod } from '../student/gradingPeriods.js';

/*
 * WHO CAN OPEN THIS ASSIGNMENT RIGHT NOW — ONE ANSWER FOR STUDENTS AND TEACHERS.
 *
 * Before this file the student dashboard decided "locked" and "can resume"
 * inline, and Live Classroom's Walkthrough decided "offerable" with nothing but
 * the class-membership check. The two disagreed: Walkthrough offered Period 1 a
 * lesson from last marking period, or one that had not released, that no
 * Period 1 student could open. Both now ask this file.
 *
 *   studentAssignmentAvailability   what a student in `classId` can do with the
 *                                   assignment: is it theirs, is it open to them
 *                                   (release date / prerequisite), does work
 *                                   still count, or is it practice-only.
 *                                   buildStudentDashboardModel derives its
 *                                   "locked" card and its Resume rule from it.
 *
 *   walkthroughEligibility          a STRICTER, class-level question: is this
 *                                   live work the selected class is doing now?
 *                                   It starts from the student answer (with no
 *                                   individual prerequisite credit — the class,
 *                                   not one student) and adds the teacher-facing
 *                                   rules: current marking period, not archived,
 *                                   not an unpublished draft, not past its final
 *                                   cutoff. Anything Walkthrough offers is
 *                                   therefore something every student in that
 *                                   class can open.
 *
 * WHAT IS DELIBERATELY NOT A RULE HERE
 *
 *   - `dueDate >= now`. Late work is still credit-eligible work (lifecycle
 *     status 'late'), and a class may well be finishing it today. Only the
 *     final cutoff (`lateDueAt`), after which the assignment becomes voluntary
 *     practice, removes it.
 *   - The title or the course name. Audience is `assignedClassIds` only
 *     (assignmentIsForStudent); "Algebra I" in a title proves nothing.
 *   - A teacher's per-class Classwork/Practice lock. That is a live toggle the
 *     teacher flips during the lesson (Classwork may be authored to start
 *     locked), not a property that makes the assignment someone else's.
 */

export const AVAILABILITY_REASON = Object.freeze({
  AVAILABLE: 'available',
  NOT_ASSIGNED: 'notAssignedToClass',
  SCHEDULED: 'scheduled',
  PREREQUISITE: 'prerequisiteRequired',
  PRACTICE_ONLY: 'practiceOnly',
  ARCHIVED: 'archived',
  DRAFT: 'draft',
  OTHER_MARKING_PERIOD: 'otherMarkingPeriod',
  MISSING: 'missing',
});

const clean = (value) => String(value ?? '').trim();

/**
 * What a student in `classId` can do with `assignment` at `nowValue`.
 *
 * `lifecycleOf` / `prerequisiteOf` default to the real rules; the student
 * dashboard passes the implementations it was handed so its tests can still
 * inject them, and the decision itself stays here.
 */
export const studentAssignmentAvailability = ({
  assignment,
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  studentId = null,
  classworkGradesByAssignment = {},
  isForStudent = assignmentIsForStudent,
  lifecycleOf = getAssignmentLifecycle,
  prerequisiteOf = prerequisiteAccess,
} = {}) => {
  if (!assignment) {
    return { assigned: false, open: false, workable: false, creditEligible: false, practiceOnly: false, lifecycle: null, access: null, reason: AVAILABILITY_REASON.MISSING };
  }
  const assigned = Boolean(isForStudent(assignment, { classId, classPeriod }));
  const lifecycle = studentId ? lifecycleOf(assignment, nowValue, { studentId }) : lifecycleOf(assignment, nowValue);
  const access = prerequisiteOf({ assignment, classworkGradesByAssignment, nowValue });
  // The dashboard's "locked card" rule, verbatim: a release date in the future
  // locks the card unless the student unlocked it by meeting a prerequisite;
  // an unmet prerequisite locks it until automatic release.
  const locked = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
  const open = assigned && !locked;
  const practiceOnly = Boolean(lifecycle.isPracticeOnly);
  let reason = AVAILABILITY_REASON.AVAILABLE;
  if (!assigned) reason = AVAILABILITY_REASON.NOT_ASSIGNED;
  else if (locked) reason = access.reason === 'prerequisiteRequired' ? AVAILABILITY_REASON.PREREQUISITE : AVAILABILITY_REASON.SCHEDULED;
  else if (practiceOnly) reason = AVAILABILITY_REASON.PRACTICE_ONLY;
  return {
    assigned,
    // The student can open it (possibly as voluntary practice).
    open,
    // The student can open it AND the work still counts: what Resume offers.
    workable: open && !practiceOnly,
    creditEligible: open && Boolean(lifecycle.creditEligible),
    practiceOnly,
    locked,
    lifecycle,
    access,
    reason,
  };
};

const DRAFT_AUTHORING_STATES = new Set([AUTHORING_STATES.INCOMPLETE, AUTHORING_STATES.NEEDS_REVIEW]);

/**
 * An assignment that exists in `assignments` but is explicitly marked as an
 * unfinished authoring draft. Assignments written before authoringState existed
 * carry no state and are published (isAssignmentEligibleForNormalLibrary uses
 * the same backward-compatible reading). A library item with no classes is
 * caught earlier, by the audience rule.
 */
export const isUnpublishedDraft = (assignment = null) => {
  const state = clean(assignment?.authoringState || assignment?.authoringReview?.state);
  return Boolean(state) && DRAFT_AUTHORING_STATES.has(state);
};

/**
 * Is `assignment` live work for the class `classId` right now?
 *
 * Returns { eligible, reason, availability, gradingPeriod }. `gradingPeriodSettings`
 * may be raw or normalized; a missing document normalizes to the single
 * "current" bucket every un-stamped assignment already lives in, so a school
 * that never configured marking periods loses nothing.
 */
export const walkthroughEligibility = ({
  assignment,
  classId,
  nowValue = Date.now(),
  gradingPeriodSettings = null,
} = {}) => {
  const id = clean(classId);
  if (!assignment) return { eligible: false, reason: AVAILABILITY_REASON.MISSING, availability: null, gradingPeriod: null };
  // Class-level: no individual prerequisite credit and no per-student
  // extension. A lesson one student unlocked early is not the class's lesson.
  const availability = studentAssignmentAvailability({ assignment, classId: id || null, nowValue });
  const fail = (reason, extra = {}) => ({ eligible: false, reason, availability, gradingPeriod: null, ...extra });
  if (!id || !availability.assigned) return fail(AVAILABILITY_REASON.NOT_ASSIGNED);
  if (isUnpublishedDraft(assignment)) return fail(AVAILABILITY_REASON.DRAFT);
  if (isArchived(assignment)) return fail(AVAILABILITY_REASON.ARCHIVED);
  const settings = normalizeGradingPeriodSettings(gradingPeriodSettings || {});
  const gradingPeriod = resolveAssignmentGradingPeriod(assignment, settings);
  // Only a KNOWN current period can rule work out. With none configured (or
  // the settings read failed and normalized to nothing) every assignment would
  // otherwise look "not current" and an unreadable settings document would
  // empty Walkthrough for the whole school.
  if (settings.currentPeriodId && !gradingPeriod.isCurrent) return fail(AVAILABILITY_REASON.OTHER_MARKING_PERIOD, { gradingPeriod });
  if (!availability.open) return fail(availability.reason, { gradingPeriod });
  if (availability.practiceOnly) return fail(AVAILABILITY_REASON.PRACTICE_ONLY, { gradingPeriod });
  return { eligible: true, reason: AVAILABILITY_REASON.AVAILABLE, availability, gradingPeriod };
};

const timeOf = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null);
const createdTime = (assignment) => {
  const parsed = Date.parse(assignment?.createdAt?.toDate ? assignment.createdAt.toDate().toISOString() : assignment?.createdAt || '');
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Teacher-facing order within the (small) eligible set: the lesson being taught
 * TODAY first (its Warm-Up or DOL is scheduled for this class today), then work
 * still before its due date ahead of work in its late window, then the most
 * recently released, then the nearest due date. Never alphabetical-first and
 * never oldest-created-first.
 */
const walkthroughRank = (assignment, { classId, classPeriod, todayKey, nowValue }) => {
  const taughtToday = [getWarmupInstructionDateKey(assignment, classPeriod, classId), getDOLInstructionDateKey(assignment, classPeriod, classId)]
    .some((key) => key && key === todayKey);
  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  return {
    taughtToday,
    late: Boolean(lifecycle.isLate),
    released: timeOf(getAssignmentDate(assignment, 'release')) ?? createdTime(assignment) ?? 0,
    due: timeOf(lifecycle.dueAt) ?? Number.POSITIVE_INFINITY,
    title: clean(assignment?.title),
    id: clean(assignment?.id),
  };
};

export const compareWalkthroughAssignments = (left, right) => (
  Number(right.rank.taughtToday) - Number(left.rank.taughtToday)
  || Number(left.rank.late) - Number(right.rank.late)
  || right.rank.released - left.rank.released
  || (left.rank.due === right.rank.due ? 0 : left.rank.due < right.rank.due ? -1 : 1)
  || left.rank.title.localeCompare(right.rank.title)
  || left.rank.id.localeCompare(right.rank.id)
);

/**
 * The assignments Walkthrough (and Live Teaching) may offer for one class,
 * most relevant first. With no class there is nothing to offer: there is no
 * global fallback, because a global list is exactly the bug this replaces.
 */
export const walkthroughAssignmentsForClass = ({
  assignments = [],
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  gradingPeriodSettings = null,
} = {}) => {
  const id = clean(classId);
  if (!id) return [];
  const settings = normalizeGradingPeriodSettings(gradingPeriodSettings || {});
  const todayKey = localDateKey(nowValue);
  const seen = new Set();
  return (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => {
      const key = clean(assignment?.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return walkthroughEligibility({ assignment, classId: id, nowValue, gradingPeriodSettings: settings }).eligible;
    })
    .map((assignment) => ({ assignment, rank: walkthroughRank(assignment, { classId: id, classPeriod, todayKey, nowValue }) }))
    .sort(compareWalkthroughAssignments)
    .map(({ assignment }) => assignment);
};

/**
 * The selection to show after the options change (a class switch, an
 * assignment closing, a snapshot). A selection survives only if it is still
 * offered; otherwise it is cleared — never swapped for another class's work.
 */
export const resolveWalkthroughSelection = ({ eligibleAssignments = [], selectedId = null } = {}) => {
  const id = clean(selectedId);
  if (!id) return null;
  return (eligibleAssignments || []).some((assignment) => clean(assignment?.id) === id) ? id : null;
};

/**
 * May a saved Live Teaching / Walkthrough session (walkthroughSessions/{id})
 * come back? Only when it is active, belongs to this teacher, names exactly the
 * class (and assignment, when one is requested) being taught, and that
 * assignment is still live work for that class. Anything else — another
 * class, an archived lesson, last marking period, an assignment the class was
 * never given — is refused with a reason so the caller can retire the record.
 */
export const validatePersistedWalkthroughSession = ({
  session,
  classId,
  assignmentId = null,
  teacherUid = null,
  assignments = [],
  nowValue = Date.now(),
  gradingPeriodSettings = null,
} = {}) => {
  if (!session || typeof session !== 'object') return { valid: false, reason: 'missing' };
  if (session.active !== true) return { valid: false, reason: 'inactive' };
  if (!clean(classId) || clean(session.classId) !== clean(classId)) return { valid: false, reason: 'otherClass' };
  if (assignmentId && clean(session.assignmentId) !== clean(assignmentId)) return { valid: false, reason: 'otherAssignment' };
  if (teacherUid && clean(session.ownerUid) && clean(session.ownerUid) !== clean(teacherUid)) return { valid: false, reason: 'otherTeacher' };
  const assignment = (Array.isArray(assignments) ? assignments : [])
    .find((entry) => clean(entry?.id) === clean(session.assignmentId)) || null;
  if (!assignment) return { valid: false, reason: AVAILABILITY_REASON.MISSING };
  const eligibility = walkthroughEligibility({ assignment, classId, nowValue, gradingPeriodSettings });
  return eligibility.eligible ? { valid: true, reason: AVAILABILITY_REASON.AVAILABLE } : { valid: false, reason: eligibility.reason };
};
