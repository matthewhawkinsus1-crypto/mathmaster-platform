import test from 'node:test';
import assert from 'node:assert/strict';

import { explainStudentChallengeRewards, describeDelivery } from '../../functions/shared/rewardDiagnostics.mjs';
import { evaluateRewardPolicy, normalizeRewardPolicy, LEGACY_ACHIEVEMENT_RULE_ID } from '../../functions/shared/liveChallengeRewardRules.mjs';
import {
  CHAMPION_RULE_ID,
  PASS_RULE_ID,
  buildChallengeRewardPolicy,
  describeChallengeRewardChoice,
  normalizeChallengeRewardChoice,
} from '../../src/platform/rewards/challengeRewardPolicy.js';
import { buildTeacherRewardsView } from '../../src/platform/rewards/teacherRewardsModel.js';

/*
 * Teacher-facing rewards: the policy a teacher's Live Challenge choice sends,
 * the explanation of why a student did or did not earn each reward, and the
 * per-student view built from the teacher read.
 */

const standing = (studentId, rank, overrides = {}) => ({
  studentId, joined: true, joinedAtRound: 0, rank, score: 3000 - rank * 100, roundsAnswered: 3,
  answeredRounds: [0, 1, 2], missedRounds: [],
  roundOutcomes: [0, 1, 2].map((roundIndex) => ({ roundIndex, isCorrect: true, secondChance: false })),
  ...overrides,
});

test('choosing nothing sends no policy: the server default is the original behaviour', () => {
  assert.equal(buildChallengeRewardPolicy({ passPlaces: 0, championBadge: false }), null);
  assert.equal(buildChallengeRewardPolicy(undefined), null);
});

test('a pass choice keeps every default achievement and validates on the server', () => {
  const policy = buildChallengeRewardPolicy({ passPlaces: 3, passExpiryDays: 14, championBadge: true });
  const ids = policy.rules.map((rule) => rule.ruleId);
  for (const legacy of Object.values(LEGACY_ACHIEVEMENT_RULE_ID)) assert.ok(ids.includes(legacy), `${legacy} kept under its original id`);
  assert.ok(ids.includes(PASS_RULE_ID) && ids.includes(CHAMPION_RULE_ID));
  const normalized = normalizeRewardPolicy(policy);
  const pass = normalized.rules.find((rule) => rule.ruleId === PASS_RULE_ID);
  assert.equal(pass.criterion.maxRank, 3);
  assert.equal(pass.reward.rewardCode, 'practicePass');
  assert.equal(pass.reward.expiresInDays, 14);
  assert.equal(normalizeRewardPolicy(buildChallengeRewardPolicy({ passPlaces: 1, passExpiryDays: 0 })).rules.find((rule) => rule.ruleId === PASS_RULE_ID).reward.expiresInDays, null, '"Never" means no expiry');
});

test('tied students both earn the place-based pass; placement is never broken by name', () => {
  const policy = buildChallengeRewardPolicy({ passPlaces: 1 });
  const awards = evaluateRewardPolicy({
    matchResult: { roomId: 'room', scheduledRoundCount: 3, standings: [standing('a', 1), standing('b', 1), standing('c', 3)] },
    policy,
  }).filter((award) => award.ruleId === PASS_RULE_ID);
  assert.deepEqual(awards.map((award) => award.studentId), ['a', 'b']);
});

test('a teacher choice is clamped to the offered options', () => {
  assert.deepEqual(normalizeChallengeRewardChoice({ passPlaces: 9, passExpiryDays: 3, championBadge: 'yes' }), { passPlaces: 0, passExpiryDays: 14, championBadge: false });
  assert.ok(describeChallengeRewardChoice({ passPlaces: 2, passExpiryDays: 7 }).some((line) => /Top 2 earn a Practice Pass \(expires after 7 days\)/.test(line)));
});

test('the explanation separates game placement from rewards, rule by rule', () => {
  const matchResult = {
    roomId: 'room-1', title: 'Friday Challenge', status: 'finished', scheduledRoundCount: 3, playedCount: 3, finalizedAtMs: 1,
    rewardPolicy: buildChallengeRewardPolicy({ passPlaces: 1 }),
    standings: [standing('winner', 1), standing('second', 2, { roundOutcomes: [{ roundIndex: 0, isCorrect: true }, { roundIndex: 1, isCorrect: false }, { roundIndex: 2, isCorrect: false }] })],
  };
  const job = { awards: [
    { studentId: 'second', ruleId: 'challengeFinisher', processed: true, outcome: 'awarded' },
  ] };
  const story = explainStudentChallengeRewards({ matchResult, job, studentId: 'second' });
  assert.equal(story.placement, '2nd place');
  const byId = Object.fromEntries(story.rules.map((rule) => [rule.ruleId, rule]));
  assert.equal(byId.challengeFinisher.met, true);
  assert.equal(byId.challengeFinisher.delivery.state, 'delivered');
  assert.equal(byId.strongAccuracy.met, false);
  assert.equal(byId.strongAccuracy.measured, '1 of 3 answered correctly');
  assert.equal(byId[PASS_RULE_ID].met, false);
  assert.match(byId[PASS_RULE_ID].measured, /Finished 2nd/);
  assert.equal(story.usesDefaultPolicy, false);
});

test('delivery problems are named: skipped, failed, still arriving, never recorded', () => {
  assert.equal(describeDelivery({ processed: true, outcome: 'skipped', skipReason: 'grade_class_mismatch' }).label, 'Not delivered: the student had moved to a different class');
  assert.equal(describeDelivery({ processed: true, outcome: 'failed' }).state, 'failed');
  assert.equal(describeDelivery({ processed: false, attempts: 2 }).state, 'pending');
  assert.equal(describeDelivery(null).state, 'notRecorded');
  const skipped = explainStudentChallengeRewards({ matchResult: { status: 'finished', rewardsSkipReason: 'class_archived', standings: [] }, studentId: 'x' });
  assert.match(skipped.matchNote, /class was archived/);
  const cancelled = explainStudentChallengeRewards({ matchResult: { status: 'cancelled', standings: [] }, studentId: 'x' });
  assert.match(cancelled.matchNote, /cancelled/);
});

test("a teacher's view of one student: what is ready, what was used, what was undone", () => {
  const view = buildTeacherRewardsView({
    account: { balance: 30 },
    grants: [
      { grantId: 'g1', rewardCode: 'practicePass', status: 'available', awardedAt: '2026-09-29T10:00:00Z', source: { type: 'liveChallenge', id: 'room-1' }, reasonLabel: 'Live Challenge — 1st place' },
      { grantId: 'g2', rewardCode: 'practicePass', status: 'redeemed', awardedAt: '2026-09-20T10:00:00Z', redeemedAt: '2026-09-21T10:00:00Z', source: { type: 'teacher', id: 't@x' } },
      { grantId: 'g3', rewardCode: 'badge', label: 'Helper', status: 'revoked', awardedAt: '2026-09-10T10:00:00Z', revocation: { reason: 'Oops' }, source: { type: 'teacher', id: 't@x' } },
    ],
    redemptions: [
      { redemptionId: 'r1', assignmentId: 'a1', assignmentTitle: 'Lesson 1', paidWith: 'pass', grantId: 'g2', status: 'redeemed', redeemedAt: '2026-09-21T10:00:00Z' },
      { redemptionId: 'r2', assignmentId: 'a2', assignmentTitle: 'Lesson 2', paidWith: 'classPoints', status: 'reversed', redeemedAt: '2026-09-15T10:00:00Z', reversedAt: '2026-09-16T10:00:00Z', reversal: { reason: 'Wrong lesson', actorEmail: 't@x' }, refund: { kind: 'classPoints' } },
    ],
    challenges: [{ roomId: 'room-1', title: 'Friday', rules: [] }],
  }, Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(view.summary, '1 Practice Pass ready · 30 Class Points');
  assert.equal(view.available.length, 1);
  assert.match(view.available[0].source, /Live Challenge “Friday” — 1st place/);
  assert.deepEqual([...view.excusedAssignmentIds], ['a1'], 'an undone use no longer excuses Practice');
  assert.match(view.uses[0].payment, /Paid with a Practice Pass \(Given by t@x\)/);
  assert.equal(view.uses[1].active, false);
  assert.equal(view.uses[1].refund, 'Points refunded to the student');
  assert.equal(view.closed[0].status, 'revoked');
});
