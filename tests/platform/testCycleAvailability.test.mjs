/*
 * WHEN A TEST CYCLE IS OPEN: the class-time Test window and the home window.
 *
 * The rules in functions/shared/testCycleAvailability.mjs, with the bell
 * schedule the platform stores and a fixed "now". Every instant is built in
 * the school's zone and every label is asked for in it, so these read the
 * same on a developer's machine in Chicago and on a CI runner in UTC.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOLLOW_UP_CLOSE,
  TEST_AVAILABILITY_POLICY,
  WINDOW_STATE,
  defaultFollowUpClose,
  describeFollowUpWindow,
  classNeedsNewTestDay,
  describeTestWindow,
  classSittingId,
  classSittingToRecord,
  followUpRefusal,
  formatSchoolDateTime,
  formatSchoolRange,
  normalizeStudentAvailability,
  normalizeTestAvailability,
  resolveClassPeriodDay,
  resolveClassWindows,
  resolveFollowUpWindow,
  resolveStudentTestCycleSchedule,
  resolveTestWindowStatus,
  testWindowRefusal,
  upcomingClassPeriodDays,
  withClassCustomWindow,
  withClassTestDay,
  withClassWindowExtended,
  withFollowUpClose,
  withStudentFollowUpClose,
  withStudentTestWindow,
  withTestPolicy,
  withoutClassWindows,
} from '../../functions/shared/testCycleAvailability.mjs';
import { zonedInstant } from '../../functions/shared/instructionalCalendar.mjs';
import { studentMissedOriginalTest } from '../../functions/shared/testCycleStages.mjs';

const TZ = 'America/Chicago';
const at = (year, month, day, hour = 0, minute = 0) => zonedInstant({ year, month, day, hour, minute }, TZ);

/*
 * An A/B rotation: Period 3 sits 10:15–11:05 on A days only; Period 4 sits
 * 12:30–13:20 on B days only. Mon/Wed are A, Tue/Thu are B, and Friday is
 * designated that morning (null) — exactly how the school stores it.
 */
const bell = {
  version: 2,
  daySchedules: {
    A: { periods: { 'Period 3': { enabled: true, start: '10:15', end: '11:05' } } },
    B: { periods: { 'Period 4': { enabled: true, start: '12:30', end: '13:20' } } },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  // A late-start Wednesday: every period moves.
  modifiedSchedules: { '2026-10-21': { periods: { 'Period 3': { enabled: true, start: '11:30', end: '12:10' } } } },
  dayTypeOverrides: { '2026-10-23': 'A' },
};
// Monday 12 Oct 2026 is an A day; Tuesday 13 is B; Wednesday 14 is A.
const MON = '2026-10-12';
const WED = '2026-10-14';
const FRI_UNSET = '2026-10-16';
const FRI_SET = '2026-10-23';
const SAT = '2026-10-17';

const assignment = (testAvailability = null, extra = {}) => ({
  dueAt: '2026-10-16T23:59:00-05:00',
  lateDueAt: '2026-10-20',
  ...(testAvailability ? { testAvailability } : {}),
  ...extra,
});
const scheduleFor = (config, now, { classId = 'c3', classPeriod = 'Period 3', studentAvailability = null } = {}) => (
  resolveStudentTestCycleSchedule({ assignment: config, classId, classPeriod, schedule: bell, studentAvailability, now, timeZone: TZ })
);

test('a class period day is read from the bell schedule, in the school\'s zone', () => {
  const monday = resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 3', dateKey: MON, timeZone: TZ });
  assert.equal(monday.resolved, true);
  assert.equal(monday.opensAt, at(2026, 10, 12, 10, 15));
  assert.equal(monday.closesAt, at(2026, 10, 12, 11, 5));
  assert.equal(monday.dayType, 'A');
  // The same day is not a meeting for a B-day class.
  const mondayB = resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 4', dateKey: MON, timeZone: TZ });
  assert.deepEqual([mondayB.resolved, mondayB.pending, mondayB.reason], [false, false, 'noClassThatDay']);
  // A date-specific modified schedule wins over the rotation.
  const lateStart = resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 3', dateKey: '2026-10-21', timeZone: TZ });
  assert.equal(lateStart.opensAt, at(2026, 10, 21, 11, 30));
  assert.equal(lateStart.modifiedSchedule, true);
  // A Friday nobody has designated cannot be known yet: pending, not refused.
  assert.deepEqual(
    (({ resolved, pending, reason }) => ({ resolved, pending, reason }))(resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 3', dateKey: FRI_UNSET, timeZone: TZ })),
    { resolved: false, pending: true, reason: 'dayTypeNotSet' },
  );
  // Once it is designated it resolves like any other day.
  assert.equal(resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 3', dateKey: FRI_SET, timeZone: TZ }).opensAt, at(2026, 10, 23, 10, 15));
  assert.equal(resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 3', dateKey: SAT, timeZone: TZ }).reason, 'weekend');
  assert.equal(resolveClassPeriodDay({ schedule: bell, classPeriod: '', dateKey: MON, timeZone: TZ }).reason, 'incomplete');
  // Standard time and daylight time are both the school's wall clock.
  const winter = resolveClassPeriodDay({ schedule: bell, classPeriod: 'Period 3', dateKey: '2027-01-11', timeZone: TZ });
  assert.equal(formatSchoolDateTime(winter.opensAt, TZ), 'Mon, Jan 11, 10:15 AM CST');
  assert.equal(formatSchoolDateTime(monday.opensAt, TZ), 'Mon, Oct 12, 10:15 AM CDT');
});

test('the days offered to a teacher are the days the class actually sits', () => {
  const offered = upcomingClassPeriodDays({ schedule: bell, classPeriod: 'Period 3', fromDateKey: MON, count: 4, timeZone: TZ });
  // Mon A, Wed A, (Fri undesignated is skipped and reported), Mon A, Wed (late start).
  assert.deepEqual(offered.days.map((day) => day.dateKey), [MON, WED, '2026-10-19', '2026-10-21']);
  assert.deepEqual(offered.pending, [FRI_UNSET]);
  assert.equal(offered.days[3].opensAt, at(2026, 10, 21, 11, 30));
  assert.deepEqual(upcomingClassPeriodDays({ schedule: bell, classPeriod: 'Period 9', fromDateKey: MON, timeZone: TZ }).days, []);
  assert.deepEqual(upcomingClassPeriodDays({ schedule: null, classPeriod: 'Period 3', fromDateKey: 'soon', timeZone: TZ }), { days: [], pending: [] });
});

test('a cycle nobody has set a day for is "unset": nothing is enforced, exactly as before', () => {
  for (const stored of [undefined, null, {}, { classWindows: {} }, { classWindows: { c3: [] } }, 'junk']) {
    const normalized = normalizeTestAvailability(stored);
    assert.equal(normalized.configured, false);
    assert.equal(normalized.policy, TEST_AVAILABILITY_POLICY.CLASS_TIME);
  }
  const schedule = scheduleFor(assignment(), at(2026, 10, 12, 9));
  assert.deepEqual([schedule.test.state, schedule.test.enforced], [WINDOW_STATE.UNSET, false]);
  assert.deepEqual([schedule.followUp.state, schedule.followUp.enforced], [WINDOW_STATE.UNSET, false]);
  assert.equal(testWindowRefusal(schedule.test, { timeZone: TZ }), null);
  assert.equal(followUpRefusal(schedule.followUp, { timeZone: TZ }), null);
  // A class the day was not set for is unset too, even when another class has one.
  const otherClass = scheduleFor(assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON })), at(2026, 10, 12, 9), { classId: 'c4', classPeriod: 'Period 4' });
  assert.equal(otherClass.test.state, WINDOW_STATE.UNSET);
});

test('the Test is upcoming before the bell, open during the period and closed after it', () => {
  const config = assignment(withClassTestDay(null, { classId: 'c3', dateKey: WED, by: 'teacher@example.org', at: 1 }));
  const before = scheduleFor(config, at(2026, 10, 14, 10, 14)).test;
  assert.deepEqual([before.state, before.enforced, before.opensAt, before.closesAt, before.workFromHome],
    [WINDOW_STATE.UPCOMING, true, at(2026, 10, 14, 10, 15), at(2026, 10, 14, 11, 5), false]);
  assert.equal(testWindowRefusal(before, { timeZone: TZ }), 'This Test opens Wed, Oct 14, 10:15 AM CDT, during your class period.');

  const opening = scheduleFor(config, at(2026, 10, 14, 10, 15)).test;
  assert.equal(opening.state, WINDOW_STATE.OPEN, 'open at the bell, not a minute after');
  assert.equal(testWindowRefusal(opening, { timeZone: TZ }), null);
  assert.equal(scheduleFor(config, at(2026, 10, 14, 11, 4)).test.state, WINDOW_STATE.OPEN);

  const closed = scheduleFor(config, at(2026, 10, 14, 11, 5)).test;
  assert.deepEqual([closed.state, closed.closesAt], [WINDOW_STATE.CLOSED, at(2026, 10, 14, 11, 5)]);
  assert.equal(testWindowRefusal(closed, { timeZone: TZ }), 'The Test window closed Wed, Oct 14, 11:05 AM CDT.');
});

test('a second Test day keeps the Test upcoming between the two: nobody has missed it yet', () => {
  let stored = withClassTestDay(null, { classId: 'c3', dateKey: MON });
  stored = withClassTestDay(stored, { classId: 'c3', dateKey: WED, replace: false });
  assert.deepEqual(stored.classWindows.c3.map((window) => window.dateKey), [MON, WED]);
  const between = scheduleFor(assignment(stored), at(2026, 10, 13, 9)).test;
  assert.deepEqual([between.state, between.opensAt], [WINDOW_STATE.UPCOMING, at(2026, 10, 14, 10, 15)]);
  assert.equal(scheduleFor(assignment(stored), at(2026, 10, 14, 12)).test.state, WINDOW_STATE.CLOSED);
  // Setting the day again (the default) replaces it rather than stacking days.
  assert.deepEqual(withClassTestDay(stored, { classId: 'c3', dateKey: '2026-10-19' }).classWindows.c3.map((window) => window.dateKey), ['2026-10-19']);
});

test('a window follows the bell schedule live: a modified day moves it, an undesignated Friday waits', () => {
  const lateStart = scheduleFor(assignment(withClassTestDay(null, { classId: 'c3', dateKey: '2026-10-21' })), at(2026, 10, 21, 10, 30)).test;
  assert.deepEqual([lateStart.state, lateStart.opensAt], [WINDOW_STATE.UPCOMING, at(2026, 10, 21, 11, 30)], 'not the ordinary 10:15');

  const friday = assignment(withClassTestDay(null, { classId: 'c3', dateKey: FRI_UNSET }));
  const waiting = scheduleFor(friday, at(2026, 10, 16, 10, 30)).test;
  assert.deepEqual([waiting.state, waiting.pending, waiting.pendingReason, waiting.opensAt], [WINDOW_STATE.UPCOMING, true, 'dayTypeNotSet', null]);
  assert.match(testWindowRefusal(waiting, { timeZone: TZ }), /set for Fri, Oct 16\. It opens during your class period/);
  assert.match(describeTestWindow(waiting, { timeZone: TZ }).detail, /A\/B day for that date has not been set yet/);
  // Never designated: the day passes without ever having been open, so it is
  // NOT over — "closed" would mark the whole class as having missed the Test
  // and move them to a Retest. It waits, still enforced, for a new Test day.
  const passed = scheduleFor(friday, at(2026, 10, 17, 0, 0)).test;
  assert.deepEqual(
    [passed.state, passed.enforced, passed.stranded, passed.pendingReason, passed.dateKey],
    [WINDOW_STATE.UPCOMING, true, true, 'dayPassedWithoutTimes', FRI_UNSET],
  );
  assert.equal(scheduleFor(friday, at(2026, 11, 30, 9)).test.state, WINDOW_STATE.UPCOMING, 'weeks later, still not missed');
  assert.equal(describeTestWindow(passed, { timeZone: TZ }).detail, 'Fri, Oct 16 passed before the bell schedule gave this class\'s times for it. Your teacher will set a new Test day.');
  const teacherWords = describeTestWindow(passed, { timeZone: TZ, audience: 'teacher' }).detail;
  assert.match(teacherWords, /Students who have not started the Test cannot start it until you set a new Test day or reopen the window/);
  // No claim about who sat or missed it: a window can stop resolving after a class sat it.
  assert.doesNotMatch(teacherWords, /missed/);
  assert.equal(testWindowRefusal(passed, { timeZone: TZ }), 'This Test is waiting for a new Test day. Your teacher will set one.');
  // A stranded day is not a window still to come, so it never holds Corrections
  // and the Retest shut for a student who did sit the Test (a make-up, a window
  // that was real when they sat it). Nobody who did not sit it has either.
  const strandedFollowUp = scheduleFor(friday, at(2026, 10, 17, 0, 0)).followUp;
  assert.deepEqual([strandedFollowUp.state, strandedFollowUp.opensAt], [WINDOW_STATE.OPEN, null]);
  assert.equal(scheduleFor(friday, Date.parse('2026-10-22T12:00:00Z')).followUp.state, WINDOW_STATE.CLOSED, 'and it still ends at the final due date');
  // A class moved off its day after the day passed is not missed either.
  const movedOff = scheduleFor(assignment(withClassTestDay(null, { classId: 'c4', dateKey: MON })), at(2026, 10, 13, 9), { classId: 'c4', classPeriod: 'Period 4' }).test;
  assert.deepEqual([movedOff.state, movedOff.stranded], [WINDOW_STATE.UPCOMING, true]);
  // A class moved off that day: not open, and the teacher is told why.
  const [unresolved] = resolveClassWindows({ availability: withClassTestDay(null, { classId: 'c4', dateKey: MON }), classId: 'c4', classPeriod: 'Period 4', schedule: bell, timeZone: TZ });
  assert.deepEqual([unresolved.resolved, unresolved.pending, unresolved.reason], [false, false, 'noClassThatDay']);
});

test('a meeting that has already ended is never offered or scheduled as the Test day', () => {
  // 13:00 on Monday: Period 3 met 10:15–11:05. Wednesday is the next meeting.
  const afterBell = at(2026, 10, 12, 13);
  const offered = upcomingClassPeriodDays({ schedule: bell, classPeriod: 'Period 3', fromDateKey: MON, count: 2, timeZone: TZ, now: afterBell });
  assert.deepEqual(offered.days.map((day) => day.dateKey), [WED, '2026-10-19']);
  // During the period the meeting is still offered: it has not ended.
  const during = upcomingClassPeriodDays({ schedule: bell, classPeriod: 'Period 3', fromDateKey: MON, count: 1, timeZone: TZ, now: at(2026, 10, 12, 10, 30) });
  assert.deepEqual(during.days.map((day) => day.dateKey), [MON]);
  // With no "now" the list is unchanged: every day from fromDateKey.
  assert.equal(upcomingClassPeriodDays({ schedule: bell, classPeriod: 'Period 3', fromDateKey: MON, count: 1, timeZone: TZ }).days[0].dateKey, MON);

  // A day stored after its meeting ended (an older server, or a bell schedule
  // moved earlier the same day) was never open to anyone: nobody missed it.
  const late = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: afterBell }));
  const [window] = resolveClassWindows({ availability: late.testAvailability, classId: 'c3', classPeriod: 'Period 3', schedule: bell, timeZone: TZ });
  assert.deepEqual([window.resolved, window.pending, window.reason], [false, false, 'endedBeforeSet']);
  const status = scheduleFor(late, afterBell + 60000).test;
  assert.deepEqual([status.state, status.enforced, status.stranded, status.pendingReason], [WINDOW_STATE.UPCOMING, true, true, 'endedBeforeSet']);
  assert.equal(describeTestWindow(status, { timeZone: TZ }).detail, 'Mon, Oct 12\'s class had already ended when it was set as the Test day. Your teacher will set a new Test day.');
  // Saving the same day again keeps when it was FIRST set, so a re-save after
  // the class met cannot turn a day the class sat into "set too late".
  const resaved = withClassTestDay(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9), by: 'first' }), { classId: 'c3', dateKey: MON, at: afterBell, by: 'second' });
  assert.deepEqual([resaved.classWindows.c3[0].at, resaved.classWindows.c3[0].by], [at(2026, 10, 9, 9), 'first']);
  assert.equal(scheduleFor(assignment(resaved), afterBell).test.state, WINDOW_STATE.CLOSED);
  // Set before the bell, the same day closes as usual: a real chance, missed.
  const onTime = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 12, 8) }));
  assert.equal(scheduleFor(onTime, afterBell).test.state, WINDOW_STATE.CLOSED);
  // Set during the period, it is open for the rest of it.
  const midPeriod = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 12, 10, 30) }));
  assert.equal(scheduleFor(midPeriod, at(2026, 10, 12, 10, 40)).test.state, WINDOW_STATE.OPEN);
  // Re-setting to a later day replaces the stranded one with a real window.
  const moved = assignment(withClassTestDay(late.testAvailability, { classId: 'c3', dateKey: WED, at: afterBell + 1 }));
  const movedStatus = scheduleFor(moved, afterBell + 2).test;
  assert.deepEqual([movedStatus.state, movedStatus.stranded, movedStatus.opensAt], [WINDOW_STATE.UPCOMING, undefined, at(2026, 10, 14, 10, 15)]);
  // An extension past the bell, set before the extended close, is a real window.
  const extendedLate = withClassWindowExtended(late.testAvailability, { classId: 'c3', windowId: window.id, closesAt: at(2026, 10, 12, 15), at: afterBell });
  assert.equal(scheduleFor(assignment(extendedLate), afterBell + 60000).test.state, WINDOW_STATE.OPEN);
});

/*
 * A STRANDED DAY NEVER HIDES A WINDOW THAT RAN. When a real window has opened
 * and closed — the teacher's reopen of a stranded day, another day that did
 * resolve, one student's make-up — the Test is closed as it would be without
 * the stranded day: whoever sat it goes on, whoever did not has missed it.
 */
test('a stranded day beside a window that ran and closed: the Test is closed, as it would be without it', () => {
  const FRI = FRI_UNSET; // never designated
  const strandedFri = withClassTestDay(null, { classId: 'c3', dateKey: FRI, at: at(2026, 10, 14, 9) });
  const cases = [
    ['a class reopen after it, now closed', assignment(withClassCustomWindow(strandedFri, { classId: 'c3', opensAt: at(2026, 10, 19, 10, 15), closesAt: at(2026, 10, 19, 11, 5), at: at(2026, 10, 19, 8) })), at(2026, 10, 19, 13), null, at(2026, 10, 19, 11, 5)],
    ['a real day the class sat, plus an added day never designated', assignment(withClassTestDay(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9) }), { classId: 'c3', dateKey: FRI, at: at(2026, 10, 9, 9), replace: false })), at(2026, 10, 19, 9), null, at(2026, 10, 12, 11, 5)],
    ['one student\'s make-up, now closed', assignment(strandedFri), at(2026, 10, 19, 16), withStudentTestWindow(null, { opensAt: at(2026, 10, 19, 14), closesAt: at(2026, 10, 19, 15) }), at(2026, 10, 19, 15)],
  ];
  for (const [label, config, now, studentAvailability, closedAt] of cases) {
    const { test: status, followUp } = scheduleFor(config, now, { studentAvailability });
    assert.deepEqual([status.state, status.stranded, status.closesAt], [WINDOW_STATE.CLOSED, undefined, closedAt], label);
    assert.deepEqual([followUp.state, followUp.opensAt], [WINDOW_STATE.OPEN, closedAt], `${label}: Corrections and the Retest open when it closed`);
  }
  // A reopen still to come is what the class is waiting for, not the stranded day.
  const reopenAhead = assignment(withClassCustomWindow(strandedFri, { classId: 'c3', opensAt: at(2026, 10, 19, 10, 15), closesAt: at(2026, 10, 19, 11, 5) }));
  const ahead = scheduleFor(reopenAhead, at(2026, 10, 19, 9)).test;
  assert.deepEqual([ahead.state, ahead.stranded, ahead.opensAt], [WINDOW_STATE.UPCOMING, undefined, at(2026, 10, 19, 10, 15)]);
});

test('a day the class sat that later stops resolving (rotation, renamed or cleared period) never holds Corrections shut', () => {
  const sat = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9) }));
  const now = at(2026, 10, 14, 9);
  const flipped = { ...bell, weeklyDayTypes: { 1: 'B', 2: 'A', 3: 'B', 4: 'A', 5: null } };
  const renamed = { ...bell, daySchedules: { ...bell.daySchedules, A: { periods: { '3rd Period': { enabled: true, start: '10:15', end: '11:05' } } } } };
  const reads = [
    ['the rotation flipped', resolveStudentTestCycleSchedule({ assignment: sat, classId: 'c3', classPeriod: 'Period 3', schedule: flipped, now, timeZone: TZ })],
    ['the period was renamed', resolveStudentTestCycleSchedule({ assignment: sat, classId: 'c3', classPeriod: 'Period 3', schedule: renamed, now, timeZone: TZ })],
    // The server's Corrections gate reads the period without the grade
    // document, so it can resolve with none at all ("incomplete").
    ['the class has no period', resolveStudentTestCycleSchedule({ assignment: sat, classId: 'c3', classPeriod: null, schedule: bell, now, timeZone: TZ })],
  ];
  for (const [label, schedule] of reads) {
    assert.deepEqual([schedule.test.state, schedule.test.stranded], [WINDOW_STATE.UPCOMING, true], label);
    assert.equal(schedule.followUp.state, WINDOW_STATE.OPEN, `${label}: a student who sat it can do Corrections and the Retest`);
    assert.equal(followUpRefusal(schedule.followUp, { timeZone: TZ }), null, label);
  }
  // Old data: a day the class sat, saved again after it met by an older server
  // (which rewrote `at`). It reads as set too late, and still holds nothing shut.
  const oldResave = assignment({ classWindows: { c3: [{ id: `day-${MON}`, mode: 'classPeriod', dateKey: MON, at: at(2026, 10, 12, 13) }] } });
  const old = scheduleFor(oldResave, at(2026, 10, 12, 15));
  assert.deepEqual([old.test.pendingReason, old.followUp.state], ['endedBeforeSet', WINDOW_STATE.OPEN]);
});

/*
 * THE FIRST TEST START RECORDS THE CLASS SITTING — RECORD-ONLY (student pass
 * 3, wave 7). The first fresh Test start inside a class-period window records
 * the times that day resolved to. Nothing reads them: one student starting
 * the Test (from home, on a day school then closed) looks exactly like a
 * class sitting it, so a day that stops resolving behaves exactly as before
 * — absent students wait, never missed — until the owner decides otherwise.
 */
test('a start inside a class-period window records that day\'s times', () => {
  const sat = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9) }));
  const startedAt = at(2026, 10, 12, 10, 30);
  const live = scheduleFor(sat, startedAt).test;
  assert.equal(live.state, WINDOW_STATE.OPEN);
  const recorded = classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: live.windows, now: startedAt });
  assert.equal(recorded.id, classSittingId({ assignmentId: 'a1', classId: 'c3', dateKey: MON }));
  assert.deepEqual(
    [recorded.data.assignmentId, recorded.data.classId, recorded.data.dateKey, recorded.data.windowId, recorded.data.period, recorded.data.dayType],
    ['a1', 'c3', MON, `day-${MON}`, 'Period 3', 'A'],
  );
  assert.deepEqual([recorded.data.opensAt, recorded.data.closesAt, recorded.data.recordedAt], [at(2026, 10, 12, 10, 15), at(2026, 10, 12, 11, 5), startedAt]);
  // An extension stays on the window: the sitting keeps the bell's close.
  const extended = assignment(withClassWindowExtended(sat.testAvailability, { classId: 'c3', windowId: `day-${MON}`, closesAt: at(2026, 10, 12, 15), at: at(2026, 10, 12, 10) }));
  const late = at(2026, 10, 12, 13);
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: scheduleFor(extended, late).test.windows, now: late }).data.closesAt, at(2026, 10, 12, 11, 5));
});

test('only a start inside a bell-schedule window records a sitting', () => {
  const sat = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9) }));
  const windows = scheduleFor(sat, at(2026, 10, 12, 10, 30)).test.windows;
  // Before the bell, at its close, and without a class or an assignment: nothing.
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: windows, now: at(2026, 10, 12, 10) }), null);
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: windows, now: at(2026, 10, 12, 11, 5) }), null);
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: null, classWindows: windows, now: at(2026, 10, 12, 10, 30) }), null);
  assert.equal(classSittingToRecord({ assignmentId: '', classId: 'c3', classWindows: windows, now: at(2026, 10, 12, 10, 30) }), null);
  // A teacher's reopen, or one student's make-up, carries its own times.
  const reopen = assignment(withClassCustomWindow(null, { classId: 'c3', opensAt: at(2026, 10, 19, 10), closesAt: at(2026, 10, 19, 11) }));
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: scheduleFor(reopen, at(2026, 10, 19, 10, 30)).test.windows, now: at(2026, 10, 19, 10, 30) }), null);
  const makeUp = scheduleFor(sat, at(2026, 10, 19, 14, 30), { studentAvailability: withStudentTestWindow(null, { opensAt: at(2026, 10, 19, 14), closesAt: at(2026, 10, 19, 15) }) });
  assert.equal(makeUp.test.state, WINDOW_STATE.OPEN);
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: makeUp.test.windows, now: at(2026, 10, 19, 14, 30) }), null);
  // The source decides, not the shape: an open window that is not the bell
  // schedule's is never a class sitting, even one carrying a date.
  const open = { id: 'x', resolved: true, opensAt: at(2026, 10, 19, 10), closesAt: at(2026, 10, 19, 11), dateKey: '2026-10-19' };
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: [{ ...open, source: 'teacher' }], now: at(2026, 10, 19, 10, 30) }), null);
  assert.equal(classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: [{ ...open, source: 'bellSchedule' }], now: at(2026, 10, 19, 10, 30) })?.data.dateKey, '2026-10-19');
});

test('nothing reads a sitting: a sat day that stops resolving waits, as before, and nobody is missed', () => {
  const sat = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9) }));
  const recorded = classSittingToRecord({ assignmentId: 'a1', classId: 'c3', classWindows: scheduleFor(sat, at(2026, 10, 12, 10, 30)).test.windows, now: at(2026, 10, 12, 10, 30) });
  // Even handed a sitting, the resolvers do not take it.
  const closure = { ...bell, modifiedSchedules: { [MON]: { periods: {} } } };
  const now = at(2026, 10, 14, 9);
  const neverStarted = { assignmentId: 'a1', studentId: 's-absent', test: { state: 'assigned' } };
  const schedule = resolveStudentTestCycleSchedule({ assignment: sat, classId: 'c3', classPeriod: 'Period 3', schedule: closure, now, timeZone: TZ, sittings: { [MON]: recorded.data } });
  assert.deepEqual([schedule.test.state, schedule.test.stranded], [WINDOW_STATE.UPCOMING, true]);
  assert.equal(studentMissedOriginalTest({ record: neverStarted, schedule }), false, 'the absent student is not missed');
  assert.equal(classNeedsNewTestDay(schedule.test, { started: 1, waiting: 1 }), true, 'and the panel still flags the class');
  const [window] = resolveClassWindows({ availability: sat.testAvailability, classId: 'c3', classPeriod: 'Period 3', schedule: closure, timeZone: TZ, sittings: { [MON]: recorded.data } });
  assert.equal(window.resolved, false);
});

test('a teacher can extend a window past the bell, reopen it, clear it, or open the Test at any time', () => {
  const set = withClassTestDay(null, { classId: 'c3', dateKey: WED });
  const windowId = set.classWindows.c3[0].id;
  const extended = withClassWindowExtended(set, { classId: 'c3', windowId, closesAt: at(2026, 10, 14, 15, 30), by: 't', at: 5 });
  const afterBell = scheduleFor(assignment(extended), at(2026, 10, 14, 14)).test;
  assert.deepEqual([afterBell.state, afterBell.closesAt], [WINDOW_STATE.OPEN, at(2026, 10, 14, 15, 30)]);
  assert.equal(resolveClassWindows({ availability: extended, classId: 'c3', classPeriod: 'Period 3', schedule: bell, timeZone: TZ })[0].extended, true);
  // An "extension" to before the bell changes nothing: the bell still stands.
  const shortened = withClassWindowExtended(set, { classId: 'c3', windowId, closesAt: at(2026, 10, 14, 10, 30) });
  assert.equal(scheduleFor(assignment(shortened), at(2026, 10, 14, 10, 45)).test.state, WINDOW_STATE.OPEN);
  assert.throws(() => withClassWindowExtended(set, { classId: 'c3', windowId: 'nope', closesAt: 5 }), /not found/);

  // A reopen is a window between two times the teacher chose: it may be at home.
  const reopened = withClassCustomWindow(set, { classId: 'c3', opensAt: at(2026, 10, 15, 16), closesAt: at(2026, 10, 15, 20), reason: 'Fire drill' });
  const evening = scheduleFor(assignment(reopened), at(2026, 10, 15, 17)).test;
  assert.deepEqual([evening.state, evening.source, evening.workFromHome], [WINDOW_STATE.OPEN, 'teacher', true]);
  assert.equal(reopened.classWindows.c3[1].reason, 'Fire drill');
  assert.throws(() => withClassCustomWindow(set, { classId: 'c3', opensAt: 10, closesAt: 5 }), /later closing time/);

  assert.equal(scheduleFor(assignment(withoutClassWindows(reopened, { classId: 'c3' })), at(2026, 10, 15, 17)).test.state, WINDOW_STATE.UNSET);

  const anytime = withTestPolicy(set, { policy: TEST_AVAILABILITY_POLICY.ALWAYS_OPEN });
  const sunday = scheduleFor(assignment(anytime), at(2026, 10, 18, 22)).test;
  assert.deepEqual([sunday.state, sunday.enforced, sunday.workFromHome], [WINDOW_STATE.ALWAYS_OPEN, false, true]);
  assert.equal(normalizeTestAvailability(anytime).configured, true);
  assert.throws(() => withTestPolicy(set, { policy: 'whenever' }), /class time or open at any time/);
  assert.throws(() => withClassTestDay(null, { classId: 'c3', dateKey: 'Wednesday' }), /YYYY-MM-DD/);
});

test('one student\'s reopened window is honoured on top of the class\'s, and without one', () => {
  const classClosed = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON }));
  const own = withStudentTestWindow(null, { opensAt: at(2026, 10, 15, 8), closesAt: at(2026, 10, 15, 16), reason: 'Absent Monday', by: 'teacher@example.org', at: 9 });
  assert.deepEqual(own.testWindows.map((window) => [window.reason, window.by]), [['Absent Monday', 'teacher@example.org']]);
  const classmate = scheduleFor(classClosed, at(2026, 10, 15, 9)).test;
  const student = scheduleFor(classClosed, at(2026, 10, 15, 9), { studentAvailability: own }).test;
  assert.equal(classmate.state, WINDOW_STATE.CLOSED);
  assert.deepEqual([student.state, student.source, student.workFromHome], [WINDOW_STATE.OPEN, 'studentOverride', true]);
  assert.equal(scheduleFor(classClosed, at(2026, 10, 15, 17), { studentAvailability: own }).test.state, WINDOW_STATE.CLOSED);
  // A student added on their own, whose class has no window at all.
  const alone = resolveStudentTestCycleSchedule({ assignment: assignment(), classId: 'elsewhere', studentAvailability: own, now: at(2026, 10, 15, 7), timeZone: TZ }).test;
  assert.deepEqual([alone.state, alone.enforced], [WINDOW_STATE.UPCOMING, true]);
  assert.deepEqual(normalizeStudentAvailability({ testWindows: [{ opensAt: 5, closesAt: 4 }, 'junk'], followUpClosesAt: 'soon' }), { testWindows: [], followUpClosesAt: null });
  assert.throws(() => withStudentTestWindow(null, { opensAt: 9, closesAt: 9 }), /later closing time/);
});

test('the home window opens when the Test window closes and ends at the late due date', () => {
  const config = assignment(withClassTestDay(null, { classId: 'c3', dateKey: WED }));
  const lateDue = at(2026, 10, 20, 23, 59) + 59999;
  assert.equal(defaultFollowUpClose(config, TZ), lateDue, 'the whole of the late due day, in school time');
  // No late due date: the due date. Neither: no expiry.
  assert.equal(defaultFollowUpClose({ dueAt: '2026-10-16T23:59:00-05:00' }, TZ), at(2026, 10, 16, 23, 59));
  assert.equal(defaultFollowUpClose({ dueDate: '2026-10-16' }, TZ), at(2026, 10, 16, 23, 59) + 59999);
  assert.equal(defaultFollowUpClose({}, TZ), null);

  const duringTest = scheduleFor(config, at(2026, 10, 14, 10, 30)).followUp;
  assert.deepEqual([duringTest.state, duringTest.enforced, duringTest.opensAt, duringTest.closesAt], [WINDOW_STATE.UPCOMING, true, null, lateDue]);
  assert.equal(followUpRefusal(duringTest, { timeZone: TZ, what: 'The Retest' }), 'The Retest opens when the Test window closes.');
  assert.equal(followUpRefusal(duringTest, { timeZone: TZ, what: 'Corrections', plural: true }), 'Corrections open when the Test window closes.');

  const atHome = scheduleFor(config, at(2026, 10, 14, 19)).followUp;
  assert.deepEqual([atHome.state, atHome.opensAt, atHome.closesAt, atHome.closeSource, atHome.workFromHome],
    [WINDOW_STATE.OPEN, at(2026, 10, 14, 11, 5), lateDue, FOLLOW_UP_CLOSE.LATE_DUE, true]);
  assert.equal(scheduleFor(config, lateDue - 1).followUp.state, WINDOW_STATE.OPEN, 'open to the last moment of the late due day');

  const expired = scheduleFor(config, lateDue).followUp;
  assert.equal(expired.state, WINDOW_STATE.CLOSED);
  assert.equal(followUpRefusal(expired, { timeZone: TZ, what: 'The Retest' }), 'The Retest closed Tue, Oct 20, 11:59 PM CDT. Ask your teacher if you need it reopened.');
  assert.equal(followUpRefusal(expired, { timeZone: TZ, what: 'Corrections', plural: true }), 'Corrections closed Tue, Oct 20, 11:59 PM CDT. Ask your teacher if you need them reopened.');
});

test('a teacher can extend, reopen or remove the home window\'s close, for the class or for one student', () => {
  const base = withClassTestDay(null, { classId: 'c3', dateKey: WED });
  const lateDue = defaultFollowUpClose(assignment(), TZ);
  const later = at(2026, 10, 27, 17);

  const extended = scheduleFor(assignment(withFollowUpClose(base, { mode: FOLLOW_UP_CLOSE.CUSTOM, closesAt: later })), lateDue + 1000).followUp;
  assert.deepEqual([extended.state, extended.closesAt, extended.closeSource], [WINDOW_STATE.OPEN, later, FOLLOW_UP_CLOSE.CUSTOM]);
  const never = scheduleFor(assignment(withFollowUpClose(base, { mode: FOLLOW_UP_CLOSE.NONE })), at(2027, 6, 1)).followUp;
  assert.deepEqual([never.state, never.closesAt, never.closeSource], [WINDOW_STATE.OPEN, null, FOLLOW_UP_CLOSE.NONE]);
  // Back to the default rule.
  const restored = withFollowUpClose(withFollowUpClose(base, { mode: FOLLOW_UP_CLOSE.NONE }), { mode: FOLLOW_UP_CLOSE.LATE_DUE });
  assert.equal(scheduleFor(assignment(restored), lateDue + 1000).followUp.state, WINDOW_STATE.CLOSED);
  assert.throws(() => withFollowUpClose(base, { mode: FOLLOW_UP_CLOSE.CUSTOM }), /closing time is required/);
  assert.throws(() => withFollowUpClose(base, { mode: 'sometime' }), /how the home window closes/);

  // One student's extension gives that student longer; it can never give less.
  const own = withStudentFollowUpClose(null, { closesAt: later });
  const student = scheduleFor(assignment(base), lateDue + 1000, { studentAvailability: own }).followUp;
  assert.deepEqual([student.state, student.closesAt, student.closeSource], [WINDOW_STATE.OPEN, later, 'studentOverride']);
  assert.equal(scheduleFor(assignment(base), lateDue + 1000).followUp.state, WINDOW_STATE.CLOSED, 'their classmates are still closed');
  const shorter = withStudentFollowUpClose(null, { closesAt: at(2026, 10, 15, 8) });
  assert.equal(scheduleFor(assignment(base), at(2026, 10, 16, 8), { studentAvailability: shorter }).followUp.closesAt, lateDue, 'an earlier time does not shorten the class\'s window');
  assert.equal(withStudentFollowUpClose(own, { closesAt: null }).followUpClosesAt, null);

  // With no Test window at all, a close set by hand is still honoured.
  const handSet = scheduleFor(assignment(withFollowUpClose(null, { mode: FOLLOW_UP_CLOSE.CUSTOM, closesAt: later })), later + 1).followUp;
  assert.deepEqual([handSet.enforced, handSet.state], [true, WINDOW_STATE.CLOSED]);
});

test('both screens are told the exact times, in the school\'s zone, and whether work may be done from home', () => {
  const config = assignment(withClassTestDay(null, { classId: 'c3', dateKey: WED }));
  const upcoming = scheduleFor(config, at(2026, 10, 13, 9));
  assert.deepEqual(describeTestWindow(upcoming.test, { timeZone: TZ, audience: 'teacher' }), {
    state: 'upcoming',
    headline: 'Opens Wed, Oct 14, 10:15 AM CDT',
    detail: 'Open Wed, Oct 14, 10:15 AM CDT – 11:05 AM CDT.',
    home: 'The Test is taken in class. Students cannot start it from home.',
  });
  assert.equal(describeTestWindow(upcoming.test, { timeZone: TZ }).home, 'The Test is taken in class. You cannot start it from home.');
  assert.deepEqual(describeFollowUpWindow(upcoming.followUp, { timeZone: TZ }), {
    state: 'upcoming',
    headline: 'Opens when the Test window closes',
    detail: 'Then open until Tue, Oct 20, 11:59 PM CDT (the assignment\'s final due date).',
    home: 'You may do Corrections and the Retest from home.',
  });

  const open = scheduleFor(config, at(2026, 10, 14, 10, 30));
  const openWords = describeTestWindow(open.test, { timeZone: TZ });
  assert.equal(openWords.headline, 'Open now until Wed, Oct 14, 11:05 AM CDT');
  assert.match(openWords.detail, /A Test started before it closes can be finished/);

  const closed = scheduleFor(config, at(2026, 10, 14, 13));
  assert.equal(describeTestWindow(closed.test, { timeZone: TZ }).headline, 'Closed Wed, Oct 14, 11:05 AM CDT');
  assert.match(describeTestWindow(closed.test, { timeZone: TZ, audience: 'teacher' }).detail, /Reopen or extend it for a class or a student/);
  assert.equal(describeFollowUpWindow(closed.followUp, { timeZone: TZ, audience: 'teacher' }).headline, 'Open now until Tue, Oct 20, 11:59 PM CDT');
  assert.equal(describeFollowUpWindow(closed.followUp, { timeZone: TZ, audience: 'teacher' }).home, 'Students may do Corrections and the Retest from home.');

  // A device in another zone is still told the school's time, with the zone.
  assert.equal(formatSchoolDateTime(Date.UTC(2026, 9, 14, 15, 15), TZ), 'Wed, Oct 14, 10:15 AM CDT');
  assert.equal(formatSchoolRange(at(2026, 10, 14, 22), at(2026, 10, 15, 1), TZ), 'Wed, Oct 14, 10:00 PM CDT – Thu, Oct 15, 1:00 AM CDT');
  assert.equal(formatSchoolDateTime(null, TZ), null);

  // A student who missed the Test has a Retest and no Corrections to be told about.
  assert.deepEqual(describeFollowUpWindow(closed.followUp, { timeZone: TZ, retestOnly: true }), {
    state: 'open',
    headline: 'Open now until Tue, Oct 20, 11:59 PM CDT',
    detail: 'Closes Tue, Oct 20, 11:59 PM CDT (the assignment\'s final due date). A Retest started before then can be finished.',
    home: 'You may take the Retest from home.',
  });
  assert.doesNotMatch(JSON.stringify(['unset', 'upcoming', 'open', 'closed'].map((state) => describeFollowUpWindow({ state, enforced: state !== 'unset', closesAt: at(2026, 10, 20, 9) }, { timeZone: TZ, retestOnly: true }))), /Corrections/);

  // Unset and always-open say so plainly.
  const unset = scheduleFor(assignment(), at(2026, 10, 14, 13));
  assert.equal(describeTestWindow(unset.test, { timeZone: TZ, audience: 'teacher' }).headline, 'No class-time window is set');
  assert.match(describeFollowUpWindow(unset.followUp, { timeZone: TZ }).detail, /until your teacher closes them/);
  const anytime = scheduleFor(assignment(withTestPolicy(null, { policy: 'alwaysOpen' })), at(2026, 10, 14, 13));
  assert.equal(describeTestWindow(anytime.test, { timeZone: TZ }).home, 'You may take the Test from home.');
});

test('a stored value survives a round trip, and junk in it is dropped rather than trusted', () => {
  const stored = withFollowUpClose(
    withClassCustomWindow(withClassTestDay(null, { classId: 'c3', dateKey: WED, by: 't', at: 3 }), { classId: 'c3', opensAt: 100, closesAt: 200 }),
    { mode: FOLLOW_UP_CLOSE.CUSTOM, closesAt: 999 },
  );
  const { configured, ...normalized } = normalizeTestAvailability(JSON.parse(JSON.stringify(stored)));
  assert.equal(configured, true);
  assert.deepEqual(normalized, stored);
  const dirty = normalizeTestAvailability({
    policy: 'sometimes',
    classWindows: { c3: [{ mode: 'classPeriod', dateKey: 'tomorrow' }, { mode: 'custom', opensAt: 9, closesAt: 3 }, null, { mode: 'classPeriod', dateKey: WED }], '': [{ dateKey: WED }] },
    followUp: { mode: 'custom', closesAt: 'never' },
  });
  assert.deepEqual(Object.keys(dirty.classWindows), ['c3']);
  assert.deepEqual(dirty.classWindows.c3.map((window) => window.dateKey), [WED]);
  assert.deepEqual([dirty.policy, dirty.followUp.mode, dirty.followUp.closesAt], ['classTime', 'lateDue', null]);
  // The status of a window never depends on the machine's own zone.
  const status = resolveTestWindowStatus({
    availability: stored,
    classWindows: resolveClassWindows({ availability: stored, classId: 'c3', classPeriod: 'Period 3', schedule: bell, timeZone: TZ }),
    now: at(2026, 10, 14, 10, 30),
  });
  assert.equal(status.state, WINDOW_STATE.OPEN);
  assert.equal(resolveFollowUpWindow({ assignment: assignment(stored), availability: stored, testStatus: status, now: at(2026, 10, 14, 10, 30), timeZone: TZ }).closesAt, 999);
});

/*
 * THE TEACHER IS TOLD ONLY WHAT IS KNOWN (PR-21 review, round 2). A stranded
 * day can be one the class really sat that no longer resolves. When anyone in
 * the class started the Test, the panel does not say the day passed before the
 * bell schedule had times, and asks for a new day only for those still waiting;
 * a class nobody is waiting in is not flagged.
 */
test('a stranded class where somebody sat the Test is described from its sittings, and flagged only while somebody waits', () => {
  const sat = assignment(withClassTestDay(null, { classId: 'c3', dateKey: MON, at: at(2026, 10, 9, 9) }));
  const renamed = { ...bell, daySchedules: { ...bell.daySchedules, A: { periods: { '3rd Period': { enabled: true, start: '10:15', end: '11:05' } } } } };
  const status = resolveStudentTestCycleSchedule({ assignment: sat, classId: 'c3', classPeriod: 'Period 3', schedule: renamed, now: at(2026, 10, 14, 9), timeZone: TZ }).test;
  assert.equal(status.stranded, true);
  const two = describeTestWindow(status, { timeZone: TZ, audience: 'teacher', classSittings: { started: 20, waiting: 2 } });
  assert.equal(two.headline, '2 students did not sit it');
  assert.match(two.detail, /^The bell schedule no longer gives this class's Test day times\. The 2 students who have not started cannot start until you set a new Test day/);
  assert.doesNotMatch(`${two.headline} ${two.detail}`, /passed before|had already ended|Waiting for a new Test day/);
  assert.equal(describeTestWindow(status, { timeZone: TZ, audience: 'teacher', classSittings: { started: 1, waiting: 1 } }).headline, '1 student did not sit it');
  const none = describeTestWindow(status, { timeZone: TZ, audience: 'teacher', classSittings: { started: 22, waiting: 0 } });
  assert.match(none.detail, /Nobody here is waiting to start the Test/);
  // Nobody started: the day really never ran, and the teacher is told so.
  assert.equal(describeTestWindow(status, { timeZone: TZ, audience: 'teacher', classSittings: { started: 0, waiting: 22 } }).headline, 'Waiting for a new Test day');
  // A student is never given the class's numbers.
  assert.equal(describeTestWindow(status, { timeZone: TZ, classSittings: { started: 20, waiting: 2 } }).headline, 'Waiting for a new Test day');

  assert.equal(classNeedsNewTestDay(status, { started: 20, waiting: 2 }), true);
  assert.equal(classNeedsNewTestDay(status, { started: 22, waiting: 0 }), false, 'everyone sat it or moved on: not flagged');
  assert.equal(classNeedsNewTestDay(status, null), false, 'no records: nobody waiting');
  assert.equal(classNeedsNewTestDay({ ...status, stranded: undefined }, { started: 0, waiting: 5 }), false);
});
