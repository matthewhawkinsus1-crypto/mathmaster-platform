import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * AN EXPIRED, ABANDONED TIMED TEST IS FINISHED BY THE SERVER (pass 3, batch 3).
 *
 * A started session stores `autoFinalizeAt`, where the scheduled finalizer
 * (`finalizeAbandonedSecureExams`) will look: the deadline every call uses
 * (`deadlineFor`: the limit, which carries extended time from start, plus added
 * time, plus every paused second) plus a grace. The hint is never the
 * authority: the finalizer finishes a session only when `autoFinalizeDue` says
 * so inside its transaction. These are the pure rules and the wiring that CI
 * can see; the emulator suite drives the real functions
 * (tests/integration/secureExamAutoFinalize, `npm run test:secure-exam-auto-finalize`).
 */

const require = createRequire(import.meta.url);
const secureExam = require('../../functions/lib/secureExam.js');
const sweep = require('../../functions/lib/secureExamAutoFinalize.js');

const MINUTE = 60 * 1000;
const GRACE = secureExam.AUTO_FINALIZE_GRACE_MS;
const started = 1_700_000_000_000;
const session = { status: 'in_progress', timeLimitSeconds: 600, startedAt: started, addedTimeSeconds: 0 };
const deadline = started + 10 * MINUTE;

test('the grace is short and real: two minutes', () => {
  assert.equal(GRACE, 2 * MINUTE);
});

test('the hint is the deadline every call uses, plus the grace, and the finalizer acts only after both', () => {
  assert.equal(secureExam.autoFinalizeAtFor(session, started), deadline + GRACE);
  assert.equal(secureExam.autoFinalizeDue(session, deadline - 1), false, 'time left');
  assert.equal(secureExam.autoFinalizeDue(session, deadline), false, 'time up, within the grace');
  assert.equal(secureExam.autoFinalizeDue(session, deadline + GRACE - 1), false, 'the last moment of the grace');
  assert.equal(secureExam.autoFinalizeDue(session, deadline + GRACE), true, 'the grace is over');
  // An integrity lock is not a pause: the clock runs through it, and so does the finalizer.
  const integrity = { ...session, status: 'locked_integrity' };
  assert.equal(secureExam.autoFinalizeAtFor(integrity, started), deadline + GRACE);
  assert.equal(secureExam.autoFinalizeDue(integrity, deadline + GRACE), true);
});

test('extended time and added time are time left', () => {
  // Started with a 1.5× accommodation: the limit stored at start is the student's.
  const extended = { ...session, baseTimeLimitSeconds: 600, timeLimitSeconds: 900, extendedTimeMultiplier: 1.5 };
  assert.equal(secureExam.autoFinalizeAtFor(extended, started), started + 15 * MINUTE + GRACE);
  assert.equal(secureExam.autoFinalizeDue(extended, deadline + GRACE + MINUTE), false, 'past the base limit and its grace, within the student\'s own');
  assert.equal(secureExam.autoFinalizeDue(extended, started + 15 * MINUTE + GRACE), true);
  const added = { ...session, addedTimeSeconds: 300 };
  assert.equal(secureExam.autoFinalizeAtFor(added, started), deadline + 5 * MINUTE + GRACE);
  assert.equal(secureExam.autoFinalizeDue(added, deadline + GRACE), false);
});

test('a teacher\'s pause with time left has no deadline; a pause begun after the deadline keeps the test expired', () => {
  const pausedEarly = { ...session, teacherPause: { since: deadline - MINUTE, holds: ['assignment'] } };
  for (const now of [deadline + GRACE, deadline + 600 * MINUTE]) {
    assert.equal(secureExam.autoFinalizeAtFor(pausedEarly, now), null, 'no hint while the clock is stopped with time left');
    assert.equal(secureExam.autoFinalizeDue(pausedEarly, now), false, 'and never due while it is');
  }
  // Paused at minute 8, resumed at minute 38: the deadline is minute 40.
  const resumed = { ...session, pausedSeconds: 30 * 60, teacherPause: { since: null, holds: [] } };
  assert.equal(secureExam.autoFinalizeAtFor(resumed, started + 38 * MINUTE), started + 40 * MINUTE + GRACE);

  // The time ran out, and then the Test Cycle was archived: still expired (deadlineFor).
  const pausedLate = { ...session, teacherPause: { since: deadline + MINUTE, holds: ['assignment'] } };
  assert.equal(secureExam.isExpired(pausedLate, deadline + 30 * MINUTE), true);
  assert.equal(secureExam.autoFinalizeAtFor(pausedLate, deadline + 30 * MINUTE), deadline + GRACE);
  assert.equal(secureExam.autoFinalizeDue(pausedLate, deadline + 30 * MINUTE), true);
  // Paused inside the grace: the hint and the check agree on when.
  const pausedInGrace = { ...session, teacherPause: { since: deadline + MINUTE / 2, holds: ['assignment'] } };
  assert.equal(secureExam.autoFinalizeDue(pausedInGrace, deadline + GRACE - 1), false);
  assert.equal(secureExam.autoFinalizeDue(pausedInGrace, deadline + GRACE), true);
});

test('nothing finishes on its own that should not: untimed, not started, finished, or held by a proctor', () => {
  const cases = {
    untimed: { ...session, timeLimitSeconds: null },
    notStarted: { ...session, status: 'not_started', startedAt: null },
    noStart: { ...session, startedAt: undefined },
    submitted: { ...session, status: 'submitted' },
    timeExpired: { ...session, status: 'time_expired' },
    forceSubmitted: { ...session, status: 'force_submitted' },
    // The proctor paused it after its time ran out: the proctor decides.
    proctorAfterDeadline: { ...session, status: 'locked_proctor', teacherPause: { since: deadline + MINUTE, holds: ['proctor'] } },
    proctorBeforeDeadline: { ...session, status: 'locked_proctor', teacherPause: { since: deadline - MINUTE, holds: ['proctor'] } },
  };
  for (const [name, value] of Object.entries(cases)) {
    assert.equal(secureExam.autoFinalizeAtFor(value, deadline + 600 * MINUTE), null, `${name}: no hint`);
    assert.equal(secureExam.autoFinalizeDue(value, deadline + 600 * MINUTE), false, `${name}: never due`);
  }
});

test('the hint never reaches a browser', () => {
  const stored = { ...session, examSessionId: 'exam-1', autoFinalizeAt: deadline + GRACE, autoFinalizedAt: deadline + GRACE };
  for (const view of [secureExam.publicSession(stored), secureExam.publicSession(stored, { teacher: true })]) {
    assert.equal('autoFinalizeAt' in view, false);
    assert.equal('autoFinalizedAt' in view, false);
    assert.equal(view.expiresAt, deadline, 'the deadline the screen shows is the same rule');
  }
});

test('the sweep for sessions started before the hint pages, restarts, and ends only once a release has settled', () => {
  const now = 1_800_000_000_000;
  const fresh = sweep.sweepStateOf(null, now);
  assert.deepEqual(fresh, { cursor: null, passStartedAt: now, passFoundLegacy: 0, settleAfter: now + sweep.SWEEP_SETTLE_MS, completedAt: null });
  assert.ok(sweep.SWEEP_SETTLE_MS >= 60 * MINUTE, 'long enough for a release to finish rolling out');

  const full = sweep.nextSweepState(fresh, { now, returned: sweep.SWEEP_PAGE_LIMIT, lastId: 'exam-100', foundLegacy: 3 });
  assert.equal(full.cursor, 'exam-100', 'a full page continues where it stopped');
  assert.equal(full.passFoundLegacy, 3);
  const passEnd = sweep.nextSweepState(full, { now: now + 1, returned: 4, lastId: 'exam-104', foundLegacy: 0 });
  assert.equal(passEnd.cursor, null, 'the end of a pass starts again from the beginning');
  assert.equal(passEnd.passStartedAt, now + 1);
  assert.equal(passEnd.completedAt, null, 'a pass that derived something is not the last');

  // Nothing found, but the pass began before the release settled: go round again.
  const early = sweep.nextSweepState(passEnd, { now: now + 2, returned: 0, lastId: null, foundLegacy: 0 });
  assert.equal(early.completedAt, null);
  // Nothing found in a pass that began after it settled: done.
  const settled = { ...passEnd, passStartedAt: passEnd.settleAfter };
  const done = sweep.nextSweepState(settled, { now: settled.settleAfter + 5, returned: 2, lastId: 'exam-2', foundLegacy: 0 });
  assert.equal(done.completedAt, settled.settleAfter + 5);
  assert.equal(sweep.sweepStateOf(done, now), null, 'a completed sweep does nothing');
  assert.equal(sweep.sameSweepState(done, { ...done }), true);
  assert.equal(sweep.sameSweepState(done, { ...done, cursor: 'x' }), false);
  assert.deepEqual(sweep.SWEEP_STATES, ['in_progress', 'locked_integrity', 'locked_proctor']);
});

/* --- the wiring, which CI sees (the emulator suite is not in CI) ----------- */

const functionsSource = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));

test('the finalizer is a private scheduler that reads the hint, a bounded batch at a time', () => {
  const scheduler = region(functionsSource, 'exports.finalizeAbandonedSecureExams = onSchedule(', '});', 'the scheduler');
  assert.match(scheduler, /invoker: "private"/);
  assert.match(scheduler, /finalizeAbandonedSecureExamBatch\(getFirestore\(\), Date\.now\(\)\)/);
  const batch = region(functionsSource, 'async function finalizeAbandonedSecureExamBatch', '\n}\n', 'the batch');
  assert.match(batch, /\.where\("autoFinalizeAt", "<=", now\)[\s\S]*?\.limit\(secureExamAutoFinalize\.MAIN_BATCH_LIMIT\)/);
  assert.match(batch, /\.limit\(secureExamAutoFinalize\.SWEEP_PAGE_LIMIT\)/);
  assert.ok(sweep.MAIN_BATCH_LIMIT <= 100 && sweep.SWEEP_PAGE_LIMIT <= 200, 'bounded batches');
});

test('the finalizer decides inside its transaction and finishes exactly as time-up does', () => {
  const finalizer = region(functionsSource, 'async function autoFinalizeSecureSession(', '\n}\n', 'the per-session finalizer');
  const transactionBody = region(finalizer, 'db.runTransaction(async (transaction) => {', '\n  });', 'its transaction');
  // A session finished meanwhile is seen here, before anything is decided.
  assert.ok(
    transactionBody.indexOf('secureExam.TERMINAL_STATES.has(session.status)') < transactionBody.indexOf('secureExam.autoFinalizeDue(session, now)'),
    'the transaction checks for a finished session before it checks the deadline',
  );
  assert.match(transactionBody, /if \(!replaced && secureExam\.autoFinalizeDue\(session, now\)\) \{\s*const finalized = await finalizeSecureSessionInTransaction\(transaction, ref, session, \{ status: "time_expired", now \}\);/);
  // Its own finish keeps the hint until the follow-ups have run, and a later
  // run that finds it finished that way runs them again instead of skipping.
  assert.match(transactionBody, /const updated = \{ \.\.\.finalized, autoFinalizedAt: now, autoFinalizeAt: now \};\s*transaction\.set\(ref, updated\);/);
  assert.match(transactionBody, /if \(Number\(session\.autoFinalizedAt\) > 0 && session\.autoFinalizeAt !== null && session\.autoFinalizeAt !== undefined\) \{\s*return \{ outcome: "settled", session \};/);
  assert.match(finalizer, /if \(result\.session\) await settleAutoFinalizedSecureSession\(db, ref, result\.session\);/);
  // The time-up finish's follow-ups: the record sync, then the release.
  const settle = region(functionsSource, 'async function settleAutoFinalizedSecureSession', '\n}\n', 'the follow-ups');
  assert.match(settle, /await syncTestCycleSessionState\(db, session\);\s*await autoReleaseSecureSession\(db, session\);/);
});

test('every path that moves the deadline moves the hint, and every finish clears it', () => {
  const start = region(functionsSource, 'exports.startSecureExamSession = onCall', 'exports.', 'start');
  assert.match(start, /const next = \{ \.\.\.started, autoFinalizeAt: secureExam\.autoFinalizeAtFor\(started, now\) \};\s*transaction\.set\(ref, next\);/);
  // A resume of a session started before the hint stores it, and only then.
  assert.match(start, /if \(current\.autoFinalizeAt !== undefined\) return current;\s*const resumed = \{ \.\.\.current, autoFinalizeAt: secureExam\.autoFinalizeAtFor\(current, Date\.now\(\)\) \};\s*transaction\.set\(ref, \{ autoFinalizeAt: resumed\.autoFinalizeAt \}, \{ merge: true \}\);/);
  const proctor = region(functionsSource, 'exports.proctorExamAction = onCall', 'exports.', 'proctor actions');
  assert.match(proctor, /if \(action !== "forceSubmit"\) updated = \{ \.\.\.updated, autoFinalizeAt: secureExam\.autoFinalizeAtFor\(updated, now\) \};/);
  const holds = region(functionsSource, 'async function holdCourseTestClocks', '\n}\n', 'the assignment hold');
  assert.match(holds, /autoFinalizeAt: secureExam\.autoFinalizeAtFor\(\{ \.\.\.session, \.\.\.change \}, now\)/);
  const finalize = region(functionsSource, 'async function finalizeSecureSessionInTransaction', '\n}\n', 'the shared finish');
  assert.match(finalize, /return \{ \.\.\.graded, status, submittedAt: now, updatedAt: now, autoFinalizeAt: null \};/);
  assert.match(functionsSource, /status: "force_submitted", resetByTeacher: teacherUid, resetAt: Date\.now\(\), updatedAt: Date\.now\(\), autoFinalizeAt: null \}/);
  assert.match(functionsSource, /status: "force_submitted", supersededByOriginalTest: true, supersededAt: now, updatedAt: now, autoFinalizeAt: null \}/);
});
