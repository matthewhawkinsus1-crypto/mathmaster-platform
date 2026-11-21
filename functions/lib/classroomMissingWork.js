"use strict";

/**
 * NO WORK AT THE DUE DATE IS MISSING, NOT A RETURNED 0 (the owner, 2026-11-19,
 * issue #545).
 *
 * Between the due date and the final cutoff, MathMaster's own screens show a
 * student with nothing attempted as Missing, with no number
 * (src/platform/student/studentGradeCenterModel.js). The due-date wake-up, and
 * a retry or reconcile after the due date, used to assign and return a 0 for
 * them, so Classroom showed a grade MathMaster never gave. Nothing is sent
 * for them now: Classroom marks unsubmitted work past its due date Missing by
 * itself. The final cutoff is unchanged ("final-deadline" still sends what the
 * student earned, a 0 included), and so is an assignment-level teacher grade,
 * which counts as attempted work.
 *
 * `stage` is what resolveClassroomGradeStage answered (either trigger's);
 * `progress` is the column's grade progress. In a module of its own because
 * only the two Classroom grade triggers read it: lib/classroomGradeRuntime.js
 * is loaded by most of the backend.
 */
function noWorkIsMissingNotZero({ stage, progress } = {}) {
  return ["due-checkpoint", "manual-retry"].includes(String(stage || ""))
    && !(Number(progress?.attempted) > 0);
}

/*
 * A TEACHER'S RETRY ON A STUDENT WITH NO WORK SAYS WHY NOTHING WAS SENT.
 *
 * The rule above sends nothing, and by itself writes nothing. A row left
 * "failed" from before would then stay failed, and retryable, with no sign
 * that the Retry was answered. When a Retry reaches such a row it becomes
 * "skipped-no-work", with the reason. Only an existing row, and never one
 * that says Classroom holds a grade ("synced", "graded-not-returned"): that
 * is still true, and stays.
 */
const CLASSROOM_SKIPPED_NO_WORK = "skipped-no-work";
const CLASSROOM_NO_WORK_MESSAGE = "No work yet, so nothing was sent. Google Classroom shows this as Missing until the final cutoff, when the grade is sent.";

function noWorkRetryRowIsDue({ signalReason, priorExists, prior = {} } = {}) {
  return signalReason === "manual-retry"
    && priorExists === true
    && !["synced", "graded-not-returned"].includes(String(prior.status || ""));
}

/** The row's fields; `clearedErrors` is clearedClassroomErrorFields(). */
function noWorkRetryRow({ stage, progress = {}, clearedErrors = {} } = {}) {
  return {
    ...clearedErrors,
    status: CLASSROOM_SKIPPED_NO_WORK,
    stage,
    // No number: this row must never read as a grade that was sent.
    grade: null,
    attempted: Number(progress.attempted) || 0,
    total: Number(progress.total) || 0,
    isFinal: false,
    studentVisible: false,
    returnedToStudent: false,
    message: CLASSROOM_NO_WORK_MESSAGE,
  };
}

module.exports = {
  CLASSROOM_NO_WORK_MESSAGE,
  CLASSROOM_SKIPPED_NO_WORK,
  noWorkIsMissingNotZero,
  noWorkRetryRow,
  noWorkRetryRowIsDue,
};
