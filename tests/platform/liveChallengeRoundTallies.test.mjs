import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deriveRoundTallies, planSecondChanceRounds } from '../../functions/shared/liveChallenge.mjs';

const code = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const player = (answeredRounds, missedRounds = []) => ({ answeredRounds, missedRounds });

/* ---------- the hot document is gone ---------- */

test('no submission writes a room-level tally', () => {
  const submit = code.slice(code.indexOf('exports.submitLiveChallengeResponse'));
  const body = submit.slice(0, submit.indexOf('exports.', 30));
  // One document taking a write per student per round is the shape this change
  // removed. A counter reappearing here brings the hot spot back.
  assert.doesNotMatch(body, /roundAnswers:\s*\{\s*\[String\(submittedRound\)\]/);
  assert.doesNotMatch(body, /roundMisses:\s*\{\s*\[String\(submittedRound\)\]/);
});

test('a new room is not created with counters nothing maintains', () => {
  const create = code.slice(code.indexOf('exports.createLiveChallenge'));
  const body = create.slice(0, create.indexOf('exports.', 30));
  assert.doesNotMatch(body, /roundMisses:\s*\{\},/);
  assert.doesNotMatch(body, /roundAnswers:\s*\{\},/);
});

test('both consumers derive rather than read a stored count', () => {
  assert.match(code, /deriveRoundTallies\(\{[\s\S]{0,300}players,/);
  // The report and the second-chance planner are the only two readers.
  assert.equal((code.match(/deriveRoundTallies\(/g) || []).length, 2);
});

/* ---------- the arithmetic ---------- */

test('a round is counted once per student who answered it', () => {
  const { roundAnswers } = deriveRoundTallies({
    players: [player([0, 1]), player([0]), player([])],
  });
  assert.equal(roundAnswers['0'], 2);
  assert.equal(roundAnswers['1'], 1);
});

test('a miss is counted only for the students who missed it', () => {
  const { roundAnswers, roundMisses } = deriveRoundTallies({
    players: [player([0], [0]), player([0]), player([0], [0])],
  });
  assert.equal(roundAnswers['0'], 3);
  assert.equal(roundMisses['0'], 2);
});

test('a round nobody missed has no entry rather than a zero', () => {
  const { roundMisses } = deriveRoundTallies({ players: [player([0]), player([0])] });
  assert.equal(roundMisses['0'], undefined);
});

test('a replay does not inflate the round it repeats', () => {
  // Round 2 is a second chance at round 0. Counting it would give round 0's
  // question a denominator it never had, and could put it back on the replay
  // list for being missed twice.
  const withReplay = deriveRoundTallies({
    players: [player([0, 2], [0])],
    secondChanceOf: { 2: 0 },
  });
  const withoutReplay = deriveRoundTallies({ players: [player([0], [0])] });
  assert.deepEqual(withReplay.roundAnswers, withoutReplay.roundAnswers);
  assert.deepEqual(withReplay.roundMisses, withoutReplay.roundMisses);
});

test('a duplicated entry cannot double-count a student', () => {
  const { roundAnswers } = deriveRoundTallies({ players: [player([0, 0, 0], [0])] });
  assert.equal(roundAnswers['0'], 1);
});

test('the derived misses drive the replay list the same way the stored ones did', () => {
  const { roundMisses } = deriveRoundTallies({
    players: [player([0, 1], [1]), player([0, 1], [1]), player([0, 1], [0])],
  });
  const replays = planSecondChanceRounds({ roundMisses, scheduledRoundCount: 2 });
  assert.deepEqual(replays, [1, 0], 'the most-missed round comes back first');
});

/* ---------- the room caught mid-flight across the deploy ---------- */

test('a stored count survives when no player record can account for it', () => {
  // Answers taken before this change never wrote answeredRounds. Deriving alone
  // would report zero and could drop a genuinely missed question off the replay
  // list in the middle of a running game.
  const { roundAnswers, roundMisses } = deriveRoundTallies({
    players: [],
    storedRoundAnswers: { 0: 12 },
    storedRoundMisses: { 0: 5 },
  });
  assert.equal(roundAnswers['0'], 12);
  assert.equal(roundMisses['0'], 5);
});

test('the derived count wins when it is the larger of the two', () => {
  const { roundAnswers } = deriveRoundTallies({
    players: [player([0]), player([0]), player([0])],
    storedRoundAnswers: { 0: 1 },
  });
  assert.equal(roundAnswers['0'], 3);
});

test('junk never throws and never invents a count', () => {
  for (const bad of [undefined, {}, { players: 'no' }, { players: [null] }, { players: [player('x')] }]) {
    assert.doesNotThrow(() => deriveRoundTallies(bad));
  }
  assert.deepEqual(deriveRoundTallies({ players: [player([-1, NaN, 'x'])] }).roundAnswers, {});
});
