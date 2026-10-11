import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import {
  collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, where,
} from 'firebase/firestore';
import { classRoundSummary, publicRoundSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { buildStandingsProjection, PROJECTION_KIND } from '../../functions/shared/liveChallengeStandingsProjection.mjs';
import { roundSummaryEntries, finalSummaryEntries, PLAYER_SUMMARY_SCHEMA_VERSION } from '../../functions/shared/liveChallengePlayerSummary.mjs';

// LIVE CHALLENGE: NOBODY'S PLACE IS READABLE BY A CLASSMATE (product decision
// 7, functions/shared/liveChallengePrivacy.mjs), through the real Security
// Rules in the Firestore emulator (`npm run test:rules`).
//
// The screens show a student only the public rule's rows and their own place.
// Here the same holds for a student who reads Firestore directly:
//   1. the class's documents (standings/current, rounds/{n}) — seeded with
//      what the server's own builders write — name nobody outside the public
//      rows, and carry no every-seat rank or score list;
//   2. a student reads their own player row, never a classmate's, and cannot
//      list the room's rows (scores would rank everyone);
//   3. a student reads their own summary (their own place), never a
//      classmate's, and cannot list or collection-group query the summaries;
//   4. the teacher's whole table (hostRounds/{n}) is the room's teacher's;
//   5. the room's teacher and a root admin read all of it; another teacher
//      reads none; no client writes any of it.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against one emulator.

const PROJECT = 'mathmaster-live-rank-privacy-rules';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const TEACHER_A = 'lr.teacher.a@example.org';
const TEACHER_B = 'lr.teacher.b@example.org';
const ROOM = 'lr-room';

let env;
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const student = (index) => env.authenticatedContext(`uid-s${index}`, { role: 'student', studentId: `LR_S${index}` }).firestore();
const outsider = () => env.authenticatedContext('uid-out', { role: 'student', studentId: 'LR_OUTSIDER' }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

// Eight players, in standing order: the first is the winner, the last two
// tie for last. Player 8 is the one whose place must stay theirs.
const PLAYERS = Array.from({ length: 8 }, (_, index) => ({
  studentId: `LR_S${index + 1}`,
  playerKey: `lr-pk-${index + 1}`,
  alias: `Alias ${index + 1}`,
  rank: index < 6 ? index + 1 : 7,
  tied: index >= 6,
  score: index < 6 ? 1000 - index * 100 : 100,
}));
const roundResult = {
  roomId: ROOM,
  roundIndex: 0,
  roundVersion: 1,
  modeId: null,
  scoringStrategyId: 'grandPrix',
  participantCount: PLAYERS.length,
  completedCount: PLAYERS.length,
  fieldSize: PLAYERS.length,
  standings: PLAYERS.map((player, index) => ({
    studentId: player.studentId,
    playerKey: player.playerKey,
    alias: player.alias,
    rank: player.rank,
    position: index,
    tied: player.tied,
    participated: true,
    finished: true,
    metrics: { performance: player.score },
    roundPoints: player.score,
    matchPointsAwarded: Math.max(0, 10 - index),
  })),
};
const standingsAfterRound = PLAYERS.map((player, index) => ({
  playerKey: player.playerKey, alias: player.alias, rank: player.rank, position: index, tied: player.tied, score: player.score, correctCount: 1, roundsAnswered: 1, roundWins: 0,
}));
const classRound = classRoundSummary(roundResult, { standingsAfterRound });
const hostRound = publicRoundSummary(roundResult, { standingsAfterRound });
const projection = buildStandingsProjection({
  roomId: ROOM, kind: PROJECTION_KIND.FINAL, status: 'finished', ranked: standingsAfterRound,
});
const summaryOf = (studentId) => {
  const round = roundSummaryEntries({ roundResult, summary: hostRound, standingsAfterRound, byPoints: false }).find((item) => item.studentId === studentId);
  const final = finalSummaryEntries({ standings: PLAYERS.map((player) => ({ ...player, joined: true, correctCount: 1, roundsAnswered: 1 })) })
    .find((item) => item.studentId === studentId);
  return { schemaVersion: PLAYER_SUMMARY_SCHEMA_VERSION, roomId: ROOM, playerKey: round.playerKey, alias: round.alias, rounds: { 0: round.entry }, final: final.entry };
};
const LAST = PLAYERS[7];

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `liveChallengeRooms/${ROOM}`), { teacherEmail: TEACHER_A, status: 'finished', currentRound: 0 });
    await setDoc(doc(db, `liveChallengeRooms/${ROOM}/rounds/0`), classRound);
    await setDoc(doc(db, `liveChallengeRooms/${ROOM}/hostRounds/0`), hostRound);
    await setDoc(doc(db, `liveChallengeRooms/${ROOM}/standings/current`), projection);
    await setDoc(doc(db, 'liveChallengeInvites/LR_OUTSIDER'), { roomId: 'lr-room-elsewhere', playerKey: 'lr-pk-out' });
    for (const player of PLAYERS) {
      // eslint-disable-next-line no-await-in-loop
      await setDoc(doc(db, `liveChallengeInvites/${player.studentId}`), { roomId: ROOM, playerKey: player.playerKey });
      // eslint-disable-next-line no-await-in-loop
      await setDoc(doc(db, `liveChallengeRooms/${ROOM}/players/${player.playerKey}`), { playerKey: player.playerKey, alias: player.alias, score: player.score, joined: true });
      // eslint-disable-next-line no-await-in-loop
      await setDoc(doc(db, `liveChallengeRooms/${ROOM}/playerSummaries/${player.studentId}`), summaryOf(player.studentId));
    }
  });
});

after(async () => { await env?.cleanup(); });

// Every rank, score, key and alias a document mentions, however nested.
const mentions = (value, found = new Set()) => {
  if (Array.isArray(value)) value.forEach((entry) => mentions(entry, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => mentions(entry, found));
  else if (typeof value === 'string') found.add(value);
  return found;
};

test('1. the class\'s documents a student can read name nobody outside the public rows', async () => {
  const classmate = student(1);
  const round = (await assertSucceeds(getDoc(doc(classmate, `liveChallengeRooms/${ROOM}/rounds/0`)))).data();
  const standings = (await assertSucceeds(getDoc(doc(classmate, `liveChallengeRooms/${ROOM}/standings/current`)))).data();
  for (const [label, data] of [['rounds/0', round], ['standings/current', standings]]) {
    const named = mentions(data);
    // The two tied for last, and anyone the rule leaves off, are nowhere in it.
    for (const hidden of PLAYERS.slice(5)) {
      assert.equal(named.has(hidden.playerKey), false, `${label} names ${hidden.playerKey}`);
      assert.equal(named.has(hidden.alias), false, `${label} names ${hidden.alias}`);
    }
    // No every-seat lists.
    for (const field of ['ranks', 'scores', 'slotKeys']) assert.equal(field in data, false, `${label} carries ${field}`);
  }
  assert.ok(round.standings.length <= 5 && round.standingsAfterRound.length <= 5);
  assert.equal(standings.count, PLAYERS.length, 'how many play is public');
});

test('2. a student reads their own player row, never a classmate\'s, and cannot list the rows', async () => {
  const last = student(8);
  await assertSucceeds(getDoc(doc(last, `liveChallengeRooms/${ROOM}/players/${LAST.playerKey}`)), 'the row their invite names');
  await assertFails(getDoc(doc(student(1), `liveChallengeRooms/${ROOM}/players/${LAST.playerKey}`)), "a classmate's row (its score is a place)");
  await assertFails(getDocs(collection(student(1), `liveChallengeRooms/${ROOM}/players`)), 'listing every score');
  await assertFails(getDocs(query(collection(student(1), `liveChallengeRooms/${ROOM}/players`), where('score', '<=', 100))), 'a query for the bottom');
  await assertFails(getDoc(doc(outsider(), `liveChallengeRooms/${ROOM}/players/${LAST.playerKey}`)), 'a student of another room');
  await assertSucceeds(getDocs(collection(teacherA(), `liveChallengeRooms/${ROOM}/players`)), "the console's board");
  await assertFails(getDocs(collection(teacherB(), `liveChallengeRooms/${ROOM}/players`)));
  await assertSucceeds(getDocs(collection(admin(), `liveChallengeRooms/${ROOM}/players`)));
});

test('3. a student reads their own summary, never a classmate\'s, and cannot list or query them', async () => {
  const own = (await assertSucceeds(getDoc(doc(student(8), `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)))).data();
  assert.equal(own.final.rank, LAST.rank, 'their own final place is theirs to read');
  assert.equal(own.rounds['0'].standing.rank, LAST.rank);
  await assertFails(getDoc(doc(student(1), `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)), "a classmate's place");
  await assertFails(getDoc(doc(student(8), `liveChallengeRooms/${ROOM}/playerSummaries/${PLAYERS[0].studentId}`)), "the winner's summary");
  await assertFails(getDocs(collection(student(1), `liveChallengeRooms/${ROOM}/playerSummaries`)), 'listing the summaries');
  await assertFails(getDocs(query(collection(student(1), `liveChallengeRooms/${ROOM}/playerSummaries`), where('final.rank', '>=', 7))), 'a query for the last places');
  await assertFails(getDocs(collectionGroup(student(1), 'playerSummaries')), 'a collection-group query');
  await assertFails(getDoc(doc(outsider(), `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)));
  await assertFails(getDoc(doc(stranger(), `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)));
  // The room's teacher and a root admin read and list them; another teacher does not.
  await assertSucceeds(getDoc(doc(teacherA(), `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)));
  await assertSucceeds(getDocs(collection(teacherA(), `liveChallengeRooms/${ROOM}/playerSummaries`)));
  await assertSucceeds(getDocs(collection(admin(), `liveChallengeRooms/${ROOM}/playerSummaries`)));
  await assertFails(getDoc(doc(teacherB(), `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)));
  await assertFails(getDocs(collection(teacherB(), `liveChallengeRooms/${ROOM}/playerSummaries`)));
});

test('4. the whole round table (hostRounds) is the room\'s teacher\'s alone', async () => {
  const path = `liveChallengeRooms/${ROOM}/hostRounds/0`;
  const full = (await assertSucceeds(getDoc(doc(teacherA(), path)))).data();
  assert.equal(full.standings.length, PLAYERS.length, 'the teacher (and the projector it drives) sees every place');
  await assertSucceeds(getDoc(doc(admin(), path)));
  await assertFails(getDoc(doc(teacherB(), path)));
  await assertFails(getDoc(doc(student(1), path)), 'a student of the room');
  await assertFails(getDocs(collection(student(1), `liveChallengeRooms/${ROOM}/hostRounds`)));
  await assertFails(getDocs(collectionGroup(student(1), 'hostRounds')));
  await assertFails(getDoc(doc(stranger(), path)));
});

test('5. no client writes a summary, a host round or a player row', async () => {
  for (const client of [student(8), teacherA(), admin()]) {
    await assertFails(setDoc(doc(client, `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`), { final: { rank: 1 } }, { merge: true }));
    await assertFails(setDoc(doc(client, `liveChallengeRooms/${ROOM}/playerSummaries/LR_NEW`), { final: { rank: 1 } }));
    await assertFails(deleteDoc(doc(client, `liveChallengeRooms/${ROOM}/playerSummaries/${LAST.studentId}`)));
    await assertFails(setDoc(doc(client, `liveChallengeRooms/${ROOM}/hostRounds/1`), { standings: [] }));
    await assertFails(setDoc(doc(client, `liveChallengeRooms/${ROOM}/players/${LAST.playerKey}`), { score: 9999 }, { merge: true }));
  }
});
