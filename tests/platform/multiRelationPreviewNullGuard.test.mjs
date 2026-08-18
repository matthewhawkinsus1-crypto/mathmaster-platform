import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('multi-relation workspace falls back to the pristine relation during null draft hydration', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');

  assert.match(
    src,
    /const\s+\[\s*storedRelationState\s*,\s*setRelationState\s*\]\s*=\s*useState/,
  );
  assert.match(
    src,
    /const\s+relationState\s*=\s*storedRelationState\s*\|\|\s*pristine/,
  );
});

test('all visible variable reads use the guarded relationState alias', () => {
  const src = fs.readFileSync('src/MultiRelationAlgebra.jsx', 'utf8');
  assert.doesNotMatch(src, /storedRelationState\.variable/);
  assert.match(src, /relationState\.variable/);
});
