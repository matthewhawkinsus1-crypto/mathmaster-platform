import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBalancedOperationToRelation,
  parseRelationSource,
  relationExpressionToLatex,
  relationExpressionsEquivalent,
  relationSolutionSummary,
} from '../../src/algebraRelationFoundation.js';
import { multiRelationSource } from './helpers/solverSource.mjs';

const near = (left, right) => Math.abs(Number(left) - Number(right)) < 1e-9;

test('descending compound inequality is recognized as solved without rewriting it', () => {
  const summary = relationSolutionSummary(parseRelationSource('14/3 >= x >= -4/3', 'x'));
  assert.equal(summary.solved, true);
  assert.equal(summary.kind, 'intervals');
  assert.equal(near(summary.intervals[0].min, -4 / 3), true);
  assert.equal(near(summary.intervals[0].max, 14 / 3), true);
  assert.equal(summary.intervals[0].minClosed, true);
  assert.equal(summary.intervals[0].maxClosed, true);
});

test('descending mixed open closed chain is normalized for graphing', () => {
  const summary = relationSolutionSummary(parseRelationSource('6.5/4 > x >= -6.5/4', 'x'));
  assert.equal(summary.solved, true);
  assert.equal(near(summary.intervals[0].min, -6.5 / 4), true);
  assert.equal(near(summary.intervals[0].max, 6.5 / 4), true);
  assert.equal(summary.intervals[0].minClosed, true);
  assert.equal(summary.intervals[0].maxClosed, false);
});

test('negative numeric fraction accepts every common sign position', () => {
  for (const value of ['-4/3', '-\\frac{4}{3}', '\\frac{-4}{3}', '\\frac{4}{-3}']) {
    assert.equal(relationExpressionsEquivalent(value, '-4/3', 'x'), true, value);
  }
});

test('negative numeric fraction displays with the sign beside the fraction', () => {
  assert.equal(relationExpressionToLatex('-4/3'), '-\\frac{4}{3}');
  assert.equal(relationExpressionToLatex('4/-3'), '-\\frac{4}{3}');
});

test('division can require a student placement on all three compound regions', () => {
  const state = parseRelationSource('-8 < 2*x <= 18', 'x');

  assert.throws(
    () => applyBalancedOperationToRelation(
      state,
      'divide',
      '-2',
      {
        requireExplicitPlacement: true,
        placementByExpression: {
          0: { kind: 'whole-operation' },
          1: { kind: 'whole-operation' },
        },
      },
    ),
    /every expression region/i,
  );

  const result = applyBalancedOperationToRelation(
    state,
    'divide',
    '-2',
    {
      requireExplicitPlacement: true,
      placementByExpression: {
        0: { kind: 'whole-operation' },
        1: { kind: 'whole-operation' },
        2: { kind: 'whole-operation' },
      },
    },
  );

  assert.equal(result.requiresInequalityFlip, true);
});

test('UI requires explicit whole-region multiply divide placement', () => {
  const src = multiRelationSource();

  // The current compact-dock UI uses the same placement state as V3, but
  // the visible label changed from "Commit balanced step" to "Commit step"
  // and the old "expression regions marked" wording was intentionally removed.
  assert.match(src, /wholeRelationPlacementMode/);
  assert.match(src, /explicitPlacementComplete/);
  assert.match(src, />\s*Commit step\s*</);
  assert.match(src, /Place divisor/);
  assert.match(src, /Place multiplier/);
  assert.match(src, /divisors placed/);
  assert.match(src, /multipliers placed/);
});

test('Other operations stays a stable menu from the beginning', () => {
  const src = multiRelationSource();
  assert.match(src, /Other operations/);
  assert.match(src, /OTHER_ALGEBRA_OPERATIONS\.map/);
});
