// What the discipline tracker screen shows (components/teacher/DisciplineTracker.jsx).
// Pure, so node tests cover every state a teacher can see. The rules behind
// it (catalog, wording, repeat offenders) are functions/shared/disciplineTracker.mjs.

import {
  REPEAT_RULE,
  isVoidedIncident,
  parentMessage,
  schoolDaysEndingOn,
  violationType,
} from '../../../functions/shared/disciplineTracker.mjs';

const text = (value) => String(value ?? '').trim();

/** Where one tap is with the district form, in a teacher's words. */
export const formStateWords = (incident = {}) => {
  if (incident.saving) return { label: 'Saving…', tone: 'neutral' };
  const state = incident.form?.state || 'pending';
  if (state === 'submitted') return { label: 'Sent to district form', tone: 'success' };
  if (state === 'sending') return { label: 'Sending…', tone: 'primary' };
  if (state === 'unknown') return { label: 'Check: may not have reached the form', tone: 'warning' };
  if (state === 'failed') return { label: `Not sent: ${text(incident.form?.reason) || 'the form refused it'}`, tone: 'danger' };
  return { label: 'Sends after class', tone: 'neutral' };
};

/**
 * What the teacher is told after an undo. MathMaster cannot take anything
 * off the district form: a tap already sent, or one whose send got no answer
 * (`unknown`, which Google may have recorded), may need the form's owner.
 */
export const undoNotice = ({ label, alreadySubmitted = false, maybeSubmitted = false }) => {
  if (alreadySubmitted) return { tone: 'warning', text: 'Undone in MathMaster. It had already been sent to the district form, which MathMaster cannot change: let the form\'s owner know if it should come off the district record.' };
  if (maybeSubmitted) return { tone: 'warning', text: 'Undone in MathMaster. Its send to the district form got no answer, so the form may have it: check the form\'s responses, and let the form\'s owner know if it should come off the district record.' };
  return { tone: 'success', text: `${label} undone. It will not be sent.` };
};

/**
 * Whether the screen should look again for the backend's automatic sends:
 * a tap of today that waits for or is in the middle of its send to the form.
 * The batch runs after each class period, while the screen may stay open.
 */
export const FORM_REFRESH_MS = 60000;
export const needsFormRefresh = (incidents = [], today) => (incidents || []).some((incident) => (
  !incident.saving && !isVoidedIncident(incident) && incident.dateKey === today && ['pending', 'sending'].includes(incident.form?.state || 'pending')
));

/** The day's taps for one class, by student, oldest first, without undone ones. */
export const dayIncidentsByStudent = (incidents = [], { classId, dateKey }) => {
  const byStudent = new Map();
  (incidents || [])
    .filter((incident) => !isVoidedIncident(incident) && incident.classId === classId && incident.dateKey === dateKey)
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs)
    .forEach((incident) => {
      if (!byStudent.has(incident.studentId)) byStudent.set(incident.studentId, []);
      byStudent.get(incident.studentId).push(incident);
    });
  return byStudent;
};

/** How many violations a student has in the last 10 school days (any class). */
export const recentViolationCount = (incidents = [], studentId, asOfDateKey, days = REPEAT_RULE.totalSchoolDays) => {
  const window = new Set(schoolDaysEndingOn(asOfDateKey, days));
  return (incidents || []).filter((incident) => !isVoidedIncident(incident) && incident.studentId === studentId && window.has(incident.dateKey)).length;
};

/** The day at a glance: how many taps, and where they are with the form. */
export const daySummary = (incidents = []) => {
  const live = (incidents || []).filter((incident) => !isVoidedIncident(incident));
  const count = (state) => live.filter((incident) => (incident.form?.state || 'pending') === state).length;
  return {
    total: live.length,
    students: new Set(live.map((incident) => incident.studentId)).size,
    waiting: count('pending') + count('sending'),
    sent: count('submitted'),
    needsYou: count('unknown') + count('failed'),
  };
};

/** A family contact logged on the same day, after the first violation, for this student. */
export const contactForDay = (contacts = [], { studentId, dateKey, afterMs = 0 }) => (contacts || [])
  .filter((contact) => contact?.studentId === studentId && contact?.recordType !== 'followUpResolution')
  .map((contact) => ({ ...contact, atMs: Date.parse(contact.occurredAt || '') }))
  .filter((contact) => Number.isFinite(contact.atMs) && contact.atMs >= afterMs - 60000
    && new Date(contact.atMs).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) === dateKey)
  .sort((left, right) => right.atMs - left.atMs)[0] || null;

/**
 * One draft per student who had a violation in this class on this day,
 * ready to send through SchoolStatus (or email), with whether the family has
 * already been contacted about it.
 */
export const parentDrafts = ({ incidents = [], classId, dateKey, studentsById = new Map(), teacherName = '', classLabel = '', contacts = [] }) => (
  [...dayIncidentsByStudent(incidents, { classId, dateKey })].map(([studentId, list]) => {
    const student = { id: studentId, ...studentsById.get(studentId) };
    return {
      studentId,
      student,
      incidents: list,
      message: parentMessage({ student, incidents: list, dateKey, teacherName, classLabel }),
      contactCategory: list.some((incident) => violationType(incident.type)?.contactCategory === 'cellphone') ? 'cellphone' : 'behavior',
      contacted: contactForDay(contacts, { studentId, dateKey, afterMs: list[0]?.occurredAtMs ?? 0 }),
    };
  })
);

/** A tap's id: names the tap so a retried save records it once. */
export const newTapId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
