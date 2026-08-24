import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/StepByStepAlgebra.jsx', import.meta.url), 'utf8');

test('Step Algebra uses multi-pair cancellation progress', () => {
  assert.match(source, /advanceCancellationProgress/);
  assert.match(source, /cancelledPairIds/);
  assert.ok(!source.includes('const [manualSelection'));
});

test('compound cancellation tells students one gesture identifies one pair', () => {
  assert.match(source, /one term from each pair/);
  assert.match(source, /one factor from each pair/);
  assert.match(source, /crossed out with it/);
});
