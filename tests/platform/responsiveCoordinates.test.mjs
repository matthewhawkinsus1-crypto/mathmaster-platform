import test from 'node:test';
import assert from 'node:assert/strict';

import { clientPointToGraphCoordinate } from '../../src/utils/responsiveCoordinates.js';

test('responsive coordinate conversion gives the same graph point after SVG scaling', () => {
  const viewBox = { viewBoxWidth: 560, viewBoxHeight: 380, padding: 42, xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const viewX = 42 + 0.75 * (560 - 84);
  const viewY = 42 + 0.25 * (380 - 84);
  const full = clientPointToGraphCoordinate({
    clientX: viewX,
    clientY: viewY,
    rect: { left: 0, top: 0, width: 560, height: 380 },
    ...viewBox,
  });
  const scaled = clientPointToGraphCoordinate({
    clientX: 100 + viewX / 2,
    clientY: 50 + viewY / 2,
    rect: { left: 100, top: 50, width: 280, height: 190 },
    ...viewBox,
  });
  assert.ok(Math.abs(full.x - 5) < 1e-9);
  assert.ok(Math.abs(full.y - 5) < 1e-9);
  assert.ok(Math.abs(scaled.x - full.x) < 1e-9);
  assert.ok(Math.abs(scaled.y - full.y) < 1e-9);
});

test('responsive coordinate conversion rejects taps outside the plotted region', () => {
  const result = clientPointToGraphCoordinate({
    clientX: 5,
    clientY: 5,
    rect: { left: 0, top: 0, width: 280, height: 190 },
    viewBoxWidth: 560,
    viewBoxHeight: 380,
    padding: 42,
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
  });
  assert.equal(result, null);
});

console.log('responsiveCoordinates.test.mjs: all assertions passed');
