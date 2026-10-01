import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreChallengeRound } from '../../functions/shared/liveChallenge.mjs';
import { experienceScoreAdjustment } from '../../functions/shared/liveChallengeExperience.mjs';
import { rankEntries } from '../../functions/shared/liveChallengeRanking.mjs';
import {
  DEFAULT_SCORING_STRATEGY_ID,
  SCORE_ACCUMULATION,
  SCORING_STRATEGY_ID,
  ScoringStrategyError,
  accuracyFirstStrategy,
  correctCountStrategy,
  defineScoringStrategy,
  getScoringStrategy,
  grandPrixStrategy,
  leaderboardOptionsFor,
  listScoringStrategies,
  registerScoringStrategy,
  roomScoringStrategyId,
} from '../../functions/shared/liveChallengeScoring.mjs';

/*
 * A scoring strategy owns the arithmetic of one game and nothing else. These
 * tests hold three things: the existing game pays exactly what it paid before
 * the engine existed, the Grand Prix turns round performance into bounded
 * championship points, and a strategy is a contract a new game can implement.
 */

const ROUND_MS = 30_000;
const response = (overrides = {}) => ({
  gradeScore: 1, isCorrect: true, elapsedMs: 6_000, totalMs: ROUND_MS, previousStreak: 0, ...overrides,
});

test('Accuracy First at the mature 10% scale is exactly the mature scorer', () => {
  for (const input of [
    response(),
    response({ elapsedMs: 29_000 }),
    response({ previousStreak: 3 }),
    response({ previousRoundMissed: true }),
    response({ gradeScore: 0.5, isCorrect: false }),
    response({ secondChance: true, missedOriginally: true }),
    response({ secondChance: true, missedOriginally: false }),
  ]) {
    const legacy = scoreChallengeRound(input);
    const scored = accuracyFirstStrategy.scoreResponse({ ...input, speedInfluencePercent: 10 });
    for (const field of ['basePoints', 'speedBonus', 'streakBonus', 'comebackBonus', 'recoveryPoints', 'pointsAwarded', 'newStreak', 'secondChance', 'speedTier']) {
      assert.equal(scored[field], legacy[field], `${field} for ${JSON.stringify(input)}`);
    }
    assert.equal(scored.matchPointsDelta, scored.pointsAwarded, 'per-response: every point is a match point');
  }
});

test('native speed influence pays exactly what the retired post-hoc wrapper paid', () => {
  // The wrapper took the mature result and added experienceScoreAdjustment to
  // it. Scoring natively must be indistinguishable for every setting.
  for (const speedInfluencePercent of [0, 10, 20, 25, 35, 50]) {
    for (const elapsedMs of [500, 6_000, 15_000, 29_500]) {
      const input = response({ elapsedMs, previousStreak: 2 });
      const legacy = scoreChallengeRound(input);
      const wrapped = legacy.pointsAwarded + experienceScoreAdjustment({ originalSpeedBonus: legacy.speedBonus, speedInfluencePercent });
      const native = accuracyFirstStrategy.scoreResponse({ ...input, speedInfluencePercent });
      assert.equal(native.pointsAwarded, wrapped, `${speedInfluencePercent}% at ${elapsedMs}ms`);
      assert.equal(native.legacySpeedBonus, legacy.speedBonus, 'the mature-scale amount is kept for the record');
    }
  }
  assert.equal(accuracyFirstStrategy.scoreResponse(response({ speedInfluencePercent: 0 })).speedBonus, 0, 'Off pays no speed');
});

test('speed a Solver Race student already banked is never paid twice', () => {
  const unbanked = accuracyFirstStrategy.scoreResponse(response({ speedInfluencePercent: 10 }));
  const banked = accuracyFirstStrategy.scoreResponse(response({ speedInfluencePercent: 10, bankedLegacyMilestoneSpeed: 60 }));
  assert.equal(banked.legacySpeedBonus, unbanked.legacySpeedBonus - 60);
  const overBanked = accuracyFirstStrategy.scoreResponse(response({ speedInfluencePercent: 10, bankedLegacyMilestoneSpeed: 10_000 }));
  assert.equal(overBanked.speedBonus, 0, 'never negative');
  assert.equal(overBanked.pointsAwarded, unbanked.pointsAwarded - unbanked.speedBonus);
});

test('Grand Prix scores round performance only, carrying no bonus between rounds', () => {
  const fresh = grandPrixStrategy.scoreResponse(response({ speedInfluencePercent: 20 }));
  const onStreak = grandPrixStrategy.scoreResponse(response({ speedInfluencePercent: 20, previousStreak: 6, previousRoundMissed: true }));
  assert.equal(onStreak.pointsAwarded, fresh.pointsAwarded, 'a streak or comeback cannot carry an advantage into the next round');
  assert.equal(onStreak.streakBonus, 0);
  assert.equal(onStreak.comebackBonus, 0);
  assert.equal(onStreak.newStreak, 7, 'the streak is still tracked for the record');
  assert.equal(fresh.pointsAwarded, fresh.basePoints + fresh.speedBonus);
  assert.equal(fresh.matchPointsDelta, 0, 'match points arrive only from placement');
  const wrong = grandPrixStrategy.scoreResponse(response({ isCorrect: false, gradeScore: 0, previousStreak: 4 }));
  assert.equal(wrong.pointsAwarded, 0);
  assert.equal(wrong.newStreak, 0);
});

test('Grand Prix turns a round rank into bounded placement points', () => {
  const points = (rank, performance = 900, participated = true, config) => grandPrixStrategy.matchPointsForPlacement({ rank, participated, performance }, config);
  assert.deepEqual([1, 2, 3, 12].map((rank) => points(rank)), [15, 12, 10, 1]);
  assert.equal(points(30), 1, 'real work beyond the table still scores');
  assert.equal(points(4, 0), 0, 'no credit at all earns no placement, however few got it right');
  assert.equal(points(1, 900, false), 0, 'a player who did not take part earns nothing');
  // Teacher-configured tables are validated, not trusted.
  assert.equal(points(2, 900, true, { placementPoints: [10, 5] }), 5);
  assert.equal(points(1, 900, true, { placementPoints: [1, 5] }), 15, 'an increasing table falls back to the default');
  assert.equal(points(3, 900, true, { placementPoints: [10, 5], beyondTablePoints: 0 }), 0);
  assert.deepEqual(grandPrixStrategy.normalizeConfig({ beyondTablePoints: -3, zeroPerformancePoints: 99 }), {
    placementPoints: [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], beyondTablePoints: 1, zeroPerformancePoints: 0,
  });
});

test('a championship is ranked by match points, then round wins, then raw score', () => {
  const standings = rankEntries([
    { participantId: 'steady', matchPoints: 45, roundWins: 0, rawScore: 4_000 },
    { participantId: 'winner', matchPoints: 45, roundWins: 2, rawScore: 3_100 },
    { participantId: 'blowout', matchPoints: 40, roundWins: 1, rawScore: 9_999 },
    { participantId: 'twin', matchPoints: 45, roundWins: 0, rawScore: 4_000 },
  ], grandPrixStrategy.matchRanking);
  assert.deepEqual(standings.map((row) => [row.participantId, row.rank]), [
    ['winner', 1], ['steady', 2], ['twin', 2], ['blowout', 4],
  ]);
});

test('Correct Count pays one point per fully correct response and nothing else', () => {
  assert.equal(correctCountStrategy.scoreResponse(response()).pointsAwarded, 1);
  assert.equal(correctCountStrategy.scoreResponse(response({ isCorrect: false, gradeScore: 0.9 })).pointsAwarded, 0);
  const streak = correctCountStrategy.scoreResponse(response({ previousStreak: 4, speedInfluencePercent: 50 }));
  assert.equal(streak.speedBonus + streak.streakBonus + streak.comebackBonus, 0);
  assert.equal(streak.newStreak, 5);
  assert.equal(correctCountStrategy.scoreResponse(response({ secondChance: true, previousStreak: 4 })).newStreak, 4);
});

test('the registry resolves a room to its strategy, defaulting older rooms', () => {
  assert.equal(DEFAULT_SCORING_STRATEGY_ID, SCORING_STRATEGY_ID.ACCURACY_FIRST);
  assert.equal(getScoringStrategy('grandPrix'), grandPrixStrategy);
  assert.equal(getScoringStrategy(undefined), accuracyFirstStrategy);
  assert.equal(getScoringStrategy('no-such-strategy'), accuracyFirstStrategy);
  assert.equal(roomScoringStrategyId({}), 'accuracyFirst', 'a room created before strategies existed');
  assert.equal(roomScoringStrategyId({ scoringStrategyId: 'grandPrix' }), 'grandPrix');
  assert.equal(roomScoringStrategyId({ scoringStrategyId: 'bogus' }), 'accuracyFirst');
  assert.deepEqual(listScoringStrategies().map((strategy) => strategy.id).slice(0, 3), ['accuracyFirst', 'grandPrix', 'correctCount']);
});

test('a leaderboard shows work in progress only for per-response scoring', () => {
  assert.equal(leaderboardOptionsFor('accuracyFirst').includeProvisional, true);
  assert.equal(leaderboardOptionsFor('grandPrix').includeProvisional, false);
  assert.equal(leaderboardOptionsFor(grandPrixStrategy).ranking, grandPrixStrategy.matchRanking);
  assert.equal(leaderboardOptionsFor(null).ranking, accuracyFirstStrategy.matchRanking);
});

test('a new strategy is a validated contract, and ids are permanent', () => {
  const valid = {
    id: 'exactlyRight',
    accumulation: SCORE_ACCUMULATION.PER_RESPONSE,
    normalizeConfig: () => ({}),
    scoreResponse: () => ({ pointsAwarded: 0 }),
    matchPointsForPlacement: () => 0,
    matchRanking: { metrics: [{ key: 'liveScore', direction: 'desc' }] },
  };
  assert.throws(() => defineScoringStrategy({ ...valid, id: 'Bad Id' }), ScoringStrategyError);
  assert.throws(() => defineScoringStrategy({ ...valid, accumulation: 'sometimes' }), /accumulation/);
  assert.throws(() => defineScoringStrategy({ ...valid, scoreResponse: undefined }), /scoreResponse/);
  assert.throws(() => defineScoringStrategy({ ...valid, matchRanking: { metrics: [] } }), /metric/);
  const registered = registerScoringStrategy(valid);
  assert.equal(getScoringStrategy('exactlyRight'), registered);
  assert.ok(Object.isFrozen(registered));
  assert.throws(() => registerScoringStrategy(valid), /already registered/);
  assert.throws(() => registerScoringStrategy({ ...valid, id: 'grandPrix' }), /already registered/, 'a shipped strategy can never be replaced');
});
