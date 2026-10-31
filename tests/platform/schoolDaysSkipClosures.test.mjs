/*
 * TT17 — "the next school day" is a day the district is open.
 *
 * An individual extra-time deadline ("up to the end of the next school day")
 * used to count weekdays only, so it could land on a holiday: Thursday before
 * fall break + 1 school day was the Friday staff day. The district calendar is
 * now readable where the deadline is computed (functions/shared/
 * schoolYearCalendar.mjs; the browser re-exports it from src/curriculum/
 * calendars), so the browser and the server skip the same days.
 *
 * What this holds:
 *   - the shared calendar and the browser's own calendar logic close the same
 *     dates, and the browser's file IS the shared one (no second copy);
 *   - a deadline skips breaks, holidays and staff days, and is never earlier
 *     than counting weekdays alone would give (checked against a weekday-only
 *     reference written here, over a whole year of start dates);
 *   - all four readers of a student's deadline agree on the later date;
 *   - the Cloud Functions package can still load it: nothing in the shared
 *     deadline code reaches into src/.
 * A/B days are deliberately not used (see the status note): "school day" is a
 * day school is open, not a day this class meets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { addSchoolDays, extendDueInstant, resolveStudentSupportDeadline, withStudentSupportDates } from '../../functions/shared/supportDeadline.mjs';
import * as sharedCalendar from '../../functions/shared/schoolYearCalendar.mjs';
import * as browserCalendar from '../../src/curriculum/calendars/schoolYear2026-2027.js';
import { buildNonInstructionalSet } from '../../src/platform/path/curriculumCalendar.js';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';
import { getAssignmentDate, getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { assignmentFinalCloseAt, resolveAuthoritativeClose } from '../../functions/shared/sectionDeadline.mjs';
import { resolveStudentFinalDeadlineFromAssignment } from '../../src/platform/gradeTransfer/studentDeadlineResolver.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';

const CHICAGO = 'America/Chicago';
const DAY_MS = 86400000;

// Written out here from the district's published dates, not read from the
// module under test: a closure dropped from the data must fail this file.
const DISTRICT_CLOSED = [
  '2026-09-04', '2026-09-07',
  '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
  '2026-11-03', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
  '2026-12-11', '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
  '2027-01-04', '2027-01-05', '2027-01-18', '2027-02-12', '2027-02-15',
  '2027-03-15', '2027-03-16', '2027-03-17', '2027-03-18', '2027-03-19', '2027-03-26',
];

const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const keyMs = (key) => Date.parse(`${key}T00:00:00Z`);

// The rule as it was: weekdays only. Independent of the code under test.
const weekdaysOnlyAfter = (key, count) => {
  let cursor = keyMs(key);
  let left = count;
  while (left > 0) {
    cursor += DAY_MS;
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return keyOf(cursor);
};

test('the Cloud Functions and the browser close the same days, from one file', () => {
  const server = sharedCalendar.schoolYearClosedDateKeys();
  const browser = buildNonInstructionalSet(browserCalendar.schoolYearNonInstructionalRanges());
  assert.deepEqual([...server].sort(), [...browser].sort(), 'two readings of one calendar');
  assert.deepEqual([...server].sort(), [...DISTRICT_CLOSED].sort(), 'and it is the district list');
  // No second copy to drift: the browser module hands back the shared object.
  assert.equal(browserCalendar.SCHOOL_YEAR_2026_27, sharedCalendar.SCHOOL_YEAR_2026_27);
  assert.equal(browserCalendar.default, sharedCalendar.default);
});

test('a school day skips breaks, holidays and staff days', () => {
  const cases = [
    // [from, count, expected, why]
    ['2026-09-30', 1, '2026-10-01', 'an ordinary week is unchanged'],
    ['2026-10-08', 1, '2026-10-19', 'Friday staff day, the weekend, then fall break'],
    ['2026-11-02', 1, '2026-11-04', 'Tuesday 3 November is a staff day'],
    ['2026-11-20', 1, '2026-11-30', 'Thanksgiving break'],
    ['2026-11-20', 2, '2026-12-01', 'the second school day after Thanksgiving break'],
    ['2026-12-18', 1, '2027-01-06', 'winter break, then the two January staff days'],
    ['2026-09-03', 1, '2026-09-08', 'Friday staff day, the weekend, Labor Day'],
    ['2027-01-15', 1, '2027-01-19', 'Martin Luther King Jr. Day'],
    ['2027-02-11', 1, '2027-02-16', 'Friday staff day, the weekend, Presidents Day'],
    ['2027-03-12', 1, '2027-03-22', 'spring break'],
    ['2027-03-25', 1, '2027-03-29', 'Good Friday'],
    ['2026-10-05', 3, '2026-10-08', 'three school days that cross nothing'],
    ['2026-10-05', 5, '2026-10-20', 'five school days (6, 7, 8, 19, 20 October) that cross the staff day and fall break'],
  ];
  cases.forEach(([from, count, expected, why]) => {
    assert.equal(addSchoolDays(from, count), expected, `${from} + ${count}: ${why}`);
  });
  // Outside the school year there is nothing to skip: weekends alone, as before.
  assert.equal(addSchoolDays('2027-06-04', 1), '2027-06-07');
  assert.equal(addSchoolDays('2026-07-02', 2), '2026-07-06');
  // A date nobody can read stays unreadable, and zero days stays put.
  assert.equal(addSchoolDays('not a date', 1), null);
  assert.equal(addSchoolDays('2026-10-08', 0), '2026-10-08');
});

test('the closures can only move a date LATER than weekdays alone would, never earlier', () => {
  let later = 0;
  let same = 0;
  for (let start = keyMs('2026-07-01'); start <= keyMs('2027-08-31'); start += DAY_MS) {
    const from = keyOf(start);
    for (let count = 1; count <= 5; count += 1) {
      const reference = weekdaysOnlyAfter(from, count);
      const answer = addSchoolDays(from, count);
      assert.ok(answer >= reference, `${from} + ${count}: ${answer} is earlier than the weekday rule's ${reference}`);
      // Later exactly when a closed weekday sits between the start and the weekday answer.
      const crossesClosure = DISTRICT_CLOSED.some((closed) => closed > from && closed <= reference);
      assert.equal(answer > reference, crossesClosure, `${from} + ${count}: moved later only because a closure was crossed`);
      if (answer > reference) later += 1; else same += 1;
      // And it never lands on a weekend or a closure.
      const weekday = new Date(keyMs(answer)).getUTCDay();
      assert.ok(weekday !== 0 && weekday !== 6, `${answer} is a weekday`);
      assert.equal(DISTRICT_CLOSED.includes(answer), false, `${answer} is not a closed day`);
    }
  }
  // A function that ignored the calendar would pass the ">=" half of this test.
  assert.ok(later > 150, `the calendar moved ${later} of the ${later + same} dates in the year`);
  assert.ok(same > 1000, 'and left the ordinary ones alone');
});

test('an individual due date lands on the later school day, in school time', () => {
  // Class due Thursday 8 October 2026, end of day in Chicago.
  const classDue = Date.parse('2026-10-08T23:59:59.999-05:00');
  const extended = extendDueInstant({ classDueAtMs: classDue, extension: { mode: 'school-days', value: 1 } });
  assert.equal(zonedDateKey(extended, CHICAGO), '2026-10-19');
  assert.equal(new Date(extended).toISOString(), '2026-10-20T04:59:59.999Z', 'the end of Monday 19 October in Chicago');
  assert.ok(extended > Date.parse('2026-10-09T23:59:59.999-05:00'), 'later than the weekday rule gave');
  // Hours are hours: a break does not stretch them.
  assert.equal(extendDueInstant({ classDueAtMs: classDue, extension: { mode: 'hours', value: 24 } }), classDue + DAY_MS);
});

const profileWithExtraTime = (dueDateExtension) => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
    inclusionStatus: false, accommodations: [{ id: 'extra-time', params: { dueDateExtension }, appliesTo: [] }], modifications: [],
  }],
  todayKey: '2026-10-25',
});

test('all four readers of a student\'s deadline agree on the later date', () => {
  // Class due Monday 2 November; Tuesday the 3rd is a staff day.
  const assignment = Object.freeze({ id: 'A1', dueAt: '2026-11-02', studentOverrides: Object.freeze({}) });
  const profile = profileWithExtraTime({ mode: 'school-days', value: 1 });
  const wednesdayEnd = Date.parse('2026-11-05T05:59:59.999Z'); // Wed 4 Nov 23:59:59.999 CST
  const forStudent = withStudentSupportDates(assignment, 'S1', profile);

  // 1. The student's own screen.
  assert.equal(getAssignmentDate(forStudent, 'due', 'S1').getTime(), wednesdayEnd);
  const staffDayNoon = Date.parse('2026-11-03T18:00:00Z');
  assert.equal(getAssignmentLifecycle(forStudent, staffDayNoon, { studentId: 'S1' }).status, 'onTime');
  assert.equal(getAssignmentLifecycle(forStudent, staffDayNoon, { studentId: 'S2' }).status, 'closed', 'another student keeps the class date');
  assert.equal(getAssignmentLifecycle(forStudent, Date.parse('2026-11-05T12:00:00Z'), { studentId: 'S1' }).status, 'closed');
  // 2. Ingestion's final close, and 3. the checkpoint finalizer's.
  assert.equal(assignmentFinalCloseAt(assignment, CHICAGO, 'S1', profile), wednesdayEnd);
  const close = resolveAuthoritativeClose({ assignment, activityRole: 'classwork', schedule: null, studentId: 'S1', studentProfile: profile, nowValue: Date.parse('2026-11-03T18:00:00Z') });
  assert.equal(close.closesAtMs, wednesdayEnd);
  // 4. Grade Export waits for the same instant.
  const exported = resolveStudentFinalDeadlineFromAssignment({ student: { id: 'S1', profile }, assignment });
  assert.equal(Date.parse(exported.deadline), wednesdayEnd);
  // The resolver itself, for the record.
  assert.equal(resolveStudentSupportDeadline({ assignment, profile }).supportDueAtMs, wednesdayEnd);
});

test('the shared deadline code reaches only into functions/, which is all a Cloud Function deploys', () => {
  // Comment lines are dropped line by line: the shared helper's block-comment
  // pass reads "assignments/*" in a // comment as the start of a block.
  const withoutComments = (text) => text.split('\n').filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line)).join('\n');
  const sources = Object.fromEntries(['functions/shared/supportDeadline.mjs', 'functions/shared/schoolYearCalendar.mjs']
    .map((file) => [file, withoutComments(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))]));
  Object.entries(sources).forEach(([file, source]) => {
    const targets = [
      ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);
    targets.forEach((target) => {
      assert.ok(target.startsWith('./'), `${file} imports ${target}: only a sibling in functions/shared is deployable`);
    });
  });
  // The deadline really does read the shared calendar (a sibling import is the only way it can).
  assert.match(sources['functions/shared/supportDeadline.mjs'], /\bfrom\s*'\.\/schoolYearCalendar\.mjs'/);
  assert.match(sources['functions/shared/supportDeadline.mjs'], /schoolYearClosedDateKeys\(\)/);
});
