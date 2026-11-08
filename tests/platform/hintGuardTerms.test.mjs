/*
 * THE HINT GUARD READS A TERM AS A TERM (the module 2 walk, 2026-11-06).
 *
 * The leak guard (hintLeakGuard.js) read "5xy" as the number 5 and the word
 * "xy", so a hint that named the term 5xy was hidden whenever a box's answer
 * was 5: Operations on Polynomials CW 2 asks the degree of 5xy (2) beside the
 * degree of −4x²y³ (5), and its first hint had to call the term "xy". A number
 * joined to letters, a power or a bracket is now read as part of its term, and
 * a term the student reads, quoted whole, is a quotation like "solve
 * 0 = 3x − 8" for g(x) = 3x − 8 (HELP-16). Every hint that states a box's
 * answer is still hidden in every form the guard caught: a term or an
 * expression the problem does not show still names its number.
 *
 * The sweep of every lesson's hints, back-up steps and after-miss messages
 * (and the audited bank items Honors swaps place) is in the commit message.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { statedAnswers } from '../../src/platform/supports/hints/hintLeakGuard.js';
import { questionHintAudit, questionVisibleText } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';

const lesson = (path) => compileTeacherImport(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')).questions;
const OPERATIONS = lesson('teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json');
const byId = (questions, id) => {
  const question = questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${id} is in the lesson`);
  return question;
};
const stated = (hint, answer, visibleText = '') => statedAnswers(hint, { answers: [answer], visibleText });
// The guard's verdict on each authored hint, in order: shown or hidden.
const shownOf = (question, hints) => questionHintAudit({ ...question, hints }).filter((hint) => hint.source === 'authored').map((hint) => hint.shown);

test('the walk\'s item: a hint that names the term 5xy beside the box "Degree of 5xy" is shown when another box\'s answer is 5', () => {
  const cw2 = byId(OPERATIONS, 'opp-cw-2');
  assert.deepEqual(cw2.answerFields.map((field) => `${field.label} = ${field.answer}`).slice(0, 2), ['Degree of 5xy = 2', 'Degree of −4x²y³ = 5']);
  assert.deepEqual(shownOf(cw2, [
    'What is the degree of 5xy?',
    'Is 5xy a monomial? How many terms does it have?',
    'Add the exponents of 5xy: x is x¹ and y is y¹.',
  ]), [true, true, true]);
  // The same box's answer, stated, is still hidden — and so is a term the
  // student is not shown: 5ab is new, so its 5 is a coefficient the hint wrote.
  assert.deepEqual(shownOf(cw2, ['The degree of −4x²y³ is 5.', 'Is 5ab a monomial?', 'The degree of 5xy is 2.']), [false, false, false]);
});

test('letters, a power and a bracket joined to a number are all part of its term', () => {
  // Letters: a product of variables, with or without powers.
  assert.deepEqual(stated('Is 5xy a monomial?', '5', 'Degree of 5xy'), []);
  assert.deepEqual(stated('Is 2ab³ one term?', '2', 'Classify 2ab³ − 1.'), []);
  // A power: the superscript belongs to the term, so 5x² is not 5x³. The old
  // reading stopped at the superscript and quoted "5x" from either.
  assert.deepEqual(stated('Name the term 5x² in the problem.', '5', 'Simplify 5x² + 2.'), []);
  assert.deepEqual(stated('Name the term 5x² in the problem.', '5', 'Simplify 5x³ + 2.'), ['5']);
  assert.deepEqual(stated('Look at −4x²y³ first.', '-4', 'Degree of −4x²y³'), []);
  assert.deepEqual(stated('Look at −4x²y first.', '-4', 'Degree of −4x²y³'), ['-4']);
  // A bracket.
  assert.deepEqual(stated('Distribute 5(x + 1) first.', '5', 'Expand 5(x + 1) − 2x.'), []);
  assert.deepEqual(stated('Distribute 5(x + 2) first.', '5', 'Expand 5(x + 1) − 2x.'), ['5']);
  // A word or an article beside the term is not part of it: "Is 5xy a
  // monomial?" ends the term at "a", and "a 3" is a word and a number.
  assert.deepEqual(stated('Is 5xy − 2 a binomial?', '-2', 'Classify 5xy − 2.'), []);
  assert.deepEqual(stated('The answer is a 3.', '3', 'Rows: a 3, b 4.'), ['3']);
});

test('a quotation\'s ends are read where the student reads them: the words around a term do not join it', () => {
  // The visible text was squashed before the comparison, so "Degree of 5xy"
  // read "degreeof5xy", and nothing after a word could be quoted.
  assert.deepEqual(stated('What is the degree of 5xy?', '5', 'Degree of 5xy'), []);
  assert.deepEqual(stated('Solve 0 = 3x − 8.', '3', 'Find the zero of 3x − 8 on the graph.'), []);
  assert.deepEqual(stated('From (−2, 5) to (4, −1), the change in y is…', '-1', 'The line passes through (−2, 5) and (4, −1).'), []);
  // A whole token still: a longer number, a longer term or a power around it is not the quotation.
  assert.deepEqual(stated('Line q is y = 3x − 8.', '3', 'Line p is y = 13x − 8. Line q is perpendicular to it.'), ['3']);
  assert.deepEqual(stated('Compare with y = 2x + 1.', '2', 'Slope of y = 12x + 1'), ['2']);
  assert.deepEqual(stated('Solve 0 = 3x − 8.', '3', 'Find the zero of 3x − 8².'), ['3']);
});

test('a hint that states a box\'s answer is still hidden, in every form the guard caught', () => {
  [
    // [hint, answer, what the student reads]
    ['The slope is 3.', '3', 'g(x) = 3x − 8'],
    ['In 3x − 8, the slope is 3.', '3', 'g(x) = 3x − 8'],
    ['Solve 0 = 3x − 9.', '3', 'g(x) = 3x − 8'],
    ['7 = −2(−2) + b.', '-2', 'Write the line through (−2, 7) perpendicular to y = (1/2)x + 1.'],
    ['Is 5xy one term?', '5', ''],
    ['Is 5xy − 2 a binomial?', '-2', ''],
    ['Its slope is a -2.', '-2', ''],
    ['The slope (m) -2 means down 2.', '-2', ''],
    ['Look at x − 2.', '2', ''],
    ['Write f(x/2).', '2', ''],
    ['The slope is 3/(1).', '3', ''],
    // The same number in another spelling, inside a term the problem does not show.
    ['Try 0.5xy.', '1/2', ''],
  ].forEach(([hint, answer, visibleText]) => assert.deepEqual(stated(hint, answer, visibleText), [answer], `${hint} | ${answer}`));
  // …and in another spelling inside a term the problem shows, it is a quotation.
  assert.deepEqual(stated('Try 0.5xy.', '1/2', 'Simplify 0.5xy + 2.'), []);
});

test('a real back-up step that quotes a label is read as a quotation; its option that does the work is not', () => {
  const pr9 = byId(lesson('teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json'), 'm3l1h-pr-9');
  const step = backUpStepFor(pr9);
  assert.equal(step.prompt, 'Let’s back up. 3(x + 2) − x simplifies to…');
  const visibleText = questionVisibleText(pr9);
  assert.match(visibleText, /mx \+ 5 = 3\(x \+ 2\) − x has no solution when m =/);
  const boxes = (sentence) => pr9.answerFields.filter((field) => statedAnswers(sentence, { answers: [field.answer], visibleText }).length)
    .map((field) => `${field.id} (${field.answer})`);
  // It quotes box m's own equation: it states neither k = 3 nor m = 2.
  assert.deepEqual(boxes(step.prompt), []);
  // The right option, 2x + 6, is an expression the problem does not show: its
  // 2 is the answer m = 2 and its 6 the answer c = 6, both still stated.
  assert.equal(step.correct, '2x + 6');
  assert.deepEqual(boxes(step.correct), ['m (2)', 'c (6)']);
});
