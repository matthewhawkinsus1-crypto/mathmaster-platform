import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBalancedOperation,
  expressionsEquivalent,
  simplifyStudentExpression,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';

const compact = (value) => String(value).replace(/\s+/g, '');

test('student may place an added term before the first visible term', () => {
  const move = applyBalancedOperation({
    equationState: {
      left: '4*x - 7 - 2*x',
      right: '2*x + 9 - 2*x',
      variable: 'x',
      objective: { kind: 'isolate', variable: 'x' },
    },
    operation: 'add',
    operand: '7',
    placementBySide: {
      left: { kind: 'before', termIndex: 0 },
      right: { kind: 'under', termIndex: 1 },
    },
  });

  const leftTerms = splitAdditiveTerms(move.unsimplified.left).map((term) => compact(term.text));
  const rightTerms = splitAdditiveTerms(move.unsimplified.right).map((term) => compact(term.text));

  assert.equal(leftTerms[0], '7');
  assert.match(leftTerms[1], /^\+4\*x$/);
  assert.deepEqual(rightTerms, ['2*x', '+9', '+7', '-2*x']);
});

test('placement defaults still append when no location is supplied', () => {
  const move = applyBalancedOperation({
    equationState: {
      left: 'x + 3',
      right: '9',
      variable: 'x',
      objective: { kind: 'isolate', variable: 'x' },
    },
    operation: 'subtract',
    operand: '3',
  });
  const leftTerms = splitAdditiveTerms(move.unsimplified.left).map((term) => compact(term.text));
  assert.deepEqual(leftTerms, ['x', '+3', '-3']);
});

test('student-controlled simplify combines linear like terms without auto-running', () => {
  const left = simplifyStudentExpression('4*x - 7 - 2*x + 7', 'x');
  const right = simplifyStudentExpression('2*x + 9 - 2*x + 7', 'x');
  assert.equal(expressionsEquivalent(left, '2*x', 'x'), true);
  assert.equal(expressionsEquivalent(right, '16', 'x'), true);
  assert.equal(splitAdditiveTerms(left).length, 1);
  assert.equal(splitAdditiveTerms(right).length, 1);
});

test('student simplify does not unexpectedly factor a multi-symbol expression', () => {
  const expression = 'P*r*t + t';
  assert.equal(simplifyStudentExpression(expression, 'x'), expression);
});
