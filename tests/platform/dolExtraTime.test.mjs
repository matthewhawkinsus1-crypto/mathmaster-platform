// EXTRA TIME ON THE EXIT TICKET (DOL) — decision D7, H-117.
//
// A student's extended-time accommodation stretches THEIR DOL window; the
// Warm-Up stays class-timed. The student's device (getDOLState) and every
// server reader (resolveAuthoritativeClose → the checkpoint finalizer, draft
// recovery and Recovery; dolTeacherRecoveryActiveAt → ingestion's reopen) must
// give the same close, and a student without the accommodation must get the
// class window to the millisecond.
//
// Times are the test process's local wall clock (as in
// dolTeacherManualControl.test.mjs); the server readers are called with
// `timeZone: null`, which means the same local clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { getDOLState, getWarmupState, localDateKey, studentExtraTimeDolOpen } from '../../src/assignmentLifecycle.js';
import { buildDolClose, buildDolExtension, buildDolWindowOpening } from '../../src/platform/assessment/assessmentRecovery.js';
import { projectStudentAssignments, sameTimingProfile } from '../../src/platform/assignments/studentAssignmentControls.js';
import {
  STUDENT_TIMING_PROFILE_KEY,
  accommodatedSeconds,
  dolExtendedTimeMultiplier,
  dolExtraTimeMs,
  dolTeacherRecoveryActiveAt,
  resolveAuthoritativeClose,
  resolveDolWindow,
} from '../../functions/shared/sectionDeadline.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { ORIGINAL_OPPORTUNITY, resolveOriginalOpportunity } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import { describeDolClose, dolExtraTimeNotice, DOL_OPEN_NOTICE } from '../../src/platform/assessment/dolCloseCopy.js';
import { dolExtraTimeForClass } from '../../src/platform/teacher/dolExtraTimeRoster.js';
import { normalizeStudentProfile } from '../../src/studentSupport.js';
import { normalizeTeacherRosterSummary } from '../../src/platform/teacher/teacherRosterSummary.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const secureExamNavigation = require('../../functions/lib/secureExamNavigation.js');

// Monday 2026-08-31 is an A day; Period 1 meets 08:00–09:30. Tuesday is a B
// day with no Period 1. Friday is undesignated (the teacher must choose).
const schedule = {
  version: 2,
  periods: {},
  daySchedules: {
    A: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '09:30' } } },
    B: { periods: {} },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};

const at = (hour, minute, second = 0, day = 31) => new Date(2026, 7, day, hour, minute, second);
const MONDAY = localDateKey(at(8, 0));
const MINUTE = 60_000;

const lesson = (dol = {}) => ({
  id: 'L1',
  schemaVersion: 5,
  sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: [{ questionId: 'dol-1', activityRole: 'dol', prompt: 'Solve x + 2 = 7.', type: 'freeResponse', expected: '5' }] }],
  warmup: { enabled: true, instructionDate: MONDAY },
  // The class's DOL: 10 minutes of work, closing 5 minutes before the bell
  // (09:15–09:25 on Monday).
  dol: { enabled: true, minutesBeforeEnd: 10, closeMinutesBeforeEnd: 5, instructionDate: MONDAY, ...dol },
});

// The profile shapes MathMaster actually stores (supportEntitlements.mjs).
const LEGACY_EXTRA_TIME = Object.freeze({ inclusionStatus: false, accommodations: ['extra-time'], modifications: [] });
const LEGACY_NO_EXTRA_TIME = Object.freeze({ inclusionStatus: false, accommodations: ['text-to-speech'], modifications: [] });
const DISTRICT_DOUBLE_TIME = Object.freeze({ programEligibility: { section504: true }, accommodations: { extendedTimeMultiplier: 2 } });
const DISTRICT_QUARTER_MORE = Object.freeze({ programEligibility: { section504: true }, accommodations: { extendedTimeMultiplier: 1.25 } });
const versioned = ({ status = 'active', effectiveStart = '2026-08-17', effectiveEnd = null, appliesTo = [], inclusionStatus = false, accommodations = null } = {}) => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status, effectiveStart, effectiveEnd,
    inclusionStatus,
    accommodations: accommodations || [{ id: 'extra-time', params: {}, appliesTo }],
    modifications: [],
  }],
  todayKey: '2026-08-20',
});

const dolFor = (assignment, when, studentProfile, extra = {}) => getDOLState({
  assignment, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: when, studentProfile, ...extra,
});
const serverCloseFor = (assignment, when, studentProfile) => resolveAuthoritativeClose({
  assignment, activityRole: 'dol', schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: when, timeZone: null,
  studentId: 'S1', studentProfile,
});

test('the multiplier is the secure exams\': legacy box 1.5, a district multiplier as written, nothing without one', () => {
  const now = at(9, 0).getTime();
  assert.equal(dolExtendedTimeMultiplier(LEGACY_EXTRA_TIME, { nowValue: now, timeZone: null }), 1.5);
  assert.equal(dolExtendedTimeMultiplier(DISTRICT_DOUBLE_TIME, { nowValue: now, timeZone: null }), 2);
  assert.equal(dolExtendedTimeMultiplier(DISTRICT_QUARTER_MORE, { nowValue: now, timeZone: null }), 1.25);
  assert.equal(dolExtendedTimeMultiplier({ accommodations: { extendedTimeMultiplier: 9 } }, { nowValue: now, timeZone: null }), 4, 'clamped like the secure exam');
  assert.equal(dolExtendedTimeMultiplier(LEGACY_NO_EXTRA_TIME, { nowValue: now, timeZone: null }), 1);
  assert.equal(dolExtendedTimeMultiplier(null, { nowValue: now, timeZone: null }), 1);
  assert.equal(dolExtendedTimeMultiplier('garbage', { nowValue: now, timeZone: null }), 1);
  // Inclusion status grants extended time on a secure exam; it does here too.
  assert.equal(dolExtendedTimeMultiplier({ inclusionStatus: true, accommodations: [] }, { nowValue: now, timeZone: null }), 1.5);
});

test('the window arithmetic is the secure exam\'s, rounded up to a whole minute', () => {
  for (const [seconds, multiplier] of [[600, 1.5], [600, 2], [600, 1.25], [420, 1.5], [60, 1.1], [600, 1], [600, 9]]) {
    assert.equal(accommodatedSeconds(seconds, multiplier), secureExamNavigation.accommodatedTimeLimitSeconds(seconds, multiplier), `${seconds}s × ${multiplier}`);
  }
  assert.equal(dolExtraTimeMs({ durationMinutes: 10, multiplier: 1.5 }), 5 * MINUTE);
  assert.equal(dolExtraTimeMs({ durationMinutes: 10, multiplier: 1.25 }), 3 * MINUTE, '12.5 minutes rounds up to 13');
  assert.equal(dolExtraTimeMs({ durationMinutes: 10, multiplier: 1 }), 0);
});

test('period end × multiplier: the student\'s close is the class close plus their extra minutes, on the device and the server', () => {
  const assignment = lesson();
  for (const [profile, minutes] of [[LEGACY_EXTRA_TIME, 30], [DISTRICT_DOUBLE_TIME, 35], [DISTRICT_QUARTER_MORE, 28]]) {
    const state = dolFor(assignment, at(9, 26), profile);
    assert.equal(state.status, 'active', 'the class DOL closed at 09:25; this student is still working');
    assert.equal(state.classEndsAt.getTime(), at(9, 25).getTime());
    assert.equal(state.endsAt.getTime(), at(9, minutes).getTime());
    assert.equal(state.extendedTime, true);
    assert.equal(state.millisecondsRemaining, at(9, minutes).getTime() - at(9, 26).getTime());
    assert.equal(state.opensAt.getTime(), at(9, 15).getTime(), 'it opens with the class');
    // The server finalizer, draft recovery and Recovery read this close.
    const close = serverCloseFor(assignment, at(9, 26), profile);
    assert.equal(close.closesAtMs, state.endsAt.getTime(), 'device and server agree to the millisecond');
    assert.equal(close.classClosesAtMs, at(9, 25).getTime());
    assert.equal(close.extendedTime, true);
    assert.equal(close.reason, 'dol-close');
    assert.equal(dolFor(assignment, at(9, minutes, 1), profile).status, 'ended', 'and it ends at their own close');
  }
  // Double time runs past the 09:30 bell, as a secure exam's would.
  assert.equal(dolFor(assignment, at(9, 33), DISTRICT_DOUBLE_TIME).status, 'active');
});

test('a student without the accommodation is unchanged, to the millisecond', () => {
  const assignment = lesson();
  for (const when of [at(9, 0), at(9, 15), at(9, 20, 30), at(9, 25), at(9, 25, 1), at(9, 40)]) {
    const baseline = dolFor(assignment, when, null);
    for (const profile of [undefined, LEGACY_NO_EXTRA_TIME, {}, versioned({ accommodations: [{ id: 'text-to-speech', params: {}, appliesTo: [] }] })]) {
      assert.deepEqual(dolFor(assignment, when, profile), baseline, `${when.toTimeString()} with ${JSON.stringify(profile)?.slice(0, 40)}`);
      assert.deepEqual(serverCloseFor(assignment, when, profile), serverCloseFor(assignment, when, null));
    }
    assert.equal(baseline.extendedTime, false);
    assert.equal(baseline.classEndsAt.getTime(), baseline.endsAt.getTime());
  }
  assert.equal(dolFor(assignment, at(9, 25, 1), LEGACY_NO_EXTRA_TIME).status, 'ended');
  assert.equal(serverCloseFor(assignment, at(9, 26), LEGACY_NO_EXTRA_TIME).closesAtMs, at(9, 25).getTime());
});

test('A/B days: the extension follows the day\'s own bell, and a day without the class has no window to extend', () => {
  // Wednesday 2026-09-02 is also an A day; a B-day override makes it a day
  // Period 1 does not meet.
  const wed = (hour, minute) => new Date(2026, 8, 2, hour, minute);
  const assignment = lesson({ instructionDate: localDateKey(wed(8, 0)) });
  assert.equal(dolFor(assignment, wed(9, 27), LEGACY_EXTRA_TIME).endsAt.getTime(), wed(9, 30).getTime());
  const bDay = { ...schedule, dayTypeOverrides: { [localDateKey(wed(8, 0))]: 'B' } };
  const state = getDOLState({ assignment, schedule: bDay, classId: 'class-a', classPeriod: 'Period 1', nowValue: wed(9, 27), studentProfile: LEGACY_EXTRA_TIME });
  assert.equal(state.status, 'unavailable');
  assert.equal(state.window, null);
  const close = resolveAuthoritativeClose({ assignment, activityRole: 'dol', schedule: bDay, classId: 'class-a', classPeriod: 'Period 1', nowValue: wed(9, 27), timeZone: null, studentId: 'S1', studentProfile: LEGACY_EXTRA_TIME });
  assert.equal(close.reason, 'assignment-final-deadline', 'no class window today: only the assignment cutoff can close it');
});

test('a day the calendar closes: an undesignated Friday has no window; an early-release day extends from its own bell', () => {
  const fri = (hour, minute) => new Date(2026, 8, 4, hour, minute);
  const friday = lesson({ instructionDate: localDateKey(fri(8, 0)) });
  const undesignated = dolFor(friday, fri(9, 27), LEGACY_EXTRA_TIME);
  assert.equal(undesignated.status, 'unavailable');
  assert.equal(undesignated.extendedTime, undefined, 'nothing is invented for a day with no bell');

  // Early release: Period 1 ends at 09:00, so the class DOL is 08:45–08:55
  // and the student's runs to 09:00.
  const mon = at(8, 0);
  const earlyRelease = { ...schedule, modifiedSchedules: { [localDateKey(mon)]: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '09:00' } } } } };
  const state = getDOLState({ assignment: lesson(), schedule: earlyRelease, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(8, 56), studentProfile: LEGACY_EXTRA_TIME });
  assert.equal(state.classEndsAt.getTime(), at(8, 55).getTime());
  assert.equal(state.endsAt.getTime(), at(9, 0).getTime());
  assert.equal(state.status, 'active');
  // Calendar disables the period for the day.
  const cancelled = { ...schedule, modifiedSchedules: { [localDateKey(mon)]: { periods: { 'Period 1': { enabled: false, start: '', end: '' } } } } };
  assert.equal(getDOLState({ assignment: lesson(), schedule: cancelled, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26), studentProfile: LEGACY_EXTRA_TIME }).status, 'unavailable');
});

test('an expired profile keeps applying; an inactive one does not; a profile limited to other activities does not reach the DOL', () => {
  const assignment = lesson();
  const expired = versioned({ effectiveStart: '2025-08-17', effectiveEnd: '2026-08-01' });
  assert.equal(dolFor(assignment, at(9, 26), expired).endsAt.getTime(), at(9, 30).getTime(), 'expired: still applied (H-120, as implemented)');
  assert.equal(serverCloseFor(assignment, at(9, 26), expired).closesAtMs, at(9, 30).getTime());

  const inactive = versioned({ status: 'inactive' });
  assert.equal(dolFor(assignment, at(9, 26), inactive).status, 'ended');
  assert.equal(serverCloseFor(assignment, at(9, 26), inactive).closesAtMs, at(9, 25).getTime());

  const classworkOnly = versioned({ appliesTo: ['classwork', 'practice'] });
  assert.equal(dolFor(assignment, at(9, 26), classworkOnly).status, 'ended');
  assert.equal(serverCloseFor(assignment, at(9, 26), classworkOnly).closesAtMs, at(9, 25).getTime());

  const dolNamed = versioned({ appliesTo: ['classwork', 'dol'] });
  assert.equal(dolFor(assignment, at(9, 26), dolNamed).endsAt.getTime(), at(9, 30).getTime());

  // A future-dated revision switches on by itself, on its start date.
  const startsTomorrow = versioned({ effectiveStart: '2026-09-01' });
  assert.equal(dolFor(assignment, at(9, 26), startsTomorrow).status, 'ended');
});

test('the legacy "extra-time" flag: moves no due date (supportDeadline.mjs) but extends the timed DOL, as on a secure exam', () => {
  const assignment = { ...lesson(), dueAt: MONDAY };
  assert.equal(dolFor(assignment, at(9, 26), LEGACY_EXTRA_TIME).endsAt.getTime(), at(9, 30).getTime());
  const classwork = resolveAuthoritativeClose({ assignment, activityRole: 'classwork', schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26), timeZone: null, studentId: 'S1', studentProfile: LEGACY_EXTRA_TIME });
  const classworkWithout = resolveAuthoritativeClose({ assignment, activityRole: 'classwork', schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26), timeZone: null, studentId: 'S1', studentProfile: null });
  assert.equal(classwork.closesAtMs, classworkWithout.closesAtMs, 'the assignment\'s own cutoff does not move for the legacy flag');
});

test('the Warm-Up stays class-timed', () => {
  const assignment = lesson();
  const plain = getWarmupState({ assignment, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(8, 5) });
  const projected = projectStudentAssignments({ assignments: [assignment], studentId: 'S1', profile: LEGACY_EXTRA_TIME, timingProfile: LEGACY_EXTRA_TIME })[0];
  assert.deepEqual(getWarmupState({ assignment: projected, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(8, 5) }), plain);
  const warmupClose = (profile) => resolveAuthoritativeClose({ assignment, activityRole: 'warmup', schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(8, 5), timeZone: null, studentId: 'S1', studentProfile: profile });
  assert.deepEqual(warmupClose(LEGACY_EXTRA_TIME), warmupClose(null));
});

test('teacher windows: early unlock, "+5 min" and a reopen all carry the student\'s extra minutes; "Close now" ends the class\'s window only', () => {
  const base = lesson();
  // Early unlock at 09:00: class 09:00–09:10, student to 09:15.
  const unlocked = { ...base, dol: buildDolWindowOpening({ assignment: base, classId: 'class-a', recovery: false, dateKey: MONDAY, now: at(9, 0).getTime() }).dol };
  assert.equal(dolFor(unlocked, at(9, 11), LEGACY_EXTRA_TIME).endsAt.getTime(), at(9, 15).getTime());
  assert.equal(serverCloseFor(unlocked, at(9, 11), LEGACY_EXTRA_TIME).closesAtMs, at(9, 15).getTime());

  // "+5 min" pressed at 09:24: class to 09:30, student to 09:35 — never less than before.
  const extended = { ...base, dol: buildDolExtension({ assignment: base, classId: 'class-a', dateKey: MONDAY, currentEndsAtMs: at(9, 25).getTime(), minutes: 5, capAtMs: at(9, 30).getTime(), now: at(9, 24).getTime() }).dol };
  assert.equal(dolFor(extended, at(9, 31), LEGACY_EXTRA_TIME).endsAt.getTime(), at(9, 35).getTime());
  assert.equal(dolFor(extended, at(9, 31), null).status, 'ended');

  // A reopen after the cutoff: a recovery window; ingestion's reopen check stretches with it.
  const reopened = { ...base, dol: buildDolWindowOpening({ assignment: base, classId: 'class-a', recovery: true, dateKey: MONDAY, now: at(9, 40).getTime() }).dol };
  const classClose = dolFor(reopened, at(9, 41), null).endsAt.getTime();
  assert.equal(dolFor(reopened, at(9, 41), LEGACY_EXTRA_TIME).endsAt.getTime(), classClose + 5 * MINUTE);
  const justAfterClass = new Date(classClose + MINUTE);
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: reopened, classId: 'class-a', at: justAfterClass, timeZone: null }), false);
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: reopened, classId: 'class-a', at: justAfterClass, timeZone: null, studentProfile: LEGACY_EXTRA_TIME }), true);
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: reopened, classId: 'class-a', at: new Date(classClose + 6 * MINUTE), timeZone: null, studentProfile: LEGACY_EXTRA_TIME }), false);

  // "Close now" at 09:20 ends the CLASS's DOL; a student on extra time keeps
  // their own remaining time, to the 09:30 they had (the owner, 2026-10-23,
  // RT05). Device and server agree on both.
  const closed = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: MONDAY, now: at(9, 20).getTime() }).dol };
  const classmate = dolFor(closed, at(9, 21), null);
  assert.deepEqual([classmate.status, classmate.teacherClosed, classmate.endsAt.getTime()], ['ended', true, at(9, 20).getTime()]);
  const classmateClose = serverCloseFor(closed, at(9, 21), null);
  assert.deepEqual([classmateClose.closesAtMs, classmateClose.reason], [at(9, 20).getTime(), 'teacher-dol-close']);
  const state = dolFor(closed, at(9, 21), LEGACY_EXTRA_TIME);
  assert.deepEqual(
    [state.status, state.teacherClosed, state.extendedTime, state.endsAt.getTime(), state.classEndsAt.getTime()],
    ['active', false, true, at(9, 30).getTime(), at(9, 20).getTime()],
  );
  const own = serverCloseFor(closed, at(9, 21), LEGACY_EXTRA_TIME);
  assert.deepEqual([own.closesAtMs, own.reason, own.extendedTime, own.classClosesAtMs], [at(9, 30).getTime(), 'dol-close', true, at(9, 20).getTime()]);
  assert.equal(dolFor(closed, at(9, 30, 1), LEGACY_EXTRA_TIME).status, 'ended', 'their own close still ends it');
  // A close stamped inside the student's extra minutes does not end them either.
  const lateClose = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: MONDAY, now: at(9, 27).getTime() }).dol };
  assert.equal(dolFor(lateClose, at(9, 28), LEGACY_EXTRA_TIME).endsAt.getTime(), at(9, 30).getTime());
  assert.equal(serverCloseFor(lateClose, at(9, 28), LEGACY_EXTRA_TIME).closesAtMs, at(9, 30).getTime());
});

test('"Close now" spares extra time at every edge, and the teacher\'s control says so', () => {
  const base = lesson();
  const closed = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: MONDAY, now: at(9, 20).getTime() }).dol };
  // Exactly at their own close the window is still theirs; a moment later it is over.
  assert.equal(dolFor(closed, at(9, 30), LEGACY_EXTRA_TIME).status, 'active');
  assert.equal(dolFor(closed, at(9, 30, 1), LEGACY_EXTRA_TIME).status, 'ended');
  // Double time keeps all ten of its extra minutes past the class's 09:25.
  assert.equal(serverCloseFor(closed, at(9, 21), DISTRICT_DOUBLE_TIME).closesAtMs, at(9, 35).getTime());
  // No extra time: the close ends them with the class.
  assert.equal(serverCloseFor(closed, at(9, 21), LEGACY_NO_EXTRA_TIME).closesAtMs, at(9, 20).getTime());
  // Extra time the student's own final cutoff had already cut to nothing (a
  // cutoff before the class's 09:25): no extra time to keep, so the close ends theirs too.
  const window = { startMs: at(8, 0).getTime(), endMs: at(9, 30).getTime() };
  const cutShort = resolveDolWindow({ assignment: closed, window, classId: 'class-a', todayKey: MONDAY, timeMultiplier: 1.5, capAtMs: at(9, 22).getTime() });
  assert.deepEqual([cutShort.endsAtMs, cutShort.teacherClosed, cutShort.extendedTime], [at(9, 20).getTime(), true, false]);
  // Partly cut (cutoff 09:28): they keep the time up to their cutoff.
  const partly = resolveDolWindow({ assignment: closed, window, classId: 'class-a', todayKey: MONDAY, timeMultiplier: 1.5, capAtMs: at(9, 28).getTime() });
  assert.deepEqual([partly.endsAtMs, partly.teacherClosed, partly.classEndsAtMs], [at(9, 28).getTime(), false, at(9, 20).getTime()]);
  // A reopen after the close is still the latest word, for the class and for them.
  const reopened = { ...closed, dol: buildDolWindowOpening({ assignment: closed, classId: 'class-a', recovery: true, dateKey: MONDAY, now: at(9, 40).getTime() }).dol };
  const classReopen = dolFor(reopened, at(9, 41), null).endsAt.getTime();
  assert.equal(dolFor(reopened, at(9, 41), LEGACY_EXTRA_TIME).endsAt.getTime(), classReopen + 5 * MINUTE);

  // The teacher's live view keeps listing who is still working after the close.
  const row = (studentId, displayName, stored) => ({ ...normalizeTeacherRosterSummary({ studentId, displayName, profile: stored }), displayName });
  const roster = [row('S1', 'Ana Ruiz', LEGACY_EXTRA_TIME), row('S2', 'Ben Ode', LEGACY_NO_EXTRA_TIME)];
  const working = dolExtraTimeForClass({ assignment: closed, schedule, classContext: { classId: 'class-a', classPeriod: 'Period 1' }, roster, nowValue: at(9, 21) });
  assert.deepEqual(working.students, [{ studentId: 'S1', name: 'Ana Ruiz', endsAt: at(9, 30) }]);
  assert.equal(working.classEndsAt.getTime(), at(9, 20).getTime());

  // "Close now" asks first, and says that a student on extra time keeps it.
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const closeBranch = region(app, "if (action === 'close') {", "} else if (action === 'extend') {", 'the DOL close confirmation');
  assert.match(closeBranch, /title: `Close the DOL now for \$\{classLabel\}\?`/);
  assert.match(closeBranch, /message: `[^`]*A student on extra time keeps their own remaining time\.[^`]*`/);
  assert.match(closeBranch, /build = \(\) => requireTeacherKit\(\)\.buildDolClose\(/);
});

test('the shared window resolver adds nothing at multiplier 1 and only fields at all', () => {
  const window = { startMs: at(8, 0).getTime(), endMs: at(9, 30).getTime() };
  const plain = resolveDolWindow({ assignment: lesson(), window, classId: 'class-a', todayKey: MONDAY });
  assert.equal(plain.endsAtMs, at(9, 25).getTime());
  assert.equal(plain.classEndsAtMs, plain.endsAtMs);
  assert.equal(plain.extendedTime, false);
  assert.equal(plain.extendedTimeMs, 0);
  assert.deepEqual(resolveDolWindow({ assignment: lesson(), window, classId: 'class-a', todayKey: MONDAY, timeMultiplier: 1 }), plain);
  const stretched = resolveDolWindow({ assignment: lesson(), window, classId: 'class-a', todayKey: MONDAY, timeMultiplier: 1.5 });
  assert.equal(stretched.endsAtMs, at(9, 30).getTime());
  assert.equal(stretched.extendedTimeMs, 5 * MINUTE);
  assert.equal(stretched.extendedTimeMultiplier, 1.5);
  assert.equal(stretched.opensAtMs, plain.opensAtMs);
  assert.equal(stretched.regularEndsAtMs, plain.regularEndsAtMs, 'the class\'s regular cutoff (teacher restart rule) does not move');
});

test('the student\'s own projection carries their profile in memory; a teacher\'s copy does not', () => {
  const assignment = lesson();
  const [forStudent] = projectStudentAssignments({ assignments: [assignment], studentId: 'S1', profile: LEGACY_EXTRA_TIME, timingProfile: LEGACY_EXTRA_TIME });
  assert.deepEqual(forStudent[STUDENT_TIMING_PROFILE_KEY], LEGACY_EXTRA_TIME);
  // No profile passed: the device reads the injected one.
  const onDevice = getDOLState({ assignment: forStudent, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) });
  assert.equal(onDevice.status, 'active');
  assert.equal(onDevice.endsAt.getTime(), at(9, 30).getTime());
  // The teacher's (stored) copy: the class window.
  assert.equal(getDOLState({ assignment, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) }).status, 'ended');
  // A student with no profile gets the assignment exactly as before.
  const [plain] = projectStudentAssignments({ assignments: [assignment], studentId: 'S2', profile: null, timingProfile: null });
  assert.equal(Object.hasOwn(plain, STUDENT_TIMING_PROFILE_KEY), false);
  // The shared document is never touched.
  assert.equal(Object.hasOwn(assignment, STUDENT_TIMING_PROFILE_KEY), false);
});

test('Recovery waits for the student\'s own DOL close', () => {
  const assignment = lesson();
  const opportunity = (profile, when) => resolveOriginalOpportunity({
    assignment, section: 'dol', schedule, classId: 'class-a', classPeriod: 'Period 1', studentId: 'S1', nowValue: when.getTime(), timeZone: null, studentProfile: profile,
  });
  assert.equal(opportunity(null, at(9, 26)).status, ORIGINAL_OPPORTUNITY.CLOSED);
  assert.equal(opportunity(LEGACY_EXTRA_TIME, at(9, 26)).status, ORIGINAL_OPPORTUNITY.OPEN);
  assert.equal(opportunity(LEGACY_EXTRA_TIME, at(9, 26)).closesAtMs, at(9, 30).getTime());
  assert.equal(opportunity(LEGACY_EXTRA_TIME, at(9, 31)).status, ORIGINAL_OPPORTUNITY.CLOSED);
});

test('the device reads the profile it is given after normalizeStudentProfile: the same multiplier as the server\'s raw read', () => {
  // The student's device and the teacher's roster hold normalizeStudentProfile(raw);
  // the server reads raw grades/{id}.profile. For every shape MathMaster
  // persists, both give the same answer.
  const now = at(9, 0).getTime();
  const shapes = {
    legacyExtraTime: LEGACY_EXTRA_TIME,
    legacyNone: LEGACY_NO_EXTRA_TIME,
    inclusion: { inclusionStatus: true, accommodations: [], modifications: [] },
    plan: versioned(),
    expiredPlan: versioned({ effectiveStart: '2025-08-17', effectiveEnd: '2026-08-01' }),
    inactivePlan: versioned({ status: 'inactive' }),
    classworkOnlyPlan: versioned({ appliesTo: ['classwork'] }),
    dolPlan: versioned({ appliesTo: ['dol'] }),
  };
  for (const [name, raw] of Object.entries(shapes)) {
    const server = dolExtendedTimeMultiplier(raw, { nowValue: now });
    assert.equal(dolExtendedTimeMultiplier(normalizeStudentProfile(raw, { nowValue: now }), { nowValue: now }), server, `${name}: student device`);
    assert.equal(dolExtendedTimeMultiplier(normalizeTeacherRosterSummary({ studentId: 'S1', profile: raw }).profile, { nowValue: now }), server, `${name}: teacher roster row`);
  }
});

test('the student is told their own close time while they work, in student words, and nothing else changes', () => {
  const endsAt = at(10, 52);
  assert.equal(dolExtraTimeNotice({ extendedTime: true, endsAt }), 'Your exit ticket closes at 10:52 — extra time.');
  assert.equal(dolExtraTimeNotice({ extendedTime: true, endsAt: at(13, 5) }), 'Your exit ticket closes at 1:05 — extra time.');
  assert.equal(dolExtraTimeNotice({ extendedTime: false, endsAt }), '');
  const open = describeDolClose({ status: 'active', teacherClosed: false, outcome: null, extendedTime: true, endsAt });
  assert.equal(open.extraTimeNotice, 'Your exit ticket closes at 10:52 — extra time.');
  assert.equal(open.openNotice, `Your exit ticket closes at 10:52 — extra time. ${DOL_OPEN_NOTICE}`);
  assert.doesNotMatch(open.openNotice, /accommodat|IEP|504|multiplier|×/i, 'the line names no support');
  // Without extra time, and once closed, the copy is exactly as before.
  const plain = describeDolClose({ status: 'active', teacherClosed: false, outcome: null });
  assert.equal(plain.openNotice, DOL_OPEN_NOTICE);
  assert.equal(plain.extraTimeNotice, '');
  const ended = describeDolClose({ status: 'ended', teacherClosed: false, outcome: 'auto-submitted', extendedTime: true, endsAt });
  assert.equal(ended.extraTimeNotice, '');
  assert.equal(ended.openNotice, '');
  // End to end from the student's own window.
  const state = dolFor(lesson(), at(9, 26), LEGACY_EXTRA_TIME);
  assert.equal(describeDolClose({ status: state.status, extendedTime: state.extendedTime, endsAt: state.endsAt }).extraTimeNotice, 'Your exit ticket closes at 9:30 — extra time.');
});

test('the assignment screen hands the student\'s own window to the DOL copy', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const call = region(app, 'const currentDolCopy = currentIsDOL && !preview', ': null;', 'the DOL copy call');
  assert.match(call, /describeDolClose\(\{[^}]*extendedTime: dolState\.extendedTime[^}]*endsAt: dolState\.endsAt[^}]*\}\)/);
  // …and dolState there is the student's: getDOLState on the projected assignment.
  assert.match(app, /const dolState = getDOLState\(\{ assignment, schedule: classSchedule, classId: user\?\.classId \|\| null, classPeriod: user\?\.classPeriod, nowValue: now \}\);\s*\n[^\n]*\n?[\s\S]{0,4000}const currentDolCopy/);
  assert.match(app, /import \{ describeDolClose \} from '\.\/platform\/assessment\/dolCloseCopy\.js';/);
});

test('the teacher\'s live view knows who still has extra time, and never says so on the projector', () => {
  const assignment = lesson();
  // Rows as the teacher's roster holds them (teacherRosterSummary.js): the
  // normalized profile, and the stored field as `timingProfile`.
  const row = (studentId, displayName, stored) => ({ ...normalizeTeacherRosterSummary({ studentId, displayName, profile: stored }), displayName });
  const roster = [
    row('S1', 'Ana Ruiz', LEGACY_EXTRA_TIME),
    row('S2', 'Ben Ode', LEGACY_NO_EXTRA_TIME),
    row('S3', 'Cy Lee', versioned({ appliesTo: ['classwork'] })),
    // Supports only at the top of the grade document (no `profile` field): the
    // full roster's normalized copy shows extra time, the server grants none.
    { id: 'S5', displayName: 'Eli Moss', profile: normalizeStudentProfile({ accommodations: ['extra-time'] }), timingProfile: null },
  ];
  const classContext = { classId: 'class-a', classPeriod: 'Period 1' };
  const during = dolExtraTimeForClass({ assignment, schedule, classContext, roster, nowValue: at(9, 20) });
  assert.deepEqual(during.students.map((student) => student.studentId), ['S1'], 'known before the class timer ends, so "Close now" is an informed choice');
  const after = dolExtraTimeForClass({ assignment, schedule, classContext, roster, nowValue: at(9, 27) });
  assert.equal(after.classEndsAt.getTime(), at(9, 25).getTime());
  assert.equal(after.endsAt.getTime(), at(9, 30).getTime());
  assert.equal(after.millisecondsRemaining, 3 * MINUTE);
  assert.deepEqual(after.students, [{ studentId: 'S1', name: 'Ana Ruiz', endsAt: at(9, 30) }]);
  assert.equal(dolExtraTimeForClass({ assignment, schedule, classContext, roster, nowValue: at(9, 31) }), null, 'gone when their time is up');
  // Two students, two closes: the chip counts down to the last one.
  const two = dolExtraTimeForClass({ assignment, schedule, classContext, roster: [...roster, { id: 'S4', displayName: 'Dee Kim', profile: {}, timingProfile: DISTRICT_DOUBLE_TIME }], nowValue: at(9, 27) });
  assert.deepEqual(two.students.map((student) => [student.studentId, student.endsAt.getMinutes()]), [['S1', 30], ['S4', 35]]);
  assert.equal(two.endsAt.getTime(), at(9, 35).getTime());
  assert.equal(dolExtraTimeForClass({ assignment, schedule, classContext, roster: roster.slice(1), nowValue: at(9, 27) }), null, 'nobody with extra time: nothing shown');
  assert.equal(dolExtraTimeForClass({ assignment, schedule, classContext, roster, nowValue: at(9, 0) }), null, 'not before the DOL opens');

  const monitor = executableSource(readFileSync(new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url), 'utf8'));
  assert.match(monitor, /import \{ dolExtraTimeForClass \} from '\.\.\/\.\.\/platform\/teacher\/dolExtraTimeRoster\.js';/);
  const timers = region(monitor, 'const activeSectionTimers = useMemo(', '.sort((left, right)', 'the live view\'s timers');
  assert.match(timers, /const extraTime = projecting \? null : dolExtraTimeForClass\(\{ assignment, schedule: classSchedule, classContext: timerContext, roster: monitoredRoster, nowValue \}\);/);
  assert.match(timers, /if \(extraTime\) \{\s*timers\.push\(\{ kind: 'DOL extra time'[^}]*endsAt: extraTime\.endsAt/);
});

test('the class pack-up banner stands aside while the student is on their exit ticket\'s extra time', () => {
  const lessonForClass = { ...lesson(), assignedClassIds: ['class-a'] };
  const own = (profile) => projectStudentAssignments({ assignments: [lessonForClass], studentId: 'S1', profile, timingProfile: profile });
  const open = (assignments, when) => studentExtraTimeDolOpen({ assignments, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: when });
  // 09:27: the class's DOL closed at 09:25, the bell is 09:30 (pack-up from 09:25).
  assert.equal(open(own(LEGACY_EXTRA_TIME), at(9, 27)), true);
  assert.equal(open(own(LEGACY_NO_EXTRA_TIME), at(9, 27)), false, 'a classmate is told to pack up as before');
  assert.equal(open(own(LEGACY_EXTRA_TIME), at(9, 30, 1)), false, 'and so is this student once their own DOL has closed');
  assert.equal(open(own(LEGACY_EXTRA_TIME), at(9, 20)), true);
  // A DOL that runs to the bell (closeMinutesBeforeEnd 0) is open for the
  // whole class during pack-up: only extra time — not an open DOL — sets the
  // banner aside.
  const toTheBell = { ...lessonForClass, dol: { ...lessonForClass.dol, closeMinutesBeforeEnd: 0 } };
  const ownToTheBell = (profile) => projectStudentAssignments({ assignments: [toTheBell], studentId: 'S1', profile, timingProfile: profile });
  assert.equal(open(ownToTheBell(LEGACY_NO_EXTRA_TIME), at(9, 27)), false);
  assert.equal(open(ownToTheBell(LEGACY_EXTRA_TIME), at(9, 27)), true);
  // Another class's lesson is not theirs.
  assert.equal(studentExtraTimeDolOpen({ assignments: own(LEGACY_EXTRA_TIME), schedule, classId: 'class-b', classPeriod: 'Period 1', nowValue: at(9, 27) }), false);

  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const banner = region(app, 'const renderStudentPackUpNotice = (', 'const renderStudentWarmupBanner = () => {', 'the pack-up line');
  assert.match(banner, /if \(packUp\.status !== 'active'\) return null;\s*if \(studentExtraTimeDolOpen\(\{ assignments, schedule: classSchedule, classId: user\.classId \|\| null, classPeriod: user\.classPeriod, nowValue: now \}\)\) return null;/);
  const lifecycleImport = region(app, "import {\n  CLASS_PERIODS,", "} from './assignmentLifecycle';", 'the assignmentLifecycle import');
  assert.match(lifecycleImport, /\n {2}studentExtraTimeDolOpen,\n/);
});

test('device and server take the timing profile from the same field: the grade document\'s `profile`, never the whole document', () => {
  const assignment = lesson();
  const both = (gradeData) => {
    // App.jsx: user.profile is normalizeStudentProfile(data.profile || data); the
    // DOL window reads timingProfile = data.profile || null, as the server does.
    const [onDevice] = projectStudentAssignments({
      assignments: [assignment], studentId: 'S1',
      profile: normalizeStudentProfile(gradeData.profile || gradeData),
      timingProfile: gradeData.profile || null,
    });
    return {
      device: getDOLState({ assignment: onDevice, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) }),
      server: serverCloseFor(assignment, at(9, 26), gradeData.profile || null),
    };
  };
  // A grade document with supports at the top level and no `profile` field.
  for (const gradeData of [{ accommodations: ['extra-time'] }, { inclusionStatus: true, accommodations: [] }]) {
    const { device, server } = both(gradeData);
    assert.equal(device.status, 'ended', `${JSON.stringify(gradeData)}: no profile field, no extra time on the device`);
    assert.equal(device.endsAt.getTime(), server.closesAtMs, 'the device closes when the server does');
    assert.equal(server.closesAtMs, at(9, 25).getTime());
  }
  // The same supports under `profile`: extra time on both.
  for (const gradeData of [{ profile: LEGACY_EXTRA_TIME }, { profile: DISTRICT_DOUBLE_TIME }]) {
    const { device, server } = both(gradeData);
    assert.equal(device.status, 'active');
    assert.equal(device.endsAt.getTime(), server.closesAtMs, `${JSON.stringify(gradeData)}: same close on both`);
  }

  // App.jsx hands the projection exactly that field.
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const signIn = region(app, "role: 'student',", '});', 'the student sign-in user');
  assert.match(signIn, /timingProfile: studentData\.profile \|\| null,/);
  assert.match(app, /studentViewerRef\.current = \{ studentId, profile: studentProfile, timingProfile: studentData\.profile \|\| null \};/);
  assert.match(app, /studentViewerRef\.current = \{ studentId: user\.id, profile: user\.profile \|\| null, timingProfile: user\.timingProfile \|\| null \};/);
  assert.match(app, /const liveTimingProfile = snapshot\.data\(\)\?\.profile \|\| null;/);
  const projections = app.match(/projectStudentAssignments\(\{[^}]*\}\)/g) || [];
  assert.equal(projections.length, 3);
  projections.forEach((call) => assert.match(call, /timingProfile[,:]/, call));
  assert.doesNotMatch(app, /timingProfile: [^,\n]*\|\| studentData[,\s]/, 'never the whole document');
  // The timing profile joins the projection's inputs WITHOUT moving the
  // controls: URL arrival waits for lastPublishedRef.current[4] to be them.
  const publish = region(app, 'const publishStudentAssignments = () => {', 'setAssignments(projectStudentAssignments({', 'publishStudentAssignments');
  const inputs = publish.match(/const inputs = \[([^\]]*)\];/)?.[1].split(',').map((entry) => entry.trim()) || [];
  assert.equal(inputs[4], 'studentControlsRef.current', `inputs: ${inputs.join(', ')}`);
  assert.ok(inputs.includes('timingProfile'));
  assert.match(app, /lastPublishedRef\.current\?\.\[4\] === studentAssignmentControls/);
  // A change to the profile field alone re-projects.
  assert.match(app, /\}, \[user\?\.role, user\?\.id, user\?\.profile, user\?\.timingProfile, studentAssignmentControls, teacherClassControls\]\);/);
  assert.match(app, /setUser\(\(current\) => \(current && !sameTimingProfile\(current\.timingProfile, liveTimingProfile\) \? \{ \.\.\.current, timingProfile: liveTimingProfile \} : current\)\);/);
  assert.match(app, /import \{ EMPTY_STUDENT_CONTROLS, STUDENT_CONTROLS_STATUS, projectStudentAssignments, sameTimingProfile \} from '\.\/platform\/assignments\/studentAssignmentControls\.js';/);
});

test('extra time never runs past the student\'s own final cutoff, and never cuts into the class window', () => {
  const dueAt = (when) => ({ ...lesson(), dueAt: when.toISOString(), lateDueAt: when.toISOString() });
  for (const [cutoff, expected] of [[at(9, 30), at(9, 30)], [at(9, 27), at(9, 27)], [at(9, 20), at(9, 25)], [at(10, 0), at(9, 35)]]) {
    const assignment = dueAt(cutoff);
    const [onDevice] = projectStudentAssignments({ assignments: [assignment], studentId: 'S1', profile: null, timingProfile: DISTRICT_DOUBLE_TIME });
    const device = getDOLState({ assignment: onDevice, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) });
    const server = serverCloseFor(assignment, at(9, 26), DISTRICT_DOUBLE_TIME);
    assert.equal(device.endsAt.getTime(), expected.getTime(), `cutoff ${cutoff.toTimeString().slice(0, 5)}: device`);
    assert.equal(server.closesAtMs, expected.getTime(), `cutoff ${cutoff.toTimeString().slice(0, 5)}: server`);
    assert.equal(device.classEndsAt.getTime(), at(9, 25).getTime());
  }
  // The student's own extension moves the cap with it.
  const extended = { ...dueAt(at(9, 30)), studentOverrides: { S1: { lateDueAt: at(12, 0).toISOString() } } };
  const [own] = projectStudentAssignments({ assignments: [extended], studentId: 'S1', profile: null, timingProfile: DISTRICT_DOUBLE_TIME });
  assert.equal(getDOLState({ assignment: own, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) }).endsAt.getTime(), at(9, 35).getTime());
  assert.equal(serverCloseFor(extended, at(9, 26), DISTRICT_DOUBLE_TIME).closesAtMs, at(9, 35).getTime());
});

test('the live timing profile is compared by content, not key order', () => {
  assert.equal(sameTimingProfile({ accommodations: ['extra-time'], inclusionStatus: false }, { inclusionStatus: false, accommodations: ['extra-time'] }), true);
  assert.equal(sameTimingProfile({ supportPlan: { windows: [{ a: 1, b: 2 }] } }, { supportPlan: { windows: [{ b: 2, a: 1 }] } }), true);
  assert.equal(sameTimingProfile(null, undefined), true);
  assert.equal(sameTimingProfile({ accommodations: ['extra-time'] }, { accommodations: [] }), false);
  assert.equal(sameTimingProfile({ accommodations: ['a', 'b'] }, { accommodations: ['b', 'a'] }), false, 'array order is content');
  assert.equal(sameTimingProfile(null, {}), false);
});

test('on-device Recovery, the finalize hint and the teacher roster take timing from the stored `profile` field', () => {
  const assignment = lesson();
  // Recovery (resolveOriginalOpportunity) with what the device now passes —
  // gradeData.profile || null — agrees with the server's own read.
  const opportunity = (studentProfile, when) => resolveOriginalOpportunity({
    assignment, section: 'dol', schedule, classId: 'class-a', classPeriod: 'Period 1', studentId: 'S1', nowValue: when.getTime(), timeZone: null, studentProfile,
  });
  const noProfileField = { accommodations: ['extra-time'] };
  assert.equal(opportunity(noProfileField.profile || null, at(9, 26)).status, ORIGINAL_OPPORTUNITY.CLOSED, 'no profile field: closed with the class, as on the server');
  assert.equal(opportunity(normalizeStudentProfile(noProfileField), at(9, 26)).status, ORIGINAL_OPPORTUNITY.OPEN, '(the normalized fallback would have held it open)');
  assert.equal(opportunity(DISTRICT_DOUBLE_TIME, at(9, 33)).status, ORIGINAL_OPPORTUNITY.OPEN, 'a district multiplier keeps it open on the device too');

  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const discovery = region(app, 'studentRecoveryMinute * 60000,', 'const studentRecoverySummary = useMemo(', 'Recovery discovery');
  assert.match(discovery, /user\?\.timingProfile, assignments/);
  const discoveryCall = app.slice(app.lastIndexOf('schedule: classSchedule,', app.indexOf('studentRecoveryMinute * 60000,')), app.indexOf('studentRecoveryMinute * 60000,'));
  assert.match(discoveryCall, /studentProfile: user\.timingProfile \|\| null,/);
  const summary = region(app, 'const studentRecoverySummary = useMemo(', 'useEffect(() => {', 'Recovery summary');
  assert.match(summary, /studentProfile: user\.timingProfile \|\| null,/);
  assert.match(summary, /user\?\.timingProfile, classSchedule\]/);
  const scope = region(app, 'recoveryDiscoveryScope', 'const studentRecoveryByAssignment = useMemo(', 'Recovery discovery scope');
  assert.match(scope, /studentProfile: user\.timingProfile \|\| null,\s*nowValue: now,/);
  assert.match(scope, /user\?\.timingProfile, assignments/);
  // The checkpoint's finalize hint (resolveAuthoritativeClose before enqueueResponseCheckpoint).
  assert.match(app, /studentId: user\.id,\s*studentProfile: user\.timingProfile \|\| null,\s*\}\);\s*try \{\s*setStudentPersistenceStatus\('capturing'\);/);
  // No D7 timing reader is left on the normalized copy.
  assert.doesNotMatch(app, /studentProfile: user\.profile \|\| null/);
  // The teacher's rows carry the stored field.
  assert.match(app, /profile: normalizeStudentProfile\(studentDoc\.data\(\)\?\.profile \|\| studentDoc\.data\(\)\), timingProfile: studentDoc\.data\(\)\?\.profile \|\| null \}/);
  // A saved profile refreshes both teacher rosters' timing field.
  assert.equal((app.match(/\{ \.\.\.entry, profile: nextProfile, timingProfile \}/g) || []).length, 2);
  assert.equal(normalizeTeacherRosterSummary({ studentId: 'S1', profile: LEGACY_EXTRA_TIME }).timingProfile, LEGACY_EXTRA_TIME);
  assert.equal(normalizeTeacherRosterSummary({ studentId: 'S1' }).timingProfile, null);
});
