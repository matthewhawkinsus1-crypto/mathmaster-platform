// THE BOUNDED PUBLIC STANDINGS PROJECTION, through the real callables against
// a real Firestore. Run through `npm run test:challenge-finish`. Small rooms:
// the class-scale certification (deliveries per screen, listeners, latency at
// 5–64 students) is the launch certification's, on its own emulator.
//
// What is held here, end to end:
//   - EXACT AT EVERY MILESTONE: a round's close writes the standings the round
//     left behind (the round result's own standingsAfterRound), the finish
//     writes the match result's standings — for Accuracy First, Correct Count
//     and Grand Prix, ties included. The snapshot holds the public rule's rows
//     of them (nobody else's place: any classmate can read it); every
//     player's own place is in their own summary, written in the same commit;
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
//     still ranks and places every player; a finished room whose final
//     snapshot or own final places are missing is repaired from its match
//     result.

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
const { classStandingsRows } = await import(path.join(repo, 'functions/shared/liveChallengePrivacy.mjs'));
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
// The teacher's whole copy of a closed round (hostRounds), and the class's (rounds).
const roundSummary = async (roomId, roundIndex) => (await roomRef(roomId).collection('hostRounds').doc(String(roundIndex)).get()).data() || null;
const classRoundOf = async (roomId, roundIndex) => (await roomRef(roomId).collection('rounds').doc(String(roundIndex)).get()).data() || null;
const summariesOf = async (roomId) => (await roomRef(roomId).collection('playerSummaries').get()).docs.map((doc) => ({ studentId: doc.id, ...doc.data() }));
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

const byRank = (left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0]));
// Every player's OWN place, as [playerKey, rank, score] in rank order, from
// their own summaries: after round `roundIndex`, or final.
const ownTable = async (roomId, roundIndex = 'final') => (await summariesOf(roomId))
  .map((summary) => [summary.playerKey, roundIndex === 'final' ? summary.final : summary.rounds?.[String(roundIndex)]?.standing])
  .filter(([, place]) => place && place.rank !== null && place.rank !== undefined)
  .map(([playerKey, place]) => [playerKey, place.rank, place.score])
  .sort(byRank);
// A snapshot's rows, and the rows the public rule shows the class of an
// engine ranking (`score` read as a live board reads it).
const topOf = (projection) => projection.top.map((row) => [row.playerKey, row.rank, row.tied, row.score]);
const publicTopOf = (ranked) => {
  const rows = ranked.filter((row) => row.rank !== null && row.rank !== undefined && row.joined !== false);
  return classStandingsRows(rows, { totalCount: rows.length }).rows.slice(0, projectionRules.STANDINGS_TOP_ROWS)
    .map((row) => [row.playerKey, row.rank, row.tied === true, Math.round(Number(row.liveScore ?? row.score) || 0)]);
};
const assertNoSeatLists = (projection, label) => {
  for (const field of ['ranks', 'scores', 'slotKeys']) assert.equal(field in projection, false, `${label}: the snapshot lists every seat's ${field}`);
};
const tableOfStandings = (standings) => standings.filter((row) => row.rank !== null && row.rank !== undefined && row.joined !== false)
  .map((row) => [row.playerKey, row.rank, row.score])
  .sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0])));
const assertNothingPrivate = (projection, label) => {
  assertNoSeatLists(projection, label);
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
      const [live, rows, room] = await Promise.all([standingsOf(roomId), publicRows(roomId), roomOf(roomId)]);
      const board = challenge.publicLeaderboard(rows, { activeRound: projectionRules.liveProjectionActiveRound(room, live.sourceReadMs), ...leaderboardOptionsFor(scoringStrategyId) });
      assert.equal(live.kind, 'live');
      assert.equal(live.count, board.length);
      assert.deepEqual(topOf(live), publicTopOf(board), `round ${roundIndex + 1}: the live snapshot is the public rows of the host's board`);
      assertNothingPrivate(live, `round ${roundIndex + 1} live`);
      if (roundIndex < 2) {
        // ROUND CLOSE: the standings the round result records.
        // eslint-disable-next-line no-await-in-loop
        await closeRound(entry, roomId);
        // eslint-disable-next-line no-await-in-loop
        const [closed, summary, classCopy] = await Promise.all([standingsOf(roomId), roundSummary(roomId, roundIndex), classRoundOf(roomId, roundIndex)]);
        assert.equal(closed.kind, 'roundClosed');
        assert.equal(closed.exact, true);
        assert.deepEqual(topOf(closed), publicTopOf(summary.standingsAfterRound), `round ${roundIndex + 1}: the closed snapshot is the public rows of the round's standingsAfterRound`);
        assert.deepEqual(await ownTable(roomId, roundIndex), tableOfStandings(summary.standingsAfterRound), `round ${roundIndex + 1}: every player's own summary holds their place after the round`);
        assertNothingPrivate(closed, `round ${roundIndex + 1} closed`);
        // The class's copy of the round: the public rows only, of both lists.
        assert.equal(summary.standingsAfterRound.length, entry.students.length, 'the teacher\'s copy is the whole class');
        assert.deepEqual(classCopy.standingsAfterRound.map((row) => [row.playerKey, row.rank]), publicTopOf(summary.standingsAfterRound).map(([playerKey, rank]) => [playerKey, rank]));
        assert.ok(classCopy.standings.length <= 5);
        assert.equal(classCopy.visibility, 'class');
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
    assert.deepEqual(await ownTable(roomId), tableOfStandings(result.standings), 'every player\'s own final place IS the match result');
    assert.deepEqual(topOf(final), publicTopOf(result.standings), 'the podium is the match result\'s public rows');
    assert.equal(playersAtEnd.length, entry.students.length);
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
  assert.deepEqual(topOf(closed), publicTopOf(summary.standingsAfterRound));
  assert.deepEqual(await ownTable(roomId, 0), tableOfStandings(summary.standingsAfterRound));
  // Corrupt it again, then finish: the final is the match result.
  await roomRef(roomId).collection('standings').doc('current').set({ schemaVersion: 1, roomId, kind: 'live', phase: 'open', roundVersion: 99, ranks: '1,1,1,1,1', scores: '5,5,5,5,5', top: [], count: 5 });
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.equal(final.kind, 'final');
  assert.deepEqual(topOf(final), publicTopOf(result.standings), 'the final is the match result, whatever the snapshot said before');
  assert.deepEqual(await ownTable(roomId), tableOfStandings(result.standings));
  assertNoSeatLists(final, 'final');
  // Scores come from the answers alone: the lying snapshot changed nothing.
  for (const player of players) {
    const standing = result.standings.find((row) => row.studentId === player.studentId);
    assert.equal(standing.score, player.score);
  }
});

test('work in progress reaches the live board while the round takes answers, and never an exact snapshot', { timeout: 90_000 }, async () => {
  // Four players: the two who did nothing tie for last, so the other two are shown.
  const entry = await seedClass(4);
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
  const keyOf = (studentId) => players.find((player) => player.studentId === studentId).playerKey;
  const live = await standingsOf(roomId);
  assert.equal(live.includesWorkInProgress, true);
  assert.equal(live.top.find((row) => row.playerKey === keyOf(working))?.score, 400, 'the work in progress is on the live board');
  // The close banks what was answered; the exact snapshot carries nothing else.
  await closeRound(entry, roomId);
  const closed = await standingsOf(roomId);
  assert.equal(closed.includesWorkInProgress, false);
  assert.equal(closed.top.some((row) => row.playerKey === keyOf(working)), false, 'banked nothing: tied with the last, so not on the class\'s list');
  const own = new Map((await ownTable(roomId, 0)).map(([playerKey, rank, score]) => [playerKey, { rank, score }]));
  assert.equal(own.get(keyOf(working)).score, 0, 'an exact place holds banked points only');
  const banked = (await privatePlayers(roomId)).find((player) => player.studentId === answered);
  assert.equal(own.get(keyOf(answered)).score, banked.score);
  assert.equal(closed.top.find((row) => row.playerKey === keyOf(answered))?.score, banked.score);
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const result = await resultOf(roomId);
  assert.deepEqual(await ownTable(roomId), tableOfStandings(result.standings));
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
  assert.deepEqual(topOf(live), publicTopOf(board));
  assert.equal(live.count, players.length);
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.deepEqual(topOf(final), publicTopOf(result.standings));
  assert.deepEqual(await ownTable(roomId), tableOfStandings(result.standings));
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
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  const [final, result] = await Promise.all([standingsOf(roomId), resultOf(roomId)]);
  assert.equal(final.kind, 'final');
  assert.deepEqual(topOf(final), publicTopOf(result.standings));
  assert.deepEqual(await ownTable(roomId), tableOfStandings(result.standings));
});

test('a room from before seats: the class still sees its public rows, and every player their own place', async () => {
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
  assertNoSeatLists(live, 'live');
  const rows = await publicRows(roomId);
  const board = challenge.publicLeaderboard(rows, { activeRound: projectionRules.liveProjectionActiveRound(await roomOf(roomId), live.sourceReadMs), ...leaderboardOptionsFor(null) });
  assert.deepEqual(topOf(live), publicTopOf(board));
  await teacherCall(entry, 'finishLiveChallenge', { roomId });
  // Own places are keyed by student, so a room without seats loses nothing.
  assert.deepEqual(await ownTable(roomId), tableOfStandings((await resultOf(roomId)).standings));
});

test('a finished room whose final snapshot or own final places are missing is repaired from its match result, for its own audience only', { timeout: 90_000 }, async () => {
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
  // A room finished before own summaries: no snapshot and no final places.
  await roomRef(roomId).collection('standings').doc('current').delete();
  for (const summary of await summariesOf(roomId)) await roomRef(roomId).collection('playerSummaries').doc(summary.studentId).delete(); // eslint-disable-line no-await-in-loop
  const outsider = await seedClass(1);
  const refused = await failureOf(call('ensureLiveChallengeFinalStandings', asStudent(outsider.students[0], { roomId })));
  assert.match(String(refused?.code), /permission-denied/);
  const repaired = await call('ensureLiveChallengeFinalStandings', asStudent(entry.students[0], { roomId }));
  assert.equal(repaired.ensured, true);
  const final = await standingsOf(roomId);
  assert.equal(final.kind, 'final');
  assertNoSeatLists(final, 'repaired final');
  // The private records are gone (finalization cleaned them up): the places come from the match result.
  assert.deepEqual(topOf(final), publicTopOf(result.standings));
  assert.deepEqual(await ownTable(roomId), tableOfStandings(result.standings), 'every player\'s own final place, rebuilt');
  // Asking again changes nothing.
  const before = await roomRef(roomId).collection('standings').doc('current').get();
  assert.equal((await call('ensureLiveChallengeFinalStandings', asStudent(entry.students[1], { roomId }))).ensured, true);
  assert.equal((await roomRef(roomId).collection('standings').doc('current').get()).updateTime.toMillis(), before.updateTime.toMillis());
  // A final snapshot of the version that listed every seat is rewritten.
  await roomRef(roomId).collection('standings').doc('current').set({ ...final, schemaVersion: 1, ranks: '1,2,3,4', scores: '4,3,2,1' });
  assert.equal((await call('ensureLiveChallengeFinalStandings', asStudent(entry.students[2], { roomId }))).repaired, true);
  const rewritten = await standingsOf(roomId);
  assert.equal(rewritten.schemaVersion, projectionRules.STANDINGS_PROJECTION_SCHEMA_VERSION);
  assertNoSeatLists(rewritten, 'rewritten final');
});
