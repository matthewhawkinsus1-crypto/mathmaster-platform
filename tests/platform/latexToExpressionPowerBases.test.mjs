/*
 * TL32 (finding C2-57): "r^2 h" does not survive the LaTeX round trip.
 *
 * MathJS's toTex writes the BASE of every power in braces: x² is `{ x}^{2}`,
 * 2^x is `{2}^{ x}`, (x + 1)² is `{\left( x+1\right)}^{2}`. Step Algebra draws
 * that text, and the Systems Workspace (and every other reader of a written
 * relation) reads it back through latexToExpression. The exponent's braces
 * were turned into parentheses but the base's were left, and to mathjs a `{`
 * opens an object literal, so r² h came back as `{ r}^(2) h` — unparseable.
 * A fraction with a power in it fared worse: its braces stopped `\frac` being
 * read at all, so V = π r² h solved for h came back with a raw `\frac{V}{…}`.
 *
 * Every case below goes through the real serialiser (expressionToLatex), never
 * a hand-written stand-in, and is compared with the original by VALUE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';
import { expressionToLatex, expressionsEquivalent } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { latexToExpression } from '../../functions/shared/algebra/latexToExpression.mjs';
import { normalizeStudentExpressionForDisplay, normalizeSubstitutionBoundaryExpression } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';

// What the formulas are worth at a few points: independent of the engine's own
// equivalence test, which is also run below. x stays positive (x^(1/2), sqrt(x)).
const POINTS = [
  { x: 3, y: 5, z: 2, r: 7, h: 11, a: 2, b: 3, c: 5, t: 2, P: 100, V: 50 },
  { x: 2, y: 4, z: 3, r: 1.5, h: 2, a: -3, b: 2, c: 7, t: 3, P: 20, V: 9 },
  { x: 0.5, y: -1, z: 1, r: 4, h: 0.5, a: 5, b: -2, c: 1, t: 1, P: 8, V: 3 },
];
const valueAt = (text, scope) => Number(parse(text).evaluate({ ...scope }));
const sameValue = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// Written the way a student writes them: powers of a symbol, of a sum, of a
// fraction, as an exponent, in a product, in a fraction, under a root.
const FORMULAS = [
  'r^2 h', 'pi r^2 h', '1/3 pi r^2 h', '4/3 pi r^3', '3 x^2 y', 'x^2 y^3', 'x y^2 z',
  '(x + 1)^2 y', '(a + b)^2', '(1/2)^x', '2^x', 'e^x y', 'x^-1 y', '-x^2 y',
  'sqrt(x)^2', '(x^2)^3', 'x^y^z', 'x^(1/2) y', '100 (1 + r/4)^(4 t)', 'a b^2 c',
  'V/(pi r^2)', 'x^2/3', '3/x^2', '(x^2 + 1)/(x - 1)', '(x/2)^2 y',
];

test('the serialiser really does write the base of a power in braces (the precondition of this file)', () => {
  assert.match(expressionToLatex('r^2 h'), /\{\s*r\}\^\{2\}/);
  // Not vacuous: every formula below has a braced base to read back.
  const without = FORMULAS.filter((formula) => !/\}\^/.test(expressionToLatex(formula)));
  assert.deepEqual(without, [], 'every formula goes through a braced power base');
  assert.ok(FORMULAS.length >= 25);
});

test('TL32: a power reads back as the same value, with no brace left, for every formula', () => {
  for (const formula of FORMULAS) {
    const latex = expressionToLatex(formula);
    const back = latexToExpression(latex);
    assert.doesNotMatch(back, /[{}\\]/, `${formula}: ${JSON.stringify(latex)} -> ${JSON.stringify(back)} still has TeX in it`);
    assert.doesNotThrow(() => parse(back), `${formula}: ${JSON.stringify(back)} must parse`);
    for (const scope of POINTS) {
      assert.ok(sameValue(valueAt(formula, scope), valueAt(back, scope)), `${formula} -> ${back} at ${JSON.stringify(scope)}`);
    }
    assert.equal(expressionsEquivalent(formula, back, 'x'), true, `${formula} -> ${back}`);
  }
});

test('TL32: the finding\'s own example, and a wrong power still reads as a different value', () => {
  assert.equal(latexToExpression('{ r}^{2} h'), 'r^(2) h');
  assert.equal(latexToExpression('{ r}^{2}~\\mathrm{h}'), 'r^(2) \\mathrm{h}', 'only the base\'s braces: a unit-named symbol is not this finding');
  const back = latexToExpression(expressionToLatex('r^2 h'));
  assert.equal(valueAt(back, POINTS[0]), 7 * 7 * 11);
  assert.notEqual(valueAt(back, POINTS[0]), valueAt(latexToExpression(expressionToLatex('r^3 h')), POINTS[0]), 'r^2 h is not r^3 h');
  assert.equal(expressionsEquivalent('r^3 h', back, 'x'), false);
});

test('TL32: braces that are not the base of a power are left to their own rules', () => {
  // A command's own braces, a subscript's, a set's \{ \}, and braces nothing follows.
  assert.equal(latexToExpression('\\{1, 2\\}'), '\\{1, 2\\}');
  assert.equal(latexToExpression('{1, 2, 3}'), '{1, 2, 3}');
  assert.equal(latexToExpression('\\mathrm{h}^{2}'), '\\mathrm{h}^(2)');
  assert.equal(latexToExpression('x_{12}^{2}'), 'x_12^(2)');
  assert.equal(latexToExpression('x_{a+b}^{2}'), 'x_a+b^(2)');
  assert.equal(latexToExpression('\\sqrt[3]{x}^{2}'), 'nthRoot(x, 3)^(2)');
  // A fraction's second argument sits right after the first one's brace: it is
  // the fraction's, so it must not be unwrapped before the fraction is read.
  assert.equal(latexToExpression('\\frac{{a}^{2}}{bc}^{2}'), '((a^(2))/(bc))^(2)');
  assert.equal(latexToExpression('\\frac{a}{bc}^{2}'), '((a)/(bc))^(2)');
  // Unwrapping must never fuse digits that were two things: 2{3}^2 is not 23^2.
  assert.doesNotMatch(latexToExpression('2{3}^{2}'), /23/);
});

test('TL32: a bracketed or longer base keeps one pair of brackets, a bare symbol or number none', () => {
  assert.equal(latexToExpression('{ x}^{2}'), 'x^(2)');
  assert.equal(latexToExpression('{2.5}^{3}'), '2.5^(3)');
  assert.equal(latexToExpression('{\\left(a+b\\right)}^{2}'), '(a+b)^(2)');
  assert.equal(latexToExpression('{a+b}^{2}'), '(a+b)^(2)');
  assert.equal(latexToExpression('{-2}^{2}'), '(-2)^(2)', 'a signed number is the whole base: (-2)^2, not -2^2');
  assert.equal(valueAt(latexToExpression('{-2}^{2}'), {}), 4);
  assert.equal(latexToExpression('{ x}^{{ y}^{ z}}'), 'x^(y^( z))', 'a tower reads from the inside');
});

test('TL32: the Systems Workspace boundary opens a formula with a power, where it used to throw', () => {
  const latex = expressionToLatex('pi r^2 h');
  const token = normalizeSubstitutionBoundaryExpression(latex);
  assert.ok(sameValue(valueAt(token, POINTS[0]), Math.PI * 49 * 11), token);
  // A fraction with a power in it (V = π r² h solved for h) used to keep a raw \frac.
  const isolated = normalizeSubstitutionBoundaryExpression(expressionToLatex('V/(pi r^2)'));
  assert.doesNotMatch(isolated, /\\frac/);
  assert.ok(sameValue(valueAt(isolated, POINTS[0]), 50 / (Math.PI * 49)), isolated);
  // The same text as the work trail shows it.
  const shown = normalizeStudentExpressionForDisplay(latex);
  assert.doesNotMatch(shown, /[{}\\]/);
  assert.ok(sameValue(valueAt(shown, POINTS[0]), Math.PI * 49 * 11), shown);
});
