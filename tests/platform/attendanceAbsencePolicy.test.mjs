import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { normalizeSchedule, DEFAULT_CLASS_SCHEDULE } from '../../src/assignmentLifecycle.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import {
  MEETING_STATUS,
  classifySchoolDay,
  extendDueByClassMeetings,
  localDateKeyOf,
  nextClassMeetings,
  shiftDateKey,
} from '../../src/platform/attendance/classMeetings.js';
import {
  ATTENDANCE_MARK,
  applyUnexcusedPenalty,
  extensionMeetingsFor,
  normalizeAbsencePolicy,
  resolveAssignmentAttendance,
  summarizeAssignmentAbsences,
} from '../../src/platform/attendance/absencePolicy.js';

const require = createRequire(import.meta.url);

const CLOSED = buildNonInstructionalSet(schoolYearNonInstructionalRanges());

const period = (enabled, start = '09:00', end = '09:50') => ({ enabled, start, end });

// Period 3 sits on A days only; Period 5 sits on both. This is the whole reason
// the extension cannot be counted in calendar days.
const schedule = normalizeSchedule({
  ...DEFAULT_CLASS_SCHEDULE,
  daySchedules: {
    A: { periods: { 'Period 3': period(true), 'Period 5': period(true, '13:00', '13:50') } },
    B: { periods: { 'Period 3': period(false), 'Period 5': period(true, '13:00', '13:50') } },
  },
});

const dayOf = (dateKey, classPeriod = 'Period 3') => classifySchoolDay({
  schedule, classPeriod, dateKey, nonInstructionalKeys: CLOSED,
});

test('a date is a meeting only when the calendar, the rotation and the period all agree', () => {
  // Monday is an A day and Period 3 sits on A days.
  assert.equal(dayOf('2026-08-31').status, MEETING_STATUS.MEETS);
  assert.equal(dayOf('2026-08-31').dayType, 'A');

  // Tuesday is a B day. Period 3 does not sit, so a student absent Tuesday
  // missed nothing in this class and has earned no extension.
  assert.equal(dayOf('2026-09-01').status, MEETING_STATUS.NO_CLASS);
  assert.equal(dayOf('2026-09-01', 'Period 5').status, MEETING_STATUS.MEETS);

  // 4 September is a district professional-development day and 7 September is
  // Labor Day. School being closed is not the same as this class not sitting.
  assert.equal(dayOf('2026-09-04').status, MEETING_STATUS.NOT_IN_SESSION);
  assert.equal(dayOf('2026-09-04').reason, 'school_closed');
  assert.equal(dayOf('2026-09-07').status, MEETING_STATUS.NOT_IN_SESSION);

  assert.equal(dayOf('2026-09-05').reason, 'weekend');
  assert.equal(dayOf('2026-09-06').status, MEETING_STATUS.NOT_IN_SESSION);
});

test('an undesignated Friday is reported, not guessed', () => {
  // weeklyDayTypes leaves Friday null on purpose: the school alternates it and
  // the teacher designates it that morning. Guessing would move a real deadline
  // on a guess.
  const friday = dayOf('2026-09-11', 'Period 5');
  assert.equal(friday.status, MEETING_STATUS.UNDETERMINED);
  assert.equal(friday.reason, 'ab_day_not_designated');

  // Once designated it resolves like any other day.
  const designated = classifySchoolDay({
    schedule: { ...schedule, dayTypeOverrides: { '2026-09-11': 'A' } },
    classPeriod: 'Period 3',
    dateKey: '2026-09-11',
    nonInstructionalKeys: CLOSED,
  });
  assert.equal(designated.status, MEETING_STATUS.MEETS);
  assert.equal(designated.dayType, 'A');
});

test('a date-specific bell schedule outranks the rotation', () => {
  // An assembly schedule that drops Period 3 means the class did not meet, even
  // though the rotation says it was an A day.
  const modified = classifySchoolDay({
    schedule: { ...schedule, modifiedSchedules: { '2026-08-31': { periods: { 'Period 3': period(false) } } } },
    classPeriod: 'Period 3',
    dateKey: '2026-08-31',
    nonInstructionalKeys: CLOSED,
  });
  assert.equal(modified.status, MEETING_STATUS.NO_CLASS);
  assert.equal(modified.reason, 'modified_schedule');
});

test('two missed class days is nine calendar days, which is the entire point', () => {
  // Period 3 after Monday 31 August: Wednesday the 2nd, then the 9th, because
  // Friday the 4th is a PD day and Monday the 7th is Labor Day. A deadline
  // counted in calendar days would expire before the student is in the room.
  const found = nextClassMeetings({
    schedule, classPeriod: 'Period 3', fromDateKey: '2026-08-31', count: 2, nonInstructionalKeys: CLOSED,
  });
  assert.deepEqual(found.meetings, ['2026-09-02', '2026-09-09']);
  assert.equal(found.exhausted, false);

  const extended = extendDueByClassMeetings({
    schedule, classPeriod: 'Period 3', dueAt: new Date(2026, 7, 31, 23, 59), classMeetings: 2, nonInstructionalKeys: CLOSED,
  });
  assert.equal(extended.dateKey, '2026-09-09');
  assert.equal(extended.meetingsGranted, 2);
  // The extended deadline is the end of that school day, matching how a
  // date-only due date is already read everywhere else.
  assert.equal(extended.dueAt.getHours(), 23);
  assert.equal(extended.dueAt.getMinutes(), 59);
});

test('an unresolved date pushes the deadline later and says so, rather than guessing earlier', () => {
  // Period 5 sits every day, so the undesignated Friday the 11th is the only
  // thing standing between the 10th and the 14th. Skipping it can only make the
  // deadline later, so uncertainty never costs the student a day.
  const extended = extendDueByClassMeetings({
    schedule, classPeriod: 'Period 5', dueAt: new Date(2026, 8, 10, 23, 59), classMeetings: 1, nonInstructionalKeys: CLOSED,
  });
  assert.equal(extended.resolved, false);
  assert.deepEqual(extended.undetermined, ['2026-09-11']);
  assert.equal(extended.dateKey, '2026-09-14');
});

test('no absences means the due date does not move at all', () => {
  const due = new Date(2026, 7, 31, 23, 59);
  const extended = extendDueByClassMeetings({
    schedule, classPeriod: 'Period 3', dueAt: due, classMeetings: 0, nonInstructionalKeys: CLOSED,
  });
  assert.equal(extended.dueAt, due);
  assert.equal(extended.meetingsGranted, 0);
  assert.equal(extended.resolved, true);
});

test('a due date at 8pm Central still counts from the right calendar day', () => {
  // curriculumCalendar reads Date objects with UTC getters; an evening local
  // time is already tomorrow in UTC. Date keys are used throughout so that
  // off-by-one cannot happen.
  assert.equal(localDateKeyOf(new Date(2026, 7, 31, 20, 0)), '2026-08-31');
  assert.equal(localDateKeyOf(new Date(2026, 7, 31, 23, 59, 59)), '2026-08-31');
  assert.equal(shiftDateKey('2026-08-31', 1), '2026-09-01');
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
});

test('only marked absences on days this class met bear on an assignment', () => {
  const summary = summarizeAssignmentAbsences({
    fromDateKey: '2026-08-31',
    toDateKey: '2026-09-09',
    marks: [
      { dateKey: '2026-08-31', mark: ATTENDANCE_MARK.EXCUSED, classMet: true },
      { dateKey: '2026-09-02', mark: ATTENDANCE_MARK.UNEXCUSED, classMet: true },
      { dateKey: '2026-09-09', mark: ATTENDANCE_MARK.PRESENT, classMet: true },
      // A day this class did not sit: the student missed nothing here.
      { dateKey: '2026-09-01', mark: ATTENDANCE_MARK.EXCUSED, classMet: false },
      // Outside the assignment window.
      { dateKey: '2026-08-20', mark: ATTENDANCE_MARK.UNEXCUSED, classMet: true },
      { dateKey: '2026-09-30', mark: ATTENDANCE_MARK.UNEXCUSED, classMet: true },
    ],
  });

  assert.equal(summary.excused, 1);
  assert.equal(summary.unexcused, 1);
  assert.equal(summary.absent, 2);
  assert.equal(summary.pending, false);
});

test('a day the teacher has not reconciled holds the grade rather than moving it', () => {
  const summary = summarizeAssignmentAbsences({
    marks: [{ dateKey: '2026-09-02', mark: ATTENDANCE_MARK.UNMARKED, classMet: true }],
  });
  assert.equal(summary.pending, true);
  assert.equal(summary.absent, 0);
  // Nothing about an unmarked day is a penalty or an extension.
  assert.equal(extensionMeetingsFor({ absences: summary }), 0);
  assert.equal(applyUnexcusedPenalty({ score: 80, absences: summary, policy: { unexcusedPenaltyEnabled: true } }).applied, false);
});

test('every absence extends the deadline, whatever the reason for it', () => {
  // A student who skipped is still responsible for the work, so the extension
  // is about opportunity rather than fault. The points are the separate lever.
  assert.equal(extensionMeetingsFor({ absences: { excused: 2, unexcused: 1 } }), 3);
  assert.equal(extensionMeetingsFor({ absences: { excused: 0, unexcused: 2 } }), 2);

  // A teacher who wants relief for excused absences only can say so.
  assert.equal(extensionMeetingsFor({
    absences: { excused: 1, unexcused: 3 }, policy: { extendForUnexcused: false },
  }), 1);

  // And a long absence cannot extend a deadline into the next grading period.
  assert.equal(extensionMeetingsFor({
    absences: { excused: 40, unexcused: 0 }, policy: { maxExtensionMeetings: 5 },
  }), 5);

  assert.equal(extensionMeetingsFor({ absences: { excused: 3 }, policy: { extensionEnabled: false } }), 0);
});

test('the unexcused penalty is off until a teacher turns it on for their class', () => {
  const absences = { excused: 0, unexcused: 2 };
  assert.equal(normalizeAbsencePolicy().unexcusedPenaltyEnabled, false);
  assert.equal(applyUnexcusedPenalty({ score: 90, absences }).score, 90);
  assert.equal(applyUnexcusedPenalty({ score: 90, absences }).reason, 'penalty_not_enabled');

  const on = { unexcusedPenaltyEnabled: true, unexcusedPenaltyPointsPerAbsence: 10 };
  assert.equal(applyUnexcusedPenalty({ score: 90, absences, policy: on }).score, 70);
  assert.equal(applyUnexcusedPenalty({ score: 90, absences, policy: on }).pointsDeducted, 20);
});

test('an excused absence never costs a point', () => {
  const on = { unexcusedPenaltyEnabled: true, unexcusedPenaltyPointsPerAbsence: 10 };
  const result = applyUnexcusedPenalty({ score: 88, absences: { excused: 4, unexcused: 0 }, policy: on });
  assert.equal(result.score, 88);
  assert.equal(result.reason, 'no_unexcused_absences');
});

test('the penalty is capped and floored so a run of absences cannot erase real work', () => {
  const on = {
    unexcusedPenaltyEnabled: true,
    unexcusedPenaltyPointsPerAbsence: 10,
    unexcusedPenaltyMaxPoints: 30,
    unexcusedPenaltyFloor: 50,
  };
  // Six unexcused absences deduct 30, not 60.
  assert.equal(applyUnexcusedPenalty({ score: 100, absences: { unexcused: 6 }, policy: on }).score, 70);
  // The floor stops the deduction before it eats a passing grade.
  assert.equal(applyUnexcusedPenalty({ score: 62, absences: { unexcused: 3 }, policy: on }).score, 50);
  // A student already below the floor keeps what they earned; the floor is not
  // a free lift for having been absent.
  assert.equal(applyUnexcusedPenalty({ score: 40, absences: { unexcused: 3 }, policy: on }).score, 40);
  assert.equal(applyUnexcusedPenalty({ score: 40, absences: { unexcused: 3 }, policy: on }).reason, 'floor_reached');
});

test('no score is not a zero to be penalized', () => {
  // Number(null) is 0. Without a strict guard, a student with nothing submitted
  // yet is handed a penalized zero their family can see.
  const on = { unexcusedPenaltyEnabled: true };
  for (const empty of [null, undefined, '', false, 'nope']) {
    const result = applyUnexcusedPenalty({ score: empty, absences: { unexcused: 2 }, policy: on });
    assert.equal(result.score, null, `score ${String(empty)} must stay absent`);
    assert.equal(result.reason, 'no_score_to_penalize');
  }
  // A real zero is a real zero and stays one.
  assert.equal(applyUnexcusedPenalty({ score: 0, absences: { unexcused: 2 }, policy: on }).score, 0);
});

test('a malformed stored policy falls back to the defaults rather than to NaN', () => {
  const rules = normalizeAbsencePolicy({
    meetingsPerMissedMeeting: 'lots',
    unexcusedPenaltyPointsPerAbsence: null,
    unexcusedPenaltyFloor: 900,
    maxExtensionMeetings: -4,
    extensionEnabled: 'yes',
  });
  assert.equal(rules.meetingsPerMissedMeeting, 1);
  assert.equal(rules.unexcusedPenaltyPointsPerAbsence, 10);
  assert.equal(rules.unexcusedPenaltyFloor, 100);
  assert.equal(rules.maxExtensionMeetings, 0);
  assert.equal(rules.extensionEnabled, true);
});

test('the extension and the deduction are resolved together, never one without the other', () => {
  const verdict = resolveAssignmentAttendance({
    score: 95,
    fromDateKey: '2026-08-31',
    toDateKey: '2026-09-09',
    policy: { unexcusedPenaltyEnabled: true, unexcusedPenaltyPointsPerAbsence: 5 },
    marks: [
      { dateKey: '2026-08-31', mark: ATTENDANCE_MARK.EXCUSED, classMet: true },
      { dateKey: '2026-09-02', mark: ATTENDANCE_MARK.UNEXCUSED, classMet: true },
    ],
  });

  assert.equal(verdict.extensionMeetings, 2);
  assert.equal(verdict.penalty.score, 90);
  assert.equal(verdict.absences.pending, false);
});

test('the modules stay pure, so grade effects can be tested without a live class', () => {
  const fs = require('node:fs');
  for (const file of ['src/platform/attendance/classMeetings.js', 'src/platform/attendance/absencePolicy.js']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /firebase|getFirestore|fetch\(|firebase-admin/, `${file} must stay pure`);
  }
});
