// The rules for messages to families sent through SchoolStatus
// (functions/shared/familyMessages.mjs). The extension that sends them works
// in a teacher's real SchoolStatus, where every send reaches a real phone, so
// these pin what must never happen: a message handed out twice once Send may
// have been pressed, a send without the attempt's own "start", a message to
// anyone but a test student in test mode, and a Parent Contacts record that
// does not look like the teacher's own.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  FAMILY_MESSAGE_LIMITS,
  FamilyMessageError,
  claimFamilyMessage,
  effectiveFamilyMessage,
  familyContactCategory,
  familyMessageDraft,
  familyMessageKey,
  familyMessageView,
  messagingGate,
  normalizeMessagingSettings,
  parentContactForFamilyMessage,
  planFamilyMessageQueue,
  releaseFamilyMessage,
  reportFamilyMessage,
  startFamilyMessageSend,
  teacherFamilyMessageAction,
  validateMessagingSettingsInput,
} from '../../functions/shared/familyMessages.mjs';
import { parentMessage } from '../../functions/shared/disciplineTracker.mjs';

const at = (hhmm, day = '2026-11-30') => Date.parse(`${day}T${hhmm}:00-06:00`);
const MIN = 60 * 1000;
const TEST = { mode: 'test', testDistrictIds: ['1500101'] };
const LIVE = { mode: 'live', testDistrictIds: [] };
const incident = (id, overrides = {}) => ({
  id, classId: 'c1', studentId: 'u-ada', type: 'tardy', detail: '', occurredAtMs: at('08:05'), dateKey: '2026-11-30', ...overrides,
});
const message = (overrides = {}) => ({
  id: 'a'.repeat(32) + '_1', messageKey: 'c1|2026-11-30|u-ada', sequence: 1, teacherOfRecord: 'teacher@desotoisd.org',
  classId: 'c1', classLabel: 'Algebra I', classPeriod: 'Period 1', studentId: 'u-ada', studentName: 'Ada Lovelace', sisStudentId: '1500101',
  dateKey: '2026-11-30', incidentIds: ['t1'], subject: 'Ada: Tardy on Mon, 11/30', body: 'Hello', contactCategory: 'behavior',
  mode: 'test', state: 'queued', attempt: null, queuedAtMs: at('09:00'), history: [], ...overrides,
});
const current = (overrides = {}) => ({
  settings: TEST, callerEmail: 'teacher@desotoisd.org', teacherOfRecord: 'teacher@desotoisd.org', onRoster: true,
  sisStudentId: '1500101', studentName: 'Ada Lovelace', voidedIncidentIds: [], ...overrides,
});
const claimed = (overrides = {}) => message({ state: 'claimed', attempt: { attemptId: 'attempt-1', runnerId: 'ext-a', claimedAtMs: at('09:10'), leaseUntilMs: at('09:10') + FAMILY_MESSAGE_LIMITS.claimLeaseMs }, ...overrides });
const sending = (overrides = {}) => message({ state: 'sending', attempt: { attemptId: 'attempt-1', runnerId: 'ext-a', claimedAtMs: at('09:10'), sendingAtMs: at('09:11'), leaseUntilMs: at('09:11') + FAMILY_MESSAGE_LIMITS.sendingLeaseMs }, ...overrides });
const refusesWith = (fn, pattern) => assert.throws(fn, (error) => error instanceof FamilyMessageError && pattern.test(error.message));

test('the switch: off unless set, test needs a test student, and test sends only to the test students', () => {
  assert.deepEqual(normalizeMessagingSettings(undefined), { mode: 'off', testDistrictIds: [] });
  assert.deepEqual(normalizeMessagingSettings({ mode: 'everyone', testDistrictIds: ['1500101'] }), { mode: 'off', testDistrictIds: ['1500101'] }, 'an unknown mode is off');
  assert.throws(() => validateMessagingSettingsInput({ mode: 'test', testDistrictIds: [] }), /at least one test student/);
  assert.throws(() => validateMessagingSettingsInput({ mode: 'test', testDistrictIds: ['ada@school.org'] }), /Not a district student ID/);
  assert.throws(() => validateMessagingSettingsInput({ mode: 'loud' }), /Off, Test or Live/);
  assert.deepEqual(validateMessagingSettingsInput({ mode: 'test', testDistrictIds: '1500101, 1500101 1500102' }), { mode: 'test', testDistrictIds: ['1500101', '1500102'] });

  assert.equal(messagingGate({}, '1500101').allowed, false, 'off by default');
  assert.equal(messagingGate(TEST, '1500101').allowed, true);
  assert.match(messagingGate(TEST, '1500102').reason, /Test mode: only the test students/);
  assert.match(messagingGate(LIVE, '').reason, /No district student ID/);
  assert.equal(messagingGate(LIVE, '1500102').mode, 'live');
});

test('a message is the tracker\'s own factual draft, and a device makes it a cellphone contact', () => {
  const student = { id: 'u-ada', firstName: 'Ada', lastName: 'Lovelace' };
  const list = [incident('t1'), incident('t2', { type: 'deviceCollected', occurredAtMs: at('08:40') }), incident('t3', { voidedAtMs: at('08:41') })];
  const draft = familyMessageDraft({ student, incidents: list, dateKey: '2026-11-30', teacherName: 'Mr. Hawkins', classLabel: 'Algebra I' });
  const expected = parentMessage({ student, incidents: list.slice(0, 2), dateKey: '2026-11-30', teacherName: 'Mr. Hawkins', classLabel: 'Algebra I' });
  assert.equal(draft.body, expected.body);
  assert.equal(draft.subject, expected.subject);
  assert.equal(draft.contactCategory, 'cellphone');
  assert.equal(familyContactCategory([incident('t1')]), 'behavior');
  assert.equal(familyMessageKey({ classId: 'c1', dateKey: '2026-11-30', studentId: 'u-ada' }), 'c1|2026-11-30|u-ada');
});

test('queueing: new, updated while queued, never again once sent, and a follow-up carries only what is new', () => {
  const nowMs = at('10:00');
  const two = [incident('t1'), incident('t2', { occurredAtMs: at('09:00') })];
  assert.deepEqual(planFamilyMessageQueue({ incidents: two, messages: [], nowMs }), { action: 'create', sequence: 1, incidentIds: ['t1', 't2'] });
  assert.deepEqual(planFamilyMessageQueue({ incidents: [incident('t1', { voidedAtMs: 1 })], messages: [], nowMs }).why, 'noViolations');
  // Still in the queue: the same message is rewritten.
  assert.deepEqual(planFamilyMessageQueue({ incidents: two, messages: [message({ incidentIds: ['t1'] })], nowMs }),
    { action: 'update', messageId: message().id, sequence: 1, incidentIds: ['t1', 't2'] });
  // Sent: those violations are never sent again; a newer one is a second message.
  const sent = message({ state: 'sent', incidentIds: ['t1'] });
  assert.equal(planFamilyMessageQueue({ incidents: [incident('t1')], messages: [sent], nowMs }).why, 'alreadySent');
  assert.deepEqual(planFamilyMessageQueue({ incidents: two, messages: [sent], nowMs }), { action: 'create', sequence: 2, incidentIds: ['t2'] });
  // In flight or possibly sent: not queued again.
  assert.equal(planFamilyMessageQueue({ incidents: [incident('t1')], messages: [claimed({ queuedAtMs: nowMs })], nowMs: at('09:11') }).why, 'inFlight');
  assert.equal(planFamilyMessageQueue({ incidents: [incident('t1')], messages: [message({ state: 'unknown' })], nowMs }).why, 'needsTeacher');
  // A lapsed send is possibly sent, too.
  assert.equal(planFamilyMessageQueue({ incidents: [incident('t1')], messages: [sending()], nowMs: at('11:00') }).why, 'needsTeacher');
  // Failed or cancelled: reused, with the current violations.
  assert.equal(planFamilyMessageQueue({ incidents: two, messages: [message({ state: 'failed' })], nowMs }).action, 'update');
});

test('a lapsed claim returns to the queue; a lapsed send becomes unknown, never queued', () => {
  const lapsedClaim = effectiveFamilyMessage(claimed(), at('09:10') + FAMILY_MESSAGE_LIMITS.claimLeaseMs + 1);
  assert.equal(lapsedClaim.state, 'queued');
  assert.equal(lapsedClaim.attempt, null);
  assert.equal(effectiveFamilyMessage(claimed(), at('09:12')).state, 'claimed');
  const lapsedSend = effectiveFamilyMessage(sending(), at('09:11') + FAMILY_MESSAGE_LIMITS.sendingLeaseMs + 1);
  assert.equal(lapsedSend.state, 'unknown');
  assert.match(lapsedSend.reason, /may or may not have reached the family/);
  assert.equal(familyMessageView(sending(), at('10:00')).state, 'unknown', 'the screen sees it the same way');
});

test('a claim checks everything again, and hands out what the extension needs to find the right student', () => {
  const nowMs = at('09:10');
  const { update, handout } = claimFamilyMessage(message(), { runnerId: 'ext-a', attemptId: 'attempt-1', nowMs, current: current() });
  assert.equal(update.state, 'claimed');
  assert.equal(update.attempt.leaseUntilMs, nowMs + FAMILY_MESSAGE_LIMITS.claimLeaseMs);
  assert.deepEqual(Object.keys(handout).sort(), ['attemptId', 'body', 'classLabel', 'dateKey', 'leaseUntilMs', 'messageId', 'mode', 'sisStudentId', 'studentName', 'subject']);
  assert.equal(handout.mode, 'test');
  assert.equal(handout.sisStudentId, '1500101');

  const stopped = (overrides, stored = message()) => claimFamilyMessage(stored, { runnerId: 'ext-a', attemptId: 'attempt-1', nowMs, current: current(overrides) });
  assert.match(stopped({}, message({ queuedAtMs: nowMs - FAMILY_MESSAGE_LIMITS.queuedExpiryMs - 1 })).update.reason, /more than 3 days/);
  assert.match(stopped({ teacherOfRecord: 'other@desotoisd.org' }).update.reason, /different teacher of record/);
  assert.match(stopped({ onRoster: false }).update.reason, /no longer on this class roster/);
  assert.match(stopped({ voidedIncidentIds: ['t1'] }).update.reason, /Every violation in it was undone/);
  assert.match(stopped({ voidedIncidentIds: ['t1'] }, message({ incidentIds: ['t1', 't2'] })).update.reason, /Queue it again to send the corrected message/);
  for (const overrides of [{ teacherOfRecord: 'other@desotoisd.org' }, { onRoster: false }, { voidedIncidentIds: ['t1'] }]) {
    assert.equal(stopped(overrides).update.state, 'cancelled');
    assert.equal(stopped(overrides).handout, null);
  }
  // Someone else's message is not theirs to send, and not theirs to cancel.
  assert.deepEqual(stopped({ callerEmail: 'other@desotoisd.org' }), { update: null, handout: null });
  // Test mode after queueing (or a district ID that changed): held, not lost.
  const held = stopped({ sisStudentId: '1500102' });
  assert.equal(held.update, null);
  assert.match(held.held, /Test mode/);
  assert.equal(stopped({ settings: { mode: 'off' } }).handout, null);
  // Only a queued message is handed out.
  assert.deepEqual(claimFamilyMessage(claimed(), { runnerId: 'ext-b', attemptId: 'attempt-2', nowMs: at('09:11'), current: current() }), { update: null, handout: null });
  assert.equal(claimFamilyMessage(sending(), { runnerId: 'ext-b', attemptId: 'attempt-2', nowMs: at('11:00'), current: current() }).handout, null, 'a lapsed send is never handed out again');
});

test('only the attempt holding a live claim may press Send', () => {
  const ok = startFamilyMessageSend(claimed(), { attemptId: 'attempt-1', nowMs: at('09:11') });
  assert.equal(ok.state, 'sending');
  assert.equal(ok.attempt.leaseUntilMs, at('09:11') + FAMILY_MESSAGE_LIMITS.sendingLeaseMs);
  refusesWith(() => startFamilyMessageSend(claimed(), { attemptId: 'attempt-2', nowMs: at('09:11') }), /^Do not send/);
  refusesWith(() => startFamilyMessageSend(claimed(), { attemptId: 'attempt-1', nowMs: at('09:10') + FAMILY_MESSAGE_LIMITS.claimLeaseMs + 1 }), /^Do not send/);
  refusesWith(() => startFamilyMessageSend(claimed({ state: 'cancelled' }), { attemptId: 'attempt-1', nowMs: at('09:11') }), /^Do not send/);
  refusesWith(() => startFamilyMessageSend(sending(), { attemptId: 'attempt-1', nowMs: at('09:12') }), /^Do not send/, 'twice');
  refusesWith(() => startFamilyMessageSend(claimed(), { attemptId: '', nowMs: at('09:11') }), /^Do not send/);
  assert.equal(releaseFamilyMessage(claimed(), { attemptId: 'attempt-1', nowMs: at('09:11') }).state, 'queued');
  assert.equal(releaseFamilyMessage(sending(), { attemptId: 'attempt-1', nowMs: at('09:12') }), null, 'a send cannot be given back');
});

test('reports: sent needs a send in progress and writes Parent Contacts; nothing else does', () => {
  const sent = reportFamilyMessage(sending(), { attemptId: 'attempt-1', outcome: 'sent', confirmation: { recipientCount: 2, channel: 'text' }, nowMs: at('09:12') });
  assert.equal(sent.update.state, 'sent');
  assert.deepEqual(sent.update.confirmation, { recipientCount: 2, channel: 'text', note: '' });
  assert.deepEqual(sent.logContact, { method: 'text', sentAtMs: at('09:12'), confirmedBy: 'extension' });
  refusesWith(() => reportFamilyMessage(claimed(), { attemptId: 'attempt-1', outcome: 'sent', nowMs: at('09:11') }), /cannot be reported sent/, 'Send was never started');
  refusesWith(() => reportFamilyMessage(sending(), { attemptId: 'attempt-2', outcome: 'sent', nowMs: at('09:12') }), /no longer holds/);
  refusesWith(() => reportFamilyMessage(message({ state: 'sent', attempt: sending().attempt }), { attemptId: 'attempt-1', outcome: 'sent', nowMs: at('09:13') }), /cannot be reported sent/, 'never twice');
  // A late report from the attempt whose lease lapsed is still the truth.
  assert.equal(reportFamilyMessage(sending(), { attemptId: 'attempt-1', outcome: 'sent', nowMs: at('10:00') }).update.state, 'sent');
  // After the teacher decided, the old attempt no longer speaks for it.
  const requeued = { ...sending(), ...teacherFamilyMessageAction(sending(), { action: 'requeue', nowMs: at('10:00'), by: 't' }).update };
  refusesWith(() => reportFamilyMessage(requeued, { attemptId: 'attempt-1', outcome: 'sent', nowMs: at('10:01') }), /no longer holds/);

  const failed = reportFamilyMessage(claimed(), { attemptId: 'attempt-1', outcome: 'failed', reason: 'No student with that ID in SchoolStatus', nowMs: at('09:11') });
  assert.equal(failed.update.state, 'failed');
  assert.equal(failed.logContact, null);
  refusesWith(() => reportFamilyMessage(claimed(), { attemptId: 'attempt-1', outcome: 'failed', nowMs: at('09:11') }), /Say why/);
  const unknown = reportFamilyMessage(sending(), { attemptId: 'attempt-1', outcome: 'unknown', nowMs: at('09:12') });
  assert.equal(unknown.update.state, 'unknown');
  assert.equal(unknown.logContact, null);
  refusesWith(() => reportFamilyMessage(claimed(), { attemptId: 'attempt-1', outcome: 'unknown', nowMs: at('09:11') }), /cannot be reported unknown/);
  refusesWith(() => reportFamilyMessage(sending(), { attemptId: 'attempt-1', outcome: 'delivered', nowMs: at('09:12') }), /sent, failed or unknown/);
});

test('the teacher decides: cancel before Send, queue again, or record that it went', () => {
  const nowMs = at('10:00');
  assert.equal(teacherFamilyMessageAction(message(), { action: 'cancel', nowMs, by: 't' }).update.state, 'cancelled');
  assert.equal(teacherFamilyMessageAction(claimed(), { action: 'cancel', nowMs: at('09:11'), by: 't' }).update.state, 'cancelled', 'before Send: the extension\'s start is then refused');
  refusesWith(() => teacherFamilyMessageAction(sending(), { action: 'cancel', nowMs: at('09:12'), by: 't' }), /being sent right now/);
  for (const state of ['failed', 'cancelled', 'unknown']) {
    assert.equal(teacherFamilyMessageAction(message({ state }), { action: 'requeue', nowMs, by: 't' }).update.state, 'queued', state);
  }
  refusesWith(() => teacherFamilyMessageAction(message({ state: 'sent' }), { action: 'requeue', nowMs, by: 't' }), /cannot be queued again/);
  const marked = teacherFamilyMessageAction(message({ state: 'unknown' }), { action: 'markSent', nowMs, by: 't' });
  assert.equal(marked.update.state, 'sent');
  assert.equal(marked.logContact.confirmedBy, 'teacher');
  refusesWith(() => teacherFamilyMessageAction(message({ state: 'queued' }), { action: 'markSent', nowMs, by: 't' }), /may have been sent/);
});

test('a sent message leaves a Parent Contacts record with exactly the fields a teacher\'s own log has', () => {
  const contact = parentContactForFamilyMessage(message({ mode: 'live', contactCategory: 'cellphone' }), { sentAtMs: at('09:12'), method: 'text', nowMs: at('09:12') });
  // The fields the rules let a teacher write (firestore.rules, parentContactLogs);
  // the server adds createdAtServer.
  const rules = readFileSync('firestore.rules', 'utf8');
  const block = rules.slice(rules.indexOf('match /parentContactLogs/{contactId}'));
  const allowed = [...block.slice(block.indexOf('hasOnly(['), block.indexOf('])')).matchAll(/'([A-Za-z]+)'/g)].map(([, key]) => key);
  assert.deepEqual([...Object.keys(contact), 'createdAtServer'].sort(), allowed.sort());
  assert.equal(contact.method, 'text');
  assert.equal(contact.category, 'cellphone');
  assert.equal(contact.recordType, 'contact');
  assert.equal(contact.occurredAt, new Date(at('09:12')).toISOString());
  assert.deepEqual(contact.authorizedTeacherEmails, ['teacher@desotoisd.org']);
  assert.equal(contact.originClassId, contact.classId);
  assert.match(contact.notes, /^Sent through SchoolStatus by the MathMaster extension\. Ada: Tardy/);
  assert.equal(contact.outcome, 'Discipline message sent');
  const testContact = parentContactForFamilyMessage(message({ mode: 'test' }), { sentAtMs: at('09:12'), confirmedBy: 'teacher', nowMs: at('09:12') });
  assert.match(testContact.notes, /^TEST MESSAGE\. Sent through SchoolStatus \(the teacher confirmed it there\)\./);
  assert.equal(testContact.outcome, 'Discipline message sent (test mode)');
});
