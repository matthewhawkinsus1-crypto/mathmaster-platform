// READ ALOUD'S THIRD PASS (math-speech-3): what the 2026-11-06 Algebra I M3
// T1 walk heard read badly ("Read aloud (platform, logged)"), what
// platform-polish-3 logged, and what a sweep of every lesson and bank text
// found still passed raw. Each is said as a teacher says it now, in English
// and Spanish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { definedFunctionNames, mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
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
    // A decimal that goes on is "and so on" (math-speech-4).
    'b is less than 153.33, and so on, so the greatest whole number is 153, f of 153 equals 598.75.');
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

test('Spanish joins "a" and "de" to the article the reader says', () => {
  // The November handoff, section 6: "es igual a el valor absoluto".
  assert.equal(speechTextFor('f(−5) = |−3| − 3 = 0.', es), 'f de negativo 5 es igual al valor absoluto de negativo 3 fin del valor absoluto menos 3 es igual a 0.');
  assert.equal(speechTextFor('S1 = (−2, −2)', es), 'S1 es igual al punto negativo 2, negativo 2');
  assert.equal(speechTextFor('√|x|', es), 'la raíz cuadrada del valor absoluto de x');
  assert.equal(spokenMathLabel('x \\approx |y|', es), 'x es aproximadamente igual al valor absoluto de y');
  assert.equal(speechTextFor('x ∈ {1, 2}', es), 'x pertenece al conjunto 1, 2 fin de conjunto');
  // The letter a is not the preposition: it is still said.
  assert.match(speechTextFor('f(x) = a|x − h| + k', es), /^f de x es igual a a el valor absoluto de x /);
  // English is unchanged.
  assert.equal(speechTextFor('y = |x|'), 'y equals the absolute value of x');
});

// The sweep of every lesson and bank text (item 4): the symbols passed raw
// most often.
test('a degree sign, ≈, ∓ and ⟂ are said in words', () => {
  assert.equal(speechTextFor('A straight angle measures 180°.'), 'A straight angle measures 180 degrees.');
  assert.equal(speechTextFor('tan(45°)'), 'tangent of 45 degrees');
  assert.equal(speechTextFor('2^(1/2) ≈ 1.41, so M ≈ 3.4 kg'), '2 to the power 1 over 2 is approximately equal to 1.41, so M is approximately equal to 3.4 kg');
  assert.match(speechTextFor('a³ ± b³ = (a ± b)(a² ∓ ab + b²)'), /a squared minus or plus a b plus b squared$/);
  assert.equal(speechTextFor('Tangent ⟂ radius'), 'Tangent is perpendicular to radius');
  assert.equal(speechTextFor('A straight angle measures 180°.', es), 'A straight angle measures 180 grados.');
  assert.equal(speechTextFor('x ≈ 2.4', es), 'x es aproximadamente igual a 2.4');
});

test('a system in a brace is its equations', () => {
  assert.equal(speechTextFor('The system is $\\begin{cases}y=3x+3\\\\y=3x^2+3x\\end{cases}$.'),
    'The system is y equals 3x plus 3; y equals 3x squared plus 3x.');
  assert.equal(spokenMathLabel('\\begin{cases} 2x+y=13 \\\\ y=1 \\end{cases}'), '2x plus y equals 13; y equals 1');
  assert.equal(speechTextFor('Solve \\begin{cases} x+y=12 \\\\ y=x-2 \\end{cases} by substitution.'), 'Solve x plus y equals 12; y equals x minus 2 by substitution.');
});

test('an exponent that holds a bracket, or words, is a power', () => {
  assert.equal(speechTextFor('x^((3 + 3)/3) = x²'), 'x to the power the quantity 3 plus 3 end quantity over 3 equals x squared');
  assert.equal(speechTextFor('x⁸ → x^√8'), 'x to the power 8 gives x to the power the square root of 8');
  assert.equal(speechTextFor('x^(ab)'), 'x to the power ab');
});

test('a point\'s primes and a mean\'s bar are said with their letter', () => {
  assert.equal(speechTextFor('B′ = (−5, 8), so the slope of A′B′ is 8 ÷ (−5).'),
    'B prime equals the point negative 5, 8, so the slope of A prime B prime is 8 divided by negative 5.');
  assert.equal(speechTextFor('AB and A″B″ have slope 5/8; A‴B‴ has slope −8/5.'),
    'AB and A double prime B double prime have slope 5 over 8; A triple prime B triple prime has slope negative 8 over 5.');
  assert.equal(speechTextFor('Means: x̄ = 10 ÷ 4 = 2.5, ȳ = 77 ÷ 4 = 19.25.'),
    'Means: x bar equals 10 divided by 4 equals 2.5, y bar equals 77 divided by 4 equals 19.25.');
  assert.equal(speechTextFor('B′ = (−5, 8)', es), 'B prima es igual al punto negativo 5, 8');
  assert.equal(speechTextFor('x̄ = 2.5', es), 'x barra es igual a 2.5');
});

test('two letters side by side in a bracket with a sign are two variables', () => {
  assert.equal(speechTextFor('a³ + b³ = (a + b)(a² − ab + b²)'),
    'a cubed plus b cubed equals the quantity a plus b end quantity times the quantity a squared minus a b plus b squared');
  assert.equal(speechTextFor('Multiply (−2a³b)(5ab²)'), 'Multiply the quantity negative 2a cubed b times the quantity 5ab squared');
  // Words in a bracket are prose, as before, two letters with no sign too;
  // as an aside they are said between pauses (math-speech-4).
  assert.equal(speechTextFor('Multiply (my answer) by 2'), 'Multiply, my answer, by 2');
  assert.equal(speechTextFor('He wrote (my) next to it.'), 'He wrote, my, next to it.');
});

test('an inverse applied is "f inverse of x"', () => {
  assert.equal(speechTextFor('f⁻¹(x) = 2x + 1'), 'f inverse of x equals 2x plus 1');
  assert.equal(speechTextFor('f(f⁻¹(x)) = x'), 'f of f inverse of x equals x');
  assert.equal(speechTextFor('$f^{-1}(11)$ is the input that $f$ sends to $11$.'), 'f inverse of 11 is the input that f sends to 11.');
  assert.equal(speechTextFor('Check your rule: E(E⁻¹(x)) should simplify back to x.'), 'Check your rule: E of E inverse of x should simplify back to x.');
  assert.equal(definedFunctionNames('Inverse rule s=E⁻¹(x)'), 'E');
  // A matrix's inverse is not applied.
  assert.equal(speechTextFor('X = A⁻¹B'), 'X equals A inverse B');
  assert.equal(speechTextFor('f⁻¹(x) = 2x + 1', es), 'f inversa de x es igual a 2x más 1');
});
