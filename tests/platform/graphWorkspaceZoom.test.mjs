import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { zoomedWindow } from '../../src/graphWorkspaceViewport.js';

/*
 * ZOOMING THE PLOTTING WORKSPACE.
 *
 * The measurement this exists for is written up in CoordinatePlane.jsx: on a
 * 390px phone the embedded plane is about 320px, enlarging it wins roughly
 * twelve percent, and twelve percent does not make a lattice point the size of
 * a fingertip any easier to hit. Zooming does. CoordinatePlane has had this;
 * this workspace draws its own SVG and had none of it, so typing an exact
 * coordinate was the only precise path.
 */

const AUTHORED = { xMin: -6, xMax: 8, yMin: -4, yMax: 12 };
const zoom = (from, factor, steps = {}) => zoomedWindow({
  from, authored: AUTHORED, factor, xStep: steps.xStep ?? 1, yStep: steps.yStep ?? 1,
});

test('zooming in narrows the window about its centre', () => {
  const next = zoom(AUTHORED, 1 / 2);
  assert.equal(next.xMax - next.xMin, 7, 'half the span');
  assert.equal(next.yMax - next.yMin, 8);
  // The centre is where the student was looking; it must not slide.
  assert.equal((next.xMin + next.xMax) / 2, (AUTHORED.xMin + AUTHORED.xMax) / 2);
  assert.equal((next.yMin + next.yMax) / 2, (AUTHORED.yMin + AUTHORED.yMax) / 2);
});

test('the view never grows past the window the question authored', () => {
  // Zooming out past the axes would let a student place a point somewhere the
  // question never offered.
  const out = zoom(AUTHORED, 4);
  assert.deepEqual(
    [out.xMin, out.xMax, out.yMin, out.yMax],
    [AUTHORED.xMin, AUTHORED.xMax, AUTHORED.yMin, AUTHORED.yMax],
  );
});

test('a zoomed view is pushed back inside the authored window rather than off its edge', () => {
  const offEdge = zoom({ xMin: 6, xMax: 20, yMin: 8, yMax: 24 }, 1);
  assert.ok(offEdge.xMin >= AUTHORED.xMin && offEdge.xMax <= AUTHORED.xMax, `${offEdge.xMin}..${offEdge.xMax}`);
  assert.ok(offEdge.yMin >= AUTHORED.yMin && offEdge.yMax <= AUTHORED.yMax, `${offEdge.yMin}..${offEdge.yMax}`);
});

test('zooming stops before the axis numbers collide', () => {
  // Two grid steps is the floor: below that there is nothing left to count,
  // which is the only reason a student zoomed in.
  let view = AUTHORED;
  for (let i = 0; i < 20; i += 1) view = zoom(view, 1 / 1.4);
  assert.equal(view.xMax - view.xMin, 2);
  assert.equal(view.yMax - view.yMin, 2);
});

test('a coarser grid keeps a proportionally wider floor', () => {
  let view = { xMin: -60, xMax: 80, yMin: -40, yMax: 120 };
  const authored = view;
  for (let i = 0; i < 30; i += 1) {
    view = zoomedWindow({ from: view, authored, factor: 1 / 1.4, xStep: 10, yStep: 20 });
  }
  assert.equal(view.xMax - view.xMin, 20);
  assert.equal(view.yMax - view.yMin, 40);
});

test('the authored window is what tasks and answers are still expressed in', () => {
  const source = readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8');
  // Screen mapping follows what is on screen...
  assert.match(source, /const toScreenX = \(x\) => PADDING \+ \(\(x - renderWindow\.xMin\)/);
  assert.match(source, /const fromScreenX = \(screenX\) => renderWindow\.xMin/);
  // ...but a placed point is still clamped to the domain the question defined,
  // so zooming can never be used to answer outside it.
  assert.match(source, /Math\.min\(viewWindow\.xMax, Math\.max\(viewWindow\.xMin, x\)\)/);
  assert.match(source, /Math\.min\(viewWindow\.yMax, Math\.max\(viewWindow\.yMin, y\)\)/);
});

test('zoomed content cannot paint over the axis numbers', () => {
  const source = readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8');
  // Without the clip, zooming in pushes the curve and the placed points out
  // over the axis labels and the plane's own border.
  assert.match(source, /<clipPath id=\{clipId\}>/);
  assert.match(source, /<g clipPath=\{`url\(#\$\{clipId\}\)`\}>/);
  // The ticks and their labels are drawn OUTSIDE the clip, because they are the
  // border rather than content.
  const clipOpen = source.indexOf('<g clipPath=');
  assert.ok(source.indexOf('{xTicks.map(') < clipOpen, 'x ticks must not be clipped away');
  assert.ok(source.indexOf('{yTicks.map(') < clipOpen, 'y ticks must not be clipped away');
});

test('zoom is reachable without a pinch', () => {
  // One finger already places a point on this surface and two already draw a
  // stroke, so a pinch would have to be taken from one of them. Buttons are
  // also the only path for a student on a trackpad, a switch, or one hand.
  const source = readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8');
  assert.match(source, /aria-label="Zoom in"/);
  assert.match(source, /aria-label="Zoom out"/);
  assert.match(source, /Reset view/);
  assert.match(source, /minHeight: 44/, 'the zoom controls are finger-sized');
});
