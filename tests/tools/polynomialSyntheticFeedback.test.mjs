// SYNTHETIC DIVISION (ax + b) NAMES THE TWO MISSES A STUDENT CAN ACT ON.
//
// Walkthrough 2026-10-22, Dividing Polynomials CW 9 (r's sign) and CW 10 (the
// textbook's other method for 2y − 1): both got only "The boxes marked in red
// are not right yet."
import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticDivisionKey } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { SYNTHETIC_RETRY, SYNTHETIC_TABLE_RETRY, SYNTHETIC_TABLE_WITHHELD, syntheticMissMessage, syntheticTableMissMessage } from '../../src/tools/polynomialWorkshop/syntheticFeedback.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import polynomialWorkshopGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';

const scaledKey = syntheticDivisionKey({ mode: 'syntheticDivision', dividend: '4y^3-6y^2+4y-1', divisor: '2y-1' });
const plainKey = syntheticDivisionKey({ mode: 'syntheticDivision', dividend: 'x^2+8x+7', divisor: 'x+1' });

test('the original coefficients for 2y − 1 are told the item divides through first', () => {
  const message = syntheticMissMessage({ key: scaledKey, work: { r: '1/2', coefficients: ['4', '-6', '4', '-1'] }, wrong: new Set(['coefficients-1']) });
  assert.match(message, /^This item uses the lesson's method: divide the dividend and the divisor by the leading coefficient of the divisor first, so the divisor is y − r\./);
  // The divided coefficients are the item's own work: no method message.
  assert.equal(syntheticMissMessage({ key: scaledKey, work: { r: '1/2', coefficients: ['2', '-3', '2', '-1/2'] }, wrong: new Set(['sums-2']) }), SYNTHETIC_RETRY);
});

test('r with the wrong sign is told to check the sign, without its value', () => {
  const message = syntheticMissMessage({ key: plainKey, work: { r: '1', coefficients: ['1', '8', '7'] }, wrong: new Set(['r']) });
  assert.match(message, /^Check the sign of r: it is the value of x that makes the divisor 0, so a divisor x \+ c puts −c in the box\.$/);
  assert.equal(syntheticMissMessage({ key: plainKey, work: { r: '5' }, wrong: new Set(['r']) }), SYNTHETIC_RETRY, 'any other wrong r');
});

// Remainder and Factor Theorems CW 1 (walkthrough 2026-10-23): −4 for x − 4
// was told to check the coefficient row, which was right.

const remainderItem = { mode: 'synthetic', dividend: [1, 6, 2], candidateRoot: 4, ask: ['value', 'quotient'] };
const tableMiss = (work) => syntheticTableMissMessage({
  parts: gradeToolCheck(polynomialWorkshopGrader, remainderItem, work).parts,
  root: 4,
  typedRoot: work.root,
});
const right = { root: '4', top: ['1', '6', '2'], middle: ['4', '40'], bottom: ['1', '10', '42'], value: '42', quotient: 'x+10' };

test('the Remainder Theorem table names the first step that is off, never a value', () => {
  assert.equal(gradeToolCheck(polynomialWorkshopGrader, remainderItem, right).isCorrect, true, 'the fixture is the right table');
  const signSlip = tableMiss({ ...right, root: '-4', middle: ['-4', '-8'], bottom: ['1', '2', '-6'], value: '-6', quotient: 'x+2' });
  assert.match(signSlip, /^Check the sign of the number in the box/);
  assert.match(tableMiss({ ...right, root: '3', middle: ['3', '27'], bottom: ['1', '9', '29'], value: '29', quotient: 'x+9' }), /^The number in the box is the value of x that makes the divisor 0/);
  assert.match(tableMiss({ ...right, top: ['1', '2', '6'] }), /^Check the coefficient row/);
  assert.match(tableMiss({ ...right, middle: ['4', '44'] }), /^Check the middle row/);
  assert.match(tableMiss({ ...right, bottom: ['1', '10', '43'] }), /^Check the bottom row/);
  assert.match(tableMiss({ ...right, value: '10' }), /^Your table is right\. P\(r\) is the remainder/);
  assert.match(tableMiss({ ...right, quotient: 'x+42' }), /^Your table is right\. The quotient's coefficients/);
  for (const message of [signSlip, tableMiss({ ...right, value: '10' })]) assert.doesNotMatch(message, /\b(4|40|42|10)\b/, 'no value from the key');
  assert.equal(syntheticTableMissMessage({ parts: [] }), SYNTHETIC_TABLE_RETRY);
});

test('on a DOL, quiz or test (method withheld) the table says only to check in order', () => {
  const parts = gradeToolCheck(polynomialWorkshopGrader, remainderItem, { ...right, root: '-4' }).parts;
  assert.equal(syntheticTableMissMessage({ parts, root: 4, typedRoot: '-4', methodWithheld: true }), SYNTHETIC_TABLE_WITHHELD);
});
