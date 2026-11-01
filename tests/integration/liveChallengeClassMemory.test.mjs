// Class memory end to end: a finished rush game leaves its class one record,
// through the real finalization effects, in a real Firestore. Run through
// `npm run test:challenge-finish`.
//
// WHY. What to remember and what to suggest are pure and unit tested
// (tests/platform/liveChallengeClassMemory.test.mjs). What only the database
// shows is that finishing a game writes the record — from the match result
// and the room's own settings — one per class and game, that a cancelled
// game writes none, and that the next game of the same kind replaces it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const rush = await import('../../functions/shared/graphFeatureRush.mjs');
const memoryRules = await import('../../functions/shared/liveChallengeClassMemory.mjs');
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'memory-teacher@example.com';
const CLASS_ID = 'memory-class';
const [A, B] = ['memory-class-s01', 'memory-class-s02'];

const teacher = (data) => ({
  auth: { uid: `${TEACHER}-uid`, token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const student = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const call = (name, request) => functionsIndex[name].run(request);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const privatePlayer = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;
const memoryOf = async (game) => (await db.collection('liveChallengeClassMemory').doc(memoryRules.classMemoryId(CLASS_ID, game)).get()).data() || null;

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '5', name: 'Period 5' });
await Promise.all([A, B].map((studentId, index) => db.collection('grades').doc(studentId).set({
  assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '5', firstName: `Memory${index + 1}`, lastName: 'Student',
})));

const identityOf = async (roomId) => {
  const room = await roomOf(roomId);
  return { roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken };
};
const waitForPace = async (roomId, studentId, questionIndex) => {
  const [room, player] = await Promise.all([roomOf(roomId), privatePlayer(roomId, studentId)]);
  const required = rush.rushNextAttemptRequiredMs({ receipts: player?.submissionReceipts || {}, roundIndex: Number(room.currentRound), questionIndex });
  const delay = (room.startsAt?.toMillis?.() || 0) + required + 50 - Date.now();
  if (delay > 0) await sleep(delay);
};

// One round: A answers their first graph, B skips theirs; then the host closes and finishes.
const playOneRound = async (roomId) => {
  await call('joinLiveChallenge', student(A, { roomId }));
  await call('joinLiveChallenge', student(B, { roomId }));
  await call('startLiveChallenge', teacher({ roomId }));
  const room = await roomOf(roomId);
  await sleep(Math.max(0, (room.startsAt?.toMillis?.() || 0) - Date.now() + 30));
  for (const studentId of [A, B]) {
    const identity = await identityOf(roomId);
    // eslint-disable-next-line no-await-in-loop
    const { questions: [question] } = await call('getGraphFeatureRushRound', student(studentId, { ...identity, count: 1 }));
    const answer = question.targets.length
      ? question.targets.map((target) => ({ attemptId: randomUUID(), questionIndex: 0, kind: 'tap', x: target.x, y: target.y, tolerance: { x: 0.4, y: 0.4 }, pointer: 'touch', clientElapsedMs: 4_000 }))
      : [{ attemptId: randomUUID(), questionIndex: 0, kind: 'dne', clientElapsedMs: 4_000 }];
    // B skips the graph: the class's accuracy is not a perfect score.
    const skip = [{ attemptId: randomUUID(), questionIndex: 0, kind: 'skip', clientElapsedMs: 4_000 }];
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(roomId, studentId, 0);
    // eslint-disable-next-line no-await-in-loop
    await call('submitGraphFeatureRushAttempts', student(studentId, { ...identity, attempts: studentId === B ? skip : answer }));
  }
  const identity = await identityOf(roomId);
  await call('closeLiveChallengeRound', teacher({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion, force: true }));
  const closed = await identityOf(roomId);
  return call('advanceLiveChallenge', teacher({ roomId, expectedRoundIndex: closed.roundIndex, expectedRoundVersion: closed.roundVersion }));
};

const waitForMemory = async (game, roomId) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const memory = await memoryOf(game);
    if (memory?.roomId === roomId) return memory;
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  return memoryOf(game);
};

let firstRoom = null;

test('a finished Graph Feature Rush game leaves its class a memory: when, the settings, and how the class did', async () => {
  const created = await call('createLiveChallenge', teacher({
    classId: CLASS_ID, courseId: 'algebra1', challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'algebra1Quick' }, roundCount: 1, roundSeconds: 45,
  }));
  firstRoom = created.roomId;
  const finished = await playOneRound(firstRoom);
  assert.equal(finished.status, 'finished');
  const memory = await waitForMemory('graphFeatureRush', firstRoom);
  assert.ok(memory, 'the memory is written');
  assert.equal(memory.classId, CLASS_ID);
  assert.equal(memory.teacherEmail, TEACHER);
  assert.equal(memory.game, 'graphFeatureRush');
  assert.equal(memory.settings.presetId, 'algebra1Quick');
  assert.equal(memory.settings.roundSeconds, 45);
  assert.equal(memory.settings.roundCount, 1);
  assert.equal(memory.results.players, 2);
  assert.equal(typeof memory.results.accuracyPercent, 'number');
  assert.ok(memory.playedAtMs > 0);
  assert.doesNotMatch(JSON.stringify(memory), new RegExp(`${A}|${B}`), 'no student is named');
  const result = (await db.collection('liveChallengeMatchResults').doc(firstRoom).get()).data();
  assert.equal(result.effects.classMemory, 'done');
  // What the setup card makes of it.
  const next = memoryRules.suggestNextSettings(memory);
  assert.ok(next && memoryRules.classMemorySentence(memory, next).startsWith('Period 5 last played this on '));
});

test('a cancelled game leaves no memory, and the next finished game of the same kind replaces the last', async () => {
  const cancelled = await call('createLiveChallenge', teacher({
    classId: CLASS_ID, courseId: 'algebra1', challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'interceptSprint' }, roundCount: 1, roundSeconds: 60,
  }));
  await call('cancelLiveChallenge', teacher({ roomId: cancelled.roomId }));
  const cancelledResult = (await db.collection('liveChallengeMatchResults').doc(cancelled.roomId).get()).data();
  assert.equal(cancelledResult?.effects?.classMemory, 'notApplicable');
  assert.equal((await memoryOf('graphFeatureRush')).roomId, firstRoom, 'the cancelled game changed nothing');

  const next = await call('createLiveChallenge', teacher({
    classId: CLASS_ID, courseId: 'algebra1', challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'interceptSprint' }, roundCount: 1, roundSeconds: 60,
  }));
  await playOneRound(next.roomId);
  const memory = await waitForMemory('graphFeatureRush', next.roomId);
  assert.equal(memory.roomId, next.roomId);
  assert.equal(memory.settings.presetId, 'interceptSprint');
  assert.equal(memory.settings.roundSeconds, 60);
  assert.equal(await memoryOf('inequalityRush'), null, 'one memory per class and game');
});
