// READ ALOUD: THE NOTATION ALGEBRA II HONORS MODULE 1 IS WRITTEN IN
// (student walkthrough 2026-11-06, part 2, P-1).
//
// The reader had the words for each case ("to the power", "log base",
// "composed with", "the set"), but the spellings these lessons use never
// reached them: 2ˣ was "2 ˣ", log₂(x) "log sub 2 times the quantity x",
// (−∞, ∞) "the point negative infinity, infinity", [0, ∞) "0, infinity" (its
// brackets, which are the answer, dropped), (f∘g)(x) "( f ∘ g ) the quantity
// x", and ∪ and set braces were passed to the voice raw. Each now reads as its
// typed or LaTeX twin does, in English and in Spanish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { maskMath } from '../../src/platform/language/mathSafeText.js';
import { questionReadingParts } from '../../src/platform/language/questionReading.js';
import { loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';

const es = { language: 'es' };

test('a power written as a superscript letter is read as the typed power is', () => {
  assert.equal(speechTextFor('f(x) = 2ˣ'), 'f of x equals 2 to the power x');
  assert.equal(speechTextFor('f(x) = 2ˣ'), speechTextFor('f(x) = 2^x'), 'as the typed 2^x');
  assert.equal(speechTextFor('Use the graph of f(x)=(1/2)ˣ.'), 'Use the graph of f of x equals the quantity 1 over 2, to the power x.');
  assert.equal(speechTextFor('bⁿ means b used as a factor n times.'), 'b to the power n means b used as a factor n times.');
  assert.equal(speechTextFor('xᵃ · xᵇ = xᵃ⁺ᵇ and x⁻ᵃ = 1/xᵃ'), 'x to the power a times x to the power b equals x to the power a plus b and x to the power negative a equals 1 over x to the power a');
  // Two letters are said apart ("ab" is not a word), "a−b" is not a
  // hyphenated word, and a bracket in the exponent is said where it ends.
  assert.equal(speechTextFor('(aᵐ)ⁿ = aᵐⁿ'), 'the quantity a to the power m, to the power n equals a to the power m n');
  assert.equal(speechTextFor('xᵃ/xᵇ = xᵃ⁻ᵇ'), 'x to the power a over x to the power b equals x to the power a minus b');
  assert.equal(speechTextFor('h⁶⁻⁽⁻²⁾ = h⁸'), 'h to the power the quantity 6 minus the quantity negative 2 equals h to the power 8');
  // A letter index makes a root of that index, never a square root.
  assert.equal(speechTextFor('In ⁿ√b, n is the index.'), 'In the nth root of b, n is the index.');
  assert.equal(speechTextFor('ⁿ√(aⁿ) = |a|'), 'the nth root of a to the power n equals the absolute value of a');
  // A superscript ordinal is still one word.
  assert.equal(speechTextFor('She came 2ⁿᵈ.'), 'She came 2nd.');
  assert.equal(spokenMathLabel('aⁿ'), 'a to the power n');
  assert.equal(speechTextFor('f(x) = 2ˣ', es), 'f de x es igual a 2 a la potencia x');
  assert.equal(speechTextFor('En ⁿ√b, n es el índice.', es), 'En la raíz n de b, n es el índice.');
});

test('a logarithm\'s base written as text is "log base", as LaTeX\'s \\log_2 is', () => {
  assert.equal(speechTextFor('Graph g(x) = log₂(x).'), 'Graph g of x equals log base 2 of x.');
  assert.equal(speechTextFor('g(x) = log₂(x)'), speechTextFor('$g(x) = \\log_2(x)$'), 'as the LaTeX');
  assert.equal(speechTextFor('Use the graph of f(x)=log₁⁄₂(x).'), 'Use the graph of f of x equals log base 1 over 2 of x.');
  // The function family's own spelling of a base that is not 2 or 10.
  assert.equal(speechTextFor('In f(x) = log_0.5(x), which values of x can a logarithm accept?'), 'In f of x equals log base 0.5 of x, which values of x can a logarithm accept?');
  assert.equal(speechTextFor('log₂8 = 3'), 'log base 2 of 8 equals 3', 'it was "log sub 28"');
  // An argument of more than one term is a quantity; with no argument, the
  // next word is not taken for one.
  assert.equal(speechTextFor('p(x) = log₂(x − 3) − 4'), 'p of x equals log base 2 of the quantity x minus 3 end quantity minus 4', 'its end said (item 10)');
  assert.equal(speechTextFor('log₂ is the inverse of 2ˣ.'), 'log base 2 is the inverse of 2 to the power x.');
  // LaTeX: a decimal base (the graph's own label), a spaced brace, and a bare
  // base followed by its argument.
  assert.equal(mathToSpeech('y=\\log_{0.5}\\left(x\\right)'), 'y equals log base 0.5 of x', 'it was "log base 0 of .5"');
  assert.equal(mathToSpeech('\\log_{ 3 }3=n'), 'log base 3 of 3 equals n');
  assert.equal(mathToSpeech('g(x)=\\log_3x'), 'g of x equals log base 3 of x', 'it was "log base 3x of"');
  assert.equal(mathToSpeech('\\log_2(8)'), 'log base 2 of 8');
  assert.equal(speechTextFor('Graph g(x) = log₂(x).', es), 'Graph g de x es igual a logaritmo en base 2 de x.');
});

test('an interval is read as an interval, each end said included or not', () => {
  assert.equal(speechTextFor('The domain is (−∞, ∞).'), 'The domain is the interval from negative infinity to infinity.');
  assert.equal(speechTextFor('Range: (0, ∞)'), 'Range: the interval from 0 to infinity, not including 0');
  assert.equal(speechTextFor('Range: [0, ∞)'), 'Range: the interval from 0 to infinity, including 0');
  assert.equal(speechTextFor('(−∞, −1]'), 'the interval from negative infinity to negative 1, including negative 1');
  assert.equal(speechTextFor('range [−3, 2].'), 'range the interval from negative 3 to 2, including negative 3 and 2.');
  assert.equal(speechTextFor('In interval notation: [7, 8).'), 'In interval notation: the interval from 7 to 8, including 7 but not 8.');
  assert.equal(speechTextFor('(−8, 5]'), 'the interval from negative 8 to 5, including 5 but not negative 8');
  assert.equal(mathToSpeech('[0,\\infty)'), 'the interval from 0 to infinity, including 0');
  // "the interval" is said once.
  assert.equal(speechTextFor('on the interval [0, 5)'), 'on the interval from 0 to 5, including 0 but not 5');
  assert.equal(spokenMathLabel('Domain interval [0, ∞)'), 'Domain interval from 0 to infinity, including 0');
  // Choices that differ only in a bracket are heard apart, a wrong bracket at
  // infinity included.
  const choices = ['(0, ∞)', '[0, ∞)', '(−∞, 0]', '(−∞, ∞)', '[0, ∞]'].map((choice) => speechTextFor(choice));
  assert.equal(new Set(choices).size, choices.length, choices.join(' | '));
  assert.equal(speechTextFor('[0, ∞]'), 'the interval from 0 to infinity, including 0 and infinity');
  assert.equal(speechTextFor('Range: [0, ∞)', es), 'Range: el intervalo de 0 a infinito, que incluye 0');
  assert.equal(speechTextFor('(−8, 5]', es), 'el intervalo de negativo 8 a 5, que incluye 5 pero no negativo 8');
});

test('two finite ends in round brackets are a point, unless the sentence makes them an interval', () => {
  assert.equal(speechTextFor('The graph goes through (0, 1) and (1, 2).'), 'The graph goes through the point 0, 1 and the point 1, 2.');
  assert.equal(speechTextFor('The vertex is (−1, 4).'), 'The vertex is the point negative 1, 4.');
  assert.equal(
    speechTextFor('so it is increasing on (-2, 2) and decreasing on (-5, -2).'),
    'so it is increasing on the interval from negative 2 to 2, not including negative 2 or 2 and decreasing on the interval from negative 5 to negative 2, not including negative 5 or negative 2.',
  );
  // A worked summary says "positive (2, 4)", with no "on".
  assert.equal(
    speechTextFor('positive (2, 4); negative [1, 2) ∪ (4, 6]'),
    'positive the interval from 2 to 4, not including 2 or 4; negative the interval from 1 to 2, including 1 but not 2, union the interval from 4 to 6, including 6 but not 4',
  );
  assert.equal(speechTextFor('The domain is (−2, 4).'), 'The domain is the interval from negative 2 to 4, not including negative 2 or 4.');
  assert.equal(speechTextFor('es creciente en (−2, 2)', es), 'es creciente en el intervalo de negativo 2 a 2, que no incluye negativo 2 ni 2');
  // A matrix written in brackets keeps its rows.
  assert.doesNotMatch(mathToSpeech('A = [[1, 2], [3, 4]]'), /interval/);
});

test('∪ is "union", and the pieces it joins are intervals', () => {
  assert.equal(
    speechTextFor('(−∞, 0) ∪ (0, ∞)'),
    'the interval from negative infinity to 0, not including 0, union the interval from 0 to infinity, not including 0',
  );
  assert.equal(
    speechTextFor('$(-\\infty,3]\\cup[3,\\infty)$'),
    'the interval from negative infinity to 3, including 3, union the interval from 3 to infinity, including 3',
    'LaTeX\'s \\cup was silent',
  );
  assert.equal(mathToSpeech('(−3, 1) ∪ (2, 5)'), 'the interval from negative 3 to 1, not including negative 3 or 1, union the interval from 2 to 5, not including 2 or 5');
  assert.equal(speechTextFor('Join the pieces with ∪.'), 'Join the pieces with union.');
  assert.equal(speechTextFor('a union (∪) in interval notation'), 'a union in interval notation');
  assert.equal(
    speechTextFor('(−∞, 0) ∪ (0, ∞)', es),
    'el intervalo de negativo infinito a 0, que no incluye 0, unión el intervalo de 0 a infinito, que no incluye 0',
  );
});

test('∘ is "composed with", as LaTeX\'s \\circ is', () => {
  assert.equal(speechTextFor('Find (f∘g)(x).'), 'Find f composed with g of x.');
  assert.equal(speechTextFor('Find (f∘g)(x).'), speechTextFor('Find $(f \\circ g)(x)$.'), 'as the LaTeX');
  assert.equal(speechTextFor('Let f(x) = 2x + 8 and g(x) = −x + 1. Find (f ∘ g)(4).'), 'Let f of x equals 2x plus 8 and g of x equals negative x plus 1. Find f composed with g of 4.');
  assert.equal(speechTextFor('retirement deduction before tax: t∘r'), 'retirement deduction before tax: t composed with r');
  // The bracket only names the composite.
  assert.equal(speechTextFor('In (f ∘ g), g acts on the input first.'), 'In f composed with g, g acts on the input first.');
  assert.equal(speechTextFor('Halla (f∘g)(x).', es), 'Halla f compuesta con g de x.');
});

test('a set in plain braces is read as LaTeX\'s \\{…\\} is: its members, from "the set" to "end set"', () => {
  assert.equal(speechTextFor('Find the inverse relation of {(−3, 26), (2, 11)}.'), 'Find the inverse relation of the set the point negative 3, 26, the point 2, 11 end set.');
  assert.equal(speechTextFor('{1, 2, 3}'), speechTextFor('$\\{1, 2, 3\\}$'), 'as the LaTeX');
  assert.equal(speechTextFor('so the domain is {0, 1, 2, ..., 48}.'), 'so the domain is the set 0, 1, 2,..., 48 end set.');
  assert.equal(speechTextFor('the zeros are {-4}.'), 'the zeros are the set negative 4 end set.');
  assert.equal(speechTextFor('the set {1, 2}'), 'the set 1, 2 end set', '"the set" said once');
  // A first member's sign is a sign, after plain braces and LaTeX's alike.
  assert.equal(spokenMathLabel('{−2, 0, 2, 4}'), 'the set negative 2, 0, 2, 4 end set');
  assert.equal(mathToSpeech('\\{-2, 0\\}'), 'the set negative 2, 0 end set', 'it was "the set minus 2"');
  // Braces that group LaTeX, or hold a word, are not a set.
  assert.equal(mathToSpeech('\\frac{1}{2} + x^{2}'), '1 over 2 plus x squared');
  assert.equal(speechTextFor('Replace {name} with yours.'), 'Replace {name} with yours.');
  assert.equal(speechTextFor('{(−3, 26), (2, 11)}', es), 'el conjunto el punto negativo 3, 26, el punto 2, 11 fin de conjunto');
});

// The set's neighbour in L1 Day 2 (walkthrough part 1, F-READ-INTERVALS):
// "x ∈ {−2, 0, 2, 4}" reached the voice as "x ∈ { negative 2, … }".
test('∈ is "is in", as LaTeX\'s \\in is, and what follows it is a set or an interval', () => {
  assert.equal(
    speechTextFor('Complete the table for f(x) = 0.5x + 1 over x ∈ {−2, 0, 2, 4}, plot only those points.'),
    'Complete the table for f of x equals 0.5x plus 1 over x is in the set negative 2, 0, 2, 4 end set, plot only those points.',
  );
  assert.equal(speechTextFor('x ∈ {1, 2}'), speechTextFor('$x \\in \\{1, 2\\}$'), 'as the LaTeX');
  assert.equal(speechTextFor('x ∈ (2, 5)'), 'x is in the interval from 2 to 5, not including 2 or 5');
  assert.equal(speechTextFor('(x, y) ∈ S'), 'the point x, y is in S', 'the pair before it is still a point');
  // Spanish joins "a" and "de" with the article: "pertenece al conjunto".
  assert.equal(speechTextFor('x ∈ {−2, 0, 2, 4}', es), 'x pertenece al conjunto negativo 2, 0, 2, 4 fin de conjunto');
  assert.equal(speechTextFor('x ∈ [0, 5)', es), 'x pertenece al intervalo de 0 a 5, que incluye 0 pero no 5');
  assert.equal(mathToSpeech('x \\in \\{1, 2\\}', es), 'x pertenece al conjunto 1, 2 fin de conjunto');
});

// math-speech-2: what P-1 left. An arrow reached the voice as a symbol ("x
// equals 2 → x plus 7 equals 9") and LaTeX's \to was dropped ("the point x, y
// the point 3x, 3y"). One arrow means different things, so it is read by
// what stands on each side of it.
test('an arrow is read by what it means where it stands', () => {
  // A limit: "approaches".
  assert.equal(speechTextFor('As x → ∞, f(x) → 0.'), 'As x approaches infinity, f of x approaches 0.');
  assert.equal(speechTextFor('as x → −∞, f(x) → 0'), 'as x approaches negative infinity, f of x approaches 0');
  assert.equal(mathToSpeech('x \\to \\infty'), 'x approaches infinity', 'LaTeX\'s \\to was not said at all');
  // A mapping or a relation: "maps to".
  assert.equal(speechTextFor('2 → 5'), '2 maps to 5');
  assert.equal(
    speechTextFor('Read each pair as input first, output second: -5 → 7, 2 → -6, 9 → 7.'),
    'Read each pair as input first, output second: negative 5 maps to 7, 2 maps to negative 6, 9 maps to 7.',
  );
  assert.equal(speechTextFor('(−4, 4) → (−6, 1); (−2, 2) → (−4, 2)'), 'the point negative 4, 4 maps to the point negative 6, 1; the point negative 2, 2 maps to the point negative 4, 2');
  assert.equal(speechTextFor('Under $(x,y)\\to(3x,3y)$, what is the image of $(3,3)$?'), 'Under the point x, y maps to the point 3x, 3y, what is the image of the point 3, 3?');
  assert.equal(speechTextFor('Use the first coordinate rule $x\\to3x$.'), 'Use the first coordinate rule x maps to 3x.');
  assert.equal(speechTextFor('Use the three-role map: base → base, result → argument, exponent → log value.'), 'Use the three-role map: base maps to base, result maps to argument, exponent maps to log value.');
  // A rule whose image the segmenter leaves as prose (its "½") is a mapping too.
  assert.match(speechTextFor('Move every defining point with (x, y) → (x − 2, −½·y + 3).'), /^Move every defining point with the point x, y maps to \(/);
  // A path, a pair of rows, a function machine.
  assert.equal(speechTextFor('if the vertices $A \\to B \\to C$ run clockwise'), 'if the vertices A to B to C run clockwise');
  assert.equal(speechTextFor('Apply 2 quarter-turns: (3, 1) → (−1, 3) → (−3, −1).'), 'Apply 2 quarter-turns: the point 3, 1 to the point negative 1, 3 to the point negative 3, negative 1.');
  assert.equal(speechTextFor('Row 1 → Row 3'), 'Row 1 to Row 3');
  assert.equal(speechTextFor('5 → g → 1 → f → 5'), '5 goes into g gives 1, goes into f gives 5');
  // A step of work: "gives".
  assert.equal(speechTextFor('Step 1: x = 2 → x + 7 = 9'), 'Step 1: x equals 2 gives x plus 7 equals 9');
  assert.equal(speechTextFor('6x + 4 = 4x + 12 → 2x = 8 → x = 4.'), '6x plus 4 equals 4x plus 12 gives 2x equals 8 gives x equals 4.');
  assert.equal(speechTextFor('a = 0: 5s = 3000, so s = 600 → (600, 0).'), 'a equals 0: 5s equals 3000, so s equals 600 gives the point 600, 0.');
  // A lone letter beside an arrow is a variable, even where the segmenter
  // keeps it as the word "a".
  assert.equal(speechTextFor('System A: 6x − 2(3x − 2) = a → 4 = a.'), 'System A: 6x minus 2 times the quantity 3x minus 2 equals a gives 4 equals a.');
  // In words: steps are "then", a rule is "means".
  assert.equal(
    speechTextFor('Gaussian elimination: eliminate the same variable from two pairs → solve the 2×2 system → back-substitute → check all three equations.'),
    'Gaussian elimination: eliminate the same variable from two pairs then solve the 2 times 2 system then back-substitute then check all three equations.',
  );
  assert.equal(speechTextFor('Outside negative → x-axis reflection. Inside negative → horizontal reflection.'), 'Outside negative means x-axis reflection. Inside negative means horizontal reflection.');
  assert.equal(speechTextFor('a: dashed and above → y > (1/2)x − 3.'), 'a: dashed and above means y is greater than the quantity 1 over 2 x minus 3.');
  // The other arrows.
  assert.equal(speechTextFor('$R_2\\leftarrow R_2-2R_1$'), 'R sub 2 is replaced by R sub 2 minus 2R sub 1');
  assert.equal(speechTextFor('Index ↔ denominator, power ↔ numerator.'), 'Index corresponds to denominator, power corresponds to numerator.');
  assert.equal(speechTextFor('c is a zero of P ⇔ x − c is a factor'), 'c is a zero of P if and only if x minus c is a factor');
  assert.equal(mathToSpeech('\\log_{3}(9)=2\\iff 3^2=9'), 'log base 3 of 9 equals 2 if and only if 3 squared equals 9');
  // No arrow is left for the voice to name, whatever stands beside it.
  for (const text of ['x → ∞', 'S1 → P1', '→ g →', 'Translate each condition: at least $\\to\\ge$.']) {
    assert.doesNotMatch(speechTextFor(text), /[→←↔⇔⇒]|\\to/, text);
  }
  // Spanish, in the pack's own words: "se acerca a", "corresponde a".
  assert.equal(speechTextFor('As x → ∞, f(x) → 0.', es), 'As x se acerca a infinito, f de x se acerca a 0.');
  assert.equal(speechTextFor('(−4, 4) → (−6, 1)', es), 'el punto negativo 4, 4 corresponde al punto negativo 6, 1');
  assert.equal(speechTextFor('6x + 4 = 4x + 12 → 2x = 8', es), '6x más 4 es igual a 4x más 12 da 2x es igual a 8');
  assert.equal(speechTextFor('5 → g → 1 → f → 5', es), '5 entra en g da 1, entra en f da 5');
});

// {y | y > 3}: the bar was read raw ("{ y | y is greater than 3 }") and
// LaTeX's \mid dropped ("the set y y is greater than 3 end set").
test('set-builder notation is "the set of … such that …"', () => {
  assert.equal(
    speechTextFor('Write a set-builder statement, for example {y | y > 2}.'),
    'Write a set-builder statement, for example the set of y such that y is greater than 2.',
  );
  assert.equal(speechTextFor('{x : x ≠ 2}'), 'the set of x such that x is not equal to 2', 'a colon for the bar');
  assert.equal(mathToSpeech('\\{y\\mid y>3\\}'), 'the set of y such that y is greater than 3');
  assert.equal(speechTextFor('{y | y > 3}'), speechTextFor('$\\{y \\mid y > 3\\}$'), 'as the LaTeX');
  assert.equal(speechTextFor('the range is the set {y | y ≥ 0}'), 'the range is the set of y such that y is greater than or equal to 0', '"the set" said once');
  // The bank's examples type ≠ as "!=": it was "x! equals 3".
  assert.equal(speechTextFor('{x|x!=3}'), 'the set of x such that x is not equal to 3');
  assert.equal(speechTextFor('x!=0'), 'x is not equal to 0');
  // A list in braces is still its members.
  assert.equal(speechTextFor('{1, 2, 3}'), 'the set 1, 2, 3 end set');
  assert.equal(speechTextFor('{y | y > 2}', es), 'el conjunto de y tal que y es mayor que 2');
});

// "log(x)" was "log times the quantity x", a product. A log with no base is
// the common log, "log of x", as log₂(x) is "log base 2 of x"; ln(x) is
// "natural log of x" (it was "ln times the quantity x").
test('a log with no base is "log of", and ln is "natural log of"', () => {
  assert.equal(speechTextFor('f(x) = log(x)'), 'f of x equals log of x');
  assert.equal(speechTextFor('f(x) = log(x)'), speechTextFor('$f(x) = \\log(x)$'), 'as the LaTeX');
  assert.equal(speechTextFor('f(x) = ln(x)'), 'f of x equals natural log of x');
  assert.equal(speechTextFor('y = ln x'), 'y equals natural log of x');
  assert.equal(speechTextFor('log 100 = 2'), 'log of 100 equals 2');
  // An argument of more than one term is a quantity, typed or in LaTeX.
  assert.equal(speechTextFor('g(x) = log(x + 2) − 1'), 'g of x equals log of the quantity x plus 2 end quantity minus 1');
  assert.equal(mathToSpeech('\\log(x+2)'), 'log of the quantity x plus 2', 'it was "log x plus 2"');
  assert.equal(mathToSpeech('y=\\log(x-(-2))+3'), 'y equals log of the quantity x minus the quantity negative 2 plus 3', 'a bracket inside the argument');
  assert.equal(mathToSpeech('\\log_{0.5}(x-3)'), 'log base 0.5 of the quantity x minus 3', 'it was "log base 0.5 of x minus 3"');
  // Around other mathematics.
  assert.equal(speechTextFor('y = -ln(x)'), 'y equals negative natural log of x');
  assert.equal(speechTextFor('e^(ln x)'), 'e to the power natural log of x');
  assert.equal(speechTextFor('Then use logarithms: $x=\\ln3/\\ln2$.'), 'Then use logarithms: x equals natural log of 3 over natural log of 2.');
  assert.equal(speechTextFor('Take ln of both sides.'), 'Take natural log of both sides.');
  // A base is said as before, and "log" in prose is a word.
  assert.equal(speechTextFor('g(x) = log₂(x)'), 'g of x equals log base 2 of x');
  assert.equal(speechTextFor('Keep a log of every answer.'), 'Keep a log of every answer.');
  assert.equal(speechTextFor('f(x) = log(x)', es), 'f de x es igual a logaritmo de x');
  assert.equal(speechTextFor('f(x) = ln(x)', es), 'f de x es igual a logaritmo natural de x');
});

// Translate's lines are written with ∘ and ∪ between the masked mathematics
// ("({1} ∘ {2}){3}", "{1} ∪ {2}"), so only Read aloud reads them as part of
// it: a Spanish sentence still translates, and is then read in Spanish words.
test('Translate still finds its Spanish lines, and Read aloud reads them', async () => {
  assert.equal(maskMath('Find (f∘g)(x).').masked, 'Find (⟦0⟧∘⟦1⟧)⟦2⟧.');
  assert.equal(maskMath('Answer: (−∞, 0) ∪ (0, ∞)').masked, 'Answer: ⟦0⟧ ∪ ⟦1⟧');
  const pack = await loadLanguagePack('es');
  const composed = translateWithPack('In (f ∘ g)(x), which rule goes inside the other?', pack).text;
  assert.equal(composed, 'En (f ∘ g)(x), ¿qué regla va dentro de la otra?');
  assert.equal(speechTextFor(composed, es), 'En f compuesta con g de x, ¿qué regla va dentro de la otra?');
  const union = translateWithPack('Answer: (−∞, 0) ∪ (0, ∞)', pack).text;
  assert.equal(union, 'Respuesta: (−∞, 0) ∪ (0, ∞)');
  assert.equal(speechTextFor(union, es), 'Respuesta: el intervalo de negativo infinito a 0, que no incluye 0, unión el intervalo de 0 a infinito, que no incluye 0');
  // math-speech-2: an arrow is still prose to Translate, so the pack's line
  // keeps it, and Read aloud says it in Spanish.
  const read = 'Read each pair as input first, output second: -5 → 7, 2 → -6, 9 → 7, 9 → 4.';
  assert.equal(maskMath(read).masked, 'Read each pair as input first, output second: ⟦0⟧ → ⟦1⟧, ⟦2⟧ → ⟦3⟧, ⟦4⟧ → ⟦5⟧, ⟦6⟧ → ⟦7⟧.');
  const pairs = translateWithPack(read, pack).text;
  assert.equal(pairs, 'Lee cada par con la entrada primero y la salida después: -5 → 7, 2 → -6, 9 → 7, 9 → 4.');
  assert.equal(speechTextFor(pairs, es), 'Lee cada par con la entrada primero y la salida después: negativo 5 corresponde a 7, 2 corresponde a negativo 6, 9 corresponde a 7, 9 corresponde a 4.');
  // The family's log hint keeps its words (its log is drawn, not rewritten),
  // so its Spanish line still matches.
  const hint = translateWithPack('In f(x) = log_0.5(x), which values of x can a logarithm accept, and so which x-values can the graph use?', pack).text;
  assert.equal(hint, 'En f(x) = log_0.5(x), ¿qué valores de x acepta un logaritmo? Entonces, ¿qué valores de x puede usar la gráfica?');
  assert.equal(speechTextFor(hint, es), 'En f de x es igual a logaritmo en base 0.5 de x, ¿qué valores de x acepta un logaritmo? Entonces, ¿qué valores de x puede usar la gráfica?');
});

// Every text a student hears in the module's lessons, as the device builds
// it: the whole question with its choices, the hints, each choice's reason and
// the closed review. None may reach the voice as raw notation, and every
// pair that can only be an interval must be said as one.
const MODULE = new URL('../../teacher-import-jsons/algebra2-honors-module1/', import.meta.url);
// math-speech-2 adds arrows and a log read as a product.
const RAW = /[ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ∘∪∈{}→←↔⇔⇒]|log sub|log_|\b(?:log|ln) (?:times|por)\b|(?:the point|el punto) [^,.;]*infinit/u;
const ONLY_AN_INTERVAL = /\[[^()[\],;]+,[^()[\],;]+[\])]|\([^()[\],;]*∞[^()[\],;]*,[^()[\],;]+[\])]|\([^()[\],;]+,[^()[\],;]*∞[^()[\],;]*[\])]/gu;
// math-speech-2: and the worked sibling the hint panel reads ("Read each pair
// as input first, output second: -6 → 9, …").
const workedSibling = (question) => {
  const similar = familyFor(question)?.similarProblem?.(question, { seed: 1 });
  return similar ? [similar.prompt, ...(similar.steps || []), similar.answer] : [];
};
const moduleTexts = () => readdirSync(MODULE).filter((name) => name.endsWith('.json')).flatMap((name) => {
  const { questions } = parseAssignmentBlueprintText(readFileSync(new URL(name, MODULE), 'utf8'));
  return questions.flatMap((question) => [
    ...questionReadingParts(question).map((part) => part.text),
    ...buildQuestionHints(question).map((hint) => hint.text),
    ...(question.answerFields || []).flatMap((field) => Object.values(field.optionRationales || {})),
    ...(buildClosedQuestionReview({ question })?.speechParts || []).map((part) => part.text),
    ...workedSibling(question),
  ].filter((text) => text != null).map((text) => ({ name, text: String(text) })));
});

test('Algebra II Honors module 1 reaches the voice in words, in English and in Spanish', () => {
  const texts = moduleTexts();
  assert.ok(texts.length > 1500, `read ${texts.length} texts`);
  const intervals = texts.filter(({ text }) => text.match(ONLY_AN_INTERVAL));
  assert.ok(intervals.length > 50, `${intervals.length} texts hold an interval`);
  const raw = [];
  for (const { name, text } of texts) {
    for (const language of ['en', 'es']) {
      const spoken = speechTextFor(text, { language });
      if (RAW.test(spoken)) raw.push(`${name} (${language}): ${text} → ${spoken}`);
      const said = spoken.split(language === 'es' ? 'el intervalo de' : 'the interval from').length - 1;
      if (said < (text.match(ONLY_AN_INTERVAL) || []).length) raw.push(`${name} (${language}): an interval read as something else: ${text} → ${spoken}`);
    }
  }
  assert.deepEqual(raw.slice(0, 5), [], `${raw.length} readings`);
});
