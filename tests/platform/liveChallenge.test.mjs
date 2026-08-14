import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalChallengeStandard, challengeAlias, normalizeRoundCount,
  normalizeRoundSeconds, publicLeaderboard, scoreChallengeRound,
} from '../../functions/shared/liveChallenge.mjs';

test('round settings are bounded', () => {
  assert.equal(normalizeRoundCount(1), 3);
  assert.equal(normalizeRoundCount(100), 20);
  assert.equal(normalizeRoundSeconds(5), 15);
  assert.equal(normalizeRoundSeconds(500), 120);
});

test('challenge standard is canonicalized', () => {
  assert.equal(canonicalChallengeStandard(' texas:a.2a '), 'A.2A');
  assert.equal(canonicalChallengeStandard('mixed'), 'mixed');
});

test('accuracy dominates speed', () => {
  const correctSlow = scoreChallengeRound({ gradeScore: 1, isCorrect: true, remainingMs: 0, totalMs: 45000, previousStreak: 0 });
  const partialFast = scoreChallengeRound({ gradeScore: 0.8, isCorrect: false, remainingMs: 45000, totalMs: 45000, previousStreak: 5 });
  assert.equal(correctSlow.pointsAwarded, 1000);
  assert.equal(partialFast.pointsAwarded, 800);
  assert.ok(correctSlow.pointsAwarded > partialFast.pointsAwarded);
});

test('streak and speed bonuses are capped', () => {
  const result = scoreChallengeRound({ gradeScore: 1, isCorrect: true, remainingMs: 999999, totalMs: 45000, previousStreak: 99 });
  assert.equal(result.speedBonus, 100);
  assert.equal(result.streakBonus, 100);
  assert.equal(result.pointsAwarded, 1200);
});

test('public leaderboard contains no student ids and ranks anonymous per-player docs', () => {
  const board = publicLeaderboard([
    { playerKey: 'player-a', alias: challengeAlias(0), joined: true, score: 900, correctCount: 1, roundsAnswered: 1, answeredRound: 0 },
    { playerKey: 'player-b', alias: challengeAlias(1), joined: true, score: 1100, correctCount: 1, roundsAnswered: 1, answeredRound: 0 },
    { playerKey: 'player-c', alias: challengeAlias(2), joined: false, score: 5000 },
  ]);
  assert.equal(board.length, 2);
  assert.equal(board[0].playerKey, 'player-b');
  assert.equal(board[0].score, 1100);
  assert.equal(board[0].rank, 1);
  assert.equal(board[0].answeredRound, 0);
  assert.equal(Object.hasOwn(board[0], 'studentId'), false);
});
