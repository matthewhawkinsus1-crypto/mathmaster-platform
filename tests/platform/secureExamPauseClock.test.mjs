import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { componentSource, region } from './helpers/sourceContract.mjs';
import { classifySecureExamError, pauseKind } from '../../src/platform/assessment/secureExamNavigationModel.js';

/*
 * A TEACHER'S PAUSE STOPS THE CLOCK (follow-up to PR #461).
 *
 * A Test the teacher has paused or archived, or any test a proctor has paused,
 * does not spend the student's time: the deadline moves with the clock while
 * the pause is on, and on resume it stands extended by exactly the time
 * paused. An integrity lock is not a teacher's pause; the clock runs through
 * it as before. The emulator suite drives the real callables
 * (tests/integration/secureExamNavigation.test.mjs).
 */

const require = createRequire(import.meta.url);
const secureExam = require('../../functions/lib/secureExam.js');

const MINUTE = 60 * 1000;
const started = 1_700_000_000_000;
const session = { status: 'in_progress', timeLimitSeconds: 600, startedAt: started, addedTimeSeconds: 0 };

test('a pause that spans the deadline extends it by exactly the time paused', () => {
  assert.equal(secureExam.deadlineFor(session), started + 10 * MINUTE);
  // Paused at minute 8, two minutes before the deadline.
  const paused = { ...session, ...secureExam.withPauseHold(session, 'proctor', started + 8 * MINUTE) };
  assert.equal(secureExam.clockPausedSince(paused), started + 8 * MINUTE);
  // While the pause is on, the time left stays two minutes, at minute 9, 30 or 300.
  for (const minute of [9, 30, 300]) {
    const now = started + minute * MINUTE;
    assert.equal(secureExam.deadlineFor(paused, now) - now, 2 * MINUTE, `two minutes left at minute ${minute}`);
    assert.equal(secureExam.isExpired(paused, now), false);
  }
  // Resumed at minute 38: thirty minutes paused, banked; the deadline is minute 40.
  const resumed = { ...paused, ...secureExam.withoutPauseHold(paused, 'proctor', started + 38 * MINUTE) };
  assert.equal(resumed.pausedSeconds, 30 * 60);
  assert.equal(secureExam.clockPausedSince(resumed), null);
  assert.equal(secureExam.deadlineFor(resumed, started + 39 * MINUTE), started + 40 * MINUTE);
  assert.equal(secureExam.isExpired(resumed, started + 40 * MINUTE), true, 'and the clock runs again');
});

test('two holds stop the clock once; it runs again only when both are lifted', () => {
  const proctor = { ...session, ...secureExam.withPauseHold(session, 'proctor', started + MINUTE) };
  const both = { ...proctor, ...secureExam.withPauseHold(proctor, 'assignment', started + 2 * MINUTE) };
  assert.deepEqual(secureExam.pauseHoldsOf(both), ['proctor', 'assignment']);
  assert.equal(secureExam.clockPausedSince(both), started + MINUTE, 'the pause began with the first hold');
  const one = { ...both, ...secureExam.withoutPauseHold(both, 'proctor', started + 3 * MINUTE) };
  assert.equal(secureExam.clockPausedSince(one), started + MINUTE, 'still stopped');
  assert.equal(one.pausedSeconds, undefined, 'nothing banked yet');
  const none = { ...one, ...secureExam.withoutPauseHold(one, 'assignment', started + 5 * MINUTE) };
  assert.equal(none.pausedSeconds, 4 * 60, 'four minutes paused in all');
  // Holds already on, or never on, change nothing; an unknown hold is not a pause.
  assert.deepEqual(secureExam.withPauseHold(proctor, 'proctor', started + 9 * MINUTE), {});
  assert.deepEqual(secureExam.withoutPauseHold(session, 'proctor', started + 9 * MINUTE), {});
  assert.deepEqual(secureExam.withPauseHold(session, 'integrity', started), {});
});

test('a pause that begins after the deadline does not bring the test back', () => {
  const late = { ...session, ...secureExam.withPauseHold(session, 'assignment', started + 11 * MINUTE) };
  assert.equal(secureExam.isExpired(late, started + 12 * MINUTE), true);
  assert.equal(secureExam.isExpired(late, started + 60 * MINUTE), true);
});

test('the student is told the clock is stopped, at how much time left; the hold itself stays on the server', () => {
  const paused = { ...session, ...secureExam.withPauseHold(session, 'assignment', Date.now() - 5 * MINUTE), startedAt: Date.now() - 12 * MINUTE, timeLimitSeconds: 15 * 60 };
  const view = secureExam.publicSession(paused);
  assert.equal(view.clockPaused, true);
  // 15 minutes, 7 used before the pause: 8 minutes left however long it lasts.
  assert.ok(Math.abs(view.pausedRemainingSeconds - 8 * 60) <= 1, String(view.pausedRemainingSeconds));
  assert.equal('teacherPause' in view, false);
  assert.equal('pausedSeconds' in view, false);
  const running = secureExam.publicSession(session);
  assert.equal(running.clockPaused, false);
  assert.equal('pausedRemainingSeconds' in running, false);
});

test('the screen shows a teacher pause for a Test whose assessment is paused, and asks the server on a refusal', () => {
  assert.equal(pauseKind('in_progress', true), 'teacher');
  assert.equal(pauseKind('in_progress', false), null);
  assert.equal(pauseKind('locked_integrity', true), 'integrity');
  assert.equal(pauseKind('submitted', true), null, 'a finished test is not paused');
  for (const availability of ['unpublished', 'archived']) {
    const refusal = Object.assign(new Error('This assessment is paused by your teacher.'), { code: 'functions/failed-precondition', details: { availability } });
    assert.equal(classifySecureExamError(refusal).kind, 'paused', availability);
  }
  const container = componentSource('src/components/assessment/SecureExamContainer.jsx');
  const paused = region(container, "if (problem.kind === 'paused') {", 'return true;', 'paused');
  assert.match(paused, /refreshSession\(\);/);
  assert.match(container, /if \(!session\?\.examSessionId \|\| !\(locked\.has\(session\.status\) \|\| session\.clockPaused === true\)\) return undefined;/);
  assert.match(container, /clockPaused=\{session\.clockPaused === true\}\s+pausedRemainingSeconds=\{session\.pausedRemainingSeconds\}/);
});

test('the header clock stops at the server\'s time left and ends nothing while stopped', () => {
  const header = componentSource('src/components/assessment/ExamPrepHeader.jsx');
  const effect = region(header, 'useEffect(() => {\n    firedRef.current = false;', '}, [initialDeadline, clockPaused, pausedRemainingSeconds]);', 'clock');
  const stopped = region(effect, 'if (clockPaused) {', 'return undefined;', 'stopped');
  assert.match(stopped, /setSecondsRemaining\(/);
  assert.doesNotMatch(stopped, /setInterval|onTimeExpired/, 'no countdown and no time-up while stopped');
  assert.ok(effect.indexOf('if (clockPaused) {') < effect.indexOf('const tick = () => {'), 'checked before the countdown starts');
});

test('a proctor pause and an assessment pause both hold the clock on the server; the student can still see where the test stands', () => {
  const functionsIndex = componentSource('functions/index.js');
  const proctor = region(functionsIndex, 'exports.proctorExamAction = onCall(', '\n});', 'proctor');
  assert.match(proctor, /if \(action === "lock"\) updated = \{ \.\.\.updated, status: "locked_proctor", lockReason: "Locked by proctor\.", lockedAt: now, \.\.\.secureExam\.withPauseHold\(session, "proctor", now\) \};/);
  assert.match(proctor, /if \(action === "unlock"\) updated = \{ \.\.\.updated, status: "in_progress", lockReason: null, unlockedAt: now, \.\.\.secureExam\.withoutPauseHold\(session, "proctor", now\) \};/);
  const lifecycle = region(functionsIndex, 'exports.manageAssignmentLifecycle = onCall(', '\n});', 'lifecycle');
  assert.match(lifecycle, /await holdCourseTestClocks\(db, ref\.id, \{ closed: archived \|\| assignment\.unpublished === true, now \}\);/);
  assert.match(lifecycle, /await holdCourseTestClocks\(db, ref\.id, \{ closed: unpublished \|\| assignment\.archived === true, now \}\);/);
  const start = region(functionsIndex, 'exports.startSecureExamSession = onCall(', '\n});', 'start');
  assert.match(start, /if \(secureExam\.pauseHoldsOf\(entrySession\)\.includes\("assignment"\)/);
});
