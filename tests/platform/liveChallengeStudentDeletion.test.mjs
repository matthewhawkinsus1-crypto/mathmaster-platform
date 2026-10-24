// PERMANENT DELETION TAKES A STUDENT OUT OF THE MATCH THEY ARE STILL IN.
//
// deleteStudentLiveChallengeFootprint found a student's summaries through the
// match results that list them, and a match still running has no result yet
// (Codex review of #474). Their roster row also stayed, so the match kept
// writing them: the next round close wrote their summary again, and the finish
// put them in the result and report and paid them rewards. And their invite —
// liveChallengeInvites/{studentId}: room, alias, class — was never deleted for
// any student. The invite names the room, so the deletion now takes them out
// of it in one batch and deletes the invite.
//
// The deletion runs here as written in functions/index.js
// (serverCallableHarness: topLevelFunction), against a stand-in holding a
// running match, a finished one and classmates who must keep everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FakeFirestore, topLevelFunction } from './helpers/serverCallableHarness.mjs';

const SERVER = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const constant = (name) => {
  const match = SERVER.match(new RegExp(`^const ${name} = "([^"]+)";`, 'm'));
  assert.ok(match, `functions/index.js no longer defines const ${name}`);
  return match[1];
};
const NAMES = ['LIVE_CHALLENGE_ROOMS', 'LIVE_CHALLENGE_PRIVATE', 'LIVE_CHALLENGE_INVITES', 'LIVE_CHALLENGE_MATCH_RESULTS', 'LIVE_CHALLENGE_REPORTS'];
const C = Object.fromEntries(NAMES.map((name) => [name, constant(name)]));

const deleteFootprint = new Function(
  ...NAMES, 'liveChallengeReportRules',
  `"use strict";\n${topLevelFunction('deleteStudentLiveChallengeFootprint')}\nreturn deleteStudentLiveChallengeFootprint;`,
)(...NAMES.map((name) => C[name]), async () => import('../../functions/shared/liveChallengeReport.mjs'));

const ROOM = C.LIVE_CHALLENGE_ROOMS;
const PRIVATE = C.LIVE_CHALLENGE_PRIVATE;

// "gone" (deleted), "kept" (untouched) for one student's documents.
const world = () => new FakeFirestore({
  // s1 is in running room R1 with s2; s1 and s3 played finished match R0.
  [C.LIVE_CHALLENGE_INVITES]: {
    s1: { roomId: 'R1', alias: 'Blue Fox', playerKey: 'pk1', classId: 'c1' },
    s2: { roomId: 'R1', alias: 'Red Owl', playerKey: 'pk2', classId: 'c1' },
    s3: { roomId: 'R0', alias: 'Gold Elk', playerKey: 'pk9', classId: 'c1' },
  },
  [`${PRIVATE}/R1/players`]: {
    s1: { playerKey: 'pk1', alias: 'Blue Fox', joined: true, score: 40 },
    s2: { playerKey: 'pk2', alias: 'Red Owl', joined: true, score: 55 },
  },
  [`${ROOM}/R1/players`]: { pk1: { alias: 'Blue Fox', score: 40 }, pk2: { alias: 'Red Owl', score: 55 } },
  [`${ROOM}/R1/diagnostics`]: { pk1: { quality: 'good' }, pk2: { quality: 'good' } },
  [`${ROOM}/R1/playerSummaries`]: { s1: { rounds: { 0: { place: 2 } } }, s2: { rounds: { 0: { place: 1 } } } },
  [ROOM]: { R1: { status: 'running' }, R0: { status: 'finished' } },
  [C.LIVE_CHALLENGE_MATCH_RESULTS]: {
    R0: { studentIds: ['s1', 's3'], standings: [{ studentId: 's1', rank: 1 }, { studentId: 's3', rank: 2 }] },
  },
  [`${ROOM}/R0/playerSummaries`]: { s1: { final: { place: 1 } }, s3: { final: { place: 2 } } },
  [C.LIVE_CHALLENGE_REPORTS]: {
    R0: { studentIds: ['s1', 's3'], players: [{ studentId: 's1' }, { studentId: 's3' }], neverJoined: [] },
  },
  rewardGrants: { g1: { studentId: 's1' }, g3: { studentId: 's3' } },
});

test('a student deleted mid-match leaves it whole: roster row, public row, diagnostics, summary and invite', async () => {
  const db = world();
  const deleted = {};
  await deleteFootprint(db, 's1', deleted);

  // The running match no longer holds them anywhere it would write or show them from.
  assert.equal(db.data(`${PRIVATE}/R1/players`, 's1'), undefined, 'roster row: the match never writes them again');
  assert.equal(db.data(`${ROOM}/R1/players`, 'pk1'), undefined, 'anonymous public row');
  assert.equal(db.data(`${ROOM}/R1/diagnostics`, 'pk1'), undefined, 'device diagnostics');
  assert.equal(db.data(`${ROOM}/R1/playerSummaries`, 's1'), undefined, 'their own summary');
  assert.equal(db.data(C.LIVE_CHALLENGE_INVITES, 's1'), undefined, 'the invite: room, alias and class');
  // One batch: every running-match document goes in the same commit.
  assert.deepEqual(deleted.liveChallengeRoomMemberships, 1);
  assert.deepEqual(deleted.liveChallengeInvites, 1);

  // A classmate in the same running match keeps everything.
  assert.ok(db.data(`${PRIVATE}/R1/players`, 's2'));
  assert.ok(db.data(`${ROOM}/R1/players`, 'pk2'));
  assert.ok(db.data(`${ROOM}/R1/diagnostics`, 'pk2'));
  assert.ok(db.data(`${ROOM}/R1/playerSummaries`, 's2'));
  assert.ok(db.data(C.LIVE_CHALLENGE_INVITES, 's2'));
  assert.ok(db.data(ROOM, 'R1'), 'the room itself stays');

  // The finished match: as before, their summary goes and the class record loses only their row.
  assert.equal(db.data(`${ROOM}/R0/playerSummaries`, 's1'), undefined);
  assert.ok(db.data(`${ROOM}/R0/playerSummaries`, 's3'));
  assert.deepEqual(db.data(C.LIVE_CHALLENGE_MATCH_RESULTS, 'R0').studentIds, ['s3']);
  assert.deepEqual(db.data(C.LIVE_CHALLENGE_REPORTS, 'R0').players, [{ studentId: 's3' }]);
  assert.equal(db.data('rewardGrants', 'g1'), undefined);
  assert.ok(db.data('rewardGrants', 'g3'));
});

test('the running-match documents leave in one transaction that read what it deletes, before anything else is touched', async () => {
  const db = world();
  await deleteFootprint(db, 's1', {});
  const deletes = db.writes.filter((write) => write.op === 'delete');
  // One commit, first: a round closing at the same moment sees the student
  // either fully in the match or fully out.
  assert.deepEqual(deletes.slice(0, 5).map((write) => `${write.collection}/${write.id}`), [
    `${PRIVATE}/R1/players/s1`,
    `${ROOM}/R1/playerSummaries/s1`,
    `${ROOM}/R1/players/pk1`,
    `${ROOM}/R1/diagnostics/pk1`,
    `${C.LIVE_CHALLENGE_INVITES}/s1`,
  ]);
  const groups = new Set(deletes.slice(0, 5).map((write) => write.group));
  assert.equal(groups.size, 1, 'the five deletes commit together');
  assert.match([...groups][0] || '', /^transaction-/, 'and in a transaction, not five separate deletes');
  // The invite and the roster row are read inside that transaction, so an
  // invite rewritten for the next match in between is read again rather than
  // deleted on a stale read (Codex review of #475).
  const transactionReads = db.reads.filter((read) => read.via === 'transaction.get').map((read) => `${read.collection}/${read.id}`);
  assert.deepEqual(transactionReads, [`${C.LIVE_CHALLENGE_INVITES}/s1`, `${PRIVATE}/R1/players/s1`]);
  assert.equal(db.reads.some((read) => read.via === 'doc.get' && read.collection === C.LIVE_CHALLENGE_INVITES), false, 'no invite read outside it');
});

test('an invite whose roster row is already gone (a finished, finalized room) still goes, with the public row it names', async () => {
  const db = world();
  // s3's room finished and finalization removed the private roster.
  const deleted = {};
  await deleteFootprint(db, 's3', deleted);
  assert.equal(db.data(C.LIVE_CHALLENGE_INVITES, 's3'), undefined);
  assert.equal(deleted.liveChallengeInvites, 1);
  assert.equal(deleted.liveChallengeRoomMemberships, undefined, 'no roster row was there to remove');
  assert.equal(db.data(`${ROOM}/R0/playerSummaries`, 's3'), undefined);
  // Nobody else's records move.
  assert.ok(db.data(C.LIVE_CHALLENGE_INVITES, 's1'));
  assert.ok(db.data(`${PRIVATE}/R1/players`, 's1'));
  assert.ok(db.data(`${ROOM}/R0/playerSummaries`, 's1'));
});

test('a student never invited to a Live Challenge: nothing in any room changes', async () => {
  const db = world();
  const before = db.dump();
  const deleted = {};
  await deleteFootprint(db, 's-none', deleted);
  assert.deepEqual(db.dump(), before);
  assert.deepEqual(deleted, {});
});

// SI07: a question-set game's report keeps its mode's own player rows
// (lineGraph.players, graphFeatureRush.players), each naming a student. The
// deletion took them out of `players` and `neverJoined` only.
test('a deleted student leaves a question-set report\'s own player rows too; the class totals stay', async () => {
  const db = world();
  db.docsOf(C.LIVE_CHALLENGE_REPORTS).set('R2', {
    studentIds: ['s1', 's3'],
    players: [{ studentId: 's1' }, { studentId: 's3' }],
    neverJoined: [{ studentId: 's9', alias: 'Grey Elk' }],
    lineGraph: { accuracyPercent: 75, attempts: 12, players: [{ studentId: 's1', alias: 'Blue Fox' }, { studentId: 's3', alias: 'Gold Elk' }] },
    graphFeatureRush: { accuracyPercent: 60, players: [{ studentId: 's3', alias: 'Gold Elk' }, { studentId: 's1', alias: 'Blue Fox' }] },
  });
  await deleteFootprint(db, 's1', {});
  const report = db.data(C.LIVE_CHALLENGE_REPORTS, 'R2');
  assert.deepEqual(report.studentIds, ['s3']);
  assert.deepEqual(report.players, [{ studentId: 's3' }]);
  assert.deepEqual(report.neverJoined, [{ studentId: 's9', alias: 'Grey Elk' }], 'nobody else leaves');
  assert.deepEqual(report.lineGraph, { accuracyPercent: 75, attempts: 12, players: [{ studentId: 's3', alias: 'Gold Elk' }] });
  assert.deepEqual(report.graphFeatureRush, { accuracyPercent: 60, players: [{ studentId: 's3', alias: 'Gold Elk' }] });
  assert.doesNotMatch(JSON.stringify(report), /"s1"|Blue Fox/);
});

// SI13: the private round results (liveChallengePrivate/{room}/rounds/{n})
// name every player. A finished match's finalization removes them with the
// rest of its private state, but a room retired before it finished keeps
// them, and nothing else ever did. The deletion now takes the student's rows
// out of the rooms it can find: the one their invite names, and each played
// match whose private cleanup has not run.
test('a deleted student leaves the private round results of their rooms; classmates keep their rows', async () => {
  const db = world();
  db.collections.set(`${PRIVATE}/R1/rounds`, new Map([
    ['0', { roundIndex: 0, standings: [{ studentId: 's2', rank: 1 }, { studentId: 's1', rank: 2 }] }],
    ['1', { roundIndex: 1, standings: [{ studentId: 's2', rank: 1 }] }],
  ]));
  // R0 finished, but its private cleanup has not run yet.
  db.collections.set(`${PRIVATE}/R0/rounds`, new Map([
    ['0', { roundIndex: 0, standings: [{ studentId: 's1', rank: 1 }, { studentId: 's3', rank: 2 }] }],
  ]));
  // A room s1 never played in.
  db.collections.set(`${PRIVATE}/R9/rounds`, new Map([
    ['0', { roundIndex: 0, standings: [{ studentId: 's1', rank: 1 }] }],
  ]));
  const deleted = {};
  await deleteFootprint(db, 's1', deleted);

  assert.deepEqual(db.data(`${PRIVATE}/R1/rounds`, '0').standings, [{ studentId: 's2', rank: 1 }]);
  assert.deepEqual(db.data(`${PRIVATE}/R1/rounds`, '1').standings, [{ studentId: 's2', rank: 1 }], 'a round without them is untouched');
  assert.deepEqual(db.data(`${PRIVATE}/R0/rounds`, '0').standings, [{ studentId: 's3', rank: 2 }]);
  assert.equal(deleted.liveChallengePrivateRoundsScrubbed, 2);
  const roundWrites = db.writes.filter((write) => /\/rounds$/.test(write.collection));
  assert.deepEqual(roundWrites.map((write) => `${write.collection}/${write.id}`).sort(), [`${PRIVATE}/R0/rounds/0`, `${PRIVATE}/R1/rounds/0`]);
  // Only rooms the student is traced to are read: an unrelated room is not.
  assert.deepEqual(db.data(`${PRIVATE}/R9/rounds`, '0').standings, [{ studentId: 's1', rank: 1 }]);
  assert.equal(db.reads.some((read) => read.collection === `${PRIVATE}/R9/rounds`), false);
});
