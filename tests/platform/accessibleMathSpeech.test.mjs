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
  assert.match(source, /const spoken = mathSpeechLabel\(\{ value: cleanValue, ariaLabel \}\);/);
  assert.match(region(source, '</Element>', '</>', 'after the element'), /\{spoken \? <span[^>]*style=\{SR_ONLY_STYLE\}>\{spoken\}<\/span> : null\}/);
});

test('cancellable algebra terms are named in words and keep the keyboard focus ring', () => {
  const row = executableSource(read('src/AlgebraTermRow.jsx'));
  assert.match(row, /import \{ spokenMathLabel \} from '\.\/platform\/language\/mathSpeechLabel\.js';/);
  assert.match(row, /aria-label=\{onTermClick \? `\$\{spokenMathLabel\(term\.text\)\}, \$\{interactionLabel\}` : undefined\}/);
  assert.doesNotMatch(row, /outline: [^,\n]*'none'/, 'no inline outline:none on an interactive term');
});
