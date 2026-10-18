// STUDENT PASS 3, WAVE 6: THE GRADER GAPS THE W5-6 REVIEWS FOUND.
//
// Every case is graded by the graders a student meets: the secure / Path field
// grader (functions/lib/secureItems.js gradeItem over mathPath's private
// grading), the assignment field matcher (answerUtils.matchesFieldAnswer) and
// sameValue. Each right answer stands beside a wrong one that must stay wrong.
//
//   1. N2: a braced negative exponent is one group. `10^{-3}/2` is 0.0005;
//      `10^-\frac{3}{2}` (≈ 0.0316) was graded right for it.
//   2. Right answers that were refused: an ASCII nth root, a subscripted name
//      over a number, a power and a subscript in either order, and a power of
//      a unit fraction.
//   3. Algebra II quadratic-formula-exact: its pair keys are unsimplified
//      generator text, and only that text passed. A coordinate with a root is
//      now compared by its exact value.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { normalizeAnswer, sameNumericPair, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { exactConstantValue } from '../../functions/shared/exactConstantValue.mjs';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');

const serverGrades = async (response, expected, profile = 'expression') => {
  const grading = mathPath.privateGradingDefinition({ responseFields: [{ id: 'answer', inputProfile: profile, expected }] });
  return (await secureItems.gradeItem(grading, { responses: { answer: response } })).isCorrect === true;
};

/** The verdict of every grader, which must agree. */
const verdicts = async (response, key, profile = 'expression') => {
  const field = { answer: key, ...(profile === 'orderedPair' ? { answerFormat: 'orderedPair' } : {}) };
  const all = [await serverGrades(response, key, profile), matchesFieldAnswer(response, field), sameValue(response, key)];
  assert.ok(all.every((verdict) => verdict === all[0]), `graders disagree on ${response} vs ${key}: ${all}`);
  return all[0];
};

const right = async (response, key, profile) => assert.equal(await verdicts(response, key, profile), true, `${response} must be right for ${key}`);
const wrong = async (response, key, profile) => assert.equal(await verdicts(response, key, profile), false, `${response} must be wrong for ${key}`);

test('N2: a braced negative exponent stays one group, so the slash after it divides the power', async () => {
  for (const [base, power, divisor] of [['10', '3', '2'], ['e', 'x', '2'], ['2', 'n', '3']]) {
    const key = `${base}^{-${power}}/${divisor}`;
    // The wrong answers the base let through: the divisor inside the exponent.
    await wrong(`${base}^-\\frac{${power}}{${divisor}}`, key);
    await wrong(`${base}^{-\\frac{${power}}{${divisor}}}`, key);
    // The right ones it refused: the editor's stacked fraction over the power.
    await right(`\\frac{${base}^{-${power}}}{${divisor}}`, key);
    await right(key, `\\frac{${base}^{-${power}}}{${divisor}}`);
    await right(`${base}^{−${power}}/${divisor}`, key);
  }
  // The text the graders compare: the power over the divisor, never the reverse.
  assert.equal(normalizeAnswer('10^{-3}/2'), '\\frac{10^-3}{2}');
  assert.equal(normalizeAnswer('10^-\\frac{3}{2}'), '10^-\\frac{3}{2}');
  // Without a division a negative exponent reads as it always did.
  assert.equal(normalizeAnswer('x^{-3}'), normalizeAnswer('x^-3'));
  await right('x^{-1}', 'x^-1');
});

test('N2 beside the ASCII B^(E)/N rule: e^(-x)/2 is still read as the renderer draws it', async () => {
  // stackDivisions (no options) draws an ASCII `e^(-x)/2` as e^{\frac{-x}{2}}
  // and W5-6 grades it as drawn; which reading an author means is the owner's
  // question (handoff, item 4). Until then it is not e^{-x}/2.
  assert.equal(stackDivisions('e^(-x)/2'), 'e^\\frac{-x}{2}');
  await wrong('e^(-x)/2', 'e^{-x}/2');
  await right('e^\\frac{-x}{2}', 'e^(-x)/2');
});

test('an ASCII nth root is the editor\'s \\sqrt[n]{…}, and only the same root', async () => {
  await right('x^{\\sqrt[3]{2}}', 'x^(root(3)(2))');
  await wrong('x^{\\sqrt{2}}', 'x^(root(3)(2))');
  await wrong('x^{\\sqrt[3]{3}}', 'x^(root(3)(2))');
  await wrong('x^{\\sqrt[4]{2}}', 'x^(root(3)(2))');
});

test('a subscripted name over a number is one numerator, and x^{2}_{1} is x_1^2', async () => {
  await right('\\frac{x_2^3}{4}', 'x_2^3/4');
  await right('\\frac{x_{2}^{3}}{4}', 'x_2^3/4');
  await wrong('x_2^{\\frac{3}{4}}', 'x_2^3/4');
  await wrong('\\frac{x_2^4}{3}', 'x_2^3/4');
  await right('x^{2}_{1}/3', 'x_1^2/3');
  await right('\\frac{x^{2}_{1}}{3}', 'x_1^2/3');
  await wrong('x_1^{\\frac{2}{3}}', 'x_1^2/3');
  await wrong('x^{2_{1}}/3', 'x_1^2/3');
  // Grading only: the renderer leaves these slashes alone, as before.
  assert.equal(stackDivisions('x_2^3/4'), 'x_2^3/4');
  assert.equal(stackDivisions('x_2^3/4', { skipAsciiCalls: false, constantOperands: true }), '\\frac{x_2^3}{4}');
  // A command's letter or a word is not a name: `\alpha_1/2`, `log_4/2` stay.
  assert.equal(stackDivisions('\\alpha_1/2', { constantOperands: true }), '\\alpha_1/2');
  assert.equal(stackDivisions('log_4/2', { constantOperands: true }), 'log_4/2');
});

test('a power of a unit fraction is one over the power; any other fraction keeps its form', async () => {
  // (1/2)^π = 1/2^π: the two pairs in the review are each the same number.
  await right('\\left(\\frac12\\right)^{\\pi}', '1/2^pi');
  await right('\\frac{1}{2^{\\pi}}', '(1/2)^pi');
  await right('(1/3)^x', '1/3^x');
  await wrong('\\left(\\frac{1}{2}\\right)^{-\\pi}', '1/2^pi');
  await wrong('\\left(\\frac{1}{3}\\right)^{\\pi}', '1/2^pi');
  await wrong('\\frac{\\pi}{2}', '1/2^pi');
  // (2/3)^π is 2^π/3^π, not 2/3^π; (1/x)^2 is left alone.
  await wrong('\\left(\\frac{2}{3}\\right)^{\\pi}', '2/3^pi');
  assert.equal(normalizeAnswer('(1/x)^2'), '(\\frac{1}{x})^2');
});

test('exactConstantValue reads exact constants only', () => {
  assert.equal(exactConstantValue(normalizeAnswer('(-(-2)-sqrt(8))/2')).value, 1 - Math.SQRT2);
  assert.deepEqual(exactConstantValue(normalizeAnswer('5-2\\sqrt{2}')), { value: 5 - 2 * Math.SQRT2, radical: true });
  assert.deepEqual(exactConstantValue(normalizeAnswer('2*(3)+1')), { value: 7, radical: false });
  for (const refused of ['-0.414', 'x+1', '\\pi', '\\sqrt{-1}', '\\frac{1}{0}', '\\sqrt[3]{2}', '2^{x}', '2^{100}']) {
    assert.equal(exactConstantValue(normalizeAnswer(refused)), null, refused);
  }
});

test('quadratic-formula-exact: the simplified exact pair is right, and only the right one', async () => {
  const key = '((-(-2)-sqrt(8))/2,2*((-(-2)-sqrt(8))/2)+3)';
  for (const sent of ['(1-sqrt(2),5-2sqrt(2))', '(1-\\sqrt{2},5-2\\sqrt{2})', '\\left(1-\\sqrt2,5-2\\sqrt2\\right)',
    '(\\frac{2-\\sqrt{8}}{2},5-2\\sqrt{2})', '(-\\sqrt{2}+1,-2\\sqrt{2}+5)', key]) {
    await right(sent, key, 'orderedPair');
  }
  // The other root, the coordinates swapped, a wrong y, and decimals: an exact
  // pair was asked for, so a decimal (even a long one) is not the answer.
  for (const sent of ['(1+sqrt(2),5+2sqrt(2))', '(5-2\\sqrt{2},1-\\sqrt{2})', '(1-\\sqrt{2},5-\\sqrt{2})', '(1-\\sqrt{2},3-2\\sqrt{2})',
    '(-0.414,2.172)', '(-0.41421356237,2.17157287525)', '(-41421356237/100000000000,5-2\\sqrt{2})',
    // Near the root but not it: exact means exact, not within a tolerance.
    '(1-\\sqrt{2}+\\frac{1}{10000},5-2\\sqrt{2})']) {
    await wrong(sent, key, 'orderedPair');
  }
  // A pair of plain numbers is compared as before.
  assert.equal(sameNumericPair('(0.5,3)', '(1/2,3)'), true);
  assert.equal(sameNumericPair('(0.5,4)', '(1/2,3)'), false);
});

test('quadratic-formula-exact, drawn from the real Algebra II seed and graded by the secure grader', async () => {
  const seed = JSON.parse(readFileSync(new URL('../../functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json', import.meta.url), 'utf8'));
  const documents = Array.isArray(seed) ? seed : (seed.documents || seed.items || seed.questions);
  const family = documents.find((entry) => entry.id === 'mm_A2_3C_v2_quadratic-formula-exact');
  const document = compilePathRecordForStorage({ ...family, active: true }).document;
  for (const draw of ['p-sweep-0', 's1', 's2']) {
    const question = generatePathInstanceWithRetries(document, draw, 4).question;
    const [, m, b] = /\$y=(-?\d+)x([+-]\s*\d+)\$/.exec(question.prompt).map((part) => part?.replace(/\s+/g, ''));
    const grading = mathPath.privateGradingDefinition(question);
    for (const [id, sign] of [['minus', -1], ['plus', 1]]) {
      const expected = question.responseFields.find((field) => field.id === id).expected;
      const [, p, d] = /\(-\((-?\d+)\)[-+]sqrt\((\d+)\)\)\/2/.exec(expected);
      const h = -Number(p) / 2;
      const t = Number(d) / 4;
      const x = `${h}${sign < 0 ? '-' : '+'}\\sqrt{${t}}`;
      const k = Number(m) * h + Number(b);
      const coefficient = sign * Number(m);
      const y = `${k}${coefficient < 0 ? '-' : '+'}${Math.abs(coefficient)}\\sqrt{${t}}`;
      const other = `${h}${sign < 0 ? '+' : '-'}\\sqrt{${t}}`;
      const response = (pair) => ({ responses: Object.fromEntries(question.responseFields.map((field) => [field.id, field.id === id ? pair : field.expected])) });
      assert.equal((await secureItems.gradeItem(grading, response(`(${x},${y})`))).isCorrect, true, `${draw} ${id}: (${x},${y}) for ${expected}`);
      assert.equal((await secureItems.gradeItem(grading, response(`(${other},${y})`))).isCorrect, false, `${draw} ${id}: the other root`);
    }
  }
});
