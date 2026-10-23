// SYNTHETIC DIVISION (ax + b) NAMES THE TWO MISSES A STUDENT CAN ACT ON.
//
// Walkthrough 2026-10-22, Dividing Polynomials CW 9 (r's sign) and CW 10 (the
// textbook's other method for 2y − 1): both got only "The boxes marked in red
// are not right yet."
import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticDivisionKey } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { SYNTHETIC_RETRY, syntheticMissMessage } from '../../src/tools/polynomialWorkshop/syntheticFeedback.js';

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
