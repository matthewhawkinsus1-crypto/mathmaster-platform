// READ ALOUD'S THIRD PASS (math-speech-3): what the 2026-11-06 Algebra I M3
// T1 walk heard read badly ("Read aloud (platform, logged)"), what
// platform-polish-3 logged, and what a sweep of every lesson and bank text
// found still passed raw. Each is said as a teacher says it now, in English
// and Spanish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { maskMath } from '../../src/platform/language/mathSafeText.js';

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

test('a root is read with the bars, brackets and signs around it', () => {
  // platform-polish-3 logged "| the square root of x |".
  assert.equal(speechTextFor('|√x|'), 'the absolute value of the square root of x');
  assert.equal(speechTextFor('Simplify |√x| + 1.'), 'Simplify the absolute value of the square root of x end absolute value plus 1.');
  assert.equal(speechTextFor('f(x) = |∛x|'), 'f of x equals the absolute value of the cube root of x');
  assert.equal(speechTextFor('Find |ab√x| + 1.'), 'Find the absolute value of ab times the square root of x end absolute value plus 1.');
  assert.equal(speechTextFor('|√x|', es), 'el valor absoluto de la raíz cuadrada de x');
  // A sign and a bracket beside a root were passed raw.
  assert.equal(speechTextFor('Use the graph of f(x)=−√x.'), 'Use the graph of f of x equals negative the square root of x.');
  assert.equal(speechTextFor('−√5'), 'negative the square root of 5');
  assert.equal(speechTextFor('√45 − √80 + √20'), 'the square root of 45 minus the square root of 80 plus the square root of 20');
  assert.equal(speechTextFor('(√3 − 1)/2'), 'the quantity the square root of 3 minus 1 end quantity over 2');
  assert.equal(speechTextFor('(2√3 + 3√5)(3 − √3) ='),
    'the quantity 2 times the square root of 3 plus 3 times the square root of 5 end quantity times the quantity 3 minus the square root of 3 equals');
  assert.equal(speechTextFor('(√2, √3)'), 'the point the square root of 2, the square root of 3');
  assert.equal(speechTextFor('√(∛x) ='), 'the square root of the cube root of x equals');
  assert.equal(speechTextFor('(√3 − 1)/2', es), 'la cantidad la raíz cuadrada de 3 menos 1 fin de la cantidad sobre 2');
  // In prose a root is read as before, and the marks the split uses are never said.
  assert.equal(speechTextFor('Simplify √50 completely.'), 'Simplify the square root of 50 completely.');
  assert.doesNotMatch(speechTextFor('|√x| + (√2, √3)'), /[]/u);
});

test('Greek letters are said by name', () => {
  // platform-polish-3 logged \alpha and \beta as silent.
  assert.equal(speechTextFor('\\alpha + \\beta = 90'), 'alpha plus beta equals 90');
  assert.equal(speechTextFor('$\\cos\\alpha=\\frac{12}{13}$'), 'cosine of alpha equals 12 over 13');
  // \Delta was silent: "y over x".
  assert.equal(speechTextFor('One student computes slope as $\\Delta y/\\Delta x=3$.'), 'One student computes slope as delta y over delta x equals 3.');
  assert.equal(speechTextFor('The rate of change is Δy ÷ Δx.'), 'The rate of change is delta y divided by delta x.');
  // φ was prose, so its minus was a sign: "φ negative 1".
  assert.equal(speechTextFor('φ² = φ − 1'), 'phi squared equals phi minus 1');
  assert.equal(speechTextFor('1/φ = 2 − φ'), '1 over phi equals 2 minus phi');
  assert.equal(speechTextFor('The leg adjacent to α is 3.'), 'The leg adjacent to alpha is 3.');
  assert.equal(speechTextFor('tan θ = 3/4'), 'tangent of theta equals 3 over 4');
  assert.equal(speechTextFor('\\alpha + \\beta = 90', es), 'alfa más beta es igual a 90');
  assert.equal(speechTextFor('1/φ = 2 − φ', es), '1 sobre fi es igual a 2 menos fi');
});

test('a minus before the letter a is "minus"', () => {
  // L1 Honors CW 8's feedback (A1 M3 T2 walkthrough).
  assert.equal(speechTextFor('Substitute s = 450 − a into 5s + 10a = C and simplify.'),
    'Substitute s equals 450 minus a into 5s plus 10a equals C and simplify.');
  assert.equal(speechTextFor('Write 2 − a as −a + 2.'), 'Write 2 minus a as negative a plus 2.');
});

test('a price inside mathematics keeps "dollars", and nothing says a price change unless the text does', () => {
  // The ASVAB bank's prices in LaTeX: the span ended at the escaped sign.
  assert.equal(speechTextFor('Between the two rows the cost rises by $\\$54 - \\$30$ over $3$ extra days.'),
    'Between the two rows the cost rises by 54 dollars minus 30 dollars over 3 extra days.');
  assert.equal(speechTextFor('It cost $\\$3$.'), 'It cost 3 dollars.');
  assert.equal(speechTextFor('Each copy carries $\\$40 - \\$25 = \\$15$ of the setup.', es),
    'Each copy carries 40 dólares menos 25 dólares es igual a 15 dólares of the setup.');
  // A change of price is said as the text says it.
  assert.equal(speechTextFor('The price rose from $5 to $10.'), 'The price rose from 5 dollars to 10 dollars.');
  // Translate's split is unchanged.
  assert.deepEqual(maskMath('It cost $\\$3$.'), { masked: 'It cost ⟦0⟧$.', tokens: ['$\\$3'] });
});
