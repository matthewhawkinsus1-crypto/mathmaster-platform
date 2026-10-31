import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMathSegment, removeRedundantPlainFractionParens, splitMathSegments, splitProseFractionRuns, unwrapMathSegment,
} from '../../src/components/common/mathSegments.js';
import { stackDivisions } from '../../functions/shared/stackDivisions.mjs';

// Where the mathematics is in a sentence. Both MathText and QuestionPrompt read
// this, so a mistake here is a mistake on every student screen at once.

const mathParts = (text) => splitMathSegments(text).filter(isMathSegment);
const proseParts = (text) => splitMathSegments(text).filter((part) => !isMathSegment(part));

test('inline, display and backslash delimiters are all recognised', () => {
  assert.deepEqual(mathParts('Solve $2x + 1 = 7$ for x.'), ['$2x + 1 = 7$']);
  assert.deepEqual(mathParts('Consider $$y = mx + b$$ here.'), ['$$y = mx + b$$']);
  assert.deepEqual(mathParts('Consider \\[y = mx + b\\] here.'), ['\\[y = mx + b\\]']);
  assert.deepEqual(mathParts('Consider \\(y = mx\\) here.'), ['\\(y = mx\\)']);
});

test('an escaped dollar sign is money inside the mathematics, not a delimiter', () => {
  // The exact seed line that was reaching students as "3 \times 18.25 = \".
  const line = 'Three withdrawals of $\\$18.25$ total $3 \\times 18.25 = \\$54.75$.';
  assert.deepEqual(mathParts(line), ['$\\$18.25$', '$3 \\times 18.25 = \\$54.75$']);
  // Nothing that looks like markup survives into the prose the student reads.
  assert.equal(proseParts(line).join('').includes('\\'), false);
  assert.equal(proseParts(line).join('').includes('$'), false);
});

test('the escaped dollar stays inside the value handed to the renderer', () => {
  assert.equal(unwrapMathSegment('$\\$18.25$').value, '\\$18.25');
  assert.equal(unwrapMathSegment('$\\$18.25$').inline, true);
  assert.equal(unwrapMathSegment('$$y = 2x$$').inline, false);
  assert.equal(unwrapMathSegment('\\[y = 2x\\]').inline, false);
});

test('a lone dollar sign is a currency symbol, not an unclosed formula', () => {
  // A table header the bank really uses. One dollar cannot open mathematics,
  // because guessing would swallow the rest of the sentence.
  assert.deepEqual(mathParts('Plan A total ($)'), []);
  assert.deepEqual(splitMathSegments('Plan A total ($)'), ['Plan A total ($)']);
});

test('mathematics is found after a currency amount rather than swallowed by it', () => {
  const line = 'Solving leaves $6x = 300$, and each unit adds $6 of profit.';
  assert.deepEqual(mathParts(line), ['$6x = 300$']);
});

test('a text with no mathematics is returned whole', () => {
  assert.deepEqual(splitMathSegments('Explain your reasoning.'), ['Explain your reasoning.']);
  assert.deepEqual(splitMathSegments(''), []);
  assert.deepEqual(splitMathSegments(null), []);
});

test('plain grouped scalar fractions lose only their redundant grouping before stacking', () => {
  assert.equal(removeRedundantPlainFractionParens('(2/3)x'), '2/3x');
  assert.equal(removeRedundantPlainFractionParens('-(3/4)(x - 14)'), '-3/4(x - 14)');
  assert.equal(removeRedundantPlainFractionParens('(x + 1)/2'), '(x + 1)/2');

  const runs = splitProseFractionRuns('Graph y = (2/3)x + 7.');
  assert.deepEqual(runs, [
    { text: 'Graph y = ', isFraction: false },
    { text: '\\frac{2}{3}', isFraction: true },
    { text: 'x + 7.', isFraction: false },
  ]);
});

// Oct 2026 matrices walkthrough: the Matrix Lab's row x column line
// "6(3/2) + −1(1/6)" reached the student as 63/2 + −11/6 — without the
// brackets, the number in front ran into the numerator.
test('a bracketed fraction a number touches keeps its brackets', () => {
  assert.equal(removeRedundantPlainFractionParens('6(3/2)'), '6(3/2)');
  assert.equal(removeRedundantPlainFractionParens('(3/2)6'), '(3/2)6');
  assert.equal(removeRedundantPlainFractionParens('2.5(1/2)'), '2.5(1/2)');
  assert.deepEqual(splitProseFractionRuns('Evaluate 4(1/2).').map((run) => run.text).join(''), 'Evaluate 4(\\frac{1}{2}).');
  const expansion = splitProseFractionRuns('6(3/2) + −1(1/6)');
  assert.ok(!expansion.some((run) => /\\frac\{63\}|\\frac\{11\}/.test(run.text)), JSON.stringify(expansion));
  assert.deepEqual(expansion.filter((run) => run.isFraction).map((run) => run.text), ['\\frac{3}{2}', '\\frac{1}{6}']);
  // Two bracketed fractions side by side multiply; stripping both made 2/33/2.
  const product = splitProseFractionRuns('Row 1 of R times column 1 of S: (2/3)(3/2) + 1(1/6).');
  assert.deepEqual(product.filter((run) => run.isFraction).map((run) => run.text), ['\\frac{2}{3}', '\\frac{3}{2}', '\\frac{1}{6}']);
});

test('the full stop after a prose fraction ends the sentence, not the denominator', () => {
  assert.deepEqual(splitProseFractionRuns('Simplify 2/6.'), [
    { text: 'Simplify ', isFraction: false },
    { text: '\\frac{2}{6}', isFraction: true },
    { text: '.', isFraction: false },
  ]);
  assert.deepEqual(splitProseFractionRuns('The slope is 3/4. Graph the line.'), [
    { text: 'The slope is ', isFraction: false },
    { text: '\\frac{3}{4}', isFraction: true },
    { text: '. Graph the line.', isFraction: false },
  ]);
  // A decimal keeps its point; only the sentence's stop moves.
  assert.deepEqual(splitProseFractionRuns('Divide 3/1.5.'), [
    { text: 'Divide ', isFraction: false },
    { text: '\\frac{3}{1.5}', isFraction: true },
    { text: '.', isFraction: false },
  ]);
});

test('the pattern carries no state between callers', () => {
  // A module-level /g regex shares lastIndex, so the second caller silently gets
  // a different answer than the first. That bug is why this returns a new one.
  const line = 'Solve $x = 1$ and $y = 2$.';
  assert.deepEqual(mathParts(line), ['$x = 1$', '$y = 2$']);
  assert.deepEqual(mathParts(line), ['$x = 1$', '$y = 2$']);
  assert.equal(isMathSegment('$x = 1$'), true);
  assert.equal(isMathSegment('$x = 1$'), true);
  assert.equal(isMathSegment('plain'), false);
});

// x^(1/3) in a prompt's prose was drawn as x¹ over 3: the brackets an
// exponent owns were stripped as if they only grouped a plain fraction.
test('a bracketed fraction attached to an exponent, a subscript or a name keeps its brackets', async () => {
  const { removeRedundantPlainFractionParens: strip, splitProseFractionRuns: split } = await import('../../src/components/common/mathSegments.js');
  assert.equal(strip('x^(1/3)'), 'x^(1/3)');
  assert.equal(strip('e^(x/2)'), 'e^(x/2)');
  assert.equal(strip('x_(1/2)'), 'x_(1/2)');
  assert.equal(strip('f(1/2)'), 'f(1/2)');
  assert.equal(strip('Find (1/2) of 8'), 'Find 1/2 of 8', 'a fraction grouped on its own still loses its brackets');
  // The power is typeset whole, its base and brackets with it (next test).
  assert.deepEqual(split('Write x^(1/3) as a radical.').map((chunk) => chunk.text), ['Write ', 'x^(\\frac{1}{3})', ' as a radical.']);
});

const pieces = (text) => splitProseFractionRuns(text).map(({ text: piece, isFraction }) => (isFraction ? `[${piece}]` : piece)).join('');

// Rational Exponents: "x^(" then a stacked ⅓ then ")" was what a student read.
test('a power whose exponent is a fraction is typeset whole, with its base', () => {
  assert.equal(pieces('y^(1/7) · y^(4/7) = y^(5/7).'), '[y^(\\frac{1}{7})] · [y^(\\frac{4}{7})] = [y^(\\frac{5}{7})].');
  assert.equal(pieces('x^(−2/3) has a negative exponent'), '[x^(−\\frac{2}{3})] has a negative exponent');
  assert.equal(pieces('An even root: (−16)^(1/2) is not real.'), 'An even root: [(−16)^(\\frac{1}{2})] is not real.');
  assert.equal(pieces('Multiply 2x^(1/3) by 3.'), 'Multiply [2x^(\\frac{1}{3})] by 3.');
  // A power of a power is one piece, written either way.
  assert.equal(pieces('√(∛x) = (x^(1/3))^(1/2) = x^(1/6).'), '√(∛x) = [(x^(\\frac{1}{3}))^(\\frac{1}{2})] = [x^(\\frac{1}{6})].');
  assert.equal(pieces('x^(1/2)^(1/3)'), '[x^(\\frac{1}{2})^(\\frac{1}{3})]');
  // A power after a bracketed denominator is the denominator's: one over the power.
  assert.equal(pieces('It is 1/(3x^3)^(3/3).'), 'It is [\\frac{1}{(3x^3)^(\\frac{3}{3})}].');
  // What is not a power keeps its brackets in the prose.
  assert.equal(pieces('Find f(1/2).'), 'Find f([\\frac{1}{2}]).');
  assert.equal(pieces('Then 2^(x-1) doubles.'), 'Then 2^(x-1) doubles.');
});

// Dividing Polynomials: 2/(y + 1/2) stacks as \frac{2}{y + \frac{1}{2}}, and
// a pattern that stopped at the first inner brace showed "\frac{2}{y + " as text.
test('a fraction inside a fraction is typeset whole, never shown as code', () => {
  assert.equal(pieces('2/(y + 1/2) = 4/(2y + 1).'), '[\\frac{2}{y + \\frac{1}{2}}] = [\\frac{4}{2y + 1}].');
  assert.equal(pieces('x^(−2/3) = 1/x^(2/3).'), '[x^(−\\frac{2}{3})] = [\\frac{1}{x^(\\frac{2}{3})}].');
  // stackDivisions reads B^(E)/N as B^((E)/N) (GR04): drawn whole, base and all.
  assert.equal(pieces('Not 2^(x-1)/3.'), 'Not [2^\\frac{x-1}{3}].');
  for (const text of ['2/(y + 1/2) = 4/(2y + 1).', 'Not 2^(x-1)/3.', 'x^(−2/3) = 1/x^(2/3). Multiply by (x^(1/3))/(x^(1/3)).']) {
    assert.ok(splitProseFractionRuns(text).every(({ text: piece, isFraction }) => isFraction || !/\\[A-Za-z]/.test(piece)), text);
  }
});

test('the pieces always put the sentence back together', () => {
  for (const text of [
    'y^(1/7) · y^(4/7) = y^(5/7).', '√(∛x) = (x^(1/3))^(1/2) = x^(1/6) = ⁶√x.', 'x^(1/2)^(1/3) and 1/(3x^3)^(3/3).',
    'Simplify 2/6.', 'Graph y = (2/3)x + 7.', '6(3/2) + −1(1/6)', '2/(y + 1/2) is 4/(2y + 1), not 2/(2y + 1).',
  ]) {
    // The stacked sentence, split and not changed: only a sentence's full stop
    // moves, out of a denominator.
    const joined = splitProseFractionRuns(text).map((piece) => piece.text).join('');
    assert.equal(joined.replace(/\./g, ''), stackDivisions(removeRedundantPlainFractionParens(text), { unicodeMath: true }).replace(/\./g, ''), text);
  }
});

test('brackets a radical owns, or a power follows, are not dropped as redundant', () => {
  assert.equal(removeRedundantPlainFractionParens('√(5/4)'), '√(5/4)');
  assert.equal(removeRedundantPlainFractionParens('ⁿ√(a/b)'), 'ⁿ√(a/b)');
  assert.equal(removeRedundantPlainFractionParens('(8/3)²'), '(8/3)²');
  assert.equal(removeRedundantPlainFractionParens('(2/3)^2'), '(2/3)^2');
  assert.equal(removeRedundantPlainFractionParens('Find (1/2) of 8'), 'Find 1/2 of 8', 'a fraction grouped on its own still loses them');
  assert.equal(pieces('Not (8/3)²: take the root first.'), 'Not ([\\frac{8}{3}])²: take the root first.');
  assert.equal(pieces('√(5/4) = √5/2.'), '√([\\frac{5}{4}]) = [\\frac{√5}{2}].');
});
