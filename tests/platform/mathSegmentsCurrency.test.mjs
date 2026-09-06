import test from 'node:test';
import assert from 'node:assert/strict';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';

test('two ordinary currency amounts never become one giant inline-math span', () => {
  const prompt = 'Hector earns $1500 each pay period. Let r(x)=x−100 represent income after a $100 retirement deduction, and let t(x)=0.96x represent income after a 4% state income tax.';
  const parts = splitMathSegments(prompt);
  assert.deepEqual(parts, [prompt]);
  assert.equal(isMathSegment(parts[0]), false);
});

test('legacy inline algebra with dollar delimiters still renders as math', () => {
  const parts = splitMathSegments('Solve $x+2=5$ now.');
  assert.deepEqual(parts, ['Solve ', '$x+2=5$', ' now.']);
  assert.equal(isMathSegment(parts[1]), true);
});

test('numeric inline arithmetic can still use dollar delimiters', () => {
  const parts = splitMathSegments('Compute $3 + 2$ mentally.');
  assert.deepEqual(parts, ['Compute ', '$3 + 2$', ' mentally.']);
  assert.equal(isMathSegment(parts[1]), true);
});

test('currency before a real inline-math span does not swallow the math span', () => {
  const parts = splitMathSegments('The fee is $15 per month. Solve $x+2=5$.');
  assert.deepEqual(parts, ['The fee is $15 per month. Solve ', '$x+2=5$', '.']);
});

test('a LaTeX command that puts a WORD inside mathematics is not prose', () => {
  // `\text{ with }` is how LaTeX writes a word inside a formula. The currency
  // guard stripped the command NAME but left its braced argument behind, so
  // "with" read as a prose word after "$3" and the whole span was classified as
  // an ordinary currency amount. Thirty-five answer choices in the ASVAB bank
  // were shown to students as literal "$3 \text{ with } 32$".
  const parts = splitMathSegments('$3 \\text{ with } 32$');
  assert.deepEqual(parts, ['$3 \\text{ with } 32$']);
  assert.equal(isMathSegment(parts[0]), true);
});

test('the two halves of the splitter agree about where the mathematics is', () => {
  // splitMathSegments said "one math segment" while isMathSegment said "prose",
  // and MathText believes the second — which is how a correctly-split span still
  // reached the screen as markup. Any disagreement is the bug.
  [
    '$3 \\text{ with } 32$',
    '$25 \\times 15=375$',
    '$1\\text{ in}\\approx2.5\\text{ cm}$',
    '$\\sqrt{x+ 1}=x-(-1)$',
    '$\\frac{\\sqrt{x}}{2}$',
    '$-5x+ 1 \\ge -24$',
    '$x>6$',
  ].forEach((source) => {
    const parts = splitMathSegments(source);
    assert.deepEqual(parts, [source], `${source} did not split as one segment`);
    assert.equal(isMathSegment(parts[0]), true, `${source} split as math but was not recognised as math`);
  });
});

test('real money followed by real words is still left in the prose', () => {
  // The fix must not swing the other way: these have no LaTeX to strip, so the
  // prose test still sees the words and still calls them currency.
  ['$15 per month', '$1500 each pay period', '$100 retirement deduction'].forEach((money) => {
    assert.equal(isMathSegment(`${money}$`), false, `${money} was mistaken for mathematics`);
  });
});
