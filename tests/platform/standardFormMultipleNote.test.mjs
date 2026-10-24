// GR29: a whole-number multiple of a standard-form key is right, and the
// student is told to divide out the common factor (the owner's decision).
// The grading half is tests/platform/standardFormMultiples.test.mjs; this is
// the note under "Correct!".

import test from 'node:test';
import assert from 'node:assert/strict';

import { standardFormCommonFactor, standardFormMultipleNote } from '../../src/platform/supports/feedback/standardFormMultipleNote.js';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { componentSource } from './helpers/sourceContract.mjs';

test('the factor a right standard-form answer still carries', () => {
  assert.equal(standardFormCommonFactor('4x+2y=6', '2x+y=3'), 2);
  assert.equal(standardFormCommonFactor('6x + 3y = 9', '2x+y=3'), 3);
  assert.equal(standardFormCommonFactor('-4x-2y=-6', '2x+y=3'), -2);
  assert.equal(standardFormCommonFactor('50x + 42y = 1200', '25x + 21y = 600'), 2);
  // Nothing to divide out, or not a multiple in standard form.
  for (const response of ['2x+y=3', '-2x-y=-3', 'y=-2x+3', '4x+2y-6=0', 'x+0.5y=1.5', '4x+2y=7']) {
    assert.equal(standardFormCommonFactor(response, '2x+y=3'), null, response);
  }
  assert.equal(standardFormCommonFactor('4x+2y=6', 'y=-2x+3'), null, 'a key in another form asks nothing of this kind');
});

test('the note is said for a right part that carries a factor, and never for a wrong one', () => {
  const question = { type: 'multiAnswer', answerFields: [{ id: 'line', answer: '2x+y=3' }, { id: 'n', answer: '4' }] };
  assert.equal(matchesFieldAnswer('4x+2y=6', question.answerFields[0]), true, 'GR29 grades it right');
  assert.equal(
    standardFormMultipleNote({ question, parts: [{ id: 'line', isCorrect: true, response: '4x+2y=6' }, { id: 'n', isCorrect: true, response: '4' }] }),
    'Every term shares a factor of 2. Divide it out to write the equation with the smallest whole numbers.',
  );
  assert.equal(standardFormMultipleNote({ question, parts: [{ id: 'line', isCorrect: true, response: '2x+y=3' }] }), '');
  assert.equal(standardFormMultipleNote({ question, parts: [{ id: 'line', isCorrect: false, response: '4x+2y=6' }] }), '');
  assert.equal(standardFormMultipleNote({ question, parts: [{ id: 'line', graded: false, isCorrect: true, response: '4x+2y=6' }] }), '');
  assert.equal(standardFormMultipleNote({ question: { answerFields: [] }, parts: [{ id: 'line', isCorrect: true, response: '4x+2y=6' }] }), '');
});

test('the note has Spanish, sentence by sentence', async () => {
  const pack = await loadLanguagePack('es');
  const note = standardFormMultipleNote({
    question: { answerFields: [{ id: 'line', answer: '2x+y=3' }] },
    parts: [{ id: 'line', isCorrect: true, response: '6x+3y=9' }],
  });
  const translated = translateWithPack(note, pack);
  const textOf = typeof translated === 'string' ? translated : translated?.text;
  assert.match(String(textOf), /Todos los términos tienen un factor común de 3\./);
  assert.match(String(textOf), /Divide entre ese factor/);
});

test('the "Correct!" box says it, where outcome feedback is open', () => {
  const engine = componentSource('src/QuestionEngine.jsx');
  assert.match(engine, /if \(!feedback\?\.isCorrect \|\| feedback\.blocked \|\| !feedbackOpen\) return '';/);
  assert.match(engine, /return standardFormMultipleNote\(\{ question: processedQuestion, parts: gradedForDisplay\.grading\?\.parts \}\);/);
  assert.match(engine, /\{correctNote && \(\s*<div data-correct-note="common-factor"/);
});
