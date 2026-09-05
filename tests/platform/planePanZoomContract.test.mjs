import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plane = readFileSync(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8');

/* ---------- the view is a window, not a new domain ---------- */

test('a plotted point is clamped to the authored domain, never to the view', () => {
  // Otherwise zooming out past the axes becomes a way to answer outside them,
  // and a student could submit a point the question never allowed.
  assert.match(plane, /return \[clamp\(x, domainXMin, domainXMax\), clamp\(y, domainYMin, domainYMax\)\];/);
  assert.doesNotMatch(plane, /return \[clamp\(x, xMin, xMax\), clamp\(y, yMin, yMax\)\];/);
});

test('the view shadows the bounds so every drawing path follows it', () => {
  // Ticks, gridlines, functions and the coordinate mapping all read xMin..yMax.
  // Deriving those from the view is what makes one small change reach all of
  // them; a second set of names would have left half the plane behind.
  assert.match(plane, /const xMin = view \? view\.xMin : domainXMin;/);
  assert.match(plane, /const yMax = view \? view\.yMax : domainYMax;/);
  assert.match(plane, /xMin: domainXMin = -10, xMax: domainXMax = 10/);
});

test('a new question resets the view', () => {
  // Carrying a zoom across questions leaves a student staring at a corner of a
  // plane they never moved.
  assert.match(plane, /useEffect\(\(\) => \{ setView\(null\); \}, \[domainXMin, domainXMax, domainYMin, domainYMax\]\);/);
});

/* ---------- the gesture budget ---------- */

test('two fingers zoom, and cancel the placement they interrupted', () => {
  // One finger still plots. Without the cancel, starting a pinch would leave a
  // point behind wherever the first finger happened to land.
  assert.match(plane, /if \(zoomable && gesturePointers\.current\.size === 2\) \{[\s\S]{0,200}setGestureActive\(false\);[\s\S]{0,120}setPointerPreview\(null\);/);
  assert.match(plane, /pinchRef\.current = \{ distance: pointerDistance\(\), midpoint: pointerMidpoint\(\) \}/);
});

test('zoom keeps the point under the finger under the finger', () => {
  // Zooming about the centre slides the plane away from whatever the student
  // was looking at, which is the opposite of what they asked for.
  assert.match(plane, /const applyZoom = \(factor, focus = null\) =>/);
  assert.match(plane, /const ratioX = \(fx - from\.xMin\) \/ Math\.max\(1e-9, from\.xMax - from\.xMin\);/);
});

test('zoom is bounded at both ends', () => {
  assert.match(plane, /const MIN_SPAN_STEPS = 4;/);
  assert.match(plane, /const MAX_DOMAIN_MULTIPLE = 3;/);
  assert.match(plane, /Math\.max\(span, minorStep \* MIN_SPAN_STEPS\)/);
});

/* ---------- everything a pinch does, a button does ---------- */

test('zoom is reachable without a two-finger gesture', () => {
  // A trackpad, a switch, one hand on a bus. The buttons are the primary path,
  // not a fallback.
  assert.match(plane, /aria-label="Zoom in"/);
  assert.match(plane, /aria-label="Zoom out"/);
  assert.match(plane, /Reset view/);
  assert.match(plane, /role="group"\s*\n\s*aria-label="Zoom the coordinate plane"/);
  // At the touch minimum: a zoom control too small to hit makes aiming worse.
  assert.match(plane, /const ZOOM_BUTTON = \{\s*\n\s*minWidth: 44,\s*\n\s*minHeight: 44,/);
});

test('the current window is announced, not only drawn', () => {
  // A student who has panned needs to know where they are without counting
  // gridlines, and a screen reader has nothing else to go on.
  assert.match(plane, /aria-live="polite"[\s\S]{0,120}Showing x \{tidy\(xMin\)\} to \{tidy\(xMax\)\}/);
});

test('a read-only figure is left framed the way its author framed it', () => {
  // Panning a static graph only loses the framing that made it worth showing.
  assert.match(plane, /const zoomable = panZoom == null \? interactive : Boolean\(panZoom\);/);
});
