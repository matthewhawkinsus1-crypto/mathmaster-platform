/*
 * A DAY'S A/B DAY SET AFTER ITS PERIODS HAVE ENDED (the owner, 2026-10-23, TC01).
 *
 * Friday's A/B day — or any date's override — can be chosen after some of that
 * day's periods have already met. A Test set for one of them was never open,
 * so the Test Cycle waits for a new Test day instead of marking the class
 * missed (testCycleAvailability.test.mjs has those cases). For that, the bell
 * schedule records when each date's A/B day was set (`dayTypeSetAt`), stamped
 * by the save with the server's clock; and the A/B day picker warns the
 * teacher when the periods have already ended.
 *
 * These helpers run on the teacher's device, in its own zone: every instant
 * here is built in the test process's local wall clock (as the settings screen
 * reads it), so they hold on a developer's machine and on a CI runner alike.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  dayTypeOnDate,
  dayTypeSetAtOf,
  periodsEndedBy,
  withDayTypeSetAt,
} from '../../functions/shared/classSchedule.mjs';
import { lateDayTypeNotice, setScheduleDayTypeOverride } from '../../src/assignmentLifecycle.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

// October 2026: Monday the 12th is an A day; Friday the 16th is set by hand.
const local = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const FRI = '2026-10-16';
const MON = '2026-10-12';
const bell = Object.freeze({
  version: 2,
  daySchedules: {
    A: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '08:50' }, 'Period 3': { enabled: true, start: '10:15', end: '11:05' } } },
    B: { periods: { 'Period 2': { enabled: true, start: '09:00', end: '09:50' }, 'Period 4': { enabled: true, start: '12:30', end: '13:20' } } },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
});

test('a date\'s A/B day: its override, else the weekly pattern', () => {
  assert.equal(dayTypeOnDate(bell, MON), 'A');
  assert.equal(dayTypeOnDate(bell, FRI), null, 'Friday is chosen by hand');
  assert.equal(dayTypeOnDate({ ...bell, dayTypeOverrides: { [FRI]: 'b' } }, FRI), 'B');
  assert.equal(dayTypeOnDate({ ...bell, dayTypeOverrides: { [MON]: 'B' } }, MON), 'B');
  assert.equal(dayTypeOnDate(bell, 'Friday'), null);
});

test('saving stamps each date whose A/B day changed, with the clock it is given, and keeps every other stamp', () => {
  const saved = { ...bell, dayTypeOverrides: { '2026-10-09': 'B' }, dayTypeSetAt: { '2026-10-09': 1111 } };
  // Friday set to A: stamped with the save's clock (the server's, in the app).
  const friday = withDayTypeSetAt(saved, { ...saved, dayTypeOverrides: { ...saved.dayTypeOverrides, [FRI]: 'A' } }, 'SERVER_NOW');
  assert.deepEqual(friday.dayTypeSetAt, { '2026-10-09': 1111, [FRI]: 'SERVER_NOW' });
  // Saved again unchanged — even after a click to B and back to A on screen —
  // nothing new is stamped, and the on-screen stamp gives way to the saved one.
  const savedFriday = { ...friday, dayTypeSetAt: { '2026-10-09': 1111, [FRI]: 5000 } };
  const clickedBack = { ...savedFriday, dayTypeSetAt: { '2026-10-09': 1111, [FRI]: 9999 } };
  assert.deepEqual(withDayTypeSetAt(savedFriday, clickedBack, 'LATER').dayTypeSetAt, { '2026-10-09': 1111, [FRI]: 5000 });
  // Changed from A to B: stamped again.
  assert.equal(withDayTypeSetAt(savedFriday, { ...savedFriday, dayTypeOverrides: { ...savedFriday.dayTypeOverrides, [FRI]: 'B' } }, 'LATER').dayTypeSetAt[FRI], 'LATER');
  // A Monday override cleared: back to the weekly A, a change, so stamped.
  const mondayB = { ...bell, dayTypeOverrides: { [MON]: 'B' } };
  assert.equal(withDayTypeSetAt(mondayB, bell, 'LATER').dayTypeSetAt[MON], 'LATER');
  // An override that says what the weekly pattern already says changes nothing.
  assert.equal(withDayTypeSetAt(bell, { ...bell, dayTypeOverrides: { [MON]: 'A' } }, 'LATER').dayTypeSetAt[MON], undefined);
  // The first save of a schedule stamps what it sets.
  assert.deepEqual(withDayTypeSetAt(null, { ...bell, dayTypeOverrides: { [FRI]: 'A' } }, 'FIRST').dayTypeSetAt, { [FRI]: 'FIRST' });
});

test('the picker stamps a change on screen, and only a change', () => {
  const at = local(16, 13);
  const picked = setScheduleDayTypeOverride(bell, new Date(at), 'A', { at });
  assert.deepEqual([picked.dayTypeOverrides[FRI], picked.dayTypeSetAt[FRI]], ['A', at]);
  assert.equal(setScheduleDayTypeOverride(picked, new Date(at + 60_000), 'A', { at: at + 60_000 }).dayTypeSetAt[FRI], at, 'the same day again records nothing new');
  assert.equal(setScheduleDayTypeOverride(bell, new Date(local(12, 13)), 'A', { at }).dayTypeSetAt, undefined, 'Monday is A already');
  const cleared = setScheduleDayTypeOverride(picked, new Date(at + 120_000), null, { at: at + 120_000 });
  assert.deepEqual([cleared.dayTypeOverrides[FRI], cleared.dayTypeSetAt[FRI]], [undefined, at + 120_000]);
});

test('when a day was set is read from a number or a saved Timestamp; nothing else is a time', () => {
  assert.equal(dayTypeSetAtOf({ dayTypeSetAt: { [FRI]: 5 } }, FRI), 5);
  assert.equal(dayTypeSetAtOf({ dayTypeSetAt: { [FRI]: { toMillis: () => 7 } } }, FRI), 7);
  assert.equal(dayTypeSetAtOf({ dayTypeSetAt: { [FRI]: { _methodName: 'serverTimestamp' } } }, FRI), null, 'a save still in flight');
  assert.equal(dayTypeSetAtOf({ dayTypeSetAt: { [FRI]: null } }, FRI), null);
  assert.equal(dayTypeSetAtOf(bell, FRI), null);
  assert.equal(dayTypeSetAtOf(null, FRI), null);
});

test('the periods a day\'s A/B day comes too late for: ended by then, exactly at the bell included', () => {
  const now = local(16, 13);
  assert.deepEqual(periodsEndedBy({ schedule: bell, dayType: 'A', nowValue: now }), ['Period 1', 'Period 3']);
  assert.deepEqual(periodsEndedBy({ schedule: bell, dayType: 'B', nowValue: now }), ['Period 2']);
  assert.deepEqual(periodsEndedBy({ schedule: bell, dayType: 'A', nowValue: now, at: local(16, 10, 30) }), ['Period 1']);
  assert.deepEqual(periodsEndedBy({ schedule: bell, dayType: 'A', nowValue: now, at: local(16, 11, 5) }), ['Period 1', 'Period 3']);
  assert.deepEqual(periodsEndedBy({ schedule: bell, dayType: 'A', nowValue: now, at: local(16, 11, 5) - 1 }), ['Period 1']);
  // A day with its own special times is timed by them, not by its A/B day.
  assert.deepEqual(periodsEndedBy({ schedule: { ...bell, modifiedSchedules: { [FRI]: { periods: {} } } }, dayType: 'A', nowValue: now }), []);
  assert.deepEqual(periodsEndedBy({ schedule: bell, dayType: 'A', nowValue: now, at: null }), []);
});

test('the A/B day picker warns when today\'s A/B day is set after some of its periods ended', () => {
  // Friday afternoon, not set yet: what has ended under either day's times.
  assert.equal(
    lateDayTypeNotice({ schedule: bell, nowValue: local(16, 13) }),
    'Period 1, Period 2 and Period 3 have already ended today. If you set today\'s A/B day now, a Test set for today in those periods was never open and will need a new Test day.',
  );
  assert.equal(
    lateDayTypeNotice({ schedule: bell, nowValue: local(16, 9) }),
    'Period 1 has already ended today. If you set today\'s A/B day now, a Test set for today in that period was never open and will need a new Test day.',
  );
  assert.equal(lateDayTypeNotice({ schedule: bell, nowValue: local(16, 7, 30) }), null, 'before the first bell there is nothing to say');

  // Set to A at 1 pm: the A periods that had already ended.
  const setLate = setScheduleDayTypeOverride(bell, new Date(local(16, 13)), 'A', { at: local(16, 13) });
  const lateWords = 'Period 1 and Period 3 had already ended when today was set to A Day. A Test set for today in those periods was never open, so it needs a new Test day.';
  assert.equal(lateDayTypeNotice({ schedule: setLate, nowValue: local(16, 13, 1) }), lateWords);
  // The saved stamp (a Firestore Timestamp) says the same, all afternoon.
  const saved = { ...setLate, dayTypeSetAt: { [FRI]: { toMillis: () => local(16, 13) } } };
  assert.equal(lateDayTypeNotice({ schedule: saved, nowValue: local(16, 15) }), lateWords);
  // Only the periods this screen lists.
  assert.equal(
    lateDayTypeNotice({ schedule: setLate, nowValue: local(16, 13, 1), classPeriods: ['Period 3'] }),
    'Period 3 had already ended when today was set to A Day. A Test set for today in that period was never open, so it needs a new Test day.',
  );
  // Set at 8:55: only Period 1 had ended. Set before the first bell: nothing.
  const setEarly = setScheduleDayTypeOverride(bell, new Date(local(16, 8, 55)), 'A', { at: local(16, 8, 55) });
  assert.match(lateDayTypeNotice({ schedule: setEarly, nowValue: local(16, 13) }), /^Period 1 had already ended when today was set to A Day\./);
  const setOnTime = setScheduleDayTypeOverride(bell, new Date(local(16, 7)), 'A', { at: local(16, 7) });
  assert.equal(lateDayTypeNotice({ schedule: setOnTime, nowValue: local(16, 13) }), null);
  // A weekday on the weekly pattern records nothing: nothing to say, all day.
  assert.equal(lateDayTypeNotice({ schedule: bell, nowValue: local(12, 15) }), null);
  // A day with its own special times is timed by them.
  assert.equal(lateDayTypeNotice({ schedule: { ...bell, modifiedSchedules: { [FRI]: { periods: {} } } }, nowValue: local(16, 13) }), null);
});

test('the save stamps changed dates with the server\'s clock, the picker shows the notice, and the panel names the reason', () => {
  const app = executableSource(read('src/App.jsx'));
  const save = region(app, 'const handleSaveClassSchedule = async () => {', '\n  };', 'the bell schedule save');
  assert.match(save, /const saved = await getDoc\(scheduleRef\);/);
  assert.match(save, /const normalized = withDayTypeSetAt\(saved\.exists\(\) \? saved\.data\(\) : null, normalizeSchedule\(classSchedule\), serverTimestamp\(\)\);/);
  assert.match(save, /await setDoc\(scheduleRef, normalized\);/);
  assert.match(app, /import \{[^}]*\bwithDayTypeSetAt,[^}]*\} from '\.\/assignmentLifecycle';/);

  const settings = executableSource(read('src/components/teacher/ClassScheduleSettings.jsx'));
  assert.match(settings, /import \{[^}]*\blateDayTypeNotice,[^}]*\} from '\.\.\/\.\.\/assignmentLifecycle\.js';/);
  assert.match(settings, /const lateNotice = lateDayTypeNotice\(\{ schedule, nowValue: today, classPeriods \}\);/);
  // Beside the buttons that set today's A/B day.
  const picker = region(settings, 'Use {dayType} Day Today', '</section>', 'the A/B day picker');
  assert.match(picker, /\{lateNotice && \(\s*<p role="status" data-late-day-type=""[^>]*>\s*\{lateNotice\}\s*<\/p>\s*\)\}/);

  const index = executableSource(read('functions/index.js'));
  assert.match(index, /window\.reason === "dayTypeSetAfterEnd"\s*\? `\$\{shared\.schedule\.formatSchoolDate\(window\.dateKey, timeZone\)\} \(its A\/B day was set after this class had met: choose a new day\)`/);
});
