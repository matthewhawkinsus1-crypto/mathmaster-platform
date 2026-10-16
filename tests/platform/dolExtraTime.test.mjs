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

import { getDOLState, getWarmupState, localDateKey } from '../../src/assignmentLifecycle.js';
import { buildDolClose, buildDolExtension, buildDolWindowOpening } from '../../src/platform/assessment/assessmentRecovery.js';
import { projectStudentAssignments } from '../../src/platform/assignments/studentAssignmentControls.js';
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
  const projected = projectStudentAssignments({ assignments: [assignment], studentId: 'S1', profile: LEGACY_EXTRA_TIME })[0];
  assert.deepEqual(getWarmupState({ assignment: projected, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(8, 5) }), plain);
  const warmupClose = (profile) => resolveAuthoritativeClose({ assignment, activityRole: 'warmup', schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(8, 5), timeZone: null, studentId: 'S1', studentProfile: profile });
  assert.deepEqual(warmupClose(LEGACY_EXTRA_TIME), warmupClose(null));
});

test('teacher windows: early unlock, "+5 min" and a reopen all carry the student\'s extra minutes; "Close now" ends everyone', () => {
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

  // "Close now" at 09:20 ends the DOL for the class and the student alike.
  const closed = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: MONDAY, now: at(9, 20).getTime() }).dol };
  const state = dolFor(closed, at(9, 21), LEGACY_EXTRA_TIME);
  assert.equal(state.status, 'ended');
  assert.equal(state.teacherClosed, true);
  assert.equal(state.extendedTime, false);
  assert.equal(serverCloseFor(closed, at(9, 21), LEGACY_EXTRA_TIME).closesAtMs, at(9, 20).getTime());
  // A close stamped inside the student's extra minutes ends them there.
  const lateClose = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: MONDAY, now: at(9, 27).getTime() }).dol };
  assert.equal(dolFor(lateClose, at(9, 26), LEGACY_EXTRA_TIME).endsAt.getTime(), at(9, 27).getTime());
  assert.equal(serverCloseFor(lateClose, at(9, 28), LEGACY_EXTRA_TIME).closesAtMs, at(9, 27).getTime());
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
  const [forStudent] = projectStudentAssignments({ assignments: [assignment], studentId: 'S1', profile: LEGACY_EXTRA_TIME });
  assert.deepEqual(forStudent[STUDENT_TIMING_PROFILE_KEY], LEGACY_EXTRA_TIME);
  // No profile passed: the device reads the injected one.
  const onDevice = getDOLState({ assignment: forStudent, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) });
  assert.equal(onDevice.status, 'active');
  assert.equal(onDevice.endsAt.getTime(), at(9, 30).getTime());
  // The teacher's (stored) copy: the class window.
  assert.equal(getDOLState({ assignment, schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 26) }).status, 'ended');
  // A student with no profile gets the assignment exactly as before.
  const [plain] = projectStudentAssignments({ assignments: [assignment], studentId: 'S2', profile: null });
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
  const roster = [
    { id: 'S1', displayName: 'Ana Ruiz', profile: normalizeStudentProfile(LEGACY_EXTRA_TIME) },
    { id: 'S2', displayName: 'Ben Ode', profile: normalizeStudentProfile(LEGACY_NO_EXTRA_TIME) },
    { id: 'S3', displayName: 'Cy Lee', profile: normalizeStudentProfile(versioned({ appliesTo: ['classwork'] })) },
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
  const two = dolExtraTimeForClass({ assignment, schedule, classContext, roster: [...roster, { id: 'S4', displayName: 'Dee Kim', profile: DISTRICT_DOUBLE_TIME }], nowValue: at(9, 27) });
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
