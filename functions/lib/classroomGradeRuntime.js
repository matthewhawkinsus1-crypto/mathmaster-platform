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

  // The same key as attemptPolicy's compactStepStateKey, rule for rule
  // (callers are synchronous, so the ESM module cannot be awaited here;
  // stepAlgebraStepCredit compares every copy over every rule): spaces and the
  // TeX tie of 2~ x (before pass 3 Q-31) are spacing, any dash is a minus, a
  // unit coefficient before a group (push Q's 1\left() is dropped, and a
  // number bracketed after a letter (GR27's x(1), drawn x1 before) is x1.
  const stateKey = (value) => String(value || "")
    .replace(/[\s~]+/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/(^|[=+\-(,{])1\\left\(/g, "$1\\left(")
    .replace(/(?<=[A-Za-z])\\left\((\d+(?:\.\d+)?)\\right\)/g, "$1");
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

// The later of the class's date and the student's own (never earlier).
function laterDate(classValue, studentValue) {
  const classDate = toDate(classValue);
  const studentDate = toDate(studentValue);
  if (!classDate) return studentDate;
  if (!studentDate) return classDate;
  return studentDate.getTime() > classDate.getTime() ? studentDate : classDate;
}

// `studentFinalCutoff` / `studentDueAt` are the student's own individual
// final cutoff and due time (their private extension and extra-time dates,
// lib/classroomStudentCheckpoints.js), or null. Absent, every answer is the
// class's, exactly as before.
function resolveClassroomGradeStage({ assignment, progress, releaseSignal, nowValue = Date.now(), studentFinalCutoff = null, studentDueAt = null }) {
  const reason = releaseSignalReason(releaseSignal);
  const now = Number(nowValue) || Date.now();
  const dueAt = laterDate(assignment?.dueAt || assignment?.dueDate, studentDueAt);
  const lateDueAt = laterDate(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
    studentFinalCutoff
  );
  // H-116: "final-deadline" and "due-checkpoint" are queued for the whole
  // roster at the CLASS's cutoff and due time. They speak for this student
  // only once THEIR own has arrived; before it the grade is ordinary progress
  // (not returned), and the scheduler wakes them again at their own time.
  if (reason === "final-deadline" && !(lateDueAt && now < lateDueAt.getTime())) return "final-deadline";
  if (reason === "due-checkpoint" && !(dueAt && now < dueAt.getTime())) return "due-checkpoint";
  if (reason === "assessment-release") return progress.complete ? "final-complete" : "assessment-release";

  if (progress.complete) return "final-complete";
  if (lateDueAt && now >= lateDueAt.getTime()) return "final-deadline";
  if (reason === "initial-reconcile") {
    if (dueAt && now >= dueAt.getTime()) return "due-checkpoint";
    return progressCheckpointStage(progress);
  }
  if (reason === "manual-retry" || reason === "section-grade-reconcile") {
    return progress.attempted > 0 || (dueAt && now >= dueAt.getTime())
      ? "manual-retry"
      : null;
  }
  if (dueAt && now >= dueAt.getTime()) {
    return progressCheckpointStage(progress, { late: true });
  }
  return progressCheckpointStage(progress);
}

/**
 * H-116: did this class-wide wake-up arrive before THIS student's own time?
 *
 * Returns `{ kind: 'final' | 'due', atMs }` — the student's own final cutoff
 * or due time, when a "final-deadline" / "due-checkpoint" signal reached them
 * before it — or null. The trigger records it so the checkpoint scheduler
 * wakes them again at `atMs` (lib/classroomStudentCheckpoints.js); without
 * that nothing would ever call their grade final.
 */
function deferredClassCheckpoint({ assignment, releaseSignal, nowValue = Date.now(), studentFinalCutoff = null, studentDueAt = null }) {
  const reason = releaseSignalReason(releaseSignal);
  const now = Number(nowValue) || Date.now();
  if (reason === "final-deadline") {
    const own = laterDate(
      assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
      studentFinalCutoff
    );
    return own && now < own.getTime() ? { kind: "final", atMs: own.getTime() } : null;
  }
  if (reason === "due-checkpoint") {
    const own = laterDate(assignment?.dueAt || assignment?.dueDate, studentDueAt);
    return own && now < own.getTime() ? { kind: "due", atMs: own.getTime() } : null;
  }
  return null;
}

/**
 * NV02 (the owner, 2026-10-23): HOLD THE RETURN UNTIL THE STUDENT'S OWN CLOSE.
 *
 * A late-progress checkpoint, or a teacher's retry after the due date, is
 * returned to the student: Classroom shows them a partial grade. For a student
 * still on their own extended time — their final cutoff (an attendance
 * extension or an extra-time date) later than the class's, and not reached —
 * that return waits: Classroom gets the grade as a teacher-only draft, and the
 * student sees nothing returned before their own close. Returns that cutoff
 * (ms) while it is ahead, else null. A student with no individual cutoff, or
 * one no later than the class's, is never held. Their final grade is returned
 * at their own cutoff: the trigger records it for the scheduler, as it does a
 * class-wide wake-up it sets aside (deferredClassCheckpoint, H-116).
 */
function extendedTimeReturnHeldUntil({ assignment, nowValue = Date.now(), studentFinalCutoff = null } = {}) {
  const own = toDate(studentFinalCutoff);
  if (!own) return null;
  const classFinal = toDate(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate);
  if (classFinal && own.getTime() <= classFinal.getTime()) return null;
  const now = Number(nowValue) || Date.now();
  return now < own.getTime() ? own.getTime() : null;
}

function classroomGradeReleasePolicy({ stage, assignment, nowValue = Date.now(), studentDueAt = null, studentFinalCutoff = null }) {
  const now = Number(nowValue) || Date.now();
  const dueAt = laterDate(assignment?.dueAt || assignment?.dueDate, studentDueAt);
  const explicitlyStudentVisible = [
    "due-checkpoint",
    "final-complete",
    "final-deadline",
    "assessment-release",
    // A Test Cycle grade only exists once a teacher has released the secure
    // result, so by the time either of these stages is reached the teacher has
    // already made the release decision this policy exists to wait for.
    "testcycle-test",
    "testcycle-retest",
  ].includes(stage);
  // A partial grade after the due date: returned, unless the student is still
  // on their own extended time (NV02, above).
  const partialAfterDue = String(stage || "").startsWith("late-progress")
    || (stage === "manual-retry" && Boolean(dueAt && now >= dueAt.getTime()));
  const heldUntilMs = !explicitlyStudentVisible && partialAfterDue
    ? extendedTimeReturnHeldUntil({ assignment, nowValue: now, studentFinalCutoff })
    : null;
  const studentVisible = explicitlyStudentVisible || (partialAfterDue && heldUntilMs === null);

  return {
    studentVisible,
    assignToStudent: studentVisible,
    shouldReturn: studentVisible,
    // Only when a return was held: the trigger records it for the scheduler.
    ...(heldUntilMs !== null ? { heldUntilMs } : {}),
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
  deferredClassCheckpoint,
  extendedTimeReturnHeldUntil,
};
