// The end-of-game recap, recognitions and personal bests, through the real
// callables against a real Firestore. Run through `npm run test:challenge-finish`.
//
// WHAT. Real matches are played here — created, joined, answered, closed and
// finished by the same callables a classroom uses — and then checked for:
//
//   (a) a round's worked solution does not exist while the round is open, and
//       does once it has closed;
//   (b) with Second Chance automatic, a replayed question's solution is held
//       until its replay has closed — it would be the replay's answer;
//   (c) the recap gives a student their own rounds with solutions and nothing
//       about anyone else, and refuses a student not in the match and a match
//       that has not finished;
//   (d) the room's recognitions name aliases and player keys, never a student;
//   (e) recognition and personal-best rewards are delivered exactly once, even
//       when the rewards effect runs again.

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
const { buildAchievementTransactionId } = await import(path.join(repo, 'functions/shared/liveChallengeClassPoints.mjs'));
const { PERSONAL_BEST_RULE_ID, recognitionRuleId } = await import(path.join(repo, 'functions/shared/liveChallengeRewardRules.mjs'));
const db = admin.firestore();

const TEACHER = 'recap-teacher@example.com';
// The integration files share one emulator and run in parallel; this suite's
// rooms draw only questions carrying its own standard.
const SUITE_STANDARD = 'RECAPSUITE1';
const SUITE_ALIGNMENT_KEY = `texas:${SUITE_STANDARD}`;
const SUITE_SUFFIX = '--recap-suite';
const CLASS_ID = 'recap-class-p3';
const [R1, R2, R3] = ['recap-s1', 'recap-s2', 'recap-s3'];
const OUTSIDER = 'recap-outsider';

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
    const instantiated = await mathPath.instantiateQuestion(item, `recap-probe|${item.id}`);
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
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '3', name: 'Recap Period 3' });
for (const [index, studentId] of [R1, R2, R3].entries()) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '3', firstName: `Recap${index + 1}`, lastName: 'Student',
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

/* ===================== GAME A: solutions, recap and recognitions ===================== */

const GA = await create();

test('(a) a round\'s solution does not exist while it is open, and does once it closes', async () => {
  await call('joinLiveChallenge', student(R1, { roomId: GA }));
  await call('joinLiveChallenge', student(R2, { roomId: GA }));
  await call('startLiveChallenge', teacher({ roomId: GA }));
  await waitForRoundStart(GA);
  await answer(GA, R1, { correct: true });
  assert.equal((await solutionDoc(GA, 0)).exists, false, 'open round: nothing published');
  assert.deepEqual((await roomOf(GA)).revealedSolutionRounds || [], []);
  await answer(GA, R2, { correct: false });
  await roundCommand('closeLiveChallengeRound', GA);
  const published = await solutionDoc(GA, 0);
  assert.equal(published.exists, true, 'closed round: published');
  assert.equal(published.data().available, true);
  assert.ok(published.data().solutionReview.reasoning.length > 0);
  assert.deepEqual((await roomOf(GA)).revealedSolutionRounds, [0]);
});

test('(c) the recap refuses a match that has not finished', async () => {
  const early = await failureOf(call('getLiveChallengeMatchRecap', student(R1, { roomId: GA })));
  assert.equal(early?.code, 'failed-precondition');
  const stranger = await failureOf(call('getLiveChallengeMatchRecap', student(OUTSIDER, { roomId: GA })));
  assert.equal(stranger?.code, 'permission-denied');
  const asTeacher = await failureOf(call('getLiveChallengeMatchRecap', teacher({ roomId: GA })));
  assert.equal(asTeacher?.code, 'permission-denied', 'a student\'s own recap only');
});

test('(c) after the game: own rounds with solutions, and nothing about anyone else', async () => {
  await roundCommand('advanceLiveChallenge', GA);
  await playRound(GA, [[R1, false], [R2, true]]);
  await roundCommand('advanceLiveChallenge', GA);
  await playRound(GA, [[R1, false], [R2, true]]);
  await call('finishLiveChallenge', teacher({ roomId: GA }));
  assert.equal((await roomOf(GA)).status, 'finished');

  const recap = await call('getLiveChallengeMatchRecap', student(R1, { roomId: GA }));
  assert.equal(recap.status, 'finished');
  assert.equal(recap.self.joined, true);
  assert.equal(recap.self.correctCount, 1);
  assert.equal(recap.self.roundsAvailable, 3);
  assert.deepEqual(recap.rounds.map((round) => [round.roundIndex, round.answered, round.isCorrect]), [[0, true, true], [1, true, false], [2, true, false]]);
  assert.ok(recap.rounds.every((round) => round.solutionAvailable && round.solutionReview?.reasoning?.length), 'every round\'s solution, now nothing can be answered');
  assert.equal(recap.firstGame, true, 'the first game this student finished in this class');
  assert.deepEqual(recap.personalBests, []);

  // The private state is gone once the game is finished; the result keeps the keys.
  const keyOf = Object.fromEntries((await resultOf(GA)).standings.map((row) => [row.studentId, row.playerKey]));
  const [r1Key, r2Key] = [keyOf[R1], keyOf[R2]];
  assert.ok(r1Key && r2Key);
  const r2Alias = (await roomRef(GA).collection('players').doc(r2Key).get()).data()?.alias;
  const text = JSON.stringify(recap);
  for (const leak of [R2, R3, r2Key, r2Alias, r1Key].filter(Boolean)) {
    assert.equal(text.includes(leak), false, `the recap does not carry ${leak}`);
  }

  // Invited but never joined: the solutions, no place.
  const absent = await call('getLiveChallengeMatchRecap', student(R3, { roomId: GA }));
  assert.equal(absent.self.joined, false);
  assert.equal(absent.self.rank, null);
  // Not in the match at all: refused.
  const outsider = await failureOf(call('getLiveChallengeMatchRecap', student(OUTSIDER, { roomId: GA })));
  assert.equal(outsider?.code, 'permission-denied');
});

test('(d) the room\'s recognitions name aliases and player keys, never a student', async () => {
  const room = await roomOf(GA);
  assert.ok(Array.isArray(room.recognitions), 'written when the match finished');
  assert.ok(room.recognitions.length > 0, 'two students answered every round: at least team effort');
  const text = JSON.stringify(room.recognitions);
  for (const studentId of [R1, R2, R3]) assert.equal(text.includes(studentId), false);
  room.recognitions.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), ['aliases', 'classWide', 'detail', 'id', 'label', 'playerKeys']);
  });
  const result = await resultOf(GA);
  // The room shows only what names no struggle (most improved and best
  // comeback stay in each recap); the server-only result keeps them all, so
  // the rewards and recaps read the full list.
  const { classVisibleRecognitions } = await import(path.join(repo, 'functions/shared/liveChallengeRecognitions.mjs'));
  assert.deepEqual(room.recognitions, classVisibleRecognitions(result.recognitions, { warmup: false }));
  assert.ok(room.recognitions.every((entry) => !['mostImproved', 'bestComeback'].includes(entry.id)));
});

/* ============ GAME B: personal bests and exactly-once rewards ============ */

let GB = null;
test('(e) recognition and personal-best rewards are delivered exactly once', async () => {
  GB = await create();
  await call('joinLiveChallenge', student(R1, { roomId: GB }));
  await call('joinLiveChallenge', student(R2, { roomId: GB }));
  await call('startLiveChallenge', teacher({ roomId: GB }));
  // R1 does better than in game A (3 correct, was 1); R2 does worse (1, was 2).
  await playRound(GB, [[R1, true], [R2, true]]);
  await roundCommand('advanceLiveChallenge', GB);
  await playRound(GB, [[R1, true], [R2, false]]);
  await roundCommand('advanceLiveChallenge', GB);
  await playRound(GB, [[R1, true], [R2, false]]);
  await call('finishLiveChallenge', teacher({ roomId: GB }));

  const recap = await call('getLiveChallengeMatchRecap', student(R1, { roomId: GB }));
  assert.equal(recap.firstGame, false);
  const mostCorrect = recap.personalBests.find((best) => best.id === 'mostCorrect');
  assert.deepEqual([mostCorrect?.value, mostCorrect?.previous], [3, 1], 'beat their own game A');
  const r2Recap = await call('getLiveChallengeMatchRecap', student(R2, { roomId: GB }));
  assert.equal(r2Recap.personalBests.some((best) => best.id === 'mostCorrect'), false);

  const ledger = (studentId, ruleId) => db.collection('classPointTransactions').doc(buildAchievementTransactionId(GB, studentId, ruleId)).get();
  const best = await ledger(R1, PERSONAL_BEST_RULE_ID);
  assert.equal(best.exists, true, 'a personal best earns Class Points');
  assert.equal(best.data().amount, 3);
  const team = await ledger(R1, recognitionRuleId('teamEffort'));
  assert.equal(team.exists, true, 'team effort: both answered every round');
  assert.equal(team.data().amount, 2);

  const room = await roomOf(GB);
  const individual = room.recognitions.filter((entry) => !entry.classWide);
  const r1Key = (await resultOf(GB)).standings.find((row) => row.studentId === R1).playerKey;
  const r1Individual = individual.filter((entry) => entry.playerKeys.includes(r1Key));
  for (const entry of r1Individual) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await ledger(R1, recognitionRuleId(entry.id))).exists, true, `${entry.id} earns Class Points`);
  }
  const badges = await db.collection('rewardGrants').where('studentId', '==', R1).get();
  const lcBadges = badges.docs.map((doc) => doc.data()).filter((grant) => grant.source?.id === GB && grant.rewardCode === 'badge');
  assert.equal(lcBadges.length, r1Individual.length, 'one badge per individual recognition');

  // Snapshot what was delivered, then run the rewards effect again from
  // scratch: the job forgotten, the effect pending, the finish retried.
  const accountRef = db.collection('classPointAccounts').where('studentId', '==', R1);
  const balanceBefore = (await accountRef.get()).docs.map((doc) => doc.data().balance);
  const ledgerBefore = (await db.collection('classPointTransactions').where('roomId', '==', GB).get()).size;
  const grantsBefore = (await db.collection('rewardGrants').where('studentId', '==', R1).get()).size;
  assert.ok(ledgerBefore > 0);
  await db.collection('liveChallengeAchievementJobs').doc(GB).delete();
  await db.collection('liveChallengeMatchResults').doc(GB).set({ effects: { rewards: 'pending' }, effectsPending: true }, { merge: true });
  const retried = await call('finishLiveChallenge', teacher({ roomId: GB }));
  assert.equal(retried.alreadyApplied, true);
  assert.equal((await resultOf(GB)).effects.rewards, 'done');
  const job = (await db.collection('liveChallengeAchievementJobs').doc(GB).get()).data();
  assert.ok(job.awards.some((award) => award.ruleId === PERSONAL_BEST_RULE_ID && award.studentId === R1), 'the retry planned the same personal best');
  assert.ok(job.awards.every((award) => award.outcome === 'alreadyAwarded'), 'and found every award already delivered');
  assert.equal((await db.collection('classPointTransactions').where('roomId', '==', GB).get()).size, ledgerBefore);
  assert.equal((await db.collection('rewardGrants').where('studentId', '==', R1).get()).size, grantsBefore);
  assert.deepEqual((await accountRef.get()).docs.map((doc) => doc.data().balance), balanceBefore);
});

/* ===================== GAME C: Second Chance holds the solution ===================== */

test('(b) a replayed question\'s solution is held until its replay has closed', async () => {
  const GC = await create({ roundCount: 3, secondChanceMode: 'automatic' });
  await call('joinLiveChallenge', student(R1, { roomId: GC }));
  await call('joinLiveChallenge', student(R2, { roomId: GC }));
  await call('startLiveChallenge', teacher({ roomId: GC }));
  // Round 0 is missed by both: it will come back.
  await playRound(GC, [[R1, false], [R2, false]]);
  assert.equal((await solutionDoc(GC, 0)).exists, false, 'held: the replay plan is not known yet');
  // Rounds 1 and 2 are answered right by both: they will not.
  await roundCommand('advanceLiveChallenge', GC);
  await playRound(GC, [[R1, true], [R2, true]]);
  assert.equal((await solutionDoc(GC, 1)).exists, false, 'held: the replay plan is still not known');
  await roundCommand('advanceLiveChallenge', GC);
  await playRound(GC, [[R1, true], [R2, true]]);
  // The last scheduled round closed with a replay planned: EVERY scheduled
  // round stays held, so which ones are left out never says which question
  // comes back.
  assert.equal((await solutionDoc(GC, 1)).exists, false, 'round 1 is not replayed, but is held with the rest');
  assert.equal((await solutionDoc(GC, 2)).exists, false);
  assert.equal((await solutionDoc(GC, 0)).exists, false, 'round 0 is replayed next: still held');
  assert.deepEqual((await roomOf(GC)).revealedSolutionRounds || [], []);

  await roundCommand('advanceLiveChallenge', GC);
  const state = (await privateRef(GC).get()).data();
  assert.deepEqual(state.secondChanceOf, { 3: 0 }, 'round 3 replays round 0');
  await waitForRoundStart(GC);
  await answer(GC, R1, { correct: true });
  assert.equal((await solutionDoc(GC, 0)).exists, false, 'the replay is open: neither copy of the answer is out');
  assert.equal((await solutionDoc(GC, 3)).exists, false);
  await answer(GC, R2, { correct: true });
  await roundCommand('closeLiveChallengeRound', GC);
  assert.equal((await solutionDoc(GC, 0)).exists, true, 'the last replay closed: published');
  assert.equal((await solutionDoc(GC, 1)).exists, true, 'and the rest with it');
  assert.equal((await solutionDoc(GC, 2)).exists, true);
  const replay = await solutionDoc(GC, 3);
  assert.equal(replay.exists, true);
  assert.equal(replay.data().originalRoundIndex, 0);
  await call('finishLiveChallenge', teacher({ roomId: GC }));

  const recap = await call('getLiveChallengeMatchRecap', student(R1, { roomId: GC }));
  const replayRound = recap.rounds.find((round) => round.roundIndex === 3);
  assert.equal(replayRound.secondChance, true);
  assert.equal(replayRound.originalRoundIndex, 0);
  assert.equal(replayRound.isCorrect, true);
  assert.equal(replayRound.solutionAvailable, true);
});
