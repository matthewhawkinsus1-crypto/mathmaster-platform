import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { advanceCancellationProgress } from '../../src/algebraCancellationProgress.js';

test('one hit per pair can complete two cancellation pairs in one batch', () => {
  const pairs = [
    { id: 'factor-0', indices: [0, 3] },
    { id: 'factor-1', indices: [2, 4] },
  ];
  const progress = advanceCancellationProgress({ pairs, hitIndices: [0, 2] });
  assert.equal(progress.allPairsComplete, true);
  assert.deepEqual(new Set(progress.completedPairIds), new Set(['factor-0', 'factor-1']));
});

test('compound cancellation applies as soon as every pair is identified', () => {
  const source = fs.readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8');
  assert.match(source, /Once every visible pair has been identified/);
  assert.ok(!source.includes('Finish {cancellationModel.pairs.length} cancellations'));
  assert.match(source, /one factor from each pair/);
});
