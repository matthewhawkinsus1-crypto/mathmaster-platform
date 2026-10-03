// The Live Challenge shell's server seams, through the real callables against a
// real Firestore. Run through `npm run test:challenge-finish`.
//
// WHAT. The host / projector / scoreboard / pacing / reconnect overhaul changed
// only small, compatible things on the server, each checked here end to end:
//
//   - a round opens behind the COUNTDOWN lead, so every screen shows the same
//     3-2-1 off its startsAt and nobody can answer before it;
//   - a closed round's anonymous result carries the STANDINGS it left behind,
//     written in the closing transaction (a results screen never pairs the
//     round with standings from before it), and the last round's standings
//     are the final standings;
//   - a room says what its PLACEMENTS earn, naming rewards, never students;
//   - the console reads its ROSTER by name — the room's own teacher only;
//   - a game screen's HEARTBEAT says which tab it is and when it came back;
//   - the flows the new screens rely on: close -> results -> Next Round, and
//     Play Again as a fresh match the class's invites follow.

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
const { ROUND_COUNTDOWN_LEAD_MS } = await import(path.join(repo, 'functions/shared/liveChallengeTimer.mjs'));
const { PRESENCE_FRESH_MS } = await import(path.join(repo, 'functions/shared/liveChallengePresence.mjs'));
const { buildChallengeRewardPolicy } = await import(path.join(repo, 'src/platform/rewards/challengeRewardPolicy.js'));
const { replayExperienceFromRoom, replayRequestFromRoom } = await import(path.join(repo, 'src/platform/liveChallenge/challengeReplayModel.js'));
const { movementBetween, roundResultsView } = await import(path.join(repo, 'src/platform/liveChallenge/challengeStandingsModel.js'));
const db = admin.firestore();

const TEACHER = 'shell-teacher@example.com';
const OTHER_TEACHER = 'shell-other-teacher@example.com';
// The integration files share one emulator and run in parallel; this suite's
// rooms draw only questions carrying its own standard (see liveChallengeEngine).
const SHELL_STANDARD = 'SHELLSUITE1';
const SHELL_ALIGNMENT_KEY = `texas:${SHELL_STANDARD}`;
const CLASS_ID = 'shell-class-p6';
const [S1, S2, S3] = ['shell-s1', 'shell-s2', 'shell-s3'];

const teacherAs = (email) => (data) => ({
  auth: { uid: `${email}-uid`, token: { role: 'teacher', email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const teacher = teacherAs(TEACHER);
const student = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
// A command that hits the emulator's closed-transaction error is re-run by the
// transaction itself (tests/integration/support/emulatorTransactions.mjs), as
// production re-runs an expired one; the suite calls each command once.
const call = (name, request) => functionsIndex[name].run(request);
const failureOf = (promise) => promise.then(() => null, (error) => error);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const millis = (value) => value?.toMillis?.() ?? null;

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const roundDoc = async (roomId, roundIndex) => (await roomRef(roomId).collection('rounds').doc(String(roundIndex)).get()).data() || null;
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const playerKeyOf = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data()?.playerKey || null;
const diagnosticsOf = async (roomId, playerKey) => (await roomRef(roomId).collection('diagnostics').doc(playerKey).get()).data() || null;

/* ---------- a class, a roster and a bank of gradable questions ---------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `shell-probe|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= 3, 'the seed bank must hold at least three gradable choice questions');
await Promise.all(bank.map((item) => {
  const id = `${item.id}--shell-suite`;
  return db.collection('pathQuestionBank').doc(id).set({
    ...item, id, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, SHELL_ALIGNMENT_KEY],
  });
}));
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '6', name: 'Shell Period 6' });
for (const [index, studentId] of [S1, S2, S3].entries()) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '6', firstName: `Shell${index + 1}`, lastName: 'Student',
  });
}

const REWARD_POLICY = buildChallengeRewardPolicy({ passPlaces: 3, championBadge: true });
const create = (extra = {}) => call('createLiveChallenge', teacher({
  classId: CLASS_ID,
  courseId: 'algebra1',
  standardCode: SHELL_STANDARD,
  questionStyle: 'noTools',
  roundCount: 3,
  roundSeconds: 30,
  scoringStrategyId: 'grandPrix',
  rewardPolicy: REWARD_POLICY,
  ...extra,
}));

// The server's own answer key for the round, regenerated exactly as submit does.
const responseFor = async (roomId, roundIndex, { correct }) => {
  const state = (await privateRef(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  assert.ok(questionId.endsWith('--shell-suite'), `round ${roundIndex} drew ${questionId} from outside this suite`);
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

/* ===================== GAME 1: a Grand Prix with rewards ===================== */

const G1 = (await create()).roomId;

test('a room says what its placements earn — rewards, never students', async () => {
  const room = await roomOf(G1);
  const summary = room.rewardSummary;
  assert.ok(summary, 'the public room carries a reward summary');
  const placement = summary.placement.map((rule) => [rule.maxRank, rule.rewardCode]).sort();
  assert.deepEqual(placement, [[1, 'badge'], [3, 'practicePass']]);
  assert.ok(summary.placement.every((rule) => rule.minRoundsAnswered === 1), 'the same eligibility the delivery uses');
  const text = JSON.stringify(summary);
  for (const studentId of [S1, S2, S3]) assert.equal(text.includes(studentId), false);
  // The policy itself stays private.
  assert.equal('rewardPolicy' in room, false);
  assert.ok((await privateRef(G1).get()).data()?.rewardPolicy, 'the private state keeps the policy the delivery reads');
});

test("the console reads the roster by name — the room's own teacher only", async () => {
  await call('joinLiveChallenge', student(S1, { roomId: G1 }));
  await call('joinLiveChallenge', student(S2, { roomId: G1 }));
  const roster = await call('getLiveChallengeHostRoster', teacher({ roomId: G1 }));
  assert.equal(roster.roomId, G1);
  const byName = Object.fromEntries(roster.players.map((entry) => [entry.name, entry]));
  assert.deepEqual(Object.keys(byName).sort(), ['Shell1 Student', 'Shell2 Student', 'Shell3 Student']);
  assert.equal(byName['Shell1 Student'].joined, true);
  assert.equal(byName['Shell3 Student'].joined, false, 'who has not joined is named too');
  assert.equal(byName['Shell1 Student'].playerKey, await playerKeyOf(G1, S1), 'keyed by the public player key');
  assert.ok(roster.players.every((entry) => !('studentId' in entry) && !('score' in entry)), 'names and keys only');
  const otherTeacher = await failureOf(call('getLiveChallengeHostRoster', teacherAs(OTHER_TEACHER)({ roomId: G1 })));
  assert.equal(otherTeacher?.code, 'permission-denied');
  const studentAsk = await failureOf(call('getLiveChallengeHostRoster', student(S1, { roomId: G1 })));
  assert.ok(['permission-denied', 'unauthenticated'].includes(studentAsk?.code), `a student is refused (${studentAsk?.code})`);
});

test("a game screen's heartbeat says which tab it is and when it came back", async () => {
  const key = await playerKeyOf(G1, S1);
  await call('calibrateLiveChallengeClock', student(S1, { roomId: G1, quality: 'synchronized', sessionId: 'tab-one-1234' }));
  let row = await diagnosticsOf(G1, key);
  assert.equal(row.connectionStatus, 'synchronized');
  assert.deepEqual(Object.keys(row.sessions), ['tab-one-1234']);
  assert.equal(row.reconnectedAt, undefined, 'a first report is not a reconnect');

  // The same student on a second device: two fresh sessions, neither dropped.
  await Promise.all([
    call('calibrateLiveChallengeClock', student(S1, { roomId: G1, quality: 'delayed', sessionId: 'tab-two-5678' })),
    call('calibrateLiveChallengeClock', student(S1, { roomId: G1, quality: 'synchronized', sessionId: 'tab-one-1234' })),
  ]);
  row = await diagnosticsOf(G1, key);
  assert.deepEqual(Object.keys(row.sessions).sort(), ['tab-one-1234', 'tab-two-5678']);

  // A session id that is not one is ignored, never stored.
  await call('calibrateLiveChallengeClock', student(S1, { roomId: G1, quality: 'synchronized', sessionId: '../../evil' }));
  row = await diagnosticsOf(G1, key);
  assert.deepEqual(Object.keys(row.sessions).sort(), ['tab-one-1234', 'tab-two-5678']);

  // Silent past the freshness window, then heard again: back.
  const silentSince = Date.now() - PRESENCE_FRESH_MS - 30_000;
  await roomRef(G1).collection('diagnostics').doc(key).set({ connectionUpdatedAt: admin.firestore.Timestamp.fromMillis(silentSince) }, { merge: true });
  const before = Date.now();
  await call('calibrateLiveChallengeClock', student(S1, { roomId: G1, quality: 'synchronized', sessionId: 'tab-one-1234' }));
  row = await diagnosticsOf(G1, key);
  assert.ok(Number(row.reconnectedAt) >= before - 1_000, 'the reconnect is recorded');
  assert.ok(millis(row.connectionUpdatedAt) >= before - 1_000);

  // Launch evidence is a separate clock from presence. A delayed batch keeps
  // its individual client observations but cannot make a quiet device appear
  // freshly connected on the teacher roster.
  const presenceAt = millis(row.connectionUpdatedAt);
  await call('calibrateLiveChallengeClock', student(S1, {
    roomId: G1,
    launchReport: { milestones: {
      listener_attached: { clientAtMs: before - 500 },
      running_received: { clientAtMs: before, roomStatus: 'running', roundIndex: 0 },
      game_mounted: { clientAtMs: before + 25, roomStatus: 'running', roundIndex: 0 },
    } },
  }));
  row = await diagnosticsOf(G1, key);
  assert.equal(millis(row.connectionUpdatedAt), presenceAt, 'launch-only telemetry is not a presence heartbeat');
  assert.equal(row.launchMilestones.listener_attached.clientAtMs, before - 500);
  assert.equal(row.launchMilestones.game_mounted.roundIndex, 0);
  assert.ok(row.launchMilestones.running_received.receivedAtMs >= before);

  // A student's own device can never read the diagnostics (rules: teacher only)
  // — and a calibration without a quality writes nothing at all.
  const untouched = JSON.stringify(await diagnosticsOf(G1, await playerKeyOf(G1, S2)));
  await call('calibrateLiveChallengeClock', student(S2, { roomId: G1 }));
  assert.equal(JSON.stringify(await diagnosticsOf(G1, await playerKeyOf(G1, S2))), untouched);
});

test('a round opens behind the countdown lead, and nobody answers before it', async () => {
  const before = Date.now();
  await call('startLiveChallenge', teacher({ roomId: G1 }));
  const after = Date.now();
  const room = await roomOf(G1);
  const startsAtMs = millis(room.startsAt);
  assert.ok(startsAtMs >= before + ROUND_COUNTDOWN_LEAD_MS && startsAtMs <= after + ROUND_COUNTDOWN_LEAD_MS, 'startsAt = the server\'s now + the countdown lead');
  // The round's length (a short class plays a paced length) counts from startsAt.
  assert.equal(millis(room.endsAt) - startsAtMs, Number(room.activeRoundSeconds || room.roundSeconds) * 1000, 'the round keeps its full length after the countdown');
  const early = await failureOf(answer(G1, S1, { correct: true }));
  assert.ok(early, 'an answer during the countdown is refused');
  assert.equal((await privateRef(G1).collection('players').doc(S1).get()).data()?.answeredRound, -1, 'and records nothing');
});

let round0 = null;
test("a closed round's result carries the standings it left behind", async () => {
  await waitForRoundStart(G1);
  await answer(G1, S1, { correct: true });
  await answer(G1, S2, { correct: false });
  // Everyone joined has answered: the host's close (not forced) is accepted.
  const closed = await roundCommand('closeLiveChallengeRound', G1);
  assert.equal(closed.roundState, 'closed');
  round0 = await roundDoc(G1, 0);
  assert.ok(Array.isArray(round0.standingsAfterRound), 'written in the closing transaction');
  const players = await publicPlayers(G1);
  const joined = players.filter((row) => row.joined === true);
  assert.deepEqual(round0.standingsAfterRound.map((row) => row.playerKey).sort(), joined.map((row) => row.playerKey).sort(), 'every joined player, nobody else');
  // Grand Prix: the standings are the championship points the close just
  // awarded — the same totals the public rows now carry.
  const scoreByKey = Object.fromEntries(players.map((row) => [row.playerKey, row.score]));
  round0.standingsAfterRound.forEach((row) => assert.equal(row.score, scoreByKey[row.playerKey], `${row.alias}'s standing is their total after the round`));
  const s1 = await playerKeyOf(G1, S1);
  assert.equal(round0.standingsAfterRound[0].playerKey, s1, 'the round winner leads');
  assert.ok(round0.standingsAfterRound[0].score > round0.standingsAfterRound[1].score);
  assert.ok(round0.standingsAfterRound.every((row) => !('studentId' in row)), 'anonymous');
  // And the results moment reads it as one view.
  const view = roundResultsView({ summary: round0, selfKey: s1 });
  assert.equal(view.self.place.ordinal, '1st');
  assert.equal(view.selfStanding.rank, 1);
});

test('Next Round from the results opens the next round, behind its own countdown', async () => {
  const closedAt = millis(round0.closedAt);
  const before = Date.now();
  await roundCommand('advanceLiveChallenge', G1);
  const room = await roomOf(G1);
  assert.equal(room.currentRound, 1);
  assert.equal(room.roundState, 'open');
  assert.ok(millis(room.startsAt) >= before + ROUND_COUNTDOWN_LEAD_MS);
  assert.equal(millis((await roundDoc(G1, 0)).closedAt), closedAt, 'the closed round is not closed again');
});

test('a round is not closed early while a joined student is still working', async () => {
  await waitForRoundStart(G1);
  await answer(G1, S1, { correct: false });
  const early = await failureOf(roundCommand('closeLiveChallengeRound', G1));
  assert.equal(early?.code, 'failed-precondition');
  assert.equal(early?.details?.lifecycle, 'round_in_progress', 'the host console reads this as "still running", not an error');
  assert.equal((await roomOf(G1)).roundState, 'open');
  await answer(G1, S2, { correct: true });
  await roundCommand('closeLiveChallengeRound', G1);
  const round1 = await roundDoc(G1, 1);
  // Movement is between two standings the engine wrote.
  const movement = movementBetween(round0.standingsAfterRound, round1.standingsAfterRound);
  round1.standingsAfterRound.forEach((row) => {
    const earlier = round0.standingsAfterRound.find((entry) => entry.playerKey === row.playerKey);
    assert.equal(movement.get(row.playerKey), earlier.rank - row.rank);
  });
});

test("the last round's standings are the final standings", async () => {
  await roundCommand('advanceLiveChallenge', G1);
  await waitForRoundStart(G1);
  await answer(G1, S1, { correct: true });
  await answer(G1, S2, { correct: true });
  await roundCommand('closeLiveChallengeRound', G1);
  const last = await roundDoc(G1, 2);
  await call('finishLiveChallenge', teacher({ roomId: G1 }));
  assert.equal((await roomOf(G1)).status, 'finished');
  const result = (await db.collection('liveChallengeMatchResults').doc(G1).get()).data();
  const finalRank = Object.fromEntries(result.standings.filter((row) => row.rank !== null).map((row) => [row.playerKey, row.rank]));
  last.standingsAfterRound.forEach((row) => assert.equal(finalRank[row.playerKey], row.rank, `${row.alias}: the results screen showed the final place`));
});

/* ============ PLAY AGAIN: a fresh match the class's invites follow ============ */

test('Play Again is a fresh match with the same settings, and every invite moves to it', async () => {
  const finished = await roomOf(G1);
  const request = replayRequestFromRoom({ ...finished, roomId: G1 }, { rewardPolicy: REWARD_POLICY });
  assert.ok(request, 'a finished room can be replayed');
  const replay = await call('createLiveChallenge', teacher(request));
  const G2 = replay.roomId;
  assert.ok(G2 && G2 !== G1, 'a new room, so a new match');
  await functionsEntry.configureLiveChallengeExperience.run(teacher({ roomId: G2, ...replayExperienceFromRoom(finished) }));
  const fresh = await roomOf(G2);
  for (const field of ['classId', 'courseId', 'standardCode', 'questionStyle', 'challengeMode', 'scoringStrategyId', 'roundSeconds', 'timingMode']) {
    assert.deepEqual(fresh[field], finished[field], `${field} carries over`);
  }
  assert.equal(fresh.status, 'lobby');
  assert.equal(fresh.currentRound, -1);
  assert.equal(fresh.assignmentId, null, 'a replay is never a second Warm-Up result');
  assert.deepEqual(fresh.rewardSummary, finished.rewardSummary);
  for (const studentId of [S1, S2, S3]) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await db.collection('liveChallengeInvites').doc(studentId).get()).data()?.roomId, G2, `${studentId}'s screen follows into the new lobby`);
  }
  // Nothing of the last game is in this one: new player keys, no rounds, no scores.
  const oldKeys = new Set((await publicPlayers(G1)).map((row) => row.playerKey));
  const newRows = await publicPlayers(G2);
  assert.ok(newRows.every((row) => !oldKeys.has(row.playerKey)));
  assert.equal((await roomRef(G2).collection('rounds').get()).size, 0);
  const joined = await call('joinLiveChallenge', student(S1, { roomId: G2 }));
  assert.equal(joined.rejoined, false, 'a first join of a new match');
  assert.equal((await publicPlayers(G2)).find((row) => row.playerKey === joined.playerKey)?.score, 0);
  // The finished game is untouched.
  assert.equal((await roomOf(G1)).status, 'finished');
  assert.ok(await roundDoc(G1, 2));
  await call('cancelLiveChallenge', teacher({ roomId: G2 }));
  assert.equal((await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).exists, false);
});
