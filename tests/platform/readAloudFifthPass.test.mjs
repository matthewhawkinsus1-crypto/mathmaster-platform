// READ ALOUD'S FIFTH PASS (math-speech-4): what the sweeps of every lesson and
// bank text by math-speech-2, platform-polish-3 and math-speech-3 logged as
// still read badly (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 6). Each
// is a reading rule every lesson gets, in English and Spanish.

import test from 'node:test';
import assert from 'node:assert/strict';
import { definedFunctionNames, mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { questionReadingParts } from '../../src/platform/language/questionReading.js';
import { maskMath } from '../../src/platform/language/mathSafeText.js';

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

// Item 2. A slash between words reached the voice as typed: "Left / right".
test('a slash between two words is "or", and "and/or" is "and or"', () => {
  assert.equal(speechTextFor('Left/right changes only the x-coordinate.'), 'Left or right changes only the x-coordinate.');
  assert.equal(speechTextFor('Use the correct solid/dashed style.'), 'Use the correct solid or dashed style.');
  assert.equal(speechTextFor('Diagnose the AND/OR error.'), 'Diagnose the AND or OR error.');
  assert.equal(speechTextFor('the x-intercept/zero, and a sum/difference/product rule'), 'the x-intercept or zero, and a sum or difference or product rule');
  assert.equal(speechTextFor('Max/min on a closed interval'), 'Max or min on a closed interval');
  assert.equal(speechTextFor('Check the domain and/or range.'), 'Check the domain and or range.');
  assert.equal(speechTextFor('Left/right changes only the x-coordinate.', es), 'Left o right changes only the x-coordinate.');
  assert.equal(speechTextFor('Elige izquierda/derecha y/o arriba.', es), 'Elige izquierda o derecha y o arriba.');
});

test('a slash before a unit is "per", and between two parts of a ratio "over"', () => {
  assert.equal(speechTextFor('the energy output y (kcal/day) of a reptile'), 'the energy output y, kcal per day, of a reptile');
  assert.equal(speechTextFor('One travels at 3 km/h; Runner A moves 3 m/s.'), 'One travels at 3 km per h; Runner A moves 3 m per s.');
  assert.equal(speechTextFor('Slope equals rise/run.'), 'Slope equals rise over run.');
  assert.equal(speechTextFor('tan θ = opposite/adjacent.'), 'tangent of theta equals opposite over adjacent.');
  assert.equal(speechTextFor('Divide, then write quotient + remainder/divisor.'), 'Divide, then write quotient plus remainder over divisor.');
  assert.equal(speechTextFor('Use Δvalue/Δtime on both intervals.'), 'Use delta value over delta time on both intervals.');
  assert.equal(speechTextFor('One travels at 3 km/h.', es), 'One travels at 3 km por h.');
  assert.equal(speechTextFor('Slope equals rise/run.', es), 'Slope equals rise sobre run.');
});

test('numbers, fractions, letters, a LaTeX span and an address keep their slash readings', () => {
  assert.equal(speechTextFor('He/she wrote 1/2 and x = a/b.'), 'He or she wrote 1 over 2 and x equals a over b.');
  assert.equal(speechTextFor('Find dy/dx.'), 'Find dy / dx.');
  assert.equal(speechTextFor('(f/g)(x)'), 'f over g of x');
  assert.equal(speechTextFor('Use $\\text{time}=\\text{pages}/\\text{rate}$.'), 'Use time equals pages over rate.');
  // Inside LaTeX a run of letters is a product of variables.
  assert.equal(speechTextFor('Simplify $abc / xyz$.'), 'Simplify abc over x y z.');
  assert.equal(speechTextFor('Source: drafts/ccmr-v2.1/act'), 'Source: drafts / ccmr-v 2.1/ act');
  assert.doesNotMatch(speechTextFor('See https://www.act.org/content/products-and-services/x.html'), /\b(?:or|per|over)\b/);
});

// Item 3. A voice was handed prose brackets and ellipses as typed. Measured
// with a speech engine (flite): an opening bracket and an ellipsis are
// silent; a closing bracket and a stop pause.
test('an aside in brackets is said between pauses; a formula in words keeps its brackets', () => {
  assert.equal(speechTextFor('Count the rise (change in y) and the run (change in x) between them.'),
    'Count the rise, change in y, and the run, change in x, between them.');
  assert.equal(speechTextFor('Total cost (dollars)'), 'Total cost, dollars');
  assert.equal(speechTextFor('Causation: Card A (each gallon pumped adds to the cost), Card C (burning longer makes the candle shorter) and Card E (each hour Mia works adds $12 to her pay).'),
    'Causation: Card A, each gallon pumped adds to the cost, Card C, burning longer makes the candle shorter, and Card E, each hour Mia works adds 12 dollars to her pay.');
  // Beside a sign, pressed against a letter, or a whole sentence: as before.
  assert.equal(speechTextFor('A decreasing amount is (starting amount) − (rate) · (variable).'), 'A decreasing amount is (starting amount) minus (rate) times (variable).');
  assert.equal(speechTextFor('Simplify each side to (coefficient)x + (constant).'), 'Simplify each side to (coefficient) x plus (constant).');
  assert.equal(speechTextFor('Plot each point, in order. (The grid snaps to halves.)'), 'Plot each point, in order. (The grid snaps to halves.)');
  assert.equal(speechTextFor('Total cost (dollars)', es), 'Total cost, dollars');
});

test('a bracket the split took for prose is mathematics: the slope formula, and f(bx)', () => {
  assert.equal(speechTextFor('Use the slope formula: (y₂ − y₁) ÷ (x₂ − x₁).'),
    'Use the slope formula: the quantity y sub 2 minus y sub 1 end quantity divided by the quantity x sub 2 minus x sub 1.');
  assert.equal(speechTextFor('y = f(bx) multiplies every input by 1/b.'), 'y equals f of bx multiplies every input by 1 over b.');
  // Translate's split is as it was.
  assert.deepEqual(maskMath('y = f(bx) multiplies every input by 1/b.'), { masked: '⟦0⟧(bx) multiplies every input by ⟦1⟧.', tokens: ['y = f', '1/b'] });
});

test('an ellipsis in a list is "and so on"; one that ends a sentence is left', () => {
  assert.equal(speechTextFor('so the domain is {0, 1, 2, ..., 48}.'), 'so the domain is the set 0, 1, 2, and so on, 48 end set.');
  assert.equal(speechTextFor('A geometric sequence begins $3, 6, 12, 24, \\ldots$. Write a rule.'), 'A geometric sequence begins 3, 6, 12, 24, and so on. Write a rule.');
  assert.equal(speechTextFor('An arithmetic sequence begins 3, 7, 11,.... The rule adds 4.'), 'An arithmetic sequence begins 3, 7, 11, and so on. The rule adds 4.');
  assert.equal(speechTextFor('b < 153.33…, so b is at most 153.'), 'b is less than 153.33, and so on, so b is at most 153.');
  assert.equal(spokenMathLabel('{0, 1, 2, …, 48}'), 'the set 0, 1, 2, and so on, 48 end set');
  assert.equal(speechTextFor('Let’s back up. The rate of change between two rows of a table is…'), 'Let’s back up. The rate of change between two rows of a table is…');
  assert.equal(speechTextFor('{0, 1, 2, …, 48}', es), 'el conjunto 0, 1, 2, y así sucesivamente, 48 fin de conjunto');
});

test('an ellipsis that stands for a blank is "blank", and brackets named in a sentence are named', () => {
  assert.equal(speechTextFor('Under one cube root: 5∛(…), with … ='), 'Under one cube root: 5 times the cube root of blank, with blank equals');
  assert.equal(speechTextFor('Factor the denominator: a√2 − a = a(…), with … ='),
    'Factor the denominator: a times the square root of 2 minus a equals a times blank, with blank equals');
  assert.equal(speechTextFor('After grouping: (a + b)(…) ='), 'After grouping: the quantity a plus b end quantity times blank equals');
  // At the end of a sentence it is the stop it already was.
  assert.equal(speechTextFor('The slope of line q is m₂ = …'), 'The slope of line q is m sub 2 equals …');
  assert.equal(speechTextFor('Write interval notation with ( ) or [ ] and ∪.'), 'Write interval notation with parentheses or square brackets and union.');
  assert.equal(speechTextFor('Inside f( ), x−4 acts on x.'), 'Inside f parentheses, x minus 4 acts on x.');
  assert.equal(speechTextFor('Under one cube root: 5∛(…), with … =', es), 'Under one cube root: 5 por la raíz cúbica de espacio en blanco, with espacio en blanco es igual a');
});

// Item 4. Bank texts read as typed. Where a rule covers the slip it is the
// reading's; the authoring slips no rule should read are fixed in the drafts
// (the next test).
test('an escaped percent is "percent", and a "?" in a bracket of its own is "blank"', () => {
  assert.equal(speechTextFor('A group has 3 students. A benchmark share of 3\\% participates.'), 'A group has 3 students. A benchmark share of 3 percent participates.');
  assert.equal(speechTextFor('$3\\%'), '3 percent');
  assert.equal(speechTextFor('Write $3\\%$ as a decimal.'), 'Write 3 percent as a decimal.');
  assert.equal(speechTextFor('3x^3 = ( ? )²'), '3x cubed equals blank squared');
  assert.equal(speechTextFor('243(x + 2)¹⁵ = [ ? ]⁵.'), '243 times the quantity x plus 2, to the power 15 equals blank to the power 5.');
  assert.equal(speechTextFor('3√2 / √6 = 3 / √( ? )'), '3 times the square root of 2 over the square root of 6 equals 3 over the square root of blank');
  assert.equal(speechTextFor('$3\\%', es), '3 por ciento');
  assert.equal(speechTextFor('3x^3 = ( ? )²', es), '3x al cubo es igual a espacio en blanco al cuadrado');
});

test('a "$" is a price only before a number: a stray one is silent, and $\\$m$ is m dollars', () => {
  // An ASVAB key and its feedback: a span closed after a space.
  assert.equal(speechTextFor('The first coordinate is negative, so the move is $3 $ to the left.'), 'The first coordinate is negative, so the move is 3 to the left.');
  assert.equal(speechTextFor('Plan A costs $\\$3$ plus $\\$m$ a month.'), 'Plan A costs 3 dollars plus m dollars a month.');
  // A pair of prices is still two prices.
  assert.equal(speechTextFor('The team sold $20, $25, and $50 gas cards.'), 'The team sold 20 dollars, 25 dollars, and 50 dollars gas cards.');
  // A delimiter whose pair was lost, and a span whose root or sqrt is mathematics.
  assert.equal(speechTextFor('23x=3$'), '23x equals 3');
  assert.equal(speechTextFor('Only factors of 3$'), 'Only factors of 3');
  assert.equal(speechTextFor('$3√3$'), '3 times the square root of 3');
  assert.equal(speechTextFor('$3*sqrt(x)$'), '3 times the square root of x');
  assert.equal(speechTextFor('Plan A costs $\\$3$ plus $\\$m$ a month.', es), 'Plan A costs 3 dólares plus m dólares a month.');
  // Translate's split is as it was.
  assert.deepEqual(maskMath('so the move is $3 $ to the left.'), { masked: 'so the move is ⟦0⟧ $ to the left.', tokens: ['$3'] });
});

test('a bar that pairs with none is "divides" or "bar", and bars around words a sign joins are absolute value', () => {
  assert.equal(speechTextFor('so row 1 is [3, −2, −4 | −4]. Marcus kept +4 for z.'), 'so row 1 is 3, negative 2, negative 4, bar, negative 4. Marcus kept plus 4 for z.');
  assert.equal(speechTextFor('bottom row 1, −2, −3 | 0, so the quotient is x² − 2x − 3.'), 'bottom row 1, negative 2, negative 3, bar, 0, so the quotient is x squared minus 2x minus 3.');
  assert.equal(speechTextFor('Every p/q, with p | 4 and q | 3.'), 'Every p over q, with p divides 4 and q divides 3.');
  assert.equal(speechTextFor('A distance from the center is written |w − center|.'), 'A distance from the center is written the absolute value of w minus center.');
  assert.equal(speechTextFor('|'), 'bar');
  assert.equal(speechTextFor('y = |x − 2| + 1'), 'y equals the absolute value of x minus 2 end absolute value plus 1');
  assert.equal(speechTextFor('row 1 is [3, −2, −4 | −4].', es), 'row 1 is 3, negativo 2, negativo 4, barra, negativo 4.');
  assert.equal(speechTextFor('with p | 4', es), 'with p divide a 4');
});

test('the three old Path drafts hold no double-escaped LaTeX, and document 405 its \\ne', async () => {
  const { readFileSync } = await import('node:fs');
  for (const name of ['act', 'digitalSAT', 'tsia2']) {
    const documents = JSON.parse(readFileSync(new URL(`../../drafts/${name}.json`, import.meta.url), 'utf8')).documents;
    const strings = [];
    const walk = (value) => {
      if (typeof value === 'string') strings.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(documents);
    assert.deepEqual(strings.filter((text) => /\\\\(?:times|text)/.test(text)), [], `${name}: a double-escaped command`);
    assert.ok(documents[405].solutionReview.headline.endsWith('the restriction $x\\ne0$.'), `${name}: document 405`);
    assert.equal(speechTextFor(documents[405].solutionReview.headline).endsWith('the restriction x is not equal to 0.'), true, name);
  }
});
