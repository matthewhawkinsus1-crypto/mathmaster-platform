import test from 'node:test';
import assert from 'node:assert/strict';

import { ROUND_SYNC_LEAD_MS, SUBMISSION_ARRIVAL_GRACE_MS } from '../../functions/shared/liveChallengeParity.mjs';
import {
  ROUND_CLOSING_WINDOW_MS,
  TIMER_PHASE,
  buildRoundTimer,
  compressTimer,
  pauseTimer,
  resumeTimer,
  roundReadyToClose,
  timerAcceptsArrival,
  timerElapsedMs,
  timerFromRoom,
  timerPhaseAt,
  timerRemainingMs,
  timestampToMillis,
} from '../../functions/shared/liveChallengeTimer.mjs';

/*
 * The round clock is data the server owns: two absolute timestamps. These
 * tests hold the properties that make it safe across refreshes, sleeping
 * Chromebooks and retries — every reader computes the same deadline from the
 * same document, a pause never counts against a student, and nothing about the
 * clock can restart it.
 */

const NOW = 5_000_000;

test('a new round starts after the sync lead and ends one duration later', () => {
  const timer = buildRoundTimer({ nowMs: NOW, durationMs: 30_000 });
  assert.equal(timer.startsAtMs, NOW + ROUND_SYNC_LEAD_MS);
  assert.equal(timer.endsAtMs, timer.startsAtMs + 30_000);
  assert.equal(timer.durationMs, 30_000);
  assert.equal(timer.openEnded, false);
  assert.ok(Object.isFrozen(timer));
  assert.throws(() => buildRoundTimer({ durationMs: 30_000 }), /server time/);
});

test('a Pace Race round opens with a start and no deadline', () => {
  const timer = buildRoundTimer({ nowMs: NOW, durationMs: null });
  assert.equal(timer.endsAtMs, null);
  assert.equal(timer.openEnded, true);
  assert.equal(timerRemainingMs(timer, NOW + 60_000), null);
  assert.equal(timerPhaseAt(timer, NOW + 10 * 60_000), TIMER_PHASE.RUNNING, 'it never expires on its own');
});

test('every stored timestamp shape reads as the same instant', () => {
  const ms = 1_700_000_000_123;
  assert.equal(timestampToMillis(ms), ms);
  assert.equal(timestampToMillis(new Date(ms)), ms);
  assert.equal(timestampToMillis(new Date(ms).toISOString()), ms);
  assert.equal(timestampToMillis({ toMillis: () => ms }), ms);
  assert.equal(timestampToMillis({ seconds: 1_700_000_000, nanoseconds: 123_000_000 }), ms);
  assert.equal(timestampToMillis({ _seconds: 1_700_000_000, _nanoseconds: 123_000_000 }), ms);
  for (const empty of [null, undefined, '', 0, -5, 'not a date', Number.NaN]) {
    assert.equal(timestampToMillis(empty), null, `${String(empty)} is not a timestamp`);
  }
});

test('reading a room back gives the timer it was opened with', () => {
  const opened = buildRoundTimer({ nowMs: NOW, durationMs: 45_000 });
  const room = {
    startsAt: { seconds: opened.startsAtMs / 1000 },
    endsAt: new Date(opened.endsAtMs),
    activeRoundSeconds: 45,
    timingMode: 'timed',
  };
  const read = timerFromRoom(room);
  assert.equal(read.startsAtMs, opened.startsAtMs);
  assert.equal(read.endsAtMs, opened.endsAtMs);
  assert.equal(read.durationMs, 45_000);
  assert.equal(read.openEnded, false);
  // The newer field wins; the legacy name is the fallback.
  assert.equal(timerFromRoom({ startsAt: 10_000, roundStartedAt: 20_000 }).startsAtMs, 10_000);
  assert.equal(timerFromRoom({ roundStartedAt: 20_000, roundEndsAt: 50_000 }).endsAtMs, 50_000);
  assert.equal(timerFromRoom({ timingMode: 'pace', startsAt: 10_000 }).openEnded, true);
});

test('a refresh catches up to the deadline instead of restarting a countdown', () => {
  const timer = buildRoundTimer({ nowMs: NOW, syncLeadMs: 0, durationMs: 30_000 });
  // A screen that loads 20 s into the round, and one that was open the whole
  // time, read the same document and agree.
  const reopened = timerFromRoom({ startsAt: timer.startsAtMs, endsAt: timer.endsAtMs });
  assert.equal(timerRemainingMs(reopened, NOW + 20_000), 10_000);
  assert.equal(timerRemainingMs(timer, NOW + 20_000), 10_000);
  assert.equal(timerElapsedMs(reopened, NOW + 20_000), 20_000);
  assert.equal(timerPhaseAt(reopened, NOW + 31_000), TIMER_PHASE.EXPIRED);
  assert.equal(timerRemainingMs(reopened, NOW + 31_000), 0, 'never negative');
});

test('the phase moves countdown, running, expired with no write at all', () => {
  const timer = buildRoundTimer({ nowMs: NOW, durationMs: 30_000 });
  assert.equal(timerPhaseAt({}, NOW), TIMER_PHASE.UNSCHEDULED);
  assert.equal(timerPhaseAt(timer, NOW), TIMER_PHASE.COUNTDOWN);
  assert.equal(timerPhaseAt(timer, timer.startsAtMs), TIMER_PHASE.RUNNING);
  assert.equal(timerPhaseAt(timer, timer.endsAtMs - 1), TIMER_PHASE.RUNNING);
  assert.equal(timerPhaseAt(timer, timer.endsAtMs), TIMER_PHASE.EXPIRED);
  // Before the start the full round remains.
  assert.equal(timerRemainingMs(timer, NOW), 30_000);
  assert.equal(timerElapsedMs(timer, NOW), 0);
});

test('a pause never counts against a student, and resuming moves both timestamps', () => {
  const timer = buildRoundTimer({ nowMs: NOW, syncLeadMs: 0, durationMs: 30_000 });
  const paused = pauseTimer(timer, NOW + 10_000);
  assert.equal(paused.ok, true);
  assert.equal(timerPhaseAt(paused.timer, NOW + 60_000), TIMER_PHASE.PAUSED);
  assert.equal(timerRemainingMs(paused.timer, NOW + 60_000), 20_000, 'remaining time is frozen');
  assert.equal(timerElapsedMs(paused.timer, NOW + 60_000), 10_000, 'elapsed time is frozen');
  assert.equal(pauseTimer(paused.timer, NOW + 12_000).alreadyApplied, true, 'pausing twice changes nothing');

  const resumed = resumeTimer(paused.timer, NOW + 70_000);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.timer.startsAtMs, timer.startsAtMs + 60_000);
  assert.equal(resumed.timer.endsAtMs, timer.endsAtMs + 60_000);
  assert.equal(resumed.timer.pausedTotalMs, 60_000);
  assert.equal(timerRemainingMs(resumed.timer, NOW + 70_000), 20_000);
  assert.equal(timerElapsedMs(resumed.timer, NOW + 75_000), 15_000, 'speed scoring sees only the time actually played');
  assert.equal(resumeTimer(resumed.timer, NOW + 80_000).alreadyApplied, true, 'resuming twice changes nothing');

  assert.equal(pauseTimer(timer, timer.endsAtMs + 1).code, 'expired', 'an expired round cannot be paused');
  assert.equal(pauseTimer({}, NOW).code, 'not_started');
  assert.equal(compressTimer(paused.timer, NOW + 20_000).changed, false, 'a paused clock is not compressed');
});

test('the closing threshold only ever brings a deadline closer', () => {
  const timer = buildRoundTimer({ nowMs: NOW, syncLeadMs: 0, durationMs: 60_000 });
  const compressed = compressTimer(timer, NOW + 10_000);
  assert.equal(compressed.changed, true);
  assert.equal(compressed.timer.endsAtMs, NOW + 10_000 + ROUND_CLOSING_WINDOW_MS);
  // Compressing again later never pushes the deadline back out.
  assert.equal(compressTimer(compressed.timer, NOW + 12_000).changed, false);
  // A deadline already inside the window is left alone.
  assert.equal(compressTimer(timer, timer.endsAtMs - 1_000).changed, false);
  // An open-ended round gets its first deadline from it.
  const pace = buildRoundTimer({ nowMs: NOW, durationMs: null });
  assert.equal(compressTimer(pace, NOW + 90_000).timer.endsAtMs, NOW + 90_000 + ROUND_CLOSING_WINDOW_MS);
  assert.equal(compressTimer({}, NOW).changed, false);
});

test('a round is ready to close when everyone finished or the deadline passed', () => {
  const timer = buildRoundTimer({ nowMs: NOW, syncLeadMs: 0, durationMs: 30_000 });
  const ready = (overrides) => roundReadyToClose({ timer, nowMs: NOW + 5_000, participantCount: 10, completedCount: 4, ...overrides });
  assert.deepEqual(ready({}), { ready: false, reason: 'in_progress' });
  assert.deepEqual(ready({ completedCount: 10 }), { ready: true, reason: 'all_complete' });
  assert.deepEqual(ready({ completedCount: 12 }), { ready: true, reason: 'all_complete' });
  assert.deepEqual(ready({ nowMs: timer.endsAtMs }), { ready: true, reason: 'expired' });
  assert.deepEqual(ready({ participantCount: 0, completedCount: 0 }), { ready: false, reason: 'no_participants' });
  assert.deepEqual(ready({ timer: { ...timer, pausedAtMs: NOW }, nowMs: timer.endsAtMs + 1 }), { ready: false, reason: 'paused' });
  assert.deepEqual(ready({ timer: buildRoundTimer({ nowMs: NOW, durationMs: null }), nowMs: NOW + 3_600_000 }), { ready: false, reason: 'in_progress' });
});

test('a response belongs to the round only inside its bounded delivery window', () => {
  const timer = buildRoundTimer({ nowMs: NOW, syncLeadMs: 0, durationMs: 30_000 });
  assert.equal(timerAcceptsArrival(timer, NOW - 1).reason, 'round_not_started');
  assert.equal(timerAcceptsArrival(timer, NOW + 1).accepted, true);
  const inGrace = timerAcceptsArrival(timer, timer.endsAtMs + 10);
  assert.equal(inGrace.accepted, true);
  assert.equal(inGrace.inGrace, true);
  assert.equal(timerAcceptsArrival(timer, timer.endsAtMs + SUBMISSION_ARRIVAL_GRACE_MS + 1).accepted, false);
  // A paused round accepts nothing; nor does one that never started.
  assert.equal(timerAcceptsArrival({ ...timer, pausedAtMs: NOW + 1 }, NOW + 2).reason, 'round_paused');
  assert.equal(timerAcceptsArrival({}, NOW).reason, 'round_not_started');
  // Pace Race: anything after the start.
  const pace = timerFromRoom({ startsAt: NOW, timingMode: 'pace' });
  assert.equal(timerAcceptsArrival(pace, NOW + 3_600_000).accepted, true);
  assert.equal(timerAcceptsArrival(pace, NOW - 1).accepted, false);
  // A timed round that lost its deadline is a broken timeline, not an endless round.
  assert.equal(timerAcceptsArrival(timerFromRoom({ startsAt: NOW, timingMode: 'timed' }), NOW + 1).reason, 'invalid_timeline');
});
