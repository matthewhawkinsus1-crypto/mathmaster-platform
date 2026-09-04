import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBalancedOperationToRelation,
  parseRelationSource,
} from '../../src/algebraRelationFoundation.js';
import { multiRelationSource } from './helpers/solverSource.mjs';

test('addition requires placement on both sides before commit', () => {
  const state = parseRelationSource('x + 2 = 7', 'x');

  assert.throws(
    () => applyBalancedOperationToRelation(
      state,
      'subtract',
      '2',
      {
        requireExplicitPlacement: true,
        placementByExpression: {
          0: { kind: 'after', termIndex: 1 },
        },
      },
    ),
    /every expression region/i,
  );

  const result = applyBalancedOperationToRelation(
    state,
    'subtract',
    '2',
    {
      requireExplicitPlacement: true,
      placementByExpression: {
        0: { kind: 'after', termIndex: 1 },
        1: { kind: 'under', termIndex: 0 },
      },
    },
  );

  assert.equal(result.state.branches[0].expressions.length, 2);
});

test('addition requires placement in all three compound-inequality regions', () => {
  const state = parseRelationSource('-8 < 2*x + 1 <= 18', 'x');

  assert.throws(
    () => applyBalancedOperationToRelation(
      state,
      'add',
      '4',
      {
        requireExplicitPlacement: true,
        placementByExpression: {
          0: { kind: 'after', termIndex: 0 },
          1: { kind: 'under', termIndex: 1 },
        },
      },
    ),
    /every expression region/i,
  );
});

test('division still requires a placement on every relation region', () => {
  const state = parseRelationSource('-8 < 2*x <= 18', 'x');

  assert.throws(
    () => applyBalancedOperationToRelation(
      state,
      'divide',
      '2',
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
});

test('add subtract placement uses one contextual menu instead of icons around every term', () => {
  const src = multiRelationSource();

  assert.match(src, /PlacementMiniMenu/);
  assert.match(src, /\['before', 'Before'\]/);
  assert.match(src, /\['under', 'Under'\]/);
  assert.match(src, /\['after', 'After'\]/);
  assert.doesNotMatch(src, /Placement is optional/);
});

test('division shows the dedicated underline scaffold before commit', () => {
  const src = multiRelationSource();

  assert.match(src, /className="staged-division-bar"/);
  assert.match(src, /borderTop: '2px solid #174ea6'/);
  assert.match(src, /Place divisor/);
  assert.match(src, /divisors placed/);
});

test('all balanced operations use the compact commit step instead of automatic Apply', () => {
  const src = multiRelationSource();

  assert.match(src, />\s*Commit step\s*</);
  assert.doesNotMatch(src, />\s*Apply\s*</);
  assert.match(src, /explicitPlacementComplete/);
});

test('complete the square arms student-controlled addition instead of changing the equation', () => {
  const src = multiRelationSource();

  assert.match(src, /Complete-the-square setup selected/);
  assert.match(src, /setOperation\('add'\)/);
  assert.doesNotMatch(src, /<strong[^>]*>Complete square<\/strong>/);
});
