"use strict";

const crypto = require("crypto");

const clean = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function countLiveQuestionStates(value) {
  const text = String(value || "");
  let correct = 0;
  let incorrect = 0;
  let attempted = 0;
  for (const character of text) {
    if (character === "c") correct += 1;
    else if (character === "x") incorrect += 1;
    else if (character === "a") attempted += 1;
  }
  const answered = correct + incorrect;
  return {
    answered,
    correct,
    incorrect,
    attempted,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
  };
}

function sessionKeyFor({ studentId, assignmentId, startedAt } = {}) {
  const student = clean(studentId);
  const assignment = clean(assignmentId);
  const start = finite(startedAt);
  if (!student || !assignment || !start) return null;
  return `${student}|${assignment}|${start}`;
}

function sessionSummaryIdFor(input = {}) {
  const key = sessionKeyFor(input);
  return key
    ? crypto.createHash("sha256").update(key).digest("hex").slice(0, 40)
    : null;
}

/**
 * Merge one deleted presence snapshot into the one durable summary for the
 * assignment session. React may delete/recreate presence while changing
 * questions, so every counter is monotonic and the stable session id prevents
 * those lifecycle deletes from becoming fake extra sessions.
 *
 * Deliberately returns no response text, URLs, question prompts, or keystrokes.
 */
function buildMergedSessionSummary({
  live = {},
  gradeData = {},
  studentId,
  previous = {},
  observedAt = Date.now(),
} = {}) {
  const student = clean(studentId || live.studentId);
  const assignmentId = clean(live.assignmentId);
  const startedAt = finite(live.startedAt);
  const sessionKey = sessionKeyFor({ studentId: student, assignmentId, startedAt });
  if (!sessionKey) return null;

  const counts = countLiveQuestionStates(live.questionStates);
  const assignedTeacherEmail = clean(gradeData.assignedTeacherEmail).toLowerCase();
  const classId = clean(live.classId || gradeData.classId) || null;
  const previousAuthorized = Array.isArray(previous.authorizedTeacherEmails)
    ? previous.authorizedTeacherEmails.map((value) => clean(value).toLowerCase()).filter(Boolean)
    : [];
  const authorizedTeacherEmails = [...new Set([
    ...previousAuthorized,
    assignedTeacherEmail,
  ].filter(Boolean))].sort();

  const answered = Math.max(finite(previous.answered), counts.answered);
  const correct = Math.max(finite(previous.correct), counts.correct);

  return {
    schemaVersion: 1,
    sessionKey,
    studentId: student,
    studentName: clean(live.name || gradeData.displayName || student).slice(0, 180),
    classId,
    classPeriod: clean(live.classPeriod || gradeData.classPeriod) || null,
    assignmentId,
    assignmentTitle: clean(live.assignmentTitle).slice(0, 180),
    activityRole: clean(live.activityRole || "classwork").slice(0, 40),
    startedAt,
    endedAt: Math.max(finite(previous.endedAt), finite(observedAt, Date.now())),
    activeSeconds: Math.max(finite(previous.activeSeconds), finite(live.sessionActiveSeconds)),
    focusLossCount: Math.max(finite(previous.focusLossCount), finite(live.focusLossCount)),
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : null,
    rapidCorrectCount: Math.max(finite(previous.rapidCorrectCount), finite(live.rapidCorrectCount)),
    rapidDeepCorrectCount: Math.max(finite(previous.rapidDeepCorrectCount), finite(live.rapidDeepCorrectCount)),
    timedIndependentCorrectCount: Math.max(
      finite(previous.timedIndependentCorrectCount),
      finite(live.timedIndependentCorrectCount),
    ),
    originClassId: previous.originClassId || classId,
    originTeacherEmail: previous.originTeacherEmail || assignedTeacherEmail || null,
    authorizedTeacherEmails,
  };
}

module.exports = {
  buildMergedSessionSummary,
  countLiveQuestionStates,
  sessionKeyFor,
  sessionSummaryIdFor,
};
