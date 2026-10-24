// FB22: a miss that is only the wrong FORM is said while tries are left, as
// "not in lowest terms" is (FB23, lowestTermsWhileOpen.test.mjs): a point
// where one number is asked (the y-intercept typed "(0, 4)"), and an
// inequality where interval notation is asked ("y ≤ −3"), and the reverse of
// each. Each sentence names only the form, and at most that the student's
// own numbers are right; it never names a move toward a different value.

import test from 'node:test';
import assert from 'node:assert/strict';
import { genericMissCheck, GENERIC_MISS_MESSAGES } from '../../src/platform/supports/feedback/genericMissChecks.js';

const openCheck = (student, expected) => genericMissCheck({ student, expected })?.check ?? null;

test('a point typed where one number is asked, or one number where a point is, is said while open', () => {
  assert.equal(openCheck('(0, 4)', '4'), 'point-for-value');
  assert.equal(openCheck('(0,5)', '4'), 'point-for-value', 'whether or not its numbers are right');
  assert.equal(openCheck('3', '(3, 4)'), 'value-for-point');
  assert.equal(genericMissCheck({ student: '(0, 4)', expected: '4' }).message, 'This asks for a single number, not an ordered pair.');
});

test('an inequality typed where interval notation is asked is said while open, and whether its numbers are right', () => {
  assert.equal(openCheck('y \\le -3', '\\left(-\\infty, -3\\right]'), 'interval-notation-right-value');
  assert.equal(openCheck('2 \\le x < 5', '[2, 5)'), 'interval-notation-right-value');
  assert.equal(openCheck('x \\ge 2', '[2, \\infty)'), 'interval-notation-right-value');
  assert.equal(openCheck('y \\le -4', '(-\\infty, -3]'), 'interval-notation-asked');
  assert.equal(openCheck('(-\\infty, -3]', 'y \\le -3'), 'inequality-right-value');
  assert.equal(openCheck('(-\\infty, -2]', 'y \\le -3'), 'inequality-asked');
  assert.equal(GENERIC_MISS_MESSAGES['interval-notation-right-value'], 'Your inequality describes the right numbers, but this asks for interval notation.');
});

test('the right form with the wrong numbers, and anything unreadable, is still silent while open', () => {
  assert.equal(openCheck('(-\\infty, -4]', '(-\\infty, -3]'), null);
  assert.equal(openCheck('y \\le -4', 'y \\le -3'), null);
  assert.equal(openCheck('5', '4'), null);
  assert.equal(openCheck('7', '-7'), null, 'a move toward another value is never said while open');
  // Two letters: no single variable to read the inequality in.
  assert.equal(openCheck('x + y \\le 3', '(-\\infty, 3]'), 'interval-notation-asked');
});
