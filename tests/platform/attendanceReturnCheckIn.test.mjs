import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE } from '../../src/assignmentLifecycle.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from '../../src/platform/teacher/liveAttendance.js';
import { ATTENDANCE_HISTORY_EVENT_KIND } from '../../src/platform/attendance/attendanceHistory.js';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../../src/platform/teacher/studentSupportSignals.js';
import {
  buildReturnCheckInEvent,
  resolveReturnCheckIns,
} from '../../src/platform/attendance/returnCheckIn.js';

const CLOSED = buildNonInstructionalSet(schoolYearNonInstructionalRanges());
const period = (enabled) => ({ enabled, start: '09:00', end: '09:50' });
const schedule = normalizeSchedule({
  ...DEFAULT_CLASS_SCHEDULE,
  daySchedules: {
    A: { periods: { 'Period 3': period(true) } },
    B: { periods: { 'Period 3': period(false) } },
  },
});

const roster = [{ id: 's1', displayName: 'Jordan Lee', classPeriod: 'Period 3' }];

const absentEvent = (dateKey, studentId = 's1') => ({
  kind: LIVE_ATTENDANCE_EVENT_KIND, studentId, classId: 'c1', createdAt: `${dateKey}T09:00:00.000Z`,
  evidence: { dateKey, attendanceMark: 'absent' },
});
const presentEvent = (dateKey, studentId = 's1', mark = 'present') => ({
  kind: LIVE_ATTENDANCE_EVENT_KIND, studentId, classId: 'c1', createdAt: `${dateKey}T09:00:00.000Z`,
  evidence: { dateKey, attendanceMark: mark },
});

test('absent at the previous meeting + present today produces a return reminder', () => {
  const candidates = resolveReturnCheckIns({
    roster, supportEvents: [absentEvent('2026-08-31'), presentEvent('2026-09-02')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].studentName, 'Jordan Lee');
  assert.equal(candidates[0].meetingsMissed, 1);
  assert.deepEqual(candidates[0].missedMeetingDates, ['2026-08-31']);
  assert.equal(candidates[0].status, 'open');
});

test('absent at the previous meeting + late today ALSO produces a return reminder', () => {
  const candidates = resolveReturnCheckIns({
    roster, supportEvents: [absentEvent('2026-08-31'), presentEvent('2026-09-02', 's1', 'late')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].returnMark, 'late');
});

test('still absent today is never "back today"', () => {
  const candidates = resolveReturnCheckIns({
    roster, supportEvents: [absentEvent('2026-08-31'), absentEvent('2026-09-02')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(candidates.length, 0);
});

test('no attendance record at all today is never assumed to be a return', () => {
  const candidates = resolveReturnCheckIns({
    roster, supportEvents: [absentEvent('2026-08-31')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(candidates.length, 0);
});

test('multiple consecutive missed meetings summarize as one run, oldest first', () => {
  const candidates = resolveReturnCheckIns({
    roster,
    supportEvents: [absentEvent('2026-08-31'), absentEvent('2026-09-02'), presentEvent('2026-09-09')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-09',
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].meetingsMissed, 2);
  assert.deepEqual(candidates[0].missedMeetingDates, ['2026-08-31', '2026-09-02']);
  assert.equal(candidates[0].lastMissedDateKey, '2026-09-02');
});

test('missed instruction links to an assignment actually taught that meeting', () => {
  const assignments = [{
    id: 'a1', title: 'Writing Linear Equations from Data', assignedClassIds: ['c1'],
    warmup: { enabled: true, instructionDate: '2026-08-31' },
  }];
  const candidates = resolveReturnCheckIns({
    roster, assignments, supportEvents: [absentEvent('2026-08-31'), presentEvent('2026-09-02')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(candidates[0].missedWork.length, 1);
  assert.equal(candidates[0].missedWork[0].title, 'Writing Linear Equations from Data');
});

test('no identifiable lesson is reported honestly, never guessed', () => {
  const candidates = resolveReturnCheckIns({
    roster, assignments: [], supportEvents: [absentEvent('2026-08-31'), presentEvent('2026-09-02')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.deepEqual(candidates[0].missedWork, []);
});

test('a completed check-in persists and the reminder does not keep reopening for the same absence', () => {
  const supportEvents = [absentEvent('2026-08-31'), presentEvent('2026-09-02')];
  const beforeCheckIn = resolveReturnCheckIns({
    roster, supportEvents, classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(beforeCheckIn[0].status, 'open');

  const checkInEvent = buildReturnCheckInEvent({ candidate: beforeCheckIn[0], note: 'Caught up on the missed warm-up.', actorEmail: 'teacher@school.org', nowValue: Date.parse('2026-09-02T10:00:00.000Z') });
  checkInEvent.createdAt = '2026-09-02T10:00:00.000Z';
  checkInEvent.createdByEmail = 'teacher@school.org';

  const afterCheckIn = resolveReturnCheckIns({
    roster, supportEvents: [...supportEvents, checkInEvent],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(afterCheckIn[0].status, 'completed');
  assert.equal(afterCheckIn[0].completedByEmail, 'teacher@school.org');
  assert.equal(afterCheckIn[0].note, 'Caught up on the missed warm-up.');
});

test('a dismissed check-in is distinguished from a completed one', () => {
  const supportEvents = [absentEvent('2026-08-31'), presentEvent('2026-09-02')];
  const beforeCheckIn = resolveReturnCheckIns({
    roster, supportEvents, classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  const dismissEvent = buildReturnCheckInEvent({ candidate: beforeCheckIn[0], dismissed: true, actorEmail: 'teacher@school.org' });
  assert.equal(dismissEvent.stage, SUPPORT_EVENT_STAGE.DISMISSED);
  dismissEvent.createdAt = '2026-09-02T10:00:00.000Z';

  const afterDismiss = resolveReturnCheckIns({
    roster, supportEvents: [...supportEvents, dismissEvent],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(afterDismiss[0].status, 'dismissed');
});

test('a return check-in event carries the returnFromAbsence kind for a future Operations hub', () => {
  const candidate = {
    key: 's1|c1|2026-08-31', studentId: 's1', studentName: 'Jordan Lee', classId: 'c1', classPeriod: 'Period 3',
    missedMeetingDates: ['2026-08-31'], lastMissedDateKey: '2026-08-31', returnDateKey: '2026-09-02', meetingsMissed: 1, missedWork: [],
  };
  const event = buildReturnCheckInEvent({ candidate, actorEmail: 'teacher@school.org' });
  assert.equal(event.kind, SUPPORT_EVENT_KIND.RETURN_FROM_ABSENCE);
  assert.equal(event.evidence.absenceSpan.meetingsMissed, 1);
});

test('an attendance correction to Excused for the same date does not change today\'s return status', () => {
  const correctedEvent = { kind: ATTENDANCE_HISTORY_EVENT_KIND, studentId: 's1', classId: 'c1', createdAt: '2026-09-01T09:00:00.000Z', evidence: { dateKey: '2026-08-31', mark: 'excused' } };
  const candidates = resolveReturnCheckIns({
    roster, supportEvents: [absentEvent('2026-08-31'), correctedEvent, presentEvent('2026-09-02')],
    classId: 'c1', classPeriod: 'Period 3', schedule, nonInstructionalKeys: CLOSED, todayDateKey: '2026-09-02',
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, 'open');
});
