"use strict";

/*
 * A COMPLETED PRACTICE-BASED RECOVERY, AS THE CLASSROOM TRIGGERS SEE IT.
 *
 * Both Google Classroom passback triggers (the whole-assignment one in
 * index.js and the section one in classroomSectionEntry.js) compute grades
 * from the canonical tracker. A completed Recovery enters that SAME
 * calculation — never a second grade or a second column — by projecting the
 * recovered section's questions to the recorded score before the grade is
 * computed (functions/shared/sectionRecoveryProjection.mjs). The recorded
 * score is derived from the live original section score, so a teacher's later
 * correction of an original answer still reaches Classroom.
 *
 * Precedence matches the browser: an assignment-level teacher override still
 * replaces the whole grade (applied by the caller after this), a Recovery
 * replaces the recovered section's credit, and per-question overrides inside
 * a recovered section are dropped here because they only shaped the original.
 */

const { runtimeIncludedQuestionIndicesForSection } = require("./assignmentRuntime");

const RECOVERY_SECTIONS = ["warmup", "dol"];

let projectionModule = null;
async function sectionRecoveryProjection() {
  if (!projectionModule) projectionModule = await import("../shared/sectionRecoveryProjection.mjs");
  return projectionModule;
}

function completedRecoverySignature(entry) {
  return JSON.stringify(RECOVERY_SECTIONS.map((section) => {
    const record = entry?.[section];
    return record?.status === "completed"
      ? [section, Number(record.rawScore), Number(record.cap), String(record.type || "")]
      : null;
  }));
}

/**
 * Assignments whose COMPLETED Recovery changed in this write. Practice and
 * in-progress updates do not wake the Classroom triggers; a completion (or a
 * change to a completed record) does.
 */
function recoveryChangedAssignmentIds(afterData = {}, beforeData = {}) {
  const after = afterData?.sectionRecoveryByAssignment || {};
  const before = beforeData?.sectionRecoveryByAssignment || {};
  return [...new Set([...Object.keys(after), ...Object.keys(before)])].filter(
    (assignmentId) => completedRecoverySignature(after[assignmentId]) !== completedRecoverySignature(before[assignmentId])
  );
}

/**
 * The tracker (and per-question overrides) to grade with, after applying any
 * completed Recovery for this assignment. Returns the inputs unchanged when
 * there is none.
 *
 * `gradeProgress(tracker, indices, questions, overrides)` is the caller's own
 * grade function, so the original section score is computed exactly the way
 * that caller computes every other grade.
 */
async function projectRecoveredGradeInputs({
  assignment = {},
  tracker = {},
  questions = [],
  overrides = {},
  recoveryForAssignment = null,
  gradeProgress,
} = {}) {
  if (!recoveryForAssignment || typeof gradeProgress !== "function") return { tracker, overrides, states: {} };
  const projection = await sectionRecoveryProjection();
  const recoveries = projection.completedSectionRecoveries(recoveryForAssignment);
  const sections = Object.keys(recoveries);
  if (!sections.length) return { tracker, overrides, states: {} };

  const sectionIndices = {};
  const sectionOriginals = {};
  sections.forEach((section) => {
    const indices = runtimeIncludedQuestionIndicesForSection(assignment, section);
    sectionIndices[section] = indices;
    const progress = gradeProgress(tracker, indices, questions, overrides || {});
    sectionOriginals[section] = { score: progress.total ? progress.grade : null, attempted: progress.attempted };
  });
  const applied = projection.applySectionRecoveriesToTracker({
    tracker,
    sectionIndices,
    sectionOriginals,
    recoveries,
    assignment,
  });
  const recoveredIndices = new Set(
    Object.keys(applied.states).flatMap((section) => sectionIndices[section] || []).map((index) => String(index))
  );
  const remainingOverrides = Object.fromEntries(
    Object.entries(overrides || {}).filter(([key]) => !recoveredIndices.has(String(key)))
  );
  return { tracker: applied.tracker, overrides: remainingOverrides, states: applied.states };
}

module.exports = {
  RECOVERY_SECTIONS,
  projectRecoveredGradeInputs,
  recoveryChangedAssignmentIds,
};
