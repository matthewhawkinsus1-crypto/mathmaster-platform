"use strict";

const { weightedQuestionTotals } = require("./questionWeights");

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keep the Cloud Function grade runtime compatible with every question-record
 * shape the browser still accepts. Split Classroom passback was introduced
 * after some of these records already existed in Firestore, so treating a
 * legacy string/status as an unknown object can silently turn earned credit
 * into a zero.
 */
function normalizeStoredQuestionRecord(record) {
  if (!record) {
    return {
      status: "unattempted",
      attemptCount: 0,
      totalAttempts: 0,
      partialCredit: 0,
      bestPartialCredit: 0,
      stepGrades: [],
      variantIndex: 0,
    };
  }

  if (typeof record === "string") {
    const status = String(record || "unattempted");
    const attemptCount = status === "incorrect" || status === "attempted" ? 1 : 0;
    return {
      status,
      attemptCount,
      totalAttempts: attemptCount,
      partialCredit: 0,
      bestPartialCredit: 0,
      stepGrades: [],
      variantIndex: 0,
    };
  }

  if (typeof record !== "object" || Array.isArray(record)) {
    return normalizeStoredQuestionRecord(null);
  }

  const legacyStatus = String(record.status || "unattempted");
  const status = legacyStatus === "incorrect" ? "attempted" : legacyStatus;
  const attemptCount = Number.isFinite(Number(record.attemptCount))
    ? Math.max(0, Number(record.attemptCount))
    : status === "attempted" || status === "working"
      ? 1
      : status === "expired"
        ? 3
        : 0;
  const totalAttempts = Number.isFinite(Number(record.totalAttempts))
    ? Math.max(0, Number(record.totalAttempts))
    : attemptCount;

  return {
    ...record,
    status,
    attemptCount,
    totalAttempts,
    partialCredit: clampPercent(record.partialCredit ?? 0),
    bestPartialCredit: clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0),
    stepGrades: Array.isArray(record.stepGrades) ? record.stepGrades : [],
    variantIndex: Number.isFinite(Number(record.variantIndex))
      ? Math.max(0, Number(record.variantIndex))
      : 0,
  };
}

function storedAlgebraStepPartialCredit(record) {
  const normalized = normalizeStoredQuestionRecord(record);
  const steps = normalized.stepGrades;
  const variantIndex = normalized.variantIndex;
  const currentSteps = steps.filter((step) => Number(step?.variantIndex) === variantIndex);
  if (!currentSteps.length) return 0;

  const stateKey = (value) => String(value || "").replace(/\s+/g, "").replace(/[−–—]/g, "-");
  const expectedTotal = currentSteps.reduce(
    (maximum, step) => Math.max(maximum, Math.max(0, Number(step?.expectedTotalPoints) || 0)),
    0
  );
  const visitedStates = new Set();
  const firstBefore = stateKey(currentSteps[0]?.equationBefore);
  if (firstBefore) visitedStates.add(firstBefore);

  let earned = 0;
  let fallbackPossible = 0;
  currentSteps.forEach((step) => {
    const afterKey = stateKey(step?.equationAfter);
    const acceptedProductive = step?.accepted !== false && step?.productive !== false;
    const newState = !afterKey || !visitedStates.has(afterKey);
    if (acceptedProductive && newState) {
      earned += Math.max(0, Number(step?.earned) || 0);
      fallbackPossible += Math.max(0, Number(step?.possible) || 0);
    }
    if (afterKey) visitedStates.add(afterKey);
  });

  const possible = expectedTotal > 0 ? expectedTotal : fallbackPossible;
  return possible > 0 ? Math.min(90, clampPercent(Math.round((earned / possible) * 100))) : 0;
}

function getQuestionCredit(record) {
  const normalized = normalizeStoredQuestionRecord(record);
  if (normalized.status === "correct") return 1;
  const stored = clampPercent(normalized.bestPartialCredit ?? normalized.partialCredit ?? 0);
  const derived = storedAlgebraStepPartialCredit(normalized);
  return Math.max(stored, derived) / 100;
}

function isQuestionTerminal(record) {
  const status = normalizeStoredQuestionRecord(record).status;
  return status === "correct" || status === "expired";
}

function questionWasAttempted(record) {
  const normalized = normalizeStoredQuestionRecord(record);
  if (normalized.status !== "unattempted") return true;
  if (Number(normalized.totalAttempts || normalized.attemptCount || 0) > 0) return true;
  return clampPercent(normalized.bestPartialCredit ?? normalized.partialCredit ?? 0) > 0;
}

function assignmentGradeProgress(assignmentTracker, questionIndices, questions = []) {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  const attempted = indices.filter((index) => questionWasAttempted(assignmentTracker?.[index])).length;
  const terminal = indices.filter((index) => isQuestionTerminal(assignmentTracker?.[index])).length;
  const weighted = weightedQuestionTotals({
    tracker: assignmentTracker,
    questions,
    indices,
    creditForRecord: getQuestionCredit,
    attemptedForRecord: questionWasAttempted,
  });
  const minimumProgressQuestions = indices.length
    ? Math.max(1, Math.ceil(indices.length * 0.25))
    : 0;
  return {
    total: indices.length,
    attempted,
    terminal,
    grade: weighted.score ?? 0,
    creditOnAttempted: weighted.creditOnAttempted,
    complete: indices.length > 0 && terminal === indices.length,
    meaningfulProgress: attempted >= minimumProgressQuestions,
    minimumProgressQuestions,
  };
}

function releaseSignalReason(signal) {
  if (!signal) return null;
  if (typeof signal === "string") return "manual-retry";
  if (typeof signal === "object") return String(signal.reason || "manual-retry");
  return "manual-retry";
}

function progressCheckpointStage(progress, { late = false } = {}) {
  if (!progress?.meaningfulProgress || !progress.total) return null;
  const percentAttempted = Math.round((progress.attempted / progress.total) * 100);
  const checkpoint = Math.max(
    25,
    Math.min(100, Math.floor(percentAttempted / 25) * 25)
  );
  return `${late ? "late-progress" : "progress"}-${checkpoint}`;
}

function resolveClassroomGradeStage({ assignment, progress, releaseSignal, nowValue = Date.now() }) {
  const reason = releaseSignalReason(releaseSignal);
  if (reason === "final-deadline") return "final-deadline";
  if (reason === "due-checkpoint") return "due-checkpoint";
  if (reason === "assessment-release") return progress.complete ? "final-complete" : "assessment-release";

  const now = Number(nowValue) || Date.now();
  const dueAt = toDate(assignment?.dueAt || assignment?.dueDate);
  const lateDueAt = toDate(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate
  );

  if (progress.complete) return "final-complete";
  if (lateDueAt && now >= lateDueAt.getTime()) return "final-deadline";
  if (reason === "initial-reconcile") {
    if (dueAt && now >= dueAt.getTime()) return "due-checkpoint";
    return progressCheckpointStage(progress);
  }
  if (reason === "manual-retry") {
    return progress.attempted > 0 || (dueAt && now >= dueAt.getTime())
      ? "manual-retry"
      : null;
  }
  if (dueAt && now >= dueAt.getTime()) {
    return progressCheckpointStage(progress, { late: true });
  }
  return progressCheckpointStage(progress);
}

function classroomGradeReleasePolicy({ stage, assignment, nowValue = Date.now() }) {
  const now = Number(nowValue) || Date.now();
  const dueAt = toDate(assignment?.dueAt || assignment?.dueDate);
  const explicitlyStudentVisible = [
    "due-checkpoint",
    "final-complete",
    "final-deadline",
    "assessment-release",
  ].includes(stage);
  const studentVisible = explicitlyStudentVisible
    || String(stage || "").startsWith("late-progress")
    || (stage === "manual-retry" && Boolean(dueAt && now >= dueAt.getTime()));

  return {
    studentVisible,
    assignToStudent: studentVisible,
    shouldReturn: studentVisible,
  };
}

module.exports = {
  clampPercent,
  toDate,
  normalizeStoredQuestionRecord,
  storedAlgebraStepPartialCredit,
  getQuestionCredit,
  isQuestionTerminal,
  questionWasAttempted,
  assignmentGradeProgress,
  releaseSignalReason,
  progressCheckpointStage,
  resolveClassroomGradeStage,
  classroomGradeReleasePolicy,
};
