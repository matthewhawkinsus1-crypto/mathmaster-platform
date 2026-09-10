"use strict";

const crypto = require("crypto");

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
  return prior.status === "synced"
    && Number(prior.reconciliationVersion || 0) >= CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION
    && String(prior.evidenceFingerprint || "") === String(evidenceFingerprint || "")
    && (!shouldReturn || returnedToStudent);
}

module.exports = {
  CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
  sectionGradeEvidenceFingerprint,
  sectionGradeSyncIsCurrent,
};
