import test from 'node:test';
import assert from 'node:assert/strict';

import { inferRequiredAnswerSymbols } from '../../src/platform/interaction/answerEntryTools.js';

/*
 * JOB P, ITEM 6 — a template key is not the answer.
 *
 * A Digital SAT number box keyed `{{a}}` listed `{`, `}` and `a` as keys the
 * student must have. The placeholder is read as a number; every symbol the
 * key needs around it is still inferred.
 */
test('a whole-placeholder key needs no brace or letter keys', () => {
  assert.deepEqual(inferRequiredAnswerSymbols(['{{a}}']), []);
  assert.deepEqual(inferRequiredAnswerSymbols(['{{ value }}']), []);
});

test('the symbols around a placeholder are still required', () => {
  assert.ok(inferRequiredAnswerSymbols(['{{a}}/{{b}}']).includes('a⁄b'));
  const linear = inferRequiredAnswerSymbols(['y={{m}}x+{{b}}']);
  assert.ok(linear.includes('x') && linear.includes('y') && linear.includes('='));
  assert.ok(!linear.includes('m') && !linear.includes('b') && !linear.includes('{'));
  // A real set around placeholders still needs its braces.
  const set = inferRequiredAnswerSymbols(['{{{a}}, {{b}}}']);
  assert.ok(set.includes('{') && set.includes('}') && set.includes(','));
  assert.ok(!set.includes('a') && !set.includes('b'));
});

test('keys without placeholders infer exactly as before', () => {
  assert.deepEqual(inferRequiredAnswerSymbols(['{1, 2}']).sort(), [',', '{', '}'].sort());
  assert.ok(inferRequiredAnswerSymbols(['\\frac{a}{b}']).includes('a'));
});
