// What the discipline tracker screen shows (components/teacher/DisciplineTracker.jsx).
// Pure, so node tests cover every state a teacher can see. The rules behind
// it (catalog, wording, repeat offenders) are functions/shared/disciplineTracker.mjs.

import {
  REPEAT_RULE,
  disciplineTime,
  isVoidedIncident,
  schoolDaysEndingOn,
} from '../../../functions/shared/disciplineTracker.mjs';
import {
  familyMessageDraft,
  familyMessageKey,
  messagingGate,
  normalizeMessagingSettings,
} from '../../../functions/shared/familyMessages.mjs';
import { effectiveDistrictStudentId } from '../../../functions/shared/studentDistrictId.mjs';

const text = (value) => String(value ?? '').trim();

/** Where one tap is with the district form, in a teacher's words. */
export const formStateWords = (incident = {}) => {
  if (incident.saving) return { label: 'Saving…', tone: 'neutral' };
  const state = incident.form?.state || 'pending';
  if (state === 'submitted') return { label: 'Sent to district form', tone: 'success' };
  if (state === 'sending') return { label: 'Sending…', tone: 'primary' };
  if (state === 'unknown') return { label: 'Check: may not have reached the form', tone: 'warning' };
  if (state === 'failed') return { label: `Not sent: ${text(incident.form?.reason) || 'the form refused it'}`, tone: 'danger' };
  if (state === 'testOnly') return { label: 'Test student: not sent to the district form', tone: 'neutral' };
  return { label: 'Sends after class', tone: 'neutral' };
};

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
    const { contactCategory, ...message } = familyMessageDraft({ student, incidents: list, dateKey, teacherName, classLabel });
    return {
      studentId,
      student,
      incidents: list,
      message,
      contactCategory,
      contacted: contactForDay(contacts, { studentId, dateKey, afterMs: list[0]?.occurredAtMs ?? 0 }),
    };
  })
);

/* ------------------------------------------------------------ sending through SchoolStatus */

/** Where one family message is, in a teacher's words. */
export const familyMessageWords = (message) => {
  if (!message) return { label: 'Draft', tone: 'neutral' };
  const test = message.mode === 'test' ? ' (test)' : '';
  switch (message.state) {
    case 'queued': return { label: `Queued${test}: goes out when the SchoolStatus extension runs`, tone: 'primary' };
    case 'claimed': return { label: `Opening in SchoolStatus${test}…`, tone: 'primary' };
    case 'sending': return { label: `Sending through SchoolStatus${test}…`, tone: 'primary' };
    case 'sent': return { label: `Sent through SchoolStatus${test} ${disciplineTime(message.sentAtMs)}`, tone: 'success' };
    case 'unknown': return { label: 'Check SchoolStatus: may have been sent', tone: 'warning' };
    case 'failed': return { label: `Not sent: ${String(message.reason || 'SchoolStatus did not send it').trim()}`, tone: 'danger' };
    case 'cancelled': return { label: `Not sent: ${String(message.reason || 'cancelled').trim()}`, tone: 'neutral' };
    default: return { label: String(message.state || 'Draft'), tone: 'neutral' };
  }
};

const COVERED = new Set(['claimed', 'sending', 'sent', 'unknown']);

/**
 * Each draft with what has happened to it: the messages kept for that
 * student, class and day; the violations no message has covered yet (only
 * those go in the next one, as the server plans it); the text the next send
 * would carry; and whether this teacher can send it now, under the switch.
 */
export const draftsWithFamilyMessages = ({ drafts = [], messages = [], messaging = {}, classId, dateKey, teacherName = '', classLabel = '' }) => {
  const settings = normalizeMessagingSettings(messaging);
  return drafts.map((draft) => {
    const key = familyMessageKey({ classId, dateKey, studentId: draft.studentId });
    const kept = (messages || []).filter((message) => message.messageKey === key).sort((left, right) => left.sequence - right.sequence);
    const covered = new Set(kept.filter((message) => COVERED.has(message.state)).flatMap((message) => message.incidentIds || []));
    const pending = draft.incidents.filter((incident) => !covered.has(incident.id));
    const queued = kept.find((message) => message.state === 'queued') || null;
    const queuedCoversPending = Boolean(queued) && pending.length === (queued.incidentIds || []).length
      && pending.every((incident) => queued.incidentIds.includes(incident.id));
    const latest = kept[kept.length - 1] || null;
    const followUp = pending.length > 0 && kept.some((message) => message.state === 'sent');
    const nextText = pending.length
      ? familyMessageDraft({ student: draft.student, incidents: pending, dateKey, teacherName, classLabel })
      : { subject: latest?.subject || draft.message.subject, body: latest?.body || draft.message.body };
    const gate = messagingGate(settings, effectiveDistrictStudentId(draft.student));
    return {
      ...draft,
      familyMessages: kept,
      latestMessage: latest,
      needsDecision: kept.filter((message) => message.state === 'unknown'),
      cancellable: kept.filter((message) => ['queued', 'claimed'].includes(message.state)),
      pendingIncidents: pending,
      followUp,
      shownMessage: { subject: nextText.subject, body: nextText.body },
      canQueue: pending.length > 0 && !queuedCoversPending && gate.allowed,
      blockedReason: pending.length > 0 && !queuedCoversPending && !gate.allowed ? gate.reason : null,
    };
  });
};

/** A tap's id: names the tap so a retried save records it once. */
export const newTapId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
