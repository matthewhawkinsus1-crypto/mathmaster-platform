// Schedule and play a second-chance round against a real Firestore.
//
// HOW TO RUN:  npm run test:challenge-finish
//
// WHY. planSecondChanceRounds is pure and unit-tested: given a miss tally it
// returns which rounds should come back. What had never run is the path that
// acts on that — appending the replays to questionIds, recording which original
// round each one replays, setting the guard that stops a replay of a replay,
// and paying recovery rather than full points when the replay is answered.
//
// The guard is the part worth testing against a database rather than in
// principle. Without it a class that keeps missing questions keeps generating
// replays, and the game never ends — in front of a room of students, during a
// lesson that had ten minutes for it.

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
      throw new Error(
        `${specifier} is not installed. Run \`npm --prefix functions ci\` before this suite — `
        + 'it loads the real Cloud Functions, whose dependencies live in functions/.',
      );
    }
    throw error;
  }
};

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = requireFunctionsModule('firebase-admin');
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const db = admin.firestore();

const TEACHER = 'teacher@example.com';
const ROOM = 'second-chance-room';
const MISSER = 'student-missed-it';
const ACER = 'student-got-it';

const teacherRequest = (data) => ({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const studentRequest = (data, studentId) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const findQuestion = async () => {
  const dir = path.join(repo, 'functions/seeds/pathQuestionBank');
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
      const instantiated = await mathPath.instantiateQuestion(item, `probe|${item.id}`);
      if (!instantiated?.question) continue;
      if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (plan?.issuable) return item;
    }
  }
  return null;
};

const authored = await findQuestion();
assert.ok(authored, 'the seed bank must contain an issuable choice question');

const correctAnswerFor = async (roundIndex) => {
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${ROOM}|${roundIndex}|${authored.id}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return plan.privateGrading.fields[0].expected;
};

const SCHEDULED = 2;
const privateRef = db.collection('liveChallengePrivate').doc(ROOM);
const roomRef = db.collection('liveChallengeRooms').doc(ROOM);

const addPlayer = async (studentId, playerKey, alias) => {
  await privateRef.collection('players').doc(studentId).set({
    studentId, playerKey, alias, joined: true, joinedAtRound: 0,
    score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
  });
  await db.collection('liveChallengeInvites').doc(studentId).set({
    roomId: ROOM, playerKey, alias, status: 'running', teacherEmail: TEACHER,
  });
};

await db.recursiveDelete(privateRef).catch(() => {});
await roomRef.delete().catch(() => {});
await db.collection('pathQuestionBank').doc(authored.id).set(authored);
await roomRef.set({
  schemaVersion: 2,
  title: 'Second chance harness',
  teacherEmail: TEACHER,
  status: 'running',
  roundCount: SCHEDULED,
  roundSeconds: 60,
  currentRound: 0,
  roundStartedAt: admin.firestore.Timestamp.fromMillis(Date.now()),
  roundEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000),
  currentQuestion: { questionInstanceId: `challenge_${ROOM}_r1` },
});
await privateRef.set({
  schemaVersion: 2,
  roomId: ROOM,
  teacherEmail: TEACHER,
  scheduledRoundCount: SCHEDULED,
  questionIds: [authored.id, authored.id],
  roundStandards: { 0: 'texas:A.3(C)', 1: 'texas:A.3(C)' },
  roundMisses: {},
  roundAnswers: {},
  secondChanceOf: {},
});
await addPlayer(MISSER, 'pk-missed', 'Swift Otter');
await addPlayer(ACER, 'pk-aced', 'Bright Heron');

// Round 0: one student misses it, the other gets it.
await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM, roundIndex: 0, responsePayload: { responses: { answer: 'not-the-answer' } },
}, MISSER));
const acedOriginal = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM, roundIndex: 0, responsePayload: { responses: { answer: await correctAnswerFor(0) } },
}, ACER));

// Round 1: both correct, so only round 0 is a replay candidate.
await functionsIndex.advanceLiveChallenge.run(teacherRequest({ roomId: ROOM }));
for (const studentId of [MISSER, ACER]) {
  await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
    roomId: ROOM, roundIndex: 1, responsePayload: { responses: { answer: await correctAnswerFor(1) } },
  }, studentId));
}

// Past the end of the scheduled rounds: this is where a replay is scheduled.
const afterScheduled = await functionsIndex.advanceLiveChallenge.run(teacherRequest({ roomId: ROOM }));
const stateAfterPlan = (await privateRef.get()).data();
const roomAfterPlan = (await roomRef.get()).data();

test('running past the last scheduled round does not end the game when something was missed', () => {
  assert.notEqual(roomAfterPlan.status, 'finished');
  assert.equal(Number(roomAfterPlan.currentRound), SCHEDULED, 'the replay opens as the next round');
  assert.ok(afterScheduled, 'advance must return the opened round');
});

test('the replay is appended and mapped back to the round it replays', () => {
  assert.equal(stateAfterPlan.questionIds.length, SCHEDULED + 1);
  assert.equal(stateAfterPlan.secondChanceOf[String(SCHEDULED)], 0, 'round 2 replays round 0');
  assert.equal(
    stateAfterPlan.questionIds[SCHEDULED],
    stateAfterPlan.questionIds[0],
    'a replay must be the same question, not a new one',
  );
});

test('only the missed round comes back', () => {
  const replayed = Object.values(stateAfterPlan.secondChanceOf).map(Number);
  assert.deepEqual(replayed, [0], 'round 1 was answered correctly and must not return');
});

test('the original round count is preserved so the report can tell them apart', () => {
  assert.equal(Number(stateAfterPlan.scheduledRoundCount), SCHEDULED);
});

test('the plan is marked done, which is what stops a replay of a replay', () => {
  // Without this a class that keeps missing keeps generating replays and the
  // game never ends, in front of a room, during a lesson with ten minutes for it.
  assert.equal(stateAfterPlan.secondChancePlanned, true);
});

// The replay itself, answered correctly by the student who missed it.
const recovered = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM, roundIndex: SCHEDULED, responsePayload: { responses: { answer: await correctAnswerFor(SCHEDULED) } },
}, MISSER));

test('recovering on a replay pays recovery points, not a fresh full score', () => {
  assert.equal(recovered.isCorrect, true);
  assert.equal(recovered.secondChance, true, 'the round must be recognised as a replay');
  assert.ok(recovered.recoveryPoints > 0, 'the student who came back must be paid something');
  assert.equal(recovered.speedBonus, 0, 'a replay pays no speed bonus');
});

test('a student who was right the first time still outranks one who recovered', async () => {
  // The whole design rests on this. If recovering paid more than being right,
  // missing on purpose would be the winning strategy.
  const confirmed = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
    roomId: ROOM, roundIndex: SCHEDULED, responsePayload: { responses: { answer: await correctAnswerFor(SCHEDULED) } },
  }, ACER));
  const originalPlusConfirm = acedOriginal.pointsAwarded + confirmed.pointsAwarded;
  assert.ok(
    originalPlusConfirm > recovered.pointsAwarded,
    `being right first (${originalPlusConfirm}) must beat recovering (${recovered.pointsAwarded})`,
  );
});

test('advancing past the replays finishes the game rather than scheduling more', async () => {
  const finished = await functionsIndex.advanceLiveChallenge.run(teacherRequest({ roomId: ROOM }));
  assert.equal(finished.status, 'finished');
  const room = (await roomRef.get()).data();
  assert.equal(room.status, 'finished');
});

test('a game nobody missed ends instead of replaying', async () => {
  const cleanRoom = `${ROOM}-clean`;
  const cleanRef = db.collection('liveChallengeRooms').doc(cleanRoom);
  const cleanPrivate = db.collection('liveChallengePrivate').doc(cleanRoom);
  await db.recursiveDelete(cleanPrivate).catch(() => {});
  await cleanRef.set({
    schemaVersion: 2, title: 'Clean run', teacherEmail: TEACHER, status: 'running',
    roundCount: 1, roundSeconds: 60, currentRound: 0,
  });
  await cleanPrivate.set({
    schemaVersion: 2, roomId: cleanRoom, teacherEmail: TEACHER,
    scheduledRoundCount: 1, questionIds: [authored.id],
    roundStandards: { 0: 'texas:A.3(C)' }, roundMisses: {}, roundAnswers: { 0: 2 }, secondChanceOf: {},
  });
  const result = await functionsIndex.advanceLiveChallenge.run(teacherRequest({ roomId: cleanRoom }));
  assert.equal(result.status, 'finished', 'a question nobody missed never comes back');
});

test('the replay cap is a real bound, not an aspiration', () => {
  // Pure, but asserted here beside the wiring it protects: the scheduler can
  // never return more replays than the cap however many rounds were missed.
  const roundMisses = Object.fromEntries(Array.from({ length: 20 }, (unused, i) => [String(i), 5]));
  const replays = challenge.planSecondChanceRounds({ roundMisses, scheduledRoundCount: 20 });
  assert.ok(replays.length <= challenge.MAX_SECOND_CHANCE_ROUNDS);
  assert.ok(replays.length > 0);
});
