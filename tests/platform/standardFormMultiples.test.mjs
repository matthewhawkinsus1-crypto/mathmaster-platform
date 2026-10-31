// GR29: A WHOLE-NUMBER MULTIPLE OF A STANDARD-FORM KEY IS RIGHT
// (the owner, 2026-10-23).
//
// With a key written Ax + By = C, the same equation with every term
// multiplied by one nonzero whole number — 4x + 2y = 6, or −2x − y = −3, for
// 2x + y = 3 — is the same line in the same form, and was graded wrong with
// no reason given. It is right now on every surface that compares an answer
// with sameValue. A multiple by a fraction, another form of the line, or a
// different line stays wrong. (The owner also asked that the student be told
// to divide out the common factor; no grading surface carries a note with a
// right answer yet, so it is accepted without one.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { wholeMultipleOfLine } from '../../functions/shared/linearEquationForm.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

/** [secure, path/live, assignment] for one equation field. */
const verdicts = async (response, expected) => {
  const definition = mathPath.privateGradingDefinition({ responseFields: [{ id: 'eq', inputProfile: 'equation', expected }] });
  const secure = (await secureItems.gradeItem(definition, { responses: { eq: response } })).isCorrect === true;
  const path = (await mathPath.gradeResponse(definition, { responses: { eq: response } })).isCorrect === true;
  const assignment = matchesFieldAnswer(response, { id: 'eq', inputProfile: 'equation', answer: expected });
  return [secure, path, assignment];
};
const ALL_RIGHT = [true, true, true];
const ALL_WRONG = [false, false, false];

test('a whole-number multiple of a standard-form key, written in standard form, is right on every grader', async () => {
  for (const [response, key] of [
    ['4x+2y=6', '2x+y=3'], ['4x + 2y = 6', '2x + y = 3'], ['-2x-y=-3', '2x+y=3'], ['6=4x+2y', '2x+y=3'],
    ['-4x-2y=-6', '2x+y=3'], ['2y+4x=6', '2x+y=3'], ['4x+6y=12', '2x+3y=6'], ['-2x-3y=-6', '2x+3y=6'],
    ['10x-4y=12', '5x-2y=6'], ['2y-8x=0', 'y-4x=0'], ['50x+42y=1200', '25x+21y=600'],
  ]) {
    assert.deepEqual(await verdicts(response, key), ALL_RIGHT, `${response} for ${key}`);
  }
  assert.equal(sameValue('4x+2y=6', '2x+y=3'), true);
});

test('not a whole multiple, not standard form, or not the same line: still wrong', async () => {
  for (const [response, key, why] of [
    ['x+0.5y=1.5', '2x+y=3', 'a multiple by a fraction'],
    ['x+\\frac{1}{2}y=\\frac{3}{2}', '2x+y=3', 'a multiple by a fraction'],
    ['2x+y=3', '4x+2y=6', 'the key divided, not multiplied'],
    ['y=-2x+3', '2x+y=3', 'slope-intercept form'],
    ['4x+2y-6=0', '2x+y=3', 'general form'],
    ['y-3=-2x', '2x+y=3', 'another form'],
    ['4x+2y=3', '2x+y=3', 'a parallel line'],
    ['0x+0y=0', '2x+y=3', 'no line'],
  ]) {
    assert.deepEqual(await verdicts(response, key), ALL_WRONG, `${response} for ${key}: ${why}`);
  }
  // Only a key written in standard form asks for it: a slope-intercept key
  // still refuses a scaled equation, which is another form.
  assert.deepEqual(await verdicts('2y=-4x+6', 'y=-2x+3'), ALL_WRONG);
  assert.deepEqual(await verdicts('2x+y=3', 'y=-2x+3'), ALL_WRONG);
});

test('wholeMultipleOfLine: the whole number n with first = n × second, or null', () => {
  assert.equal(wholeMultipleOfLine('4x+2y=6', '2x+y=3'), 2);
  assert.equal(wholeMultipleOfLine('-2x-y=-3', '2x+y=3'), -1);
  assert.equal(wholeMultipleOfLine('2x+y=3', '2x+y=3'), 1);
  assert.equal(wholeMultipleOfLine('x+0.5y=1.5', '2x+y=3'), null);
  assert.equal(wholeMultipleOfLine('4x+2y=3', '2x+y=3'), null);
  assert.equal(wholeMultipleOfLine('y=x^2', '2x+y=3'), null);
});
