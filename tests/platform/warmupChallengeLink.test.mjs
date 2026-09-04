import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INVITE_STATUS_TO_ROOM_STATUS,
  WARMUP_CHALLENGE_ROUTE,
  inviteBelongsToAssignment,
  resolveWarmupChallenge,
  warmupRoomStatusFromInvite,
} from '../../src/platform/liveChallenge/warmupChallengeLink.js';

const challengeAssignment = (overrides = {}) => ({
  id: 'assignment-a',
  warmup: { enabled: true, liveChallenge: { enabled: true, roundCount: 5, roundSeconds: 30 } },
  ...overrides,
});

const activeWarmup = { enabled: true, status: 'active' };

/* ---------- the false positives that would pull a student out of their work ---------- */

test('a standalone challenge invite never drives a Warm-Up', () => {
  // No assignmentId at all: this is the teacher-dashboard flow.
  const invite = { roomId: 'room-1', status: 'running' };
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite,
  });
  assert.notEqual(result.route, WARMUP_CHALLENGE_ROUTE.PLAY);
  assert.equal(result.roomId, null);
  assert.equal(result.linkedRoomId, null);
});

test("an invite for another assignment never drives this assignment's Warm-Up", () => {
  const invite = { roomId: 'room-1', status: 'running', assignmentId: 'assignment-b' };
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite,
  });
  assert.notEqual(result.route, WARMUP_CHALLENGE_ROUTE.PLAY);
  assert.equal(result.roomId, null);
});

test('a blank assignmentId on either side is never a wildcard', () => {
  assert.equal(inviteBelongsToAssignment({ assignmentId: '' }, 'assignment-a'), false);
  assert.equal(inviteBelongsToAssignment({ assignmentId: '   ' }, 'assignment-a'), false);
  assert.equal(inviteBelongsToAssignment({ assignmentId: 'assignment-a' }, ''), false);
  assert.equal(inviteBelongsToAssignment(null, 'assignment-a'), false);
  assert.equal(inviteBelongsToAssignment({ assignmentId: 'assignment-a' }, null), false);
});

test('a non-string assignmentId cannot match', () => {
  assert.equal(inviteBelongsToAssignment({ assignmentId: 1 }, 1), false);
  assert.equal(inviteBelongsToAssignment({ assignmentId: {} }, 'assignment-a'), false);
});

/* ---------- the happy path ---------- */

test('a linked, live room routes the student into play and yields its room id', () => {
  const invite = { roomId: 'room-1', status: 'running', assignmentId: 'assignment-a' };
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite,
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.PLAY);
  assert.equal(result.roomId, 'room-1');
});

test('a linked room still in the lobby routes to play so students are there for round one', () => {
  const invite = { roomId: 'room-1', status: 'invited', assignmentId: 'assignment-a' };
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite,
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.PLAY);
});

test('configured but no room yet waits for the teacher', () => {
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite: null,
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER);
});

/* ---------- not being dragged back in ---------- */

test('a student who already played is not pulled back into the same room', () => {
  const invite = { roomId: 'room-1', status: 'running', assignmentId: 'assignment-a' };
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite,
    playedRoomIds: ['room-1'],
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.CONTINUE);
  assert.equal(result.roomId, null);
});

test('having played a DIFFERENT room does not block this one', () => {
  const invite = { roomId: 'room-2', status: 'running', assignmentId: 'assignment-a' };
  const result = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite,
    playedRoomIds: ['room-1'],
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.PLAY);
});

test('a finished room lets the student continue rather than replaying', () => {
  for (const status of ['finished', 'cancelled']) {
    const result = resolveWarmupChallenge({
      assignment: challengeAssignment(),
      assignmentId: 'assignment-a',
      warmupState: activeWarmup,
      invite: { roomId: 'room-1', status, assignmentId: 'assignment-a' },
    });
    assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.CONTINUE, status);
    assert.equal(result.roomId, null, status);
  }
});

/* ---------- the Warm-Up window stays the authority ---------- */

test('a closed Warm-Up closes the challenge with it, however live the room is', () => {
  for (const status of ['unavailable', 'unscheduled', 'closed', 'upcoming']) {
    const result = resolveWarmupChallenge({
      assignment: challengeAssignment(),
      assignmentId: 'assignment-a',
      warmupState: { enabled: true, status },
      invite: { roomId: 'room-1', status: 'running', assignmentId: 'assignment-a' },
    });
    assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE, status);
    assert.equal(result.roomId, null, status);
  }
});

test('an assignment without the challenge switched on is untouched even with a live linked room', () => {
  const result = resolveWarmupChallenge({
    assignment: { id: 'assignment-a', warmup: { enabled: true } },
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite: { roomId: 'room-1', status: 'running', assignmentId: 'assignment-a' },
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE);
  assert.equal(result.roomId, null);
});

/* ---------- shape guarantees ---------- */

test('an unknown invite status resolves to no room rather than guessing', () => {
  assert.equal(warmupRoomStatusFromInvite({ assignmentId: 'a', status: 'weird' }, 'a'), null);
  assert.equal(warmupRoomStatusFromInvite({ assignmentId: 'a' }, 'a'), null);
});

test('every invite status the server writes has a mapping', () => {
  // These are the four the server actually sets: created, started, finished,
  // cancelled. If a new one is introduced the mapping must be updated with it.
  for (const status of ['invited', 'running', 'finished', 'cancelled']) {
    assert.ok(INVITE_STATUS_TO_ROOM_STATUS[status], `${status} must map to a room status`);
  }
});

test('roomId is only ever returned on the play route', () => {
  const routes = [
    { warmupState: { status: 'closed' }, invite: { roomId: 'r', status: 'running', assignmentId: 'assignment-a' } },
    { warmupState: activeWarmup, invite: { roomId: 'r', status: 'finished', assignmentId: 'assignment-a' } },
    { warmupState: activeWarmup, invite: null },
  ];
  for (const scenario of routes) {
    const result = resolveWarmupChallenge({
      assignment: challengeAssignment(),
      assignmentId: 'assignment-a',
      ...scenario,
    });
    assert.notEqual(result.route, WARMUP_CHALLENGE_ROUTE.PLAY);
    assert.equal(result.roomId, null);
  }
});

test('it never throws on junk input', () => {
  for (const bad of [undefined, null, {}, { invite: 'nope' }, { assignment: 5 }, { playedRoomIds: 'no' }]) {
    assert.doesNotThrow(() => resolveWarmupChallenge(bad));
  }
});

/* ---------- the duplicate hand-off banner ---------- */

import { shouldShowChallengeHandoffBanner } from '../../src/platform/liveChallenge/warmupChallengeLink.js';

const runningInvite = (overrides = {}) => ({ roomId: 'room-1', status: 'running', ...overrides });

test('the standalone join banner is unchanged when nothing is playing inline', () => {
  assert.equal(shouldShowChallengeHandoffBanner({ invite: runningInvite() }), true);
});

test('the banner is suppressed only while that same room plays inline', () => {
  const decision = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: activeWarmup,
    invite: runningInvite({ assignmentId: 'assignment-a' }),
  });
  assert.equal(decision.route, WARMUP_CHALLENGE_ROUTE.PLAY);
  assert.equal(
    shouldShowChallengeHandoffBanner({ invite: runningInvite({ assignmentId: 'assignment-a' }), warmupDecision: decision }),
    false,
  );
});

test('a student inside a DIFFERENT assignment still gets the banner', () => {
  const decision = resolveWarmupChallenge({
    assignment: challengeAssignment({ id: 'assignment-b' }),
    assignmentId: 'assignment-b',
    warmupState: activeWarmup,
    invite: runningInvite({ assignmentId: 'assignment-a' }),
  });
  assert.equal(
    shouldShowChallengeHandoffBanner({ invite: runningInvite({ assignmentId: 'assignment-a' }), warmupDecision: decision }),
    true,
  );
});

test('a live room whose Warm-Up window has closed still offers the banner as the only way in', () => {
  const decision = resolveWarmupChallenge({
    assignment: challengeAssignment(),
    assignmentId: 'assignment-a',
    warmupState: { enabled: true, status: 'closed' },
    invite: runningInvite({ assignmentId: 'assignment-a' }),
  });
  assert.equal(decision.route, WARMUP_CHALLENGE_ROUTE.NONE);
  assert.equal(
    shouldShowChallengeHandoffBanner({ invite: runningInvite({ assignmentId: 'assignment-a' }), warmupDecision: decision }),
    true,
  );
});

test('a lobby invite does not raise the started banner', () => {
  assert.equal(shouldShowChallengeHandoffBanner({ invite: { roomId: 'r', status: 'invited' } }), false);
  assert.equal(shouldShowChallengeHandoffBanner({ invite: null }), false);
  assert.equal(shouldShowChallengeHandoffBanner(), false);
});

test('the banner is never suppressed by a decision pointing at another room', () => {
  // A stale decision must not silence the banner for a different live game.
  const stale = { route: WARMUP_CHALLENGE_ROUTE.PLAY, roomId: 'room-9' };
  assert.equal(
    shouldShowChallengeHandoffBanner({ invite: runningInvite({ roomId: 'room-1' }), warmupDecision: stale }),
    true,
  );
});
