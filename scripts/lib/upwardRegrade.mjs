/*
 * RE-GRADE UPWARD ONLY: THE DECISIONS (D8; the owner, 2026-10-16).
 *
 * "Run the read-only count, then re-grade upward only." The counts are
 * scripts/report-classroom-regrade-candidates.mjs and the assignments surface
 * of scripts/report-grader-gaps-2-regrade.mjs, and, for the defective Digital
 * SAT factor draws (GR23, D22), the classroom surface of
 * scripts/report-sat-factor-regrade.mjs. scripts/apply-upward-regrade.mjs
 * applies what one of them listed, and this module decides, for one classroom
 * attempt read fresh from Firestore, whether it may be raised and what is
 * written. Pure: no Firestore, no clock (both are passed in).
 *
 * AN ATTEMPT IS RAISED ONLY WHEN ALL OF THESE HOLD, on the live records:
 *   - it was marked wrong: the record is not correct, its automatic score is
 *     below 100, and the verdict its evidence recorded is not right;
 *   - the platform's own replay (responseInspector.replayStoredResponse, the
 *     one "Apply Corrected Grade" uses) marks the same stored response right,
 *     against the question it was graded on (for a GR23 row: the option
 *     chosen is a factor of the polynomial that instance showed);
 *   - the evidence is for that very attempt (trustedEvidence: the check
 *     functions/index.js trustedResponseInspectionEvidence makes);
 *   - no teacher has decided it: no override of this question that applies to
 *     this attempt, and no assignment grade set by hand;
 *   - it is not secure Test Cycle work (that has its own correction workflow).
 * A score that rises but does not reach right is not raised. Nothing is ever
 * lowered: the new score must be above what the student has now.
 *
 * WHAT IS WRITTEN is what the teacher's "Apply Corrected Grade" writes
 * (functions/index.js overrideStudentResponseGrade, action applyReplay): an
 * override of 100 in the rule-protected teacherGradeOverridesByAssignment
 * (the attempt itself is never touched, so a teacher can restore it), the
 * DOL projection when the question is a DOL item, a classroomReleaseSignals
 * entry and a gradeOverrideAudits record. The override and the signal wake
 * syncGradeToClassroom, which posts the grade: nothing here talks to Google
 * Classroom. (The callable also refreshes the classwork completion rule, which
 * reads attempt status and time, never credit: an override cannot move it.)
 */

import { createRequire } from 'node:module';
import {
  automaticQuestionScore,
  buildGradeOverride,
  correctedDolProjection,
  effectiveQuestionScore,
  replayStoredResponse,
} from '../../functions/shared/responseInspector.mjs';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';
import { SCHOOL_TIME_ZONE } from '../../functions/shared/sectionDeadline.mjs';
import { questionWasAttempted, trustedEvidence } from './classroomRegradePlan.mjs';
import { judgeClassroomFactorAttempt } from './satFactorRegradePlan.mjs';

const functionsRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const { runtimeQuestionsFromAssignment, runtimeIncludedQuestionIndicesForSection } = functionsRequire('./lib/assignmentRuntime.js');
const { studentOmittedFor, studentRequiredIndices } = functionsRequire('./lib/studentWorkloadIndices.js');
const { weightedQuestionTotals } = functionsRequire('./lib/questionWeights.js');
const { storedAlgebraStepPartialCredit } = functionsRequire('./lib/classroomGradeRuntime.js');

/** The override's source and audit type: a D8 re-grade is told apart from a teacher's own. */
export const UPWARD_REGRADE_SOURCE = 'regrade-upward';
/** One of responseInspector's OVERRIDE_REASONS. */
export const UPWARD_REGRADE_REASON = 'Platform/grader issue';
export const UPWARD_REGRADE_NOTE = 'Re-graded up (decision D8): the current grader marks this same answer right.';
export const UPWARD_REGRADE_ACTOR_UID = 'operator:regrade-upward';
export const ASSIGNMENT_OVERRIDE_KEY = '__assignment';

/*
 * THE DEFECTIVE DIGITAL SAT FACTOR DRAWS (GR23, decision D22). Their stored
 * key is unchanged, so the replay still marks a true factor wrong; the rows
 * scripts/report-sat-factor-regrade.mjs lists are judged instead by the factor
 * theorem on the instance the student was served
 * (satFactorRegradePlan.mjs judgeClassroomFactorAttempt). Every other rule
 * below is the same.
 */
export const SAT_FACTOR_REPORT_TOOL = 'report-sat-factor-regrade';
export const SAT_FACTOR_REGRADE_NOTE = 'Re-graded up (GR23, decision D22): the option chosen is a factor; this draw offered a true factor as a wrong option.';
const JUDGE_BY_REPORT = Object.freeze({ [SAT_FACTOR_REPORT_TOOL]: judgeClassroomFactorAttempt });
const DECISION_BY_REPORT = Object.freeze({ [SAT_FACTOR_REPORT_TOOL]: { decision: 'D22', note: SAT_FACTOR_REGRADE_NOTE } });

/** Why an attempt was left as it is. */
export const SKIP = Object.freeze({
  ASSIGNMENT_MISSING: 'assignment-missing',
  STUDENT_MISSING: 'student-missing',
  TEST_CYCLE: 'test-cycle',
  QUESTION_MISSING: 'question-missing',
  NOT_ATTEMPTED: 'not-attempted',
  ALREADY_RIGHT: 'already-right',
  TEACHER_DECIDED: 'teacher-override-active',
  ASSIGNMENT_GRADE_SET: 'assignment-grade-set-by-teacher',
  NO_TRUSTED_EVIDENCE: 'no-trusted-evidence',
  REPLAY_UNAVAILABLE: 'replay-unavailable',
  NOT_RIGHT_NOW: 'not-right-now',
  NOT_HIGHER: 'not-higher',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '').trim();
const clampPercent = (value) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

/* -------------------------------------------------------------- candidates -- */

const REPORT_CLASSES_RAISED = new Set(['re-grade-candidate', 'changed-outside-k']);

/**
 * The classroom attempts a read-only report listed for raising, once each:
 * [{ studentId, assignmentId, questionIndex, from }]. From the classroom
 * re-grade report, its re-grade candidates and changes outside K (never
 * needs-teacher or now-lower); from the grader-gaps-2 report, its
 * assignments rows that went up. Secure and Path rows are not classroom
 * attempts and are left out (counted in `ignored`).
 */
export const candidatesFromReports = (reports = []) => {
  const seen = new Map();
  const ignored = {};
  const ignore = (reason) => { ignored[reason] = (ignored[reason] || 0) + 1; };
  const add = (studentId, assignmentId, questionIndex, from) => {
    const index = Number(questionIndex);
    if (!text(studentId) || !text(assignmentId) || !Number.isInteger(index) || index < 0) { ignore('unreadable-row'); return; }
    const key = `${text(studentId)}\u0000${text(assignmentId)}\u0000${index}`;
    if (!seen.has(key)) seen.set(key, { studentId: text(studentId), assignmentId: text(assignmentId), questionIndex: index, from });
  };
  (Array.isArray(reports) ? reports : []).forEach((report) => {
    if (report?.tool === 'report-classroom-regrade-candidates') {
      (report.assignments || []).forEach((assignment) => (assignment.questions || []).forEach((question) => (question.attempts || []).forEach((attempt) => {
        if (REPORT_CLASSES_RAISED.has(attempt?.classification)) add(attempt.studentId, assignment.assignmentId, question.questionIndex, report.tool);
        else ignore(`classification:${attempt?.classification || 'none'}`);
      })));
    } else if (report?.tool === 'report-grader-gaps-2-regrade') {
      (report.changes || []).forEach((change) => {
        if (change?.surface !== 'assignments') ignore(`surface:${change?.surface || 'none'}`);
        else if (change.direction !== 'up') ignore('direction:down');
        else add(change.studentId, change.assignmentId, change.questionIndex, report.tool);
      });
    } else if (report?.tool === SAT_FACTOR_REPORT_TOOL) {
      // Its classroom would-be-correct rows; its My Math Path rows are not
      // classroom attempts.
      (report.path?.rows || []).forEach(() => ignore('surface:path'));
      (report.classroom?.attempts || []).forEach((attempt) => {
        if (attempt?.classification === 'would-be-correct') add(attempt.studentId, attempt.assignmentId, attempt.questionIndex, report.tool);
        else ignore(`classification:${attempt?.classification || 'none'}`);
      });
    } else {
      throw new Error(`not a re-grade report this step reads (${text(report?.tool) || 'no tool named'})`);
    }
  });
  return { candidates: [...seen.values()], ignored };
};

/* ----------------------------------------------------- the server's credit -- */

/*
 * functions/index.js teacherOverrideAppliesToRecord and getQuestionCredit,
 * rule for rule (they are not exported there). tests/platform/
 * upwardRegrade.test.mjs runs both against the deployed source over the same
 * cases, so the two cannot drift apart.
 */
export const teacherOverrideApplies = (record, override = null) => {
  if (!record || override?.active !== true || !Number.isFinite(Number(override.score))) return false;
  if (override.persistent === true && override.source === 'teacher-section-zero') return true;
  const recordAttempts = Number(record.totalAttempts ?? record.attemptCount ?? 0);
  const overrideAttempts = Number(override.totalAttempts);
  if (!Number.isFinite(overrideAttempts) || overrideAttempts !== recordAttempts) return false;
  const recordVariant = Number(record.variantIndex ?? 0);
  const overrideVariant = Number(override.variantIndex);
  if (!Number.isFinite(overrideVariant) || overrideVariant !== recordVariant) return false;
  const overrideSubmissionId = String(override.submissionId || '');
  if (overrideSubmissionId) return overrideSubmissionId === String(record.lastSubmissionId || '');
  const overrideLastAttemptAt = String(override.lastAttemptAt || '');
  return Boolean(overrideLastAttemptAt) && overrideLastAttemptAt === String(record.lastAttemptAt || record.academicOccurredAt || '');
};

export const questionCredit = (record, override = null) => {
  if (!record) return 0;
  if (teacherOverrideApplies(record, override)) return clampPercent(override.score) / 100;
  if (record.status === 'correct') return 1;
  const stored = clampPercent(record.bestPartialCredit ?? record.partialCredit ?? 0);
  return Math.max(stored, storedAlgebraStepPartialCredit(record)) / 100;
};

/* ---------------------------------------------------------------- the plan -- */

const overrideFor = (overrides, questionIndex) => overrides?.[String(questionIndex)] ?? overrides?.[questionIndex] ?? null;

/**
 * Whether one attempt may be raised, from what was just read:
 * `{ outcome: 'raise' | SKIP.*, ...context }`. `evidenceDocument` is the
 * responseInspectionEvidence document's data (or null).
 */
export const planUpwardRegrade = ({
  studentId,
  assignmentId,
  questionIndex,
  assignment = null,
  gradeData = null,
  evidenceDocument = null,
  // The report that listed the attempt: a GR23 row is judged by the factor
  // theorem (JUDGE_BY_REPORT), every other by the platform's replay.
  from = null,
} = {}) => {
  const skip = (outcome, extra = {}) => ({ outcome, studentId, assignmentId, questionIndex, ...extra });
  if (!isObject(gradeData)) return skip(SKIP.STUDENT_MISSING);
  if (!isObject(assignment)) return skip(SKIP.ASSIGNMENT_MISSING);
  if (text(assignment?.assessmentPolicy?.mode) === 'testCycle') return skip(SKIP.TEST_CYCLE);
  // As the callable reads it: the stored document with its id.
  const withId = { id: assignmentId, ...assignment };
  const questions = runtimeQuestionsFromAssignment(withId);
  const question = questions[questionIndex];
  if (!question) return skip(SKIP.QUESTION_MISSING);
  const tracker = isObject(gradeData.gradesByAssignment?.[assignmentId]) ? gradeData.gradesByAssignment[assignmentId] : {};
  const record = tracker[String(questionIndex)] ?? tracker[questionIndex] ?? null;
  if (!isObject(record) || !questionWasAttempted(record)) return skip(SKIP.NOT_ATTEMPTED);
  const overrides = isObject(gradeData.teacherGradeOverridesByAssignment?.[assignmentId]) ? gradeData.teacherGradeOverridesByAssignment[assignmentId] : {};
  const previousOverride = overrideFor(overrides, questionIndex);
  // What the student has now, by the inspector's measure and by the server's
  // (which adds a Step Algebra attempt's step credit): the higher one, so
  // "above what they have" is never judged against an understated score.
  const oldScore = Math.max(effectiveQuestionScore(record, previousOverride), Math.round(questionCredit(record, previousOverride) * 100));
  const automaticScore = automaticQuestionScore(record);
  if (record.status === 'correct' || automaticScore >= 100) return skip(SKIP.ALREADY_RIGHT, { oldScore });
  // A teacher's own decision stands: on this attempt, or on the whole assignment.
  if (teacherOverrideApplies(record, previousOverride)) return skip(SKIP.TEACHER_DECIDED, { oldScore });
  const assignmentOverride = overrides[ASSIGNMENT_OVERRIDE_KEY];
  if (assignmentOverride?.active === true) return skip(SKIP.ASSIGNMENT_GRADE_SET, { oldScore });
  const evidence = trustedEvidence(evidenceDocument, { assignmentId, questionIndex, record });
  if (!evidence) return skip(SKIP.NO_TRUSTED_EVIDENCE, { oldScore });
  if (evidence.automaticResult?.isCorrect === true) return skip(SKIP.ALREADY_RIGHT, { oldScore });
  const replay = (JUDGE_BY_REPORT[from] || replayStoredResponse)({
    question,
    record,
    gradingEvidence: evidence,
    // A Question Family attempt is replayed against the instance its
    // validated delivery pin rebuilds, never the template.
    assignment: withId,
    questionIndex,
    studentId,
    classId: gradeData.classId || null,
  });
  if (!replay.available) return skip(SKIP.REPLAY_UNAVAILABLE, { oldScore, reason: replay.reason });
  const newScore = Number(replay.currentScore);
  if (replay.currentResult?.isCorrect !== true || newScore < 100) return skip(SKIP.NOT_RIGHT_NOW, { oldScore, newScore });
  if (!(newScore > oldScore)) return skip(SKIP.NOT_HIGHER, { oldScore, newScore });
  return {
    outcome: 'raise',
    studentId,
    assignmentId,
    questionIndex,
    from,
    oldScore,
    newScore,
    automaticScore,
    question,
    questions,
    record,
    tracker,
    overrides,
    previousOverride,
    replay: { adapter: replay.adapter, questionSource: replay.questionSource || null, originalScore: replay.originalScore, currentScore: newScore },
  };
};

/**
 * The writes for a `raise` plan: `{ updates: [[segments, value], ...], audit }`
 * — `updates` are field paths on grades/{studentId}, `audit` the
 * gradeOverrideAudits document. `nowIso` is the moment of the write; `actor`
 * is { email, name } of who ran it.
 */
export const upwardRegradeWrites = async ({ plan, assignment, gradeData, actor = {}, nowIso, runId = null } = {}) => {
  if (plan?.outcome !== 'raise') throw new Error('only a raise plan has writes');
  const { assignmentId, questionIndex, record, tracker, questions, question } = plan;
  const { decision, note } = DECISION_BY_REPORT[plan.from] || { decision: 'D8', note: UPWARD_REGRADE_NOTE };
  const correction = buildGradeOverride({
    record,
    previousOverride: plan.previousOverride,
    score: plan.newScore,
    reason: UPWARD_REGRADE_REASON,
    note,
    actor: { uid: UPWARD_REGRADE_ACTOR_UID, email: text(actor.email) || null, name: text(actor.name) || 'D8 upward re-grade' },
    at: nowIso,
    source: UPWARD_REGRADE_SOURCE,
  });
  // Never lower, checked once more on what is about to be written.
  if (!(correction.override.score > plan.oldScore)) throw new Error('refusing: the override would not raise the grade');
  const overrides = { ...plan.overrides, [String(questionIndex)]: correction.override };
  const updates = [
    [['teacherGradeOverridesByAssignment', assignmentId, String(questionIndex)], correction.override],
    [['classroomReleaseSignals', assignmentId], { requestedAt: nowIso, reason: 'manual-retry', source: UPWARD_REGRADE_SOURCE }],
  ];

  // The DOL projection, exactly as the callable recomputes it.
  const withId = { id: assignmentId, ...assignment };
  const studentOmitted = await studentOmittedFor({ assignment: withId, gradeData, assignmentId, nowValue: Date.parse(nowIso) });
  const dolIndices = studentRequiredIndices(runtimeIncludedQuestionIndicesForSection(withId, 'dol'), studentOmitted);
  if (dolIndices.includes(questionIndex)) {
    const totals = weightedQuestionTotals({
      tracker,
      questions,
      indices: dolIndices,
      creditForRecord: (candidate, index) => questionCredit(candidate, overrideFor(overrides, index)),
    });
    const existingDol = isObject(gradeData.dolGradesByAssignment?.[assignmentId]) ? gradeData.dolGradesByAssignment[assignmentId] : {};
    const occurrence = Date.parse(String(record.academicOccurredAt || record.lastAttemptAt || ''));
    const occurrenceDateKey = Number.isFinite(occurrence) ? zonedDateKey(occurrence, SCHOOL_TIME_ZONE) : null;
    const dateKey = (occurrenceDateKey && existingDol[occurrenceDateKey] ? occurrenceDateKey : null)
      || Object.keys(existingDol).sort().at(-1)
      || zonedDateKey(Date.parse(nowIso), SCHOOL_TIME_ZONE);
    updates.push([['dolGradesByAssignment', assignmentId, dateKey], correctedDolProjection({
      existingByDate: existingDol,
      dateKey,
      score: totals.score ?? 0,
      questionIndices: dolIndices,
      correctedAt: nowIso,
    })]);
  }

  return {
    updates,
    audit: {
      ...correction.audit,
      assignmentId,
      questionIndex,
      questionId: question?.questionId || question?.id || null,
      automaticStatus: record.status || null,
      automaticScore: plan.automaticScore,
      overrideActiveAfter: true,
      decision,
      runId,
      replay: plan.replay,
    },
  };
};
