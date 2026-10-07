// NOBODY IS EVER PUBLICLY LAST — the projector's boards, recognitions,
// extended-time wording, the teacher's standings choice and its replay, and
// the Recognition awards switch, tested in the pure models the screens use.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTENDED_TIME_MESSAGE,
  FINAL_BOARD_MAX_ROWS,
  PROJECTOR_MORE_NOTE,
  belowPodiumLimit,
  finalBoardRows,
  podiumRecognitionRows,
  podiumRows,
  projectorBoard,
  projectorBoardLimit,
  projectorMoreText,
  projectorShowsSolution,
  roundWaitingOnExtendedTime,
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
import { PUBLIC_TOP_COUNT } from '../../functions/shared/liveChallengePrivacy.mjs';

const players = (count) => Array.from({ length: count }, (_, index) => ({
  playerKey: `p${index + 1}`,
  alias: `Player ${index + 1}`,
  rank: index + 1,
  score: (count - index) * 100,
}));

const TOP_FEW = { standingsDisplay: 'topFew' };
const FULL = { standingsDisplay: 'full' };

/* ------------------------------ the live boards ------------------------------ */

test('by default a class-wide board shows the top five, however much room the screen has', () => {
  for (const space of [6, 8, 10]) {
    assert.equal(projectorBoardLimit(TOP_FEW, space), PUBLIC_TOP_COUNT);
    assert.equal(projectorBoardLimit({}, space), PUBLIC_TOP_COUNT, 'a room without the field is the default');
    assert.equal(projectorBoardLimit({ standingsDisplay: 'everything' }, space), PUBLIC_TOP_COUNT, 'an unknown value is the default');
  }
  // A small or zoomed projector shows fewer, never more than fit.
  assert.equal(projectorBoardLimit(TOP_FEW, 3), 3);
  const board = projectorBoard(TOP_FEW, players(30), 10);
  assert.deepEqual(board.rows.map((row) => row.playerKey), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.equal(board.hiddenCount, 25);
  assert.equal(board.moreText, `and 25 more players · ${PROJECTOR_MORE_NOTE}`);
});

test('a class of six never projects 6th place by default', () => {
  const six = players(6);
  for (const space of [3, 5, 6, 8, 10]) {
    const board = projectorBoard(TOP_FEW, six, space);
    assert.ok(!board.rows.some((row) => row.playerKey === 'p6'), `6th is not on a ${space}-row board`);
    assert.ok(board.hiddenCount >= 1);
    assert.match(board.moreText, /everyone sees their own place on their device/);
  }
  assert.equal(projectorBoard(TOP_FEW, six, 10).moreText, `and 1 more player · ${PROJECTOR_MORE_NOTE}`);
  // The same board through the shell's window (what StandingsBoard draws).
  const window = standingsWindow(six, { limit: projectorBoardLimit(TOP_FEW, 10) });
  assert.equal(window.top.length, 5);
  assert.equal(window.hiddenCount, 1);
});

test('a class of five or fewer never projects its last player either', () => {
  for (const count of [2, 3, 4, 5]) {
    const board = projectorBoard(TOP_FEW, players(count), 10);
    assert.equal(board.rows.length, count - 1, `${count} players: everyone but the last`);
    assert.ok(!board.rows.some((row) => row.playerKey === `p${count}`), `last of ${count} is not on the board`);
    assert.equal(board.moreText, `and 1 more player · ${PROJECTOR_MORE_NOTE}`);
    assert.equal(projectorBoardLimit(TOP_FEW, 10, count), count - 1);
  }
  // A lone player is first as well as last.
  assert.equal(projectorBoard(TOP_FEW, players(1), 10).rows.length, 1);
  // Under the podium: four players show nobody below 3rd; five show 4th only.
  assert.deepEqual(finalBoardRows(TOP_FEW, players(4), 10).rows, []);
  assert.equal(finalBoardRows(TOP_FEW, players(4), 10).hiddenCount, 1);
  assert.deepEqual(finalBoardRows(TOP_FEW, players(5), 10).rows.map((row) => row.playerKey), ['p4']);
  // Full standings (the teacher's opt-in) still show the whole small class.
  assert.equal(projectorBoard(FULL, players(4), 10).rows.length, 4);
  assert.equal(projectorBoardLimit(FULL, 10, 4), 10);
  assert.deepEqual(finalBoardRows(FULL, players(5), 10).rows.map((row) => row.playerKey), ['p4', 'p5']);
});

test('full standings (the teacher\'s opt-in) fill the space, last place included', () => {
  assert.equal(projectorBoardLimit(FULL, 10), 10);
  assert.equal(projectorBoardLimit(FULL, 6), 6);
  const board = projectorBoard(FULL, players(8), 10);
  assert.equal(board.rows.length, 8);
  assert.ok(board.rows.some((row) => row.playerKey === 'p8'), 'last place is on a full board');
  // Out of space, a full board still says how many more — without the
  // own-device note, which belongs to the top-few choice.
  assert.equal(projectorBoard(FULL, players(12), 10).moreText, 'and 2 more players');
  assert.equal(projectorMoreText(FULL, 0), '');
});

/* --------------------------- under the final podium --------------------------- */

test('under the podium: 4th and 5th by default, never 6th; as many as fit with full standings', () => {
  const eight = players(8);
  assert.equal(belowPodiumLimit(TOP_FEW, 10), 2);
  const board = finalBoardRows(TOP_FEW, eight, 10);
  assert.deepEqual(board.rows.map((row) => row.playerKey), ['p4', 'p5']);
  assert.equal(board.hiddenCount, 3);
  // The podium keeps the top three.
  const podium = podiumRows(eight);
  assert.deepEqual([podium.first, podium.second, podium.third].map((row) => row.playerKey), ['p1', 'p2', 'p3']);
  // Six players: 6th is never shown.
  const six = finalBoardRows(TOP_FEW, players(6), 10);
  assert.deepEqual(six.rows.map((row) => row.playerKey), ['p4', 'p5']);
  assert.equal(six.hiddenCount, 1);
  // A screen with room for only two standings rows shows one under the podium.
  assert.equal(belowPodiumLimit(TOP_FEW, 2), 1);

  // Full standings: the old rule — the space less one, at most nine.
  assert.equal(belowPodiumLimit(FULL, 6), 5);
  assert.equal(belowPodiumLimit(FULL, 40), FINAL_BOARD_MAX_ROWS);
  const full = finalBoardRows(FULL, eight, 10);
  assert.deepEqual(full.rows.map((row) => row.playerKey), ['p4', 'p5', 'p6', 'p7', 'p8']);
  assert.equal(full.hiddenCount, 0);
});

test('a tie keeps the engine\'s standing order under the podium', () => {
  const tied = [
    { playerKey: 'a', alias: 'A', rank: 1 }, { playerKey: 'b', alias: 'B', rank: 2 }, { playerKey: 'c', alias: 'C', rank: 3 },
    { playerKey: 'd', alias: 'D', rank: 4, tied: true }, { playerKey: 'e', alias: 'E', rank: 4, tied: true }, { playerKey: 'f', alias: 'F', rank: 6 },
  ];
  assert.deepEqual(finalBoardRows(TOP_FEW, tied, 10).rows.map((row) => row.playerKey), ['d', 'e']);
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
  const room = { challengeMode: 'standard', maxTimeMultiplier: 1.5 };
  assert.equal(roundWaitingOnExtendedTime({ room, locked: true, joinedCount: 8, answeredCount: 7 }), true);
  assert.match(EXTENDED_TIME_MESSAGE, /A few students are still finishing — results in a moment/);
  // Not before the deadline, not without anyone with extended time, not when
  // everyone has answered, and never in a Graph Feature Rush.
  assert.equal(roundWaitingOnExtendedTime({ room, locked: false, joinedCount: 8, answeredCount: 7 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: { maxTimeMultiplier: 1 }, locked: true, joinedCount: 8, answeredCount: 7 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: {}, locked: true, joinedCount: 8, answeredCount: 7 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room, locked: true, joinedCount: 8, answeredCount: 8 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: { ...room, challengeMode: 'graphFeatureRush' }, locked: true, joinedCount: 8, answeredCount: 7 }), false);
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
