// The Live Challenge engine end to end, through the real callables, against a
// real Firestore. Run through `npm run test:challenge-finish`.
//
// WHY. The lifecycle, timer, ranking and result modules are pure and unit
// tested. What only a database can show is that the callables use them inside
// transactions: two teacher tabs pressing the same button produce one effect,
// a finished match is finalized once whatever is retried, a student's
// reconnect never resets them, and the class's second and third match of the
// period start clean.

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
const rewards = await import(path.join(repo, 'functions/shared/liveChallengeClassPoints.mjs'));
const db = admin.firestore();

const TEACHER = 'engine-teacher@example.com';
// The integration files share one emulator and run in parallel, and a mixed
// review draws from the whole bank — including another suite's questions,
// which that suite deletes when it finishes (testCycleCertification does).
// This suite's rooms draw only questions carrying its own standard, so a
// question can never disappear in the middle of one of its matches.
const ENGINE_STANDARD = 'ENGINESUITE1';
const ENGINE_ALIGNMENT_KEY = `texas:${ENGINE_STANDARD}`;
const CLASS_ID = 'engine-class-p4';
const [S1, S2, S3] = ['engine-s1', 'engine-s2', 'engine-s3'];

const teacher = (data) => ({
  auth: { uid: 'engine-teacher-uid', token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const student = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
/*
 * Under the parallel suites' load the emulator can abort a transaction while
 * one of its reads is failing over; the client library retries that read with
 * the transaction's id, and the emulator answers INVALID_ARGUMENT
 * "Transaction is invalid or closed". runTransaction retries ABORTED and
 * production's "transaction has expired", not this wording, so the command
 * fails having written nothing. Every lifecycle command here is safe to send
 * again — the expected round and the submission id exist for exactly that —
 * so the suite resends it once or twice, as a client would. Creating a match
 * is never resent.
 */
const emulatorClosedTransaction = (error) => error?.code === 3
  && /Transaction is invalid or closed/i.test(String(error?.message || ''));
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
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const privatePlayer = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;

/* ---------- a class, a roster and a bank of gradable questions ---------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `engine-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    // A real standard first, so round standards, the report and evidence
    // still name one; the suite's own key is only appended for the draw.
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= 3, 'the seed bank must hold at least three gradable choice questions');
// Under this suite's own ids, so no other file overwrites or deletes them.
await Promise.all(bank.map((item) => {
  const id = `${item.id}--engine-suite`;
  return db.collection('pathQuestionBank').doc(id).set({
    ...item, id, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, ENGINE_ALIGNMENT_KEY],
  });
}));
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '4', name: 'Engine Period 4' });
for (const [index, studentId] of [S1, S2, S3].entries()) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '4', firstName: `Engine${index + 1}`, lastName: 'Student',
  });
}

/* ---------- playing ---------- */

const create = (extra = {}) => call('createLiveChallenge', teacher({
  classId: CLASS_ID, courseId: 'algebra1', standardCode: ENGINE_STANDARD, questionStyle: 'noTools', roundCount: 3, roundSeconds: 30, ...extra,
}));

// The server's own answer key for the round, regenerated exactly as submit does.
const responseFor = async (roomId, roundIndex, { correct }) => {
  const state = (await privateRef(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  assert.ok(authored, `round ${roundIndex} drew ${questionId}, which is no longer in the bank`);
  assert.ok(questionId.endsWith('--engine-suite'), `round ${roundIndex} drew ${questionId} from outside this suite`);
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  return { responses: Object.fromEntries(plan.privateGrading.fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) };
};

const waitForRoundStart = async (roomId) => {
  const room = await roomOf(roomId);
  const startsAtMs = room.startsAt?.toMillis?.() || 0;
  const delay = Math.max(0, startsAtMs - Date.now() + 25);
  if (delay) await sleep(delay);
};

const answer = async (roomId, studentId, { correct = true, submissionId = randomUUID() } = {}) => {
  const room = await roomOf(roomId);
  return call('submitLiveChallengeResponse', student(studentId, {
    roomId,
    roundIndex: room.currentRound,
    roundVersion: room.roundVersion,
    roundToken: room.roundToken,
    submissionId,
    humanElapsedMs: 2_000,
    responsePayload: await responseFor(roomId, room.currentRound, { correct }),
  }));
};

const advanceFrom = async (roomId) => {
  const room = await roomOf(roomId);
  return call('advanceLiveChallenge', teacher({ roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion }));
};

const ledgerFor = async (studentId) => {
  const snapshot = await db.collection('classPointTransactions').where('studentId', '==', studentId).where('classId', '==', CLASS_ID).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};
const balanceOf = async (studentId) => {
  const snapshot = await db.collection('classPointAccounts').where('studentId', '==', studentId).where('classId', '==', CLASS_ID).get();
  return snapshot.docs.reduce((sum, doc) => sum + (Number(doc.data()?.balance) || 0), 0);
};

/* ================= MATCH 1: a whole match, every command once ================= */

const first = await create();
const R1 = first.roomId;
let r1PlayerKey = null;

test('a new match opens a lobby with the engine fields and invites the roster', async () => {
  assert.ok(R1);
  const room = await roomOf(R1);
  assert.equal(room.status, 'lobby');
  assert.equal(room.roundState, null);
  assert.equal(room.engineVersion, 1);
  assert.equal(room.challengeMode, 'standard');
  assert.equal(room.scoringStrategyId, 'accuracyFirst');
  for (const studentId of [S1, S2, S3]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await db.collection('liveChallengeInvites').doc(studentId).get()).data()?.roomId, R1);
  }
});

test('a reconnecting student is the same player, never a second one', async () => {
  const joined = await call('joinLiveChallenge', student(S1, { roomId: R1 }));
  const again = await call('joinLiveChallenge', student(S1, { roomId: R1 }));
  await call('joinLiveChallenge', student(S2, { roomId: R1 }));
  r1PlayerKey = joined.playerKey;
  assert.equal(again.playerKey, joined.playerKey);
  assert.equal(again.rejoined, true);
  const joinedRows = (await publicPlayers(R1)).filter((row) => row.joined === true);
  assert.equal(joinedRows.length, 2, 'two students joined; nobody was duplicated');
});

test('two Start presses open round 1 once', async () => {
  const results = await Promise.all([
    call('startLiveChallenge', teacher({ roomId: R1 })),
    call('startLiveChallenge', teacher({ roomId: R1 })),
  ]);
  const room = await roomOf(R1);
  assert.equal(room.status, 'running');
  assert.equal(room.currentRound, 0);
  assert.equal(room.roundVersion, 1, 'one round opening, not two');
  assert.equal(room.roundState, 'open');
  assert.equal(results.filter((result) => result.alreadyApplied === true).length, 1);
  assert.equal(results[0].roundToken || room.roundToken, room.roundToken);
});

test('an answer is recorded once: a retry replays it, a second answer is refused', async () => {
  await waitForRoundStart(R1);
  const submissionId = randomUUID();
  const graded = await answer(R1, S1, { correct: true, submissionId });
  assert.equal(graded.isCorrect, true);
  const replay = await answer(R1, S1, { correct: true, submissionId });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.pointsAwarded, graded.pointsAwarded);
  const second = await failureOf(answer(R1, S1, { correct: true }));
  assert.equal(second?.code, 'already-exists', 'a refresh cannot answer the round again');
  assert.equal((await privatePlayer(R1, S1)).score, graded.pointsAwarded, 'the score moved once');
});

test('the host cannot move on before the round is done', async () => {
  const early = await failureOf(advanceFrom(R1));
  assert.equal(early?.code, 'failed-precondition');
  assert.match(early?.message || '', /still in progress/);
  assert.equal((await roomOf(R1)).currentRound, 0);
});

test('a reconnect mid-match keeps the score, the join round and the identity', async () => {
  const before = await privatePlayer(R1, S1);
  const rejoined = await call('joinLiveChallenge', student(S1, { roomId: R1 }));
  const after = await privatePlayer(R1, S1);
  assert.equal(rejoined.playerKey, r1PlayerKey);
  assert.equal(after.score, before.score);
  assert.equal(after.joinedAtRound, before.joinedAtRound);
  assert.equal(after.answeredRound, 0);
});

test('two Next Round presses about the same round open one round', async () => {
  await answer(R1, S2, { correct: false });
  const results = await Promise.all([advanceFrom(R1), advanceFrom(R1)]);
  const room = await roomOf(R1);
  assert.equal(room.currentRound, 1, 'round 2 was not skipped');
  assert.equal(room.roundVersion, 2);
  assert.equal(results.filter((result) => result.alreadyApplied === true).length, 1);
  // The closed round was ranked and kept, privately and anonymously.
  const round = (await roomRef(R1).collection('rounds').doc('0').get()).data();
  assert.equal(round.roundIndex, 0);
  assert.deepEqual(round.standings.map((row) => row.rank), [1, 2]);
  assert.ok(round.standings.every((row) => !('studentId' in row)), 'the public round result names no student');
  // A stale press after the fact changes nothing.
  const stale = await call('advanceLiveChallenge', teacher({ roomId: R1, expectedRoundIndex: 0, expectedRoundVersion: 1 }));
  assert.equal(stale.alreadyApplied, true);
  assert.equal((await roomOf(R1)).currentRound, 1);
});

test('finishing twice, and finishing while advancing, finalizes the match once', async () => {
  await waitForRoundStart(R1);
  await answer(R1, S1, { correct: true });
  await answer(R1, S2, { correct: true });
  await advanceFrom(R1);
  await waitForRoundStart(R1);
  await answer(R1, S1, { correct: true });
  await answer(R1, S2, { correct: false });
  const room = await roomOf(R1);
  const outcomes = await Promise.all([
    failureOf(call('finishLiveChallenge', teacher({ roomId: R1 }))),
    failureOf(call('finishLiveChallenge', teacher({ roomId: R1 }))),
    failureOf(call('advanceLiveChallenge', teacher({ roomId: R1, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion }))),
  ]);
  assert.deepEqual(outcomes, [null, null, null], 'every caller is told the match is finished; none is an error');
  const finished = await roomOf(R1);
  assert.equal(finished.status, 'finished');
  const result = (await db.collection('liveChallengeMatchResults').doc(R1).get()).data();
  assert.equal(result.status, 'finished');
  assert.equal(result.finalizationId, finished.finalizationId, 'one finalization wrote both');
  assert.equal(result.playedRoundCount, 3);
  assert.equal(result.effectsPending, false);
  for (const [name, state] of Object.entries(result.effects)) assert.ok(['done', 'notApplicable'].includes(state), `${name} is ${state}`);
  assert.equal((await privateRef(R1).get()).exists, false, 'private state is deleted after every effect settled');
  assert.ok((await db.collection('liveChallengeReports').doc(R1).get()).exists);
  assert.equal((await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).exists, false);
});

test('rewards consume the final result and are issued exactly once', async () => {
  const result = (await db.collection('liveChallengeMatchResults').doc(R1).get()).data();
  const planned = rewards.planLiveChallengeAwards({ matchResult: result, policy: result.rewardPolicy })
    .filter((award) => award.rewardKind === 'classPoints' && award.studentId === S1);
  assert.ok(planned.some((award) => award.ruleId === 'challengeFinisher'), 'S1 answered every round');
  assert.ok(planned.some((award) => award.ruleId === 'strongAccuracy'), 'S1 answered every round correctly');
  const ledger = await ledgerFor(S1);
  assert.deepEqual(ledger.map((entry) => entry.id).sort(), planned.map((award) => award.id).sort());
  const expected = planned.reduce((sum, award) => sum + award.amount, 0);
  assert.equal(await balanceOf(S1), expected);
  // Score never became a reward: the ledger carries the rule, not the game score.
  assert.ok(ledger.every((entry) => entry.amount <= 10 && entry.ruleId));
});

test('a finished match stays finished', async () => {
  const cancel = await failureOf(call('cancelLiveChallenge', teacher({ roomId: R1 })));
  assert.equal(cancel?.code, 'failed-precondition');
  assert.match(cancel?.message || '', /finished Live Challenge cannot be cancelled/);
  const rejoin = await failureOf(call('joinLiveChallenge', student(S3, { roomId: R1 })));
  assert.ok(rejoin, 'nobody joins a finished match');
  assert.equal((await roomOf(R1)).status, 'finished');
});

test('the sweep finishes what a crash interrupted, without paying anything twice', async () => {
  const resultRef = db.collection('liveChallengeMatchResults').doc(R1);
  const balanceBefore = await balanceOf(S1);
  // As if the instance died after the finishing transaction: nothing ran.
  await db.collection('liveChallengeReports').doc(R1).delete();
  await resultRef.set({
    effects: { report: 'pending', invites: 'pending', warmupCredit: 'notApplicable', evidence: 'pending', rewards: 'pending', privateCleanup: 'pending' },
    effectsPending: true,
    finalizedAtMs: Date.now() - 10 * 60 * 1000,
  }, { merge: true });
  await functionsIndex.retryLiveChallengeAchievementJobs.run({});
  const after = (await resultRef.get()).data();
  assert.equal(after.effectsPending, false);
  assert.ok((await db.collection('liveChallengeReports').doc(R1).get()).exists, 'the report was rebuilt from the match result');
  assert.equal(await balanceOf(S1), balanceBefore, 're-running the rewards effect paid nothing again');
  await functionsIndex.retryLiveChallengeAchievementJobs.run({});
  assert.equal(await balanceOf(S1), balanceBefore);
});

/* ================= MATCH 2: the same class, again, as a Grand Prix ================= */

let R2 = null;

test('the class\'s next match starts clean', async () => {
  const second = await create({ scoringStrategyId: 'grandPrix' });
  R2 = second.roomId;
  assert.notEqual(R2, R1);
  assert.equal((await roomOf(R2)).scoringStrategyId, 'grandPrix');
  assert.equal((await db.collection('liveChallengeInvites').doc(S1).get()).data()?.roomId, R2, 'the invite moved to the new match');
  const joined = await call('joinLiveChallenge', student(S1, { roomId: R2 }));
  assert.notEqual(joined.playerKey, r1PlayerKey, 'a new match is a new public identity');
  const row = (await publicPlayers(R2)).find((entry) => entry.id === joined.playerKey);
  assert.equal(row.score || 0, 0, 'nothing carried over from the last match');
  // The first match's record is untouched by the second.
  const r1Result = (await db.collection('liveChallengeMatchResults').doc(R1).get()).data();
  assert.equal(r1Result.status, 'finished');
  assert.ok((await publicPlayers(R1)).some((entry) => entry.id === r1PlayerKey && entry.score > 0));
});

test('Grand Prix: round placement becomes bounded championship points', async () => {
  await call('joinLiveChallenge', student(S2, { roomId: R2 }));
  await call('joinLiveChallenge', student(S3, { roomId: R2 }));
  await call('startLiveChallenge', teacher({ roomId: R2 }));
  await waitForRoundStart(R2);
  await answer(R2, S1, { correct: true });
  await answer(R2, S2, { correct: false });
  await answer(R2, S3, { correct: false });
  await advanceFrom(R2);
  const afterRound1 = Object.fromEntries((await Promise.all([S1, S2, S3].map(async (id) => [id, await privatePlayer(R2, id)]))));
  assert.equal(afterRound1[S1].matchPoints, 15, 'first place');
  assert.equal(afterRound1[S2].matchPoints, 0, 'no credit at all earns no placement');
  assert.equal(afterRound1[S3].matchPoints, 0);
  assert.equal(afterRound1[S1].score, 15, 'the championship total is the displayed score');
  const round = (await roomRef(R2).collection('rounds').doc('0').get()).data();
  assert.deepEqual(round.standings.map((row) => [row.rank, row.matchPointsAwarded]), [[1, 15], [2, 0], [2, 0]], 'the two wrong answers tie');

  await waitForRoundStart(R2);
  await answer(R2, S2, { correct: true });
  await answer(R2, S1, { correct: false });
  await answer(R2, S3, { correct: false });
  await advanceFrom(R2);
  // A round nobody gets right pays nobody: placement is earned, not handed out.
  await waitForRoundStart(R2);
  for (const id of [S1, S2, S3]) {
    // eslint-disable-next-line no-await-in-loop
    await answer(R2, id, { correct: false });
  }
  await advanceFrom(R2); // past the last round: finishes
  const result = (await db.collection('liveChallengeMatchResults').doc(R2).get()).data();
  assert.equal(result.scoringStrategyId, 'grandPrix');
  const points = Object.fromEntries(result.standings.map((row) => [row.studentId, row.matchPoints]));
  assert.deepEqual(points, { [S1]: 15, [S2]: 15, [S3]: 0 });
  assert.equal(result.standings.find((row) => row.studentId === S3).rank, 3);
  // Everyone tied for first in the round nobody got right. That is no one's
  // win — a win is a championship tiebreak — and no one's placement.
  const wins = Object.fromEntries(result.standings.map((row) => [row.studentId, row.roundWins]));
  assert.deepEqual(wins, { [S1]: 1, [S2]: 1, [S3]: 0 });
  const rows = (await publicPlayers(R2)).filter((row) => row.joined === true);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.lastRoundRank), [null, null, null]);
});

/* ================= a round the host closes early ================= */

test('closing a round ranks it once, refuses late answers, and the next round still opens', async () => {
  const match = await create();
  const roomId = match.roomId;
  await call('joinLiveChallenge', student(S1, { roomId }));
  await call('joinLiveChallenge', student(S2, { roomId }));
  await call('startLiveChallenge', teacher({ roomId }));
  await waitForRoundStart(roomId);
  await answer(roomId, S1, { correct: true });

  const notReady = await failureOf(call('closeLiveChallengeRound', teacher({ roomId, expectedRoundIndex: 0 })));
  assert.equal(notReady?.code, 'failed-precondition', 'S2 has not answered and the clock is running');
  const closed = await Promise.all([
    call('closeLiveChallengeRound', teacher({ roomId, expectedRoundIndex: 0, force: true })),
    call('closeLiveChallengeRound', teacher({ roomId, expectedRoundIndex: 0, force: true })),
  ]);
  assert.equal(closed.filter((result) => result.alreadyApplied === true).length, 1, 'two closes, one ranking');
  const room = await roomOf(roomId);
  assert.equal(room.roundState, 'closed');
  assert.equal(room.phase, 'results');
  const round = (await roomRef(roomId).collection('rounds').doc('0').get()).data();
  assert.deepEqual(round.standings.map((row) => [row.rank, row.participated]), [[1, true], [2, false]]);

  const late = await failureOf(answer(roomId, S2, { correct: true }));
  assert.equal(late?.code, 'failed-precondition', `a closed round accepts nothing (got ${late?.code}: ${late?.message || 'accepted'})`);
  assert.equal((await privatePlayer(roomId, S2)).answeredRound, -1);
  // Arriving between rounds: round 0 can no longer be answered, so it is not
  // one of the rounds this student is measured against.
  await call('joinLiveChallenge', student(S3, { roomId }));
  assert.equal((await privatePlayer(roomId, S3)).joinedAtRound, 1);

  // From results the host moves on without the round being ranked again.
  const closedAt = round.closedAtMs;
  await call('advanceLiveChallenge', teacher({ roomId, expectedRoundIndex: 0, expectedRoundVersion: room.roundVersion }));
  const next = await roomOf(roomId);
  assert.equal(next.currentRound, 1);
  assert.equal(next.roundState, 'open');
  assert.equal((await roomRef(roomId).collection('rounds').doc('0').get()).data().closedAtMs, closedAt);
  await call('finishLiveChallenge', teacher({ roomId }));
  assert.equal((await roomOf(roomId)).status, 'finished');
});

/* ================= MATCH 3 and 4: cancelling, then going again ================= */

test('a cancelled lobby is final, and the teacher can start another', async () => {
  const third = await create();
  const R3 = third.roomId;
  await call('joinLiveChallenge', student(S1, { roomId: R3 }));
  const cancelled = await Promise.all([
    failureOf(call('cancelLiveChallenge', teacher({ roomId: R3 }))),
    failureOf(call('cancelLiveChallenge', teacher({ roomId: R3 }))),
  ]);
  assert.deepEqual(cancelled, [null, null], 'cancelling twice is not an error');
  assert.equal((await roomOf(R3)).status, 'cancelled');
  assert.equal((await failureOf(call('finishLiveChallenge', teacher({ roomId: R3 }))))?.code, 'failed-precondition');
  assert.equal((await failureOf(call('startLiveChallenge', teacher({ roomId: R3 }))))?.code, 'failed-precondition');
  const result = (await db.collection('liveChallengeMatchResults').doc(R3).get()).data();
  assert.equal(result?.effects?.rewards, 'notApplicable', 'a cancelled match issues no rewards');

  const fourth = await create();
  assert.ok(fourth.roomId && fourth.roomId !== R3);
  await call('cancelLiveChallenge', teacher({ roomId: fourth.roomId }));
});
