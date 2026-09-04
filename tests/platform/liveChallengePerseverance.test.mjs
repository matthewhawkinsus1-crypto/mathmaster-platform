import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMEBACK_BONUS,
  MAX_SECOND_CHANCE_ROUNDS,
  SECOND_CHANCE_CONFIRM_SHARE,
  SECOND_CHANCE_RECOVERY_SHARE,
  planSecondChanceRounds,
  scoreChallengeRound,
} from '../../functions/shared/liveChallenge.mjs';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const correct = (extra = {}) => scoreChallengeRound({
  gradeScore: 1, isCorrect: true, remainingMs: 0, ...extra,
});

test('every bonus used to be unreachable for the student having the hardest time', () => {
  // The starting point for both mechanics: speed pays only on a correct answer
  // and a streak only exists while you keep getting them right, so a student
  // missing four in a row scored the same whether they fought each one or typed
  // anything to make it stop.
  const missed = scoreChallengeRound({ gradeScore: 0, isCorrect: false, remainingMs: 40000 });
  assert.equal(missed.speedBonus, 0);
  assert.equal(missed.streakBonus, 0);
  assert.equal(missed.comebackBonus, 0);
  assert.equal(missed.pointsAwarded, 0);
});

test('getting one right straight after a miss pays a comeback', () => {
  const comeback = correct({ previousRoundMissed: true });
  assert.equal(comeback.comebackBonus, COMEBACK_BONUS);
  assert.equal(comeback.pointsAwarded, 1000 + COMEBACK_BONUS);
});

test('the comeback is worth more than the streak it replaces', () => {
  // Recovering is the harder thing and the scoring should say so. A streak
  // bonus caps at 100; the comeback pays 150.
  const streaking = correct({ previousStreak: 8 });
  assert.equal(streaking.streakBonus, 100);
  assert.ok(COMEBACK_BONUS > streaking.streakBonus);
});

test('a first round is not a comeback', () => {
  // previousStreak === 0 is also true of a player's very first question, which
  // is why the miss is passed explicitly. Paying a comeback bonus for turning
  // up would empty the word of meaning.
  assert.equal(correct({ previousStreak: 0 }).comebackBonus, 0);
  assert.equal(correct({ previousStreak: 0, previousRoundMissed: false }).comebackBonus, 0);
});

test('missing on purpose to farm comebacks is a losing trade', () => {
  // Two rounds played straight through against two rounds where the first is
  // thrown. The honest run must win, or the mechanic is an exploit.
  const honest = correct().pointsAwarded + correct({ previousStreak: 1 }).pointsAwarded;
  const thrown = scoreChallengeRound({ gradeScore: 0, isCorrect: false }).pointsAwarded
    + correct({ previousRoundMissed: true }).pointsAwarded;
  assert.ok(honest > thrown, `honest ${honest} must beat thrown ${thrown}`);
});

test('a wrong answer after a miss earns no comeback', () => {
  const stillWrong = scoreChallengeRound({ gradeScore: 0, isCorrect: false, previousRoundMissed: true });
  assert.equal(stillWrong.comebackBonus, 0);
  assert.equal(stillWrong.pointsAwarded, 0);
});

test('a replayed question gives most of its points back to whoever missed it', () => {
  const recovered = correct({ secondChance: true, missedOriginally: true });
  assert.equal(recovered.recoveryPoints, Math.round(1000 * SECOND_CHANCE_RECOVERY_SHARE));
  assert.equal(recovered.pointsAwarded, recovered.recoveryPoints);
  assert.equal(recovered.secondChance, true);
});

test('a student who was right the first time still outranks one who recovered', () => {
  // Otherwise the leaderboard stops meaning what it means, and being right
  // first time becomes worse than being wrong then right.
  const firstTime = correct().pointsAwarded + correct({ secondChance: true, missedOriginally: false }).pointsAwarded;
  const recovered = 0 + correct({ secondChance: true, missedOriginally: true }).pointsAwarded;
  assert.ok(firstTime > recovered, `${firstTime} must beat ${recovered}`);
  // And the recovery is still worth fighting for.
  assert.ok(recovered > 0);
  assert.ok(SECOND_CHANCE_RECOVERY_SHARE > SECOND_CHANCE_CONFIRM_SHARE);
});

test('a replay is not a race and does not move the streak', () => {
  // A bonus round should neither rescue a broken streak nor break an intact
  // one, and speed has no place in a round that exists to be learned from.
  const fast = correct({ secondChance: true, missedOriginally: true, remainingMs: 44000, totalMs: 45000, previousStreak: 3 });
  assert.equal(fast.speedBonus, 0);
  assert.equal(fast.newStreak, 3);

  const missedAgain = scoreChallengeRound({
    gradeScore: 0, isCorrect: false, secondChance: true, missedOriginally: true, previousStreak: 3,
  });
  assert.equal(missedAgain.newStreak, 3, 'a replay must not break a streak either');
  assert.equal(missedAgain.pointsAwarded, 0);
});

test('partial credit still scales a recovery', () => {
  const half = scoreChallengeRound({ gradeScore: 0.5, isCorrect: true, secondChance: true, missedOriginally: true });
  assert.equal(half.recoveryPoints, Math.round(1000 * 0.5 * SECOND_CHANCE_RECOVERY_SHARE));
});

test('the rounds that come back are the ones the room missed most', () => {
  const plan = planSecondChanceRounds({
    roundMisses: { 0: 2, 1: 9, 2: 0, 3: 9, 4: 5 },
    scheduledRoundCount: 5,
  });
  // Most missed first; a tie resolves by the order the class met them, so the
  // replay reads as a recap rather than an arbitrary shuffle.
  assert.deepEqual(plan, [1, 3, 4]);
});

test('a question nobody missed never comes back', () => {
  // A strong class finishes early rather than sitting through a recap of work
  // it already did.
  assert.deepEqual(planSecondChanceRounds({ roundMisses: {}, scheduledRoundCount: 10 }), []);
  assert.deepEqual(planSecondChanceRounds({ roundMisses: { 0: 0, 1: 0 }, scheduledRoundCount: 10 }), []);
});

test('the replay list is capped so the game still ends', () => {
  const plan = planSecondChanceRounds({
    roundMisses: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, 12 - i])),
    scheduledRoundCount: 12,
  });
  assert.equal(plan.length, MAX_SECOND_CHANCE_ROUNDS);
  assert.equal(planSecondChanceRounds({ roundMisses: { 0: 5 }, scheduledRoundCount: 5, limit: 99 }).length, 1);
});

test('a replay of a replay is never scheduled', () => {
  // Rounds appended after the scheduled set are out of range, so a game cannot
  // run on as long as students keep missing.
  const plan = planSecondChanceRounds({
    roundMisses: { 2: 4, 10: 9, 11: 9 },
    scheduledRoundCount: 10,
  });
  assert.deepEqual(plan, [2]);
});

test('malformed miss data produces no rounds rather than a broken game', () => {
  assert.deepEqual(planSecondChanceRounds({ roundMisses: { a: 3, '-1': 5 }, scheduledRoundCount: 5 }), []);
  assert.deepEqual(planSecondChanceRounds({ scheduledRoundCount: 0 }), []);
  assert.deepEqual(planSecondChanceRounds(), []);
});

test('the server passes the two facts the scorer cannot infer', () => {
  const source = codeOf('functions/index.js');
  assert.match(source, /previousRoundMissed: player\.lastAnswerCorrect === false/);
  assert.match(source, /lastAnswerCorrect: answeredCorrectly/);
  assert.match(source, /secondChance: isSecondChance/);
  assert.match(source, /missedOriginally/);
});

test('a replay is never added to a player own missed list', () => {
  // Otherwise one question could be queued twice and a student could be shown
  // the same recovery round repeatedly.
  const source = codeOf('functions/index.js');
  assert.match(source, /!answeredCorrectly && !isSecondChance\s*\?\s*\[\.\.\.new Set/);
});

test('miss counts never reach a document a student can read', () => {
  // A running miss count would tell a student how hard a question is before
  // they reach it. That was originally protected by keeping the counter on
  // private state; the counter is now gone entirely, derived from the private
  // per-player records instead. The property is unchanged and stricter: there
  // is no room-level tally to leak.
  const source = codeOf('functions/index.js');
  assert.doesNotMatch(source, /transaction\.set\(roomRef, \{[\s\S]{0,200}roundMisses/);
  assert.doesNotMatch(source, /roomRef[\s\S]{0,200}roundAnswers/);
  // The players it counts live under liveChallengePrivate, which no client reads.
  assert.match(source, /deriveRoundTallies\(\{[\s\S]{0,200}players/);
  assert.match(source, /secondChanceOf = privateState\?\.secondChanceOf/);
});

test('the replay set is planned once', () => {
  const source = codeOf('functions/index.js');
  assert.match(source, /privateState\.secondChancePlanned\s*\n?\s*\?\s*\[\]/);
  assert.match(source, /secondChancePlanned: true/);
  assert.match(source, /scheduledRoundCount: selected\.length/);
});

test('a bonus the student cannot see changes nothing about whether they try again', () => {
  const server = codeOf('functions/index.js');
  assert.match(server, /comebackBonus: finalScore\?\.comebackBonus \|\| 0/);
  assert.match(server, /recoveryPoints: finalScore\?\.recoveryPoints \|\| 0/);

  const student = codeOf('src/components/liveChallenge/LiveChallengeStudent.jsx');
  assert.match(student, /Comeback! You missed the last one and got this one/);
  assert.match(student, /Second chance — you got points back on this one/);
  // Speed and streak are not shown on a replay, because they were not paid.
  assert.match(student, /!result\.secondChance && \(result\.speedBonus > 0/);
});
