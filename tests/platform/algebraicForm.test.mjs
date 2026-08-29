import test from 'node:test';
import assert from 'node:assert/strict';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import {
  parsePolynomial, polynomialDegree, sameLinearEquation, splitEquationSides,
} from '../../functions/shared/algebraicForm.mjs';

// Grading an equation by its mathematics instead of its spelling.
//
// The reported failure: a student wrote the equation of a line with the slope
// straight off their rise-over-run, unreduced, and was marked wrong because the
// author had not listed that spelling in `accepted`.

test('an unreduced or decimal slope is the same equation', () => {
  assert.equal(sameValue('y=6/4x-6', 'y=1.5x-6'), true, 'unreduced fraction');
  assert.equal(sameValue('y=3/2x-6', 'y=1.5x-6'), true, 'reduced fraction');
  assert.equal(sameValue('y=1.5x-6', 'y=3/2x-6'), true, 'the comparison is symmetric');
  assert.equal(sameValue('y=6/8x+3', 'y=0.75x+3'), true);
  assert.equal(sameValue('y=-6/12x+4', 'y=-0.5x+4'), true);
  assert.equal(sameValue('y=.75x+3', 'y=0.75x+3'), true, 'no leading zero');
});

test('what the MathLive keypad produces is accepted', () => {
  assert.equal(sameValue('y=\\frac{3}{2}x-6', 'y=1.5x-6'), true);
  assert.equal(sameValue('y=\\dfrac{3}{2}x-6', 'y=1.5x-6'), true);
  assert.equal(sameValue('y=-\\frac{1}{2}x+4', 'y=-0.5x+4'), true);
  assert.equal(sameValue('y=\\left(\\frac{3}{2}\\right)x-6', 'y=1.5x-6'), true);
  assert.equal(sameValue('y=1.5\\cdot x-6', 'y=1.5x-6'), true);
});

test('ordinary rewriting of the same side is accepted', () => {
  assert.equal(sameValue('y = -2x + 5', 'y=5-2x'), true, 'terms commute');
  assert.equal(sameValue('y=3x', 'y=3x+0'), true, 'an explicit zero constant');
  assert.equal(sameValue('y=-x-3', 'y=-1x-3'), true, 'an implied coefficient of one');
  assert.equal(sameValue('x = 3', 'x=3'), true, 'spacing');
});

// The other half, and the more important one. A grader that accepts everything
// is not a grader.
test('a different FORM of the same line is still wrong', () => {
  // Same graph. A question that says "in slope-intercept form" is entitled to
  // refuse point-slope, and this comparison must not overrule the author.
  assert.equal(sameValue('y-5=-3(x-2)', 'y=-3x+11'), false, 'point-slope');
  assert.equal(sameValue('3x+y=11', 'y=-3x+11'), false, 'standard form');
  assert.equal(sameValue('2y=3x-12', 'y=1.5x-6'), false, 'scaled through');
  assert.equal(sameValue('2x=y', 'y=2x'), false, 'sides swapped');
});

test('a wrong number is still wrong', () => {
  assert.equal(sameValue('y=1.6x-6', 'y=1.5x-6'), false, 'wrong slope');
  assert.equal(sameValue('y=1.5x+6', 'y=1.5x-6'), false, 'wrong sign on the intercept');
  assert.equal(sameValue('y=1.5x', 'y=1.5x-6'), false, 'missing intercept');
  assert.equal(sameValue('y=4/3x-6', 'y=1.5x-6'), false, 'a fraction that is not equal');
  assert.equal(sameValue('x=3', 'y=3'), false, 'the wrong variable');
});

test('polynomial form is preserved above degree one', () => {
  // A different authored FORM is still rejected. The new expanded-polynomial
  // comparator only removes machine-vs-human spelling differences inside the
  // SAME expanded form.
  assert.equal(sameValue('(x+2)(x+3)', 'x^2+5x+6'), false, 'factored vs expanded');
  assert.equal(sameValue('y=(x-3)^2+1', 'y=x^2-6x+10'), false, 'vertex vs standard form');

  // These are merely two spellings of the same already-expanded monomial.
  assert.equal(sameValue('y=x^2', 'y=x*x'), true, 'same expanded quadratic term');
});

test('non-equations are not dragged into equation comparison', () => {
  assert.equal(sameValue('x >= 4', 'x >= 5'), false);
  assert.equal(sameValue('[-3, 5)', '(-3, 5]'), false);
  assert.equal(sameValue('increasing', 'decreasing'), false);
  assert.equal(sameValue('x=2,y=3', 'x=2,y=4'), false, 'two equations in one string');
  assert.equal(splitEquationSides('x=2=3'), null, 'more than one equals sign');
  assert.equal(splitEquationSides('y+2'), null, 'no equals sign');
  assert.equal(splitEquationSides('=4'), null, 'an empty side');
});

test('unreadable input is refused rather than guessed at', () => {
  assert.equal(parsePolynomial('y = '), null);
  assert.equal(parsePolynomial('3 +'), null, 'a dangling operator');
  assert.equal(parsePolynomial('(x + 1'), null, 'an unclosed bracket');
  assert.equal(parsePolynomial('\\sqrt{x}'), null, 'a command this parser does not model');
  assert.equal(parsePolynomial('3/0'), null, 'division by zero');
  assert.equal(parsePolynomial('3/x'), null, 'division by a variable is not a polynomial');
  assert.equal(sameLinearEquation('y=\\sqrt{x}', 'y=x'), false);
});

test('division and implicit multiplication read left to right', () => {
  // `3/2x` is `(3/2)·x`, the ordinary reading and the one the bank assumes. A
  // student who means 3/(2x) writes the brackets, and that is not linear.
  assert.equal(polynomialDegree(parsePolynomial('3/2x')), 1);
  assert.equal(parsePolynomial('3/2x').get('x'), 1.5);
  assert.equal(parsePolynomial('x/2').get('x'), 0.5);
  assert.equal(parsePolynomial('3/(2x)'), null);
  assert.equal(parsePolynomial('2(x+1)').get('x'), 2);
  assert.equal(parsePolynomial('2(x+1)').get(''), 2);
});

test('degree is measured across all the variables in a term', () => {
  assert.equal(polynomialDegree(parsePolynomial('7')), 0);
  assert.equal(polynomialDegree(parsePolynomial('3x+2')), 1);
  assert.equal(polynomialDegree(parsePolynomial('xy')), 2, 'a product of two variables');
  assert.equal(polynomialDegree(parsePolynomial('x^3')), 3);
  assert.equal(sameValue('z=xy', 'z=yx'), true, 'same expanded degree-two monomial');
});
