// Class reward requests across the student lifecycle, against a real
// Firestore. Run through `npm run test:challenge-finish`.
//
//   * a pending request whose student was permanently deleted is cancelled
//     when a teacher acts on it: no refund, no fulfilment, and no wallet or
//     ledger row is re-created for the erased student
//   * a class handed from teacher A to teacher B: B's pending panel lists the
//     request and B can decline it with a refund; A can no longer resolve it
//   * an archived class's teacher of record can still decline (and refund) a
//     pending request, but cannot fulfil one

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
const { accountId, reauthorizeClassPointsRecord } = await import(path.join(repo, 'functions/shared/classPoints.mjs'));

const NOW = Date.parse('2026-10-07T20:00:00.000Z');
let counter = 0;
const uniqueId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

const teacherRequest = (data, email) => ({ auth: { uid: `uid-${email}`, token: { role: 'teacher', email, email_verified: true } }, data });
const studentRequest = (studentId, data) => ({ auth: { uid: `uid-${studentId}`, token: { role: 'student', studentId } }, data });
const redeem = (studentId, data) => store.redeemClassRewardHandler(studentRequest(studentId, data), { db, nowMs: NOW });
const resolve = (data, email) => store.resolveClassRewardRequestHandler(teacherRequest(data, email), { db, nowMs: NOW + 60_000 });

const ITEMS = [
  { itemId: 'seat', label: 'Choose your seat for a day', description: '', cost: 50, active: true, weeklyLimitPerStudent: 0 },
];

const seedClass = async (teacher) => {
  const classId = uniqueId('crl-class');
  await db.collection('classes').doc(classId).set({ teacherOfRecord: teacher, status: 'active' });
  await store.saveClassRewardCatalogHandler(teacherRequest({ classId, items: ITEMS }, teacher), { db, nowMs: NOW });
  return classId;
};

const seedStudent = async ({ classId, teacher, balance = 100 }) => {
  const studentId = uniqueId('crl-student');
  await db.collection('grades').doc(studentId).set({ classId, assignedTeacherEmail: teacher, firstName: 'Ava', lastName: 'Martinez' });
  await db.collection('classPointAccounts').doc(accountId(studentId, classId)).set({
    schemaVersion: 1, studentId, classId, balance, lifetimeEarned: balance, lifetimeSpent: 0,
    originTeacherEmail: teacher, authorizedTeacherEmails: [teacher],
  });
  return studentId;
};

const accountRef = (studentId, classId) => db.collection('classPointAccounts').doc(accountId(studentId, classId));
const ledgerOf = async (studentId) => (await db.collection('classPointTransactions').where('studentId', '==', studentId).get()).docs;
const requestOf = async (requestDocId) => (await db.collection('classRewardRequests').doc(requestDocId).get()).data();
// The teacher's pending panel query (src/platform/rewards/classRewardsClient.js).
const pendingPanel = async (teacher, classId) => (await db.collection('classRewardRequests')
  .where('authorizedTeacherEmails', 'array-contains', teacher)
  .where('classId', '==', classId)
  .where('status', '==', 'pending')
  .get()).docs;

test('declining a deleted student\'s pending request cancels it and re-creates nothing', async () => {
  const teacher = 'crl-a@example.com';
  const classId = await seedClass(teacher);
  const studentId = await seedStudent({ classId, teacher });
  const made = await redeem(studentId, { itemId: 'seat', requestId: 'erase-1', expectedCost: 50 });
  assert.equal(made.outcome, 'requested');

  // Permanent deletion, as it ran before classRewardRequests joined the
  // erasure list: the student, wallet and ledger are gone; the request is not.
  await db.collection('grades').doc(studentId).delete();
  await accountRef(studentId, classId).delete();
  await Promise.all((await ledgerOf(studentId)).map((entry) => entry.ref.delete()));

  const result = await resolve({ requestDocId: made.requestDocId, resolution: 'declined', reason: 'Not this week' }, teacher);
  assert.equal(result.outcome, 'cancelled');
  assert.equal((await accountRef(studentId, classId).get()).exists, false, 'no wallet re-created for an erased student');
  assert.equal((await ledgerOf(studentId)).length, 0, 'no refund row for an erased student');
  assert.equal((await db.collection('classPointTransactions').doc(store.refundIdFor(made.requestDocId)).get()).exists, false);
  const stored = await requestOf(made.requestDocId);
  assert.equal(stored.status, 'cancelled');
  assert.equal(stored.studentLabel, null);
  assert.equal((await pendingPanel(teacher, classId)).length, 0, 'it leaves the pending panel');

  // Neither a second decline nor a fulfilment can act on it afterwards.
  await assert.rejects(resolve({ requestDocId: made.requestDocId, resolution: 'declined', reason: 'again' }, teacher), (error) => error.code === 'failed-precondition');
  await assert.rejects(resolve({ requestDocId: made.requestDocId, resolution: 'fulfilled' }, teacher), (error) => error.code === 'failed-precondition');
  assert.equal((await accountRef(studentId, classId).get()).exists, false);
});

test('fulfilling a deleted student\'s pending request cancels it too', async () => {
  const teacher = 'crl-a2@example.com';
  const classId = await seedClass(teacher);
  const studentId = await seedStudent({ classId, teacher });
  const made = await redeem(studentId, { itemId: 'seat', requestId: 'erase-2' });
  await db.collection('grades').doc(studentId).delete();
  const result = await resolve({ requestDocId: made.requestDocId, resolution: 'fulfilled' }, teacher);
  assert.equal(result.outcome, 'cancelled');
  assert.equal((await requestOf(made.requestDocId)).status, 'cancelled');
});

test('a class handed from A to B: B sees the request and declines it with a refund; A cannot resolve it', async () => {
  const teacherA = 'crl-teacher-a@example.com';
  const teacherB = 'crl-teacher-b@example.com';
  const classId = await seedClass(teacherA);
  const studentId = await seedStudent({ classId, teacher: teacherA });
  const made = await redeem(studentId, { itemId: 'seat', requestId: 'handover' });
  assert.equal((await accountRef(studentId, classId).get()).data().balance, 50);
  assert.equal((await pendingPanel(teacherB, classId)).length, 0);

  // The admin hands the class to B; functions/index.js then runs
  // reauthorizeStudentRecords for every member, which re-points the wallet
  // with reauthorizeClassPointsRecord and the requests with this helper.
  await db.collection('classes').doc(classId).update({ teacherOfRecord: teacherB });
  const classRecord = { classId, ...(await db.collection('classes').doc(classId).get()).data() };
  const walletChange = reauthorizeClassPointsRecord((await accountRef(studentId, classId).get()).data(), { classRecord });
  await accountRef(studentId, classId).set(walletChange, { merge: true });
  assert.equal(await store.reauthorizeClassRewardRequests(db, studentId, classRecord), 1);
  assert.equal(await store.reauthorizeClassRewardRequests(db, studentId, classRecord), 0, 'idempotent');

  const panel = await pendingPanel(teacherB, classId);
  assert.equal(panel.length, 1, 'B\'s pending panel lists the request');
  assert.equal(panel[0].id, made.requestDocId);
  assert.equal((await requestOf(made.requestDocId)).originTeacherEmail, teacherA, 'the origin never moves');

  await assert.rejects(
    resolve({ requestDocId: made.requestDocId, resolution: 'declined', reason: 'A tries' }, teacherA),
    (error) => error.code === 'permission-denied',
  );
  const declined = await resolve({ requestDocId: made.requestDocId, resolution: 'declined', reason: 'New teacher, new seats' }, teacherB);
  assert.equal(declined.outcome, 'declined');
  const wallet = (await accountRef(studentId, classId).get()).data();
  assert.equal(wallet.balance, 100, 'refunded');
  assert.ok(wallet.authorizedTeacherEmails.includes(teacherB));
});

test('a handover never re-points a request paid in a different class', async () => {
  const teacherA = 'crl-teacher-c@example.com';
  const classId = await seedClass(teacherA);
  const otherClassId = await seedClass('crl-teacher-d@example.com');
  const studentId = await seedStudent({ classId, teacher: teacherA });
  const made = await redeem(studentId, { itemId: 'seat', requestId: 'other-class' });
  const otherRecord = { classId: otherClassId, ...(await db.collection('classes').doc(otherClassId).get()).data() };
  assert.equal(await store.reauthorizeClassRewardRequests(db, studentId, otherRecord), 0);
  assert.deepEqual((await requestOf(made.requestDocId)).authorizedTeacherEmails, [teacherA]);
});

test('an archived class\'s teacher can still decline with a refund, but not fulfil', async () => {
  const teacher = 'crl-archived@example.com';
  const classId = await seedClass(teacher);
  const studentId = await seedStudent({ classId, teacher });
  const toFulfil = await redeem(studentId, { itemId: 'seat', requestId: 'arch-fulfil' });
  const toDecline = await redeem(studentId, { itemId: 'seat', requestId: 'arch-decline' });
  assert.equal((await accountRef(studentId, classId).get()).data().balance, 0);
  await db.collection('classes').doc(classId).update({ status: 'archived' });

  await assert.rejects(
    resolve({ requestDocId: toFulfil.requestDocId, resolution: 'fulfilled' }, teacher),
    (error) => error.code === 'failed-precondition' && /archived/.test(error.message),
  );
  await assert.rejects(
    resolve({ requestDocId: toDecline.requestDocId, resolution: 'declined', reason: 'x' }, 'crl-someone-else@example.com'),
    (error) => error.code === 'permission-denied',
  );
  const declined = await resolve({ requestDocId: toDecline.requestDocId, resolution: 'declined', reason: 'The class has ended' }, teacher);
  assert.equal(declined.outcome, 'declined');
  assert.equal((await accountRef(studentId, classId).get()).data().balance, 50);
  assert.equal((await requestOf(toFulfil.requestDocId)).status, 'pending');
});
