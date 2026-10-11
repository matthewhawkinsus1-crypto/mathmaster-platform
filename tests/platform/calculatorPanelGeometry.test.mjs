import test from 'node:test';
import assert from 'node:assert/strict';
import { clampCalculatorPosition } from '../../src/components/calculatorPanelGeometry.js';

test('calculator drag position is clamped inside every viewport edge', () => {
  assert.deepEqual(
    clampCalculatorPosition({
      x: -100,
      y: 700,
      panelWidth: 300,
      panelHeight: 400,
      viewportWidth: 1000,
      viewportHeight: 800,
      margin: 8,
    }),
    { x: 8, y: 392 },
  );
});

test('calculator drag position is unchanged while already inside the viewport', () => {
  assert.deepEqual(
    clampCalculatorPosition({
      x: 250,
      y: 120,
      panelWidth: 300,
      panelHeight: 400,
      viewportWidth: 1000,
      viewportHeight: 800,
      margin: 8,
    }),
    { x: 250, y: 120 },
  );
});

/*
 * A DRAGGED CALCULATOR MUST GO QUIET.
 *
 * CalculatorPanel re-clamps its position in an effect that depends on the
 * position. If the re-clamp stores a fresh object every time, the effect re-runs
 * on the next frame forever: the panel re-rendered at 60 Hz for as long as it
 * stayed open after one drag. The settled value must be the SAME object when the
 * clamp moved nothing, so React bails out and the loop ends.
 */
test('re-clamping an in-bounds calculator keeps the same position object', async () => {
  const { settleCalculatorPosition } = await import('../../src/components/calculatorPanelGeometry.js');
  const current = { x: 250, y: 120 };
  const reclamped = clampCalculatorPosition({
    ...current, panelWidth: 300, panelHeight: 400, viewportWidth: 1000, viewportHeight: 800, margin: 8,
  });
  assert.notEqual(reclamped, current, 'the clamp itself always builds a new object');
  assert.equal(settleCalculatorPosition(current, reclamped), current);
});

test('re-clamping a calculator pushed off screen stores the corrected position', async () => {
  const { settleCalculatorPosition } = await import('../../src/components/calculatorPanelGeometry.js');
  const current = { x: 900, y: 120 };
  const reclamped = clampCalculatorPosition({
    ...current, panelWidth: 300, panelHeight: 400, viewportWidth: 1000, viewportHeight: 800, margin: 8,
  });
  assert.deepEqual(settleCalculatorPosition(current, reclamped), { x: 692, y: 120 });
});

test('CalculatorPanel stores only settled positions when it re-clamps', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  // Every re-clamp in an effect or resize handler goes through the settle step.
  const reclamps = source.match(/setPanelPosition\(\(current\)[\s\S]*?\}\)\)?;/g) || [];
  assert.ok(reclamps.length >= 2, 'both re-clamp sites are present');
  for (const site of reclamps) assert.match(site, /settleCalculatorPosition\(current,/);
});

// The keyboard route for moving the calculator (job H, KEYBOARD_SWEEP S7).
test('arrow keys move the calculator by a step, Shift by a bigger one, clamped like a drag', async () => {
  const { nudgeCalculatorPosition, CALCULATOR_KEY_STEP, CALCULATOR_KEY_BIG_STEP } = await import('../../src/components/calculatorPanelGeometry.js');
  const dims = { panelWidth: 300, panelHeight: 400, viewportWidth: 1000, viewportHeight: 800 };
  assert.deepEqual(nudgeCalculatorPosition({ x: 100, y: 100 }, { key: 'ArrowRight' }, dims), { x: 100 + CALCULATOR_KEY_STEP, y: 100 });
  assert.deepEqual(nudgeCalculatorPosition({ x: 100, y: 100 }, { key: 'ArrowUp', shiftKey: true }, dims), { x: 100, y: 8 }, 'Shift+Up: 96px, stopped at the top margin');
  assert.deepEqual(nudgeCalculatorPosition({ x: 100, y: 300 }, { key: 'ArrowUp', shiftKey: true }, dims), { x: 100, y: 300 - CALCULATOR_KEY_BIG_STEP });
  assert.deepEqual(nudgeCalculatorPosition({ x: 100, y: 380 }, { key: 'ArrowDown', shiftKey: true }, dims), { x: 100, y: 392 }, 'never past the bottom margin');
  assert.deepEqual(nudgeCalculatorPosition({ x: 10, y: 100 }, { key: 'ArrowLeft' }, dims), { x: 8, y: 100 }, 'never past the left margin');
  assert.equal(nudgeCalculatorPosition({ x: 10, y: 100 }, { key: 'Enter' }, dims), null, 'other keys are not moves');
});

test('Enter on Move calculator visits the four corners in turn, inside the margins', async () => {
  const { nextCalculatorCorner, calculatorCornerPosition } = await import('../../src/components/calculatorPanelGeometry.js');
  const dims = { panelWidth: 300, panelHeight: 400, viewportWidth: 1000, viewportHeight: 800 };
  const seen = [];
  let corner = 'bottom-right';
  for (let i = 0; i < 4; i += 1) { corner = nextCalculatorCorner(corner); seen.push([corner, calculatorCornerPosition(corner, dims)]); }
  assert.deepEqual(seen, [
    ['bottom-left', { x: 8, y: 392 }],
    ['top-left', { x: 8, y: 8 }],
    ['top-right', { x: 692, y: 8 }],
    ['bottom-right', { x: 692, y: 392 }],
  ]);
});
