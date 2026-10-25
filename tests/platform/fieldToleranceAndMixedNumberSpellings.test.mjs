// GR05: THE SAME FIELD, THE SAME VERDICT, ON EVERY SURFACE.
//
// From the wave 7 review of the mixed-number change
// (docs/handoffs/STUDENT_PASS3_GRADER_GAPS_2.md, "Not done", N5 and N6):
//
//   1. the assignment matcher compared a field's numbers to 1e-9, while Path,
//      secure tests and Live Challenge compare them to 1e-6, so 0.3333333 for
//      1/3 was right on Path and wrong on the same assignment field;
//   2. a mixed number written with a dollar sign, a percent sign or thousands
//      separators (`\$3\frac12`, `3\frac12\%`, `1,000\frac{1}{2}`) was refused;
//   3. a mixed-number bound before "or" (`x<3\frac{1}{2} or x>5`) was never
//      read as 3½.
//
// Every field grader is asked: the secure close (secureItems.gradeItem), the
// Path and Live Challenge field grader (mathPath.gradeResponse) and the
// assignment matcher (answerUtils.matchesFieldAnswer).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

/** [secure, path/live, assignment] for one field `{ expected, ...kind }`. */
const verdicts = async (response, field) => {
  const definition = mathPath.privateGradingDefinition({ responseFields: [{ id: 'answer', ...field }] });
  const secure = (await secureItems.gradeItem(definition, { responses: { answer: response } })).isCorrect === true;
  const path = (await mathPath.gradeResponse(definition, { responses: { answer: response } })).isCorrect === true;
  const { expected, ...kind } = field;
  const assignment = matchesFieldAnswer(response, { answer: expected, ...kind });
  return [secure, path, assignment];
};
const ALL_RIGHT = [true, true, true];
const ALL_WRONG = [false, false, false];

/* ---------------------------------------------------------------------------
 * 1. One tolerance for a field's numbers.
 * ------------------------------------------------------------------------- */

test('a decimal rounded to six or seven places is right for 1/3 in an assignment field, as it is on Path and a secure test', async () => {
  for (const kind of [{ inputProfile: 'number' }, {}]) {
    for (const sent of ['0.3333333', '0.333333']) {
      assert.deepEqual(await verdicts(sent, { expected: '1/3', ...kind }), ALL_RIGHT, `${sent} ${JSON.stringify(kind)}`);
    }
    // A rounding to five places is not within 1e-6 anywhere.
    assert.deepEqual(await verdicts('0.33333', { expected: '1/3', ...kind }), ALL_WRONG);
  }
  assert.deepEqual(await verdicts('-0.285714', { expected: '-0.2857142857142857', inputProfile: 'number' }), ALL_RIGHT);
  assert.deepEqual(await verdicts('x=0.3333333', { expected: 'x=1/3' }), ALL_RIGHT);
});

test('an ordered-pair field compares its coordinates to the same 1e-6', async () => {
  for (const key of ['(1/3,1)', [1 / 3, 1]]) {
    assert.equal(matchesFieldAnswer('(0.3333333, 1)', { answer: key, answerFormat: 'orderedPair' }), true, JSON.stringify(key));
    assert.equal(matchesFieldAnswer('(0.33333, 1)', { answer: key, answerFormat: 'orderedPair' }), false, JSON.stringify(key));
  }
  assert.equal(sameValue('(0.3333333, 1)', '(1/3,1)', 1e-6), true, 'what Path reads');
});

test('a key that states a number smaller than 0.001 keeps the strict comparison it had', () => {
  // 1e-6 is a quarter of 0.000004: an absolute 1e-6 would take 0.000003. The
  // assignment matcher keeps 1e-9 for such a key, so its verdicts are as they
  // were. (Path's absolute default still takes it: for the owner.)
  for (const [sent, key, kind] of [
    ['0.000003', '0.000004', {}],
    ['0.0000035', '0.000004', { inputProfile: 'number' }],
    ['0.000003', '4\\times10^{-6}', { inputProfile: 'number' }],
    ['x=0.000003', 'x=0.000004', {}],
  ]) {
    assert.equal(matchesFieldAnswer(sent, { answer: key, ...kind }), false, `${sent} for ${key}`);
  }
  assert.equal(matchesFieldAnswer('(0.000003, 1)', { answer: '(0.000004, 1)', answerFormat: 'orderedPair' }), false);
  assert.equal(matchesFieldAnswer('(0.000003, 1)', { answer: [0.000004, 1], answerFormat: 'orderedPair' }), false);
  // The key itself, and an author's own tolerance, are still right.
  assert.equal(matchesFieldAnswer('0.000004', { answer: '0.000004' }), true);
  assert.equal(matchesFieldAnswer('0.0005', { answer: '10^{-3}/2', inputProfile: 'number' }), true);
  assert.equal(matchesFieldAnswer('0.0011', { answer: '0.0005', numericTolerance: 0.002 }), true);
});

/* ---------------------------------------------------------------------------
 * 2. A mixed number written with a sign or thousands separators.
 * ------------------------------------------------------------------------- */

test('a mixed number with a dollar sign, a percent sign or thousands separators is the number it names', async () => {
  for (const [sent, key] of [
    ['\\$3\\frac12', '3.5'], ['\\$3\\frac12', '$3.50'], ['-\\$3\\frac12', '-3.5'],
    ['3\\frac12\\%', '3.5'], ['3\\frac12\\%', '3.5%'], ['3\\frac{1}{2}%', '3.5%'],
    ['1,000\\frac{1}{2}', '1000.5'], ['1,000\\frac{1}{2}', '1,000.5'],
  ]) {
    assert.deepEqual(await verdicts(sent, { expected: key, inputProfile: 'number' }), ALL_RIGHT, `${sent} for ${key}`);
  }
});

test('the sign keeps its meaning, the grouping stays strict, and a list keeps its commas', async () => {
  for (const [sent, key] of [
    ['\\$3\\frac12', '3.25'], ['3\\frac12\\%', '1.5'], ['\\$3\\frac12', '3.5%'], ['3\\frac12\\%', '$3.50'],
    ['\\$3\\frac12\\%', '3.5'], ['10,00\\frac{1}{2}', '1000.5'], ['0,500\\frac{1}{2}', '500.5'],
    // A whole number with an improper fraction is neither reading, signed or not.
    ['\\$3\\frac{5}{2}', '5.5'], ['\\$3\\frac{5}{2}', '7.5'],
  ]) {
    assert.deepEqual(await verdicts(sent, { expected: key, inputProfile: 'number' }), ALL_WRONG, `${sent} for ${key}`);
  }
  // In a list, `1,000\frac{1}{2}` is two entries.
  assert.deepEqual(await verdicts('1,000\\frac{1}{2}', { expected: '1000.5', inputProfile: 'list' }), ALL_WRONG);
  // A key written as a mixed number still asks for one (GR13).
  assert.equal(matchesFieldAnswer('3.5%', { answer: '3\\frac12\\%' }), false);
  assert.equal(matchesFieldAnswer('3\\frac12\\%', { answer: '3\\frac12\\%' }), true);
});

/* ---------------------------------------------------------------------------
 * 3. A mixed-number bound before "or" or "and".
 * ------------------------------------------------------------------------- */

test('a mixed-number bound before "or" or "and" is read as the mixed number', async () => {
  for (const [sent, key] of [
    ['x<3\\frac{1}{2} or x>5', 'x<3.5 or x>5'],
    ['x<3\\frac{1}{2}\\text{ or }x>5', 'x<3.5 or x>5'],
    ['x<3\\frac{1}{2}\\lor x>5', 'x<3.5 or x>5'],
    ['x>1\\frac{1}{2} and x<3', '1.5<x<3'],
  ]) {
    assert.deepEqual(await verdicts(sent, { expected: key }), ALL_RIGHT, `${sent} for ${key}`);
  }
  for (const [sent, key] of [
    ['x<3\\frac{1}{2} or x>5', 'x<1.5 or x>5'],
    ['x<3\\frac{1}{2} or x>5', 'x<3.5 or x>6'],
    ['x<3\\frac{5}{2} or x>5', 'x<5.5 or x>5'],
  ]) {
    assert.deepEqual(await verdicts(sent, { expected: key }), ALL_WRONG, `${sent} for ${key}`);
  }
});
