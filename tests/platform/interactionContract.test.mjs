import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferAnswerFormatFromExpected,
  inferRequiredSymbolsFromExpected,
  normalizeResponseFieldInteractionContract,
  validateQuestionInteractionContracts,
} from '../../src/platform/interaction/interactionContract.js';

test('ordered pairs automatically receive a mathematical profile and directly reachable punctuation', () => {
  const field = normalizeResponseFieldInteractionContract({
    id: 'point',
    label: 'Point',
    expected: '(2, -5)',
  });
  assert.equal(field.inputProfile, 'orderedPair');
  assert.equal(field.answerFormat, 'orderedPair');
  assert.ok(field.requiredSymbols.includes('('));
  assert.ok(field.requiredSymbols.includes(')'));
  assert.ok(field.requiredSymbols.includes(','));
});

test('symbolic expressions infer variables, fraction, parentheses, root, and exponent requirements', () => {
  const symbols = inferRequiredSymbolsFromExpected('\\frac{A}{b}(x+\\sqrt{y})^2');
  ['A','b','x','y','a⁄b','(',')','√','xⁿ'].forEach((symbol) => {
    assert.ok(symbols.includes(symbol), `missing inferred symbol ${symbol}: ${symbols.join(', ')}`);
  });
  assert.equal(inferAnswerFormatFromExpected('\\frac{A}{b}(x+1)'), 'expression');
});

test('explicit interval semantics win over ambiguous parenthesized pair text', () => {
  const field = normalizeResponseFieldInteractionContract({
    id: 'interval',
    inputProfile: 'interval',
    answerFormat: 'interval',
    expected: '(1, 2)',
  });
  const result = validateQuestionInteractionContracts({ responseFields: [field] }, { label: 'Interval question' });
  assert.deepEqual(result.errors, []);
});

test('Preflight rejects a plain text control for a mathematical response', () => {
  const result = validateQuestionInteractionContracts({
    responseFields: [{
      id: 'point',
      label: 'Point',
      inputProfile: 'text',
      expected: '(2, -5)',
    }],
  }, { label: 'Question 1' });
  assert.ok(result.errors.some((error) => /inputProfile "text"/.test(error)));
});

test('Preflight rejects required symbols the controlled math keypad cannot provide', () => {
  const field = normalizeResponseFieldInteractionContract({
    id: 'theta',
    inputProfile: 'expression',
    expected: 'x+1',
    requiredSymbols: ['θ'],
  });
  const result = validateQuestionInteractionContracts({ responseFields: [field] }, { label: 'Question 1' });
  assert.ok(result.errors.some((error) => /unsupported answer symbol.*θ/.test(error)));
});

console.log('interactionContract.test.mjs: all assertions passed');
