// A whole class answering at the same moment, against a real Firestore.
//
// HOW TO RUN:  npm run test:challenge-finish
//
// WHY. Everything else about scoring was tested one student at a time, which is
// the one way a Live Challenge is never played. Twenty-four students answer
// within a couple of seconds of each other, and every one of those submissions
// writes to the SAME private-state document — the per-round answered and missed
// tallies live there, because a running miss count on the room would tell a
// student how hard a question is before they reach it.
//
// That makes the private doc a write hot spot, and the failures it can produce
// are the quiet kind: a lost increment gives the report a wrong denominator, an
// aborted transaction tells one student their correct answer did not count, and
// neither shows up when you test with one student.
//
// WHAT THIS DOES AND DOES NOT PROVE. It proves correctness under concurrency —
// no lost updates, no cross-contamination between players, no double scoring.
// It does NOT prove throughput: the emulator does not enforce Firestore's
// per-document sustained write limit, so a pass here is not evidence that one
// document per submission is safe for a full class in production. That risk is
// real and recorded in docs/BACKLOG.md rather than implied to be handled.

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

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const db = admin.firestore();

const TEACHER = 'teacher@example.com';
const ROOM = 'concurrency-room';
const CLASS_SIZE = 24;
// Enough wrong answers that a lost miss-increment would change the replay list.
const WRONG_ANSWERERS = 7;

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

const correctAnswer = await (async () => {
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${ROOM}|0|${authored.id}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return plan.privateGrading.fields[0].expected;
})();

const roomRef = db.collection('liveChallengeRooms').doc(ROOM);
const privateRef = db.collection('liveChallengePrivate').doc(ROOM);
const students = Array.from({ length: CLASS_SIZE }, (unused, i) => `crowd-student-${String(i).padStart(2, '0')}`);

await db.recursiveDelete(privateRef).catch(() => {});
await db.recursiveDelete(roomRef).catch(() => {});
await db.collection('pathQuestionBank').doc(authored.id).set(authored);
await roomRef.set({
  schemaVersion: 2, title: 'Whole class', teacherEmail: TEACHER, status: 'running',
  roundCount: 1, roundSeconds: 120, currentRound: 0,
  roundStartedAt: admin.firestore.Timestamp.fromMillis(Date.now()),
  roundEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 900000),
  currentQuestion: { questionInstanceId: `challenge_${ROOM}_r1` },
});
await privateRef.set({
  schemaVersion: 2, roomId: ROOM, teacherEmail: TEACHER,
  scheduledRoundCount: 1, questionIds: [authored.id],
  roundStandards: { 0: 'texas:A.3(C)' }, roundMisses: {}, roundAnswers: {}, secondChanceOf: {},
});

// Seed the roster in batches rather than one await at a time.
for (let start = 0; start < students.length; start += 20) {
  const batch = db.batch();
  students.slice(start, start + 20).forEach((studentId, offset) => {
    const index = start + offset;
    batch.set(privateRef.collection('players').doc(studentId), {
      studentId, playerKey: `pk-${index}`, alias: `Player ${index}`, joined: true, joinedAtRound: 0,
      score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
    });
    batch.set(db.collection('liveChallengeInvites').doc(studentId), {
      roomId: ROOM, playerKey: `pk-${index}`, alias: `Player ${index}`, status: 'running', teacherEmail: TEACHER,
    });
  });
  await batch.commit();
}

// THE BELL. Every student answers at once — no stagger, no queue.
const startedAt = Date.now();
const settled = await Promise.allSettled(students.map((studentId, index) => (
  functionsIndex.submitLiveChallengeResponse.run(studentRequest({
    roomId: ROOM,
    roundIndex: 0,
    responsePayload: { responses: { answer: index < WRONG_ANSWERERS ? 'not-the-answer' : correctAnswer } },
  }, studentId))
)));
const elapsedMs = Date.now() - startedAt;

const rejected = settled.filter((entry) => entry.status === 'rejected');
const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
const finalPrivate = (await privateRef.get()).data();
const playerDocs = await privateRef.collection('players').get();
const publicDocs = await roomRef.collection('players').get();

test('every student in the class gets an answer recorded', () => {
  assert.equal(
    rejected.length,
    0,
    `${rejected.length} of ${CLASS_SIZE} submissions failed: ${rejected.slice(0, 3).map((r) => r.reason?.message).join(' | ')}`,
  );
  assert.equal(fulfilled.length, CLASS_SIZE);
});

test('the class was graded the way it answered', () => {
  const correct = fulfilled.filter((entry) => entry.value.isCorrect === true).length;
  assert.equal(correct, CLASS_SIZE - WRONG_ANSWERERS);
  assert.equal(fulfilled.length - correct, WRONG_ANSWERERS);
});

test('no increment is lost on the shared tally', () => {
  // This is the assertion the whole file exists for. Both counters live on one
  // document that every submission writes; a lost increment here silently gives
  // the report a wrong denominator and can change which questions come back.
  assert.equal(Number(finalPrivate.roundAnswers['0']), CLASS_SIZE, 'answered tally must count every student');
  assert.equal(Number(finalPrivate.roundMisses['0']), WRONG_ANSWERERS, 'miss tally must count every miss');
});

test('each player is scored once, and only their own answer', () => {
  assert.equal(playerDocs.size, CLASS_SIZE);
  let correct = 0;
  playerDocs.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    assert.equal(data.roundsAnswered, 1, `${data.studentId} must be recorded exactly once`);
    assert.equal(Number(data.answeredRound), 0);
    assert.deepEqual(data.answeredRounds.map(Number), [0]);
    assert.equal(data.correctCount, data.lastAnswerCorrect ? 1 : 0);
    if (data.lastAnswerCorrect) correct += 1;
  });
  assert.equal(correct, CLASS_SIZE - WRONG_ANSWERERS);
});

test('the public leaderboard has one row per student and leaks no identity', () => {
  assert.equal(publicDocs.size, CLASS_SIZE);
  publicDocs.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    assert.equal(data.studentId, undefined, 'a public row must never carry a student id');
    assert.ok(data.alias, 'a public row is identified by alias');
  });
});

test('one student double-tapping cannot score twice, even simultaneously', async () => {
  await roomRef.set({
    currentRound: 1,
    roundEndsAt: admin.firestore.Timestamp.fromMillis(Date.now() + 900000),
  }, { merge: true });
  await privateRef.set({ questionIds: [authored.id, authored.id] }, { merge: true });

  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${ROOM}|1|${authored.id}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  const answer = plan.privateGrading.fields[0].expected;

  const doubleTap = await Promise.allSettled([0, 1].map(() => (
    functionsIndex.submitLiveChallengeResponse.run(studentRequest({
      roomId: ROOM, roundIndex: 1, responsePayload: { responses: { answer } },
    }, students[0]))
  )));
  const accepted = doubleTap.filter((entry) => entry.status === 'fulfilled');
  assert.equal(accepted.length, 1, 'exactly one of two simultaneous submissions may be accepted');

  const record = (await privateRef.collection('players').doc(students[0]).get()).data();
  assert.equal(record.roundsAnswered, 2, 'one answer for round 0 and one for round 1, not three');
  assert.deepEqual(record.answeredRounds.map(Number).sort((a, b) => a - b), [0, 1]);
});

test('the whole class completing is reported, not silently slow', () => {
  // Not a pass/fail threshold — the emulator is not production. Printed so a
  // change that makes this dramatically worse is visible in CI output.
  console.log(`      ${CLASS_SIZE} concurrent submissions settled in ${elapsedMs}ms`);
  assert.ok(elapsedMs >= 0);
});
