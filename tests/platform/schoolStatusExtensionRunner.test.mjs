// The SchoolStatus extension's send loop (extensions/schoolstatus-messages/
// lib/runner.js) against the real queue rules (functions/lib/
// familyMessageOutbox.js on a Firestore stand-in) and a fake SchoolStatus
// page that records every Send press.
//
// Every message sent through SchoolStatus reaches a real family's phone, so
// what is pinned here is mostly when Send is NOT pressed
// (docs/plans/2026-11-27-schoolstatus-extension-brief.md, "Tests the
// extension needs").

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { at, contactsIn, messagesIn, outbox, queue, serverTimestamp, TEACHER, world } from './helpers/familyMessageWorld.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { runFamilyMessages, sameStudentName, stopRun } from '../../extensions/schoolstatus-messages/lib/runner.js';

const RUNNER = 'ext-0123456789abcdef01234567';

// MathMaster's side: the bridge's calls, each straight into the server's
// rules, as the teacher, at a clock the test moves.
const mathmasterFor = (db, clock) => ({
  status: () => outbox.familyMessageStatus({ db, teacherEmail: TEACHER, nowMs: clock.now }),
  claim: ({ runnerId }) => outbox.claimNextFamilyMessage({ db, teacherEmail: TEACHER, runnerId, nowMs: clock.now }),
  start: ({ messageId, attemptId }) => outbox.startFamilyMessage({ db, teacherEmail: TEACHER, messageId, attemptId, nowMs: clock.now }),
  report: ({ messageId, attemptId, outcome, reason, confirmation }) => outbox.reportFamilyMessage({
    db, teacherEmail: TEACHER, messageId, attemptId, outcome, reason, confirmation, nowMs: clock.now, serverTimestamp,
  }),
  release: ({ messageId, attemptId, reason }) => outbox.releaseFamilyMessage({ db, teacherEmail: TEACHER, messageId, attemptId, reason, nowMs: clock.now }),
});

// A fake SchoolStatus: one roster, a composer, and a record of everything
// typed and every Send press. `script` overrides any step.
const fakeSchoolStatus = (script = {}) => {
  const page = {
    presses: 0,
    typed: [],
    discarded: 0,
    composerOpen: false,
    roster: { 1500101: { name: 'Lovelace, Ada M', guardians: 2 } },
    async where() { return script.where ? script.where() : { page: 'home' }; },
    async findStudent({ sisStudentId, studentName }) {
      if (script.findStudent) return script.findStudent({ sisStudentId, studentName });
      const student = page.roster[sisStudentId];
      if (!student) return { ok: false, reason: 'No SchoolStatus student has that district ID.' };
      if (!sameStudentName(studentName, student.name)) return { ok: false, reason: 'The name SchoolStatus shows does not match.' };
      if (!student.guardians) return { ok: false, reason: 'SchoolStatus lists no guardian with a contact method.' };
      return { ok: true };
    },
    async openComposer() {
      if (script.openComposer) return script.openComposer();
      page.composerOpen = true;
      return { ok: true, recipientCount: 2, channel: 'text' };
    },
    async fill({ subject, body }) { page.typed.push({ subject, body }); },
    async discard() { page.composerOpen = false; page.discarded += 1; },
    async pressSend() {
      page.presses += 1;
      if (script.pressSend) return script.pressSend();
      page.composerOpen = false;
      return undefined;
    },
    async confirmSent() { return script.confirmSent ? script.confirmSent() : { seen: true, recipientCount: 2, channel: 'text' }; },
    async home() {},
  };
  return page;
};

const setUp = async (options = {}) => {
  const db = world(options);
  await queue(db);
  const clock = { now: at('09:05') };
  return { db, clock, mathmaster: mathmasterFor(db, clock) };
};
const run = (mathmaster, schoolstatus, overrides = {}) => runFamilyMessages({
  mathmaster, schoolstatus, runnerId: RUNNER, confirmTest: async () => true, ...overrides,
});

test('test mode, confirmed: one Send, reported sent, exactly one Parent Contacts record', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus();
  const previews = [];
  const lines = [];
  const result = await run(mathmaster, page, { confirmTest: async (preview) => { previews.push(preview); return true; }, log: (line) => lines.push(line) });
  assert.deepEqual(result.counts, { sent: 1, failed: 0, unknown: 0, released: 0, notStarted: 0 });
  assert.equal(page.presses, 1);
  assert.equal(previews.length, 1, 'the teacher saw this message before Send');
  assert.equal(previews[0].body, page.typed[0].body, 'and it is exactly what was pasted');
  assert.equal(previews[0].recipientCount, 2);
  const [stored] = messagesIn(db);
  assert.equal(stored.state, 'sent');
  assert.equal(contactsIn(db).length, 1);
  // The log names no student and carries no message text.
  const log = lines.join('\n');
  assert.doesNotMatch(log, /Ada|Lovelace/);
  assert.ok(!log.includes(stored.body.slice(0, 30)));
});

test('test mode: no Send without the teacher\'s confirmation; a refusal gives the message back', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus();
  const result = await run(mathmaster, page, { confirmTest: async () => false, maxMessages: 1 });
  assert.equal(page.presses, 0);
  assert.equal(result.counts.released, 1);
  assert.equal(page.discarded, 1, 'the typed message is discarded, not left in the composer');
  assert.equal(messagesIn(db)[0].state, 'queued', 'back in the queue');
  assert.equal(contactsIn(db).length, 0);
});

test('when start is refused, Send is never pressed', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus();
  // The teacher cancels the message on the Discipline Tracker while it is
  // claimed and the composer is open.
  const result = await run({
    ...mathmaster,
    start: async (ids) => {
      await outbox.resolveFamilyMessage({ db, teacherEmail: TEACHER, messageId: ids.messageId, action: 'cancel', nowMs: at('09:05'), serverTimestamp });
      return mathmaster.start(ids);
    },
  }, page);
  assert.equal(page.presses, 0);
  assert.equal(result.counts.notStarted, 1);
  assert.equal(page.discarded, 1);
  assert.equal(messagesIn(db)[0].state, 'cancelled');
  assert.equal(contactsIn(db).length, 0);
});

test('the switch turned off while a message waits: no Send, and the run stops', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus();
  const result = await run(mathmaster, page, {
    confirmTest: async () => {
      db.store.set('disciplineStatus/familyMessaging', { mode: 'off', testDistrictIds: [] });
      return true;
    },
  });
  assert.equal(page.presses, 0);
  assert.equal(result.stopped, true);
  assert.match(result.reason, /switch is now off/);
});

for (const [name, roster, reason] of [
  ['no SchoolStatus student with that district ID', {}, /No SchoolStatus student/],
  ['the name SchoolStatus shows is another student', { 1500101: { name: 'Lovelace, Grace', guardians: 2 } }, /does not match/],
  ['no guardian with a contact method', { 1500101: { name: 'Ada Lovelace', guardians: 0 } }, /no guardian/],
]) {
  test(`${name}: failed, nothing typed, no Send`, async () => {
    const { db, mathmaster } = await setUp();
    const page = fakeSchoolStatus();
    page.roster = roster;
    const result = await run(mathmaster, page);
    assert.equal(result.counts.failed, 1);
    assert.equal(page.presses, 0);
    assert.deepEqual(page.typed, []);
    const [stored] = messagesIn(db);
    assert.equal(stored.state, 'failed');
    assert.match(stored.reason, reason);
  });
}

test('a body longer than SchoolStatus allows: failed with the limit, nothing typed', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus({ openComposer: async () => ({ ok: true, recipientCount: 2, channel: 'text', maxLength: 40 }) });
  await run(mathmaster, page);
  assert.equal(page.presses, 0);
  assert.deepEqual(page.typed, []);
  assert.match(messagesIn(db)[0].reason, /SchoolStatus allows 40/);
});

test('no confirmation after Send: unknown, and the next claim does not return it', async () => {
  const { db, clock, mathmaster } = await setUp();
  const page = fakeSchoolStatus({ confirmSent: async () => ({ seen: false }) });
  const result = await run(mathmaster, page);
  assert.equal(page.presses, 1);
  assert.equal(result.counts.unknown, 1);
  assert.equal(messagesIn(db)[0].state, 'unknown');
  assert.equal(contactsIn(db).length, 0, 'not logged as a contact: it may not have gone out');
  clock.now = at('10:30');
  assert.equal((await mathmaster.claim({ runnerId: RUNNER })).message, null, 'never handed out again by itself');
  const again = await run(mathmaster, fakeSchoolStatus());
  assert.equal(again.counts.sent + again.counts.unknown, 0);
});

test('the page fails right after Send: unknown, one press, and the run stops', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus({ pressSend: async () => { throw new Error('The SchoolStatus tab reloaded.'); } });
  const result = await run(mathmaster, page);
  assert.equal(page.presses, 1);
  assert.equal(result.stopped, true);
  assert.equal(messagesIn(db)[0].state, 'unknown');
});

test('signed out before a claim: the run stops and nothing is claimed', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus({ where: async () => { throw stopRun('SchoolStatus is signed out.'); } });
  const result = await run(mathmaster, page);
  assert.equal(result.stopped, true);
  assert.match(result.reason, /signed out/);
  assert.equal(page.presses, 0);
  assert.equal(messagesIn(db)[0].state, 'queued');
});

test('an unknown page after the claim: the run stops and the message is given back', async () => {
  const { db, mathmaster } = await setUp();
  const page = fakeSchoolStatus({ openComposer: async () => { throw stopRun('This SchoolStatus page is not one the extension knows.'); } });
  const result = await run(mathmaster, page);
  assert.equal(result.stopped, true);
  assert.equal(page.presses, 0);
  assert.equal(result.counts.released, 1);
  assert.equal(messagesIn(db)[0].state, 'queued');
});

test('Stop between confirming and starting: no Send, given back', async () => {
  const { db, mathmaster } = await setUp();
  let stop = false;
  const page = fakeSchoolStatus();
  const result = await run(mathmaster, page, { confirmTest: async () => { stop = true; return true; }, shouldStop: () => stop });
  assert.equal(page.presses, 0);
  assert.equal(result.stopped, true);
  assert.equal(messagesIn(db)[0].state, 'queued');
});

test('off: the run does nothing', async () => {
  const page = fakeSchoolStatus();
  const result = await run(mathmasterFor(world({ mode: null }), { now: at('09:05') }), page);
  assert.equal(result.stopped, true);
  assert.match(result.reason, /turned off/);
  assert.equal(page.presses, 0);
});

test('names match on first and last name, either order, ignoring case, spaces, accents and middle names', () => {
  assert.ok(sameStudentName('Ada Lovelace', 'Lovelace, Ada M'));
  assert.ok(sameStudentName('Ada Lovelace', '  ADA   lovelace '));
  assert.ok(sameStudentName('José Ortíz', 'Jose Maria Ortiz'));
  assert.ok(sameStudentName("D'Andre O'Neal", 'Dandre Oneal'));
  assert.equal(sameStudentName('Ada Lovelace', 'Ada Byron'), false);
  assert.equal(sameStudentName('Ada Lovelace', 'Grace Lovelace'), false);
  assert.equal(sameStudentName('Ada', 'Ada Lovelace'), false, 'one name is never enough');
});

test('the extension presses Send in exactly one place, right after a successful start', () => {
  const source = executableSource(readFileSync('extensions/schoolstatus-messages/lib/runner.js', 'utf8'));
  assert.equal(source.match(/\.pressSend\(/g)?.length, 1, 'one call to the page\'s Send');
  const once = source.slice(source.indexOf('const pressSendOnce = async'), source.indexOf('export const runFamilyMessages'));
  assert.match(once, /if \(!state\.started\) throw/);
  assert.match(once, /if \(state\.pressed\) throw/);
  assert.ok(once.indexOf('state.pressed = true;') < once.indexOf('await schoolstatus.pressSend();'), 'marked pressed before the press, so a throw mid-press is unknown');
  const loop = source.slice(source.indexOf('export const runFamilyMessages'));
  assert.equal(loop.match(/pressSendOnce\(/g)?.length, 1);
  const start = loop.indexOf('await mathmaster.start(ids);');
  const started = loop.indexOf('state.started = true;');
  const press = loop.indexOf('await pressSendOnce(schoolstatus, state);');
  assert.ok(start > 0 && start < started && started < press, 'start, then started, then the press');
  // A refused start continues past the press (no fallthrough into Send).
  const refused = loop.slice(start, started);
  assert.match(refused, /catch \(error\) \{[\s\S]*continue;\s*\}/);
});
