// GR13: MIXED NUMBERS, THE OWNER'S DECISIONS (2026-10-23; wave 7 decisions 1–3).
//
//   1. A number box keeps reading 3½ as 7/2 (built in wave 7; confirmed).
//   2. A mixed number whose fraction part is reduced (and less than one) is
//      in lowest terms: 3½ is right where "a fraction in lowest terms" is
//      asked, 3 2/4 is not.
//   3. A key written as a mixed number asks for one: for a key of 3 2/5,
//      17/5 and 3.4 copy the improper form (on "Write 17/5 as a mixed
//      number", they copy the prompt) and are wrong unless the author lists
//      them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fieldValueOptions, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { buildFieldGradingDefinition } from '../../functions/shared/legacyFieldGrading.mjs';
import { isWrittenInLowestTerms } from '../../functions/shared/fractionAnswer.mjs';
import { gradeFractionResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { fractionFormProblemForResponse } from '../../src/platform/interaction/answerShapeGuard.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

/** [secure, path/live, simulation, assignment] for one number field. */
const verdicts = async (response, expected, extra = {}) => {
  const field = { id: 'answer', inputProfile: 'number', expected, ...extra };
  const definition = mathPath.privateGradingDefinition({ responseFields: [field] });
  const secure = (await secureItems.gradeItem(definition, { responses: { answer: response } })).isCorrect === true;
  const path = (await mathPath.gradeResponse(definition, { responses: { answer: response } })).isCorrect === true;
  const simulated = buildFieldGradingDefinition({ responseFields: [field] }).fields[0];
  const simulation = [simulated.expected, ...simulated.accepted]
    .some((key) => sameValue(response, key, simulated.numericTolerance, fieldValueOptions(simulated)));
  const assignment = matchesFieldAnswer(response, { id: 'answer', inputProfile: 'number', answer: expected, acceptedAnswers: extra.accepted });
  return [secure, path, simulation, assignment];
};
const ALL_RIGHT = [true, true, true, true];
const ALL_WRONG = [false, false, false, false];

test('1. a number box still reads a mixed number as its value', async () => {
  for (const response of ['3\\frac{1}{2}', '3 1/2', '3\\frac12']) {
    assert.deepEqual(await verdicts(response, '7/2'), ALL_RIGHT, response);
    assert.deepEqual(await verdicts(response, '3.5'), ALL_RIGHT, response);
  }
});

test('2. a mixed number with a reduced fraction part less than one is in lowest terms', () => {
  for (const written of ['3\\frac{1}{2}', '3 1/2', '3\\frac12', '-3\\frac{1}{2}', '12\\frac{5}{7}']) {
    assert.equal(isWrittenInLowestTerms(written), true, written);
  }
  for (const written of ['3\\frac{2}{4}', '3 2/4', '3\\frac{5}{2}', '3\\frac{2}{2}', '0\\frac{1}{2}', '3.5\\frac{1}{2}', '3\\frac{1}{2}x']) {
    assert.equal(isWrittenInLowestTerms(written), false, written);
  }
  // Plain fractions keep their rule.
  assert.equal(isWrittenInLowestTerms('7/2'), true);
  assert.equal(isWrittenInLowestTerms('14/4'), false);
});

test('2. a lowest-terms fraction question takes 3½ and says why 3 2/4 is not yet right, before a try is spent', () => {
  const question = { type: 'fraction', prompt: 'Simplify 14/4.', answer: '7/2' };
  for (const response of ['3\\frac{1}{2}', '3 1/2', '\\frac{7}{2}']) {
    assert.equal(gradeFractionResponse(question, response).isCorrect, true, response);
    assert.equal(fractionFormProblemForResponse(question, response), '', `${response} is not held back`);
  }
  assert.equal(gradeFractionResponse(question, '3\\frac{2}{4}').isCorrect, false);
  const reason = fractionFormProblemForResponse(question, '3\\frac{2}{4}');
  assert.match(reason, /fraction part/);
  assert.match(reason, /lowest terms/);
  assert.doesNotMatch(reason, /\d/, 'a fixed sentence: nothing from the key');
  assert.equal(fractionFormProblemForResponse(question, '4\\frac{2}{6}'), reason, 'right value or not, the same sentence');
  assert.equal(fractionFormProblemForResponse(question, '3\\frac{5}{2}'), reason);
  // A reduced mixed number of the wrong value is graded, not held back.
  assert.equal(fractionFormProblemForResponse(question, '4\\frac{1}{3}'), '');
  assert.equal(gradeFractionResponse(question, '4\\frac{1}{3}').isCorrect, false);
  // An author who lists that very form accepts it, and the box steps aside.
  const listed = { ...question, acceptedAnswers: ['3 2/4'] };
  assert.equal(fractionFormProblemForResponse(listed, '3\\frac{2}{4}'), '');
  assert.equal(gradeFractionResponse(listed, '3\\frac{2}{4}').isCorrect, true);
  // A drill (any answer worth the sum) asks for no form.
  const drill = { type: 'fraction', n1: 3, d1: 2, n2: 2, d2: 1 };
  assert.equal(fractionFormProblemForResponse(drill, '3\\frac{2}{4}'), '');
});

test('3. a key written as a mixed number asks for a mixed number, on every grader', async () => {
  for (const response of ['17/5', '\\frac{17}{5}', '3.4']) {
    assert.deepEqual(await verdicts(response, '3 2/5'), ALL_WRONG, `${response} for 3 2/5`);
    assert.deepEqual(await verdicts(response, '3\\frac{2}{5}'), ALL_WRONG, `${response} for 3\\frac{2}{5}`);
  }
  for (const response of ['3\\frac{2}{5}', '3 2/5', '3\\frac25', '3\\frac{4}{10}']) {
    assert.deepEqual(await verdicts(response, '3 2/5'), ALL_RIGHT, `${response} for 3 2/5`);
  }
  assert.deepEqual(await verdicts('3\\frac{1}{5}', '3 2/5'), ALL_WRONG);
  // The author can list the improper form.
  assert.deepEqual(await verdicts('17/5', '3 2/5', { accepted: ['17/5'] }), ALL_RIGHT);
  // A number key still takes the mixed number (decision 1).
  assert.deepEqual(await verdicts('3\\frac{2}{5}', '17/5'), ALL_RIGHT);
  // The equivalent-expression mode reads the key the same way.
  assert.equal(matchesFieldAnswer('17/5', { answer: '3 2/5', gradingMode: 'equivalentExpression' }), false);
  assert.equal(matchesFieldAnswer('3\\frac{2}{5}', { answer: '3 2/5', gradingMode: 'equivalentExpression' }), true);
  // A fraction question keyed as a mixed number: a mixed number in lowest terms.
  const convert = { type: 'fraction', prompt: 'Write 17/5 as a mixed number.', answer: '3 2/5' };
  assert.equal(gradeFractionResponse(convert, '17/5').isCorrect, false, 'copying the prompt');
  assert.equal(gradeFractionResponse(convert, '3\\frac{2}{5}').isCorrect, true);
  assert.equal(gradeFractionResponse(convert, '3\\frac{4}{10}').isCorrect, false, 'not in lowest terms');
  assert.match(fractionFormProblemForResponse(convert, '3\\frac{4}{10}'), /lowest terms/);
});
