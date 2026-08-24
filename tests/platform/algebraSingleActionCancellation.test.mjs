import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { advanceCancellationProgress } from '../../src/algebraCancellationProgress.js';

test('one hit completes a unique cancellation pair instead of requiring both tokens', () => {
  const result = advanceCancellationProgress({
    pairs: [{ id: 'x-pair', indices: [0, 1] }],
    hitIndices: [0],
  });

  assert.equal(result.acceptedAny, true);
  assert.deepEqual(result.completedPairIds, ['x-pair']);
  assert.deepEqual(result.selectedIndices, []);
  assert.equal(result.allPairsComplete, true);
});

test('one hit per pair completes compound cancellation without four separate token hits', () => {
  const pairs = [
    { id: 'P-pair', indices: [0, 3] },
    { id: 't-pair', indices: [2, 4] },
  ];
  const result = advanceCancellationProgress({ pairs, hitIndices: [0, 2] });

  assert.deepEqual(new Set(result.completedPairIds), new Set(['P-pair', 't-pair']));
  assert.equal(result.allPairsComplete, true);
});

test('Step Algebra applies complete cancellation immediately without a second Finish click', () => {
  const source = fs.readFileSync(new URL('../../src/StepByStepAlgebra.jsx', import.meta.url), 'utf8');
  assert.match(source, /apply the cancellation\s*\/\/ immediately|apply the cancellation/);
  assert.ok(!source.includes('Finish {cancellationModel.pairs.length} cancellations'));
  assert.match(source, /MathMaster crosses out the matching term with it/);
});
