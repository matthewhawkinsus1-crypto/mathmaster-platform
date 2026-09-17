import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE } from '../../src/assignmentLifecycle.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import {
  MEETING_STATUS,
  classifySchoolDay,
  previousActualMeetingDateKey,
  previousClassMeetings,
} from '../../src/platform/attendance/classMeetings.js';
import {
  ATTENDANCE_HISTORY_EVENT_KIND,
  attendanceEventsForStudentDay,
  attendanceHistoryMarkIsAbsent,
  attendanceMarksForStudentRange,
  buildAttendanceHistoryEvent,
  effectiveAttendanceForClassDay,
  effectiveAttendanceForStudentDay,
} from '../../src/platform/attendance/attendanceHistory.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../../src/platform/teacher/liveAttendance.js';

const CLOSED = buildNonInstructionalSet(schoolYearNonInstructionalRanges());
const period = (enabled, start = '09:00', end = '09:50') => ({ enabled, start, end });

// Period 3 sits on A days only, same fixture shape as attendanceAbsencePolicy.test.mjs.
const schedule = normalizeSchedule({
  ...DEFAULT_CLASS_SCHEDULE,
  daySchedules: {
    A: { periods: { 'Period 3': period(true) } },
    B: { periods: { 'Period 3': period(false) } },
  },
});

test('the previous calendar day is not assumed to be the previous meeting', () => {
  // Monday 31 Aug is an A day (meets). Tuesday 1 Sept is a B day (no class).
  // The previous meeting before Wednesday 2 Sept is Monday, not Tuesday.
  const previous = previousActualMeetingDateKey({
    schedule, classPeriod: 'Period 3', fromDateKey: '2026-09-02', nonInstructionalKeys: CLOSED,
  });
  assert.equal(previous, '2026-08-31');
});

test('A/B previous actual meeting resolution skips the non-meeting day entirely', () => {
  const found = previousClassMeetings({
    schedule, classPeriod: 'Period 3', fromDateKey: '2026-09-09', count: 2, nonInstructionalKeys: CLOSED,
  });
  // Same fixture as the forward test in attendanceAbsencePolicy.test.mjs, reversed.
  assert.deepEqual(found.meetings, ['2026-08-31', '2026-09-02']);
});

test('weekend and noninstructional dates are never reported as the previous meeting', () => {
  // Monday 7 Sept is Labor Day; the previous meeting before it must skip
  // straight back to a real instructional A day, not stop at the holiday.
  const previous = previousActualMeetingDateKey({
    schedule, classPeriod: 'Period 3', fromDateKey: '2026-09-09', nonInstructionalKeys: CLOSED,
  });
  assert.equal(previous, '2026-09-02');
  assert.equal(classifySchoolDay({ schedule, classPeriod: 'Period 3', dateKey: '2026-09-07', nonInstructionalKeys: CLOSED }).status, MEETING_STATUS.NOT_IN_SESSION);
});

test('an undesignated Friday going backward is skipped, not guessed, so the previous meeting can only be further back', () => {
  const scheduleWithFriday = normalizeSchedule({
    ...DEFAULT_CLASS_SCHEDULE,
    daySchedules: {
      A: { periods: { 'Period 5': period(true) } },
      B: { periods: { 'Period 5': period(true) } },
    },
  });
  const result = previousClassMeetings({
    schedule: scheduleWithFriday, classPeriod: 'Period 5', fromDateKey: '2026-09-14', count: 1, nonInstructionalKeys: CLOSED,
  });
  assert.deepEqual(result.undetermined, ['2026-09-11']);
  assert.equal(result.meetings[0], '2026-09-10');
});

test('a teacher can correct a past date, and the newest event determines the effective mark', () => {
  const events = [
    {
      kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1',
      createdAt: '2026-09-02T14:05:00.000Z',
      evidence: { dateKey: '2026-09-02', attendanceMark: 'absent' },
    },
    {
      kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's1', classId: 'c1',
      createdAt: '2026-09-05T09:00:00.000Z',
      evidence: { dateKey: '2026-09-02', mark: 'excused', priorMark: 'unexcused', correctedAt: Date.parse('2026-09-05T09:00:00.000Z') },
    },
  ];

  const effective = effectiveAttendanceForStudentDay({
    supportEvents: events, studentId: 's1', classId: 'c1', dateKey: '2026-09-02',
  });
  assert.equal(effective.mark, 'excused');
  assert.equal(effective.markSource, 'historyCorrection');
});

test('the old event remains in the audit trail after a correction', () => {
  const events = [
    { kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-09-02T14:05:00.000Z', evidence: { dateKey: '2026-09-02', attendanceMark: 'absent' } },
    { kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-09-05T09:00:00.000Z', evidence: { dateKey: '2026-09-02', mark: 'excused' } },
  ];
  const trail = attendanceEventsForStudentDay({ supportEvents: events, studentId: 's1', classId: 'c1', dateKey: '2026-09-02' });
  assert.equal(trail.length, 2);
  assert.equal(trail[0].mark, 'excused');
  assert.equal(trail[1].mark, 'absent'); // the original live quick-mark, unclassified — never assumed unexcused
  assert.equal(trail[1].markSource, 'liveQuickMark');
});

test('a bare live "absent" quick-mark is not yet classified', () => {
  const events = [{ kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-09-02T14:05:00.000Z', evidence: { dateKey: '2026-09-02', attendanceMark: 'absent' } }];
  const effective = effectiveAttendanceForStudentDay({ supportEvents: events, studentId: 's1', classId: 'c1', dateKey: '2026-09-02' });
  assert.equal(effective.classified, false);
  assert.equal(attendanceHistoryMarkIsAbsent(effective.mark), true);
});

test('effectiveAttendanceForClassDay resolves every student in one pass', () => {
  const events = [
    { kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-09-02T14:00:00.000Z', evidence: { dateKey: '2026-09-02', attendanceMark: 'present' } },
    { kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's2', classId: 'c1', createdAt: '2026-09-02T15:00:00.000Z', evidence: { dateKey: '2026-09-02', mark: 'excused' } },
  ];
  const byStudent = effectiveAttendanceForClassDay({ supportEvents: events, classId: 'c1', dateKey: '2026-09-02' });
  assert.equal(byStudent.s1.mark, 'present');
  assert.equal(byStudent.s2.mark, 'excused');
});

test('buildAttendanceHistoryEvent records the prior mark as audit context', () => {
  const event = buildAttendanceHistoryEvent({
    student: { id: 's1', displayName: 'Jordan Lee' },
    mark: 'excused',
    classId: 'c1',
    dateKey: '2026-09-02',
    reason: 'Doctor visit, note on file',
    actorEmail: 'teacher@school.org',
    nowValue: Date.parse('2026-09-05T09:00:00.000Z'),
    priorMark: 'unexcused',
    priorMarkSource: 'liveQuickMark',
  });
  assert.equal(event.kind, 'attendanceHistory');
  assert.equal(event.evidence.mark, 'excused');
  assert.equal(event.evidence.priorMark, 'unexcused');
  assert.equal(event.evidence.reason, 'Doctor visit, note on file');
  assert.match(event.summary, /Excused absence/);
});

test('an unsupported mark is rejected rather than silently stored', () => {
  assert.throws(() => buildAttendanceHistoryEvent({ student: { id: 's1' }, mark: 'tardy-ish', dateKey: '2026-09-02' }));
});

test('attendanceMarksForStudentRange only counts days the class actually met, and holds unmarked days as unmarked', () => {
  const events = [
    { kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-08-31T09:00:00.000Z', evidence: { dateKey: '2026-08-31', mark: 'excused' } },
    { kind: LIVE_ATTENDANCE_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-09-02T09:00:00.000Z', evidence: { dateKey: '2026-09-02', attendanceMark: 'present' } },
    // 2026-09-01 is a B day: Period 3 does not meet, so a mark that day (if any) would never appear here.
  ];
  const marks = attendanceMarksForStudentRange({
    supportEvents: events, studentId: 's1', classId: 'c1', classPeriod: 'Period 3', schedule,
    fromDateKey: '2026-08-31', toDateKey: '2026-09-09', nonInstructionalKeys: CLOSED,
  });
  const byDate = Object.fromEntries(marks.map((entry) => [entry.dateKey, entry.mark]));
  assert.equal(byDate['2026-08-31'], 'excused');
  assert.equal(byDate['2026-09-02'], 'present');
  // 09-09 is the next A-day meeting after 09-02 and has no recorded mark.
  assert.equal(byDate['2026-09-09'], 'unmarked');
  assert.equal('2026-09-01' in byDate, false);
});
