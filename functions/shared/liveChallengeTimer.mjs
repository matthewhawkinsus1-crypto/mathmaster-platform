/*
 * THE ROUND TIMER, AS DATA THE SERVER OWNS.
 *
 * A Live Challenge round clock is never a browser setInterval. The server
 * writes absolute timestamps — when the round starts and when it ends — and
 * every screen derives what it shows from those timestamps and its calibrated
 * view of server time. That is why a refresh, a sleeping Chromebook or a
 * reconnect catches up to the real deadline instead of restarting a countdown:
 * there is no countdown to restart, only a deadline to read.
 *
 * This module is that model in one place:
 *
 *   buildRoundTimer        the timestamps a newly opened round is given
 *   timerFromRoom          the same model read back from a room document
 *   timerPhaseAt           countdown / running / paused / expired at an instant
 *   timerRemainingMs       time left (null for an open-ended Pace Race round)
 *   timerElapsedMs         time used, never counting a pause
 *   compressTimer          the closing-threshold shortening (never lengthens)
 *   pauseTimer/resumeTimer host pause, as pure transitions (see below)
 *   roundReadyToClose      the single rule for "may this round end now"
 *
 * PAUSE is modelled but not yet wired to a control. Resuming shifts BOTH
 * timestamps forward by the paused duration, so every consumer that computes
 * elapsed time as `now - startsAt` (speed scoring included) keeps excluding the
 * pause without knowing pauses exist. The host redesign can expose it without
 * changing how any existing reader interprets a room.
 *
 * Pure: no Firebase, no browser. Timestamps are accepted in every shape the
 * platform stores (Firestore Timestamp, {seconds}, Date, ISO string, number).
 */

import {
  ROUND_SYNC_LEAD_MS,
  SUBMISSION_ARRIVAL_GRACE_MS,
  submissionArrivalDecision,
} from './liveChallengeParity.mjs';

export const TIMER_PHASE = Object.freeze({
  UNSCHEDULED: 'unscheduled',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  PAUSED: 'paused',
  EXPIRED: 'expired',
});

export const ROUND_CLOSING_WINDOW_MS = 5000;

/*
 * THE COUNTDOWN LEAD. A round the lifecycle opens starts this far after the
 * server's now: time for every screen to show the same 3-2-1 off the round's
 * own startsAt before anyone can answer (ROUND_SYNC_LEAD_MS, the bare
 * synchronization lead, is shorter than a countdown can be read in). Nothing
 * measures a round from anywhere but startsAt — elapsed time, speed scoring,
 * the arrival window — so a longer lead never shortens a round.
 */
export const ROUND_COUNTDOWN_LEAD_MS = 3_500;

/** Milliseconds since the epoch for any stored timestamp shape, or null. */
export const timestampToMillis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value?.toMillis === 'function') {
    const millis = value.toMillis();
    return Number.isFinite(millis) && millis > 0 ? millis : null;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) && millis > 0 ? millis : null;
  }
  const seconds = value?.seconds ?? value?._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    const nanos = Number(value?.nanoseconds ?? value?._nanoseconds) || 0;
    const millis = seconds * 1000 + Math.floor(nanos / 1e6);
    return millis > 0 ? millis : null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const nonNegativeInt = (value) => {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

/**
 * The timestamps a round receives when it opens. `durationMs` null is an
 * open-ended Pace Race round: it has a start but no deadline until the closing
 * threshold compresses it.
 */
export const buildRoundTimer = ({ nowMs, syncLeadMs = ROUND_SYNC_LEAD_MS, durationMs = null } = {}) => {
  const now = Number(nowMs);
  if (!Number.isFinite(now) || now <= 0) throw new TypeError('buildRoundTimer needs the server time.');
  const startsAtMs = now + Math.max(0, Number(syncLeadMs) || 0);
  const duration = Number(durationMs);
  const hasDeadline = Number.isFinite(duration) && duration > 0;
  return Object.freeze({
    startsAtMs,
    endsAtMs: hasDeadline ? startsAtMs + duration : null,
    durationMs: hasDeadline ? duration : null,
    openEnded: !hasDeadline,
    pausedAtMs: null,
    pausedRemainingMs: null,
    pausedTotalMs: 0,
  });
};

/**
 * Read the timer back from a room. Field precedence matches every existing
 * reader. Only a Pace Race round is open-ended by design; a timed round that
 * has no deadline is a broken timeline, not an endless round.
 */
export const timerFromRoom = (room = {}) => {
  const startsAtMs = timestampToMillis(room?.startsAt) ?? timestampToMillis(room?.roundStartedAt);
  const endsAtMs = timestampToMillis(room?.endsAt) ?? timestampToMillis(room?.roundEndsAt);
  const activeSeconds = Number(room?.activeRoundSeconds);
  const durationMs = Number.isFinite(activeSeconds) && activeSeconds > 0
    ? activeSeconds * 1000
    : (startsAtMs && endsAtMs ? Math.max(0, endsAtMs - startsAtMs) : null);
  const pausedAtMs = timestampToMillis(room?.pausedAt);
  return Object.freeze({
    startsAtMs: startsAtMs ?? null,
    endsAtMs: endsAtMs ?? null,
    durationMs,
    openEnded: String(room?.timingMode || '') === 'pace',
    pausedAtMs: pausedAtMs ?? null,
    pausedRemainingMs: pausedAtMs ? (room?.pausedRemainingMs == null ? null : nonNegativeInt(room.pausedRemainingMs)) : null,
    pausedTotalMs: nonNegativeInt(room?.pausedTotalMs),
  });
};

export const timerPhaseAt = (timer, nowMs) => {
  if (!timer?.startsAtMs) return TIMER_PHASE.UNSCHEDULED;
  if (timer.pausedAtMs) return TIMER_PHASE.PAUSED;
  const now = Number(nowMs);
  if (now < timer.startsAtMs) return TIMER_PHASE.COUNTDOWN;
  if (timer.endsAtMs && now >= timer.endsAtMs) return TIMER_PHASE.EXPIRED;
  return TIMER_PHASE.RUNNING;
};

/** Time left, or null for a round that has no deadline yet. Never negative. */
export const timerRemainingMs = (timer, nowMs) => {
  if (!timer?.startsAtMs) return null;
  if (timer.pausedAtMs) return timer.pausedRemainingMs;
  if (!timer.endsAtMs) return null;
  return Math.max(0, timer.endsAtMs - Math.max(Number(nowMs), timer.startsAtMs));
};

/** Time used so far. A pause is never counted, and the result never exceeds the round. */
export const timerElapsedMs = (timer, nowMs) => {
  if (!timer?.startsAtMs) return 0;
  const reference = timer.pausedAtMs || Number(nowMs);
  const elapsed = Math.max(0, reference - timer.startsAtMs);
  return timer.durationMs ? Math.min(elapsed, timer.durationMs) : elapsed;
};

/**
 * The closing threshold: shorten the deadline to `closingMs` from now. It only
 * ever brings a deadline closer, and it gives an open-ended round its first
 * deadline. Returns `{ changed, timer }`.
 */
export const compressTimer = (timer, nowMs, closingMs = ROUND_CLOSING_WINDOW_MS) => {
  if (!timer?.startsAtMs || timer.pausedAtMs) return { changed: false, timer };
  const target = Number(nowMs) + Math.max(0, Number(closingMs) || 0);
  if (timer.endsAtMs && timer.endsAtMs <= target) return { changed: false, timer };
  return { changed: true, timer: Object.freeze({ ...timer, endsAtMs: target }) };
};

/** Pause a running round. Idempotent: pausing a paused round changes nothing. */
export const pauseTimer = (timer, nowMs) => {
  if (!timer?.startsAtMs) return { ok: false, code: 'not_started', timer };
  if (timer.pausedAtMs) return { ok: true, alreadyApplied: true, timer };
  if (timerPhaseAt(timer, nowMs) === TIMER_PHASE.EXPIRED) return { ok: false, code: 'expired', timer };
  return {
    ok: true,
    alreadyApplied: false,
    timer: Object.freeze({
      ...timer,
      pausedAtMs: Number(nowMs),
      pausedRemainingMs: timerRemainingMs(timer, nowMs),
    }),
  };
};

/** Resume a paused round, moving both timestamps forward by the pause. */
export const resumeTimer = (timer, nowMs) => {
  if (!timer?.startsAtMs) return { ok: false, code: 'not_started', timer };
  if (!timer.pausedAtMs) return { ok: true, alreadyApplied: true, timer };
  const shift = Math.max(0, Number(nowMs) - timer.pausedAtMs);
  return {
    ok: true,
    alreadyApplied: false,
    timer: Object.freeze({
      ...timer,
      startsAtMs: timer.startsAtMs + shift,
      endsAtMs: timer.endsAtMs ? timer.endsAtMs + shift : null,
      pausedAtMs: null,
      pausedRemainingMs: null,
      pausedTotalMs: nonNegativeInt(timer.pausedTotalMs) + shift,
    }),
  };
};

/**
 * May this round end now? The single rule behind the teacher's Next Round
 * button, the server's close guard and any future automatic close: everyone
 * who is playing has finished, or the authoritative deadline has passed. A
 * round nobody joined cannot end by "everyone finished" (zero of zero), and an
 * open-ended round never ends merely because it has no deadline.
 */
export const roundReadyToClose = ({ timer, nowMs, participantCount = 0, completedCount = 0 } = {}) => {
  const participants = Math.max(0, Math.floor(Number(participantCount) || 0));
  const completed = Math.max(0, Math.floor(Number(completedCount) || 0));
  if (participants <= 0) return { ready: false, reason: 'no_participants' };
  if (completed >= participants) return { ready: true, reason: 'all_complete' };
  if (timer?.pausedAtMs) return { ready: false, reason: 'paused' };
  // Only a real deadline can expire. A round's start does not matter here: a
  // deadline in the past is past whatever the round's start was.
  if (timer?.endsAtMs && Number(nowMs) >= timer.endsAtMs) return { ready: true, reason: 'expired' };
  return { ready: false, reason: 'in_progress' };
};

/**
 * Whether a response that reached the server at `arrivedAtMs` belongs to this
 * round. Wraps the parity rule (bounded transport grace) and adds the two cases
 * the parity rule predates: a paused round accepts nothing, and an open-ended
 * round accepts anything after its start. A timed round with no deadline gets
 * the parity rule's own answer, an invalid timeline, rather than staying open.
 */
export const timerAcceptsArrival = (timer, arrivedAtMs, { graceMs = SUBMISSION_ARRIVAL_GRACE_MS } = {}) => {
  if (!timer?.startsAtMs) return Object.freeze({ accepted: false, reason: 'round_not_started', elapsedMs: 0, inGrace: false });
  if (timer.pausedAtMs) return Object.freeze({ accepted: false, reason: 'round_paused', elapsedMs: 0, inGrace: false });
  if (!timer.endsAtMs && timer.openEnded === true) {
    const arrived = Number(arrivedAtMs);
    return Object.freeze({
      accepted: arrived >= timer.startsAtMs,
      reason: arrived >= timer.startsAtMs ? null : 'round_not_started',
      elapsedMs: Math.max(0, arrived - timer.startsAtMs),
      inGrace: false,
    });
  }
  return submissionArrivalDecision({
    arrivedAtMs, startsAtMs: timer.startsAtMs, endsAtMs: timer.endsAtMs, graceMs,
  });
};
