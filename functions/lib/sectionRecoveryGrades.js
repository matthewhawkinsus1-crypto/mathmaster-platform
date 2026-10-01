"use strict";

/*
 * A COMPLETED PRACTICE-BASED RECOVERY — AND A LIVE CHALLENGE WARM-UP RESULT —
 * AS THE CLASSROOM TRIGGERS SEE THEM.
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

// The grade-deciding part of a Live Challenge Warm-Up credit. Mirrors
// warmupChallengeSignature in functions/shared/warmupChallengeGrade.mjs (a test
// holds the two together); synchronous here because the triggers decide
// whether to wake before loading anything.
function warmupChallengeCreditSignature(credit) {
  const available = Number(credit?.roundsAvailable);
  const correct = Number(credit?.correct);
  if (!Number.isFinite(available) || available <= 0 || !Number.isFinite(correct)) return null;
  return `${Math.round(correct)}/${Math.round(available)}`;
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
  const recoveryChanged = [...new Set([...Object.keys(after), ...Object.keys(before)])].filter(
    (assignmentId) => completedRecoverySignature(after[assignmentId]) !== completedRecoverySignature(before[assignmentId])
  );
  // A Live Challenge Warm-Up result is the Warm-Up grade, so a new or changed
  // result wakes the passback too. A rewrite of the same result does not.
  const challengeAfter = afterData?.warmupChallengeByAssignment || {};
  const challengeBefore = beforeData?.warmupChallengeByAssignment || {};
  const challengeChanged = [...new Set([...Object.keys(challengeAfter), ...Object.keys(challengeBefore)])].filter(
    (assignmentId) => warmupChallengeCreditSignature(challengeAfter[assignmentId]) !== warmupChallengeCreditSignature(challengeBefore[assignmentId])
  );
  return [...new Set([...recoveryChanged, ...challengeChanged])];
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
  challengeCredit = null,
  gradeProgress,
} = {}) {
  const hasChallenge = warmupChallengeCreditSignature(challengeCredit) !== null;
  if ((!recoveryForAssignment && !hasChallenge) || typeof gradeProgress !== "function") return { tracker, overrides, states: {} };
  const projection = await sectionRecoveryProjection();
  const recoveries = projection.completedSectionRecoveries(recoveryForAssignment);
  const sections = Object.keys(recoveries);
  if (!sections.length && !hasChallenge) return { tracker, overrides, states: {} };

  const sectionIndices = {};
  const sectionOriginals = {};
  [...new Set([...sections, ...(hasChallenge ? ["warmup"] : [])])].forEach((section) => {
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
    challengeCredit: hasChallenge ? challengeCredit : null,
  });
  // Per-question overrides shaped the original a Recovery or a winning
  // challenge result replaced, so inside those sections they are dropped.
  const replacedSections = [
    ...Object.keys(applied.states),
    ...(applied.challenge?.source === "challenge" ? ["warmup"] : []),
  ];
  const recoveredIndices = new Set(
    replacedSections.flatMap((section) => sectionIndices[section] || []).map((index) => String(index))
  );
  const remainingOverrides = Object.fromEntries(
    Object.entries(overrides || {}).filter(([key]) => !recoveredIndices.has(String(key)))
  );
  return { tracker: applied.tracker, overrides: remainingOverrides, states: applied.states, challenge: applied.challenge || null };
}

module.exports = {
  RECOVERY_SECTIONS,
  projectRecoveredGradeInputs,
  recoveryChangedAssignmentIds,
  warmupChallengeCreditSignature,
};
