import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  assert.equal(verifyRelationCandidate(subtractP, -5 / 3, 'p'), true);
  assert.equal(verifyRelationCandidate(subtractP, 5, 'p'), false);
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

  const finalState = parseRelationSource('-5/3 = p', 'p');
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

test('the live multi-relation solver validates commits before history, state, or persistence', async () => {
  const source = await readFile(new URL('../../src/MultiRelationAlgebraCore.jsx', import.meta.url), 'utf8');

  assert.match(source, /validateRelationTransition/);
  assert.match(source, /kind:\s*'balancedOperation'/);
  assert.match(source, /branchIndices:\s*stagedBranchIndices/);

  const commitStart = source.indexOf('const commitState = async');
  const commitEnd = source.indexOf('const hasOperationOperand', commitStart);
  assert.ok(commitStart >= 0 && commitEnd > commitStart, 'commitState block should be readable');
  const commitBlock = source.slice(commitStart, commitEnd);

  const validationIndex = commitBlock.indexOf('validateRelationTransition');
  const historyIndex = commitBlock.indexOf('setHistory');
  const stateIndex = commitBlock.indexOf('setRelationState');
  const persistenceIndex = commitBlock.indexOf('persistStep');

  assert.ok(validationIndex >= 0, 'commitState must validate the proposed relation state');
  assert.ok(validationIndex < historyIndex, 'validation must happen before history is changed');
  assert.ok(validationIndex < stateIndex, 'validation must happen before visible solver state changes');
  assert.ok(validationIndex < persistenceIndex, 'validation must happen before grading/persistence');
});