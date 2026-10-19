// Recognition beyond the podium (functions/shared/liveChallengeRecognitions.mjs)
// and the rewards they earn (liveChallengeRewardRules.evaluateMatchAwards).
//
// WHY. A podium celebrates three students. These recognitions are how the rest
// of the class is seen — growth, steadiness, a comeback, a fast right answer,
// the class keeping going together. Each case below pins one promise: who
// qualifies, that ties share, that the podium yields to someone equally good
// off it, that a late joiner is measured from arrival, that nothing written
// names a student, and that the rewards stay within the per-match cap.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_IMPROVEMENT_ROUNDS,
  RECOGNITION_ID,
  improvementOf,
  matchRecognitions,
  publicRecognitions,
  recognitionsForPlayer,
} from '../../functions/shared/liveChallengeRecognitions.mjs';
import {
  DEFAULT_LIVE_CHALLENGE_REWARD_POLICY,
  MAX_CLASS_POINTS_PER_MATCH,
  PERSONAL_BEST_RULE_ID,
  RewardPolicyError,
  capMatchClassPoints,
  evaluateMatchAwards,
  normalizeRewardPolicy,
  publicRewardSummary,
  recognitionBadgeRuleId,
  recognitionRuleId,
} from '../../functions/shared/liveChallengeRewardRules.mjs';
import { planLiveChallengeAwards } from '../../functions/shared/liveChallengeClassPoints.mjs';

const outcome = (roundIndex, isCorrect, { elapsedMs = 5_000, secondChance = false } = {}) => ({
  roundIndex, isCorrect, scorePercent: isCorrect ? 100 : 0, secondChance, elapsedMs,
});
const rounds = (pattern, options = {}) => pattern.split('').map((mark, index) => (
  mark === '.' ? null : outcome(index + (options.offset || 0), mark === '1', options)
)).filter(Boolean);

const player = (id, { rank = null, pattern = '', joinedAtRound = 0, bestStreak = 0, comebackCount = 0, recoveryCount = 0, outcomes = null, joined = true } = {}) => {
  const roundOutcomes = outcomes || rounds(pattern);
  return {
    studentId: `student-${id}`,
    playerKey: `key-${id}`,
    alias: `Alias ${id}`,
    joined,
    joinedAtRound,
    rank,
    tied: false,
    score: 0,
    correctCount: roundOutcomes.filter((entry) => entry.isCorrect).length,
    roundsAnswered: roundOutcomes.length,
    answeredRounds: roundOutcomes.map((entry) => entry.roundIndex),
    missedRounds: [],
    bestStreak,
    comebackCount,
    recoveryCount,
    roundOutcomes,
  };
};
const match = (standings, { scheduled = 6, played = scheduled, status = 'finished', modeId = null, secondChanceOf = {} } = {}) => ({
  roomId: 'room-recognitions',
  status,
  modeId,
  scheduledRoundCount: scheduled,
  playedRoundCount: played,
  secondChanceOf,
  standings,
});
const byId = (recognitions) => Object.fromEntries(recognitions.map((entry) => [entry.id, entry]));
const keysOf = (recognitions, id) => byId(recognitions)[id]?.playerKeys || [];

test('most improved: the biggest real rise from the first half to the second', () => {
  const result = match([
    player('climber', { rank: 4, pattern: '000111' }), // 0/3 -> 3/3
    player('steady', { rank: 1, pattern: '111111' }),
    player('wobble', { rank: 5, pattern: '010011' }), // 1/3 -> 2/3: a rise, but smaller
  ]);
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.MOST_IMPROVED), ['key-climber']);
  assert.equal(improvementOf(result.standings[0], 6), 1);
});

test('most improved needs enough rounds and a real rise', () => {
  // Three rounds is too few to have halves worth comparing.
  const short = match([player('a', { rank: 2, pattern: '011' })], { scheduled: 3 });
  assert.equal(improvementOf(short.standings[0], 3), null);
  assert.equal(keysOf(matchRecognitions(short), RECOGNITION_ID.MOST_IMPROVED).length, 0);
  // No rise: no recognition, even though someone is "best".
  const flat = match([player('a', { rank: 4, pattern: '101010' }), player('b', { rank: 5, pattern: '000000' })]);
  assert.equal(keysOf(matchRecognitions(flat), RECOGNITION_ID.MOST_IMPROVED).length, 0);
  // A fall is not improvement.
  const fall = match([player('a', { rank: 4, pattern: '111000' })]);
  assert.equal(keysOf(matchRecognitions(fall), RECOGNITION_ID.MOST_IMPROVED).length, 0);
  assert.equal(MIN_IMPROVEMENT_ROUNDS, 4);
});

test('a late joiner is measured over the rounds they were there for', () => {
  // Joined at round 2 of 6: halves are rounds 2-3 and 4-5. Rounds before are
  // not "wrong", they were absent.
  const late = player('late', { rank: 4, joinedAtRound: 2, outcomes: [outcome(2, false), outcome(3, false), outcome(4, true), outcome(5, true)] });
  const result = match([late, player('early', { rank: 1, pattern: '011111' })]);
  assert.equal(improvementOf(late, 6), 1);
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.MOST_IMPROVED), ['key-late']);
  // Steadiest counts the late joiner's own four rounds: all answered.
  const steady = match([player('late', { rank: 4, joinedAtRound: 2, bestStreak: 2, outcomes: late.roundOutcomes })]);
  assert.deepEqual(keysOf(matchRecognitions(steady), RECOGNITION_ID.STEADIEST), ['key-late']);
});

test('absent players are never recognised, and a cancelled match recognises nobody', () => {
  const absent = player('absent', { joined: false, pattern: '001111', bestStreak: 4, comebackCount: 3 });
  const recognitions = matchRecognitions(match([absent, player('here', { rank: 1, pattern: '111111', bestStreak: 6 })]));
  assert.ok(recognitions.every((entry) => !entry.playerKeys.includes('key-absent')));
  assert.deepEqual(matchRecognitions(match([player('a', { rank: 4, pattern: '001111' })], { status: 'cancelled' })), []);
});

test('steadiest: answered every round available (at least three), longest streak; ties share', () => {
  const result = match([
    player('a', { rank: 4, pattern: '111011', bestStreak: 3 }),
    player('b', { rank: 5, pattern: '110111', bestStreak: 3 }),
    player('c', { rank: 6, pattern: '11111.', bestStreak: 5 }), // skipped a round: not steadiest
  ]);
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.STEADIEST), ['key-a', 'key-b']);
});

test('steadiest needs at least one right answer: the copy promises a run of right answers', () => {
  // Answered every round, all wrong: the only player who answered every round,
  // yet "kept a run of right answers going" would be false.
  const result = match([
    player('a', { rank: 1, pattern: '0000', bestStreak: 0 }),
    player('b', { rank: 2, pattern: '1...', bestStreak: 1 }),
  ], { scheduled: 4 });
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.STEADIEST), []);
  // One right answer is a run of one: they qualify.
  const one = match([player('a', { rank: 1, pattern: '0100', bestStreak: 1 })], { scheduled: 4 });
  assert.deepEqual(keysOf(matchRecognitions(one), RECOGNITION_ID.STEADIEST), ['key-a']);
});

test('beyond the podium: an equally good player off the podium takes it', () => {
  const result = match([
    player('first', { rank: 1, pattern: '111111', bestStreak: 6, comebackCount: 1 }),
    player('ninth', { rank: 9, pattern: '000000', bestStreak: 0, comebackCount: 1 }),
  ]);
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.BEST_COMEBACK), ['key-ninth'], 'tied at one comeback: off the podium wins');
  // But a podium player who is strictly better keeps it.
  const better = match([
    player('first', { rank: 1, pattern: '111111', comebackCount: 2 }),
    player('ninth', { rank: 9, pattern: '000000', comebackCount: 1 }),
  ]);
  assert.deepEqual(keysOf(matchRecognitions(better), RECOGNITION_ID.BEST_COMEBACK), ['key-first']);
  // And two podium players tied share it when nobody off the podium matches.
  const podiumTie = match([
    player('first', { rank: 1, pattern: '111111', comebackCount: 2 }),
    player('second', { rank: 2, pattern: '111111', comebackCount: 2 }),
  ]);
  assert.deepEqual(keysOf(matchRecognitions(podiumTie), RECOGNITION_ID.BEST_COMEBACK), ['key-first', 'key-second']);
});

test('best comeback counts second-chance recoveries too', () => {
  const result = match([
    player('recovers', { rank: 5, pattern: '000000', recoveryCount: 2 }),
    player('comeback', { rank: 4, pattern: '000000', comebackCount: 1 }),
  ]);
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.BEST_COMEBACK), ['key-recovers']);
  const none = match([player('a', { rank: 4, pattern: '111111' })]);
  assert.equal(keysOf(matchRecognitions(none), RECOGNITION_ID.BEST_COMEBACK).length, 0, 'nobody came back: no recognition');
});

test('first to answer: fastest CORRECT first answer, never a fast wrong one or a replay', () => {
  const quickWrong = player('quick', { rank: 6, outcomes: [outcome(0, false, { elapsedMs: 500 }), outcome(1, false, { elapsedMs: 400 })] });
  const slowRight = player('slow', { rank: 5, outcomes: [outcome(0, true, { elapsedMs: 9_000 }), outcome(1, false, { elapsedMs: 8_000 })] });
  // Fastest in both replays: a replay is a second look, not a race to be first in.
  const replayAce = player('replay', {
    rank: 7,
    outcomes: [
      outcome(0, true, { elapsedMs: 10_000 }),
      outcome(2, true, { elapsedMs: 100, secondChance: true }),
      outcome(3, true, { elapsedMs: 100, secondChance: true }),
    ],
  });
  const result = match([quickWrong, slowRight, replayAce], { scheduled: 2, played: 4, secondChanceOf: { 2: 0, 3: 1 } });
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.FIRST_TO_ANSWER), ['key-slow']);
});

test('first to answer is not given where every player has their own questions', () => {
  const result = match([player('a', { rank: 1, pattern: '11' })], { scheduled: 2, modeId: 'graphFeatureRush' });
  assert.equal(keysOf(matchRecognitions(result), RECOGNITION_ID.FIRST_TO_ANSWER).length, 0);
  const shared = match([player('a', { rank: 1, pattern: '11' })], { scheduled: 2 });
  assert.deepEqual(keysOf(matchRecognitions(shared), RECOGNITION_ID.FIRST_TO_ANSWER), ['key-a'], 'the same player in a shared-question mode');
});

test('team effort: when the class kept going, everyone who answered earns it', () => {
  const kept = ['a', 'b', 'c', 'd'].map((id, index) => player(id, { rank: index + 1, pattern: '11110' })); // 4/5 = 80%
  const quiet = player('e', { rank: 5, pattern: '1....' }); // answered one round
  const result = matchRecognitions(match([...kept, quiet], { scheduled: 5 }));
  const team = byId(result)[RECOGNITION_ID.TEAM_EFFORT];
  assert.ok(team, '4 of 5 players (80%) answered at least 80%');
  assert.equal(team.classWide, true);
  assert.deepEqual(team.playerKeys, ['key-a', 'key-b', 'key-c', 'key-d', 'key-e'], 'the student who answered one round is part of the class too');

  const silent = player('f', { rank: 6, outcomes: [] });
  const withSilent = byId(matchRecognitions(match([...kept, player('e', { rank: 5, pattern: '11110' }), silent], { scheduled: 5 })))[RECOGNITION_ID.TEAM_EFFORT];
  assert.ok(!withSilent.playerKeys.includes('key-f'), 'a player who answered nothing does not earn it');

  const tooFew = matchRecognitions(match([...kept.slice(0, 3), player('x', { pattern: '1....' }), player('y', { pattern: '1....' })], { scheduled: 5 }));
  assert.equal(byId(tooFew)[RECOGNITION_ID.TEAM_EFFORT], undefined, '3 of 5 is not the class keeping going');
});

test('a game ended early measures everyone against the rounds that were played', () => {
  // Ten scheduled, three played: answering all three is every round.
  const result = match([player('a', { rank: 1, pattern: '111', bestStreak: 3 })], { scheduled: 10, played: 3 });
  assert.deepEqual(keysOf(matchRecognitions(result), RECOGNITION_ID.STEADIEST), ['key-a']);
  assert.ok(byId(matchRecognitions(result))[RECOGNITION_ID.TEAM_EFFORT]);
});

test('what a room shows names game aliases and keys — never a student id — and is deterministic', () => {
  const standings = [
    player('climber', { rank: 4, pattern: '001111', comebackCount: 1, bestStreak: 4 }),
    player('ace', { rank: 1, pattern: '111111', bestStreak: 6 }),
  ];
  const once = publicRecognitions(matchRecognitions(match(standings)));
  const again = publicRecognitions(matchRecognitions(match([...standings].reverse())));
  assert.deepEqual(once, again, 'input order changes nothing');
  assert.ok(once.length >= 3);
  const text = JSON.stringify(once);
  assert.equal(/student-/.test(text), false, 'no student id');
  once.forEach((entry) => assert.deepEqual(Object.keys(entry).sort(), ['aliases', 'classWide', 'detail', 'id', 'label', 'playerKeys']));
  // The student who earned one reads it in their own words.
  const mine = recognitionsForPlayer(once, 'key-climber');
  assert.ok(mine.some((entry) => entry.id === RECOGNITION_ID.MOST_IMPROVED && /your second half beat your first/i.test(entry.detail)));
  assert.deepEqual(recognitionsForPlayer(once, 'key-nobody'), []);
});

/* ------------------------------ rewards ------------------------------ */

const withRecognitions = (result) => ({ ...result, recognitions: publicRecognitions(matchRecognitions(result)) });

test('each individual recognition earns 3 Class Points and a badge; team effort 2 and no badge', () => {
  const result = withRecognitions(match([
    player('climber', { rank: 4, pattern: '001111' }),
    player('ace', { rank: 1, pattern: '111111', bestStreak: 6 }),
  ]));
  const awards = evaluateMatchAwards({ matchResult: result, policy: { rules: [] } });
  const climber = awards.filter((award) => award.studentId === 'student-climber');
  const points = climber.find((award) => award.ruleId === recognitionRuleId(RECOGNITION_ID.MOST_IMPROVED));
  assert.equal(points.reward.kind, 'classPoints');
  assert.equal(points.reward.amount, 3);
  const badge = climber.find((award) => award.ruleId === recognitionBadgeRuleId(RECOGNITION_ID.MOST_IMPROVED));
  assert.equal(badge.reward.rewardCode, 'badge');
  assert.equal(badge.reward.badgeCode, 'lc-mostImproved');
  assert.equal(badge.reward.label, 'Most improved');
  const team = climber.find((award) => award.ruleId === recognitionRuleId(RECOGNITION_ID.TEAM_EFFORT));
  assert.equal(team.reward.amount, 2);
  assert.equal(climber.some((award) => award.ruleId === recognitionBadgeRuleId(RECOGNITION_ID.TEAM_EFFORT)), false);
});

test('a result finished before recognitions earns exactly what it always did', () => {
  const old = match([player('climber', { rank: 4, pattern: '001111' })]);
  assert.equal('recognitions' in old, false);
  const awards = evaluateMatchAwards({ matchResult: old, personalBestStudentIds: ['student-climber'] });
  assert.ok(awards.every((award) => !award.ruleId.startsWith('recognition.') && award.ruleId !== PERSONAL_BEST_RULE_ID));
});

test('a policy can turn recognitions off; personal bests are still rewarded', () => {
  const result = withRecognitions(match([player('climber', { rank: 4, pattern: '001111' })]));
  const policy = normalizeRewardPolicy({ rules: [], recognitions: false });
  assert.equal(policy.recognitions, false, 'kept through normalisation');
  assert.equal(normalizeRewardPolicy({ rules: [] }).recognitions, true, 'on by default');
  assert.equal(DEFAULT_LIVE_CHALLENGE_REWARD_POLICY.recognitions, true);
  assert.equal(publicRewardSummary(policy).recognitions, false);
  const awards = evaluateMatchAwards({ matchResult: result, policy, personalBestStudentIds: ['student-climber'] });
  assert.equal(awards.some((award) => award.ruleId.startsWith('recognition.')), false);
  assert.deepEqual(awards.map((award) => award.ruleId), [PERSONAL_BEST_RULE_ID]);
  assert.throws(() => normalizeRewardPolicy({ rules: [], recognitions: 'no' }), RewardPolicyError);
});

test('a teacher rule can never take a recognition or personal-best rule id', () => {
  const rule = (ruleId) => ({ ruleId, criterion: { kind: 'comeback' }, reward: { kind: 'classPoints', amount: 1 } });
  assert.throws(() => normalizeRewardPolicy({ rules: [rule('recognition.mostImproved')] }), RewardPolicyError);
  assert.throws(() => normalizeRewardPolicy({ rules: [rule('personalBest')] }), RewardPolicyError);
  assert.doesNotThrow(() => normalizeRewardPolicy({ rules: [rule('recognitionNight')] }));
});

test('one student never gets more than the per-match Class Points cap; the extras dropped are always the same', () => {
  // A policy at the cap already, then every recognition and a personal best.
  const policy = normalizeRewardPolicy({
    rules: [
      { ruleId: 'bigA', criterion: { kind: 'participation', minRatio: 0.5, minAvailableRounds: 1 }, reward: { kind: 'classPoints', amount: 10 } },
      { ruleId: 'bigB', criterion: { kind: 'accuracy', minRatio: 0.1, minAnswered: 1 }, reward: { kind: 'classPoints', amount: 8 } },
    ],
  });
  const result = withRecognitions(match([
    player('climber', { rank: 4, pattern: '001111', comebackCount: 2, bestStreak: 4 }),
    player('ace', { rank: 1, pattern: '111111', bestStreak: 6 }),
  ]));
  const awards = evaluateMatchAwards({ matchResult: result, policy, personalBestStudentIds: ['student-climber'] });
  const pointsFor = (studentId) => awards
    .filter((award) => award.studentId === studentId && award.reward.kind === 'classPoints')
    .reduce((sum, award) => sum + award.reward.amount, 0);
  assert.ok(pointsFor('student-climber') <= MAX_CLASS_POINTS_PER_MATCH);
  assert.ok(pointsFor('student-ace') <= MAX_CLASS_POINTS_PER_MATCH);
  assert.equal(pointsFor('student-climber'), 20, '10 + 8 + 2 (team effort fits; a 3 would not)');
  const climberRules = awards.filter((award) => award.studentId === 'student-climber').map((award) => award.ruleId);
  assert.ok(climberRules.includes('bigA') && climberRules.includes('bigB'), 'policy awards come first and are never dropped');
  assert.ok(climberRules.includes(recognitionBadgeRuleId(RECOGNITION_ID.MOST_IMPROVED)), 'a badge is not Class Points: kept');
  assert.equal(climberRules.includes(PERSONAL_BEST_RULE_ID), false, 'the personal best did not fit');
  // Deterministic: the same inputs drop the same awards.
  assert.deepEqual(evaluateMatchAwards({ matchResult: result, policy, personalBestStudentIds: ['student-climber'] }).map((award) => award.identity), awards.map((award) => award.identity));
  // The cap itself.
  const many = Array.from({ length: 8 }, (_, index) => ({ studentId: 's', ruleId: `r${index}`, reward: { kind: 'classPoints', amount: 3 } }));
  assert.deepEqual(capMatchClassPoints(many).map((award) => award.ruleId), ['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
});

test('the delivery plan gives recognition awards their own ledger and grant ids', () => {
  const result = { ...withRecognitions(match([player('climber', { rank: 4, pattern: '001111' })])), classId: 'class-1' };
  const plan = planLiveChallengeAwards({ matchResult: result, personalBestStudentIds: ['student-climber'] });
  const ids = plan.map((award) => award.id);
  assert.equal(new Set(ids).size, ids.length, 'every award has its own document');
  const badge = plan.find((award) => award.ruleId === recognitionBadgeRuleId(RECOGNITION_ID.MOST_IMPROVED));
  assert.equal(badge.rewardKind, 'grant');
  assert.equal(badge.badgeCode, 'lc-mostImproved');
  assert.match(badge.id, /^lcg_/);
  const best = plan.find((award) => award.ruleId === PERSONAL_BEST_RULE_ID);
  assert.equal(best.amount, 3);
  assert.match(best.id, /^lca_/);
  // A personal best is only for a joined student.
  const stranger = planLiveChallengeAwards({ matchResult: result, personalBestStudentIds: ['student-elsewhere'] });
  assert.equal(stranger.some((award) => award.ruleId === PERSONAL_BEST_RULE_ID), false);
});
