"use strict";

function runtimeQuestionsFromAssignment(assignment = {}) {
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) return [];
  if (Number(assignment.schemaVersion) !== 5) return [];
  const sections = Array.isArray(assignment.sections) ? assignment.sections : [];
  return sections.flatMap((section) => {
    const questions = Array.isArray(section?.questions) ? section.questions : [];
    return questions.map((question) => ({
      ...question,
      activityRole: question?.activityRole || section?.role || "classwork",
      sectionId: section?.id || null,
      sectionTitle: section?.title || null,
    }));
  });
}

function runtimeQuestionCount(assignment = {}) {
  return runtimeQuestionsFromAssignment(assignment).length;
}

function runtimeIncludedQuestionIndices(assignment = {}) {
  return runtimeQuestionsFromAssignment(assignment).reduce((indices, question, index) => {
    if (question?.teacherExcluded !== true) indices.push(index);
    return indices;
  }, []);
}

function runtimeIncludedQuestionCount(assignment = {}) {
  return runtimeIncludedQuestionIndices(assignment).length;
}

module.exports = {
  runtimeQuestionsFromAssignment,
  runtimeQuestionCount,
  runtimeIncludedQuestionIndices,
  runtimeIncludedQuestionCount,
};
