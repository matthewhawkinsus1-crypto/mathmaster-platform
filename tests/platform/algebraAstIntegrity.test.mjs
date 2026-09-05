import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAdditiveOperationAtPlacement,
  getLinearForm,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';

const assertLinearEquivalent = (actual, expected, variable = 'x') => {
  assert.deepEqual(getLinearForm(actual, variable), getLinearForm(expected, variable));
};

test('placement preserves a negative coefficient encoded inside a product node', () => {
  const result = applyAdditiveOperationAtPlacement(
    '-2 * p + 3',
    'subtract',
    'p',
    { kind: 'after', termIndex: 0 },
  );

  assertLinearEquivalent(result, '-2 * p - p + 3', 'p');
  assert.equal(getLinearForm(result, 'p').coefficient, -3);
});

test('split additive terms exposes canonical sign and unsigned magnitude', () => {
  const [first, second] = splitAdditiveTerms('-2 * p + 3');

  assert.equal(first.sign, -1);
  assert.equal(first.magnitudeText.replace(/\s+/g, ''), '2*p');
  assert.match(first.text.replace(/\s+/g, ''), /^-2\*p$/);
  assert.equal(second.sign, 1);
  assert.equal(second.magnitudeText, '3');
});

test('placement preserves negative symbols, constants, groups, and later terms', () => {
  const cases = [
    {
      source: '-x + 4',
      operation: 'subtract',
      operand: '2',
      placement: { kind: 'after', termIndex: 0 },
      expected: '-x - 2 + 4',
      variable: 'x',
    },
    {
      source: '-7 + x',
      operation: 'add',
      operand: '2',
      placement: { kind: 'after', termIndex: 0 },
      expected: '-7 + 2 + x',
      variable: 'x',
    },
    {
      source: '-(x + 1) + 6',
      operation: 'subtract',
      operand: 'x',
      placement: { kind: 'after', termIndex: 0 },
      expected: '-(x + 1) - x + 6',
      variable: 'x',
    },
    {
      source: '3 - 2 * x',
      operation: 'add',
      operand: '5',
      placement: { kind: 'after', termIndex: 1 },
      expected: '3 - 2 * x + 5',
      variable: 'x',
    },
  ];

  for (const entry of cases) {
    const result = applyAdditiveOperationAtPlacement(
      entry.source,
      entry.operation,
      entry.operand,
      entry.placement,
    );
    assertLinearEquivalent(result, entry.expected, entry.variable);
  }
});

test('before after under and end placement do not alter the source term signs', () => {
  const placements = [
    { kind: 'before', termIndex: 0 },
    { kind: 'after', termIndex: 0 },
    { kind: 'under', termIndex: 0 },
    { kind: 'end', termIndex: 1 },
  ];

  for (const placement of placements) {
    const result = applyAdditiveOperationAtPlacement(
      '-2 * p + 3',
      'subtract',
      'p',
      placement,
    );
    assertLinearEquivalent(result, '-3 * p + 3', 'p');
  }
});
