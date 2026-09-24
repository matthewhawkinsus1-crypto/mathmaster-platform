import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN_SIGN_INEQUALITY_MESSAGE,
  applyBalancedOperationToRelation,
  cloneRelationState,
  parseRelationSource,
  relationStateToText,
  validateRelationTransition,
} from '../../src/algebraRelationFoundation.js';

// INEQUALITY CORRECTNESS (Job 2 audit).
//
// Multiplying or dividing by a negative must reverse the symbol, and the
// student must set it. Multiplying or dividing by an expression whose sign is
// unknown (x, 2x - 1) is not a balanced move for an inequality at all: before
// this fix the relation engine accepted `x < 4` → `x·x < 4x` as valid.

const REVERSE = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
const flip = (relations) => relations.map((relation) => REVERSE[relation] || relation);

const attempt = (source, operation, operand, chooseRelations = (relations) => relations) => {
  const before = parseRelationSource(source, 'x');
  const result = applyBalancedOperationToRelation(before, operation, operand);
  const after = cloneRelationState(result.state);
  after.branches[0].relations = chooseRelations(after.branches[0].relations);
  const verdict = validateRelationTransition(before, after, {
    kind: 'balancedOperation', operation, operandExpression: operand, branchIndices: [0],
  });
  return { result, after, valid: verdict.valid };
};

test('dividing or multiplying by a negative number requires the reversed symbol', () => {
  for (const [source, operation, operand] of [
    ['-2x < 6', 'divide', '-2'],
    ['-x/3 >= 4', 'multiply', '-3'],
    ['-(2/3)x > 4', 'multiply', '-3/2'],
    ['-(2/3)x > 4', 'divide', '-\\frac{2}{3}'],
    ['3 - x > 7', 'multiply', '-1'],
  ]) {
    const kept = attempt(source, operation, operand);
    assert.equal(kept.result.requiresInequalityFlip, true, `${source}: ${operation} ${operand} must ask for the flip`);
    assert.equal(kept.valid, false, `${source}: keeping the symbol after ${operation} ${operand} must be refused`);
    assert.equal(attempt(source, operation, operand, flip).valid, true, `${source}: the reversed symbol is the valid step`);
  }
});

test('a positive number keeps the symbol and a reversed symbol is refused', () => {
  assert.equal(attempt('2x < 6', 'divide', '2').valid, true);
  assert.equal(attempt('2x < 6', 'divide', '2', flip).valid, false);
});

test('compound inequalities reverse every symbol', () => {
  const { result } = attempt('-3 < -2x - 1 <= 5', 'divide', '-2');
  assert.deepEqual(result.expectedRelations, ['>', '>=']);
  assert.equal(attempt('-3 < -2x - 1 <= 5', 'divide', '-2', flip).valid, true);
});

test('an inequality cannot be multiplied or divided by an expression of unknown sign', () => {
  for (const [operation, operand] of [['multiply', 'x'], ['divide', 'x'], ['multiply', '2x - 1'], ['divide', '(x+1)']]) {
    assert.throws(
      () => applyBalancedOperationToRelation(parseRelationSource('x < 4', 'x'), operation, operand),
      (error) => error.message === UNKNOWN_SIGN_INEQUALITY_MESSAGE,
      `${operation} by ${operand} must be refused with a reason the student can read`,
    );
  }
  // The validator refuses it independently, whatever symbol is chosen.
  const before = parseRelationSource('x < 4', 'x');
  for (const relation of ['<', '>']) {
    const after = cloneRelationState(before);
    after.branches[0].expressions = ['(x) * (x)', '(x) * (4)'];
    after.branches[0].relations = [relation];
    assert.equal(
      validateRelationTransition(before, after, { kind: 'balancedOperation', operation: 'multiply', operandExpression: 'x', branchIndices: [0] }).valid,
      false,
    );
  }
});

test('equations keep accepting symbolic operands (the rule is for inequalities only)', () => {
  const state = parseRelationSource('x^2 = 4x', 'x');
  const result = applyBalancedOperationToRelation(state, 'add', 'x');
  assert.match(relationStateToText(result.state), /=/);
  assert.doesNotThrow(() => applyBalancedOperationToRelation(parseRelationSource('2x + 3 = 7', 'x'), 'divide', '-2'));
  const { result: equationResult } = attempt('2x + 3 = 7', 'divide', '-2');
  assert.equal(equationResult.requiresInequalityFlip, false, 'an equation never asks for a symbol flip');
});

test('adding or subtracting a variable term is still a valid inequality step', () => {
  assert.equal(attempt('3x + 2 < x + 10', 'subtract', 'x').valid, true);
});
