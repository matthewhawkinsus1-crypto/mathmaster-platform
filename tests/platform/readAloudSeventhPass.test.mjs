// READ ALOUD'S SEVENTH PASS (hint-ladder timing, item 3): what the display and
// reading polish left. Each is a reading rule every lesson and bank text gets,
// in English and Spanish. The sweep: 111 of 58,261 texts read differently,
// every one traced to a rule below (75 of them bank templates whose sweep copy
// put "3" for a placeholder after an exponent; dealt, those read as before).

import test from 'node:test';
import assert from 'node:assert/strict';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { maskMath, segmentMathText } from '../../src/platform/language/mathSafeText.js';

const es = { language: 'es' };

// "5m^10p^6" was "5m to the power 10p to the power 6": the exponent ran into
// the next letter. It is drawn 5m¹⁰p⁶ and graded (5m^10)(p^6), and read so.
test('a whole-number exponent ends where its digits do, as it is drawn', () => {
  assert.equal(speechTextFor('5m^10p^6'), '5m to the power 10 p to the power 6');
  assert.equal(speechTextFor('5m^10p^6'), speechTextFor('5m¹⁰p⁶'), 'as the drawn form is read');
  assert.equal(speechTextFor('Simplify 3x^4y^5 · 2x^7y.'), 'Simplify 3x to the power 4 y to the power 5 times 2x to the power 7 y.');
  assert.equal(speechTextFor('k^5x^3'), 'k to the power 5 x cubed');
  assert.equal(speechTextFor('x^-2y^3'), 'x to the power negative 2 y cubed');
  assert.equal(speechTextFor('5m^10p^6', es), '5m a la potencia 10 p a la potencia 6');
  // Unchanged: an exponent alone, a decimal one, a letter one, and the
  // bracketed and braced forms, which say where they end already.
  assert.equal(speechTextFor('x^10'), 'x to the power 10');
  assert.equal(speechTextFor('e^0.05t'), 'e to the power 0.05t', 'a decimal exponent keeps its letter, as before');
  assert.equal(speechTextFor('e^kt'), 'e to the power kt');
  assert.equal(speechTextFor('x^(10)p'), 'x to the power 10 p');
  assert.equal(speechTextFor('$x^{10}p$'), 'x to the power 10 p');
  assert.equal(speechTextFor('x^2y'), 'x squared y');
  // Inside $…$ LaTeX ends an unbraced exponent at its one digit, and MathLive
  // draws it so: "$\sqrt{16x^4y^{11}}$" was "16x to the power 4y …".
  assert.equal(speechTextFor('$\\sqrt{16x^4y^{11}}$'), 'the square root of 16x to the power 4 y to the power 11 end root');
  // A Path distractor drawn (2)⁶t is read as drawn (the template writes
  // ^{{d}}t, whose braces are the placeholder's).
  assert.equal(speechTextFor('$P(t)=167(2)^6t$'), 'P of t equals 167 times the quantity 2, to the power 6 t');
});

// Outside $…$ only a braced subscript was read: "x_1" split the text at its
// underscore, which reached the voice with the brackets around it.
test('a subscript typed without braces is read as one', () => {
  assert.equal(speechTextFor('x_1 + x_2'), 'x sub 1 plus x sub 2', 'was "x _ 1 plus x _ 2"');
  assert.equal(speechTextFor('y - y_1 = m(x - x_1)'), 'y minus y sub 1 equals m times the quantity x minus x sub 1', 'was "y minus y _ 1 equals m ( x minus x _ 1 )"');
  assert.equal(speechTextFor('a_n = a_1 + (n-1)d'), 'a sub n equals a sub 1 plus the quantity n minus 1 d');
  assert.equal(speechTextFor('Find a_10.'), 'Find a sub 10.', 'all of its digits, as typed');
  assert.equal(speechTextFor('(x_1, y_1)'), 'the point x sub 1, y sub 1');
  assert.equal(speechTextFor('The model is P_0 · 2^t.'), 'The model is P sub 0 times 2 to the power t.');
  assert.equal(speechTextFor('x_1 + x_2', es), 'x sub 1 más x sub 2');
  // A bracket is a subscript too, as the Path banks' recursive rules write it.
  assert.equal(speechTextFor('P_n=1.2P_(n-1)'), 'P sub n equals 1.2P sub n minus 1', 'was "1.2P _ the quantity n minus 1"');
  assert.equal(speechTextFor('a_n=4a_(n-1)', es), 'a sub n es igual a 4a sub n menos 1');
  // As the braced form and the drawn ₁ are read.
  assert.equal(speechTextFor('x_1 + x_2'), speechTextFor('x_{1} + x_{2}'));
  assert.equal(speechTextFor('y - y_1 = m(x - x_1)'), speechTextFor('y − y₁ = m(x − x₁)'));
  // Not subscripts: a word's underscore, a blank, a log's base, and LaTeX in
  // $…$, which keeps its own rule (one character).
  assert.equal(speechTextFor('first_name'), 'first_name');
  assert.doesNotMatch(speechTextFor('mm_sat_A_3D_challenge_3_minimum-integer-y_v21'), /\bsub\b/, 'nor an id\'s');
  assert.equal(speechTextFor('x = ___'), 'x equals blank');
  assert.equal(speechTextFor('log_2(8)'), 'log base 2 of 8');
  assert.equal(speechTextFor('$a_10$'), 'a sub 1 0');
  // Translate's split is the one its packs are keyed to: unchanged, the
  // subscript read in Read aloud's words only.
  assert.deepEqual(segmentMathText('Use x_1 here.').map((segment) => segment.kind), ['text', 'math', 'text', 'math', 'text']);
  assert.deepEqual(maskMath('Use x_1 here.'), { masked: 'Use ⟦0⟧_⟦1⟧ here.', tokens: ['x', '1'] });
});

// (Its copy of a subscript was already "x sub 1": it reads its text as mathematics.)
test('a screen reader\'s copy of the drawing says the power the same way', () => {
  assert.equal(spokenMathLabel('5m^10p^6'), '5m to the power 10 p to the power 6');
});
