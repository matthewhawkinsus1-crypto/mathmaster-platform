// DECISIONS THE OWNER CONFIRMED, WRITTEN OUT (LC22, finding A1-31, 2026-10-25).
//
// Three calls were made conservatively in the student push and left open:
//   - a passed retest pays 20 Class Points, which is the ledger's single-award
//     ceiling, and the other growth amounts are the ones the push set;
//   - turning recognitions off leaves personal bests on;
//   - a game round is extended at most 2x, whatever a plan grants.
// The owner chose to keep all three as built. Each is a number or a switch that
// reads like a tidy-up to change, so each is pinned here as a literal, not
// against the constant it stands for: changing one fails here, where the
// decision is written down, instead of passing quietly.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GROWTH_REWARD_AMOUNTS, GROWTH_RULE_IDS } from '../../functions/shared/growthRewardRules.mjs';
import { MAX_AWARD_AMOUNT } from '../../functions/shared/classPoints.mjs';
import {
  MAX_GAME_TIME_MULTIPLIER,
  gameTimeMultiplierFor,
  personalRoundTimer,
  storedTimeMultiplier,
} from '../../functions/shared/liveChallengeAccommodations.mjs';
import {
  PERSONAL_BEST_RULE_ID,
  evaluateMatchAwards,
  normalizeRewardPolicy,
  recognitionsEnabled,
} from '../../functions/shared/liveChallengeRewardRules.mjs';
import { matchRecognitions, publicRecognitions } from '../../functions/shared/liveChallengeRecognitions.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { readFileSync } from 'node:fs';

test('growth rewards pay what the push set, and a passed retest pays the ledger\'s whole 20', () => {
  assert.deepEqual({ ...GROWTH_REWARD_AMOUNTS }, {
    retestImproved: 15,
    retestPassed: 20,
    correctionsCompleted: 10,
    weeklyPathGoal: 10,
    weeklyPathStreak: 15,
    masterySkill: 5,
  });
  // The ledger's single-award ceiling, which a larger amount would be cut to:
  // so 20 is what is paid, never a figure the ledger quietly trims.
  assert.equal(MAX_AWARD_AMOUNT, 20);
  assert.equal(GROWTH_REWARD_AMOUNTS.retestPassed, MAX_AWARD_AMOUNT);
  // Every growth rule has an amount, and none is above that ceiling.
  Object.entries(GROWTH_REWARD_AMOUNTS).forEach(([ruleId, amount]) => {
    assert.ok(Object.values(GROWTH_RULE_IDS).includes(ruleId), `${ruleId} is a growth rule`);
    assert.ok(Number.isInteger(amount) && amount > 0 && amount <= 20, `${ruleId}: ${amount}`);
  });
});

test('a plan that grants more than 2x plays a game round at 2x; 1.5x and 2x are kept whole', () => {
  assert.equal(MAX_GAME_TIME_MULTIPLIER, 2);
  const plan = (extendedTimeMultiplier) => ({ accommodations: { extendedTimeMultiplier }, programEligibility: {} });
  assert.equal(gameTimeMultiplierFor(plan(3)), 2, '3x on the plan is 2x in a game');
  assert.equal(gameTimeMultiplierFor(plan(2.5)), 2);
  assert.equal(gameTimeMultiplierFor(plan(2)), 2);
  assert.equal(gameTimeMultiplierFor(plan(1.5)), 1.5);
  assert.equal(gameTimeMultiplierFor(plan(1.25)), 1.25);
  assert.equal(storedTimeMultiplier(4), 2, 'a stored multiplier is capped on the way in too');
  // The clock a 30-second round gives such a student: their own deadline, 60 s
  // after the start for 3x on the plan, 45 s for 1.5x.
  const timer = { startsAtMs: 10_000, endsAtMs: 40_000 };
  assert.equal(personalRoundTimer(timer, 3, { fullDurationMs: 30_000 }).endsAtMs, 70_000);
  assert.equal(personalRoundTimer(timer, 1.5, { fullDurationMs: 30_000 }).endsAtMs, 55_000);
});

test('turning recognitions off turns off recognition awards and the podium\'s recognitions, never a personal best', () => {
  const standing = (studentId, playerKey, fields = {}) => ({
    studentId, playerKey, alias: `Player ${playerKey}`, joined: true, rank: 4, tied: false, score: 900, correctCount: 4, roundsAnswered: 6,
    answeredRounds: [0, 1, 2, 3, 4, 5], bestStreak: 4, comebackCount: 2, joinedAtRound: 0,
    roundOutcomes: [false, false, true, true, true, true].map((isCorrect, roundIndex) => ({ roundIndex, isCorrect, scorePercent: isCorrect ? 100 : 0, secondChance: false, elapsedMs: 5_000 })),
    ...fields,
  });
  const matchResult = {
    roomId: 'room-1', status: 'finished', scoringStrategyId: 'accuracyFirst', modeId: 'standard', playedRoundCount: 6, roomRoundCount: 6, scheduledRoundCount: 6,
    standings: [standing('s1', 'k1'), standing('s2', 'k2', { rank: 1, bestStreak: 6, comebackCount: 0, correctCount: 6, roundOutcomes: Array.from({ length: 6 }, (_, roundIndex) => ({ roundIndex, isCorrect: true, scorePercent: 100, secondChance: false, elapsedMs: 4_000 })) })],
  };
  matchResult.recognitions = publicRecognitions(matchRecognitions(matchResult));
  const on = normalizeRewardPolicy({ rules: [] });
  const off = normalizeRewardPolicy({ rules: [], recognitions: false });
  assert.equal(recognitionsEnabled(on), true, 'on unless a policy says otherwise');
  assert.equal(recognitionsEnabled(off), false);
  const ruleIds = (policy) => evaluateMatchAwards({ matchResult, policy, personalBestStudentIds: ['s1'] }).map((award) => award.ruleId);
  assert.ok(ruleIds(on).some((ruleId) => ruleId.startsWith('recognition.')), 'recognitions are earned while they are on');
  const withoutRecognitions = ruleIds(off);
  assert.equal(withoutRecognitions.some((ruleId) => ruleId.startsWith('recognition.')), false);
  assert.ok(withoutRecognitions.includes(PERSONAL_BEST_RULE_ID), 'the personal best is still rewarded');
});

test('the same switch is what keeps recognitions off the finished room, so the podium names none', () => {
  const server = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const finalization = region(server, 'function applyLiveChallengeMatchFinalization(', '\n}\n', 'the finalizing transaction');
  assert.match(finalization, /const recognitions = finished && engine\.rewardRules\.recognitionsEnabled\(engine\.rewardRules\.storedRewardPolicy\(privateState\.rewardPolicy \|\| null\)\)\s*\? engine\.recognitions\.publicRecognitions\(engine\.recognitions\.matchRecognitions\(matchResult\)\)\s*: \[\];/);
  // …and the room shows only what that list holds.
  assert.match(finalization, /\.\.\.\(finished \? \{ recognitions: engine\.recognitions\.classVisibleRecognitions\(recognitions,/);
});
