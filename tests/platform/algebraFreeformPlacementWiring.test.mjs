import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('workspace keeps simplification student-entered instead of one-click calculated', () => {
  const src = fs.readFileSync('src/StepByStepAlgebraCore.jsx', 'utf8');

  // The student must enter the simplified expression. MathMaster checks it.
  assert.match(src, /algebra-optional-simplification/);
  assert.match(src, /<MathInput[\s\S]{0,160}value=\{simplificationAnswers\[target\.side\]/);
  assert.match(src, /checkSimplifications/);

  // These V1.3 auto-calculation controls are intentionally gone.
  assert.doesNotMatch(src, /Student-controlled simplification/);
  assert.doesNotMatch(src, />Simplify left</);
  assert.doesNotMatch(src, />Simplify right</);
  assert.doesNotMatch(src, />Simplify both</);
  assert.doesNotMatch(src, /simplifyChosenSides/);
});

test('workspace resolves additive placement around individual terms', () => {
  const src = fs.readFileSync('src/StepByStepAlgebraCore.jsx', 'utf8');
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
