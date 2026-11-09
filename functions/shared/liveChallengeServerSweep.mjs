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
 *   - a round's results that have stood HOST_AWAY_FINISH_MS with no host
 *     screen heard for as long are finished by the console's own Finish
 *     (End Game: answers already given count, the match result and its
 *     rewards are written once). On by default since the owner's decision
 *     (LC05, 2026-10-23); the switch below turns it off (finishAbandonedGames).
 *     A teacher still on the results, talking the round through, keeps
 *     calibrating their console's clock, and that heartbeat holds the finish
 *     off. Never a game that writes a grade (a Warm-Up), and never one whose
 *     host the server has not heard;
 *   - (N73) a Pace Race round has no deadline, so nothing above ever closes
 *     it. One open HOST_AWAY_FINISH_MS since its start, with no host heard for
 *     as long, is finished by the same Finish: the answers already given
 *     count, exactly as if the teacher had pressed End Game;
 *   - (N73) a lobby nobody started, with no host heard for HOST_AWAY_FINISH_MS
 *     since it opened, is CANCELLED by the console's own Cancel Session, not
 *     finished: no round was played, so there is nothing to finish and
 *     nothing to record.
 * The last three are one rule — "no teacher screen on a game that is waiting
 * for its teacher" — under the same guards: the heartbeat, the switch, never
 * a game that writes a grade, and the same re-check inside the transaction.
 *
 * WHY THE SAME 30 MINUTES FOR ALL THREE (N73). HOST_AWAY_FINISH_MS is the
 * window the owner already chose for results (LC05), measured from the later
 * of the moment the game started waiting and the last heartbeat:
 *   - a lobby: the console calibrates in the lobby exactly as in a round
 *     (LiveChallengeTeacher.jsx: lobby and running), so a teacher with the
 *     console open in any tab — the projector, a background tab — is heard
 *     every minute and never loses the lobby. A lobby left open is not
 *     harmless: every invited student carries "Your teacher opened the Live
 *     Challenge lobby" on every page until it ends, and the teacher's next
 *     game reopens it. Cancelling one loses nothing (nobody has answered) and
 *     the teacher's next create invites the class again. The other constant
 *     that measures a stale lobby — the late invite's 12 hours
 *     (LIVE_CHALLENGE_LATE_INVITE_MAX_AGE_MS in functions/index.js) — would
 *     leave that banner up for the rest of the school day;
 *   - a Pace Race round (Standard Challenge or Solver Race): one question
 *     each, so half an hour from its start is far longer than any answer
 *     takes, and with no teacher screen for as long the class is waiting on a
 *     teacher who is not there. Its start is the moment to measure from: it
 *     has no deadline.
 *
 * WHEN THE SWEEP LOOKS. Each room's private state carries `serverSweepDueAt`:
 * set when a lobby opens (the host-away window), when a round opens (its
 * deadline plus the grace, or for a Pace Race round the host-away window) and
 * when a round closes (the close plus the host-away window), cleared when the
 * match ends or there is nothing left for the server to do.
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
// A round's results, a Pace Race round or a lobby with no host heard for this
// long end the game, unless the switch turns that off (SWEEP_SETTINGS_FLAG,
// finishAbandonedGames). Longer than a class's discussion of a round, and than
// a laptop's nap.
export const HOST_AWAY_FINISH_MS = 30 * 60_000;
// What the finish (or a lobby's cancel) records on the room (`endedBy`) when
// the server ended it, so the teacher's console can say why the game is over.
export const HOST_AWAY_ENDED_BY = 'hostAway';
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
 *   finishAbandonedGames  abandoned results and Pace Race rounds are ended
 *                         (End Game) and abandoned lobbies cancelled (N73).
 *                         Default ON, the owner's decision (LC05, 2026-10-23:
 *                         games that write no grade, after HOST_AWAY_FINISH_MS
 *                         with no host heard). It fails closed like `enabled`:
 *                         any value but the boolean true turns it off, and
 *                         only a missing field (or document) means the
 *                         default. Read again inside each finish's (and
 *                         cancel's) transaction.
 */
export const SWEEP_SETTINGS_COLLECTION = 'platformFlags';
export const SWEEP_SETTINGS_FLAG = 'liveChallengeServerSweep';

const switchField = (stored, field) => (
  stored && Object.prototype.hasOwnProperty.call(stored, field) ? stored[field] === true : true
);

/** The switch as stored (or absent): what this run may do. */
export const sweepSettingsFrom = (stored = null) => Object.freeze({
  enabled: switchField(stored, 'enabled'),
  finishAbandonedGames: switchField(stored, 'finishAbandonedGames'),
});

export const SWEEP_ACTION = Object.freeze({
  CLOSE: 'close',
  FINISH: 'finish',
  // A lobby nobody started: the console's Cancel Session (N73).
  CANCEL: 'cancel',
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

/**
 * When the sweep should first look at a round that just opened: its deadline
 * plus the grace — or, for a Pace Race round (no deadline to close on), the
 * host-away window from its start (N73). Null when neither is known.
 */
export const sweepDueAfterOpeningMs = ({ endsAtMs, startsAtMs = null }) => {
  const endsMs = millisOf(endsAtMs);
  if (endsMs != null) return endsMs + SERVER_CLOSE_GRACE_MS;
  const startsMs = millisOf(startsAtMs);
  return startsMs == null ? null : startsMs + HOST_AWAY_FINISH_MS;
};

/** When the sweep should look at a round that just closed. */
export const sweepDueAfterCloseMs = ({ nowMs }) => Number(nowMs) + HOST_AWAY_FINISH_MS;

/** When the sweep should look at a lobby that just opened (N73). */
export const sweepDueForLobbyMs = ({ nowMs }) => Number(nowMs) + HOST_AWAY_FINISH_MS;

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

/** The round a sweep decision is about, as the lifecycle's commands name it (a lobby: round -1). */
const roundIdentityOf = (room = {}) => ({
  roundIndex: Number.isInteger(Number(room?.currentRound)) ? Number(room.currentRound) : -1,
  roundVersion: Math.max(0, Number(room?.roundVersion) || 0),
});

export const WAITING_ON_HOST = Object.freeze({
  LOBBY: 'lobby',
  RESULTS: 'results',
  OPEN_ROUND: 'openRound',
});

/**
 * What a game is waiting on its teacher for, and since when — or null when it
 * is not waiting on them: a timed round runs on its own clock (the close
 * above), a paused round is the host's to resume or end, and a finished or
 * cancelled game waits on nobody.
 *
 *   lobby      nobody has pressed Start; since the lobby opened
 *   results    nobody has pressed Next Round; since the round closed
 *   openRound  a Pace Race round, which only the host ends; since its start
 *
 * Every way out of one of these either moves the round's identity (Start, Next
 * Round) or starts the clock again (a close is a new `roundClosedAt`), so a
 * decision about one is never mistaken, in the re-check, for another.
 */
export const waitingOnHost = (room = {}) => {
  if (room?.status === 'lobby') return { kind: WAITING_ON_HOST.LOBBY, sinceMs: millisOf(room.createdAt) };
  if (room?.status !== 'running') return null;
  if (room.roundState === 'closed') return { kind: WAITING_ON_HOST.RESULTS, sinceMs: millisOf(room.roundClosedAt) };
  if (room.roundState === 'open' && !room.pausedAt && millisOf(room.endsAt || room.roundEndsAt) == null) {
    return { kind: WAITING_ON_HOST.OPEN_ROUND, sinceMs: millisOf(room.startsAt || room.roundStartedAt) };
  }
  return null;
};

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
  if (!room) return { action: SWEEP_ACTION.CLEAR };
  const expected = roundIdentityOf(room);
  if (room.status === 'running' && room.roundState === 'open') {
    // A paused round is the host's to resume or end.
    if (room.pausedAt) return { action: SWEEP_ACTION.CLEAR };
    const endsAtMs = millisOf(room.endsAt || room.roundEndsAt);
    if (endsAtMs != null) {
      const dueMs = endsAtMs + SERVER_CLOSE_GRACE_MS;
      // The deadline moved later since the due time was set.
      if (now < dueMs) return { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: dueMs };
      return { action: SWEEP_ACTION.CLOSE, expected };
    }
    // No deadline: a Pace Race round, which waits on its host like results.
  }
  const waiting = waitingOnHost(room);
  if (!waiting) return { action: SWEEP_ACTION.CLEAR };
  // A game the server will never end stays with the teacher, as before.
  if (!finishAllowed({ room, privateState, settings })) return { action: SWEEP_ACTION.CLEAR };
  const heardMs = millisOf(privateState?.hostHeardAt);
  const dueMs = Math.max(waiting.sinceMs ?? 0, heardMs ?? 0) + HOST_AWAY_FINISH_MS;
  if (waiting.sinceMs == null || now < dueMs) {
    return { action: SWEEP_ACTION.RESCHEDULE, nextDueMs: Math.max(dueMs, now + SERVER_RECHECK_MS) };
  }
  // A lobby never started: nothing to finish, nothing to record (N73).
  return { action: waiting.kind === WAITING_ON_HOST.LOBBY ? SWEEP_ACTION.CANCEL : SWEEP_ACTION.FINISH, expected };
};

/**
 * Whether the room the finishing (or cancelling) transaction read is still
 * the abandoned game the sweep decided to end — not a lobby the teacher has
 * started since, nor a round they opened or closed, nor a game a host screen
 * has been heard on.
 */
export const stillAbandoned = ({ room = {}, privateState = {}, expected, nowMs, settings = sweepSettingsFrom() }) => {
  const waiting = waitingOnHost(room);
  const identity = roundIdentityOf(room);
  return Boolean(waiting)
    && finishAllowed({ room, privateState, settings })
    && identity.roundIndex === Number(expected?.roundIndex)
    && identity.roundVersion === Number(expected?.roundVersion)
    && hostAway({ hostHeardAt: privateState?.hostHeardAt, nowMs })
    && waiting.sinceMs != null
    && Number(nowMs) - waiting.sinceMs >= HOST_AWAY_FINISH_MS;
};
