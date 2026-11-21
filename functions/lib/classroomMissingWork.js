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

module.exports = { noWorkIsMissingNotZero };
