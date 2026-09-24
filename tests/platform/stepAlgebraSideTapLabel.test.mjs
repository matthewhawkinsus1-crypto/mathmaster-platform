import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Live QA: after the -5 tile was placed on the left, that side kept role=button
// and announced "Place undefined 5 on both sides on the left side".

test('an equation side is a named tap target only while an operation is armed', () => {
  const source = readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8');
  const box = source.slice(source.indexOf('const sideTapReady'), source.indexOf('onClick={(event) => tapPlacementOnSide(side, event)}'));
  assert.match(box, /const sideTapReady = tapPlacementArmed && Boolean\(armedTile\?\.operation\);/);
  assert.match(box, /role=\{sideTapReady \? 'button' : undefined\}/);
  assert.match(box, /tabIndex=\{sideTapReady \? 0 : undefined\}/);
  assert.match(box, /aria-label=\{sideTapReady \? `Place \$\{describeOperation\(armedTile\.operation, operand\)\}/);
  assert.doesNotMatch(box, /armedTile\?\.operation, operand/, 'never describe an operation that may be missing');
});
