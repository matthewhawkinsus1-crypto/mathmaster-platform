import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('workspace exposes explicit simplify controls', () => {
  const src = fs.readFileSync('src/StepByStepAlgebra.jsx', 'utf8');
  assert.match(src, /Student-controlled simplification/);
  assert.match(src, /Simplify left/);
  assert.match(src, /Simplify right/);
  assert.match(src, /Simplify both/);
  assert.match(src, /simplifyChosenSides/);
});

test('workspace resolves additive placement around individual terms', () => {
  const src = fs.readFileSync('src/StepByStepAlgebra.jsx', 'utf8');
  assert.match(src, /resolveAdditivePlacementFromPoint/);
  assert.match(src, /data-term-index/);
  assert.match(src, /kind: 'under'/);
  assert.match(src, /placementBySideOverride/);
});

test('term row supports a below-term operation preview', () => {
  const src = fs.readFileSync('src/AlgebraTermRow.jsx', 'utf8');
  assert.match(src, /underTermPreview/);
  assert.match(src, /algebra-under-term-operation/);
});
