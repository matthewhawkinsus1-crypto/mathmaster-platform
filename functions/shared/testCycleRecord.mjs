/*
 * THE CANONICAL TEST CYCLE RECORD.
 *
 * ONE record per (assignment, student). It is the single source every surface
 * reads for "what did this student earn on this assessment":
 *
 *   Student Grade Center   -> recordedGrade + the breakdown below it
 *   Assignment Result      -> the same
 *   Teacher gradebook      -> the same, plus stage and raw retest
 *   Google Classroom       -> the same number, on ONE grade item
 *
 * It keeps the original Test score forever. A retest adds numbers; it never
 * overwrites what the student actually did on the Test, because "your grade
 * went up" and "your test score was deleted" are very different things to be
 * told, and only one of them is true.
 *
 * Pure by construction: no Firestore, no network. The callers stamp the clock.
 */

import {
  GRADE_HISTORY_REASON,
  appendTestCycleGradeHistory,
  buildTestCycleGradeState,
} from './testCycleGrade.mjs';
import { normalizeTeacherControls, normalizeTestCyclePolicy } from './testCyclePolicy.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const SESSION_STATE = Object.freeze({
  NONE: 'none',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'inProgress',
  SUBMITTED: 'submitted',
  RELEASED: 'released',
});

const normalizeStageRecord = (stage) => {
  const source = isObject(stage) ? stage : {};
  return {
    examSessionId: clean(source.examSessionId) || null,
    planId: clean(source.planId) || null,
    blueprintId: clean(source.blueprintId) || null,
    blueprintVersion: Number(source.blueprintVersion) || 1,
    attempt: Math.max(1, Math.round(Number(source.attempt) || 1)),
    state: Object.values(SESSION_STATE).includes(clean(source.state))
      ? clean(source.state)
      : (clean(source.examSessionId) ? SESSION_STATE.ASSIGNED : SESSION_STATE.NONE),
    rawScore: optionalNumber(source.rawScore),
    answeredQuestions: Math.max(0, Math.round(Number(source.answeredQuestions) || 0)),
    totalQuestions: Math.max(0, Math.round(Number(source.totalQuestions) || 0)),
    submittedAt: optionalNumber(source.submittedAt),
    releasedAt: optionalNumber(source.releasedAt),
  };
};

/** The document id for a student's record. Deterministic, so it is idempotent. */
export const testCycleRecordId = (assignmentId, studentId) => (
  `${clean(assignmentId)}__${clean(studentId)}`
);

export const normalizeTestCycleRecord = (record) => {
  const source = isObject(record) ? record : {};
  const corrections = isObject(source.corrections) ? source.corrections : {};
  return {
    assignmentId: clean(source.assignmentId),
    studentId: clean(source.studentId),
    recordId: clean(source.recordId) || testCycleRecordId(source.assignmentId, source.studentId),
    classId: clean(source.classId) || null,
    blueprintId: clean(source.blueprintId) || null,
    blueprintVersion: Number(source.blueprintVersion) || 1,
    review: {
      required: source.review?.required !== false,
      complete: source.review?.complete === true,
      completedAt: optionalNumber(source.review?.completedAt),
    },
    test: normalizeStageRecord(source.test),
    retest: normalizeStageRecord(source.retest),
    corrections: {
      planId: clean(corrections.planId) || null,
      required: corrections.required === true,
      waived: corrections.waived === true,
      complete: corrections.complete === true,
      total: Math.max(0, Math.round(Number(corrections.total) || 0)),
      completedTargets: Math.max(0, Math.round(Number(corrections.completedTargets) || 0)),
      completedAt: optionalNumber(corrections.completedAt),
    },
    teacherControls: normalizeTeacherControls(source.teacherControls),
    history: list(source.history).filter(isObject),
    classroom: {
      postedGrade: optionalNumber(source.classroom?.postedGrade),
      postedAt: optionalNumber(source.classroom?.postedAt),
    },
    updatedAt: optionalNumber(source.updatedAt),
  };
};

/**
 * The grade, derived — never stored twice.
 *
 * `recordedGrade` on the record document is a projection of this, written so a
 * Firestore query can sort on it. It is always recomputed here before use, so a
 * stale projection can never become the number a student is shown.
 */
export const recordGradeState = (record, policy) => {
  const normalized = normalizeTestCycleRecord(record);
  return buildTestCycleGradeState({
    originalTestGrade: normalized.test.state === SESSION_STATE.RELEASED ? normalized.test.rawScore : null,
    rawRetestGrade: normalized.retest.state === SESSION_STATE.RELEASED ? normalized.retest.rawScore : null,
    policy,
  });
};

/**
 * The Test result landing. This is the moment an assessment gets a grade.
 *
 * Corrections become required here, from this student's own released score, and
 * only when the score is below passing — a passing Test creates no corrections
 * and therefore no retest path.
 */
export const applyTestReleased = (record, {
  rawScore = null,
  answeredQuestions = 0,
  totalQuestions = 0,
  releasedAt = null,
  policy = null,
  correctionsRequired = null,
} = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  const resolved = normalizeTestCyclePolicy(policy);
  const at = Number(releasedAt) || Date.now();
  const score = optionalNumber(rawScore);
  const failed = resolved && score !== null && score < resolved.passingScore;
  const next = {
    ...normalized,
    test: {
      ...normalized.test,
      state: SESSION_STATE.RELEASED,
      rawScore: score,
      answeredQuestions: Math.max(normalized.test.answeredQuestions, Math.round(Number(answeredQuestions) || 0)),
      totalQuestions: Math.max(normalized.test.totalQuestions, Math.round(Number(totalQuestions) || 0)),
      releasedAt: at,
    },
    corrections: {
      ...normalized.corrections,
      required: correctionsRequired === null
        ? Boolean(failed && resolved?.corrections?.requiredForRetest !== false && normalized.teacherControls.requireCorrections)
        : correctionsRequired === true,
    },
  };
  const grade = recordGradeState(next, resolved);
  return {
    ...next,
    recordedGrade: grade.recordedGrade,
    history: appendTestCycleGradeHistory(normalized.history, {
      at,
      reason: GRADE_HISTORY_REASON.TEST_RELEASED,
      recordedGrade: grade.recordedGrade,
      originalTestGrade: grade.originalTestGrade,
      rawRetestGrade: grade.rawRetestGrade,
      retestCappedContribution: grade.retestCappedContribution,
      detail: grade.reason,
    }),
    updatedAt: at,
  };
};

/**
 * The Retest result landing.
 *
 * The raw score is stored as earned. What it is allowed to CONTRIBUTE is the
 * capped value, and what is RECORDED is max(original, capped) — so this can
 * raise a grade to at most the cap and can never lower one.
 */
export const applyRetestReleased = (record, {
  rawScore = null,
  answeredQuestions = 0,
  totalQuestions = 0,
  releasedAt = null,
  policy = null,
} = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  const resolved = normalizeTestCyclePolicy(policy);
  const at = Number(releasedAt) || Date.now();
  const next = {
    ...normalized,
    retest: {
      ...normalized.retest,
      state: SESSION_STATE.RELEASED,
      rawScore: optionalNumber(rawScore),
      answeredQuestions: Math.max(normalized.retest.answeredQuestions, Math.round(Number(answeredQuestions) || 0)),
      totalQuestions: Math.max(normalized.retest.totalQuestions, Math.round(Number(totalQuestions) || 0)),
      releasedAt: at,
    },
  };
  const grade = recordGradeState(next, resolved);
  return {
    ...next,
    recordedGrade: grade.recordedGrade,
    history: appendTestCycleGradeHistory(normalized.history, {
      at,
      reason: GRADE_HISTORY_REASON.RETEST_RELEASED,
      recordedGrade: grade.recordedGrade,
      originalTestGrade: grade.originalTestGrade,
      rawRetestGrade: grade.rawRetestGrade,
      retestCappedContribution: grade.retestCappedContribution,
      detail: grade.reason,
    }),
    updatedAt: at,
  };
};

/**
 * The Grade Center / gradebook row.
 *
 * When no retest happened this is deliberately plain — a student who passed
 * should see "Test — 86%", not a paragraph about a cap that never applied.
 */
export const testCycleGradeBreakdown = (record, policy) => {
  const normalized = normalizeTestCycleRecord(record);
  const grade = recordGradeState(normalized, policy);
  const rows = [];
  if (grade.originalTestGrade !== null) {
    rows.push({ key: 'originalTest', label: 'Original Test', value: `${grade.originalTestGrade}%` });
  }
  if (normalized.corrections.required || normalized.corrections.complete || normalized.corrections.waived) {
    rows.push({
      key: 'corrections',
      label: 'Corrections',
      value: normalized.corrections.waived
        ? 'Waived by teacher'
        : normalized.corrections.complete ? 'Complete' : 'In progress',
    });
  }
  if (grade.rawRetestGrade !== null) {
    rows.push({ key: 'retest', label: 'Retest', value: `${grade.rawRetestGrade}% raw` });
    if (grade.retestCapApplied) {
      rows.push({ key: 'retestPolicy', label: 'Retest policy', value: `capped at ${grade.maxRecordedGrade}%` });
    }
  }
  if (grade.recordedGrade !== null) {
    rows.push({ key: 'recordedGrade', label: 'Recorded grade', value: `${grade.recordedGrade}%` });
  }
  return {
    rows,
    // A cycle with no retest is just a test, and says so.
    simple: grade.rawRetestGrade === null,
    ...grade,
  };
};
