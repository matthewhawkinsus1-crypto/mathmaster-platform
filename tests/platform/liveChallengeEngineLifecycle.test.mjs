import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIFECYCLE_COMMAND,
  LIFECYCLE_OUTCOME,
  LIFECYCLE_REJECTION,
  LIFECYCLE_TRANSITIONS,
  MATCH_STATE,
  ROUND_STATE,
  SESSION_STATUS,
  deriveMatchState,
  isTerminalStatus,
  planLifecycleCommand,
  roomRoundState,
  roundIdentity,
} from '../../functions/shared/liveChallengeLifecycle.mjs';

/*
 * The lifecycle state machine, exercised as data. Every derived match state is
 * built from the persisted fields alone, every documented transition is
 * checked against the planner that enforces it, and every command is checked
 * for what it does when repeated — the property that makes a double click, a
 * retried request or a second open tab harmless.
 */

const NOW = 1_000_000;
const SECOND = 1000;

const running = (overrides = {}) => ({
  status: SESSION_STATUS.RUNNING,
  currentRound: 2,
  roundVersion: 5,
  roundToken: 'token-5',
  roundState: ROUND_STATE.OPEN,
  startsAt: NOW - 10 * SECOND,
  endsAt: NOW + 20 * SECOND,
  ...overrides,
});

// One persisted room per derived state.
const ROOMS = Object.freeze({
  [MATCH_STATE.LOBBY]: { status: SESSION_STATUS.LOBBY, currentRound: -1, roundVersion: 0 },
  [MATCH_STATE.COUNTDOWN]: running({ startsAt: NOW + 2 * SECOND, endsAt: NOW + 32 * SECOND }),
  [MATCH_STATE.ROUND_ACTIVE]: running(),
  [MATCH_STATE.ROUND_PAUSED]: running({ pausedAt: NOW - SECOND, pausedRemainingMs: 21 * SECOND }),
  [MATCH_STATE.ROUND_LOCKED]: running({ endsAt: NOW - SECOND }),
  [MATCH_STATE.ROUND_RESULTS]: running({ roundState: ROUND_STATE.CLOSED }),
  [MATCH_STATE.COMPLETED]: { status: SESSION_STATUS.FINISHED, currentRound: 9, roundVersion: 10 },
  [MATCH_STATE.CANCELLED]: { status: SESSION_STATUS.CANCELLED, currentRound: 3, roundVersion: 4 },
});

const plan = (command, room, extra = {}) => planLifecycleCommand({
  command, room, nowMs: NOW, joinedCount: 4, completedCount: 4, ...extra,
});

test('every match state is derived from status, round state and the clock alone', () => {
  for (const [state, room] of Object.entries(ROOMS)) {
    assert.equal(deriveMatchState(room, NOW), state, `${state} must derive from its persisted room`);
  }
  // A countdown becomes an active round, then a locked one, with no write.
  const countdown = ROOMS[MATCH_STATE.COUNTDOWN];
  assert.equal(deriveMatchState(countdown, NOW + 3 * SECOND), MATCH_STATE.ROUND_ACTIVE);
  assert.equal(deriveMatchState(countdown, NOW + 33 * SECOND), MATCH_STATE.ROUND_LOCKED);
});

test('rooms written before roundState existed still read correctly', () => {
  const legacy = { status: 'running', currentRound: 0, roundVersion: 1, roundToken: 't', startsAt: NOW - SECOND, endsAt: NOW + SECOND };
  assert.equal(roomRoundState(legacy), ROUND_STATE.OPEN);
  assert.equal(deriveMatchState(legacy, NOW), MATCH_STATE.ROUND_ACTIVE);
  assert.equal(roomRoundState({ status: 'running', currentRound: -1 }), null);
  assert.equal(roomRoundState({ status: 'lobby', currentRound: 0, roundState: 'open' }), null, 'only a running match has a round state');
  assert.equal(plan('submit', legacy, { expected: { roundIndex: 0, roundVersion: 1, roundToken: 't' } }).outcome, 'apply');
});

test('each documented transition applies from each of its source states', () => {
  for (const transition of LIFECYCLE_TRANSITIONS) {
    for (const from of transition.from) {
      const outcome = plan(transition.command, ROOMS[from]);
      assert.equal(outcome.outcome, LIFECYCLE_OUTCOME.APPLY, `${transition.command} from ${from} must apply (${outcome.message || ''})`);
    }
  }
});

test('no command moves a match out of a terminal state', () => {
  for (const terminal of [MATCH_STATE.COMPLETED, MATCH_STATE.CANCELLED]) {
    for (const command of Object.values(LIFECYCLE_COMMAND)) {
      const outcome = plan(command, ROOMS[terminal], { expected: { roundIndex: 0 } });
      assert.notEqual(outcome.outcome, LIFECYCLE_OUTCOME.APPLY, `${command} must not apply to a ${terminal} match`);
    }
  }
  // The specific bug: a finished match relabelled "cancelled" after its
  // rewards and credit had been issued.
  const cancelFinished = plan('cancel', ROOMS[MATCH_STATE.COMPLETED]);
  assert.equal(cancelFinished.outcome, 'reject');
  assert.equal(cancelFinished.code, LIFECYCLE_REJECTION.MATCH_ENDED);
  assert.equal(plan('finish', ROOMS[MATCH_STATE.CANCELLED]).code, LIFECYCLE_REJECTION.MATCH_ENDED);
  assert.equal(plan('join', ROOMS[MATCH_STATE.COMPLETED]).code, LIFECYCLE_REJECTION.MATCH_ENDED);
  assert.ok(isTerminalStatus('finished') && isTerminalStatus('cancelled'));
  assert.ok(!isTerminalStatus('running') && !isTerminalStatus('lobby') && !isTerminalStatus(undefined));
});

test('repeating a command that already happened is a success, not a second effect', () => {
  // Start twice: the second sees a running room.
  assert.equal(plan('start', ROOMS[MATCH_STATE.ROUND_ACTIVE]).outcome, 'alreadyApplied');
  // Finish twice: the second sees a finished room.
  assert.equal(plan('finish', ROOMS[MATCH_STATE.COMPLETED]).outcome, 'alreadyApplied');
  // Cancel twice.
  assert.equal(plan('cancel', ROOMS[MATCH_STATE.CANCELLED]).outcome, 'alreadyApplied');
  // Close a closed round.
  assert.equal(plan('closeRound', ROOMS[MATCH_STATE.ROUND_RESULTS]).outcome, 'alreadyApplied');
  // Advance after the match finished.
  assert.equal(plan('advance', ROOMS[MATCH_STATE.COMPLETED]).outcome, 'alreadyApplied');
});

test('a round command about a round that has moved on never moves the next one', () => {
  const room = ROOMS[MATCH_STATE.ROUND_ACTIVE]; // round 2, version 5
  // Two tabs pressed Next Round on round 1; the first already opened round 2.
  assert.equal(plan('advance', room, { expected: { roundIndex: 1, roundVersion: 4 } }).outcome, 'alreadyApplied');
  assert.equal(plan('closeRound', room, { expected: { roundIndex: 1 } }).outcome, 'alreadyApplied');
  // Same index, older version: a replay reopened it.
  assert.equal(plan('advance', room, { expected: { roundIndex: 2, roundVersion: 4 } }).outcome, 'alreadyApplied');
  // A round from the future is nonsense, not "done".
  const future = plan('advance', room, { expected: { roundIndex: 3 } });
  assert.equal(future.outcome, 'reject');
  assert.equal(future.code, LIFECYCLE_REJECTION.INVALID_EXPECTATION);
  assert.equal(plan('advance', room, { expected: { roundIndex: 2, roundVersion: 6 } }).code, LIFECYCLE_REJECTION.INVALID_EXPECTATION);
  assert.equal(plan('advance', room, { expected: { roundIndex: 'two' } }).code, LIFECYCLE_REJECTION.INVALID_EXPECTATION);
  // The current round, as expected.
  const current = plan('advance', room, { expected: { roundIndex: 2, roundVersion: 5 } });
  assert.equal(current.outcome, 'apply');
  assert.equal(current.nextRoundIndex, 3);
  assert.equal(current.closeCurrentRound, true);
});

test('a round closes when everyone finished or the deadline passed, never before', () => {
  const room = ROOMS[MATCH_STATE.ROUND_ACTIVE];
  const waiting = plan('advance', room, { joinedCount: 20, completedCount: 12 });
  assert.equal(waiting.outcome, 'reject');
  assert.equal(waiting.code, LIFECYCLE_REJECTION.ROUND_IN_PROGRESS);
  assert.equal(waiting.message, 'This round is still in progress.');
  assert.equal(plan('closeRound', room, { joinedCount: 20, completedCount: 20 }).outcome, 'apply');
  assert.equal(plan('closeRound', ROOMS[MATCH_STATE.ROUND_LOCKED], { joinedCount: 20, completedCount: 3 }).outcome, 'apply');
  // A host override is explicit.
  assert.equal(plan('closeRound', room, { joinedCount: 20, completedCount: 0, force: true }).outcome, 'apply');
  // Zero of zero is not "everyone finished".
  assert.equal(plan('closeRound', room, { joinedCount: 0, completedCount: 0 }).code, LIFECYCLE_REJECTION.ROUND_IN_PROGRESS);
  // A paused clock does not expire.
  assert.equal(plan('closeRound', running({ endsAt: NOW - SECOND, pausedAt: NOW - 5 * SECOND }), { joinedCount: 3, completedCount: 1 }).code, LIFECYCLE_REJECTION.ROUND_IN_PROGRESS);
  // An open-ended Pace Race round never ends merely because it has no deadline.
  assert.equal(plan('closeRound', running({ endsAt: null }), { joinedCount: 3, completedCount: 1 }).code, LIFECYCLE_REJECTION.ROUND_IN_PROGRESS);
  // Without counts, only an expired deadline proves readiness.
  assert.equal(planLifecycleCommand({ command: 'closeRound', room, nowMs: NOW }).outcome, 'reject');
  assert.equal(planLifecycleCommand({ command: 'closeRound', room: ROOMS[MATCH_STATE.ROUND_LOCKED], nowMs: NOW }).outcome, 'apply');
});

test('advancing from round results opens the next round without closing again', () => {
  const outcome = plan('advance', ROOMS[MATCH_STATE.ROUND_RESULTS], { joinedCount: 20, completedCount: 0 });
  assert.equal(outcome.outcome, 'apply');
  assert.equal(outcome.closeCurrentRound, false, 'the round was already closed and ranked');
  assert.equal(outcome.nextRoundIndex, 3);
});

test('start needs a player; finish needs a started match; cancel works from the lobby', () => {
  const lobby = ROOMS[MATCH_STATE.LOBBY];
  const empty = plan('start', lobby, { joinedCount: 0 });
  assert.equal(empty.code, LIFECYCLE_REJECTION.NO_PLAYERS);
  assert.equal(plan('start', lobby, { joinedCount: 1 }).nextRoundIndex, 0);
  assert.equal(plan('start', ROOMS[MATCH_STATE.CANCELLED]).code, LIFECYCLE_REJECTION.MATCH_ENDED);
  assert.equal(plan('finish', lobby).code, LIFECYCLE_REJECTION.NOT_STARTED);
  assert.equal(plan('advance', lobby).code, LIFECYCLE_REJECTION.NOT_STARTED);
  assert.equal(plan('cancel', lobby).outcome, 'apply');
  // Finishing mid-round closes the open round first; from results it does not.
  assert.equal(plan('finish', ROOMS[MATCH_STATE.ROUND_ACTIVE]).closeCurrentRound, true);
  assert.equal(plan('finish', ROOMS[MATCH_STATE.ROUND_RESULTS]).closeCurrentRound, false);
});

test('a submission must name the open round exactly', () => {
  const room = ROOMS[MATCH_STATE.ROUND_ACTIVE];
  const submit = (expected, target = room) => planLifecycleCommand({ command: 'submit', room: target, expected });
  assert.equal(submit({ roundIndex: 2, roundVersion: 5, roundToken: 'token-5' }).outcome, 'apply');
  const stale = submit({ roundIndex: 1, roundVersion: 4, roundToken: 'token-4' });
  assert.equal(stale.code, LIFECYCLE_REJECTION.STALE_ROUND);
  assert.equal(stale.message, 'That Live Challenge round is no longer active.');
  assert.equal(submit({ roundIndex: 2, roundVersion: 4, roundToken: 'token-5' }).message, 'That submission belongs to a stale round version.');
  assert.equal(submit({ roundIndex: 2, roundVersion: 5, roundToken: 'other' }).message, 'That submission belongs to a stale round version.');
  assert.equal(submit({ roundIndex: 2, roundVersion: 5, roundToken: 'token-5' }, ROOMS[MATCH_STATE.ROUND_RESULTS]).code, LIFECYCLE_REJECTION.ROUND_NOT_OPEN);
  assert.equal(submit({ roundIndex: 9 }, ROOMS[MATCH_STATE.COMPLETED]).code, LIFECYCLE_REJECTION.MATCH_ENDED);
  assert.equal(submit({ roundIndex: 0 }, ROOMS[MATCH_STATE.LOBBY]).code, LIFECYCLE_REJECTION.NOT_STARTED);
  assert.equal(submit(null).code, LIFECYCLE_REJECTION.STALE_ROUND, 'a submission with no round is never accepted');
});

test('the planner refuses what it does not recognise instead of guessing', () => {
  assert.equal(plan('teleport', ROOMS[MATCH_STATE.ROUND_ACTIVE]).code, LIFECYCLE_REJECTION.UNKNOWN_COMMAND);
  assert.equal(plan('start', { status: 'paused' }).code, LIFECYCLE_REJECTION.UNKNOWN_STATUS);
  assert.equal(plan('start', {}).code, LIFECYCLE_REJECTION.UNKNOWN_STATUS);
});

test('round identity normalizes whatever a room stored', () => {
  assert.deepEqual(roundIdentity({ currentRound: '3', roundVersion: '7', roundToken: 99 }), { roundIndex: 3, roundVersion: 7, roundToken: '99' });
  assert.deepEqual(roundIdentity({}), { roundIndex: -1, roundVersion: 0, roundToken: null });
  assert.deepEqual(roundIdentity({ currentRound: 1.5, roundVersion: -4 }), { roundIndex: -1, roundVersion: 0, roundToken: null });
});

test('plans are frozen values, safe to hand to any caller', () => {
  const outcome = plan('advance', ROOMS[MATCH_STATE.ROUND_ACTIVE]);
  assert.ok(Object.isFrozen(outcome));
  assert.ok(Object.isFrozen(LIFECYCLE_TRANSITIONS) && LIFECYCLE_TRANSITIONS.every(Object.isFrozen));
});
