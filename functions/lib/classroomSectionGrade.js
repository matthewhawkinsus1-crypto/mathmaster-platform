"use strict";

const {
  runtimeIncludedQuestionIndicesForSection,
} = require("./assignmentRuntime");
const {
  assignmentGradeProgress,
  clampPercent,
  getQuestionCredit,
  questionWasAttempted,
} = require("./classroomGradeRuntime");
const {
  publicationSectionKey,
  publicationSectionLabel,
} = require("./publication");
const { weightedQuestionTotals } = require("./questionWeights");
const { studentRequiredIndices } = require("./studentWorkloadIndices");

/*
 * A TEACHER'S GRADE OVERRIDE, READ AS EVERY OTHER SURFACE READS IT.
 *
 * `grades/{id}.teacherGradeOverridesByAssignment[assignmentId]` holds what a
 * teacher decided: per question, a score for the exact attempt it was issued
 * against (the Response Inspector, overrideStudentResponseGrade), a confirmed
 * section consequence that stands whatever the student does next, and under
 * "__assignment" a score for the whole assignment
 * (overrideStudentAssignmentGrade). The whole-assignment trigger
 * (functions/index.js: teacherOverrideAppliesToRecord, getQuestionCredit,
 * activeAssignmentGradeOverride) and the browser
 * (src/platform/grading/canonicalGradeProjection.js) read them by these
 * rules; the split-section columns graded every question at its automatic
 * score, so a teacher's correction reached the whole-assignment column and
 * never a Warm-Up, Classwork, Practice or DOL column (issue #554, item 1).
 * tests/platform/classroomSectionOverrides.test.mjs holds the three together.
 */
const ASSIGNMENT_GRADE_OVERRIDE_KEY = "__assignment";

function teacherOverrideAppliesToRecord(record, override = null) {
  if (
    !record
    || override?.active !== true
    || !Number.isFinite(Number(override.score))
  ) return false;
  // A confirmed section consequence is a teacher's decision, not a correction
  // of one attempt: a later attempt does not undo it.
  if (override.persistent === true && override.source === "teacher-section-zero") return true;

  const recordAttempts = Number(record.totalAttempts ?? record.attemptCount ?? 0);
  const overrideAttempts = Number(override.totalAttempts);
  if (!Number.isFinite(overrideAttempts) || overrideAttempts !== recordAttempts) return false;

  const recordVariant = Number(record.variantIndex ?? 0);
  const overrideVariant = Number(override.variantIndex);
  if (!Number.isFinite(overrideVariant) || overrideVariant !== recordVariant) return false;

  const overrideSubmissionId = String(override.submissionId || "");
  if (overrideSubmissionId) {
    return overrideSubmissionId === String(record.lastSubmissionId || "");
  }
  const overrideLastAttemptAt = String(override.lastAttemptAt || "");
  return Boolean(overrideLastAttemptAt)
    && overrideLastAttemptAt === String(record.lastAttemptAt || record.academicOccurredAt || "");
}

/** The active assignment-level teacher grade, its score clamped, or null. */
function activeAssignmentGradeOverride(overrides = {}) {
  const override = overrides?.[ASSIGNMENT_GRADE_OVERRIDE_KEY] || null;
  if (override?.active !== true || !Number.isFinite(Number(override.score))) return null;
  return { ...override, score: clampPercent(override.score) };
}

/**
 * assignmentGradeProgress with the teacher's per-question overrides: a
 * question an override applies to earns the override's score, and every
 * other question its automatic credit. Only the credit changes. Which
 * questions were attempted and which are finished are read from the
 * student's own records, as the whole-assignment trigger reads them, so a
 * correction never moves a column between draft and assigned: lowering a
 * correct answer leaves a finished section finished, and full credit on an
 * answer with tries left does not finish it. With no override that applies,
 * this is assignmentGradeProgress itself.
 */
function gradeProgressWithTeacherOverrides(tracker, questionIndices, questions = [], overrides = {}) {
  const progress = assignmentGradeProgress(tracker, questionIndices, questions);
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  const overrideFor = (index) => overrides?.[String(index)] ?? overrides?.[index] ?? null;
  if (!indices.some((index) => teacherOverrideAppliesToRecord(tracker?.[index], overrideFor(index)))) return progress;
  const weighted = weightedQuestionTotals({
    tracker,
    questions,
    indices,
    creditForRecord: (record, index) => (teacherOverrideAppliesToRecord(record, overrideFor(index))
      ? clampPercent(overrideFor(index).score) / 100
      : getQuestionCredit(record)),
    attemptedForRecord: questionWasAttempted,
  });
  return { ...progress, grade: weighted.score ?? 0, creditOnAttempted: weighted.creditOnAttempted };
}

/**
 * An assignment-level teacher grade replaces the column's grade, as it
 * replaces the whole assignment's (functions/index.js) and every section's in
 * the student's Grade Center and in Grade Transfer: the work counts as
 * finished, so the grade is assigned and returned, and later work does not
 * change it. A column a held Recovery is holding is not graded at all.
 */
function withAssignmentGradeOverride(progress, override) {
  return {
    ...progress,
    total: Math.max(1, Number(progress.total) || 0),
    attempted: Math.max(1, Number(progress.attempted) || 0),
    terminal: Math.max(1, Number(progress.terminal) || 0),
    grade: override.score,
    complete: true,
    meaningfulProgress: true,
    minimumProgressQuestions: 1,
  };
}

/**
 * One Classroom column's grade for one student.
 *
 * `omittedIndices` (optional) is the Set of items the student's
 * reduced-item-count accommodation omits (functions/lib/studentWorkloadIndices.js):
 * the column's denominator is then the student's own required items, the same
 * one MathMaster shows. A section is never emptied by it — should the omission
 * ever cover a whole section, the full section is graded instead.
 *
 * `overrides` (optional) are the teacher's per-question overrides, handed to
 * `gradeProgress` as its fourth argument (gradeProgressWithTeacherOverrides
 * reads them); `assignmentGradeOverride` (optional) is an active
 * assignment-level teacher grade, which replaces the column's grade.
 */
function classroomPublicationGrade({
  assignment = {},
  publication = {},
  tracker = {},
  questions = [],
  gradeProgress,
  omittedIndices = null,
  overrides = null,
  assignmentGradeOverride = null,
} = {}) {
  if (typeof gradeProgress !== "function") {
    throw new TypeError("gradeProgress is required.");
  }

  const sectionKey = publicationSectionKey(publication.sectionKey);
  const includedIndices = runtimeIncludedQuestionIndicesForSection(assignment, sectionKey);
  if (sectionKey !== "whole" && includedIndices.length === 0) {
    throw new TypeError(
      `${publicationSectionLabel(sectionKey)} has no included questions and cannot receive a Classroom grade.`
    );
  }
  const questionIndices = studentRequiredIndices(includedIndices, omittedIndices);
  const progress = gradeProgress(tracker, questionIndices, questions, overrides || {});

  return {
    sectionKey,
    sectionLabel: publicationSectionLabel(sectionKey),
    questionIndices,
    ...(assignmentGradeOverride ? withAssignmentGradeOverride(progress, assignmentGradeOverride) : progress),
  };
}

module.exports = {
  ASSIGNMENT_GRADE_OVERRIDE_KEY,
  activeAssignmentGradeOverride,
  classroomPublicationGrade,
  gradeProgressWithTeacherOverrides,
  teacherOverrideAppliesToRecord,
};
