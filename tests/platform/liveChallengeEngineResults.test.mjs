import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatchResult,
  buildRoundResult,
  finalizationEffectSettled,
  finalizationEffectsState,
  matchResultStanding,
  playerTotalsAfterRound,
  publicRoundSummary,
  roundPlacementRank,
  standingFromPlayer,
} from '../../functions/shared/liveChallengeResults.mjs';

/*
 * GAME PERFORMANCE -> PLACEMENT/RESULT -> REWARD RULE -> REWARD TRANSACTION.
 *
 * These tests hold the middle arrow: a closed round becomes a ranked round
 * result exactly once, and a finished match becomes one durable result that
 * every downstream consumer (report, credit, evidence, rewards) can read
 * without the private game state.
 */

let sequence = 0;
const response = (roundIndex, overrides = {}) => {
  sequence += 1;
  return {
    serverConfirmed: true, roundIndex, questionIndex: 0, sequence, receiptKind: 'response',
    isCorrect: true, scorePercent: 100, elapsedMs: 5_000, pointsAwarded: 1_000, ...overrides,
  };
};
const player = (studentId, receipts = {}, overrides = {}) => ({
  studentId, playerKey: `key-${studentId}`, alias: `Alias ${studentId}`, joined: true, submissionReceipts: receipts, ...overrides,
});

const ROUND_PLAYERS = [
  player('fast', { a: response(0, { elapsedMs: 2_000 }) }),
  player('tied-1', { b: response(0, { elapsedMs: 7_000 }) }),
  player('tied-2', { c: response(0, { elapsedMs: 7_000 }) }),
  player('wrong', { d: response(0, { isCorrect: false, scorePercent: 0, pointsAwarded: 0 }) }),
  player('idle', {}),
  player('never-joined', { e: response(0) }, { joined: false }),
];

test('a closed round ranks its joined players and pays placement through the strategy', () => {
  const result = buildRoundResult({
    roomId: 'room-1', roundIndex: 0, roundVersion: 1, modeId: 'standard', scoringStrategyId: 'grandPrix', players: ROUND_PLAYERS, closedAtMs: 123,
  });
  assert.equal(result.participantCount, 5, 'a student who never joined is not in the round');
  assert.deepEqual(result.standings.map((row) => [row.studentId, row.rank, row.matchPointsAwarded]), [
    ['fast', 1, 15],
    // Tied work shares a rank and the points of that rank.
    ['tied-1', 2, 12],
    ['tied-2', 2, 12],
    // No credit at all earns no placement points, and neither does not playing.
    ['idle', 4, 0],
    ['wrong', 4, 0],
  ]);
  assert.equal(result.completedCount, 4);
  assert.equal(result.closedAtMs, 123);
  assert.equal(result.isSecondChance, false);
});

test('a per-response strategy records the round but pays nothing at close', () => {
  const result = buildRoundResult({ roomId: 'room-1', roundIndex: 0, scoringStrategyId: 'accuracyFirst', players: ROUND_PLAYERS });
  assert.ok(result.standings.every((row) => row.matchPointsAwarded === 0));
  assert.equal(result.standings[0].roundPoints, 1_000);
  assert.equal(buildRoundResult({ roundIndex: 4, players: [], secondChanceOf: { 4: 1 } }).isSecondChance, true);
});

test('the public copy of a round result carries no student identity', () => {
  const summary = publicRoundSummary(buildRoundResult({ roomId: 'room-1', roundIndex: 0, scoringStrategyId: 'grandPrix', players: ROUND_PLAYERS }));
  const text = JSON.stringify(summary);
  for (const studentId of ['fast', 'tied-1', 'tied-2', 'wrong', 'idle']) {
    assert.ok(!text.includes(`"${studentId}"`), `${studentId} must not appear in the public round summary`);
  }
  assert.ok(summary.standings.every((row) => !('studentId' in row) && !('metrics' in row)));
  assert.equal(summary.standings[0].playerKey, 'key-fast');
});

test('applying a round to a player twice changes nothing the second time', () => {
  const [first] = buildRoundResult({ roomId: 'r', roundIndex: 0, scoringStrategyId: 'grandPrix', players: ROUND_PLAYERS }).standings;
  const once = playerTotalsAfterRound({ player: {}, standing: first, roundIndex: 0, scoringStrategyId: 'grandPrix' });
  assert.equal(once.alreadyApplied, false);
  assert.equal(once.matchPoints, 15);
  assert.equal(once.roundWins, 1);
  assert.equal(once.score, 15, 'under placement scoring the displayed score is the championship total');
  const again = playerTotalsAfterRound({ player: { roundPlacements: once.roundPlacements }, standing: { ...first, matchPointsAwarded: 99 }, roundIndex: 0, scoringStrategyId: 'grandPrix' });
  assert.equal(again.alreadyApplied, true);
  assert.equal(again.matchPoints, 15, 'a retried close cannot pay a round twice');
  const next = playerTotalsAfterRound({ player: { roundPlacements: once.roundPlacements }, standing: { rank: 3, matchPointsAwarded: 10 }, roundIndex: 1, scoringStrategyId: 'grandPrix' });
  assert.equal(next.matchPoints, 25);
  assert.equal(next.roundWins, 1);
  const perResponse = playerTotalsAfterRound({ player: {}, standing: first, roundIndex: 0, scoringStrategyId: 'accuracyFirst' });
  assert.equal(perResponse.score, undefined, 'a per-response score was banked at submit and is not overwritten');
  assert.equal(playerTotalsAfterRound({ player: {}, standing: null, roundIndex: 0 }), null);
  assert.equal(playerTotalsAfterRound({ player: {}, standing: first, roundIndex: -1 }), null);
});

test('a round with no credit places no one, so it cannot decide a championship', () => {
  // A answers round 0 wrong and B arrives for round 1. A wins round 1, B wins
  // round 2: 15 points each. Alone at the top of a round nobody scored in, A
  // must not collect a round win that breaks the tie.
  const wrong = (roundIndex) => response(roundIndex, { isCorrect: false, scorePercent: 0, pointsAwarded: 0 });
  const receipts = {
    A: { a0: wrong(0), a1: response(1), a2: wrong(2) },
    B: { b1: wrong(1), b2: response(2) },
  };
  const joinedFrom = { A: 0, B: 1 };
  const records = { A: {}, B: {} };
  for (const roundIndex of [0, 1, 2]) {
    const round = buildRoundResult({
      roomId: 'gp',
      roundIndex,
      scoringStrategyId: 'grandPrix',
      players: ['A', 'B'].map((id) => player(id, receipts[id], { joined: joinedFrom[id] <= roundIndex })),
    });
    if (roundIndex === 0) {
      assert.deepEqual(round.standings.map((row) => [row.studentId, row.rank]), [['A', 1]]);
      assert.equal(roundPlacementRank(round.standings[0]), null, 'first in a round nobody scored in is no placement');
    }
    for (const standing of round.standings) {
      const totals = playerTotalsAfterRound({ player: records[standing.studentId], standing, roundIndex, scoringStrategyId: 'grandPrix' });
      records[standing.studentId] = { ...records[standing.studentId], ...totals };
    }
  }
  assert.deepEqual([records.A.matchPoints, records.A.roundWins], [15, 1], 'round 0 is not a win');
  assert.deepEqual([records.B.matchPoints, records.B.roundWins], [15, 1]);
  assert.equal(records.A.roundPlacements[0].won, false);
  assert.equal(records.A.roundPlacements[1].won, true);
  const result = buildMatchResult({
    roomId: 'gp',
    status: 'finished',
    room: { scoringStrategyId: 'grandPrix', currentRound: 2 },
    players: ['A', 'B'].map((id) => player(id, receipts[id], { ...records[id], joinedAtRound: joinedFrom[id] })),
  });
  assert.deepEqual(result.standings.map((row) => [row.studentId, row.rank]), [['A', 1], ['B', 1]], 'equal points, wins and raw score: a tie');

  // Everyone in a round nobody scored in ties for first; none of them won it.
  const dead = buildRoundResult({ roomId: 'gp', roundIndex: 0, scoringStrategyId: 'grandPrix', players: [player('x', { x: wrong(0) }), player('y', {})] });
  assert.deepEqual(dead.standings.map((row) => row.rank), [1, 1]);
  for (const standing of dead.standings) {
    assert.equal(playerTotalsAfterRound({ player: {}, standing, roundIndex: 0, scoringStrategyId: 'grandPrix' }).roundWins, 0);
  }
});

test('the finalization sweep gives up on the last attempt, whichever effect still fails', () => {
  const delivered = { report: 'done', invites: 'done', warmupCredit: 'notApplicable', evidence: 'done', rewards: 'done' };
  // Everything was delivered; only deleting the private state keeps failing.
  const cleanupFailing = { ...delivered, privateCleanup: 'failed' };
  assert.deepEqual(finalizationEffectsState({ effects: cleanupFailing, attempts: 9, maxAttempts: 10 }), { pending: true, abandoned: false });
  assert.deepEqual(
    finalizationEffectsState({ effects: cleanupFailing, attempts: 10, maxAttempts: 10 }),
    { pending: false, abandoned: true },
    'a cleanup that never succeeds must not hold a sweep slot forever',
  );
  assert.deepEqual(finalizationEffectsState({ effects: { ...delivered, rewards: 'failed', privateCleanup: 'done' }, attempts: 10, maxAttempts: 10 }), { pending: false, abandoned: true });
  assert.deepEqual(finalizationEffectsState({ effects: { ...delivered, privateCleanup: 'done' }, attempts: 10, maxAttempts: 10 }), { pending: false, abandoned: false }, 'a settled match is complete, not abandoned');
  assert.deepEqual(finalizationEffectsState({ effects: { ...delivered, privateCleanup: 'pending' }, attempts: 1, maxAttempts: 10 }), { pending: true, abandoned: false });
  assert.equal(finalizationEffectSettled('notApplicable'), true);
  assert.equal(finalizationEffectSettled('failed'), false);
});

test('a standing reads outcomes from responses only, never from milestone receipts', () => {
  const standing = standingFromPlayer(player('solver', {
    'milestone:1:1': { serverConfirmed: true, receiptKind: 'productiveSpeedMilestone', roundIndex: 0, pointsAwarded: 30 },
    final: response(0, { isCorrect: true, pointsAwarded: 1_050 }),
  }, { answeredRounds: [0, 0, '0'], joinedAtRound: 0, score: 1_080 }));
  assert.deepEqual(standing.roundOutcomes.map((outcome) => [outcome.roundIndex, outcome.isCorrect]), [[0, true]]);
  assert.equal(standing.rawScore, 1_080, 'raw score is the receipt total, milestones included');
  assert.deepEqual(standing.answeredRounds, [0]);
  assert.equal(standing.joinedAtRound, 0);
  assert.ok(!('submissionReceipts' in standing), 'receipts stay private');
});

test('a match result ranks the players who played and keeps the ones who did not', () => {
  const result = buildMatchResult({
    roomId: 'room-9',
    room: { title: 'P3', teacherEmail: 't@x.edu', classId: 'c3', roundCount: 5, currentRound: 2, challengeMode: 'standard', scoringStrategyId: 'accuracyFirst', assignmentId: 'a1' },
    privateState: { questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'], scheduledRoundCount: 5, roundStandards: { 0: 'A.1' } },
    players: [
      player('b-second', {}, { score: 900, correctCount: 1 }),
      player('a-first', {}, { score: 2_000, correctCount: 2 }),
      player('z-absent', {}, { joined: false }),
      player('m-absent', {}, { joined: false }),
      player('c-tied', {}, { score: 900, correctCount: 1 }),
    ],
    status: 'finished',
    finalizedAtMs: 1_700_000_000_000,
    finalizationId: 'fin-1',
  });
  assert.deepEqual(result.standings.map((row) => [row.studentId, row.rank]), [
    ['a-first', 1], ['b-second', 2], ['c-tied', 2], ['m-absent', null], ['z-absent', null],
  ]);
  assert.equal(result.eligibleCount, 5);
  assert.equal(result.playedCount, 3);
  assert.equal(result.playedRoundCount, 3, 'three rounds were opened before the match ended');
  assert.equal(result.scheduledRoundCount, 5);
  assert.equal(result.roomRoundCount, 5);
  assert.deepEqual(result.questionIds, ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.equal(result.assignmentId, 'a1');
  assert.equal(result.finalizationId, 'fin-1');
  assert.equal(result.modeId, 'standard');
  assert.ok(result.standings.every((row) => !('participantId' in row) && !('liveScore' in row)), 'ranking scaffolding is not persisted');
  assert.equal(matchResultStanding(result, 'c-tied').rank, 2);
  assert.equal(matchResultStanding(result, 'nobody'), null);
});

test('a Grand Prix match result is ranked as a championship', () => {
  const result = buildMatchResult({
    roomId: 'gp',
    room: { scoringStrategyId: 'grandPrix', currentRound: 1, roundCount: 2 },
    players: [
      player('big-raw', {}, { score: 24, matchPoints: 24, roundWins: 0, rawScore: 2_100 }),
      player('two-wins', {}, { score: 30, matchPoints: 30, roundWins: 2, rawScore: 1_900 }),
    ],
    status: 'finished',
  });
  assert.equal(result.scoringStrategyId, 'grandPrix');
  assert.deepEqual(result.standings.map((row) => row.studentId), ['two-wins', 'big-raw']);
});
