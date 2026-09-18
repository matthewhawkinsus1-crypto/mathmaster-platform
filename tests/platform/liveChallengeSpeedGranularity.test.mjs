import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeSpeedTier } from '../../functions/shared/liveChallengeParity.mjs';
import { scoreChallengeRound } from '../../functions/shared/liveChallenge.mjs';

test('speed multiplier changes at one-second increments instead of broad score bands', () => {
  const totalMs = 45000;
  const at12 = challengeSpeedTier(12000, totalMs);
  const at13 = challengeSpeedTier(13000, totalMs);
  assert.equal(at12.tier, at13.tier, 'descriptive tier may remain the same');
  assert.notEqual(at12.multiplier, at13.multiplier, 'one-second difference changes the score multiplier');
  assert.ok(at12.multiplier > at13.multiplier);
});

test('one-second differences produce distinct correct-answer speed bonuses', () => {
  const totalMs = 45000;
  const fast = scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 12000, totalMs });
  const slower = scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 13000, totalMs });
  assert.ok(fast.speedBonus > slower.speedBonus);
  assert.notEqual(fast.pointsAwarded, slower.pointsAwarded);
});

test('speed bonus remains bounded from 100 to 0', () => {
  const totalMs = 45000;
  assert.equal(scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 0, totalMs }).speedBonus, 100);
  assert.equal(scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: totalMs, totalMs }).speedBonus, 0);
});

test('partial and incorrect responses still receive no speed bonus', () => {
  const totalMs = 45000;
  assert.equal(scoreChallengeRound({ gradeScore: .75, isCorrect: false, elapsedMs: 5000, totalMs }).speedBonus, 0);
});
