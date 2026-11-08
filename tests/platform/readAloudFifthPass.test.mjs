// READ ALOUD'S FIFTH PASS (math-speech-4): what the sweeps of every lesson and
// bank text by math-speech-2, platform-polish-3 and math-speech-3 logged as
// still read badly (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 6). Each
// is a reading rule every lesson gets, in English and Spanish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { definedFunctionNames, mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { questionReadingParts } from '../../src/platform/language/questionReading.js';

const es = { language: 'es' };

// Item 1. p, t and the other letters of the function list were functions
// before any bracket: "3 p of the quantity p plus 2".
test('a letter of the function list before more than one term is a factor', () => {
  assert.equal(speechTextFor('Factor 3p(p − 4) + 2(p − 4).'),
    'Factor 3p times the quantity p minus 4 end quantity plus 2 times the quantity p minus 4.');
  assert.equal(speechTextFor('t(t + 2) = 15'), 't times the quantity t plus 2 equals 15');
  assert.equal(speechTextFor('The simple-interest formula is $A=P(1+rt)$.'), 'The simple-interest formula is A equals P times the quantity 1 plus r t.');
  assert.equal(speechTextFor('Write the area of rectangle B, w(x + 5), as a sum.'), 'Write the area of rectangle B, w times the quantity x plus 5, as a sum.');
  // Two letters in a bracket before another: a product of two brackets.
  assert.equal(speechTextFor('The factors are conjugates: (u + v)(u − v) = u² − v².'),
    'The factors are conjugates: the quantity u plus v end quantity times the quantity u minus v equals u squared minus v squared.');
  assert.equal(spokenMathLabel('s(s − a)(s − b)(s − c) = 216'),
    's times the quantity s minus a end quantity times the quantity s minus b end quantity times the quantity s minus c equals 216');
  // A conventional name is a factor too when the bracket holds its own letter.
  assert.equal(speechTextFor('h(h + 2) = 15'), 'h times the quantity h plus 2 equals 15');
  assert.equal(speechTextFor('t(t + 2) = 15', es), 't por la cantidad t más 2 es igual a 15');
});

test('a letter the text makes a function is one before any bracket', () => {
  // Defined, written applied to one letter, named in words, or spelled out.
  assert.equal(speechTextFor('P(t) = 500(1.03)^t. Find P(t + 1).'), 'P of t equals 500 times the quantity 1.03, to the power t. Find P of the quantity t plus 1.');
  assert.equal(speechTextFor('If P(t) is the population, what is P(t + 5)?'), 'If P of t is the population, what is P of the quantity t plus 5?');
  assert.equal(speechTextFor('For the function p, find p(x + 1).'), 'For the function p, find p of the quantity x plus 1.');
  assert.equal(speechTextFor('The remainder equals P of d, so P(d − 1) is next.'), 'The remainder equals P of d, so P of the quantity d minus 1 is next.');
  // f, g, h and j are conventional names; any listed letter applied to one term is a function.
  assert.equal(speechTextFor('Simplify r(x): j(x + 4) = 2(x + 4) − 1.'),
    'Simplify r of x: j of the quantity x plus 4, equals 2 times the quantity x plus 4 end quantity minus 1.');
  assert.equal(speechTextFor('Find P(3).'), 'Find P of 3.');
  assert.equal(speechTextFor('So t(r(1500)) = 1344.'), 'So t of r of 1500 equals 1344.');
  assert.equal(speechTextFor('For the function p, find p(x + 1).', es), 'For the function p, find p de la cantidad x más 1.');
});

test('any letter the text uses as a function is one, and a substitution stays a product', () => {
  // These were "a times x", "a times 2 equals 11".
  assert.equal(speechTextFor('Look back at a(x), b(x), c(x), and d(x).'), 'Look back at a of x, b of x, c of x, and d of x.');
  assert.equal(speechTextFor('a(2) = 11, a(3) = 15 and a(5) = 23.'), 'a of 2 equals 11, a of 3 equals 15 and a of 5 equals 23.');
  assert.equal(speechTextFor('Table: W(7) = 15 · 7 = 105'), 'Table: W of 7 equals 15 times 7 equals 105');
  // A bracket after a relation or a sign, or with its own power, is a factor's.
  assert.equal(speechTextFor('f(3) = (3)² + k(3) − 3'), 'f of 3 equals the quantity 3, squared plus k times 3 minus 3');
  assert.equal(speechTextFor('$V=Bh$ becomes $3=B(3)$.'), 'V equals Bh becomes 3 equals B times 3.');
  assert.equal(speechTextFor('An exponential model $y=a(3)^x$ has $y(0)=3$.'),
    'An exponential model y equals a times the quantity 3, to the power x has y of 0 equals 3.');
  const names = (text) => [...definedFunctionNames(text)].sort().join('');
  assert.equal(names('Look back at a(x), b(x), and W(t).'), 'Wab');
  assert.equal(names('a(4) = 15 + 4 = 19, so a(5) = 23'), 'a');
  assert.equal(names('3 = k(3), so y = a(b)^x and 2 + m(4) = 6'), '');
  assert.equal(names('Compare the functions p and q, and the function h(t).'), 'hpq');
});

test('a question about a sequence reads its terms a(2), a(3) as terms', () => {
  // The District DOL 1 review's boxes were "Answer box: a times 2."
  const parts = questionReadingParts({
    prompt: 'An arithmetic sequence starts at 7 and each term is 4 more than the term before it. Find the second and third terms.',
    answerFields: [{ id: 'a2', label: 'a(2)' }, { id: 'a3', label: 'a(3)' }],
  });
  const said = parts.filter((part) => part.kind === 'part').map((part) => speechTextFor(part.text, { functionNames: part.functionNames }));
  assert.deepEqual(said, ['Answer box: a of 2.', 'Answer box: a of 3.']);
  assert.equal(definedFunctionNames('The data are not a perfect geometric sequence, so write y = a(b)^x.'), '');
});

test('a function\'s input that holds a bracket or a power is still its input', () => {
  // These were "f times the quantity …": the rule saw only a bracket with none inside.
  assert.equal(speechTextFor('g(x) = f(x²) + 1'), 'g of x equals f of x squared plus 1');
  assert.equal(speechTextFor('y = a·f(b(x − h)) + k'), 'y equals a times f of the quantity b times the quantity x minus h, plus k');
  assert.equal(speechTextFor('(g ∘ f)(x) = g(3x² − x + 4)'), 'g composed with f of x equals g of the quantity 3x squared minus x plus 4');
  assert.equal(mathToSpeech('f((x + 6)/3)'), 'f of the quantity the quantity x plus 6 end quantity over 3');
  assert.equal(speechTextFor('g(x) = f(x²) + 1', es), 'g de x es igual a f de x al cuadrado más 1');
});
