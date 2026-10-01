import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { clientPointToGraphCoordinate, clientPointToViewBox, viewBoxRenderScale } from '../../src/utils/responsiveCoordinates.js';

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

// Platform quirks audit: the app-wide 70dvh cap on .mathmaster-responsive-canvas
// shortens a plane's box, so preserveAspectRatio="xMidYMid meet" draws the
// graph centred in a wider box. A click on the DRAWN (6, 10) of the embedded
// plotting plane at 1366x768 landed on (5.5, 10).
test('a letterboxed plane maps a click to the point drawn under it', () => {
  const viewBox = { viewBoxWidth: 760, viewBoxHeight: 540, padding: 40, xMin: -6, xMax: 8, yMin: -4, yMax: 12 };
  // The measured Chromebook box: 808x528 for a 760x540 viewBox.
  const rect = { left: 100, top: 200, width: 808, height: 528 };
  const scale = Math.min(808 / 760, 528 / 540);
  const offsetX = (808 - 760 * scale) / 2;
  const drawn = (x, y) => ({
    clientX: rect.left + offsetX + (40 + ((x + 6) / 14) * 680) * scale,
    clientY: rect.top + (540 - 40 - ((y + 4) / 16) * 460) * scale,
  });
  for (const [x, y] of [[6, 10], [-5, -3], [7.5, 11.5], [-6, 2]]) {
    const point = clientPointToGraphCoordinate({ ...drawn(x, y), rect, ...viewBox });
    assert.ok(Math.abs(point.x - x) < 1e-9 && Math.abs(point.y - y) < 1e-9, `(${x}, ${y}) -> (${point.x}, ${point.y})`);
  }
  // The empty band beside the drawing is outside the plot, not its edge.
  assert.equal(clientPointToGraphCoordinate({ clientX: rect.left + 2, clientY: rect.top + 264, rect, ...viewBox }), null);
  // A phone-landscape Work View box, letterboxed the other way round.
  const tall = { left: 0, top: 0, width: 390, height: 218 };
  const s2 = Math.min(390 / 760, 218 / 540);
  const ox = (390 - 760 * s2) / 2;
  const at = clientPointToViewBox({ clientX: ox + 380 * s2, clientY: 270 * s2, rect: tall, viewBoxWidth: 760, viewBoxHeight: 540 });
  assert.ok(Math.abs(at.x - 380) < 1e-9 && Math.abs(at.y - 270) < 1e-9);
  assert.equal(viewBoxRenderScale({ rect: tall, viewBoxWidth: 760, viewBoxHeight: 540 }), s2);
});

test('the plotting workspace maps clicks through the shared letterbox-aware helper', () => {
  const source = readFileSync(new URL('../../src/InteractiveGraphWorkspace.jsx', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('const eventToScreenPoint'), source.indexOf('const eventToGraphPoint'));
  assert.match(handler, /clientPointToViewBox\(\{ clientX, clientY, rect: svg\.getBoundingClientRect\(\), viewBoxWidth: WIDTH, viewBoxHeight: HEIGHT \}\)/);
  assert.doesNotMatch(handler, /WIDTH \/ rectangle\.width/);
});

console.log('responsiveCoordinates.test.mjs: all assertions passed');
