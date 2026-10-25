/*
 * THE x − r SYNTHETIC VIEW TAKES A FRACTIONAL ROOT (TL49, finding E1-5).
 *
 * The Remainder and Factor Theorems' synthetic view (Polynomial Workshop,
 * mode `synthetic`) built its divisor from a number: a candidate root of 0.5
 * showed "x − 0.5", a fraction ("1/2") or a divisor 2x − 1 could not be
 * authored at all, and dividing by 2x − 1 had to go to long division.
 *
 * Now r may be a fraction, written as one or read from a linear divisor
 * ax + b (2x − 1 divides as x − 1/2); the view writes it as a fraction. The
 * table is the same calculation with that r. Its remainder is P(r), which is
 * the remainder for ax + b too, and ax + b is a factor exactly when x − r is;
 * the quotient asked is for the divisor the question names — for 2x − 1 the
 * table's quotient divided by 2, as the honors lesson connects them (rfh-cw-6).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import polynomialGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import {
  syntheticDivisionRoot,
  syntheticRemainderDivisor,
  syntheticRootText,
  xMinusRootText,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import {
  SYNTHETIC_SCALED_QUOTIENT,
  syntheticTableMissMessage,
} from '../../src/tools/polynomialWorkshop/syntheticFeedback.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const q = (fields) => ({ type: 'polynomialWorkshop', mode: 'synthetic', ...fields });

/** The browser's Check and the server, which must agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(polynomialGrader, question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, true, server.reason);
  assert.equal(server.isCorrect, browser.isCorrect);
  assert.deepEqual(server.parts, browser.parts);
  return Object.fromEntries(server.parts.map((part) => [part.id, part.isCorrect]));
};

// P(x) = 6x³ + 7x² − x − 2 = (2x − 1)(3x² + 5x + 2): by x − 1/2 the bottom
// row is 6, 10, 4 | 0, so the quotient for x − 1/2 is 6x² + 10x + 4.
const P = [6, 7, -1, -2];
const table = { root: '1/2', top: ['6', '7', '-1', '-2'], middle: ['3', '5', '2'], bottom: ['6', '10', '4', '0'], value: '0', factorChoice: 'yes' };
const FOR_X_MINUS_HALF = '6x^2+10x+4';
const FOR_2X_MINUS_1 = '3x^2+5x+2';

test('r is read exactly: a number, a fraction, or the zero of ax + b', () => {
  assert.deepEqual(syntheticRemainderDivisor({ candidateRoot: 0.5 }), { root: 0.5, leading: 1, divisor: null });
  assert.deepEqual(syntheticRemainderDivisor({ candidateRoot: '1/2' }), { root: 0.5, leading: 1, divisor: null });
  assert.deepEqual(syntheticRemainderDivisor({ candidateRoot: '−3/2' }), { root: -1.5, leading: 1, divisor: null });
  assert.deepEqual(syntheticRemainderDivisor({ divisor: [2, -1] }), { root: 0.5, leading: 2, divisor: [2, -1] });
  assert.deepEqual(syntheticRemainderDivisor({ divisor: [-2, 1] }), { root: 0.5, leading: -2, divisor: [-2, 1] });
  // As before: a candidate root wins, and x + 3 is r = −3.
  assert.deepEqual(syntheticRemainderDivisor({ candidateRoot: 4, divisor: [2, -1] }), { root: 4, leading: 1, divisor: null });
  assert.deepEqual(syntheticRemainderDivisor({ divisor: [1, 3] }), { root: -3, leading: 1, divisor: null });
  assert.equal(syntheticDivisionRoot({ divisor: [3, 2] }), -2 / 3);
  // Nothing to divide by.
  [{}, { candidateRoot: 'three' }, { candidateRoot: true }, { divisor: [0, 3] }, { divisor: [1, 2, 3] }, { divisor: [2, 'a'] }]
    .forEach((question) => assert.equal(syntheticRemainderDivisor(question), null, JSON.stringify(question)));
});

test('r is written as a fraction: x − 1/2 and P(1/2), never x − 0.5', () => {
  assert.equal(syntheticRootText(0.5), '1/2');
  assert.equal(syntheticRootText(-1.5), '−3/2');
  assert.equal(syntheticRootText(-2 / 3), '−2/3');
  assert.equal(syntheticRootText(3), '3');
  assert.equal(xMinusRootText(0.5), 'x − 1/2');
  assert.equal(xMinusRootText(-1.5), 'x + 3/2');
  assert.equal(xMinusRootText(-3), 'x + 3');
  assert.equal(xMinusRootText(0), 'x');

  // The view writes its divisor, P(r) and the factor question from these, and
  // names ax + b as written; it no longer builds "x − 0.5" from the number.
  const view = region(executableSource(fs.readFileSync('src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', 'utf8')), 'function SyntheticRemainderFactor(', '\n}', 'SyntheticRemainderFactor');
  assert.match(view, /const divisorText = division\.divisor \? polynomialReadoutText\(division\.divisor\) : xMinusRootText\(root\);/);
  assert.match(view, /P\(\{rootText\}\) =/);
  assert.match(view, /Is \(\{divisorText\}\) a factor of P\(x\)\?/);
  assert.doesNotMatch(view, /polynomialReadoutText\(\[1, -/);
});

test('dividing by 2x − 1: the table by x − 1/2, P(1/2), the factor, and the quotient for 2x − 1', () => {
  const question = q({ dividend: P, divisor: [2, -1] });
  const right = grade(question, { ...table, quotient: FOR_2X_MINUS_1 });
  assert.deepEqual(right, { 'divisor-root': true, coefficients: true, products: true, sums: true, value: true, quotient: true, factor: true });
  // The table's own quotient is the one for x − 1/2, not for 2x − 1.
  assert.equal(grade(question, { ...table, quotient: FOR_X_MINUS_HALF }).quotient, false);
  // Decimals read as the fractions they are.
  assert.equal(grade(question, { ...table, root: '0.5', quotient: '3x^2+5x+2' })['divisor-root'], true);
  // The sign of r is still checked: 2x − 1 is zero at 1/2, not −1/2.
  assert.equal(grade(question, { ...table, root: '-1/2', quotient: FOR_2X_MINUS_1 })['divisor-root'], false);
});

test('a candidate root of 1/2 divides by x − 1/2, and its quotient is the table\'s', () => {
  const question = q({ dividend: P, candidateRoot: '1/2' });
  const right = grade(question, { ...table, quotient: FOR_X_MINUS_HALF });
  assert.ok(Object.values(right).every(Boolean), JSON.stringify(right));
  assert.equal(grade(question, { ...table, quotient: FOR_2X_MINUS_1 }).quotient, false);
  // A remainder that is not 0: P(1/2) for 2x³ − 3x² + 4 is 7/2, and not a factor.
  const other = q({ dividend: [2, -3, 0, 4], divisor: [2, -1] });
  const marked = grade(other, { root: '1/2', top: ['2', '-3', '0', '4'], middle: ['1', '-1', '-1/2'], bottom: ['2', '-2', '-1', '7/2'], value: '7/2', quotient: 'x^2-x-1/2', factorChoice: 'no' });
  assert.ok(Object.values(marked).every(Boolean), JSON.stringify(marked));
});

test('a right table with a wrong quotient for ax + b says to divide by the leading coefficient', () => {
  const parts = [{ id: 'divisor-root', isCorrect: true }, { id: 'sums', isCorrect: true }, { id: 'quotient', isCorrect: false }];
  assert.equal(syntheticTableMissMessage({ parts, root: 0.5, leading: 2 }), SYNTHETIC_SCALED_QUOTIENT);
  assert.doesNotMatch(SYNTHETIC_SCALED_QUOTIENT, /\d/, 'it states no value');
  assert.notEqual(syntheticTableMissMessage({ parts, root: 3 }), SYNTHETIC_SCALED_QUOTIENT, 'x − r keeps its own line');
});
