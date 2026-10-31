/*
 * 2×2 VERIFICATION SHOWS A SIDE ALREADY WRITTEN AS A NUMBER AS GIVEN (TL50).
 *
 * Verifying (2, 5) in x + y = 7 asked the student to retype the 7. The 3×3
 * verification has shown such a side as given since #369; the 2×2 now does
 * too. The given side still reaches the check and the shared grader as that
 * side's value (twoByTwoVerificationSides), so the work graded is exactly what
 * a student who retyped it would send, and the verdict cannot move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { verificationSidesWork } from '../../functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  twoByTwoVerificationSides,
  twoByTwoVerificationValid,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';

// y = 2x + 1, x + y = 7  ->  (2, 5). Only E2's right side is a written number.
const PAIR = { type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', equations: ['y = 2x + 1', 'x + y = 7'], variables: ['x', 'y'] };
const SOLUTION = { x: 2, y: 5 };

const entry = (leftAnswer, rightAnswer = '') => ({ placed: { x: true, y: true }, leftAnswer, rightAnswer, checked: false, valid: false });
const work = (E1, E2) => ({
  dimension: 2,
  method: 'substitution',
  values: { x: 2, y: 5 },
  verification: verificationSidesWork({ E1, E2 }),
  reducedStatement: null,
  specialCase: { statementTruth: '', solutionCount: '', classification: '' },
});
const grade = (question, studentWork) => {
  const browser = gradeToolCheck(systemsWorkspaceGrader, question, studentWork);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, 'the server reaches the browser verdict');
  return browser;
};

test('a side written as a number is filled in as given; a side with a variable is not', () => {
  assert.deepEqual(twoByTwoVerificationSides('x + y = 7', entry('7')), entry('7', '7'));
  assert.deepEqual(twoByTwoVerificationSides('7 = x + y', entry('', '7')), entry('7', '7'));
  assert.deepEqual(twoByTwoVerificationSides('x - y = (-3)', entry('-3')), entry('-3', '(-3)'));
  assert.deepEqual(twoByTwoVerificationSides('2x + y = 3/4', entry('3/4')), entry('3/4', '3/4'));
  // Nothing to fill: both sides need evaluating, and what was typed stays.
  assert.deepEqual(twoByTwoVerificationSides('y = 2x + 1', entry('5', '5')), entry('5', '5'));
  assert.deepEqual(twoByTwoVerificationSides('y = 2x + 1', entry('5')), entry('5', ''));
  // A side that only looks numeric after evaluating is not given: the
  // student still evaluates (2 + 3).
  assert.deepEqual(twoByTwoVerificationSides('(2 + 3) = x + y', entry('')), entry('', ''));
});

test('the given side checks as typed: right values pass, a wrong left side still fails', () => {
  const sides = twoByTwoVerificationSides('x + y = 7', entry('7'));
  assert.equal(twoByTwoVerificationValid('x + y = 7', SOLUTION, sides.leftAnswer, sides.rightAnswer), true);
  const wrong = twoByTwoVerificationSides('x + y = 7', entry('8'));
  assert.equal(twoByTwoVerificationValid('x + y = 7', SOLUTION, wrong.leftAnswer, wrong.rightAnswer), false);
});

test('the work the screen sends grades exactly as the retyped work did', () => {
  const E1 = twoByTwoVerificationSides(PAIR.equations[0], entry('5', '5'));
  const asGiven = grade(PAIR, work(E1, twoByTwoVerificationSides(PAIR.equations[1], entry('7'))));
  const retyped = grade(PAIR, work(E1, entry('7', '7')));
  assert.equal(asGiven.isCorrect, true);
  assert.deepEqual(asGiven.parts, retyped.parts);
  // Without the given side the same verification would be unfinished: the
  // fill is what keeps the new screen's work whole.
  const unfilled = grade(PAIR, work(E1, entry('7')));
  assert.equal(unfilled.isCorrect, false);
});

test('the screen uses the given sides for what it shows, what it checks and what it sends', () => {
  const source = readFileSync(new URL('../../src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', import.meta.url), 'utf8');
  assert.match(source, /const verificationSides = \(index\) => twoByTwoVerificationSides\(equations\[index\]/);
  assert.match(source, /const sides = verificationSides\(index\);\s*const valid = twoByTwoVerificationValid\(equations\[index\], solution, sides\.leftAnswer, sides\.rightAnswer\)/);
  assert.match(source, /verification: verificationSidesWork\(\{ E1: verificationSides\(0\), E2: verificationSides\(1\) \}\)/);
  assert.match(source, /data-given-side=\{side\}/, 'a given side is drawn as given');
});
