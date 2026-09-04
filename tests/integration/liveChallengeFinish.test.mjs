// Finish a real Live Challenge against a real Firestore, and read what landed.
//
// HOW TO RUN:  npm run test:challenge-finish
//
// WHY. The report, the Warm-Up credit and the mastery evidence were verified by
// asserting on the SOURCE of finishLiveChallengeRoom — that the calls appear,
// in the right order, above deletePrivateChallengeState. That is worth having,
// but it cannot tell you whether the documents that actually land are the
// documents intended: a wrong field path, a merge that clobbers, a batch that
// silently writes nothing, and every one of those source tests still passes.
//
// This runs the real exported Cloud Function with a synthetic auth context
// (v2 onCall exposes `.run`, so no production code is changed to make it
// testable) against the Firestore emulator, then reads the result back.
//
// It writes mastery evidence, which is the piece of this feature that touches
// data a teacher would have to unpick by hand if it were wrong.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through npm run test:challenge-finish, never against a real project.',
);

// functions/index.js calls initializeApp() at module load, so it is required
// FIRST and owns the default app. Initializing here as well produced
// app/duplicate-app and took the whole suite down before a single assertion ran.

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
const db = admin.firestore();

const TEACHER = 'teacher@example.com';
const ASSIGNMENT = 'assignment-warmup-1';
const ROOM = 'finish-harness-room';

const teacherRequest = (data) => ({
  auth: { uid: 'teacher-uid', token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

// Two standards across four scheduled rounds, plus a fifth round that is a
// second chance at round 1 — the shape that separates "answered it" from
// "answered it again after seeing it".
const ROUND_STANDARDS = {
  0: 'texas:A.3(C)', 1: 'texas:A.3(C)', 2: 'texas:A.3(C)', 3: 'texas:A.5(A)', 4: 'texas:A.3(C)',
};

const seed = async () => {
  await db.recursiveDelete(db.collection('liveChallengeRooms').doc(ROOM)).catch(() => {});
  await db.recursiveDelete(db.collection('liveChallengePrivate').doc(ROOM)).catch(() => {});
  for (const id of ['student-played', 'student-absent']) {
    await db.collection('grades').doc(id).delete().catch(() => {});
    await db.recursiveDelete(db.collection('grades').doc(id).collection('evidenceEvents')).catch(() => {});
  }
  await db.collection('liveChallengeReports').doc(ROOM).delete().catch(() => {});

  await db.collection('liveChallengeRooms').doc(ROOM).set({
    schemaVersion: 2,
    title: 'Period 3 Warm-Up Challenge',
    teacherEmail: TEACHER,
    assignmentId: ASSIGNMENT,
    classId: 'class-1',
    status: 'running',
    roundCount: 4,
    roundSeconds: 30,
    currentRound: 3,
    eligibleCount: 2,
  });
  await db.collection('liveChallengePrivate').doc(ROOM).set({
    schemaVersion: 2,
    roomId: ROOM,
    teacherEmail: TEACHER,
    scheduledRoundCount: 4,
    questionIds: ['q0', 'q1', 'q2', 'q3'],
    roundStandards: ROUND_STANDARDS,
    // DELIBERATELY LEFT IN. Nothing writes these any more; a room created
    // before the tallies became derived still carries them, and this room is
    // the stand-in for one caught mid-flight across that deploy. Keeping them
    // here is what exercises the fallback that stops such a game losing its
    // miss list halfway through.
    roundMisses: { 1: 1 },
    roundAnswers: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
    secondChanceOf: { 4: 1 },
  });
  // Answered rounds 0,1,2,3 and the replay 4. Missed round 1 the first time.
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('student-played').set({
    studentId: 'student-played', playerKey: 'pk-1', alias: 'Swift Otter', joined: true,
    joinedAtRound: 0, score: 3000, correctCount: 3, roundsAnswered: 4,
    answeredRounds: [0, 1, 2, 3, 4], missedRounds: [1],
  });
  // Never joined. Must produce no credit and no evidence at all.
  await db.collection('liveChallengePrivate').doc(ROOM).collection('players').doc('student-absent').set({
    studentId: 'student-absent', playerKey: 'pk-2', alias: 'Bright Heron', joined: false,
    score: 0, correctCount: 0, roundsAnswered: 0, answeredRounds: [], missedRounds: [],
  });
  await db.collection('liveChallengeTeacherActive').doc(TEACHER).set({ roomId: ROOM });
};

await seed();
const result = await functionsIndex.finishLiveChallenge.run(teacherRequest({ roomId: ROOM }));

test('the room finishes', () => {
  assert.equal(result.status, 'finished');
  assert.equal(result.roomId, ROOM);
});

test('the private state it read is gone afterwards', () => {
  // The whole ordering argument depends on this actually happening.
  return db.collection('liveChallengePrivate').doc(ROOM).get().then((snapshot) => {
    const data = snapshot.exists ? snapshot.data() : {};
    assert.equal(data.questionIds, undefined, 'question ids must not survive a finished game');
  });
});

test('a report was written, and it survived the delete', async () => {
  const report = await db.collection('liveChallengeReports').doc(ROOM).get();
  assert.ok(report.exists, 'the report must exist');
  const data = report.data();
  assert.equal(data.teacherEmail, TEACHER);
  assert.equal(data.status, 'finished');
  assert.ok(JSON.stringify(data).length > 50, 'an empty report is the failure this ordering exists to prevent');
});

test('the assignment records participation and accuracy for the student who played', async () => {
  const grades = await db.collection('grades').doc('student-played').get();
  assert.ok(grades.exists, 'a credit record must exist');
  const credit = (grades.data().warmupChallengeByAssignment || {})[ASSIGNMENT];
  assert.ok(credit, 'credit must be filed under the assignment id');
  assert.equal(credit.answered, 4);
  assert.equal(credit.correct, 3);
  assert.equal(credit.roundsAvailable, 4);
  assert.equal(credit.participationPercent, 100);
  assert.equal(credit.accuracyPercent, 75);
});

test('no challenge score reaches the assignment record', async () => {
  const grades = await db.collection('grades').doc('student-played').get();
  const credit = (grades.data().warmupChallengeByAssignment || {})[ASSIGNMENT];
  for (const banned of ['score', 'points', 'streak', 'rank', 'alias', 'totalScore']) {
    assert.equal(credit[banned], undefined, `${banned} must never reach the assignment`);
  }
});

test('a student who never joined gets no credit at all', async () => {
  const grades = await db.collection('grades').doc('student-absent').get();
  const credit = grades.exists ? (grades.data().warmupChallengeByAssignment || {})[ASSIGNMENT] : undefined;
  assert.equal(credit, undefined, 'an absence is not a zero');
});

test('mastery evidence is written per standard, with the replay excluded', async () => {
  const events = await db.collection('grades').doc('student-played').collection('evidenceEvents').get();
  const byStandard = new Map();
  events.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    if (data.source?.kind !== 'liveChallenge') return;
    byStandard.set(data.alignmentKeys[0], data);
  });

  assert.equal(byStandard.size, 2, 'one event per standard answered');

  // Rounds 0, 1, 2 are A.3(C); round 1 was missed; round 4 is the replay and
  // must not count again even though it was answered correctly.
  const three = byStandard.get('texas:A.3(C)');
  assert.ok(three, 'A.3(C) evidence must exist');
  assert.equal(three.performance.roundsAnswered, 3);
  assert.equal(three.performance.roundsCorrect, 2);
  assert.equal(three.performance.score, 2 / 3);

  const five = byStandard.get('texas:A.5(A)');
  assert.equal(five.performance.roundsAnswered, 1);
  assert.equal(five.performance.score, 1);

  for (const event of byStandard.values()) {
    assert.equal(event.source.activityRole, 'liveChallenge');
    assert.equal(event.performance.isMathematicallyIndependent, true);
    assert.match(event.conditions, /Timed/);
  }
});

test('a student who never joined leaves no mastery evidence', async () => {
  const events = await db.collection('grades').doc('student-absent').collection('evidenceEvents').get();
  const mine = events.docs.filter((d) => d.data().source?.kind === 'liveChallenge');
  assert.equal(mine.length, 0);
});

test('finishing twice does not double-count the evidence', async () => {
  // The finish is retried in the wild — a timeout, a teacher tapping again.
  await db.collection('liveChallengeTeacherActive').doc(TEACHER).set({ roomId: ROOM });
  await db.collection('liveChallengeRooms').doc(ROOM).set({ status: 'running' }, { merge: true });
  await functionsIndex.finishLiveChallenge.run(teacherRequest({ roomId: ROOM })).catch(() => null);

  const events = await db.collection('grades').doc('student-played').collection('evidenceEvents').get();
  const mine = events.docs.filter((d) => d.data().source?.kind === 'liveChallenge');
  assert.equal(mine.length, 2, 'a stable event id per student and standard is what prevents a second game');
});
