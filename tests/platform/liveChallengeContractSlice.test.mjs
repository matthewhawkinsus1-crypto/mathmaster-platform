import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_SLICES,
  authoringContractSections,
  buildAuthoringContract,
  buildContractSlice,
} from '../../src/platform/contract/authoringContract.js';
import { LIVE_CHALLENGE_SECTION } from '../../src/platform/contract/liveChallengeContract.js';
import {
  CHALLENGE_PROBLEM,
  validateChallengeRound,
  validateChallengeRoundSet,
} from '../../functions/shared/liveChallengeRoundTiming.mjs';

/*
 * THE "LIVE CHALLENGE ROUNDS" SLICE OF THE AUTHORING CONTRACT (LC14).
 *
 * What an outside AI is told about a timed round must be what the timing
 * validator (and so, one day, an import) enforces. The section's numbers are
 * read out of its TEXT here and played against the validator, so a number
 * typed into the prose that the validator does not hold, or a validator limit
 * the prose forgot to update, is a red test. (The slice machinery itself,
 * that every slice resolves and stays pasteable, is held in
 * aiAuthoringTextCurrency.test.mjs for every slice at once.)
 */

const SLICE = buildContractSlice({ sections: CONTRACT_SLICES.liveChallenge, courseId: 'algebra1' });
const section = SLICE.split(`## ${LIVE_CHALLENGE_SECTION}`)[1].split('\n## ')[0];
const number = (pattern) => {
  const match = section.match(pattern);
  assert.ok(match, `the section no longer says ${pattern}`);
  return match.slice(1).map(Number);
};
const words = (count) => Array.from({ length: count }, () => 'word').join(' ');
const stepQuestion = (steps, prompt) => ({
  prompt, dok: 1, solutionDepth: steps, responseFields: [{ id: 'answer', inputProfile: 'number', expected: 1 }],
});
const warnsAboutReading = (steps, count) => validateChallengeRound({ question: stepQuestion(steps, words(count)) })
  .problems.some((problem) => problem.code === CHALLENGE_PROBLEM.LONG_TO_READ);

test('the slice is the V5 wrapper and question rules plus the round\'s own, and the full contract does not carry it', () => {
  assert.ok(authoringContractSections({ courseId: 'algebra1' }).includes(LIVE_CHALLENGE_SECTION), 'a slice can name it');
  assert.ok(!buildAuthoringContract({ courseId: 'algebra1' }).includes(`## ${LIVE_CHALLENGE_SECTION}`), 'an assignment prompt never carries Live Challenge rules');
  // First, so a reader sees what this request is before the V5 plumbing.
  assert.ok(SLICE.indexOf(`## ${LIVE_CHALLENGE_SECTION}`) < SLICE.indexOf('## Required assignment shape'));
  ['## Required assignment shape', '## Section rules', '## Question authoring', '## Common studentActions', '## Output']
    .forEach((heading) => assert.ok(SLICE.includes(heading), heading));
  assert.ok(SLICE.length < 20000, `${SLICE.length} characters is too much to paste beside a request`);
  // It is still cut from the contract builder: every line is the section's own.
  const direct = buildAuthoringContract({ courseId: 'algebra1', includeLiveChallenge: true });
  section.split('\n').filter((line) => line.trim()).forEach((line) => assert.ok(direct.includes(line), line.slice(0, 60)));
});

test('the round length and game size the section states are the ones the validator holds', () => {
  const [minSeconds, maxSeconds, defaultSeconds, minRounds, maxRounds] = number(/for (\d+)-(\d+) seconds \((\d+) by default\), and a game has (\d+)-(\d+) rounds/);
  assert.deepEqual([minSeconds, maxSeconds, defaultSeconds, minRounds, maxRounds], [15, 120, 45, 3, 20]);
  const question = stepQuestion(1, 'Solve $x + 1 = 2$.');
  const set = (count, roundSeconds) => validateChallengeRoundSet({ questions: Array.from({ length: count }, () => question), roundSeconds });
  assert.equal(set(minRounds, minSeconds).ok, true);
  assert.equal(set(maxRounds, maxSeconds).ok, true);
  assert.equal(set(minRounds, minSeconds - 1).ok, false);
  assert.equal(set(minRounds, maxSeconds + 1).ok, false);
  assert.equal(set(minRounds - 1, defaultSeconds).ok, false);
  assert.equal(set(maxRounds + 1, defaultSeconds).ok, false);
});

test('how long the game runs a one-, two- and three-step question is what the section says', () => {
  const [one, two, three] = number(/one-step question for (\d+) seconds, a two-step question for (\d+) and a three-step question for (\d+)\./);
  const runs = (steps) => validateChallengeRound({ question: stepQuestion(steps, 'Solve.'), roundSeconds: 45 }).seconds;
  assert.deepEqual([runs(1), runs(2), runs(3)], [one, two, three]);
  assert.deepEqual([one, two, three], [25, 35, 45]);
});

test('the word limits the section states are exactly where the validator starts to warn', () => {
  const [one, two, three] = number(/at most (\d+) words for a one-step question, (\d+) for two steps and (\d+) for three/);
  assert.deepEqual([one, two, three], [30, 42, 54]);
  [[1, one], [2, two], [3, three]].forEach(([steps, limit]) => {
    assert.equal(warnsAboutReading(steps, limit), false, `${steps}-step at ${limit} words`);
    assert.equal(warnsAboutReading(steps, limit + 1), true, `${steps}-step at ${limit + 1} words`);
  });
  // The pace and the share the sentence quotes make those limits: seconds × share × pace.
  const [perSecond, percent] = number(/read about (\d+) words a second, and reading should take no more than (\d+)% of the round/);
  assert.deepEqual([perSecond, percent], [3, 40]);
  [[25, one], [35, two], [45, three]].forEach(([seconds, limit]) => assert.equal(Math.floor((seconds * percent * perSecond) / 100), limit));
  // A formula counts as the two words the section says it does.
  const [formulaWords] = number(/\(a formula counts as (\d+) words\)/);
  assert.equal(formulaWords, 2);
  const withFormula = (count) => validateChallengeRound({ question: stepQuestion(1, `${words(count)} $x + 1$`) })
    .problems.some((problem) => problem.code === CHALLENGE_PROBLEM.LONG_TO_READ);
  assert.equal(withFormula(one - formulaWords), false, 'a formula takes the words the section says, and fits');
  assert.equal(withFormula(one - formulaWords + 1), true, 'one more word and the formula tips it over');
});

test('a DOK 3 question needs the round length the section says; DOK 4 never fits', () => {
  const [dok3Seconds] = number(/A DOK 3 question needs a round of at least (\d+) seconds/);
  assert.equal(dok3Seconds, 90);
  const dok = (level, roundSeconds) => validateChallengeRound({ question: { ...stepQuestion(3, 'Solve.'), dok: level }, roundSeconds });
  assert.equal(dok(3, dok3Seconds - 1).ok, false);
  assert.equal(dok(3, dok3Seconds).ok, true);
  assert.equal(dok(4, 120).ok, false);
  assert.match(section, /DOK 4 question never fits a timed round/);
});

test('what the section tells an author not to write is what the validator warns about', () => {
  assert.match(section, /Do not ask for several parts, an explanation, a justification or shown work/);
  const parts = validateChallengeRound({ question: { ...stepQuestion(1, 'Find both.'), responseFields: [{ id: 'a', inputProfile: 'number', expected: 1 }, { id: 'b', inputProfile: 'number', expected: 2 }] } });
  assert.deepEqual(parts.problems.map((problem) => problem.code), [CHALLENGE_PROBLEM.SEVERAL_PARTS]);
  const explain = validateChallengeRound({ question: stepQuestion(1, 'Solve $x + 1 = 2$ and explain.') });
  assert.deepEqual(explain.problems.map((problem) => problem.code), [CHALLENGE_PROBLEM.ASKS_TO_EXPLAIN]);
});
