/*
 * THE DEADLINE FINALIZER'S DECISIONS.
 *
 * A checkpoint is written by a student's browser into a student-writable
 * document, and read here by code holding Admin SDK credentials. So this file
 * assumes the checkpoint is hostile and re-derives everything that matters:
 *
 *   - WHO: the student, their class, and whether the assignment was ever
 *     assigned to that class, from the authoritative grade row and assignment.
 *   - WHAT: the authoritative question at that index, its identity and its
 *     activity role, from the assignment.
 *   - WHEN: the real close, from the assignment, the class schedule and the
 *     teacher's current overrides. The checkpoint's `candidateFinalizeAt` is a
 *     query hint and is never read here, so writing a later one buys a student
 *     nothing but a later look.
 *   - WHETHER: correctness, from the shared ordinary grading contract run
 *     against the student's raw response.
 *
 * Every check fails CLOSED. A missing class, a missing question, a role that
 * does not match, a type the server cannot mark — all of them stop the
 * checkpoint rather than letting it through on a default.
 */
import { resolveAuthoritativeClose, SCHOOL_TIME_ZONE } from './sectionDeadline.mjs';
import { gradeOrdinaryResponse, serverGradingSupport } from './ordinaryResponseGrading.mjs';
import { getEffectiveActivityPolicy } from './activityPolicies.mjs';
import { normalizeQuestionRecord, recordQuestionAttempt, resolveQuestionMaximumAttempts, resolveTeacherGrantedExtraAttempts } from './attemptPolicy.mjs';
import { buildAttemptEvidenceEvent } from './attemptEvidenceEvent.mjs';
import {
  classworkGradeProjection,
  dolSectionProjection,
  evaluateClassworkCompletionRule,
  mergeSupportUsage,
} from './assignmentProjections.mjs';
import { zonedDateKey } from './instructionalCalendar.mjs';
import {
  CHECKPOINT_STATUS,
  FORBIDDEN_CHECKPOINT_FIELDS,
  RESPONSE_CHECKPOINT_SCHEMA_VERSION,
} from './responseCheckpointSchema.mjs';
import {
  captureAutomaticGradingEvidence,
  responseInspectionEvidenceDocumentId,
} from './responseInspector.mjs';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/** Milliseconds for anything Firestore or a browser might have written. */
export const asMillis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

/** The id every run of this checkpoint's finalization writes. Deterministic. */
export const checkpointSubmissionId = (checkpoint = {}) => (
  `deadline:${text(checkpoint.documentId)}:${Number(checkpoint.revision) || 0}`
);

const questionIdentity = (question = {}) => text(question.questionId || question.id) || null;

/**
 * Is this checkpoint about work this student was actually authorized to do?
 *
 * Returns `{ ok: false, reason }` for anything it cannot prove. The reason is
 * recorded on the checkpoint so a forged write is visible rather than silent.
 */
export const verifyCheckpointAuthorization = ({
  checkpoint,
  assignment,
  gradeDocument,
  gradeDocumentId,
  question,
  isSecureAssignment = false,
} = {}) => {
  if (!checkpoint || typeof checkpoint !== 'object') return { ok: false, reason: 'missing-checkpoint' };
  if (Number(checkpoint.schemaVersion) !== RESPONSE_CHECKPOINT_SCHEMA_VERSION) {
    return { ok: false, reason: 'unknown-schema-version' };
  }
  if (checkpoint.secure === true) return { ok: false, reason: 'secure-flagged-checkpoint' };

  // A checkpoint that carries anything a grade is made of is a forgery
  // attempt, not a draft, no matter what the rest of it says.
  const smuggled = FORBIDDEN_CHECKPOINT_FIELDS.filter((field) => (
    Object.prototype.hasOwnProperty.call(checkpoint, field) && field !== 'status'
  ));
  if (smuggled.length) return { ok: false, reason: `client-supplied-grading-data:${smuggled.join('|')}` };

  const studentId = text(checkpoint.studentId);
  if (!studentId) return { ok: false, reason: 'missing-student' };
  if (!gradeDocument || typeof gradeDocument !== 'object') return { ok: false, reason: 'missing-grade-record' };
  // The grade row this will be written into must BE this student's row.
  if (text(gradeDocumentId) !== studentId) return { ok: false, reason: 'grade-record-student-mismatch' };
  const recordStudentId = text(gradeDocument.studentId || gradeDocument.id);
  if (recordStudentId && recordStudentId !== studentId) return { ok: false, reason: 'grade-record-student-mismatch' };

  if (!assignment || typeof assignment !== 'object') return { ok: false, reason: 'missing-assignment' };
  if (text(assignment.id) && text(checkpoint.assignmentId) && text(assignment.id) !== text(checkpoint.assignmentId)) {
    return { ok: false, reason: 'assignment-identity-mismatch' };
  }
  if (isSecureAssignment) return { ok: false, reason: 'secure-assignment-excluded' };
  if (assignment.secure === true) return { ok: false, reason: 'secure-assignment-excluded' };
  if (assignment.isPathSession === true || text(assignment.surface) === 'path') {
    return { ok: false, reason: 'path-session-excluded' };
  }

  // The student's class is whatever the roster says it is. A checkpoint with
  // no class, or a different class, is not authorization — it is a missing
  // proof, and a missing proof fails closed.
  const authoritativeClassId = text(gradeDocument.classId);
  if (!authoritativeClassId) return { ok: false, reason: 'student-has-no-class' };
  const claimedClassId = text(checkpoint.classId || checkpoint.finalizationContext?.classId);
  if (!claimedClassId) return { ok: false, reason: 'checkpoint-has-no-class' };
  if (claimedClassId !== authoritativeClassId) return { ok: false, reason: 'class-mismatch' };

  const assignedClassIds = list(assignment.assignedClassIds).map(text).filter(Boolean);
  if (!assignedClassIds.includes(authoritativeClassId)) return { ok: false, reason: 'assignment-not-assigned-to-class' };

  const questionIndex = Number(checkpoint.questionIndex);
  if (!Number.isInteger(questionIndex) || questionIndex < 0) return { ok: false, reason: 'invalid-question-index' };
  if (!question || typeof question !== 'object') return { ok: false, reason: 'question-index-not-found' };
  if (question.teacherExcluded === true) return { ok: false, reason: 'question-excluded-by-teacher' };

  const authoritativeQuestionId = questionIdentity(question);
  const claimedQuestionId = text(checkpoint.questionId) || null;
  if (claimedQuestionId !== authoritativeQuestionId) return { ok: false, reason: 'question-identity-mismatch' };

  const authoritativeRole = text(question.activityRole).toLowerCase();
  const claimedRole = text(checkpoint.activityRole).toLowerCase();
  if (!authoritativeRole || claimedRole !== authoritativeRole) return { ok: false, reason: 'activity-role-mismatch' };

  const support = serverGradingSupport(question);
  if (!support.supported) return { ok: false, reason: `unsupported-question:${support.reason}`, unsupported: true };

  const canonical = normalizeQuestionRecord(
    gradeDocument?.gradesByAssignment?.[text(checkpoint.assignmentId)]?.[String(questionIndex)]
    ?? gradeDocument?.gradesByAssignment?.[text(checkpoint.assignmentId)]?.[questionIndex],
  );
  // A checkpoint written against variant 0 cannot finalize after the student
  // took a replacement question: the answer key moved.
  if (Number(checkpoint.variantIndex || 0) !== Number(canonical.variantIndex || 0)) {
    return { ok: false, reason: 'variant-superseded' };
  }

  return { ok: true, reason: null, classId: authoritativeClassId, activityRole: authoritativeRole, canonicalRecord: canonical };
};

/**
 * What should happen to this checkpoint right now?
 *
 * `reschedule` — the real close is still ahead (a teacher extended, or the
 *   client's hint was early). Look again then.
 * `hold` — no close can be proven yet. Never treated as closed.
 * `close` — retire the checkpoint with a status, writing no grade.
 * `finalize` — grade the response and write one canonical attempt.
 */
export const decideCheckpointFinalization = ({
  checkpoint,
  assignment,
  gradeDocument,
  gradeDocumentId,
  question,
  schedule = null,
  classPeriod = null,
  isSecureAssignment = false,
  now = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
} = {}) => {
  if (!checkpoint || text(checkpoint.status) !== CHECKPOINT_STATUS.ACTIVE) {
    return { action: 'skip', status: text(checkpoint?.status) || 'not-active', reason: 'not-active' };
  }

  const authorization = verifyCheckpointAuthorization({
    checkpoint, assignment, gradeDocument, gradeDocumentId, question, isSecureAssignment,
  });
  if (!authorization.ok) {
    return {
      action: 'close',
      status: authorization.unsupported ? CHECKPOINT_STATUS.UNSUPPORTED_QUESTION : CHECKPOINT_STATUS.INVALID_CONTEXT,
      reason: authorization.reason,
    };
  }

  const close = resolveAuthoritativeClose({
    assignment,
    activityRole: authorization.activityRole,
    schedule,
    classId: authorization.classId,
    classPeriod: classPeriod ?? checkpoint.finalizationContext?.classPeriod ?? null,
    nowValue: now,
    timeZone,
    // Same authoritative student-specific final cutoff the client already
    // reads (assignmentLifecycle.js) and Attendance History already writes
    // (assignment.studentOverrides[studentId].lateDueAt) — a checkpoint
    // captured within an authorized extension finalizes for credit here too.
    studentId: text(checkpoint.studentId),
  });
  if (!close.closesAtMs) return { action: 'hold', status: 'no-authoritative-close', reason: 'no-authoritative-close' };
  // The close moved later — a teacher extension or reopen. Come back then.
  if (close.closesAtMs > now) {
    return { action: 'reschedule', finalizeAt: close.closesAtMs, reason: close.reason };
  }

  const submissionId = checkpointSubmissionId(checkpoint);
  const canonical = authorization.canonicalRecord;
  // A scheduler retry after a successful write must not append a second
  // attempt. The canonical record already names this exact finalization.
  if (text(canonical.lastSubmissionId) === submissionId) {
    return { action: 'close', status: CHECKPOINT_STATUS.AUTO_SUBMITTED, reason: 'already-finalized', submissionId, cutoff: close.closesAtMs };
  }

  const response = checkpoint.response || {};
  if (checkpoint.isComplete !== true) {
    return { action: 'close', status: CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE, reason: 'incomplete-at-close', cutoff: close.closesAtMs };
  }

  // Work MathMaster only heard about after the close cannot change a grade. It
  // stays recoverable history instead.
  const acknowledgedAt = asMillis(checkpoint.serverAcknowledgedAt);
  if (!acknowledgedAt || acknowledgedAt > close.closesAtMs) {
    return { action: 'close', status: CHECKPOINT_STATUS.RECOVERED_AFTER_CLOSE, reason: 'acknowledged-after-close', cutoff: close.closesAtMs };
  }

  // Newer authority wins: an explicit Submit, a step submission, or any other
  // attempt recorded since this checkpoint was captured.
  if (Number(canonical.totalAttempts || 0) !== Number(checkpoint.previousTotalAttempts || 0)) {
    return { action: 'close', status: CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION, reason: 'canonical-attempts-moved', cutoff: close.closesAtMs };
  }
  if (['correct', 'expired'].includes(text(canonical.status))) {
    return { action: 'close', status: CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION, reason: 'question-already-terminal', cutoff: close.closesAtMs };
  }

  const grading = gradeOrdinaryResponse({ question, response });
  if (!grading.graded) {
    return {
      action: 'close',
      status: grading.reason === 'incomplete-response' || grading.reason === 'blank-response'
        ? CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE
        : CHECKPOINT_STATUS.UNSUPPORTED_QUESTION,
      reason: grading.reason,
      cutoff: close.closesAtMs,
    };
  }

  return {
    action: 'finalize',
    status: CHECKPOINT_STATUS.AUTO_SUBMITTED,
    reason: close.reason,
    cutoff: close.closesAtMs,
    submissionId,
    grading,
    activityRole: authorization.activityRole,
    canonicalRecord: canonical,
  };
};

/*
 * WHEN A DEADLINE AUTO-SUBMIT ACTUALLY HAPPENED, ACADEMICALLY.
 *
 * Never the minute the scheduler ran. A checkpoint due at Friday's bell that
 * the scheduler reaches on Monday is Friday's work, and recording it as Monday
 * moves a grade — and a DOL — into a day the class it belongs to cannot see.
 *
 * Two server-held times can prove when the work existed, and both are trusted
 * because a browser cannot move either:
 *
 *   `serverAcknowledgedAt`  when MathMaster received the response, stamped by
 *                           Firestore's own `request.time` under the rules.
 *   the authoritative CLOSE the deadline this finalization is acting on.
 *
 * The response was in hand at acknowledgement and was submitted by the close,
 * so the close is the moment the submission is treated as made — bounded below
 * by the acknowledgement, because work cannot be recorded before MathMaster
 * held it. `runAt` is the fallback only when neither is available.
 */
export const resolveCheckpointOccurrenceAt = ({ checkpoint, decision, runAt = Date.now() } = {}) => {
  const acknowledgedAt = asMillis(checkpoint?.serverAcknowledgedAt);
  const cutoff = Number(decision?.cutoff);
  if (Number.isFinite(cutoff) && cutoff > 0) {
    return acknowledgedAt === null ? cutoff : Math.max(acknowledgedAt, Math.min(cutoff, runAt));
  }
  return acknowledgedAt === null ? runAt : acknowledgedAt;
};

/**
 * Turn a server-derived grading result into the canonical attempt and its
 * evidence — through the same attempt policy and the same evidence builder a
 * manual Submit uses.
 */
export const buildCheckpointFinalization = ({
  checkpoint,
  assignment,
  question,
  decision,
  gradeDocument = {},
  // Supplied by the caller from its own runtime projection of the assignment.
  classworkIndices = [],
  dolIndices = [],
  dolSectionScore = null,
  // The ACADEMIC occurrence time. Omit it and it is derived from the
  // server-trusted acknowledgement and the authoritative close; `runAt` is the
  // scheduler's own clock and is only a last-resort fallback.
  occurredAt = null,
  runAt = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
} = {}) => {
  const activityPolicy = getEffectiveActivityPolicy(decision.activityRole);
  const academicAt = occurredAt === null || occurredAt === undefined
    ? resolveCheckpointOccurrenceAt({ checkpoint, decision, runAt })
    : Number(occurredAt);
  const outcome = recordQuestionAttempt({
    record: decision.canonicalRecord,
    isCorrect: decision.grading.isCorrect,
    questionDetails: `${text(question?.prompt) || 'Response submitted automatically when time ended.'}`,
    timeSpent: Number(checkpoint?.clientMetadata?.timeSpentSeconds) || 0,
    parts: decision.grading.parts,
    supportUsage: checkpoint?.supportUsage || null,
    responseKey: text(checkpoint?.response?.value) || JSON.stringify(checkpoint?.response?.fields || []),
    // Partial credit is derived from the server's own part results, never from
    // a number the browser sent.
    partialCreditPercent: null,
    maximumAttempts: resolveQuestionMaximumAttempts({
      question,
      maximumAttempts: activityPolicy.attempts,
      activityPolicy,
      teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({
        assignment,
        activityRole: decision.activityRole,
        classId: gradeDocument?.classId || null,
      }),
    }),
    // `lastAttemptAt` is the deadline this response was submitted at, not the
    // minute a background function happened to process it.
    occurredAt: academicAt,
  });

  const record = {
    ...outcome.record,
    lastSubmissionId: decision.submissionId,
    submissionOrigin: 'deadline-auto-submit',
    finalizationReason: decision.reason || null,
    gradedBy: 'server',
    // The audit trail for a late finalization: academic day on the record,
    // real processing time recorded beside it.
    academicOccurredAt: new Date(academicAt).toISOString(),
    finalizedAtRunTime: new Date(runAt).toISOString(),
    recoveredLate: runAt - academicAt > 60_000 ? true : null,
  };

  const gradingEvidence = captureAutomaticGradingEvidence({
    response: checkpoint?.response || null,
    grading: {
      ...decision.grading,
      isCorrect: record.status === 'correct',
      parts: record.partGrades,
    },
    question,
    submittedAt: new Date(academicAt).toISOString(),
    source: 'deadline-auto-submit',
    gradingAuthority: 'server',
  });

  const evidenceEvent = question?.type === 'modelingLab' ? null : buildAttemptEvidenceEvent({
    studentId: text(checkpoint.studentId),
    assignment,
    question,
    questionIndex: Number(checkpoint.questionIndex),
    activityRole: decision.activityRole,
    attemptRecord: record,
    attemptResult: outcome.result,
    supportUsage: record.supportUsage || {},
    occurredAt: academicAt,
  });

  /*
   * THE PROJECTIONS AN ATTEMPT UPDATES BESIDES ITS OWN RECORD.
   *
   * Writing only `gradesByAssignment` would record a student's final classwork
   * response and still leave them locked out of the dependent assignment,
   * because `prerequisiteAccess` reads the classwork completion score. The
   * ordinary Submit path writes all of these; so does this.
   */
  const assignmentId = text(checkpoint.assignmentId);
  const recordedAt = new Date(academicAt).toISOString();
  const assignmentTracker = {
    ...(gradeDocument?.gradesByAssignment?.[assignmentId] || {}),
    [String(checkpoint.questionIndex)]: record,
    [Number(checkpoint.questionIndex)]: record,
  };

  const completion = evaluateClassworkCompletionRule({
    classworkIndices,
    assignmentTracker,
    totalTimeSeconds: Number(gradeDocument?.assignmentActivity?.[assignmentId]?.totalTimeSeconds) || 0,
    completionRule: assignment?.completionRule || {},
  });
  const classworkGrade = classworkGradeProjection({
    completion,
    existingGrade: gradeDocument?.classworkGradesByAssignment?.[assignmentId] || null,
    recordedAt,
  });

  const supportUsage = mergeSupportUsage(
    gradeDocument?.supportUsageByAssignment?.[assignmentId] || {},
    checkpoint?.supportUsage || {},
  );

  // A scheduler can run after the wall-clock day changes. DOL ownership belongs
  // to the instructional cutoff that accepted the response, not to the minute
  // the background function happened to process it.
  const dolReferenceAt = Number(decision?.cutoff) || academicAt;
  const dolDateKey = zonedDateKey(dolReferenceAt, timeZone);
  const dolGrade = decision.activityRole === 'dol' && dolSectionScore !== null
    ? dolSectionProjection({
      existing: gradeDocument?.dolGradesByAssignment?.[assignmentId] || null,
      dateKey: dolDateKey,
      score: dolSectionScore,
      questionIndices: dolIndices,
      recordedAt,
      finalize: true,
      correctionReason: 'deadline-auto-submit',
    })
    : null;

  return {
    record,
    result: outcome.result,
    gradingEvidence,
    gradingEvidenceDocumentId: responseInspectionEvidenceDocumentId({
      assignmentId,
      questionIndex: checkpoint.questionIndex,
    }),
    evidenceEvent,
    assignmentTracker,
    classworkGrade,
    supportUsage,
    dolGrade,
    dolDateKey,
    academicAt,
  };
};

export { CHECKPOINT_STATUS };
export { getQuestionCredit } from './attemptPolicy.mjs';
export { dolSectionProjection } from './assignmentProjections.mjs';
