// Class rewards against a real Firestore. Run through `npm run test:challenge-finish`.
//
// The rules (what may be listed, what may be spent, how a request resolves)
// are unit tested in tests/platform/classRewardCatalog.test.mjs. This suite
// holds the promises the transactions in functions/lib/classRewardStore.js
// make:
//
//   * one requestId spends once — across a double click (concurrent) and a
//     retry after a lost answer (sequential)
//   * a refusal spends nothing: short balance, weekly limit, inactive item,
//     another class's item, a price that changed
//   * a decline refunds exactly once; a fulfilment never refunds
//   * the account balance always equals the sum of the ledger
//   * only the class's teacher of record (or the root administrator) saves a
//     catalog or resolves a request; a student cannot resolve their own

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-finish-harness' });
const db = admin.firestore();
const store = require(path.join(repo, 'functions/lib/classRewardStore.js'));
const { accountId } = await import(path.join(repo, 'functions/shared/classPoints.mjs'));

const TEACHER = 'cr-teacher@example.com';
const OTHER_TEACHER = 'cr-other-teacher@example.com';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const CLASS_ID = 'cr-class';
const OTHER_CLASS = 'cr-other-class';
// A Wednesday afternoon in Texas.
const NOW = Date.parse('2026-10-07T20:00:00.000Z');

let counter = 0;
const uniqueId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

const teacherRequest = (data, email = TEACHER) => ({ auth: { uid: `uid-${email}`, token: { role: 'teacher', email, email_verified: true } }, data });
const studentRequest = (studentId, data) => ({ auth: { uid: `uid-${studentId}`, token: { role: 'student', studentId } }, data });

const ITEMS = [
  { itemId: 'seat', label: 'Choose your seat for a day', description: 'Sit anywhere for one period.', cost: 50, active: true, weeklyLimitPerStudent: 1 },
  { itemId: 'music', label: 'Music with headphones during independent work', description: '', cost: 40, active: true, weeklyLimitPerStudent: 0 },
  { itemId: 'class-dj', label: 'Be the class DJ for the warm-up', description: '', cost: 60, active: false, weeklyLimitPerStudent: 1 },
];

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active' });
await db.collection('classes').doc(OTHER_CLASS).set({ teacherOfRecord: OTHER_TEACHER, status: 'active' });
await store.saveClassRewardCatalogHandler(teacherRequest({ classId: CLASS_ID, items: ITEMS }), { db, nowMs: NOW });
await store.saveClassRewardCatalogHandler(teacherRequest({
  classId: OTHER_CLASS,
  items: [{ itemId: 'lunch', label: 'Lunch with the teacher', description: '', cost: 10, active: true, weeklyLimitPerStudent: 0 }],
}, OTHER_TEACHER), { db, nowMs: NOW });

const seedStudent = async ({ balance = 200, classId = CLASS_ID } = {}) => {
  const studentId = uniqueId('cr-student');
  const teacher = classId === CLASS_ID ? TEACHER : OTHER_TEACHER;
  await db.collection('grades').doc(studentId).set({ classId, assignedTeacherEmail: teacher, firstName: 'Ava', lastName: 'Martinez' });
  if (balance) {
    await db.collection('classPointAccounts').doc(accountId(studentId, classId)).set({
      schemaVersion: 1, studentId, classId, balance, lifetimeEarned: balance, lifetimeSpent: 0,
      originTeacherEmail: teacher, authorizedTeacherEmails: [teacher],
    });
  }
  return studentId;
};

const accountOf = async (studentId, classId = CLASS_ID) => (await db.collection('classPointAccounts').doc(accountId(studentId, classId)).get()).data() || { balance: 0 };
const ledgerOf = async (studentId) => (await db.collection('classPointTransactions').where('studentId', '==', studentId).get()).docs.map((entry) => entry.data());
const requestsOf = async (studentId) => (await db.collection('classRewardRequests').where('studentId', '==', studentId).get()).docs.map((entry) => entry.data());
const redeem = (studentId, data, nowMs = NOW) => store.redeemClassRewardHandler(studentRequest(studentId, data), { db, nowMs });
const resolve = (data, email = TEACHER) => store.resolveClassRewardRequestHandler(teacherRequest(data, email), { db, nowMs: NOW + 60_000 });

/** The projection is exactly the opening balance plus every ledger entry. */
const assertBalanceMatchesLedger = async (studentId, opening) => {
  const sum = (await ledgerOf(studentId)).reduce((total, entry) => total + entry.amount, 0);
  assert.equal((await accountOf(studentId)).balance, opening + sum);
};

test('a double click and a retry after a lost answer spend once and make one request', async () => {
  const studentId = await seedStudent({ balance: 200 });
  const payload = { itemId: 'seat', requestId: 'click-1', expectedCost: 50 };
  const [first, second] = await Promise.all([redeem(studentId, payload), redeem(studentId, payload)]);
  const retry = await redeem(studentId, payload);
  const outcomes = [first.outcome, second.outcome, retry.outcome].sort();
  assert.deepEqual(outcomes, ['alreadyRequested', 'alreadyRequested', 'requested']);
  assert.equal(first.requestDocId, retry.requestDocId);
  assert.equal((await accountOf(studentId)).balance, 150);
  assert.equal((await ledgerOf(studentId)).length, 1);
  const requests = await requestsOf(studentId);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].status, 'pending');
  assert.equal(requests[0].itemLabel, 'Choose your seat for a day');
  assert.equal(requests[0].cost, 50);
  assert.equal(requests[0].studentLabel, 'Ava M.');
  assert.deepEqual(requests[0].authorizedTeacherEmails, [TEACHER]);
  const [debit] = await ledgerOf(studentId);
  assert.equal(debit.sourceType, 'rewardRedemption');
  assert.equal(debit.amount, -50);
  assert.equal((await accountOf(studentId)).lifetimeSpent, 50);
  await assertBalanceMatchesLedger(studentId, 200);
});

test('a requestId reused for a different reward is refused and spends nothing', async () => {
  const studentId = await seedStudent({ balance: 200 });
  await redeem(studentId, { itemId: 'seat', requestId: 'reuse' });
  await assert.rejects(redeem(studentId, { itemId: 'music', requestId: 'reuse' }), (error) => error.code === 'already-exists' && /Nothing was spent/.test(error.message));
  assert.equal((await accountOf(studentId)).balance, 150);
});

test('refused without spending: short balance, weekly limit, inactive item, another class\'s item, changed price', async () => {
  const poor = await seedStudent({ balance: 30 });
  await assert.rejects(redeem(poor, { itemId: 'seat', requestId: 'r1' }), (error) => error.code === 'failed-precondition' && /20 more Class Points[\s\S]*Nothing was spent/.test(error.message));
  const broke = await seedStudent({ balance: 0 });
  await assert.rejects(redeem(broke, { itemId: 'music', requestId: 'r1' }), /40 more Class Points/);
  assert.equal((await accountOf(poor)).balance, 30);
  assert.equal((await requestsOf(poor)).length, 0);

  const studentId = await seedStudent({ balance: 500 });
  await redeem(studentId, { itemId: 'seat', requestId: 'week-1' });
  await assert.rejects(redeem(studentId, { itemId: 'seat', requestId: 'week-2' }), /already used this one this week/);
  // Two tabs racing for the second use of a once-a-week item: one wins.
  const racer = await seedStudent({ balance: 500 });
  const race = await Promise.allSettled([redeem(racer, { itemId: 'seat', requestId: 'tab-a' }), redeem(racer, { itemId: 'seat', requestId: 'tab-b' })]);
  assert.equal(race.filter((entry) => entry.status === 'fulfilled').length, 1, 'exactly one tab spends');
  assert.equal((await accountOf(racer)).balance, 450);
  // Next Monday it is available again.
  const nextWeek = Date.parse('2026-10-12T14:00:00.000Z');
  assert.equal((await redeem(studentId, { itemId: 'seat', requestId: 'week-3' }, nextWeek)).outcome, 'requested');

  await assert.rejects(redeem(studentId, { itemId: 'class-dj', requestId: 'off' }), /turned that reward off/);
  await assert.rejects(redeem(studentId, { itemId: 'lunch', requestId: 'other-class' }), (error) => error.code === 'not-found' && /isn't on your class's list/.test(error.message));
  await assert.rejects(redeem(studentId, { itemId: 'music', requestId: 'price', expectedCost: 35 }), /price changed to 40/);
  // Only the two seat requests were ever paid for.
  assert.equal((await accountOf(studentId)).balance, 400);
  assert.equal((await requestsOf(studentId)).length, 2);
  await assertBalanceMatchesLedger(studentId, 500);
});

test('a student spends only as themselves, from their own class of record', async () => {
  const studentId = await seedStudent({ balance: 200 });
  const other = await seedStudent({ balance: 200 });
  await assert.rejects(store.redeemClassRewardHandler(studentRequest(studentId, { itemId: 'seat', requestId: 'x', studentId: other }), { db, nowMs: NOW }), (error) => error.code === 'permission-denied');
  await assert.rejects(store.redeemClassRewardHandler(teacherRequest({ itemId: 'seat', requestId: 'x' }), { db, nowMs: NOW }), (error) => error.code === 'permission-denied');
  await assert.rejects(store.redeemClassRewardHandler({ data: { itemId: 'seat', requestId: 'x' } }, { db, nowMs: NOW }), (error) => error.code === 'unauthenticated');
  assert.equal((await accountOf(other)).balance, 200);
  assert.equal((await accountOf(studentId)).balance, 200);
  // An archived class spends nothing.
  await db.collection('classes').doc(CLASS_ID).update({ status: 'archived' });
  try {
    await assert.rejects(redeem(studentId, { itemId: 'seat', requestId: 'archived' }), /archived/);
  } finally {
    await db.collection('classes').doc(CLASS_ID).update({ status: 'active' });
  }
  assert.equal((await accountOf(studentId)).balance, 200);
});

test('a decline refunds exactly once, with the reason the student sees; a fulfilment never refunds', async () => {
  const studentId = await seedStudent({ balance: 200 });
  const declined = await redeem(studentId, { itemId: 'music', requestId: 'd1' });
  const fulfilled = await redeem(studentId, { itemId: 'seat', requestId: 'f1' });
  assert.equal((await accountOf(studentId)).balance, 110);

  const decline = { requestDocId: declined.requestDocId, resolution: 'declined', reason: 'Headphones are away during testing week' };
  const results = await Promise.all([resolve(decline), resolve(decline)]);
  assert.deepEqual(results.map((entry) => entry.outcome).sort(), ['alreadyApplied', 'declined']);
  assert.equal((await resolve(decline)).outcome, 'alreadyApplied');
  assert.equal((await accountOf(studentId)).balance, 150, 'refunded 40 once');
  const refunds = (await ledgerOf(studentId)).filter((entry) => entry.sourceType === 'rewardRefund');
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].amount, 40);
  const stored = (await db.collection('classRewardRequests').doc(declined.requestDocId).get()).data();
  assert.equal(stored.status, 'declined');
  assert.equal(stored.declineReason, 'Headphones are away during testing week');
  assert.equal(stored.refundTransactionId, store.refundIdFor(declined.requestDocId));

  assert.equal((await resolve({ requestDocId: fulfilled.requestDocId, resolution: 'fulfilled' })).outcome, 'fulfilled');
  assert.equal((await resolve({ requestDocId: fulfilled.requestDocId, resolution: 'fulfilled' })).outcome, 'alreadyApplied');
  // Fulfilled is final: it cannot be turned into a refund afterwards.
  await assert.rejects(resolve({ requestDocId: fulfilled.requestDocId, resolution: 'declined', reason: 'changed my mind' }), /already marked fulfilled/);
  await assert.rejects(resolve({ requestDocId: declined.requestDocId, resolution: 'fulfilled' }), /already declined/);
  assert.equal((await accountOf(studentId)).balance, 150);
  assert.equal((await accountOf(studentId)).lifetimeSpent, 50, 'a refund cancels the spend, it is not new earnings');
  assert.equal((await accountOf(studentId)).lifetimeEarned, 200);
  await assertBalanceMatchesLedger(studentId, 200);

  // The fulfilled seat still counts toward its once-a-week limit (a declined
  // one would not: see the next test).
  const again = await redeem(studentId, { itemId: 'seat', requestId: 'after-decline' }).catch((error) => error);
  assert.match(String(again.message), /already used this one this week/, 'the fulfilled seat still counts');
});

test('a declined once-a-week reward can be requested again the same week', async () => {
  const studentId = await seedStudent({ balance: 200 });
  const first = await redeem(studentId, { itemId: 'seat', requestId: 's1' });
  await resolve({ requestDocId: first.requestDocId, resolution: 'declined', reason: 'Seats are fixed for the lab today' });
  assert.equal((await redeem(studentId, { itemId: 'seat', requestId: 's2' })).outcome, 'requested');
});

test('only the class\'s teacher of record or the root administrator resolves; a student cannot', async () => {
  const studentId = await seedStudent({ balance: 200 });
  const made = await redeem(studentId, { itemId: 'seat', requestId: 'auth' });
  const decline = { requestDocId: made.requestDocId, resolution: 'declined', reason: 'no' };
  await assert.rejects(store.resolveClassRewardRequestHandler(studentRequest(studentId, decline), { db, nowMs: NOW }), (error) => error.code === 'permission-denied');
  await assert.rejects(resolve(decline, OTHER_TEACHER), (error) => error.code === 'permission-denied');
  await assert.rejects(store.resolveClassRewardRequestHandler({ auth: { uid: 'u', token: { role: 'teacher', email: TEACHER, email_verified: false } }, data: decline }, { db, nowMs: NOW }), (error) => error.code === 'permission-denied');
  await assert.rejects(resolve({ requestDocId: made.requestDocId, resolution: 'declined' }), (error) => error.code === 'invalid-argument' && /reason/.test(error.message));
  assert.equal((await accountOf(studentId)).balance, 150, 'nothing refunded by a refused call');
  assert.equal((await resolve({ requestDocId: made.requestDocId, resolution: 'fulfilled' }, ROOT_ADMIN)).outcome, 'fulfilled');
});

test('a student who moved classes is still refunded to the class they paid from', async () => {
  const studentId = await seedStudent({ balance: 100 });
  const made = await redeem(studentId, { itemId: 'seat', requestId: 'moved' });
  await db.collection('grades').doc(studentId).update({ classId: OTHER_CLASS, assignedTeacherEmail: OTHER_TEACHER });
  await resolve({ requestDocId: made.requestDocId, resolution: 'declined', reason: 'You moved to another class' });
  assert.equal((await accountOf(studentId, CLASS_ID)).balance, 100);
  assert.equal((await accountOf(studentId, OTHER_CLASS)).balance, 0);
});

test('the catalog: only the teacher of record or the root administrator saves it; academic effects and stale tabs are refused', async () => {
  const saved = (await db.collection('classRewardCatalogs').doc(CLASS_ID).get()).data();
  assert.equal(saved.items.length, 3);
  await assert.rejects(store.saveClassRewardCatalogHandler(teacherRequest({ classId: CLASS_ID, items: [] }, OTHER_TEACHER), { db, nowMs: NOW }), (error) => error.code === 'permission-denied');
  await assert.rejects(store.saveClassRewardCatalogHandler(studentRequest('s', { classId: CLASS_ID, items: [] }), { db, nowMs: NOW }), (error) => error.code === 'permission-denied');
  await assert.rejects(store.saveClassRewardCatalogHandler(teacherRequest({
    classId: CLASS_ID, items: [{ itemId: 'homework-night', label: 'Homework-free night', cost: 100 }],
  }), { db, nowMs: NOW }), (error) => error.code === 'invalid-argument' && /can't change grades/.test(error.message));
  await assert.rejects(store.saveClassRewardCatalogHandler(teacherRequest({
    classId: CLASS_ID, items: [{ ...ITEMS[0], gradeEffect: '+5' }],
  }), { db, nowMs: NOW }), (error) => error.code === 'invalid-argument');
  // Two tabs: the second save, based on a revision that has moved on, is refused.
  const base = saved.revision;
  await store.saveClassRewardCatalogHandler(teacherRequest({ classId: CLASS_ID, items: ITEMS, baseRevision: base }), { db, nowMs: NOW });
  await assert.rejects(store.saveClassRewardCatalogHandler(teacherRequest({ classId: CLASS_ID, items: ITEMS.slice(0, 1), baseRevision: base }), { db, nowMs: NOW }), /changed somewhere else/);
  const after = (await db.collection('classRewardCatalogs').doc(CLASS_ID).get()).data();
  assert.equal(after.revision, base + 1);
  assert.equal(after.items.length, 3);
  assert.ok(!JSON.stringify(after).includes('gradeEffect'));
  // The root administrator may save any class's catalog.
  const adminSave = await store.saveClassRewardCatalogHandler(teacherRequest({ classId: OTHER_CLASS, items: [] }, ROOT_ADMIN), { db, nowMs: NOW });
  assert.equal(adminSave.outcome, 'saved');
});
