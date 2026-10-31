// Reward actions against a real Firestore. Run through `npm run test:challenge-finish`.
//
// The pure rules (what is eligible, what a transition does) are unit tested in
// tests/platform. This suite holds the transactions people actually trigger —
// a student using a Practice Pass, a teacher giving one, taking one back or
// undoing a use — and the promises the wallet makes about them:
//
//   * the benefit and its payment commit together, or neither does
//   * a double click, a refresh or a second tab never spends twice
//   * a failed use never consumes anything
//   * nothing is deleted: used, taken-back and undone rewards stay as history
//   * only the right teacher can act, and only on their own student

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
const store = await import(path.join(repo, 'functions/shared/rewardActionStore.mjs'));
const delivery = await import(path.join(repo, 'functions/shared/liveChallengeClassPoints.mjs'));
const { buildMatchResult } = await import(path.join(repo, 'functions/shared/liveChallengeResults.mjs'));
const { accountId } = await import(path.join(repo, 'functions/shared/classPoints.mjs'));
const { practicePassRedemptionId, isActivePracticePassRedemption } = await import(path.join(repo, 'functions/shared/classPointRewards.mjs'));
const { buildRewardGrant } = await import(path.join(repo, 'functions/shared/rewardGrants.mjs'));
const { persistExpiredGrants } = await import(path.join(repo, 'functions/shared/rewardGrantStore.mjs'));

const TEACHER = 'ra-teacher@example.com';
const OTHER_TEACHER = 'ra-other@example.com';
const CLASS_ID = 'ra-class';
const OTHER_CLASS = 'ra-other-class';
const NOW = Date.parse('2026-10-01T15:00:00.000Z');
const DAY = 86_400_000;
const teacher = { uid: 'uid-t', email: TEACHER };

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active' });
await db.collection('classes').doc(OTHER_CLASS).set({ teacherOfRecord: OTHER_TEACHER, status: 'active' });

let counter = 0;
const uniqueId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

/** A student in the class, with optional tracker data. */
const seedStudent = async ({ classId = CLASS_ID, gradesByAssignment = {} } = {}) => {
  const studentId = uniqueId('ra-student');
  await db.collection('grades').doc(studentId).set({
    classId,
    assignedTeacherEmail: classId === CLASS_ID ? TEACHER : OTHER_TEACHER,
    displayName: 'Test Student',
    gradesByAssignment,
  });
  return studentId;
};

/** An open, credit-eligible lesson with a Practice section at indices 2-3. */
const seedAssignment = async ({ classId = CLASS_ID, sections = [{ role: 'classwork' }, { role: 'practice' }], title = 'Unit 2 Lesson' } = {}) => {
  const assignmentId = uniqueId('ra-assignment');
  await db.collection('assignments').doc(assignmentId).set({
    title,
    classIds: [classId],
    sections,
    releaseAt: new Date(NOW - DAY).toISOString(),
    dueAt: new Date(NOW + 3 * DAY).toISOString(),
    practiceIndices: [2, 3],
  });
  return assignmentId;
};

// What functions/index.js computes from the real assignment runtime; the
// fixture stores the answers directly.
const assess = ({ assignment, classId }) => ({
  assignedToClass: (assignment.classIds || []).includes(classId),
  isTestCycleAssignment: false,
  practiceIndices: assignment.practiceIndices || [],
});

const givePass = (studentId, overrides = {}) => store.awardRewardGrant(db, {
  studentId, classId: CLASS_ID, rewardCode: 'practicePass', requestId: uniqueId('req'), teacher, nowMs: NOW, ...overrides,
});

const redeem = (studentId, assignmentId, extra = {}) => store.redeemPracticePass(db, {
  studentId, assignmentId, payWith: 'pass', assess, nowMs: NOW, actor: { uid: 'uid-s' }, ...extra,
});

const grantsOf = async (studentId) => (await db.collection('rewardGrants').where('studentId', '==', studentId).get())
  .docs.map((entry) => ({ id: entry.id, ...entry.data() }));
const redemptionOf = async (studentId, assignmentId) => {
  const snap = await db.collection('classPointRewardRedemptions')
    .doc(practicePassRedemptionId({ studentId, classId: CLASS_ID, assignmentId })).get();
  return snap.exists ? snap.data() : null;
};
const rejects = (promise, code, pattern) => assert.rejects(promise, (error) => {
  assert.equal(error.name, 'RewardActionError');
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
  return true;
});

test('a teacher gives a pass once per request; a retry is the same pass', async () => {
  const studentId = await seedStudent();
  const requestId = uniqueId('req');
  const [first, second] = await Promise.all([givePass(studentId, { requestId }), givePass(studentId, { requestId })]);
  assert.equal(first.grantId, second.grantId);
  assert.deepEqual([first.outcome, second.outcome].sort(), ['alreadyApplied', 'awarded']);
  const grants = await grantsOf(studentId);
  assert.equal(grants.length, 1, 'a double click gives one pass');
  assert.equal(grants[0].status, 'available');
  assert.equal(grants[0].source.type, 'teacher');
  assert.equal(grants[0].history[0].actorType, 'teacher');

  await rejects(givePass(studentId, { requestId, rewardCode: 'badge', label: 'Helper' }), 'failed-precondition', /different reward/);
});

test('an award is refused for the wrong teacher, the wrong class or a bad reward', async () => {
  const studentId = await seedStudent();
  await rejects(givePass(studentId, { teacher: { email: OTHER_TEACHER } }), 'permission-denied');
  await rejects(givePass(studentId, { classId: OTHER_CLASS, teacher: { email: OTHER_TEACHER } }), 'failed-precondition', /does not currently belong/);
  await rejects(givePass(studentId, { rewardCode: 'classPoints' }), 'invalid-argument');
  await rejects(givePass(studentId, { rewardCode: 'badge' }), 'invalid-argument', /Name the badge/);
  await rejects(givePass(studentId, { expiresInDays: 0 }), 'invalid-argument');
  assert.equal((await grantsOf(studentId)).length, 0, 'nothing was issued by a refused award');
});

test('using a pass excuses Practice and spends the pass in one commit', async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  const { grantId } = await givePass(studentId);

  const result = await redeem(studentId, assignmentId);
  assert.equal(result.outcome, 'redeemed');
  assert.equal(result.grantId, grantId);

  const redemption = await redemptionOf(studentId, assignmentId);
  assert.ok(isActivePracticePassRedemption(redemption), 'Practice is excused');
  assert.equal(redemption.paidWith, 'pass');
  assert.equal(redemption.grantId, grantId);
  assert.equal(redemption.cost, 0);

  const [grant] = await grantsOf(studentId);
  assert.equal(grant.status, 'redeemed');
  assert.equal(grant.redemption.targetId, assignmentId);
  assert.equal(grant.redemption.targetLabel, 'Unit 2 Lesson');
  assert.deepEqual(grant.history.map((entry) => entry.status), ['available', 'redeemed'], 'history kept, nothing deleted');
});

test('a double click, a refresh and a second tab on the same assignment spend one pass', async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  await givePass(studentId);
  await givePass(studentId);

  const outcomes = await Promise.all([1, 2, 3].map(() => redeem(studentId, assignmentId)));
  assert.equal(outcomes.filter((entry) => entry.outcome === 'redeemed').length, 1);
  assert.equal(outcomes.filter((entry) => entry.outcome === 'alreadyExcused').length, 2);
  const grants = await grantsOf(studentId);
  assert.deepEqual(grants.map((grant) => grant.status).sort(), ['available', 'redeemed'], 'the second pass is untouched');

  // A later attempt (a refresh after the response was lost) is the same answer.
  assert.equal((await redeem(studentId, assignmentId)).outcome, 'alreadyExcused');
});

test('one pass cannot cover two assignments, even from two tabs at once', async () => {
  const studentId = await seedStudent();
  const [first, second] = await Promise.all([seedAssignment(), seedAssignment()]);
  await givePass(studentId);

  const settled = await Promise.allSettled([redeem(studentId, first), redeem(studentId, second)]);
  const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
  const refused = settled.filter((entry) => entry.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(refused.length, 1);
  assert.match(refused[0].reason.message, /do not have a Practice Pass/);

  const excused = [await redemptionOf(studentId, first), await redemptionOf(studentId, second)].filter(Boolean);
  assert.equal(excused.length, 1, 'no waiver exists without its payment');
});

test('two passes cover two assignments from two tabs', async () => {
  const studentId = await seedStudent();
  const [first, second] = await Promise.all([seedAssignment(), seedAssignment()]);
  await givePass(studentId);
  await givePass(studentId);
  const results = await Promise.all([redeem(studentId, first), redeem(studentId, second)]);
  assert.notEqual(results[0].grantId, results[1].grantId, 'each assignment spent its own pass');
  assert.deepEqual((await grantsOf(studentId)).map((grant) => grant.status), ['redeemed', 'redeemed']);
});

test('the pass that expires soonest is spent; an expired pass is never spent', async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  const longLived = await givePass(studentId, { expiresInDays: 60 });
  const soon = await givePass(studentId, { expiresInDays: 5 });
  const expired = await givePass(studentId, { expiresInDays: 1, nowMs: NOW - 3 * DAY });
  const result = await redeem(studentId, assignmentId);
  assert.equal(result.grantId, soon.grantId);
  const byId = Object.fromEntries((await grantsOf(studentId)).map((grant) => [grant.id, grant.status]));
  assert.equal(byId[longLived.grantId], 'available');
  assert.equal(byId[expired.grantId], 'expired', 'the use that skipped it records that it has expired (lazy expiry, below)');

  const onlyExpired = await seedStudent();
  await givePass(onlyExpired, { expiresInDays: 1, nowMs: NOW - 3 * DAY });
  await rejects(redeem(onlyExpired, await seedAssignment()), 'failed-precondition', /do not have a Practice Pass/);
});

/*
 * LAZY EXPIRY (LC23). A pass past its end date reads as expired everywhere
 * without a write. The server paths that already hold a student's passes
 * record it while they are there: a teacher opening the student's rewards, and
 * the use of another pass (in the same commit). Nothing sweeps on a schedule.
 */
const iso = (millis) => new Date(millis).toISOString();
const seedGrant = async (studentId, { status = 'available', expiresAt = null } = {}) => {
  const grantId = uniqueId('ra-grant');
  await db.collection('rewardGrants').doc(grantId).set({
    ...buildRewardGrant({
      grantId,
      rewardCode: 'practicePass',
      studentId,
      classId: CLASS_ID,
      source: { type: 'teacher', id: TEACHER },
      awardedAt: iso(NOW - 30 * DAY),
      expiresAt,
      originTeacherEmail: TEACHER,
      authorizedTeacherEmails: [TEACHER],
    }),
    status,
  });
  return grantId;
};
const grantOf = async (grantId) => (await db.collection('rewardGrants').doc(grantId).get()).data();

test("a teacher opening a student's rewards records the passes that have expired, and nothing else", async () => {
  const studentId = await seedStudent();
  const endedLongAgo = iso(NOW - 9 * DAY);
  const endedYesterday = iso(NOW - DAY);
  const stale = await seedGrant(studentId, { expiresAt: endedLongAgo });
  const alsoStale = await seedGrant(studentId, { expiresAt: endedYesterday });
  const live = await seedGrant(studentId, { expiresAt: iso(NOW + 5 * DAY) });
  const forever = await seedGrant(studentId);
  const used = await seedGrant(studentId, { status: 'redeemed', expiresAt: endedLongAgo });
  const takenBack = await seedGrant(studentId, { status: 'revoked', expiresAt: endedLongAgo });
  const untouched = [live, forever, used, takenBack];
  const before = Object.fromEntries(await Promise.all(untouched.map(async (id) => [id, await grantOf(id)])));

  const read = await store.loadStudentRewardsForTeacher(db, { studentId, classId: CLASS_ID, teacher, nowMs: NOW });

  // Recorded: the two that ended, each as of its own end date.
  for (const [id, ended] of [[stale, endedLongAgo], [alsoStale, endedYesterday]]) {
    const grant = await grantOf(id);
    assert.equal(grant.status, 'expired', id);
    assert.equal(grant.expiredAt, ended, 'it expired when its end date fell');
    assert.deepEqual(grant.history.map((entry) => [entry.status, entry.at, entry.actorType]), [
      ['available', iso(NOW - 30 * DAY), 'system'],
      ['expired', ended, 'system'],
    ]);
    assert.equal(grant.expiresAt, ended, 'its end date is kept');
    assert.equal(grant.studentId, studentId);
  }
  // Left as they were: not yet ended, never ending, used, taken back.
  for (const id of untouched) {
    const grant = await grantOf(id);
    assert.deepEqual(
      { status: grant.status, history: grant.history, expiredAt: grant.expiredAt },
      { status: before[id].status, history: before[id].history, expiredAt: before[id].expiredAt },
      id,
    );
  }
  // The read says the same on its first view as every view after.
  const shown = Object.fromEntries(read.grants.map((grant) => [grant.id, grant]));
  assert.equal(read.grants.length, 6);
  assert.equal(shown[stale].status, 'expired');
  assert.equal(shown[stale].expiredAt, endedLongAgo);
  assert.equal(shown[stale].history.at(-1).status, 'expired');
  assert.deepEqual([shown[live].status, shown[forever].status, shown[used].status, shown[takenBack].status], ['available', 'available', 'redeemed', 'revoked']);

  // Reading again records nothing a second time.
  const stamp = (await grantOf(stale)).updatedAt.toMillis();
  await store.loadStudentRewardsForTeacher(db, { studentId, classId: CLASS_ID, teacher, nowMs: NOW });
  const again = await grantOf(stale);
  assert.equal(again.updatedAt.toMillis(), stamp, 'not written again');
  assert.equal(again.history.length, 2);
});

test('one read settles a bounded number of passes, and the next one carries on', async () => {
  const studentId = await seedStudent();
  const stale = await Promise.all([1, 2, 3].map((days) => seedGrant(studentId, { expiresAt: iso(NOW - days * DAY) })));
  const grants = async () => (await grantsOf(studentId));
  const first = await persistExpiredGrants(db, await grants(), { nowMs: NOW, limit: 2 });
  assert.equal(first.length, 2);
  assert.equal((await grants()).filter((grant) => grant.status === 'expired').length, 2);
  const second = await persistExpiredGrants(db, await grants(), { nowMs: NOW, limit: 2 });
  assert.deepEqual(second.map((grant) => grant.grantId), stale.filter((id) => !first.some((grant) => grant.grantId === id)));
  assert.deepEqual((await grants()).map((grant) => grant.status), ['expired', 'expired', 'expired']);
  assert.deepEqual(await persistExpiredGrants(db, await grants(), { nowMs: NOW }), [], 'nothing left to settle');
});

test('a pass used between the read and the write is not expired over', async () => {
  // persistExpiredGrants is handed what a path read a moment ago; each grant is
  // looked at again inside its own transaction, so a pass that has changed since
  // is left as it is. Here the document the caller read is stale: the grant is
  // already taken back.
  const studentId = await seedStudent();
  const grantId = await seedGrant(studentId, { expiresAt: iso(NOW - DAY) });
  const readEarlier = { ...(await grantOf(grantId)), grantId };
  await db.collection('rewardGrants').doc(grantId).set({ ...readEarlier, status: 'revoked' });
  assert.deepEqual(await persistExpiredGrants(db, [readEarlier], { nowMs: NOW }), []);
  assert.equal((await grantOf(grantId)).status, 'revoked');
});

test('a read refused to the wrong teacher records nothing', async () => {
  const studentId = await seedStudent();
  const stale = await seedGrant(studentId, { expiresAt: iso(NOW - DAY) });
  await rejects(store.loadStudentRewardsForTeacher(db, { studentId, classId: CLASS_ID, teacher: { email: OTHER_TEACHER }, nowMs: NOW }), 'permission-denied');
  assert.equal((await grantOf(stale)).status, 'available', 'authorization comes before anything is written');
});

test("using a pass records the student's other expired passes in the same commit", async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  const soon = await givePass(studentId, { expiresInDays: 5 });
  const stale = await seedGrant(studentId, { expiresAt: iso(NOW - 2 * DAY) });
  const alsoStale = await seedGrant(studentId, { expiresAt: iso(NOW - 9 * DAY) });
  const live = await seedGrant(studentId, { expiresAt: iso(NOW + 40 * DAY) });

  const result = await redeem(studentId, assignmentId);
  assert.equal(result.grantId, soon.grantId, 'the pass that ends soonest is still the one spent');
  const byId = Object.fromEntries((await grantsOf(studentId)).map((grant) => [grant.id, grant]));
  assert.equal(byId[soon.grantId].status, 'redeemed');
  assert.deepEqual([byId[stale].status, byId[stale].expiredAt], ['expired', iso(NOW - 2 * DAY)]);
  assert.deepEqual([byId[alsoStale].status, byId[alsoStale].expiredAt], ['expired', iso(NOW - 9 * DAY)]);
  assert.equal(byId[live].status, 'available', 'a pass that has not ended is not touched');
});

test('two tabs using passes at once record an expired pass once', async () => {
  const studentId = await seedStudent();
  const first = await seedAssignment();
  const second = await seedAssignment();
  await givePass(studentId, { expiresInDays: 5 });
  await givePass(studentId, { expiresInDays: 9 });
  const stale = await seedGrant(studentId, { expiresAt: iso(NOW - DAY) });

  const results = await Promise.all([redeem(studentId, first), redeem(studentId, second)]);
  assert.notEqual(results[0].grantId, results[1].grantId, 'each assignment spent its own pass');
  const grant = await grantOf(stale);
  assert.equal(grant.status, 'expired');
  assert.equal(grant.history.filter((entry) => entry.status === 'expired').length, 1, 'recorded once');
});

test('an ineligible assignment is refused and nothing is consumed', async () => {
  const assignmentStarted = await seedAssignment();
  const studentId = await seedStudent({ gradesByAssignment: { [assignmentStarted]: { 2: { totalAttempts: 1 } } } });
  const { grantId } = await givePass(studentId);

  await rejects(redeem(studentId, assignmentStarted), 'failed-precondition', /already been recorded/);
  await rejects(redeem(studentId, await seedAssignment({ sections: [{ role: 'practice' }, { role: 'quiz' }] })), 'failed-precondition', /quiz/);
  await rejects(redeem(studentId, await seedAssignment({ classId: OTHER_CLASS })), 'failed-precondition', /not assigned to your class/);

  const [grant] = await grantsOf(studentId);
  assert.equal(grant.grantId, grantId);
  assert.equal(grant.status, 'available', 'a refused use never spends the pass');
  assert.equal(await redemptionOf(studentId, assignmentStarted), null, 'and never excuses anything');
});

test("a student can never spend another student's pass", async () => {
  const owner = await seedStudent();
  const other = await seedStudent();
  const { grantId } = await givePass(owner);
  await rejects(redeem(other, await seedAssignment(), { preferredGrantId: grantId }), 'failed-precondition', /do not have a Practice Pass/);
  assert.equal((await grantsOf(owner))[0].status, 'available');
});

test('paying with Class Points debits 100 with the waiver, and refuses without enough', async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  await db.collection('classPointAccounts').doc(accountId(studentId, CLASS_ID)).set({
    studentId, classId: CLASS_ID, balance: 150, lifetimeEarned: 150, lifetimeSpent: 0, authorizedTeacherEmails: [TEACHER], originTeacherEmail: TEACHER,
  });
  const result = await redeem(studentId, assignmentId, { payWith: 'classPoints' });
  assert.equal(result.outcome, 'redeemed');
  assert.equal(result.account.balance, 50);
  const redemption = await redemptionOf(studentId, assignmentId);
  assert.equal(redemption.paidWith, 'classPoints');
  assert.ok(redemption.transactionId);

  await rejects(redeem(studentId, await seedAssignment(), { payWith: 'classPoints' }), 'failed-precondition', /more Class Points/);
  const account = (await db.collection('classPointAccounts').doc(accountId(studentId, CLASS_ID)).get()).data();
  assert.equal(account.balance, 50, 'a refused purchase spends nothing');
});

test('undoing a pass use lifts the waiver, gives a pass back and keeps the history', async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  const { grantId } = await givePass(studentId, { expiresInDays: 2 });
  const { redemptionId } = await redeem(studentId, assignmentId);

  await rejects(store.undoPracticePassRedemption(db, { redemptionId, reason: 'x', teacher: { email: OTHER_TEACHER }, nowMs: NOW }), 'permission-denied');
  await rejects(store.undoPracticePassRedemption(db, { redemptionId, reason: ' ', teacher, nowMs: NOW }), 'invalid-argument');

  const [undo, retry] = await Promise.all([
    store.undoPracticePassRedemption(db, { redemptionId, reason: 'Used on the wrong lesson', teacher, nowMs: NOW }),
    store.undoPracticePassRedemption(db, { redemptionId, reason: 'Used on the wrong lesson', teacher, nowMs: NOW }),
  ]);
  assert.deepEqual([undo.outcome, retry.outcome].sort(), ['alreadyApplied', 'undone']);

  const redemption = await redemptionOf(studentId, assignmentId);
  assert.equal(redemption.status, 'reversed');
  assert.equal(isActivePracticePassRedemption(redemption), false, 'Practice is required again');
  assert.equal(redemption.reversal.reason, 'Used on the wrong lesson');

  const grants = await grantsOf(studentId);
  const original = grants.find((grant) => grant.id === grantId);
  const restored = grants.find((grant) => grant.id === redemption.refund.grantId);
  assert.equal(original.status, 'redeemed', 'a used grant stays used: terminal states never change');
  assert.equal(restored.status, 'available');
  assert.equal(restored.source.type, 'restored');
  assert.equal(restored.source.restoresGrantId, grantId);
  assert.equal(restored.note, 'Used on the wrong lesson');
  assert.ok(Date.parse(restored.expiresAt) >= NOW + 7 * DAY, 'a returned pass gets at least a week');

  // Using the same assignment again is a new use, with the old one kept.
  const again = await redeem(studentId, assignmentId);
  assert.equal(again.outcome, 'redeemed');
  assert.equal(again.grantId, restored.id);
  const reused = await redemptionOf(studentId, assignmentId);
  assert.ok(isActivePracticePassRedemption(reused));
  assert.equal(reused.previousRedemptions.length, 1);
  assert.equal(reused.previousRedemptions[0].reversal.reason, 'Used on the wrong lesson');

  // Undoing the second use gives back a different pass, not the first one again.
  const second = await store.undoPracticePassRedemption(db, { redemptionId, reason: 'Again', teacher, nowMs: NOW });
  assert.notEqual(second.redemption.refund.grantId, restored.id);
  assert.equal((await grantsOf(studentId)).filter((grant) => grant.status === 'available').length, 1);
});

test('undoing a points purchase refunds the points once and un-counts the spend', async () => {
  const studentId = await seedStudent();
  const assignmentId = await seedAssignment();
  const ref = db.collection('classPointAccounts').doc(accountId(studentId, CLASS_ID));
  await ref.set({ studentId, classId: CLASS_ID, balance: 100, lifetimeEarned: 100, lifetimeSpent: 0, authorizedTeacherEmails: [TEACHER], originTeacherEmail: TEACHER });
  const { redemptionId } = await redeem(studentId, assignmentId, { payWith: 'classPoints' });
  assert.equal((await ref.get()).data().balance, 0);

  await Promise.all([1, 2].map(() => store.undoPracticePassRedemption(db, { redemptionId, reason: 'Teacher error', teacher, nowMs: NOW })));
  const account = (await ref.get()).data();
  assert.equal(account.balance, 100, 'refunded once');
  assert.equal(account.lifetimeSpent, 0, 'a refund cancels the spend');
  assert.equal(account.lifetimeEarned, 100, 'and is not new earnings');
  const refunds = await db.collection('classPointTransactions').where('studentId', '==', studentId).where('sourceType', '==', 'rewardRefund').get();
  assert.equal(refunds.size, 1);
});

test('a teacher takes back an unused reward once; a used one must be undone instead', async () => {
  const studentId = await seedStudent();
  const { grantId } = await givePass(studentId);
  await rejects(store.revokeRewardGrant(db, { grantId, reason: 'x', teacher: { email: OTHER_TEACHER }, nowMs: NOW }), 'permission-denied');
  const outcomes = await Promise.all([1, 2].map(() => store.revokeRewardGrant(db, { grantId, reason: 'Given to the wrong student', teacher, nowMs: NOW })));
  assert.deepEqual(outcomes.map((entry) => entry.outcome).sort(), ['alreadyApplied', 'revoked']);
  const [grant] = await grantsOf(studentId);
  assert.equal(grant.status, 'revoked');
  assert.equal(grant.revocation.reason, 'Given to the wrong student');
  await rejects(redeem(studentId, await seedAssignment()), 'failed-precondition', /do not have a Practice Pass/);

  const used = await givePass(studentId);
  await redeem(studentId, await seedAssignment());
  await rejects(store.revokeRewardGrant(db, { grantId: used.grantId, reason: 'x', teacher, nowMs: NOW }), 'failed-precondition', /Undo the use/);
});

test('a Challenge reward taken back is never issued again by a retried delivery', async () => {
  const winner = await seedStudent();
  const roomId = uniqueId('ra-room');
  const policy = { rules: [{ ruleId: 'topFinish', criterion: { kind: 'placement', maxRank: 1 }, reward: { kind: 'grant', rewardCode: 'practicePass' } }] };
  const matchResult = buildMatchResult({
    roomId,
    room: { classId: CLASS_ID, teacherEmail: TEACHER, roundCount: 1, currentRound: 0 },
    privateState: { scheduledRoundCount: 1, questionIds: ['q0'] },
    players: [{ studentId: winner, joined: true, joinedAtRound: 0, score: 1000, correctCount: 1, roundsAnswered: 1, answeredRounds: [0], submissionReceipts: {} }],
    status: 'finished',
  });
  await delivery.processLiveChallengeMatchRewards(db, { matchResult, policy });
  const [grant] = await grantsOf(winner);
  assert.equal(grant.source.type, 'liveChallenge');
  await store.revokeRewardGrant(db, { grantId: grant.id, reason: 'Duplicate account', teacher, nowMs: NOW });

  // A host reconnect, a repeated finish and the 15-minute sweep all re-run delivery.
  await Promise.all([1, 2, 3].map(() => delivery.processLiveChallengeMatchRewards(db, { matchResult, policy })));
  const after = await grantsOf(winner);
  assert.equal(after.length, 1, 'no second grant');
  assert.equal(after[0].status, 'revoked', 'and the taken-back one stays taken back');
});

test("a teacher's read explains each Challenge reward and is refused to anyone else", async () => {
  const winner = await seedStudent();
  const second = await seedStudent();
  const policy = { rules: [
    { ruleId: 'challengeFinisher', criterion: { kind: 'participation', minAvailableRounds: 1 }, reward: { kind: 'classPoints', amount: 2 } },
    { ruleId: 'placementPracticePass', criterion: { kind: 'placement', maxRank: 1 }, reward: { kind: 'grant', rewardCode: 'practicePass', expiresInDays: 14 } },
  ] };
  // Three matches in a row: each one's rewards stay with that match.
  const rooms = [];
  for (const [index, leader] of [[0, winner], [1, second], [2, winner]]) {
    const roomId = uniqueId(`ra-diag-room-${index}`);
    rooms.push(roomId);
    const player = (studentId, score) => ({ studentId, joined: true, joinedAtRound: 0, score, correctCount: 1, roundsAnswered: 1, answeredRounds: [0], submissionReceipts: {} });
    const matchResult = buildMatchResult({
      roomId,
      room: { classId: CLASS_ID, teacherEmail: TEACHER, roundCount: 1, currentRound: 0, title: `Match ${index + 1}` },
      privateState: { scheduledRoundCount: 1, questionIds: ['q0'] },
      players: [player(leader, 2000), player(leader === winner ? second : winner, 1000)],
      status: 'finished',
      finalizedAtMs: NOW + index * 1000,
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('liveChallengeMatchResults').doc(roomId).set({
      ...matchResult, studentIds: matchResult.standings.map((entry) => entry.studentId), rewardPolicy: policy, effects: { rewards: 'done' },
    });
    // eslint-disable-next-line no-await-in-loop
    await delivery.processLiveChallengeMatchRewards(db, { matchResult, policy });
  }

  const read = await store.loadStudentRewardsForTeacher(db, { studentId: second, classId: CLASS_ID, teacher });
  assert.equal(read.challenges.length, 3);
  assert.deepEqual(read.challenges.map((match) => match.title), ['Match 3', 'Match 2', 'Match 1'], 'newest first');
  const match2 = read.challenges[1];
  assert.equal(match2.placement, '1st place');
  const passRule = match2.rules.find((rule) => rule.ruleId === 'placementPracticePass');
  assert.equal(passRule.met, true);
  assert.equal(passRule.delivery.state, 'delivered');
  const match1Pass = read.challenges[2].rules.find((rule) => rule.ruleId === 'placementPracticePass');
  assert.equal(match1Pass.met, false);
  assert.match(match1Pass.measured, /Finished 2nd/);
  assert.equal(read.grants.length, 1, 'one pass, from the one match this student won');
  assert.equal(read.grants[0].source.id, rooms[1]);
  assert.equal(read.account.balance, 6, 'Finisher in each of three matches');

  await rejects(store.loadStudentRewardsForTeacher(db, { studentId: second, classId: CLASS_ID, teacher: { email: OTHER_TEACHER } }), 'permission-denied');
  await rejects(store.loadStudentRewardsForTeacher(db, { studentId: second, classId: OTHER_CLASS, teacher: { email: OTHER_TEACHER } }), 'failed-precondition');
});
