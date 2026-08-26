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
