import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCancellationProgress } from '../../src/algebraCancellationProgress.js';

const pairs = [
  { id: 'P-pair', indices: [0, 3] },
  { id: 't-pair', indices: [2, 4] },
];

test('one stroke may complete several cancellation pairs at once', () => {
  const result = advanceCancellationProgress({ pairs, hitIndices: [0, 2, 3, 4] });
  assert.equal(result.acceptedAny, true);
  assert.deepEqual(new Set(result.completedPairIds), new Set(['P-pair', 't-pair']));
  assert.deepEqual(result.selectedIndices, []);
  assert.equal(result.allPairsComplete, true);
});

test('several numerator factors can remain selected while denominator factors are marked later', () => {
  const first = advanceCancellationProgress({ pairs, hitIndices: [0, 2] });
  assert.deepEqual(new Set(first.selectedIndices), new Set([0, 2]));
  assert.equal(first.completedPairIds.length, 0);

  const second = advanceCancellationProgress({
    pairs,
    selectedIndices: first.selectedIndices,
    completedPairIds: first.completedPairIds,
    hitIndices: [3, 4],
  });
  assert.deepEqual(new Set(second.completedPairIds), new Set(['P-pair', 't-pair']));
  assert.deepEqual(second.selectedIndices, []);
  assert.equal(second.allPairsComplete, true);
});

test('completed pairs stay complete while another pair is still being marked', () => {
  const first = advanceCancellationProgress({ pairs, hitIndices: [0, 3] });
  assert.deepEqual(first.completedPairIds, ['P-pair']);

  const second = advanceCancellationProgress({
    pairs,
    completedPairIds: first.completedPairIds,
    selectedIndices: first.selectedIndices,
    hitIndices: [2],
  });
  assert.deepEqual(second.completedPairIds, ['P-pair']);
  assert.deepEqual(second.selectedIndices, [2]);
  assert.equal(second.allPairsComplete, false);
});

test('unrelated factors do not corrupt cancellation progress', () => {
  const result = advanceCancellationProgress({ pairs, hitIndices: [1, 99] });
  assert.equal(result.acceptedAny, false);
  assert.deepEqual(result.completedPairIds, []);
  assert.deepEqual(result.selectedIndices, []);
});
