import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/StepByStepAlgebra.jsx', import.meta.url), 'utf8');

test('Step Algebra uses multi-pair cancellation progress instead of one manual selection', () => {
  assert.match(source, /advanceCancellationProgress/);
  assert.match(source, /selectedCancellationIndices/);
  assert.ok(!source.includes('const [manualSelection'));
});

test('compound cancellation tells students they may mark several factors at once', () => {
  assert.match(source, /You may mark several factors at once/);
  assert.match(source, /you do not have to finish one pair before starting another/);
});
