"use strict";

/*
 * THE WEEKLY PATH AS A GOOGLE CLASSROOM ASSIGNMENT.
 *
 * One coursework item per class per week. Not one per session: three to five new
 * Classroom posts per student per week would bury everything else a teacher
 * posts, and the thing being graded is the week, not each session inside it.
 *
 * Everything here is pure. No googleapis import, no Firestore, no network. The
 * caller does the I/O; this module decides identity, wording, and the number.
 * That split is what makes the risky part — writing a grade a parent will see —
 * testable without touching a live course.
 *
 * IDENTITY IS THE WHOLE PROBLEM. A scheduled job that runs weekly will be
 * retried, will overlap itself, and will be re-run by hand after a failure. If
 * "the weekly assignment" cannot be recognised, each of those creates another
 * post. So every item carries a marker in its description that encodes exactly
 * one (course, class, week), and the caller finds by marker before creating.
 */

const WEEKLY_PATH_MARKER_PREFIX = "[mathmaster:weekly-path]";

const clean = (value) => String(value ?? "").trim();

/*
 * `Number(null)` is 0 and `Number("")` is 0, so a plain Number.isFinite check
 * treats "this student has no score" as "this student scored zero". That single
 * coercion is the difference between skipping a student and publishing a zero to
 * their family, so every score entering this module goes through here first.
 */
const realNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The stable identity of one class-week, embedded in the coursework description.
 *
 * Written into the post rather than held only in Firestore because Classroom is
 * the shared source of truth between the two systems: a teacher who deletes and
 * recreates our Firestore record must not end up with two live posts, and a
 * marker that lives in the post itself survives that.
 */
function weeklyPathMarker({ classId, weekKey } = {}) {
  const cls = clean(classId);
  const week = clean(weekKey);
  if (!cls || !week) return null;
  return `${WEEKLY_PATH_MARKER_PREFIX}[class:${cls}][week:${week}]`;
}

/**
 * What the student reads in Classroom.
 *
 * Deliberately says the week is a target rather than a list of forced tasks, to
 * match what the Path itself now tells them. A student who opens Classroom and
 * reads something stricter than the app would reasonably believe the app was
 * lying to them.
 */
function weeklyPathDescription({ classId, weekKey, goalSessions, launchUrl } = {}) {
  const marker = weeklyPathMarker({ classId, weekKey });
  if (!marker) return null;
  const sessions = Math.max(0, Number(goalSessions) || 0);
  return [
    `Your Math Path for this week: ${sessions} practice ${sessions === 1 ? "session" : "sessions"}.`,
    "",
    "MathMaster picks what will help you most and tells you why. You can do them in any order,",
    "and on each one you can swap in a different skill if you would rather work on that.",
    "",
    "Open MathMaster to see this week's sessions and your progress.",
    launchUrl ? `\n${launchUrl}` : "",
    "",
    marker,
  ].filter((line) => line !== null).join("\n");
}

function weeklyPathTitle({ weekLabel, weekKey } = {}) {
  const label = clean(weekLabel) || clean(weekKey);
  return label ? `Math Path — week of ${label}` : "Math Path — weekly practice";
}

/**
 * The grade for one student's week, as points out of the coursework maximum.
 *
 * The grading policy itself lives in weeklyPathGoal.js and is shared with the
 * teacher gradebook; this only converts an already-computed 0-100 score onto the
 * Classroom scale, so the two can never disagree about what a student earned.
 */
function weeklyPathPoints({ score, maxPoints = 100 } = {}) {
  const max = Math.max(1, Number(maxPoints) || 100);
  const percent = realNumber(score);
  if (percent === null) return null;
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((clamped / 100) * max * 100) / 100;
}

/**
 * Whether one student's weekly grade may be written right now.
 *
 * Automatic publishing removes the human who used to look at each number before
 * it reached a parent, so the checks that human performed have to be encoded
 * here instead. Each `false` below is a case where publishing would put a number
 * in front of a family that MathMaster itself cannot stand behind.
 */
function weeklyPathPublishDecision({
  enabled = false,
  linked = false,
  weekEnded = false,
  score = null,
  alreadyPublishedScore = null,
  teacherEdited = false,
} = {}) {
  if (!enabled) {
    return { publish: false, reason: "automatic_publishing_not_enabled_for_this_class" };
  }
  if (!linked) {
    return { publish: false, reason: "student_is_not_linked_to_a_classroom_account" };
  }
  if (!weekEnded) {
    return { publish: false, reason: "the_week_is_not_over_yet" };
  }
  if (realNumber(score) === null) {
    return { publish: false, reason: "no_weekly_score_was_computed" };
  }
  // A teacher who changed the grade in Classroom has overruled the platform.
  // Overwriting that on the next scheduled run would make their edit look like
  // it never happened, which is worse than not publishing at all.
  if (teacherEdited) {
    return { publish: false, reason: "a_teacher_already_changed_this_grade_in_classroom" };
  }
  // Idempotency. The job is retried, overlaps itself and gets re-run by hand;
  // none of those should produce a second write of the same number.
  const published = realNumber(alreadyPublishedScore);
  if (published !== null && published === realNumber(score)) {
    return { publish: false, reason: "this_score_is_already_published" };
  }
  return { publish: true, reason: null };
}

/**
 * Everything the caller needs to create or update one class's weekly post.
 *
 * Returns null rather than a half-built request when identity is missing, so a
 * malformed class record can never produce an anonymous post in a real course.
 */
function weeklyPathCourseWork({
  classId,
  weekKey,
  weekLabel = null,
  goalSessions = 0,
  launchUrl = null,
  dueDate = null,
  maxPoints = 100,
  topicId = null,
} = {}) {
  const marker = weeklyPathMarker({ classId, weekKey });
  if (!marker) return null;
  return {
    marker,
    title: weeklyPathTitle({ weekLabel, weekKey }),
    description: weeklyPathDescription({ classId, weekKey, goalSessions, launchUrl }),
    dueDate: dueDate || null,
    maxPoints: Math.max(1, Number(maxPoints) || 100),
    topicId: topicId || null,
  };
}

module.exports = {
  WEEKLY_PATH_MARKER_PREFIX,
  realNumber,
  weeklyPathMarker,
  weeklyPathTitle,
  weeklyPathDescription,
  weeklyPathCourseWork,
  weeklyPathPoints,
  weeklyPathPublishDecision,
};
