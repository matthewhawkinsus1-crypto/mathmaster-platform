// ONE ANSWER TO "WHEN IS THIS STUDENT'S WORK DUE, AND WHEN DOES CREDIT END".
//
// Four readers decide it: the student's own lifecycle (src/assignmentLifecycle
// .js), ingestion and the checkpoint finalizer (sectionDeadline.mjs), and
// Grade Export's withholding (studentDeadlineResolver.js). An individualized
// extra-time deadline must reach all four identically — a student cannot be
// shown "on time until Friday" while the server stops accepting work on
// Thursday, or have their grade exported before their own cutoff.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getAssignmentDate, getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { assignmentFinalCloseAt, resolveAuthoritativeClose } from '../../functions/shared/sectionDeadline.mjs';
import { resolveStudentFinalDeadlineFromAssignment } from '../../src/platform/gradeTransfer/studentDeadlineResolver.js';
import { withStudentSupportDates } from '../../functions/shared/supportDeadline.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { region, executableSource } from './helpers/sourceContract.mjs';

const CHICAGO = 'America/Chicago';
const profileWithExtraTime = (dueDateExtension = { mode: 'school-days', value: 1 }) => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
    inclusionStatus: false, accommodations: [{ id: 'extra-time', params: { dueDateExtension }, appliesTo: [] }], modifications: [],
  }],
  todayKey: '2026-09-30',
});

// Class due Thursday 2026-10-01 end of day; no late window.
const assignment = Object.freeze({ id: 'A1', dueAt: '2026-10-01', studentOverrides: Object.freeze({}) });
const fridayEndMs = Date.parse('2026-10-03T04:59:59.999Z'); // Fri 2026-10-02 23:59:59.999 CDT

test('the student sees Thursday-late → Friday on time: the individualized due moves the on-time boundary', () => {
  const forStudent = withStudentSupportDates(assignment, 'S1', profileWithExtraTime());
  assert.equal(getAssignmentDate(forStudent, 'due', 'S1').getTime(), fridayEndMs);
  assert.equal(getAssignmentDate(forStudent, 'late', 'S1').getTime(), fridayEndMs);
  const fridayNoon = Date.parse('2026-10-02T17:00:00Z');
  const lifecycle = getAssignmentLifecycle(forStudent, fridayNoon, { studentId: 'S1' });
  assert.equal(lifecycle.status, 'onTime');
  assert.equal(lifecycle.creditEligible, true);
  // Another student on the same (in-memory) copy is unaffected.
  assert.equal(getAssignmentLifecycle(forStudent, fridayNoon, { studentId: 'S2' }).status, 'closed');
  assert.equal(getAssignmentLifecycle(forStudent, Date.parse('2026-10-03T12:00:00Z'), { studentId: 'S1' }).status, 'closed');
});

test('ingestion and the finalizer accept the work until the same instant', () => {
  const profile = profileWithExtraTime();
  assert.equal(assignmentFinalCloseAt(assignment, CHICAGO, 'S1', profile), fridayEndMs);
  assert.equal(assignmentFinalCloseAt(assignment, CHICAGO, 'S1'), Date.parse('2026-10-02T04:59:59.999Z'), 'without the profile: the class cutoff');
  const close = resolveAuthoritativeClose({ assignment, activityRole: 'classwork', schedule: null, studentId: 'S1', studentProfile: profile, nowValue: Date.parse('2026-10-02T17:00:00Z') });
  assert.equal(close.closesAtMs, fridayEndMs);
  assert.equal(close.reason, 'assignment-final-deadline');
});

test('Grade Export waits for the individualized cutoff, and says only "individual extension"', () => {
  const result = resolveStudentFinalDeadlineFromAssignment({ student: { id: 'S1', profile: profileWithExtraTime() }, assignment });
  assert.equal(Date.parse(result.deadline), fridayEndMs);
  assert.equal(resolveStudentFinalDeadlineFromAssignment({ student: { id: 'S2', profile: {} }, assignment }).deadline, null);
});

test('an attendance extension and extra time never shorten each other: the later one wins everywhere', () => {
  const withAttendance = { ...assignment, studentOverrides: { S1: { lateDueAt: '2026-10-07T04:59:59.999Z', extension: { meetingsGranted: 3 } } } };
  const profile = profileWithExtraTime();
  const attendanceMs = Date.parse('2026-10-07T04:59:59.999Z');
  const forStudent = withStudentSupportDates(withAttendance, 'S1', profile);
  assert.equal(getAssignmentDate(forStudent, 'late', 'S1').getTime(), attendanceMs);
  assert.equal(assignmentFinalCloseAt(withAttendance, CHICAGO, 'S1', profile), attendanceMs);
  assert.equal(Date.parse(resolveStudentFinalDeadlineFromAssignment({ student: { id: 'S1', profile }, assignment: withAttendance }).deadline), attendanceMs);
  // The attendance extension does NOT move the on-time boundary; extra time does.
  assert.equal(getAssignmentDate(forStudent, 'due', 'S1').getTime(), fridayEndMs);
  assert.equal(getAssignmentDate(withAttendance, 'due', 'S1').getTime(), Date.parse('2026-10-02T04:59:59.999Z'));

  // Short attendance extension, long extra time: extra time wins.
  const shortAttendance = { ...assignment, studentOverrides: { S1: { lateDueAt: '2026-10-02T12:00:00.000Z' } } };
  const hoursProfile = profileWithExtraTime({ mode: 'hours', value: 72 });
  const expected = Date.parse('2026-10-02T04:59:59.999Z') + 72 * 3600000;
  assert.equal(assignmentFinalCloseAt(shortAttendance, CHICAGO, 'S1', hoursProfile), expected);
  assert.equal(getAssignmentDate(withStudentSupportDates(shortAttendance, 'S1', hoursProfile), 'late', 'S1').getTime(), expected);
});

test('with no support profile every reader behaves exactly as before', () => {
  const withAttendance = { ...assignment, lateDueAt: '2026-10-05', studentOverrides: { S1: { lateDueAt: '2026-10-08' } } };
  assert.equal(withStudentSupportDates(withAttendance, 'S1', {}), withAttendance);
  assert.equal(assignmentFinalCloseAt(withAttendance, CHICAGO, 'S1', {}), assignmentFinalCloseAt(withAttendance, CHICAGO, 'S1'));
  assert.equal(resolveStudentFinalDeadlineFromAssignment({ student: { id: 'S1' }, assignment: withAttendance }).deadline, '2026-10-08');
});

// --- Wiring: every reader that decides credit actually receives the profile -----------------

const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const finalizer = readFileSync(new URL('../../functions/shared/responseCheckpointFinalizer.mjs', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('ingestion, the finalizer and every recovery callable pass the student\'s pinned profile', () => {
  const ingestion = region(server, 'const finalCloseAtMs = assignment ? assignmentFinalCloseAt(', ';', 'ingestion final close');
  assert.match(ingestion, /assignmentFinalCloseAt\(assignment, null, studentId, gradeData\?\.profile/);
  const recoveryCalls = executableSource(server).split('resolveCloseAt: (entry) => resolveAuthoritativeClose({').slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf('}).closesAtMs')));
  assert.equal(recoveryCalls.length, 3);
  recoveryCalls.forEach((call) => assert.match(call, /studentProfile: gradeData\?\.profile/));
  const finalizerClose = region(finalizer, 'const close = resolveAuthoritativeClose({', '});', 'finalizer close');
  assert.match(finalizerClose, /studentProfile: gradeDocument\?\.profile/);
});

test('the student client injects its own dates wherever assignments are loaded, and imports what it calls', () => {
  assert.match(app, /import \{ withStudentSupportDates \} from '\.\.\/functions\/shared\/supportDeadline\.mjs';/);
  const helper = region(app, 'const assignmentsForViewer = (list) =>', ';\n', 'assignmentsForViewer');
  assert.match(helper, /user\?\.role === 'student'/);
  assert.match(helper, /withStudentSupportDates\(assignment, user\.id, user\.profile\)/);
  const listener = region(app, "collection(db, 'assignments'),\n      (snapshot) => {", '(error) =>', 'assignment listener');
  assert.match(listener, /setAssignments\(assignmentsForViewer\(liveAssignments\)\)/);
  const fetcher = region(app, 'const fetchAssignments = async () => {', 'return fetchedAssignments;', 'fetchAssignments');
  assert.match(fetcher, /setAssignments\(assignmentsForViewer\(fetchedAssignments\)\)/);
});

// --- What the student is SHOWN -----------------------------------------------------------------

test('students see the dates the platform applies to them, with no reason named', async () => {
  const { studentDueDateLines } = await import('../../src/assignmentLifecycle.js');
  const forStudent = withStudentSupportDates(assignment, 'S1', profileWithExtraTime());
  const extra = studentDueDateLines(forStudent, getAssignmentLifecycle(forStudent, Date.parse('2026-10-02T17:00:00Z'), { studentId: 'S1' }));
  assert.equal(extra.dueLabel, 'Your due date');
  assert.equal(extra.individualizedDue, true);
  assert.match(extra.dueText, /Oct 2/);
  const plain = studentDueDateLines(assignment, getAssignmentLifecycle(assignment, Date.parse('2026-10-01T17:00:00Z'), { studentId: 'S2' }));
  assert.equal(plain.dueLabel, 'Regular due');
  assert.equal(plain.finalLabel, 'Final late due');
  const withAttendance = { ...assignment, studentOverrides: { S3: { lateDueAt: '2026-10-07T04:59:59.999Z' } } };
  const attended = studentDueDateLines(withAttendance, getAssignmentLifecycle(withAttendance, Date.parse('2026-10-01T17:00:00Z'), { studentId: 'S3' }));
  assert.equal(attended.dueLabel, 'Regular due', 'an attendance extension does not move the on-time date');
  assert.equal(attended.finalLabel, 'Your last day to turn in');
  [extra, plain, attended].forEach((lines) => assert.doesNotMatch(JSON.stringify(lines), /extra time|IEP|504|accommodat|absen/i));
});

test('both student date displays read the student\'s lifecycle, not the class dates', () => {
  const dashboard = readFileSync(new URL('../../src/components/student/StudentDashboardView.jsx', import.meta.url), 'utf8');
  assert.match(dashboard, /import \{ formatDateTime, formatRemainingTime, studentDueDateLines \} from '\.\.\/\.\.\/assignmentLifecycle';/);
  assert.match(dashboard, /const dates = studentDueDateLines\(assignment, lifecycle\);/);
  assert.match(dashboard, /studentDueDateLines\(resumeAssignment, resumeLifecycle\)\.dueText/);
  assert.match(app, /const dates = studentDueDateLines\(assignment, lifecycle\); return <>\{dates\.dueLabel\}: \{dates\.dueText\}<br \/>\{dates\.finalLabel\}: \{dates\.finalText\}<\/>;/);
  assert.match(app, /studentDueDateLines,\n\} from '\.\/assignmentLifecycle';/, 'App.jsx imports what it calls');
});
