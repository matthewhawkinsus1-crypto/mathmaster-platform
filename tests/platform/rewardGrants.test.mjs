import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRANT_OUTCOME,
  REWARD_CATEGORY,
  REWARD_DEFINITIONS,
  REWARD_GRANT_STATUS,
  buildRewardGrant,
  effectiveGrantStatus,
  getRewardDefinition,
  isGrantableReward,
  isTerminalGrantStatus,
  planGrantTransition,
} from '../../functions/shared/rewardGrants.mjs';

/*
 * A reward DEFINITION says what a reward is; a GRANT is one student holding
 * one. These tests hold the grant lifecycle: available -> redeemed | revoked
 * | expired, terminal states that never change, retries that are "already
 * applied" rather than a second use, and a history that only ever grows.
 */

const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const DAY = 86_400_000;

const pass = (overrides = {}) => buildRewardGrant({
  grantId: 'lcg_test',
  rewardCode: 'practicePass',
  studentId: 'student-1',
  classId: 'class-1',
  source: { type: 'liveChallenge', id: 'room-1', ruleId: 'topFinish', ruleVersion: 2, identity: 'liveChallenge\u0000room-1\u0000student-1\u0000topFinish' },
  awardedAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + 30 * DAY).toISOString(),
  originTeacherEmail: 't@school.org',
  authorizedTeacherEmails: ['t@school.org'],
  ...overrides,
});

const redeem = (redemptionId = 'use-1', targetKind = 'assignmentPracticeSection') => ({
  to: REWARD_GRANT_STATUS.REDEEMED,
  actor: { type: 'student' },
  redemption: { redemptionId, targetKind, targetId: 'assignment-7', targetLabel: 'Unit 3 practice' },
});

test('the catalog separates currency from items', () => {
  assert.equal(REWARD_DEFINITIONS.classPoints.category, REWARD_CATEGORY.CURRENCY);
  assert.equal(isGrantableReward('classPoints'), false, 'Class Points go through their ledger, never as a grant');
  assert.equal(isGrantableReward('practicePass'), true);
  assert.equal(isGrantableReward('badge'), true);
  assert.equal(getRewardDefinition('badge').redeemable, false);
  assert.equal(getRewardDefinition('nope'), null);
});

test('a new grant is available, sourced and starts its history', () => {
  const grant = pass();
  assert.equal(grant.status, REWARD_GRANT_STATUS.AVAILABLE);
  assert.equal(grant.category, REWARD_CATEGORY.PASS);
  assert.deepEqual(grant.source, { type: 'liveChallenge', id: 'room-1', ruleId: 'topFinish', ruleVersion: 2, identity: 'liveChallenge\u0000room-1\u0000student-1\u0000topFinish' });
  assert.deepEqual(grant.history.map((entry) => entry.status), ['available']);
  assert.equal(grant.badgeCode, null, 'only a badge has a badge code');
  assert.equal(buildRewardGrant({ grantId: 'b', rewardCode: 'badge', badgeCode: 'champion', studentId: 's', classId: 'c' }).badgeCode, 'champion');
  assert.throws(() => pass({ rewardCode: 'classPoints' }), /not an item reward/);
  assert.throws(() => pass({ grantId: '' }), /deterministic id/);
  assert.throws(() => pass({ studentId: '' }), /student and a class/);
});

test('redeeming uses the pass once; the same request again is already applied', () => {
  const used = planGrantTransition(pass(), redeem(), NOW);
  assert.equal(used.outcome, GRANT_OUTCOME.APPLY);
  assert.equal(used.next.status, REWARD_GRANT_STATUS.REDEEMED);
  assert.equal(used.next.redemption.targetId, 'assignment-7');
  assert.deepEqual(used.next.history.map((entry) => entry.status), ['available', 'redeemed']);

  assert.equal(planGrantTransition(used.next, redeem(), NOW).outcome, GRANT_OUTCOME.ALREADY_APPLIED, 'a retried redemption is not a second use');
  const second = planGrantTransition(used.next, redeem('use-2'), NOW);
  assert.equal(second.outcome, GRANT_OUTCOME.REJECT);
  assert.equal(second.code, 'already_redeemed', 'one pass cannot be spent on two things');
});

test('a redemption must name a valid target, and only redeemable rewards redeem', () => {
  assert.equal(planGrantTransition(pass(), { to: 'redeemed', redemption: {} }, NOW).code, 'redemption_required');
  assert.equal(planGrantTransition(pass(), redeem('use-1', 'quiz'), NOW).code, 'wrong_target');
  const badge = buildRewardGrant({ grantId: 'b', rewardCode: 'badge', studentId: 's', classId: 'c' });
  assert.equal(planGrantTransition(badge, redeem(), NOW).code, 'not_redeemable');
});

test('an expired pass reads as expired and cannot be used', () => {
  const grant = pass();
  assert.equal(effectiveGrantStatus(grant, NOW), 'available');
  assert.equal(effectiveGrantStatus(grant, NOW + 31 * DAY), 'expired', 'expiry needs no write to be true');
  assert.equal(planGrantTransition(grant, redeem(), NOW + 31 * DAY).code, 'expired');
  assert.equal(planGrantTransition(grant, { to: 'expired' }, NOW).code, 'not_expired', 'nothing expires early');
  const expired = planGrantTransition(grant, { to: 'expired' }, NOW + 31 * DAY);
  assert.equal(expired.outcome, GRANT_OUTCOME.APPLY);
  assert.equal(planGrantTransition(expired.next, { to: 'expired' }, NOW + 32 * DAY).outcome, GRANT_OUTCOME.ALREADY_APPLIED);
  assert.equal(effectiveGrantStatus(pass({ expiresAt: null }), NOW + 3_650 * DAY), 'available', 'no expiry means none');
});

test('a teacher can take back an unused reward, with a reason, once', () => {
  const take = (grant) => planGrantTransition(grant, { to: 'revoked', reason: 'Awarded to the wrong period', actor: { type: 'teacher', email: 't@school.org' } }, NOW);
  assert.equal(planGrantTransition(pass(), { to: 'revoked', actor: { type: 'teacher' } }, NOW).code, 'reason_required');
  const revoked = take(pass());
  assert.equal(revoked.outcome, GRANT_OUTCOME.APPLY);
  assert.deepEqual(revoked.next.revocation, { actorType: 'teacher', actorEmail: 't@school.org', reason: 'Awarded to the wrong period' });
  assert.equal(take(revoked.next).outcome, GRANT_OUTCOME.ALREADY_APPLIED);
  const used = planGrantTransition(pass(), redeem(), NOW).next;
  assert.equal(take(used).code, 'already_redeemed', 'a used reward cannot be revoked after the fact');
});

test('terminal grants never change, and history only grows', () => {
  const used = planGrantTransition(pass(), redeem(), NOW).next;
  for (const status of ['redeemed', 'expired', 'revoked']) assert.ok(isTerminalGrantStatus(status));
  assert.ok(!isTerminalGrantStatus('available'));
  assert.equal(planGrantTransition(used, { to: 'expired' }, NOW + 365 * DAY).code, 'already_redeemed');
  assert.equal(planGrantTransition(used, { to: 'available' }, NOW).code, 'unknown_transition', 'there is no way back to available');
  assert.equal(planGrantTransition(null, redeem(), NOW).code, 'not_found');
  // The plan carries the full prior history: applying it never loses an entry.
  const revokedAfterNothing = planGrantTransition(pass(), { to: 'revoked', reason: 'x', actor: { type: 'admin' } }, NOW).next;
  assert.deepEqual(revokedAfterNothing.history.map((entry) => entry.status), ['available', 'revoked']);
});
