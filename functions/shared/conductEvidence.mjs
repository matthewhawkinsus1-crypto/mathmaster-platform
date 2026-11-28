// One student's conduct records and family contacts, for the Student Case
// Review (the "deep dive"). Read by the `loadStudentConductEvidence` callable
// (functions/disciplineFunctions.js), which authorizes exactly as the case
// review's own evidence callable does (caseReviewEvidence.mjs
// authorizeCaseEvidenceCaller), then hands this module what it read.
//
// Pure. It returns only this student's records, only what the case review
// shows, and only the family contacts the caller may read in MathMaster
// (Parent Contacts are shared by `authorizedTeacherEmails`). An undone tap is
// not a record. Teacher-written notes are passed through as teacher-written.

import { disciplineDateKey, isVoidedIncident, violationDetail, violationType } from './disciplineTracker.mjs';

export const CONDUCT_EVIDENCE_LIMITS = Object.freeze({ maxRangeDays: 400, maxIncidents: 2000, maxContacts: 1000 });

export class ConductEvidenceInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConductEvidenceInputError';
  }
}

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const list = (value) => (Array.isArray(value) ? value : []);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

/** The request, checked: one student, a range of school days. */
export const validateConductEvidenceRequest = (data = {}) => {
  const studentId = text(data?.studentId);
  const fromDateKey = text(data?.fromDateKey);
  const toDateKey = text(data?.toDateKey);
  if (!studentId || studentId.length > 160 || studentId.includes('/')) throw new ConductEvidenceInputError('A student is required.');
  if (!DATE_KEY.test(fromDateKey) || !DATE_KEY.test(toDateKey) || fromDateKey > toDateKey) throw new ConductEvidenceInputError('A valid date range is required.');
  const days = (Date.parse(`${toDateKey}T00:00:00Z`) - Date.parse(`${fromDateKey}T00:00:00Z`)) / DAY_MS;
  if (!Number.isFinite(days) || days > CONDUCT_EVIDENCE_LIMITS.maxRangeDays) {
    throw new ConductEvidenceInputError(`The date range may be at most ${CONDUCT_EVIDENCE_LIMITS.maxRangeDays} days.`);
  }
  return { studentId, fromDateKey, toDateKey };
};

const FORM_STATES = new Set(['pending', 'sending', 'submitted', 'unknown', 'failed']);

/** One recorded violation, as the case review shows it. */
export const projectConductIncident = (record = {}) => ({
  id: text(record.id),
  type: text(record.type),
  detail: text(record.detail),
  typeLabel: violationType(record.type)?.label || 'Recorded item',
  detailLabel: violationDetail(record.type, record.detail)?.label || '',
  occurredAtMs: Number(record.occurredAtMs),
  dateKey: text(record.dateKey),
  classId: text(record.classId),
  classLabel: text(record.classLabel),
  classPeriod: text(record.classPeriod),
  formState: FORM_STATES.has(record.form?.state) ? record.form.state : 'pending',
  formSubmittedAtMs: Number.isFinite(Number(record.form?.submittedAtMs)) && record.form?.submittedAtMs ? Number(record.form.submittedAtMs) : null,
});

/** One family contact, as the case review shows it. `notes` and `outcome` are the teacher's own words. */
export const projectFamilyContact = (record = {}, { followUpCompleted = false } = {}) => ({
  id: text(record.id),
  occurredAt: text(record.occurredAt),
  method: text(record.method) || 'other',
  category: text(record.category) || 'other',
  outcome: text(record.outcome).slice(0, 1000),
  notes: text(record.notes).slice(0, 2000),
  followUpDate: text(record.followUpDate) || null,
  followUpCompleted: Boolean(followUpCompleted),
  classId: text(record.classId) || null,
});

/**
 * The response: this student's records in the window, newest last.
 * `incidents` and `contacts` are the documents read ({ id, ...data }).
 */
export const buildConductEvidenceResponse = ({
  studentId, incidents = [], contacts = [], fromDateKey, toDateKey, callerEmail = '', isRootAdmin = false, truncated = {},
} = {}) => {
  const id = text(studentId);
  const inWindow = (dateKey) => DATE_KEY.test(dateKey) && dateKey >= fromDateKey && dateKey <= toDateKey;
  const conduct = list(incidents)
    .filter((record) => text(record?.studentId) === id && !isVoidedIncident(record) && inWindow(text(record?.dateKey)))
    .map(projectConductIncident)
    .filter((record) => Number.isFinite(record.occurredAtMs))
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs);

  const caller = lower(callerEmail);
  const readable = list(contacts).filter((record) => text(record?.studentId) === id
    && (isRootAdmin || list(record?.authorizedTeacherEmails).map(lower).includes(caller)));
  const resolved = new Set(readable.filter((record) => record.recordType === 'followUpResolution').map((record) => text(record.parentContactId)));
  const family = readable
    .filter((record) => record.recordType !== 'followUpResolution')
    .filter((record) => {
      const atMs = Date.parse(record.occurredAt || '');
      return Number.isFinite(atMs) && inWindow(disciplineDateKey(atMs));
    })
    .map((record) => projectFamilyContact(record, { followUpCompleted: resolved.has(text(record.id)) }))
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

  return {
    studentId: id,
    fromDateKey,
    toDateKey,
    incidents: conduct,
    contacts: family,
    truncated: { incidents: Boolean(truncated.incidents), contacts: Boolean(truncated.contacts) },
  };
};
