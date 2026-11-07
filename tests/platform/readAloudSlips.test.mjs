// READ ALOUD'S REMAINING SLIPS (platform-polish-3; F-READ-SYMBOLS in the
// 2026-11-06 Algebra I M3 T2 walkthrough, and the November handoff's section
// 6): a fraction character went to the voice raw, two letters side by side
// were read as a word, a slash between two roots was a symbol, sin(x) was
// "sin times the quantity x", and bars before a root never said where they
// closed. Each is said as a teacher says it now, in English and Spanish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { segmentMathText } from '../../src/platform/language/mathSafeText.js';

const es = { language: 'es' };

test('a fraction written as one character is said as a fraction', () => {
  // L1 CW 14's card.
  assert.equal(speechTextFor('y = ½x + 4 and x − 2y = −8'), 'y equals one half x plus 4 and x minus 2y equals negative 8');
  assert.equal(speechTextFor('x = 2½'), 'x equals 2 and one half');
  assert.equal(speechTextFor('y = −½x + 3'), 'y equals negative one half x plus 3');
  assert.equal(speechTextFor('½(x − 4)'), 'one half times the quantity x minus 4');
  assert.equal(speechTextFor('⅓ + ⅔ = 1'), 'one third plus two thirds equals 1');
  assert.equal(speechTextFor('Use ¾ of the cup.'), 'Use three fourths of the cup.');
  assert.equal(spokenMathLabel('⅝'), 'five eighths');
  assert.equal(speechTextFor('y = ½x + 4', es), 'y es igual a un medio x más 4');
  assert.equal(speechTextFor('x = 2½', es), 'x es igual a 2 y un medio');
  assert.equal(speechTextFor('−¾', es), 'negativo tres cuartos');
});

test('two letters side by side beside an operator are two variables; a word stays a word', () => {
  // L2 Honors PR 9 and CW 11.
  assert.equal(speechTextFor('System D: 3x + my = 5 and y = x − 1'), 'System D: 3x plus m y equals 5 and y equals x minus 1');
  assert.equal(speechTextFor('kx + 2y = 7'), 'k x plus 2y equals 7');
  assert.equal(speechTextFor('ax + by = c'), 'a x plus b y equals c');
  assert.equal(speechTextFor('x = −my + 3'), 'x equals negative m y plus 3');
  assert.equal(mathToSpeech('$3x + my = 5$'), '3x plus m y equals 5');
  assert.equal(speechTextFor('3x + my = 5', es), '3x más m y es igual a 5');
  // Words: a word after them, nothing beside them, or only a number's sign.
  assert.equal(speechTextFor('my answer is 3x + 2'), 'my answer is 3x plus 2');
  assert.equal(speechTextFor('Multiply both sides by 2.'), 'Multiply both sides by 2.');
  assert.equal(speechTextFor('The x-axis runs from 5 to −5.'), 'The x-axis runs from 5 to negative 5.');
  assert.equal(speechTextFor('2 + my age'), '2 plus my age');
  assert.equal(speechTextFor('el eje y, de −5 a 5', es), 'el eje y, de negativo 5 a 5');
  // A sign pressed against a number joins no terms: "by −2" is the word.
  assert.equal(speechTextFor('Shift (3, 4) by −2.'), 'Shift the point 3, 4 by negative 2.');
  assert.ok(segmentMathText('Shift (3, 4) by −2.', { speech: true }).some((segment) => segment.kind === 'text' && segment.value === ' by '));
  assert.equal(mathToSpeech('by −2'), 'by negative 2', 'and in a label read as mathematics');
  // A symbol named in a sentence leaves its words words, to the split too.
  assert.ok(segmentMathText('a closed dot for ≤ or ≥', { speech: true }).some((segment) => segment.kind === 'text' && segment.value === ' or '));
  assert.equal(mathToSpeech('≤ or ≥'), 'is less than or equal to or is greater than or equal to');
  // A unit, ln and pi keep their names; a denominator keeps its reading.
  assert.equal(mathToSpeech('km/h'), 'km over h');
  assert.equal(mathToSpeech('3/2ab'), '3 over 2 ab');
});

test('a slash between two roots is "over"', () => {
  assert.equal(speechTextFor('√8/√2'), 'the square root of 8 over the square root of 2');
  assert.equal(speechTextFor('∛16/∛2 = 2'), 'the cube root of 16 over the cube root of 2 equals 2');
  assert.equal(speechTextFor('√12 / √3'), 'the square root of 12 over the square root of 3');
  assert.equal(speechTextFor('√(18)/√(2) = 3', es), 'la raíz cuadrada de 18 sobre la raíz cuadrada de 2 es igual a 3');
  // LaTeX's own slash read so already.
  assert.equal(speechTextFor('$\\sqrt{8}/\\sqrt{2}$'), 'the square root of 8 over the square root of 2');
});

test('sin, cos and tan are said by name, and "of" their argument', () => {
  assert.equal(speechTextFor('sin(x)'), 'sine of x');
  assert.equal(speechTextFor('y = sin(x) + 1'), 'y equals sine of x plus 1');
  assert.equal(speechTextFor('y = sin(2x)'), 'y equals sine of 2x');
  assert.equal(speechTextFor('f(x) = 2sin(x)'), 'f of x equals 2 sine of x');
  assert.equal(speechTextFor('sin²(x) + cos²(x) = 1'), 'sine squared of x plus cosine squared of x equals 1');
  assert.equal(speechTextFor('$\\sin(x)$'), 'sine of x');
  assert.equal(speechTextFor('$\\cos^2 x$'), 'cosine squared of x');
  assert.equal(speechTextFor('sin x'), 'sine of x');
  assert.match(speechTextFor('cos(θ)'), /^cosine\b/);
  assert.match(speechTextFor('tan(45°)'), /^tangent\b/);
  assert.equal(speechTextFor('y = sin(x) + 1', es), 'y es igual a seno de x más 1');
  assert.equal(speechTextFor('sin²(x)', es), 'seno al cuadrado de x');
  // Words that hold the letters are words.
  assert.equal(speechTextFor('Using the cosine, the costs are a tan color.'), 'Using the cosine, the costs are a tan color.');
});

test('bars before a root say where they close', () => {
  assert.equal(speechTextFor('|5b⁷k⁵| ⁴√(k³)'), 'the absolute value of 5b to the power 7 k to the power 5 end absolute value times the 4th root of k cubed');
  assert.equal(speechTextFor('|x| √2'), 'the absolute value of x end absolute value times the square root of 2');
  assert.equal(speechTextFor('|x| √2', es), 'el valor absoluto de x fin del valor absoluto por la raíz cuadrada de 2');
  // A root inside the bars is not after them: no product is said there. The
  // bars hold it whole and end where more follows (math-speech-3).
  assert.doesNotMatch(speechTextFor('|√x| + 1'), /times/);
  assert.equal(speechTextFor('|√x| + 1'), 'the absolute value of the square root of x end absolute value plus 1');
});
