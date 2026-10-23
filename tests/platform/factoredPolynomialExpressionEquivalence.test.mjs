import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFactoredProduct, sameFactoredPolynomialExpression } from '../../functions/shared/factoredPolynomialExpressionEquivalence.mjs';

test('accepts swapped factor order in factored polynomial expressions', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', '(x-5)(x+2)'), true);
});

test('accepts equivalent term order within a factor', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', '(2+x)(-5+x)'), true);
});

test('accepts a repeated factor written as a square', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+3)^2', '(x+3)(x+3)'), true);
});

test('preserves an outside scalar coefficient', () => {
  assert.equal(sameFactoredPolynomialExpression('2(x+1)(x-4)', '2(x-4)(x+1)'), true);
  assert.equal(sameFactoredPolynomialExpression('2(x+1)(x-4)', '3(x-4)(x+1)'), false);
});

test('rejects expanded form even when algebraically equivalent', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', 'x^2-3x-10'), false);
});

test('rejects a different factorization', () => {
  assert.equal(sameFactoredPolynomialExpression('(x+2)(x-5)', '(x+1)(x-10)'), false);
});

test('rejects equations and non-products', () => {
  assert.equal(sameFactoredPolynomialExpression('y=(x+2)(x-5)', 'y=(x-5)(x+2)'), false);
  assert.equal(sameFactoredPolynomialExpression('x^2-3x-10', 'x^2-3x-10'), false);
  assert.equal(sameFactoredPolynomialExpression('(x+2)', '(x+2)'), false);
});

test('a greatest common monomial factor is read as its number and its letters', () => {
  // 15x + 25x² = 5x(3 + 5x); 12xy + 24xy² − 30x²y⁴ = 6xy(2 + 4y − 5xy³).
  assert.equal(sameFactoredPolynomialExpression('5x(5x+3)', '5x(3+5x)'), true);
  assert.equal(sameFactoredPolynomialExpression('x\\cdot5(5x+3)', '5x(3+5x)'), true);
  assert.equal(sameFactoredPolynomialExpression('6yx(-5xy^3+4y+2)', '6xy(2+4y-5xy^{3})'), true);
  assert.equal(sameFactoredPolynomialExpression('3ab^2(1+5a+9b)', '3ab^{2}(1+5a+9b)'), true);
  assert.equal(sameFactoredPolynomialExpression('2x\\cdot x(x+3)', '2x^{2}(x+3)'), true);
  // A common factor left inside is a less complete answer.
  assert.equal(sameFactoredPolynomialExpression('5(3x+5x^2)', '5x(3+5x)'), false);
  assert.equal(sameFactoredPolynomialExpression('3ab(b+5ab+9b^2)', '3ab^2(1+5a+9b)'), false);
  assert.equal(sameFactoredPolynomialExpression('2xy(6+12y-15xy^3)', '6xy(2+4y-5xy^3)'), false);
});

test('a minus sign may move between factors or to the front', () => {
  // The lesson's own two answers for 15a − 3ab + 4b − 20.
  assert.equal(sameFactoredPolynomialExpression('(3a-4)(5-b)', '(-3a+4)(b-5)'), true);
  assert.equal(sameFactoredPolynomialExpression('-(3a-4)(b-5)', '(-3a+4)(b-5)'), true);
  assert.equal(sameFactoredPolynomialExpression('(2x-3)(-y-5)', '(-2x+3)(y+5)'), true);
  assert.equal(sameFactoredPolynomialExpression('(3-5x)^2', '(5x-3)^2'), true);
  assert.equal(sameFactoredPolynomialExpression('-(n^2+16)(n-4)(n+4)', '(16+n^2)(4-n)(4+n)'), true);
  // …but the overall sign must still agree.
  assert.equal(sameFactoredPolynomialExpression('(3a-4)(b-5)', '(-3a+4)(b-5)'), false);
  assert.equal(sameFactoredPolynomialExpression('(5x+3)^2', '(5x-3)^2'), false);
});

test('"factor completely" refuses a number or a factor left inside', () => {
  assert.equal(sameFactoredPolynomialExpression('(2x+4)(x+5)', '2(x+2)(x+5)'), false);
  assert.equal(sameFactoredPolynomialExpression('(x+2)(2x+10)', '2(x+2)(x+5)'), false);
  assert.equal(sameFactoredPolynomialExpression('(4x+8)(x+4)', '4(x+2)(x+4)'), false);
  assert.equal(sameFactoredPolynomialExpression('6(x^2-16)', '6(x+4)(x-4)'), false);
  assert.equal(sameFactoredPolynomialExpression('(y^2-25)(y^2+25)', '(y^2+25)(y+5)(y-5)'), false);
  assert.equal(sameFactoredPolynomialExpression('(8x^3+y^3)(8x^3-y^3)', '(2x+y)(4x^2-2xy+y^2)(2x-y)(4x^2+2xy+y^2)'), false);
  assert.equal(sameFactoredPolynomialExpression('(y+z)(y^2-yz+z^2)(x^2-3x+2)', '(x-2)(x-1)(y+z)(y^2-yz+z^2)'), false);
});

test('sums and differences of cubes and grouping, in any order', () => {
  assert.equal(sameFactoredPolynomialExpression('3x^{2}(y+2x)(y^{2}-2xy+4x^{2})', '3x^2(2x+y)(4x^2-2xy+y^2)'), true);
  assert.equal(sameFactoredPolynomialExpression('(x-1)(7+2y)', '(2y+7)(x-1)'), true);
  assert.equal(sameFactoredPolynomialExpression('(r+y)(r^2-ry+y^2)(w+3)^2', '(r+y)(r^2-ry+y^2)(w+3)(w+3)'), true);
  assert.equal(sameFactoredPolynomialExpression('(2x+y)(4x^2-2xy+y^2)(2x-y)(4x^2+2xy+y^2)', '(2x-y)(4x^2+2xy+y^2)(2x+y)(4x^2-2xy+y^2)'), true);
});

test('what MathLive and a keyboard write: \\left( \\right), \\cdot, brackets, braces, spaces, U+2212', () => {
  assert.equal(sameFactoredPolynomialExpression('\\left(x+3\\right)\\left(x+4\\right)', '(x+3)(x+4)'), true);
  assert.equal(sameFactoredPolynomialExpression('(x+3)\\cdot(x+4)', '(x+3)(x+4)'), true);
  assert.equal(sameFactoredPolynomialExpression('[x+3][x+4]', '(x+3)(x+4)'), true);
  assert.equal(sameFactoredPolynomialExpression('(x−3)(x+6)', '(x-3)(x+6)'), true);
  assert.equal(sameFactoredPolynomialExpression('(x - 3) (x + 6)', '(x-3)(x+6)'), true);
  assert.equal(sameFactoredPolynomialExpression('\\frac{1}{2}(x+4)', '0.5(x+4)'), true);
});

test('parseFactoredProduct reads the scalar and the sign-normalized factors', () => {
  const product = parseFactoredProduct('(4-3a)(b-5)');
  assert.equal(product.scalar, -1);
  assert.equal(product.factors.length, 2);
  assert.equal(parseFactoredProduct('x^2+7x+12'), null, 'a sum is not a product');
  assert.equal(parseFactoredProduct('(x+1)/(x-1)'), null, 'only a number may divide');
  assert.equal(parseFactoredProduct('\\sqrt{2}(x+1)'), null, 'an unreadable factor is refused, not guessed');
});
