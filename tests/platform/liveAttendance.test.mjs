import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_ATTENDANCE_EVENT_KIND,
  LIVE_ATTENDANCE_MARK,
  attendanceByStudentForDay,
  buildLiveAttendanceEvent,
  attendanceIsAbsent,
} from '../../src/platform/teacher/liveAttendance.js';

const noon = new Date(2026, 8, 4, 12, 0, 0).getTime();

test('latest attendance action for the class and day wins per student', () => {
  const result = attendanceByStudentForDay({
    supportEvents: [
      {
        id: 'new', kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1',
        createdAt: '2026-09-04T17:00:00.000Z',
        evidence: { dateKey: '2026-09-04', attendanceMark: LIVE_ATTENDANCE_MARK.LATE, arrivedAt: noon },
      },
      {
        id: 'old', kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1',
        createdAt: '2026-09-04T16:00:00.000Z',
        evidence: { dateKey: '2026-09-04', attendanceMark: LIVE_ATTENDANCE_MARK.ABSENT },
      },
      {
        id: 'other-class', kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's2', classId: 'c2',
        createdAt: '2026-09-04T18:00:00.000Z',
        evidence: { dateKey: '2026-09-04', attendanceMark: LIVE_ATTENDANCE_MARK.ABSENT },
      },
      {
        id: 'yesterday', kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's3', classId: 'c1',
        createdAt: '2026-09-03T18:00:00.000Z',
        evidence: { dateKey: '2026-09-03', attendanceMark: LIVE_ATTENDANCE_MARK.ABSENT },
      },
    ],
    classId: 'c1',
    dateKey: '2026-09-04',
  });

  assert.deepEqual(result, {
    s1: { mark: 'late', arrivedAt: noon, markedAt: Date.parse('2026-09-04T17:00:00.000Z') },
  });
});

test('period fallback stays scoped when no class id exists', () => {
  const result = attendanceByStudentForDay({
    supportEvents: [
      { kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 'p1', classPeriod: 'Period 2', createdAt: '2026-09-04T16:00:00.000Z', evidence: { dateKey: '2026-09-04', attendanceMark: 'absent' } },
      { kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 'p2', classPeriod: 'Period 3', createdAt: '2026-09-04T16:00:00.000Z', evidence: { dateKey: '2026-09-04', attendanceMark: 'absent' } },
    ],
    classPeriod: 'Period 2',
    dateKey: '2026-09-04',
  });
  assert.equal(result.p1.mark, 'absent');
  assert.equal(result.p2, undefined);
});

test('attendance event is explicitly day scoped and late starts participation clock', () => {
  const event = buildLiveAttendanceEvent({
    student: { id: 's1', displayName: 'Student One', classPeriod: 'Period 4' },
    mark: LIVE_ATTENDANCE_MARK.LATE,
    classId: 'c4',
    classPeriod: 'Period 4',
    nowValue: noon,
    dateKey: '2026-09-04',
  });

  assert.equal(event.kind, LIVE_ATTENDANCE_EVENT_KIND);
  assert.equal(event.studentId, 's1');
  assert.equal(event.classId, 'c4');
  assert.equal(event.evidence.dateKey, '2026-09-04');
  assert.equal(event.evidence.attendanceMark, 'late');
  assert.equal(event.evidence.arrivedAt, noon);
  assert.match(event.summary, /Late/);
});

test('present action also resets participation clock after an absence', () => {
  const event = buildLiveAttendanceEvent({
    student: { id: 's1' }, mark: LIVE_ATTENDANCE_MARK.PRESENT,
    nowValue: noon, dateKey: '2026-09-04',
  });
  assert.equal(event.evidence.arrivedAt, noon);
});

test('only absent-like marks are excluded from live monitoring', () => {
  assert.equal(attendanceIsAbsent('absent'), true);
  assert.equal(attendanceIsAbsent({ mark: 'excused' }), true);
  assert.equal(attendanceIsAbsent({ mark: 'unexcused' }), true);
  assert.equal(attendanceIsAbsent({ mark: 'late' }), false);
  assert.equal(attendanceIsAbsent({ mark: 'present' }), false);
  assert.equal(attendanceIsAbsent(null), false);
});