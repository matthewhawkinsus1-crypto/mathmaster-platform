// Messages to families from the Discipline Tracker, sent through SchoolStatus
// by the MathMaster extension in the teacher's own signed-in browser. Pure:
// no Firestore, no network, no clock except what is passed in. The Firestore
// side is functions/lib/familyMessageOutbox.js; the callables are in
// functions/disciplineFunctions.js.
//
// SchoolStatus has no public API, so MathMaster never sends anything itself.
// It keeps a queue, and the extension works through it one message at a time:
//
//   drafted   the screen builds it from the day's violations (not stored)
//   queued    the teacher pressed Send to families
//   claimed   the extension took it; nothing has been typed into SchoolStatus
//             that could go out. A claim not used within its lease returns to
//             the queue by itself
//   sending   the extension said it is about to press Send. From here on the
//             message may have reached a family, so it is NEVER handed out
//             again by itself
//   sent      the extension saw SchoolStatus confirm it. A Parent Contacts
//             record is written in the same transaction
//   failed    it certainly did not go out (student not found in SchoolStatus,
//             no guardian, SchoolStatus refused it). The teacher can queue it
//             again
//   unknown   Send may have been pressed and the result was not seen (the
//             extension stopped, the page reloaded). The teacher checks
//             SchoolStatus and chooses Send again or It was sent
//   cancelled the teacher cancelled it before Send, a violation in it was
//             undone, or it sat in the queue too long
//
// Every send needs the platform's messaging switch (`off`, `test`, `live`),
// set by the root administrator. In `test` only the district IDs on the test
// list can be queued or handed out: while the extension is being built every
// test send reaches a real phone, so it must be one the owner controls.

import { formStudentName, isVoidedIncident, parentMessage, violationType } from './disciplineTracker.mjs';
import { effectiveDistrictStudentId, isValidDistrictStudentId } from './studentDistrictId.mjs';

const text = (value) => String(value ?? '').trim();

export const FAMILY_MESSAGE_STATES = Object.freeze(['queued', 'claimed', 'sending', 'sent', 'failed', 'unknown', 'cancelled']);
export const FAMILY_MESSAGING_MODES = Object.freeze(['off', 'test', 'live']);

export const FAMILY_MESSAGE_LIMITS = Object.freeze({
  /** A claim the extension does not start sending within this returns to the queue. */
  claimLeaseMs: 5 * 60 * 1000,
  /** After "about to press Send", the extension has this long to say what happened. */
  sendingLeaseMs: 3 * 60 * 1000,
  /** A message nobody sent within this is cancelled rather than sent late. */
  queuedExpiryMs: 3 * 24 * 60 * 60 * 1000,
  /** How far back a teacher may queue a day's messages. */
  queueWindowDays: 14,
  /** How many test district IDs the switch holds. */
  maxTestDistrictIds: 5,
  historyMax: 20,
});

export class FamilyMessageError extends Error {
  constructor(message, code = 'failed-precondition') {
    super(message);
    this.name = 'FamilyMessageError';
    this.code = code;
  }
}
const refuse = (message, code) => { throw new FamilyMessageError(message, code); };

/* ------------------------------------------------------------ the switch */

/** The stored switch, read safely: anything unknown is `off`. */
export const normalizeMessagingSettings = (stored = {}) => {
  const mode = FAMILY_MESSAGING_MODES.includes(stored?.mode) ? stored.mode : 'off';
  const testDistrictIds = [...new Set((Array.isArray(stored?.testDistrictIds) ? stored.testDistrictIds : []).map(text).filter(isValidDistrictStudentId))]
    .slice(0, FAMILY_MESSAGE_LIMITS.maxTestDistrictIds);
  return { mode, testDistrictIds };
};

/** What the root administrator typed, checked. Test mode needs at least one test ID. */
export const validateMessagingSettingsInput = ({ mode, testDistrictIds = [] } = {}) => {
  if (!FAMILY_MESSAGING_MODES.includes(mode)) refuse('Choose Off, Test or Live.', 'invalid-argument');
  const raw = (Array.isArray(testDistrictIds) ? testDistrictIds : String(testDistrictIds).split(/[\s,]+/)).map(text).filter(Boolean);
  const invalid = raw.filter((id) => !isValidDistrictStudentId(id));
  if (invalid.length) refuse(`Not a district student ID: ${invalid.join(', ')}.`, 'invalid-argument');
  const ids = [...new Set(raw)];
  if (ids.length > FAMILY_MESSAGE_LIMITS.maxTestDistrictIds) refuse(`At most ${FAMILY_MESSAGE_LIMITS.maxTestDistrictIds} test students.`, 'invalid-argument');
  if (mode === 'test' && !ids.length) refuse('Test mode needs the district ID of at least one test student.', 'invalid-argument');
  return { mode, testDistrictIds: ids };
};

/** May a message to this student's family go out under this switch? */
export const messagingGate = (settings, sisStudentId) => {
  const { mode, testDistrictIds } = normalizeMessagingSettings(settings);
  if (mode === 'off') return { allowed: false, reason: 'Sending to families through SchoolStatus is not turned on.' };
  if (!isValidDistrictStudentId(sisStudentId)) return { allowed: false, reason: 'No district student ID on file, so SchoolStatus cannot find the student.' };
  if (mode === 'test' && !testDistrictIds.includes(text(sisStudentId))) {
    return { allowed: false, reason: 'Test mode: only the test students can be sent to.' };
  }
  return { allowed: true, mode };
};

/* ------------------------------------------------------------ what a message says */

/** Parent Contacts' reason: a device is a cellphone contact, anything else behavior. */
export const familyContactCategory = (incidents = []) => (
  (incidents || []).some((incident) => violationType(incident.type)?.contactCategory === 'cellphone') ? 'cellphone' : 'behavior'
);

/** One student's message for one class and day, from the violations it covers. */
export const familyMessageDraft = ({ student = {}, incidents = [], dateKey, teacherName = '', classLabel = '' }) => {
  const live = (incidents || []).filter((incident) => !isVoidedIncident(incident));
  return {
    ...parentMessage({ student, incidents: live, dateKey, teacherName, classLabel }),
    contactCategory: familyContactCategory(live),
  };
};

export const familyMessageKey = ({ classId, dateKey, studentId }) => `${text(classId)}|${text(dateKey)}|${text(studentId)}`;

/* ------------------------------------------------------------ where a message is */

const lease = (message) => Number(message?.attempt?.leaseUntilMs || 0);

/**
 * The message as it stands at `nowMs`. A lapsed claim is back in the queue
 * (nothing could have gone out); a lapsed send is `unknown` (it may have).
 * The stored record catches up the next time a transaction touches it.
 */
export const effectiveFamilyMessage = (message = {}, nowMs) => {
  if (message.state === 'claimed' && nowMs > lease(message)) {
    return { ...message, state: 'queued', attempt: null, reason: null };
  }
  if (message.state === 'sending' && nowMs > lease(message)) {
    return {
      ...message,
      state: 'unknown',
      reason: 'The extension stopped after it began sending, so this message may or may not have reached the family. Check SchoolStatus.',
      unknownFromLease: true,
    };
  }
  return message;
};

/** The incidents that messages already in flight or sent account for. */
const IN_FLIGHT_OR_SENT = new Set(['claimed', 'sending', 'sent', 'unknown']);
const REUSABLE = new Set(['queued', 'failed', 'cancelled']);

/**
 * What queueing one student's day does, given every message already kept for
 * that class, day and student. Violations a sent (or possibly sent) message
 * covered are not sent again; anything newer goes in a follow-up message.
 *
 * Returns { action: 'create' | 'update' | 'none', incidentIds, sequence?, messageId?, why? }.
 */
export const planFamilyMessageQueue = ({ incidents = [], messages = [], nowMs }) => {
  const live = (incidents || []).filter((incident) => !isVoidedIncident(incident));
  if (!live.length) return { action: 'none', why: 'noViolations', incidentIds: [] };
  const current = (messages || []).map((message) => effectiveFamilyMessage(message, nowMs));
  const covered = new Set(current.filter((message) => IN_FLIGHT_OR_SENT.has(message.state)).flatMap((message) => message.incidentIds || []));
  const uncovered = live.filter((incident) => !covered.has(incident.id)).map((incident) => incident.id);
  if (!uncovered.length) {
    const state = current.some((message) => ['claimed', 'sending'].includes(message.state)) ? 'inFlight'
      : current.some((message) => message.state === 'unknown') ? 'needsTeacher' : 'alreadySent';
    return { action: 'none', why: state, incidentIds: [] };
  }
  const reusable = current.filter((message) => REUSABLE.has(message.state)).sort((left, right) => right.sequence - left.sequence)[0];
  if (reusable) return { action: 'update', messageId: reusable.id, sequence: reusable.sequence, incidentIds: uncovered };
  const sequence = Math.max(0, ...current.map((message) => Number(message.sequence) || 0)) + 1;
  return { action: 'create', sequence, incidentIds: uncovered };
};

const withHistory = (message, entry) => [...(message.history || []), entry].slice(-FAMILY_MESSAGE_LIMITS.historyMax);

/**
 * The extension asks for the next message. Checks made again here, because
 * time has passed since the teacher queued it: the switch, the class's
 * teacher, the roster, the district ID, the violations, the age.
 *
 * `current` = { settings, callerEmail, teacherOfRecord, onRoster, sisStudentId, studentName, voidedIncidentIds }
 * Returns { update, handout } (handout null when the message is not sent).
 */
export const claimFamilyMessage = (stored, { runnerId, attemptId, nowMs, current }) => {
  const message = effectiveFamilyMessage(stored, nowMs);
  if (message.state !== 'queued') return { update: null, handout: null };
  const stop = (state, reason) => ({
    update: { state, reason, attempt: null, history: withHistory(message, { state, atMs: nowMs, by: 'extension-claim', reason }) },
    handout: null,
  });
  if (nowMs - Number(message.queuedAtMs || 0) > FAMILY_MESSAGE_LIMITS.queuedExpiryMs) {
    return stop('cancelled', 'It waited more than 3 days without being sent. Queue it again if it should still go.');
  }
  // Sent only from the teacher's own SchoolStatus, under their own name.
  if (text(current.callerEmail).toLowerCase() !== text(message.teacherOfRecord).toLowerCase()) return { update: null, handout: null };
  if (text(current.teacherOfRecord).toLowerCase() !== text(message.teacherOfRecord).toLowerCase()) {
    return stop('cancelled', 'The class has a different teacher of record now.');
  }
  if (!current.onRoster) return stop('cancelled', 'The student is no longer on this class roster.');
  const voided = (message.incidentIds || []).filter((id) => (current.voidedIncidentIds || []).includes(id));
  if (voided.length) {
    return stop('cancelled', voided.length === (message.incidentIds || []).length
      ? 'Every violation in it was undone.'
      : 'A violation in it was undone after it was queued. Queue it again to send the corrected message.');
  }
  const gate = messagingGate(current.settings, current.sisStudentId);
  if (!gate.allowed) {
    // The switch can change after queueing; a held message waits, it is not lost.
    return { update: null, handout: null, held: gate.reason };
  }
  const attempt = { attemptId: text(attemptId), runnerId: text(runnerId).slice(0, 80), claimedAtMs: nowMs, leaseUntilMs: nowMs + FAMILY_MESSAGE_LIMITS.claimLeaseMs };
  return {
    update: {
      state: 'claimed', reason: null, attempt, sisStudentId: current.sisStudentId,
      history: withHistory(message, { state: 'claimed', atMs: nowMs, by: attempt.runnerId }),
    },
    handout: {
      messageId: message.id,
      attemptId: attempt.attemptId,
      mode: gate.mode,
      sisStudentId: current.sisStudentId,
      studentName: current.studentName,
      dateKey: message.dateKey,
      classLabel: message.classLabel || '',
      subject: message.subject,
      body: message.body,
      leaseUntilMs: attempt.leaseUntilMs,
    },
  };
};

const sameAttempt = (message, attemptId) => Boolean(text(attemptId)) && message.attempt?.attemptId === text(attemptId);

/**
 * The extension is about to press Send. Only the attempt holding a live claim
 * may; any other answer means: do not press Send.
 */
export const startFamilyMessageSend = (stored, { attemptId, nowMs }) => {
  const message = effectiveFamilyMessage(stored, nowMs);
  if (!sameAttempt(message, attemptId)) refuse('Do not send: this message is no longer yours to send (another tab took it, or the claim lapsed).');
  if (message.state !== 'claimed') refuse(`Do not send: the message is ${message.state}.`);
  return {
    state: 'sending',
    attempt: { ...message.attempt, sendingAtMs: nowMs, leaseUntilMs: nowMs + FAMILY_MESSAGE_LIMITS.sendingLeaseMs },
    history: withHistory(message, { state: 'sending', atMs: nowMs, by: message.attempt.runnerId }),
  };
};

/** The extension gives back a claim it did not use. Only before Send. */
export const releaseFamilyMessage = (stored, { attemptId, nowMs, reason = '' }) => {
  const message = effectiveFamilyMessage(stored, nowMs);
  if (message.state !== 'claimed' || !sameAttempt(message, attemptId)) return null;
  return { state: 'queued', attempt: null, reason: null, history: withHistory(message, { state: 'queued', atMs: nowMs, by: message.attempt.runnerId, reason: text(reason).slice(0, 200) || 'released' }) };
};

const REPORTS = Object.freeze({
  // outcome: the states it may come from (for the same attempt)
  sent: ['sending', 'unknown'],
  unknown: ['sending'],
  failed: ['claimed', 'sending', 'unknown'],
});

/**
 * What the extension saw. `sent` needs SchoolStatus's own confirmation and is
 * the only outcome that writes Parent Contacts. A late report from the
 * attempt whose lease lapsed is still taken: it is better than not knowing.
 */
export const reportFamilyMessage = (stored, { attemptId, outcome, reason = '', confirmation = {}, nowMs }) => {
  const message = effectiveFamilyMessage(stored, nowMs);
  if (!REPORTS[outcome]) refuse('Report sent, failed or unknown.', 'invalid-argument');
  if (!sameAttempt(message, attemptId)) refuse('This report is for an attempt that no longer holds the message.');
  if (!REPORTS[outcome].includes(message.state)) refuse(`A message that is ${message.state} cannot be reported ${outcome}.`);
  const cleanReason = text(reason).slice(0, 300);
  if (outcome === 'failed' && !cleanReason) refuse('Say why it failed.', 'invalid-argument');
  const by = message.attempt?.runnerId || 'extension';
  if (outcome === 'sent') {
    const recipientCount = Math.max(0, Math.min(20, Math.floor(Number(confirmation?.recipientCount) || 0)));
    const channel = ['text', 'email'].includes(confirmation?.channel) ? confirmation.channel : 'text';
    return {
      update: {
        state: 'sent', reason: null, sentAtMs: nowMs, unknownFromLease: false,
        confirmation: { recipientCount, channel, note: text(confirmation?.note).slice(0, 200) },
        history: withHistory(message, { state: 'sent', atMs: nowMs, by }),
      },
      logContact: { method: channel, sentAtMs: nowMs, confirmedBy: 'extension' },
    };
  }
  const state = outcome;
  return {
    update: {
      state, unknownFromLease: false,
      reason: cleanReason || 'The extension could not see whether SchoolStatus sent it. Check SchoolStatus.',
      history: withHistory(message, { state, atMs: nowMs, by, reason: cleanReason }),
    },
    logContact: null,
  };
};

/**
 * The teacher decides: cancel a message not yet sending, queue a failed,
 * cancelled or unknown one again, or record that an unknown one did go out
 * (which writes Parent Contacts, as a sent one does).
 */
export const teacherFamilyMessageAction = (stored, { action, nowMs, by }) => {
  const message = effectiveFamilyMessage(stored, nowMs);
  const entry = (state, reason) => withHistory(message, { state, atMs: nowMs, by, ...(reason ? { reason } : {}) });
  if (action === 'cancel') {
    if (!['queued', 'claimed'].includes(message.state)) refuse(message.state === 'sending' ? 'It is being sent right now.' : `A message that is ${message.state} cannot be cancelled.`);
    return { update: { state: 'cancelled', attempt: null, reason: 'Cancelled by the teacher', history: entry('cancelled', 'teacher') }, logContact: null };
  }
  if (action === 'requeue') {
    if (!['failed', 'cancelled', 'unknown'].includes(message.state)) refuse(`A message that is ${message.state} cannot be queued again.`);
    return { update: { state: 'queued', attempt: null, reason: null, unknownFromLease: false, queuedAtMs: nowMs, queuedByEmail: by, history: entry('queued', 'teacher') }, logContact: null };
  }
  if (action === 'markSent') {
    if (message.state !== 'unknown') refuse('Only a message that may have been sent can be marked as sent.');
    return {
      update: { state: 'sent', reason: 'Marked as sent by the teacher', sentAtMs: nowMs, unknownFromLease: false, confirmation: { recipientCount: 0, channel: 'text', note: 'Teacher checked SchoolStatus' }, history: entry('sent', 'teacher') },
      logContact: { method: 'text', sentAtMs: nowMs, confirmedBy: 'teacher' },
    };
  }
  return refuse('Choose cancel, requeue or markSent.', 'invalid-argument');
};

/* ------------------------------------------------------------ Parent Contacts */

/**
 * The Parent Contacts record a sent message leaves, with the same fields a
 * teacher's own log has (parentContactStore.recordParentContact), so the
 * contact list, its export and the principal report read it as any other.
 * `createdAtServer` is added by the caller (a server timestamp).
 */
export const parentContactForFamilyMessage = (message, { sentAtMs, method = 'text', confirmedBy = 'extension', nowMs }) => {
  const teacher = text(message.teacherOfRecord).toLowerCase();
  const how = confirmedBy === 'teacher'
    ? 'Sent through SchoolStatus (the teacher confirmed it there).'
    : 'Sent through SchoolStatus by the MathMaster extension.';
  return {
    schemaVersion: 1,
    studentId: text(message.studentId),
    studentName: text(message.studentName),
    classId: text(message.classId) || null,
    classPeriod: text(message.classPeriod) || null,
    occurredAt: new Date(sentAtMs).toISOString(),
    method: ['text', 'email'].includes(method) ? method : 'text',
    category: ['cellphone', 'behavior', 'attendance'].includes(message.contactCategory) ? message.contactCategory : 'behavior',
    notes: `${message.mode === 'test' ? 'TEST MESSAGE. ' : ''}${how} ${text(message.subject)}`.slice(0, 2000),
    outcome: message.mode === 'test' ? 'Discipline message sent (test mode)' : 'Discipline message sent',
    followUpDate: null,
    recordType: 'contact',
    parentContactId: null,
    createdByEmail: teacher,
    originTeacherEmail: teacher,
    originClassId: text(message.classId) || null,
    authorizedTeacherEmails: [teacher],
    createdAt: new Date(nowMs).toISOString(),
  };
};

/* ------------------------------------------------------------ what the screen sees */

/** A message as the teacher's screen needs it: state, words, no lease internals. */
export const familyMessageView = (stored, nowMs) => {
  const message = effectiveFamilyMessage(stored, nowMs);
  return {
    id: message.id,
    messageKey: message.messageKey,
    sequence: Number(message.sequence) || 1,
    classId: message.classId,
    studentId: message.studentId,
    dateKey: message.dateKey,
    incidentIds: message.incidentIds || [],
    subject: message.subject || '',
    body: message.body || '',
    mode: message.mode || 'live',
    state: message.state,
    reason: message.reason || null,
    queuedAtMs: message.queuedAtMs || null,
    sentAtMs: message.sentAtMs || null,
    recipientCount: message.confirmation?.recipientCount ?? null,
  };
};

/** "First Last", for the extension's check that SchoolStatus opened the right student. */
export const studentNameForMatch = (studentId, student = {}) => formStudentName({ id: studentId, ...student });

export const districtIdOf = (studentId, student = {}) => effectiveDistrictStudentId({ id: studentId, ...student });
