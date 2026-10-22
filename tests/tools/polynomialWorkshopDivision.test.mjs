import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import polynomialGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/polynomialWorkshop.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  divisionKeyWork,
  exactPolynomialPlainText,
  longDivisionKey,
  polynomialWorkshopAnswerLines,
  ratioPlainText,
  readWorkingLine,
  syntheticDivisionKey,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { readTypedPolynomial, simplifiedPolynomialProblem } from '../../functions/shared/simplifiedPolynomialForm.mjs';
import { estimateQuestionValue } from '../../functions/shared/questionValue.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { buildPolynomialWorkshopReview } from '../../src/tools/shared/reviews/polynomialWorkshopReview.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * POLYNOMIAL WORKSHOP: LONG DIVISION AND SYNTHETIC DIVISION (Algebra II
 * Honors, "Dividing Polynomials", A2.7C).
 *
 * The `division` view asked for the quotient and the remainder as coefficient
 * lists — exactly what a solver prints. These two views ask for the work:
 *
 *   longDivision       each round's quotient term, the product it makes with
 *                      the divisor, and the line left after subtracting it
 *                      (with the next term brought down); then the quotient
 *                      and the remainder.
 *   syntheticDivision  r, the coefficient row (a 0 for every missing power),
 *                      the products row and the bottom row; then the
 *                      quotient — and, for a divisor ax + b with a ≠ 1 (the
 *                      lesson divides through by a first), the remainder over
 *                      the original divisor.
 *
 * Every box is a graded part, in the browser and on the server alike, so a
 * quotient and remainder copied from a solver earn only their own share.
 * Every key here is checked against plain arithmetic: dividend = divisor ×
 * quotient + remainder at several values, never against the module's own
 * reading of itself.
 */

const TYPE = 'polynomialWorkshop';
const long = (dividend, divisor) => ({ type: TYPE, mode: 'longDivision', dividend, divisor });
const synthetic = (dividend, divisor) => ({ type: TYPE, mode: 'syntheticDivision', dividend, divisor });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(polynomialGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path produces a tool response');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  for (const field of ['graded', 'isCorrect', 'isComplete', 'score']) assert.equal(server[field], browser[field], field);
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return server;
};
const wrongIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

// Plain arithmetic: "x^3-4x+2" as a function of its one letter.
const valueAt = (text, x) => Function('v', `return ${String(text)
  .replace(/[−–]/g, '-')
  .replace(/\s+/g, '')
  .replace(/([a-z])\^(\d+)/g, '(v**$2)')
  .replace(/(\d|\))(?=[a-z(])/g, '$1*')
  .replace(/[a-z]/g, 'v')};`)(x);
const POINTS = [-2.5, -1.25, 0.75, 1.5, 3.25];
const divides = (dividend, divisor, quotient, remainder) => POINTS.every((x) => {
  const expected = valueAt(dividend, x);
  const rebuilt = valueAt(divisor, x) * valueAt(quotient, x) + valueAt(remainder, x);
  return Math.abs(expected - rebuilt) <= 1e-9 * Math.max(1, Math.abs(expected));
});

/* ------------------------------------------------------------ the keys */

// The slides' and the textbook's divisions, with the answers they print.
const LONG = [
  ['x^2-2x-15', 'x-5', 'x + 3', '0'],
  ['x^3-4x+2', 'x+3', 'x² − 3x + 5', '−13'],
  ['a^2-5a+3', '-a+2', '−a + 3', '−3'],
  ['y^4-3y^3+2y^2-20', 'y^2+y-5', 'y² − 4y + 11', '−31y + 35'],
  ['12b^2+23b+15', '3b+8', '4b − 3', '39'],
  ['6a^2-3a+9', '3a-2', '2a + 1/3', '29/3'],
  ['x^4+2x^2+1', 'x^2+1', 'x² + 1', '0'],
];

test('long division: the quotient and remainder are the textbook’s, and divisor × quotient + remainder is the dividend', () => {
  for (const [dividend, divisor, quotient, remainder] of LONG) {
    const key = longDivisionKey(long(dividend, divisor));
    assert.ok(key, `${dividend} ÷ ${divisor} can be drawn`);
    assert.equal(exactPolynomialPlainText(key.quotient, key.letter), quotient, `${dividend} ÷ ${divisor}: quotient`);
    assert.equal(exactPolynomialPlainText(key.remainder, key.letter), remainder, `${dividend} ÷ ${divisor}: remainder`);
    const work = divisionKeyWork(long(dividend, divisor));
    assert.ok(divides(dividend, divisor, work.quotient, work.remainder), `${dividend} = (${divisor})(${work.quotient}) + ${work.remainder}`);
  }
});

test('long division: one round per nonzero quotient term — divide, multiply back, subtract and bring down one term', () => {
  const work = divisionKeyWork(long('x^3-4x+2', 'x+3'));
  // The textbook's lines (TEKS review example): x³ + 0x² − 4x + 2.
  assert.deepEqual(work, {
    terms: ['x^2', '-3x', '5'],
    products: ['x^3+3x^2', '-3x^2-9x', '5x+15'],
    differences: ['-3x^2-4x', '5x+2', '-13'],
    quotient: 'x^2-3x+5',
    remainder: '-13',
  });
  // A power with nothing left in it adds no round: x⁴ + 2x² + 1 has no x³ to divide.
  assert.equal(longDivisionKey(long('x^4+2x^2+1', 'x^2+1')).rounds.length, 2);
});

const SYNTHETIC = [
  // dividend, divisor, r, coefficient row, bottom row, quotient, remainder over the divisor
  ['x^3-4x^2+6x-4', 'x-2', '2', '1, −4, 6, −4', '1, −2, 2, 0', 'x² − 2x + 2', '0'],
  ['x^2+8x+7', 'x+1', '−1', '1, 8, 7', '1, 7, 0', 'x + 7', '0'],
  ['g^4-3g^2-18', 'g-2', '2', '1, 0, −3, 0, −18', '1, 2, 1, 2, −14', 'g³ + 2g² + g + 2', '−14'],
  // The slides' Example 5 and its Check Your Progress: divide through by 2 first.
  ['4y^3-6y^2+4y-1', '2y-1', '1/2', '2, −3, 2, −1/2', '2, −2, 1, 0', '2y² − 2y + 1', '0'],
  ['8y^3-12y^2+4y+10', '2y+1', '−1/2', '4, −6, 2, 5', '4, −8, 6, 2', '4y² − 8y + 6', '4'],
  // Textbook 8: (10x² + 15x + 20) ÷ (5x + 5) = 2x + 1 + 3/(x + 1) = 2x + 1 + 15/(5x + 5).
  ['10x^2+15x+20', '5x+5', '−1', '2, 3, 4', '2, 1, 3', '2x + 1', '15'],
];

test('synthetic division: r, the coefficient row with its zeros, the bottom row, the quotient and the remainder over the divisor', () => {
  for (const [dividend, divisor, r, coefficients, bottom, quotient, remainder] of SYNTHETIC) {
    const key = syntheticDivisionKey(synthetic(dividend, divisor));
    assert.ok(key, `${dividend} ÷ ${divisor} can be drawn`);
    assert.equal(ratioPlainText(key.r), r, `${dividend} ÷ ${divisor}: r`);
    assert.equal(key.coefficients.map(ratioPlainText).join(', '), coefficients, `${dividend} ÷ ${divisor}: coefficients`);
    assert.equal(key.bottom.map(ratioPlainText).join(', '), bottom, `${dividend} ÷ ${divisor}: bottom row`);
    assert.equal(exactPolynomialPlainText(key.quotient, key.letter), quotient, `${dividend} ÷ ${divisor}: quotient`);
    assert.equal(ratioPlainText(key.remainderOverDivisor), remainder, `${dividend} ÷ ${divisor}: remainder`);
    const work = divisionKeyWork(synthetic(dividend, divisor));
    assert.ok(divides(dividend, divisor, work.quotient, key.scaled ? work.remainder : work.sums.at(-1)), `${dividend} = (${divisor})(${work.quotient}) + remainder`);
    // Synthetic and long division agree.
    const longKey = longDivisionKey(long(dividend, divisor));
    assert.equal(exactPolynomialPlainText(longKey.quotient, longKey.letter), quotient);
    assert.equal(exactPolynomialPlainText(longKey.remainder, longKey.letter), remainder);
  }
});

/* ------------------------------------------------------- the grading */

test('long division: the key work is right, and every box is a part — a pasted quotient and remainder earn 2 of 11', () => {
  const question = long('x^3-4x+2', 'x+3');
  const work = divisionKeyWork(question);
  const right = grade(question, work);
  assert.deepEqual([right.graded, right.isCorrect, right.isComplete, right.score], [true, true, true, 1]);
  assert.deepEqual(right.parts.map((part) => part.id), [
    'round-1-term', 'round-1-product', 'round-1-difference',
    'round-2-term', 'round-2-product', 'round-2-difference',
    'round-3-term', 'round-3-product', 'round-3-difference',
    'quotient', 'remainder',
  ]);
  const pasted = grade(question, { quotient: work.quotient, remainder: work.remainder });
  assert.equal(pasted.isCorrect, false);
  assert.equal(pasted.isComplete, false, 'a deadline never submits the answer alone as finished work');
  assert.ok(Math.abs(pasted.score - 2 / 11) < 1e-9, `the answer alone scores ${pasted.score}`);
});

test('long division: a slip is marked where it happens', () => {
  const question = long('x^3-4x+2', 'x+3');
  const work = divisionKeyWork(question);
  // Subtracting −9x as −9x (only the first sign changed): −4x − 9x.
  const slip = grade(question, { ...work, differences: ['-3x^2-4x', '-13x+2', '-13'] });
  assert.deepEqual(wrongIds(slip), ['round-2-difference']);
  // A product left as a product has not been multiplied back.
  assert.deepEqual(wrongIds(grade(question, { ...work, products: ['x^2(x+3)', ...work.products.slice(1)] })), ['round-1-product']);
  // The quotient and remainder are answers: simplest form, no placeholder.
  assert.deepEqual(wrongIds(grade(question, { ...work, quotient: 'x^2+0x-3x+5' })), ['quotient']);
});

test('long division: bring down one term as on paper, or more — but not none — and a 0 may hold a place', () => {
  const question = long('x^3-8', 'x-2');
  const work = divisionKeyWork(question);
  assert.deepEqual(work.differences, ['2x^2', '4x-8', '0']);
  const id = 'round-1-difference';
  const verdict = (line) => grade(question, { ...work, differences: [line, ...work.differences.slice(1)] }).parts.find((part) => part.id === id).isCorrect;
  assert.equal(verdict('2x^2+0x'), true, 'the 0x brought down holds its place');
  assert.equal(verdict('2x^2-8'), true, 'everything brought down');
  assert.equal(verdict('2x^2+0x-8'), true);
  assert.equal(verdict('2x^2-2x'), false);
  // x³ + 0x² − 4x + 2 ÷ (x + 3): bringing nothing down leaves −3x², which the next round cannot use.
  const textbook = long('x^3-4x+2', 'x+3');
  const textbookWork = divisionKeyWork(textbook);
  const line = (value) => grade(textbook, { ...textbookWork, differences: [value, ...textbookWork.differences.slice(1)] }).parts.find((part) => part.id === id).isCorrect;
  assert.equal(line('-3x^2-4x'), true);
  assert.equal(line('-3x^2-4x+2'), true);
  assert.equal(line('-3x^2'), false, 'nothing brought down');
});

test('a working line may hold a 0 in a power’s place; an answer may not', () => {
  assert.equal(readWorkingLine('2x^2+0x').length, 1);
  assert.equal(readWorkingLine('x^2(x+3)'), null);
  assert.equal(readWorkingLine('2x+3x'), null, 'like terms not combined');
  assert.equal(simplifiedPolynomialProblem('2x^2+0x'), 'zeroTerm', 'the typed-answer reader is unchanged');
  assert.equal(readTypedPolynomial('0x^2+3x', { allowZeroTerms: true }).problem, null);
  assert.equal(readTypedPolynomial('0x^2+2*3x', { allowZeroTerms: true }).problem, 'product', 'a placeholder excuses only itself');
});

test('synthetic division: the key work is right, every number is a part, and the textbook’s errors are marked where they happen', () => {
  const question = synthetic('g^4-3g^2-18', 'g-2');
  const work = divisionKeyWork(question);
  const right = grade(question, work);
  assert.deepEqual([right.isCorrect, right.isComplete, right.score], [true, true, 1]);
  assert.equal(right.parts.length, 1 + 5 + 4 + 5 + 1);
  assert.equal(right.parts.some((part) => part.id === 'remainder'), false, 'x − r: the last bottom number is the remainder');
  const pasted = grade(question, { quotient: work.quotient });
  assert.ok(Math.abs(pasted.score - 1 / 16) < 1e-9, `the quotient alone scores ${pasted.score}`);
  // Leaving out the zeros: 1, −3, −18 in the first three columns.
  const noZeros = grade(question, { ...work, coefficients: ['1', '-3', '-18', '', ''] });
  assert.deepEqual(wrongIds(noZeros).filter((id) => id.startsWith('coefficient')), ['coefficient-2', 'coefficient-3', 'coefficient-4', 'coefficient-5']);
  // Error analysis (textbook 43): r = −3 for x − 3 divides by x + 3.
  const sharon = synthetic('2x^3-4x^2+3x-1', 'x-3');
  const jamal = grade(sharon, { ...divisionKeyWork(synthetic('2x^3-4x^2+3x-1', 'x+3')), quotient: divisionKeyWork(sharon).quotient });
  assert.ok(wrongIds(jamal).includes('r'));
  assert.equal(divisionKeyWork(sharon).sums.at(-1), '26');
});

test('synthetic division with a divisor ax + b: divide through by a, and the remainder goes back over ax + b', () => {
  const question = synthetic('8y^3-12y^2+4y+10', '2y+1');
  const work = divisionKeyWork(question);
  assert.deepEqual(work, { r: '-1/2', coefficients: ['4', '-6', '2', '5'], products: ['-2', '4', '-3'], sums: ['4', '-8', '6', '2'], quotient: '4y^2-8y+6', remainder: '4' });
  assert.equal(grade(question, work).isCorrect, true);
  // Fractions and decimals both read: −0.5 is −1/2.
  assert.equal(grade(question, { ...work, r: '-0.5', coefficients: ['4', '-6', '2', '5'] }).isCorrect, true);
  // The table's remainder, 2, is over y + 1/2 — not over 2y + 1.
  assert.deepEqual(wrongIds(grade(question, { ...work, remainder: '2' })), ['remainder']);
});

test('a question the workshop cannot draw is not graded against the student', () => {
  for (const question of [
    long('x^3+y', 'x+1'), // two letters
    long('x^2+1', 'x^3+1'), // the divisor's degree is higher
    long('x^7+1', 'x+1'), // past the degree the view draws
    long('x^2+0.5x', 'x+1'), // not whole-number coefficients
    long('x^2+1', '3'), // a constant divisor
    synthetic('x^3-4x+2', 'x^2+3'), // synthetic division needs a linear divisor
    { type: TYPE, mode: 'longDivision' },
  ]) {
    const result = grade(question, { quotient: 'x' });
    assert.equal(result.graded, false, `${question.dividend} ÷ ${question.divisor}`);
    assert.ok(validateToolQuestion(question).errors.length > 0, `Pre-Flight refuses ${question.dividend} ÷ ${question.divisor}`);
  }
});

test('Pre-Flight accepts the new modes; the existing coefficient-list division view is unchanged', () => {
  assert.deepEqual(validateToolQuestion(long('x^3-4x+2', 'x+3')).errors, []);
  assert.deepEqual(validateToolQuestion(synthetic('4y^3-6y^2+4y-1', '2y-1')).errors, []);
  const old = { type: TYPE, mode: 'division', dividend: [1, -4, -7, 10], divisor: [1, -2] };
  assert.deepEqual(validateToolQuestion(old).errors, []);
  assert.equal(grade(old, { quotient: '1, -2, -11', remainder: '-12' }).isCorrect, true);
  assert.equal(resolveToolMode(declaration, long('x^2-1', 'x-1')), 'longDivision');
  assert.equal(resolveToolMode(declaration, synthetic('x^2-1', 'x-1')), 'syntheticDivision');
});

test('a V5 lesson compiles the new actions with the dividend and divisor as written', () => {
  const lesson = {
    schemaVersion: 5,
    assignment: { title: 'Division check', courseId: 'algebra2', folder: 'Algebra II/Test', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{
      id: 'classwork', role: 'classwork', title: 'Classwork', recommendedMinutes: 10, feedbackMode: 'immediate', hintsAllowed: true, attemptsAllowed: 3,
      questions: [
        { questionId: 'long', standard: 'A2.7C', studentActions: ['longDivision'], dok: 2, difficultyBand: 2, prompt: 'Use long division to find $(x^3 - 4x + 2) \\div (x + 3)$.', polynomial: { dividend: 'x^3-4x+2', divisor: 'x+3' }, hints: ['Divide the leading terms.', 'Multiply back and subtract.'] },
        { questionId: 'synthetic', standard: 'A2.7C', studentActions: ['synthetic division'], dok: 2, difficultyBand: 2, prompt: 'Use synthetic division to find $(x^3 - 4x^2 + 6x - 4) \\div (x - 2)$.', polynomial: { dividend: 'x^3-4x^2+6x-4', divisor: 'x-2' }, hints: ['r = 2.', 'Bring down, multiply, add.'] },
      ],
    }],
  };
  const { model, questions } = compileTeacherImport(JSON.stringify(lesson));
  assert.deepEqual(model.errors, []);
  const byId = Object.fromEntries(questions.map((question) => [question.questionId, question]));
  assert.deepEqual([byId.long.type, byId.long.mode, byId.long.dividend, byId.long.divisor], [TYPE, 'longDivision', 'x^3-4x+2', 'x+3']);
  assert.deepEqual([byId.synthetic.mode, byId.synthetic.dividend, byId.synthetic.divisor], ['syntheticDivision', 'x^3-4x^2+6x-4', 'x-2']);
});

test('the worked solution after the last try states the key the grader accepts, and the answer key prints every step', () => {
  for (const question of [long('x^3-4x+2', 'x+3'), long('y^4-3y^3+2y^2-20', 'y^2+y-5'), synthetic('8y^3-12y^2+4y+10', '2y+1'), synthetic('g^4-3g^2-18', 'g-2')]) {
    const review = buildPolynomialWorkshopReview(question);
    assert.ok(review, `${question.dividend} ÷ ${question.divisor} has a worked solution`);
    assert.ok(review.steps.length >= 3 && review.steps.length <= 12);
    assert.ok(review.why.length > 0);
    const lines = polynomialWorkshopAnswerLines(question);
    assert.ok(lines.length >= 4, `${question.dividend} ÷ ${question.divisor} prints its steps`);
  }
  const review = buildPolynomialWorkshopReview(long('x^3-4x+2', 'x+3'));
  assert.match(review.steps[0], /x\^\{3\}\+0x\^\{2\}-4x\+2/, 'the placeholder is written out');
  assert.match(review.steps[1], /\(x\^\{3\}\+0x\^\{2\}\) - \(x\^\{3\}\+3x\^\{2\}\) = -3x\^\{2\}/);
  assert.deepEqual(polynomialWorkshopAnswerLines(synthetic('8y^3-12y^2+4y+10', '2y+1')), [
    'r = −1/2 (dividend and divisor divided by 2 first)',
    'Coefficient row: 4, −6, 2, 5',
    'Products row: −2, 4, −3',
    'Bottom row: 4, −8, 6, 2 (remainder 2)',
    'Quotient: 4y² − 8y + 6',
    'Remainder over 2y + 1: 4',
  ]);
});

test('the workload: long division counts its rounds, synthetic division its columns', () => {
  const units = (question) => estimateQuestionValue(question).units;
  assert.ok(units(long('x^3-4x+2', 'x+3')) > units({ type: TYPE, mode: 'division', dividend: [1, 0, -4, 2], divisor: [1, 3] }), 'more than the answer-only view');
  assert.ok(units(synthetic('g^4-3g^2-18', 'g-2')) >= units(synthetic('x^2+8x+7', 'x+1')));
});

/* --------------------------------------------------------- the screen */

const code = executableSource(fs.readFileSync(new URL('../../src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', import.meta.url), 'utf8'));

test('the screen routes both modes, sends the work the grader reads, and marks only a visible verdict', () => {
  const router = region(code, 'export default function PolynomialWorkshop', '\nfunction ', 'router');
  assert.match(router, /if \(mode === 'longDivision'\) return <LongDivision /);
  assert.match(router, /if \(mode === 'syntheticDivision'\) return <SyntheticDivision /);
  const longView = region(code, 'function LongDivision({', '\nfunction SyntheticDivision', 'long division view');
  assert.match(longView, /const work=\{terms,products,differences,quotient,remainder\};/);
  assert.match(longView, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \},work,\{mode:'longDivision',parts:result\.parts\}\);/);
  const syntheticView = region(code, 'function SyntheticDivision({', '\nfunction GraphConnection', 'synthetic division view');
  assert.match(syntheticView, /const work = scaled \? \{r,coefficients,products,sums,quotient,remainder\} : \{r,coefficients,products,sums,quotient\};/);
  // Marks come from a verdict the student was shown; an exit ticket shows none.
  assert.match(code, /const wrongPartIds = \(feedback\) => new Set\(feedback && !feedback\.isCorrect/);
  // Every box clears the verdict it would contradict.
  assert.match(longView, /const at = \(setter\) => \(index, value\) => \{ clearFeedback\(\); setter/);
  assert.match(syntheticView, /const at = \(setter, length\) => \(index, value\) => \{ clearFeedback\(\); setter/);
});
