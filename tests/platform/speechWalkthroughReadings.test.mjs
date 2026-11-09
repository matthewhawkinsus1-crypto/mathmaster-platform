// READ ALOUD, AS THE 2026-10-22 WALKTHROUGHS HEARD IT.
//
// Algebra II Honors DOL #2: g(x) = 2|x − 2| − 4 was "2 the absolute value of x
// minus 2 minus 4" — no "times", and nothing to say where the bars close.
// Algebra I DOL #3: f(n) = f(n − 1) + 4 was "f of the quantity n minus 1 plus
// 4", which is also how f(n − 1 + 4) sounds; "aₙ" went to the engine raw.
// Operations / Dividing polynomials: "plus 5a-7", "x-7 minus the fraction …"
// — a term just before a second sign kept its hyphen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { maskMath, segmentMathText } from '../../src/platform/language/mathSafeText.js';

test('absolute value: a coefficient is "times", and a multi-term inside ends where more follows', () => {
  assert.equal(mathToSpeech('g(x) = 2|x - 2| - 4'), 'g of x equals 2 times the absolute value of x minus 2 end absolute value minus 4');
  assert.equal(mathToSpeech('|2x-5|=7'), 'the absolute value of 2x minus 5 end absolute value equals 7');
  assert.equal(mathToSpeech('-2\\left|x+1\\right|+3'), 'negative 2 times the absolute value of x plus 1 end absolute value plus 3');
  // Nothing to close at the end. One term ends too where more follows
  // (math-speech-2, item 11: "|−3| − 3" was heard as |−3 − 3|).
  assert.equal(speechTextFor('If 3 < x ≤ 7, what is |x - 5|?'), 'If 3 is less than x is less than or equal to 7, what is the absolute value of x minus 5?');
  assert.equal(mathToSpeech('|x| + (2)'), 'the absolute value of x end absolute value plus 2');
  assert.equal(mathToSpeech('2|x-2|-4', { language: 'es' }), '2 por el valor absoluto de x menos 2 fin del valor absoluto menos 4');
});

test('a function input of more than one term ends at a pause where more follows', () => {
  assert.equal(mathToSpeech('f(n) = f(n-1) + 4'), 'f of n equals f of the quantity n minus 1, plus 4');
  assert.equal(mathToSpeech('f(x+h)-f(x)'), 'f of the quantity x plus h, minus f of x', 'a sign after the pause is still "minus"');
  assert.equal(mathToSpeech('g(x) = f(x − 7)'), 'g of x equals f of the quantity x minus 7');
});

test('no term keeps a hyphen, whatever sign comes after it', () => {
  assert.equal(mathToSpeech('x-7-\\frac{50}{x-5}'), 'x minus 7 minus the fraction 50 over x minus 5 end fraction');
  assert.equal(mathToSpeech('(3a^2-4a+2)+(a^2+5a-7)'), 'the quantity 3a squared minus 4a plus 2 end quantity plus the quantity a squared plus 5a minus 7');
  assert.equal(mathToSpeech('y = -(x-3) - 2'), 'y equals negative the quantity x minus 3 end quantity minus 2');
  assert.equal(mathToSpeech('3 - -2'), '3 minus negative 2');
});

test('subscript letters and signs are said, not passed to the engine raw', () => {
  assert.equal(speechTextFor('The table lists n and aₙ.'), 'The table lists n and a sub n.');
  assert.equal(speechTextFor('Find a₍₁₂₎ and aₙ₋₁.'), 'Find a sub 12 and a sub n minus 1.');
  assert.equal(speechTextFor('y − y₁ = m(x − x₁)'), 'y minus y sub 1 equals m times the quantity x minus x sub 1');
});

// Walkthrough 2026-10-23, Algebra II Polynomials and Radicals: powers above 3
// and every root written as a character were passed raw, an index root was
// "⁶ the square root of 16", and x^{2/3} was read "x squared over 3".
test('powers and roots written as characters are read in words', () => {
  assert.equal(speechTextFor('As a difference of squares: 64x⁶ − y⁶ ='), 'As a difference of squares: 64x to the power 6 minus y to the power 6 equals');
  assert.equal(speechTextFor('√(16x⁴y¹¹) ='), 'the square root of the quantity 16x to the power 4 y to the power 11 equals');
  assert.equal(speechTextFor('∛(8/(3y²)) ='), 'the cube root of the quantity 8 over the quantity 3y squared equals');
  assert.match(speechTextFor('⁶√16 / ∛2 ='), /^the 6th root of 16 .* the cube root of 2 equals$/);
  assert.equal(speechTextFor('5∛2 + ∛16'), '5 times the cube root of 2 plus the cube root of 16');
  // A root of a root needs no quantity, and no bracket reaches the voice (math-speech-3).
  assert.equal(speechTextFor('√(∛x) ='), 'the square root of the cube root of x equals');
  // A bracket that holds only an ellipsis is a blank (math-speech-4).
  assert.equal(speechTextFor('as a power of 2: 2^(…)'), 'as a power of 2: 2 to the power blank');
  assert.equal(speechTextFor('√(16x⁴y¹¹) =', { language: 'es' }), 'la raíz cuadrada de la cantidad 16x a la potencia 4 y a la potencia 11 es igual a');
});

// Lesson re-walk 2026-11-06, the radicals lessons again. A superscript right
// after its base was read as a root's index, though MathDisplay draws it as a
// power: Radical Operations CW 4's "x³√x" was "x times the cube root of x",
// and the worked solutions' "5a²b⁴√b" and "y⁴√x/x⁴" the same way. And a blank
// power, x^? (Rational Exponents Warm-Up 1), kept its caret.
test('a power before a root and a blank power are read as they are drawn', () => {
  assert.equal(speechTextFor('x³√x'), 'x cubed times the square root of x');
  assert.equal(speechTextFor('y⁴√x/x⁴'), 'y to the power 4 times the square root of x over x to the power 4');
  assert.equal(speechTextFor('5a²b⁴√b'), '5a squared b to the power 4 times the square root of b');
  assert.equal(speechTextFor('xⁿ√x'), 'x to the power n times the square root of x', 'a letter power too');
  assert.equal(speechTextFor('(x+1)²√x'), 'the quantity x plus 1, squared times the square root of x', 'after a bracket');
  // An index at the start, or after a space or an operator, is still an index.
  assert.equal(speechTextFor('³√x'), 'the cube root of x');
  assert.equal(speechTextFor('2 + ⁴√x'), '2 plus the 4th root of x');
  assert.match(speechTextFor('⁶√16 / ∛2 ='), /^the 6th root of 16 /);
  assert.match(speechTextFor('|5b⁷k⁵| ⁴√(k³)'), /the 4th root of k cubed$/);
  // The blank is said "blank" since math-speech-4: a voice says nothing for "…".
  assert.equal(speechTextFor('x^3 · x^4 = x^?'), 'x cubed times x to the power 4 equals x to the power blank');
  assert.equal(speechTextFor('x³√x', { language: 'es' }), 'x al cubo por la raíz cuadrada de x');
});

// Lesson re-walk 2026-11-06: a table heading's bare unit reached the voice as
// "($)".
test('a bare dollar unit after a quantity is "in dollars"', () => {
  assert.equal(speechTextFor('Money raised by 39 muffins and 25 smoothies ($)'), 'Money raised by 39 muffins and 25 smoothies in dollars');
  assert.equal(speechTextFor('First trip: money ($)'), 'First trip: money in dollars');
  assert.equal(speechTextFor('Cost ($)', { language: 'es' }), 'Cost en dólares');
  // A price is still a price.
  assert.equal(speechTextFor('It costs $4.50.'), 'It costs 4 dollars and 50 cents.');
});

test('a fractional or negative exponent is never "squared", "cubed" or "inverse"', () => {
  assert.equal(mathToSpeech('x^{2/3}'), 'x to the power 2 over 3');
  assert.equal(mathToSpeech('x^{-1/2}'), 'x to the power negative 1 over 2');
  assert.equal(mathToSpeech('x^{3/4}'), 'x to the power 3 over 4');
  assert.equal(mathToSpeech('(27x^6)^{1/3}'), 'the quantity 27x to the power 6, to the power 1 over 3');
  // Whole exponents keep their words.
  assert.equal(mathToSpeech('x^2 + x^3'), 'x squared plus x cubed');
  assert.equal(speechTextFor('A⁻¹ is the inverse.'), 'A inverse is the inverse.');
});

test('(fg)(x) is the product of two functions, applied: "f times g of x" (AX20)', async () => {
  const { spokenMathLabel } = await import('../../src/platform/language/mathSpeechLabel.js');
  assert.equal(mathToSpeech('(fg)(x)'), 'f times g of x');
  assert.equal(mathToSpeech('(f g)(2)'), 'f times g of 2');
  assert.equal(spokenMathLabel('(fg)(x)'), 'f times g of x');
  assert.equal(mathToSpeech('(fg)(x)', { language: 'es' }), 'f por g de x');
  // A bracket that is not two function names is still a quantity; one
  // letter in brackets is not one (math-speech-3).
  assert.equal(mathToSpeech('(ab)(c)'), 'the quantity ab times c');
  assert.equal(mathToSpeech('(x+1)(x-2)'), 'the quantity x plus 1 end quantity times the quantity x minus 2', 'where the first closes is said (item 10)');
});

// Module 2 walkthrough (math-speech-2, item 10): where a bracket closed was
// never said, so "(0.002x² + 4x + 350) − 12x" sounded like one quantity.
test('where a quantity of more than one term closes is said when more follows', () => {
  assert.equal(speechTextFor('P(x) = (0.002x² + 4x + 350) − 12x'), 'P of x equals the quantity 0.002x squared plus 4x plus 350 end quantity minus 12x');
  assert.notEqual(speechTextFor('(0.002x² + 4x + 350) − 12x'), speechTextFor('(0.002x² + 4x + 350 − 12x)'));
  assert.equal(speechTextFor('(x − 3)/2 + 1'), 'the quantity x minus 3 end quantity over 2 plus 1');
  assert.equal(speechTextFor('(x + 2)(x + 3) = 0'), 'the quantity x plus 2 end quantity times the quantity x plus 3 equals 0');
  // Nothing more, a relation, or the bracket's own power: read as before.
  assert.equal(speechTextFor('4(3x + 2) = 8x + 4'), '4 times the quantity 3x plus 2 equals 8x plus 4');
  assert.equal(speechTextFor('(x + 1)² + 3'), 'the quantity x plus 1, squared plus 3');
  assert.equal(speechTextFor('Simplify (x + 4).'), 'Simplify the quantity x plus 4.');
  // A fraction in a bracket is read as before. One number in a bracket is
  // not a quantity (math-speech-3, readAloudThirdPass.test.mjs).
  assert.equal(speechTextFor('y = (1/2)x − 3'), 'y equals the quantity 1 over 2 x minus 3');
  assert.equal(speechTextFor('6(4) + 4'), '6 times 4 plus 4');
  assert.equal(speechTextFor('(−3) + 2'), 'negative 3 plus 2');
  assert.equal(speechTextFor('(x − 3)/2 + 1', { language: 'es' }), 'la cantidad x menos 3 fin de la cantidad sobre 2 más 1');
});

// Module 2 and DOL 2 review walkthrough (item 11): bars were paired wrongly
// where a two-letter product or a "½" split the mathematics ("|bx| = |b|·|x|"
// was "| bx the absolute value of equals b times …"), and one term never said
// where its bars closed ("|−3| − 3" was heard as |−3 − 3|).
test('absolute-value bars are read as a pair, and their end is said where more follows', () => {
  assert.equal(speechTextFor('For |x|, |bx| = |b|·|x|.'), 'For the absolute value of x, the absolute value of bx equals the absolute value of b end absolute value times the absolute value of x.');
  // ½ is "one half" (platform-polish-3, readAloudSlips.test.mjs).
  assert.match(speechTextFor('Equivalently, |½(x − 4)| = ½|x − 4|.'), /^Equivalently, the absolute value of one half times the quantity x minus 4 end absolute value equals /);
  assert.equal(speechTextFor('f(−5) = |−3| − 3 = 0.'), 'f of negative 5 equals the absolute value of negative 3 end absolute value minus 3 equals 0.');
  assert.equal(mathToSpeech('\\ln|x|'), 'natural log of the absolute value of x', 'no "times" after "of"');
  // A relation or the end needs no end.
  assert.equal(speechTextFor('|x| = 3'), 'the absolute value of x equals 3');
  // "es igual al": the preposition joins the article (math-speech-3).
  assert.equal(speechTextFor('f(−5) = |−3| − 3 = 0.', { language: 'es' }), 'f de negativo 5 es igual al valor absoluto de negativo 3 fin del valor absoluto menos 3 es igual a 0.');
  // Only Read aloud's split takes the bars whole: Translate's is unchanged.
  assert.deepEqual(segmentMathText('|bx| = 2', { speech: true }).map((segment) => segment.kind), ['math']);
  assert.equal(maskMath('For |x|, |bx| = |b|·|x|.').masked, 'For ⟦0⟧, ⟦1⟧bx⟦2⟧.');
});
