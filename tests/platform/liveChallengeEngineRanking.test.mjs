import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PLACEMENT_POINTS,
  MAX_PLACEMENT_POINTS,
  RANK_DIRECTION,
  RankingSpecError,
  compareByMetrics,
  compareForDisplay,
  normalizePlacementTable,
  normalizeRankingSpec,
  placementPoints,
  rankEntries,
} from '../../functions/shared/liveChallengeRanking.mjs';
import { ACCURACY_FIRST_MATCH_RANKING, publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';

/*
 * Ranking is the one place a Live Challenge decides who is ahead, so its rules
 * are tested as rules: ties share a rank, nothing that is not performance may
 * decide a place, absent work never outranks present work, and the answer does
 * not depend on the order players arrived in.
 */

const SCORE_THEN_TIME = Object.freeze({
  id: 'score-then-time',
  metrics: [
    { key: 'score', direction: RANK_DIRECTION.HIGHER_IS_BETTER },
    { key: 'elapsedMs', direction: RANK_DIRECTION.LOWER_IS_BETTER },
  ],
});

const shuffled = (rows, seed) => {
  // Deterministic shuffle so a failure reproduces.
  const copy = [...rows];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

test('players equal on every metric share a rank: 1, 2, 2, 4', () => {
  const ranked = rankEntries([
    { participantId: 'a', alias: 'Zed', score: 100, elapsedMs: 9_000 },
    { participantId: 'b', alias: 'Amy', score: 80, elapsedMs: 5_000 },
    { participantId: 'c', alias: 'Bo', score: 80, elapsedMs: 5_000 },
    { participantId: 'd', alias: 'Cy', score: 80, elapsedMs: 7_000 },
  ], SCORE_THEN_TIME);
  assert.deepEqual(ranked.map((row) => [row.participantId, row.rank, row.tied]), [
    ['a', 1, false],
    ['b', 2, true],
    ['c', 2, true],
    ['d', 4, false],
  ]);
  assert.deepEqual(ranked.map((row) => row.position), [1, 2, 3, 4]);
});

test('a name never decides a place', () => {
  // The old leaderboard broke an exact tie by alias, so "Aaron" always beat
  // "Zoe" for identical work. Swapping the names must not move the ranks.
  const before = rankEntries([
    { participantId: 'p1', alias: 'Aaron', score: 50, elapsedMs: 1_000 },
    { participantId: 'p2', alias: 'Zoe', score: 50, elapsedMs: 1_000 },
  ], SCORE_THEN_TIME);
  const after = rankEntries([
    { participantId: 'p1', alias: 'Zoe', score: 50, elapsedMs: 1_000 },
    { participantId: 'p2', alias: 'Aaron', score: 50, elapsedMs: 1_000 },
  ], SCORE_THEN_TIME);
  assert.deepEqual(before.map((row) => row.rank), [1, 1]);
  assert.deepEqual(after.map((row) => row.rank), [1, 1]);
});

test('the result is identical for any arrival order', () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    participantId: `p${String(index).padStart(2, '0')}`,
    alias: `Player ${index % 7}`,
    score: (index * 37) % 5 * 100,
    elapsedMs: (index * 13) % 3 * 1_000,
  }));
  const reference = rankEntries(rows, SCORE_THEN_TIME).map((row) => `${row.participantId}:${row.rank}:${row.position}`);
  for (const seed of [1, 7, 42, 99, 2024]) {
    const again = rankEntries(shuffled(rows, seed), SCORE_THEN_TIME).map((row) => `${row.participantId}:${row.rank}:${row.position}`);
    assert.deepEqual(again, reference, `seed ${seed} reordered the board`);
  }
});

test('tied players are displayed by code point, the same in every browser', () => {
  const ranked = rankEntries([
    { participantId: 'p3', alias: 'émile', score: 1 },
    { participantId: 'p2', alias: 'Bea', score: 1 },
    { participantId: 'p1', alias: 'bea', score: 1 },
    { participantId: 'p0', alias: 'Abe', score: 1 },
  ], { metrics: [{ key: 'score', direction: 'desc' }] });
  // Case-insensitive first, then exact, then participant id; é sorts after
  // ASCII by code point regardless of the device's locale.
  assert.deepEqual(ranked.map((row) => row.participantId), ['p0', 'p2', 'p1', 'p3']);
  assert.ok(ranked.every((row) => row.rank === 1));
  assert.ok(compareForDisplay({ alias: 'a', participantId: 'x' }, { alias: 'a', participantId: 'y' }) < 0);
});

test('absent or non-numeric work is the worst value in either direction', () => {
  const ranked = rankEntries([
    { participantId: 'none', score: undefined, elapsedMs: undefined },
    { participantId: 'text', score: '900', elapsedMs: 1 },
    { participantId: 'nan', score: Number.NaN, elapsedMs: 1 },
    { participantId: 'zero', score: 0, elapsedMs: 50_000 },
    { participantId: 'fast', score: 0, elapsedMs: 10 },
  ], SCORE_THEN_TIME);
  assert.deepEqual(ranked.map((row) => [row.participantId, row.rank]), [
    ['fast', 1],
    ['zero', 2],
    // A score that is not a number is no score; these two then tie on time.
    ['nan', 3],
    ['text', 3],
    // Missing on every metric is last of all.
    ['none', 5],
  ]);
  // A missing time loses to any recorded time.
  assert.ok(compareByMetrics({ score: 1, elapsedMs: 99_999 }, { score: 1 }, SCORE_THEN_TIME) < 0);
});

test('metrics may live on the entry or in its metrics object', () => {
  const ranked = rankEntries([
    { participantId: 'a', metrics: { score: 10 } },
    { participantId: 'b', score: 20 },
  ], { metrics: [{ key: 'score', direction: 'desc' }] });
  assert.deepEqual(ranked.map((row) => row.participantId), ['b', 'a']);
});

test('the input is never mutated and junk rows are ignored', () => {
  const rows = [{ participantId: 'a', score: 1 }, null, 'nope', { participantId: 'b', score: 2 }];
  const snapshot = JSON.stringify(rows);
  const ranked = rankEntries(rows, { metrics: [{ key: 'score', direction: 'desc' }] });
  assert.equal(JSON.stringify(rows), snapshot);
  assert.equal(ranked.length, 2);
  assert.equal(rows[0].rank, undefined);
  assert.deepEqual(rankEntries(undefined, { metrics: [{ key: 'score', direction: 'desc' }] }), []);
});

test('a ranking spec is validated as data', () => {
  assert.throws(() => normalizeRankingSpec({}), RankingSpecError);
  assert.throws(() => normalizeRankingSpec({ metrics: [{ key: '', direction: 'desc' }] }), /needs a key/);
  assert.throws(() => normalizeRankingSpec({ metrics: [{ key: 'a', direction: 'up' }] }), /direction/);
  assert.throws(() => normalizeRankingSpec({ metrics: [{ key: 'a', direction: 'desc' }, { key: 'a', direction: 'asc' }] }), /twice/);
  const spec = normalizeRankingSpec(SCORE_THEN_TIME);
  assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.metrics));
  assert.equal(normalizeRankingSpec(spec), spec, 'a normalized spec is not re-validated');
});

test('placement points follow the table, ties share the points of their rank', () => {
  assert.deepEqual([1, 2, 3, 12].map((rank) => placementPoints(rank)), [15, 12, 10, 1]);
  assert.equal(placementPoints(13), 0, 'beyond the default table earns nothing unless configured');
  assert.equal(placementPoints(13, { beyondTablePoints: 1 }), 1);
  assert.equal(placementPoints(13, { beyondTablePoints: 1_000 }), MAX_PLACEMENT_POINTS);
  for (const invalid of [0, -1, 1.5, 'first', null]) assert.equal(placementPoints(invalid), 0);
  // Two players tied for second both earn second's points; the next earns fourth's.
  const ranked = rankEntries([
    { participantId: 'a', score: 9 }, { participantId: 'b', score: 5 }, { participantId: 'c', score: 5 }, { participantId: 'd', score: 1 },
  ], { metrics: [{ key: 'score', direction: 'desc' }] });
  assert.deepEqual(ranked.map((row) => placementPoints(row.rank)), [15, 12, 12, 9]);
});

test('a malformed placement table falls back to the default rather than paying nonsense', () => {
  assert.deepEqual(normalizePlacementTable([10, 6, 3]), [10, 6, 3]);
  assert.equal(normalizePlacementTable([3, 6, 10]), DEFAULT_PLACEMENT_POINTS, 'later places may not out-earn earlier ones');
  assert.equal(normalizePlacementTable([10, -1]), DEFAULT_PLACEMENT_POINTS);
  assert.equal(normalizePlacementTable([MAX_PLACEMENT_POINTS + 1]), DEFAULT_PLACEMENT_POINTS);
  assert.equal(normalizePlacementTable([]), DEFAULT_PLACEMENT_POINTS);
  assert.equal(normalizePlacementTable(Array.from({ length: 41 }, () => 1)), DEFAULT_PLACEMENT_POINTS);
  assert.equal(normalizePlacementTable('15,12'), DEFAULT_PLACEMENT_POINTS);
});

test('the live leaderboard uses the same rules, so tied scores share a rank on screen', () => {
  const board = publicLeaderboard([
    { playerKey: 'k1', alias: 'Nova', score: 900, correctCount: 3 },
    { playerKey: 'k2', alias: 'Atlas', score: 900, correctCount: 3 },
    { playerKey: 'k3', alias: 'Comet', score: 900, correctCount: 2 },
    { playerKey: 'k4', alias: 'Gone', score: 5000, joined: false },
  ], { ranking: ACCURACY_FIRST_MATCH_RANKING });
  assert.deepEqual(board.map((row) => [row.alias, row.rank]), [['Atlas', 1], ['Nova', 1], ['Comet', 3]]);
  assert.ok(!board.some((row) => row.alias === 'Gone'), 'a player who never joined is not on the board');
});
