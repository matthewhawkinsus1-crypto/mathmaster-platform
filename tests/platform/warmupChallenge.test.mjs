import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  WARMUP_CHALLENGE_ROUTE,
  normalizeWarmupChallengeConfig,
  roundsAvailableToStudent,
  warmupChallengeCredit,
  warmupChallengeRoute,
} from '../../functions/shared/warmupChallenge.mjs';

const configured = { warmup: { liveChallenge: { enabled: true, roundCount: 5, roundSeconds: 30 } } };
const active = { status: 'active' };

test('a Warm-Up is never quietly a competition', () => {
  // A Warm-Up that became a timed game because a default flipped would be a bad
  // surprise in front of a class.
  assert.equal(normalizeWarmupChallengeConfig(null).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig({}).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig({ warmup: {} }).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig({ warmup: { liveChallenge: {} } }).enabled, false);
  // Only an explicit true switches it on.
  assert.equal(normalizeWarmupChallengeConfig({ warmup: { liveChallenge: { enabled: 'yes' } } }).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig(configured).enabled, true);
});

test('a bell-ringer is shorter than a standalone game by default', () => {
  const config = normalizeWarmupChallengeConfig({ warmup: { liveChallenge: { enabled: true } } });
  assert.equal(config.roundCount, 5);
  assert.equal(config.roundSeconds, 30);
  assert.equal(config.standardCode, 'mixed');
});

test('a malformed configuration is clamped rather than trusted', () => {
  const config = normalizeWarmupChallengeConfig({
    warmup: { liveChallenge: { enabled: true, roundCount: 900, roundSeconds: 2, standardCode: '   ' } },
  });
  assert.equal(config.roundCount, 20);
  assert.equal(config.roundSeconds, 15);
  assert.equal(config.standardCode, 'mixed');
});

test('the student is handed to the game only while the Warm-Up is live', () => {
  assert.equal(
    warmupChallengeRoute({ assignment: configured, warmupState: active, roomStatus: 'running' }).route,
    WARMUP_CHALLENGE_ROUTE.PLAY,
  );
  assert.equal(
    warmupChallengeRoute({ assignment: configured, warmupState: active, roomStatus: 'lobby' }).route,
    WARMUP_CHALLENGE_ROUTE.PLAY,
  );
});

test('the Warm-Up window is the authority, and a teacher closing it wins', () => {
  // Including when the room is still running: closing the Warm-Up early is a
  // decision the challenge must not override.
  for (const status of ['waiting', 'closed', 'ended', 'notToday', 'unscheduled', 'unavailable']) {
    const result = warmupChallengeRoute({
      assignment: configured, warmupState: { status }, roomStatus: 'running',
    });
    assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE, status);
    assert.equal(result.reason, `warmup_${status}`);
  }
});

test('a configured game with no room yet waits for the teacher', () => {
  // Not "none": the student should be told something is coming rather than be
  // dropped into the ordinary Warm-Up and then yanked out of it.
  const result = warmupChallengeRoute({ assignment: configured, warmupState: active, roomStatus: null });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER);
  assert.equal(result.reason, 'no_room_yet');
});

test('a finished or cancelled game sends the student on into the assignment', () => {
  for (const roomStatus of ['finished', 'cancelled']) {
    assert.equal(
      warmupChallengeRoute({ assignment: configured, warmupState: active, roomStatus }).route,
      WARMUP_CHALLENGE_ROUTE.CONTINUE,
      roomStatus,
    );
  }
});

test('a student who already played is never pulled back in', () => {
  // Revisiting the assignment during the same window must not restart the game
  // for them.
  const result = warmupChallengeRoute({
    assignment: configured, warmupState: active, roomStatus: 'running', alreadyPlayed: true,
  });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.CONTINUE);
  assert.equal(result.reason, 'already_played');
});

test('an unconfigured Warm-Up behaves exactly as it always has', () => {
  const result = warmupChallengeRoute({ assignment: {}, warmupState: active, roomStatus: 'running' });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE);
  assert.equal(result.reason, 'not_configured');
});

test('challenge points never reach the assignment', () => {
  // A round is scored out of roughly 1150 with speed and streak inside it.
  // Letting that reach a grade would put the clock in the gradebook and mark
  // down the student who thinks longest.
  const credit = warmupChallengeCredit({ roundsAnswered: 5, correctCount: 4, roundsAvailable: 5 });
  const keys = Object.keys(credit);
  for (const forbidden of ['score', 'points', 'pointsAwarded', 'speedBonus', 'streakBonus', 'rank']) {
    assert.ok(!keys.includes(forbidden), `credit must not carry ${forbidden}`);
  }
  assert.equal(credit.participationPercent, 100);
  assert.equal(credit.accuracyPercent, 80);

  const source = readFileSync('functions/shared/warmupChallenge.mjs', 'utf8');
  assert.match(source, /Challenge points are not part of the assignment grade/);
});

test('a late arrival is measured against the rounds they could have played', () => {
  // A student who walked in at round six is a full participant in the part they
  // were present for, not a partial one in a game they missed the start of.
  const available = roundsAvailableToStudent({ totalRounds: 10, joinedAtRound: 6 });
  assert.equal(available, 4);
  const credit = warmupChallengeCredit({ roundsAnswered: 4, correctCount: 3, roundsAvailable: available });
  assert.equal(credit.participationPercent, 100);
  assert.equal(credit.accuracyPercent, 75);
});

test('a student present for a game that never ran has not scored zero', () => {
  const credit = warmupChallengeCredit({ roundsAnswered: 0, correctCount: 0, roundsAvailable: 0 });
  assert.equal(credit.participationPercent, null);
  assert.equal(credit.accuracyPercent, null);
});

test('credit cannot exceed what was played', () => {
  const credit = warmupChallengeCredit({ roundsAnswered: 99, correctCount: 99, roundsAvailable: 5 });
  assert.equal(credit.answered, 5);
  assert.equal(credit.correct, 5);
  assert.equal(credit.accuracyPercent, 100);
});

test('the rounds available never go negative on odd input', () => {
  assert.equal(roundsAvailableToStudent({ totalRounds: 5, joinedAtRound: 12 }), 0);
  assert.equal(roundsAvailableToStudent({ totalRounds: -3, joinedAtRound: 2 }), 0);
  assert.equal(roundsAvailableToStudent({}), 0);
});

test('the module decides routing only, and does not reimplement either runtime', () => {
  // The assignment advances a student when they submit; a challenge advances
  // everyone when the teacher says so. Making one behave like the other here
  // would put a second, disagreeing copy of the rules in the codebase.
  const source = readFileSync('functions/shared/warmupChallenge.mjs', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.doesNotMatch(source, /scoreChallengeRound|advanceLiveChallenge|setTimeout|Date\.now\(\)/);
});
