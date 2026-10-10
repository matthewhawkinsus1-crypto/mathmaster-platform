// Extended time and the recap, played through the real callables against the
// emulator (npm run test:challenge-finish). The audit follow-ups of student
// push E: nothing public names a student with extended time — not the room
// when they join, not their public row when they answer after the class's
// deadline — and a recap never serves worked solutions while another game the
// student is in can still be answered.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
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

const TEACHER = 'accom-teacher@example.com';
// The integration files share one emulator and run in parallel; this suite's
// rooms draw only questions carrying its own standard.
const SUITE_STANDARD = 'ACCOMSUITE1';
const SUITE_ALIGNMENT_KEY = `texas:${SUITE_STANDARD}`;
const SUITE_SUFFIX = '--accom-suite';
const CLASS_ID = 'accom-class-p4';
const [R1, R2, R3] = ['accom-s1', 'accom-s2', 'accom-s3'];
const OUTSIDER = 'accom-outsider';

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
const failureOf = (promise) => promise.then(() => null, (error) => error);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const millis = (value) => value?.toMillis?.() ?? null;

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const solutionDoc = (roomId, round) => roomRef(roomId).collection('solutions').doc(String(round)).get();
const resultOf = async (roomId) => (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data() || null;

/* ---------- a class, a roster and a bank of gradable questions with solutions ---------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    // Every round of this suite must have a worked solution to reveal.
    if (!Array.isArray(item.solutionReview?.reasoning) || !item.solutionReview.reasoning.length) continue;
    const instantiated = await mathPath.instantiateQuestion(item, `accom-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= 3, 'the seed bank must hold at least three gradable choice questions with a solution review');
await Promise.all(bank.map((item) => {
  const id = `${item.id}${SUITE_SUFFIX}`;
  return db.collection('pathQuestionBank').doc(id).set({
    ...item, id, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, SUITE_ALIGNMENT_KEY],
  });
}));
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '3', name: 'Accommodations Period 4' });
for (const [index, studentId] of [R1, R2, R3].entries()) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '3', firstName: `Accom${index + 1}`, lastName: 'Student',
    // R2's plan gives extended time (the teacher UI's 'extra-time': 1.5×).
    ...(studentId === R2 ? { profile: { accommodations: ['extra-time'] } } : {}),
  });
}

const create = async (extra = {}) => (await call('createLiveChallenge', teacher({
  classId: CLASS_ID,
  courseId: 'algebra1',
  standardCode: SUITE_STANDARD,
  questionStyle: 'noTools',
  roundCount: 3,
  roundSeconds: 120,
  secondChanceMode: 'off',
  ...extra,
}))).roomId;

// The server's own answer key for the round, regenerated exactly as submit does.
const responseFor = async (roomId, roundIndex, { correct }) => {
  const state = (await privateRef(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  assert.ok(questionId.endsWith(SUITE_SUFFIX), `round ${roundIndex} drew ${questionId} from outside this suite`);
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return { responses: Object.fromEntries(plan.privateGrading.fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) };
};
const waitForRoundStart = async (roomId) => {
  const startsAtMs = millis((await roomOf(roomId)).startsAt) || 0;
  const delay = Math.max(0, startsAtMs - Date.now() + 25);
  if (delay) await sleep(delay);
};
const answer = async (roomId, studentId, { correct = true } = {}) => {
  const room = await roomOf(roomId);
  return call('submitLiveChallengeResponse', student(studentId, {
    roomId,
    roundIndex: room.currentRound,
    roundVersion: room.roundVersion,
    roundToken: room.roundToken,
    submissionId: randomUUID(),
    humanElapsedMs: 2_000,
    responsePayload: await responseFor(roomId, room.currentRound, { correct }),
  }));
};
const roundCommand = async (name, roomId, extra = {}) => {
  const room = await roomOf(roomId);
  return call(name, teacher({ roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion, ...extra }));
};
/** Play the open round: each [studentId, correct] answers, then the round closes. */
const playRound = async (roomId, answers) => {
  await waitForRoundStart(roomId);
  for (const [studentId, correct] of answers) {
    // eslint-disable-next-line no-await-in-loop
    await answer(roomId, studentId, { correct });
  }
  await roundCommand('closeLiveChallengeRound', roomId);
};


const publicRowOf = async (roomId, studentId) => {
  const key = (await privateRef(roomId).collection('players').doc(studentId).get()).data()?.playerKey;
  return (await roomRef(roomId).collection('players').doc(key).get()).data() || {};
};

const GA = await create({ roundCount: 1, roundSeconds: 15 });

test('joining with extended time leaves the room unchanged; the opening says only that someone has it', async () => {
  await call('joinLiveChallenge', student(R1, { roomId: GA }));
  const before = await roomOf(GA);
  const joined = await call('joinLiveChallenge', student(R2, { roomId: GA }));
  assert.equal(joined.timeMultiplier, 1.5, 'the student is told their own multiplier');
  const after = await roomOf(GA);
  assert.equal(after.maxTimeMultiplier, undefined);
  assert.equal(after.extendedTimeInPlay, false);
  assert.equal(millis(after.updatedAt), millis(before.updatedAt), 'the room was not written by the join');
  assert.equal((await db.collection('liveChallengeInvites').doc(R2).get()).data()?.timeMultiplier, 1.5, 'their own invite carries it');
  assert.equal((await publicRowOf(GA, R2)).timeMultiplier, undefined, 'their public row never does');
  await call('startLiveChallenge', teacher({ roomId: GA }));
  assert.equal((await roomOf(GA)).extendedTimeInPlay, true);
});

test('an answer after the class deadline stays off the public row until the round closes, and the round waits for it', async () => {
  await waitForRoundStart(GA);
  await answer(GA, R1, { correct: true });
  assert.equal((await publicRowOf(GA, R1)).answeredRound, 0, 'an on-time answer is public at once');
  const room = await roomOf(GA);
  const classEndsAtMs = millis(room.endsAt);
  await sleep(Math.max(0, classEndsAtMs - Date.now() + 1_500));
  // Past the class's deadline: the round is not ready while R2 is inside theirs.
  const early = await failureOf(roundCommand('closeLiveChallengeRound', GA));
  assert.equal(early?.details?.lifecycle, 'round_in_progress');
  assert.equal(early?.details?.readiness, 'extended_time');
  // The class's time is up, R2's is not: no worked solution exists yet.
  assert.equal((await roomRef(GA).collection('solutions').doc('0').get()).exists, false);
  assert.deepEqual((await roomOf(GA)).revealedSolutionRounds || [], []);
  const publicBefore = await publicRowOf(GA, R2);
  const graded = await answer(GA, R2, { correct: true });
  assert.equal(graded.isCorrect, true, 'accepted inside their own deadline');
  // An accommodation costs no points: scored for speed against their own round.
  assert.notEqual(graded.speedTier, 'expired', `speed tier ${graded.speedTier}`);
  const publicAfterAnswer = await publicRowOf(GA, R2);
  assert.equal(publicAfterAnswer.answeredRound, publicBefore.answeredRound, 'nothing public moved');
  assert.equal(publicAfterAnswer.score, publicBefore.score);
  assert.equal((await privateRef(GA).collection('players').doc(R2).get()).data()?.publicRowPendingRound, 0);
  await roundCommand('closeLiveChallengeRound', GA);
  const publicAfterClose = await publicRowOf(GA, R2);
  assert.equal(publicAfterClose.answeredRound, 0, 'the close publishes it with everyone else\'s');
  assert.ok(publicAfterClose.score > 0);
  assert.equal((await privateRef(GA).collection('players').doc(R2).get()).data()?.publicRowPendingRound, null);
});

test('a recap withholds worked solutions while the student is in another game that can still be answered', async () => {
  await call('finishLiveChallenge', teacher({ roomId: GA }));
  const open = await call('getLiveChallengeMatchRecap', student(R1, { roomId: GA }));
  assert.equal(open.solutionsWithheld, false);
  assert.ok(open.rounds.every((round) => round.solutionAvailable && round.solutionReview));
  // Play Again: the class's invites move to a new lobby, which may draw the same questions.
  const GB = await create({ roundCount: 1, roundSeconds: 15 });
  const withheld = await call('getLiveChallengeMatchRecap', student(R1, { roomId: GA }));
  assert.equal(withheld.solutionsWithheld, true);
  assert.ok(withheld.rounds.every((round) => round.solutionAvailable === false && round.solutionReview === null));
  assert.equal(withheld.rounds[0].isCorrect, true, 'how they did is still there');
  await call('cancelLiveChallenge', teacher({ roomId: GB }));
  const after = await call('getLiveChallengeMatchRecap', student(R1, { roomId: GA }));
  assert.equal(after.solutionsWithheld, false, 'back once that game ended');
});

test('a round waits for an extended-time student who has not answered until their own deadline has passed', async () => {
  const GC = await create({ roundCount: 1, roundSeconds: 15 });
  await call('joinLiveChallenge', student(R1, { roomId: GC }));
  await call('joinLiveChallenge', student(R2, { roomId: GC }));
  await call('startLiveChallenge', teacher({ roomId: GC }));
  await waitForRoundStart(GC);
  await answer(GC, R1, { correct: true });
  const room = await roomOf(GC);
  const startsAtMs = millis(room.startsAt);
  const classEndsAtMs = millis(room.endsAt);
  const personalEndsAtMs = startsAtMs + Math.round(Number(room.activeRoundSeconds) * 1000 * 1.5);
  await sleep(Math.max(0, classEndsAtMs - Date.now() + 1_500));
  const held = await failureOf(roundCommand('closeLiveChallengeRound', GC));
  assert.equal(held?.details?.readiness, 'extended_time', 'past the class deadline, inside R2\'s');
  assert.equal((await roomRef(GC).collection('solutions').doc('0').get()).exists, false);
  // After their deadline and the arrival grace, the round closes without them.
  await sleep(Math.max(0, personalEndsAtMs - Date.now() + 1_500));
  await roundCommand('closeLiveChallengeRound', GC);
  assert.equal((await roomOf(GC)).roundState, 'closed');
  assert.equal((await roomRef(GC).collection('solutions').doc('0').get()).exists, true);
  await call('finishLiveChallenge', teacher({ roomId: GC }));
});

test('a student with extended time who joins mid-round: the held close, not the join, tells the room', async () => {
  const GD = await create({ roundCount: 1, roundSeconds: 15 });
  await call('joinLiveChallenge', student(R1, { roomId: GD }));
  await call('startLiveChallenge', teacher({ roomId: GD }));
  assert.equal((await roomOf(GD)).extendedTimeInPlay, false, 'nobody with extended time when the round opened');
  await waitForRoundStart(GD);
  const beforeJoin = await roomOf(GD);
  await call('joinLiveChallenge', student(R2, { roomId: GD }));
  const afterJoin = await roomOf(GD);
  assert.equal(afterJoin.extendedTimeInPlay, false);
  assert.equal(millis(afterJoin.updatedAt), millis(beforeJoin.updatedAt), 'the join did not write the room');
  await answer(GD, R1, { correct: true });
  await sleep(Math.max(0, millis(afterJoin.endsAt) - Date.now() + 1_500));
  // The host's close at the class's deadline is refused for R2's time, and
  // the room learns that someone is still finishing.
  const held = await failureOf(roundCommand('closeLiveChallengeRound', GD));
  assert.equal(held?.details?.readiness, 'extended_time');
  const waiting = await roomOf(GD);
  assert.equal(waiting.extendedTimeInPlay, true);
  assert.equal(waiting.roundState, 'open');
  // A second refusal changes nothing more.
  await failureOf(roundCommand('closeLiveChallengeRound', GD));
  assert.equal(millis((await roomOf(GD)).updatedAt), millis(waiting.updatedAt));
  await roundCommand('closeLiveChallengeRound', GD, { force: true });
  assert.equal((await roomOf(GD)).roundState, 'closed');
  await call('finishLiveChallenge', teacher({ roomId: GD }));
});
