import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE, getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import { ATTENDANCE_MARK } from '../../src/platform/attendance/absencePolicy.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../../src/platform/teacher/liveAttendance.js';
import {
  buildStudentExtensionPatch,
  reconcileAssignmentExtensionsForCorrection,
  resolveStudentExtension,
} from '../../src/platform/attendance/extensionReconciliation.js';

const CLOSED = buildNonInstructionalSet(schoolYearNonInstructionalRanges());
const period = (enabled) => ({ enabled, start: '09:00', end: '09:50' });
const schedule = normalizeSchedule({
  ...DEFAULT_CLASS_SCHEDULE,
  daySchedules: {
    A: { periods: { 'Period 3': period(true) } },
    B: { periods: { 'Period 3': period(false) } },
  },
});

const baseAssignment = {
  id: 'a1',
  dueAt: new Date(2026, 7, 31, 23, 59).toISOString(),
  releaseAt: new Date(2026, 7, 24).toISOString(),
};

test('a marked absence grants a student-specific extension without touching the class deadline', () => {
  const marks = [{ dateKey: '2026-08-31', mark: ATTENDANCE_MARK.EXCUSED, classMet: true }];
  const resolution = resolveStudentExtension({
    assignment: baseAssignment, studentId: 's1', marks, schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, true);
  assert.equal(resolution.reviewNeeded, false);
  assert.equal(resolution.extensionMeetings, 1);
  // One missed meeting after 31 Aug lands on 2 Sept for Period 3.
  assert.equal(resolution.proposed.dateKey, '2026-09-02');

  const patch = buildStudentExtensionPatch({ assignment: baseAssignment, studentId: 's1', resolution, actorEmail: 'teacher@school.org' });
  assert.equal(patch.studentOverrides.s1.extension.dateKey, '2026-09-02');
  assert.equal(patch.studentOverrides.s1.dueAt, resolution.proposed.dueAt);

  // The ordinary due date on the assignment document itself is untouched —
  // only a per-student override was produced.
  assert.equal(baseAssignment.dueAt, new Date(2026, 7, 31, 23, 59).toISOString());
});

test('two missed meetings grant a two-meeting extension, landing on the actual second meeting', () => {
  // Both absences fall within THIS assignment's own window (release through
  // its own due date), unlike the single-absence fixture above.
  const laterDueAssignment = { ...baseAssignment, dueAt: new Date(2026, 8, 9, 23, 59).toISOString() };
  const marks = [
    { dateKey: '2026-08-31', mark: ATTENDANCE_MARK.UNEXCUSED, classMet: true },
    { dateKey: '2026-09-02', mark: ATTENDANCE_MARK.EXCUSED, classMet: true },
  ];
  const resolution = resolveStudentExtension({
    assignment: laterDueAssignment, studentId: 's1', marks, schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.extensionMeetings, 2);
  // Extended forward from the assignment's OWN due date (9 Sept), not from
  // either absence date.
  assert.equal(resolution.proposed.dateKey, '2026-09-16');
});

test('a per-student extension is visible through the authoritative lifecycle resolver, not a second store', () => {
  const extendedAssignment = {
    ...baseAssignment,
    studentOverrides: { s1: { extension: { dateKey: '2026-09-02' }, dueAt: new Date(2026, 8, 2, 23, 59).toISOString() } },
  };
  const forStudent = getAssignmentLifecycle(extendedAssignment, new Date(2026, 8, 1), { studentId: 's1' });
  const forClass = getAssignmentLifecycle(extendedAssignment, new Date(2026, 8, 1));
  assert.equal(forStudent.status, 'onTime'); // still open for the extended student
  assert.equal(forClass.status, 'closed'); // the ordinary deadline already passed for everyone else
});

test('a historical correction that ADDS an absence reconciles the extension forward', () => {
  const alreadyExtended = {
    ...baseAssignment,
    dueAt: new Date(2026, 8, 9, 23, 59).toISOString(),
    studentOverrides: { s1: { extension: { dateKey: '2026-09-14', meetingsGranted: 1 } } },
  };
  const marks = [
    { dateKey: '2026-08-31', mark: ATTENDANCE_MARK.EXCUSED, classMet: true },
    { dateKey: '2026-09-02', mark: ATTENDANCE_MARK.EXCUSED, classMet: true }, // newly corrected to absent
  ];
  const resolution = resolveStudentExtension({
    assignment: alreadyExtended, studentId: 's1', marks, schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, true);
  assert.equal(resolution.reason, 'extension_extended');
  assert.equal(resolution.proposed.dateKey, '2026-09-16');
});

test('a correction that would SHORTEN a granted extension is never applied silently — it asks for review instead', () => {
  const alreadyExtended = {
    ...baseAssignment,
    studentOverrides: { s1: { extension: { dateKey: '2026-09-09', meetingsGranted: 2 } } },
  };
  // The student was actually only absent once; the second absence gets corrected to Present.
  const marks = [{ dateKey: '2026-08-31', mark: ATTENDANCE_MARK.EXCUSED, classMet: true }];
  const resolution = resolveStudentExtension({
    assignment: alreadyExtended, studentId: 's1', marks, schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, false);
  assert.equal(resolution.reviewNeeded, true);
  assert.equal(resolution.reason, 'would_shorten_existing_extension');
  assert.equal(resolution.proposed.dateKey, '2026-09-02');
  assert.equal(resolution.existing.dateKey, '2026-09-09');

  // buildStudentExtensionPatch refuses to build a write for a reviewNeeded resolution.
  assert.equal(buildStudentExtensionPatch({ assignment: alreadyExtended, studentId: 's1', resolution }), null);
});

test('re-resolving the same attendance produces no change, so reconciliation is idempotent', () => {
  const alreadyExtended = {
    ...baseAssignment,
    studentOverrides: { s1: { extension: { dateKey: '2026-09-02', meetingsGranted: 1 } } },
  };
  const marks = [{ dateKey: '2026-08-31', mark: ATTENDANCE_MARK.EXCUSED, classMet: true }];
  const resolution = resolveStudentExtension({
    assignment: alreadyExtended, studentId: 's1', marks, schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, false);
  assert.equal(resolution.reviewNeeded, false);
  assert.equal(resolution.reason, 'unchanged');
});

test('a historical correction reconciles only the assignments its date actually falls inside', () => {
  const insideWindow = { ...baseAssignment, id: 'inside', releaseAt: new Date(2026, 7, 24).toISOString(), dueAt: new Date(2026, 7, 31, 23, 59).toISOString() };
  const outsideWindow = { ...baseAssignment, id: 'outside', releaseAt: new Date(2026, 8, 15).toISOString(), dueAt: new Date(2026, 8, 20, 23, 59).toISOString() };
  const supportEvents = [{
    kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-08-31T09:00:00.000Z',
    evidence: { dateKey: '2026-08-31', attendanceMark: 'absent' },
  }];

  const results = reconcileAssignmentExtensionsForCorrection({
    assignments: [insideWindow, outsideWindow].map((assignment) => ({ ...assignment, assignedClassIds: ['c1'] })),
    studentId: 's1', classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED,
    supportEvents, correctionDateKey: '2026-08-31',
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].assignment.id, 'inside');
  assert.equal(results[0].resolution.changed, true);
});

test('no absences means no extension and no write', () => {
  const resolution = resolveStudentExtension({
    assignment: baseAssignment, studentId: 's1', marks: [], schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, false);
  assert.equal(resolution.extensionMeetings, 0);
});
