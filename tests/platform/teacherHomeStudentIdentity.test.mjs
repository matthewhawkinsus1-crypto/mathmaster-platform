/*
 * A STUDENT'S ID IS NEVER THEIR NAME ON A TEACHER SCREEN.
 *
 * PR #314 moved Home, Classes, Attendance, Classroom and Live onto the compact
 * roster from listSignInAccess. Its grades projection dropped googleName — the
 * ONLY name Classroom-linked legacy students had — the client normaliser
 * dropped it a second time, and Live View's formatter was told to "fall back
 * to the id". Teachers saw '101410' on Live tiles, Watch Practice, Integrity
 * Review, the Class Points dialog and Path toasts, and several of those paths
 * wrote the id into studentSupportEvents as the student's name.
 *
 * These tests run the real chain end to end, on synthetic records:
 *
 *   grades doc -> buildTeacherRosterSummaryRow (server projection)
 *              -> normalizeTeacherRosterSummary (client roster)
 *              -> Live / Walkthrough / Attendance / Action Center / support
 *
 * and assert three things everywhere: a student with a name on file is shown
 * by that name; a student without one is "Name unavailable" with the id shown
 * separately and labelled ("ID 101410"); and a record a teacher action writes
 * carries a real name or null — never the id, never the placeholder.
 *
 * All names here are invented.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildTeacherRosterSummaryRow } from '../../functions/shared/studentIdentity.mjs';
import {
  normalizeTeacherRosterSummary,
  rosterStudentLabel,
  rosterStudentNameForStorage,
} from '../../src/platform/teacher/teacherRosterSummary.js';
import {
  STUDENT_NAME_UNAVAILABLE,
  STUDENT_SELF_NEUTRAL_LABEL,
  buildStudentIdentityIndex,
  resolveStudentDisplayName,
} from '../../src/platform/studentName.js';
import { classifyLiveStudent, summarizeLiveClass } from '../../src/livePresence.js';
import { buildWalkthroughMonitor } from '../../src/platform/teacher/walkthroughMonitor.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  buildParentFollowUpCandidates,
  buildWatchPracticeList,
} from '../../src/platform/teacher/studentSupportSignals.js';
import { LIVE_ATTENDANCE_EVENT_KIND, buildLiveAttendanceEvent } from '../../src/platform/teacher/liveAttendance.js';
import { buildAttendanceHistoryEvent } from '../../src/platform/attendance/attendanceHistory.js';
import {
  buildAttendanceCorrectionReviewEvent,
  buildReturnCheckInEvent,
  resolveReturnCheckIns,
} from '../../src/platform/attendance/returnCheckIn.js';
import { buildTeacherActionItems } from '../../src/platform/teacher/teacherActionCenter.js';
import { buildNeedsAttentionQueue } from '../../src/platform/teacher/needsAttention.js';
import { publicStudentLabel } from '../../src/platform/liveSpotlight.js';
import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE } from '../../src/assignmentLifecycle.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// --- the roster, as the server's grades documents hold it -------------------

const CLASS_ID = 'class-identity';
const PERIOD = 'Period 3';
const base = { classId: CLASS_ID, classPeriod: PERIOD, assignedTeacherEmail: 'teacher@example.test' };

const GRADES_DOCS = {
  // Structured name: the ordinary case.
  201001: { ...base, firstName: 'Rowan', lastName: 'Exampleton', displayName: 'Rowan Exampleton' },
  // A Classroom-linked legacy student: googleName is the ONLY name on file.
  201002: { ...base, googleName: 'Quinn Samplewood', gradesByAssignment: { a1: { 0: { status: 'correct' } } } },
  // Created nameless (ensureStudentRecord / optional-name account creation).
  101410: { ...base },
  // A legacy writer stored the id itself as the display name.
  201004: { ...base, displayName: '201004' },
  // Two different students who share a full name. Never merged.
  201005: { ...base, firstName: 'Avery', lastName: 'Fixturely' },
  201006: { ...base, firstName: 'Avery', lastName: 'Fixturely' },
};

const SERVER_ROWS = Object.entries(GRADES_DOCS).map(([id, data]) => buildTeacherRosterSummaryRow(id, data));
const ROSTER = SERVER_ROWS.map(normalizeTeacherRosterSummary);
const byId = (rows, id) => rows.find((row) => String(row.id ?? row.studentId) === id);
const NAMELESS = ['101410', '201004'];
const ALL_IDS = Object.keys(GRADES_DOCS);

const NOW = Date.parse('2026-09-02T14:00:00.000Z');
const liveStatus = (overrides = {}) => ({
  assignmentId: 'a1', assignmentTitle: 'Linear functions', activityRole: 'classwork',
  questionIndex: 0, sectionQuestionIndex: 0, questionCount: 5, questionStates: 'a....',
  currentAttempts: 3, updatedAt: NOW - 1000, lastInteractionAt: NOW - 1000, startedAt: NOW - 600000,
  pageVisible: true, ...overrides,
});
const MONITORED = ROSTER.map((student) => ({ ...student, liveStatus: liveStatus() }));

const assertNeverAnId = (text, id, where) => {
  assert.notEqual(String(text ?? '').trim(), id, `${where}: the id ${id} was used as a name`);
  assert.doesNotMatch(String(text ?? ''), /^\s*\d+\s*$/, `${where}: a bare number was used as a name`);
};

// --- 1. the compact roster keeps every name the student has -----------------

test('the server projection and the client roster keep a Classroom-only name, and drop attempt history', () => {
  const google = byId(ROSTER, '201002');
  assert.equal(google.displayName, 'Quinn Samplewood');
  assert.equal(google.nameSource, 'googleName', 'the server diagnosis of where the name came from survives the client');
  assert.equal(google.nameMissing, false);
  assert.equal(google.firstName, null, 'a single full name is not guessed into parts');
  assert.equal('gradesByAssignment' in google, false);
  assert.equal('googleName' in google, false, 'the client keeps the resolved name, not every raw field');

  const structured = byId(ROSTER, '201001');
  assert.deepEqual([structured.firstName, structured.lastName, structured.nameMissing], ['Rowan', 'Exampleton', false]);

  for (const id of NAMELESS) {
    const row = byId(ROSTER, id);
    assert.equal(row.displayName, null, `${id}: no name on file means no display name, not the id`);
    assert.equal(row.nameMissing, true);
    assert.equal(row.nameSource, null);
  }
  assert.deepEqual(ROSTER.map((row) => row.id), ALL_IDS, 'duplicate full names stay separate students');
});

test('the client roster resolves a row from an older server that still sends raw legacy fields', () => {
  const raw = normalizeTeacherRosterSummary({ studentId: '201002', googleName: 'Quinn Samplewood', classId: CLASS_ID });
  assert.equal(raw.displayName, 'Quinn Samplewood');
  assert.equal(raw.nameMissing, false);
  const legacy = normalizeTeacherRosterSummary({ studentId: '201007', studentName: 'Morgan Testwell' });
  assert.equal(legacy.displayName, 'Morgan Testwell');
  const idOnly = normalizeTeacherRosterSummary({ studentId: '201008', displayName: '201008', name: 'ID 201008' });
  assert.equal(idOnly.displayName, null);
  assert.equal(idOnly.nameMissing, true);
});

// --- 2. Live View, Walkthrough -----------------------------------------------

test('Live tiles show the name, or "Name unavailable" with the id carried separately as a label', () => {
  for (const student of MONITORED) {
    const row = classifyLiveStudent(student, { nowValue: NOW });
    assertNeverAnId(row.name, student.id, `live tile ${student.id}`);
    assert.equal(row.idLabel, `ID ${student.id}`);
  }
  assert.equal(classifyLiveStudent(byId(MONITORED, '201002'), { nowValue: NOW }).name, 'Quinn Samplewood');
  assert.equal(classifyLiveStudent(byId(MONITORED, '201001'), { nowValue: NOW }).name, 'Rowan Exampleton');
  const nameless = classifyLiveStudent(byId(MONITORED, '101410'), { nowValue: NOW });
  assert.equal(nameless.name, STUDENT_NAME_UNAVAILABLE);
  assert.equal(nameless.nameMissing, true);
  assert.equal(nameless.idLabel, 'ID 101410');
});

test('the Live class summary keeps duplicate names apart and lists students without a name after named ones', () => {
  const { rows } = summarizeLiveClass(MONITORED, { nowValue: NOW });
  assert.equal(rows.length, ALL_IDS.length);
  const avery = rows.filter((row) => row.name === 'Avery Fixturely');
  assert.deepEqual(avery.map((row) => row.id).sort(), ['201005', '201006']);
  const severities = new Set(rows.map((row) => row.severity));
  assert.equal(severities.size, 1, 'fixture: every row has the same severity, so name order is what is compared');
  const firstNameless = rows.findIndex((row) => row.nameMissing);
  assert.ok(rows.slice(firstNameless).every((row) => row.nameMissing), 'named students first, then the unnamed');
  assert.deepEqual(rows.slice(firstNameless).map((row) => row.id), ['101410', '201004']);
});

test('Walkthrough cards name students the same way', () => {
  const walkthrough = buildWalkthroughMonitor({
    students: MONITORED.map((student) => ({ ...student, liveStatus: liveStatus({ sectionQuestionIndex: 0 }) })),
    assignmentId: 'a1', teacherQuestionIndex: 2, nowValue: NOW,
  });
  for (const row of walkthrough.all) assertNeverAnId(row.name, row.id, `walkthrough ${row.id}`);
  const nameless = walkthrough.all.find((row) => row.id === '101410');
  assert.deepEqual([nameless.name, nameless.nameMissing, nameless.idLabel], [STUDENT_NAME_UNAVAILABLE, true, 'ID 101410']);
  assert.equal(walkthrough.all.find((row) => row.id === '201002').name, 'Quinn Samplewood');
});

test('the projected Spotlight label is "First L." or the neutral "Student" — never an id or the teacher diagnostic', () => {
  assert.equal(publicStudentLabel(byId(ROSTER, '201002')), 'Quinn S.');
  assert.equal(publicStudentLabel(byId(ROSTER, '101410')), STUDENT_SELF_NEUTRAL_LABEL);
  assert.equal(publicStudentLabel({ studentId: '201004', ...GRADES_DOCS[201004] }), STUDENT_SELF_NEUTRAL_LABEL, 'an id stored as the display name is not a name');
});

// --- 3. what teacher actions persist -----------------------------------------

test('Watch Practice entries persist a real name or null, and are named from the roster for display', () => {
  const { rows } = summarizeLiveClass(MONITORED, { nowValue: NOW });
  const watch = buildWatchPracticeList({ rows, nowValue: NOW, maxStudents: 10 });
  assert.equal(watch.length, ALL_IDS.length, 'fixture: every student is stuck, so every student is listed');
  for (const entry of watch) {
    if (NAMELESS.includes(entry.studentId)) assert.equal(entry.studentName, null, `${entry.studentId} stores no name`);
    else assertNeverAnId(entry.studentName, entry.studentId, 'watch entry');
    assert.notEqual(entry.studentName, STUDENT_NAME_UNAVAILABLE, 'the display placeholder is never stored');
  }
  assert.equal(watch.find((entry) => entry.studentId === '201002').studentName, 'Quinn Samplewood');
});

test('parent follow-up candidates never adopt the id an old event stored as a name', () => {
  const event = (studentId, studentName, id) => ({
    id, kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP, stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
    studentId, studentName, createdAt: new Date(NOW - 3600000).toISOString(),
  });
  const candidates = buildParentFollowUpCandidates({
    supportEvents: [event('101410', '101410', 'e1'), event('201002', 'Quinn Samplewood', 'e2')], nowValue: NOW,
  });
  assert.equal(candidates.find((entry) => entry.studentId === '101410').studentName, null);
  assert.equal(candidates.find((entry) => entry.studentId === '201002').studentName, 'Quinn Samplewood');
});

test('attendance events store a real name or null, and their sentences never embed an id', () => {
  for (const id of ALL_IDS) {
    const student = byId(ROSTER, id);
    const live = buildLiveAttendanceEvent({ student, mark: 'present', classId: CLASS_ID, nowValue: NOW, dateKey: '2026-09-02' });
    const history = buildAttendanceHistoryEvent({ student, mark: 'excused', classId: CLASS_ID, dateKey: '2026-09-01', nowValue: NOW });
    for (const event of [live, history]) {
      if (NAMELESS.includes(id)) assert.equal(event.studentName, null, `${id} ${event.kind}`);
      else assertNeverAnId(event.studentName, id, event.kind);
      assert.doesNotMatch(event.summary, new RegExp(`\\b${id}\\b`));
    }
  }
  assert.equal(buildLiveAttendanceEvent({ student: byId(ROSTER, '201002'), mark: 'late', nowValue: NOW }).studentName, 'Quinn Samplewood');

  const review = buildAttendanceCorrectionReviewEvent({
    studentId: '101410', studentName: '101410', assignmentId: 'a1', classId: CLASS_ID,
    existing: { dateKey: '2026-09-05' }, proposed: { dateKey: '2026-09-04' }, resolution: 'kept', nowValue: NOW,
  });
  assert.equal(review.studentName, null);
  assert.match(review.summary, /for the student after/);
  assert.doesNotMatch(review.summary, /101410/);
});

test('a return check-in names the student for display, and stores a real name or null', () => {
  const period = (enabled) => ({ enabled, start: '09:00', end: '09:50' });
  const schedule = normalizeSchedule({
    ...DEFAULT_CLASS_SCHEDULE,
    daySchedules: { A: { periods: { [PERIOD]: period(true) } }, B: { periods: { [PERIOD]: period(false) } } },
  });
  const mark = (studentId, dateKey, attendanceMark) => ({
    kind: LIVE_ATTENDANCE_EVENT_KIND, studentId, classId: CLASS_ID, createdAt: `${dateKey}T09:00:00.000Z`,
    evidence: { dateKey, attendanceMark },
  });
  const supportEvents = ['101410', '201002'].flatMap((id) => [mark(id, '2026-08-31', 'absent'), mark(id, '2026-09-02', 'present')]);
  const candidates = resolveReturnCheckIns({
    roster: ROSTER, supportEvents, classId: CLASS_ID, classPeriod: PERIOD, schedule, todayDateKey: '2026-09-02',
  });
  const nameless = candidates.find((entry) => entry.studentId === '101410');
  const google = candidates.find((entry) => entry.studentId === '201002');
  assert.equal(nameless.studentName, null);
  assert.equal(nameless.studentLabel, 'Name unavailable · ID 101410');
  assert.equal(google.studentName, 'Quinn Samplewood');
  assert.equal(google.studentLabel, 'Quinn Samplewood');

  const event = buildReturnCheckInEvent({ candidate: nameless, actorEmail: 'teacher@example.test', nowValue: NOW });
  assert.equal(event.studentName, null);
  assert.match(event.summary, /checked in with the student after/);
  assert.doesNotMatch(event.summary, /101410/);
});

// --- 4. naming a student from a stored id -----------------------------------

test('the teacher identity index names a stored id from the roster, never from the id', () => {
  const index = buildStudentIdentityIndex(ROSTER);
  assert.equal(rosterStudentLabel({ studentId: '201002', index, historicalName: '201002' }), 'Quinn Samplewood');
  assert.equal(rosterStudentLabel({ studentId: '101410', index, historicalName: '101410' }), 'Name unavailable · ID 101410');
  assert.equal(rosterStudentNameForStorage({ studentId: '101410', index, historicalName: '101410' }), null);
  assert.equal(rosterStudentNameForStorage({ studentId: '101410', index, historicalName: STUDENT_NAME_UNAVAILABLE }), null);
  assert.equal(rosterStudentNameForStorage({ studentId: '201002', index, historicalName: 'Old Copy' }), 'Quinn Samplewood',
    'the current roster name wins over a stored copy');
  assert.equal(rosterStudentNameForStorage({ studentId: '209999', index, historicalName: 'Harper Mockridge' }), 'Harper Mockridge',
    'a student no longer on this roster keeps a stored copy that is really a name');
});

test('Action Center rows resolve from the roster — Google and legacy names count; a missing name is explicit', () => {
  const items = buildTeacherActionItems({
    students: ROSTER,
    classes: [{ classId: CLASS_ID, name: 'Algebra I', period: PERIOD }],
    supportEvents: [
      { id: 'p1', kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP, stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED, studentId: '101410', studentName: '101410', classId: CLASS_ID, createdAt: '2026-09-01T10:00:00Z' },
      { id: 'p2', kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP, stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED, studentId: '201002', classId: CLASS_ID, createdAt: '2026-09-01T10:00:00Z' },
    ],
    // A retest row from the Test Cycle projection carries no studentName.
    retestRecoveryActions: [{ id: 'r1', studentId: '201001', classId: CLASS_ID, actionRequired: true }],
    now: NOW,
  });
  const nameOf = (studentId) => items.find((item) => item.studentId === studentId).studentName;
  assert.equal(nameOf('201002'), 'Quinn Samplewood');
  assert.equal(nameOf('201001'), 'Rowan Exampleton');
  assert.equal(nameOf('101410'), STUDENT_NAME_UNAVAILABLE);
  for (const item of items) assertNeverAnId(item.studentName, item.studentId, `action ${item.id}`);
});

test('a Needs Attention sentence never makes a placeholder or an id its subject', () => {
  const profile = { baseline: { established: true, events: 40 }, foundationGapDepth: 3, skillsWithEvidence: 6 };
  const queue = buildNeedsAttentionQueue({
    students: [byId(ROSTER, '101410'), byId(ROSTER, '201002')],
    profilesByStudentId: { 101410: profile, 201002: profile },
  });
  const nameless = queue.find((alert) => alert.studentId === '101410');
  assert.equal(nameless.studentName, STUDENT_NAME_UNAVAILABLE);
  assert.match(nameless.detail, /^This student has confirmed gaps/);
  assert.doesNotMatch(nameless.detail, /101410|Name unavailable/);
  assert.match(queue.find((alert) => alert.studentId === '201002').detail, /^Quinn Samplewood has confirmed gaps/);
});

test("a passcode session's id is never the student's own name", () => {
  assert.equal(resolveStudentDisplayName({ rosterStudent: {}, sessionDisplayName: '101410', studentId: '101410' }), STUDENT_SELF_NEUTRAL_LABEL);
  assert.equal(resolveStudentDisplayName({ rosterStudent: { googleName: 'Quinn Samplewood' }, sessionDisplayName: '201002', studentId: '201002' }), 'Quinn Samplewood');
});

// --- 5. the wiring node cannot import ----------------------------------------

const app = read('src/App.jsx');
const appCode = executableSource(app);

test('App.jsx resolves the compact roster with the importable normaliser, imported where it is called', () => {
  assert.match(app, /import \{[^}]*\bnormalizeTeacherRosterSummary\b[^}]*\} from '\.\/platform\/teacher\/teacherRosterSummary\.js';/);
  const fetch = region(app, 'const fetchTeacherRosterSummaries = async () => {', 'setTeacherRosterSummaries(summaries);', 'roster fetch');
  assert.match(fetch, /\.map\(normalizeTeacherRosterSummary\)/);
  assert.doesNotMatch(appCode, /const normalizeTeacherRosterSummary\s*=/, 'no second, local allow-list of name fields');
});

test('App.jsx builds the teacher identity index from the compact roster only, imported where it is called', () => {
  assert.match(app, /import \{[^}]*\bbuildStudentIdentityIndex\b[^}]*\} from '\.\/platform\/studentName';/);
  assert.match(
    app,
    /const teacherStudentIdentityIndex = useMemo\(\s*\(\) => buildStudentIdentityIndex\(teacherRosterSummaries\),\s*\[teacherRosterSummaries\],\s*\);/,
    'the index is rebuilt only when the roster is refetched — never per render, never from full grades documents',
  );
});

test('App.jsx names a Path recommendation from the roster and stores a real name or null', () => {
  assert.match(app, /import \{[^}]*\brosterStudentLabel\b[^}]*\brosterStudentNameForStorage\b[^}]*\} from '\.\/platform\/teacher\/teacherRosterSummary\.js';/);
  const handler = executableSource(region(app, 'const handlePersonalPathRecommendation = async', '// A student\'s own individualized', 'Path recommendation handler'));
  assert.match(handler, /rosterStudentLabel\(\{ studentId: id, index: teacherStudentIdentityIndex, historicalName: studentName \}\)/);
  assert.match(handler, /rosterStudentNameForStorage\(\{ studentId: id, index: teacherStudentIdentityIndex, historicalName: studentName \}\)/);
  assert.match(handler, /studentName: storedStudentName,/);
  assert.doesNotMatch(handler, /studentName \|\| id\b/);
});

test('attendance correction reviews in App.jsx store the roster name or null', () => {
  const keep = executableSource(region(app, 'const handleKeepAttendanceExtension = async', 'const handleApplyShorterAttendanceExtension', 'keep extension'));
  const shorten = executableSource(region(app, 'const handleApplyShorterAttendanceExtension = async', 'await applyStudentAttendanceExtension(', 'shorten extension'));
  for (const handler of [keep, shorten]) {
    assert.match(handler, /studentName: rosterStudentNameForStorage\(\{/);
    assert.doesNotMatch(handler, /student\.displayName \|\| student\.name/);
  }
});

test("a student's presence carries their roster name or null, and their session never takes the id as a name", () => {
  const presence = region(app, 'const payload = {\n      studentId: user.id,', 'classId: user.classId', 'presence payload');
  assert.match(presence, /name: formatStudentName\(user, \{ lastFirst: false, fallbackToNeutral: false \}\) \|\| null,/);
  const auth = executableSource(read('src/auth/AuthProvider.jsx'));
  assert.match(auth, /import \{ acceptStudentName \} from '\.\.\/platform\/studentName\.js';/);
  assert.match(auth, /claims\.role === 'student'[\s\S]*?return acceptStudentName\(firebaseUser\.displayName, \{ studentId: claims\.studentId \}\) \|\| null;/);
  assert.doesNotMatch(auth, /displayName \|\| claims\.studentId/);
});

test('a corrected name in Sign-In Access refetches the compact roster', () => {
  const renders = [...app.matchAll(/<SignInAccess\b[^>]*\/>/g)].map(([element]) => element);
  assert.equal(renders.length, 2);
  for (const element of renders) assert.match(element, /onStudentIdentityChanged=\{refreshTeacherRosterAfterNameChange\}/);
  assert.match(app, /const refreshTeacherRosterAfterNameChange = \(\) => fetchTeacherRosterSummaries\(\)\s*\.catch\(/);
});

test('the identity fix adds no full-grades tab and leaves the full-grades listener as it was', () => {
  // Declared in app/screenScopes.js since the App split.
  const tabs = region(readFileSync(new URL('../../src/app/screenScopes.js', import.meta.url), 'utf8'), 'export const TEACHER_FULL_STUDENT_DATA_TABS = new Set([', ']);', 'full student data tabs');
  assert.match(app, /\bTEACHER_FULL_STUDENT_DATA_TABS,\n[\s\S]*?\} from '\.\/app\/screenScopes\.js';/);
  assert.doesNotMatch(app, /const TEACHER_FULL_STUDENT_DATA_TABS\b/);
  assert.deepEqual(
    [...tabs.matchAll(/'([A-Za-z]+)'/g)].map(([, tab]) => tab),
    ['students', 'weeklyPath', 'actionCenter', 'parentContacts', 'grades', 'gradeTransfer', 'standards', 'analytics', 'exams'],
  );
  assert.match(app, /\}, \[\s*user\?\.role, user\?\.email, user\?\.isRootAdmin, teacherTab, teacherWorkspaceMode,\s*teacherPreviewRuntimeActive, teacherRosterSummaries,\s*\]\);/);
});

test('Live View never asks for an id as a name, and never shows one to the class', () => {
  assert.doesNotMatch(executableSource(read('src/livePresence.js')), /fallbackToId/);
  const monitor = read('src/components/teacher/LiveClassMonitor.jsx');
  const tile = region(monitor, 'function StudentTile(', 'function withClassworkStates(', 'Live tile');
  // The id line is the teacher's; large room tiles (what goes on the
  // projector) never get it, nor does the class-points panel beside them.
  assert.match(tile, /\{row\.nameMissing && showStudentId && row\.idLabel && \(/);
  assert.match(monitor, /const projecting = mode === 'room' && roomMode;/);
  assert.match(monitor, /showStudentId=\{!projecting\}/);
  assert.doesNotMatch(monitor, /showStudentId=\{true\}|showStudentId=\{mode/);
  assert.match(monitor, /<ClassPointsHistoryPanel [^>]*showStudentId=\{!projecting\}/);
  assert.match(tile, /aria-label=\{`\$\{tileLabel\}: \$\{row\.headline\}`\}/);
  assert.match(tile, /const tileLabel = formatStudentLabel\(/);
  // A public Spotlight label comes from the roster record, never the live row.
  const spotlight = region(monitor, 'const requestSpotlight = async (row) => {', 'const stopSpotlight', 'Spotlight request');
  assert.doesNotMatch(executableSource(spotlight), /\|\|\s*row\s*;/);
  // Support events and Path recommendations get no name when none is on file.
  assert.match(monitor, /studentName: row\.nameMissing \? null : row\.name,/);
  assert.match(monitor, /onRecommendPersonalPath\(\{ studentId: row\.id, studentName: row\.nameMissing \? null : row\.name,/);
});

test('the support store refuses to persist an id or a placeholder as a name', () => {
  const store = executableSource(read('src/platform/teacher/studentSupportStore.js'));
  assert.match(store, /studentName: acceptStudentName\(event\.studentName, \{ studentId \}\) \|\| null,/);
  assert.doesNotMatch(store, /studentName\) \|\| studentId/);
  const dashboard = read('src/components/teacher/StudentSupportDashboard.jsx');
  const record = region(dashboard, 'const record = (event) => onRecordEvent?.({', '});', 'dashboard record');
  assert.match(record, /studentName: rosterStudentNameForStorage\(\{/);
});

test('screens that receive a stored or server name resolve it by studentId and show a missing name with its id', () => {
  // Submission recovery: the server sends studentName: null when no name is on
  // file; every cell and sentence is named through the roster index.
  const recovery = read('src/components/teacher/StudentPersistenceRecoveryPanel.jsx');
  const recoveryCode = executableSource(recovery);
  assert.match(recoveryCode, /const nameOf = \(row, \{ lastFirst = true \} = \{\}\) => resolveRosterStudentName\(\{\s*studentId: row\?\.studentId, index: studentIdentityIndex/);
  assert.doesNotMatch(recoveryCode, /\{(?:student|proposal|resolutionTarget|target)\.studentName\}/);
  assert.doesNotMatch(recoveryCode, /\$\{target\.studentName\}/);
  assert.match(read('src/TeacherHome.jsx'), /<StudentPersistenceRecoveryPanel[\s\S]*?studentIdentityIndex=\{identityIndex\}/);

  // Response Inspector: the roster name by id first, the report's copy only
  // if it is really a name.
  const inspector = executableSource(read('src/components/teacher/StudentResponseInspector.jsx'));
  assert.match(inspector, /resolveRosterStudentName\(\{\s*studentId: inspectedStudentId, index: studentIdentityIndex/);
  assert.doesNotMatch(inspector, /\{model\.student\.name\}/);
  assert.match(app, /<StudentResponseInspector[\s\S]*?studentIdentityIndex=\{teacherStudentIdentityIndex\}/);

  // Action Center: a projected row with a studentId is named from the roster.
  const actionCenter = executableSource(read('src/components/teacher/TeacherActionCenter.jsx'));
  assert.match(actionCenter, /resolveRosterStudentName\(\{ studentId: item\.studentId, index: identityIndex, historicalName: item\.studentName \}\)/);
  assert.doesNotMatch(actionCenter, /<strong>\{item\.studentName \|\| 'Class-wide'\}<\/strong><\/td>/);

  // Needs Attention: "Name unavailable" alone is ambiguous, so the id is added.
  const queue = executableSource(read('src/components/teacher/NeedsAttentionQueue.jsx'));
  assert.match(queue, /\{studentAlertLabel\(alert\.studentName, alert\.studentId\)\}/);
  assert.match(queue, /\{studentAlertLabel\(entry\.studentName, entry\.studentId\)\}/);
});

test('the support-note picker tells two students with the same name apart by labelled ID', () => {
  // Test D on the one picker that writes a note against a student: two
  // students named alike must not be two identical options.
  const source = readFileSync(new URL('../../src/components/teacher/StudentSupportDashboard.jsx', import.meta.url), 'utf8');
  const picker = source.slice(source.indexOf('const notePickerStudents = useMemo('), source.indexOf('}, [students]);'));
  assert.match(picker, /counts\.get\(labels\[index\]\) > 1/);
  assert.match(picker, /formatStudentLabel\(student, \{ lastFirst: false, includeId: true \}\)/);
  assert.match(source, /notePickerStudents\.map\(\(\{ student, label \}\) =>/);
});
