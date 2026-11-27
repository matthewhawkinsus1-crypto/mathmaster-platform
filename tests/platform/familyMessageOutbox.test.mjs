// The family-message queue (functions/lib/familyMessageOutbox.js) against a
// Firestore stand-in. It plays the extension's side of the protocol (claim,
// start, report) the way the real one will from the teacher's SchoolStatus.
// Nothing here reaches SchoolStatus: there, every send is a real family's
// phone.

import assert from 'node:assert/strict';
import test from 'node:test';
import { FAMILY_MESSAGE_LIMITS } from '../../functions/shared/familyMessages.mjs';
import { at, contactsIn, messagesIn, OTHER, outbox, queue, serverTimestamp, TEACHER, tap, world } from './helpers/familyMessageWorld.mjs';

// The extension's side, as it will run in the teacher's SchoolStatus tab.
const extension = (db, runnerId = 'ext-runner-a') => ({
  claim: (nowMs) => outbox.claimNextFamilyMessage({ db, teacherEmail: TEACHER, runnerId, nowMs }),
  start: (message, nowMs) => outbox.startFamilyMessage({ db, teacherEmail: TEACHER, messageId: message.messageId, attemptId: message.attemptId, nowMs }),
  report: (message, outcome, nowMs, extra = {}) => outbox.reportFamilyMessage({ db, teacherEmail: TEACHER, messageId: message.messageId, attemptId: message.attemptId, outcome, nowMs, serverTimestamp, ...extra }),
});

test('off: nothing can be queued, and the extension is given nothing', async () => {
  const db = world({ mode: null });
  await assert.rejects(queue(db), /not turned on yet/);
  assert.equal(messagesIn(db).length, 0);
  assert.deepEqual(await extension(db).claim(at('09:05')), { mode: 'off', message: null, held: 0 });
});

test('test mode: only the test student is queued, with the tracker\'s own wording built on the server', async () => {
  const db = world();
  const { mode, results } = await queue(db);
  assert.equal(mode, 'test');
  assert.deepEqual(results.map((entry) => [entry.studentId, entry.status]), [['u-ada', 'queued'], ['u-ben', 'testModeSkipped']]);
  const [message] = messagesIn(db);
  assert.equal(message.state, 'queued');
  assert.equal(message.mode, 'test');
  assert.equal(message.sisStudentId, '1500101');
  assert.equal(message.studentName, 'Ada Lovelace');
  assert.match(message.body, /^Mr\. Hawkins \(Algebra I\): On Mon, 11\/30, Ada arrived late to class at 8:05 AM\./);
  assert.ok(message.body.length <= 480, 'one SchoolStatus text');
  assert.doesNotMatch(message.body, /Ben|Ortiz|Lovelace/, 'only this student, by first name');
  assert.match(message.id, /^[0-9a-f]{32}_1$/);
  // Queued again unchanged: nothing new, still one message.
  assert.equal((await queue(db, { studentIds: ['u-ada'] })).results[0].status, 'updated');
  assert.equal(messagesIn(db).length, 1);
});

test('claim → start → sent: one message, one Parent Contacts record, never handed out again', async () => {
  const db = world();
  await queue(db);
  const ext = extension(db);
  const { message, mode } = await ext.claim(at('09:05'));
  assert.equal(mode, 'test');
  assert.equal(message.sisStudentId, '1500101');
  assert.equal(message.studentName, 'Ada Lovelace', 'for the extension\'s check that SchoolStatus opened the right student');
  assert.equal((await ext.claim(at('09:05'))).message, null, 'one claim at a time per message');
  assert.equal((await ext.start(message, at('09:06'))).state, 'sending');
  const reported = await ext.report(message, 'sent', at('09:06'), { confirmation: { recipientCount: 2, channel: 'text' } });
  assert.equal(reported.state, 'sent');
  const [stored] = messagesIn(db);
  assert.equal(stored.state, 'sent');
  assert.equal(stored.parentContactId, `familyMessage_${stored.id}`);
  const contacts = contactsIn(db);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].id, stored.parentContactId);
  assert.equal(contacts[0].studentId, 'u-ada');
  assert.equal(contacts[0].method, 'text');
  assert.equal(contacts[0].category, 'behavior');
  assert.equal(contacts[0].createdAtServer, 'SERVER_TIME');
  assert.deepEqual(contacts[0].authorizedTeacherEmails, [TEACHER]);
  // Never again: not by the extension, not by pressing Send to families again.
  assert.equal((await ext.claim(at('09:30'))).message, null);
  await assert.rejects(ext.report(message, 'sent', at('09:31')), /cannot be reported sent/);
  assert.equal((await queue(db, { nowMs: at('09:40') })).results.find((entry) => entry.studentId === 'u-ada').status, 'alreadySent');
  assert.equal(contactsIn(db).length, 1);
});

test('a later violation is a follow-up message about only that one', async () => {
  const db = world();
  await queue(db);
  const ext = extension(db);
  const first = (await ext.claim(at('09:05'))).message;
  await ext.start(first, at('09:06'));
  await ext.report(first, 'sent', at('09:06'));
  db.store.set('disciplineIncidents/alg1-p1_t3', tap('t3', { type: 'deviceCollected', occurredAtMs: at('09:20') }));
  const result = (await queue(db, { nowMs: at('09:30') })).results.find((entry) => entry.studentId === 'u-ada');
  assert.equal(result.status, 'queued');
  assert.equal(result.sequence, 2);
  const followUp = messagesIn(db).find((entry) => entry.sequence === 2);
  assert.deepEqual(followUp.incidentIds, ['alg1-p1_t3']);
  assert.match(followUp.body, /had an electronic device collected during class at 9:20 AM\./);
  assert.doesNotMatch(followUp.body, /arrived late/);
  assert.equal(followUp.contactCategory, 'cellphone');
});

test('a claim that lapses before Send goes back to the queue, and the old attempt may not press Send', async () => {
  const db = world();
  await queue(db);
  const first = (await extension(db, 'ext-runner-a').claim(at('09:05'))).message;
  const later = at('09:05') + FAMILY_MESSAGE_LIMITS.claimLeaseMs + 1000;
  const second = (await extension(db, 'ext-runner-b').claim(later)).message;
  assert.equal(second.messageId, first.messageId);
  assert.notEqual(second.attemptId, first.attemptId);
  await assert.rejects(extension(db).start(first, later + 1000), /Do not send: this message is no longer yours/);
  assert.equal((await extension(db, 'ext-runner-b').start(second, later + 1000)).state, 'sending');
});

test('two tabs asking at once: only one gets the message', async () => {
  const db = world();
  await queue(db);
  const [left, right] = await Promise.all([extension(db, 'ext-runner-a').claim(at('09:05')), extension(db, 'ext-runner-b').claim(at('09:05'))]);
  assert.equal([left.message, right.message].filter(Boolean).length, 1);
});

test('a send that never reported is not sent again by itself: the teacher checks SchoolStatus', async () => {
  const db = world();
  await queue(db);
  const ext = extension(db);
  const message = (await ext.claim(at('09:05'))).message;
  await ext.start(message, at('09:06'));
  // The tab closed after Send may have been pressed.
  const later = at('09:06') + FAMILY_MESSAGE_LIMITS.sendingLeaseMs + 1000;
  assert.equal((await extension(db, 'ext-runner-b').claim(later)).message, null);
  const status = await outbox.familyMessageStatus({ db, teacherEmail: TEACHER, nowMs: later });
  assert.deepEqual([status.queued, status.inFlight, status.needsTeacher], [0, 0, 1]);
  assert.equal((await queue(db, { nowMs: later })).results[0].status, 'needsTeacher');
  // The teacher saw it in SchoolStatus: recorded as sent, and logged once.
  const resolved = await outbox.resolveFamilyMessage({ db, teacherEmail: TEACHER, messageId: message.messageId, action: 'markSent', nowMs: later, serverTimestamp });
  assert.equal(resolved.state, 'sent');
  assert.equal(contactsIn(db).length, 1);
  assert.match(contactsIn(db)[0].notes, /the teacher confirmed it there/);
});

test('Send again on an unknown message hands it out once more, on the teacher\'s word', async () => {
  const db = world();
  await queue(db);
  const ext = extension(db);
  const message = (await ext.claim(at('09:05'))).message;
  await ext.start(message, at('09:06'));
  await ext.report(message, 'unknown', at('09:07'), { reason: 'The page reloaded after Send.' });
  assert.equal((await ext.claim(at('09:08'))).message, null);
  await outbox.resolveFamilyMessage({ db, teacherEmail: TEACHER, messageId: message.messageId, action: 'requeue', nowMs: at('09:10'), serverTimestamp });
  const again = (await ext.claim(at('09:11'))).message;
  assert.equal(again.messageId, message.messageId);
  await assert.rejects(ext.report(message, 'sent', at('09:12')), /no longer holds/, 'the first attempt no longer speaks for it');
});

test('an undo after queueing cancels the message instead of sending it', async () => {
  const db = world();
  await queue(db);
  db.store.set('disciplineIncidents/alg1-p1_t1', { ...db.store.get('disciplineIncidents/alg1-p1_t1'), voidedAtMs: at('09:02') });
  assert.equal((await extension(db).claim(at('09:05'))).message, null);
  const [message] = messagesIn(db);
  assert.equal(message.state, 'cancelled');
  assert.match(message.reason, /Every violation in it was undone/);
});

test('turning the switch off between claim and Send stops the send', async () => {
  const db = world();
  await queue(db);
  const ext = extension(db);
  const message = (await ext.claim(at('09:05'))).message;
  db.store.set('disciplineStatus/familyMessaging', { mode: 'off', testDistrictIds: [] });
  await assert.rejects(ext.start(message, at('09:06')), /Do not send: Sending to families through SchoolStatus is not turned on/);
  assert.equal(messagesIn(db)[0].state, 'claimed', 'nothing was pressed; the lease returns it');
});

test('a message is only ever its own teacher\'s: another teacher cannot claim, start, report or change it', async () => {
  const db = world();
  await queue(db);
  const message = (await extension(db).claim(at('09:05'))).message;
  assert.equal((await outbox.claimNextFamilyMessage({ db, teacherEmail: OTHER, runnerId: 'ext-other', nowMs: at('09:05') })).message, null);
  await assert.rejects(outbox.startFamilyMessage({ db, teacherEmail: OTHER, messageId: message.messageId, attemptId: message.attemptId, nowMs: at('09:06') }), /Only the teacher who queued/);
  await assert.rejects(outbox.reportFamilyMessage({ db, teacherEmail: OTHER, messageId: message.messageId, attemptId: message.attemptId, outcome: 'sent', nowMs: at('09:06'), serverTimestamp }), /Only the teacher who queued/);
  await assert.rejects(outbox.resolveFamilyMessage({ db, teacherEmail: OTHER, messageId: message.messageId, action: 'cancel', nowMs: at('09:06'), serverTimestamp }), /Only the teacher who queued/);
  assert.equal((await outbox.listFamilyMessages({ db, teacherEmail: OTHER, fromDateKey: '2026-11-01', toDateKey: '2026-11-30', nowMs: at('09:06') })).length, 0);
  await assert.rejects(outbox.startFamilyMessage({ db, teacherEmail: TEACHER, messageId: '../grades/u-ada', attemptId: message.attemptId, nowMs: at('09:06') }), /not found/);
});

test('a student SchoolStatus could not find fails, and Send to families queues it again', async () => {
  const db = world();
  await queue(db);
  const ext = extension(db);
  const message = (await ext.claim(at('09:05'))).message;
  await ext.report(message, 'failed', at('09:06'), { reason: 'No student with that district ID in SchoolStatus' });
  assert.equal(messagesIn(db)[0].state, 'failed');
  assert.equal(contactsIn(db).length, 0);
  assert.equal((await queue(db, { nowMs: at('09:10') })).results[0].status, 'queued');
  assert.equal(messagesIn(db).length, 1, 'the same message, queued again');
  assert.equal((await ext.claim(at('09:11'))).message.messageId, message.messageId);
});

test('a day too long ago is refused, and the teacher can cancel before Send', async () => {
  const db = world();
  await assert.rejects(queue(db, { dateKey: '2026-11-01' }), /last 14 days only/);
  await queue(db);
  const [message] = messagesIn(db);
  const cancelled = await outbox.resolveFamilyMessage({ db, teacherEmail: TEACHER, messageId: message.id, action: 'cancel', nowMs: at('09:01'), serverTimestamp });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal((await extension(db).claim(at('09:05'))).message, null);
});

test('the switch is saved checked', async () => {
  const db = world({ mode: null });
  await assert.rejects(outbox.saveMessagingSettings({ db, input: { mode: 'test', testDistrictIds: [] }, byEmail: TEACHER, nowMs: 1 }), /at least one test student/);
  const saved = await outbox.saveMessagingSettings({ db, input: { mode: 'test', testDistrictIds: ['1500101'] }, byEmail: TEACHER, nowMs: 1 });
  assert.deepEqual(saved, { mode: 'test', testDistrictIds: ['1500101'] });
  assert.deepEqual(await outbox.readMessagingSettings(db), saved);
});
