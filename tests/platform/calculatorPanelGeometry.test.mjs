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
