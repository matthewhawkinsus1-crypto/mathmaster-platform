import test from 'node:test';
import assert from 'node:assert/strict';

import {
  amountText,
  formatPoints,
  movementBetween,
  movementLabel,
  ordinal,
  placeLabel,
  placementRewardsFor,
  rewardSummaryLines,
  roundPlacementSentence,
  roundResultRows,
  roundResultsView,
  scorePresentation,
  shortPlaceText,
  standingsRows,
  standingsWindow,
} from '../../src/platform/liveChallenge/challengeStandingsModel.js';
import { publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';
import { leaderboardOptionsFor } from '../../functions/shared/liveChallengeScoring.mjs';
import { buildMatchResult, matchStandingsAfterRound, publicRoundSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { evaluateRewardPolicy, publicRewardSummary } from '../../functions/shared/liveChallengeRewardRules.mjs';
import { buildChallengeRewardPolicy } from '../../src/platform/rewards/challengeRewardPolicy.js';
import { RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';

/*
 * STANDINGS, RESULTS AND RANKS AS A SCREEN SHOWS THEM
 * (challengeStandingsModel.js, and the server's matchStandingsAfterRound /
 * publicRewardSummary it reads). Ranks come from the engine; these functions
 * only label them, so the labels are tested against the engine's own output.
 */

/* ------------------------------ words for ranks ----------------------------- */

test('a rank reads as a place, and a shared rank says it is shared', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  assert.deepEqual({ ...placeLabel({ rank: 2, tied: true }) }, { short: 'T-2', ordinal: 'T-2nd', spoken: 'tied for 2nd' });
  assert.deepEqual({ ...placeLabel({ rank: 4 }) }, { short: '4', ordinal: '4th', spoken: '4th' });
  assert.equal(placeLabel({ rank: null }).short, '—');
  assert.equal(placeLabel({ rank: 0 }).spoken, 'not placed');
  assert.equal(shortPlaceText({ rank: 1, tied: true }), 'T-1st');
  assert.equal(shortPlaceText({}), null);
  assert.equal(formatPoints(12345.6), '12,346');
  assert.equal(formatPoints(-4), '0');
});

test('ties from the engine are labelled, never broken into invented places', () => {
  const board = publicLeaderboard([
    { playerKey: 'a', alias: 'Zed', joined: true, score: 900, correctCount: 3 },
    { playerKey: 'b', alias: 'Amy', joined: true, score: 900, correctCount: 3 },
    { playerKey: 'c', alias: 'Kit', joined: true, score: 400, correctCount: 1 },
  ]);
  const rows = standingsRows(board, { selfKey: 'c' });
  assert.deepEqual(rows.map((row) => row.place.short), ['T-1', 'T-1', '3'], 'competition ranking: the next place after a tie of two is 3rd');
  assert.deepEqual(rows.map((row) => row.alias), ['Amy', 'Zed', 'Kit'], 'tied players list in the engine\'s display order');
  assert.equal(rows.find((row) => row.isSelf).playerKey, 'c');
  assert.equal(rows[0].score, 900);
  // A live board shows liveScore (banked + this round's working points).
  const live = standingsRows([{ playerKey: 'x', alias: 'X', rank: 1, score: 100, liveScore: 350, provisionalPoints: 250 }]);
  assert.equal(live[0].score, 350);
  assert.equal(live[0].bankedScore, 100);
});

test('the board\'s numbers are named for the room: points, correct answers or championship points', () => {
  assert.equal(scorePresentation({ scoringStrategyId: 'accuracyFirst' }).total.long, 'points');
  assert.equal(scorePresentation({ scoringStrategyId: 'correctCount' }).total.long, 'correct answers');
  assert.equal(scorePresentation({ scoringStrategyId: 'correctCount', questionSet: true }).total.long, 'graphs completed');
  const grandPrix = scorePresentation({ scoringStrategyId: 'grandPrix', questionSet: true });
  assert.equal(grandPrix.placementPoints, true);
  assert.equal(grandPrix.total.long, 'championship points', 'the match total');
  assert.equal(grandPrix.round.long, 'graphs completed', 'what a student DID in a round — never confused with the total');
  assert.equal(scorePresentation({ scoringStrategyId: 'grandPrix' }).round.long, 'round points');
  assert.equal(amountText(1, grandPrix.total), '1 championship point');
  assert.equal(amountText(12, grandPrix.total), '12 championship points');
});

/* ------------------------------ large classes ------------------------------ */

test('a big class: the top of the board, "and N more", and your own row only on your device', () => {
  const rows = standingsRows(Array.from({ length: 30 }, (_, index) => ({ playerKey: `p${index}`, alias: `P${index}`, rank: index + 1, score: 1000 - index })));
  const projector = standingsWindow(rows, { limit: 8 });
  assert.equal(projector.top.length, 8);
  assert.equal(projector.hiddenCount, 22);
  assert.equal(projector.self, null, 'the projector never singles anyone out');
  assert.ok(!projector.top.some((row) => row.rank > 8), 'it never shows the bottom of the class');
  const device = standingsWindow(rows, { limit: 5, selfKey: 'p24' });
  assert.equal(device.self.rank, 25, 'a student outside the top sees their own place');
  assert.equal(standingsWindow(rows, { limit: 5, selfKey: 'p2' }).self, null, 'already on the board: not repeated');
});

/* -------------------------------- movement -------------------------------- */

test('movement is the difference between two ranks the engine wrote', () => {
  const before = [{ playerKey: 'a', rank: 1 }, { playerKey: 'b', rank: 2 }, { playerKey: 'c', rank: 3 }];
  const after = [{ playerKey: 'c', rank: 1 }, { playerKey: 'a', rank: 2 }, { playerKey: 'b', rank: 2 }, { playerKey: 'late', rank: 4 }];
  const movement = movementBetween(before, after);
  assert.equal(movement.get('c'), 2);
  assert.equal(movement.get('a'), -1);
  assert.equal(movement.get('b'), 0, 'a tie into the same rank is no movement');
  assert.equal(movement.has('late'), false, 'a player who arrived since has no movement');
  assert.deepEqual({ ...movementLabel(2) }, { direction: 'up', text: '↑2', spoken: 'up 2 places' });
  assert.deepEqual({ ...movementLabel(-1) }, { direction: 'down', text: '↓1', spoken: 'down 1 place' });
  assert.equal(movementLabel(0).direction, 'same');
  assert.equal(movementLabel(null), null);
  assert.equal(movementLabel(undefined), null);
});

/* --------------------------- one round's results --------------------------- */

const roundSummary = ({ roundIndex = 1, standingsAfterRound } = {}) => publicRoundSummary({
  roundIndex,
  roundVersion: roundIndex + 1,
  modeId: 'standard',
  scoringStrategyId: 'grandPrix',
  participantCount: 4,
  completedCount: 3,
  fieldSize: 3,
  standings: [
    { playerKey: 'a', alias: 'Ada', rank: 1, position: 0, tied: false, participated: true, finished: true, roundPoints: 900, matchPointsAwarded: 10 },
    { playerKey: 'b', alias: 'Bo', rank: 2, position: 1, tied: true, participated: true, finished: true, roundPoints: 700, matchPointsAwarded: 8 },
    { playerKey: 'c', alias: 'Cy', rank: 2, position: 2, tied: true, participated: true, finished: true, roundPoints: 700, matchPointsAwarded: 8 },
    { playerKey: 'd', alias: 'Di', rank: 4, position: 3, tied: false, participated: false, finished: false, roundPoints: 0, matchPointsAwarded: 0 },
  ],
}, standingsAfterRound ? { standingsAfterRound } : undefined);

test('a round summary without standings is exactly what it always was', () => {
  const plain = roundSummary();
  assert.equal('standingsAfterRound' in plain, false, 'older readers see the same document');
  const after = [{ playerKey: 'a', rank: 1 }];
  assert.deepEqual(roundSummary({ standingsAfterRound: after }).standingsAfterRound, after);
  assert.ok(plain.standings.every((row) => !('studentId' in row)));
});

test('the results moment: the round\'s own table, the standings it left, and you in both', () => {
  const previous = roundSummary({ roundIndex: 0, standingsAfterRound: [{ playerKey: 'a', rank: 2 }, { playerKey: 'b', rank: 1 }, { playerKey: 'c', rank: 3 }, { playerKey: 'd', rank: 4 }] });
  const current = roundSummary({ standingsAfterRound: [
    { playerKey: 'a', alias: 'Ada', rank: 1, position: 0, tied: false, score: 20 },
    { playerKey: 'b', alias: 'Bo', rank: 2, position: 1, tied: false, score: 18 },
    { playerKey: 'c', alias: 'Cy', rank: 3, position: 2, tied: false, score: 11 },
    { playerKey: 'd', alias: 'Di', rank: 4, position: 3, tied: false, score: 0 },
  ] });
  const view = roundResultsView({ summary: current, previousSummary: previous, selfKey: 'c' });
  assert.equal(view.fieldSize, 3);
  assert.deepEqual(view.rows.map((row) => row.place.short), ['1', 'T-2', 'T-2', '—'], 'a non-participant has no place in the round');
  assert.equal(view.self.place.ordinal, 'T-2nd');
  assert.equal(view.self.matchPointsAwarded, 8);
  assert.equal(view.selfStanding.rank, 3);
  assert.equal(view.selfStanding.movement.direction, 'same');
  assert.equal(view.standings.find((row) => row.playerKey === 'a').movement.text, '↑1');
  assert.equal(view.standings.find((row) => row.playerKey === 'b').movement.text, '↓1');
  assert.equal(roundPlacementSentence(view.self, view.fieldSize), 'You tied for 2nd of 3');
  assert.equal(roundPlacementSentence(view.rows[0], 3), 'You placed 1st of 3');
  assert.equal(roundPlacementSentence(view.rows[3], 3), 'No answer this round.');
  assert.equal(roundPlacementSentence(null, 3), 'You will play from the next round.');
  // The first round has nothing to move from; a room from before standings
  // were written has no standings (screens fall back to the live board).
  assert.ok(roundResultsView({ summary: current, selfKey: 'a' }).standings.every((row) => row.movement === null));
  assert.equal(roundResultsView({ summary: roundSummary(), selfKey: 'a' }).standings, null);
  assert.equal(roundResultsView({ summary: null }), null);
  // A rush round's facts reach the row as what the student did.
  const rush = roundResultRows({ standings: [{ playerKey: 'r', alias: 'R', rank: 1, participated: true, completed: 7, accuracyPercent: 88 }] });
  assert.deepEqual([rush[0].completed, rush[0].accuracyPercent], [7, 88]);
});

test('a per-response round lists what each player earned, so no place sits beside a bigger number', () => {
  // Accuracy First ranks a round correct-first, then fastest — but banks
  // points per answer, bonuses included. A streak bonus can out-earn a faster
  // answer; the round's table must not read "3rd · 1,350" under "2nd · 1,200".
  const summary = publicRoundSummary({
    roundIndex: 1,
    modeId: 'standard',
    scoringStrategyId: 'accuracyFirst',
    fieldSize: 4,
    standings: [
      { playerKey: 'owl', alias: 'Owl', rank: 1, position: 0, tied: false, participated: true, roundPoints: 1225, matchPointsAwarded: 0 },
      { playerKey: 'eagle', alias: 'Eagle', rank: 2, position: 1, tied: false, participated: true, roundPoints: 1200, matchPointsAwarded: 0 },
      { playerKey: 'ranger', alias: 'Ranger', rank: 3, position: 2, tied: false, participated: true, roundPoints: 1350, matchPointsAwarded: 0 },
      { playerKey: 'comet', alias: 'Comet', rank: 4, position: 3, tied: false, participated: true, roundPoints: 1225, matchPointsAwarded: 0 },
      { playerKey: 'vertex', alias: 'Vertex', rank: 5, position: 4, tied: false, participated: false, roundPoints: 0, matchPointsAwarded: 0 },
    ],
  });
  const view = roundResultsView({ summary, selfKey: 'comet' });
  assert.equal(view.rankedBy, 'points');
  assert.deepEqual(view.rows.map((row) => [row.alias, row.place.short, row.roundPoints]), [
    ['Ranger', '1', 1350],
    ['Owl', 'T-2', 1225],
    ['Comet', 'T-2', 1225],
    ['Eagle', '4', 1200],
    ['Vertex', '—', 0],
  ]);
  const points = view.rows.filter((row) => row.participated).map((row) => row.roundPoints);
  assert.deepEqual(points, [...points].sort((left, right) => right - left), 'never a smaller number above a bigger one');
  assert.equal(roundPlacementSentence(view.self, view.fieldSize), 'You tied for 2nd of 4');
  // Correct Count: equal credit, equal place.
  const counted = roundResultsView({ summary: { ...summary, scoringStrategyId: 'correctCount', standings: summary.standings.map((row) => ({ ...row, roundPoints: row.participated && row.playerKey !== 'eagle' ? 1 : 0 })) } });
  assert.deepEqual(counted.rows.filter((row) => row.participated).map((row) => row.place.short), ['T-1', 'T-1', 'T-1', '4']);
  // Grand Prix and a rush keep the engine's placement: the place IS the score.
  assert.equal(roundResultsView({ summary: { ...summary, scoringStrategyId: 'grandPrix' } }).rankedBy, 'place');
  assert.deepEqual(roundResultsView({ summary: { ...summary, scoringStrategyId: 'grandPrix' } }).rows.map((row) => row.alias).slice(0, 4), ['Owl', 'Eagle', 'Ranger', 'Comet']);
  assert.equal(roundResultsView({ summary: { ...summary, modeId: RUSH_MODE_ID, scoringStrategyId: 'correctCount' } }).rankedBy, 'place');
});

/* ---------------- the standings a round leaves (server, pure) --------------- */

const player = (studentId, fields) => ({ studentId, playerKey: `k-${studentId}`, alias: studentId.toUpperCase(), joined: true, ...fields });

test('a round\'s standings rank the match the way the final result does', () => {
  const players = [
    player('s1', { score: 12, matchPoints: 12, roundWins: 1, rawScore: 2400, roundsAnswered: 2 }),
    player('s2', { score: 12, matchPoints: 12, roundWins: 1, rawScore: 2200, roundsAnswered: 2 }),
    player('s3', { score: 15, matchPoints: 15, roundWins: 0, rawScore: 1500, roundsAnswered: 2 }),
    player('s4', { score: 0, joined: false }),
  ];
  const standings = matchStandingsAfterRound({ players, modeId: 'standard', scoringStrategyId: 'grandPrix' });
  assert.deepEqual(standings.map((row) => row.playerKey), ['k-s3', 'k-s1', 'k-s2'], 'championship points first; a player who never joined is not ranked');
  assert.ok(standings.every((row) => !('studentId' in row)), 'anonymous');
  const final = buildMatchResult({ roomId: 'r', room: { challengeMode: 'standard', scoringStrategyId: 'grandPrix', currentRound: 1 }, players, status: 'finished' });
  const finalRank = Object.fromEntries(final.standings.filter((row) => row.rank !== null).map((row) => [row.playerKey, row.rank]));
  standings.forEach((row) => assert.equal(finalRank[row.playerKey], row.rank, `${row.alias} places the same on the results screen and in the final result`));
  // Accuracy first: the same ranks the live board shows once the round is banked.
  const classic = [
    player('a1', { score: 900, correctCount: 1 }),
    player('a2', { score: 900, correctCount: 1 }),
    player('a3', { score: 300, correctCount: 1 }),
  ];
  const after = matchStandingsAfterRound({ players: classic, modeId: 'standard', scoringStrategyId: 'accuracyFirst' });
  const board = publicLeaderboard(classic, leaderboardOptionsFor('accuracyFirst'));
  assert.deepEqual(after.map((row) => [row.playerKey, row.rank, row.tied]), board.map((row) => [row.playerKey, row.rank, row.tied]));
  assert.deepEqual(matchStandingsAfterRound({ players: [], modeId: RUSH_MODE_ID, scoringStrategyId: 'grandPrix' }), []);
});

/* ------------------------------ rewards shown ------------------------------ */

test('a room\'s reward summary names rewards in public words, never a student', () => {
  const policy = buildChallengeRewardPolicy({ passPlaces: 3, championBadge: true });
  const summary = publicRewardSummary(policy);
  assert.deepEqual(summary.placement.map((rule) => [rule.maxRank, rule.rewardCode, rule.minRoundsAnswered]).sort(), [[1, 'badge', 1], [3, 'practicePass', 1]]);
  assert.equal(summary.classPoints, true);
  const lines = rewardSummaryLines(summary);
  assert.ok(lines.some((line) => /^Top 3: .+ each$/.test(line)));
  assert.ok(lines.some((line) => line.startsWith('1st place: ')));
  assert.ok(lines.includes('Class Points for finishing, accuracy and comebacks'));
  assert.deepEqual(rewardSummaryLines(null), []);
  assert.deepEqual(publicRewardSummary(null).placement, [], 'the default policy has no placement rewards');
});

test('the rewards a final screen shows are exactly the ones the server delivers', () => {
  // DISPLAY = DELIVERY. The projector shows, beside each final place, what
  // placement earns; the server delivers from the match result. For any
  // standings, the two must agree — ties, a late joiner with no rounds
  // answered, and a class too small to fill the podium included.
  const policy = buildChallengeRewardPolicy({ passPlaces: 3, championBadge: true });
  const summary = publicRewardSummary(policy);
  const placementRuleIds = new Set(policy.rules.filter((rule) => rule.criterion.kind === 'placement').map((rule) => rule.ruleId));
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let trial = 0; trial < 200; trial += 1) {
    const size = 1 + Math.floor(random() * 9);
    const players = Array.from({ length: size }, (_, index) => player(`t${trial}s${index}`, {
      score: Math.floor(random() * 4) * 100,
      correctCount: Math.floor(random() * 3),
      roundsAnswered: Math.floor(random() * 3),
    }));
    const result = buildMatchResult({ roomId: `trial-${trial}`, room: { challengeMode: 'standard', scoringStrategyId: 'accuracyFirst', currentRound: 2 }, players, status: 'finished' });
    const delivered = new Set(evaluateRewardPolicy({ matchResult: result, policy })
      .filter((award) => placementRuleIds.has(award.ruleId))
      .map((award) => `${result.standings.find((row) => row.studentId === award.studentId).playerKey}:${award.reward.rewardCode}`));
    // What the projector would show, from the live board's own ranks.
    const board = standingsRows(publicLeaderboard(players, leaderboardOptionsFor('accuracyFirst')));
    const shown = new Set();
    placementRewardsFor(board, summary).forEach((awards, playerKey) => awards.forEach((award) => shown.add(`${playerKey}:${award.rewardCode}`)));
    assert.deepEqual([...shown].sort(), [...delivered].sort(), `trial ${trial}`);
  }
});
