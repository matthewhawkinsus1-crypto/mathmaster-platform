import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBalancedOperationToRelation,
  buildAbsoluteValueSplit,
  cancelRelationExpressionPair,
  normalizeRelationExpressionInput,
  parseRelationSource,
  relationExpressionsEquivalent,
  resolveRelationNumberLineConfig,
} from '../../src/algebraRelationFoundation.js';

test('fraction endpoints get a reachable eighth-unit number-line scale', () => {
  const config = resolveRelationNumberLineConfig([
    { min: -13 / 8, max: 13 / 8, minClosed: false, maxClosed: true },
  ], {});
  assert.equal(config.step, 0.125);
  assert.ok(config.min <= -13 / 8);
  assert.ok(config.max >= 13 / 8);
  assert.ok(Number.isInteger((-13 / 8) / config.step));
  assert.ok(Number.isInteger((13 / 8) / config.step));
});

test('integer endpoints keep a one-unit snap when possible', () => {
  const config = resolveRelationNumberLineConfig([
    { min: -3, max: 5, minClosed: true, maxClosed: false },
  ], {});
  assert.equal(config.step, 1);
});

test('absolute-value bars typed by the student normalize for rewrite checking', () => {
  assert.match(normalizeRelationExpressionInput('|3*x - 7|'), /^abs\(/);
  assert.equal(
    relationExpressionsEquivalent('|3*x - 7|', 'abs(3*x - 7)', 'x'),
    true,
  );
});

test('visible negative numerator sign cancels with denominator negative one', () => {
  const result = cancelRelationExpressionPair('(-abs(3*x - 7)) / (-1)', 0, 1, 'x');
  assert.equal(result.accepted, true);
  assert.equal(result.kind, 'fraction-sign');
  assert.equal(
    relationExpressionsEquivalent(result.resultExpression, 'abs(3*x - 7)', 'x'),
    true,
  );
});

test('reverse absolute value requires the student to choose OR or AND', () => {
  const equation = parseRelationSource('|x - 2| = 7', 'x');
  const missing = buildAbsoluteValueSplit(equation, 0);
  assert.equal(missing.ready, false);
  assert.equal(missing.needsStructureChoice, true);

  const wrong = buildAbsoluteValueSplit(parseRelationSource('|x - 2| < 7', 'x'), 0, 'or');
  assert.equal(wrong.ready, false);

  const right = buildAbsoluteValueSplit(parseRelationSource('|x - 2| < 7', 'x'), 0, 'and');
  assert.equal(right.ready, true);
  assert.equal(right.state.branches[0].expressions.length, 3);
});

test('negative divide leaves relation symbols for the student to correct', () => {
  const result = applyBalancedOperationToRelation(
    parseRelationSource('-8 < -2*x <= 18', 'x'),
    'divide',
    '-2',
  );
  assert.deepEqual(result.state.branches[0].relations, ['<', '<=']);
  assert.deepEqual(result.expectedRelations, ['>', '>=']);
  assert.equal(result.requiresInequalityFlip, true);
});

test('workspace includes visual drag stroke and click-to-select rewrite regions', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /dragStrokeRef/);
  assert.match(src, /document\.elementFromPoint/);
  assert.match(src, /stroke="#7b61ff"/);
  assert.match(src, /selectRewriteTarget/);
  assert.match(src, /Click any expression below to select it/);
});

test('workspace asks student for relation symbols and absolute split structure', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /pendingRelationFlip/);
  assert.match(src, /chooseRelationSymbol/);
  assert.match(src, /Two branches \(OR\)/);
  assert.match(src, /Three-part compound \(AND\)/);
  assert.doesNotMatch(src, /reversed the inequality direction/);
});

test('pending relation-symbol work is persisted in the question draft', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /pendingRelationFlip \}\);/);
  assert.match(src, /initialPendingRelationFlipFor/);
});

test('drag cancellation carries its own first token instead of stealing a normal click selection', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.match(src, /firstIndexOverride/);
  assert.match(src, /finishCancellation\(current\.key, hitIndex, current\.firstIndex\)/);
});
