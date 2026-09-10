"use strict";

const VERSION = 2;
const SCOPE = "fullAssignmentAudit";
const clean = (value) => String(value ?? "").trim();
const array = (value) => (Array.isArray(value) ? value : []);

function repairAuthority(auth = {}) {
  const token = auth.token || {};
  if (token.rootAdmin === true && token.admin === true) return "administrator";
  if (token.role === "teacher" && token.assignmentRepairer === true) return "designatedRepairer";
  return null;
}

function requireRepairAuthority(auth) {
  const authority = repairAuthority(auth);
  if (!auth?.uid) throw Object.assign(new Error("Sign in before running Full Assignment Audit."), { code: "unauthenticated" });
  if (!authority) throw Object.assign(new Error("Full Assignment Audit requires administrator or designated repairer access."), { code: "permission-denied" });
  return authority;
}

function questionLocations(assignment) {
  const locations = [];
  if (Array.isArray(assignment?.sections)) assignment.sections.forEach((section, sectionIndex) => array(section.questions).forEach((question, questionIndex) => locations.push({ question, sectionIndex, questionIndex })));
  else array(assignment?.questions).forEach((question, questionIndex) => locations.push({ question, sectionIndex: null, questionIndex }));
  return locations;
}

function prepareCommit({ assignment, request }) {
  if (!assignment || !request) throw new Error("The assignment and reviewed audit are required.");
  if (request.repairPacketVersion !== VERSION || request.repairScope !== SCOPE) throw new Error("Only a version 2 Full Assignment Audit may use this commit path.");
  const assignmentId = clean(assignment.id || assignment.assignmentId || assignment.assignment?.assignmentId);
  if (clean(request.assignmentId) !== assignmentId) throw new Error("The audit assignment ID does not match the stored assignment.");
  const currentRevision = Number(assignment.assignmentRevision || 1);
  if (Number(request.baseRevision) !== currentRevision) throw new Error(`This audit was built from revision ${request.baseRevision}, but the assignment is now revision ${currentRevision}. Re-run Full Assignment Audit before applying repairs.`);

  const locations = questionLocations(assignment);
  const existing = new Map();
  locations.forEach((location) => {
    const id = clean(location.question?.questionId);
    if (!id || existing.has(id)) throw new Error("The stored assignment has missing or duplicate question IDs.");
    existing.set(id, location);
  });
  const allowedClassifications = new Set(["passed", "assignmentIssue", "platformIssue", "unclear"]);
  const classifications = new Map();
  array(request.auditResults).forEach((result) => {
    const id = clean(result?.questionId);
    if (classifications.has(id)) throw new Error(`Duplicate audit result for question "${id}".`);
    if (!allowedClassifications.has(result?.classification)) throw new Error(`Invalid audit classification for question "${id}".`);
    classifications.set(id, result.classification);
  });
  if (classifications.size !== existing.size || [...existing.keys()].some((id) => !classifications.has(id))) throw new Error("The audit does not account for every current question exactly once.");
  const selected = new Set(array(request.selectedQuestionIds).map(clean));
  const replacements = new Map();
  array(request.replacements).forEach((entry) => {
    const id = clean(entry?.questionId);
    if (!selected.has(id)) return;
    if (!existing.has(id)) throw new Error(`Question "${id}" is not in the assignment.`);
    if (classifications.get(id) !== "assignmentIssue") throw new Error(`Question "${id}" is not an assignment issue and cannot be changed.`);
    if (!entry.question || clean(entry.question.questionId) !== id) throw new Error(`Replacement identity does not match question "${id}".`);
    if (replacements.has(id)) throw new Error(`Duplicate replacement for question "${id}".`);
    replacements.set(id, JSON.parse(JSON.stringify(entry.question)));
  });
  if (replacements.size !== selected.size) throw new Error("Every selected repair must have exactly one reviewed replacement.");

  const next = { ...assignment, assignmentRevision: currentRevision + 1 };
  if (Array.isArray(assignment.sections)) next.sections = assignment.sections.map((section) => ({ ...section, questions: array(section.questions).map((question) => replacements.get(clean(question.questionId)) || question) }));
  else next.questions = array(assignment.questions).map((question) => replacements.get(clean(question.questionId)) || question);
  const changedQuestionIds = [...replacements.keys()];
  const changedQuestions = changedQuestionIds.map((questionId) => ({
    questionId,
    beforeQuestion: JSON.parse(JSON.stringify(existing.get(questionId).question)),
    afterQuestion: JSON.parse(JSON.stringify(replacements.get(questionId))),
  }));
  return { assignment: next, fromRevision: currentRevision, toRevision: currentRevision + 1, changedQuestionIds, changedQuestions };
}

module.exports = { VERSION, SCOPE, repairAuthority, requireRepairAuthority, prepareCommit, questionLocations };
