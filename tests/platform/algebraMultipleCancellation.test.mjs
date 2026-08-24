import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCancellationProgress } from '../../src/algebraCancellationProgress.js';

const pairs = [
  { id: 'P-pair', indices: [0, 3] },
  { id: 't-pair', indices: [2, 4] },
];

test('one stroke may complete several cancellation pairs at once', () => {
  const result = advanceCancellationProgress({ pairs, hitIndices: [0, 2] });
  assert.equal(result.acceptedAny, true);
  assert.deepEqual(new Set(result.completedPairIds), new Set(['P-pair', 't-pair']));
  assert.deepEqual(result.selectedIndices, []);
  assert.equal(result.allPairsComplete, true);
});

test('one hit completes one mathematical cancellation pair', () => {
  const first = advanceCancellationProgress({ pairs, hitIndices: [0] });
  assert.deepEqual(first.completedPairIds, ['P-pair']);
  assert.deepEqual(first.selectedIndices, []);
  assert.equal(first.allPairsComplete, false);

  const second = advanceCancellationProgress({
    pairs,
    completedPairIds: first.completedPairIds,
    hitIndices: [2],
  });
  assert.deepEqual(new Set(second.completedPairIds), new Set(['P-pair', 't-pair']));
  assert.deepEqual(second.selectedIndices, []);
  assert.equal(second.allPairsComplete, true);
});

test('completed pairs stay complete while another pair remains', () => {
  const first = advanceCancellationProgress({ pairs, hitIndices: [0] });
  assert.deepEqual(first.completedPairIds, ['P-pair']);

  const repeated = advanceCancellationProgress({
    pairs,
    completedPairIds: first.completedPairIds,
    hitIndices: [3],
  });
  assert.deepEqual(repeated.completedPairIds, ['P-pair']);
  assert.equal(repeated.allPairsComplete, false);
});

test('unrelated factors do not corrupt cancellation progress', () => {
  const result = advanceCancellationProgress({ pairs, hitIndices: [1, 99] });
  assert.equal(result.acceptedAny, false);
  assert.deepEqual(result.completedPairIds, []);
  assert.deepEqual(result.selectedIndices, []);
});
