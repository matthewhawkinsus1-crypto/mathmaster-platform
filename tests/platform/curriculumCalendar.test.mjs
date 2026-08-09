import test from 'node:test';
import assert from 'node:assert/strict';
import ALG1 from '../../src/curriculum/calendars/algebra1-2026-2027.js';
import ALG2H from '../../src/curriculum/calendars/algebra2Honors-2026-2027.js';
import {
  CALENDAR_TIMING, RECOMMENDATION_MODE, buildNonInstructionalSet,
  calendarPacingProvider, countInstructionalDaysBetween, describeToday,
  getCurriculumTiming, isInstructionalDay, loadCalendar, subtractInstructionalDays, toDayKey, toEngineTiming,
} from '../../src/platform/path/curriculumCalendar.js';
import { TIMING } from '../../src/platform/path/curriculumPacing.js';

const alg1 = loadCalendar(ALG1);
const alg2h = loadCalendar(ALG2H);
const on = (date) => Date.parse(`${date}T12:00:00Z`);
const timingOn = (loaded, id, date) => getCurriculumTiming(loaded, id, on(date)).timing;

// --- instructional-day arithmetic -------------------------------------------
test('weekends and district breaks are not instructional days', () => {
  const set = buildNonInstructionalSet(ALG1.nonInstructionalRanges);
  assert.equal(isInstructionalDay('2026-11-25', set), false, 'Thanksgiving week');
  assert.equal(isInstructionalDay('2026-12-28', set), false, 'winter break');
  assert.equal(isInstructionalDay('2026-11-21', set), false, 'a Saturday');
  assert.equal(isInstructionalDay('2026-11-19', set), true, 'an ordinary Thursday');
});

test('stepping back five instructional days skips a break rather than spending it', () => {
  const set = buildNonInstructionalSet(ALG1.nonInstructionalRanges);
  // Module 3 Topic 2 starts Nov 30, the Monday after Thanksgiving. Five
  // instructional days back must land before the break, not inside it.
  const early = subtractInstructionalDays('2026-11-30', 5, set);
  assert.equal(toDayKey(early), '2026-11-16');
  assert.equal(isInstructionalDay(early, set), true);

  // Naive arithmetic would have said Nov 23 — the Monday of Thanksgiving week,
  // when nothing is taught and a student gets no early access at all.
  assert.notEqual(toDayKey(early), '2026-11-23');
});

test('instructional days between two dates exclude weekends and breaks', () => {
  const set = buildNonInstructionalSet(ALG1.nonInstructionalRanges);
  assert.equal(countInstructionalDaysBetween('2026-11-23', '2026-11-27', set), 0, 'a whole break week');
  assert.equal(countInstructionalDaysBetween('2026-11-16', '2026-11-20', set), 5);
  assert.equal(countInstructionalDaysBetween('2026-11-20', '2026-11-16', set), 0, 'reversed range is zero, not negative');
});

// --- the four states ---------------------------------------------------------
test('a module moves future -> upcoming -> current -> review across the year', () => {
  const id = 'alg1.module3'; // scheduled 2026-11-02
  assert.equal(timingOn(alg1, id, '2026-10-01'), CALENDAR_TIMING.FUTURE);
  assert.equal(timingOn(alg1, id, '2026-10-26'), CALENDAR_TIMING.UPCOMING, 'one instructional week early');
  assert.equal(timingOn(alg1, id, '2026-11-02'), CALENDAR_TIMING.CURRENT, 'on the scheduled start');
  assert.equal(timingOn(alg1, id, '2026-12-01'), CALENDAR_TIMING.CURRENT);
  assert.equal(timingOn(alg1, id, '2027-02-01'), CALENDAR_TIMING.REVIEW);
});

test('the exact early-open boundary is five instructional days, not seven calendar days', () => {
  const id = 'alg1.module3';
  assert.equal(timingOn(alg1, id, '2026-10-23'), CALENDAR_TIMING.FUTURE, 'six instructional days out');
  assert.equal(timingOn(alg1, id, '2026-10-26'), CALENDAR_TIMING.UPCOMING, 'five instructional days out');
});

test('the course opener has no early window to open into', () => {
  assert.equal(timingOn(alg1, 'alg1.module1', '2026-08-03'), CALENDAR_TIMING.FUTURE);
  assert.equal(timingOn(alg1, 'alg1.module1', '2026-08-10'), CALENDAR_TIMING.CURRENT);
});

// --- the September/exponentials problem this whole layer exists to solve -----
test('late-year growth and decay is FUTURE in September no matter how able the student is', () => {
  // The exact failure named in the brief: a strong student offered Module 4
  // exponential work in September because prerequisites happen to be met.
  assert.equal(timingOn(alg1, 'alg1.module4', '2026-09-15'), CALENDAR_TIMING.FUTURE);
  assert.equal(timingOn(alg1, 'alg1.module4', '2026-10-30'), CALENDAR_TIMING.FUTURE);
  // Meanwhile the class's actual work in September is current.
  assert.equal(timingOn(alg1, 'alg1.module2', '2026-09-15'), CALENDAR_TIMING.CURRENT);
});

test('Module 4 opens early across the winter break, not during it', () => {
  // Scheduled 2027-01-06; five instructional days back lands in December,
  // because the break contributes none.
  assert.equal(timingOn(alg1, 'alg1.module4', '2026-12-14'), CALENDAR_TIMING.UPCOMING);
  assert.equal(timingOn(alg1, 'alg1.module4', '2026-12-11'), CALENDAR_TIMING.FUTURE);
});

// --- review and extension modes ---------------------------------------------
test('STAAR review is a review window, not a new content module', () => {
  const state = getCurriculumTiming(alg1, 'alg1.staar.review', on('2027-04-01'));
  assert.equal(state.timing, CALENDAR_TIMING.CURRENT);
  assert.equal(state.recommendationMode, RECOMMENDATION_MODE.REVIEW);
  assert.equal(describeToday(alg1, on('2027-04-01')).mode, RECOMMENDATION_MODE.REVIEW);
});

test('post-EOC Algebra II content stops being far-future on the calendar date', () => {
  assert.equal(timingOn(alg1, 'alg2.module1', '2027-03-01'), CALENDAR_TIMING.FUTURE);
  const after = getCurriculumTiming(alg1, 'alg2.module1', on('2027-04-27'));
  assert.equal(after.timing, CALENDAR_TIMING.CURRENT);
  assert.equal(after.recommendationMode, RECOMMENDATION_MODE.EXTENSION,
    'course boundaries must not block acceleration the calendar explicitly schedules');
});

// --- multi-window nodes ------------------------------------------------------
test('a curriculum node with two windows is current in either of them', () => {
  const id = 'alg2.module3';
  assert.equal(getCurriculumTiming(alg2h, id, on('2026-10-26')).windowCount, 2);
  assert.equal(timingOn(alg2h, id, '2026-10-26'), CALENDAR_TIMING.CURRENT, 'first window');
  assert.equal(timingOn(alg2h, id, '2027-01-15'), CALENDAR_TIMING.CURRENT, 'second window');
});

test('between two windows the node stays available for review rather than reverting to future', () => {
  // Module 3 ran in October and runs again in January. In December a student
  // who needs it should be able to review it, not be told it has not happened.
  assert.equal(timingOn(alg2h, 'alg2.module3', '2026-12-05'), CALENDAR_TIMING.REVIEW);
});

test('Algebra II exponentials are calendar-gated rather than available all year', () => {
  // The point of section 21: "the topic exists in the course" cannot mean
  // "available in August".
  assert.equal(timingOn(alg2h, 'alg2.module5', '2026-09-01'), CALENDAR_TIMING.FUTURE);
  assert.equal(timingOn(alg2h, 'alg2.module5', '2026-12-05'), CALENDAR_TIMING.CURRENT);
  assert.equal(timingOn(alg2h, 'alg2.module5', '2027-01-15'), CALENDAR_TIMING.REVIEW);
  assert.equal(timingOn(alg2h, 'alg2.module5', '2027-04-01'), CALENDAR_TIMING.CURRENT, 'second window');
});

test('unit 4 is split by fall break and both halves are current', () => {
  assert.equal(timingOn(alg2h, 'alg2.unit4', '2026-10-06'), CALENDAR_TIMING.CURRENT);
  assert.equal(timingOn(alg2h, 'alg2.unit4', '2026-10-21'), CALENDAR_TIMING.CURRENT);
});

// --- teacher-facing readout --------------------------------------------------
test('the calendar can say what the class is on today and what opens next', () => {
  const today = describeToday(alg1, on('2026-09-18'));
  assert.equal(today.today, '2026-09-18');
  assert.ok(today.current.some((window) => window.curriculumId === 'alg1.module2'));
  assert.equal(today.mode, RECOMMENDATION_MODE.NORMAL);

  const upcoming = describeToday(alg1, on('2026-10-27'));
  assert.ok(upcoming.upcoming.some((window) => window.curriculumId === 'alg1.module3'),
    'a teacher can see what opens early next');
});

test('days until a window opens are counted in instructional days', () => {
  const state = getCurriculumTiming(alg1, 'alg1.module3', on('2026-10-26'));
  assert.equal(state.instructionalDaysUntilStart, 6, 'Oct 26 to Nov 2 inclusive of both ends');
});

// --- provider contract and safety --------------------------------------------
test('the calendar provider satisfies the pacing provider contract', () => {
  const provider = calendarPacingProvider({
    calendar: ALG1,
    skillCurriculumLinks: { 'teks:A.9C': 'alg1.module4', 'teks:A.5A': 'alg1.module3' },
    nowValue: on('2026-09-15'),
  });
  assert.equal(provider.isProvisional, false, 'a real calendar is never provisional');
  assert.equal(provider.getSkillTiming('teks:A.9C').timing, CALENDAR_TIMING.FUTURE);
  assert.equal(provider.getSkillTiming('teks:A.5A').timing, CALENDAR_TIMING.FUTURE);
  assert.equal(provider.getSkillTiming('teks:A.2A').unmapped, true, 'an unlinked skill is not withheld');
});

test('calendar states map onto the engine vocabulary without a second enum', () => {
  assert.equal(toEngineTiming(CALENDAR_TIMING.CURRENT), TIMING.CURRENT);
  assert.equal(toEngineTiming(CALENDAR_TIMING.UPCOMING), TIMING.AHEAD);
  assert.equal(toEngineTiming(CALENDAR_TIMING.REVIEW), TIMING.REVIEW);
  assert.equal(toEngineTiming(CALENDAR_TIMING.FUTURE), TIMING.FUTURE);
});

test('an unmapped curriculum node is treated as current, never withheld', () => {
  assert.equal(getCurriculumTiming(alg1, 'nothing.like.this', on('2026-09-15')).unmapped, true);
  assert.equal(timingOn(alg1, 'nothing.like.this', '2026-09-15'), CALENDAR_TIMING.CURRENT);
});

test('both calendars load and every window has a usable start', () => {
  for (const [name, loaded] of [['algebra1', alg1], ['algebra2Honors', alg2h]]) {
    assert.ok(loaded.windows.length > 5, `${name} has windows`);
    assert.ok(loaded.windows.every((window) => window.startDate instanceof Date), `${name} dates parse`);
    assert.ok(loaded.windows.every((window) => window.endDate >= window.startDate), `${name} ranges are ordered`);
    assert.ok(loaded.windows.every((window) => window.earlyOpenDate <= window.startDate), `${name} opens early or on time`);
  }
});

test('hostile input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}]) {
    assert.doesNotThrow(() => loadCalendar(bad));
    assert.doesNotThrow(() => getCurriculumTiming(bad, 'x'));
    assert.doesNotThrow(() => describeToday(bad));
    assert.doesNotThrow(() => buildNonInstructionalSet(bad));
    assert.doesNotThrow(() => subtractInstructionalDays(bad, 5, new Set()));
    assert.doesNotThrow(() => calendarPacingProvider({ calendar: bad }));
  }
  assert.equal(loadCalendar(null), null);
  assert.equal(toDayKey('not a date'), null);
});
