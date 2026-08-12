import assert from 'node:assert/strict';
import {
  compareMathAnswer,
  looksLikeFiniteSetNotation,
  parseFiniteSetNotation,
} from '../../src/answerUtils.js';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';

const roster = '{-4, -3, -2, -1, 0, 1, 2}';
const mathLiveForms = [
  '{-4,-3,-2,-1,0,1,2}',
  '\\{-4,-3,-2,-1,0,1,2\\}',
  '\\left\\{-4,-3,-2,-1,0,1,2\\right\\}',
  '\\left\\lbrace -4,-3,-2,-1,0,1,2 \\right\\rbrace',
];

for (const response of mathLiveForms) {
  assert.equal(compareMathAnswer(response, roster), true, `${response} should match the authored roster set`);
  assert.equal(sameValue(response, roster), true, 'shared server/client equivalence should agree');
}

assert.equal(compareMathAnswer('{2,1,0,-1,-2,-3,-4}', roster), true, 'set element order must not affect correctness');
assert.equal(compareMathAnswer('{-4,-3,-2,-1,0,1,2,2}', roster), true, 'duplicate roster entries do not change the mathematical set');
assert.equal(compareMathAnswer('-4,-3,-2,-1,0,1,2', roster), false, 'roster-form answers still require set delimiters');
assert.equal(compareMathAnswer('{-4,-3,-2,-1,0,1,3}', roster), false, 'a wrong set element must fail');

assert.equal(compareMathAnswer('{3, 2, -1, -3}', '{-3, -1, 2, 3}'), true, 'domain/range roster sets may be entered in any order');
assert.equal(looksLikeFiniteSetNotation('\\left\\lbrace 1,2 \\right\\rbrace'), true);
assert.deepEqual(parseFiniteSetNotation('∅'), [], 'empty-set notation is a finite empty set');

// Existing scalar/fraction equivalence must continue to work.
assert.equal(compareMathAnswer('1/3', '0.3333333333333333', 1e-9), true);
assert.equal(compareMathAnswer('\\frac{1}{2}', '0.5'), true);
assert.equal(compareMathAnswer('x \\ge 2', 'x≥2'), true);

console.log('setAnswerEquivalence.test.mjs: all assertions passed');
