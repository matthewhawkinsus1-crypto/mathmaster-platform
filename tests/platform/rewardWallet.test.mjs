import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRewardGrant, planGrantTransition } from '../../functions/shared/rewardGrants.mjs';
import {
  HISTORY_KIND,
  buildRewardHistory,
  buildRewardWallet,
  celebrationMessage,
  describeGrantSource,
  describePracticePassUse,
  newlyEarnedGrants,
  practicePassErrorMessage,
  practicePassSuccessMessage,
  rewardsFromChallenge,
  walletSummaryLine,
} from '../../src/platform/rewards/rewardWallet.js';

/*
 * The student's wallet is built from individual reward records. These tests
 * hold what a student is told: how many passes they can use (expired, used
 * and taken-back ones never count), which one is spent first, what happened
 * to each one, and that a failure always says nothing was used.
 */

const NOW = Date.parse('2026-10-01T15:00:00.000Z');
const DAY = 86_400_000;
let next = 0;
const grant = ({ rewardCode = 'practicePass', awardedAt = NOW - DAY, expiresAt = null, source = { type: 'liveChallenge', id: 'room-1', ruleId: 'r' }, label = null, note = null } = {}) => buildRewardGrant({
  grantId: `g${(next += 1)}`,
  rewardCode,
  label,
  note,
  studentId: 's1',
  classId: 'c1',
  source,
  awardedAt: new Date(awardedAt).toISOString(),
  expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
});
const use = (g, redemptionId = `red-${g.grantId}`, targetLabel = 'Unit 2 Lesson') => planGrantTransition(g, {
  to: 'redeemed', at: new Date(NOW - 1000).toISOString(), redemption: { redemptionId, targetKind: 'assignmentPracticeSection', targetId: 'a1', targetLabel },
}, NOW).next;
const takeBack = (g) => planGrantTransition(g, { to: 'revoked', reason: 'Wrong student', actor: { type: 'teacher', email: 't@x' }, at: new Date(NOW - 500).toISOString() }, NOW).next;

test('the wallet counts only passes a student can use right now', () => {
  const ready = grant({ expiresAt: NOW + 10 * DAY });
  const forever = grant();
  const expired = grant({ expiresAt: NOW - DAY });
  const used = use(grant());
  const revoked = takeBack(grant());
  const wallet = buildRewardWallet({ grants: [ready, forever, expired, used, revoked], account: { balance: 40 }, nowMs: NOW });
  assert.equal(wallet.practicePasses.count, 2);
  assert.equal(wallet.practicePasses.nextToUse.grantId, ready.grantId, 'the pass with an expiry is spent before the one without');
  assert.equal(wallet.payment, 'pass', 'a held pass is always used before points');
  assert.equal(wallet.classPoints.pointsNeeded, 60);
});

test('multiple reward types are kept apart', () => {
  const badge = grant({ rewardCode: 'badge', label: 'Great explainer', source: { type: 'teacher', id: 't@x' } });
  const wallet = buildRewardWallet({ grants: [grant(), badge], account: { balance: 120 }, nowMs: NOW });
  assert.equal(wallet.practicePasses.count, 1);
  assert.equal(wallet.badges.length, 1);
  assert.equal(wallet.badges[0].label, 'Great explainer');
  assert.equal(walletSummaryLine(wallet), '1 Practice Pass · 1 badge · 120 Class Points');
});

test('with no pass, 100 points can buy one; with fewer, nothing can be spent', () => {
  assert.equal(buildRewardWallet({ grants: [], account: { balance: 100 }, nowMs: NOW }).payment, 'classPoints');
  const poor = buildRewardWallet({ grants: [], account: { balance: 99 }, nowMs: NOW });
  assert.equal(poor.payment, null);
  assert.equal(poor.classPoints.canBuyPass, false);
});

test('a pass expiring within three days is flagged', () => {
  const wallet = buildRewardWallet({ grants: [grant({ expiresAt: NOW + 2 * DAY }), grant({ expiresAt: NOW + 20 * DAY })], nowMs: NOW });
  assert.equal(wallet.practicePasses.expiringSoonCount, 1);
});

test('only live waivers are listed as excused', () => {
  const wallet = buildRewardWallet({
    redemptions: [
      { redemptionId: 'r1', assignmentTitle: 'A', status: 'redeemed', redeemedAt: '2026-09-30T10:00:00Z' },
      { redemptionId: 'r2', assignmentTitle: 'B', status: 'reversed', redeemedAt: '2026-09-29T10:00:00Z' },
      { redemptionId: 'r3', assignmentTitle: 'C', redeemedAt: '2026-09-28T10:00:00Z' },
    ],
    nowMs: NOW,
  });
  assert.deepEqual(wallet.excusedAssignments.map((entry) => entry.redemptionId), ['r1', 'r3'], 'a legacy record with no status is a live waiver');
});

test('the confirmation says exactly what will happen and what it costs', () => {
  const wallet = buildRewardWallet({ grants: [grant(), grant()], nowMs: NOW });
  const plan = describePracticePassUse({ wallet, assignmentTitle: 'Unit 4' });
  assert.equal(plan.question, 'Use a Practice Pass on Unit 4?');
  assert.equal(plan.cost, 'Uses 1 Practice Pass.');
  assert.equal(plan.remaining, 'You will have 1 Practice Pass left.');
  assert.ok(plan.effects.some((line) => /Excused is not 100%/.test(line)));
  assert.ok(plan.effects.some((line) => /Warm-Up, Classwork, and DOL still count/.test(line)));
  const pointsPlan = describePracticePassUse({ wallet: buildRewardWallet({ account: { balance: 150 }, nowMs: NOW }), assignmentTitle: 'Unit 4' });
  assert.equal(pointsPlan.cost, 'Uses 100 Class Points.');
  assert.equal(pointsPlan.remaining, 'You will have 50 Class Points left.');
});

test('every failure says nothing was used; a lost connection says a retry is safe', () => {
  assert.match(practicePassErrorMessage({ code: 'functions/failed-precondition', message: 'That pass has expired.' }), /That pass has expired\. Nothing was used\./);
  assert.match(practicePassErrorMessage({ code: 'functions/unavailable' }), /never use two passes/);
  assert.match(practicePassErrorMessage(new Error('Failed to fetch')), /never use two passes/);
  assert.match(practicePassErrorMessage({ code: 'functions/permission-denied' }), /Nothing was used/);
  // A retry after a lost response must not claim nothing was used: the first
  // attempt may have spent the pass. It says the outcome, and points at the count.
  assert.equal(practicePassSuccessMessage({ assignmentTitle: 'U', alreadyExcused: true }), 'Practice is excused for U. Your pass count above is up to date.');
  assert.equal(practicePassSuccessMessage({ assignmentTitle: 'U', passesLeft: 0 }), 'Done! Practice is excused for U. You have 0 Practice Passes left.');
});

test('history keeps every reward and what happened to it, newest first', () => {
  const earned = grant({ awardedAt: NOW - 5 * DAY });
  const used = use(grant({ awardedAt: NOW - 4 * DAY }), 'red-1', 'Unit 3');
  const revoked = takeBack(grant({ awardedAt: NOW - 3 * DAY }));
  const expired = grant({ awardedAt: NOW - 10 * DAY, expiresAt: NOW - 2 * DAY });
  const entries = buildRewardHistory({ grants: [earned, used, revoked, expired], nowMs: NOW });
  const kinds = entries.map((entry) => entry.kind);
  assert.equal(kinds.filter((kind) => kind === HISTORY_KIND.EARNED).length, 4, 'every award stays in history');
  assert.ok(entries.some((entry) => entry.kind === HISTORY_KIND.USED && /Used on Unit 3/.test(entry.detail)));
  assert.ok(entries.some((entry) => entry.kind === HISTORY_KIND.TAKEN_BACK && /Wrong student/.test(entry.detail)));
  assert.ok(entries.some((entry) => entry.kind === HISTORY_KIND.EXPIRED));
  const times = entries.map((entry) => Date.parse(entry.at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test('an undone use reads as undone, on the pass and on a points purchase', () => {
  const spent = use(grant(), 'red-9', 'Unit 5');
  const passHistory = buildRewardHistory({
    grants: [spent],
    redemptions: [{ redemptionId: 'red-9', status: 'reversed', grantId: spent.grantId, paidWith: 'pass', redeemedAt: spent.redeemedAt }],
    nowMs: NOW,
  });
  assert.ok(passHistory.some((entry) => entry.kind === HISTORY_KIND.UNDONE && /gave the pass back/.test(entry.detail)));

  const pointsHistory = buildRewardHistory({
    redemptions: [{
      redemptionId: 'red-10', assignmentTitle: 'Unit 6', paidWith: 'classPoints', status: 'redeemed', redeemedAt: '2026-09-30T10:00:00Z',
      previousRedemptions: [{ paidWith: 'classPoints', redeemedAt: '2026-09-20T10:00:00Z', reversedAt: '2026-09-21T10:00:00Z' }],
    }],
    nowMs: NOW,
  });
  assert.deepEqual(pointsHistory.map((entry) => entry.kind), [HISTORY_KIND.USED, HISTORY_KIND.UNDONE]);
});

test('a reward is celebrated once: not on first load, yes when it arrives', () => {
  const old = grant({ awardedAt: NOW - 30 * DAY });
  const recent = grant({ awardedAt: NOW - 60_000 });
  // First snapshot: only a recent, never-announced reward.
  assert.deepEqual(newlyEarnedGrants({ previousIds: null, grants: [old, recent], nowMs: NOW }).map((g) => g.grantId), [recent.grantId]);
  // Already announced (another tab, a refresh): silent.
  assert.deepEqual(newlyEarnedGrants({ previousIds: null, grants: [old, recent], seenIds: new Set([recent.grantId]), nowMs: NOW }), []);
  // A later snapshot with a brand-new reward.
  const arrived = grant({ awardedAt: NOW });
  const fresh = newlyEarnedGrants({ previousIds: new Set([old.grantId, recent.grantId]), grants: [old, recent, arrived], seenIds: new Set([recent.grantId]), nowMs: NOW });
  assert.deepEqual(fresh.map((g) => g.grantId), [arrived.grantId]);
  assert.match(celebrationMessage(arrived), /You earned a Practice Pass in a Live Challenge!/);
  assert.equal(celebrationMessage({ rewardCode: 'badge', label: 'Great explainer', source: { type: 'teacher' } }), '🏅 New badge: Great explainer — from your teacher!');
  assert.equal(celebrationMessage({ rewardCode: 'badge', label: 'Live Challenge Champion', source: { type: 'liveChallenge' } }), '🏅 New badge: Live Challenge Champion — earned in a Live Challenge!');
});

test('a Live Challenge result shows only what that match put in the wallet', () => {
  const fromRoom = grant({ source: { type: 'liveChallenge', id: 'room-7', ruleId: 'r' } });
  const otherRoom = grant({ source: { type: 'liveChallenge', id: 'room-8', ruleId: 'r' } });
  const earned = rewardsFromChallenge({
    roomId: 'room-7',
    grants: [fromRoom, otherRoom, grant({ source: { type: 'teacher', id: 't' } })],
    transactions: [
      { roomId: 'room-7', amount: 2, reasonLabel: 'Live Challenge — Finisher' },
      { roomId: 'room-7', amount: 3, reasonLabel: 'Live Challenge — Strong Accuracy' },
      { roomId: 'room-8', amount: 2 },
    ],
  });
  assert.deepEqual(earned.items.map((g) => g.grantId), [fromRoom.grantId], 'a previous match never leaks into this one');
  assert.equal(earned.points, 5);
  assert.deepEqual(earned.pointReasons, ['Finisher', 'Strong Accuracy']);
});

test('sources are in student words', () => {
  assert.equal(describeGrantSource({ source: { type: 'liveChallenge' } }), 'Earned in a Live Challenge');
  assert.equal(describeGrantSource({ source: { type: 'teacher' } }), 'From your teacher');
  assert.equal(describeGrantSource({ source: { type: 'restored' } }), 'Given back by your teacher');
});
