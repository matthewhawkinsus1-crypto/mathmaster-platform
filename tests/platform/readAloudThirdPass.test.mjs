// READ ALOUD'S THIRD PASS (math-speech-3): what the 2026-11-06 Algebra I M3
// T1 walk heard read badly ("Read aloud (platform, logged)"), what
// platform-polish-3 logged, and what a sweep of every lesson and bank text
// found still passed raw. Each is said as a teacher says it now, in English
// and Spanish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';

const es = { language: 'es' };

test('a blank to fill in is "blank"', () => {
  // L1 PR 11 and the Honors twin's labels.
  assert.equal(speechTextFor('Build an equation. Complete 4(x − 2) + 3 = 4x + ___ in different ways.'),
    'Build an equation. Complete 4 times the quantity x minus 2 end quantity plus 3 equals 4x plus blank in different ways.');
  assert.equal(speechTextFor('3(x + 4) − x = ___x + 1 has no solution when the blank is'),
    '3 times the quantity x plus 4 end quantity minus x equals blank x plus 1 has no solution when the blank is');
  assert.equal(speechTextFor('x = −___'), 'x equals negative blank');
  assert.equal(spokenMathLabel('4x + ___'), '4x plus blank');
  assert.equal(speechTextFor('4x + ___', es), '4x más espacio en blanco');
});

test('a minus the split cuts off from the words after it is "minus"', () => {
  // L3 PR 6's hint and worked step.
  assert.equal(speechTextFor('A decreasing amount is (starting amount) − (rate) · (variable).'),
    'A decreasing amount is (starting amount) minus (rate) times (variable).');
  assert.equal(speechTextFor('Profit = revenue − cost, with the whole cost in parentheses.'),
    'Profit equals revenue minus cost, with the whole cost in parentheses.');
  assert.equal(speechTextFor('How many terms are joined by + or −?'), 'How many terms are joined by plus or minus?');
  assert.equal(speechTextFor('4x − ___'), '4x minus blank');
  assert.equal(speechTextFor('revenue − cost', es), 'revenue menos cost');
  // A word's hyphen is not a sign.
  assert.equal(speechTextFor('For a 6-hour job, who charges less?'), 'For a 6- hour job, who charges less?');
  assert.equal(speechTextFor('the x- and y-values'), 'the x- and y-values');
});

test('one number or one letter in brackets is not a quantity', () => {
  // Honors PR 13's worked step: it sounded like 6(4 + 4).
  assert.equal(speechTextFor('Perimeter: 6(4) + 4 = 28 cm'), 'Perimeter: 6 times 4 plus 4 equals 28 cm');
  assert.equal(speechTextFor('5 − (−3) = 8'), '5 minus negative 3 equals 8');
  assert.equal(speechTextFor('2(−3) + x(4)'), '2 times negative 3 plus x times 4');
  assert.equal(speechTextFor('6(4) + 4 = 28', es), '6 por 4 más 4 es igual a 28');
  // A number with its letter too, except in a denominator: 1/(2x) is not (1/2)x.
  assert.equal(speechTextFor('3(2x) + 1'), '3 times 2x plus 1');
  assert.equal(speechTextFor('The four products: (3x)(x) = 3x²'), 'The four products: 3x times x equals 3x squared');
  assert.equal(speechTextFor('1/(2x)'), '1 over the quantity 2x');
  // Its own power keeps it a quantity, and so does anything more.
  assert.equal(speechTextFor('(−3)² = 9'), 'the quantity negative 3, squared equals 9');
  assert.equal(speechTextFor('(2x)² + 1'), 'the quantity 2x, squared plus 1');
  assert.equal(speechTextFor('4(x + 1) + 2'), '4 times the quantity x plus 1 end quantity plus 2');
});

test('a bracket that holds a relation is an aside, said between pauses', () => {
  // L3 CW 11 and Honors CW 9, worked steps.
  assert.equal(speechTextFor('b < 153.33…, so the greatest whole number is 153 (f(153) = 598.75).'),
    'b is less than 153.33 …, so the greatest whole number is 153, f of 153 equals 598.75.');
  assert.equal(speechTextFor('A false statement (0 = −10.5) means the lines are parallel.'),
    'A false statement, 0 equals negative 10.5, means the lines are parallel.');
  assert.equal(speechTextFor('x is multiplied by a negative number (b = −2), which flips the graph.'),
    'x is multiplied by a negative number, b equals negative 2, which flips the graph.');
  assert.equal(spokenMathLabel('(f(153) = 598.75)'), 'f of 153 equals 598.75');
  assert.equal(mathToSpeech('a ÷ c = b ÷ c (c ≠ 0)'), 'a divided by c equals b divided by c, c is not equal to 0');
  assert.equal(speechTextFor('A false statement (0 = −10.5) means', es), 'A false statement, 0 es igual a negativo 10.5, means');
  // A bracket pressed against a name is the name's argument, never an aside.
  assert.equal(speechTextFor('P(x ≤ 3)'), 'P of the quantity x is less than or equal to 3');
});

test('an arrow between two statements is "gives"', () => {
  // L1 CW 1 and the walk's 40 worked steps (math-speech-2 built this).
  assert.equal(speechTextFor('x + 7 = 9 → 4x + 28 = 36'), 'x plus 7 equals 9 gives 4x plus 28 equals 36');
  assert.equal(speechTextFor('x + 7 = 9 → 4x + 28 = 36', es), 'x más 7 es igual a 9 da 4x más 28 es igual a 36');
});
