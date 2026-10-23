/*
 * A SET WRITTEN WITH ± — THE RATIONAL ZERO THEOREM'S LIST OF CANDIDATES.
 *
 * "The possible rational zeros are ±1, ±3, ±5 and ±15": ±a is the two
 * numbers a and −a. A key written {±1, ±3, ±5, ±15} was never matched, not
 * even by the key typed back, and the keypad offered the letters of \pm
 * instead of a ± key.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { inferRequiredAnswerSymbols, requiredAnswerToolForSymbol } from '../../src/platform/interaction/answerEntryTools.js';

const set = (answer) => ({ id: 'zeros', label: 'Possible rational zeros', answer, inputProfile: 'set' });

test('±a in a set is a and −a, in any order and either spelling', () => {
  const field = set('{±1, ±3, ±5, ±15}');
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm1,\\pm3,\\pm5,\\pm15\\right\\rbrace', field), true, 'the key typed back');
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm15,\\pm5,\\pm1,\\pm3\\right\\rbrace', field), true);
  assert.equal(matchesFieldAnswer('\\left\\lbrace1,-1,3,-3,5,-5,15,-15\\right\\rbrace', field), true, 'every value written out');
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm1,3,-3,\\pm5,15,-15\\right\\rbrace', field), true);
  // 3x⁴ − x³ + 4: p | 4 over q | 3.
  const fractions = set('{±1, ±2, ±4, ±1/3, ±2/3, ±4/3}');
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm\\frac{4}{3},\\pm\\frac{2}{3},\\pm\\frac{1}{3},\\pm4,\\pm2,\\pm1\\right\\rbrace', fractions), true);
});

test('a missing candidate, a missing sign or an extra value is not the set', () => {
  const field = set('{±1, ±3, ±5, ±15}');
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm1,\\pm3,\\pm5\\right\\rbrace', field), false, 'missing ±15');
  assert.equal(matchesFieldAnswer('\\left\\lbrace1,3,5,15\\right\\rbrace', field), false, 'only the positive candidates');
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm1,\\pm3,\\pm5,\\pm15,\\pm\\frac{1}{3}\\right\\rbrace', field), false, 'q = 1 gives no fractions');
  // A list is still not a set, as for any other roster key.
  assert.equal(matchesFieldAnswer('\\pm1,\\pm3,\\pm5,\\pm15', field), false);
  // ± before something that is not a number reads as nothing, never as a guess.
  assert.equal(matchesFieldAnswer('\\left\\lbrace\\pm x,\\pm3\\right\\rbrace', set('{±1, ±3}')), false);
});

test('a key written with ± gives the student a ± key, not the letters p and m', () => {
  const keys = inferRequiredAnswerSymbols(['\\left\\lbrace\\pm1,\\pm\\frac{2}{3}\\right\\rbrace']);
  assert.ok(keys.includes('±'));
  assert.equal(keys.includes('p') || keys.includes('m'), false);
  assert.ok(inferRequiredAnswerSymbols(['{±1, ±3}']).includes('±'));
  assert.deepEqual(requiredAnswerToolForSymbol('±'), { label: '±', command: '\\pm', ariaLabel: 'Insert plus or minus' });
  // An ordinary letter p or m in a key is still a variable key.
  assert.ok(inferRequiredAnswerSymbols(['p+m']).includes('p'));
});
