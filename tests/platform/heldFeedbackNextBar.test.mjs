// A HELD QUIZ'S "NEXT QUESTION" BAR MUST NOT SAY WHETHER THE ANSWER WAS RIGHT.
//
// Found by job G2 in the teacher harness (?server=1): once a one-try quiz item
// closed, the bar read "You got it — keep going" after a right answer and
// "This question is closed — keep going" after a wrong one, while the same
// screen said "Your teacher will release correctness feedback". Product
// decision 3 and the feedback policy hold correctness until release.
//
// The wording expression and the engine's own definition of
// terminalFeedbackHidden are evaluated together here, so the test follows
// what the code does, not how it is spelled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));

const hiddenDefinition = engine.match(/const terminalFeedbackHidden = ([^;]+);/);
const bar = region(engine, '<div role="navigation" aria-label="Continue to the next question"', '</button>', 'the Next Question bar');
const wording = bar.match(/\{([^{}]*'You got it — keep going'[^{}]*)\}/);

const barText = ({ isCorrect, isExpired, showOutcomeFeedback }) => new Function(
  'isCorrect', 'isExpired', 'showOutcomeFeedback',
  `const terminalFeedbackHidden = ${hiddenDefinition[1]};\nreturn ${wording[1]};`,
)(isCorrect, isExpired, showOutcomeFeedback);

test('the bar\'s wording and the held-feedback flag are where the test reads them', () => {
  assert.ok(hiddenDefinition, 'QuestionEngine defines terminalFeedbackHidden');
  assert.ok(wording, 'the Next Question bar words its heading from an expression');
  assert.equal((engine.match(/You got it — keep going/g) || []).length, 1, 'one place says "You got it"');
});

test('feedback held: a right and a wrong answer read the same', () => {
  const right = barText({ isCorrect: true, isExpired: false, showOutcomeFeedback: false });
  const wrong = barText({ isCorrect: false, isExpired: true, showOutcomeFeedback: false });
  assert.equal(right, 'This question is closed — keep going');
  assert.equal(wrong, right, 'the words carry no verdict');
});

test('feedback shown (practice, or released): a right answer still hears "You got it"', () => {
  assert.equal(barText({ isCorrect: true, isExpired: false, showOutcomeFeedback: true }), 'You got it — keep going');
  assert.equal(barText({ isCorrect: false, isExpired: true, showOutcomeFeedback: true }), 'This question is closed — keep going');
});
