"use strict";

const {
  weeklyPathCourseWork,
  weeklyPathPoints,
  weeklyPathPublishDecision,
} = require("./weeklyPathClassroom");

/*
 * PUBLISHING ONE CLASS-WEEK TO GOOGLE CLASSROOM.
 *
 * Every dependency this needs — Classroom calls, the roster, the goals, the
 * grade function — arrives as an argument. That is not ceremony: this is the
 * code that writes a number into a parent's app with no human in the loop, and
 * the only way to test that honestly is to be able to run the whole flow with
 * fakes and assert on exactly which writes it would perform.
 *
 * Two rules shape the whole file.
 *
 * FIRST, IT NEVER WRITES WITHOUT A DECISION. Every grade write is preceded by
 * weeklyPathPublishDecision, which encodes the checks the removed human
 * reviewer used to perform. A skip is recorded with its reason rather than
 * silently dropped, so a teacher asking "why does this student have no grade"
 * gets an answer instead of a shrug.
 *
 * SECOND, IT IS SAFE TO RUN TWICE. Scheduled jobs are retried, overlap
 * themselves, and get re-run by hand after a failure. Finding the coursework by
 * marker and skipping already-published scores means a second run is a no-op
 * rather than a second post and a second notification.
 */

const clean = (value) => String(value ?? "").trim();

const SKIP = Object.freeze({
  NO_GOAL: "no_weekly_goal_for_this_student",
  NO_SUBMISSION: "no_classroom_submission_for_this_student",
});

/**
 * Decide and perform the grade writes for one class-week.
 *
 * Returns a report rather than throwing on individual student failures: one
 * student with a broken Classroom link must not stop the other twenty-nine from
 * getting the grade they earned.
 */
async function syncWeeklyPathClassWeek({
  classId,
  weekKey,
  weekLabel = null,
  courseId,
  enabled = false,
  maxPoints = 100,
  launchUrl = null,
  students = [],
  goalsByStudentId = {},
  completionsByStudentId = {},
  publishedByStudentId = {},
  truncated = false,
  now = Date.now(),
  dryRun = false,
  // Injected I/O.
  findCourseWork,
  createCourseWork,
  findSubmission,
  patchGrade,
  returnSubmission,
  gradeWeeklyGoal,
  logger = null,
} = {}) {
  const work = weeklyPathCourseWork({
    classId, weekKey, weekLabel, launchUrl, maxPoints,
    goalSessions: Object.values(goalsByStudentId)[0]?.goalSessions || 0,
  });
  if (!work) {
    return { ok: false, reason: "incomplete_class_week_identity", results: [] };
  }
  if (!clean(courseId)) {
    return { ok: false, reason: "class_is_not_linked_to_a_google_classroom_course", results: [] };
  }

  // A partial read of the week would produce grades that are quietly too low —
  // the kind of wrong number nobody reports as a bug. Refuse the whole run.
  if (truncated) {
    return { ok: false, reason: "weekly_completion_data_was_truncated", results: [] };
  }

  let courseWork = await findCourseWork(courseId, work.marker);
  let created = false;
  if (!courseWork) {
    if (dryRun) {
      return { ok: true, dryRun: true, wouldCreateCourseWork: true, courseWorkId: null, results: [] };
    }
    courseWork = await createCourseWork(courseId, work);
    created = true;
    logger?.info?.("Created weekly Path coursework", { classId, weekKey, courseId, courseWorkId: courseWork?.id });
  }

  const courseWorkId = clean(courseWork?.id);
  if (!courseWorkId) {
    return { ok: false, reason: "classroom_did_not_return_a_coursework_id", results: [] };
  }

  const results = [];
  for (const student of students) {
    const studentId = clean(student?.studentId || student?.id);
    if (!studentId) continue;
    const googleUserId = clean(student?.googleUserId);
    const goal = goalsByStudentId[studentId] || null;

    if (!goal) {
      results.push({ studentId, published: false, reason: SKIP.NO_GOAL });
      continue;
    }

    const graded = gradeWeeklyGoal({
      goal,
      completions: completionsByStudentId[studentId] || [],
      now,
    });
    const score = graded?.grade;
    const previous = publishedByStudentId[studentId] || null;

    // A submission read before every write, so a teacher's own edit is seen as
    // an edit rather than as our own last value.
    let submission = null;
    if (googleUserId) {
      submission = await findSubmission({ courseId, courseWorkId, googleUserId });
    }
    const currentGrade = submission
      ? (submission.assignedGrade ?? submission.draftGrade ?? null)
      : null;
    const lastPublishedPoints = previous ? previous.points : null;
    const teacherEdited = currentGrade !== null
      && lastPublishedPoints !== null
      && Number(currentGrade) !== Number(lastPublishedPoints);

    const points = weeklyPathPoints({ score, maxPoints: work.maxPoints });
    const decision = weeklyPathPublishDecision({
      enabled,
      linked: Boolean(googleUserId),
      weekEnded: Boolean(goal?.dueAt) && now > Number(goal.dueAt),
      score,
      alreadyPublishedScore: lastPublishedPoints,
      teacherEdited,
    });

    if (!decision.publish) {
      results.push({ studentId, published: false, reason: decision.reason, score: score ?? null });
      continue;
    }
    if (!submission) {
      results.push({ studentId, published: false, reason: SKIP.NO_SUBMISSION, score });
      continue;
    }
    if (dryRun) {
      results.push({ studentId, published: false, reason: "dry_run", score, points });
      continue;
    }

    try {
      await patchGrade({ courseId, courseWorkId, submissionId: submission.id, grade: points });
      await returnSubmission({ courseId, courseWorkId, submissionId: submission.id });
      results.push({ studentId, published: true, score, points, courseWorkId });
    } catch (error) {
      // One broken link must not cost the rest of the class their grade.
      logger?.error?.("Weekly Path grade write failed for one student", {
        classId, weekKey, studentId, message: error?.message || String(error),
      });
      results.push({ studentId, published: false, reason: "classroom_rejected_the_grade_write", score });
    }
  }

  return {
    ok: true,
    classId,
    weekKey,
    courseId,
    courseWorkId,
    createdCourseWork: created,
    published: results.filter((entry) => entry.published).length,
    skipped: results.filter((entry) => !entry.published).length,
    results,
  };
}

module.exports = { SKIP, syncWeeklyPathClassWeek };
