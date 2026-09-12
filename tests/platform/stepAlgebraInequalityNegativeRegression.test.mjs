import test from 'node:test';
import assert from 'node:assert/strict';

import {
  absoluteValueSplitInputModel,
  applyBalancedOperationToBranches,
  buildStudentAuthoredAbsoluteValueSplit,
  cloneRelationState,
  parseRelationSource,
  validateRelationTransition,
} from '../../src/algebraRelationFoundation.js';
import { multiRelationSource } from './helpers/solverSource.mjs';

const wholeBranchPlacement = () => ({
  0: { kind: 'whole-operation' },
  1: { kind: 'whole-operation' },
});

test('absolute-value inequalities require a student-authored split', () => {
  const between = absoluteValueSplitInputModel(
    parseRelationSource('|2*x - 3| < 7', 'x'),
  );
  const outside = absoluteValueSplitInputModel(
    parseRelationSource('|2*x - 3| >= 7', 'x'),
  );

  assert.equal(between.ready, true);
  assert.equal(between.expectedStructure, 'and');
  assert.equal(between.studentAuthorsSplit, true);

  assert.equal(outside.ready, true);
  assert.equal(outside.expectedStructure, 'or');
  assert.equal(outside.studentAuthorsSplit, true);
});

test('student must author the negative bound and both signs for a between absolute-value inequality', () => {
  const state = parseRelationSource('|2*x - 3| < 7', 'x');

  const wrong = buildStudentAuthoredAbsoluteValueSplit(
    state,
    0,
    'and',
    {
      compound: {
        leftValue: '7',
        leftRelation: '<',
        rightRelation: '<',
        rightValue: '7',
      },
    },
  );
  assert.equal(wrong.ready, false);
  assert.equal(wrong.rejectedStudentSplit, true);

  const correct = buildStudentAuthoredAbsoluteValueSplit(
    state,
    0,
    'and',
    {
      compound: {
        leftValue: '-7',
        leftRelation: '<',
        rightRelation: '<',
        rightValue: '7',
      },
    },
  );
  assert.equal(correct.ready, true);
  assert.deepEqual(correct.state.branches[0].relations, ['<', '<']);
});

test('equivalent descending compound split is accepted without forcing presentation direction', () => {
  const state = parseRelationSource('|2*x - 3| <= 7', 'x');
  const result = buildStudentAuthoredAbsoluteValueSplit(
    state,
    0,
    'and',
    {
      compound: {
        leftValue: '7',
        leftRelation: '>=',
        rightRelation: '>=',
        rightValue: '-7',
      },
    },
  );

  assert.equal(result.ready, true);
  assert.deepEqual(result.state.branches[0].relations, ['>=', '>=']);
});

test('student authors both outside branches and the negative-side inequality direction', () => {
  const state = parseRelationSource('|2*x - 3| >= 7', 'x');

  const wrong = buildStudentAuthoredAbsoluteValueSplit(
    state,
    0,
    'or',
    {
      branches: [
        { relation: '>=', value: '-7' },
        { relation: '>=', value: '7' },
      ],
    },
  );
  assert.equal(wrong.ready, false);

  const correct = buildStudentAuthoredAbsoluteValueSplit(
    state,
    0,
    'or',
    {
      branches: [
        { relation: '<=', value: '-7' },
        { relation: '>=', value: '7' },
      ],
    },
  );
  assert.equal(correct.ready, true);
  assert.equal(correct.state.connective, 'OR');
});

test('negative division can be staged across two inequality branches and validated after both student sign flips', () => {
  const state = parseRelationSource('-2*x < -6 OR -4*x >= 8', 'x');
  const result = applyBalancedOperationToBranches(
    state,
    'divide',
    '-2',
    {
      branchIndices: [0, 1],
      placementByBranch: {
        0: wholeBranchPlacement(),
        1: wholeBranchPlacement(),
      },
      requireExplicitPlacement: true,
    },
  );

  assert.equal(result.requiresInequalityFlip, true);
  assert.equal(result.branchResults.length, 2);
  assert.deepEqual(result.branchResults[0].expectedRelations, ['>']);
  assert.deepEqual(result.branchResults[1].expectedRelations, ['<=']);

  const afterStudentFlips = cloneRelationState(result.state);
  result.branchResults.forEach(({ branchIndex, expectedRelations }) => {
    afterStudentFlips.branches[branchIndex].relations = [...expectedRelations];
  });

  const validation = validateRelationTransition(
    state,
    afterStudentFlips,
    {
      kind: 'balancedOperation',
      operation: 'divide',
      operandExpression: '-2',
      branchIndices: [0, 1],
    },
  );
  assert.equal(validation.valid, true);
});

test('dropping a leading negative is never accepted as an equivalent rewrite', () => {
  const before = parseRelationSource('-2*x + 3 < 7', 'x');
  const after = cloneRelationState(before);
  after.branches[0].expressions[0] = '2*x + 3';

  const validation = validateRelationTransition(
    before,
    after,
    { kind: 'equivalentRewrite' },
  );

  assert.equal(validation.valid, false);
});

test('relation UI supports multi-branch negative sign flips and preserves signed-term rendering', () => {
  const src = multiRelationSource();

  assert.doesNotMatch(src, /Commit those branches one at a time/);
  assert.match(src, /branchResults: flipResults\.map/);
  assert.match(src, /Update every highlighted inequality symbol yourself/);
  assert.match(src, /Create both outside inequality branches yourself/);
  assert.match(src, /Create the full between inequality yourself/);

  // Regression guard for the observed visual sign-loss path while a new
  // operation is staged. Signed term LaTeX must be rendered directly.
  assert.match(src, /const rawTermLatex = String\(term\.latex \|\| ''\)\.trim\(\)/);
  assert.match(src, /const visibleTermLatex = termNeedsLeadingPlus/);
  assert.match(src, /: rawTermLatex;/);
});
