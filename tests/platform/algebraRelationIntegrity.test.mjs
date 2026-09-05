import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBalancedOperationToRelation,
  cloneRelationState,
  parseRelationSource,
  relationSolutionSummary,
  relationStateToText,
  validateRelationTransition,
  verifyRelationCandidate,
} from '../../src/algebraRelationFoundation.js';

const balancedContext = (operation, operandExpression, branchIndices = [0]) => ({
  kind: 'balancedOperation',
  operation,
  operandExpression,
  branchIndices,
});

test('the exact -2p solving chain preserves pristine truth through p = -5/3', () => {
  const pristine = parseRelationSource('8 + p = -2*p + 3', 'p');
  const pristineCopy = cloneRelationState(pristine);

  const subtractP = applyBalancedOperationToRelation(
    pristine,
    'subtract',
    'p',
    {
      branchIndex: 0,
      placementByExpression: {
        0: { kind: 'after', termIndex: 1 },
        1: { kind: 'after', termIndex: 0 },
      },
      requireExplicitPlacement: true,
    },
  ).state;

  assert.equal(relationStateToText(pristine), relationStateToText(pristineCopy));
  assert.match(relationStateToText(subtractP).replace(/\s+/g, ''), /-2\*?p-p\+3/);
  assert.equal(
    validateRelationTransition(pristine, subtractP, balancedContext('subtract', 'p')).valid,
    true,
  );

  const combineLikeTerms = parseRelationSource('8 = -3*p + 3', 'p');
  assert.equal(
    validateRelationTransition(subtractP, combineLikeTerms, { kind: 'equivalentRewrite' }).valid,
    true,
  );

  const subtractThree = parseRelationSource('5 = -3*p', 'p');
  assert.equal(
    validateRelationTransition(
      combineLikeTerms,
      subtractThree,
      balancedContext('subtract', '3'),
    ).valid,
    true,
  );

  const divideNegativeThree = parseRelationSource('5 / -3 = p', 'p');
  assert.equal(
    validateRelationTransition(
      subtractThree,
      divideNegativeThree,
      balancedContext('divide', '-3'),
    ).valid,
    true,
  );

  const finalState = parseRelationSource('p = -5/3', 'p');
  assert.equal(
    validateRelationTransition(divideNegativeThree, finalState, { kind: 'equivalentRewrite' }).valid,
    true,
  );

  const finalSummary = relationSolutionSummary(finalState);
  assert.equal(finalSummary.solved, true);
  assert.equal(finalSummary.kind, 'values');
  assert.equal(finalSummary.values.length, 1);
  assert.ok(Math.abs(finalSummary.values[0] - (-5 / 3)) < 1e-10);

  assert.equal(verifyRelationCandidate(pristine, -5 / 3, 'p'), true);
  assert.equal(verifyRelationCandidate(pristine, 5, 'p'), false);
});

test('a sign-corrupted +2p transition is rejected before it can become solver truth', () => {
  const previous = parseRelationSource('8 + p = -2*p + 3', 'p');
  const corrupted = parseRelationSource('8 + p - p = 2*p - p + 3', 'p');

  const validation = validateRelationTransition(
    previous,
    corrupted,
    balancedContext('subtract', 'p'),
  );

  assert.equal(validation.valid, false);
  assert.match(validation.reason, /preserve|equivalent|relation/i);
});

test('absolute-value candidate verification is anchored to the original relation', () => {
  const pristine = parseRelationSource('abs(x - 3) = 5', 'x');

  assert.equal(verifyRelationCandidate(pristine, 8, 'x'), true);
  assert.equal(verifyRelationCandidate(pristine, -2, 'x'), true);
  assert.equal(verifyRelationCandidate(pristine, 2, 'x'), false);
});
