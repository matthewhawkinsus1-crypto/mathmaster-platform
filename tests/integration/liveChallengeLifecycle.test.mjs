// Session recovery against real Firestore. Run through npm run test:challenge-finish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const db = admin.firestore();

const teacherRequest = (teacherEmail, data) => ({
  auth: { uid: `${teacherEmail}-uid`, token: { role: 'teacher', email: teacherEmail, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const candidates = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `lifecycle-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    const plan = await mathPath.buildIssuePlan(instantiated.question);
    if (plan.issuable) candidates.push(item);
    if (candidates.length >= 3) break;
  }
  if (candidates.length >= 3) break;
}
assert.equal(candidates.length, 3, 'three challenge candidates are required');
await Promise.all(candidates.map((item) => db.collection('pathQuestionBank').doc(item.id).set(item)));

const seedTeacher = async (suffix) => {
  const teacherEmail = `lifecycle-${suffix}@example.com`;
  const classId = `lifecycle-class-${suffix}`;
  const studentId = `lifecycle-student-${suffix}`;
  await db.collection('classes').doc(classId).set({ teacherOfRecord: teacherEmail, status: 'active', course: 'algebra1', period: '1', name: `Lifecycle ${suffix}` });
  await db.collection('grades').doc(studentId).set({ assignedTeacherEmail: teacherEmail, classId, classPeriod: '1' });
  return { teacherEmail, classId, studentId };
};

const create = ({ teacherEmail, classId }) => functionsIndex.createLiveChallenge.run(teacherRequest(teacherEmail, {
  classId, courseId: 'algebra1', standardCode: 'mixed', roundCount: 3, roundSeconds: 30,
}));

const seedActive = async ({ teacherEmail }, status, { privateState = true, owner = teacherEmail, roomId = `old-${status}-${Date.now()}` } = {}) => {
  await db.collection('liveChallengeRooms').doc(roomId).set({ roomId, teacherEmail: owner, status, roundCount: 3, currentQuestion: { prompt: 'old' }, roundEndsAt: admin.firestore.Timestamp.now() });
  if (privateState) await db.collection('liveChallengePrivate').doc(roomId).set({ roomId, teacherEmail: owner, questionIds: ['q1', 'q2', 'q3'], status });
  await db.collection('liveChallengeTeacherActive').doc(teacherEmail).set({ roomId, teacherEmail });
  return roomId;
};

for (const status of ['lobby', 'running']) {
  test(`valid ${status} session blocks duplicate creation and returns roomId`, async () => {
    const context = await seedTeacher(`block-${status}`);
    const roomId = await seedActive(context, status);
    const error = await create(context).then(() => null, (reason) => reason);
    assert.equal(error?.code, 'failed-precondition');
    assert.equal(error?.details?.roomId, roomId);
    assert.match(error?.message || '', /Finish or cancel/);
  });
}

for (const status of ['finished', 'cancelled']) {
  test(`${status} room pointer is cleared and a new room is created`, async () => {
    const context = await seedTeacher(`closed-${status}`);
    const oldRoomId = await seedActive(context, status, { privateState: false });
    const created = await create(context);
    assert.notEqual(created.roomId, oldRoomId);
    const pointer = await db.collection('liveChallengeTeacherActive').doc(context.teacherEmail).get();
    assert.equal(pointer.data()?.roomId, created.roomId);
  });
}

test('pointer to a nonexistent room is cleared and a new room is created', async () => {
  const context = await seedTeacher('missing-room');
  await db.collection('liveChallengeTeacherActive').doc(context.teacherEmail).set({ roomId: 'does-not-exist' });
  const created = await create(context);
  assert.ok(created.roomId);
  assert.equal((await db.collection('liveChallengeTeacherActive').doc(context.teacherEmail).get()).data()?.roomId, created.roomId);
});

for (const status of ['lobby', 'running']) {
  test(`${status} room with missing private state is retired and does not block creation`, async () => {
    const context = await seedTeacher(`stale-${status}`);
    const oldRoomId = await seedActive(context, status, { privateState: false });
    await db.collection('liveChallengeInvites').doc(context.studentId).set({ roomId: oldRoomId, teacherEmail: context.teacherEmail, status: status === 'lobby' ? 'invited' : 'running' });
    const created = await create(context);
    assert.notEqual(created.roomId, oldRoomId);
    const oldRoom = (await db.collection('liveChallengeRooms').doc(oldRoomId).get()).data();
    assert.equal(oldRoom.status, 'cancelled');
    assert.equal(oldRoom.currentQuestion, null);
    assert.equal(oldRoom.roundEndsAt, null);
    const invite = (await db.collection('liveChallengeInvites').doc(context.studentId).get()).data();
    assert.equal(invite.roomId, created.roomId, 'the new invitation safely supersedes the cancelled one');
  });
}

test('cancel succeeds without private state and clears only the matching pointer', async () => {
  const context = await seedTeacher('cancel-missing');
  const roomId = await seedActive(context, 'running', { privateState: false });
  const result = await functionsIndex.cancelLiveChallenge.run(teacherRequest(context.teacherEmail, { roomId }));
  assert.deepEqual(result, { roomId, status: 'cancelled' });
  assert.equal((await db.collection('liveChallengeRooms').doc(roomId).get()).data()?.status, 'cancelled');
  assert.equal((await db.collection('liveChallengeTeacherActive').doc(context.teacherEmail).get()).exists, false);
});

test('teacher cannot retire another teacher session through a bad pointer or cancel', async () => {
  const context = await seedTeacher('foreign');
  const owner = 'actual-owner@example.com';
  const roomId = await seedActive(context, 'running', { privateState: false, owner });
  const created = await create(context);
  assert.ok(created.roomId);
  assert.equal((await db.collection('liveChallengeRooms').doc(roomId).get()).data()?.status, 'running');
  const error = await functionsIndex.cancelLiveChallenge.run(teacherRequest(context.teacherEmail, { roomId })).then(() => null, (reason) => reason);
  assert.equal(error?.code, 'permission-denied');
  assert.equal((await db.collection('liveChallengeRooms').doc(roomId).get()).data()?.status, 'running');
});

test('stale cleanup cannot delete a different valid active room', async () => {
  const context = await seedTeacher('pointer-race');
  const staleRoom = await seedActive(context, 'running', { privateState: false, roomId: 'lifecycle-stale-unreferenced' });
  const validRoom = await seedActive(context, 'lobby', { privateState: true, roomId: 'lifecycle-valid-current' });
  const error = await create(context).then(() => null, (reason) => reason);
  assert.equal(error?.details?.roomId, validRoom);
  assert.equal((await db.collection('liveChallengeRooms').doc(validRoom).get()).data()?.status, 'lobby');
  assert.equal((await db.collection('liveChallengeRooms').doc(staleRoom).get()).data()?.status, 'running');
});
