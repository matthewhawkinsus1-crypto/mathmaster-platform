// The server's own pacing for a Live Challenge no host screen is driving
// (functions/shared/liveChallengeServerSweep.mjs), as rules, and its wiring
// into the scheduler. The whole thing runs end to end against the emulator in
// tests/integration/liveChallengeServerSweep.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';
import {
  HOST_AWAY_FINISH_MS,
  HOST_HEARD_WRITE_INTERVAL_MS,
  SERVER_CLOSE_GRACE_MS,
  SERVER_RECHECK_MS,
  SWEEP_ACTION,
  SWEEP_SETTINGS_COLLECTION,
  SWEEP_SETTINGS_FLAG,
  finishAllowed,
  hostAway,
  hostHeartbeatDue,
  planServerSweep,
  stillAbandoned,
  sweepDueAfterCloseMs,
  sweepDueAfterOpeningMs,
  sweepSettingsFrom,
} from '../../functions/shared/liveChallengeServerSweep.mjs';
import { ROUND_CLOSE_AFTER_DEADLINE_MS } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { SUBMISSION_ARRIVAL_GRACE_MS } from '../../functions/shared/liveChallengeParity.mjs';

const NOW = Date.UTC(2026, 9, 16, 15, 0, 0);
const open = (endsAtMs, extra = {}) => ({ status: 'running', roundState: 'open', currentRound: 2, roundVersion: 3, endsAt: endsAtMs, ...extra });
const closed = (closedAtMs, extra = {}) => ({ status: 'running', roundState: 'closed', currentRound: 2, roundVersion: 3, roundClosedAt: closedAtMs, ...extra });
// The owner switched ending abandoned games on; the host was heard, long ago.
const FINISH_ON = sweepSettingsFrom({ finishAbandonedGames: true });
const HEARD_LONG_AGO = { hostHeardAt: NOW - 2 * HOST_AWAY_FINISH_MS };

test('the switch: the sweep is on and ending abandoned games is off unless the owner sets them', () => {
  assert.equal(SWEEP_SETTINGS_COLLECTION, 'platformFlags', 'a server-written-only collection (firestore.rules)');
  assert.ok(SWEEP_SETTINGS_FLAG);
  assert.deepEqual({ ...sweepSettingsFrom(null) }, { enabled: true, finishAbandonedGames: false });
  assert.deepEqual({ ...sweepSettingsFrom({ enabled: false }) }, { enabled: false, finishAbandonedGames: false });
  assert.deepEqual({ ...sweepSettingsFrom({ finishAbandonedGames: 'yes' }) }, { enabled: true, finishAbandonedGames: false }, 'only a real true turns it on');
  // Longer than a class talking a round through, or a laptop's nap.
  assert.ok(HOST_AWAY_FINISH_MS >= 30 * 60_000);
});

test('the server never ends a game it never heard a host on, or one that writes a grade', () => {
  assert.equal(finishAllowed({ room: closed(0), privateState: HEARD_LONG_AGO, settings: FINISH_ON }), true);
  assert.equal(finishAllowed({ room: closed(0), privateState: {}, settings: FINISH_ON }), false, 'no heartbeat ever: an older console or calibration');
  assert.equal(finishAllowed({ room: closed(0, { assignmentId: 'a1' }), privateState: HEARD_LONG_AGO, settings: FINISH_ON }), false, "a Warm-Up's result is its grade");
  assert.equal(finishAllowed({ room: closed(0), privateState: HEARD_LONG_AGO }), false, 'off by default');
  const longAgo = NOW - HOST_AWAY_FINISH_MS;
  for (const [room, privateState, settings] of [
    [closed(longAgo), {}, FINISH_ON],
    [closed(longAgo, { assignmentId: 'a1' }), HEARD_LONG_AGO, FINISH_ON],
    [closed(longAgo), HEARD_LONG_AGO, sweepSettingsFrom(null)],
  ]) {
    assert.deepEqual(planServerSweep({ room, privateState, settings, nowMs: NOW }), { action: SWEEP_ACTION.CLEAR }, 'left to the teacher, and not looked at again');
  }
  // Closing an overdue round needs none of it.
  assert.equal(planServerSweep({ room: open(NOW - SERVER_CLOSE_GRACE_MS, { assignmentId: 'a1' }), nowMs: NOW }).action, SWEEP_ACTION.CLOSE);
});

test('an open console always closes the round before the server would', () => {
  // The console closes 1.5 s after the deadline and an answer sent at 0:00 has
  // the arrival grace; the server waits longer than both.
  assert.ok(SERVER_CLOSE_GRACE_MS > ROUND_CLOSE_AFTER_DEADLINE_MS);
  assert.ok(SERVER_CLOSE_GRACE_MS > SUBMISSION_ARRIVAL_GRACE_MS);
  assert.equal(sweepDueAfterOpeningMs({ endsAtMs: NOW }), NOW + SERVER_CLOSE_GRACE_MS);
  assert.equal(sweepDueAfterOpeningMs({ endsAtMs: null }), null, 'a Pace Race round has no deadline to close on');
});

test('an open round is closed only once its deadline and the grace have passed', () => {
  const endsAt = NOW - SERVER_CLOSE_GRACE_MS;
  assert.deepEqual(planServerSweep({ room: open(endsAt), nowMs: NOW }), { action: SWEEP_ACTION.CLOSE, expected: { roundIndex: 2, roundVersion: 3 } });
  // One millisecond inside the grace: not yet — and the next look is at the grace's end.
  assert.deepEqual(planServerSweep({ room: open(endsAt + 1), nowMs: NOW }), { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: NOW + 1 });
  // A deadline that moved later (a due time set before it moved).
  assert.equal(planServerSweep({ room: open(NOW + 60_000), nowMs: NOW }).nextDueMs, NOW + 60_000 + SERVER_CLOSE_GRACE_MS);
  // The close command acts on the round the sweep read, so a round the
  // teacher has moved past since is answered "already applied".
  assert.deepEqual(planServerSweep({ room: open(NOW - 60_000, { currentRound: 4, roundVersion: 9 }), nowMs: NOW }).expected, { roundIndex: 4, roundVersion: 9 });
});

test("a paused round, a Pace Race round and a game that is not running are the host's", () => {
  assert.equal(planServerSweep({ room: open(NOW - 60_000, { pausedAt: NOW - 5_000 }), nowMs: NOW }).action, SWEEP_ACTION.CLEAR);
  assert.equal(planServerSweep({ room: open(null), nowMs: NOW }).action, SWEEP_ACTION.CLEAR);
  for (const status of ['lobby', 'finished', 'cancelled']) {
    assert.equal(planServerSweep({ room: open(NOW - 60_000, { status }), nowMs: NOW }).action, SWEEP_ACTION.CLEAR, status);
  }
  assert.equal(planServerSweep({ room: null, nowMs: NOW }).action, SWEEP_ACTION.CLEAR, 'a room that no longer exists');
});

test('results are ended only after the host-away window with no host heard', () => {
  const longAgo = NOW - HOST_AWAY_FINISH_MS;
  const plan0 = (room, privateState = HEARD_LONG_AGO) => planServerSweep({ room, privateState, settings: FINISH_ON, nowMs: NOW });
  assert.equal(plan0(closed(longAgo)).action, SWEEP_ACTION.FINISH);
  assert.equal(plan0(closed(longAgo), { hostHeardAt: longAgo }).action, SWEEP_ACTION.FINISH);
  // Results a moment old: look again when the window ends.
  assert.deepEqual(plan0(closed(NOW - 1_000)), { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: NOW - 1_000 + HOST_AWAY_FINISH_MS });
  // A host heard a minute ago, on results that have stood two windows.
  const heard = NOW - 60_000;
  assert.deepEqual(
    plan0(closed(NOW - 2 * HOST_AWAY_FINISH_MS), { hostHeardAt: heard }),
    { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: heard + HOST_AWAY_FINISH_MS },
  );
  // Closed without a close time (an old room): never ended, looked at again later.
  const plan = plan0(closed(null));
  assert.equal(plan.action, SWEEP_ACTION.RESCHEDULE);
  assert.ok(plan.nextDueMs >= NOW + SERVER_RECHECK_MS);
  assert.equal(sweepDueAfterCloseMs({ nowMs: NOW }), NOW + HOST_AWAY_FINISH_MS);
});

test('the finish re-checks, inside its transaction, that nobody came back', () => {
  const expected = { roundIndex: 2, roundVersion: 3 };
  const longAgo = NOW - HOST_AWAY_FINISH_MS;
  const check = (room, privateState = HEARD_LONG_AGO, settings = FINISH_ON) => stillAbandoned({ room, privateState, expected, nowMs: NOW, settings });
  assert.equal(check(closed(longAgo)), true);
  assert.equal(check(open(NOW - 60_000, { roundVersion: 4, currentRound: 3 })), false, 'the teacher opened the next round');
  assert.equal(check(closed(longAgo, { roundVersion: 4 })), false, 'a different round');
  assert.equal(check(closed(longAgo), { hostHeardAt: NOW - 5_000 }), false, 'the host was heard');
  assert.equal(check(closed(longAgo, { status: 'finished' })), false);
  assert.equal(check(closed(longAgo + 1)), false, 'not yet a whole window');
  assert.equal(check(closed(longAgo), {}), false, 'never heard');
  assert.equal(check(closed(longAgo), HEARD_LONG_AGO, sweepSettingsFrom(null)), false, 'switched off since the decision');
});

test("the host's heartbeat is written at most once a minute and ages out after the window", () => {
  assert.equal(hostHeartbeatDue({ hostHeardAt: null, nowMs: NOW }), true);
  assert.equal(hostHeartbeatDue({ hostHeardAt: NOW - HOST_HEARD_WRITE_INTERVAL_MS + 1, nowMs: NOW }), false);
  assert.equal(hostHeartbeatDue({ hostHeardAt: NOW - HOST_HEARD_WRITE_INTERVAL_MS, nowMs: NOW }), true);
  assert.equal(hostAway({ hostHeardAt: NOW - HOST_AWAY_FINISH_MS + 1, nowMs: NOW }), false);
  assert.equal(hostAway({ hostHeardAt: NOW - HOST_AWAY_FINISH_MS, nowMs: NOW }), true);
  // A console in a background tab calibrates about once a minute: many
  // heartbeats fit in one window, so a teacher who is there is never "away".
  assert.ok(HOST_AWAY_FINISH_MS >= 5 * HOST_HEARD_WRITE_INTERVAL_MS);
  // Firestore timestamps read back the same.
  assert.equal(hostAway({ hostHeardAt: { toMillis: () => NOW }, nowMs: NOW }), false);
});

/* ---------- wiring: the scheduler goes through the console's own commands ---------- */

const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

test("the scheduled sweep is private, runs every minute, and uses the console's own close and finish", () => {
  const scheduler = region(index, 'exports.closeOverdueLiveChallengeRounds = onSchedule({', '\n});', 'the scheduler');
  assert.match(scheduler, /schedule: "every 1 minutes"/);
  assert.match(scheduler, /invoker: "private"/);
  assert.match(scheduler, /sweepOverdueLiveChallengeRooms\(/);
  const room = executableSource(region(index, 'async function sweepLiveChallengeRoom(', 'async function sweepOverdueLiveChallengeRooms(', 'one room'));
  assert.match(room, /closeLiveChallengeRoundForRoom\(db, \{ roomRef, expected: plan\.expected \}\)/, 'the close, never forced');
  assert.match(room, /finalizeLiveChallengeMatch\(db, \{[\s\S]*command: lifecycle\.LIFECYCLE_COMMAND\.FINISH[\s\S]*stillWanted:[\s\S]*serverSweep\.stillAbandoned\(/, 'the finish, re-checked in its transaction');
  assert.match(scheduler, /maxInstances: 1,/, 'one run at a time');
  assert.match(scheduler, /timeoutSeconds: 300,/);
  const query = region(index, 'async function sweepOverdueLiveChallengeRooms(', 'exports.closeOverdueLiveChallengeRounds', 'the query');
  assert.match(query, /\.where\("serverSweepDueAt", "<="[\s\S]*\.orderBy\("serverSweepDueAt"\)[\s\S]*\.select\("serverSweepDueAt", "hostHeardAt"\)[\s\S]*\.limit\(serverSweep\.SERVER_SWEEP_LIMIT\)/, 'one bounded single-field range, two fields');
  // The switch is read on every run, before anything else.
  const switchRead = query.indexOf('serverSweep.sweepSettingsFrom(');
  assert.ok(switchRead !== -1 && switchRead < query.indexOf('.where("serverSweepDueAt"'), 'the switch is read first');
  assert.match(query, /if \(!settings\.enabled\) return \{ scanned: 0, disabled: true, outcomes: \{\} \};/);
  assert.match(room, /serverSweep\.planServerSweep\(\{ room, privateState, nowMs, settings \}\)/);
  assert.match(room, /nowMs: Date\.now\(\), settings,/, 'the re-check uses the real now and the switch');
  // The host's command is the same function.
  const callable = region(index, 'exports.closeLiveChallengeRound = onCall(', '\n});', 'the close callable');
  assert.match(callable, /return closeLiveChallengeRoundForRoom\(db, \{/);
  // The finish honours the re-check before it writes anything.
  const finalize = region(index, 'async function finalizeLiveChallengeMatch(', 'exports.joinLiveChallenge', 'finalize');
  const recheck = finalize.indexOf('if (stillWanted && !stillWanted(');
  assert.ok(recheck !== -1 && recheck < finalize.indexOf('applyLiveChallengeMatchFinalization(transaction'), 'checked before the finish is applied');
});

test('every round opening and close sets when the server looks next, and the finish clears it', () => {
  const opening = region(index, 'function applyLiveChallengeRoundOpening(', '\n}\n', 'the opening');
  assert.match(opening, /serverSweepDueAt: liveChallengeSweepDate\(engine\.serverSweep\.sweepDueAfterOpeningMs\(\{ endsAtMs: timer\.endsAtMs \}\)\)/);
  const close = region(index, 'async function closeLiveChallengeRoundForRoom(', '\n}\n', 'the close');
  assert.match(close, /serverSweepDueAt: liveChallengeSweepDate\(engine\.serverSweep\.sweepDueAfterCloseMs\(\{ nowMs \}\)\)/);
  const finalization = region(index, 'function applyLiveChallengeMatchFinalization(', '\n}\n', 'the finalization');
  assert.match(finalization, /transaction\.set\(privateRef, \{ \.\.\.terminal, serverSweepDueAt: null \}/);
});

test("the console's calibration is the host heartbeat, and a student added mid-game is invited", () => {
  const calibrate = region(index, 'exports.calibrateLiveChallengeClock = onCall(', '\n});', 'calibration');
  assert.match(calibrate, /if \(isTeacher && roomId\) await recordLiveChallengeHostHeard\(request, roomId, serverAt\);/);
  // The roster changes that put one student into a class.
  for (const [name, call] of [
    ['exports.setStudentClass', 'if (classRecord) await inviteStudentToClassLiveChallengeSafely(db, studentId);'],
    ['exports.assignStudentToTeacher', 'if (assignedTeacherEmail) await inviteStudentToClassLiveChallengeSafely(db, studentId);'],
    ['exports.createStudentAccount', 'await inviteStudentToClassLiveChallengeSafely(db, studentId);'],
  ]) {
    assert.ok(region(index, `${name} = onCall(`, '\n});', name).includes(call), `${name} invites the student to their class's game`);
  }
});
