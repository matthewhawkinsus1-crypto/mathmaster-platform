"use strict";

const crypto = require("crypto");
const { CLASSROOM_GRADED_NOT_RETURNED } = require("./classroomPushErrors");

// Increment whenever the section passback derivation or its durable audit
// contract changes. A row stamped by an older implementation is evidence that
// a request once succeeded, not evidence that its grade is still correct.
const CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION = 1;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sectionGradeEvidenceFingerprint({
  assignmentId,
  publicationId,
  sectionKey,
  questionIndices = [],
  tracker = {},
  grade,
  classroomGrade,
  maxPoints,
  stage,
  studentVisible,
} = {}) {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  const sectionTracker = Object.fromEntries(indices.map((index) => [String(index), tracker?.[index] ?? null]));
  const canonical = stableValue({
    assignmentId: String(assignmentId || ""),
    publicationId: String(publicationId || ""),
    sectionKey: String(sectionKey || ""),
    questionIndices: indices,
    sectionTracker,
    grade: Number(grade),
    classroomGrade: Number(classroomGrade),
    maxPoints: Number(maxPoints),
    stage: String(stage || ""),
    studentVisible: Boolean(studentVisible),
  });
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function sectionGradeSyncIsCurrent({
  prior = {},
  evidenceFingerprint,
  returnedToStudent = false,
  shouldReturn = false,
} = {}) {
  const sameEvidence = Number(prior.reconciliationVersion || 0) >= CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION
    && String(prior.evidenceFingerprint || "") === String(evidenceFingerprint || "");
  if (!sameEvidence) return false;
  if (prior.status === "synced") return !shouldReturn || returnedToStudent;
  // Classroom holds this same grade and refused to return it. Sending it again
  // would only be refused again; the next change to this column's evidence, or
  // a teacher's retry, sends it and asks again if the submission has changed
  // (lib/classroomPushErrors.js).
  return prior.status === CLASSROOM_GRADED_NOT_RETURNED;
}

/**
 * FOR A RECONCILE: DOES CLASSROOM ALREADY HOLD THIS GRADE, WHATEVER THE LAST
 * PUSH WAS CALLED?
 *
 * The evidence fingerprint includes the push's stage label. A reconcile
 * resolves to the stage "manual-retry", so a column last sent as
 * "progress-50", "late-progress-50" or "due-checkpoint" never matched: the
 * first reconcile sent every unfinished column again with the same grade,
 * over anything a teacher had typed in Classroom, and called it repaired
 * (issue #545, option A). For a reconcile the label is left out. The column
 * is current when Classroom was last sent the same grade, the same points
 * out of the same maximum, with the same visibility to the student, and the
 * return state the release asks for. Its row, stage included, is then left
 * as it is.
 */
function sectionGradeHeldByClassroom({
  prior = {},
  grade,
  classroomGrade,
  maxPoints,
  studentVisible = false,
  returnedToStudent = false,
  shouldReturn = false,
} = {}) {
  if (Number(prior.reconciliationVersion || 0) < CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION) return false;
  if (!["synced", CLASSROOM_GRADED_NOT_RETURNED].includes(prior.status)) return false;
  const same = (a, b) => Number.isFinite(Number(a)) && Number(a) === Number(b);
  if (prior.grade == null || !same(prior.grade, grade)) return false;
  if (prior.classroomGrade == null || !same(prior.classroomGrade, classroomGrade)) return false;
  if (!same(prior.maxPoints, maxPoints)) return false;
  if (Boolean(prior.studentVisible) !== Boolean(studentVisible)) return false;
  if (prior.status === "synced") return !shouldReturn || returnedToStudent;
  // Saved, and its return refused: asked again only by a teacher's Retry.
  return true;
}

module.exports = {
  CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
  sectionGradeHeldByClassroom,
  sectionGradeEvidenceFingerprint,
  sectionGradeSyncIsCurrent,
};
