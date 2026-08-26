import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequiredAnswerSymbols } from '../../src/platform/interaction/answerEntryTools.js';

test('ordered pair format guarantees parentheses and comma in entry order', () => {
  assert.deepEqual(resolveRequiredAnswerSymbols({ answerFormat: 'orderedPair' }), ['(', ',', ')']);
});

test('interval, set, and inequality profiles guarantee their structural notation', () => {
  assert.deepEqual(resolveRequiredAnswerSymbols({ toolProfile: 'interval' }), ['(', ')', '[', ']', '∞', '∪']);
  assert.deepEqual(resolveRequiredAnswerSymbols({ toolProfile: 'set' }), ['{', ',', '}']);
  assert.deepEqual(resolveRequiredAnswerSymbols({ toolProfile: 'inequality' }), ['<', '≤', '>', '≥']);
});

test('authored required symbols extend rather than replace the inferred contract', () => {
  assert.deepEqual(
    resolveRequiredAnswerSymbols({ answerFormat: 'orderedPair', requiredSymbols: ['−', 'θ', ','] }),
    ['(', ',', ')', '−', 'θ'],
  );
});
