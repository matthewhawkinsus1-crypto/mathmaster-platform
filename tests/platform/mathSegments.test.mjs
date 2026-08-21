import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMathSegment, splitMathSegments, unwrapMathSegment,
} from '../../src/components/common/mathSegments.js';

// Where the mathematics is in a sentence. Both MathText and QuestionPrompt read
// this, so a mistake here is a mistake on every student screen at once.

const mathParts = (text) => splitMathSegments(text).filter(isMathSegment);
const proseParts = (text) => splitMathSegments(text).filter((part) => !isMathSegment(part));

test('inline, display and backslash delimiters are all recognised', () => {
  assert.deepEqual(mathParts('Solve $2x + 1 = 7$ for x.'), ['$2x + 1 = 7$']);
  assert.deepEqual(mathParts('Consider $$y = mx + b$$ here.'), ['$$y = mx + b$$']);
  assert.deepEqual(mathParts('Consider \\[y = mx + b\\] here.'), ['\\[y = mx + b\\]']);
  assert.deepEqual(mathParts('Consider \\(y = mx\\) here.'), ['\\(y = mx\\)']);
});

test('an escaped dollar sign is money inside the mathematics, not a delimiter', () => {
  // The exact seed line that was reaching students as "3 \times 18.25 = \".
  const line = 'Three withdrawals of $\\$18.25$ total $3 \\times 18.25 = \\$54.75$.';
  assert.deepEqual(mathParts(line), ['$\\$18.25$', '$3 \\times 18.25 = \\$54.75$']);
  // Nothing that looks like markup survives into the prose the student reads.
  assert.equal(proseParts(line).join('').includes('\\'), false);
  assert.equal(proseParts(line).join('').includes('$'), false);
});

test('the escaped dollar stays inside the value handed to the renderer', () => {
  assert.equal(unwrapMathSegment('$\\$18.25$').value, '\\$18.25');
  assert.equal(unwrapMathSegment('$\\$18.25$').inline, true);
  assert.equal(unwrapMathSegment('$$y = 2x$$').inline, false);
  assert.equal(unwrapMathSegment('\\[y = 2x\\]').inline, false);
});

test('a lone dollar sign is a currency symbol, not an unclosed formula', () => {
  // A table header the bank really uses. One dollar cannot open mathematics,
  // because guessing would swallow the rest of the sentence.
  assert.deepEqual(mathParts('Plan A total ($)'), []);
  assert.deepEqual(splitMathSegments('Plan A total ($)'), ['Plan A total ($)']);
});

test('mathematics is found after a currency amount rather than swallowed by it', () => {
  const line = 'Solving leaves $6x = 300$, and each unit adds $6 of profit.';
  assert.deepEqual(mathParts(line), ['$6x = 300$']);
});

test('a text with no mathematics is returned whole', () => {
  assert.deepEqual(splitMathSegments('Explain your reasoning.'), ['Explain your reasoning.']);
  assert.deepEqual(splitMathSegments(''), []);
  assert.deepEqual(splitMathSegments(null), []);
});

test('the pattern carries no state between callers', () => {
  // A module-level /g regex shares lastIndex, so the second caller silently gets
  // a different answer than the first. That bug is why this returns a new one.
  const line = 'Solve $x = 1$ and $y = 2$.';
  assert.deepEqual(mathParts(line), ['$x = 1$', '$y = 2$']);
  assert.deepEqual(mathParts(line), ['$x = 1$', '$y = 2$']);
  assert.equal(isMathSegment('$x = 1$'), true);
  assert.equal(isMathSegment('$x = 1$'), true);
  assert.equal(isMathSegment('plain'), false);
});
