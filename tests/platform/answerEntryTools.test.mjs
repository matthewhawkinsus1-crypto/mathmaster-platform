import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  inferRequiredAnswerSymbols,
  requiredAnswerToolForSymbol,
  resolveRequiredAnswerSymbols,
  unsupportedRequiredAnswerSymbols,
} from '../../src/platform/interaction/answerEntryTools.js';

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

test('symbolic answers infer the keys students actually need on mobile', () => {
  const symbols = inferRequiredAnswerSymbols(['(x + 5)/2']);
  assert.ok(symbols.includes('('));
  assert.ok(symbols.includes(')'));
  assert.ok(symbols.includes('x'));
  assert.ok(symbols.includes('a⁄b'));

  const inverse = inferRequiredAnswerSymbols(['f^{-1}(x)']);
  assert.ok(inverse.includes('f'));
  assert.ok(inverse.includes('x'));
  assert.ok(inverse.includes('('));
  assert.ok(inverse.includes(')'));
  assert.ok(inverse.includes('xⁿ'));
});

test('interval and set answers infer structural notation without author keyboard plumbing', () => {
  assert.deepEqual(
    inferRequiredAnswerSymbols(['[-4, ∞)']).filter((symbol) => ['[', ']', '(', ')', ',', '∞'].includes(symbol)),
    [')', ',', '[', '∞'],
  );
  const setSymbols = inferRequiredAnswerSymbols(['{1, 2, 3}']);
  assert.ok(setSymbols.includes('{'));
  assert.ok(setSymbols.includes('}'));
  assert.ok(setSymbols.includes(','));
});

test('LaTeX grouping braces are not mistaken for set notation', () => {
  const symbols = inferRequiredAnswerSymbols(['\\frac{x+1}{2}']);
  assert.ok(symbols.includes('a⁄b'));
  assert.ok(symbols.includes('x'));
  assert.equal(symbols.includes('{'), false);
  assert.equal(symbols.includes('}'), false);
});

test('required variable letters resolve to real keypad tools dynamically', () => {
  assert.deepEqual(requiredAnswerToolForSymbol('x'), {
    label: 'x', command: 'x', ariaLabel: 'Insert x',
  });
  assert.deepEqual(requiredAnswerToolForSymbol('F'), {
    label: 'F', command: 'F', ariaLabel: 'Insert capital F',
  });
});

test('unsupported notation is detectable for Preflight', () => {
  assert.deepEqual(unsupportedRequiredAnswerSymbols(['(', 'x', 'θ', ')']), ['θ']);
});


test('inequality keypad inserts complete relation symbols atomically', () => {
  const source = readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(source, /label: '≤', command: '≤'/);
  assert.match(source, /label: '≥', command: '≥'/);
  assert.match(source, /label: '≠', command: '≠'/);
  assert.doesNotMatch(source, /label: '≤', command: '\\\\le'/);
  assert.doesNotMatch(source, /label: '≥', command: '\\\\ge'/);
});
