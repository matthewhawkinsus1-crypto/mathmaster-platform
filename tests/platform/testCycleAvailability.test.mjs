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
  describeTestWindow,
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
  assert.match(describeTestWindow(passed, { timeZone: TZ }).detail, /Fri, Oct 16 passed before the bell schedule gave this class's times for it, so you have not missed it/);
  assert.match(describeTestWindow(passed, { timeZone: TZ, audience: 'teacher' }).detail, /no student missed it\. Set a new Test day/);
  assert.equal(testWindowRefusal(passed, { timeZone: TZ }), 'This Test is waiting for a new Test day. Your teacher will set one.');
  assert.equal(scheduleFor(friday, at(2026, 10, 17, 0, 0)).followUp.state, WINDOW_STATE.UPCOMING, 'Corrections and the Retest do not open either');
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
  assert.match(describeTestWindow(status, { timeZone: TZ }).detail, /Mon, Oct 12's class had already ended when it was set as the Test day, so you have not missed it/);
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
