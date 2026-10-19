/*
 * The balance board draws what the student did (student pass 3).
 *
 * Q-13: dividing both sides of -2x = -10 by -2 writes the right side as
 * (-10) / (-2). The term splitter canonicalised the numerator's sign into the
 * term's additive sign, and the board drew -\frac{10}{-2}: a sign pattern the
 * student never wrote. A fraction whose numerator is a written group is now
 * drawn as written, \frac{-10}{-2}.
 *
 * Q-31: a hidden implicit product was joined with a TeX tie, -2~ x, which
 * draws as a space ("−2 x"). It is now written -2x.
 *
 * Both are display only. The term's text, sign and magnitudes, which rewrite,
 * like-term and placement code rebuild the side from and grading never sees
 * as LaTeX, are pinned unchanged here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';
import { splitAdditiveTerms, expressionToLatex, applyBalancedOperation, expressionsEquivalent } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { latexToExpression } from '../../functions/shared/algebra/latexToExpression.mjs';

// TeX ignores a space in math mode, so spacing is not what is drawn.
const drawn = (latex) => latex.replace(/\s+/g, '');
const latexOf = (expression) => splitAdditiveTerms(expression).map((term) => drawn(term.latex));
const canonical = (expression) => splitAdditiveTerms(expression).map(({ text, sign, magnitudeText }) => ({ text, sign, magnitudeText }));

test('Q-13: a divided side is drawn with the signs the student wrote', () => {
  assert.deepEqual(latexOf('(-10) / (-2)'), ['\\frac{-10}{-2}']);
  assert.deepEqual(latexOf('(-2x) / (-2)'), ['\\frac{-2x}{-2}']);
  // A later term keeps its own operator in front of the written fraction.
  assert.deepEqual(latexOf('x - (-10) / (-2)'), ['x', '-\\frac{-10}{-2}']);
  // Unchanged where nothing was pulled out of a written group.
  assert.deepEqual(latexOf('(10) / (-2)'), ['\\frac{10}{-2}']);
  assert.deepEqual(latexOf('(8 - 2x) / (-4)'), ['\\frac{8-2x}{-4}']);
  // A typed -10/2 has no written group: the sign stays in front, as before.
  assert.deepEqual(latexOf('-10/2'), ['-\\frac{10}{2}']);
  assert.deepEqual(latexOf('(-2/3)x'), ['-\\frac{2}{3}x']);
});

test('Q-13: the divide step itself produces the written form', () => {
  const equationState = { left: '-2x', right: '-10', variable: 'x', objective: { kind: 'solve', variable: 'x' } };
  const { unsimplified } = applyBalancedOperation({ equationState, operation: 'divide', operand: '-2' });
  assert.deepEqual(latexOf(unsimplified.right), ['\\frac{-10}{-2}']);
  assert.deepEqual(latexOf(unsimplified.left), ['\\frac{-2x}{-2}']);
});

test('Q-31: an implicit product is written without a gap', () => {
  assert.deepEqual(latexOf('-2x + 4'), ['-2x', '+4']);
  assert.deepEqual(latexOf('2(-y)'), ['2\\left(-y\\right)']);
  assert.equal(drawn(expressionToLatex('-2x+4')), '-2x+4');
  for (const expression of ['-2x + 4', '2(-y)', '(-2/3)x', '3xy', '(x + 1)5', '(-10)/(-2)', 'x^2 - 5x + 6']) {
    assert.doesNotMatch(expressionToLatex(expression), /~/, expression);
    splitAdditiveTerms(expression).forEach((term) => assert.doesNotMatch(term.latex, /~/, expression));
  }
});

test('Q-31: the LaTeX still reads back as the same product (it is parsed again)', () => {
  // The systems workspace reads Step Algebra's LaTeX back with
  // latexToExpression. Two letters must stay two factors, never the symbol bh,
  // and a command must not swallow the next letter (\\pir).
  for (const expression of ['-3 + 2 y', 'b h', '2 x y', 'P r t', '0.5 b h', '3 pi r', '-2x + 4', '2(-y)', '(x + 1)5']) {
    const back = latexToExpression(expressionToLatex(expression));
    assert.ok(expressionsEquivalent(expression, back, 'x'), `${expression} -> ${back}`);
    const symbols = new Set(parse(back).filter((node) => node.isSymbolNode).map((node) => node.name));
    for (const name of symbols) assert.ok(['x', 'y', 'b', 'h', 'P', 'r', 't', 'pi'].includes(name), `${expression}: stray symbol ${name}`);
  }
});

test('display only: the fields code rebuilds a side from are unchanged', () => {
  assert.deepEqual(canonical('(-10) / (-2)'), [{ text: '-10 / -2', sign: -1, magnitudeText: '10 / -2' }]);
  assert.deepEqual(canonical('(-2x) / (-2)'), [{ text: '-2 x / -2', sign: -1, magnitudeText: '2 x / -2' }]);
  assert.deepEqual(canonical('-2x + 4'), [{ text: '-2 x', sign: -1, magnitudeText: '2 x' }, { text: '+ 4', sign: 1, magnitudeText: '4' }]);
  assert.deepEqual(canonical('x - (-10) / (-2)'), [{ text: 'x', sign: 1, magnitudeText: 'x' }, { text: '+ 10 / -2', sign: 1, magnitudeText: '10 / -2' }]);
});
