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
  formStateWords,
  newTapId,
  parentDrafts,
  recentViolationCount,
} from '../../src/platform/teacher/disciplineTrackerModel.js';
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
