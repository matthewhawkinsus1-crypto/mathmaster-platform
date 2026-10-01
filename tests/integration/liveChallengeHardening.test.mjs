// The Live Challenge production-hardening fixes, through the real callables
// against a real Firestore. Run through `npm run test:challenge-finish`.
//
// Each case is a defect found by playing whole games against the real server
// (docs/qa/live-challenge-hardening-2026-10-01.md), held here end to end:
//
//   - END GAME DURING A 3-2-1: the round that never started is not ranked and
//     not counted as played, so it cannot cost anyone the Finisher reward;
//   - A GAME ENDED EARLY measures Finisher against the rounds it played;
//   - TWO CREATES AT ONCE (two tabs): one lobby, the other retired before it
//     invited anyone, and the class's invites and the teacher's pointer agree;
//   - NAMES AFTER THE GAME: the console's roster survives finalization;
//   - A CLASS ANSWERING AT ONCE: the closing threshold starts the countdown
//     exactly once, and no answer waits on the room;
//   - ANSWER IDS can never be a server receipt's key; progress is never
//     recorded before a round starts, and an answer sent then is told to
//     wait for GO; code names are not in roster order;
//   - a Warm-Up link must be this class's assignment; a finished room's
//     experience settings no longer change.

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
const functionsEntry = require(path.join(repo, 'functions/entry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const db = admin.firestore();

const TEACHER = 'hardening-teacher@example.com';
// The integration files share one emulator and run in parallel; these rooms
// draw only questions carrying this suite's own standard.
const SUITE_STANDARD = 'HARDENSUITE1';
const SUITE_ALIGNMENT_KEY = `texas:${SUITE_STANDARD}`;
const CLASS_ID = 'hardening-class-p2';
const OTHER_CLASS_ID = 'hardening-class-p5';
const STUDENTS = Array.from({ length: 12 }, (_, index) => `hardening-s${String(index + 1).padStart(2, '0')}`);

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
// See liveChallengeEngine.test.mjs: the emulator can close a transaction under
// the parallel suites' load; every lifecycle command is safe to resend.
const emulatorClosedTransaction = (error) => error?.code === 3 && /Transaction is invalid or closed/i.test(String(error?.message || ''));
const call = async (name, request) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await functionsIndex[name].run(request);
    } catch (error) {
      if (name === 'createLiveChallenge' || attempt >= 3 || !emulatorClosedTransaction(error)) throw error;
    }
  }
};
const failureOf = (promise) => promise.then(() => null, (error) => error);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const resultOf = async (roomId) => (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data() || null;

/* ---------- a class, a roster and a bank of gradable questions ---------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(item, `hardening-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    // eslint-disable-next-line no-await-in-loop
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 8) break;
  }
  if (bank.length >= 8) break;
}
assert.ok(bank.length >= 5, 'the seed bank must hold at least five gradable choice questions');
await Promise.all(bank.map((item) => {
  const id = `${item.id}--hardening-suite`;
  return db.collection('pathQuestionBank').doc(id).set({
    ...item, id, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, SUITE_ALIGNMENT_KEY],
  });
}));
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '2', name: 'Hardening Period 2' });
await db.collection('classes').doc(OTHER_CLASS_ID).set({ teacherOfRecord: 'someone-else@example.com', status: 'active', course: 'algebra1', period: '5', name: 'Elsewhere Period 5' });
const FIRST = ['Ana', 'Ben', 'Cara', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jon', 'Kai', 'Lia'];
for (const [index, studentId] of STUDENTS.entries()) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '2', firstName: FIRST[index], lastName: 'Hardening',
  });
}

const create = (extra = {}) => call('createLiveChallenge', teacher({
  classId: CLASS_ID,
  courseId: 'algebra1',
  standardCode: SUITE_STANDARD,
  questionStyle: 'noTools',
  roundCount: 3,
  roundSeconds: 30,
  ...extra,
}));

// One game at a time for this teacher: each case cancels what it leaves open.
const clearActive = async () => {
  const pointer = (await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).data();
  if (pointer?.roomId) await failureOf(call('cancelLiveChallenge', teacher({ roomId: pointer.roomId })));
};

const answerFields = async (roomId, roundIndex) => {
  const state = (await privateRef(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  return (await mathPath.buildIssuePlan(instantiated.question)).privateGrading.fields;
};
const answer = async (roomId, studentId, { room, fields, correct = true, submissionId = randomUUID() }) => call('submitLiveChallengeResponse', student(studentId, {
  roomId,
  roundIndex: room.currentRound,
  roundVersion: room.roundVersion,
  roundToken: room.roundToken,
  submissionId,
  humanElapsedMs: 2_000,
  responsePayload: { responses: Object.fromEntries(fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) },
}));
const untilStarted = async (roomId) => {
  const room = await roomOf(roomId);
  const wait = (room.startsAt?.toMillis?.() || 0) - Date.now();
  if (wait > 0) await sleep(wait + 60);
  return roomOf(roomId);
};
const expectation = (room) => ({ expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion });

/* ================= End Game during the 3-2-1 of round 3 ================= */

test('End Game during a round\'s countdown: that round is neither ranked nor played, and Finisher measures what was', async () => {
  await clearActive();
  const { roomId } = await create();
  const players = STUDENTS.slice(0, 4);
  for (const studentId of players) {
    // eslint-disable-next-line no-await-in-loop
    await call('joinLiveChallenge', student(studentId, { roomId }));
  }
  await call('startLiveChallenge', teacher({ roomId }));
  for (let round = 0; round < 2; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    const room = await untilStarted(roomId);
    // eslint-disable-next-line no-await-in-loop
    const fields = await answerFields(roomId, room.currentRound);
    // eslint-disable-next-line no-await-in-loop
    for (const studentId of players) await answer(roomId, studentId, { room, fields });
    // eslint-disable-next-line no-await-in-loop
    await call('closeLiveChallengeRound', teacher({ roomId, ...expectation(room) }));
    // eslint-disable-next-line no-await-in-loop
    await call('advanceLiveChallenge', teacher({ roomId, ...expectation(room) }));
  }
  // Next Round opened round 3; the bell rings during its 3-2-1.
  const counting = await roomOf(roomId);
  assert.equal(counting.currentRound, 2);
  assert.ok(counting.startsAt.toMillis() > Date.now(), 'round 3 is still counting down');
  await call('finishLiveChallenge', teacher({ roomId }));

  const result = await resultOf(roomId);
  assert.equal(result.status, 'finished');
  assert.equal(result.playedRoundCount, 2, 'only the two rounds that started were played');
  assert.equal((await roomRef(roomId).collection('rounds').doc('2').get()).exists, false, 'the round nobody could answer has no results');
  const job = (await db.collection('liveChallengeAchievementJobs').doc(roomId).get()).data();
  const finishers = (job?.awards || []).filter((award) => award.ruleId === 'challengeFinisher').map((award) => award.studentId).sort();
  assert.deepEqual(finishers, [...players].sort(), 'everyone answered every round that was played');
  const report = (await db.collection('liveChallengeReports').doc(roomId).get()).data();
  assert.equal(report.scheduledRoundCount, 3);
  assert.equal(report.playedRoundCount, 2, 'the report says the game ended after two of three rounds');

  // NAMES AFTER THE GAME: the private roster is gone; the console still has names.
  assert.equal((await privateRef(roomId).get()).exists, false, 'finalization removed the private state');
  const roster = await call('getLiveChallengeHostRoster', teacher({ roomId }));
  assert.equal(roster.players.length, 12, 'every invited student, joined or not');
  for (const entry of roster.players) {
    const standing = result.standings.find((row) => row.playerKey === entry.playerKey);
    // eslint-disable-next-line no-await-in-loop
    const grade = (await db.collection('grades').doc(standing.studentId).get()).data();
    assert.equal(entry.name, `${grade.firstName} ${grade.lastName}`, 'each name is paired with its own player key');
    assert.equal(entry.alias, standing.alias);
  }
  assert.ok(!JSON.stringify(roster).includes('hardening-s'), 'the roster names students; it never carries their ids');

  // A finished room's experience settings no longer change.
  const late = await failureOf(functionsEntry.configureLiveChallengeExperience.run(teacher({ roomId, speedInfluencePercent: 0, playerDisplayMode: 'fullName' })));
  assert.equal(late?.code, 'failed-precondition');
  assert.equal((await privateRef(roomId).collection('players').get()).size, 0, 'nothing recreated the cleaned-up private rows');
});

/* =========================== two creates at once =========================== */

test('two creates at once (two tabs) build one lobby; the other is retired before inviting anyone', async () => {
  await clearActive();
  // Titles unique to this run, so the rooms it leaves are the ones it counts.
  const titles = [`Tab A ${randomUUID().slice(0, 8)}`, `Tab B ${randomUUID().slice(0, 8)}`];
  const [first, second] = await Promise.allSettled([create({ title: titles[0] }), create({ title: titles[1] })]);
  const won = [first, second].filter((outcome) => outcome.status === 'fulfilled');
  const lost = [first, second].filter((outcome) => outcome.status === 'rejected');
  assert.equal(won.length, 1, 'exactly one create builds a lobby');
  assert.equal(lost.length, 1);
  const { roomId } = won[0].value;
  assert.equal(lost[0].reason?.code, 'failed-precondition');
  assert.equal(lost[0].reason?.details?.roomId, roomId, 'the losing tab is told which game to reopen');

  const pointer = (await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).data();
  assert.equal(pointer.roomId, roomId);
  const invites = await Promise.all(STUDENTS.map((studentId) => db.collection('liveChallengeInvites').doc(studentId).get()));
  assert.ok(invites.every((invite) => invite.data()?.roomId === roomId), 'every invite points at the lobby the teacher sees');
  const lobbies = (await db.collection('liveChallengeRooms').where('teacherEmail', '==', TEACHER).where('status', '==', 'lobby').get()).docs
    .filter((doc) => titles.includes(doc.data().title)).map((doc) => doc.id);
  assert.deepEqual(lobbies, [roomId], 'no orphaned lobby is left behind');
  const retired = (await db.collection('liveChallengeRooms').where('teacherEmail', '==', TEACHER).get()).docs
    .filter((doc) => titles.includes(doc.data().title) && doc.id !== roomId);
  assert.equal(retired.length, 1, 'the losing create left exactly one room behind');
  assert.equal(retired[0].data().status, 'cancelled', 'retired: nothing can join or reopen it');
  assert.equal(retired[0].data().staleSession, true);
  assert.equal((await privateRef(retired[0].id).get()).exists, false, 'the retired room keeps no private state');
  await call('cancelLiveChallenge', teacher({ roomId }));
});

/* ================= a class crossing the closing threshold at once ================= */

test('a class answering at once starts the closing countdown exactly once, and every answer is recorded', async () => {
  await clearActive();
  const { roomId } = await create({ roundSeconds: 90, roundClosingThreshold: 70 });
  for (const studentId of STUDENTS) {
    // eslint-disable-next-line no-await-in-loop
    await call('joinLiveChallenge', student(studentId, { roomId }));
  }
  await call('startLiveChallenge', teacher({ roomId }));
  const room = await untilStarted(roomId);
  const fields = await answerFields(roomId, room.currentRound);
  const originalEndsAt = room.endsAt.toMillis();
  // Seven answer first (58% of twelve), then the other five together cross 70%.
  for (const studentId of STUDENTS.slice(0, 7)) {
    // eslint-disable-next-line no-await-in-loop
    await answer(roomId, studentId, { room, fields });
  }
  assert.equal((await roomOf(roomId)).closingStartedAt ?? null, null, 'below the threshold nothing closes');
  const burstStarted = Date.now();
  const results = await Promise.all(STUDENTS.slice(7).map((studentId) => answer(roomId, studentId, { room, fields })));
  assert.ok(results.every((reply) => reply.serverConfirmed === true), 'every answer in the burst was recorded');
  const closing = await roomOf(roomId);
  assert.ok(closing.closingStartedAt, 'the threshold started the closing countdown');
  const shortened = closing.endsAt.toMillis();
  assert.ok(shortened < originalEndsAt, 'the deadline came closer');
  assert.ok(Math.abs(shortened - (burstStarted + 5_000)) < 8_000, 'about five seconds from the crossing');
  const answered = (await roomRef(roomId).collection('players').get()).docs.filter((doc) => doc.data().answeredRound === 0).length;
  assert.equal(answered, 12);
  // A later pacing change cannot shorten it again: closing is irreversible.
  await call('updateLiveChallengePacing', teacher({ roomId, roundClosingThreshold: 60 }));
  assert.equal((await roomOf(roomId)).endsAt.toMillis(), shortened, 'one closing countdown per round');
  await call('cancelLiveChallenge', teacher({ roomId }));
});

test('with the closing threshold off, answers never shorten the round', async () => {
  await clearActive();
  const { roomId } = await create({ roundSeconds: 60, roundClosingThreshold: 'off' });
  const players = STUDENTS.slice(0, 3);
  for (const studentId of players) {
    // eslint-disable-next-line no-await-in-loop
    await call('joinLiveChallenge', student(studentId, { roomId }));
  }
  await call('startLiveChallenge', teacher({ roomId }));
  const room = await untilStarted(roomId);
  const fields = await answerFields(roomId, room.currentRound);
  await Promise.all(players.map((studentId) => answer(roomId, studentId, { room, fields })));
  const after = await roomOf(roomId);
  assert.equal(after.closingStartedAt ?? null, null);
  assert.equal(after.endsAt.toMillis(), room.endsAt.toMillis());
  await call('cancelLiveChallenge', teacher({ roomId }));
});

/* ===================== answer ids, early progress, code names ===================== */

test('an answer id is never a server receipt key, and progress is not recorded before a round starts', async () => {
  await clearActive();
  const { roomId } = await create();
  const [first, second] = STUDENTS;
  await call('joinLiveChallenge', student(first, { roomId }));
  await call('joinLiveChallenge', student(second, { roomId }));
  await call('startLiveChallenge', teacher({ roomId }));
  const counting = await roomOf(roomId);
  // During the 3-2-1 the question is already in the room; progress is not taken.
  const early = await call('reportLiveChallengeProgress', student(first, {
    roomId, roundIndex: counting.currentRound, roundVersion: counting.roundVersion, roundToken: counting.roundToken, provisionalPoints: 500,
  }));
  assert.equal(early.recorded, false, 'nothing is recorded before the round starts');
  // An answer sent during the 3-2-1 is refused in words a student can act on.
  const tooEarly = await failureOf(answer(roomId, second, { room: counting, fields: await answerFields(roomId, counting.currentRound) }));
  assert.equal(tooEarly?.code, 'deadline-exceeded');
  assert.equal(tooEarly?.message, 'This round has not started yet. Wait for GO, then answer.');
  const room = await untilStarted(roomId);
  const fields = await answerFields(roomId, room.currentRound);
  const forged = await failureOf(answer(roomId, first, { room, fields, submissionId: `milestone:${room.roundVersion + 1}:1` }));
  assert.equal(forged?.code, 'invalid-argument', 'an id shaped like a server receipt key is refused');
  const honest = await answer(roomId, first, { room, fields });
  assert.equal(honest.serverConfirmed, true);
  const during = await call('reportLiveChallengeProgress', student(second, {
    roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken, provisionalPoints: 200,
  }));
  assert.equal(during.recorded, true, 'progress during the round is recorded as before');
  await call('cancelLiveChallenge', teacher({ roomId }));
});

test('code names are handed out in a random order, not roster order', async () => {
  await clearActive();
  const { roomId } = await create();
  const rows = (await privateRef(roomId).collection('players').get()).docs
    .map((doc) => ({ studentId: doc.id, number: Number(String(doc.data().alias).match(/(\d+)$/)?.[1]) }))
    .sort((a, b) => (a.studentId < b.studentId ? -1 : 1));
  assert.equal(rows.length, 12);
  // The old order: each next student id took the next number (mod the range).
  const steps = rows.slice(1).map((row, index) => (row.number - rows[index].number + 89) % 89);
  assert.ok(!steps.every((step) => step === 1), 'aliases do not run consecutively in student-id order');
  await call('cancelLiveChallenge', teacher({ roomId }));
});

/* ============================== the Warm-Up link ============================== */

test('a Warm-Up link must be one of this class\'s assignments', async () => {
  await clearActive();
  const warmup = { liveChallenge: { enabled: true, deliveryMode: 'liveChallenge', roundCount: 3, roundSeconds: 30, standardCode: SUITE_STANDARD } };
  await db.collection('assignments').doc('hardening-elsewhere').set({ title: 'Elsewhere', assignedClassIds: [OTHER_CLASS_ID], warmup });
  await db.collection('assignments').doc('hardening-ours').set({ title: 'Ours', assignedClassIds: [CLASS_ID], warmup });
  const refused = await failureOf(create({ assignmentId: 'hardening-elsewhere' }));
  assert.equal(refused?.code, 'failed-precondition');
  assert.match(refused.message, /not assigned to this class/);
  const { roomId } = await create({ assignmentId: 'hardening-ours' });
  assert.equal((await roomOf(roomId)).assignmentId, 'hardening-ours');
  await call('cancelLiveChallenge', teacher({ roomId }));
});
