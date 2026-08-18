import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBalancedOperationToRelation,
  cancelRelationExpressionPair,
  parseRelationSource,
  relationCancellationCandidates,
} from '../../src/algebraRelationFoundation.js';
import { splitAdditiveTerms } from '../../src/algebraAstEngine.js';

const compact = (value) => String(value).replace(/\s+/g, '');

test('three-part inequality supports independent additive placement in every expression region', () => {
  const state = parseRelationSource('-7 < 2*x + 1 <= 9', 'x');
  const result = applyBalancedOperationToRelation(
    state,
    'add',
    '7',
    {
      placementByExpression: {
        0: { kind: 'after', termIndex: 0 },
        1: { kind: 'before', termIndex: 0 },
        2: { kind: 'under', termIndex: 0 },
      },
    },
  );

  const [left, middle, right] = result.state.branches[0].expressions;
  assert.deepEqual(splitAdditiveTerms(left).map((term) => compact(term.text)), ['-7', '+7']);
  assert.deepEqual(splitAdditiveTerms(middle).map((term) => compact(term.text)), ['7', '+2*x', '+1']);
  assert.deepEqual(splitAdditiveTerms(right).map((term) => compact(term.text)), ['9', '+7']);
});

test('placed additive operation remains unsimplified until the student rewrites it', () => {
  const state = parseRelationSource('2*x + 1 < 9', 'x');
  const result = applyBalancedOperationToRelation(
    state,
    'subtract',
    '1',
    {
      placementByExpression: {
        0: { kind: 'after', termIndex: 1 },
        1: { kind: 'end', termIndex: 0 },
      },
    },
  );

  assert.deepEqual(
    splitAdditiveTerms(result.state.branches[0].expressions[0]).map((term) => compact(term.text)),
    ['2*x', '+1', '-1'],
  );
  assert.deepEqual(
    splitAdditiveTerms(result.state.branches[0].expressions[1]).map((term) => compact(term.text)),
    ['9', '-1'],
  );
});

test('any visible opposite equivalent additive pair can be cancelled', () => {
  const model = relationCancellationCandidates('4*x - 2*x - 7 + 2*x', 'x');
  assert.equal(model.kind, 'additive');

  const result = cancelRelationExpressionPair('4*x - 2*x - 7 + 2*x', 1, 3, 'x');
  assert.equal(result.accepted, true);
  assert.equal(compact(result.resultExpression), '4*x-7');
});

test('unlike visible terms are rejected as a cancellation pair', () => {
  const result = cancelRelationExpressionPair('4*x - 2*x - 7', 0, 1, 'x');
  assert.equal(result.accepted, false);
});

test('cancellation can occur independently inside one OR branch', () => {
  const state = parseRelationSource('2*x - 2*x + 9 = 9 OR x + 3 = 7', 'x');
  const beforeOtherBranch = state.branches[1].expressions.join('|');

  const cancelled = cancelRelationExpressionPair(state.branches[0].expressions[0], 0, 1, 'x');
  assert.equal(cancelled.accepted, true);

  state.branches[0].expressions[0] = cancelled.resultExpression;
  assert.equal(compact(state.branches[0].expressions[0]), '9');
  assert.equal(state.branches[1].expressions.join('|'), beforeOtherBranch);
});

test('advanced workspace exposes cancellation hints without enabling them by default', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(
    src,
    /const\s+\[\s*cancellationHintsEnabled\s*,\s*setCancellationHintsEnabled\s*\]\s*=\s*useState\(false\)/,
  );
  assert.match(src, /Cancellation hints/);
  assert.match(src, /press and drag/);
});

test('advanced workspace keeps term-specific placement with one compact contextual menu', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');

  assert.match(src, /function PlacementMiniMenu/);
  assert.match(src, /\['before', 'Before'\]/);
  assert.match(src, /\['under', 'Under'\]/);
  assert.match(src, /\['after', 'After'\]/);
  assert.match(src, /Click this term to choose Before, Under, or After/);

  // V4 intentionally removed the always-visible placement icon forest.
  assert.doesNotMatch(src, /Placement is optional/);
});

test('advanced workspace keeps student-authored Rewrite Simplify instead of one-click auto simplification', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /Rewrite \/ Simplify/);
  assert.match(src, /You write the equivalent expression/);
  assert.match(src, /MathMaster only checks it/);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});

test('Other operations remains a stable menu', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /Other operations/);
  assert.match(src, /OTHER_ALGEBRA_OPERATIONS\.map/);
});
