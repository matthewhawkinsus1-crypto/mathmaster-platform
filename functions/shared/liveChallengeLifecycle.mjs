/*
 * THE LIVE CHALLENGE LIFECYCLE.
 *
 * A match is described by exactly two persisted fields and one clock:
 *
 *   status      the SESSION: lobby -> running -> finished | cancelled
 *   roundState  the CURRENT ROUND while running: open -> closed
 *   the timer   startsAt / endsAt (see liveChallengeTimer.mjs)
 *
 * Everything a screen needs is DERIVED from those three, never stored as a
 * separate flag that could disagree with them:
 *
 *   lobby         waiting for players; the host may start
 *   countdown     a round is open and its synchronized start is in the future
 *   roundActive   a round is open and accepting responses
 *   roundPaused   a round is open and its clock is paused
 *   roundLocked   a round is open but its deadline has passed (grace, then close)
 *   roundResults  the round is closed and its results are persisted
 *   completed     the match finished and its final result is persisted
 *   cancelled     the match was abandoned
 *
 * `finished` and `cancelled` are TERMINAL. Nothing moves a room out of them —
 * in particular a finished match can no longer be relabelled "cancelled" after
 * its rewards and credit were issued.
 *
 * COMMANDS ARE PLANNED, THEN APPLIED. `planLifecycleCommand` is pure: given the
 * room as a transaction just read it, it answers apply / already-applied /
 * reject. Server callables run it inside a Firestore transaction, so two
 * teachers' tabs pressing Next Round at once produce one round, and a retried
 * Finish produces one finalization. "Already applied" is a success, not an
 * error: the effect the caller asked for is already true.
 *
 * Legacy rooms (created before roundState existed) read as: running with a
 * round index >= 0 means the round is open.
 */

import {
  TIMER_PHASE,
  roundReadyToClose,
  timerFromRoom,
  timerPhaseAt,
} from './liveChallengeTimer.mjs';

export const SESSION_STATUS = Object.freeze({
  LOBBY: 'lobby',
  RUNNING: 'running',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
});

export const ROUND_STATE = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
});

export const MATCH_STATE = Object.freeze({
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  ROUND_ACTIVE: 'roundActive',
  ROUND_PAUSED: 'roundPaused',
  ROUND_LOCKED: 'roundLocked',
  ROUND_RESULTS: 'roundResults',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const LIFECYCLE_COMMAND = Object.freeze({
  START: 'start',
  CLOSE_ROUND: 'closeRound',
  ADVANCE: 'advance',
  FINISH: 'finish',
  CANCEL: 'cancel',
  JOIN: 'join',
  SUBMIT: 'submit',
});

export const LIFECYCLE_OUTCOME = Object.freeze({
  APPLY: 'apply',
  ALREADY_APPLIED: 'alreadyApplied',
  REJECT: 'reject',
});

export const LIFECYCLE_REJECTION = Object.freeze({
  MATCH_ENDED: 'match_ended',
  NOT_STARTED: 'not_started',
  NO_PLAYERS: 'no_players',
  ROUND_IN_PROGRESS: 'round_in_progress',
  ROUND_NOT_OPEN: 'round_not_open',
  STALE_ROUND: 'stale_round',
  INVALID_EXPECTATION: 'invalid_expectation',
  UNKNOWN_COMMAND: 'unknown_command',
  UNKNOWN_STATUS: 'unknown_status',
});

/*
 * The legal transitions, as data. The planner below is the enforcement; this
 * table is what documentation and tests read, so the two cannot quietly drift.
 */
const OPEN_ROUND_STATES = Object.freeze([
  MATCH_STATE.COUNTDOWN, MATCH_STATE.ROUND_ACTIVE, MATCH_STATE.ROUND_PAUSED, MATCH_STATE.ROUND_LOCKED,
]);

export const LIFECYCLE_TRANSITIONS = Object.freeze([
  Object.freeze({ command: LIFECYCLE_COMMAND.START, from: [MATCH_STATE.LOBBY], to: MATCH_STATE.COUNTDOWN, guard: 'at least one joined player' }),
  Object.freeze({ command: LIFECYCLE_COMMAND.CLOSE_ROUND, from: OPEN_ROUND_STATES, to: MATCH_STATE.ROUND_RESULTS, guard: 'every player finished, or the deadline passed (or host force)' }),
  Object.freeze({ command: LIFECYCLE_COMMAND.ADVANCE, from: [...OPEN_ROUND_STATES, MATCH_STATE.ROUND_RESULTS], to: `${MATCH_STATE.COUNTDOWN} (next round) | ${MATCH_STATE.COMPLETED} (no rounds left)`, guard: 'an open round must first satisfy the close guard' }),
  Object.freeze({ command: LIFECYCLE_COMMAND.FINISH, from: [...OPEN_ROUND_STATES, MATCH_STATE.ROUND_RESULTS], to: MATCH_STATE.COMPLETED, guard: 'none — the host may end a match mid-round' }),
  Object.freeze({ command: LIFECYCLE_COMMAND.CANCEL, from: [MATCH_STATE.LOBBY, ...OPEN_ROUND_STATES, MATCH_STATE.ROUND_RESULTS], to: MATCH_STATE.CANCELLED, guard: 'none' }),
]);

const TERMINAL = new Set([SESSION_STATUS.FINISHED, SESSION_STATUS.CANCELLED]);
const KNOWN_STATUSES = new Set(Object.values(SESSION_STATUS));

export const isTerminalStatus = (status) => TERMINAL.has(String(status || ''));

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

/** Which round is current, as the identity a client or command must match. */
export const roundIdentity = (room = {}) => Object.freeze({
  roundIndex: integerOr(room?.currentRound, -1),
  roundVersion: Math.max(0, integerOr(room?.roundVersion, 0)),
  roundToken: room?.roundToken ? String(room.roundToken) : null,
});

/** The round state, reading rooms created before the field existed. */
export const roomRoundState = (room = {}) => {
  if (room?.status !== SESSION_STATUS.RUNNING) return null;
  if (room?.roundState === ROUND_STATE.OPEN || room?.roundState === ROUND_STATE.CLOSED) return room.roundState;
  return integerOr(room?.currentRound, -1) >= 0 ? ROUND_STATE.OPEN : null;
};

/**
 * The first round a student joining now can still play — what their
 * participation is measured from. A lobby join counts from round 0; a join
 * while a round is open counts that round; a join after it closed counts from
 * the next. A rejoin keeps the round recorded on first arrival.
 */
export const joinRoundFor = ({ room = {}, recordedJoinRound = null } = {}) => {
  if (typeof recordedJoinRound === 'number' && Number.isInteger(recordedJoinRound)) return recordedJoinRound;
  const current = integerOr(room?.currentRound, -1);
  return Math.max(0, roomRoundState(room) === ROUND_STATE.CLOSED ? current + 1 : current);
};

/** The one value a screen renders from. */
export const deriveMatchState = (room = {}, nowMs = Date.now()) => {
  const status = room?.status;
  if (status === SESSION_STATUS.FINISHED) return MATCH_STATE.COMPLETED;
  if (status === SESSION_STATUS.CANCELLED) return MATCH_STATE.CANCELLED;
  if (status !== SESSION_STATUS.RUNNING) return MATCH_STATE.LOBBY;
  const roundState = roomRoundState(room);
  if (roundState === ROUND_STATE.CLOSED) return MATCH_STATE.ROUND_RESULTS;
  if (roundState !== ROUND_STATE.OPEN) return MATCH_STATE.LOBBY;
  switch (timerPhaseAt(timerFromRoom(room), nowMs)) {
    case TIMER_PHASE.COUNTDOWN: return MATCH_STATE.COUNTDOWN;
    case TIMER_PHASE.PAUSED: return MATCH_STATE.ROUND_PAUSED;
    case TIMER_PHASE.EXPIRED: return MATCH_STATE.ROUND_LOCKED;
    default: return MATCH_STATE.ROUND_ACTIVE;
  }
};

const apply = (details = {}) => Object.freeze({ outcome: LIFECYCLE_OUTCOME.APPLY, ...details });
const alreadyApplied = (details = {}) => Object.freeze({ outcome: LIFECYCLE_OUTCOME.ALREADY_APPLIED, ...details });
const reject = (code, message, details = {}) => Object.freeze({ outcome: LIFECYCLE_OUTCOME.REJECT, code, message, ...details });

/*
 * Compare what a round command expected against the round that is actually
 * current. An expectation for an EARLIER round means the command already
 * happened (someone else advanced); a LATER round is nonsense.
 */
const compareExpectedRound = (current, expected) => {
  if (!expected || expected.roundIndex == null) return 'current';
  const expectedIndex = integerOr(expected.roundIndex, null);
  if (expectedIndex === null) return 'invalid';
  if (expectedIndex < current.roundIndex) return 'passed';
  if (expectedIndex > current.roundIndex) return 'invalid';
  if (expected.roundVersion == null) return 'current';
  const expectedVersion = integerOr(expected.roundVersion, null);
  if (expectedVersion === null) return 'invalid';
  if (expectedVersion < current.roundVersion) return 'passed';
  if (expectedVersion > current.roundVersion) return 'invalid';
  return 'current';
};

const readiness = ({ room, nowMs, joinedCount, completedCount }) => {
  const timer = timerFromRoom(room);
  if (joinedCount == null) {
    // No participant count supplied: only an expired deadline can prove readiness.
    const expired = !timer.pausedAtMs && Boolean(timer.endsAtMs) && Number(nowMs) >= timer.endsAtMs;
    return { ready: expired, reason: expired ? 'expired' : 'in_progress' };
  }
  return roundReadyToClose({ timer, nowMs, participantCount: joinedCount, completedCount });
};

/**
 * Decide what a lifecycle command does to this room.
 *
 * @param {object} input
 * @param {string} input.command     one of LIFECYCLE_COMMAND
 * @param {object} input.room        the room exactly as a transaction read it
 * @param {object} [input.expected]  { roundIndex, roundVersion, roundToken } the caller acted on
 * @param {number} [input.joinedCount]     players in the match (for start/close readiness)
 * @param {number} [input.completedCount]  players who finished the current round
 * @param {number} [input.nowMs]           server time
 * @param {boolean} [input.force]          host override of close readiness
 */
export const planLifecycleCommand = ({
  command,
  room = {},
  expected = null,
  joinedCount = null,
  completedCount = null,
  nowMs = Date.now(),
  force = false,
} = {}) => {
  const status = room?.status;
  if (!KNOWN_STATUSES.has(status)) {
    return reject(LIFECYCLE_REJECTION.UNKNOWN_STATUS, 'This Live Challenge is in an unknown state.');
  }
  const current = roundIdentity(room);
  const roundState = roomRoundState(room);

  switch (command) {
    case LIFECYCLE_COMMAND.START: {
      if (status === SESSION_STATUS.CANCELLED) return reject(LIFECYCLE_REJECTION.MATCH_ENDED, 'This Live Challenge was cancelled.');
      if (status !== SESSION_STATUS.LOBBY) return alreadyApplied({ roundIndex: current.roundIndex });
      if (joinedCount != null && Number(joinedCount) < 1) {
        return reject(LIFECYCLE_REJECTION.NO_PLAYERS, 'At least one student must join before the challenge starts.');
      }
      return apply({ nextRoundIndex: 0 });
    }

    case LIFECYCLE_COMMAND.CLOSE_ROUND:
    case LIFECYCLE_COMMAND.ADVANCE: {
      if (status === SESSION_STATUS.FINISHED) return alreadyApplied({ roundIndex: current.roundIndex });
      if (status === SESSION_STATUS.CANCELLED) return reject(LIFECYCLE_REJECTION.MATCH_ENDED, 'This Live Challenge was cancelled.');
      if (status === SESSION_STATUS.LOBBY) return reject(LIFECYCLE_REJECTION.NOT_STARTED, 'The challenge has not started.');
      const relation = compareExpectedRound(current, expected);
      if (relation === 'passed') return alreadyApplied({ roundIndex: current.roundIndex });
      if (relation === 'invalid') {
        return reject(LIFECYCLE_REJECTION.INVALID_EXPECTATION, 'That round is not the current round.');
      }
      if (roundState === ROUND_STATE.CLOSED) {
        return command === LIFECYCLE_COMMAND.CLOSE_ROUND
          ? alreadyApplied({ roundIndex: current.roundIndex })
          : apply({ closeCurrentRound: false, roundIndex: current.roundIndex, nextRoundIndex: current.roundIndex + 1 });
      }
      if (!force) {
        const ready = readiness({ room, nowMs, joinedCount, completedCount });
        if (!ready.ready) {
          return reject(LIFECYCLE_REJECTION.ROUND_IN_PROGRESS, 'This round is still in progress.', { readiness: ready.reason });
        }
      }
      return command === LIFECYCLE_COMMAND.CLOSE_ROUND
        ? apply({ closeCurrentRound: true, roundIndex: current.roundIndex })
        : apply({ closeCurrentRound: true, roundIndex: current.roundIndex, nextRoundIndex: current.roundIndex + 1 });
    }

    case LIFECYCLE_COMMAND.FINISH: {
      if (status === SESSION_STATUS.FINISHED) return alreadyApplied({ status });
      if (status === SESSION_STATUS.CANCELLED) return reject(LIFECYCLE_REJECTION.MATCH_ENDED, 'This Live Challenge was cancelled.');
      if (status === SESSION_STATUS.LOBBY) {
        return reject(LIFECYCLE_REJECTION.NOT_STARTED, 'Start the challenge before finishing it, or cancel the lobby.');
      }
      return apply({ closeCurrentRound: roundState === ROUND_STATE.OPEN, roundIndex: current.roundIndex });
    }

    case LIFECYCLE_COMMAND.CANCEL: {
      if (status === SESSION_STATUS.CANCELLED) return alreadyApplied({ status });
      if (status === SESSION_STATUS.FINISHED) {
        return reject(LIFECYCLE_REJECTION.MATCH_ENDED, 'A finished Live Challenge cannot be cancelled.');
      }
      return apply({ closeCurrentRound: false, roundIndex: current.roundIndex });
    }

    case LIFECYCLE_COMMAND.JOIN: {
      if (isTerminalStatus(status)) return reject(LIFECYCLE_REJECTION.MATCH_ENDED, 'That Live Challenge is no longer accepting players.');
      return apply({ roundIndex: current.roundIndex });
    }

    case LIFECYCLE_COMMAND.SUBMIT: {
      if (status !== SESSION_STATUS.RUNNING) {
        return reject(
          isTerminalStatus(status) ? LIFECYCLE_REJECTION.MATCH_ENDED : LIFECYCLE_REJECTION.NOT_STARTED,
          'That Live Challenge round is no longer active.',
        );
      }
      const expectedIndex = integerOr(expected?.roundIndex, null);
      if (expectedIndex === null || expectedIndex !== current.roundIndex) {
        return reject(LIFECYCLE_REJECTION.STALE_ROUND, 'That Live Challenge round is no longer active.');
      }
      const versionMatches = expected?.roundVersion == null || integerOr(expected.roundVersion, null) === current.roundVersion;
      const tokenMatches = expected?.roundToken == null || String(expected.roundToken) === String(current.roundToken || '');
      if (!versionMatches || !tokenMatches) {
        return reject(LIFECYCLE_REJECTION.STALE_ROUND, 'That submission belongs to a stale round version.');
      }
      if (roundState !== ROUND_STATE.OPEN) {
        return reject(LIFECYCLE_REJECTION.ROUND_NOT_OPEN, 'That Live Challenge round is no longer active.');
      }
      return apply({ roundIndex: current.roundIndex });
    }

    default:
      return reject(LIFECYCLE_REJECTION.UNKNOWN_COMMAND, `Unknown Live Challenge command "${String(command)}".`);
  }
};
