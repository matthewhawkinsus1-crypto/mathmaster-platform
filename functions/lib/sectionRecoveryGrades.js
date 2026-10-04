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
const { studentRequiredIndices } = require("./studentWorkloadIndices");

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

// A Recovery score that exists: Number(null) is 0, and null means "none".
function recoveryScoreOf(record) {
  const raw = record?.rawScore;
  return raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
}

function completedRecoverySignature(entry) {
  return JSON.stringify(RECOVERY_SECTIONS.map((section) => {
    const record = entry?.[section];
    if (record?.status === "held") return [section, "held"];
    return record?.status === "completed"
      ? [section, recoveryScoreOf(record), Number(record.cap), String(record.type || "")]
      : null;
  }));
}

/**
 * Assignments whose COMPLETED or HELD Recovery changed in this write. Practice
 * and in-progress updates do not wake the Classroom triggers; a completion, a
 * hold (so the triggers record that the grade is held) and a teacher's
 * resolution of a hold do.
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
 *
 * `omittedIndices` is the Set of items the student's reduced-item-count
 * accommodation omits (functions/lib/studentWorkloadIndices.js). The section
 * original is then the student's own required items — the same denominator
 * the caller grades with — and a Recovery credits only those. Without it every
 * included item counts, as before.
 */
async function projectRecoveredGradeInputs({
  assignment = {},
  tracker = {},
  questions = [],
  overrides = {},
  recoveryForAssignment = null,
  challengeCredit = null,
  gradeProgress,
  omittedIndices = null,
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
    const indices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(assignment, section), omittedIndices);
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

/** The sections of one assignment whose Recovery is HELD for a teacher. */
function heldRecoverySections(recoveryForAssignment = null) {
  return RECOVERY_SECTIONS.filter((section) => recoveryForAssignment?.[section]?.status === "held");
}

/*
 * IS THIS CLASSROOM COLUMN WAITING ON A HELD RECOVERY?
 *
 * A held Recovery is a submitted Recovery MathMaster could not grade well
 * enough to score (functions/shared/sectionRecoveryEvidence.mjs). Its section
 * may still move — a teacher can finalize it, replace a question, or keep the
 * original — so neither trigger may send that section's grade, or the whole
 * assignment's, to Google Classroom as if it were settled: not as a zero, not
 * as the original, and never as final. Each trigger asks this BEFORE any
 * Classroom write, records a `recovery-held` audit row instead, and resumes on
 * its own when the record changes (recoveryChangedAssignmentIds wakes it).
 *
 *   sectionKey "whole"     held when ANY section's Recovery is held — unless
 *                          an assignment-level teacher override already
 *                          decided the whole grade (it outranks a Recovery)
 *   "warmup" / "dol"       held when that section's Recovery is held
 *   any other section      never held: a Recovery does not touch it
 */
function recoveryPassbackHold({ recoveryForAssignment = null, sectionKey = "whole", assignmentGradeOverride = null } = {}) {
  const held = heldRecoverySections(recoveryForAssignment);
  if (!held.length) return { held: false, sections: [] };
  const key = String(sectionKey || "whole").trim().toLowerCase();
  if (key === "whole") {
    return assignmentGradeOverride ? { held: false, sections: [] } : { held: true, sections: held };
  }
  return held.includes(key) ? { held: true, sections: [key] } : { held: false, sections: [] };
}

const RECOVERY_HELD_SYNC_MESSAGE = "A Practice-based Recovery is held for teacher review: MathMaster could not grade one or more of its questions. Classroom passback waits until the teacher resolves it.";

module.exports = {
  RECOVERY_HELD_SYNC_MESSAGE,
  RECOVERY_SECTIONS,
  heldRecoverySections,
  projectRecoveredGradeInputs,
  recoveryChangedAssignmentIds,
  recoveryPassbackHold,
  warmupChallengeCreditSignature,
};
