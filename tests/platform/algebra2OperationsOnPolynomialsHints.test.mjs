/*
 * ALGEBRA II HONORS · OPERATIONS ON POLYNOMIALS: HINTS THAT ASK BEFORE THEY TELL
 * (2026-11-06 walkthrough of module 2, "hints that hand over a step"; the rule
 * the radicals and Algebra I M3 lessons follow: algebra2HonorsRadicalsHints.test.mjs,
 * algebra1Module3InequalityHints.test.mjs).
 *
 * The lesson's hints often did the step they were meant to prompt: CW 11's hint 2
 * listed all six products, PR 2's and PR 4's hint 2 gave the first distribution,
 * CW 5's hint 2 the opposite both parts subtract. Now, on every Warm-Up,
 * Classwork and Practice question:
 *   - hint 1 asks a question about the step;
 *   - no hint but the last states a box's answer: a polynomial box by its value
 *     ("12x + 11(15 − x)" is x + 165), a number box as the leak guard reads it,
 *     a choice by its right option (polynomialStepsStated.mjs);
 *   - no hint but the last does the step: it writes none of the step's results
 *     that the problem does not show (an opposite, a product distributed, a
 *     product of two terms, a term of the answer), read from the work the item
 *     asks for, written out below from the problem;
 *   - before the last hint, a sort names a card or an example only in a question;
 *   - each item keeps its hint count, and the leak guard shows every hint.
 * The last hint may show the step. Hints are not part of a Recovery binding's
 * signature (recoveryContent.mjs), so the Warm-Up's bindings stay current;
 * recoveryPolynomialFamilies.test.mjs holds the families to the Warm-Up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { authoredHintTexts, questionHintAudit } from '../../src/platform/supports/hints/questionHints.js';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { parsePolynomial, samePolynomial } from '../../functions/shared/algebraicForm.mjs';
import { answersStated, stepsDone, writesMathematics } from './helpers/polynomialStepsStated.mjs';

const FILE = 'teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json';
const TEXT = readFileSync(new URL(`../../${FILE}`, import.meta.url), 'utf8');
const RAW = JSON.parse(TEXT);
const LESSON = compileTeacherImport(TEXT);
const HINTED = new Set(['warmup', 'classwork', 'practice']);
const hinted = () => LESSON.questions.filter((question) => HINTED.has(question.sectionId));
const byId = (id) => LESSON.questions.find((question) => question.questionId === id);
const cardsOf = (id) => (RAW.sections.flatMap((section) => section.questions).find((question) => question.questionId === id)?.figures || [])
  .map((card) => card.text);
const sentencesOf = (hint) => hint.split(/(?<=[.?!])\s+/).filter(Boolean);

/*
 * The work each item asks for, written out from the problem (the slide or the
 * textbook), never from a key. A Workshop item's work is its own polynomials.
 * The like-terms pairs, the sorts and the degrees have no polynomial to work.
 */
const WORK = Object.freeze({
  'opp-wu-1': ['(3x^2)(-4x^5)', '(-2a^3b)(5ab^2)'],
  'opp-wu-2': ['-(a^3-3a+2)', '4a^2+3a-a^2-5a'],
  'opp-cw-5': ['(3x^2+2x-3)-(4x^2+x-5)', '(-3x^2-4x+1)-(4x^2+x-5)'],
  'opp-cw-6': ['(5y^2-2y+4)-(2y^2-6y+1)'],
  'opp-cw-8': ['-x(3x^3-2x+5)', '3x^2(2xy-3xy^2+4x^2y^3)'],
  'opp-cw-9': ['10x-(0.001x^2+5x+500)'],
  'opp-cw-11': ['(x^2+3x-2)(x+4)'],
  'opp-pr-1': ['(x^2-5x+2)-(3x^2+x-1)', '(7b^2+6b-7)-(4b^2-2)'],
  'opp-pr-2': ['4(a^2+5a-6)-3(2a^3+4a-5)'],
  'opp-pr-3': ['(n-9)(n+7)', '2a(4b+5)', '3p(np-z)'],
  'opp-pr-4': ['5c(2c^2-3c+4)+2c(7c-8)'],
  // The difference, and the mistake the second box asks about.
  'opp-pr-5': ['(2y^3-5y^2-4)-(4y^3+11y^2-3y+5)', '(2y^3-5y^2-4)-4y^3+11y^2-3y+5'],
  'opp-pr-8': ['12x+11(15-x)', '11y+12(15-y)'],
  'opp-pr-9': ['0.022x+0.019(1300-x)'],
  'opp-pr-10': ['(0.108x^2-0.876x+474.1)+(0.047x^2+9.694x+361.7)', '(0.108x^2-0.876x+474.1)-(0.047x^2+9.694x+361.7)'],
  // Step 1 squares; step 2 multiplies the square by 4n − 5 again.
  'opp-pr-12': ['(4n-5)^2', '(4n-5)^3'],
  'opp-pr-13': ['7p(3p-4)(2p^2)'],
  'opp-pr-14-ccmr': ['(2x+k)(x-3)', '(3x^2-5x+2)-(x^2-2x-4)'],
});
const workOf = (question) => {
  if (question.type !== 'polynomialWorkshop') return WORK[question.questionId] || [];
  if (question.mode === 'multiplyArea') return [`(${question.leftFactor})(${question.rightFactor})`];
  return [`(${question.firstPolynomial})${question.operation === 'subtract' ? '-' : '+'}(${question.secondPolynomial})`];
};
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const PLAIN = (text) => String(text).replace(/[−–]/g, '-')
  .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((digit) => SUPERSCRIPTS.indexOf(digit)).join('')}`);
// A choice whose option is a polynomial ("42p⁴ − 56p³"), not a sentence.
const polynomialChoice = (field) => field.type === 'choice' && /[a-z]/.test(field.answer) && !/[A-Za-z]{3}/.test(field.answer)
  && Boolean(parsePolynomial(PLAIN(field.answer)));

test('the work table covers every item with a polynomial to work, and each typed key is the value of its work', () => {
  const polynomialKeys = (question) => (question.answerFields || []).filter((field) => field.answerForm || polynomialChoice(field));
  const needsWork = hinted().filter((question) => question.type === 'polynomialWorkshop' || polynomialKeys(question).length);
  assert.deepEqual(needsWork.filter((question) => !workOf(question).length).map((question) => question.questionId), []);
  const values = (question) => workOf(question).map((expression) => parsePolynomial(expression));
  needsWork.forEach((question) => polynomialKeys(question).forEach((field) => {
    assert.ok(values(question).some((value) => samePolynomial(value, parsePolynomial(PLAIN(field.answer)))), `${question.questionId} ${field.id}: ${field.answer} is the value of its work`);
  }));
  // A key that is not a work expression's value is found: a typo in the table fails here.
  assert.equal(values(byId('opp-pr-2')).some((value) => samePolynomial(value, parsePolynomial('-6a^3+4a^2+8a-8'))), false);
});

/* ------------------------------------------------------------- the rules */

test('every Warm-Up, Classwork and Practice question asks before it tells: hint 1 is a question', () => {
  const questions = hinted();
  assert.equal(questions.length, 3 + 11 + 15, 'Warm-Up 3, Classwork 11, Practice 15');
  const telling = questions.filter((question) => !/\?/.test(authoredHintTexts(question)[0] || ''))
    .map((question) => `${question.questionId}: ${authoredHintTexts(question)[0]}`);
  assert.deepEqual(telling, []);
});

test('no hint but the last states a box\'s answer', () => {
  const problems = [];
  let read = 0;
  hinted().forEach((question) => authoredHintTexts(question).slice(0, -1).forEach((hint, index) => {
    read += 1;
    const stated = answersStated(hint, question);
    if (stated.length) problems.push(`${question.questionId} hint ${index + 1} ("${hint}") states ${stated.join(', ')}`);
  }));
  assert.deepEqual(problems, []);
  assert.equal(read, 29 * 2, 'two hints before the last on each of the 29 questions');
});

test('no hint but the last does the step: it writes none of the step\'s results', () => {
  const problems = [];
  hinted().forEach((question) => authoredHintTexts(question).slice(0, -1).forEach((hint, index) => {
    const done = stepsDone(hint, question, workOf(question));
    if (done.length) problems.push(`${question.questionId} hint ${index + 1} ("${hint}") writes ${done.join(', ')}`);
  }));
  assert.deepEqual(problems, []);
});

test('before the last hint, a sort names a card or an example only in a question', () => {
  const sorts = hinted().filter((question) => question.type === 'figureMatch');
  assert.deepEqual(sorts.map((question) => question.questionId), ['opp-cw-1', 'opp-pr-15']);
  const problems = [];
  sorts.forEach((question) => authoredHintTexts(question).slice(0, -1).forEach((hint, index) => {
    sentencesOf(hint).filter((sentence) => writesMathematics(sentence, cardsOf(question.questionId)) && !sentence.trim().endsWith('?'))
      .forEach((sentence) => problems.push(`${question.questionId} hint ${index + 1}: "${sentence}"`));
  }));
  assert.deepEqual(problems, []);
});

/*
 * Each item's hint count, in the order the file lists them (Warm-Up,
 * Classwork, Practice): the rewrite changed words, never a count.
 */
test('each item keeps its hint count', () => {
  const counts = ['warmup', 'classwork', 'practice']
    .map((section) => LESSON.questions.filter((question) => question.sectionId === section).map((question) => authoredHintTexts(question).length).join(' '))
    .join(' | ');
  assert.equal(counts, '3 3 3 | 3 3 3 3 3 3 3 3 3 3 3 | 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3');
});

test('the leak guard shows every hint: none names one of the question\'s own answers', () => {
  const hidden = [];
  hinted().forEach((question) => questionHintAudit(question).filter((hint) => hint.source === 'authored' && !hint.shown)
    .forEach((hint) => hidden.push(`${question.questionId}: "${hint.text}" (${hint.reason})`)));
  assert.deepEqual(hidden, []);
});

test('no "Let\'s back up" option is an answer a typed box takes, read by the box\'s own grader', () => {
  const problems = [];
  hinted().filter((question) => question.type === 'multiAnswer' && question.scaffold).forEach((question) => {
    (question.scaffold.options || []).forEach((option) => (question.answerFields || []).filter((field) => field.type !== 'choice').forEach((field) => {
      let takes = false;
      try { takes = matchesFieldAnswer(String(option), field); } catch { takes = false; }
      if (takes) problems.push(`${question.questionId}: the back-up option "${option}" is an answer the ${field.id} box takes (${field.answer})`);
    }));
  });
  assert.deepEqual(problems, []);
});

/* ---------------------------------------------------- what counts as telling */

test('what counts as doing the step: the walkthrough\'s own hints, and questions that quote the problem', () => {
  const done = (id, hint) => stepsDone(hint, byId(id), workOf(byId(id)));
  // The four hints the walkthrough named.
  assert.deepEqual(done('opp-cw-11', 'The products are x³, 4x², 3x², 12x, −2x, −8.'), ['4x^2', '3x^2', '12x', '-2x']);
  assert.deepEqual(done('opp-pr-2', '−3(2a³ + 4a − 5) = −6a³ − 12a + 15.'), ['-6a^3-12a+15']);
  assert.deepEqual(done('opp-pr-4', '5c(2c² − 3c + 4) = 10c³ − 15c² + 20c.'), ['10c^3-15c^2+20c']);
  assert.deepEqual(done('opp-cw-5', 'The opposite of 4x² + x − 5 is −4x² − x + 5.'), ['-4x^2-x+5']);
  // Two products left uncombined are each worked out; one cell, or its letters, after "=".
  assert.deepEqual(done('opp-pr-3', 'In (n − 9)(n + 7) the two n terms are like terms: 7n − 9n.'), ['7n', '-9n']);
  assert.deepEqual(done('opp-cw-7', 'Multiply the coefficients and add the exponents of y: −y · 4y² = −4y³.'), ['-4y^3']);
  assert.deepEqual(done('opp-wu-1', 'A letter written with no exponent has exponent 1: a³ · a = a⁴.'), ['a^4']);
  // A sign is part of what is quoted: −3a is in the problem, its opposite 3a is not.
  assert.deepEqual(done('opp-cw-3', 'The opposite of −3a is +3a, and the opposite of +2 is −2.'), ['3a']);
  assert.deepEqual(done('opp-cw-3', 'What is the opposite of −3a? Of 2?'), []);
  // A word between two numbers or letters is not a product: "3 a" is not 3a.
  assert.deepEqual(done('opp-cw-3', 'Is 3 a coefficient of the second polynomial?'), []);
  // Asking for a product, quoting the problem, or naming a kind of term tells nothing.
  assert.deepEqual(done('opp-pr-2', 'What is −3 · (−5): positive or negative?'), []);
  assert.deepEqual(done('opp-pr-4', 'What is 5c · 2c²? Combine the c² terms and the c terms.'), []);
  assert.deepEqual(done('opp-cw-5', 'Both differences subtract 4x² + x − 5. What is its opposite?'), []);
  assert.deepEqual(done('opp-cw-11', 'Multiply each term of x² + 3x − 2 by x, then by 4.'), []);
  // An expression with other numbers is not a result of this item's step.
  assert.deepEqual(done('opp-pr-8', 'The first painter works x hours and the second works 15 − x.'), []);
});

test('what counts as stating a box\'s answer: a polynomial by its value, a number by the leak guard, a choice by its right option', () => {
  const stated = (id, hint) => answersStated(hint, byId(id));
  // The model, unsimplified, is the box's answer; the problem's own expression is not.
  assert.deepEqual(stated('opp-pr-8', 'Cost = 12x + 11(15 − x). Distribute, then combine like terms.'), ['first (x+165)']);
  assert.deepEqual(stated('opp-pr-12', '(4n − 5)² = (4n − 5)(4n − 5): four products.'), ['square (16n^2-40n+25)']);
  assert.deepEqual(stated('opp-pr-12', 'What does (4n − 5)² mean: which two factors do you multiply?'), []);
  assert.deepEqual(stated('opp-cw-5', 'Simplify (3x² + 2x − 3) − (4x² + x − 5) one sign at a time.'), []);
  // A choice: by value when it is mathematics, by the leak guard when it is a number, else by its words.
  assert.deepEqual(stated('opp-pr-13', 'Multiply all three: 7p(3p − 4)(2p²).'), ['volume (42p⁴ − 56p³)']);
  assert.deepEqual(stated('opp-cw-11', '3 rows × 2 columns is 6 products.'), ['count (6)']);
  assert.deepEqual(stated('opp-cw-6', 'He changed the sign of only the first term of the second polynomial.'), ['mistake (He changed the sign of only the first term of the second polynomial.)']);
  assert.deepEqual(stated('opp-cw-6', 'Did he change the sign of every term?'), []);
  // A number box, as the leak guard reads it: 5 is the degree of −4x²y³. The
  // guard reads "5xy" as 5 and the word "xy", so a hint names that card as xy.
  assert.deepEqual(stated('opp-cw-2', 'Add the exponents: the degree is 5.'), ['d2 (5)']);
  assert.deepEqual(stated('opp-cw-2', 'What is the degree of 5xy?'), ['d2 (5)']);
  assert.deepEqual(stated('opp-cw-2', 'What exponent does each letter of xy have?'), []);
});

test('what counts as a sort naming its mathematics', () => {
  const cards = cardsOf('opp-cw-1');
  assert.equal(writesMathematics('A product such as 5xy or −4x²y³ is ONE term, however many letters it has.', cards), true);
  assert.equal(writesMathematics('Is √(m − 7) one term?', cards), true, 'a card the reader cannot parse is still found');
  assert.equal(writesMathematics('Is a product of a number and letters one term or several?', cards), false);
  assert.equal(writesMathematics('(x + 1)(x² − x + 1) = x³ + 1: like terms can cancel.', cardsOf('opp-pr-15')), true);
});
