// THE CASE REVIEW'S SERVER-ONLY EVIDENCE — WHAT LEAVES THE SERVER, AND FOR WHOM.
//
// Four kinds of record a teacher's browser cannot read under firestore.rules,
// and the case review needs:
//
//   grades/{sid}/evidenceEvents            one event per graded attempt
//                                          (assignment events carry no
//                                          per-record access list)
//   studentSubmissionReceipts              one receipt per delivered answer,
//                                          including answers refused because
//                                          the assignment had closed
//   studentWorkspaceDrafts/{sid}__{aid}    Practice Mode question records
//   grades/{sid}/gradeOverrideAudits       teacher grade changes
//
// The callable `loadStudentCaseEvidence` (functions/index.js) reads them with
// the Admin SDK after this module has validated the request and authorized
// the caller, and returns them through these projections. A projection keeps
// what the case review uses and nothing else: no response text, no answer
// key, no draft contents, no other student.
//
// Authorization is the population that may already read grades/{sid} or
// inspect a response: the root administrator, the teacher of record of the
// student's current class, or the student's roster teacher
// (`assignedTeacherEmail`). A student token is never enough.
import { normalizeMisconceptionCodes } from './misconceptionCodes.mjs';

export const CASE_EVIDENCE_LIMITS = Object.freeze({
  maxAssignments: 200,
  maxRangeDays: 400,
  maxEvents: 4000,
  maxReceiptsPerChunk: 500,
  maxAudits: 500,
  assignmentChunk: 30,
});

const DAY_MS = 86400000;
const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

export const millisOf = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/** The request, made safe — or the reasons it is refused. */
export const validateCaseEvidenceRequest = (data = {}) => {
  const errors = [];
  const studentId = clean(data?.studentId);
  const fromMs = finite(data?.fromMs);
  const toMs = finite(data?.toMs);
  const assignmentIds = [...new Set(list(data?.assignmentIds).map(clean).filter(Boolean))];
  if (!studentId || studentId.length > 160 || studentId.includes('/')) errors.push('A student is required.');
  if (fromMs === null || toMs === null || fromMs > toMs) errors.push('A valid date range is required.');
  else if (toMs - fromMs > CASE_EVIDENCE_LIMITS.maxRangeDays * DAY_MS) errors.push(`The date range may be at most ${CASE_EVIDENCE_LIMITS.maxRangeDays} days.`);
  if (!assignmentIds.length) errors.push('At least one assignment is required.');
  if (assignmentIds.length > CASE_EVIDENCE_LIMITS.maxAssignments) errors.push(`At most ${CASE_EVIDENCE_LIMITS.maxAssignments} assignments per request.`);
  if (assignmentIds.some((id) => id.length > 160 || id.includes('/'))) errors.push('An assignment id is not valid.');
  return { ok: errors.length === 0, errors, request: { studentId, fromMs, toMs, assignmentIds } };
};

/**
 * May this caller read this student's case evidence?
 * `callerEmail` must already be a verified, lowercased token email.
 */
export const authorizeCaseEvidenceCaller = ({ callerEmail, callerRole, isRootAdmin = false, student = null, classRecord = null } = {}) => {
  const email = lower(callerEmail);
  if (!email || callerRole !== 'teacher') return { allowed: false, reason: 'teacher-required' };
  if (!student) return { allowed: false, reason: 'student-not-found' };
  if (isRootAdmin) return { allowed: true, reason: 'root-admin' };
  if (classRecord && lower(classRecord.teacherOfRecord) === email) return { allowed: true, reason: 'class-teacher-of-record' };
  if (lower(student.assignedTeacherEmail) === email) return { allowed: true, reason: 'roster-teacher' };
  return { allowed: false, reason: 'not-this-students-teacher' };
};

const SUPPORT_FLAGS = ['calculatorUsed', 'hintUsed', 'scaffoldUsed', 'contextScaffoldUsed', 'workedExampleUsed', 'remediationUsed', 'teacherAssisted'];

/** One attempt event, as the case review needs it. Assignment events only. */
export const projectAttemptEvent = (event = {}, id = '') => {
  const source = event?.source || {};
  if (clean(source.kind || 'assignment') !== 'assignment') return null;
  const performance = event?.performance || {};
  const snapshot = event?.questionSnapshot || {};
  const usage = event?.supportUsage || {};
  const codes = normalizeMisconceptionCodes(performance.misconceptionCodes);
  return {
    eventKey: clean(event.eventKey || id),
    occurredAt: millisOf(event.occurredAt),
    alignmentKeys: list(event.alignmentKeys).map(clean).filter(Boolean).slice(0, 10),
    questionSnapshot: {
      questionId: clean(snapshot.questionId) || null,
      questionType: clean(snapshot.questionType) || null,
      variantIndex: finite(snapshot.variantIndex) ?? 0,
      dok: finite(snapshot.dok),
      hasFamilyInstance: Boolean(snapshot.instanceFingerprint),
    },
    source: {
      kind: 'assignment',
      assignmentId: clean(source.assignmentId),
      activityRole: clean(source.activityRole) || null,
      questionIndex: Number.isInteger(Number(source.questionIndex)) ? Number(source.questionIndex) : null,
    },
    performance: {
      attemptNumber: finite(performance.attemptNumber),
      isCorrect: performance.isCorrect === true,
      partialCredit: Math.max(0, Math.min(100, finite(performance.partialCredit) ?? 0)),
      status: clean(performance.status) || null,
      ...(codes.length ? { misconceptionCodes: codes } : {}),
    },
    supportUsage: Object.fromEntries(SUPPORT_FLAGS.map((key) => [key, usage[key] === true])),
  };
};

/** Receipts summarized per assignment: counts by disposition and reason, and times. */
export const summarizeReceipts = (receipts = [], { assignmentIds = [] } = {}) => {
  const wanted = new Set(list(assignmentIds).map(clean));
  const byAssignment = {};
  list(receipts).forEach((receipt) => {
    const assignmentId = clean(receipt?.assignmentId);
    if (!wanted.has(assignmentId)) return;
    const entry = byAssignment[assignmentId] || {
      total: 0, accepted: 0, notCountedAfterClose: 0, notCountedSectionClosed: 0, practicePassExcused: 0, other: 0, firstAtMs: null, lastAtMs: null, lastNotCountedAtMs: null,
    };
    const disposition = clean(receipt?.disposition);
    const reason = clean(receipt?.reason);
    const at = millisOf(receipt?.academicOccurredAt) ?? millisOf(receipt?.issuedAt);
    entry.total += 1;
    if (disposition === 'accepted') entry.accepted += 1;
    else if (reason === 'assignment-closed-at-capture') {
      entry.notCountedAfterClose += 1;
      if (Number.isFinite(at)) entry.lastNotCountedAtMs = entry.lastNotCountedAtMs === null ? at : Math.max(entry.lastNotCountedAtMs, at);
    }
    else if (reason === 'warmup-closed-at-capture' || reason === 'section-closed-at-capture') entry.notCountedSectionClosed += 1;
    else if (reason === 'practice-pass-redeemed') entry.practicePassExcused += 1;
    else entry.other += 1;
    if (Number.isFinite(at)) {
      entry.firstAtMs = entry.firstAtMs === null ? at : Math.min(entry.firstAtMs, at);
      entry.lastAtMs = entry.lastAtMs === null ? at : Math.max(entry.lastAtMs, at);
    }
    byAssignment[assignmentId] = entry;
  });
  return byAssignment;
};

/**
 * Practice Mode records from one workspace draft — counts and the latest
 * practice time only. The draft's saved work (`entries`) is never read out.
 */
export const summarizePracticeDraft = (draft = null) => {
  const practice = draft?.practice && typeof draft.practice === 'object' ? draft.practice : null;
  if (!practice) return null;
  const records = Object.entries(practice)
    .filter(([key, record]) => /^\d+$/.test(key) && record && typeof record === 'object');
  if (!records.length) return null;
  let attempts = 0;
  let correct = 0;
  let lastAtMs = null;
  const questionIndexes = [];
  records.forEach(([key, record]) => {
    const total = finite(record.totalAttempts) ?? finite(record.attemptCount) ?? 0;
    if (total <= 0 && clean(record.status) !== 'correct') return;
    questionIndexes.push(Number(key));
    attempts += Math.max(0, total);
    if (clean(record.status) === 'correct') correct += 1;
    const at = millisOf(record.lastAttemptAt);
    if (Number.isFinite(at)) lastAtMs = lastAtMs === null ? at : Math.max(lastAtMs, at);
  });
  if (!questionIndexes.length) return null;
  return {
    questionsPracticed: questionIndexes.length,
    attempts,
    correct,
    questionIndexes: questionIndexes.sort((a, b) => a - b).slice(0, 200),
    lastPracticeAtMs: lastAtMs,
    savedAtMs: millisOf(draft.practiceUpdatedAt) ?? millisOf(draft.updatedAt),
    clock: 'student-device',
  };
};

/** A teacher grade change, without anything about other questions. */
export const projectOverrideAudit = (audit = {}) => ({
  at: millisOf(audit.at),
  assignmentId: clean(audit.assignmentId),
  questionIndex: Number.isInteger(audit.questionIndex) ? audit.questionIndex : null,
  scope: clean(audit.scope) || (Number.isInteger(audit.questionIndex) ? 'question' : 'assignment'),
  sectionRole: clean(audit.sectionRole) || null,
  action: clean(audit.type || audit.action) || null,
  previousScore: finite(audit.previousScore),
  newScore: finite(audit.newScore),
  reason: clean(audit.reason).slice(0, 200) || null,
  note: clean(audit.note).slice(0, 280) || null,
  actorEmail: lower(audit.actor?.email) || null,
});

/** The callable's response, assembled from what the Admin SDK read. */
export const buildCaseEvidenceResponse = ({
  request, events = [], receipts = [], drafts = {}, audits = [], nowMs = Date.now(),
} = {}) => {
  const wanted = new Set(list(request?.assignmentIds));
  const projected = list(events)
    .map((entry) => projectAttemptEvent(entry?.data || entry, entry?.id))
    .filter((event) => event && wanted.has(event.source.assignmentId));
  const practice = {};
  Object.entries(drafts || {}).forEach(([assignmentId, draft]) => {
    if (!wanted.has(assignmentId)) return;
    const summary = summarizePracticeDraft(draft);
    if (summary) practice[assignmentId] = summary;
  });
  const overrideAudits = list(audits)
    .map((audit) => projectOverrideAudit(audit))
    .filter((audit) => wanted.has(audit.assignmentId))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return {
    schemaVersion: 1,
    studentId: request?.studentId || null,
    fromMs: request?.fromMs ?? null,
    toMs: request?.toMs ?? null,
    attemptEvents: projected,
    receipts: summarizeReceipts(receipts, { assignmentIds: request?.assignmentIds }),
    practice,
    overrideAudits,
    truncated: {
      events: list(events).length >= CASE_EVIDENCE_LIMITS.maxEvents,
      audits: list(audits).length >= CASE_EVIDENCE_LIMITS.maxAudits,
    },
    generatedAtMs: nowMs,
  };
};

export const chunk = (values = [], size = CASE_EVIDENCE_LIMITS.assignmentChunk) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
};
