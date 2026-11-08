// READ ALOUD'S SIXTH PASS (display and reading polish, item 3): what
// math-speech-4 left (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 6), and
// what the sweep of every lesson and bank text found beside it. Each is a
// reading rule every lesson gets, in English and Spanish. The sweep: 295 of
// 58,261 texts read differently, every one traced to a rule below.

import test from 'node:test';
import assert from 'node:assert/strict';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { maskMath, segmentMathText } from '../../src/platform/language/mathSafeText.js';

const es = { language: 'es' };

// "f^-1(x)" was "f inverse times x": the other two spellings were already
// "f inverse of x". A matrix's inverse times a matrix is still a product.
test('an inverse applied with a bare caret is the inverse function, as f⁻¹(x) is', () => {
  for (const text of ['f^-1(x)', 'f⁻¹(x)', '$f^{-1}(x)$']) assert.equal(speechTextFor(text), 'f inverse of x', text);
  assert.equal(speechTextFor('f(x)=2x+3, f^-1(11)=?'), 'f of x equals 2x plus 3, f inverse of 11 equals?');
  assert.equal(speechTextFor('f^-1(x)=(x-(3))/3'), 'f inverse of x equals the quantity x minus 3 end quantity over 3');
  assert.equal(speechTextFor('f^-1(11)', es), 'f inversa de 11');
  assert.equal(speechTextFor('Then X = A⁻¹ · B.'), 'Then X equals A inverse times B.');
  assert.equal(speechTextFor('f^-12(x)'), 'f to the power negative 12 times x', 'a power of −12 is not an inverse');
});

// The Path banks write a square root as "sqrt(": its radicand may hold a
// bracket, "sqrt(x-(3))", which was "sqrt times the quantity x minus 3".
test('a typed square root is read as a root, whatever its radicand holds', () => {
  assert.equal(speechTextFor('f^-1(x)=sqrt(x-(3))+3'), 'f inverse of x equals the square root of the quantity x minus 3 end quantity plus 3');
  assert.equal(speechTextFor('3sqrt(3)'), '3 times the square root of 3');
  assert.equal(speechTextFor('sqrt(t-(3))=3', es), 'la raíz cuadrada de la cantidad t menos 3 es igual a 3');
});

// LaTeX outside its $…$ was split at its braces, which reached the voice.
test('LaTeX written without its delimiters is read as the span it is written as', () => {
  assert.equal(speechTextFor('Find g^{-1}(x).'), 'Find g inverse of x.', 'was "g to the power { negative 1 } x"');
  assert.equal(speechTextFor('x^3*\\sqrt[3]{x^3}'), 'x cubed times the cube root of x cubed', 'was "x cubed times 3 { x cubed }"');
  assert.equal(speechTextFor('Write x^{2} + 1 and a_{n+1}.'), 'Write x squared plus 1 and a sub n plus 1.');
  assert.equal(speechTextFor('x^{n + 1} is'), 'x to the power n plus 1 is', 'the braces hold a space');
  assert.equal(speechTextFor('Find g^{-1}(x).', es), 'Find g inversa de x.');
  // A brace no power, subscript or root opens is the text's own.
  assert.equal(speechTextFor('Enter sets as {value, value}.'), 'Enter sets as {value, value}.');
  assert.equal(speechTextFor('Write x^{2}, and sets as {value, value}.'), 'Write x squared, and sets as {value, value}.');
  assert.equal(speechTextFor('Use $x^{2}$ and y^{3}.'), 'Use x squared and y cubed.');
});

// "(x-h)" was one hyphenated word to the split, handed to the voice.
test('single letters joined by a hyphen in a bracket are a difference', () => {
  assert.equal(speechTextFor('In y=a(x-h)^2+k, the vertex is (h,k).'), 'In y equals a times the quantity x minus h, squared plus k, the vertex is the point h, k.');
  assert.equal(speechTextFor('the factored form is (x-r1)(x-r2).'), 'the factored form is the quantity x minus r1 end quantity times the quantity x minus r2.');
  assert.equal(speechTextFor('Use a^3-b^3=(a-b)(a^2+ab+b^2).'), 'Use a cubed minus b cubed equals the quantity a minus b end quantity times the quantity a squared plus a b plus b squared.');
  assert.equal(speechTextFor('(x-h)^2', es), 'la cantidad x menos h, al cuadrado');
  // Outside a bracket, and beside a word, the hyphen is a word's.
  assert.equal(speechTextFor('Graph it in the x-y plane.'), 'Graph it in the x-y plane.');
  assert.equal(speechTextFor('(see the x-y plane)'), '(see the x-y plane)');
  // Translate's split is the one its packs are keyed to: unchanged.
  assert.deepEqual(segmentMathText('Vertex form: (x-h)').map((segment) => segment.kind), ['text']);
  assert.equal(maskMath('Vertex form: (x-h)').masked, 'Vertex form: (x-h)');
});

// A synthetic division's row, "1 | 1 −2 −5 6", read its signs as subtractions.
test('a row of numbers with a sign pressed against one is a list', () => {
  assert.equal(speechTextFor('1 | 1 −2 −5 6 gives 1 −1 −6 | 0: the quotient is x² − x − 6.'),
    '1, bar, 1, negative 2, negative 5, 6 gives 1, negative 1, negative 6, bar, 0: the quotient is x squared minus x minus 6.');
  assert.equal(speechTextFor('1 | 1 −2 −5 6', es), '1, barra, 1, negativo 2, negativo 5, 6');
  // A spaced minus subtracts; two numbers are not a row; nor numbers with no sign.
  assert.equal(speechTextFor('x² − x − 6'), 'x squared minus x minus 6');
  assert.equal(speechTextFor('5 −3 = 2'), '5 minus 3 equals 2');
  assert.equal(speechTextFor('the scores 90 85 70'), 'the scores 90 85 70');
});

// About 40 fractions inside brackets or over a word kept their slash.
test('a fraction inside a bracket, over a bracket of brackets, or over a word is read "over"', () => {
  assert.equal(speechTextFor('Let’s back up. 2/(y + 1/2) is the same as…'), 'Let’s back up. 2 over the quantity y plus 1 over 2 is the same as…');
  assert.equal(speechTextFor('$1/(x-(3))+3$'), '1 over the quantity x minus 3 end quantity plus 3');
  assert.equal(speechTextFor('(3*x+(3))/((x-(3))*(x-(3)))'), 'the quantity 3 times x plus 3 end quantity over the quantity the quantity x minus 3 end quantity times the quantity x minus 3');
  assert.equal(speechTextFor('(y^(1/2) + 1)/(y^(1/2) − 1) ='), 'the quantity y to the power 1 over 2 plus 1 end quantity over the quantity y to the power 1 over 2 minus 1 equals');
  // A denominator's bracket of two letters, said as A/(bh) is (the review's
  // reading, accessibleMathSpeech.test.mjs), and a numerator of two.
  assert.equal(speechTextFor('so the first is b⁴/(ac).'), 'so the first is b to the power 4 over the quantity ac.');
  assert.equal(speechTextFor('x√(xy)/y⁴'), 'x times the square root of xy over y to the power 4');
  // A number or a letter over a quantity's name, and a slash before a blank.
  assert.equal(speechTextFor('Plot x = 1/base'), 'Plot x equals 1 over base');
  assert.equal(speechTextFor('the ratio I/reference'), 'the ratio I over reference');
  assert.equal(speechTextFor('x^(−2/3) = 1 / ?'), 'x to the power negative 2 over 3 equals 1 over blank');
  assert.equal(speechTextFor('After cancelling a: √2 / ( ? )'), 'After cancelling a: the square root of 2 over blank');
  assert.equal(speechTextFor('Plot x = 1/base', es), 'Plot x es igual a 1 sobre base');
  // What a slash means elsewhere is unchanged.
  assert.equal(speechTextFor('For slope 1 move right 1/up 1.'), 'For slope 1 move right 1/ up 1.');
  assert.equal(speechTextFor('Show your work and/or explain.'), 'Show your work and or explain.');
  assert.equal(speechTextFor('60 miles/hour'), '60 miles per hour');
});

// The sweep: "3\sqrt{12}" was "3 the square root of 12", where 3√12 is
// "3 times the square root of 12" (math-speech-3). 198 texts, 55 in lessons.
test('a LaTeX root after its coefficient multiplies it, as a written root does', () => {
  assert.equal(speechTextFor('For $\\sqrt{63}$ and $3\\sqrt{12}$, find a factor.'), 'For the square root of 63 and 3 times the square root of 12, find a factor.');
  assert.equal(speechTextFor('$d = 0.926\\sqrt[3]{k} - 0.169$'), 'd equals 0.926 times the cube root of k minus 0.169');
  assert.equal(speechTextFor('$x^{2}\\sqrt[5]{x}$'), 'x squared times the 5th root of x');
  assert.equal(spokenMathLabel('\\frac{3\\sqrt{2}}{\\sqrt{6}}'), 'the fraction 3 times the square root of 2 over the square root of 6 end fraction');
  assert.equal(speechTextFor('Adding gives $(3+3)\\sqrt{3}$.'), 'Adding gives the quantity 3 plus 3 end quantity times the square root of 3.');
  assert.equal(speechTextFor('$3\\sqrt{12}$', es), '3 por la raíz cuadrada de 12');
  // A command before a root is not its coefficient, and a root alone has none.
  assert.equal(speechTextFor('$\\pm\\sqrt{2}$'), 'plus or minus the square root of 2');
  assert.equal(speechTextFor('$\\sqrt{2}$'), 'the square root of 2');
  // As the written forms read.
  assert.equal(speechTextFor('$3\\sqrt{12}$'), speechTextFor('3√12'));
});
