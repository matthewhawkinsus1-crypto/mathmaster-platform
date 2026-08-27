"use strict";

const { runtimeQuestionsFromAssignment } = require("./assignmentRuntime");

const TEACHER_RELEASE_ROLES = new Set(["quiz", "test"]);

function normalizedRole(value) {
  return String(value || "").trim().toLowerCase();
}

function assignmentUsesTeacherReleasePolicy(assignment = {}) {
  if (TEACHER_RELEASE_ROLES.has(normalizedRole(assignment.activityRole))) return true;
  if (TEACHER_RELEASE_ROLES.has(normalizedRole(assignment.assignmentType))) return true;
  const questions = runtimeQuestionsFromAssignment(assignment);
  return questions.some((question) => TEACHER_RELEASE_ROLES.has(normalizedRole(question?.activityRole || question?.role)));
}

function assignmentFeedbackWasReleased(assignment = {}) {
  return assignment.feedbackReleased === true || Boolean(assignment.feedbackReleasedAt);
}

function assignmentFeedbackIsHeld(assignment = {}) {
  return assignmentUsesTeacherReleasePolicy(assignment) && !assignmentFeedbackWasReleased(assignment);
}

module.exports = {
  assignmentUsesTeacherReleasePolicy,
  assignmentFeedbackWasReleased,
  assignmentFeedbackIsHeld,
};
