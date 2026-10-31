// A SMALL CLASS MUST NOT LET ONE PLAYER NAME THE LAST (LC22, finding A1-32).
//
// With 5 players the public rule used to show the top 3 and leave 4th and 5th
// unshown. The lobby had listed every alias, and a student knows their own
// place, so 4th looked at the projector, saw three aliases and "and 2 more",
// and named 5th: the one name that was neither on the board nor theirs. The
// same held for 4 players (3rd names 4th), 6 (5th names 6th) and 7 on a
// five-row screen (6th names 7th).
//
// The rule now leaves three or more unshown on any list the whole class reads
// (the projector, and the documents every student can read), or nobody shown.
// Nobody shown for 3 players, 1st only for 4, the top two for 5, the podium
// for 6.
//
// THE ORACLE IS WRITTEN HERE, from what a viewer can know, not from the code
// that applies the rule: a viewer knows every alias (the lobby), the rows on
// the board, and their own place, so the players left for them to find are
// everyone not on the board and not themselves. When that is exactly one
// player, that player is named, and the last place is among those unshown.
// Every shape of ranking is walked (all ways to split n players into tied
// groups), not a sample.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLIC_TOP_COUNT,
  classStandingsRows,
  publicStandingsRows,
} from '../../functions/shared/liveChallengePrivacy.mjs';
import {
  finalBoardRows,
  publicStandingsRows as screenRule,
} from '../../src/platform/liveChallenge/liveChallengeProjectorModel.js';

const TOP_FEW = { standingsDisplay: 'topFew' };
const FULL = { standingsDisplay: 'full' };

// Every way to split n players into groups of tied players, best group first:
// [2, 1, 3] is two tied for 1st, one 3rd, three tied for 4th. 2^(n-1) of them.
const shapes = (n) => {
  if (n === 0) return [[]];
  const all = [];
  for (let first = 1; first <= n; first += 1) for (const rest of shapes(n - first)) all.push([first, ...rest]);
  return all;
};
const rowsOf = (shape) => {
  const rows = [];
  let rank = 1;
  for (const size of shape) {
    for (let index = 0; index < size; index += 1) rows.push({ playerKey: `p${rows.length + 1}`, alias: `Player ${rows.length + 1}`, rank, tied: size > 1 });
    rank += size;
  }
  return rows;
};
const keys = (rows) => rows.map((row) => row.playerKey);

// The players a viewer has left to find on a board: not listed, and not them.
const leftToFind = (everyone, listedKeys, viewerKey) => everyone.filter((row) => !listedKeys.includes(row.playerKey) && row.playerKey !== viewerKey);

test('exhaustive: on the class\'s list, no viewer is left with exactly one player to find, and the last place is never listed', () => {
  let lists = 0;
  let viewers = 0;
  for (let count = 1; count <= 12; count += 1) {
    for (const shape of shapes(count)) {
      const everyone = rowsOf(shape);
      const lastRank = Math.max(...everyone.map((row) => row.rank));
      for (const space of [3, 5, 10]) {
        const board = publicStandingsRows(TOP_FEW, everyone, { spaceForRows: space });
        const label = `${count} players ${JSON.stringify(shape)}, ${space} rows`;
        lists += 1;
        // The top of the standing order, in its order, never as many as the screen cannot hold.
        assert.deepEqual(keys(board.rows), keys(everyone.slice(0, board.rows.length)), `${label}: not the top`);
        assert.ok(board.rows.length <= Math.min(space, PUBLIC_TOP_COUNT), `${label}: ${board.rows.length} rows`);
        // Never a row tied with the last place.
        assert.ok(board.rows.every((row) => row.rank < lastRank), `${label}: a row tied for last is listed`);
        assert.equal(board.hiddenCount, count - board.rows.length, `${label}: the count it says`);
        // No viewer — on the list or among the unshown — is left with one name.
        // (Two players: each knows the other from their own place.)
        if (count < 3) continue;
        for (const viewer of everyone) {
          viewers += 1;
          const left = leftToFind(everyone, keys(board.rows), viewer.playerKey);
          assert.notEqual(left.length, 1, `${label}: ${viewer.playerKey} is left with ${left.map((row) => row.playerKey)} to find`);
        }
      }
    }
  }
  assert.ok(lists === 12_285 && viewers > 100_000, `the walk reached every shape (${lists} lists, ${viewers} viewers)`);
});

test('exhaustive: the class sees as much as that allows — the largest prefix that leaves three or more, or nobody', () => {
  for (let count = 1; count <= 12; count += 1) {
    for (const shape of shapes(count)) {
      const everyone = rowsOf(shape);
      const lastRank = Math.max(...everyone.map((row) => row.rank));
      for (const space of [3, 5, 10]) {
        const board = publicStandingsRows(TOP_FEW, everyone, { spaceForRows: space });
        // The most the rules above allow, found by choosing the longest prefix
        // rather than by stepping a list back. A prefix may not hold a row
        // tied with last, nor more than fits; stopping inside a group of tied
        // players is allowed only where the screen's room ends it. A prefix
        // that stops between groups is allowed when it leaves three or more.
        const ceiling = Math.min(space, PUBLIC_TOP_COUNT, everyone.filter((row) => row.rank < lastRank).length);
        const atGroupEdge = (length) => length === 0 || everyone[length].rank !== everyone[length - 1].rank;
        let expected = 0;
        for (let length = ceiling; length >= 1; length -= 1) {
          const cutByRoom = length === ceiling && ceiling < everyone.filter((row) => row.rank < lastRank).length;
          if (count - length >= 3 && (atGroupEdge(length) || cutByRoom)) { expected = length; break; }
        }
        assert.equal(board.rows.length, expected, `${count} players ${JSON.stringify(shape)}, ${space} rows`);
      }
    }
  }
});

test('the numbers a teacher will see, written out: a class of 2–3 shows none, 4 the winner, 5 the top two, 6 the podium', () => {
  const strict = (count) => rowsOf(Array(count).fill(1));
  const SHOWN = { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 5, 10: 5, 24: 5 };
  for (const [count, shown] of Object.entries(SHOWN)) {
    const board = publicStandingsRows(TOP_FEW, strict(Number(count)), { spaceForRows: 10 });
    assert.equal(board.rows.length, shown, `${count} players`);
    assert.equal(board.hiddenCount, Number(count) - shown);
  }
  // What the line under a list says: how many more, and where to look.
  assert.equal(publicStandingsRows(TOP_FEW, strict(5), { spaceForRows: 10 }).moreText, 'and 3 more players · everyone sees their own place on their device');
  assert.equal(publicStandingsRows(TOP_FEW, strict(3), { spaceForRows: 10 }).moreText, '3 players · everyone sees their own place on their device');
});

test('the finding\'s own case: five players — the 4th-place student cannot name the 5th, on the projector or on their device', () => {
  const everyone = rowsOf([1, 1, 1, 1, 1]);
  // The projector (no viewer): the top two. Before, the top three — and the
  // 4th, finding p1–p3 on the board and themselves 4th, had one alias left.
  const projector = publicStandingsRows(TOP_FEW, everyone, { spaceForRows: 10 });
  assert.deepEqual(keys(projector.rows), ['p1', 'p2']);
  // What the server publishes for a student to read is that same list.
  const published = classStandingsRows(everyone, { totalCount: 5 });
  assert.deepEqual(keys(published.rows), ['p1', 'p2']);
  assert.equal(published.hiddenCount, 3);
  assert.equal(published.lastRank, 5);
  // The 4th-place device: the published rows and their own, 3rd and 5th unshown.
  const device = publicStandingsRows(TOP_FEW, [...published.rows, everyone[3]], { selfKey: 'p4', lastRank: published.lastRank, totalCount: 5 });
  assert.deepEqual(keys(device.rows), ['p1', 'p2', 'p4']);
  assert.equal(leftToFind(everyone, keys(device.rows), 'p4').length, 2, 'two to find, one of them last');
  // The 5th-place device: their own row set apart, the same two classmates above it.
  const fifth = publicStandingsRows(TOP_FEW, [...published.rows, everyone[4]], { selfKey: 'p5', lastRank: published.lastRank, totalCount: 5 });
  assert.deepEqual(keys(fifth.rows), ['p1', 'p2']);
  assert.equal(fifth.self.playerKey, 'p5');
  assert.equal(fifth.hiddenCount, 2);
});

test('seven players on a five-row screen: 6th and 7th were all the top five left', () => {
  const seven = rowsOf(Array(7).fill(1));
  assert.deepEqual(keys(publicStandingsRows(TOP_FEW, seven, { spaceForRows: 5 }).rows), ['p1', 'p2', 'p3', 'p4']);
  // A teacher's console, which sees every row, is not a class-wide list.
  assert.equal(publicStandingsRows(FULL, seven, { spaceForRows: 10 }).rows.length, 7);
});

test('exhaustive: every student\'s own device, drawn from the class\'s list and their own place, leaves nobody to name', () => {
  let devices = 0;
  for (let count = 3; count <= 11; count += 1) {
    for (const shape of shapes(count)) {
      const everyone = rowsOf(shape);
      const published = classStandingsRows(everyone, { totalCount: count });
      for (const viewer of everyone) {
        // What a student's screen holds: the class's rows and their own row.
        const held = published.rows.some((row) => row.playerKey === viewer.playerKey) ? published.rows : [...published.rows, viewer];
        const device = screenRule(TOP_FEW, held, { selfKey: viewer.playerKey, lastRank: published.lastRank, totalCount: count });
        const label = `${count} players ${JSON.stringify(shape)}, ${viewer.playerKey}`;
        devices += 1;
        const listed = keys(device.rows).concat(device.self ? [device.self.playerKey] : []);
        // Never a classmate the class's own list does not show.
        keys(device.rows).filter((key) => key !== viewer.playerKey).forEach((key) => assert.ok(keys(published.rows).includes(key), `${label}: ${key} is not on the class's list`));
        // Their own row is always there.
        assert.ok(listed.includes(viewer.playerKey), `${label}: their own row`);
        assert.notEqual(leftToFind(everyone, listed, viewer.playerKey).length, 1, `${label}: one name left to find`);
      }
    }
  }
  assert.ok(devices > 3_000, `${devices} devices`);
});

test('the podium follows: the winner alone for 4, the first two for 5, all three from 6', () => {
  const podium = (count) => {
    const board = finalBoardRows(TOP_FEW, rowsOf(Array(count).fill(1)), 10);
    return [board.podium.first, board.podium.second, board.podium.third].map((row) => row?.playerKey || null);
  };
  assert.deepEqual(podium(3), [null, null, null]);
  assert.deepEqual(podium(4), ['p1', null, null]);
  assert.deepEqual(podium(5), ['p1', 'p2', null]);
  assert.deepEqual(podium(6), ['p1', 'p2', 'p3']);
  // A teacher who chose full standings keeps the whole podium for a small class.
  const full = finalBoardRows(FULL, rowsOf(Array(4).fill(1)), 10);
  assert.deepEqual([full.podium.first, full.podium.second, full.podium.third].map((row) => row.playerKey), ['p1', 'p2', 'p3']);
});
