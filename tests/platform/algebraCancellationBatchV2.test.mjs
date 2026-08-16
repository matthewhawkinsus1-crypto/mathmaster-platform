import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { advanceCancellationProgress } from '../../src/algebraCancellationProgress.js';

test('four factor hits can complete two cancellation pairs in one batch', () => {
  const pairs = [
    { id: 'factor-0', indices: [0, 3] },
    { id: 'factor-1', indices: [2, 4] },
  ];
  const progress = advanceCancellationProgress({ pairs, hitIndices: [0, 2, 3, 4] });
  assert.equal(progress.allPairsComplete, true);
  assert.deepEqual(new Set(progress.completedPairIds), new Set(['factor-0', 'factor-1']));
});

test('compound cancellation waits for explicit batch finish instead of collapsing after first pair', () => {
  const source = fs.readFileSync(new URL('../../src/StepByStepAlgebra.jsx', import.meta.url), 'utf8');
  assert.match(source, /All \$\{pairCount\} matching factor pairs are marked/);
  assert.match(source, /Finish \{cancellationModel\.pairs\.length\} cancellations/);
  assert.match(source, /cancellationModel\.pairs\.length > 1/);
});
