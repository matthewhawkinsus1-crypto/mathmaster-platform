import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesAnyAnswer, normalizeMathAnswer } from '../../src/answerUtils.js';

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
