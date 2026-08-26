import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesFieldAnswer } from '../../src/answerUtils.js';

test('equivalentExpression fields accept the MathLive form of the same polynomial', () => {
  assert.equal(matchesFieldAnswer('5x^{2}+6x-1', {
    answer: '5*x^2+6*x-1',
    gradingMode: 'equivalentExpression',
  }), true);
});

test('expression equivalence remains opt-in so form-sensitive fields keep exact grading', () => {
  assert.equal(matchesFieldAnswer('x^2+5x+6', {
    answer: '(x+2)(x+3)',
  }), false);
});
