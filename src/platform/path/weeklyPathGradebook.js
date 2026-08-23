import { GRADING_POLICY, buildTeacherWeeklyView, normalizeGradingPolicy } from './weeklyPathGoal.js';
import { finiteNumber } from '../utils/numeric.js';

/*
 * THE WEEKLY PATH GRADE, AS A GRADEBOOK LINE — AND AS A THING A TEACHER
 * DELIBERATELY PUBLISHES.
 *
 * Two rules shape this file, and they pull in opposite directions.
 *
 * The first: the weekly Path grade is a real grade. It goes in the gradebook, a
 * student can see it, and it is 80% completion and 20% quality, with a floor
 * that guarantees a student who did everything asked of them passes. That floor
 * is the honest part of the policy — a weekly practice grade that can punish a
 * student for finding the work hard is a grade that teaches them to avoid the
 * work.
 *
 * The second:
 *
 *   "Prepare this architecture for Google Classroom grade sync where
 *    appropriate, but do not automatically publish grades to Classroom without
 *    the teacher's existing publication/grade-sync rules."
 *
 * So this module produces a PROPOSAL and never a side effect. It has no
 * Firestore import, no callable, no network. `prepareClassroomSync` returns
 * exactly the payload a teacher would be publishing, marked `requiresApproval`,
 * with the reason it needs approval attached — and there is no code path from
 * here to a Classroom write. That is deliberate: a grade that appears in a
 * parent's app because a background job decided a week had ended is a grade
 * nobody chose to give.
 */

const list = (value) => (Array.isArray(value) ? value : []);

export const SYNC_STATE = Object.freeze({
  NOT_READY: 'notReady',
  READY_FOR_REVIEW: 'readyForReview',
  BLOCKED: 'blocked',
});

/**
 * One gradebook row per student for the current week.
 *
 * Deliberately shaped like the assignment rows beside it — a score, what it is
 * out of, and the completion facts underneath — so a teacher reads it the same
 * way they read everything else in the column.
 */
export const weeklyPathGradebookRows = ({
  students = [], goalsByStudentId = {}, completionsByStudentId = {},
  learningProfilesByStudentId = {}, now = Date.now(),
} = {}) => buildTeacherWeeklyView(
  list(students).map((student) => ({
    studentId: student.id,
    studentName: student.displayName || student.name || String(student.id),
    goal: goalsByStudentId[student.id]
      // A student whose plan has not been built yet still needs a row, so the
      // teacher sees "not started" rather than a student who has vanished.
      || { goalSessions: 0, profile: learningProfilesByStudentId[student.id] || null },
    completions: completionsByStudentId[student.id] || [],
  })),
  { now },
);

/**
 * Why a row is or is not ready to leave MathMaster.
 *
 * The blocking conditions are the ones where publishing would put a number in
 * front of a parent that MathMaster itself does not stand behind.
 */
export const syncReadiness = ({
  rows = [], weekComplete = false, progressTruncated = false, classroomLinked = false,
} = {}) => {
  if (progressTruncated) {
    return {
      state: SYNC_STATE.BLOCKED,
      reason: 'This week’s Path activity could not be read in full, so these grades may be lower than the real figures. Nothing should be published until that is resolved.',
    };
  }
  if (!classroomLinked) {
    return {
      state: SYNC_STATE.NOT_READY,
      reason: 'This class is not linked to a Google Classroom course, so there is nowhere to publish these grades.',
    };
  }
  if (!weekComplete) {
    return {
      state: SYNC_STATE.NOT_READY,
      reason: 'The week is not over. Grades can be published early, but a student who finishes on Friday would be graded on Wednesday’s work.',
    };
  }
  if (!list(rows).length) {
    return { state: SYNC_STATE.NOT_READY, reason: 'No students have a weekly goal for this week.' };
  }
  return {
    state: SYNC_STATE.READY_FOR_REVIEW,
    reason: 'Ready for you to review and publish. MathMaster will not send these on its own.',
  };
};

/**
 * The exact payload a teacher would be publishing, and nothing else.
 *
 * Returns a proposal object. There is no function in this module that sends it.
 * The `requiresApproval: true` field is not advisory — the callable that
 * eventually accepts one of these is expected to refuse a payload without a
 * recorded teacher action, the same way every other publication path in this
 * platform does.
 */
export const prepareClassroomSync = ({
  classId = null, weekKey = null, rows = [], policy = GRADING_POLICY,
  weekComplete = false, progressTruncated = false, classroomLinked = false,
} = {}) => {
  const resolved = normalizeGradingPolicy(policy);
  const readiness = syncReadiness({ rows, weekComplete, progressTruncated, classroomLinked });

  return {
    classId,
    weekKey,
    // Always true. This module cannot produce an auto-publishing payload,
    // because there is no branch here that sets it to false.
    requiresApproval: true,
    state: readiness.state,
    reason: readiness.reason,
    policy: {
      completionWeight: resolved.completionWeight,
      qualityWeight: resolved.qualityWeight,
      fullCompletionFloor: resolved.fullCompletionFloor,
      passingGrade: resolved.passingGrade,
      // Sent with the payload so the receiving system records WHY a number is
      // what it is. A grade that arrives with no policy attached is a grade
      // nobody can defend at a parent conference.
      description: `${Math.round(resolved.completionWeight * 100)}% completion and ${Math.round(resolved.qualityWeight * 100)}% quality. A student who completes every assigned session scores at least ${resolved.fullCompletionFloor}%.`,
    },
    grades: list(rows)
      // A student with no goal has nothing to publish. Sending them a zero
      // would be inventing a grade for work never assigned.
      .filter((row) => Number(row.goal) > 0)
      .map((row) => ({
        studentId: row.studentId,
        score: finiteNumber(row.grade),
        outOf: 100,
        completed: row.complete,
        required: row.goal,
        // Carried so the teacher's review screen can show completion and
        // performance apart, which is the whole point of the policy.
        passing: row.passing,
      })),
  };
};

export default weeklyPathGradebookRows;
