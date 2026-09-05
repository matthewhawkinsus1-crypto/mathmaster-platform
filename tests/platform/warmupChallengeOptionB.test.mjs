import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WARMUP_CHALLENGE_ROUTE,
  normalizeWarmupChallengeConfig,
  warmupChallengeRoute,
} from '../../functions/shared/warmupChallenge.mjs';

const active = { status: 'active' };
const running = 'running';
const assignmentWith = (liveChallenge) => ({ warmup: { liveChallenge } });

test('legacy enabled assignments retain Live Challenge replacement behavior', () => {
  const assignment = assignmentWith({ enabled: true, roundCount: 5, roundSeconds: 30 });
  const config = normalizeWarmupChallengeConfig(assignment);
  assert.equal(config.deliveryMode, 'liveChallenge');
  assert.equal(config.teacherDecision, null);
  assert.equal(
    warmupChallengeRoute({ assignment, warmupState: active, roomStatus: null }).route,
    WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER,
  );
  assert.equal(
    warmupChallengeRoute({ assignment, warmupState: active, roomStatus: running }).route,
    WARMUP_CHALLENGE_ROUTE.PLAY,
  );
});

test('standard delivery leaves the existing Warm-Up alone', () => {
  const assignment = assignmentWith({ enabled: true, deliveryMode: 'standard' });
  const result = warmupChallengeRoute({ assignment, warmupState: active, roomStatus: running });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE);
  assert.equal(result.reason, 'standard_delivery');
});

test('Teacher Choice waits for the teacher before students work either path', () => {
  const assignment = assignmentWith({ enabled: true, deliveryMode: 'teacherChoice', teacherDecision: null });
  const result = warmupChallengeRoute({ assignment, warmupState: active, roomStatus: null });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER);
  assert.equal(result.reason, 'teacher_choice_pending');
});

test('Teacher Choice standard decision releases the ordinary Warm-Up', () => {
  const assignment = assignmentWith({ enabled: true, deliveryMode: 'teacherChoice', teacherDecision: 'standard' });
  const result = warmupChallengeRoute({ assignment, warmupState: active, roomStatus: running });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE);
  assert.equal(result.reason, 'teacher_selected_standard');
});

test('Teacher Choice challenge decision follows the normal game state machine', () => {
  const assignment = assignmentWith({ enabled: true, deliveryMode: 'teacherChoice', teacherDecision: 'challenge' });
  assert.equal(
    warmupChallengeRoute({ assignment, warmupState: active, roomStatus: null }).route,
    WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER,
  );
  assert.equal(
    warmupChallengeRoute({ assignment, warmupState: active, roomStatus: 'lobby' }).route,
    WARMUP_CHALLENGE_ROUTE.PLAY,
  );
  assert.equal(
    warmupChallengeRoute({ assignment, warmupState: active, roomStatus: running }).route,
    WARMUP_CHALLENGE_ROUTE.PLAY,
  );
});

test('Teacher Choice still obeys a closed Warm-Up window', () => {
  const assignment = assignmentWith({ enabled: true, deliveryMode: 'teacherChoice', teacherDecision: null });
  const result = warmupChallengeRoute({ assignment, warmupState: { status: 'closed' }, roomStatus: null });
  assert.equal(result.route, WARMUP_CHALLENGE_ROUTE.NONE);
  assert.equal(result.reason, 'warmup_closed');
});
