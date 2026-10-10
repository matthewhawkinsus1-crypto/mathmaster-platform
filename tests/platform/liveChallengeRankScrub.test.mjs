// THE ONE-OFF SCRUB OF OLD ROOMS' CLASS-READABLE STANDINGS
// (scripts/scrub-live-challenge-public-ranks.mjs, planned by
// scripts/lib/liveChallengeRankScrub.mjs): an old rounds/{n} becomes its class
// copy with the whole table kept for the teacher, an old snapshot loses its
// every-seat lists, and nothing already in the new shape is touched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoomScrub, roundNeedsScrub, scrubbedStandings, standingsNeedScrub } from '../../scripts/lib/liveChallengeRankScrub.mjs';
import { parseArgs, scrubLiveChallengePublicRanks } from '../../scripts/scrub-live-challenge-public-ranks.mjs';
import { classRoundSummary, publicRoundSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { STANDINGS_PROJECTION_SCHEMA_VERSION } from '../../functions/shared/liveChallengeStandingsProjection.mjs';

// Six players in a Grand Prix round; the last two tie.
const roundResult = {
  roundIndex: 0, roundVersion: 1, modeId: null, scoringStrategyId: 'grandPrix', participantCount: 6, completedCount: 6, fieldSize: 6,
  standings: [1, 2, 3, 4, 5, 5].map((rank, index) => ({
    studentId: `S${index}`, playerKey: `pk-${index}`, alias: `Alias ${index}`, rank, position: index, tied: index >= 4,
    participated: true, finished: true, metrics: { performance: 10 - index }, roundPoints: 600 - index * 100, matchPointsAwarded: 6 - index,
  })),
};
const standingsAfterRound = roundResult.standings.map((row) => ({
  playerKey: row.playerKey, alias: row.alias, rank: row.rank, position: row.position, tied: row.tied, score: row.roundPoints, correctCount: 1, roundsAnswered: 1, roundWins: 0,
}));
// What rounds/{n} held before the class's copy existed.
const legacyRound = { ...publicRoundSummary(roundResult, { standingsAfterRound }), closedAt: 'ts' };
const legacyStandings = {
  schemaVersion: 1, roomId: 'old', kind: 'final', exact: true, count: 6,
  top: standingsAfterRound.slice(0, 5).map((row, slot) => ({ playerKey: row.playerKey, slot, alias: row.alias, rank: row.rank, tied: row.tied, score: row.score })),
  ranks: '1,2,3,4,5,5', scores: '600,500,400,300,200,100', digest: 'x',
};

test('an old round becomes the class copy the server writes now, the whole table kept for the teacher', () => {
  assert.equal(roundNeedsScrub(legacyRound), true);
  const writes = planRoomScrub({ roomId: 'old', rounds: [{ id: '0', data: legacyRound }], standings: null });
  assert.deepEqual(writes.map((write) => [write.kind, write.path]), [
    ['hostRound', 'liveChallengeRooms/old/hostRounds/0'],
    ['round', 'liveChallengeRooms/old/rounds/0'],
  ]);
  assert.equal(writes[0].data, legacyRound, 'the teacher\'s copy is the old document itself');
  const { closedAt, ...scrubbed } = writes[1].data;
  assert.equal(closedAt, 'ts');
  assert.deepEqual(scrubbed, { ...classRoundSummary(roundResult, { standingsAfterRound }) }, 'exactly the class copy a close writes now');
  assert.equal(JSON.stringify(scrubbed).includes('pk-5'), false, 'the last player is gone');
  // Already the teacher's copy: not overwritten; already the class copy: nothing.
  assert.deepEqual(planRoomScrub({ roomId: 'old', rounds: [{ id: '0', data: legacyRound }], hostRoundIds: ['0'] }).map((write) => write.kind), ['round']);
  assert.deepEqual(planRoomScrub({ roomId: 'old', rounds: [{ id: '0', data: writes[1].data }] }), []);
});

test('an old snapshot keeps the public rows, its count and where the last group starts — no every-seat lists', () => {
  assert.equal(standingsNeedScrub(legacyStandings), true);
  const scrubbed = scrubbedStandings(legacyStandings);
  assert.equal(scrubbed.schemaVersion, STANDINGS_PROJECTION_SCHEMA_VERSION);
  for (const field of ['ranks', 'scores', 'slotKeys', 'digest']) assert.equal(field in scrubbed, false, field);
  // Ranks 1-5,5 of six: the two tied for last step off; two are unshown,
  // so 1st-4th stay.
  assert.deepEqual(scrubbed.top.map((row) => row.playerKey), ['pk-0', 'pk-1', 'pk-2', 'pk-3']);
  assert.equal(scrubbed.count, 6);
  assert.equal(scrubbed.lastRank, 5);
  assert.equal(scrubbed.kind, 'final', 'the moment it is from is kept');
  assert.equal(standingsNeedScrub(scrubbed), false);
});

test('the script reads everything and writes nothing unless told to', async () => {
  // A minimal in-memory Firestore for one room.
  const docs = new Map([
    ['liveChallengeRooms/old/rounds/0', legacyRound],
    ['liveChallengeRooms/old/standings/current', legacyStandings],
  ]);
  const writes = [];
  const collection = (base) => ({
    get: async () => ({ docs: [...docs].filter(([key]) => key.startsWith(`${base}/`) && key.split('/').length === base.split('/').length + 1).map(([key, data]) => ({ id: key.split('/').pop(), data: () => data })) }),
    listDocuments: async () => [...docs.keys()].filter((key) => key.startsWith(`${base}/`)).map((key) => ({ id: key.split('/').pop() })),
    doc: (id) => ({ get: async () => ({ exists: docs.has(`${base}/${id}`), data: () => docs.get(`${base}/${id}`) }) }),
  });
  const db = {
    collection: (name) => ({ ...collection(name), listDocuments: async () => [{ id: 'old', collection: (sub) => collection(`${name}/old/${sub}`) }] }),
    doc: (pathName) => pathName,
    batch: () => ({ create: (ref, data) => writes.push(['create', ref, data]), set: (ref, data) => writes.push(['set', ref, data]), commit: async () => {} }),
  };
  const dry = await scrubLiveChallengePublicRanks(db);
  assert.deepEqual(dry, { rooms: 1, roomsChanged: 1, hostRound: 1, round: 1, standings: 1 });
  assert.equal(writes.length, 0, 'a dry run writes nothing');
  await scrubLiveChallengePublicRanks(db, { execute: true });
  assert.deepEqual(writes.map(([op, ref]) => [op, ref]), [
    ['create', 'liveChallengeRooms/old/hostRounds/0'],
    ['set', 'liveChallengeRooms/old/rounds/0'],
    ['set', 'liveChallengeRooms/old/standings/current'],
  ]);
  assert.deepEqual(parseArgs(['--project', 'p']), { project: 'p', execute: false, room: null }, 'dry run by default');
});
