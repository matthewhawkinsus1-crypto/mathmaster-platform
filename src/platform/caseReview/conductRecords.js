/*
 * CONDUCT RECORDS AND FAMILY CONTACT — THE REST OF THE DISTRICT'S EXPECTATIONS.
 *
 * A case review is about more than grades. This section sets beside the
 * academic evidence what the student's teacher recorded in MathMaster's
 * Discipline Tracker (each tap timed by the server) and the family contacts
 * logged in Parent Contacts, over the case's own window. They are
 * staff-documented records, reported as they were recorded:
 *
 *   - a count is what was recorded, never a rating of the student, and a type
 *     with no record is not shown as "none": no record is not evidence that
 *     nothing happened;
 *   - an undone tap is not a record (the server leaves it out);
 *   - the teacher's own notes are shown as the teacher wrote them, labelled so;
 *   - no record here feeds a grade, the narrative facts or the attention
 *     summary (only a section that could not be loaded is listed as a gap).
 *
 * The records come from the read-only `loadStudentConductEvidence` callable
 * (functions/shared/conductEvidence.mjs); `undefined` means not loaded.
 */
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import { VIOLATION_TYPES, violationLabel } from '../../../functions/shared/disciplineTracker.mjs';
import { CASE_PROVENANCE } from './caseProvenance.js';

const SCHOOL_TIME_ZONE = 'America/Chicago';
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Where each record stands with the district's Campus Violation Tracker form. */
export const CONDUCT_FORM_LABEL = Object.freeze({
  submitted: 'Sent to the district form',
  pending: 'Not yet sent to the district form',
  sending: 'Being sent to the district form',
  unknown: 'May not have reached the district form (no reply)',
  failed: 'Not sent to the district form',
  testOnly: 'A SchoolStatus test student: never sent to the district form',
});

export const CONTACT_METHOD_LABEL = Object.freeze({
  phone: 'Phone call', email: 'Email', text: 'Text message', conference: 'Conference', voicemail: 'Voicemail', other: 'Other',
});

// Parent Contacts' own names for its reasons (ParentContactCenter.jsx).
export const CONTACT_CATEGORY_LABEL = Object.freeze({
  academics: 'Academics',
  missingWork: 'Missing work',
  attendance: 'Attendance',
  behavior: 'Behavior',
  academicIntegrity: 'Academic integrity',
  cellphone: 'Cellphone',
  positiveContact: 'Positive contact',
  other: 'Other',
});

export const CONDUCT_RECORDS_NOTE = 'Only what was recorded in MathMaster: the Discipline Tracker and Parent Contacts. A type that is not listed has no record there, which is not evidence that it did not happen. Campus and district records outside MathMaster are not included.';
export const CONDUCT_RECORDS_TRUNCATED = 'More conduct records exist for this student than were loaded; the section may be incomplete.';
export const FAMILY_CONTACTS_TRUNCATED = 'More family contacts exist for this student than were loaded; the section may be incomplete.';
export const TEACHER_AUTHORED_NOTE = 'Teacher-written note';

const timeOfDay = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SCHOOL_TIME_ZONE });

const emptyConduct = ({ loaded, error = '' }) => ({
  loaded,
  error,
  note: CONDUCT_RECORDS_NOTE,
  total: 0,
  days: 0,
  incidents: [],
  byType: [],
  form: { submitted: 0, waiting: 0, needsCheck: 0, testOnly: 0 },
  contacts: [],
  contactsByCategory: [],
  openFollowUps: 0,
  lines: [],
  truncated: { incidents: false, contacts: false },
});

const conductIncident = (row) => {
  const atMs = Number(row.occurredAtMs);
  const formState = Object.hasOwn(CONDUCT_FORM_LABEL, row.formState) ? row.formState : 'pending';
  return {
    id: clean(row.id),
    atMs,
    dateKey: clean(row.dateKey) || zonedDateKey(atMs, SCHOOL_TIME_ZONE),
    type: clean(row.type),
    detail: clean(row.detail),
    label: violationLabel({ type: row.type, detail: row.detail }),
    classLabel: clean(row.classLabel) || clean(row.classPeriod),
    formState,
    formLabel: CONDUCT_FORM_LABEL[formState],
    formSubmittedAtMs: Number.isFinite(Number(row.formSubmittedAtMs)) && row.formSubmittedAtMs ? Number(row.formSubmittedAtMs) : null,
    provenance: CASE_PROVENANCE.STAFF,
  };
};

const familyContact = (row) => {
  const atMs = Date.parse(clean(row.occurredAt));
  return {
    id: clean(row.id),
    atMs,
    dateKey: zonedDateKey(atMs, SCHOOL_TIME_ZONE),
    method: clean(row.method),
    methodLabel: CONTACT_METHOD_LABEL[clean(row.method)] || CONTACT_METHOD_LABEL.other,
    category: clean(row.category),
    categoryLabel: CONTACT_CATEGORY_LABEL[clean(row.category)] || CONTACT_CATEGORY_LABEL.other,
    // The teacher's own words, shown as theirs.
    outcome: clean(row.outcome),
    notes: clean(row.notes),
    followUpDate: clean(row.followUpDate) || null,
    followUpCompleted: row.followUpCompleted === true,
    provenance: CASE_PROVENANCE.STAFF,
  };
};

const countBy = (rows, key) => {
  const counts = new Map();
  rows.forEach((row) => counts.set(key(row), (counts.get(key(row)) || 0) + 1));
  return counts;
};

/**
 * The conduct section of one case. `conductEvidence` is the callable's
 * response (undefined = not loaded); the case's window bounds it, as it
 * bounds everything else in the case.
 */
export const buildConductRecords = ({
  conductEvidence = undefined, error = '', fromDateKey = '', toDateKey = '',
} = {}) => {
  if (!conductEvidence || typeof conductEvidence !== 'object') {
    return emptyConduct({ loaded: false, error: clean(error) || (conductEvidence === undefined ? '' : 'not available') });
  }
  const inWindow = (dateKey) => Boolean(dateKey) && (!fromDateKey || dateKey >= fromDateKey) && (!toDateKey || dateKey <= toDateKey);

  const incidents = list(conductEvidence.incidents)
    .filter((row) => Number.isFinite(Number(row?.occurredAtMs)))
    .map(conductIncident)
    .filter((row) => inWindow(row.dateKey))
    .sort((left, right) => left.atMs - right.atMs);
  const typeCounts = countBy(incidents, (row) => row.type);
  const byType = VIOLATION_TYPES
    .filter((type) => typeCounts.has(type.id))
    .map((type) => {
      const rows = incidents.filter((row) => row.type === type.id);
      const detailCounts = countBy(rows.filter((row) => row.detail), (row) => row.detail);
      return {
        type: type.id,
        label: type.label,
        count: rows.length,
        days: new Set(rows.map((row) => row.dateKey)).size,
        details: type.details.filter((detail) => detailCounts.has(detail.id)).map((detail) => ({ id: detail.id, label: detail.label, count: detailCounts.get(detail.id) })),
      };
    });
  const formCount = (states) => incidents.filter((row) => states.includes(row.formState)).length;
  const form = { submitted: formCount(['submitted']), waiting: formCount(['pending', 'sending']), needsCheck: formCount(['unknown', 'failed']), testOnly: formCount(['testOnly']) };

  const contacts = list(conductEvidence.contacts)
    .map(familyContact)
    .filter((row) => Number.isFinite(row.atMs) && inWindow(row.dateKey))
    .sort((left, right) => left.atMs - right.atMs);
  const categoryCounts = countBy(contacts, (row) => row.category);
  const contactsByCategory = Object.keys(CONTACT_CATEGORY_LABEL)
    .filter((category) => categoryCounts.has(category))
    .map((category) => ({ category, label: CONTACT_CATEGORY_LABEL[category], count: categoryCounts.get(category) }));
  const openFollowUps = contacts.filter((row) => row.followUpDate && !row.followUpCompleted).length;

  const days = new Set(incidents.map((row) => row.dateKey)).size;
  const lines = [
    incidents.length
      ? `${plural(incidents.length, 'conduct record')} on ${plural(days, 'school day')}: ${byType.map((entry) => `${entry.label} ${entry.count}`).join(' · ')}.`
      : 'No conduct records in the Discipline Tracker for this window.',
    ...(incidents.length
      ? [`District form: ${form.submitted} of ${incidents.length} sent${form.waiting ? `, ${form.waiting} waiting to send` : ''}${form.needsCheck ? `, ${form.needsCheck} to check` : ''}${form.testOnly ? `, ${form.testOnly} test-only (never sent)` : ''}.`]
      : []),
    contacts.length
      ? `${plural(contacts.length, 'family contact')} logged: ${contactsByCategory.map((entry) => `${entry.label} ${entry.count}`).join(' · ')}${openFollowUps ? `; ${plural(openFollowUps, 'follow-up')} still open` : ''}.`
      : 'No family contacts logged in Parent Contacts for this window.',
  ];

  return {
    loaded: true,
    error: '',
    note: CONDUCT_RECORDS_NOTE,
    total: incidents.length,
    days,
    incidents,
    byType,
    form,
    contacts,
    contactsByCategory,
    openFollowUps,
    lines,
    truncated: { incidents: Boolean(conductEvidence.truncated?.incidents), contacts: Boolean(conductEvidence.truncated?.contacts) },
  };
};

/** The timeline's conduct entries: each record and each family contact, staff documented. */
export const conductTimelineEntries = (conduct) => [
  ...list(conduct?.incidents).map((row) => ({
    atMs: row.atMs,
    kind: 'conduct-record',
    group: 'conduct',
    label: `Conduct record: ${row.label}`,
    detail: `${timeOfDay(row.atMs)}${row.classLabel ? ` · ${row.classLabel}` : ''} · ${row.formLabel}`,
    provenance: row.provenance,
    details: [],
  })),
  ...list(conduct?.contacts).map((row) => ({
    atMs: row.atMs,
    kind: 'family-contact',
    group: 'conduct',
    label: `Family contact (${row.methodLabel.toLowerCase()}): ${row.categoryLabel}`,
    detail: [row.outcome, row.followUpDate ? `Follow-up ${row.followUpDate}${row.followUpCompleted ? ' (completed)' : ''}` : ''].filter(Boolean).join(' · '),
    provenance: row.provenance,
    details: row.notes ? [{ label: TEACHER_AUTHORED_NOTE, value: row.notes }] : [],
  })),
];
