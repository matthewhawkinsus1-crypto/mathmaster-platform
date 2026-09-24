/*
 * SERVER INGESTION OF AN ORDINARY STUDENT SUBMISSION.
 *
 * Before PR #226 a Submit wrote canonical grade state straight from the
 * browser. After it, the browser queued the submission locally and a background
 * client Firestore transaction carried it to `grades/{studentId}`. That moved
 * the one write that a teacher's gradebook depends on onto the least reliable
 * component in the system: a Chromebook's network, holding a transaction that
 * does not queue offline the way an ordinary write does.
 *
 * This module is the contract for doing that write on the SERVER instead. The
 * browser still acknowledges locally and instantly; a durable envelope is sent
 * in the background and answered with a receipt.
 *
 * THE TRUST MODEL DOES NOT MOVE.
 *
 * `grades/{studentId}` is student-writable today — that is how ordinary
 * assignment work has always been saved, and the Firestore rules pin the parts
 * that are not (roster authorization, the Test Cycle projection). So accepting
 * an attempt envelope here is exactly the authority the client already had, and
 * NOT a new one. Where the server can do better it does:
 *
 *   - for a question the shared ordinary grading contract can mark, the
 *     student's RAW RESPONSE is re-graded here and the browser's verdict is
 *     discarded. That is strictly more secure than the path it replaces.
 *   - for everything else the envelope's record is accepted, but sanitized
 *     through the shared attempt policy and bounded by the attempt count the
 *     server itself read. A browser cannot mint attempts, jump attempt counts,
 *     or hand itself a terminal `correct` on a question it has already failed.
 *   - Secure Test Cycle, My Math Path and server-graded tools never enter here
 *     at all; they keep their own server-authoritative state machines.
 */
import {
  gradeOrdinaryResponse,
  normalizeOrdinaryResponse,
  responseIsBlank,
  serverGradingSupport,
} from './ordinaryResponseGrading.mjs';
import {
  getQuestionCredit,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  resolveQuestionMaximumAttempts,
  resolveTeacherGrantedExtraAttempts,
} from './attemptPolicy.mjs';
import { getEffectiveActivityPolicy } from './activityPolicies.mjs';
import { buildAttemptEvidenceEvent } from './attemptEvidenceEvent.mjs';
import {
  classworkGradeProjection,
  dolSectionProjection,
  evaluateClassworkCompletionRule,
  mergeSupportUsage,
} from './assignmentProjections.mjs';
import { parseInstant, zonedDateKey } from './instructionalCalendar.mjs';
import { dolTeacherRecoveryActiveAt, SCHOOL_TIME_ZONE } from './sectionDeadline.mjs';
import {
  SUBMISSION_DISPOSITION,
  classifyCapturedSubmission,
  sectionWasOpenAtCapture,
} from './studentSubmissionDisposition.mjs';
import {
  captureAutomaticGradingEvidence,
  responseInspectionEvidenceDocumentId,
} from './responseInspector.mjs';

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
  'accepted',
  'answerFields',
  'solution',
  'seed',
  'secureQuestion',
  'gradingContract',
  'testCycle',
  'testCycleGrades',
]);

const text = (value) => String(value ?? '');
const trimmed = (value) => text(value).trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const containsForbiddenField = (value, depth = 0) => {
  if (depth > 6 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenField(entry, depth + 1));
  return Object.entries(value).some(([key, nested]) => (
    FORBIDDEN_ENVELOPE_FIELDS.includes(key) || containsForbiddenField(nested, depth + 1)
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
    response: raw.response && typeof raw.response === 'object' ? raw.response : null,
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
  };
};

/** The Warm-Up window the browser recorded, judged against the capture time. */
export const warmupWasActiveAtCapture = (timedSectionAccess, capturedAt) => {
  if (timedSectionAccess?.role !== 'warmup') return null;
  if (trimmed(timedSectionAccess.status) !== 'active') return false;
  const endsAt = timedSectionAccess.endsAt ? new Date(timedSectionAccess.endsAt).getTime() : Number.NaN;
  return !Number.isFinite(endsAt) || finite(capturedAt, Date.now()) <= endsAt;
};

/**
 * Does this envelope describe the question the server is holding?
 *
 * A queued submission that names a different question than the assignment now
 * has at that index cannot be written into it. That is not a retry problem, so
 * it is kept for review rather than graded or destroyed.
 */
export const envelopeMatchesQuestion = ({ envelope, question, canonicalRecord }) => {
  if (!question || typeof question !== 'object') return { ok: false, reason: 'question-index-not-found' };
  const authoritativeId = trimmed(question.questionId || question.id) || null;
  const claimedId = trimmed(envelope.questionId) || null;
  // Older queued rows predate carrying a question id; identity then rests on
  // the index and the variant, exactly as it did when they were written.
  if (claimedId && authoritativeId && claimedId !== authoritativeId) {
    return { ok: false, reason: 'question-identity-mismatch' };
  }
  const canonicalVariant = Math.max(0, finite(canonicalRecord?.variantIndex, 0));
  if (envelope.kind !== 'questionReplacement' && Math.max(0, finite(envelope.variantIndex, 0)) !== canonicalVariant) {
    return { ok: false, reason: 'variant-superseded' };
  }
  const authoritativeRole = trimmed(question.activityRole).toLowerCase();
  if (envelope.activityRole && authoritativeRole && envelope.activityRole !== authoritativeRole) {
    return { ok: false, reason: 'activity-role-mismatch' };
  }
  return { ok: true, reason: null };
};

/*
 * THE ACADEMIC TIME OF A SUBMISSION IS WHEN THE STUDENT PRESSED SUBMIT.
 *
 * Not when the queue drained, and not when this function ran. A response
 * captured on September 14 and ingested on September 15 is September 14 work:
 * it belongs to that instructional day, to that DOL date bucket, and to that
 * position in the student's attempt history. Recording the ingestion time
 * instead silently moves a grade between school days, which is worse than the
 * delay it came from.
 *
 * `capturedAt` is a client clock, so it is BOUNDED by the server's own reading:
 * a device with a wrong clock cannot backdate work before the assignment was
 * released, and cannot postdate it into the future. Eligibility has already
 * been decided by `decideSubmissionIngestion` before this is used — this is
 * only about which moment an ACCEPTED submission is recorded at.
 */
export const resolveAcademicOccurrenceAt = ({ envelope, assignment = null, ingestedAt = Date.now() } = {}) => {
  const captured = finite(envelope?.capturedAt, 0);
  if (!captured) return ingestedAt;
  // Never later than the moment the server is handling it.
  const upperBound = Math.min(captured, finite(ingestedAt, Date.now()));
  const releasedAt = assignment ? parseInstant(assignment.releaseAt || assignment.releaseDate, { endOfDay: false }) : null;
  // Never earlier than the assignment could be worked on.
  return releasedAt !== null && upperBound < releasedAt ? releasedAt : upperBound;
};

/**
 * Decide what to do with one envelope, from authoritative context the caller
 * has already read. Reads nothing, writes nothing, trusts no verdict.
 */
export const decideSubmissionIngestion = ({
  envelope,
  assignmentExists,
  gradeRecordExists,
  authorizedForClass,
  assignmentClosedAtCapture,
  liveSectionAccess = null,
  question = null,
  canonicalRecord = null,
  deliveryAttempts = 0,
  now = Date.now(),
} = {}) => {
  if (!envelope) return { disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: 'unreadable-envelope' };

  const canonical = normalizeQuestionRecord(canonicalRecord);
  const warmupActive = warmupWasActiveAtCapture(envelope.timedSectionAccess, envelope.capturedAt);
  const classification = classifyCapturedSubmission({
    actionId: envelope.actionId,
    kind: envelope.kind,
    activityRole: envelope.activityRole,
    capturedAt: envelope.capturedAt,
    previousTotalAttempts: envelope.previousTotalAttempts,
    canonicalRecord: canonical,
    assignmentExists,
    gradeRecordExists,
    authorizedForClass,
    assignmentClosedAtCapture,
    teacherReopenedWarmupAtCapture: warmupActive === true && envelope.timedSectionAccess?.teacherTimerScheduled === true,
    warmupActiveAtCapture: envelope.activityRole === 'warmup' ? warmupActive : null,
    sectionOpenAtCapture: sectionWasOpenAtCapture({
      capturedSectionAccess: envelope.capturedSectionAccess,
      liveSectionAccess,
      capturedAt: envelope.capturedAt,
    }),
    deliveryAttempts,
    now,
  });
  if (classification.disposition !== SUBMISSION_DISPOSITION.ACCEPTED) return classification;

  const identity = envelopeMatchesQuestion({ envelope, question, canonicalRecord: canonical });
  if (!identity.ok) {
    // The work exists and the student did it; MathMaster just cannot prove which
    // question it belongs to any more. Keep it for a teacher, never guess.
    return { disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: identity.reason };
  }
  return { disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null };
};

/*
 * SANITIZING A BROWSER-SUPPLIED ATTEMPT RECORD.
 *
 * Only for question types the server cannot mark. The record is rebuilt from
 * the server's own canonical read so the fields that decide credit are bounded:
 *
 *   - attempts may advance by at most one, from the count the SERVER read;
 *   - a question already terminal cannot be un-terminalled;
 *   - partial credit is clamped and may never fall below what is already
 *     recorded, so a retry cannot erase earned credit;
 *   - `lastSubmissionId` is stamped here, never accepted from the envelope.
 */
const ATTEMPT_STATUSES = new Set(['unattempted', 'attempted', 'correct', 'expired']);

const stripNonCanonicalInspectionFields = (record = {}) => {
  const {
    gradeOverride: _gradeOverride,
    gradeAuditHistory: _gradeAuditHistory,
    teacherGradeOverrideDisplay: _teacherGradeOverrideDisplay,
    gradingEvidence: _gradingEvidence,
    ...clean
  } = record;
  return clean;
};

/*
 * A REPLACEMENT QUESTION IS ALLOWED TO RESET THE ATTEMPT HISTORY.
 *
 * `requestReplacementQuestion` clears `totalAttempts` and `bestPartialCredit`
 * for a DOL replacement, deliberately: the student is answering a NEW question
 * and starts again on it. Clamping those fields up to the canonical values the
 * way every other field is clamped breaks the next submission — it would arrive
 * with `previousTotalAttempts: 0`, be compared against the restored count, be
 * classified `superseded`, and be retired WITHOUT EVER BEING GRADED. That is
 * the exact silent-loss shape this whole change exists to remove.
 *
 * The reset is still not the browser's to assert. It is honoured only when the
 * SERVER's own record agrees a replacement was legitimately issued: the
 * question had to be expired, and the variant has to move forward. A student
 * cannot wipe the attempt count on a question they simply do not like.
 */
const replacementResetIsAuthorized = ({ envelope, canonical, claimed }) => (
  envelope.kind === 'questionReplacement'
  && canonical.status === 'expired'
  && finite(claimed.variantIndex, 0) > finite(canonical.variantIndex, 0)
);

export const sanitizeClientAttemptRecord = ({ envelope, canonicalRecord, maximumAttempts }) => {
  const canonical = stripNonCanonicalInspectionFields(normalizeQuestionRecord(canonicalRecord));
  const claimed = stripNonCanonicalInspectionFields(normalizeQuestionRecord(envelope.record));
  const resetting = replacementResetIsAuthorized({ envelope, canonical, claimed });

  if (resetting) {
    // The record the replacement policy itself produces, rebuilt on the server
    // from the server's own canonical row rather than trusted from the wire.
    return normalizeQuestionRecord({
      ...canonical,
      status: 'unattempted',
      attemptCount: 0,
      questionDetails: '',
      lastResponseKey: '',
      partialCredit: 0,
      // `clearHistory`/`clearBest` ride together on a DOL replacement; anything
      // the client did not clear stays at the canonical value.
      totalAttempts: Math.min(finite(claimed.totalAttempts, 0), finite(canonical.totalAttempts, 0)),
      bestPartialCredit: Math.min(finite(claimed.bestPartialCredit, 0), finite(canonical.bestPartialCredit, 0)),
      stepGrades: Array.isArray(claimed.stepGrades) && claimed.stepGrades.length === 0 ? [] : canonical.stepGrades,
      variantIndex: finite(claimed.variantIndex, 0),
      algebraState: null,
      partGrades: [],
    });
  }

  const advanced = finite(claimed.totalAttempts, 0) > finite(canonical.totalAttempts, 0);
  const totalAttempts = Math.min(finite(canonical.totalAttempts, 0) + (advanced ? 1 : 0), finite(claimed.totalAttempts, 0) || finite(canonical.totalAttempts, 0));
  const attemptCount = Math.min(
    Math.max(finite(claimed.attemptCount, 0), 0),
    Math.max(finite(canonical.attemptCount, 0) + (advanced ? 1 : 0), 0),
  );
  const status = ATTEMPT_STATUSES.has(claimed.status) ? claimed.status : 'attempted';
  return normalizeQuestionRecord({
    ...canonical,
    ...claimed,
    status: canonical.status === 'correct' && status !== 'correct' ? 'correct' : status,
    attemptCount: Math.min(attemptCount, Math.max(1, finite(maximumAttempts, 3))),
    totalAttempts: Math.max(totalAttempts, finite(canonical.totalAttempts, 0)),
    variantIndex: envelope.kind === 'questionReplacement'
      ? Math.max(finite(canonical.variantIndex, 0), finite(claimed.variantIndex, 0))
      : finite(canonical.variantIndex, 0),
    partialCredit: Math.max(0, Math.min(100, finite(claimed.partialCredit, 0))),
    bestPartialCredit: Math.max(
      finite(canonical.bestPartialCredit, 0),
      Math.max(0, Math.min(100, finite(claimed.bestPartialCredit ?? claimed.partialCredit, 0))),
    ),
    timeSpent: Math.max(finite(canonical.timeSpent, 0), Math.max(0, Math.min(86_400, finite(claimed.timeSpent, 0)))),
  });
};

/**
 * Can the server mark this submission itself?
 *
 * When it can, the browser's verdict is not consulted at all. A step submission
 * is excluded: its credit comes from the multi-step algebra contract, which has
 * no server-side grader, so its record is sanitized rather than re-derived.
 */
export const serverCanRegradeEnvelope = ({ envelope, question }) => {
  if (envelope?.kind !== 'ordinarySubmission') return { regrade: false, reason: `kind:${envelope?.kind || 'unknown'}` };
  const support = serverGradingSupport(question);
  if (!support.supported) return { regrade: false, reason: support.reason };
  if (!envelope.response || responseIsBlank(envelope.response)) return { regrade: false, reason: 'no-raw-response' };
  return { regrade: true, reason: null };
};

/**
 * Turn an accepted envelope into the canonical attempt and every projection it
 * owns — through the same attempt policy, evidence builder and completion rule
 * a manual Submit and the deadline finalizer already use.
 */
export const buildIngestedAttempt = ({
  envelope,
  assignment,
  question,
  canonicalRecord,
  gradeDocument = {},
  classworkIndices = [],
  dolIndices = [],
  dolSectionScore = null,
  // WHEN THE STUDENT DID IT, and separately WHEN THE SERVER HEARD ABOUT IT.
  // Everything academic below is stamped with the first. The second reaches
  // only the receipt, which is a delivery fact rather than an academic one.
  occurredAt = null,
  ingestedAt = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
} = {}) => {
  const canonical = stripNonCanonicalInspectionFields(normalizeQuestionRecord(canonicalRecord));
  const academicAt = occurredAt === null || occurredAt === undefined
    ? resolveAcademicOccurrenceAt({ envelope, assignment, ingestedAt })
    : finite(occurredAt, ingestedAt);
  const activityPolicy = getEffectiveActivityPolicy(envelope.activityRole);
  const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({
    assignment,
    activityRole: envelope.activityRole,
    classId: gradeDocument?.classId || null,
  });
  const maximumAttempts = resolveQuestionMaximumAttempts({
    question,
    maximumAttempts: activityPolicy.attempts,
    activityPolicy,
    teacherGrantedExtraAttempts,
  });
  const regrade = serverCanRegradeEnvelope({ envelope, question });

  let record;
  let result;
  let gradedBy;
  if (regrade.regrade) {
    const grading = gradeOrdinaryResponse({ question, response: envelope.response });
    if (!grading.graded) {
      return { blocked: true, reason: grading.reason || 'server-grading-failed' };
    }
    const outcome = recordQuestionAttempt({
      record: canonical,
      isCorrect: grading.isCorrect,
      questionDetails: text(question?.prompt).slice(0, 400),
      timeSpent: envelope.timeSpentSeconds,
      parts: grading.parts,
      supportUsage: envelope.supportUsage,
      responseKey: text(envelope.response?.value) || JSON.stringify(list(envelope.response?.fields)),
      // Derived from the server's own part results, never from a number a
      // browser sent.
      partialCreditPercent: null,
      maximumAttempts,
      // `lastAttemptAt` is academic history, not a delivery timestamp.
      occurredAt: academicAt,
    });
    record = outcome.record;
    result = outcome.result;
    gradedBy = 'server';
  } else {
    record = sanitizeClientAttemptRecord({ envelope, canonicalRecord: canonical, maximumAttempts });
    result = {
      isCorrect: record.status === 'correct',
      status: record.status,
      attemptCount: record.attemptCount,
      remainingAttempts: Math.max(0, maximumAttempts - record.attemptCount),
      expired: record.status === 'expired',
      partialCredit: record.partialCredit,
    };
    gradedBy = 'client';
  }

  const cleanRecord = stripNonCanonicalInspectionFields(record);
  const gradingEvidence = envelope.response
    ? captureAutomaticGradingEvidence({
      response: envelope.response,
      grading: { ...result, isCorrect: cleanRecord.status === 'correct', parts: cleanRecord.partGrades },
      question,
      submittedAt: new Date(academicAt).toISOString(),
      source: envelope.kind,
      gradingAuthority: gradedBy === 'server' ? 'server' : 'client-record-sanitized',
      graderVersion: gradedBy === 'server' ? 'ordinary-response-v3' : 'client-attempt-record-v1',
      automaticScore: Math.round(getQuestionCredit(cleanRecord) * 100),
    })
    : null;

  const stamped = {
    ...cleanRecord,
    lastSubmissionId: envelope.actionId,
    submissionOrigin: 'server-ingestion',
    gradedBy,
    serverGradingReason: regrade.regrade ? null : regrade.reason,
    // The audit trail for a delayed recovery: the record reads as the day the
    // student worked, and says separately when it actually arrived.
    academicOccurredAt: new Date(academicAt).toISOString(),
    ingestedAt: new Date(finite(ingestedAt, Date.now())).toISOString(),
    recoveredLate: finite(ingestedAt, Date.now()) - academicAt > 60_000 ? true : null,
  };

  const assignmentId = trimmed(envelope.assignmentId);
  const recordedAt = new Date(academicAt).toISOString();
  const assignmentTracker = {
    ...(gradeDocument?.gradesByAssignment?.[assignmentId] || {}),
    [String(envelope.questionIndex)]: stamped,
    [Number(envelope.questionIndex)]: stamped,
  };

  const completion = evaluateClassworkCompletionRule({
    classworkIndices,
    assignmentTracker,
    totalTimeSeconds: finite(gradeDocument?.assignmentActivity?.[assignmentId]?.totalTimeSeconds, 0),
    completionRule: assignment?.completionRule || {},
  });
  const classworkGrade = classworkGradeProjection({
    completion,
    existingGrade: gradeDocument?.classworkGradesByAssignment?.[assignmentId] || null,
    recordedAt,
  });

  const supportUsage = mergeSupportUsage(
    gradeDocument?.supportUsageByAssignment?.[assignmentId] || {},
    envelope.assignmentSupportUsage || envelope.supportUsage || {},
  );

  // THE DOL BUCKET IS THE DAY THE STUDENT ANSWERED.
  // Deriving it from the ingestion time files a September 14 DOL under
  // September 15, where the class it belongs to cannot see it.
  const dolDateKey = zonedDateKey(academicAt, timeZone);
  const dolGrade = envelope.activityRole === 'dol' && dolSectionScore !== null
    ? dolSectionProjection({
      existing: gradeDocument?.dolGradesByAssignment?.[assignmentId] || null,
      dateKey: dolDateKey,
      score: dolSectionScore,
      questionIndices: dolIndices,
      recordedAt,
      finalize: false,
      correctionReason: 'teacher-dol-recovery',
      allowReopen: dolTeacherRecoveryActiveAt({
        assignment,
        classId: gradeDocument?.classId || null,
        at: academicAt,
        timeZone,
      }),
    })
    : null;

  const evidenceEvent = question?.type === 'modelingLab' ? null : buildAttemptEvidenceEvent({
    studentId: trimmed(envelope.studentId),
    assignment,
    question,
    questionIndex: Number(envelope.questionIndex),
    activityRole: envelope.activityRole,
    attemptRecord: stamped,
    attemptResult: result,
    supportUsage: stamped.supportUsage || {},
    occurredAt: academicAt,
  });

  return {
    blocked: false,
    reason: null,
    record: stamped,
    result,
    gradedBy,
    gradingEvidence,
    gradingEvidenceDocumentId: responseInspectionEvidenceDocumentId({
      assignmentId,
      questionIndex: envelope.questionIndex,
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

export { SUBMISSION_DISPOSITION, dolSectionProjection, getQuestionCredit, normalizeOrdinaryResponse };
