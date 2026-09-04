import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildCancellationModel } from '../../src/algebraCancellationModel.js';
import { stepAlgebraSource } from './helpers/solverSource.mjs';

test('already-visible 2x - 2x can be cancelled without pending move metadata', () => {
  const model = buildCancellationModel('2*x - 2*x + 9', null, 'x', []);
  assert.ok(model);
  assert.equal(model.kind, 'additive');
  assert.deepEqual(model.pairs.map((pair) => pair.indices), [[0, 1]]);
  assert.equal(String(model.resultExpression).replace(/\s+/g, ''), '9');
});

test('unlike terms are not falsely cancellable', () => {
  const model = buildCancellationModel('4*x - 2*x - 7', null, 'x', []);
  assert.equal(model, null);
});

test('opposite numeric terms are valid visible cancellation', () => {
  const model = buildCancellationModel('4*x - 7 + 7', null, 'x', []);
  assert.ok(model);
  assert.equal(model.kind, 'additive');
  assert.deepEqual(model.pairs.map((pair) => pair.indices), [[1, 2]]);
  assert.equal(String(model.resultExpression).replace(/\s+/g, ''), '4*x');
});

test('workspace wires standalone cancellation instead of requiring pendingMove', () => {
  const src = stepAlgebraSource();
  assert.match(src, /commitStandaloneCancellation/);
  assert.match(src, /visibleCancellationModel/);
  assert.match(src, /const cancellationActive = Boolean\(cancellationModel\?\.pairs\?\.length\)/);
  assert.match(src, /if \(cancellationModel\) \{/);
  assert.match(src, /if \(pendingMove\) await strikeSide\(side\);/);
  assert.match(src, /else await commitStandaloneCancellation\(side, model\);/);
});

test('hotfix does not reintroduce one-click automatic simplification controls', () => {
  const src = stepAlgebraSource();
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
});
