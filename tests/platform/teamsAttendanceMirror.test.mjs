// TEAMS attendance, mirrored into MathMaster: functions/shared/teamsAttendance.mjs
// (the rules), src/platform/attendance/teamsAttendanceMirror.js (carrying them
// out in the teacher's tab) and teamsAttendanceBridge.js (what the extension
// calls). Decided with the teacher on 2026-11-27: TEAMS is the source; a TEAMS
// absence extends deadlines as a MathMaster one does (so every mark goes
// through the one attendance handler); a TEAMS tardy today is recorded in the
// Discipline Tracker "from TEAMS", undoable until it is sent; an excused
// tardy never is. All data here is synthetic.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  DESOTO_TEAMS_ATTENDANCE_CODES, TEAMS_ATTENDANCE_LIMITS, TeamsAttendanceInputError, districtIdRosterIndex, normalizeTeamsAttendanceCodes,
  normalizeTeamsAttendanceReport, planTeamsAttendanceMirror, teamsTardyTapId,
} from '../../functions/shared/teamsAttendance.mjs';
import { effectiveAttendanceForStudentDay } from '../../functions/shared/attendanceDay.mjs';
import { canonicalDistrictStudentId } from '../../functions/shared/studentDistrictId.mjs';
import { teamsRosterIndex } from '../../functions/shared/teamsSyncServer.mjs';
import { buildLiveAttendanceEvent } from '../../src/platform/teacher/liveAttendance.js';
import { buildAttendanceHistoryEvent } from '../../src/platform/attendance/attendanceHistory.js';
import { authorizedGradeTransferClasses } from '../../src/platform/gradeTransfer/gradeTransferScope.js';
import { formatStudentName } from '../../src/platform/studentName.js';
import * as mirrorModule from '../../src/platform/attendance/teamsAttendanceMirror.js';
import { createTeamsAttendanceBridge, installTeamsAttendanceBridge } from '../../src/platform/attendance/teamsAttendanceBridge.js';
import { functionsDeclaration } from './helpers/functionsBackendSource.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const { mirrorTeamsAttendance } = mirrorModule;
const TODAY = '2026-12-02';
const NOW = Date.parse('2026-12-02T14:20:00Z');
const TEACHER = 'teacher.attendance@example.test';
// A code table as the live legend will give one (DeSoto's own is filled in then).
const CODES = {
  A: { kind: 'absent', label: 'Absent' },
  AE: { kind: 'absentExcused', label: 'Absent, excused' },
  AU: { kind: 'absentUnexcused', label: 'Absent, unexcused' },
  T: { kind: 'tardy', label: 'Tardy' },
  TE: { kind: 'tardyExcused', label: 'Tardy, excused' },
};
const CLASS = { classId: 'class-p2', name: 'Algebra I — Period 2 (synthetic)', period: '2', teacherOfRecord: TEACHER };
const OTHER_CLASS = { classId: 'class-p5', name: 'Algebra I — Period 5 (synthetic)', period: '5', teacherOfRecord: TEACHER };
const student = (id, sisStudentId, classId = CLASS.classId) => ({ id, sisStudentId, classId, firstName: `First${id}`, lastName: `Last${id}` });
const ROSTER = [
  student('s-absent', '1001'), student('s-tardy', '1002'), student('s-excused', '1003'), student('s-present', '1004'),
  student('s-returning', '1005'), student('s-tardy-excused', '1006'), student('s-zeros', '000123'),
];
const report = (marks, extra = {}) => ({ sectionRef: '15000/02', dateKey: TODAY, taken: true, marks, ...extra });
const MARKS = [
  { districtId: '1001', code: 'A' }, { districtId: '1002', code: 't' }, { districtId: '1003', code: 'AE' },
  { districtId: '1004', code: '' }, { districtId: '1005', code: '' }, { districtId: '1006', code: 'TE' }, { districtId: '123', code: '' },
];

// A stored attendance record, as studentSupportStore.js keeps one.
const record = ({ studentId, dateKey = TODAY, kind = 'liveAttendance', mark, at, source = 'liveAttendance', teamsCode, classId = CLASS.classId }) => ({
  id: `${studentId}-${dateKey}-${at}`,
  kind,
  studentId,
  classId,
  classPeriod: '2',
  source,
  dateKey,
  evidence: {
    dateKey,
    ...(kind === 'liveAttendance' ? { attendanceMark: mark } : { mark }),
    markedAt: at,
    ...(teamsCode === undefined ? {} : { teamsCode }),
  },
});
// s-returning was absent at the class's last meeting.
const HISTORY = [record({ studentId: 's-returning', dateKey: '2026-12-01', mark: 'absent', at: NOW - 86400000 })];

const plan = (marks = MARKS, records = HISTORY, extra = {}) => planTeamsAttendanceMirror({
  report: normalizeTeamsAttendanceReport(report(marks, extra.report), { todayKey: TODAY }),
  classId: CLASS.classId, classPeriod: '2', roster: ROSTER, sharedWith: ROSTER, records, codes: CODES, todayKey: TODAY, ...extra.args,
});

/* ------------------------------------------------------------ the report */

test('a report is one section, one day that has happened, and each student once', () => {
  const normalized = normalizeTeamsAttendanceReport(report(MARKS), { todayKey: TODAY });
  assert.equal(normalized.taken, true);
  assert.equal(normalized.marks.find((mark) => mark.districtId === '1002').code, 'T', 'codes compare in upper case');
  // The same student twice with the same code is one mark.
  assert.equal(normalizeTeamsAttendanceReport(report([...MARKS, { districtId: '1001', code: 'a' }]), { todayKey: TODAY }).marks.length, MARKS.length);
  const refused = [
    report(MARKS, { sectionRef: '' }),
    report(MARKS, { dateKey: '12/02/2026' }),
    report(MARKS, { dateKey: '2026-12-03' }),
    report(MARKS, { dateKey: '2026-10-31' }),
    report([{ districtId: 'S1001', code: 'A' }]),
    report([{ districtId: '1001', code: 'A B' }]),
    report([{ districtId: '1001', code: 'A' }, { districtId: '01001', code: 'T' }]),
    report(Array.from({ length: TEAMS_ATTENDANCE_LIMITS.maxMarks + 1 }, (_, index) => ({ districtId: String(5000 + index), code: '' }))),
  ];
  refused.forEach((entry) => assert.throws(() => normalizeTeamsAttendanceReport(entry, { todayKey: TODAY }), TeamsAttendanceInputError, JSON.stringify(entry).slice(0, 120)));
  assert.doesNotThrow(() => normalizeTeamsAttendanceReport(report(MARKS, { dateKey: '2026-11-02' }), { todayKey: TODAY }), '30 days back is read');
});

test('a code means only what the table says, and DeSoto\'s table is filled from the live legend, never guessed', () => {
  assert.deepEqual(DESOTO_TEAMS_ATTENDANCE_CODES, {});
  assert.throws(() => normalizeTeamsAttendanceCodes({ X: { kind: 'skipped' } }), TeamsAttendanceInputError);
  assert.throws(() => normalizeTeamsAttendanceCodes({ 'two words': { kind: 'absent' } }), TeamsAttendanceInputError);
  // With no table, a coded student is reported and left alone; a student with no code is still present.
  const unknown = planTeamsAttendanceMirror({
    report: normalizeTeamsAttendanceReport(report(MARKS), { todayKey: TODAY }), classId: CLASS.classId, classPeriod: '2', roster: ROSTER, sharedWith: ROSTER, records: HISTORY, todayKey: TODAY,
  });
  assert.deepEqual(unknown.unknownCodes, ['A', 'AE', 'T', 'TE']);
  assert.deepEqual(unknown.marks.map((entry) => entry.studentId), ['s-returning']);
  assert.deepEqual(unknown.tardies, []);
});

/* ------------------------------------------------------------ held to the originals */

// The attendance code a teacher's browser loads first must not grow, so the
// mirror keeps small copies of three things rather than importing them.
// These hold each copy to its original.

test('the district ID index is grade sync\'s rule: a shared district ID is never used', () => {
  const rosters = [
    [ROSTER, ROSTER],
    [ROSTER, [...ROSTER, student('s-twin', '1001', 'class-p5')]],
    [[...ROSTER, { id: '1500105', classId: CLASS.classId }, { id: 'u-bad', sisStudentId: 'S-1', classId: CLASS.classId }], ROSTER],
    [[student('a', '0042'), student('b', '42')], []],
  ];
  rosters.forEach(([roster, sharedWith]) => {
    const original = new Map([...teamsRosterIndex(roster, { sharedWith })].map(([studentId, districtId]) => [canonicalDistrictStudentId(districtId), studentId]));
    assert.deepEqual([...districtIdRosterIndex(roster, { sharedWith })].sort(), [...original].sort());
  });
});

test('a mirrored record is the record Live Classroom and Attendance History build, field for field', () => {
  const entry = { studentId: 's-excused', code: 'AE', mark: 'excused', label: 'Absent, excused', today: true };
  const someone = ROSTER.find((row) => row.id === 's-excused');
  const nameOf = (row) => formatStudentName(row, { lastFirst: false, fallbackToNeutral: false }) || null;
  const [live, history] = mirrorModule.teamsAttendanceEvents({
    entry, student: someone, classRecord: CLASS, sectionRef: '15000/02', dateKey: TODAY, teacherEmail: TEACHER, nowValue: NOW, nameOf,
  });
  const liveOriginal = buildLiveAttendanceEvent({ student: someone, mark: 'absent', classId: CLASS.classId, classPeriod: '2', nowValue: NOW, dateKey: TODAY });
  const historyOriginal = buildAttendanceHistoryEvent({
    student: someone, mark: 'excused', classId: CLASS.classId, classPeriod: '2', dateKey: TODAY, reason: 'From TEAMS: Absent, excused', actorEmail: TEACHER, nowValue: NOW + 1,
  });
  // What the mirror says differently, on purpose: where it came from, and the TEAMS code.
  const own = ({ source: _source, summary: _summary, evidence: { teamsCode: _code, teamsSection: _section, ...evidence }, ...rest }) => ({ ...rest, evidence });
  const original = ({ source: _source, summary: _summary, ...rest }) => rest;
  assert.deepEqual(own(live), original(liveOriginal));
  assert.deepEqual(own(history), original(historyOriginal));
  assert.deepEqual([live.source, live.evidence.teamsCode, history.evidence.teamsSection], ['teams', 'AE', '15000/02']);
});

test('the bridge\'s classes are Grade Export\'s for a teacher: their own, never archived', () => {
  const classes = [CLASS, OTHER_CLASS, { ...CLASS, classId: 'class-old', status: 'archived' }, { classId: 'class-other', teacherOfRecord: 'someone@example.test' }, { teacherOfRecord: TEACHER }];
  const expected = authorizedGradeTransferClasses({ classes, teacherEmail: TEACHER }).map((entry) => entry.classId);
  const bridge = createTeamsAttendanceBridge({
    getContext: () => ({ ready: true, teacherEmail: TEACHER, classes }),
    api: { getTeamsSyncState: async () => ({ sections: [] }) },
  });
  return bridge.listClasses().then((listed) => assert.deepEqual(listed.map((entry) => entry.classId), expected));
});

/* ------------------------------------------------------------ the plan */

test('attendance not yet taken in TEAMS changes nothing: blank is not present until TEAMS says it was taken', () => {
  const notTaken = plan(MARKS, HISTORY, { report: { taken: false } });
  assert.deepEqual([notTaken.marks, notTaken.tardies, notTaken.notTardy], [[], [], []]);
});

test('the first read records every code, present only for a return, and today\'s tardies', () => {
  const first = plan();
  assert.deepEqual(first.marks.map((entry) => [entry.studentId, entry.code, entry.mark, entry.today]), [
    ['s-absent', 'A', 'absent', true],
    ['s-tardy', 'T', 'late', true],
    ['s-excused', 'AE', 'excused', true],
    // First day back after an absence: an explicit present starts the return check-in.
    ['s-returning', '', 'present', true],
    ['s-tardy-excused', 'TE', 'late', true],
  ]);
  // Present with nothing to change (s-present, and s-zeros matched despite leading zeros) is not written.
  assert.equal(first.unchanged, 2);
  assert.equal(first.notOnRoster, 0);
  // Only the unexcused tardy goes to the Discipline Tracker.
  assert.deepEqual(first.tardies, ['s-tardy']);
  assert.deepEqual(first.notTardy.sort(), ['s-absent', 's-excused', 's-present', 's-returning', 's-tardy-excused', 's-zeros']);
});

// The records a first read leaves, as the mirror writes them: today's
// classified absence is two, absent in Live Classroom and the classification
// beside it in the history.
const LIVE = new Set(['present', 'late', 'absent']);
const mirrored = (entries, at = NOW) => entries.flatMap((entry, index) => [
  record({ studentId: entry.studentId, mark: LIVE.has(entry.mark) ? entry.mark : 'absent', at: at + 10 * index, source: 'teams', teamsCode: entry.code }),
  ...(LIVE.has(entry.mark) ? [] : [record({
    studentId: entry.studentId, kind: 'attendanceHistory', mark: entry.mark, at: at + 10 * index + 1, source: 'teams', teamsCode: entry.code,
  })]),
]);

test('a second read of the same TEAMS marks writes nothing; a change in TEAMS is written', () => {
  const first = plan();
  const records = [...HISTORY, ...mirrored(first.marks)];
  const again = plan(MARKS, records);
  assert.deepEqual(again.marks, []);
  assert.equal(again.unchanged, MARKS.length);
  // The student TEAMS had absent arrives: TEAMS now shows a tardy.
  const changed = plan(MARKS.map((mark) => (mark.districtId === '1001' ? { ...mark, code: 'T' } : mark)), records);
  assert.deepEqual(changed.marks.map((entry) => [entry.studentId, entry.mark]), [['s-absent', 'late']]);
  assert.deepEqual(changed.tardies.sort(), ['s-absent', 's-tardy']);
  // TEAMS takes the tardy back: present is written, and the student is no longer a tardy.
  const cleared = plan(MARKS.map((mark) => (mark.districtId === '1002' ? { ...mark, code: '' } : mark)), records);
  assert.deepEqual(cleared.marks.map((entry) => [entry.studentId, entry.mark]), [['s-tardy', 'present']]);
  assert.ok(cleared.notTardy.includes('s-tardy') && !cleared.tardies.includes('s-tardy'));
});

test('a classified absence whose classification did not save is finished on the next read, unless the teacher marked the student since', () => {
  const first = plan();
  const saved = mirrored(first.marks);
  // The history half of s-excused's pair failed: only Live Classroom's was saved.
  const partial = [...HISTORY, ...saved.filter((row) => !(row.studentId === 's-excused' && row.kind === 'attendanceHistory'))];
  const again = plan(MARKS, partial);
  assert.deepEqual(again.marks.map((entry) => [entry.studentId, entry.mark, entry.classifyOnly]), [['s-excused', 'excused', true]]);
  // Only the classification is written: Live Classroom's record is there already.
  const [entry] = again.marks;
  const events = mirrorModule.teamsAttendanceEvents({ entry, student: ROSTER[2], classRecord: CLASS, sectionRef: '15000/02', dateKey: TODAY, teacherEmail: TEACHER, nowValue: NOW + 1000 });
  assert.deepEqual(events.map((event) => [event.kind, event.evidence.mark, event.evidence.teamsCode]), [['attendanceHistory', 'excused', 'AE']]);
  // The teacher marked the student present in the meantime: their mark stands.
  const corrected = [...partial, record({ studentId: 's-excused', mark: 'present', at: NOW + 600000 })];
  assert.ok(!plan(MARKS, corrected).marks.some((item) => item.studentId === 's-excused'));
  // A complete pair is not written again.
  assert.deepEqual(plan(MARKS, [...HISTORY, ...saved]).marks, []);
});

test('a correction made in MathMaster after the mirror stands until TEAMS changes', () => {
  const first = plan();
  const corrected = [
    ...HISTORY, ...mirrored(first.marks),
    // The teacher marks the TEAMS absence present in Live Classroom.
    record({ studentId: 's-absent', mark: 'present', at: NOW + 600000 }),
  ];
  const again = plan(MARKS, corrected);
  assert.ok(!again.marks.some((entry) => entry.studentId === 's-absent'), 'the same TEAMS code is not written again');
  assert.equal(effectiveAttendanceForStudentDay({ supportEvents: corrected, studentId: 's-absent', classId: CLASS.classId, dateKey: TODAY }).mark, 'present');
  // A mark the teacher made in MathMaster with TEAMS showing nothing is left alone.
  const ownMark = plan(MARKS, [...HISTORY, record({ studentId: 's-present', mark: 'absent', at: NOW - 60000 })]);
  assert.ok(!ownMark.marks.some((entry) => entry.studentId === 's-present'));
  // A student already marked present on their return day needs no second record.
  const returned = plan(MARKS, [...HISTORY, record({ studentId: 's-returning', mark: 'present', at: NOW - 60000 })]);
  assert.ok(!returned.marks.some((entry) => entry.studentId === 's-returning'));
  // Absent two days ago but present at the last meeting: not a return today.
  const backAlready = plan(MARKS, [
    ...HISTORY,
    record({ studentId: 's-present', dateKey: '2026-11-30', mark: 'absent', at: NOW - 2 * 86400000 }),
    record({ studentId: 's-present', dateKey: '2026-12-01', mark: 'present', at: NOW - 86400000 }),
  ]);
  assert.ok(!backAlready.marks.some((entry) => entry.studentId === 's-present'));
});

test('an earlier day is history only, and never reaches the Discipline Tracker', () => {
  const past = plan(MARKS, HISTORY, { report: { dateKey: '2026-11-30' } });
  assert.ok(past.marks.length > 0 && past.marks.every((entry) => entry.today === false));
  assert.deepEqual([past.tardies, past.notTardy], [[], []]);
});

test('a student not on this class\'s roster, or under a district ID two students share, is never marked', () => {
  const twin = student('s-twin', '1001', OTHER_CLASS.classId);
  const shared = plan(MARKS, HISTORY, { args: { sharedWith: [...ROSTER, twin] } });
  assert.ok(!shared.marks.some((entry) => entry.studentId === 's-absent'), 'two students under 1001: neither is marked');
  assert.equal(shared.notOnRoster, 1);
  const stranger = plan([...MARKS, { districtId: '9999', code: 'A' }]);
  assert.equal(stranger.notOnRoster, 1);
});

test('a tardy\'s tap id is the same for a student and day however often it is read, and fits the tracker\'s pattern', () => {
  const id = teamsTardyTapId({ dateKey: TODAY, studentId: 's-tardy' });
  assert.equal(id, teamsTardyTapId({ dateKey: TODAY, studentId: 's-tardy' }));
  assert.notEqual(id, teamsTardyTapId({ dateKey: TODAY, studentId: 's-absent' }));
  assert.notEqual(id, teamsTardyTapId({ dateKey: '2026-12-03', studentId: 's-tardy' }));
  assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.match(teamsTardyTapId({ dateKey: TODAY, studentId: 'student@example.test' }), /^[A-Za-z0-9_-]{8,64}$/);
});

/* ------------------------------------------------------------ carrying it out */

const harness = ({ records = HISTORY, incidents = [], failOn = null } = {}) => {
  const calls = { fetch: [], attendance: [], tardies: [], voids: [], lists: [] };
  return {
    calls,
    deps: {
      fetchRecords: async (args) => { calls.fetch.push(args); return records; },
      recordAttendance: async (event) => {
        calls.attendance.push(event);
        return failOn && failOn(event) ? null : { id: `r${calls.attendance.length}`, ...event };
      },
      recordTardy: async (args) => { calls.tardies.push(args); return { id: `${args.classId}_${args.tapId}` }; },
      listIncidents: async (args) => { calls.lists.push(args); return incidents; },
      voidTardy: async (args) => { calls.voids.push(args); return { ...args, voided: true }; },
    },
  };
};
const run = (deps, raw = report(MARKS), extra = {}) => mirrorTeamsAttendance({
  report: raw, classRecord: CLASS, roster: ROSTER, sharedWith: ROSTER, codes: CODES, teacherEmail: TEACHER, todayKey: TODAY, nowValue: NOW, ...deps, ...extra,
});

test('each mark goes through the one attendance handler, labelled from TEAMS; today\'s reaches Live Classroom', async () => {
  const { calls, deps } = harness();
  const result = await run(deps);
  assert.deepEqual(calls.fetch, [{ classId: CLASS.classId, fromDateKey: '2026-11-11', toDateKey: TODAY }]);
  assert.ok(calls.attendance.every((event) => event.source === 'teams' && event.evidence.teamsSection === '15000/02'));
  const absent = calls.attendance.filter((event) => event.studentId === 's-absent');
  assert.deepEqual(absent.map((event) => [event.kind, event.evidence.attendanceMark, event.evidence.teamsCode, event.evidence.arrivedAt]), [['liveAttendance', 'absent', 'A', null]]);
  assert.equal(absent[0].classId, CLASS.classId);
  // TEAMS does not say when a late student arrived: no arrival time is made up.
  const late = calls.attendance.find((event) => event.studentId === 's-tardy');
  assert.deepEqual([late.evidence.attendanceMark, late.evidence.arrivedAt], ['late', null]);
  assert.equal(absent[0].dateKey, TODAY);
  assert.match(absent[0].summary, /^Absent \(TEAMS code A\) in TEAMS for 2026-12-02\.$/);
  // An excused absence: absent in Live Classroom, and excused in the history beside it, which is newer.
  const excused = calls.attendance.filter((event) => event.studentId === 's-excused');
  assert.deepEqual(excused.map((event) => event.kind), ['liveAttendance', 'attendanceHistory']);
  assert.equal(excused[1].evidence.mark, 'excused');
  assert.ok(excused[1].evidence.markedAt > excused[0].evidence.markedAt);
  assert.equal(effectiveAttendanceForStudentDay({ supportEvents: excused, studentId: 's-excused', classId: CLASS.classId, dateKey: TODAY }).mark, 'excused');
  assert.equal(result.recorded, 5);
  assert.equal(result.failed, 0);
  // An earlier day is a history record only.
  const past = harness();
  await run(past.deps, report(MARKS, { dateKey: '2026-11-30' }));
  assert.ok(past.calls.attendance.every((event) => event.kind === 'attendanceHistory' && event.evidence.correctedByEmail === TEACHER));
});

test('a TEAMS tardy is recorded once in the Discipline Tracker; an excused one never is', async () => {
  const { calls, deps } = harness();
  const result = await run(deps);
  assert.deepEqual(calls.tardies, [{ classId: CLASS.classId, studentId: 's-tardy', tapId: teamsTardyTapId({ dateKey: TODAY, studentId: 's-tardy' }) }]);
  assert.equal(result.tardies, 1);
});

test('a tardy TEAMS shows again after taking it back is recorded again; one the teacher undid stays undone', async () => {
  const tap = (sequence) => teamsTardyTapId({ dateKey: TODAY, studentId: 's-tardy', sequence });
  const record = (sequence, extra = {}) => ({ id: `${CLASS.classId}_${tap(sequence)}`, studentId: 's-tardy', source: 'teams', form: { state: 'pending' }, ...extra });
  const recorded = async (incidents) => {
    const { calls, deps } = harness({ incidents });
    const result = await run(deps);
    return { tapIds: calls.tardies.map((entry) => entry.tapId), result };
  };
  // Recorded and standing: nothing to do.
  assert.deepEqual((await recorded([record(1)])).tapIds, []);
  // The mirror undid it (TEAMS took it back), and TEAMS shows it again: a new record, the undone one kept.
  const restored = await recorded([record(1, { voidedAtMs: NOW - 60000, voidSource: 'teams' })]);
  assert.deepEqual(restored.tapIds, [tap(2)]);
  assert.equal(restored.result.tardiesRestored, 1);
  assert.match(tap(2), /^[A-Za-z0-9_-]{8,64}$/);
  // Again after that: the newest decides.
  assert.deepEqual((await recorded([record(1, { voidedAtMs: 1, voidSource: 'teams' }), record(2, { voidedAtMs: 2, voidSource: 'teams' })])).tapIds, [tap(3)]);
  // The teacher undid it: their undo stands, whatever TEAMS shows.
  assert.deepEqual((await recorded([record(1, { voidedAtMs: NOW - 60000, voidSource: 'teacher' })])).tapIds, []);
  // TEAMS takes the restored one back: the newest is the one undone.
  const { calls, deps } = harness({ incidents: [record(1, { voidedAtMs: 1, voidSource: 'teams' }), record(2)] });
  await run(deps, report(MARKS.map((mark) => (mark.districtId === '1002' ? { ...mark, code: '' } : mark))));
  assert.deepEqual(calls.voids, [{ incidentId: `${CLASS.classId}_${tap(2)}`, reason: 'TEAMS no longer shows this tardy', source: 'teams' }]);
});

test('a tardy TEAMS took back is undone while it waits; one on the form is left for the teacher', async () => {
  const id = (studentId) => `${CLASS.classId}_${teamsTardyTapId({ dateKey: TODAY, studentId })}`;
  const incidents = [
    { id: id('s-absent'), form: { state: 'pending' } },
    { id: id('s-excused'), form: { state: 'submitted' } },
    { id: id('s-present'), form: { state: 'unknown' } },
    { id: id('s-returning'), form: { state: 'sending' } },
    { id: id('s-zeros'), form: { state: 'pending' }, voidedAtMs: NOW - 1000 },
    { id: id('s-tardy-excused'), form: { state: 'failed' } },
    // The teacher's own Tardy tap for a student TEAMS shows present: never touched.
    { id: `${CLASS.classId}_tap-teacher-1`, studentId: 's-present', form: { state: 'pending' } },
  ];
  const { calls, deps } = harness({ incidents });
  const result = await run(deps);
  assert.deepEqual(calls.lists, [{ classId: CLASS.classId, dateKey: TODAY }]);
  assert.deepEqual(calls.voids.map((entry) => entry.incidentId).sort(), [id('s-absent'), id('s-tardy-excused')].sort());
  assert.equal(result.tardiesUndone, 2);
  assert.equal(result.tardiesOnForm, 2, 'sent, or may have been: the teacher is told');
});

test('a mark that failed is not counted, and the next read records it again', async () => {
  const { calls, deps } = harness({ failOn: (event) => event.studentId === 's-tardy' });
  const result = await run(deps);
  assert.equal(result.failed, 1);
  assert.equal(result.recorded, 4);
  // Nothing stored for s-tardy, so the next read plans it again.
  const stored = calls.attendance.filter((event) => event.studentId !== 's-tardy').map((event, index) => ({ ...event, id: `x${index}` }));
  assert.ok(plan(MARKS, [...HISTORY, ...stored]).marks.some((entry) => entry.studentId === 's-tardy'));
});

test('not taken in TEAMS: nothing is read or written', async () => {
  const { calls, deps } = harness();
  const result = await run(deps, report(MARKS, { taken: false }));
  assert.deepEqual([calls.fetch.length, calls.attendance.length, calls.tardies.length, calls.lists.length], [0, 0, 0, 0]);
  assert.equal(result.taken, false);
});

/* ------------------------------------------------------------ the bridge */

const bridgeFor = ({ ready = true, classes = [CLASS, OTHER_CLASS, { classId: 'class-other', teacherOfRecord: 'someone@example.test' }] } = {}) => {
  const { calls, deps } = harness();
  const discipline = {
    recordDisciplineIncident: async (args) => { calls.tardies.push(args); return {}; },
    listDisciplineIncidents: async (args) => { calls.lists.push(args); return { incidents: [] }; },
    voidDisciplineIncident: async (args) => { calls.voids.push(args); return {}; },
  };
  const api = { getTeamsSyncState: async ({ classId }) => ({ sections: classId === CLASS.classId ? [{ sectionRef: '15000/02', label: '' }, { sectionRef: '15000-I/52', label: '' }] : [] }) };
  const bridge = createTeamsAttendanceBridge({
    getContext: () => ({ ready, teacherEmail: TEACHER, classes, students: [...ROSTER, student('s-p5', '2001', OTHER_CLASS.classId)], fetchRecords: deps.fetchRecords, recordAttendance: deps.recordAttendance }),
    api, mirror: mirrorModule, discipline, now: () => NOW, codes: CODES,
  });
  return { bridge, calls };
};

test('the bridge offers only the teacher\'s own classes, with their linked TEAMS sections', async () => {
  const { bridge } = bridgeFor();
  const classes = await bridge.listClasses();
  assert.deepEqual(classes.map((entry) => [entry.classId, entry.sections.map((section) => section.sectionRef)]), [
    [CLASS.classId, ['15000/02', '15000-I/52']], [OTHER_CLASS.classId, []],
  ]);
  await assert.rejects(bridgeFor({ ready: false }).bridge.listClasses(), /still loading/);
});

test('the bridge mirrors a linked section into its class, tardies tagged from TEAMS; anything else is refused', async () => {
  const { bridge, calls } = bridgeFor();
  await assert.rejects(bridge.mirror({ ...report(MARKS), classId: 'class-other' }), /not one of yours/);
  await assert.rejects(bridge.mirror({ ...report(MARKS), classId: OTHER_CLASS.classId }), /not linked/);
  await assert.rejects(bridge.mirror({ ...report(MARKS, { sectionRef: '99999/01' }), classId: CLASS.classId }), /not linked/);
  assert.equal(calls.attendance.length, 0, 'nothing is written for a refused report');
  const result = await bridge.mirror({ ...report(MARKS), classId: CLASS.classId });
  assert.equal(result.recorded, 5);
  // Only this class's students: the period 5 student is not on its roster.
  assert.ok(calls.attendance.every((event) => event.classId === CLASS.classId));
  assert.deepEqual(calls.tardies.map((entry) => [entry.type, entry.source, entry.studentId]), [['tardy', 'teams', 's-tardy']]);
  const bridgeSource = readFileSync('src/platform/attendance/teamsAttendanceBridge.js', 'utf8');
  assert.match(bridgeSource, /voidTardy: \(\{ incidentId, reason \}\) => store\.voidDisciplineIncident\(\{ incidentId, reason, source: 'teams' \}\),/);
  const target = {};
  const undo = installTeamsAttendanceBridge(bridge, target);
  assert.equal(target.mathmasterTeamsAttendance, bridge);
  undo();
  assert.equal(target.mathmasterTeamsAttendance, undefined);
});

/* ------------------------------------------------------------ the wiring */

test('the mirror records through App\'s one attendance handler, quietly, from every teacher screen', () => {
  const controls = executableSource(readFileSync('src/app/teacher/controls/attendanceExtensionControls.js', 'utf8'));
  assert.match(controls, /const handleRecordStudentSupportEvent = async \(event, \{ quiet = false \} = \{\}\) => \{/);
  // Quiet hides the success note only; a shortened-extension review is still shown.
  assert.match(controls, /if \(!quiet \|\| reviewCount > 0\) \{\s*toastSuccess\(/);
  const hook = executableSource(readFileSync('src/app/teacher/useTeamsAttendanceBridge.js', 'utf8'));
  assert.match(hook, /recordAttendance: \(event\) => recordAttendance\(event, \{ quiet: true \}\),/);
  assert.match(hook, /import\('\.\.\/\.\.\/platform\/attendance\/teamsAttendanceBridge\.js'\)/, 'loaded after the workspace draws');
  assert.match(hook, /fetchAttendanceForClassDateRange\(\{ db, teacherEmail, classId, fromDateKey, toDateKey \}\)/);
  const workspace = executableSource(readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8'));
  assert.match(workspace, /useTeamsAttendanceBridge\(\{ user, classes, students: allStudents, recordAttendance: handleRecordStudentSupportEvent \}\);/);
  // The mirror writes no attendance of its own.
  const mirror = executableSource(readFileSync('src/platform/attendance/teamsAttendanceMirror.js', 'utf8'));
  assert.doesNotMatch(mirror, /addDoc|setDoc|firebase\/firestore|studentSupportEvents/);
});

test('the Discipline Tracker takes a TEAMS record only for a tardy, and shows it as from TEAMS', () => {
  const source = executableSource(functionsDeclaration('recordDisciplineIncident'));
  assert.match(source, /const source = request\.data\?\.source === "teams" \? "teams" : "teacher";/);
  assert.match(source, /if \(source === "teams" && violation\.type !== "tardy"\) throw new HttpsError\("invalid-argument"/);
  assert.match(source, /recordedByUid: request\.auth\.uid,\s*source,/);
  assert.match(executableSource(functionsDeclaration('disciplineIncidentView')), /source: data\.source === "teams" \? "teams" : "teacher",/);
  const undo = executableSource(functionsDeclaration('voidDisciplineIncident'));
  assert.match(undo, /const voidSource = request\.data\?\.source === "teams" \? "teams" : "teacher";/);
  assert.match(undo, /if \(voidSource === "teams" && data\.source !== "teams"\) \{\s*throw new HttpsError\("invalid-argument"/);
  assert.match(undo, /voidedByEmail: authority\.email, voidReason: reason, voidSource \};/);
  assert.match(executableSource(functionsDeclaration('disciplineIncidentView')), /voidSource: data\.voidedAtMs \|\| data\.voidedAt \? \(data\.voidSource === "teams" \? "teams" : "teacher"\) : null,/);
  assert.match(readFileSync('src/components/teacher/DisciplineTracker.jsx', 'utf8'), /\{incident\.source === 'teams' && <span className="tw-muted" data-discipline-from-teams> · from TEAMS<\/span>\}/);
  const history = readFileSync('src/components/teacher/AttendanceHistoryPanel.jsx', 'utf8');
  assert.match(history, /entry\.event\?\.source === 'teams' \? ' \(from TEAMS\)'/);
  assert.match(history, /effective\?\.event\?\.source === 'teams' \? ' · from TEAMS' : ''/);
});
