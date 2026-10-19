import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableStarters,
  buildClassRewardShelf,
  catalogPayload,
  classRewardErrorMessage,
  describeClassRewardRequest,
  draftChanged,
  draftItemProblem,
  draftProblem,
  emptyCatalogItem,
  sortPendingRequests,
  teacherRequestStudentName,
} from '../../src/platform/rewards/classRewardsModel.js';
import {
  BADGE_GROUP,
  badgeView,
  buildRewardWallet,
  celebrationMessage,
  grantDisplayName,
  groupBadges,
} from '../../src/platform/rewards/rewardWallet.js';
import { STARTER_CLASS_REWARDS, schoolWeekKey } from '../../functions/shared/classRewardCatalog.mjs';

// What the rewards screens say about class rewards and badges
// (src/platform/rewards/classRewardsModel.js, rewardWallet.js). The server's
// own decisions are tested in classRewardCatalog.test.mjs and against the
// emulator in tests/integration/classRewards.test.mjs.

const NOW = Date.parse('2026-10-07T20:00:00.000Z');
const WEEK = schoolWeekKey(NOW);
const catalog = {
  revision: 3,
  items: [
    { itemId: 'seat', label: 'Choose your seat for a day', description: 'Sit anywhere.', cost: 50, active: true, weeklyLimitPerStudent: 1 },
    { itemId: 'music', label: 'Music with headphones during independent work', description: '', cost: 40, active: true, weeklyLimitPerStudent: 0 },
    { itemId: 'class-dj', label: 'Be the class DJ for the warm-up', description: '', cost: 60, active: false, weeklyLimitPerStudent: 1 },
  ],
};

test('the shelf offers active items cheapest first, each with a price and a reason when it cannot be used', () => {
  const shelf = buildClassRewardShelf({ catalog, requests: [], balance: 45, nowMs: NOW });
  assert.deepEqual(shelf.items.map((entry) => entry.item.itemId), ['music', 'seat'], 'the turned-off DJ item is hidden');
  const [music, seat] = shelf.items;
  assert.equal(music.canUse, true);
  assert.equal(music.buttonLabel, 'Use 40 points');
  assert.equal(seat.canUse, false);
  assert.equal(seat.reason, 'You need 5 more Class Points.');
  assert.equal(seat.limitLabel, 'Once a week');
});

test('a weekly limit reached disables the item with a reason; a declined request frees it again', () => {
  const used = [{ requestDocId: 'r1', itemId: 'seat', weekKey: WEEK, status: 'pending', requestedAt: NOW - 1000, cost: 50, itemLabel: 'Choose your seat for a day' }];
  const shelf = buildClassRewardShelf({ catalog, requests: used, balance: 500, nowMs: NOW });
  const seat = shelf.items.find((entry) => entry.item.itemId === 'seat');
  assert.equal(seat.canUse, false);
  assert.match(seat.reason, /already used this one this week[\s\S]*Monday/);
  assert.equal(seat.usedThisWeek, 1);
  const declined = buildClassRewardShelf({ catalog, requests: [{ ...used[0], status: 'declined' }], balance: 500, nowMs: NOW });
  assert.equal(declined.items.find((entry) => entry.item.itemId === 'seat').canUse, true);
});

test('an unknown balance never offers a spend', () => {
  const shelf = buildClassRewardShelf({ catalog, balance: 0, balanceKnown: false, nowMs: NOW });
  assert.ok(shelf.items.every((entry) => !entry.canUse && /could not load/.test(entry.reason)));
});

test('requests split into waiting (newest first) and finished; nothing at all hides the shelf', () => {
  const requests = [
    { requestDocId: 'a', status: 'pending', requestedAt: NOW - 3000 },
    { requestDocId: 'b', status: 'pending', requestedAt: NOW - 1000 },
    { requestDocId: 'c', status: 'fulfilled', requestedAt: NOW - 9000, resolvedAt: NOW - 500 },
  ];
  const shelf = buildClassRewardShelf({ catalog: null, requests, balance: 0, nowMs: NOW });
  assert.deepEqual(shelf.pending.map((entry) => entry.requestDocId), ['b', 'a']);
  assert.deepEqual(shelf.finished.map((entry) => entry.requestDocId), ['c']);
  assert.equal(shelf.hasAnything, true, 'a student still sees their requests after the teacher empties the list');
  assert.equal(buildClassRewardShelf({ catalog: null, requests: [], nowMs: NOW }).hasAnything, false);
});

test('each request status reads in words, and a decline says the teacher\'s reason and that the points came back', () => {
  assert.equal(describeClassRewardRequest({ status: 'pending', itemLabel: 'Seat', cost: 50 }).status, 'Waiting for your teacher');
  assert.equal(describeClassRewardRequest({ status: 'fulfilled', itemLabel: 'Seat', cost: 50 }).status, 'Done');
  const declined = describeClassRewardRequest({ status: 'declined', itemLabel: 'Seat', cost: 50, declineReason: 'Lab day' });
  assert.equal(declined.status, 'Declined — points returned');
  assert.match(declined.detail, /“Lab day”[\s\S]*50 points were given back/);
});

test('a failed use always says nothing was spent; a transport failure says retrying is safe', () => {
  assert.match(classRewardErrorMessage({ code: 'functions/unavailable', message: 'x' }), /never spend your points twice/);
  assert.match(classRewardErrorMessage({ code: 'functions/failed-precondition', message: 'You need 5 more Class Points. Nothing was spent.' }), /^You need 5 more Class Points\. Nothing was spent\.$/);
  assert.match(classRewardErrorMessage({ code: 'functions/not-found', message: 'Gone.' }), /Gone\. Nothing was spent\./);
  assert.match(classRewardErrorMessage({ code: 'functions/permission-denied' }), /Sign in again[\s\S]*Nothing was spent/);
});

test('teacher draft: a new item is valid once named; starters already added are not offered twice; payload is clean numbers', () => {
  const item = emptyCatalogItem([]);
  assert.match(item.itemId, /^item-[a-z0-9]+$/);
  assert.equal(draftItemProblem(item).field, 'label');
  assert.equal(draftItemProblem({ ...item, label: 'Lunch with the teacher' }), null);
  assert.equal(draftItemProblem({ ...item, label: 'Homework pass' }).field, 'label');
  assert.equal(draftItemProblem({ ...item, label: 'Seat', cost: '' }).field, 'cost');
  assert.equal(availableStarters([STARTER_CLASS_REWARDS[0]]).length, STARTER_CLASS_REWARDS.length - 1);
  assert.equal(availableStarters([{ itemId: 'mine', label: 'choose your seat for a day' }]).some((entry) => entry.itemId === 'starter-seat'), false);
  const payload = catalogPayload([{ ...item, label: '  Seat  ', cost: '45', weeklyLimitPerStudent: '2', extra: 'dropped' }]);
  assert.deepEqual(payload[0], { itemId: item.itemId, label: 'Seat', description: '', cost: 45, active: true, weeklyLimitPerStudent: 2 });
  assert.equal(draftChanged(catalog, catalog.items), false);
  assert.equal(draftChanged(catalog, [...catalog.items.slice(0, 2)]), true);
  assert.match(draftProblem('c', [...catalog.items, { ...catalog.items[0], itemId: 'seat-2' }]), /two rewards called/);
});

test('teacher pending list: oldest first; a full name when the roster has one, else the stored label', () => {
  const sorted = sortPendingRequests([
    { requestDocId: 'new', status: 'pending', requestedAt: NOW },
    { requestDocId: 'done', status: 'fulfilled', requestedAt: NOW - 9 },
    { requestDocId: 'old', status: 'pending', requestedAt: NOW - 5000 },
  ]);
  assert.deepEqual(sorted.map((entry) => entry.requestDocId), ['old', 'new']);
  assert.equal(teacherRequestStudentName({ studentId: 's1', studentLabel: 'Ava M.' }, { s1: 'Ava Martinez' }), 'Ava Martinez');
  assert.equal(teacherRequestStudentName({ studentId: 's1', studentLabel: 'Ava M.' }, {}), 'Ava M.');
});

test('badges read by name, grouped by what they recognize; an unknown code keeps its own label', () => {
  const badge = (badgeCode, sourceType, label = null) => ({ grantId: badgeCode || label, rewardCode: 'badge', badgeCode, label, status: 'available', source: { type: sourceType }, awardedAt: NOW });
  const cases = [
    ['growth-retest', 'growth', 'Comeback on the retest', BADGE_GROUP.GROWTH],
    ['growth-corrections', 'growth', 'Fixed my mistakes', BADGE_GROUP.GROWTH],
    ['growth-path-streak', 'growth', 'Three weeks on track', BADGE_GROUP.GROWTH],
    ['mastery-5', 'growth', '5 skills mastered', BADGE_GROUP.MASTERY],
    ['mastery-10', 'growth', '10 skills mastered', BADGE_GROUP.MASTERY],
    ['lc-mostImproved', 'liveChallenge', 'Most improved', BADGE_GROUP.CHALLENGE],
    ['lc-steadiest', 'liveChallenge', 'Steadiest', BADGE_GROUP.CHALLENGE],
    ['lc-bestComeback', 'liveChallenge', 'Best comeback', BADGE_GROUP.CHALLENGE],
    ['lc-firstToAnswer', 'liveChallenge', 'First to answer', BADGE_GROUP.CHALLENGE],
  ];
  cases.forEach(([code, source, label, group]) => {
    const view = badgeView(badge(code, source));
    assert.equal(view.label, label, code);
    assert.equal(view.group, group, code);
    assert.ok(view.icon && view.icon !== '', code);
    assert.ok(view.description, code);
  });
  // A code nobody knows yet: the grant's own label, never the raw code or a blank.
  const future = badgeView(badge('lc-somethingNew', 'liveChallenge', 'Quickest thinker'));
  assert.equal(future.label, 'Quickest thinker');
  assert.equal(future.group, BADGE_GROUP.CHALLENGE);
  assert.equal(badgeView(badge('mystery', 'teacher', null)).label, 'Badge');
  // A teacher's badge keeps the teacher's words.
  assert.equal(grantDisplayName(badge('growth-retest', 'teacher', 'Great explainer')), 'Great explainer');

  const wallet = buildRewardWallet({ grants: cases.map(([code, source]) => badge(code, source)).concat(badge('kindness', 'teacher', 'Kind classmate')), nowMs: NOW });
  assert.deepEqual(wallet.badgeGroups.map((group) => group.group), [BADGE_GROUP.GROWTH, BADGE_GROUP.MASTERY, BADGE_GROUP.CHALLENGE, BADGE_GROUP.TEACHER]);
  assert.equal(groupBadges([]).length, 0);
  assert.match(celebrationMessage(badge('growth-retest', 'growth')), /New badge: Comeback on the retest — earned for your growth!/);
});
