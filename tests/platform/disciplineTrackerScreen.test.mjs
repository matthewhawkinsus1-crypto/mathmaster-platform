// The Discipline Tracker screen (components/teacher/DisciplineTracker.jsx).
// What it shows is the pure model (platform/teacher/disciplineTrackerModel.js),
// tested directly. The screen is .jsx, which node cannot render, so its
// wiring is pinned by region: where it lives, whose roster it shows, that a
// tap saves through the server and an undo never deletes, and that a family
// message logged here lands in Parent Contacts.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  contactForDay,
  dayIncidentsByStudent,
  daySummary,
  draftsWithFamilyMessages,
  familyMessageWords,
  formStateWords,
  newTapId,
  parentDrafts,
  recentViolationCount,
} from '../../src/platform/teacher/disciplineTrackerModel.js';
import { createFamilyMessageBridge, installFamilyMessageBridge } from '../../src/platform/teacher/familyMessageBridge.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const at = (hhmm, day = '2026-11-30') => Date.parse(`${day}T${hhmm}:00-06:00`);
const tap = (overrides = {}) => ({
  id: `t${Math.random()}`, classId: 'c1', studentId: 'u-ada', type: 'tardy', detail: '',
  occurredAtMs: at('08:05'), dateKey: '2026-11-30', form: { state: 'pending' }, ...overrides,
});

test('each tap says where it is with the district form', () => {
  assert.deepEqual(formStateWords(tap()), { label: 'Sends after class', tone: 'neutral' });
  assert.deepEqual(formStateWords(tap({ saving: true })), { label: 'Saving…', tone: 'neutral' });
  assert.deepEqual(formStateWords(tap({ form: { state: 'submitted' } })), { label: 'Sent to district form', tone: 'success' });
  assert.equal(formStateWords(tap({ form: { state: 'unknown' } })).tone, 'warning');
  assert.equal(formStateWords(tap({ form: { state: 'failed', reason: 'The form refused the response (400).' } })).label, 'Not sent: The form refused the response (400).');
  assert.equal(formStateWords(tap({ form: { state: 'testOnly' } })).label, 'Test student: not sent to the district form');
});

test('the day view: this class, this day, oldest first, undone taps gone', () => {
  const list = [
    tap({ id: 'b', occurredAtMs: at('08:40'), type: 'idViolation' }),
    tap({ id: 'a' }),
    tap({ id: 'x', voidedAtMs: at('08:06') }),
    tap({ id: 'other-class', classId: 'c2' }),
    tap({ id: 'other-day', dateKey: '2026-11-20' }),
    tap({ id: 'ben', studentId: 'u-ben', form: { state: 'submitted' } }),
    tap({ id: 'cal', studentId: 'u-cal', form: { state: 'unknown' } }),
  ];
  const day = dayIncidentsByStudent(list, { classId: 'c1', dateKey: '2026-11-30' });
  assert.deepEqual(day.get('u-ada').map((entry) => entry.id), ['a', 'b']);
  assert.deepEqual([...day.keys()], ['u-ada', 'u-ben', 'u-cal']);
  assert.deepEqual(daySummary([...day.values()].flat()), { total: 4, students: 3, waiting: 2, sent: 1, needsYou: 1 });
  assert.equal(recentViolationCount(list, 'u-ada', '2026-11-30'), 4, 'all classes, the last 10 school days, not undone');
});

test('a family contact logged the same day, after the violation, shows on the draft', () => {
  const contacts = [
    { studentId: 'u-ada', occurredAt: '2026-11-30T21:40:00Z', method: 'text' }, // 3:40 pm Central, same day
    { studentId: 'u-ada', occurredAt: '2026-11-29T21:40:00Z', method: 'phone' }, // the day before
    { studentId: 'u-ben', occurredAt: '2026-11-30T21:40:00Z', method: 'email' },
  ];
  assert.equal(contactForDay(contacts, { studentId: 'u-ada', dateKey: '2026-11-30', afterMs: at('08:05') }).method, 'text');
  assert.equal(contactForDay(contacts, { studentId: 'u-ada', dateKey: '2026-11-30', afterMs: at('16:00') }), null, 'a contact before the violation is not about it');
  const drafts = parentDrafts({
    incidents: [tap({ type: 'deviceCollected' }), tap({ studentId: 'u-ben' })],
    classId: 'c1', dateKey: '2026-11-30',
    studentsById: new Map([['u-ada', { firstName: 'Ada', lastName: 'Lovelace' }], ['u-ben', { firstName: 'Ben', lastName: 'Ortiz' }]]),
    teacherName: 'Mr. Hawkins', classLabel: 'Algebra I', contacts,
  });
  assert.deepEqual(drafts.map((draft) => [draft.studentId, draft.contactCategory, draft.contacted?.method || null]), [
    ['u-ada', 'cellphone', 'text'], ['u-ben', 'behavior', 'email'],
  ]);
  assert.match(drafts[0].message.body, /Ada had an electronic device collected during class at 8:05 AM\./);
});

test('a tap id is one the server accepts', () => {
  const ids = new Set(Array.from({ length: 50 }, newTapId));
  assert.equal(ids.size, 50);
  ids.forEach((id) => assert.match(id, /^[A-Za-z0-9_-]{8,64}$/));
});

const screen = () => executableSource(componentSource('src/components/teacher/DisciplineTracker.jsx'));

test('it sits with Student Support, has an address, and reads Parent Contacts', () => {
  const sidebar = readFileSync('src/TeacherSidebar.jsx', 'utf8');
  assert.match(sidebar, /\{ id: 'support', label: 'Student Support', tabs: \[[^\]]*'discipline'[^\]]*\] \}/);
  assert.match(readFileSync('src/app/routes/appUrl.js', 'utf8'), /'parentContacts', 'discipline',/);
  assert.match(readFileSync('src/app/screenScopes.js', 'utf8'), /TEACHER_PARENT_CONTACT_STREAM_TABS = new Set\(\[[^\]]*'discipline'/);
  const workspace = executableSource(readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8'));
  const rendered = region(workspace, "{teacherTab === 'discipline' && (", '/>', 'the tracker element');
  assert.match(rendered, /students=\{allStudents\}/);
  assert.match(rendered, /contacts=\{parentContacts\}/);
  assert.match(rendered, /onRecordContact=\{\(contact\) => recordParentContact\(\{ db, teacherEmail: user\.email, contact \}\)\}/);
});

test('it shows only the teacher\'s own classes, and only students on that class\'s roster', () => {
  const source = screen();
  assert.match(source, /authorizedGradeTransferClasses\(\{ classes, teacherEmail, isRootAdmin \}\)/);
  assert.match(source, /gradeTransferRoster\(\{ students, classes: myClasses, classId \}\)/, 'membership fails closed, as on the server');
  assert.match(source, /\.sort\(compareStudentsByName\)/, 'alphabetical, like attendance');
});

test('a tap saves through the server, once; buttons are for today only; an undo never deletes', () => {
  const source = screen();
  const tapHandler = region(source, 'const tap = async (student, type) => {', 'const undo = async', 'tap');
  assert.match(tapHandler, /const tapId = newTapId\(\);/);
  assert.match(tapHandler, /await recordDisciplineIncident\(\{ classId, studentId: student\.id, type, tapId \}\)/);
  assert.match(tapHandler, /setIncidents\(\(current\) => current\.filter\(\(entry\) => entry\.id !== placeholder\.id\)\)/, 'a failed save is taken back off the screen');
  assert.match(region(source, '{isToday && (', 'role="group"', 'the buttons'), /tw-discipline-row__buttons/);
  assert.match(region(source, 'const undo = async (incident) => {', 'const setDetail', 'undo'), /await voidDisciplineIncident\(\{ incidentId: incident\.id \}\)/);
  assert.doesNotMatch(source, /deleteDoc|\.delete\(/);
});

test('a family message logged here is a Parent Contacts record; the principal report opens in Outlook', () => {
  const source = screen();
  const log = region(source, 'const logSent = async (draft, method) => {', 'const report = useMemo', 'logSent');
  assert.match(log, /await onRecordContact\(\{/);
  assert.match(log, /category: draft\.contactCategory,/);
  assert.match(log, /outcome: 'Discipline message sent',/);
  assert.match(source, /href=\{outlookComposeUrl\(\{ to: settings\.principalEmail, subject: report\.subject, body: report\.body \}\)\}/);
  assert.match(source, /repeatOffenders\(\{ incidents, asOfDateKey: dateKey \}\)/);
});

/* ------------------------------------------------------------ Send to families */

const ADA = { id: 'u-ada', firstName: 'Ada', lastName: 'Lovelace', sisStudentId: '1500101' };
const BEN = { id: 'u-ben', firstName: 'Ben', lastName: 'Ortiz', sisStudentId: '1500102' };
const familyDrafts = (incidents, messages = [], messaging = { mode: 'test', testDistrictIds: ['1500101'] }) => draftsWithFamilyMessages({
  drafts: parentDrafts({ incidents, classId: 'c1', dateKey: '2026-11-30', studentsById: new Map([['u-ada', ADA], ['u-ben', BEN]]), teacherName: 'Mr. Hawkins', classLabel: 'Algebra I' }),
  messages, messaging, classId: 'c1', dateKey: '2026-11-30', teacherName: 'Mr. Hawkins', classLabel: 'Algebra I',
});
const kept = (overrides = {}) => ({ id: 'm1', messageKey: 'c1|2026-11-30|u-ada', sequence: 1, incidentIds: ['a'], state: 'queued', mode: 'test', subject: 's', body: 'b', ...overrides });

test('each family message says where it is', () => {
  assert.equal(familyMessageWords(null).label, 'Draft');
  assert.match(familyMessageWords(kept()).label, /^Queued \(test\): goes out when the SchoolStatus extension runs/);
  assert.equal(familyMessageWords(kept({ state: 'sent', mode: 'live', sentAtMs: at('09:12') })).label, 'Sent through SchoolStatus 9:12 AM');
  assert.equal(familyMessageWords(kept({ state: 'unknown' })).tone, 'warning');
  assert.equal(familyMessageWords(kept({ state: 'failed', reason: 'No student with that district ID in SchoolStatus' })).label, 'Not sent: No student with that district ID in SchoolStatus');
});

test('a draft can be sent only under the switch, once, and a later violation becomes a follow-up', () => {
  const taps = [tap({ id: 'a' }), tap({ id: 'b', studentId: 'u-ben' })];
  // Off: nothing can be sent.
  const off = familyDrafts(taps, [], { mode: 'off' });
  assert.deepEqual(off.map((draft) => draft.canQueue), [false, false]);
  assert.match(off[0].blockedReason, /not turned on/);
  // Test: only the test student.
  const testMode = familyDrafts(taps);
  assert.deepEqual(testMode.map((draft) => [draft.studentId, draft.canQueue]), [['u-ada', true], ['u-ben', false]]);
  assert.match(testMode[1].blockedReason, /Test mode/);
  assert.equal(testMode[0].shownMessage.body, testMode[0].message.body, 'the text shown is the text that will be sent');
  // Queued: not queued twice, and it can be cancelled.
  const queued = familyDrafts(taps, [kept()]);
  assert.equal(queued[0].canQueue, false);
  assert.deepEqual(queued[0].cancellable.map((message) => message.id), ['m1']);
  // Sent: the sent text is shown and nothing more goes out...
  const sent = familyDrafts(taps, [kept({ state: 'sent', body: 'what went out' })]);
  assert.equal(sent[0].canQueue, false);
  assert.equal(sent[0].shownMessage.body, 'what went out');
  // ...until a later violation, which is a follow-up about only that one.
  const later = familyDrafts([...taps, tap({ id: 'c', type: 'deviceCollected', occurredAtMs: at('10:00') })], [kept({ state: 'sent' })]);
  assert.equal(later[0].canQueue, true);
  assert.equal(later[0].followUp, true);
  assert.match(later[0].shownMessage.body, /electronic device collected during class at 10:00 AM/);
  assert.doesNotMatch(later[0].shownMessage.body, /arrived late/);
  // Possibly sent: the teacher decides.
  assert.deepEqual(familyDrafts(taps, [kept({ state: 'unknown' })])[0].needsDecision.map((message) => message.id), ['m1']);
  assert.equal(familyDrafts(taps, [kept({ state: 'unknown' })])[0].canQueue, false);
});

test('the extension\'s bridge passes on only the protocol\'s fields, and the screen catches up after each call', async () => {
  const calls = [];
  let changes = 0;
  const bridge = createFamilyMessageBridge({ api: { familyMessageOutbox: async (payload) => { calls.push(payload); return { ok: true }; } }, onChange: () => { changes += 1; } });
  assert.equal(bridge.version, 1);
  await bridge.claim({ runnerId: 'ext-runner-a', teacherEmail: 'someone@else.org' });
  await bridge.start({ runnerId: 'ext-runner-a', messageId: 'm1', attemptId: 'attempt-1', body: 'injected' });
  await bridge.report({ runnerId: 'ext-runner-a', messageId: 'm1', attemptId: 'attempt-1', outcome: 'sent', confirmation: { recipientCount: 2, channel: 'text', guardianPhone: '555' } });
  assert.deepEqual(calls, [
    { action: 'claim', runnerId: 'ext-runner-a' },
    { action: 'start', runnerId: 'ext-runner-a', messageId: 'm1', attemptId: 'attempt-1' },
    { action: 'report', runnerId: 'ext-runner-a', messageId: 'm1', attemptId: 'attempt-1', outcome: 'sent', reason: '', confirmation: { recipientCount: 2, channel: 'text', note: '' } },
  ]);
  assert.equal(changes, 3);
  await bridge.status();
  assert.equal(changes, 3, 'asking for the status does not reload the screen');
  const target = {};
  const undo = installFamilyMessageBridge(bridge, target);
  assert.equal(target.mathmasterFamilyMessages, bridge);
  undo();
  assert.equal('mathmasterFamilyMessages' in target, false);
});

test('Send to families queues through the server, only for the class\'s own teacher, and the switch is the administrator\'s', () => {
  const source = screen();
  const send = region(source, 'const sendToFamilies = async (studentIds = null) => {', 'const resolveMessage', 'sendToFamilies');
  assert.match(send, /await queueFamilyMessages\(\{ classId, dateKey, studentIds \}\)/);
  assert.match(source, /\{messaging\.mode !== 'off' && isClassTeacher && \(\s*<div className="tw-row">\s*<button[^>]*onClick=\{\(\) => sendToFamilies\(\)\}/);
  assert.match(source, /\{messaging\.mode !== 'off' && isClassTeacher && draft\.canQueue && \(/);
  assert.match(source, /\{isRootAdmin && \(\s*<div className="tw-card tw-card--muted tw-stack"[^>]*data-family-switch>/);
  assert.match(region(source, 'const saveSwitch = async () => {', 'if (!myClasses.length)', 'saveSwitch'), /switchDraft\.mode === 'live' && !window\.confirm\(/);
  // The extension works through this screen while it is open, and the bridge goes when it closes.
  const bridge = region(source, "import('../../platform/teacher/familyMessageBridge.js')", 'const activeClass', 'bridge');
  assert.match(bridge, /installFamilyMessageBridge\(createFamilyMessageBridge\(\{ onChange: \(\) => loadRef\.current\(\) \}\)\)/);
  assert.match(bridge, /return \(\) => \{ closed = true; undo\(\); \};/);
});
