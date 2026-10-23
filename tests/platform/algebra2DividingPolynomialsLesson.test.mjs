/*
 * ALGEBRA II HONORS · MODULE 2 · LESSON 2 — DIVIDING POLYNOMIALS (A2.7C),
 * AS A TEACHER IMPORTS IT.
 *
 * Built from the district's lesson slides (the Do Now; Example 1, dividing by
 * a monomial; Example 2, the division algorithm; Example 3, the test item
 * (a² − 5a + 3)(2 − a)⁻¹; Example 4, synthetic division; Example 5, a divisor
 * whose first coefficient is not 1; and each Check Your Progress) and
 * textbook Lesson 5-2 (Exercises 3, 6, 7, 10, 12, 15, 18, 19, 25, 32–34, 36,
 * 41, 43–47 and 49–51, the TEKS review example, Name the Math and the
 * Extension).
 *
 * Everything reads the file through the same chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), and every verdict comes from the shared
 * graders the server runs. Each key is re-derived here by EVALUATING the
 * original expression and the key at several points with plain JavaScript —
 * never with the platform's polynomial reader — so a key cannot pass by
 * agreeing with itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { divisionKeyWork } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { answerLinesFromResolvedQuestion } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';
import { workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json');
const TEXT = fs.readFileSync(FILE, 'utf8');
const LESSON = { raw: JSON.parse(TEXT), ...compileTeacherImport(TEXT) };
const compiled = (id) => {
  const question = LESSON.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the import compiles ${id}`);
  return question;
};
const field = (id, fieldId) => compiled(id).answerFields.find((entry) => entry.id === fieldId);
const workshop = (question, work) => gradeServerResponse({ question, response: buildToolResponse({ question, toolId: 'polynomialWorkshop', work }) });

/* -------------------------------------------- independent arithmetic */

// "a^3+8a-9", "−3x/(2 − a)", "(x^2+y^2)(x+y)" → a JavaScript function of its
// letters. Unicode minus and powers are read; implicit products written out;
// a power is parenthesized (JavaScript refuses -x**2).
const toJs = (text) => String(text)
  .replace(/[−–]/g, '-')
  .replace(/\s+/g, '')
  .replace(/([a-z]|\))\^(\d+)/g, '($1**$2)')
  .replace(/(\d|\))(?=[a-z(])/g, '$1*')
  .replace(/([a-z])(?=[a-z(\d])/g, '$1*');
const LETTERS = 'abcgmnprtwxyz';
const POINTS = [-3, -1.5, 0.5, 2, 3.25].map((value, index) => Object.fromEntries(LETTERS.split('').map((letter, k) => [letter, value + k * 0.37 + index * 0.11])));
const evaluate = (text, point) => Function(...LETTERS, `return ${toJs(text)};`)(...LETTERS.split('').map((letter) => point[letter] ?? 0));
const sameEverywhere = (original, key) => POINTS.every((point) => Math.abs(evaluate(original, point) - evaluate(key, point)) <= 1e-6 * Math.max(1, Math.abs(evaluate(original, point))));
// Plain-text choices and labels ("4m²n⁶ + 9m⁶n³", "−x − 7 + 19/(4 − x)") as expressions.
const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const ascii = (text) => String(text).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => `^${[...run].map((character) => SUPERSCRIPT[character]).join('')}`);

/* ------------------------------------------------------------ shape */

test('the lesson passes the teacher import with no errors and no warnings', () => {
  assert.deepEqual(LESSON.model.errors, []);
  assert.equal(LESSON.model.isValid, true);
  assert.deepEqual(LESSON.semantic.errors, []);
  assert.deepEqual(LESSON.semantic.warnings, []);
  assert.deepEqual(LESSON.model.warnings, []);
});

test('one 90-minute lesson in the four sections; the DOL is an exit ticket', () => {
  const sections = LESSON.raw.sections;
  assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.equal(sections.reduce((total, section) => total + section.recommendedMinutes, 0), 90);
  assert.deepEqual(sections.map((section) => section.questions.length), [3, 11, 16, 3]);
  const dol = sections[3];
  assert.equal(dol.attemptsAllowed, 1);
  assert.equal(dol.hintsAllowed, false);
  assert.equal(dol.feedbackMode, 'afterAssignmentSubmit');
  for (const question of dol.questions) {
    assert.equal(question.hints, undefined, `${question.questionId}: no hints on the DOL`);
    assert.equal(question.guidedNotes, undefined, `${question.questionId}: no guided notes on the DOL`);
    assert.equal(question.solutionReview, undefined, `${question.questionId}: no worked solution on the DOL`);
  }
  for (const question of sections.slice(0, 3).flatMap((section) => section.questions)) {
    assert.ok(question.hints?.length >= 2, `${question.questionId} offers hints`);
    assert.doesNotMatch(question.hints.join(' '), /\$|\\[a-z]+/, `${question.questionId}: hints are plain Unicode, not LaTeX`);
  }
  assert.equal(LESSON.questions.length, 33, 'every question survives the import');
  assert.ok(LESSON.questions.every((question) => question.standard === 'A2.7C'));
});

/* ------------------------------------- the rich tools carry the divisions */

const TOOLS = Object.freeze({
  'dp-cw-3': ['longDivision', 'x^2-2x-15', 'x-5'],
  'dp-cw-4': ['longDivision', 'x^2+5x+6', 'x+3'],
  'dp-cw-5': ['longDivision', 'x^3-4x+2', 'x+3'],
  'dp-cw-6': ['longDivision', 'a^2-5a+3', '-a+2'],
  'dp-cw-8': ['syntheticDivision', 'x^3-4x^2+6x-4', 'x-2'],
  'dp-cw-9': ['syntheticDivision', 'x^2+8x+7', 'x+1'],
  'dp-cw-10': ['syntheticDivision', '4y^3-6y^2+4y-1', '2y-1'],
  'dp-pr-3': ['longDivision', 'x^2-6x-20', 'x+2'],
  'dp-pr-4': ['syntheticDivision', 'g^4-3g^2-18', 'g-2'],
  'dp-pr-6': ['longDivision', '12b^2+23b+15', '3b+8'],
  'dp-pr-9': ['syntheticDivision', 't^3+9t^2+26t+24', 't+4'],
  'dp-pr-14': ['longDivision', 'y^4-3y^3+2y^2-20', 'y^2+y-5'],
  'dp-pr-15': ['syntheticDivision', '3x^4-4x^3+5x^2-7', 'x-2'],
  'dp-dol-2': ['longDivision', '2x^3-5x^2+7', 'x-3'],
  'dp-dol-3': ['syntheticDivision', 'x^4-5x^2+3x-4', 'x+2'],
});

// The quotient and remainder the slides and the textbook print — never computed here.
const PRINTED = Object.freeze({
  'dp-cw-3': ['x+3', '0'],
  'dp-cw-4': ['x+2', '0'],
  'dp-cw-5': ['x^2-3x+5', '-13'],
  'dp-cw-6': ['-a+3', '-3'],
  'dp-cw-8': ['x^2-2x+2', '0'],
  'dp-cw-9': ['x+7', '0'],
  'dp-cw-10': ['2y^2-2y+1', '0'],
  'dp-pr-3': ['x-8', '-4'],
  'dp-pr-4': ['g^3+2g^2+g+2', '-14'],
  'dp-pr-6': ['4b-3', '39'],
  'dp-pr-9': ['t^2+5t+6', '0'],
  'dp-pr-14': ['y^2-4y+11', '-31y+35'],
  'dp-pr-15': ['3x^3+2x^2+9x+18', '29'],
  'dp-dol-2': ['2x^2+x+3', '16'],
  'dp-dol-3': ['x^3-2x^2-x+5', '-14'],
});

test('the rich tools carry every division: Workshop long and synthetic division, each drawn, reviewed and printed', () => {
  const tools = Object.fromEntries(LESSON.questions.filter((question) => question.type === 'polynomialWorkshop').map((question) => [question.questionId, [question.mode, question.dividend, question.divisor]]));
  assert.deepEqual(tools, TOOLS);
  for (const id of Object.keys(tools)) {
    const question = compiled(id);
    assert.deepEqual(validateToolQuestion(question).errors, [], `${id} is a question the workshop can draw`);
    assert.ok(buildToolSolutionReviewModel(question)?.steps?.length, `${id} has a worked solution once it closes`);
    assert.ok(answerLinesFromResolvedQuestion(question).length >= 4, `${id} prints its steps in the answer key`);
  }
});

test('every Workshop division is the textbook’s: dividend = divisor × printed quotient + remainder, and the key work is graded right', () => {
  for (const [id, [mode, dividend, divisor]] of Object.entries(TOOLS)) {
    const [quotient, remainder] = PRINTED[id];
    // For 2y − 1 the slides' remainder is over 2y − 1 too: plain arithmetic.
    assert.ok(POINTS.every((point) => {
      const x = point.x;
      const value = (text) => evaluate(text.replace(/[a-z]/g, 'x'), { x });
      return Math.abs(value(dividend) - (value(divisor) * value(quotient) + value(remainder))) <= 1e-9 * Math.max(1, Math.abs(value(dividend)));
    }), `${id}: ${dividend} = (${divisor})(${quotient}) + ${remainder}`);
    const question = compiled(id);
    const work = divisionKeyWork(question);
    assert.equal(work.quotient, quotient, `${id}: the key's quotient is the printed one`);
    if (mode === 'longDivision') assert.equal(work.remainder, remainder, `${id}: the key's remainder`);
    else assert.equal(question.divisor.startsWith('2') ? work.remainder : work.sums.at(-1), remainder, `${id}: the key's remainder`);
    assert.equal(workshop(question, work).isCorrect, true, `${id}: the key work is right`);
  }
});

/* --------------------------------------------- the DOL shows the work */

test('DOL Q2: every round is graded, so a quotient and remainder pasted from a solver earn 2 of 11', () => {
  const question = compiled('dp-dol-2');
  const work = divisionKeyWork(question);
  assert.deepEqual(work, {
    terms: ['2x^2', 'x', '3'],
    products: ['2x^3-6x^2', 'x^2-3x', '3x-9'],
    differences: ['x^2', '3x+7', '16'],
    quotient: '2x^2+x+3',
    remainder: '16',
  });
  const pasted = workshop(question, { quotient: work.quotient, remainder: work.remainder });
  assert.equal(pasted.isCorrect, false);
  assert.ok(Math.abs(pasted.score - 2 / 11) < 1e-9, `the answer alone scores ${pasted.score}`);
  // Leaving out the 0x placeholder costs nothing on screen — but bringing down
  // nothing after the first subtraction is marked where it happens.
  const slip = workshop(question, { ...work, differences: ['x^2+0x', '3x+7', '16'] });
  assert.equal(slip.isCorrect, true);
});

test('DOL Q3: r, every number of the table and the quotient are graded — a quotient pasted from a solver earns 1 of 16', () => {
  const question = compiled('dp-dol-3');
  const work = divisionKeyWork(question);
  assert.deepEqual(work, { r: '-2', coefficients: ['1', '0', '-5', '3', '-4'], products: ['-2', '4', '2', '-10'], sums: ['1', '-2', '-1', '5', '-14'], quotient: 'x^3-2x^2-x+5' });
  const pasted = workshop(question, { quotient: work.quotient });
  assert.ok(Math.abs(pasted.score - 1 / 16) < 1e-9, `the quotient alone scores ${pasted.score}`);
  // r = 2 for x + 2 (Jamal's mistake) is marked at r and in every column it reaches.
  const wrongR = workshop(question, { ...divisionKeyWork({ ...question, divisor: 'x-2' }), quotient: work.quotient });
  assert.ok(wrongR.parts.find((part) => part.id === 'r').isCorrect === false);
});

test('the DOL prompts do not print what they grade', () => {
  for (const id of ['dp-dol-1', 'dp-dol-2', 'dp-dol-3']) {
    const prompt = compiled(id).prompt.replace(/\s/g, '');
    assert.doesNotMatch(prompt, /2x\^2y-3x\+1|2x\^2\+x\+3|x\^3-2x\^2-x\+5|=16|-14/, `${id} does not print its answer`);
  }
});

/* ------------------------------------------- every key, independently */

// The expression each typed polynomial simplifies, written out from the slide
// or the textbook — never from the key.
const ORIGINALS = {
  'dp-wu-1.single': '(18x^5)/(3x^2)',
  'dp-wu-1.double': '(-20m^4n^3)/(5m^2n)',
  'dp-wu-2.trinomial': '7w(2w^2+8w-5)',
  'dp-wu-2.binomial': '-3x(x+3)',
  'dp-wu-3.general': '(10a^2-6ab+b^2)-(5a^2-2b^2)',
  'dp-wu-3.division': '(-3x^2-4x)-(-3x^2-9x)',
  'dp-cw-1.t1': '(5a^2b)/(5ab)',
  'dp-cw-1.t2': '(-15ab^3)/(5ab)',
  'dp-cw-1.t3': '(10a^3b^4)/(5ab)',
  'dp-cw-1.quotient': '(5a^2b-15ab^3+10a^3b^4)/(5ab)',
  'dp-cw-2.quotient': '(3x^2y+6x^5y^2-9x^7y^3)/(3x^2y)',
  'dp-pr-1.p12': '(24a^3b^2-16a^2b^3)/(8ab)',
  'dp-pr-1.p15': '(4a^3b-6ab+2ab^2)/(2ab)',
  'dp-pr-2.energy': '(-b^2-600b)/b',
  'dp-pr-2.polynomialPart': '(-w^2+16w+1000)/w-1000/w',
  'dp-pr-8.base': '(6x^3+31x^2+53x+30)/(x+2)',
  'dp-pr-8.other': '(6x^3+31x^2+53x+30)/((x+2)(2x+3))',
  'dp-pr-10.expression': '7x+(x+40)',
  'dp-pr-10.quotient': '(7x+(x+40))/(x+5)',
  'dp-pr-16.p36': '(x^4-y^4)/(x-y)',
  'dp-pr-16.p41quotient': '(3z^5+5z^4+z+5+13)/(z+2)',
  'dp-dol-1.t1': '(12x^4y^2)/(6x^2y)',
  'dp-dol-1.t2': '(-18x^3y)/(6x^2y)',
  'dp-dol-1.t3': '(6x^2y)/(6x^2y)',
  'dp-dol-1.quotient': '(12x^4y^2-18x^3y+6x^2y)/(6x^2y)',
};

test('every typed polynomial key has the value of the expression it simplifies, and asks for simplest form', () => {
  const polynomialFields = LESSON.questions.flatMap((question) => (question.answerFields || [])
    .filter((entry) => entry.answerForm)
    .map((entry) => [`${question.questionId}.${entry.id}`, entry]));
  assert.deepEqual(polynomialFields.map(([id]) => id).sort(), Object.keys(ORIGINALS).sort(), 'every simplest-form field is checked here');
  for (const [id, entry] of polynomialFields) {
    assert.equal(entry.answerForm, 'simplifiedPolynomial');
    assert.ok(sameEverywhere(ORIGINALS[id], entry.answer), `${id}: ${ORIGINALS[id]} = ${entry.answer}`);
  }
});

test('the numbers: remainders by plain arithmetic, the degree, c, the card trick and the exponent', () => {
  const at = (text, x) => evaluate(text, { x });
  // A remainder is the dividend's value where the divisor is 0.
  assert.equal(field('dp-cw-7', 'remainder').answer, String(at('x^2-x-7', 3)));
  assert.equal(field('dp-pr-5', 'remainder').answer, String(at('x^2+3x-9', 4)));
  assert.equal(field('dp-pr-7', 'p50').answer, String(at('x^4+3x^2+x+6', -3)));
  assert.equal(field('dp-pr-11', 'remainder').answer, String(at('2x^3-4x^2+3x-1', 3)));
  assert.equal(at('2x^3-4x^2+3x-1', -3), -100, 'Jamal’s −100 is the remainder for x + 3');
  assert.equal(field('dp-pr-8', 'remainder').answer, String(at('6x^3+31x^2+53x+30', -2)));
  assert.equal(field('dp-pr-16', 'p41remainder').answer, String(at('3x^5+5x^4+x+5', -2)));
  // 2y + 1: the dividend at −1/2, over 2y + 1; and over y + 1/2 it is half that.
  const remainder = evaluate('8y^3-12y^2+4y+10', { y: -0.5 });
  assert.equal(field('dp-cw-11', 'remainder').answer, String(remainder));
  assert.equal(Number(field('dp-cw-11', 'tableRemainder').answer), remainder / 2);
  assert.equal(field('dp-cw-11', 'r').answer, '-1/2');
  assert.equal(field('dp-pr-12', 'degree').answer, String(4 - 2));
  const c = Number(field('dp-pr-12', 'c').answer);
  assert.equal(evaluate(`x^2+5x+${c}`, { x: -2 }), 3, 'x² + 5x + c leaves 3 over x + 2');
  assert.equal(field('dp-pr-13', 'exponent').answer, '-2');
});

test('the choices: each right option is equal to the original by value, and the distractors are not', () => {
  const choices = {
    'dp-cw-7.example3': '(a^2-5a+3)/(2-a)',
    'dp-cw-7.cyp': '(x^2-x-7)/(x-3)',
    'dp-cw-11.answer': '(8y^3-12y^2+4y+10)/(2y+1)',
    'dp-pr-5.answer': '(x^2+3x-9)/(4-x)',
    'dp-pr-7.p49': '(16m^4n^9+36m^8n^6+8m^6n^12)/(4m^2n^3)',
    'dp-pr-7.p51': '(m^2-3m+7)/(m-5)',
  };
  for (const [id, original] of Object.entries(choices)) {
    const [questionId, fieldId] = id.split('.');
    const entry = field(questionId, fieldId);
    assert.ok(sameEverywhere(original, ascii(entry.answer)), `${id}: ${entry.answer}`);
    entry.options.filter((option) => option !== entry.answer).forEach((option) => assert.ok(!sameEverywhere(original, ascii(option)), `${id}: "${option}" is not equal`));
  }
});

test('the TEKS items keep the textbook’s diagnosed choices, and each is the error it names', () => {
  // 49 (Diagnose Student Errors): A divides the exponents, C subtracts the
  // coefficients and divides the exponents, D subtracts the coefficients.
  const [A, B, C, D] = field('dp-pr-7', 'p49').options.map(ascii);
  assert.ok(sameEverywhere('4m^2n^6+9m^6n^3+2m^4n^9', B), 'B is the quotient');
  assert.ok(sameEverywhere('(16/4)m^(4/2)n^(9/3)+(36/4)m^(8/2)n^(6/3)+(8/4)m^(6/2)n^(12/3)', A.replace(/\^(\d+)/g, '^($1)')), 'A divides the exponents');
  assert.ok(sameEverywhere('(16-4)m^(4/2)n^(9/3)+(36-4)m^(8/2)n^(6/3)+(8-4)m^(6/2)n^(12/3)', C.replace(/\^(\d+)/g, '^($1)')), 'C subtracts coefficients, divides exponents');
  assert.ok(sameEverywhere('(16-4)m^2n^6+(36-4)m^6n^3+(8-4)m^4n^9', D), 'D subtracts the coefficients');
  assert.equal(field('dp-pr-7', 'p49').answer, field('dp-pr-7', 'p49').options[1]);
  // 51: H is the quotient (the textbook's key).
  assert.equal(field('dp-pr-7', 'p51').answer, 'm + 2 + 17/(m − 5)');
  // The slides' Example 3 is D, its Check Your Progress B; the textbook's 7 is A.
  assert.equal(field('dp-cw-7', 'example3').answer, field('dp-cw-7', 'example3').options[3]);
  assert.equal(field('dp-cw-7', 'cyp').answer, field('dp-cw-7', 'cyp').options[1]);
  assert.equal(field('dp-pr-5', 'answer').answer, field('dp-pr-5', 'answer').options[0]);
  assert.equal(field('dp-cw-11', 'answer').answer, field('dp-cw-11', 'answer').options[1]);
});

test('every typed and chosen key is accepted by the shared grader, and a wrong answer is not', () => {
  for (const question of LESSON.questions.filter((candidate) => candidate.type === 'multiAnswer')) {
    const fields = question.answerFields;
    const right = Object.fromEntries(fields.map((entry) => [entry.id, String(entry.answer)]));
    assert.equal(gradeMultiAnswerResponse(question, right).isCorrect, true, `${question.questionId}: its own key is correct`);
    for (const entry of fields) {
      const wrong = entry.type === 'choice' ? entry.options.find((option) => option !== entry.answer) : '999';
      assert.equal(gradeMultiAnswerResponse(question, { ...right, [entry.id]: wrong }).isCorrect, false, `${question.questionId}.${entry.id}: "${wrong}" is wrong`);
    }
    for (const entry of fields.filter((candidate) => candidate.type === 'choice')) assert.ok(entry.options.length >= 3, `${question.questionId}.${entry.id}: a real distractor`);
  }
});

test('simplest form is required: the right value, left unsimplified, is not the answer', () => {
  const unsimplified = {
    'dp-wu-1.single': '18x^5/(3x^2)',
    'dp-wu-2.trinomial': '7w*2w^2+7w*8w-7w*5',
    'dp-cw-1.quotient': 'a^1-3b^2+2a^2b^3',
    'dp-cw-2.quotient': '2x^3y-3x^5y^2+3x^2y/(3x^2y)',
    'dp-dol-1.quotient': '2x^2y-3x+1x^0',
  };
  for (const [id, typed] of Object.entries(unsimplified)) {
    const [questionId, fieldId] = id.split('.');
    const question = compiled(questionId);
    const right = Object.fromEntries(question.answerFields.map((entry) => [entry.id, String(entry.answer)]));
    const graded = gradeMultiAnswerResponse(question, { ...right, [fieldId]: typed });
    assert.equal(graded.parts.find((part) => part.id === fieldId).isCorrect, false, `${id}: "${typed}" is not simplified`);
  }
});

/* ------------------------------------------- the worked solutions */

// A worked step is Unicode text ("x⁵ ÷ x² = x⁵⁻² = x³, so …"). Each clause
// with "=" is a chain of sides claimed equal; a side is checked when it reads
// as mathematics in the lesson's letters (the first side may start with
// words, the last may end with them). "With r = 3" and "so c = 9" fix a
// letter for the rest of the line; where some sides are bare numbers, a side
// with a free letter is not an identity and is left out.
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const STEP_LETTERS = 'abcgkmnprtwxyz';
const stepSide = (raw) => {
  let side = raw.trim();
  // One ÷ in a side divides everything before it by everything after it.
  const division = side.split(' ÷ ');
  if (division.length > 2) return null;
  if (division.length === 2) {
    const [top, bottom] = division.map(stepSide);
    return top && bottom ? `(${top})/(${bottom})` : null;
  }
  side = side.replace(/[−–]/g, '-').replace(/[·×]/g, '*')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => `^(${[...run].map((character) => SUPER[character]).join('')})`)
    .replace(/\s+/g, '');
  if (!side || /[^-+*/().\d^a-z]/.test(side) || [...side].some((character) => /[a-z]/.test(character) && !STEP_LETTERS.includes(character))) return null;
  return side.replace(/([a-z]|\d+(?:\.\d+)?|\([^()]*\))\^\(([^()]*)\)/g, '($1**($2))')
    .replace(/(\d|\))(?=[a-z(])/g, '$1*').replace(/([a-z])(?=[a-z(\d])/g, '$1*');
};
const longestSide = (words, fromEnd) => {
  for (let count = words.length; count > 0; count -= 1) {
    const side = stepSide((fromEnd ? words.slice(-count) : words.slice(0, count)).join(' '));
    if (side) return side;
  }
  return null;
};
// "With r = −3 on 1, 0, 3" and "c = 9" name a value rather than claim an identity.
const BINDING = /^(?:With |so )?([a-z]) = (-?[\d.]+)(?: on .*)?$/i;
const stepChains = (line) => {
  const clauses = line.replace(/\.$/, '').split(/: |; |\. |, so |, and |, then | and |, (?=\S)/);
  const bound = {};
  clauses.forEach((clause) => {
    const binding = clause.replace(/[−–]/g, '-').match(BINDING);
    if (binding) bound[binding[1]] = Number(binding[2]);
  });
  const hasFreeLetter = (side) => [...side].some((character) => /[a-z]/.test(character) && !(character in bound));
  return clauses.filter((clause) => clause.includes(' = ') && !BINDING.test(clause.replace(/[−–]/g, '-'))).map((clause) => {
    const parts = clause.split(' = ');
    const sides = parts.map((part, index) => {
      const words = part.trim().split(/\s+/);
      if (index === 0) return longestSide(words, true);
      if (index === parts.length - 1) return longestSide(words, false);
      return stepSide(part);
    }).filter(Boolean);
    return { fixed: bound, sides: sides.some((side) => !hasFreeLetter(side)) ? sides.filter((side) => !hasFreeLetter(side)) : sides };
  }).filter(({ sides }) => sides.length >= 2);
};
const holdsEverywhere = ({ fixed, sides }) => POINTS.every((point) => {
  const values = sides.map((side) => Function(...STEP_LETTERS, `return ${side};`)(...STEP_LETTERS.split('').map((letter) => fixed[letter] ?? point[letter] ?? 0.7)));
  return values.every((value) => Math.abs(value - values[0]) <= 1e-9 * Math.max(1, Math.abs(values[0])));
});

test('every practice-like item walks through steps after the last try, and every equation in those steps is true', () => {
  const practiceLike = LESSON.raw.sections.filter((section) => section.role !== 'dol').flatMap((section) => section.questions);
  assert.equal(practiceLike.length, 30);
  let checked = 0;
  for (const raw of practiceLike) {
    assert.equal(workedSolutionDepth(compiled(raw.questionId)), 'steps', `${raw.questionId} shows worked steps, not only the answer`);
    const review = raw.solutionReview;
    if (!review) continue;
    assert.ok(review.headline && review.commonError && review.reasoning.length >= 2, `${raw.questionId} has a headline, steps and the mistake it catches`);
    const chains = review.reasoning.flatMap(stepChains);
    // Which one doesn't belong is read, not computed: one equation (5/x² = 5x⁻²).
    assert.ok(chains.length >= 1, `${raw.questionId}: its steps are checked (${chains.length} equations read)`);
    chains.forEach((chain) => assert.ok(holdsEverywhere(chain), `${raw.questionId}: ${chain.sides.join(' = ')} holds`));
    checked += chains.length;
  }
  assert.ok(checked >= 60, `${checked} equations checked`);
});

test('the step checker can fail: a false step is caught', () => {
  assert.equal(stepChains('18x⁵ ÷ 3x²: 18 ÷ 3 = 6 and x⁵ ÷ x² = x⁵⁻² = x³.').every(holdsEverywhere), true);
  assert.equal(stepChains('x⁵ ÷ x² = x⁷.').every(holdsEverywhere), false);
  assert.equal(stepChains('So (x² − x − 7)(x − 3)⁻¹ = x + 2 + 1/(x − 3).').every(holdsEverywhere), false, 'the wrong sign on a remainder is caught');
});
