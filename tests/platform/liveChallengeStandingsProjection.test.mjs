// THE PUBLIC STANDINGS PROJECTION (functions/shared/liveChallengeStandings
// Projection.mjs): what it says, how it ranks, what it never contains, and
// which snapshot may replace which.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECTION_KIND,
  STANDINGS_MAX_PLAYERS,
  STANDINGS_TOP_ROWS,
  buildStandingsProjection,
  comparePositions,
  decodeSlotList,
  encodeSlotList,
  exactProjectionFromStandings,
  liveProjectionActiveRound,
  liveProjectionFromPublicRows,
  projectionDigest,
  projectionMayReplace,
  projectionPosition,
  projectionRankTable,
  standingsFromProjection,
} from '../../functions/shared/liveChallengeStandingsProjection.mjs';
import { publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';
import { leaderboardOptionsFor } from '../../functions/shared/liveChallengeScoring.mjs';
import { buildMatchResult, matchStandingsAfterRound } from '../../functions/shared/liveChallengeResults.mjs';

const T = (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 });
const key = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const publicRow = (index, fields = {}) => ({
  playerKey: key(index),
  slot: index,
  alias: `Player ${index}`,
  joined: true,
  score: 0,
  correctCount: 0,
  roundsAnswered: 0,
  streak: 0,
  answeredRound: -1,
  updatedAt: T(1_000 + index),
  ...fields,
});
const runningRoom = (fields = {}) => ({
  status: 'running', roundState: 'open', currentRound: 1, roundVersion: 2, scoringStrategyId: 'accuracyFirst',
  startsAt: T(10_000), endsAt: T(70_000), ...fields,
});

test('a projection is the top rows and compact per-seat lists, nothing else', () => {
  const rows = Array.from({ length: 12 }, (_, index) => publicRow(index, { score: 1_000 - index * 50, correctCount: 3 }));
  const projection = liveProjectionFromPublicRows({ roomId: 'room-1', room: runningRoom(), rows, nowMs: 20_000 });
  assert.equal(projection.kind, PROJECTION_KIND.LIVE);
  assert.equal(projection.exact, false);
  assert.equal(projection.count, 12);
  assert.equal(projection.top.length, STANDINGS_TOP_ROWS);
  assert.deepEqual(projection.top.map((row) => row.alias), ['Player 0', 'Player 1', 'Player 2', 'Player 3', 'Player 4']);
  assert.equal(projection.ranks, '1,2,3,4,5,6,7,8,9,10,11,12');
  assert.equal(projection.scores, '1000,950,900,850,800,750,700,650,600,550,500,450');
  // Exactly these keys: a field added later must be added here on purpose.
  assert.deepEqual(Object.keys(projection).sort(), [
    'count', 'exact', 'includesWorkInProgress', 'kind', 'phase', 'ranks', 'roomId', 'roundIndex', 'roundVersion',
    'schemaVersion', 'scores', 'scoringStrategyId', 'status', 'top',
  ]);
  projection.top.forEach((row) => assert.deepEqual(Object.keys(row).sort(), ['alias', 'playerKey', 'rank', 'score', 'slot', 'tied']));
});

test('nothing private reaches a projection: no student id, email, answer, per-player time, diagnostic or support', () => {
  const rows = Array.from({ length: 6 }, (_, index) => publicRow(index, {
    // Everything a row (or a careless caller) might carry that a classmate must not see.
    studentId: `student-${index}`, email: `s${index}@school.org`, studentEmail: `s${index}@school.org`,
    answeredRound: 1, provisionalPoints: 300, provisionalRound: 1, provisionalAt: T(5_000), rushActiveAt: T(5_000),
    lastSubmissionAudit: { connectionQuality: 'degraded' }, submissionReceipts: { a: { isCorrect: true } },
    responsePayload: { raw: 'x = 3' }, accommodations: ['extendedTime'], supports: { readAloud: true },
    launchMilestones: { listener_attached: {} }, connectionStatus: 'degraded', name: `Student ${index}`,
    score: 100 * index,
  }));
  const text = JSON.stringify(liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows, nowMs: 20_000 }));
  // An alias is shown, never parsed: no control character reaches a screen.
  const odd = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: [publicRow(0, { alias: 'Swift\nOtter\u0007\u001b[31m', score: 10 })], nowMs: 20_000 });
  assert.equal(odd.top[0].alias, 'Swift Otter  [31m');
  assert.equal([...odd.top[0].alias].some((char) => char.charCodeAt(0) < 32), false);
  for (const forbidden of ['student-', '@school.org', 'answeredRound', 'provisional', 'At"', 'Audit', 'Receipts', 'isCorrect', 'x = 3', 'extendedTime', 'readAloud', 'launchMilestones', 'connection', 'Student 0', 'supports', 'accommodations']) {
    assert.equal(text.includes(forbidden), false, `the projection carries ${forbidden}`);
  }
});

test('a live projection ranks exactly as the board always did, for every strategy, ties included', () => {
  const cases = [
    { strategy: 'accuracyFirst', rows: [
      publicRow(0, { score: 1200, correctCount: 1 }), publicRow(1, { score: 1200, correctCount: 1 }),
      publicRow(2, { score: 900, correctCount: 1, provisionalPoints: 400, provisionalRound: 1 }), publicRow(3, { score: 1200, correctCount: 2 }),
      publicRow(4, { score: 0, joined: false }),
    ] },
    { strategy: 'correctCount', rows: [
      publicRow(0, { score: 2, roundsAnswered: 2, matchAccuracy: 0.5 }), publicRow(1, { score: 2, roundsAnswered: 2, matchAccuracy: 0.9 }),
      publicRow(2, { score: 2, roundsAnswered: 3 }), publicRow(3, { score: 1, roundsAnswered: 1 }),
    ] },
    { strategy: 'grandPrix', rows: [
      publicRow(0, { score: 22, matchPoints: 22, roundWins: 1, rawScore: 1800 }), publicRow(1, { score: 22, matchPoints: 22, roundWins: 1, rawScore: 1800 }),
      publicRow(2, { score: 22, matchPoints: 22, roundWins: 2, rawScore: 1000 }), publicRow(3, { score: 15, matchPoints: 15, roundWins: 0, rawScore: 2500 }),
    ] },
  ];
  for (const { strategy, rows } of cases) {
    for (const nowMs of [5_000, 20_000, 80_000]) {
      const room = runningRoom({ scoringStrategyId: strategy });
      const projection = liveProjectionFromPublicRows({ roomId: 'r', room, rows, nowMs });
      const activeRound = liveProjectionActiveRound(room, nowMs);
      const board = publicLeaderboard(rows, { activeRound, ...leaderboardOptionsFor(strategy) });
      const table = projectionRankTable(projection);
      assert.equal(projection.count, board.length, `${strategy}: count`);
      board.forEach((row) => {
        const seat = table.find((entry) => entry.slot === rows.find((source) => source.playerKey === row.playerKey).slot);
        assert.equal(seat.rank, row.rank, `${strategy} at ${nowMs}: ${row.alias}'s rank`);
        assert.equal(seat.score, row.liveScore, `${strategy} at ${nowMs}: ${row.alias}'s score`);
      });
      assert.deepEqual(projection.top.map((row) => [row.playerKey, row.rank, row.tied]), board.slice(0, STANDINGS_TOP_ROWS).map((row) => [row.playerKey, row.rank, row.tied]), `${strategy}: the top rows, in order`);
    }
  }
});

test('work in progress counts only while the round takes answers', () => {
  const room = runningRoom();
  assert.equal(liveProjectionActiveRound(room, 9_999), null, 'the countdown');
  assert.equal(liveProjectionActiveRound(room, 10_000), 1, 'GO');
  assert.equal(liveProjectionActiveRound(room, 69_999), 1, 'the last instant');
  assert.equal(liveProjectionActiveRound(room, 70_000), null, 'the deadline');
  assert.equal(liveProjectionActiveRound({ ...room, roundState: 'closed' }, 20_000), null, 'a closed round');
  assert.equal(liveProjectionActiveRound({ ...room, status: 'lobby' }, 20_000), null, 'the lobby');
  assert.equal(liveProjectionActiveRound({ ...room, endsAt: null }, 99_999), 1, 'a pace round has no deadline');
  const rows = [publicRow(0, { score: 100, provisionalPoints: 500, provisionalRound: 1 }), publicRow(1, { score: 300 })];
  assert.equal(liveProjectionFromPublicRows({ roomId: 'r', room, rows, nowMs: 20_000 }).scores, '600,300');
  assert.equal(liveProjectionFromPublicRows({ roomId: 'r', room, rows, nowMs: 20_000 }).includesWorkInProgress, true);
  assert.equal(liveProjectionFromPublicRows({ roomId: 'r', room, rows, nowMs: 80_000 }).scores, '100,300');
  // A placement strategy never adds work in progress to its championship.
  const grandPrix = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom({ scoringStrategyId: 'grandPrix' }), rows, nowMs: 20_000 });
  assert.equal(grandPrix.includesWorkInProgress, false);
});

test('an exact projection is the engine\'s standings: after a round, and the match result itself', () => {
  const players = Array.from({ length: 7 }, (_, index) => ({
    studentId: `s${index}`, playerKey: key(index), slot: 6 - index, alias: `Player ${index}`, joined: index !== 5,
    score: [1300, 1300, 900, 1500, 0, 700, 1300][index], correctCount: [2, 1, 1, 2, 0, 1, 1][index], roundsAnswered: 2,
    submissionReceipts: {},
  }));
  const after = matchStandingsAfterRound({ players, modeId: null, scoringStrategyId: 'accuracyFirst' });
  const closed = exactProjectionFromStandings({ roomId: 'r', room: runningRoom({ roundState: 'closed' }), kind: PROJECTION_KIND.ROUND_CLOSED, standings: after, players });
  assert.equal(closed.exact, true);
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.count, 6, 'the player who never joined is not ranked');
  for (const standing of after) {
    const slot = players.find((player) => player.playerKey === standing.playerKey).slot;
    assert.equal(projectionRankTable(closed).find((entry) => entry.slot === slot).rank, standing.rank, `${standing.alias}`);
  }
  const result = buildMatchResult({ roomId: 'r', room: { ...runningRoom(), status: 'finished' }, privateState: {}, players, status: 'finished', finalizedAtMs: 99_000 });
  const final = exactProjectionFromStandings({ roomId: 'r', room: runningRoom(), kind: PROJECTION_KIND.FINAL, standings: result.standings, players, status: 'finished' });
  assert.equal(final.kind, PROJECTION_KIND.FINAL);
  assert.equal(final.phase, 'final');
  const finalRanked = result.standings.filter((standing) => standing.rank !== null);
  // The match result lists the player who never joined (unranked). Even if a
  // standing like that carried a rank, the final snapshot leaves it out.
  assert.equal(result.standings.some((standing) => standing.joined === false), true);
  const misranked = exactProjectionFromStandings({ roomId: 'r', room: runningRoom(), kind: PROJECTION_KIND.FINAL, standings: result.standings.map((standing) => (standing.joined === false ? { ...standing, rank: 7, position: 7 } : standing)), players, status: 'finished' });
  assert.equal(misranked.count, finalRanked.length, 'a standing that never joined is left out whatever its rank');
  assert.equal(projectionRankTable(misranked).some((entry) => entry.slot === players[5].slot), false);
  assert.equal(final.count, finalRanked.length);
  assert.deepEqual(final.top.map((row) => [row.playerKey, row.rank, row.tied, row.score]), finalRanked.slice(0, STANDINGS_TOP_ROWS).map((row) => [row.playerKey, row.rank, row.tied, row.score]));
  for (const standing of finalRanked) {
    const slot = players.find((player) => player.playerKey === standing.playerKey).slot;
    const seat = projectionRankTable(final).find((entry) => entry.slot === slot);
    assert.equal(seat.rank, standing.rank);
    assert.equal(seat.score, standing.score);
  }
});

test('a room from before seats is seated by player key, and each screen still finds itself', () => {
  const rows = [3, 1, 2].map((index) => ({ ...publicRow(index, { score: index * 100 }), slot: undefined }));
  const projection = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows, nowMs: 20_000 });
  assert.equal(typeof projection.slotKeys, 'string');
  for (const row of rows) {
    const view = standingsFromProjection(projection, { roomId: 'r', slot: null, playerKey: row.playerKey });
    assert.equal(view.self.score, row.score, `${row.alias} finds its own score`);
  }
  // Duplicate seats are not trusted either.
  const clash = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: [publicRow(0, { slot: 4 }), publicRow(1, { slot: 4 })], nowMs: 20_000 });
  assert.equal(typeof clash.slotKeys, 'string');
});

test('a screen decodes its own place, a shared place, and refuses another room\'s snapshot', () => {
  const rows = [publicRow(0, { score: 500 }), publicRow(1, { score: 500 }), publicRow(2, { score: 900 }), publicRow(3, { score: 100 })];
  const projection = liveProjectionFromPublicRows({ roomId: 'room-a', room: runningRoom(), rows, nowMs: 20_000 });
  const view = standingsFromProjection(projection, { roomId: 'room-a', slot: 1, playerKey: key(1) });
  assert.deepEqual({ ...view.self }, { slot: 1, rank: 2, tied: true, score: 500 });
  assert.deepEqual({ ...standingsFromProjection(projection, { roomId: 'room-a', slot: 2 }).self }, { slot: 2, rank: 1, tied: false, score: 900 });
  assert.equal(standingsFromProjection(projection, { roomId: 'room-a', slot: 9 }).self, null, 'a seat the snapshot does not rank');
  assert.equal(standingsFromProjection(projection, { roomId: 'room-b', slot: 1 }), null, 'another room');
  assert.equal(standingsFromProjection({ ...projection, schemaVersion: 99 }, { roomId: 'room-a', slot: 1 }), null, 'a schema this screen does not know');
  assert.equal(view.count, 4);
  assert.deepEqual(view.top.map((row) => row.rank), [1, 2, 2, 4]);
});

test('which snapshot may replace which: never the final, never an earlier moment', () => {
  const at = (kind, roundVersion, phase, sourceReadMs = 0) => ({ kind, exact: kind !== PROJECTION_KIND.LIVE, roundVersion, phase, sourceReadMs });
  const live = (v, phase, ms) => at(PROJECTION_KIND.LIVE, v, phase, ms);
  assert.equal(projectionMayReplace(null, live(0, 'lobby', 1)), true, 'the first');
  assert.equal(projectionMayReplace(at(PROJECTION_KIND.FINAL, 3, 'final'), live(9, 'open', 9e9)), false, 'nothing replaces the final');
  assert.equal(projectionMayReplace(at(PROJECTION_KIND.FINAL, 3, 'final'), at(PROJECTION_KIND.FINAL, 3, 'final')), false, 'not even another final');
  assert.equal(projectionMayReplace(at(PROJECTION_KIND.ROUND_CLOSED, 2, 'closed'), live(2, 'open', 9e9)), false, 'a live read from before the close');
  assert.equal(projectionMayReplace(at(PROJECTION_KIND.ROUND_CLOSED, 2, 'closed'), live(3, 'open', 1)), true, 'the next round');
  // The results moment: a live read taken after the close (the host's board
  // moved) never replaces the round's exact standings, however late it is.
  assert.equal(projectionMayReplace(at(PROJECTION_KIND.ROUND_CLOSED, 2, 'closed', 100), live(2, 'closed', 9e9)), false, 'a live read during the results');
  assert.equal(projectionMayReplace(at(PROJECTION_KIND.ROUND_CLOSED, 2, 'closed', 100), at(PROJECTION_KIND.ROUND_CLOSED, 2, 'closed', 50)), true, 'the same close, rewritten exactly');
  assert.equal(projectionMayReplace(live(2, 'open', 500), live(2, 'open', 400)), false, 'an older read');
  assert.equal(projectionMayReplace(live(2, 'open', 500), live(2, 'open', 500)), false, 'the same read');
  assert.equal(projectionMayReplace(live(2, 'open', 500), live(2, 'open', 501)), true, 'a newer read');
  assert.equal(projectionMayReplace(live(2, 'open', 9e9), at(PROJECTION_KIND.ROUND_CLOSED, 2, 'closed')), true, 'the close');
  assert.equal(projectionMayReplace(live(2, 'open', 9e9), at(PROJECTION_KIND.FINAL, 2, 'final')), true, 'the finish');
  assert.ok(comparePositions(projectionPosition({ status: 'lobby' }), projectionPosition({ status: 'running', roundVersion: 1 })) < 0);
  assert.ok(comparePositions(projectionPosition({ status: 'running', roundVersion: 1, roundState: 'closed' }), projectionPosition({ status: 'running', roundVersion: 2 })) < 0);
  assert.equal(projectionPosition({ status: 'cancelled', roundVersion: 2 }).phase, 'final');
});

test('the digest changes exactly when what a screen would show changes', () => {
  const rows = [publicRow(0, { score: 500 }), publicRow(1, { score: 400 })];
  const base = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows, nowMs: 20_000 });
  assert.equal(projectionDigest(base), projectionDigest(liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: rows.map((row) => ({ ...row, updatedAt: T(99_999) })), nowMs: 21_000 })), 'a write that changed nothing shown');
  assert.notEqual(projectionDigest(base), projectionDigest(liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: [rows[0], { ...rows[1], score: 401 }], nowMs: 20_000 })), 'a score');
  assert.notEqual(projectionDigest(base), projectionDigest(liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom({ roundVersion: 3 }), rows, nowMs: 20_000 })), 'a later round');
  // Below the top rows: a screen there shows its own place and score.
  const class8 = Array.from({ length: 8 }, (_, index) => publicRow(index, { score: 1_000 - index * 100 }));
  const before = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: class8, nowMs: 20_000 });
  const lastScores = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: class8.map((row, index) => (index === 7 ? { ...row, score: 350 } : row)), nowMs: 20_000 });
  assert.deepEqual(lastScores.top, before.top, 'the top rows are the same');
  assert.notEqual(projectionDigest(before), projectionDigest(lastScores), 'a score below the top rows');
  const swapped = liveProjectionFromPublicRows({ roomId: 'r', room: runningRoom(), rows: class8.map((row, index) => (index === 6 ? { ...row, score: 250 } : index === 7 ? { ...row, score: 400 } : row)), nowMs: 20_000 });
  assert.notEqual(projectionDigest(before), projectionDigest(swapped), 'places swapped below the top rows');
});

test('a projection stays small at class scale and is refused past any real room', () => {
  const sizeOf = (count) => JSON.stringify(liveProjectionFromPublicRows({
    roomId: 'r', room: runningRoom(), rows: Array.from({ length: count }, (_, index) => publicRow(index, { score: 12_345 - index, alias: `Algebra Hawk ${index}` })), nowMs: 20_000,
  })).length;
  assert.ok(sizeOf(64) < 2_000, `64 players: ${sizeOf(64)} bytes`);
  assert.ok(sizeOf(128) < 3_000, `128 players: ${sizeOf(128)} bytes`);
  const huge = buildStandingsProjection({ roomId: 'r', ranked: Array.from({ length: STANDINGS_MAX_PLAYERS + 50 }, (_, index) => ({ playerKey: key(index), slot: index, alias: 'P', rank: index + 1, position: index + 1, score: 1 })) });
  assert.equal(huge.count, STANDINGS_MAX_PLAYERS);
});

test('the compact lists round-trip, with empty seats', () => {
  assert.equal(encodeSlotList([1, null, 3, undefined, Number.NaN, 2.6]), '1,,3,,,3');
  assert.deepEqual(decodeSlotList('1,,3,,,3'), [1, null, 3, null, null, 3]);
  assert.deepEqual(decodeSlotList(''), []);
  assert.deepEqual(decodeSlotList(undefined), []);
});
