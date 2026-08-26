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
