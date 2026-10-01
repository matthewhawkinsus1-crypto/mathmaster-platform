// Graph Feature Rush end to end, through the real callables, against a real
// Firestore. Run through `npm run test:challenge-finish`.
//
// WHY. The rush's rules are pure and unit tested (graphFeatureRush*.test.mjs).
// What only a database shows is that the callables apply them inside
// transactions on the engine's lifecycle: a class of students tapping at once
// each gets their own graphs, every graph completes once however a batch is
// retried, a refresh resumes exactly where the student was, the clock is the
// room's, Grand Prix pays the class-size curve at each close, and a class's
// next game starts clean.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const { Timestamp } = admin.firestore;

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'rush-teacher@example.com';
const OTHER_TEACHER = 'rush-teacher-2@example.com';
const CLASSES = {
  pair: { id: 'rush-class-pair', size: 2, teacher: TEACHER },
  medium: { id: 'rush-class-medium', size: 10, teacher: TEACHER },
  large: { id: 'rush-class-large', size: 35, teacher: OTHER_TEACHER },
};
const studentsOf = (key) => Array.from({ length: CLASSES[key].size }, (_, index) => `${CLASSES[key].id}-s${String(index + 1).padStart(2, '0')}`);

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
const call = (name, request) => functionsIndex[name].run(request);
const failureOf = (promise) => promise.then(() => null, (error) => error);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const privatePlayer = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;

for (const [, entry] of Object.entries(CLASSES)) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('classes').doc(entry.id).set({ teacherOfRecord: entry.teacher, status: 'active', course: 'algebra1', period: entry.id, name: `Rush ${entry.id}` });
}
for (const key of Object.keys(CLASSES)) {
  const batch = db.batch();
  studentsOf(key).forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: CLASSES[key].teacher, classId: CLASSES[key].id, classPeriod: CLASSES[key].id, firstName: `Rush${index + 1}`, lastName: 'Student',
  }));
  // eslint-disable-next-line no-await-in-loop
  await batch.commit();
}

/* ------------------------------- playing -------------------------------- */

const createRush = (classKey, extra = {}) => call('createLiveChallenge', teacherAs(CLASSES[classKey].teacher)({
  classId: CLASSES[classKey].id,
  courseId: 'algebra1',
  challengeMode: 'graphFeatureRush',
  graphFeatureRush: { presetId: 'algebra1Quick' },
  roundCount: 3,
  roundSeconds: 60,
  ...extra,
}));

const identityOf = async (roomId) => {
  const room = await roomOf(roomId);
  return { roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken };
};

const waitForRoundStart = async (roomId) => {
  const room = await roomOf(roomId);
  const delay = Math.max(0, (room.startsAt?.toMillis?.() || 0) - Date.now() + 30);
  if (delay) await sleep(delay);
};

const tapAt = (question, target, overrides = {}) => ({
  attemptId: randomUUID(),
  questionIndex: question.questionIndex,
  kind: 'tap',
  x: target.x,
  y: target.y,
  tolerance: { x: 0.4, y: 0.4 },
  pointer: 'touch',
  clientElapsedMs: 4_000,
  ...overrides,
});

// A wrong tap: a corner of the view, where generated graphs never put a target.
const missTap = (question) => tapAt(question, { x: question.view.xMin + 0.01 * (question.view.xMax - question.view.xMin), y: question.view.yMax - 0.01 * (question.view.yMax - question.view.yMin) });

const answerAttempts = (question) => (question.targets.length
  ? question.targets.map((target) => tapAt(question, target))
  : [{ attemptId: randomUUID(), questionIndex: question.questionIndex, kind: 'dne', clientElapsedMs: 4_000 }]);

/** A student completes `graphs` graphs, making `misses` wrong taps first. */
const play = async (roomId, studentId, { graphs = 1, misses = 0 } = {}) => {
  const identity = await identityOf(roomId);
  let completed = 0;
  let missesLeft = misses;
  while (completed < graphs) {
    // eslint-disable-next-line no-await-in-loop
    const fetched = await call('getGraphFeatureRushRound', student(studentId, { ...identity, count: 6 }));
    assert.equal(fetched.roundOpen, true);
    assert.ok(fetched.questions.length > 0);
    for (const question of fetched.questions) {
      if (completed >= graphs) break;
      const attempts = [];
      while (missesLeft > 0 && attempts.length < 2) { attempts.push(missTap(question)); missesLeft -= 1; }
      attempts.push(...answerAttempts(question));
      // eslint-disable-next-line no-await-in-loop
      const result = await call('submitGraphFeatureRushAttempts', student(studentId, { ...identity, attempts }));
      assert.equal(result.verdicts.at(-1).completesQuestion, true, JSON.stringify(result.verdicts));
      completed += 1;
    }
  }
};

const closeRound = async (roomId, classKey = 'pair') => {
  const identity = await identityOf(roomId);
  return call('closeLiveChallengeRound', teacherAs(CLASSES[classKey].teacher)({
    roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion, force: true,
  }));
};

const advance = async (roomId, classKey = 'pair') => {
  const identity = await identityOf(roomId);
  return call('advanceLiveChallenge', teacherAs(CLASSES[classKey].teacher)({
    roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion,
  }));
};

const roundResult = async (roomId, roundIndex) => (await roomRef(roomId).collection('rounds').doc(String(roundIndex)).get()).data();

/* ===================== GAME 1: two players, Grand Prix ===================== */

const [A, B] = studentsOf('pair');
const game1 = await createRush('pair');
const G1 = game1.roomId;

test('a rush lobby is a Live Challenge room with the rush settings and a private seed', async () => {
  const room = await roomOf(G1);
  assert.equal(room.status, 'lobby');
  assert.equal(room.challengeMode, 'graphFeatureRush');
  assert.equal(room.scoringStrategyId, 'grandPrix', 'the rush defaults to Grand Prix');
  assert.equal(room.roundCount, 3);
  assert.equal(room.roundSeconds, 60);
  assert.equal(room.timingMode, 'timed');
  assert.equal(room.roundClosingThreshold, null, 'no early close in a timed rush');
  assert.equal(room.secondChanceMode, 'off');
  assert.deepEqual(room.graphFeatureRush.config.families, ['linear', 'quadratic']);
  assert.ok(!('seed' in room.graphFeatureRush), 'the seed never reaches a client-readable document');
  const secret = (await privateRef(G1).get()).data();
  assert.ok(secret.graphFeatureRush.seed);
  assert.equal(secret.scoringConfig.placementCurve, 'field');
  assert.deepEqual(secret.questionIds, ['graphFeatureRush:round:1', 'graphFeatureRush:round:2', 'graphFeatureRush:round:3']);
});

test('nobody gets graphs before the round, and a rush round opens with a card, not a graph', async () => {
  await call('joinLiveChallenge', student(A, { roomId: G1 }));
  await call('joinLiveChallenge', student(B, { roomId: G1 }));
  const early = await call('getGraphFeatureRushRound', student(A, { roomId: G1, roundIndex: 0 }));
  assert.equal(early.roundOpen, false);
  assert.deepEqual(early.questions, []);
  await call('startLiveChallenge', teacher({ roomId: G1 }));
  const room = await roomOf(G1);
  assert.equal(room.roundState, 'open');
  assert.equal(room.currentQuestion.kind, 'graphFeatureRush');
  assert.ok(!('targets' in room.currentQuestion) && !('graph' in room.currentQuestion), 'the projector never sees a graph or an answer');
  assert.equal(room.activeRoundSeconds, 60);
});

test('two students get different graphs, and a tap before the start is refused', async () => {
  const identity = await identityOf(G1);
  const tooEarly = await failureOf(call('submitGraphFeatureRushAttempts', student(A, { ...identity, attempts: [{ attemptId: randomUUID(), questionIndex: 0, kind: 'dne' }] })));
  assert.equal(tooEarly?.code, 'deadline-exceeded', 'the synchronized start is the server clock');
  await waitForRoundStart(G1);
  const a = await call('getGraphFeatureRushRound', student(A, { ...identity, count: 4 }));
  const b = await call('getGraphFeatureRushRound', student(B, { ...identity, count: 4 }));
  assert.equal(a.questions.length, 4);
  assert.deepEqual(a.questions.map((question) => question.questionIndex), [0, 1, 2, 3]);
  assert.notDeepEqual(a.questions.map((question) => question.graph), b.questions.map((question) => question.graph));
  const again = await call('getGraphFeatureRushRound', student(A, { ...identity, count: 4 }));
  assert.deepEqual(again.questions, a.questions, 'the same graphs every time they are asked for');
});

test('one graph completes once: replays, found-again taps and racing taps change nothing', async () => {
  const identity = await identityOf(G1);
  const { questions: [question] } = await call('getGraphFeatureRushRound', student(A, { ...identity, count: 1 }));
  const attempts = [missTap(question), ...answerAttempts(question)];
  const first = await call('submitGraphFeatureRushAttempts', student(A, { ...identity, attempts }));
  assert.equal(first.recorded, attempts.length);
  assert.equal(first.verdicts.at(-1).completesQuestion, true);
  assert.equal(first.state.cursor, 1);
  const replay = await call('submitGraphFeatureRushAttempts', student(A, { ...identity, attempts }));
  assert.equal(replay.recorded, 0, 'a retried batch is a replay');
  assert.ok(replay.verdicts.every((row) => row.replay === true));
  const late = await call('submitGraphFeatureRushAttempts', student(A, { ...identity, attempts: answerAttempts(question) }));
  assert.ok(late.verdicts.every((row) => row.verdict === 'resolved'), 'a finished graph takes no more taps');
  const ahead = await call('submitGraphFeatureRushAttempts', student(A, { ...identity, attempts: [{ attemptId: randomUUID(), questionIndex: 5, kind: 'dne' }] }));
  assert.equal(ahead.verdicts[0].verdict, 'outOfOrder');
  const player = await privatePlayer(G1, A);
  assert.equal(player.correctCount, 1, 'one graph completed, counted once');
  assert.equal(player.targetAttempts, attempts.length);
  const row = (await publicPlayers(G1)).find((entry) => entry.id === player.playerKey);
  assert.equal(row.rushRound, 0);
  assert.equal(row.rushRoundCompleted, 1);
  assert.equal(row.score, 0, 'Grand Prix: the championship score waits for the close');
  assert.ok(!JSON.stringify(row).includes(A), 'the public row names nobody');
});

test('a refresh mid-graph resumes on the same graph with its found targets', async () => {
  const identity = await identityOf(G1);
  // Find a multi-target graph for B and tap only its first target.
  let resumed = null;
  for (let attempt = 0; attempt < 12 && !resumed; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { questions: [question] } = await call('getGraphFeatureRushRound', student(B, { ...identity, count: 1 }));
    if (question.targets.length >= 2) {
      // eslint-disable-next-line no-await-in-loop
      await call('submitGraphFeatureRushAttempts', student(B, { ...identity, attempts: [tapAt(question, question.targets[0])] }));
      resumed = question;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await call('submitGraphFeatureRushAttempts', student(B, { ...identity, attempts: answerAttempts(question) }));
    }
  }
  assert.ok(resumed, 'a multi-target graph came up');
  // The device reloads: it knows nothing; the server knows where B is.
  const after = await call('getGraphFeatureRushRound', student(B, { ...identity, count: 2 }));
  assert.equal(after.state.cursor, resumed.questionIndex);
  assert.deepEqual(after.state.cursorTargetsFound, [resumed.targets[0].id]);
  assert.deepEqual(after.questions[0], resumed, 'the very same graph comes back');
  // Finishing it after the refresh completes it — once.
  const finish = await call('submitGraphFeatureRushAttempts', student(B, { ...identity, attempts: resumed.targets.slice(1).map((target) => tapAt(resumed, target)) }));
  assert.equal(finish.verdicts.at(-1).completesQuestion, true);
});

test('a stale round token, a classic answer and a pacing change are refused or ignored', async () => {
  const identity = await identityOf(G1);
  const stale = await failureOf(call('submitGraphFeatureRushAttempts', student(A, { ...identity, roundToken: 'old-token', attempts: [{ attemptId: randomUUID(), questionIndex: 1, kind: 'dne' }] })));
  assert.equal(stale?.code, 'failed-precondition');
  const classic = await failureOf(call('submitLiveChallengeResponse', student(A, { ...identity, submissionId: randomUUID(), responsePayload: {} })));
  assert.equal(classic?.code, 'failed-precondition');
  assert.match(classic?.message || '', /tapping graphs/);
  const pacing = await call('updateLiveChallengePacing', teacher({ roomId: G1, roundClosingThreshold: 60 }));
  assert.equal(pacing.roundClosingThreshold, null);
  assert.equal((await roomOf(G1)).roundClosingThreshold, null);
});

test('round 1 closes into ranked results: placement points for a field of two, and each player\'s own facts', async () => {
  await play(G1, A, { graphs: 3 });
  const early = await failureOf(advance(G1));
  assert.equal(early?.code, 'failed-precondition', 'a timed rush round is not over until its clock is');
  await closeRound(G1);
  const room = await roomOf(G1);
  assert.equal(room.roundState, 'closed');
  const round = await roundResult(G1, 0);
  assert.equal(round.fieldSize, 2);
  assert.deepEqual(round.standings.map((row) => row.matchPointsAwarded), [12, 3]);
  assert.ok(round.standings[0].completed > round.standings[1].completed, 'more graphs, higher place');
  const rows = await publicPlayers(G1);
  const aKey = (await privatePlayer(G1, A)).playerKey;
  const aRow = rows.find((row) => row.id === aKey);
  const aStanding = round.standings.find((row) => row.playerKey === aKey);
  // Each player's own round facts match the round result and their score.
  assert.deepEqual(
    [aRow.lastRound.rank, aRow.lastRound.matchPointsAwarded, aRow.lastRound.completed, aRow.score],
    [aStanding.rank, aStanding.matchPointsAwarded, aStanding.completed, aStanding.matchPointsAwarded],
  );
  assert.equal(aRow.lastRound.roundIndex, 0);
  assert.ok(aRow.lastRound.accuracyPercent < 100, 'the miss in the first graph counts');
  // Closing again changes nothing.
  const again = await closeRound(G1);
  assert.equal(again.alreadyApplied, true);
  assert.equal((await privatePlayer(G1, A)).matchPoints, aStanding.matchPointsAwarded);
});

test('taps after the deadline\'s grace are refused, whatever the device thinks', async () => {
  await advance(G1);
  await waitForRoundStart(G1);
  await play(G1, B, { graphs: 4 });
  await play(G1, A, { graphs: 1 });
  // The clock runs out (the round's own deadline, moved into the past).
  await roomRef(G1).set({ endsAt: Timestamp.fromMillis(Date.now() - 5_000), roundEndsAt: Timestamp.fromMillis(Date.now() - 5_000) }, { merge: true });
  const identity = await identityOf(G1);
  const before = await privatePlayer(G1, A);
  const late = await failureOf(call('submitGraphFeatureRushAttempts', student(A, { ...identity, attempts: [{ attemptId: randomUUID(), questionIndex: 1, kind: 'dne' }] })));
  assert.equal(late?.code, 'deadline-exceeded');
  assert.equal((await privatePlayer(G1, A)).targetAttempts, before.targetAttempts, 'nothing was recorded');
  const fetched = await call('getGraphFeatureRushRound', student(A, { ...identity }));
  assert.equal(fetched.roundOpen, true, 'the room is still open until the host closes it…');
  // …and the host may now move on without forcing: the deadline passed.
  const advanced = await advance(G1);
  assert.equal(advanced.roundIndex, 2);
  const round = await roundResult(G1, 1);
  assert.equal(round.standings[0].playerKey, (await privatePlayer(G1, B)).playerKey, 'B won round 2');
});

test('a student from another class cannot join this game', async () => {
  const outsider = await failureOf(call('joinLiveChallenge', student(studentsOf('medium')[0], { roomId: G1 })));
  assert.equal(outsider?.code, 'permission-denied');
});

test('the final round finishes the match: championship standings, report and rewards', async () => {
  await waitForRoundStart(G1);
  await play(G1, A, { graphs: 2 });
  await play(G1, B, { graphs: 2, misses: 2 });
  // The host's screen closes the round at the buzzer; here the host forces it.
  await closeRound(G1);
  const finished = await advance(G1);
  assert.equal(finished.status, 'finished');
  const result = (await db.collection('liveChallengeMatchResults').doc(G1).get()).data();
  assert.equal(result.modeId, 'graphFeatureRush');
  assert.equal(result.scoringStrategyId, 'grandPrix');
  assert.equal(result.playedRoundCount, 3);
  const standings = Object.fromEntries(result.standings.map((row) => [row.studentId, row]));
  assert.equal(standings[A].matchPoints + standings[B].matchPoints, 12 + 3 + 12 + 3 + 12 + 3, 'every round paid 12 and 3');
  assert.ok(standings[A].questionSetSummary.completed >= 6);
  assert.ok(standings[A].roundOutcomes.length === 3);
  // Effects ran from the result: the report has the rush breakdown.
  let report = null;
  for (let attempt = 0; attempt < 20 && !report; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    report = (await db.collection('liveChallengeReports').doc(G1).get()).data() || null;
    // eslint-disable-next-line no-await-in-loop
    if (!report) await sleep(100);
  }
  assert.ok(report?.graphFeatureRush, 'the report carries the rush breakdown');
  assert.ok(report.graphFeatureRush.byFeature.length > 0);
  assert.equal(report.weakestStandard, null);
  assert.equal(report.classAccuracyPercent, report.graphFeatureRush.accuracyPercent);
  // Finisher for both (3 of 3 rounds); private state is cleaned up last.
  const awards = (await db.collection('liveChallengeAchievementJobs').doc(G1).get()).data();
  const finisher = Object.values(awards?.awards || {}).filter((award) => award.ruleId === 'challengeFinisher');
  assert.equal(finisher.length, 2);
  assert.equal((await privateRef(G1).get()).exists, false);
});

test('the class\'s next game starts clean, immediately', async () => {
  const next = await createRush('pair', { graphFeatureRush: { presetId: 'interceptSprint' }, scoringStrategyId: 'correctCount', roundCount: 1 });
  assert.notEqual(next.roomId, G1);
  const invite = (await db.collection('liveChallengeInvites').doc(A).get()).data();
  assert.equal(invite.roomId, next.roomId);
  await call('joinLiveChallenge', student(A, { roomId: next.roomId }));
  const fresh = await privatePlayer(next.roomId, A);
  assert.equal(fresh.correctCount, 0);
  assert.equal(Object.keys(fresh.submissionReceipts || {}).length, 0);
  await call('startLiveChallenge', teacher({ roomId: next.roomId }));
  await waitForRoundStart(next.roomId);
  await play(next.roomId, A, { graphs: 3 });
  const row = (await publicPlayers(next.roomId)).find((entry) => entry.id === fresh.playerKey);
  assert.equal(row.score, 3, 'Correct Count banks each completed graph');
  // The old game is untouched by the new one.
  assert.equal((await roomOf(G1)).status, 'finished');
  const done = await call('finishLiveChallenge', teacher({ roomId: next.roomId }));
  assert.equal(done.status, 'finished');
});

/* =================== GAME 2: ten students, Correct Count =================== */

test('ten students, Correct Count: totals are graphs, ties go to accuracy, a late joiner plays', async () => {
  const roster = studentsOf('medium');
  const late = roster[roster.length - 1];
  const created = await createRush('medium', { scoringStrategyId: 'correctCount', roundCount: 1 });
  await Promise.all(roster.slice(0, -1).map((studentId) => call('joinLiveChallenge', student(studentId, { roomId: created.roomId }))));
  await call('startLiveChallenge', teacher({ roomId: created.roomId }));
  await waitForRoundStart(created.roomId);
  // One student walks in after the round started.
  await call('joinLiveChallenge', student(late, { roomId: created.roomId }));
  assert.equal((await privatePlayer(created.roomId, late)).joinedAtRound, 0, 'joined during round 1, measured from round 1');
  await Promise.all(roster.map((studentId, index) => play(created.roomId, studentId, { graphs: 1 + (index % 4), misses: index === 1 ? 2 : 0 })));
  const rows = await publicPlayers(created.roomId);
  assert.deepEqual(rows.map((row) => row.score).sort((x, y) => x - y), [1, 1, 1, 2, 2, 2, 3, 3, 4, 4]);
  // Students 1 and 5 both completed two graphs; student 1 missed twice.
  const [s1, s5] = [await privatePlayer(created.roomId, roster[1]), await privatePlayer(created.roomId, roster[5])];
  assert.equal(s1.correctCount, s5.correctCount);
  assert.ok(s1.matchAccuracy < s5.matchAccuracy);
  const s1Row = rows.find((row) => row.id === s1.playerKey);
  assert.equal(s1Row.matchAccuracy, s1.matchAccuracy, 'the board ranks with the same accuracy the result does');
  await call('finishLiveChallenge', teacher({ roomId: created.roomId }));
  const result = (await db.collection('liveChallengeMatchResults').doc(created.roomId).get()).data();
  const order = result.standings.map((row) => row.studentId);
  assert.ok(order.indexOf(roster[5]) < order.indexOf(roster[1]), 'equal graphs: the accurate student ranks ahead');
});

/* ============== GAME 3: thirty-five students tapping at once ============== */

test('thirty-five students tap at once: nobody is lost, the field curve pays 12 to 3', async () => {
  const roster = studentsOf('large');
  const asTeacher = teacherAs(OTHER_TEACHER);
  const created = await call('createLiveChallenge', asTeacher({
    classId: CLASSES.large.id, courseId: 'algebra1', challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'algebra1Functions' }, roundCount: 1, roundSeconds: 45,
  }));
  await Promise.all(roster.map((studentId) => call('joinLiveChallenge', student(studentId, { roomId: created.roomId }))));
  await call('startLiveChallenge', asTeacher({ roomId: created.roomId }));
  await waitForRoundStart(created.roomId);
  // Everyone at once, each completing a distinct number of graphs.
  await Promise.all(roster.map((studentId, index) => play(created.roomId, studentId, { graphs: 1 + (index % 7), misses: index % 3 })));
  const identity = await identityOf(created.roomId);
  await call('closeLiveChallengeRound', asTeacher({ roomId: created.roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion, force: true }));
  const round = await roundResult(created.roomId, 0);
  assert.equal(round.standings.length, 35);
  assert.equal(round.fieldSize, 35);
  const points = round.standings.map((row) => row.matchPointsAwarded);
  assert.equal(Math.max(...points), 12);
  assert.ok(Math.min(...points) >= 3, 'everyone who completed something earns at least 3');
  assert.ok(points.every((value, index) => index === 0 || value <= points[index - 1]));
  const totalGraphs = roster.reduce((sum, _, index) => sum + 1 + (index % 7), 0);
  const recorded = round.standings.reduce((sum, row) => sum + row.completed, 0);
  assert.equal(recorded, totalGraphs, 'every completed graph of every student is in the round result');
  await call('finishLiveChallenge', asTeacher({ roomId: created.roomId }));
});

/* ============================ refusals at create ============================ */

test('an impossible configuration is refused at create, with the reason', async () => {
  const noFamilies = await failureOf(createRush('medium', { graphFeatureRush: { families: [], features: ['vertex'] } }));
  assert.equal(noFamilies?.code, 'invalid-argument');
  assert.match(noFamilies.message, /at least one kind of graph/);
  const vertexOfLines = await failureOf(createRush('medium', { graphFeatureRush: { families: ['linear'], features: ['vertex'] } }));
  assert.equal(vertexOfLines?.code, 'invalid-argument');
  assert.match(vertexOfLines.message, /quadratic or absolute value/);
  const warmup = await failureOf(createRush('medium', { assignmentId: 'no-such-assignment' }));
  assert.ok(['not-found', 'failed-precondition'].includes(warmup?.code));
});

test('a teacher previews sample graphs without creating anything', async () => {
  const preview = await call('previewGraphFeatureRush', teacher({ graphFeatureRush: { presetId: 'algebra2Mixed' }, count: 6 }));
  assert.equal(preview.questions.length, 6);
  assert.equal(preview.config.difficulty, 'mixed');
  const refused = await failureOf(call('previewGraphFeatureRush', student(studentsOf('pair')[0], {})));
  assert.ok(refused, 'students cannot preview');
});
