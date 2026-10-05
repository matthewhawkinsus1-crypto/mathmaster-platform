// THE BOUNDED PUBLIC STANDINGS PROJECTION, through the real callables against
// a real Firestore. Run through `npm run test:challenge-finish`. Small rooms:
// the class-scale certification (deliveries per screen, listeners, latency at
// 5–64 students) is the launch certification's, on its own emulator.
//
// What is held here, end to end:
//   - EXACT AT EVERY MILESTONE: a round's close writes the standings the round
//     left behind (the round result's own standingsAfterRound), the finish
//     writes the match result's standings — for Accuracy First, Correct Count
//     and Grand Prix, ties included;
//   - LIVE IS THE BOARD: a live snapshot ranks the public rows exactly as the
//     host's board does, and is refused when too soon, unchanged, from an
//     earlier moment, after the end, or asked for by anyone but the room's
//     teacher;
//   - THE ANSWER PATH NEVER TOUCHES IT: an answer reads and writes no
//     standings document; a missing, stale or corrupted snapshot changes no
//     score, no placement and no final standing, and the next milestone
//     replaces it with the exact one; a publish the database refuses blocks no
//     answer; work in progress is live-only, never in an exact snapshot;
//   - PRIVATE STAYS PRIVATE: no snapshot ever carries a student id, an email,
//     an answer or a per-player time;
//   - A RUSH ROUND publishes nothing while it is open; a room from before seats
//     is still decoded by every player; a finished room whose final snapshot is
//     missing is repaired from its match result.

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

const { installFirestoreAccounting, runAsCallable, accountingSince } = await import('./support/firestoreAccounting.mjs');
const { functionsFirestoreClass } = await import('./support/emulatorTransactions.mjs');
installFirestoreAccounting();
const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { leaderboardOptionsFor } = await import(path.join(repo, 'functions/shared/liveChallengeScoring.mjs'));
const projectionRules = await import(path.join(repo, 'functions/shared/liveChallengeStandingsProjection.mjs'));
const db = admin.firestore();

const SUITE_STANDARD = 'STANDINGSSUITE1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failureOf = (promise) => promise.then(() => null, (error) => error);

/* ---------------------------- a bank and classes ---------------------------- */

const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(item, `standings-suite|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    // eslint-disable-next-line no-await-in-loop
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= 3, 'the seed bank must hold gradable choice questions');
await Promise.all(bank.map((item) => db.collection('pathQuestionBank').doc(`${item.id}--standings-suite`).set({
  ...item, id: `${item.id}--standings-suite`, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, `texas:${SUITE_STANDARD}`],
})));

let classSeq = 0;
// Each case has its own teacher and class: one active room per teacher.
const seedClass = async (size) => {
  classSeq += 1;
  const key = `st${classSeq}`;
  const entry = {
    teacher: `standings-suite-${key}@example.com`,
    classId: `standings-suite-${key}`,
    students: Array.from({ length: size }, (_, index) => `standings-suite-${key}-s${index + 1}`),
  };
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: entry.teacher, status: 'active', course: 'algebra1', period: key, name: `Standings ${key}` });
  const batch = db.batch();
  entry.students.forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: entry.teacher, classId: entry.classId, classPeriod: key, firstName: `Kid${index + 1}`, lastName: 'Standings',
  }));
  await batch.commit();
  return entry;
};

const asTeacher = (email, data) => ({ auth: { uid: `${email}-uid`, token: { role: 'teacher', email, email_verified: true } }, data, rawRequest: { headers: {} } });
const asStudent = (studentId, data) => ({ auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } }, data, rawRequest: { headers: {} } });
const call = (name, request) => runAsCallable(name, () => functionsIndex[name].run(request));
const teacherCall = (entry, name, data) => call(name, asTeacher(entry.teacher, data));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const standingsOf = async (roomId) => (await roomRef(roomId).collection('standings').doc('current').get()).data() || null;
const publicRows = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ playerKey: doc.id, ...doc.data() }));
const privatePlayers = async (roomId) => (await db.collection('liveChallengePrivate').doc(roomId).collection('players').get()).docs.map((doc) => ({ studentId: doc.id, ...doc.data() }));
const roundSummary = async (roomId, roundIndex) => (await roomRef(roomId).collection('rounds').doc(String(roundIndex)).get()).data() || null;
const resultOf = async (roomId) => (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data() || null;

const createRoom = async (entry, extra = {}) => (await teacherCall(entry, 'createLiveChallenge', {
  classId: entry.classId, courseId: 'algebra1', standardCode: SUITE_STANDARD, questionStyle: 'noTools', roundCount: 3, roundSeconds: 60, roundClosingThreshold: 'off', ...extra,
})).roomId;
const joinAll = (entry, roomId, students = entry.students) => Promise.all(students.map((studentId) => call('joinLiveChallenge', asStudent(studentId, { roomId }))));
const fieldsFor = async (roomId, roundIndex) => {
  const state = (await db.collection('liveChallengePrivate').doc(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  return (await mathPath.buildIssuePlan(instantiated.question)).privateGrading.fields;
};
const untilStarted = async (roomId) => {
  const room = await roomOf(roomId);
  await sleep(Math.max(0, (room.startsAt?.toMillis?.() || 0) - Date.now()) + 60);
  return roomOf(roomId);
};
const answer = async (roomId, studentId, { correct = true, elapsedMs = 2_000, submissionId = randomUUID() } = {}) => {
  const room = await roomOf(roomId);
  const fields = await fieldsFor(roomId, room.currentRound);
  return call('submitLiveChallengeResponse', asStudent(studentId, {
    roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken, submissionId, humanElapsedMs: elapsedMs,
    responsePayload: { responses: Object.fromEntries(fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) },
  }));
};
// Publish, waiting out the one-per-second bound the way the host's pacer does.
const publish = async (entry, roomId) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const reply = await teacherCall(entry, 'publishLiveChallengeStandings', { roomId });
    if (reply.reason !== 'too-soon') return reply;
    // eslint-disable-next-line no-await-in-loop
    await sleep(Number(reply.retryAfterMs) + 20);
  }
  throw new Error('publish stayed too soon');
};
const closeRound = async (entry, roomId) => {
  const room = await roomOf(roomId);
  return teacherCall(entry, 'closeLiveChallengeRound', { roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion, force: true });
};
const advance = async (entry, roomId) => {
  const room = await roomOf(roomId);
  return teacherCall(entry, 'advanceLiveChallenge', { roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion });
};

/* ------------------------------- comparisons ------------------------------- */

// Every ranked seat in a snapshot, as [playerKey, rank, score], in rank order.
const tableOf = (projection, players) => {
  const keyOfSlot = new Map(players.map((player) => [player.slot, player.playerKey]));
  const keys = projection.slotKeys ? projection.slotKeys.split(',') : null;
  return projectionRules.projectionRankTable(projection)
    .map((seat) => [keys ? keys[seat.slot] : keyOfSlot.get(seat.slot), seat.rank, seat.score])
    .sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0])));
};
const tableOfStandings = (standings) => standings.filter((row) => row.rank !== null && row.rank !== undefined && row.joined !== false)
  .map((row) => [row.playerKey, row.rank, row.score])
  .sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0])));
const assertNothingPrivate = (projection, label) => {
  const text = JSON.stringify(projection);
  for (const forbidden of ['studentId', 'standings-suite-st', '@example.com', 'answeredRound', 'provisional', 'submission', 'Receipt', 'updatedAt', 'responses', 'diagnostic', 'launchMilestones', 'Kid1 ', 'Standings Kid']) {
    assert.equal(text.includes(forbidden), false, `${label}: the snapshot carries "${forbidden}"`);
  }
};

/* ================================== cases ================================== */

for (const scoringStrategyId of ['accuracyFirst', 'correctCount', 'grandPrix']) {
  test(`${scoringStrategyId}: the snapshot is exact at every round close and at the finish, and live in between`, { timeout: 120_000 }, async () => {
    const entry = await seedClass(6);
    const roomId = await createRoom(entry, { scoringStrategyId });
    await joinAll(entry, roomId);
    // The lobby: who is in.
    const lobby = await publish(entry, roomId);
    assert.equal(lobby.published, true, JSON.stringify(lobby));
    const lobbyProjection = await standingsOf(roomId);
    assert.equal(lobbyProjection.kind, 'live');
    assert.equal(lobbyProjection.phase, 'lobby');
    assert.equal(lobbyProjection.count, 6);
    assertNothingPrivate(lobbyProjection, 'lobby');

    await teacherCall(entry, 'startLiveChallenge', { roomId });
    // Every round: some right, some wrong, two tied by construction.
    const pattern = [[true, true, false, true, false, true], [true, false, true, true, false, false], [false, true, true, true, true, false]];
    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      if (roundIndex > 0) {
        // eslint-disable-next-line no-await-in-loop
        await advance(entry, roomId);
        // The close inside Next Round wrote the exact standings of the round before.
        // eslint-disable-next-line no-await-in-loop
        const carried = await standingsOf(roomId);
        assert.equal(carried.kind, 'roundClosed', `round ${roundIndex}: Next Round leaves the closed round's standings`);
      }
      // eslint-disable-next-line no-await-in-loop
      await untilStarted(roomId);
      // eslint-disable-next-line no-await-in-loop
      for (const [index, studentId] of entry.students.entries()) await answer(roomId, studentId, { correct: pattern[roundIndex][index], elapsedMs: index < 2 ? 2_000 : 2_000 + index * 300 });
      // LIVE: exactly the board the host ranks from the same rows.
      // eslint-disable-next-line no-await-in-loop
      const reply = await publish(entry, roomId);
      assert.equal(reply.published, true, `round ${roundIndex + 1}: ${JSON.stringify(reply)}`);
      // eslint-disable-next-line no-await-in-loop
      const [live, rows, room, players] = await Promise.all([standingsOf(roomId), publicRows(roomId), roomOf(roomId), privatePlayers(roomId)]);
      const board = challenge.publicLeaderboard(rows, { activeRound: projectionRules.liveProjectionActiveRound(room, live.sourceReadMs), ...leaderboardOptionsFor(scoringStrategyId) });
      assert.equal(live.kind, 'live');
      assert.deepEqual(tableOf(live, players), board.map((row) => [row.playerKey, row.rank, row.liveScore]).sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0]))), `round ${roundIndex + 1}: the live snapshot is the host's board`);
      assertNothingPrivate(live, `round ${roundIndex + 1} live`);
      if (roundIndex < 2) {
        // ROUND CLOSE: the standings the round result records.
        // eslint-disable-next-line no-await-in-loop
        await closeRound(entry, roomId);
        // eslint-disable-next-line no-await-in-loop
        const [closed, summary] = await Promise.all([standingsOf(roomId), roundSummary(roomId, roundIndex)]);
        assert.equal(closed.kind, 'roundClosed');
        assert.equal(closed.exact, true);
        assert.deepEqual(tableOf(closed, players), tableOfStandings(summary.standingsAfterRound), `round ${roundIndex + 1}: the closed snapshot is the round's standingsAfterRound`);
        assert.deepEqual(closed.top.map((row) => [row.playerKey, row.rank, row.tied]), summary.standingsAfterRound.slice(0, 5).map((row) => [row.playerKey, row.rank, row.tied]));
        assertNothingPrivate(closed, `round ${roundIndex + 1} closed`);
        // A live publish after the close, with nothing new: no write, no delivery.
        // eslint-disable-next-line no-await-in-loop
        const again = await publish(entry, roomId);
        assert.equal(again.published, false, `after the close: ${JSON.stringify(again)}`);
      }
    }
    const playersAtEnd = await privatePlayers(roomId);
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
    assert.equal(final.kind, 'final');
    assert.equal(final.exact, true);
    assert.equal(final.status, 'finished');
    assert.deepEqual(tableOf(final, playersAtEnd), tableOfStandings(result.standings), 'the final snapshot IS the match result');
    assert.deepEqual(final.top.map((row) => [row.playerKey, row.rank, row.tied, row.score]), result.standings.filter((row) => row.rank !== null).slice(0, 5).map((row) => [row.playerKey, row.rank, row.tied, row.score]), 'the podium is the match result\'s');
    assert.equal(final.count, result.standings.filter((row) => row.joined).length);
    assertNothingPrivate(final, 'final');
    // Nothing replaces the final: a publish now is refused and writes nothing.
    const after = await teacherCall(entry, 'publishLiveChallengeStandings', { roomId });
    assert.equal(after.published, false);
    assert.equal((await standingsOf(roomId)).kind, 'final');
  });
}

test('publishing is the room teacher\'s alone, once a second, and never rewrites what did not change', async () => {
  const entry = await seedClass(4);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  assert.equal((await publish(entry, roomId)).published, true);
  const soon = await teacherCall(entry, 'publishLiveChallengeStandings', { roomId });
  assert.equal(soon.published, false);
  assert.equal(soon.reason, 'too-soon');
  assert.ok(soon.retryAfterMs > 0 && soon.retryAfterMs <= projectionRules.STANDINGS_MIN_PUBLISH_INTERVAL_MS, JSON.stringify(soon));
  await sleep(soon.retryAfterMs + 20);
  const before = await roomRef(roomId).collection('standings').doc('current').get();
  const unchanged = await teacherCall(entry, 'publishLiveChallengeStandings', { roomId });
  assert.equal(unchanged.published, false);
  assert.equal(unchanged.reason, 'unchanged');
  const afterUnchanged = await roomRef(roomId).collection('standings').doc('current').get();
  assert.equal(afterUnchanged.updateTime.toMillis(), before.updateTime.toMillis(), 'an unchanged board is not rewritten, so no screen is woken');
  const student = await failureOf(call('publishLiveChallengeStandings', asStudent(entry.students[0], { roomId })));
  assert.match(String(student?.code), /permission-denied/, 'a student cannot publish');
  const stranger = await failureOf(call('publishLiveChallengeStandings', asTeacher('someone-else@example.com', { roomId })));
  assert.match(String(stranger?.code), /permission-denied/, 'another teacher cannot publish');
  await teacherCall(entry, 'cancelLiveChallenge', { roomId });
});

test('the answer path never reads or writes the snapshot, and a missing or corrupted one changes no score, placement or final standing', { timeout: 90_000 }, async () => {
  const entry = await seedClass(5);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  await untilStarted(roomId);
  // A snapshot that lies: wrong ranks, wrong scores, a final kind, garbage.
  await roomRef(roomId).collection('standings').doc('current').set({
    schemaVersion: 1, roomId, kind: 'live', exact: false, phase: 'open', roundVersion: 1, count: 99, ranks: '99,99,99', scores: '999999,0,0', top: [{ alias: 'Liar', rank: 1, score: 999999 }], sourceReadMs: 9e15,
  });
  const since = Date.now();
  for (const [index, studentId] of entry.students.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const reply = await answer(roomId, studentId, { correct: index !== 2 });
    assert.equal(reply.serverConfirmed, true);
  }
  const answers = accountingSince(since).events.filter((event) => event.callable === 'submitLiveChallengeResponse');
  assert.ok(answers.length > 0, 'the answers were counted');
  assert.equal(answers.filter((event) => event.cat === 'standings').length, 0, `an answer touched the standings snapshot: ${JSON.stringify(answers.filter((event) => event.cat === 'standings'))}`);
  // Delete it outright mid-round: nothing about the round depends on it.
  await roomRef(roomId).collection('standings').doc('current').delete();
  const playersMid = await privatePlayers(roomId);
  playersMid.forEach((player) => assert.equal(Number(player.answeredRound), 0, `${player.studentId} answered once`));
  await closeRound(entry, roomId);
  const [closed, summary, players] = await Promise.all([standingsOf(roomId), roundSummary(roomId, 0), privatePlayers(roomId)]);
  assert.equal(closed.kind, 'roundClosed', 'the close wrote the exact standings over whatever was there');
  assert.deepEqual(tableOf(closed, players), tableOfStandings(summary.standingsAfterRound));
  // Corrupt it again, then finish: the final is the match result.
  await roomRef(roomId).collection('standings').doc('current').set({ schemaVersion: 1, roomId, kind: 'live', phase: 'open', roundVersion: 99, ranks: '1,1,1,1,1', scores: '5,5,5,5,5', top: [], count: 5 });
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.equal(final.kind, 'final');
  assert.deepEqual(tableOf(final, players), tableOfStandings(result.standings), 'the final is the match result, whatever the snapshot said before');
  // Scores come from the answers alone: the lying snapshot changed nothing.
  for (const player of players) {
    const standing = result.standings.find((row) => row.studentId === player.studentId);
    assert.equal(standing.score, player.score);
  }
});

test('work in progress reaches the live board while the round takes answers, and never an exact snapshot', { timeout: 90_000 }, async () => {
  const entry = await seedClass(3);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  const room = await untilStarted(roomId);
  const [answered, working] = entry.students;
  assert.equal((await answer(roomId, answered)).serverConfirmed, true);
  const progress = await call('reportLiveChallengeProgress', asStudent(working, {
    roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken, provisionalPoints: 400,
  }));
  assert.equal(progress.recorded, true);
  assert.equal((await publish(entry, roomId)).published, true);
  const players = await privatePlayers(roomId);
  const seatOf = (studentId) => players.find((player) => player.studentId === studentId).slot;
  const live = await standingsOf(roomId);
  assert.equal(live.includesWorkInProgress, true);
  assert.equal(projectionRules.projectionRankTable(live).find((seat) => seat.slot === seatOf(working)).score, 400, 'the work in progress is on the live board');
  // The close banks what was answered; the exact snapshot carries nothing else.
  await closeRound(entry, roomId);
  const closed = await standingsOf(roomId);
  assert.equal(closed.includesWorkInProgress, false);
  assert.equal(projectionRules.projectionRankTable(closed).find((seat) => seat.slot === seatOf(working)).score, 0, 'an exact snapshot holds banked points only');
  const banked = (await privatePlayers(roomId)).find((player) => player.studentId === answered);
  assert.equal(projectionRules.projectionRankTable(closed).find((seat) => seat.slot === seatOf(answered)).score, banked.score);
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.deepEqual(tableOf(final, players), tableOfStandings(result.standings));
});

test('a publish that fails — the database refuses its read — blocks no answer and changes no score', { timeout: 90_000 }, async () => {
  const entry = await seedClass(4);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  await untilStarted(roomId);
  // The live publish is the one read-only transaction on the server: refuse
  // exactly those, as an unavailable database would, while the class answers.
  const proto = functionsFirestoreClass().prototype;
  const original = proto.runTransaction;
  let refused = 0;
  proto.runTransaction = function refuseReadOnly(updateFunction, options) {
    if (options?.readOnly) {
      refused += 1;
      return Promise.reject(Object.assign(new Error('Simulated: the database refused the read.'), { code: 14 }));
    }
    return original.call(this, updateFunction, options);
  };
  let results;
  try {
    results = await Promise.all(entry.students.map(async (studentId, index) => {
      const [reply, publishFailure] = await Promise.all([
        answer(roomId, studentId, { correct: index !== 1 }),
        failureOf(teacherCall(entry, 'publishLiveChallengeStandings', { roomId })),
      ]);
      return { reply, publishFailure };
    }));
  } finally {
    proto.runTransaction = original;
  }
  results.forEach(({ reply }) => assert.equal(reply.serverConfirmed, true, 'every answer was accepted while publishing failed'));
  assert.ok(refused >= entry.students.length && results.every(({ publishFailure }) => publishFailure), 'the publishes really failed');
  assert.equal(await standingsOf(roomId), null, 'a failed publish writes nothing');
  const players = await privatePlayers(roomId);
  players.forEach((player) => assert.equal(Number(player.answeredRound), 0, `${player.studentId} answered once`));
  // The database is back: the next publish shows every answer, exactly as the host ranks them.
  assert.equal((await publish(entry, roomId)).published, true);
  const [live, rows, room] = await Promise.all([standingsOf(roomId), publicRows(roomId), roomOf(roomId)]);
  const board = challenge.publicLeaderboard(rows, { activeRound: projectionRules.liveProjectionActiveRound(room, live.sourceReadMs), ...leaderboardOptionsFor(null) });
  assert.deepEqual(tableOf(live, players), board.map((row) => [row.playerKey, row.rank, row.liveScore]).sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0]))));
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.deepEqual(tableOf(final, players), tableOfStandings(result.standings));
});

test('a host that never publishes leaves the live board stale and nothing else', { timeout: 90_000 }, async () => {
  const entry = await seedClass(4);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  await untilStarted(roomId);
  for (const studentId of entry.students) {
    // eslint-disable-next-line no-await-in-loop
    const reply = await answer(roomId, studentId);
    assert.equal(reply.serverConfirmed, true, 'every answer is accepted without any snapshot existing');
  }
  assert.equal(await standingsOf(roomId), null, 'no live snapshot was ever published');
  await advance(entry, roomId);
  const closed = await standingsOf(roomId);
  assert.equal(closed.kind, 'roundClosed');
  assert.equal(closed.count, 4);
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  assert.equal((await standingsOf(roomId)).kind, 'final');
});

test('an open Graph Feature Rush round publishes nothing; its close and its finish are exact', { timeout: 90_000 }, async () => {
  const entry = await seedClass(4);
  const roomId = await createRoom(entry, { challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'algebra1Quick' }, standardCode: undefined, questionStyle: undefined, roundCount: 1, roundSeconds: 30 });
  await joinAll(entry, roomId);
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  await untilStarted(roomId);
  const during = await teacherCall(entry, 'publishLiveChallengeStandings', { roomId });
  assert.equal(during.published, false, 'nobody is listening during an open rush round');
  assert.equal(during.reason, 'not-live');
  const players = await privatePlayers(roomId);
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.equal(final.kind, 'final');
  assert.deepEqual(tableOf(final, players), tableOfStandings(result.standings));
});

test('a room from before seats: every player still finds their own place', async () => {
  const entry = await seedClass(4);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  // Rooms created before this change have no seats anywhere.
  const batch = db.batch();
  for (const player of await privatePlayers(roomId)) {
    batch.update(db.collection('liveChallengePrivate').doc(roomId).collection('players').doc(player.studentId), { slot: admin.firestore.FieldValue.delete() });
    batch.update(roomRef(roomId).collection('players').doc(player.playerKey), { slot: admin.firestore.FieldValue.delete() });
  }
  await batch.commit();
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  await untilStarted(roomId);
  for (const [index, studentId] of entry.students.entries()) await answer(roomId, studentId, { correct: index % 2 === 0 }); // eslint-disable-line no-await-in-loop
  assert.equal((await publish(entry, roomId)).published, true);
  const live = await standingsOf(roomId);
  assert.equal(typeof live.slotKeys, 'string', 'seated by player key');
  const rows = await publicRows(roomId);
  const board = challenge.publicLeaderboard(rows, { activeRound: projectionRules.liveProjectionActiveRound(await roomOf(roomId), live.sourceReadMs), ...leaderboardOptionsFor(null) });
  for (const row of board) {
    const view = projectionRules.standingsFromProjection(live, { roomId, slot: null, playerKey: row.playerKey });
    assert.equal(view.self.rank, row.rank, `${row.alias} finds its rank`);
    assert.equal(view.self.score, row.liveScore);
  }
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
});

test('a finished room whose final snapshot is missing is repaired from its match result, for its own audience only', { timeout: 90_000 }, async () => {
  const entry = await seedClass(4);
  const roomId = await createRoom(entry);
  await joinAll(entry, roomId);
  await teacherCall(entry, 'startLiveChallenge', { roomId });
  await untilStarted(roomId);
  for (const studentId of entry.students) await answer(roomId, studentId); // eslint-disable-line no-await-in-loop
  // A match still being played has no final standings to repair: asking
  // writes nothing (a final snapshot is never replaced, so one written early
  // would freeze every screen's board for the rest of the match).
  const early = await call('ensureLiveChallengeFinalStandings', asStudent(entry.students[0], { roomId }));
  assert.deepEqual({ ensured: early.ensured, reason: early.reason }, { ensured: false, reason: 'not-finished' });
  assert.notEqual((await standingsOf(roomId))?.kind, 'final', 'no final snapshot while the match runs');
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const result = await resultOf(roomId);
  await roomRef(roomId).collection('standings').doc('current').delete();
  const outsider = await seedClass(1);
  const refused = await failureOf(call('ensureLiveChallengeFinalStandings', asStudent(outsider.students[0], { roomId })));
  assert.match(String(refused?.code), /permission-denied/);
  const repaired = await call('ensureLiveChallengeFinalStandings', asStudent(entry.students[0], { roomId }));
  assert.equal(repaired.ensured, true);
  const final = await standingsOf(roomId);
  assert.equal(final.kind, 'final');
  // The private records are gone (finalization cleaned them up): the seats come from the match result.
  assert.deepEqual(projectionRules.projectionRankTable(final).map((seat) => seat.rank).sort(), result.standings.filter((row) => row.rank !== null).map((row) => row.rank).sort());
  for (const standing of result.standings.filter((row) => row.rank !== null)) {
    const view = projectionRules.standingsFromProjection(final, { roomId, slot: standing.slot, playerKey: standing.playerKey });
    assert.equal(view.self.rank, standing.rank);
    assert.equal(view.self.score, standing.score);
  }
  // Asking again changes nothing.
  const before = await roomRef(roomId).collection('standings').doc('current').get();
  assert.equal((await call('ensureLiveChallengeFinalStandings', asStudent(entry.students[1], { roomId }))).ensured, true);
  assert.equal((await roomRef(roomId).collection('standings').doc('current').get()).updateTime.toMillis(), before.updateTime.toMillis());
});
