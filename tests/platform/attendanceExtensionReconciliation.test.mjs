import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE, getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import { ATTENDANCE_MARK } from '../../src/platform/attendance/absencePolicy.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../../src/platform/teacher/liveAttendance.js';
import { ATTENDANCE_HISTORY_EVENT_KIND } from '../../src/platform/attendance/attendanceHistory.js';
import {
  buildStudentExtensionPatch,
  openAttendanceCorrectionReviewsForStudent,
  reconcileAssignmentExtensionsForCorrection,
  resolveStudentExtension,
} from '../../src/platform/attendance/extensionReconciliation.js';
import { buildAttendanceCorrectionReviewEvent } from '../../src/platform/attendance/returnCheckIn.js';

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
  // Only the FINAL cutoff moves. A per-student `dueAt` is never written —
  // that would let assignmentLifecycle's late-cutoff fallback pick up a date
  // computed from the wrong baseline (see the "Sept 18 / Sept 25" tests below).
  assert.equal(patch.studentOverrides.s1.lateDueAt, resolution.proposed.dueAt);
  assert.equal('dueAt' in patch.studentOverrides.s1, false);

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
  // dueAt has already passed by 1 Sept; lateDueAt (the ordinary final cutoff)
  // has not, and the per-student override extends only that field.
  const extendedAssignment = {
    ...baseAssignment,
    lateDueAt: new Date(2026, 8, 4, 23, 59).toISOString(),
    studentOverrides: { s1: { extension: { dateKey: '2026-09-09' }, lateDueAt: new Date(2026, 8, 9, 23, 59).toISOString() } },
  };
  const forStudent = getAssignmentLifecycle(extendedAssignment, new Date(2026, 8, 1), { studentId: 's1' });
  const forClass = getAssignmentLifecycle(extendedAssignment, new Date(2026, 8, 1));
  // Ordinary due date already passed for everyone, extended or not — that
  // status is pacing, not opportunity.
  assert.equal(forStudent.status, 'late');
  assert.equal(forStudent.creditEligible, true);
  assert.equal(forClass.status, 'late');
});

/*
 * THE BUG THIS PR'S REVIEW CAUGHT: extending from the ordinary due date
 * instead of the class's final cutoff could SHORTEN the final cutoff every
 * other student already has. class due = 18 Sept, class final/late cutoff =
 * 25 Sept. One absence must extend the FINAL cutoff to something after 25
 * Sept — never to a date derived from 18 Sept (which would land around 21
 * Sept, days before the ordinary cutoff every unextended student gets).
 */
test('an absence extends the FINAL cutoff, and can never land earlier than the class final cutoff', () => {
  const classDueLateAssignment = {
    id: 'due-late-a1',
    releaseAt: new Date(2026, 8, 10).toISOString(),
    dueAt: new Date(2026, 8, 18, 23, 59).toISOString(),
    lateDueAt: new Date(2026, 8, 25, 23, 59).toISOString(),
  };
  const marks = [{ dateKey: '2026-09-11', mark: ATTENDANCE_MARK.EXCUSED, classMet: true }];
  const resolution = resolveStudentExtension({
    assignment: classDueLateAssignment, studentId: 's1', marks, schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });

  assert.equal(resolution.changed, true);
  // Never Sept 21 (one meeting forward from the ordinary due date) or any
  // date at or before the class's own final cutoff of Sept 25.
  assert.ok(resolution.proposed.dateKey > '2026-09-25', `expected the extended final cutoff after 2026-09-25, got ${resolution.proposed.dateKey}`);
  assert.notEqual(resolution.proposed.dateKey, '2026-09-21');

  const patch = buildStudentExtensionPatch({ assignment: classDueLateAssignment, studentId: 's1', resolution, actorEmail: 'teacher@school.org' });
  const extended = { ...classDueLateAssignment, studentOverrides: patch.studentOverrides };

  // Between the ordinary due date and the class final cutoff, the extended
  // student is late but still credit-eligible — exactly like every other
  // student who has not yet hit the final cutoff.
  const midWindow = getAssignmentLifecycle(extended, new Date(2026, 8, 20), { studentId: 's1' });
  assert.equal(midWindow.status, 'late');
  assert.equal(midWindow.creditEligible, true);
  assert.equal(midWindow.isOpen, true);

  // Just past the ORDINARY class final cutoff (26 Sept), the extended
  // student remains credit-eligible through their own extended cutoff.
  const pastClassCutoff = getAssignmentLifecycle(extended, new Date(2026, 8, 26), { studentId: 's1' });
  assert.equal(pastClassCutoff.creditEligible, true);
  assert.equal(pastClassCutoff.isOpen, true);

  // A student with no override closes normally at the class's own final
  // cutoff — the extension never touches anyone else.
  const everyoneElse = getAssignmentLifecycle(extended, new Date(2026, 8, 26));
  assert.equal(everyoneElse.status, 'closed');
  assert.equal(everyoneElse.creditEligible, false);
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

test('openAttendanceCorrectionReviewsForStudent surfaces a would-shorten case derived fresh from current attendance, with no separate open flag to drift', () => {
  const alreadyExtended = {
    ...baseAssignment, id: 'a1', assignedClassIds: ['c1'],
    studentOverrides: { s1: { extension: { dateKey: '2026-09-09', meetingsGranted: 2 } } },
  };
  const singleAbsenceEvent = {
    kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-08-31T09:00:00.000Z',
    evidence: { dateKey: '2026-08-31', mark: 'excused' },
  };
  const open = openAttendanceCorrectionReviewsForStudent({
    assignments: [alreadyExtended], studentId: 's1', classId: 'c1', classPeriod: 'Period 3',
    schedule, nonInstructionalKeys: CLOSED,
    supportEvents: [singleAbsenceEvent],
  });
  assert.equal(open.length, 1);
  assert.equal(open[0].resolution.existing.dateKey, '2026-09-09');
  assert.equal(open[0].resolution.proposed.dateKey, '2026-09-02');
});

test('a recorded review resolution makes the open item disappear, whichever way the teacher resolved it', () => {
  const alreadyExtended = {
    ...baseAssignment, id: 'a1', assignedClassIds: ['c1'],
    studentOverrides: { s1: { extension: { dateKey: '2026-09-09', meetingsGranted: 2 } } },
  };
  const singleAbsenceEvent = {
    kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-08-31T09:00:00.000Z',
    evidence: { dateKey: '2026-08-31', mark: 'excused' },
  };
  const resolutionEvent = buildAttendanceCorrectionReviewEvent({
    studentId: 's1', assignmentId: 'a1', classId: 'c1',
    existing: { dateKey: '2026-09-09' }, proposed: { dateKey: '2026-09-02' },
    resolution: 'kept', actorEmail: 'teacher@school.org',
  });
  resolutionEvent.createdAt = '2026-09-05T09:00:00.000Z';

  const stillOpen = openAttendanceCorrectionReviewsForStudent({
    assignments: [alreadyExtended], studentId: 's1', classId: 'c1', classPeriod: 'Period 3',
    schedule, nonInstructionalKeys: CLOSED, supportEvents: [singleAbsenceEvent, resolutionEvent],
  });
  assert.equal(stillOpen.length, 0);
});

test('no absences means no extension and no write', () => {
  const resolution = resolveStudentExtension({
    assignment: baseAssignment, studentId: 's1', marks: [], schedule, classPeriod: 'Period 3', nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, false);
  assert.equal(resolution.extensionMeetings, 0);
});

test('removing the final absence proposes the class cutoff and requires explicit shortening review', () => {
  const alreadyExtended = {
    ...baseAssignment,
    studentOverrides: { s1: { extension: { dateKey: '2026-09-09', meetingsGranted: 1 } } },
  };
  const resolution = resolveStudentExtension({
    assignment: alreadyExtended,
    studentId: 's1',
    marks: [{ dateKey: '2026-08-31', mark: ATTENDANCE_MARK.PRESENT, classMet: true }],
    schedule,
    classPeriod: 'Period 3',
    nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, false);
  assert.equal(resolution.reviewNeeded, true);
  assert.equal(resolution.reason, 'would_shorten_existing_extension');
  assert.equal(resolution.proposed.dateKey, '2026-08-31');
  assert.equal(resolution.proposed.meetingsGranted, 0);
});

test('unclassified Live Classroom absence remains in extension audit evidence', () => {
  const resolution = resolveStudentExtension({
    assignment: baseAssignment,
    studentId: 's1',
    marks: [{ dateKey: '2026-08-31', mark: ATTENDANCE_MARK.ABSENT_UNCLASSIFIED, classMet: true }],
    schedule,
    classPeriod: 'Period 3',
    nonInstructionalKeys: CLOSED,
  });
  assert.equal(resolution.changed, true);
  assert.deepEqual(resolution.proposed.sourceAbsenceDates, ['2026-08-31']);
  assert.deepEqual(resolution.absences.dates.unclassified, ['2026-08-31']);
});
