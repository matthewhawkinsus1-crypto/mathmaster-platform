import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_YEAR_2026_27, schoolYearNonInstructionalRanges,
} from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import {
  addInstructionalDays, buildNonInstructionalSet, instructionalDaysBetween,
  isInstructionalDay, loadCalendar, subtractInstructionalDays, toDayKey,
} from '../../src/platform/path/curriculumCalendar.js';
import ALGEBRA1 from '../../src/curriculum/calendars/algebra1-2026-2027.js';
import ALGEBRA2 from '../../src/curriculum/calendars/algebra2Honors-2026-2027.js';

const nonInstructional = buildNonInstructionalSet(schoolYearNonInstructionalRanges());

test('every supplied closure is non-instructional', () => {
  const closures = [
    ['2026-09-07', 'Labor Day'],
    ['2026-10-12', 'Fall break start'], ['2026-10-16', 'Fall break end'],
    ['2026-11-23', 'Thanksgiving start'], ['2026-11-27', 'Thanksgiving end'],
    ['2026-12-21', 'Winter break start'], ['2027-01-01', 'Winter break end'],
    ['2027-01-18', 'MLK Day'],
    ['2027-02-15', 'Presidents Day'],
    ['2027-03-15', 'Spring break start'], ['2027-03-19', 'Spring break end'],
    ['2027-03-26', 'Good Friday'],
  ];
  closures.forEach(([day, label]) => {
    assert.equal(isInstructionalDay(day, nonInstructional), false, `${day} (${label}) must be closed`);
  });
});

test('professional-development days are non-instructional too', () => {
  ['2026-09-04', '2026-10-09', '2026-11-03', '2026-12-11', '2027-01-04', '2027-01-05', '2027-02-12']
    .forEach((day) => {
      assert.equal(isInstructionalDay(day, nonInstructional), false, `${day} is a PD day`);
    });
});

test('early-release days remain instructional', () => {
  // A short day is still a day. Excluding them would silently lengthen every
  // early-open countdown.
  ['2026-11-20', '2026-12-18', '2027-03-12'].forEach((day) => {
    assert.equal(isInstructionalDay(day, nonInstructional), true, `${day} is early release, not a closure`);
  });
});

test('testing days remain instructional', () => {
  // Nothing in the calendar closes school for PSAT/STAAR/DOL windows. If these
  // were excluded, the five-instructional-day rule would leap across a testing
  // window and open content early.
  ['2027-04-13', '2027-05-04', '2027-03-02'].forEach((day) => {
    assert.equal(isInstructionalDay(day, nonInstructional), true, `${day} must stay instructional`);
  });
});

test('instruction resumes 6 January, after the break and the two PD days', () => {
  assert.equal(isInstructionalDay('2027-01-01', nonInstructional), false);
  assert.equal(isInstructionalDay('2027-01-04', nonInstructional), false);
  assert.equal(isInstructionalDay('2027-01-05', nonInstructional), false);
  assert.equal(isInstructionalDay('2027-01-06', nonInstructional), true);
});

test('subtractInstructionalDays steps over breaks rather than through them', () => {
  // Algebra I Module 4 starts 6 January. Five instructional days earlier is
  // 14 December — 23 calendar days, because winter break and the January PD
  // days do not count. A naive "minus seven calendar days" would land inside
  // the break, when the class has not moved and the student cannot use it.
  const opens = subtractInstructionalDays('2027-01-06', 5, nonInstructional);
  assert.equal(toDayKey(opens), '2026-12-14');
  assert.equal(instructionalDaysBetween(opens, '2027-01-06', nonInstructional) - 1, 5);
});

test('addInstructionalDays is the mirror of subtractInstructionalDays', () => {
  const start = '2026-12-14';
  const forward = addInstructionalDays(start, 5, nonInstructional);
  assert.equal(toDayKey(forward), '2027-01-06');
  assert.equal(toDayKey(subtractInstructionalDays(forward, 5, nonInstructional)), start);
});

test('instructionalDaysBetween excludes weekends and every closure', () => {
  // Thanksgiving week: Monday to Friday, all closed.
  assert.equal(instructionalDaysBetween('2026-11-23', '2026-11-27', nonInstructional), 0);
  // A plain week in September with no closure.
  assert.equal(instructionalDaysBetween('2026-09-14', '2026-09-18', nonInstructional), 5);
  // The week containing Labor Day and the PD day before it.
  assert.equal(instructionalDaysBetween('2026-09-04', '2026-09-11', nonInstructional), 4);
});

test('both course calendars share the one district source', () => {
  const one = loadCalendar(ALGEBRA1);
  const two = loadCalendar(ALGEBRA2);
  assert.deepEqual([...one.nonInstructional].sort(), [...two.nonInstructional].sort(),
    'the two courses must not be able to disagree about when school is closed');
  assert.equal(one.lastInstructionalDay, SCHOOL_YEAR_2026_27.endDate);
  assert.equal(two.lastInstructionalDay, SCHOOL_YEAR_2026_27.endDate);
});

test('no window carries an inferred break range any more', () => {
  const ranges = schoolYearNonInstructionalRanges();
  assert.ok(ranges.every((range) => !range.derived),
    'fall break and spring break were confirmed against the district calendar');
  assert.equal(SCHOOL_YEAR_2026_27.breaks.length, 8);
  assert.equal(SCHOOL_YEAR_2026_27.nonInstructionDays.length, 7);
});

test('every dated module opens exactly five instructional days early', () => {
  [ALGEBRA1, ALGEBRA2].forEach((calendar) => {
    const loaded = loadCalendar(calendar);
    loaded.windows
      .filter((window) => window.startDate && window.earlyOpenInstructionalDays > 0)
      .forEach((window) => {
        const gap = instructionalDaysBetween(window.earlyOpenDate, window.startDate, loaded.nonInstructional) - 1;
        assert.equal(gap, window.earlyOpenInstructionalDays,
          `${window.curriculumId} opens ${gap} instructional days early, expected ${window.earlyOpenInstructionalDays}`);
      });
  });
});

test('the course opener does not try to open before the year starts', () => {
  const loaded = loadCalendar(ALGEBRA1);
  const opener = loaded.windows.find((window) => window.curriculumId === 'alg1.module1');
  assert.equal(opener.earlyOpenInstructionalDays, 0);
  assert.equal(toDayKey(opener.earlyOpenDate), SCHOOL_YEAR_2026_27.startDate);
});
