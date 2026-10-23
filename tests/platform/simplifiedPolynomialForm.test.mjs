/*
 * SIMPLEST FORM FOR A TYPED POLYNOMIAL (Algebra II Honors, operations on
 * polynomials).
 *
 * A typed answer is graded by its value, so on "Simplify (2a³ + 5a − 7) −
 * (a³ − 3a + 2)" a student who distributed and stopped — 2a³ + 5a − 7 − a³ +
 * 3a − 2 — was marked right for a³ + 8a − 9, and a retyped product
 * (2a²b)(4a³b) was marked right for 8a⁵b². A field that asks for simplest form
 * (answerForm: 'simplifiedPolynomial') now takes only an answer with nothing
 * left to do, on the device and on the server alike, and a refused answer with
 * the right value is told why. A field that does not ask keeps the old
 * grading exactly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMPLIFIED_POLYNOMIAL_FORM,
  SIMPLIFIED_POLYNOMIAL_PROBLEMS as P,
  simplifiedPolynomialProblem,
} from '../../functions/shared/simplifiedPolynomialForm.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { classifyMisconceptions } from '../../functions/shared/misconceptionClassifiers.mjs';
import { diagnoseMiss } from '../../src/platform/supports/feedback/missDiagnosis.js';
import { displayGradingSurface } from '../../src/platform/grading/displayGradingSurface.js';
import { validateQuestionGradingContracts } from '../../src/platform/grading/gradingContract.js';
import { fieldsResponse } from './helpers/misconceptionFixtures.mjs';

test('what counts as simplest form', () => {
  const simplified = [
    'a^3+8a-9', 'a^{3}+8a-9', '8a+a^3-9', // order is not checked
    '-4y^3-2y^2+3y', '0.003x+24.7', '0',
    '-0.001x^2+5x-500', '-\\frac{1}{1000}x^2+5x-500', '-x^2/1000+5x-500', '5x-500-.001x^2',
    '6x^3y-9x^3y^2+12x^4y^3', '8a^5b^2', '8b^2a^5', 'x^3+x^2y-xy^2-y^3',
    '\\frac{3}{2}x', '\\frac{x}{2}', '\\frac{3x}{2}', '\\frac{-1}{2}x^2', '2x\\cdot y',
  ];
  simplified.forEach((answer) => assert.equal(simplifiedPolynomialProblem(answer), null, answer));
  const notSimplified = [
    ['2a^3+5a-7-a^3+3a-2', P.LIKE_TERMS], ['3x^2y+2yx^2', P.LIKE_TERMS], ['3+5', P.LIKE_TERMS],
    ['(2a^3+5a-7)-(a^3-3a+2)', P.GROUPING], ['-y(4y^2+2y-3)', P.GROUPING], ['(a^2+3a-4)(a+2)', P.GROUPING],
    ['(2a^2b)(4a^3b)', P.PRODUCT], ['2a^2b\\cdot4a^3b', P.PRODUCT], ['x\\cdot x^2', P.PRODUCT], ['2^3x', P.PRODUCT],
    ['(2+3)x', P.PRODUCT], ['2*-3x', P.PRODUCT], ['\\left(x\\right)^{2}', P.PRODUCT],
    ['1x^2+3', P.UNIT_COEFFICIENT], ['-1x^2+x+2', P.UNIT_COEFFICIENT], ['\\frac{6}{4}x', P.LOWEST_TERMS],
    ['x^1+2', P.POWER], ['x^0', P.POWER], ['0x+3', P.ZERO_TERM],
    ['x^{-2}', P.NOT_POLYNOMIAL], ['y^4/(81x^4)', P.NOT_POLYNOMIAL],
    ['x=2', P.UNREADABLE], ['', P.UNREADABLE], ['(x+1', P.UNREADABLE],
  ];
  notSimplified.forEach(([answer, problem]) => assert.equal(simplifiedPolynomialProblem(answer), problem, answer));
});

const field = (answer, extra = {}) => ({ id: 'simplified', label: 'Simplified polynomial', answer, answerForm: SIMPLIFIED_POLYNOMIAL_FORM, ...extra });

// Review (PR #514): a bracket the student typed around a letter, and a sign
// under the bar or written twice, were read as simplified.
test('a typed bracket around a letter is grouping, and a term has one sign, never under the bar', () => {
  [
    ['(x)(y)', P.GROUPING], ['(x)', P.GROUPING], ['-(x)', P.GROUPING], ['x(y)', P.GROUPING], ['2(x)', P.GROUPING],
    ['\\left(x\\right)\\left(y\\right)', P.GROUPING],
    ['\\frac{-3x}{-2}', P.PRODUCT], ['\\frac{3x}{-2}', P.PRODUCT], ['-\\frac{-3x}{2}', P.PRODUCT],
    ['x+\\frac{-1}{2}', P.PRODUCT], ['-(-x)', P.PRODUCT],
  ].forEach(([answer, problem]) => assert.equal(simplifiedPolynomialProblem(answer), problem, answer));
  // A fraction's own grouping is not a typed bracket, and one sign may sit
  // in front of the fraction or inside its numerator.
  ['\\frac{x}{2}', '\\frac{-3x}{2}', '-\\frac{3x}{2}', 'x-\\frac{1}{2}', '\\left(\\frac{1}{2}\\right)x', 'x^{(2)}']
    .forEach((answer) => assert.equal(simplifiedPolynomialProblem(answer), null, answer));
  assert.equal(matchesFieldAnswer('(x)(y)', field('xy')), false);
  assert.equal(matchesFieldAnswer('xy', field('xy')), true);
  assert.equal(matchesFieldAnswer('\\frac{-3x}{-2}', field('1.5x')), false);
  assert.equal(matchesFieldAnswer('\\frac{3x}{2}', field('1.5x')), true);
});

test('a field that asks for simplest form takes the value only when it is simplified', () => {
  const key = field('a^3+8a-9');
  assert.equal(matchesFieldAnswer('a^3+8a-9', key), true);
  assert.equal(matchesFieldAnswer('8a+a^3-9', key), true, 'term order is free');
  assert.equal(matchesFieldAnswer('a^{3}+8a-9', key), true, 'MathLive braces');
  assert.equal(matchesFieldAnswer('2a^3+5a-7-a^3+3a-2', key), false, 'distributed and stopped');
  assert.equal(matchesFieldAnswer('a^3+2a-5', key), false, 'a wrong value is still wrong');
  // A retyped product has the key's value and is still not an answer.
  const monomial = field('8a^5b^2');
  assert.equal(matchesFieldAnswer('(2a^2b)(4a^3b)', monomial), false);
  assert.equal(matchesFieldAnswer('8a^5b^2', monomial), true);
  // Decimals, fractions and several letters still grade by value.
  assert.equal(matchesFieldAnswer('-\\frac{1}{1000}x^2+5x-500', field('-0.001x^2+5x-500')), true);
  assert.equal(matchesFieldAnswer('6yx^3-9y^2x^3+12y^3x^4', field('6x^3y-9x^3y^2+12x^4y^3')), true);
});

test('a field that does not ask keeps the old grading exactly', () => {
  const plain = { id: 'simplified', label: 'Simplified polynomial', answer: 'a^3+8a-9' };
  assert.equal(matchesFieldAnswer('2a^3+5a-7-a^3+3a-2', plain), true, 'unchanged: value only');
  assert.equal(matchesFieldAnswer('(2a^2b)(4a^3b)', { ...plain, answer: '8a^5b^2' }), true, 'unchanged: value only');
});

const QUESTION = {
  type: 'multiAnswer',
  prompt: 'Simplify (2a³ + 5a − 7) − (a³ − 3a + 2).',
  answerFields: [field('a^3+8a-9')],
};
const UNSIMPLIFIED = '2a^3+5a-7-a^3+3a-2';

test('the server and the device give the same verdict', () => {
  const device = gradeMultiAnswerResponse(QUESTION, { simplified: UNSIMPLIFIED });
  const server = gradeServerResponse({ question: QUESTION, response: fieldsResponse({ simplified: UNSIMPLIFIED }) });
  assert.equal(device.isCorrect, false);
  assert.equal(server.graded, true);
  assert.equal(server.isCorrect, false);
  const right = gradeServerResponse({ question: QUESTION, response: fieldsResponse({ simplified: 'a^3+8a-9' }) });
  assert.equal(right.isCorrect, true);
});

test('the right value, not simplified, is told why — and recorded as evidence', () => {
  const graded = gradeMultiAnswerResponse(QUESTION, { simplified: UNSIMPLIFIED });
  const grading = { graded: true, isCorrect: graded.isCorrect, parts: graded.parts.map((part) => ({ ...part })), ...displayGradingSurface(QUESTION) };
  const diagnosis = diagnoseMiss({ question: QUESTION, grading, response: null, attemptsLeft: true });
  assert.equal(diagnosis?.code, 'polynomial-not-simplified');
  assert.equal(diagnosis?.message, 'Equal, but not simplified: multiply out every product and combine like terms.');

  const server = gradeServerResponse({ question: QUESTION, response: fieldsResponse({ simplified: UNSIMPLIFIED }) });
  const evidence = classifyMisconceptions({ question: QUESTION, response: fieldsResponse({ simplified: UNSIMPLIFIED }), grading: server });
  assert.deepEqual(evidence.findings.map((entry) => entry.code), ['polynomial-not-simplified']);

  // A wrong value is not "not simplified" — even written unsimplified: here
  // only the first term of a³ − 3a + 2 was subtracted (the textbook's error C).
  ['a^3+2a-5', '2a^3+5a-7-a^3-3a+2'].forEach((typed) => {
    const wrong = gradeMultiAnswerResponse(QUESTION, { simplified: typed });
    assert.equal(diagnoseMiss({ question: QUESTION, grading: { graded: true, isCorrect: false, parts: wrong.parts, ...displayGradingSurface(QUESTION) }, attemptsLeft: true }), null, typed);
  });
});

test('Pre-Flight: the key must itself be simplified, and only the known form is accepted', () => {
  assert.deepEqual(validateQuestionGradingContracts(QUESTION).errors, []);
  const badKey = { ...QUESTION, answerFields: [field('2a^3+5a-7-a^3+3a-2')] };
  assert.ok(validateQuestionGradingContracts(badKey).errors.some((message) => /is not one: combine like terms/.test(message)));
  const unknown = { ...QUESTION, answerFields: [field('a^3+8a-9', { answerForm: 'standardForm' })] };
  assert.ok(validateQuestionGradingContracts(unknown).errors.some((message) => /unsupported answerForm "standardForm"/.test(message)));
});
