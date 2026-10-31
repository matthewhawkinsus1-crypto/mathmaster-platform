/*
 * GR35 (finding E2-5): THREE TYPED-ANSWER TRAPS.
 *
 *   a. A monomial quotient or a negative-exponent answer was compared as
 *      text, so `\frac{y^4}{x^4\cdot 81}` was wrong for `y^4/(81x^4)`. It is
 *      now compared factor for factor with the key
 *      (monomialQuotientEquivalence.mjs): any order and spelling of the
 *      key's own factors is right; nothing is multiplied, cancelled or moved
 *      across the bar, so an answer that is not simplified stays wrong.
 *   b. `numericTolerance` on an assignment's typed field was ignored (only
 *      Path read it). The assignment matcher now honours it, and only ever
 *      widens: a tolerance below the old one is not a reason to refuse.
 *   c. Keys written with ² ³ ⁻¹ · × never matched what the editor sends
 *      (`^2`, `\cdot`, `\times`). They are now read as the editor's spelling
 *      wherever what is WRITTEN is compared, never by the polynomial reader:
 *      a choice is graded by its option's text, and an option of the same
 *      value is a wrong option ("split the middle term"; a "3 × 4" matrix).
 *
 * Every grader that reads a typed field agrees: sameValue, the assignment
 * matcher (device and server) and the Path grader.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { fieldsResponse } from './helpers/misconceptionFixtures.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

/** The verdict of every typed-field grader, which must agree. */
const verdicts = async (key, response, field = {}) => {
  const value = sameValue(response, key);
  const assignment = matchesFieldAnswer(response, { answer: key, inputProfile: 'expression', ...field });
  const grading = mathPath.privateGradingDefinition({ prompt: 'Simplify.', responseFields: [{ id: 'answer', inputProfile: 'expression', expected: key, ...field }] });
  const path = (await mathPath.gradeResponse(grading, { responses: { answer: response } })).fieldResults[0].isCorrect;
  assert.equal(assignment, path, `the assignment and Path graders agree on ${response} for ${key}`);
  if (!Object.keys(field).length) assert.equal(value, assignment, `sameValue agrees on ${response} for ${key}`);
  return assignment;
};

test('a: a monomial quotient or negative exponent in another order or spelling is right', async () => {
  const right = {
    'y^4/(81x^4)': ['\\frac{y^4}{x^4\\cdot81}', 'y^4/(x^4*81)', '\\frac{y^{4}}{81x^{4}}', '\\frac{y^4}{(81x^4)}'],
    'x^{-2}y^3': ['y^3x^{-2}', 'y^{3}x^{-2}', 'y^3\\cdot x^{-2}'],
    '3a^{-2}b': ['3ba^{-2}', 'b\\cdot3a^{-2}'],
    '\\frac{3b^2}{a^3}': ['\\frac{b^2\\cdot3}{a^3}', '3b^2/a^3', 'b^2\\cdot 3/a^3'],
    '-\\frac{2x^3}{y^2}': ['\\frac{-2x^3}{y^2}', '-2x^3/y^2', '-\\frac{x^3\\cdot2}{y^2}', '(-2x^3)/(y^2)'],
    '\\frac{a^2c}{4b^5}': ['\\frac{ca^2}{4b^5}', 'a^2c/(4b^5)', '\\frac{a^2c}{b^5\\cdot4}'],
  };
  for (const [key, responses] of Object.entries(right)) {
    for (const response of responses) assert.equal(await verdicts(key, response), true, `${response} for ${key}`);
  }
});

test('a: an answer that is not in simplest form, or not the key, stays wrong', async () => {
  const wrong = {
    'y^4/(81x^4)': [
      '\\frac{2y^4}{162x^4}', // an unreduced coefficient
      '\\frac{y^8}{81x^4y^4}', // a factor left to cancel
      '\\frac{y^4}{3^4x^4}', // a power of a number
      '\\frac{y^4}{9\\cdot9x^4}', // a number written as a product
      '\\frac{y^4}{81x^2x^2}', // a power split in two
      'y^4x^{-4}/81', // a negative exponent for a positive one
      '81^{-1}y^4x^{-4}',
      '\\frac{1}{81}y^4x^{-4}',
      '\\left(\\frac{y}{3x}\\right)^4', // the question retyped
      '\\frac{1y^4}{81x^4}', // a written 1
      '\\frac{x^4}{81y^4}', '\\frac{y^4}{81x^3}', '-\\frac{y^4}{81x^4}', // another answer
      'y^4/81x^4', // (y^4/81)·x^4 as written
    ],
    'x^{-2}y^3': ['\\frac{y^3}{x^2}', 'y^3/x^2', 'x^{-2}y^{-3}', 'x^2y^3'],
    '3a^{-2}b': ['\\frac{3b}{a^2}', '3a^{2}b'],
    '\\frac{3b^2}{a^3}': ['3\\frac{b^2}{a^3}', '\\frac{6b^2}{2a^3}', '\\frac{b^2}{3a^3}'],
    '-\\frac{2x^3}{y^2}': ['\\frac{2x^3}{y^2}', '-\\frac{-2x^3}{y^2}', '\\frac{2x^3}{-y^2}'],
    '\\frac{2x^3}{y^2}': ['\\frac{-2x^3}{-y^2}', '-\\frac{2x^3}{-y^2}'],
    // A typed exponent with a minus or a bracket before a `/` is read as
    // drawn (N2): 10^-3/2 is 10^(-3/2), another number.
    '10^{-3}/2': ['10^-3/2'],
    '2x^{-1}/5': ['2x^-1/5'],
    '\\frac{x^{-2}}{3}': ['x^(-2)/3', 'x^-2/3'],
  };
  for (const [key, responses] of Object.entries(wrong)) {
    for (const response of responses) assert.equal(await verdicts(key, response), false, `${response} for ${key}`);
  }
  // A field that asks for a simplified polynomial keeps its own gate.
  assert.equal(matchesFieldAnswer('\\frac{y^4}{x^4\\cdot81}', { answer: 'y^4/(81x^4)', answerForm: 'simplifiedPolynomial' }), false);
});

// --- b. numericTolerance -----------------------------------------------------

const MAKEUP = compileTeacherImport(fs.readFileSync(new URL('../../drafts/district-dol2/makeup-practice.json', import.meta.url), 'utf8')).questions;
const SECURE = (() => {
  const seed = JSON.parse(fs.readFileSync(new URL('../../functions/seeds/secureAssessments/algebra1_district_dol2.json', import.meta.url), 'utf8'));
  return (Array.isArray(seed) ? seed : seed.documents || seed.items || seed.questions).find((item) => item.id === 'mm_district_dol2_q13');
})();

test('b: an authored numericTolerance is honoured on a typed assignment field, as the secure test already does', async () => {
  // "Predict the number sold at $7.75 … Round each prediction to the nearest whole item", key 49, tolerance 1.
  const question = MAKEUP.find((candidate) => candidate.questionId === 'dol2-makeup-q13');
  assert.ok(question, 'the DOL2 make-up practice compiles its regression item');
  const field = question.answerFields.find((entry) => entry.id === 'prediction1');
  assert.equal(Number(field.numericTolerance), 1);
  assert.ok(SECURE, 'the secure DOL2 holds the same item');
  const secureGrading = mathPath.privateGradingDefinition(SECURE);
  for (const [typed, expected] of [['49', true], ['48', true], ['50', true], ['49.5', true], ['47', false], ['51', false], ['47.9', false]]) {
    const device = gradeMultiAnswerResponse(question, { prediction1: typed, prediction2: '7' }).parts.find((part) => part.id === 'prediction1').isCorrect;
    assert.equal(device, expected, `the assignment grades ${typed}`);
    // eslint-disable-next-line no-await-in-loop
    const secure = (await mathPath.gradeResponse(secureGrading, { responses: { prediction1: typed, prediction2: '7' } })).fieldResults.find((entry) => entry.id === 'prediction1').isCorrect;
    assert.equal(secure, device, `the secure test agrees on ${typed}`);
  }
});

test('b: a tolerance only widens, and reaches pairs and relations as on Path', () => {
  assert.equal(matchesFieldAnswer('49.5', { answer: 49, inputProfile: 'number' }), false, 'no tolerance: exact as before');
  // An authored 0 does not refuse what was right before (1e-9).
  assert.equal(matchesFieldAnswer('0.333333333333', { answer: '1/3', numericTolerance: 0 }), true);
  assert.equal(matchesFieldAnswer('0.3333333333333', { answer: '1/3' }), true);
  const pair = { answer: '(2, 3)', answerFormat: 'orderedPair' };
  assert.equal(matchesFieldAnswer('(2.04, 3)', pair), false);
  assert.equal(matchesFieldAnswer('(2.04, 3)', { ...pair, numericTolerance: 0.05 }), true);
  assert.equal(matchesFieldAnswer('(2.1, 3)', { ...pair, numericTolerance: 0.05 }), false);
  assert.equal(matchesFieldAnswer('8,051', { answer: '8050', inputProfile: 'number', numericTolerance: 1 }), true, 'a grouped number too');
  assert.equal(matchesFieldAnswer('8051', { answer: '8,050', inputProfile: 'number', numericTolerance: 1 }), true, 'and a key written grouped');
  assert.equal(matchesFieldAnswer('8052', { answer: '8,050', inputProfile: 'number', numericTolerance: 1 }), false);
  assert.equal(matchesFieldAnswer('y=2.01x+1', { answer: 'y=2x+1', equivalence: 'polynomialRelation', numericTolerance: 0.05 }), true);
  // Not a number: ignored.
  assert.equal(matchesFieldAnswer('49.5', { answer: 49, numericTolerance: 'about one' }), false);
  assert.equal(matchesFieldAnswer('49.5', { answer: 49, numericTolerance: -1 }), false);
});

// --- c. keys written with ² ³ ⁻¹ · × ------------------------------------------------

test('c: a key written with powers, a dot or a times sign matches what the editor sends', async () => {
  const right = {
    'x²+8x+1': ['x^2+8x+1', 'x^{2}+8x+1', 'x^2 + 8x + 1', 'x²+8x+1', 'x^2+8\\cdot x+1'],
    '3x³y²': ['3x^3y^2', '3x^{3}y^{2}'],
    'x⁻¹': ['x^{-1}', 'x^-1'],
    '10x¹²': ['10x^{12}'],
    '2·x': ['2\\cdot x', '2x', '2*x'],
    '4⋅y': ['4y', '4\\cdot y'],
    '3 × 10⁵': ['3\\times10^5', '3\\times 10^{5}', '3 \\times 10^5', '3*10^5'],
  };
  for (const [key, responses] of Object.entries(right)) {
    for (const response of responses) assert.equal(await verdicts(key, response), true, `${response} for ${key}`);
  }
  const wrong = { 'x²+8x+1': ['x^3+8x+1', 'x2+8x+1', 'x+8x+1'], 'x⁻¹': ['\\frac{1}{x}', 'x'], '3 × 10⁵': ['3\\times10^4', '4\\times10^5'], '2·x': ['3x'] };
  for (const [key, responses] of Object.entries(wrong)) {
    for (const response of responses) assert.equal(await verdicts(key, response), false, `${response} for ${key}`);
  }
  // The student side reads the same way.
  assert.equal(sameValue('x²+1', 'x^2+1'), true);
});

/** Each option of a lesson's choice field, graded on the device and the server alike. */
const optionVerdicts = (file, fieldId) => {
  const question = compileTeacherImport(fs.readFileSync(new URL(`../../teacher-import-jsons/${file}`, import.meta.url), 'utf8')).questions
    .find((candidate) => (candidate.answerFields || []).some((field) => field.id === fieldId));
  assert.ok(question, `${file} has ${fieldId}`);
  const field = question.answerFields.find((entry) => entry.id === fieldId);
  return field.options.map((option) => {
    const responses = Object.fromEntries(question.answerFields.map((entry) => [entry.id, entry.id === fieldId ? option : '']));
    const device = gradeMultiAnswerResponse(question, responses).parts.find((part) => part.id === fieldId).isCorrect;
    const server = gradeServerResponse({ question, response: fieldsResponse(responses) }).parts?.find((part) => part.id === fieldId)?.isCorrect === true;
    assert.equal(server, device, `device and server agree on ${option}`);
    return [option, device, option === field.answer];
  });
};

test('c: a choice written with ² keeps its options apart, though they have one value', () => {
  // "Split the middle term" of 24x² − 22x + 3: every option is that
  // polynomial; only the split whose terms multiply to 24·3 is right.
  const verdicts2 = optionVerdicts('algebra2-polynomials-radicals/1_Factoring_Polynomials.json', 'split');
  assert.ok(verdicts2.length >= 3);
  verdicts2.forEach(([option, verdict, isKey]) => assert.equal(verdict, isKey, option));
});

test('c: × is not read as a product, so a matrix size is never its product or its reverse', () => {
  const [question] = compileTeacherImport(fs.readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json', import.meta.url), 'utf8')).questions
    .filter((candidate) => (candidate.answerFields || []).some((field) => field.id === 'dimsCD'));
  assert.ok(question, 'the matrices lesson asks for the dimensions of CD');
  const graded = (option) => {
    const responses = Object.fromEntries(question.answerFields.map((field) => [field.id, field.id === 'dimsCD' ? option : '']));
    const device = gradeMultiAnswerResponse(question, responses).parts.find((part) => part.id === 'dimsCD').isCorrect;
    const server = gradeServerResponse({ question, response: fieldsResponse(responses) }).parts?.find((part) => part.id === 'dimsCD')?.isCorrect === true;
    assert.equal(server, device, `device and server agree on ${option}`);
    return device;
  };
  assert.equal(graded('3 × 4'), true);
  assert.equal(graded('4 × 3'), false);
  assert.equal(graded('2 × 2'), false);
  assert.equal(matchesFieldAnswer('12', { answer: '3 × 4' }), false);
  assert.equal(matchesFieldAnswer('3\\times4', { answer: '3 × 4' }), true, 'typed with the keypad, it is the same text');
});
