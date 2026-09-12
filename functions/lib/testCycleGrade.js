"use strict";

const { runtimeQuestionsFromAssignment } = require("./assignmentRuntime");

function clean(value) {
  return String(value ?? "").trim();
}

function clampScore(value, fallback = 70) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(100, numeric))
    : fallback;
}

function isTestCycleAssignment(assignment = {}) {
  return clean(assignment?.assessmentPolicy?.mode) === "testCycle";
}

function retestFeedbackWasReleased(assignment = {}) {
  return assignment?.assessmentRetestFeedbackReleased === true
    || Boolean(assignment?.assessmentRetestFeedbackReleasedAt);
}

function roleQuestionIndices(assignment = {}, role = "") {
  const wanted = clean(role).toLowerCase();
  return runtimeQuestionsFromAssignment(assignment).reduce((indices, question, index) => {
    if (
      question?.teacherExcluded !== true
      && clean(question?.activityRole).toLowerCase() === wanted
    ) {
      indices.push(index);
    }
    return indices;
  }, []);
}

function testCycleGradeProgress({
  assignment = {},
  tracker = {},
  questions = runtimeQuestionsFromAssignment(assignment),
  gradeProgress,
} = {}) {
  if (!isTestCycleAssignment(assignment)) return null;
  if (typeof gradeProgress !== "function") {
    throw new TypeError("gradeProgress is required.");
  }

  const testIndices = roleQuestionIndices(assignment, "test");
  const retestIndices = roleQuestionIndices(assignment, "retest");
  if (!testIndices.length) {
    throw new TypeError("Test Cycle has no included Test questions.");
  }

  const test = gradeProgress(tracker, testIndices, questions);
  const retest = retestIndices.length
    ? gradeProgress(tracker, retestIndices, questions)
    : null;
  const passingScore = clampScore(assignment?.assessmentPolicy?.passingScore, 70);
  const scorePolicy = clean(assignment?.assessmentPolicy?.retest?.scorePolicy) || "replaceIfHigher";
  const retestEligible = Boolean(
    test.complete
    && Number(test.grade || 0) < passingScore
    && retest?.total
  );
  const retestCanReplace = Boolean(
    retestEligible
    && retest?.complete
    && retestFeedbackWasReleased(assignment)
  );

  let sourceRole = "test";
  let sourceIndices = testIndices;
  let source = test;
  if (retestCanReplace) {
    const useRetest = scorePolicy === "replace"
      || Number(retest.grade || 0) > Number(test.grade || 0);
    if (useRetest) {
      sourceRole = "retest";
      sourceIndices = retestIndices;
      source = retest;
    }
  }

  return {
    ...source,
    grade: Number(source?.grade || 0),
    questionIndices: [...sourceIndices],
    sourceRole,
    passingScore,
    testGrade: Number(test?.grade || 0),
    retestGrade: retest ? Number(retest.grade || 0) : null,
    retestEligible,
    retestComplete: Boolean(retest?.complete),
    retestFeedbackReleased: retestFeedbackWasReleased(assignment),
  };
}

module.exports = {
  isTestCycleAssignment,
  retestFeedbackWasReleased,
  roleQuestionIndices,
  testCycleGradeProgress,
};
