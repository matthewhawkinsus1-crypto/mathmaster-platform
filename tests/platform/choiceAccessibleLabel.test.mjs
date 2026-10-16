import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choiceAccessibleLabel } from '../../src/platform/interaction/choiceOptions.js';

// Oct 2026 matrices walkthrough (WU 1): the choice "$20 grocery cards" was
// announced "20 grocery cards" — twenty cards, not the $20 card. The name
// dropped a dollar sign it took for a LaTeX delimiter that never closed.
test('a choice that starts with a price keeps its dollar sign', () => {
  assert.equal(choiceAccessibleLabel('$20 grocery cards'), '$20 grocery cards');
  assert.equal(choiceAccessibleLabel('$4.50 each'), '$4.50 each');
  assert.equal(choiceAccessibleLabel('$25'), '$25');
});

test('a choice wrapped in math delimiters is named by the mathematics inside', () => {
  assert.equal(choiceAccessibleLabel('$\\frac{1}{2}$'), '\\frac{1}{2}');
  assert.equal(choiceAccessibleLabel('$$x = 3$$'), 'x = 3');
  assert.equal(choiceAccessibleLabel('\\(y \\le 4\\)'), 'y \\le 4');
  assert.equal(choiceAccessibleLabel('  3 × 4 '), '3 × 4');
});

test('the multi-answer choices take their names from it', () => {
  const source = readFileSync(new URL('../../src/MultiAnswerGrader.jsx', import.meta.url), 'utf8');
  assert.match(source, /aria-label=\{choiceAccessibleLabel\(raw\)\}/);
  assert.doesNotMatch(source, /const choiceLabel = /);
});
