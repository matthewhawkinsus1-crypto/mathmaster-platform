import test from 'node:test';
import assert from 'node:assert/strict';

import { sameLinearInequality } from '../../functions/shared/linearInequalityEquivalence.mjs';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';

test('accepts reordered terms in the same two-variable half-plane', () => {
  assert.equal(sameLinearInequality('2x+3y<=120', '3y+2x<=120'), true);
});

test('accepts positive scalar multiples', () => {
  assert.equal(sameLinearInequality('2x+3y<=120', '4x+6y<=240'), true);
});

test('accepts reversed sides when the operator reverses too', () => {
  assert.equal(sameLinearInequality('2x+3y<=120', '120>=2x+3y'), true);
});

test('accepts equivalent slope-intercept and standard forms', () => {
  assert.equal(sameLinearInequality('y<=2x+5', '-2x+y<=5'), true);
});

test('preserves strict versus inclusive boundaries', () => {
  assert.equal(sameLinearInequality('y<2x+5', 'y<=2x+5'), false);
});

test('rejects the opposite half-plane', () => {
  assert.equal(sameLinearInequality('y<=2x+5', 'y>=2x+5'), false);
});

test('rejects different parallel boundaries', () => {
  assert.equal(sameLinearInequality('y<=2x+5', 'y<=2x+6'), false);
});

test('rejects nonlinear and chained relations rather than guessing', () => {
  assert.equal(sameLinearInequality('y<=x^2+5', 'y<=x^2+5'), false);
  assert.equal(sameLinearInequality('0<x<5', '0<x<5'), false);
});


test('secure generic answer equivalence accepts equivalent two-variable inequalities', () => {
  assert.equal(sameValue('2x+3y<=120', '3y+2x<=120'), true);
  assert.equal(sameValue('y>=-2x+5', '2x+y>=5'), true);
  assert.equal(sameValue('y<3x-4', '3x-y>4'), true);
  assert.equal(sameValue('y<=3x-4', 'y<3x-4'), false);
});
