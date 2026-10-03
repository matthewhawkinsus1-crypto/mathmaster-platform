"use strict";

const {
  runtimeIncludedQuestionIndicesForSection,
} = require("./assignmentRuntime");
const {
  publicationSectionKey,
  publicationSectionLabel,
} = require("./publication");
const { studentRequiredIndices } = require("./studentWorkloadIndices");

/**
 * One Classroom column's grade for one student.
 *
 * `omittedIndices` (optional) is the Set of items the student's
 * reduced-item-count accommodation omits (functions/lib/studentWorkloadIndices.js):
 * the column's denominator is then the student's own required items, the same
 * one MathMaster shows. A section is never emptied by it — should the omission
 * ever cover a whole section, the full section is graded instead.
 */
function classroomPublicationGrade({
  assignment = {},
  publication = {},
  tracker = {},
  questions = [],
  gradeProgress,
  omittedIndices = null,
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

  return {
    sectionKey,
    sectionLabel: publicationSectionLabel(sectionKey),
    questionIndices,
    ...gradeProgress(tracker, questionIndices, questions),
  };
}

module.exports = {
  classroomPublicationGrade,
};
