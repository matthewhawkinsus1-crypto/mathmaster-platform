// Reward delivery against a real Firestore. Run through `npm run test:challenge-finish`.
//
// The rules that decide who earned what are pure and unit tested. This suite
// holds the delivery half: each award is issued at most once however many
// executors run at the same time, an item reward becomes a grant document with
// its own lifecycle, a student who left the class is skipped rather than
// retried forever, and using a reward is atomic.

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
const delivery = await import(path.join(repo, 'functions/shared/liveChallengeClassPoints.mjs'));
const { buildMatchResult } = await import(path.join(repo, 'functions/shared/liveChallengeResults.mjs'));
const { rewardAwardIdentity } = await import(path.join(repo, 'functions/shared/liveChallengeRewardRules.mjs'));
const { transitionRewardGrant } = await import(path.join(repo, 'functions/shared/rewardGrantStore.mjs'));

const TEACHER = 'rewards-teacher@example.com';
const CLASS_ID = 'rewards-class';
const OTHER_CLASS = 'rewards-other-class';
const ROOM = 'rewards-room-1';
const [WINNER, RUNNER_UP, MOVED] = ['rewards-winner', 'rewards-runner-up', 'rewards-moved'];

const POLICY = {
  rules: [
    { ruleId: 'challengeFinisher', criterion: { kind: 'participation' }, reward: { kind: 'classPoints', amount: 2 } },
    { ruleId: 'strongAccuracy', criterion: { kind: 'accuracy' }, reward: { kind: 'classPoints', amount: 3 } },
    { ruleId: 'topFinish', criterion: { kind: 'placement', maxRank: 1 }, reward: { kind: 'grant', rewardCode: 'practicePass', expiresInDays: 30 } },
    { ruleId: 'podium', criterion: { kind: 'placement', maxRank: 3 }, reward: { kind: 'grant', rewardCode: 'badge', badgeCode: 'podium' } },
  ],
};

const receipt = (roundIndex, isCorrect) => ({ serverConfirmed: true, receiptKind: 'response', roundIndex, sequence: roundIndex + 1, isCorrect, pointsAwarded: isCorrect ? 1000 : 0 });
const played = (studentId, score, correctRounds) => ({
  studentId,
  joined: true,
  joinedAtRound: 0,
  score,
  correctCount: correctRounds.length,
  roundsAnswered: 3,
  answeredRounds: [0, 1, 2],
  submissionReceipts: Object.fromEntries([0, 1, 2].map((round) => [`r${round}`, receipt(round, correctRounds.includes(round))])),
});

const matchResult = buildMatchResult({
  roomId: ROOM,
  room: { classId: CLASS_ID, teacherEmail: TEACHER, roundCount: 3, currentRound: 2 },
  privateState: { scheduledRoundCount: 3, questionIds: ['q0', 'q1', 'q2'] },
  players: [played(WINNER, 3_300, [0, 1, 2]), played(RUNNER_UP, 2_100, [0, 2]), played(MOVED, 1_000, [1])],
  status: 'finished',
});

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
await db.collection('classes').doc(OTHER_CLASS).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
await db.collection('grades').doc(WINNER).set({ classId: CLASS_ID, assignedTeacherEmail: TEACHER });
await db.collection('grades').doc(RUNNER_UP).set({ classId: CLASS_ID, assignedTeacherEmail: TEACHER });
// Moved to another period after the match and before its rewards were delivered.
await db.collection('grades').doc(MOVED).set({ classId: OTHER_CLASS, assignedTeacherEmail: TEACHER });

const planned = delivery.planLiveChallengeAwards({ matchResult, policy: POLICY });
const pointsFor = (studentId) => planned.filter((award) => award.studentId === studentId && award.rewardKind === 'classPoints');
const grantsFor = (studentId) => planned.filter((award) => award.studentId === studentId && award.rewardKind === 'grant');

// Three executors at once: the finishing request, a retry and the sweep.
const outcomes = await Promise.all([1, 2, 3].map(() => delivery.processLiveChallengeMatchRewards(db, { matchResult, policy: POLICY })));

const balance = async (studentId) => {
  const snapshot = await db.collection('classPointAccounts').where('studentId', '==', studentId).where('classId', '==', CLASS_ID).get();
  return snapshot.docs.reduce((sum, doc) => sum + (Number(doc.data()?.balance) || 0), 0);
};

test('concurrent deliveries issue every Class Points award exactly once', async () => {
  assert.ok(outcomes.every((outcome) => outcome.status === 'completed'), JSON.stringify(outcomes));
  for (const studentId of [WINNER, RUNNER_UP]) {
    const expected = pointsFor(studentId);
    // eslint-disable-next-line no-await-in-loop
    const ledger = await db.collection('classPointTransactions').where('studentId', '==', studentId).where('roomId', '==', ROOM).get();
    assert.deepEqual(ledger.docs.map((doc) => doc.id).sort(), expected.map((award) => award.id).sort());
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await balance(studentId), expected.reduce((sum, award) => sum + award.amount, 0));
  }
  const entry = (await db.collection('classPointTransactions').doc(pointsFor(WINNER)[0].id).get()).data();
  assert.equal(entry.ruleId, entry.achievementCode);
  assert.equal(entry.ruleVersion, 1);
  assert.equal(entry.awardIdentity, rewardAwardIdentity({ sourceId: ROOM, studentId: WINNER, ruleId: entry.ruleId }));
});

test('item rewards become grant documents under their award identity', async () => {
  const [pass, badge] = ['topFinish', 'podium'].map((ruleId) => grantsFor(WINNER).find((award) => award.ruleId === ruleId));
  const passDoc = (await db.collection('rewardGrants').doc(pass.id).get()).data();
  assert.equal(pass.id, delivery.buildRewardGrantId(rewardAwardIdentity({ sourceId: ROOM, studentId: WINNER, ruleId: 'topFinish' })));
  assert.equal(passDoc.status, 'available');
  assert.equal(passDoc.rewardCode, 'practicePass');
  assert.equal(passDoc.classId, CLASS_ID);
  assert.deepEqual(passDoc.source, { type: 'liveChallenge', id: ROOM, ruleId: 'topFinish', ruleVersion: 1, identity: pass.identity });
  assert.ok(passDoc.expiresAt, 'a 30-day pass carries its expiry');
  assert.deepEqual(passDoc.authorizedTeacherEmails, [TEACHER]);
  assert.equal((await db.collection('rewardGrants').doc(badge.id).get()).data()?.badgeCode, 'podium');
  const all = await db.collection('rewardGrants').where('studentId', '==', WINNER).get();
  assert.equal(all.size, 2, 'three executors, two grants');
});

test('a student who left the class is skipped, recorded, and never retried', async () => {
  const job = (await db.collection(delivery.JOBS_COLLECTION).doc(ROOM).get()).data();
  const moved = job.awards.filter((award) => award.studentId === MOVED);
  assert.ok(moved.length > 0, 'the moved student did earn something');
  assert.ok(moved.every((award) => award.processed === true && award.outcome === 'skipped' && award.skipReason === 'grade_class_mismatch'));
  const ledger = await db.collection('classPointTransactions').where('studentId', '==', MOVED).get();
  assert.equal(ledger.size, 0);
  assert.equal(job.status, 'completed');
});

test('staging the same match again never undoes a delivery', async () => {
  await delivery.stageLiveChallengeRewards(db, { matchResult, policy: POLICY });
  const job = (await db.collection(delivery.JOBS_COLLECTION).doc(ROOM).get()).data();
  assert.ok(job.awards.every((award) => award.processed === true));
  const again = await delivery.processLiveChallengeMatchRewards(db, { matchResult, policy: POLICY });
  assert.equal(again.awardsProcessed, 0, 'nothing left to deliver');
  assert.equal(await balance(WINNER), pointsFor(WINNER).reduce((sum, award) => sum + award.amount, 0));
});

test('using a Practice Pass is atomic: two uses race, one wins', async () => {
  const pass = grantsFor(WINNER).find((award) => award.ruleId === 'topFinish');
  const use = (redemptionId) => transitionRewardGrant(db, pass.id, {
    to: 'redeemed',
    actor: { type: 'student' },
    redemption: { redemptionId, targetKind: 'assignmentPracticeSection', targetId: redemptionId },
  });
  const raced = await Promise.all([use('assignment-a'), use('assignment-b')]);
  assert.deepEqual(raced.map((plan) => plan.outcome).sort(), ['apply', 'reject']);
  const stored = (await db.collection('rewardGrants').doc(pass.id).get()).data();
  assert.equal(stored.status, 'redeemed');
  assert.deepEqual(stored.history.map((entry) => entry.status), ['available', 'redeemed']);
  const winner = raced.find((plan) => plan.outcome === 'apply').next.redemption.redemptionId;
  assert.equal((await use(winner)).outcome, 'alreadyApplied', 'retrying the winning use is not a second use');
  // A used pass cannot be taken back after the fact.
  const revoke = await transitionRewardGrant(db, pass.id, { to: 'revoked', reason: 'mistake', actor: { type: 'teacher', email: TEACHER } });
  assert.equal(revoke.code, 'already_redeemed');
});

test('a teacher can take back an unused reward; history is kept', async () => {
  const badge = grantsFor(RUNNER_UP).find((award) => award.ruleId === 'podium');
  const revoked = await transitionRewardGrant(db, badge.id, { to: 'revoked', reason: 'Recorded for the wrong match', actor: { type: 'teacher', email: TEACHER } });
  assert.equal(revoked.outcome, 'apply');
  const stored = (await db.collection('rewardGrants').doc(badge.id).get()).data();
  assert.equal(stored.status, 'revoked');
  assert.equal(stored.revocation.reason, 'Recorded for the wrong match');
  assert.deepEqual(stored.history.map((entry) => entry.status), ['available', 'revoked']);
  assert.equal((await transitionRewardGrant(db, 'no-such-grant', { to: 'revoked', reason: 'x' })).code, 'not_found');
});
