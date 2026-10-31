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

test('absolute value: a coefficient is "times", and a multi-term inside ends where more follows', () => {
  assert.equal(mathToSpeech('g(x) = 2|x - 2| - 4'), 'g of x equals 2 times the absolute value of x minus 2 end absolute value minus 4');
  assert.equal(mathToSpeech('|2x-5|=7'), 'the absolute value of 2x minus 5 end absolute value equals 7');
  assert.equal(mathToSpeech('-2\\left|x+1\\right|+3'), 'negative 2 times the absolute value of x plus 1 end absolute value plus 3');
  // Nothing to close at the end, and one term needs no end.
  assert.equal(speechTextFor('If 3 < x ≤ 7, what is |x - 5|?'), 'If 3 is less than x is less than or equal to 7, what is the absolute value of x minus 5?');
  assert.equal(mathToSpeech('|x| + (2)'), 'the absolute value of x plus the quantity 2');
  assert.equal(mathToSpeech('2|x-2|-4', { language: 'es' }), '2 por el valor absoluto de x menos 2 fin del valor absoluto menos 4');
});

test('a function input of more than one term ends at a pause where more follows', () => {
  assert.equal(mathToSpeech('f(n) = f(n-1) + 4'), 'f of n equals f of the quantity n minus 1, plus 4');
  assert.equal(mathToSpeech('f(x+h)-f(x)'), 'f of the quantity x plus h, minus f of x', 'a sign after the pause is still "minus"');
  assert.equal(mathToSpeech('g(x) = f(x − 7)'), 'g of x equals f of the quantity x minus 7');
});

test('no term keeps a hyphen, whatever sign comes after it', () => {
  assert.equal(mathToSpeech('x-7-\\frac{50}{x-5}'), 'x minus 7 minus the fraction 50 over x minus 5 end fraction');
  assert.equal(mathToSpeech('(3a^2-4a+2)+(a^2+5a-7)'), 'the quantity 3a squared minus 4a plus 2 plus the quantity a squared plus 5a minus 7');
  assert.equal(mathToSpeech('y = -(x-3) - 2'), 'y equals negative the quantity x minus 3 minus 2');
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
  assert.match(speechTextFor('√(∛x) ='), /^the square root of \(?\s*the cube root of x \)? equals$/);
  assert.equal(speechTextFor('as a power of 2: 2^(…)'), 'as a power of 2: 2 to the power …');
  assert.equal(speechTextFor('√(16x⁴y¹¹) =', { language: 'es' }), 'la raíz cuadrada de la cantidad 16x a la potencia 4 y a la potencia 11 es igual a');
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
  // A bracket that is not two function names is still a quantity.
  assert.equal(mathToSpeech('(ab)(c)'), 'the quantity ab times the quantity c');
  assert.equal(mathToSpeech('(x+1)(x-2)'), 'the quantity x plus 1 times the quantity x minus 2');
});
