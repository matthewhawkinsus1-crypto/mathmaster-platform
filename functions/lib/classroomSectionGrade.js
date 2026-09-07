"use strict";

const {
  runtimeIncludedQuestionIndicesForSection,
} = require("./assignmentRuntime");
const {
  publicationSectionKey,
  publicationSectionLabel,
} = require("./publication");

function classroomPublicationGrade({
  assignment = {},
  publication = {},
  tracker = {},
  questions = [],
  gradeProgress,
} = {}) {
  if (typeof gradeProgress !== "function") {
    throw new TypeError("gradeProgress is required.");
  }

  const sectionKey = publicationSectionKey(publication.sectionKey);
  const questionIndices = runtimeIncludedQuestionIndicesForSection(assignment, sectionKey);
  if (sectionKey !== "whole" && questionIndices.length === 0) {
    throw new TypeError(
      `${publicationSectionLabel(sectionKey)} has no included questions and cannot receive a Classroom grade.`
    );
  }

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
