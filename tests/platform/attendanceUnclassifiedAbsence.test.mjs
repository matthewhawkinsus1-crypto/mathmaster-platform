import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTENDANCE_MARK,
  applyUnexcusedPenalty,
  extensionMeetingsFor,
  summarizeAssignmentAbsences,
} from '../../src/platform/attendance/absencePolicy.js';
import {
  attendanceHistoryMarkIsAbsent,
  attendanceMarksForStudentRange,
  buildAttendanceHistoryEvent,
  effectiveAttendanceForStudentDay,
} from '../../src/platform/attendance/attendanceHistory.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../../src/platform/teacher/liveAttendance.js';
import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE } from '../../src/assignmentLifecycle.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../src/curriculum/calendars/schoolYear2026-2027.js';

const CLOSED = buildNonInstructionalSet(schoolYearNonInstructionalRanges());
const period = (enabled) => ({ enabled, start: '09:00', end: '09:50' });
const schedule = normalizeSchedule({
  ...DEFAULT_CLASS_SCHEDULE,
  daySchedules: {
    A: { periods: { 'Period 3': period(true) } },
    B: { periods: { 'Period 3': period(false) } },
  },
});

const quickMarkAbsent = (dateKey) => ({
  kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: `${dateKey}T09:00:00.000Z`,
  evidence: { dateKey, attendanceMark: 'absent' },
});

test('a Live Classroom quick-mark Absent is a real unclassified state, not an assumed unexcused', () => {
  const effective = effectiveAttendanceForStudentDay({
    supportEvents: [quickMarkAbsent('2026-08-31')], studentId: 's1', classId: 'c1', dateKey: '2026-08-31',
  });
  assert.equal(effective.mark, ATTENDANCE_MARK.ABSENT_UNCLASSIFIED);
  assert.equal(effective.classified, false);
  assert.equal(attendanceHistoryMarkIsAbsent(effective.mark), true);
});

test('quick-mark Absent earns the normal opportunity extension', () => {
  const marks = attendanceMarksForStudentRange({
    supportEvents: [quickMarkAbsent('2026-08-31')], studentId: 's1', classId: 'c1', classPeriod: 'Period 3', schedule,
    fromDateKey: '2026-08-24', toDateKey: '2026-08-31', nonInstructionalKeys: CLOSED,
  });
  const summary = summarizeAssignmentAbsences({ marks, fromDateKey: '2026-08-24', toDateKey: '2026-08-31' });
  assert.equal(summary.unclassified, 1);
  assert.equal(summary.absent, 1);
  assert.equal(summary.unexcused, 0);
  // Counted exactly like an excused absence — extension is never conditioned
  // on a classification nobody has made yet.
  assert.equal(extensionMeetingsFor({ absences: summary }), 1);
});

test('quick-mark Absent triggers zero unexcused penalty, even with the penalty enabled', () => {
  const marks = attendanceMarksForStudentRange({
    supportEvents: [quickMarkAbsent('2026-08-31')], studentId: 's1', classId: 'c1', classPeriod: 'Period 3', schedule,
    fromDateKey: '2026-08-24', toDateKey: '2026-08-31', nonInstructionalKeys: CLOSED,
  });
  const summary = summarizeAssignmentAbsences({ marks, fromDateKey: '2026-08-24', toDateKey: '2026-08-31' });
  const policy = { unexcusedPenaltyEnabled: true, unexcusedPenaltyPointsPerAbsence: 10 };
  const penalty = applyUnexcusedPenalty({ score: 90, absences: summary, policy });
  assert.equal(penalty.applied, false);
  assert.equal(penalty.score, 90);
  assert.equal(penalty.reason, 'no_unexcused_absences');
});

test('a later correction to Unexcused can activate the configured penalty', () => {
  const correction = buildAttendanceHistoryEvent({
    student: { id: 's1' }, mark: 'unexcused', classId: 'c1', dateKey: '2026-08-31',
    priorMark: ATTENDANCE_MARK.ABSENT_UNCLASSIFIED, priorMarkSource: 'liveQuickMark',
  });
  correction.createdAt = '2026-09-01T09:00:00.000Z';
  const marks = attendanceMarksForStudentRange({
    supportEvents: [quickMarkAbsent('2026-08-31'), correction], studentId: 's1', classId: 'c1', classPeriod: 'Period 3', schedule,
    fromDateKey: '2026-08-24', toDateKey: '2026-08-31', nonInstructionalKeys: CLOSED,
  });
  const summary = summarizeAssignmentAbsences({ marks, fromDateKey: '2026-08-24', toDateKey: '2026-08-31' });
  assert.equal(summary.unexcused, 1);
  assert.equal(summary.unclassified, 0);

  const policy = { unexcusedPenaltyEnabled: true, unexcusedPenaltyPointsPerAbsence: 10 };
  const penalty = applyUnexcusedPenalty({ score: 90, absences: summary, policy });
  assert.equal(penalty.applied, true);
  assert.equal(penalty.score, 80);
});

test('a later correction to Excused never activates the unexcused penalty', () => {
  const correction = buildAttendanceHistoryEvent({
    student: { id: 's1' }, mark: 'excused', classId: 'c1', dateKey: '2026-08-31',
    priorMark: ATTENDANCE_MARK.ABSENT_UNCLASSIFIED, priorMarkSource: 'liveQuickMark',
  });
  correction.createdAt = '2026-09-01T09:00:00.000Z';
  const marks = attendanceMarksForStudentRange({
    supportEvents: [quickMarkAbsent('2026-08-31'), correction], studentId: 's1', classId: 'c1', classPeriod: 'Period 3', schedule,
    fromDateKey: '2026-08-24', toDateKey: '2026-08-31', nonInstructionalKeys: CLOSED,
  });
  const summary = summarizeAssignmentAbsences({ marks, fromDateKey: '2026-08-24', toDateKey: '2026-08-31' });
  assert.equal(summary.excused, 1);
  assert.equal(summary.unexcused, 0);

  const policy = { unexcusedPenaltyEnabled: true, unexcusedPenaltyPointsPerAbsence: 10 };
  const penalty = applyUnexcusedPenalty({ score: 90, absences: summary, policy });
  assert.equal(penalty.applied, false);
  assert.equal(penalty.score, 90);
});
