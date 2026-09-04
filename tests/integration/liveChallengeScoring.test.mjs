// Score a real Live Challenge against a real Firestore.
//
// HOW TO RUN:  npm run test:challenge-finish   (runs every tests/integration suite)
//
// WHY. Comeback points, second-chance rounds, the answered-round record that
// mastery evidence is derived from, and the join round that gives a late
// arrival an honest denominator had all been verified by unit-testing the pure
// scorer and grepping the server source. None of them had ever executed against
// a database. The scorer being right does not mean the transaction that calls
// it writes what the scorer returned.
//
// The questions are real bank questions, seeded into the emulator and graded by
// the real grader. The correct answer is derived the way the server derives it
// — same instantiate seed key — so "correct" here means correct, not a value
// the test decided to call correct.

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
const db = admin.firestore();

const TEACHER = 'teacher@example.com';
const ROOM = 'scoring-harness-room';
const STUDENT = 'student-scoring';

const teacherRequest = (data) => ({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const studentRequest = (data, studentId = STUDENT) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

// A real, issuable, choice-only bank question.
const findQuestion = async () => {
  const dir = path.join(repo, 'functions/seeds/pathQuestionBank');
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : (parsed.documents || []);
    for (const item of items) {
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

// The server regenerates each round from `challenge|room|round|questionId`.
// Deriving the answer the same way is what makes a "correct" submission here
// genuinely correct rather than agreed-upon.
const correctAnswerFor = async (roundIndex) => {
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${ROOM}|${roundIndex}|${authored.id}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return plan.privateGrading.fields[0].expected;
};

const ROUNDS = 3;

const seed = async () => {
  await db.recursiveDelete(db.collection('liveChallengePrivate').doc(ROOM)).catch(() => {});
  await db.collection('liveChallengeRooms').doc(ROOM).delete().catch(() => {});
  await db.collection('pathQuestionBank').doc(authored.id).set(authored);
  await db.collection('liveChallengeRooms').doc(ROOM).set({
    schemaVersion: 2,
    title: 'Scoring harness',
    teacherEmail: TEACHER,
    status: 'running',
    roundCount: ROUNDS,
    roundSeconds: 60,
    currentRound: 0,
    roundStartedAt: admin.firestore.Timestamp.fromMillis(Date.now()),
    roundEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000),
    currentQuestion: { questionInstanceId: `challenge_${ROOM}_r1` },
  });
  await db.collection('liveChallengePrivate').doc(ROOM).set({
    schemaVersion: 2,
    roomId: ROOM,
    teacherEmail: TEACHER,
    scheduledRoundCount: ROUNDS,
    questionIds: Array.from({ length: ROUNDS }, () => authored.id),
    roundStandards: Object.fromEntries(Array.from({ length: ROUNDS }, (unused, i) => [String(i), 'texas:A.3(C)'])),
    roundMisses: {},
    roundAnswers: {},
    secondChanceOf: {},
  });
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).set({
    studentId: STUDENT, playerKey: 'pk-scoring', alias: 'Swift Otter', joined: true,
    score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
  });
  await db.collection('liveChallengeInvites').doc(STUDENT).set({
    roomId: ROOM, playerKey: 'pk-scoring', alias: 'Swift Otter', status: 'running', teacherEmail: TEACHER,
  });
};

const player = async () => (
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc(STUDENT).get()
).data();

const openRound = async (roundIndex) => {
  await db.collection('liveChallengeRooms').doc(ROOM).set({
    currentRound: roundIndex,
    roundStartedAt: admin.firestore.Timestamp.fromMillis(Date.now()),
    roundEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000),
  }, { merge: true });
};

await seed();

// Round 0, answered WRONG on purpose.
const missed = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM, roundIndex: 0, responsePayload: { responses: { answer: 'definitely-not-the-answer' } },
}));

// STILL ON ROUND 0. node:test runs test() bodies after this file's top-level
// code finishes, by which point the room has moved on — so anything that
// depends on WHICH round is open has to happen here, not inside a test.
const scoreAfterMiss = await player();
const duplicateError = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM, roundIndex: 0, responsePayload: { responses: { answer: await correctAnswerFor(0) } },
})).then(() => null, (error) => error);
const scoreAfterDuplicate = await player();

test('a wrong answer scores nothing and is recorded as a miss', async () => {
  assert.equal(missed.isCorrect, false);
  assert.equal(missed.pointsAwarded, 0);
  const record = await player();
  assert.equal(record.lastAnswerCorrect, false);
  assert.deepEqual(record.missedRounds.map(Number), [0]);
});

test('the answered round is recorded, which is what mastery evidence is built from', async () => {
  const record = await player();
  assert.deepEqual(record.answeredRounds.map(Number), [0]);
});

test('the same round cannot be answered twice', () => {
  // Attempted at the top level, while round 0 was still the open round, and
  // with the RIGHT answer the second time: a student who realises their mistake
  // cannot re-answer, and a double-tap cannot score twice.
  assert.ok(duplicateError, 'the second submission must be rejected');
  assert.match(String(duplicateError.message), /already answered/i);
  assert.equal(duplicateError.code, 'already-exists');
});

test('a rejected duplicate does not change the score', () => {
  assert.equal(scoreAfterDuplicate.score, scoreAfterMiss.score);
  assert.equal(scoreAfterDuplicate.roundsAnswered, scoreAfterMiss.roundsAnswered);
  assert.deepEqual(scoreAfterDuplicate.answeredRounds.map(Number), scoreAfterMiss.answeredRounds.map(Number));
});

// Round 1, answered CORRECTLY — straight after a miss.
await openRound(1);
const comeback = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
  roomId: ROOM, roundIndex: 1, responsePayload: { responses: { answer: await correctAnswerFor(1) } },
}));

test('a correct answer straight after a miss pays comeback points', () => {
  assert.equal(comeback.isCorrect, true, 'the derived answer must actually be correct');
  assert.ok(comeback.comebackBonus > 0, 'the student who recovered must be paid for it');
  assert.ok(comeback.pointsAwarded > comeback.comebackBonus, 'the comeback is a bonus on top of the base');
});

test('the comeback is not paid twice for one recovery', async () => {
  await openRound(2);
  const second = await functionsIndex.submitLiveChallengeResponse.run(studentRequest({
    roomId: ROOM, roundIndex: 2, responsePayload: { responses: { answer: await correctAnswerFor(2) } },
  }));
  assert.equal(second.isCorrect, true);
  assert.equal(second.comebackBonus, 0, 'a second correct answer in a row is a streak, not a comeback');
  assert.ok(second.streakBonus >= 0);
});

test('every answered round is accumulated, not overwritten', async () => {
  const record = await player();
  assert.deepEqual(record.answeredRounds.map(Number).sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(record.roundsAnswered, 3);
  assert.equal(record.correctCount, 2);
});

test('the room tallies which rounds the class missed', async () => {
  const privateState = (await db.collection('liveChallengePrivate').doc(ROOM).get()).data();
  assert.equal(Number(privateState.roundMisses['0']), 1, 'round 0 was missed by one student');
  assert.equal(privateState.roundMisses['1'], undefined, 'round 1 was answered correctly');
});

/* ---------- the join round, which decides a late arrival's denominator ---------- */

test('joining records the round the student walked in on', async () => {
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('late-student').set({
    studentId: 'late-student', playerKey: 'pk-late', alias: 'Bright Heron', joined: false,
    score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
  });
  await db.collection('liveChallengeInvites').doc('late-student').set({
    roomId: ROOM, playerKey: 'pk-late', alias: 'Bright Heron', status: 'running', teacherEmail: TEACHER,
  });
  await openRound(2);
  await functionsIndex.joinLiveChallenge.run(studentRequest({ roomId: ROOM }, 'late-student'));

  const record = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('late-student').get()).data();
  assert.equal(record.joined, true);
  assert.equal(Number(record.joinedAtRound), 2, 'a student who arrives at round 2 is measured from round 2');
});

test('a rejoin does not move the join round', async () => {
  // This is the Chromebook-waking-from-sleep case. Recomputing would shrink the
  // denominator of the one student whose device failed them.
  await openRound(2);
  await functionsIndex.joinLiveChallenge.run(studentRequest({ roomId: ROOM }, 'late-student'));
  const record = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('late-student').get()).data();
  assert.equal(Number(record.joinedAtRound), 2, 'rejoining is not arriving');
});

test('a student who joined in the lobby is measured against the whole game', async () => {
  await db.collection('liveChallengeRooms').doc(ROOM).set({ status: 'lobby', currentRound: -1 }, { merge: true });
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('lobby-student').set({
    studentId: 'lobby-student', playerKey: 'pk-lobby', alias: 'Calm Lynx', joined: false,
    score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
  });
  await db.collection('liveChallengeInvites').doc('lobby-student').set({
    roomId: ROOM, playerKey: 'pk-lobby', alias: 'Calm Lynx', status: 'invited', teacherEmail: TEACHER,
  });
  await functionsIndex.joinLiveChallenge.run(studentRequest({ roomId: ROOM }, 'lobby-student'));
  const record = (await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('lobby-student').get()).data();
  assert.equal(Number(record.joinedAtRound), 0, 'a lobby join counts from round zero, not from -1');
});
