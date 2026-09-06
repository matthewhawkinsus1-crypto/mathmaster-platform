// Option B against a real Firestore emulator.
//
// The unit tests prove the arithmetic. This file proves the new entry wrapper,
// room configuration and idempotency marker actually cooperate with the mature
// Live Challenge submit callable and stored leaderboard state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set.');

const requireFunctionsModule = (specifier) => {
  try {
    return require(path.join(repo, 'functions/node_modules', specifier));
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      throw new Error(`${specifier} is not installed. Run \`npm --prefix functions ci\` before this suite.`);
    }
    throw error;
  }
};

const functionsEntry = require(path.join(repo, 'functions/entry.js'));
const admin = requireFunctionsModule('firebase-admin');
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const db = admin.firestore();

const TEACHER = 'option-b-teacher@example.com';
const ROOM = 'option-b-experience-room';
const STUDENT = 'option-b-student';
const PLAYER_KEY = 'option-b-public-player';

const teacherRequest = (data) => ({
  auth: { uid: 'option-b-teacher-uid', token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const studentRequest = (data) => ({
  auth: { uid: 'option-b-student-uid', token: { role: 'student', studentId: STUDENT, email: `${STUDENT}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const findQuestion = async () => {
  const dir = path.join(repo, 'functions/seeds/pathQuestionBank');
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : (parsed.documents || []);
    for (const item of items) {
      const instantiated = await mathPath.instantiateQuestion(item, `option-b-probe|${item.id}`);
      if (!instantiated?.question || !mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (plan?.issuable) return item;
    }
  }
  return null;
};

const authored = await findQuestion();
assert.ok(authored, 'the seed bank must contain an issuable choice question');

const correctAnswer = async () => {
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${ROOM}|0|${authored.id}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return plan.privateGrading.fields[0].expected;
};

const seed = async () => {
  await db.recursiveDelete(db.collection('liveChallengeRooms').doc(ROOM)).catch(() => {});
  await db.recursiveDelete(db.collection('liveChallengePrivate').doc(ROOM)).catch(() => {});
  await db.collection('liveChallengeExperience').doc(ROOM).delete().catch(() => {});
  await db.collection('liveChallengeInvites').doc(STUDENT).delete().catch(() => {});
  await db.collection('grades').doc(STUDENT).delete().catch(() => {});
  await db.collection('pathQuestionBank').doc(authored.id).set(authored);

  const now = Date.now();
  await db.collection('liveChallengeRooms').doc(ROOM).set({
    schemaVersion: 2,
    title: 'Option B experience harness',
    teacherEmail: TEACHER,
    status: 'running',
    roundCount: 1,
    scheduledRoundCount: 1,
    roundSeconds: 60,
    currentRound: 0,
    roundStartedAt: admin.firestore.Timestamp.fromMillis(now),
    // More than 60 seconds remaining intentionally clamps the mature speed
    // scorer to its full 100-point speed component.
    roundEndsAt: admin.firestore.Timestamp.fromMillis(now + 600000),
    currentQuestion: { questionInstanceId: `challenge_${ROOM}_r1` },
  });
  await db.collection('liveChallengePrivate').doc(ROOM).set({
    schemaVersion: 2,
    roomId: ROOM,
    teacherEmail: TEACHER,
    scheduledRoundCount: 1,
    questionIds: [authored.id],
    roundStandards: { 0: 'texas:A.3(C)' },
    secondChanceOf: {},
  });
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).set({
    studentId: STUDENT,
    playerKey: PLAYER_KEY,
    alias: 'Prime Falcon 17',
    joined: true,
    score: 0,
    correctCount: 0,
    roundsAnswered: 0,
    streak: 0,
    answeredRound: -1,
  });
  await db.collection('liveChallengeRooms').doc(ROOM).collection('players').doc(PLAYER_KEY).set({
    playerKey: PLAYER_KEY,
    alias: 'Prime Falcon 17',
    score: 0,
    correctCount: 0,
    streak: 0,
    answeredRound: -1,
  });
  await db.collection('liveChallengeInvites').doc(STUDENT).set({
    roomId: ROOM,
    playerKey: PLAYER_KEY,
    alias: 'Prime Falcon 17',
    status: 'running',
    teacherEmail: TEACHER,
  });
  await db.collection('grades').doc(STUDENT).set({
    studentId: STUDENT,
    firstName: 'Ada',
    lastName: 'Lovelace',
  });
};

await seed();

const configured = await functionsEntry.configureLiveChallengeExperience.run(teacherRequest({
  roomId: ROOM,
  speedInfluencePercent: 20,
  playerDisplayMode: 'firstLastInitial',
}));

const privateAfterConfig = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).get()).data();
const publicAfterConfig = (await db.collection('liveChallengeRooms').doc(ROOM).collection('players').doc(PLAYER_KEY).get()).data();
const inviteAfterConfig = (await db.collection('liveChallengeInvites').doc(STUDENT).get()).data();

test('teacher room configuration persists the 20% speed policy', () => {
  assert.equal(configured.speedInfluencePercent, 20);
  assert.equal(configured.playerDisplayMode, 'firstLastInitial');
});

test('selected public identity is applied without losing the generated code name', () => {
  assert.equal(privateAfterConfig.alias, 'Ada L.');
  assert.equal(privateAfterConfig.codeAlias, 'Prime Falcon 17');
  assert.equal(publicAfterConfig.alias, 'Ada L.');
  assert.equal(inviteAfterConfig.alias, 'Ada L.');
  assert.equal(publicAfterConfig.studentId, undefined, 'public leaderboard must not receive the roster id');
});

const correct = await functionsEntry.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM,
  roundIndex: 0,
  responsePayload: { responses: { answer: await correctAnswer() } },
}));
const privateAfterSubmit = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).get()).data();
const publicAfterSubmit = (await db.collection('liveChallengeRooms').doc(ROOM).collection('players').doc(PLAYER_KEY).get()).data();

test('Standard 20% speed is returned synchronously and stored on both leaderboards', () => {
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.speedBonus, 200);
  assert.equal(correct.pointsAwarded, 1200);
  assert.equal(correct.totalScore, 1200);
  assert.equal(privateAfterSubmit.score, 1200);
  assert.equal(publicAfterSubmit.score, 1200);
  assert.equal(privateAfterSubmit.experienceSpeedAdjustedRound, 0);
  assert.equal(privateAfterSubmit.experienceSpeedAdjustment, 100);
});

// Fire the fallback with the BASE write shape after the synchronous path has
// already marked the database. The transaction must observe the marker and
// decline to pay the same extra 100 points again.
await functionsEntry.adjustLiveChallengeExperienceScore.run({
  params: { roomId: ROOM, studentId: STUDENT },
  data: {
    before: { exists: true, data: () => ({ score: 0, answeredRound: -1, streak: 0 }) },
    after: { exists: true, data: () => ({ score: 1100, answeredRound: 0, streak: 1, lastAnswerCorrect: true }) },
  },
});
const privateAfterRetry = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).get()).data();

test('trigger retry cannot double-pay the configured speed bonus', () => {
  assert.equal(privateAfterRetry.score, 1200);
  assert.equal(privateAfterRetry.experienceSpeedAdjustedRound, 0);
  assert.equal(privateAfterRetry.experienceSpeedAdjustment, 100);
});

test('another teacher cannot change this room experience', async () => {
  const error = await functionsEntry.configureLiveChallengeExperience.run({
    ...teacherRequest({ roomId: ROOM, speedInfluencePercent: 35, playerDisplayMode: 'fullName' }),
    auth: { uid: 'other-teacher', token: { role: 'teacher', email: 'other@example.com', email_verified: true } },
  }).then(() => null, (caught) => caught);
  assert.ok(error);
  assert.equal(error.code, 'permission-denied');
});
