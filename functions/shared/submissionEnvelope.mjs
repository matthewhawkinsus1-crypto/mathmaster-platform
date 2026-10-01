/*
 * THE STUDENT SUBMISSION ENVELOPE — WHAT A DEVICE SENDS, AND HOW IT IS READ.
 *
 * Split from submissionIngestion.mjs so the student app can build and read
 * envelopes without importing the server half, which grades through the
 * shared grading registry and therefore loads every tool's grader. Ingestion
 * re-exports everything here, so server code and tests see one module.
 *
 * Pure.
 */
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import { normalizeToolResponse } from './serverGrading/toolResponseContract.mjs';
import { SUBMISSION_DISPOSITION } from './studentSubmissionDisposition.mjs';

export const SUBMISSION_ENVELOPE_SCHEMA_VERSION = 1;

/** Kinds that carry academic credit and are therefore ingested here. */
export const INGESTIBLE_KINDS = Object.freeze(['ordinarySubmission', 'stepSubmission', 'questionReplacement']);

/** One call carries a whole stalled queue without becoming a write amplifier. */
export const MAX_ENVELOPES_PER_CALL = 25;

/*
 * Anything that would let a browser hand itself an answer or a grade.
 *
 * The envelope is built from a student's device, so this is checked when it is
 * built AND when it is read. `isCorrect` and `score` are deliberately absent:
 * a record legitimately carries a status and a partial credit, and both are
 * bounded below by the server's own read rather than by trusting the client.
 */
export const FORBIDDEN_ENVELOPE_FIELDS = Object.freeze([
  'answerKey',
  'acceptedAnswers',
  'answerFields',
  'solution',
  'seed',
  'secureQuestion',
  'gradingContract',
  'testCycle',
  'testCycleGrades',
]);

/*
 * Step Algebra records use `accepted` as a verdict. It is safe only in that
 * narrow boolean shape. Authoring contracts also use `accepted` for alternate
 * answers, so every string, array, object, number, or null value remains secure
 * answer-key material and must never cross the student submission boundary.
 */
const forbiddenEnvelopeEntry = (key, value) => (
  FORBIDDEN_ENVELOPE_FIELDS.includes(key)
  || (key === 'accepted' && typeof value !== 'boolean')
);

const text = (value) => String(value ?? '');
const trimmed = (value) => text(value).trim();
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const containsForbiddenField = (value, depth = 0) => {
  if (depth > 6 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenField(entry, depth + 1));
  return Object.entries(value).some(([key, nested]) => (
    forbiddenEnvelopeEntry(key, nested) || containsForbiddenField(nested, depth + 1)
  ));
};

export const assertEnvelopeCarriesNoSecureData = (candidate) => {
  if (candidate?.secure === true) throw new Error('Secure assessment work cannot be ingested as an ordinary submission.');
  if (containsForbiddenField(candidate)) {
    throw new Error('A submission envelope may not carry answer keys, generator seeds or secure assessment data.');
  }
};

/**
 * The section state the browser observed AT CAPTURE.
 *
 * This is the witness that makes "the teacher closed Classwork while this
 * answer sat in the queue" distinguishable from "the student answered after
 * the section was already closed". It is not authorization on its own — the
 * server still re-reads the assignment — but it is the only record of the
 * moment that a later teacher edit cannot rewrite.
 */
export const captureSectionAccessProof = ({ sectionAccess = null, capturedAt = Date.now() } = {}) => {
  if (!sectionAccess || typeof sectionAccess !== 'object') return null;
  return {
    role: trimmed(sectionAccess.role) || null,
    enabled: sectionAccess.enabled === true,
    isOpen: sectionAccess.isOpen !== false,
    status: trimmed(sectionAccess.status) || null,
    overrideChangedAt: sectionAccess.override?.changedAt ? text(sectionAccess.override.changedAt) : null,
    capturedAt: finite(capturedAt, Date.now()),
  };
};

/**
 * The live Classwork/Practice section state, in the shape the capture-time
 * comparison reads.
 *
 * Deliberately NOT `manualSectionCloseAt`, which returns null both for "this
 * section is open" and for "this section is closed but nothing recorded when".
 * Those two must stay distinguishable: the first accepts queued work, the
 * second is the unprovable case that keeps it for review.
 */
export const resolveLiveSectionAccess = ({ assignment, activityRole, classId = null } = {}) => {
  const role = trimmed(activityRole).toLowerCase();
  if (!['classwork', 'practice'].includes(role)) return { role, enabled: false, isOpen: true, override: null };
  const config = assignment?.sectionAccess?.[role] || {};
  const overrides = config.overridesByClassId && typeof config.overridesByClassId === 'object' ? config.overridesByClassId : {};
  const override = classId ? overrides[trimmed(classId)] || null : null;
  const overrideState = trimmed(override?.state).toLowerCase();
  const defaultState = trimmed(config.defaultState || assignment?.sectionAccessDefaults?.[role] || 'open').toLowerCase();
  const status = ['open', 'closed'].includes(overrideState) ? overrideState : (defaultState === 'closed' ? 'closed' : 'open');
  return {
    role,
    enabled: true,
    isOpen: status === 'open',
    status,
    override: override ? { state: overrideState || null, changedAt: override.changedAt || null } : null,
  };
};

/**
 * Build the envelope a student's device sends.
 *
 * `record` is the browser's attempt record. It is carried because the ordinary
 * assignment path has always been allowed to write it, and it is the only thing
 * that can mark a question type the server cannot mark. `response` is the raw
 * student work; wherever it is present and the question is server-gradeable it
 * OVERRIDES the record's verdict at ingestion.
 */
export const buildSubmissionEnvelope = ({
  actionId,
  kind,
  studentId,
  assignmentId,
  questionIndex,
  questionId = null,
  variantIndex = 0,
  activityRole,
  capturedAt = Date.now(),
  previousTotalAttempts = 0,
  record,
  response = null,
  supportUsage = null,
  assignmentSupportUsage = null,
  hasClassworkGrade = false,
  hasDolGrade = false,
  timedSectionAccess = null,
  capturedSectionAccess = null,
  checkpointDocumentId = null,
  timeSpentSeconds = 0,
  // How many times this device has already tried to deliver this submission.
  // The server's escalation from `retryable` to `needs-review` reads it, and
  // without it a week-old submission retries forever and is never surfaced.
  deliveryAttempts = 0,
  // Which instance of a question-family slot this work answers (a delivery
  // pin: allocation index, seat basis, family version, fingerprint). It names
  // the question the student saw; it is not an answer and holds no key.
  familyDelivery = null,
} = {}) => {
  if (!INGESTIBLE_KINDS.includes(kind)) throw new Error('Only grade-bearing student actions are ingested.');
  if (!trimmed(actionId)) throw new Error('A submission envelope requires its durable action id.');
  if (!trimmed(studentId) || !trimmed(assignmentId) || !Number.isInteger(Number(questionIndex))) {
    throw new Error('A submission envelope requires student, assignment and question identity.');
  }
  const envelope = {
    schemaVersion: SUBMISSION_ENVELOPE_SCHEMA_VERSION,
    actionId: trimmed(actionId),
    kind,
    studentId: trimmed(studentId),
    assignmentId: trimmed(assignmentId),
    questionIndex: Number(questionIndex),
    questionId: trimmed(questionId) || null,
    variantIndex: Math.max(0, finite(variantIndex, 0)),
    activityRole: trimmed(activityRole).toLowerCase() || null,
    capturedAt: finite(capturedAt, Date.now()),
    previousTotalAttempts: Math.max(0, finite(previousTotalAttempts, 0)),
    record: record && typeof record === 'object' ? record : null,
    response: response && typeof response === 'object' ? response : null,
    supportUsage: supportUsage && typeof supportUsage === 'object' ? supportUsage : null,
    assignmentSupportUsage: assignmentSupportUsage && typeof assignmentSupportUsage === 'object' ? assignmentSupportUsage : null,
    hasClassworkGrade: hasClassworkGrade === true,
    hasDolGrade: hasDolGrade === true,
    timedSectionAccess: timedSectionAccess || null,
    capturedSectionAccess: capturedSectionAccess || null,
    checkpointDocumentId: trimmed(checkpointDocumentId) || null,
    timeSpentSeconds: Math.max(0, Math.min(86_400, finite(timeSpentSeconds, 0))),
    deliveryAttempts: Math.max(0, Math.min(100_000, finite(deliveryAttempts, 0))),
    familyDelivery: normalizeDeliveryPin(familyDelivery),
  };
  assertEnvelopeCarriesNoSecureData(envelope);
  return envelope;
};

/** Read an envelope that arrived over the wire, keeping only what is defined. */
export const normalizeSubmissionEnvelope = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (!INGESTIBLE_KINDS.includes(trimmed(raw.kind))) return null;
  if (!trimmed(raw.actionId) || !trimmed(raw.assignmentId)) return null;
  if (!Number.isInteger(Number(raw.questionIndex)) || Number(raw.questionIndex) < 0) return null;
  if (raw.secure === true || containsForbiddenField(raw)) return null;
  return {
    schemaVersion: finite(raw.schemaVersion, 1),
    actionId: trimmed(raw.actionId).slice(0, 200),
    kind: trimmed(raw.kind),
    assignmentId: trimmed(raw.assignmentId),
    questionIndex: Number(raw.questionIndex),
    questionId: trimmed(raw.questionId) || null,
    variantIndex: Math.max(0, finite(raw.variantIndex, 0)),
    activityRole: trimmed(raw.activityRole).toLowerCase() || null,
    capturedAt: finite(raw.capturedAt, 0) || null,
    previousTotalAttempts: Math.max(0, finite(raw.previousTotalAttempts, 0)),
    record: raw.record && typeof raw.record === 'object' ? raw.record : null,
    // A registry tool's structured work is re-bounded here: the device that
    // built it is not trusted to have run the builder.
    response: raw.response && typeof raw.response === 'object'
      ? (normalizeToolResponse(raw.response) || raw.response)
      : null,
    supportUsage: raw.supportUsage && typeof raw.supportUsage === 'object' ? raw.supportUsage : null,
    assignmentSupportUsage: raw.assignmentSupportUsage && typeof raw.assignmentSupportUsage === 'object' ? raw.assignmentSupportUsage : null,
    hasClassworkGrade: raw.hasClassworkGrade === true,
    hasDolGrade: raw.hasDolGrade === true,
    timedSectionAccess: raw.timedSectionAccess && typeof raw.timedSectionAccess === 'object' ? raw.timedSectionAccess : null,
    capturedSectionAccess: raw.capturedSectionAccess && typeof raw.capturedSectionAccess === 'object' ? raw.capturedSectionAccess : null,
    checkpointDocumentId: trimmed(raw.checkpointDocumentId) || null,
    timeSpentSeconds: Math.max(0, Math.min(86_400, finite(raw.timeSpentSeconds, 0))),
    // Bounded: it only ever moves an unprovable retry to `needs-review`, and a
    // device inflating it can only ask for its own work to be looked at.
    deliveryAttempts: Math.max(0, Math.min(100_000, finite(raw.deliveryAttempts, 0))),
    // Malformed pins are dropped, never half-trusted.
    familyDelivery: normalizeDeliveryPin(raw.familyDelivery),
  };
};

export { SUBMISSION_DISPOSITION };
