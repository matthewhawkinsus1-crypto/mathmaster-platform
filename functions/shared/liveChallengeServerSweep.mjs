/*
 * THE SERVER'S OWN PACING, FOR A GAME NO HOST SCREEN IS DRIVING.
 *
 * A round closes when the teacher's console sends the close command
 * (live-challenge-shell.md §4). With no console open — the laptop slept, the
 * tab closed — nothing sent it: the class waited on "Time's up! The results
 * are coming." for as long as the teacher was away, and a game the teacher
 * never came back to never finished, so nobody's rewards, report or Warm-Up
 * credit were ever written.
 *
 * The scheduled sweep (closeOverdueLiveChallengeRounds) does what the console
 * would, through the same commands:
 *
 *   - an open round whose deadline passed SERVER_CLOSE_GRACE_MS ago is closed
 *     by the console's own close (same transaction, same standings, same
 *     round result). A console that is open closes it 1.5 s after the
 *     deadline, long before this, so the sweep only ever acts for a class
 *     whose console is gone — and if both arrive, one closes it and the other
 *     is told it is already closed;
 *   - only when the owner switches it on (finishAbandonedGames, default
 *     off): a round's results that have stood HOST_AWAY_FINISH_MS with no
 *     host screen heard for as long are finished by the console's own Finish
 *     (End Game: answers already given count, the match result and its
 *     rewards are written once). A teacher still on the results, talking
 *     the round through, keeps calibrating their console's clock, and that
 *     heartbeat holds the finish off. Never a game that writes a grade
 *     (a Warm-Up), and never one whose host the server has not heard.
 *
 * WHEN THE SWEEP LOOKS. Each room's private state carries `serverSweepDueAt`:
 * set when a round opens (its deadline plus the grace) and when a round
 * closes (the close plus the host-away window), cleared when the match ends
 * or there is nothing left for the server to do.
 * The sweep reads only rooms that are due — one single-field range query, no
 * composite index, and nothing the class's screens listen to — so an idle
 * minute costs one read. A room opened before this field existed is never
 * swept; its console paces it exactly as before.
 *
 * Pure: the scheduler applies these decisions to Firestore.
 */

// After the class's deadline. Longer than the console's own close
// (ROUND_CLOSE_AFTER_DEADLINE_MS, 1.5 s) and the arrival grace (0.75 s), so a
// console that is open always closes first and an answer sent at 0:00 counts.
export const SERVER_CLOSE_GRACE_MS = 10_000;
// A round's results with no host heard for this long end the game — when
// the owner has switched that on (SWEEP_SETTINGS_FLAG, finishAbandonedGames).
// Longer than a class's discussion of a round, and than a laptop's nap.
export const HOST_AWAY_FINISH_MS = 30 * 60_000;
// How often a console's calibration may refresh `hostHeardAt` (a console
// calibrates five times every 30 s; a background tab about once a minute).
export const HOST_HEARD_WRITE_INTERVAL_MS = 60_000;
// A round the close refused (a student with extended time is still inside
// their own deadline) is looked at again this soon.
export const SERVER_RECHECK_MS = 30_000;
// A room whose sweep failed waits this long before the next try, so one bad
// room cannot take every run's slots.
export const SERVER_FAILURE_BACKOFF_MS = 5 * 60_000;
// A room whose due time could not even be moved waits this long.
export const SERVER_RESCHEDULE_FAILURE_BACKOFF_MS = 15 * 60_000;
// Rooms handled per run. The scheduler runs every minute.
export const SERVER_SWEEP_LIMIT = 25;

/*
 * THE SWITCH (platformFlags/liveChallengeServerSweep; server-written only, read
 * by every run). A rollback turns the sweep off here first — it does not
 * depend on deleting the scheduled function.
 *
 *   enabled               anything but the boolean true — false, "false", 0,
 *                         null, "off" — turns the run off entirely. Only a
 *                         missing field (or document) means the default, on.
 *                         It fails CLOSED: a console's "Add field" defaults to
 *                         a string, and a rollback must not silently not take.
 *   finishAbandonedGames  only the boolean true: abandoned results are ended
 *                         (End Game). Default FALSE: the owner decides
 *                         (docs/handoffs/STUDENT_PASS3_LIVE_CHALLENGE_ROUNDS.md).
 *                         Read again inside each finish's transaction.
 */
export const SWEEP_SETTINGS_COLLECTION = 'platformFlags';
export const SWEEP_SETTINGS_FLAG = 'liveChallengeServerSweep';

/** The switch as stored (or absent): what this run may do. */
export const sweepSettingsFrom = (stored = null) => Object.freeze({
  enabled: stored && Object.prototype.hasOwnProperty.call(stored, 'enabled') ? stored.enabled === true : true,
  finishAbandonedGames: stored?.finishAbandonedGames === true,
});

export const SWEEP_ACTION = Object.freeze({
  CLOSE: 'close',
  FINISH: 'finish',
  RESCHEDULE: 'reschedule',
  CLEAR: 'clear',
});

const millisOf = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** When the sweep should first look at a round that just opened, or null (no deadline: a Pace Race). */
export const sweepDueAfterOpeningMs = ({ endsAtMs }) => {
  const endsMs = millisOf(endsAtMs);
  return endsMs == null ? null : endsMs + SERVER_CLOSE_GRACE_MS;
};

/** When the sweep should look at a round that just closed. */
export const sweepDueAfterCloseMs = ({ nowMs }) => Number(nowMs) + HOST_AWAY_FINISH_MS;

/** Whether a console's calibration should refresh the host heartbeat. */
export const hostHeartbeatDue = ({ hostHeardAt, nowMs }) => {
  const heardMs = millisOf(hostHeardAt);
  return heardMs == null || Number(nowMs) - heardMs >= HOST_HEARD_WRITE_INTERVAL_MS;
};

/** Whether the host has been unheard for the whole host-away window. */
export const hostAway = ({ hostHeardAt, nowMs }) => {
  const heardMs = millisOf(hostHeardAt);
  return heardMs == null || Number(nowMs) - heardMs >= HOST_AWAY_FINISH_MS;
};

/**
 * Whether the server may ever end this game for a host who is away.
 *
 * Only a game whose host screen the server has heard at least once (a room
 * the heartbeat never reached — its console, or the calibration code, older
 * than this — is never ended), that writes no grade (a Warm-Up's result IS
 * the student's Warm-Up grade, and enters the section grade Classroom
 * receives: the teacher ends those), and only when the switch allows it.
 */
export const finishAllowed = ({ room = {}, privateState = {}, settings = sweepSettingsFrom() }) => (
  settings.finishAbandonedGames === true
  && millisOf(privateState?.hostHeardAt) != null
  && !room?.assignmentId
);

/**
 * What the sweep does with one due room.
 *
 * @param room          the public room as read
 * @param privateState  the room's private state as read
 * @param nowMs         server time
 * @param settings      sweepSettingsFrom(the switch)
 * @returns {{ action, nextDueMs?, expected? }}
 */
export const planServerSweep = ({ room = null, privateState = {}, nowMs, settings = sweepSettingsFrom() }) => {
  const now = Number(nowMs);
  if (!room || room.status !== 'running') return { action: SWEEP_ACTION.CLEAR };
  const expected = {
    roundIndex: Number.isInteger(Number(room.currentRound)) ? Number(room.currentRound) : -1,
    roundVersion: Math.max(0, Number(room.roundVersion) || 0),
  };
  if (room.roundState === 'open') {
    const endsAtMs = millisOf(room.endsAt || room.roundEndsAt);
    // A Pace Race round (no deadline) or a paused one is the host's to end.
    if (endsAtMs == null || room.pausedAt) return { action: SWEEP_ACTION.CLEAR };
    const dueMs = endsAtMs + SERVER_CLOSE_GRACE_MS;
    // The deadline moved later since the due time was set.
    if (now < dueMs) return { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: dueMs };
    return { action: SWEEP_ACTION.CLOSE, expected };
  }
  if (room.roundState === 'closed') {
    // Results the server will never end stay with the teacher, as before.
    if (!finishAllowed({ room, privateState, settings })) return { action: SWEEP_ACTION.CLEAR };
    const closedAtMs = millisOf(room.roundClosedAt);
    const heardMs = millisOf(privateState?.hostHeardAt);
    const since = Math.max(closedAtMs ?? 0, heardMs ?? 0);
    const dueMs = since + HOST_AWAY_FINISH_MS;
    if (closedAtMs == null || now < dueMs) {
      return { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: Math.max(dueMs, now + SERVER_RECHECK_MS) };
    }
    return { action: SWEEP_ACTION.FINISH, expected };
  }
  return { action: SWEEP_ACTION.CLEAR };
};

/**
 * Whether the room the finishing transaction read is still the abandoned
 * results the sweep decided to end — not a round the teacher has opened since,
 * nor results a host screen has been heard on.
 */
export const stillAbandoned = ({ room = {}, privateState = {}, expected, nowMs, settings = sweepSettingsFrom() }) => (
  finishAllowed({ room, privateState, settings })
  && room.status === 'running'
  && room.roundState === 'closed'
  && Number(room.currentRound) === Number(expected?.roundIndex)
  && Math.max(0, Number(room.roundVersion) || 0) === Number(expected?.roundVersion)
  && hostAway({ hostHeardAt: privateState?.hostHeardAt, nowMs })
  && millisOf(room.roundClosedAt) != null
  && Number(nowMs) - millisOf(room.roundClosedAt) >= HOST_AWAY_FINISH_MS
);
