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
  GRADE_SOURCE,
  appendTestCycleGradeHistory,
  buildTestCycleGradeState,
} from './testCycleGrade.mjs';
import { clampPercent, normalizeTeacherControls, normalizeTestCyclePolicy } from './testCyclePolicy.mjs';
import { normalizeExternalOriginal } from './externalAssessment.mjs';
import { normalizeStudentAvailability } from './testCycleAvailability.mjs';

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
    // A Retest opened for a student who never took the original Test (they
    // missed its class-time window). Present only when true, so every record
    // written before this existed keeps its exact shape.
    ...(source.withoutOriginal === true ? { withoutOriginal: true } : {}),
  };
};

/*
 * WHERE A TEACHER'S ADJUSTED GRADE CAME FROM.
 *
 * The rule (testCycleGrade.mjs) decides the recorded grade from the two secure
 * scores. A teacher may set it by hand instead, and has to say from what: the
 * student's Review score, the Retest's actual (uncapped) score, or a number of
 * their own. The source is stored and shown, so nobody later has to guess why
 * a grade is not what the rule would have recorded.
 */
export const GRADE_ADJUSTMENT_SOURCE = Object.freeze({
  REVIEW: 'review',
  RETEST_ACTUAL: 'retestActual',
  MANUAL: 'manual',
});
export const GRADE_ADJUSTMENT_SOURCES = Object.freeze(Object.values(GRADE_ADJUSTMENT_SOURCE));

const ADJUSTMENT_SOURCE_LABEL = Object.freeze({
  [GRADE_ADJUSTMENT_SOURCE.REVIEW]: 'the Review score',
  [GRADE_ADJUSTMENT_SOURCE.RETEST_ACTUAL]: 'the actual Retest score',
  [GRADE_ADJUSTMENT_SOURCE.MANUAL]: 'a grade the teacher entered',
});

export const gradeAdjustmentSourceLabel = (source) => ADJUSTMENT_SOURCE_LABEL[clean(source)] || ADJUSTMENT_SOURCE_LABEL.manual;

const normalizeGradeAdjustment = (raw) => {
  if (!isObject(raw)) return null;
  const grade = optionalNumber(raw.grade);
  if (grade === null) return null;
  return {
    grade: clampPercent(grade),
    source: GRADE_ADJUSTMENT_SOURCES.includes(clean(raw.source)) ? clean(raw.source) : GRADE_ADJUSTMENT_SOURCE.MANUAL,
    note: clean(raw.note).slice(0, 300) || null,
    by: clean(raw.by).slice(0, 160) || null,
    at: optionalNumber(raw.at),
  };
};

const studentAvailabilityOf = (raw) => {
  const availability = normalizeStudentAvailability(raw);
  return availability.testWindows.length || availability.followUpClosesAt !== null ? availability : null;
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
    ...(source.externalAssessment ? { externalAssessment: normalizeExternalOriginal(source.externalAssessment) } : {}),
    // The three below are present only when a teacher has done the thing they
    // record, so a record nobody adjusted keeps the shape it always had.
    //   audience       this student was added to the Test individually, not
    //                  through a class: the record itself is their assignment.
    //   availability   this student's own reopened Test window or extended
    //                  home window (testCycleAvailability.mjs).
    //   gradeAdjustment the recorded grade a teacher set by hand, and from what.
    ...(source.audience?.individual === true ? {
      audience: {
        individual: true,
        // The assigned class whose Test window this student sits in.
        withClassId: clean(source.audience.withClassId).slice(0, 180) || null,
        addedBy: clean(source.audience.addedBy).slice(0, 160) || null,
        addedAt: optionalNumber(source.audience.addedAt),
      },
    } : {}),
    ...(studentAvailabilityOf(source.availability) ? { availability: studentAvailabilityOf(source.availability) } : {}),
    ...(normalizeGradeAdjustment(source.gradeAdjustment) ? { gradeAdjustment: normalizeGradeAdjustment(source.gradeAdjustment) } : {}),
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
  const external = Boolean(normalizeTestCyclePolicy(policy)?.externalAssessment);
  const ruled = buildTestCycleGradeState({
    originalTestGrade: external ? normalized.externalAssessment?.originalScore ?? null
      : normalized.test.state === SESSION_STATE.RELEASED ? normalized.test.rawScore : null,
    rawRetestGrade: external ? (normalized.test.state === SESSION_STATE.RELEASED ? normalized.test.rawScore : null)
      : normalized.retest.state === SESSION_STATE.RELEASED ? normalized.retest.rawScore : null,
    policy,
  });
  const adjustment = normalized.gradeAdjustment || null;
  if (!adjustment) return ruled;
  /*
   * A TEACHER'S ADJUSTMENT REPLACES THE RECORDED GRADE AND NOTHING ELSE.
   *
   * The original Test score, the actual Retest score and the capped
   * contribution stay exactly what the student earned, and the grade the rule
   * would have recorded is kept as `ruleRecordedGrade`, so the adjustment can
   * be read against it and removed without losing anything.
   */
  const ruleSaid = ruled.recordedGrade === null ? 'no grade' : `${ruled.recordedGrade}%`;
  return {
    ...ruled,
    ruleRecordedGrade: ruled.recordedGrade,
    ruleReason: ruled.reason,
    recordedGrade: adjustment.grade,
    recordedGradeSource: GRADE_SOURCE.TEACHER_ADJUSTMENT,
    gradeAdjustment: adjustment,
    passed: adjustment.grade >= ruled.passingScore,
    reason: `Set by the teacher to ${adjustment.grade}% from ${gradeAdjustmentSourceLabel(adjustment.source)}`
      + `${adjustment.note ? ` (${adjustment.note})` : ''}. The grade rule alone would record ${ruleSaid}.`,
  };
};

/**
 * A teacher sets the recorded grade by hand.
 *
 * `grade` is the number to record; the caller has already resolved it from the
 * source it names (the server reads the Review score and the actual Retest
 * score itself and never takes those from a browser). Every adjustment is an
 * audit row saying who, when, from what, and what it replaced.
 */
export const applyTeacherGradeAdjustment = (record, {
  grade, source = GRADE_ADJUSTMENT_SOURCE.MANUAL, note = '', by = null, at = null, policy = null,
} = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  const adjustment = normalizeGradeAdjustment({ grade, source, note, by, at: Number(at) || Date.now() });
  if (!adjustment) throw new Error('A grade between 0 and 100 is required.');
  const before = recordGradeState(normalized, policy);
  const next = { ...normalized, gradeAdjustment: adjustment };
  const after = recordGradeState(next, policy);
  return {
    ...next,
    recordedGrade: after.recordedGrade,
    history: appendTestCycleGradeHistory(normalized.history, {
      at: adjustment.at,
      reason: GRADE_HISTORY_REASON.TEACHER_ADJUSTMENT,
      recordedGrade: after.recordedGrade,
      originalTestGrade: after.originalTestGrade,
      rawRetestGrade: after.rawRetestGrade,
      retestCappedContribution: after.retestCappedContribution,
      detail: after.reason,
      by: adjustment.by,
      source: adjustment.source,
      previousRecordedGrade: before.recordedGrade,
    }),
    updatedAt: adjustment.at,
  };
};

/** Remove a teacher's adjustment: the grade rule decides again. Audited. */
export const clearTeacherGradeAdjustment = (record, { by = null, at = null, policy = null } = {}) => {
  const normalized = normalizeTestCycleRecord(record);
  if (!normalized.gradeAdjustment) return normalized;
  const when = Number(at) || Date.now();
  const before = recordGradeState(normalized, policy);
  const { gradeAdjustment: _removed, ...rest } = normalized;
  const after = recordGradeState(rest, policy);
  return {
    ...rest,
    recordedGrade: after.recordedGrade,
    history: appendTestCycleGradeHistory(normalized.history, {
      at: when,
      reason: GRADE_HISTORY_REASON.TEACHER_ADJUSTMENT_CLEARED,
      recordedGrade: after.recordedGrade,
      originalTestGrade: after.originalTestGrade,
      rawRetestGrade: after.rawRetestGrade,
      retestCappedContribution: after.retestCappedContribution,
      detail: `Teacher adjustment removed. ${after.reason}`,
      by,
      previousRecordedGrade: before.recordedGrade,
    }),
    updatedAt: when,
  };
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
  const failed = resolved && !resolved.externalAssessment && score !== null && score < resolved.passingScore;
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
      reason: resolved?.externalAssessment ? GRADE_HISTORY_REASON.RETEST_RELEASED : GRADE_HISTORY_REASON.TEST_RELEASED,
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
  } else if (grade.retestWithoutOriginal) {
    // Said, not left blank: a missing row would read as a score not shown.
    rows.push({ key: 'originalTest', label: 'Original Test', value: 'Not taken' });
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
  if (grade.gradeAdjustment) {
    rows.push({
      key: 'gradeAdjustment',
      label: 'Set by your teacher',
      value: `${grade.gradeAdjustment.grade}% from ${gradeAdjustmentSourceLabel(grade.gradeAdjustment.source)}`,
    });
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
