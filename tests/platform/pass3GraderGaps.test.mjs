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

test('N2 beside a denominator: an ASCII negative power after a slash is still the same answer', async () => {
  // The slash comes before the power, so every reading is one number (review
  // B1): these were right on the base and must stay right.
  await right('3/x^-2', '3/x^{-2}');
  await right('1/x^-2', '1/x^{-2}');
  await right('3/2^-x', '3/2^{-x}');
  await right('\\frac{3}{x^{-2}}', '3/x^{-2}');
  await right('\\frac{3}{x^{-2}}', '3/x^-2');
  await wrong('\\frac{3}{x^{2}}', '3/x^-2');
  await wrong('\\frac{3}{x}^{-2}', '3/x^-2');
  await wrong('3/x^-3', '3/x^{-2}');
  // Braced only when a slash follows: `3/x^{-2}y` meets the typed `3/x^-2y`
  // (the denominator read does not take a power with a letter after it).
  await right('3/x^-2y', '3/x^{-2}y');
});

test('an ASCII B^-E/N is read as it is drawn, B^(-E/N): a lowered verdict, for the owner', async () => {
  // The renderer draws `10^-3/2` as 10^{-3/2}. The base took it for the braced
  // key 10^{-3}/2; it is graded as drawn now (review S2, owner decision 1).
  for (const [response, key] of [['10^-3/2', '10^{-3}/2'], ['2x^-1/5', '2x^{-1}/5'], ['y=2^-x/3', 'y=2^{-x}/3'], ['x^-a/b', 'x^{-a}/b']]) {
    await wrong(response, key);
  }
  assert.equal(stackDivisions('10^-3/2'), '10^-\\frac{3}{2}');
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
  // root(2)(m) is the square root.
  assert.equal(normalizeAnswer('root(2)(3)'), normalizeAnswer('\\sqrt{3}'));
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
  // Only a number power is moved: a letter power keeps whatever it meant.
  await wrong('x^{n}_{1}', 'x_1^n');
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
  // Not over zero, and not a power that is itself raised: (1/2)^x^2 is
  // 1/2^(x^2), never (1/2^x)^2.
  assert.equal(normalizeAnswer('(1/0)^2'), '(\\frac{1}{0})^2');
  await wrong('(1/2)^x^2', '\\frac{1}{2^x}^2');
});

test('exactConstantValue reads exact constants only', () => {
  assert.equal(exactConstantValue(normalizeAnswer('(-(-2)-sqrt(8))/2')).value, 1 - Math.SQRT2);
  assert.deepEqual(exactConstantValue(normalizeAnswer('5-2\\sqrt{2}')), { value: 5 - 2 * Math.SQRT2, radical: true });
  assert.deepEqual(exactConstantValue(normalizeAnswer('2*(3)+1')), { value: 7, radical: false });
  // A \\frac after a number is a mixed number to a student, not a product.
  assert.equal(exactConstantValue(normalizeAnswer('1\\frac{1}{2}')), null);
  assert.equal(exactConstantValue('1.5'), null);
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
  // pair was asked for, so a decimal (even a long one) is not the answer. The
  // owner confirmed the refusal of decimals (GR08).
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

test('a pair with no root keeps its old reading: no mixed numbers, no unsimplified arithmetic', async () => {
  // Review B2: these were wrong on the base and the exact reader let them
  // through. The exact value is read only when both sides have a root.
  for (const [sent, key] of [['(1\\frac{1}{2},4)', '(\\frac{1}{2},4)'], ['(3\\frac{1}{2},1)', '(\\frac{3}{2},1)'], ['(-2\\frac{1}{2},4)', '(-1,4)'],
    ['(2 1/2,4)', '(1,4)'], ['(1+2,4)', '(3,4)'], ['(6/2,8-4)', '(2,3)'], ['(-(-2),3)', '(2,3)'], ['(2^3,1)', '(8,1)'],
    // A root against a plain number is not read either (review S4).
    ['(\\sqrt{4},1)', '(2,1)']]) {
    await wrong(sent, key, 'orderedPair');
  }
  await wrong('(1+2,4)', '(3,4)');
});

test('a pair key that is not two constants matches its own text on every grader', async () => {
  // Review S3: the assignment matcher refused identical text here.
  await right('(π,\\sqrt{2})', '(\\pi,\\sqrt{2})', 'orderedPair');
  await right('(x+\\sqrt{2},1)', '(x+\\sqrt{2},1)', 'orderedPair');
  await right('(1,\\sqrt[3]{2})', '(1,root(3)(2))', 'orderedPair');
  await wrong('(1,\\sqrt[3]{3})', '(1,root(3)(2))', 'orderedPair');
  // A key not written as a pair is still not one the pair box takes (as
  // before; kSteps_linesAndSlope relies on it to withhold that explanation).
  assert.equal(matchesFieldAnswer('none', { answer: 'none', answerFormat: 'orderedPair' }), false);
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

test('quadratic-formula-exact: natural answers in all four fields are right on every draw, wrong ones are not', async () => {
  // Review S1: with p = 0 the reduced equation was keyed `x^2+ 0x- 5=0`, and
  // `x^2-5=0` was refused. The key now uses the zero-aware `xterm` filter.
  const seed = JSON.parse(readFileSync(new URL('../../functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json', import.meta.url), 'utf8'));
  const documents = Array.isArray(seed) ? seed : (seed.documents || seed.items || seed.questions);
  const document = compilePathRecordForStorage({ ...documents.find((entry) => entry.id === 'mm_A2_3C_v2_quadratic-formula-exact'), active: true }).document;
  const radical = (constant, coefficient, t) => {
    const magnitude = Math.abs(coefficient) === 1 ? `\\sqrt{${t}}` : `${Math.abs(coefficient)}\\sqrt{${t}}`;
    return constant === 0 ? `${coefficient < 0 ? '-' : ''}${magnitude}` : `${constant}${coefficient < 0 ? '-' : '+'}${magnitude}`;
  };
  const signedTerm = (value, suffix = '') => (value === 0 ? '' : `${value < 0 ? '-' : '+'}${Math.abs(value)}${suffix}`);
  const seenP = new Set();
  for (let draw = 0; draw < 60; draw += 1) {
    const question = generatePathInstanceWithRetries(document, `natural-${draw}`, 4).question;
    const [, m, b] = /\$y=(-?\d+)x([+-]\s*\d+)\$/.exec(question.prompt).map((part) => part?.replace(/\s+/g, '')).map(Number);
    const [, p, d] = /\(-\((-?\d+)\)[-+]sqrt\((\d+)\)\)\/2/.exec(question.responseFields.find((field) => field.id === 'minus').expected).map(Number);
    seenP.add(p);
    const h = -p / 2;
    const t = d / 4;
    const right = {
      reduced: `x^2${signedTerm(p, 'x')}${signedTerm((p * p - d) / 4)}=0`,
      disc: String(d),
      minus: `(${radical(h, -1, t)},${radical(m * h + b, -m, t)})`,
      plus: `(${radical(h, 1, t)},${radical(m * h + b, m, t)})`,
    };
    const grading = mathPath.privateGradingDefinition(question);
    for (const grade of [(responses) => mathPath.gradeResponse(grading, { responses }), (responses) => secureItems.gradeItem(grading, { responses })]) {
      assert.equal((await grade(right)).isCorrect, true, `draw ${draw}: ${JSON.stringify(right)}`);
      assert.equal((await grade({ ...right, plus: right.minus })).isCorrect, false, `draw ${draw}: the minus pair twice`);
      assert.equal((await grade({ ...right, reduced: `x^2${signedTerm(p + 2, 'x')}${signedTerm((p * p - d) / 4)}=0` })).isCorrect, false, `draw ${draw}: another reduced equation`);
      // The old key's own form (`x^2+0x-5=0` when p = 0) stays right: it is an
      // accepted form, so a regeneration from the template keeps base verdicts.
      const oldForm = `x^2${p < 0 ? '-' : '+'}${Math.abs(p)}x${signedTerm((p * p - d) / 4) || '+0'}=0`;
      assert.equal((await grade({ ...right, reduced: oldForm })).isCorrect, true, `draw ${draw}: the old form ${oldForm}`);
      assert.equal((await grade({ ...right, reduced: `x^2${p < 0 ? '-' : '+'}${Math.abs(p)}x${signedTerm((p * p - d) / 4 - 1) || '+0'}=0` })).isCorrect, false, `draw ${draw}: the old form, another constant`);
    }
  }
  assert.ok(seenP.has(0), 'the draws include p = 0, the case the old key refused');
});
