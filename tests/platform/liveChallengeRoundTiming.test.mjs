import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_PROBLEM,
  maxPromptWordsFor,
  validateChallengeRound,
  validateChallengeRoundSet,
  wordsToRead,
} from '../../functions/shared/liveChallengeRoundTiming.mjs';

/*
 * THE TIMING VALIDATOR FOR A LIVE CHALLENGE ROUND SET (LC14).
 *
 * functions/shared/liveChallengeRoundTiming.mjs: can a class read this
 * question and answer it in the round it is in? Errors are what the game
 * itself would refuse or could not play; warnings are what it would play and
 * is probably unfair. The limits are written out below as plain numbers, not
 * read back from the module, so a change to one is a change to this test.
 */

const words = (count, word = 'word') => Array.from({ length: count }, () => word).join(' ');
// A one-step question (the game runs it for 25 seconds at the default 45).
const oneStep = (overrides = {}) => ({
  prompt: 'Solve $2x + 3 = 11$.',
  dok: 1,
  solutionDepth: 1,
  responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: 4 }],
  ...overrides,
});
const codes = (result, severity) => result.problems.filter((problem) => !severity || problem.severity === severity).map((problem) => problem.code);

test('a short one-step question is fine, and says how long the game would run it', () => {
  const result = validateChallengeRound({ question: oneStep() });
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.seconds, 25, 'the game runs a one-step question for 25 seconds at the default');
  assert.equal(result.words, 3, 'one word and a formula, which counts as two; the full stop is not a word');
});

test('the reading limit is 40% of the round at 3 words a second, written out for each round length', () => {
  assert.deepEqual([15, 25, 35, 45, 55, 90, 120].map(maxPromptWordsFor), [18, 30, 42, 54, 66, 108, 144]);
  assert.equal(maxPromptWordsFor(0), 0);
  assert.equal(maxPromptWordsFor('nonsense'), 0);
});

test('a prompt at the reading limit is fine; one word more is a warning, not an error', () => {
  // A one-step question runs 25 seconds: 30 words.
  const atLimit = validateChallengeRound({ question: oneStep({ prompt: words(30) }) });
  assert.deepEqual(codes(atLimit), []);
  const over = validateChallengeRound({ question: oneStep({ prompt: words(31) }) });
  assert.deepEqual(codes(over), [CHALLENGE_PROBLEM.LONG_TO_READ]);
  assert.equal(over.ok, true, 'a warning never makes a question unusable');
  assert.match(over.problems[0].message, /31 words[\s\S]*25-second round[\s\S]*30 words or fewer/);
  // A three-step question runs 45 seconds: 54 words.
  const threeSteps = (count) => validateChallengeRound({ question: oneStep({ solutionDepth: 3, prompt: words(count) }) });
  assert.deepEqual(codes(threeSteps(54)), []);
  assert.deepEqual(codes(threeSteps(55)), [CHALLENGE_PROBLEM.LONG_TO_READ]);
});

test('a formula counts as two words, and the choices a student reads count too', () => {
  // 28 words + one formula = 30: at the limit. One more formula word tips it.
  assert.equal(wordsToRead({ prompt: `${words(28)} $\\frac{3x + 2}{5}$` }), 30);
  assert.deepEqual(codes(validateChallengeRound({ question: oneStep({ prompt: `${words(28)} $\\frac{3x + 2}{5}$` }) })), []);
  assert.deepEqual(codes(validateChallengeRound({ question: oneStep({ prompt: `${words(29)} $\\frac{3x + 2}{5}$` }) })), [CHALLENGE_PROBLEM.LONG_TO_READ]);
  // Display math is one formula too, and two of them are two (not a stray $ pairing across the words between).
  assert.equal(wordsToRead({ prompt: 'Find $$x^2 + 1$$ now' }), 4);
  assert.equal(wordsToRead({ prompt: '$$a$$ and $$b$$' }), 5);
  // Choices on the question and the same choices on its field are read once.
  const choices = ['one two three', 'four five six', 'seven eight nine', 'ten eleven twelve'];
  const multipleChoice = oneStep({
    prompt: words(18),
    choices,
    responseFields: [{ id: 'answer', inputProfile: 'choice', choices }],
  });
  assert.equal(wordsToRead(multipleChoice), 18 + 12);
  assert.deepEqual(codes(validateChallengeRound({ question: multipleChoice })), []);
  assert.deepEqual(codes(validateChallengeRound({ question: { ...multipleChoice, prompt: words(19) } })), [CHALLENGE_PROBLEM.LONG_TO_READ]);
  // Choices given as objects are read by their label.
  assert.equal(wordsToRead({ prompt: 'Pick', choices: [{ label: 'two words' }, { text: 'three little words' }] }), 1 + 2 + 3);
});

test('a Pace Race has no clock to read against', () => {
  const long = oneStep({ prompt: words(200) });
  assert.deepEqual(codes(validateChallengeRound({ question: long, timingMode: 'timed' })), [CHALLENGE_PROBLEM.LONG_TO_READ]);
  const pace = validateChallengeRound({ question: long, timingMode: 'pace' });
  assert.deepEqual(codes(pace), []);
  assert.equal(pace.seconds, null);
});

test('a question a live round cannot draw is an error, with the reason in a sentence', () => {
  const none = validateChallengeRound({ question: oneStep({ responseFields: [] }) });
  assert.equal(none.ok, false);
  assert.deepEqual(codes(none, 'error'), [CHALLENGE_PROBLEM.NOT_ANSWERABLE]);
  assert.match(none.problems[0].message, /no answer box or choices/);

  const oneChoice = validateChallengeRound({ question: oneStep({ responseFields: [{ id: 'a', inputProfile: 'choice', choices: ['only'] }] }) });
  assert.equal(oneChoice.ok, false);
  assert.match(oneChoice.problems[0].message, /at least two choices/);

  const mismatch = validateChallengeRound({ question: oneStep({
    prompt: 'Choose the larger number.',
    choices: ['3', '7'],
    responseFields: [{ id: 'a', inputProfile: 'number', expected: 7 }],
  }) });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.problems[0].message, /choose or select, but the answer is a typed box/);

  const noChoices = validateChallengeRound({ question: oneStep({ prompt: 'Select the correct graph.', responseFields: [{ id: 'a', inputProfile: 'number', expected: 1 }] }) });
  assert.equal(noChoices.ok, false);
  assert.match(noChoices.problems[0].message, /gives no choices/);

  const strange = validateChallengeRound({ question: oneStep({ responseFields: [{ id: 'a', inputProfile: 'hologram' }] }) });
  assert.equal(strange.ok, false);
  assert.match(strange.problems[0].message, /kind a live round cannot show/);

  const blank = validateChallengeRound({ question: oneStep({ prompt: '   ' }) });
  assert.equal(blank.ok, false);
  assert.match(blank.problems[0].message, /no question for the class to read/);

  // An interactive tool carries its own answer surface.
  assert.equal(validateChallengeRound({ question: oneStep({ pathToolId: 'stepAlgebra', responseFields: [] }) }).ok, true);
});

test('a multi-step question needs a round of 90 seconds; an extended-thinking one never fits a timed round', () => {
  const deep = (dok, roundSeconds, timingMode) => validateChallengeRound({
    question: oneStep({ dok, solutionDepth: 3 }), roundSeconds, timingMode,
  });
  // DOK 1 and 2 fit any round.
  assert.equal(deep(1, 30).ok, true);
  assert.equal(deep(2, 30).ok, true);
  // DOK 3: a three-step question is run for exactly the teacher's length at
  // 45 seconds' reference, so it needs the teacher to ask for 90.
  assert.deepEqual(codes(deep(3, 45), 'error'), [CHALLENGE_PROBLEM.TOO_DEEP]);
  assert.deepEqual(codes(deep(3, 89), 'error'), [CHALLENGE_PROBLEM.TOO_DEEP]);
  assert.deepEqual(codes(deep(3, 90), 'error'), []);
  assert.deepEqual(codes(deep(3, 120), 'error'), []);
  assert.match(deep(3, 45).problems[0].message, /multi-step \(DOK 3\)[\s\S]*at least 90 seconds/);
  // DOK 4: never in a timed round, whatever its length.
  assert.deepEqual(codes(deep(4, 120), 'error'), [CHALLENGE_PROBLEM.TOO_DEEP]);
  assert.match(deep(4, 120).problems[0].message, /extended-thinking \(DOK 4\)/);
  // The game judges a question against the round it would RUN for it (the
  // teacher's length fitted to the question), not the length the teacher
  // picked: a two-step question is run for 35/45 of it, so a 90-second game
  // gives it 70 and it does not fit, though 90 is the minimum.
  const twoStep = (roundSeconds) => validateChallengeRound({ question: oneStep({ dok: 3, solutionDepth: 2 }), roundSeconds });
  assert.deepEqual(codes(twoStep(90), 'error'), [CHALLENGE_PROBLEM.TOO_DEEP]);
  assert.match(twoStep(90).problems[0].message, /this game would give it 70\./);
  assert.deepEqual(codes(twoStep(115), 'error'), [CHALLENGE_PROBLEM.TOO_DEEP], '115 gives it 89');
  assert.deepEqual(codes(twoStep(116), 'error'), [], '116 gives it 90');
  // A Pace Race has no countdown to fit: everything fits.
  assert.equal(deep(3, 45, 'pace').ok, true);
  assert.equal(deep(4, 45, 'pace').ok, true);
  // No DOK recorded: nothing to judge by.
  assert.equal(validateChallengeRound({ question: oneStep({ dok: undefined }) }).ok, true);
});

test('several answer boxes and a request to explain are warnings', () => {
  const parts = validateChallengeRound({ question: oneStep({ responseFields: [
    { id: 'a', inputProfile: 'number', expected: 1 },
    { id: 'b', inputProfile: 'number', expected: 2 },
  ] }) });
  assert.deepEqual(codes(parts), [CHALLENGE_PROBLEM.SEVERAL_PARTS]);
  assert.equal(parts.ok, true);
  assert.match(parts.problems[0].message, /2 answers/);

  for (const prompt of ['Solve $x + 1 = 3$ and explain your answer.', 'Justify why $x = 2$.', 'Show your work for $x + 1 = 3$.', 'Say in your own words what $x$ means.']) {
    assert.deepEqual(codes(validateChallengeRound({ question: oneStep({ prompt }) })), [CHALLENGE_PROBLEM.ASKS_TO_EXPLAIN], prompt);
  }
  // …or a field that asks.
  assert.deepEqual(codes(validateChallengeRound({ question: oneStep({ responseFields: [{ id: 'a', label: 'Explain your thinking', inputProfile: 'text' }] }) })), [CHALLENGE_PROBLEM.ASKS_TO_EXPLAIN]);
  // Ordinary words that merely sit near these are fine.
  assert.deepEqual(codes(validateChallengeRound({ question: oneStep({ prompt: 'Which equation shows the explained variance of $y$?' }) })), []);
});

test('a set needs 3 to 20 rounds of 15 to 120 seconds, and every question is judged in order', () => {
  const good = oneStep();
  const set = (count, extra = {}) => validateChallengeRoundSet({ questions: Array.from({ length: count }, () => good), ...extra });
  assert.equal(set(3).ok, true);
  assert.equal(set(20).ok, true);
  assert.deepEqual(set(2).problems.map((problem) => problem.code), [CHALLENGE_PROBLEM.ROUND_COUNT]);
  assert.deepEqual(set(21).problems.map((problem) => problem.code), [CHALLENGE_PROBLEM.ROUND_COUNT]);
  assert.match(set(2).problems[0].message, /3 to 20 rounds; this set has 2/);
  assert.equal(set(0).ok, false);
  assert.equal(validateChallengeRoundSet({ questions: 'not a list' }).ok, false);

  assert.equal(set(5, { roundSeconds: 15 }).ok, true);
  assert.equal(set(5, { roundSeconds: 120 }).ok, true);
  for (const roundSeconds of [14, 121, 0, 45.5, 'soon', null]) {
    assert.deepEqual(set(5, { roundSeconds }).problems.map((problem) => problem.code), [CHALLENGE_PROBLEM.ROUND_SECONDS], String(roundSeconds));
  }
  // A Pace Race has no round length to get wrong.
  assert.equal(set(5, { roundSeconds: 5000, timingMode: 'pace' }).ok, true);

  // One bad question fails the set, and says which.
  const mixed = validateChallengeRoundSet({ questions: [good, oneStep({ responseFields: [] }), good, oneStep({ prompt: words(80) })], roundSeconds: 45 });
  assert.equal(mixed.ok, false);
  assert.deepEqual(mixed.rounds.map((round) => round.index), [0, 1, 2, 3]);
  assert.deepEqual(mixed.rounds.map((round) => round.ok), [true, false, true, true], 'a warning does not fail a round');
  assert.deepEqual(codes(mixed.rounds[3]), [CHALLENGE_PROBLEM.LONG_TO_READ]);
  // The game's length: the seconds each round would run.
  assert.equal(set(4).totalSeconds, 4 * 25);
  assert.equal(set(4, { timingMode: 'pace' }).totalSeconds, null);
});
