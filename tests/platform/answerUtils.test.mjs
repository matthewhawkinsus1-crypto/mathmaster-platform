import test from 'node:test';
import assert from 'node:assert/strict';
import { answerCandidatesForField, matchesAnyAnswer, matchesFieldAnswer, normalizeMathAnswer } from '../../src/answerUtils.js';

test('plain-language answers survive MathLive text wrappers', () => {
  assert.equal(normalizeMathAnswer('\\mathrm{distance}'), 'distance');
  assert.equal(normalizeMathAnswer('\\operatorname{distance}'), 'distance');
  assert.equal(normalizeMathAnswer('\\text{time elapsed}'), 'timeelapsed');
  assert.equal(matchesAnyAnswer('\\mathrm{distance}', ['distance', 'distance traveled']), true);
  assert.equal(matchesAnyAnswer('\\text{time elapsed}', ['time', 'time elapsed']), true);
});


test('equivalent inequality orientations are accepted', () => {
  assert.equal(matchesAnyAnswer('-4 <= x', ['x >= -4']), true);
  assert.equal(matchesAnyAnswer('0 <= y', ['y >= 0']), true);
  assert.equal(matchesAnyAnswer('4 >= x >= 0', ['0 <= x <= 4']), true);
  assert.equal(matchesAnyAnswer('0 < x <= 4', ['0 <= x <= 4']), false);
});


test('function notation in range inequalities matches the dependent quantity name', () => {
  assert.equal(matchesAnyAnswer('0 <= V(t) <= 48', ['0 <= V <= 48']), true);
  assert.equal(matchesAnyAnswer('V(t) >= 0', ['V >= 0']), true);
  assert.equal(matchesAnyAnswer('0 <= f(x)', ['f >= 0']), true);
  assert.equal(matchesAnyAnswer('0 <= g(x)', ['f >= 0']), false);
});


test('V2 expected and accepted forms supplement each other instead of replacing the primary key', () => {
  const field = {
    inputProfile: 'expression',
    expected: '(x+2)(x+3)',
    accepted: ['(x+3)(x+2)'],
  };
  assert.deepEqual(answerCandidatesForField(field), ['(x+2)(x+3)', '(x+3)(x+2)']);
  assert.equal(matchesFieldAnswer('(x+2)(x+3)', field), true);
  assert.equal(matchesFieldAnswer('(x+3)(x+2)', field), true);
  assert.equal(matchesFieldAnswer('x^2+5x+6', field), false);
});

test('legacy answer and acceptedAnswers remain compatible with V2 field vocabulary', () => {
  const field = {
    answer: '1/2',
    acceptedAnswers: ['0.5'],
  };
  assert.equal(matchesFieldAnswer('1/2', field), true);
  assert.equal(matchesFieldAnswer('0.5', field), true);
});
