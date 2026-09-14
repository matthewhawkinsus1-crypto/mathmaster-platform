/*
 * WHAT A RESPONSE CHECKPOINT IS ALLOWED TO CONTAIN.
 *
 * A checkpoint is written by the STUDENT'S BROWSER into a student-writable
 * document, and is later read by an Admin SDK function that can write canonical
 * grades. That combination is only safe while the checkpoint carries no
 * authority of its own: it is the student's raw work plus the identity needed
 * to find the authoritative question, and nothing else.
 *
 * Everything a grade is made of — correctness, score, partial credit, the
 * canonical question record, the evidence event, mastery, the attempt count
 * AFTER this response — is derived by the server at finalization from the
 * authoritative assignment. None of it may cross this boundary, so the builder
 * below refuses to construct a payload that contains any of it.
 */

export const RESPONSE_CHECKPOINT_SCHEMA_VERSION = 2;

/**
 * The checkpoint lifecycle.
 *
 * Only `active` is in the scheduler's due query. Every other status is
 * terminal for the scheduler and clears `candidateFinalizeAt`, so finished
 * checkpoints leave the query instead of being re-scanned forever.
 */
export const CHECKPOINT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
  EXPLICITLY_SUBMITTED: 'explicitly-submitted',
  INCOMPLETE_AT_CLOSE: 'incomplete-at-close',
  AUTO_SUBMITTED: 'auto-submitted',
  RECOVERED_AFTER_CLOSE: 'recovered-after-close',
  INVALID_CONTEXT: 'invalid-context',
  SKIPPED_NEWER_SUBMISSION: 'skipped-newer-submission',
  UNSUPPORTED_QUESTION: 'unsupported-question',
});

export const TERMINAL_CHECKPOINT_STATUSES = Object.freeze([
  CHECKPOINT_STATUS.SUPERSEDED,
  CHECKPOINT_STATUS.EXPLICITLY_SUBMITTED,
  CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE,
  CHECKPOINT_STATUS.AUTO_SUBMITTED,
  CHECKPOINT_STATUS.RECOVERED_AFTER_CLOSE,
  CHECKPOINT_STATUS.INVALID_CONTEXT,
  CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION,
  CHECKPOINT_STATUS.UNSUPPORTED_QUESTION,
]);

/**
 * Fields that would make a checkpoint into a grade.
 *
 * Checked at every layer that can: the builder throws, the finalizer refuses
 * the document, and the Firestore rules reject the write.
 */
export const FORBIDDEN_CHECKPOINT_FIELDS = Object.freeze([
  'isCorrect',
  'score',
  'grade',
  'record',
  'submissionEnvelope',
  'evidenceEvent',
  'evidence',
  'mastery',
  'masteryResult',
  'partialCredit',
  'partialCreditPercent',
  'partGrades',
  'totalAttempts',
  'attemptCount',
  'status',
  'answerKey',
  'acceptedAnswers',
  'solution',
  'seed',
]);

const MAX_RESPONSE_VALUE_LENGTH = 2000;
const MAX_RESPONSE_FIELDS = 60;
const MAX_FIELD_VALUE_LENGTH = 240;

const keyPart = (value) => encodeURIComponent(String(value ?? ''));
const text = (value) => String(value ?? '');
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * One checkpoint per student + assignment + question + delivered version.
 *
 * Deterministic so a new revision REPLACES the previous one rather than
 * accumulating: the latest state of this exact response is the only thing the
 * deadline is ever allowed to act on.
 */
export const checkpointDocumentId = ({
  studentId,
  assignmentId,
  questionIndex,
  questionId = '',
  variantIndex = 0,
  generationKey = '',
} = {}) => [studentId, assignmentId, questionIndex, questionId, variantIndex, generationKey]
  .map(keyPart)
  .join('__');

export const checkpointActionId = (identity) => `response_checkpoint:${checkpointDocumentId(identity)}`;

/** Throws if anything that decides a grade tried to enter the checkpoint. */
export const assertNoAuthoritativeGradingData = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return;
  const offending = FORBIDDEN_CHECKPOINT_FIELDS.filter((field) => (
    Object.prototype.hasOwnProperty.call(candidate, field)
  ));
  if (offending.length) {
    throw new Error(`A response checkpoint may not carry authoritative grading data: ${offending.join(', ')}.`);
  }
};

const normalizeSupportUsage = (supportUsage = {}) => ({
  modified: Boolean(supportUsage?.modified),
  accommodations: list(supportUsage?.accommodations).slice(0, 20).map(text),
  modifications: list(supportUsage?.modifications).slice(0, 20).map(text),
  hintUsed: Boolean(supportUsage?.hintUsed),
  teacherAssisted: Boolean(supportUsage?.teacherAssisted),
  scaffoldUsed: Boolean(supportUsage?.scaffoldUsed),
  contextScaffoldUsed: Boolean(supportUsage?.contextScaffoldUsed),
  remediationUsed: Boolean(supportUsage?.remediationUsed),
  workedExampleUsed: Boolean(supportUsage?.workedExampleUsed),
  calculatorUsed: Boolean(supportUsage?.calculatorUsed),
});

/**
 * The stored response: the student's own work and the part identity needed to
 * reproduce marking. No correctness for any part — a browser's opinion about a
 * part is exactly as untrusted as its opinion about the whole.
 */
export const normalizeStoredResponse = (response = {}) => ({
  kind: ['scalar', 'fields', 'opaque'].includes(response?.kind) ? response.kind : 'opaque',
  type: text(response?.type),
  value: text(response?.value).slice(0, MAX_RESPONSE_VALUE_LENGTH),
  fields: list(response?.fields).slice(0, MAX_RESPONSE_FIELDS).map((field, index) => ({
    id: text(field?.id ?? `part-${index + 1}`),
    value: text(field?.value).slice(0, MAX_FIELD_VALUE_LENGTH),
    isComplete: field?.isComplete === true,
  })),
});

/**
 * Build the exact document body a checkpoint is allowed to have.
 *
 * `candidateFinalizeAt` is a QUERY HINT ONLY. It decides when the scheduler
 * first looks at this checkpoint; it never decides whether the work was on
 * time. The server re-derives the real close from authoritative data, so a
 * client that writes a later time only gets itself looked at later.
 */
export const buildResponseCheckpointPayload = ({
  identity = {},
  activityRole,
  response,
  isComplete,
  revision,
  candidateFinalizeAt = null,
  finalizationReason = null,
  finalizationContext = {},
  previousTotalAttempts = 0,
  supportUsage = null,
  timeSpentSeconds = 0,
  capturedAt = Date.now(),
  serverGradingSupported = true,
  unsupportedReason = null,
} = {}) => {
  const documentId = checkpointDocumentId(identity);
  const payload = {
    schemaVersion: RESPONSE_CHECKPOINT_SCHEMA_VERSION,
    documentId,
    studentId: text(identity.studentId),
    assignmentId: text(identity.assignmentId),
    questionIndex: Number(identity.questionIndex),
    questionId: text(identity.questionId) || null,
    variantIndex: Number(identity.variantIndex) || 0,
    generationKey: text(identity.generationKey) || null,
    classId: text(finalizationContext?.classId) || null,
    activityRole: text(activityRole),
    revision: Number(revision) || 1,
    // The student's work, and how complete it is. `isComplete: false` is a
    // real, meaningful revision: it is how a cleared answer supersedes the
    // completed one that came before it.
    response: normalizeStoredResponse(response),
    isComplete: isComplete === true,
    supportUsage: normalizeSupportUsage(supportUsage),
    // What the canonical record looked like BEFORE this response. The server
    // compares it with the live grade row, which is what makes a manual Submit
    // and a scheduler run produce one attempt rather than two.
    previousTotalAttempts: Math.max(0, Number(previousTotalAttempts) || 0),
    candidateFinalizeAt: candidateFinalizeAt || null,
    finalizationReason: finalizationReason || null,
    finalizationContext: {
      classId: text(finalizationContext?.classId) || null,
      classPeriod: text(finalizationContext?.classPeriod) || null,
      capturedAt: Number(capturedAt) || Date.now(),
    },
    // Non-authoritative. Time is merged as a maximum into the canonical record
    // exactly as the existing progress action already merges it.
    clientMetadata: {
      timeSpentSeconds: Math.max(0, Math.min(86_400, Number(timeSpentSeconds) || 0)),
      serverGradingSupported: serverGradingSupported !== false,
      unsupportedReason: unsupportedReason || null,
    },
    secure: false,
  };
  assertNoAuthoritativeGradingData(payload);
  return payload;
};
