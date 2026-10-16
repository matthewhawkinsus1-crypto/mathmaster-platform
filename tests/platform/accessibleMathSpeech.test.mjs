// MATH SPEAKS (WCAG 1.1.1, 1.3.1): rendered mathematics reaches a screen
// reader once, in words, and never as LaTeX or a placeholder.
// Browser proof of the accessibility tree: tests/browser/mathSpeech.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { mathSpeechLabel, spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('LaTeX with nested groups is spoken, not dropped', () => {
  // The old single-level regex lost the fraction bar: "x squared plus 1 3".
  assert.equal(mathToSpeech('\\frac{x^{2}+1}{3}'), 'the fraction x squared plus 1 over 3 end fraction');
  assert.equal(mathToSpeech('\\frac{\\frac{1}{2}}{3}'), 'the fraction 1 over 2 over 3 end fraction');
  assert.equal(mathToSpeech('\\sqrt{x+1}'), 'the square root of x plus 1 end root');
  // A simple fraction keeps the short form Read Aloud has always used.
  assert.equal(mathToSpeech('\\dfrac{3}{4}'), '3 over 4');
});

test('geometry, sequences, sets and logs say what the notation means', () => {
  assert.equal(mathToSpeech('m\\angle A = 30^{\\circ}'), 'm angle A equals 30 degrees');
  assert.equal(mathToSpeech('45^\\circ'), '45 degrees');
  assert.equal(mathToSpeech('a_{n} = a_{n-1} + 3'), 'a sub n equals a sub n minus 1 plus 3');
  assert.equal(mathToSpeech('x_1 + x_2'), 'x sub 1 plus x sub 2');
  assert.equal(mathToSpeech('\\{1, 2, 3\\}'), 'the set 1, 2, 3 end set');
  assert.equal(mathToSpeech('\\overline{AB}'), 'segment AB');
  assert.equal(mathToSpeech('0.\\overline{3}'), '0.3 repeating');
  assert.equal(mathToSpeech('\\triangle ABC \\cong \\triangle DEF'), 'triangle ABC is congruent to triangle DEF');
  assert.equal(mathToSpeech('\\log_2(8)'), 'log base 2 of 8');
  assert.equal(mathToSpeech('\\text{Area} = \\pi r^2'), 'Area equals pi r squared');
  assert.equal(mathToSpeech('\\$4.50'), '4.50 dollars');
  assert.equal(mathToSpeech('sqrt(x)'), 'the square root of x');
});

test('no LaTeX command or brace survives into speech', () => {
  for (const latex of ['\\frac{x^{2}+1}{3}', '\\left(2, -3\\right)', '\\sqrt[4]{16}', '\\overrightarrow{AB}', '\\theta \\approx 0.5']) {
    assert.doesNotMatch(mathToSpeech(latex), /[\\{}]/, latex);
  }
});

test('Read Aloud prose is unchanged by the richer math reader', () => {
  assert.equal(speechTextFor('What is $\\frac{3}{4}$ of 12?'), 'What is 3 over 4 of 12?');
  assert.equal(speechTextFor('Solve $2x+3=7$.'), 'Solve 2x plus 3 equals 7.');
});

test('a label in program syntax or LaTeX is spoken in words; placeholders give way to the math', () => {
  assert.equal(spokenMathLabel('2 * x'), '2 times x');
  assert.equal(spokenMathLabel('-3'), 'negative 3');
  assert.equal(spokenMathLabel('Given equation \\frac{1}{2}x + 3'), 'Given equation 1 over 2 x plus 3');
  assert.equal(spokenMathLabel('Given point (2, -3)'), 'Given point 2, negative 3');
  assert.equal(spokenMathLabel('Multiply these numbers'), 'Multiply these numbers');
  assert.equal(mathSpeechLabel({ value: '\\frac{3}{4}', ariaLabel: 'Mathematical expression' }), '3 over 4');
  assert.equal(mathSpeechLabel({ value: '\\frac{3}{4}', ariaLabel: 'Fraction expression' }), '3 over 4');
  assert.equal(mathSpeechLabel({ value: 'y = -\\frac{2}{3}x + 4' }), 'y equals negative 2 over 3 x plus 4');
  assert.equal(mathSpeechLabel({ value: 'x^2', ariaLabel: 'x squared, authored' }), 'x squared, authored');
  assert.equal(mathSpeechLabel({ value: '' }), '');
});

test('MathDisplay hides the typeset element and renders one spoken copy from its value', () => {
  const source = executableSource(read('src/MathDisplay.jsx'));
  assert.doesNotMatch(source, /Mathematical expression/, 'the placeholder default label is gone');
  assert.match(source, /import \{ mathSpeechLabel \} from '\.\/platform\/language\/mathSpeechLabel\.js';/);
  const render = region(source, '<Element', '</Element>', 'the typeset element');
  assert.match(render, /aria-hidden="true"/, 'MathLive markup and MathML are hidden from assistive technology');
  assert.doesNotMatch(render, /aria-label=/, 'no label on the hidden element');
  assert.match(source, /const spoken = useMemo\(\(\) => mathSpeechLabel\(\{ value: cleanValue, ariaLabel \}\), \[cleanValue, ariaLabel\]\);/);
  assert.match(region(source, '</Element>', '</>', 'after the element'), /\{spoken \? <span[^>]*style=\{SR_ONLY_STYLE\}>\{spoken\}<\/span> : null\}/);
});

test('cancellable algebra terms are named in words and keep the keyboard focus ring', () => {
  const row = executableSource(read('src/AlgebraTermRow.jsx'));
  assert.match(row, /import \{ spokenMathLabel \} from '\.\/platform\/language\/mathSpeechLabel\.js';/);
  assert.match(row, /aria-label=\{onTermClick \? `\$\{spokenMathLabel\(term\.text\)\}, \$\{interactionLabel\}` : undefined\}/);
  assert.doesNotMatch(row, /outline: [^,\n]*'none'/, 'no inline outline:none on an interactive term');
  assert.match(row, /data-term-text=\{term\.text\}/);
  // The relation workspace's Combine like terms chips are the same kind of
  // control: spoken, with the source text kept for code (questionFamilyCases).
  const combine = executableSource(read('src/RelationStructureTools.jsx'));
  assert.match(combine, /import \{ spokenMathLabel \} from '\.\/platform\/language\/mathSpeechLabel\.js';/);
  assert.match(combine, /aria-label=\{`\$\{spokenMathLabel\(term\.text\.replace\(\/\^\\\+\\s\*\/, ''\)\)\}, select as a term to combine`\}/);
  assert.match(combine, /data-term-text=\{term\.text\.replace\(\/\^\\\+\\s\*\/, ''\)\}/);
  assert.equal(spokenMathLabel('-6 * x'), 'negative 6 times x');
});

// substitution-browser CI (PR #454): "x equals 2~ y" and "the quantity minus 3".
test('LaTeX spacing is silent and a sign that opens a bracket is a negative', () => {
  assert.equal(mathToSpeech('x = 2~y - 3'), 'x equals 2 y minus 3');
  assert.equal(mathToSpeech('3(-3 + 2y) + 5y = 24'), '3 times the quantity negative 3 plus 2y plus 5y equals 24');
});

// A bracket after an operator word opens a quantity; only a number, a letter
// or a closing bracket before it makes a product.
test('a bracket after an operator is a quantity, not a product', () => {
  assert.equal(mathToSpeech('x = (2 + 1)'), 'x equals the quantity 2 plus 1');
  assert.equal(mathToSpeech('3 * (x + 1)'), '3 times the quantity x plus 1');
  assert.equal(mathToSpeech('3 ÷ (x + 1)'), '3 divided by the quantity x plus 1');
  assert.equal(mathToSpeech('|x| + (2)'), 'the absolute value of x plus the quantity 2');
  assert.equal(mathToSpeech('2(x + 1)'), '2 times the quantity x plus 1');
  assert.equal(mathToSpeech('x^2(x+1)'), 'x squared times the quantity x plus 1');
  assert.equal(mathToSpeech('x + (2 - x)', { language: 'es' }), 'x más la cantidad 2 menos x');
  assert.equal(mathToSpeech('3 * (x + 1)', { language: 'es' }), '3 por la cantidad x más 1');
});

// FUNCTION NOTATION, READ ALOUD. Found doing Algebra I M2 T2 L2 as a student
// (docs/qa/algebra1-m2t2-student-walkthrough.md): "Graph g(x) = f(x − 7)" and
// "Graph g(x) = f(x) − 4" were both read "g of x equals f of x minus …", so a
// student listening could not tell a shift right from a shift down — the one
// distinction that lesson teaches. And j(x) was read "j times the quantity x".
test('an input of more than one term is spoken as a quantity, so f(x − 7) and f(x) − 7 sound different', () => {
  assert.equal(mathToSpeech('g(x) = f(x − 7)'), 'g of x equals f of the quantity x minus 7');
  assert.equal(mathToSpeech('g(x) = f(x) − 7'), 'g of x equals f of x minus 7');
  assert.notEqual(mathToSpeech('3f(x − 2)'), mathToSpeech('3f(x) − 2'));
  assert.notEqual(mathToSpeech('f(x + 4) + 1'), mathToSpeech('f(x) + 4 + 1'));
  assert.equal(mathToSpeech('f(−3)'), 'f of negative 3', 'one signed term is not a quantity');
  assert.equal(mathToSpeech('h(2x)'), 'h of 2x');
  assert.equal(mathToSpeech('y − 2 = m(x − 6)'), 'y minus 2 equals m times the quantity x minus 6', 'point-slope m(…) is still a product');
  assert.equal(mathToSpeech('g(x) = f(x − 7)', { language: 'es' }), 'g de x es igual a f de la cantidad x menos 7');
});

test('j(x) is a function, not j times x', () => {
  assert.equal(mathToSpeech('j(x) = 2x − 1'), 'j of x equals 2x minus 1');
  assert.equal(mathToSpeech('q(x) = j(x) + 4'), 'q of x equals j of x plus 4');
});

// Oct 2026 matrices walkthrough: what Read aloud said for three prompts.
test('every price in a list of prices is spoken in dollars', () => {
  assert.equal(
    speechTextFor('small baskets for $15.75, medium baskets for $25, and large baskets for $32.50. They took in $2,086.25 and sold twice as many.'),
    'small baskets for 15.75 dollars, medium baskets for 25 dollars, and large baskets for 32.50 dollars. They took in 2,086.25 dollars and sold twice as many.',
  );
  assert.equal(
    speechTextFor('The team sold $20, $25, and $50 gas cards.'),
    'The team sold 20 dollars, 25 dollars, and 50 dollars gas cards.',
  );
  // Real mathematics between dollar signs is still mathematics.
  assert.equal(speechTextFor('Solve $3x + 2 = 8$ for x.'), 'Solve 3x plus 2 equals 8 for x.');
});

test('an ordinal stays one word: 1st is "1st", not "1 st"', () => {
  assert.equal(
    speechTextFor('10 points for 1st, 8 for 2nd, 6 for 3rd, 4 for 4th, 2 for 5th.'),
    '10 points for 1st, 8 for 2nd, 6 for 3rd, 4 for 4th, 2 for 5th.',
  );
});

test('a superscript −1 is spoken "inverse", in prose and in mathematics', () => {
  assert.equal(speechTextFor('use the calculator to find X = A⁻¹ · B.'), 'use the calculator to find X equals A inverse times B.');
  assert.equal(speechTextFor('Press [A]⁻¹ first.'), 'Press A inverse first.');
  assert.equal(speechTextFor('Halla A⁻¹.', { language: 'es' }), 'Halla A inversa.');
});
