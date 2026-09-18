import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const { SOLVER_RACE_CATALOG } = await import(path.join(repo, 'functions/shared/solverRace.mjs'));
const db = admin.firestore();

const ROOM = 'solver-timeout-room';
const STUDENT = 'solver-timeout-student';
const EMPTY_STUDENT = 'solver-timeout-empty';
const authored = SOLVER_RACE_CATALOG.find((entry) => entry.id.endsWith('linearEquation_two_step'));
const request = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const addPlayer = async (studentId, playerKey) => {
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(studentId).set({
    studentId, playerKey, alias: playerKey, joined: true, score: 0, correctCount: 0,
    roundsAnswered: 0, streak: 3, answeredRound: -1,
  });
  await db.collection('liveChallengeInvites').doc(studentId).set({
    roomId: ROOM, playerKey, alias: playerKey, status: 'running', teacherEmail: 'teacher@example.com',
  });
};

await db.recursiveDelete(db.collection('liveChallengePrivate').doc(ROOM)).catch(() => {});
await db.collection('liveChallengeRooms').doc(ROOM).delete().catch(() => {});
// Keep the emulator transport comfortably inside the bounded arrival window;
// the explicit finalization marker is what proves deadline timing below.
const started = Date.now();
await db.collection('liveChallengeRooms').doc(ROOM).set({
  schemaVersion: 2, teacherEmail: 'teacher@example.com', status: 'running', currentRound: 0,
  roundCount: 1, roundSeconds: 60, roundVersion: 4, roundToken: 'timeout-token',
  roundStartedAt: admin.firestore.Timestamp.fromMillis(started),
  roundEndsAt: admin.firestore.Timestamp.fromMillis(started + 600_000),
});
await db.collection('liveChallengePrivate').doc(ROOM).set({
  schemaVersion: 2, roomId: ROOM, teacherEmail: 'teacher@example.com', scheduledRoundCount: 1,
  questionIds: [authored.id], roundQuestions: [authored], secondChanceOf: {},
});
await addPlayer(STUDENT, 'partial-player');
await addPlayer(EMPTY_STUDENT, 'empty-player');

const envelope = {
  roomId: ROOM, roundIndex: 0, roundVersion: 4, roundToken: 'timeout-token',
  submissionId: 'timeout-finalization-1', responsePayload: { raw: { finalRelation: '3*x = 15' } },
  humanElapsedMs: 60_000, autoFinalizedAtRoundEnd: true, connectionQuality: 'synchronized',
};
const partial = await functionsIndex.submitLiveChallengeResponse.run(request(STUDENT, envelope));
const duplicate = await functionsIndex.submitLiveChallengeResponse.run(request(STUDENT, envelope));
const stored = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).get()).data();

test('an expiration-finalized valid solver step becomes authoritative proportional score', () => {
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.scorePercent, 50);
  assert.equal(partial.basePoints, 500);
  assert.equal(partial.pointsAwarded, 500);
  assert.equal(partial.speedBonus, 0);
  assert.equal(partial.streakBonus, 0);
  assert.equal(partial.streak, 0);
  assert.equal(stored.score, 500);
  assert.equal(stored.roundsAnswered, 1);
  assert.equal(stored.answeredRound, 0);
  assert.deepEqual(stored.answeredRounds.map(Number), [0]);
});

test('retrying the frozen envelope is idempotent and cannot double-score', () => {
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.submissionId, envelope.submissionId);
  assert.equal(stored.score, 500);
  assert.equal(stored.roundsAnswered, 1);
});

test('an empty timeout payload is rejected and does not invent an answered round', async () => {
  const error = await functionsIndex.submitLiveChallengeResponse.run(request(EMPTY_STUDENT, {
    ...envelope,
    submissionId: 'empty-timeout',
    responsePayload: { raw: { finalRelation: '' } },
  })).then(() => null, (reason) => reason);
  assert.ok(error);
  assert.match(String(error.message), /mathematical relation|graded|malformed/i);
  const player = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(EMPTY_STUDENT).get()).data();
  assert.equal(player.score, 0);
  assert.equal(player.roundsAnswered, 0);
  assert.equal(player.answeredRound, -1);
});
