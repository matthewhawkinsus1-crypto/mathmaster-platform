import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAdditiveOperationAtPlacement,
  expressionsEquivalent,
  getLinearForm,
  isSimplifiedSlopeInterceptExpression,
  isSolvedEquation,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';

const assertLinearEquivalent = (actual, expected, variable = 'x') => {
  assert.deepEqual(getLinearForm(actual, variable), getLinearForm(expected, variable));
};

test('strict slope-intercept completion accepts a finished rational mx+b expression', () => {
  const equation = {
    left: 'y',
    right: '-2 / 3 x + 5',
    variable: 'y',
    objective: {
      kind: 'slopeIntercept',
      variable: 'y',
      requireSimplifiedFinalForm: true,
    },
  };
  assert.equal(isSimplifiedSlopeInterceptExpression(equation.right), true);
  assert.equal(isSolvedEquation(equation), true);
});

test('strict slope-intercept completion still rejects work that needs distribution or quotient simplification', () => {
  assert.equal(isSimplifiedSlopeInterceptExpression('-(2/3)(x + 3) + 7'), false);
  assert.equal(isSimplifiedSlopeInterceptExpression('(-2x + 8) / (-4)'), false);
  assert.equal(isSimplifiedSlopeInterceptExpression('1/2 x - 2'), true);
});

test('simplification equivalence checks the symbols actually present, not only the solve-for variable', () => {
  assert.equal(
    expressionsEquivalent('\\frac{1}{2}x - 2', '(-2x + 8) / (-4)', 'y'),
    true,
  );
  assert.equal(
    expressionsEquivalent('\\frac{1}{2}x + 2', '(-2x + 8) / (-4)', 'y'),
    false,
  );
});

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

test('negative rational products render exactly one visible minus after distribution', () => {
  const terms = splitAdditiveTerms('(-2/3)(x) + (-2/3)(3)');
  assert.equal(terms.length, 2);

  for (const term of terms) {
    assert.equal(term.sign, -1);
    assert.doesNotMatch(term.magnitudeLatex, /-/);
    assert.equal((term.latex.match(/-/g) || []).length, 1);
  }

  assert.match(terms[0].magnitudeLatex, /\\frac\{2\}\{3\}/);
  assert.match(terms[1].magnitudeLatex, /\\frac\{2\}\{3\}/);
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
