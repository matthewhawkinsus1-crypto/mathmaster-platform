// NOBODY IS EVER PUBLICLY LAST — the projector's boards, recognitions,
// extended-time wording, the teacher's standings choice and its replay, and
// the Recognition awards switch, tested in the pure models the screens use.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTENDED_TIME_MESSAGE,
  FINAL_BOARD_MAX_ROWS,
  PROJECTOR_MORE_NOTE,
  STILL_FINISHING_HOST_HINT,
  STILL_FINISHING_MESSAGE,
  finalBoardRows,
  lastRankOf,
  podiumRecognitionRows,
  podiumRows,
  projectorMoreText,
  projectorShowsSolution,
  publicStandingsRows,
  roundStillFinishing,
  roundWaitingOnExtendedTime,
  rushRaceRanked,
} from '../../src/platform/liveChallenge/liveChallengeProjectorModel.js';
import { CHALLENGE_STAGE } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { SOLUTION_STATE } from '../../src/platform/liveChallenge/challengeSolutionModel.js';
import { replayRequestFromRoom } from '../../src/platform/liveChallenge/challengeReplayModel.js';
import { standingsWindow } from '../../src/platform/liveChallenge/challengeStandingsModel.js';
import {
  DEFAULT_CHALLENGE_REWARD_CHOICE,
  buildChallengeRewardPolicy,
  describeChallengeRewardChoice,
  normalizeChallengeRewardChoice,
} from '../../src/platform/rewards/challengeRewardPolicy.js';
import { DEFAULT_LIVE_CHALLENGE_REWARD_RULES, normalizeRewardPolicy, recognitionsEnabled } from '../../functions/shared/liveChallengeRewardRules.mjs';

const players = (count) => Array.from({ length: count }, (_, index) => ({
  playerKey: `p${index + 1}`,
  alias: `Player ${index + 1}`,
  rank: index + 1,
  score: (count - index) * 100,
}));

const TOP_FEW = { standingsDisplay: 'topFew' };
const FULL = { standingsDisplay: 'full' };

/* ------------------------------ the public lists ------------------------------ */
//
// ONE rule (publicStandingsRows) for every list the class sees: never a place
// tied with the class's last, never exactly one player left unnamed (the lobby
// listed every alias), the top few at most. Full standings are exempt.

const keysOf = (board) => board.rows.map((row) => row.playerKey);
const ranked = (ranks) => ranks.map((rank, index) => ({ playerKey: `p${index + 1}`, alias: `Player ${index + 1}`, rank, tied: ranks.filter((other) => other === rank).length > 1 }));

test('by default a public list shows the top five, however much room the screen has', () => {
  for (const space of [6, 8, 10]) {
    for (const room of [TOP_FEW, {}, { standingsDisplay: 'everything' }]) {
      assert.deepEqual(keysOf(publicStandingsRows(room, players(30), { spaceForRows: space })), ['p1', 'p2', 'p3', 'p4', 'p5']);
    }
  }
  // A small or zoomed projector shows fewer, never more than fit.
  assert.equal(publicStandingsRows(TOP_FEW, players(30), { spaceForRows: 3 }).rows.length, 3);
  const board = publicStandingsRows(TOP_FEW, players(30), { spaceForRows: 10 });
  assert.equal(board.hiddenCount, 25);
  assert.equal(board.moreText, `and 25 more players · ${PROJECTOR_MORE_NOTE}`);
});

test('ties at the bottom: a hard round with 2 of 24 right projects only the two', () => {
  // 22 players share 3rd — the last place. None of them is listed.
  const hard = ranked([1, 2, ...Array(22).fill(3)]);
  const board = publicStandingsRows(TOP_FEW, hard, { spaceForRows: 10 });
  assert.deepEqual(keysOf(board), ['p1', 'p2']);
  assert.equal(board.hiddenCount, 22);
  assert.equal(board.moreText, `and 22 more players · ${PROJECTOR_MORE_NOTE}`);
  // A table of four with one right: three tied for last, so only the winner.
  const table = publicStandingsRows(TOP_FEW, ranked([1, 2, 2, 2]), { spaceForRows: 10 });
  assert.deepEqual(keysOf(table), ['p1']);
  assert.equal(table.hiddenCount, 3);
  // A round's table: a player with no answer (no rank) is never listed, and
  // the last ranked group is hidden with them.
  const round = publicStandingsRows(TOP_FEW, ranked([1, 2, 3, 3, null, null]), { spaceForRows: 10 });
  assert.deepEqual(keysOf(round), ['p1', 'p2']);
});

test('nobody is named by elimination: never exactly one player unshown', () => {
  // Six players: the top five would leave only 6th unshown — 5th steps off too.
  for (const space of [5, 6, 8, 10]) {
    const board = publicStandingsRows(TOP_FEW, players(6), { spaceForRows: space });
    assert.deepEqual(keysOf(board), ['p1', 'p2', 'p3', 'p4'], `${space}-row screen`);
    assert.equal(board.hiddenCount, 2);
    assert.equal(board.moreText, `and 2 more players · ${PROJECTOR_MORE_NOTE}`);
  }
  // Every size: at least two unshown, or nobody shown at all.
  for (let count = 1; count <= 12; count += 1) {
    for (const space of [3, 4, 5, 6, 10]) {
      const board = publicStandingsRows(TOP_FEW, players(count), { spaceForRows: space });
      assert.ok(board.hiddenCount !== 1 || board.rows.length === 0, `${count} players, ${space} rows: one unshown`);
      assert.ok(!board.rows.some((row) => row.rank === count), `${count} players: the last is listed`);
    }
  }
  // When the dropped row shares its place, its whole group steps off: no
  // co-winner is hidden while the other is shown.
  assert.deepEqual(keysOf(publicStandingsRows(TOP_FEW, ranked([1, 1, 3]), { spaceForRows: 10 })), []);
  assert.deepEqual(keysOf(publicStandingsRows(TOP_FEW, ranked([1, 2, 2, 4]), { spaceForRows: 10 })), ['p1']);
});

test('all tied, or a game of one or two: no ranking at all', () => {
  for (const ranks of [[1, 1, 1, 1], [1, 1], [1], [1, 2]]) {
    const board = publicStandingsRows(TOP_FEW, ranked(ranks), { spaceForRows: 10 });
    assert.deepEqual(board.rows, [], JSON.stringify(ranks));
    assert.equal(board.hiddenCount, ranks.length);
  }
  // A list that shows nobody says how many play, not "and N more".
  assert.equal(publicStandingsRows(TOP_FEW, ranked([1, 1, 1, 1])).moreText, `4 players · ${PROJECTOR_MORE_NOTE}`);
});

test('the podium follows the same rule: 2 players none, 3 the winner, 4–6 never leave one unnamed', () => {
  const steps = (board) => [board.podium.first, board.podium.second, board.podium.third].map((row) => row?.playerKey || null);
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, players(2), 10)), [null, null, null]);
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, players(3), 10)), ['p1', null, null]);
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, players(4), 10)), ['p1', 'p2', null]);
  assert.equal(finalBoardRows(TOP_FEW, players(4), 10).hiddenCount, 2);
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, players(5), 10)), ['p1', 'p2', 'p3']);
  assert.deepEqual(finalBoardRows(TOP_FEW, players(5), 10).rows, []);
  assert.equal(finalBoardRows(TOP_FEW, players(5), 10).hiddenCount, 2);
  const six = finalBoardRows(TOP_FEW, players(6), 10);
  assert.deepEqual(steps(six), ['p1', 'p2', 'p3']);
  assert.deepEqual(six.rows.map((row) => row.playerKey), ['p4']);
  assert.equal(six.hiddenCount, 2);
  // Eight: the podium, 4th and 5th, three more.
  const eight = finalBoardRows(TOP_FEW, players(8), 10);
  assert.deepEqual(eight.rows.map((row) => row.playerKey), ['p4', 'p5']);
  assert.equal(eight.hiddenCount, 3);
  // Three players: 2nd and 3rd tied for last leave the winner; co-winners
  // over a 3rd would leave one unnamed, so the tie rule removes them both.
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, ranked([1, 2, 2]), 10)), ['p1', null, null]);
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, ranked([1, 1, 3]), 10)), [null, null, null]);
  // All tied: no ranking at all.
  assert.deepEqual(steps(finalBoardRows(TOP_FEW, ranked([1, 1, 1, 1, 1]), 10)), [null, null, null]);
  // Tied players keep the engine's standing order.
  const tied = ranked([1, 2, 3, 4, 4, 6, 7, 8]);
  assert.deepEqual(finalBoardRows(TOP_FEW, tied, 10).rows.map((row) => row.playerKey), ['p4', 'p5']);
  // A small screen: one row under the podium, the rest counted.
  assert.deepEqual(finalBoardRows(TOP_FEW, players(8), 2).rows.map((row) => row.playerKey), ['p4']);
});

test('full standings (the teacher\'s opt-in) are exempt: last place included, as many as fit', () => {
  const board = publicStandingsRows(FULL, players(8), { spaceForRows: 10 });
  assert.equal(board.rows.length, 8);
  assert.ok(board.rows.some((row) => row.playerKey === 'p8'), 'last place is on a full board');
  assert.equal(publicStandingsRows(FULL, players(2), { spaceForRows: 10 }).rows.length, 2);
  assert.equal(publicStandingsRows(FULL, ranked([1, 2, 2, 2]), { spaceForRows: 10 }).rows.length, 4);
  // Out of space, a full board says how many more, without the own-device note.
  assert.equal(publicStandingsRows(FULL, players(12), { spaceForRows: 10 }).moreText, 'and 2 more players');
  assert.equal(projectorMoreText(FULL, 0), '');
  // The podium keeps its three steps; the space less one, at most nine, below.
  const full = finalBoardRows(FULL, players(8), 10);
  assert.deepEqual([full.podium.first, full.podium.second, full.podium.third].map((row) => row.playerKey), ['p1', 'p2', 'p3']);
  assert.deepEqual(full.rows.map((row) => row.playerKey), ['p4', 'p5', 'p6', 'p7', 'p8']);
  assert.equal(full.hiddenCount, 0);
  assert.equal(finalBoardRows(FULL, players(40), 6).rows.length, 5);
  assert.equal(finalBoardRows(FULL, players(40), 40).rows.length, FINAL_BOARD_MAX_ROWS);
  assert.deepEqual([finalBoardRows(FULL, players(2), 10).podium.first?.playerKey, finalBoardRows(FULL, players(2), 10).podium.second?.playerKey], ['p1', 'p2']);
  // The old podium helpers still read standing order.
  const podium = podiumRows(players(8));
  assert.deepEqual([podium.first, podium.second, podium.third].map((row) => row.playerKey), ['p1', 'p2', 'p3']);
});

test('a student\'s own cards: classmates by the same rule, their own row always', () => {
  // The final snapshot carries the top five and the student; the class's last
  // place comes from its every-seat rank list. 24 played; places 5–24 are
  // tied, so the snapshot's 5th row is tied with the last and is not listed.
  const snapshot = [...ranked([1, 2, 3, 4, 5]), { playerKey: 'me', alias: 'Me', rank: 5, tied: true }];
  const tiedLast = publicStandingsRows(TOP_FEW, snapshot, { selfKey: 'me', lastRank: 5, totalCount: 24 });
  assert.deepEqual(keysOf(tiedLast), ['p1', 'p2', 'p3', 'p4']);
  assert.equal(tiedLast.self?.playerKey, 'me', 'their own row is still on their own device');
  assert.equal(tiedLast.hiddenCount, 19);
  // The class's last rank is the whole class's, not the rows in hand: when
  // 24 play to 24th, the snapshot's 5th is not last and is listed — the rows
  // alone (a student in 3rd sees just the top five) would read 5th as the bottom.
  const spread = ranked([1, 2, 3, 4, 5]);
  assert.deepEqual(keysOf(publicStandingsRows(TOP_FEW, spread, { selfKey: 'p3', lastRank: 24, totalCount: 24 })), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.equal(publicStandingsRows(TOP_FEW, spread, { selfKey: 'p3', lastRank: 24, totalCount: 24 }).hiddenCount, 19);
  assert.deepEqual(keysOf(publicStandingsRows(TOP_FEW, spread, { selfKey: 'p3', totalCount: 24 })), ['p1', 'p2', 'p3', 'p4']);
  // Six classmates, the student 5th: their own row in its place, 4th and 6th
  // unshown together (never one).
  const fifth = publicStandingsRows(TOP_FEW, players(6), { selfKey: 'p5' });
  assert.deepEqual(keysOf(fifth), ['p1', 'p2', 'p3', 'p5']);
  assert.equal(fifth.self, null);
  assert.equal(fifth.hiddenCount, 2);
  // The student who IS last sees their own row under the top five: the only
  // last place on their screen is their own.
  const last = publicStandingsRows(TOP_FEW, players(6), { selfKey: 'p6' });
  assert.deepEqual(keysOf(last), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.equal(last.self?.playerKey, 'p6');
  assert.equal(last.hiddenCount, 0);
  // A game of two, on each device: the winner's classmate is the last place,
  // so the winner sees only their own row; the other sees the winner and
  // their own.
  const winner = publicStandingsRows(TOP_FEW, players(2), { selfKey: 'p1' });
  assert.deepEqual(keysOf(winner), ['p1']);
  assert.equal(winner.self, null);
  const runnerUp = publicStandingsRows(TOP_FEW, players(2), { selfKey: 'p2' });
  assert.deepEqual(keysOf(runnerUp), ['p1']);
  assert.equal(runnerUp.self?.playerKey, 'p2');
});

test('the live race ranks equal graph counts together, so GO projects nobody', () => {
  const race = rushRaceRanked([{ playerKey: 'a', completed: 3 }, { playerKey: 'b', completed: 2 }, { playerKey: 'c', completed: 2 }, { playerKey: 'd', completed: 0 }, { playerKey: 'e', completed: 0 }]);
  assert.deepEqual(race.map((row) => row.rank), [1, 2, 2, 4, 4]);
  assert.deepEqual(keysOf(publicStandingsRows(TOP_FEW, race, { spaceForRows: 10 })), ['a', 'b', 'c']);
  const atGo = rushRaceRanked(['a', 'b', 'c', 'd'].map((playerKey) => ({ playerKey, completed: 0 })));
  assert.deepEqual(keysOf(publicStandingsRows(TOP_FEW, atGo, { spaceForRows: 10 })), []);
});

test('the class\'s last rank, from any rank list (a snapshot\'s every-seat ranks)', () => {
  assert.equal(lastRankOf([{ rank: 1 }, { rank: 7 }, { rank: 3 }, { rank: null }]), 7);
  assert.equal(lastRankOf([]), null);
  assert.equal(lastRankOf(null), null);
});

/* -------------- the window a board draws (standingsWindow, unchanged) -------------- */

test('the shell\'s window still draws the top of a list and a viewer\'s own row', () => {
  const window = standingsWindow(players(6), { limit: 4, selfKey: 'p6' });
  assert.equal(window.top.length, 4);
  assert.equal(window.self.playerKey, 'p6');
  assert.equal(window.hiddenCount, 2);
});

/* --------------------------------- recognitions --------------------------------- */

test('recognitions read as positive lines by game alias; player keys are never shown', () => {
  const room = {
    recognitions: [
      { id: 'mostImproved', label: 'Most improved', detail: 'The biggest jump.', aliases: ['Nova Panther 90'], playerKeys: ['secret-key-1'], classWide: false },
      { id: 'firstToAnswer', label: 'First to answer', detail: 'First right answers.', aliases: ['A', 'B', 'C', 'D', 'E'], playerKeys: ['k1', 'k2', 'k3', 'k4', 'k5'], classWide: false },
      { id: 'teamEffort', label: 'Team effort', detail: 'The whole class earned this.', aliases: ['A', 'B'], playerKeys: ['k1', 'k2'], classWide: true },
    ],
  };
  const rows = podiumRecognitionRows(room);
  assert.deepEqual(rows.map((row) => row.text), [
    'Most improved: Nova Panther 90',
    'First to answer: A, B, C and 2 more',
    'Team effort — the whole class',
  ]);
  assert.ok(!JSON.stringify(rows).includes('secret-key-1'), 'no player key reaches the display');
  assert.ok(!JSON.stringify(rows).includes('k1'));
});

test('no recognitions field (an older room, or recognitions off) shows nothing', () => {
  assert.deepEqual(podiumRecognitionRows({}), []);
  assert.deepEqual(podiumRecognitionRows({ recognitions: [] }), []);
  assert.deepEqual(podiumRecognitionRows(null), []);
  // A malformed entry (no label, or a named recognition with no alias) is skipped.
  assert.deepEqual(podiumRecognitionRows({ recognitions: [{ id: 'x' }, { id: 'steadiest', label: 'Steadiest', aliases: [] }] }), []);
});

/* --------------------------------- extended time --------------------------------- */

test('past the class deadline with extended time in play: "still finishing", never a frozen Time!', () => {
  const room = { challengeMode: 'standard', extendedTimeInPlay: true };
  assert.equal(roundWaitingOnExtendedTime({ room, locked: true, joinedCount: 8, answeredCount: 7 }), true);
  assert.match(EXTENDED_TIME_MESSAGE, /A few students are still finishing — results in a moment/);
  // Not before the deadline, not without anyone with extended time, not when
  // everyone has answered, and never in a Graph Feature Rush.
  assert.equal(roundWaitingOnExtendedTime({ room, locked: false, joinedCount: 8, answeredCount: 7 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: { extendedTimeInPlay: false }, locked: true, joinedCount: 8, answeredCount: 7 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: {}, locked: true, joinedCount: 8, answeredCount: 7 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room, locked: true, joinedCount: 8, answeredCount: 8 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: { ...room, challengeMode: 'graphFeatureRush' }, locked: true, joinedCount: 8, answeredCount: 7 }), false);
});

test('the projector\'s words for that moment are neutral; only the console says why', () => {
  // The projector reads its own names: the same moment, no reason given.
  const room = { challengeMode: 'standard', extendedTimeInPlay: true };
  for (const state of [{ locked: true, joinedCount: 8, answeredCount: 7 }, { locked: false, joinedCount: 8, answeredCount: 7 }, { locked: true, joinedCount: 8, answeredCount: 8 }]) {
    assert.equal(roundStillFinishing({ room, ...state }), roundWaitingOnExtendedTime({ room, ...state }));
  }
  for (const words of [STILL_FINISHING_MESSAGE, STILL_FINISHING_HOST_HINT]) {
    assert.doesNotMatch(words, /extended|accommodat|extra time|support plan/i, words);
  }
  assert.match(STILL_FINISHING_HOST_HINT, /End Round Now still works/);
});

/* ------------------------------- worked solution ------------------------------- */

test('the projector draws a solution only on a closed round\'s results', () => {
  for (const state of [SOLUTION_STATE.READY, SOLUTION_STATE.HELD, SOLUTION_STATE.UNAVAILABLE, SOLUTION_STATE.LOADING]) {
    assert.equal(projectorShowsSolution({ stage: CHALLENGE_STAGE.ROUND_RESULTS, solutionState: state }), true, state);
    for (const stage of [CHALLENGE_STAGE.LOBBY, CHALLENGE_STAGE.COUNTDOWN, CHALLENGE_STAGE.ROUND_ACTIVE, CHALLENGE_STAGE.ROUND_LOCKED, CHALLENGE_STAGE.ROUND_PAUSED, CHALLENGE_STAGE.COMPLETED]) {
      assert.equal(projectorShowsSolution({ stage, solutionState: state }), false, `${stage} / ${state}`);
    }
  }
  assert.equal(projectorShowsSolution({ stage: CHALLENGE_STAGE.ROUND_RESULTS, solutionState: SOLUTION_STATE.NONE }), false);
  assert.equal(projectorShowsSolution({ stage: CHALLENGE_STAGE.ROUND_RESULTS, solutionState: null }), false);
});

/* ------------------------------ Play Again keeps it ------------------------------ */

test('Play Again keeps the room\'s standings choice; an older room leaves it to the server default', () => {
  const base = { classId: 'c1', challengeMode: 'standard', roundCount: 5, roundSeconds: 45 };
  assert.equal(replayRequestFromRoom({ ...base, standingsDisplay: 'full' }).standingsDisplay, 'full');
  assert.equal(replayRequestFromRoom({ ...base, standingsDisplay: 'topFew' }).standingsDisplay, 'topFew');
  assert.equal(replayRequestFromRoom({ ...base, standingsDisplay: 'bogus' }).standingsDisplay, 'topFew');
  assert.ok(!('standingsDisplay' in replayRequestFromRoom(base)), 'absent: createLiveChallenge applies its default (top few)');
  const rush = {
    classId: 'c1', challengeMode: 'graphFeatureRush', standingsDisplay: 'full',
    graphFeatureRush: { config: { presetId: 'custom', families: ['linear'], features: ['slope'], difficulty: 'foundation' } },
  };
  assert.equal(replayRequestFromRoom(rush).standingsDisplay, 'full');
});

/* ------------------------------ Recognition awards ------------------------------ */

test('Recognition awards are on by default and send no policy of their own', () => {
  assert.equal(DEFAULT_CHALLENGE_REWARD_CHOICE.recognitions, true);
  assert.equal(normalizeChallengeRewardChoice({}).recognitions, true, 'a choice saved before the switch existed keeps them on');
  assert.equal(buildChallengeRewardPolicy(DEFAULT_CHALLENGE_REWARD_CHOICE), null);
  const withPass = buildChallengeRewardPolicy({ passPlaces: 1 });
  assert.ok(!('recognitions' in withPass));
  assert.equal(recognitionsEnabled(normalizeRewardPolicy(withPass)), true);
  assert.ok(describeChallengeRewardChoice({}).some((line) => /Recognition awards name the most improved/.test(line)));
});

test('turning Recognition awards off sends recognitions: false, keeping every rule id', () => {
  const policy = buildChallengeRewardPolicy({ recognitions: false });
  assert.equal(policy.recognitions, false);
  assert.equal(recognitionsEnabled(normalizeRewardPolicy(policy)), false, 'the server reads it as off');
  const defaults = DEFAULT_LIVE_CHALLENGE_REWARD_RULES.map((rule) => rule.ruleId);
  assert.deepEqual(policy.rules.map((rule) => rule.ruleId), defaults);
  const both = buildChallengeRewardPolicy({ passPlaces: 2, championBadge: true, recognitions: false });
  assert.deepEqual(both.rules.map((rule) => rule.ruleId), [...defaults, 'placementPracticePass', 'championBadge']);
  assert.equal(both.recognitions, false);
  assert.ok(describeChallengeRewardChoice({ recognitions: false }).some((line) => /Recognition awards are off/.test(line)));
});
