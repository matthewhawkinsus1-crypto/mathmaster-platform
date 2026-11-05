/*
 * N60 (2026-11-03 walkthrough, Algebra I M3 T2 L4 and L5): on a 390x844 phone
 * the Systems Workspace's −10 to 10 grid is drawn 302x206 CSS px, 12.8 px a
 * unit across and 8.0 px up, so a tap gives the point it aims at only within
 * 6.4 px and 4.0 px of it. The plane shows the point a lift will give while a
 * finger is down, and these hold that a student can read it there and gets
 * it, that a finger's tap reaches the grid's edge from just outside it, and
 * that it is never given a point off the window (planeTouch.js,
 * CoordinatePlane.jsx); a mouse, a pen and the keyboard keep what they had.
 * The browser half, on the real
 * workspace by touch at 390x844 and by mouse at 1366x768, is the
 * `phonePrecision` scenario of tests/browser/systemsWorkspaceStudio.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINGER_CLEARANCE_PX, FINGER_REACH_PX, readoutChipSpot, snapInsideWindow } from '../../src/tools/shared/planeTouch.js';
import { planeFontSize } from '../../src/tools/shared/planeTextScale.js';
import { clientPointToGraphCoordinate, viewBoxRenderScale } from '../../src/utils/responsiveCoordinates.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const plane = executableSource(readFileSync(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8'));

// The plane the walkthrough measured: 560x380 units with 42 of padding, a
// −10 to 10 window, drawn 302 CSS px wide on the phone.
const VIEW = { width: 560, height: 380, pad: 42 };
const PHONE_SCALE = 302 / 560;
const sx = (x) => VIEW.pad + ((x + 10) / 20) * (VIEW.width - 2 * VIEW.pad);
const sy = (y) => VIEW.height - VIEW.pad - ((y + 10) / 20) * (VIEW.height - 2 * VIEW.pad);
const lattice = [];
for (let x = -10; x <= 10; x += 1) for (let y = -10; y <= 10; y += 1) lattice.push([x, y]);

// The chip as the plane sizes it on the phone: its text grows to 12 CSS px,
// and under a finger it is as wide as "(-10, -10)" needs.
const grow = planeFontSize(12, VIEW.width, 302) / 12;
const fingerChip = { chipWidth: Math.max(58, ('(-10, -10)'.length + 2) * 7.2) * grow, chipHeight: 22 * grow };
const box = ({ left, top }, { chipWidth, chipHeight }) => ({ left, top, right: left + chipWidth, bottom: top + chipHeight });
const distanceToBox = ([x, y], b) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

test('under a finger the chip is never within a fingertip of the point, and stays on the plane', () => {
  const clearance = FINGER_CLEARANCE_PX / PHONE_SCALE;
  for (const [x, y] of lattice) {
    const at = [sx(x), sy(y)];
    const spot = readoutChipSpot({ cx: at[0], cy: at[1], ...fingerChip, planeWidth: VIEW.width, planeHeight: VIEW.height, touch: true, scale: PHONE_SCALE });
    const drawn = box(spot, fingerChip);
    assert.ok(distanceToBox(at, drawn) >= clearance - 1e-9, `(${x}, ${y}): the chip is ${(distanceToBox(at, drawn) * PHONE_SCALE).toFixed(1)} CSS px from the point`);
    assert.ok(drawn.left >= 0 && drawn.right <= VIEW.width && drawn.top >= 0 && drawn.bottom <= VIEW.height, `(${x}, ${y}): the chip stays on the plane`);
  }
});

test('under a finger the chip sits straight above the point wherever there is room, and beside it on the top rows, never below', () => {
  const clearance = FINGER_CLEARANCE_PX / PHONE_SCALE;
  let above = 0;
  for (const [x, y] of lattice) {
    const at = [sx(x), sy(y)];
    const drawn = box(readoutChipSpot({ cx: at[0], cy: at[1], ...fingerChip, planeWidth: VIEW.width, planeHeight: VIEW.height, touch: true, scale: PHONE_SCALE }), fingerChip);
    if (at[1] - clearance - fingerChip.chipHeight >= 2) {
      above += 1;
      assert.ok(Math.abs(drawn.bottom - (at[1] - clearance)) < 1e-9, `(${x}, ${y}): its lower edge is the clearance above the point`);
      const centre = (drawn.left + drawn.right) / 2;
      // Centred on the point unless the plane's side edge holds it in.
      if (at[0] - fingerChip.chipWidth / 2 >= 2 && at[0] + fingerChip.chipWidth / 2 <= VIEW.width - 2) assert.ok(Math.abs(centre - at[0]) < 1e-9, `(${x}, ${y}): centred over the point`);
    } else {
      // The top rows: beside the fingertip, at its height or higher, so the hand below covers nothing.
      assert.ok(drawn.right <= at[0] - clearance + 1e-9 || drawn.left >= at[0] + clearance - 1e-9, `(${x}, ${y}): beside the fingertip`);
      assert.ok(drawn.top <= at[1], `(${x}, ${y}): not below the point`);
    }
  }
  // Most of the grid has room above: on the phone only the top rows (y = 6 and up) do not.
  assert.ok(above >= 21 * 15, `${above} of 441 points have the chip above them`);
});

test('a mouse keeps the chip beside the cursor, exactly where it always was', () => {
  const mouseChip = { chipWidth: 108, chipHeight: 22 };
  const spot = (cx, cy, extra = {}) => readoutChipSpot({ cx, cy, ...mouseChip, planeWidth: 560, planeHeight: 380, ...extra });
  // Up and to the right: 12 units right of the cursor, its lower edge 8 above it.
  assert.deepEqual(spot(100, 200), { left: 112, top: 170 });
  // Flipped left at the right edge, and below the cursor at the top edge.
  assert.deepEqual(spot(500, 200), { left: 380, top: 170 });
  assert.deepEqual(spot(100, 20), { left: 112, top: 34 });
  // The phone's scale changes nothing without a finger.
  assert.deepEqual(spot(100, 200, { scale: PHONE_SCALE }), { left: 112, top: 170 });
  assert.deepEqual(spot(100, 200, { touch: false, scale: PHONE_SCALE }), spot(100, 200));
});

test('the plane takes the chip\'s place from the gesture, and a finger\'s lift lands the point it showed', () => {
  // The chip is a finger's only while a finger made the preview: the keyboard's crosshair keeps the mouse placement.
  assert.match(plane, /const chipByTouch = previewByTouch && !keyboardActive;/);
  const chip = region(plane, 'const chip = useMemo(() => {', '}, [preview,', 'the readout chip');
  assert.match(chip, /readoutChipSpot\(\{[\s\S]*touch: chipByTouch[\s\S]*\}\)/, 'its place comes from readoutChipSpot, told whether a finger is down');
  assert.match(chip, /chipByTouch \? formatCoordinate\(preview\)\.length \+ 2 : previewText\.length/, 'a finger\'s chip is as wide as the coordinates it shows; a mouse\'s as before');
  // Press and slide record whether it is a finger and the point now shown.
  for (const [label, start, end] of [['press', 'const handlePointerDown = (event) => {', 'const handlePointerMove'], ['slide', 'const handlePointerMove = (event) => {', 'const handlePointerUp']]) {
    const handler = region(plane, start, end, label);
    assert.match(handler, /setPreviewByTouch\(event\.pointerType === 'touch'\);/, `${label}: whether a finger is down`);
    assert.match(handler, /shownPointRef\.current = point;/, `${label}: the point the chip shows`);
  }
  // The lift: a finger lands what was shown, a mouse where it is let go (unchanged).
  const lift = region(plane, 'const handlePointerUp = (event) => {', 'const handlePointerCancel', 'the lift');
  assert.match(lift, /const point = event\.pointerType === 'touch' \? shownPointRef\.current : \(graphPointFromEvent\(event\) \|\| pointerPreview\);/);
  // A gesture the browser takes away leaves nothing to land.
  assert.match(region(plane, 'const handlePointerCancel = () => {', '};', 'the cancel'), /shownPointRef\.current = null;/);
});

/* ---------- where a finger's tap lands ---------- */

test('on the authored window a finger snaps exactly as a mouse does', () => {
  for (const step of [1, 0.5]) {
    for (let value = -10; value <= 10 + 1e-9; value += 0.05) {
      assert.equal(snapInsideWindow(value, step, -10, 10), Number((Math.round(value / step) * step).toFixed(6)), `${value.toFixed(2)} by ${step}`);
    }
  }
});

test('a finger never snaps to a point off the window, however the zoom left it', () => {
  // Three presses of Zoom in on −10 to 10: the window ends between grid lines.
  const edge = 20 / 1.4 ** 3 / 2;
  for (let value = -edge; value <= edge; value += 0.01) {
    assert.equal(snapInsideWindow(value, 1, -edge, edge), Math.min(3, Math.max(-3, Math.round(value))) || 0, `${value.toFixed(2)}`);
  }
  assert.equal(snapInsideWindow(3.6, 1, -edge, edge), 3, 'plain rounding gave 4, a point drawn outside the grid');
  assert.equal(snapInsideWindow(-3.6, 1, -edge, edge), -3);
  assert.equal(snapInsideWindow(2.4, 1, -edge, edge), 2, 'inside, the nearest point as ever');
  assert.equal(snapInsideWindow(3.6, 0.5, -edge, edge), 3.5, 'and by half steps');
  // A window off the origin (a corner zoomed into).
  assert.equal(snapInsideWindow(5.58, 1, 0.449, 5.551), 5);
  assert.equal(snapInsideWindow(0.42, 1, 0.449, 5.551), 1);
  // No grid line inside: plain rounding (the zoom never gets there).
  assert.equal(snapInsideWindow(0.6, 1, 0.2, 0.8), 1);
  assert.equal(snapInsideWindow(Number.NaN, 1, -10, 10), null);
});

test('a finger reaches a little past the grid\'s edge and lands on it; a mouse does not', () => {
  // The phone's plane: 560x380 units drawn 302 px wide.
  const rect = { left: 20, top: 100, width: 302, height: (302 * 380) / 560 };
  const view = { rect, viewBoxWidth: 560, viewBoxHeight: 380, padding: 42, xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const scale = viewBoxRenderScale({ rect, viewBoxWidth: 560, viewBoxHeight: 380 });
  const reach = FINGER_REACH_PX / scale;
  const at = (vx, vy) => ({ clientX: rect.left + vx * scale, clientY: rect.top + vy * scale });
  const levelWith3 = 380 - 42 - (13 / 20) * 296;
  // 10 CSS px left of the grid's left edge, level with y = 3.
  const outside = at(42 - 10 / scale, levelWith3);
  assert.equal(clientPointToGraphCoordinate({ ...outside, ...view }), null, 'without a reach (a mouse) outside is outside, as before');
  const reached = clientPointToGraphCoordinate({ ...outside, ...view, reach });
  assert.equal(reached.x, -10, 'a finger lands on the edge');
  assert.ok(Math.abs(reached.y - 3) < 1e-9, 'level with where it pressed');
  // Above and right of the top-right corner: the corner.
  const corner = clientPointToGraphCoordinate({ ...at(518 + 8 / scale, 42 - 8 / scale), ...view, reach });
  assert.ok(Math.abs(corner.x - 10) < 1e-9 && Math.abs(corner.y - 10) < 1e-9, `(${corner.x}, ${corner.y})`);
  // Past the reach, nothing: the press was not meant for the grid.
  assert.equal(clientPointToGraphCoordinate({ ...at(42 - 30 / scale, levelWith3), ...view, reach }), null);
  // Inside the grid the reach changes nothing.
  for (const [vx, vy] of [[42, 42], [300, 200], [518, 338], [100.5, 77.25]]) {
    assert.deepEqual(clientPointToGraphCoordinate({ ...at(vx, vy), ...view, reach }), clientPointToGraphCoordinate({ ...at(vx, vy), ...view }));
  }
});

test('the plane gives a finger the reach and the window snap, and a mouse, a pen and the keyboard what they had', () => {
  const convert = region(plane, 'const graphPointFromEvent = (event) => {', 'const MIN_SPAN_STEPS', 'the press-to-point conversion');
  assert.match(convert, /const finger = event\.pointerType === 'touch';/);
  assert.match(convert, /reach: finger \? FINGER_REACH_PX \/ viewBoxRenderScale\(\{ rect, viewBoxWidth: width, viewBoxHeight: height \}\) : 0,/);
  assert.match(convert, /const x = finger \? snapInsideWindow\(point\.x, snapStep, xMin, xMax\) : snapValue\(point\.x, snapStep\);/);
  assert.match(convert, /const y = finger \? snapInsideWindow\(point\.y, snapStep, yMin, yMax\) : snapValue\(point\.y, snapStep\);/);
  // Still clamped to the authored domain after the snap (planePanZoomContract).
  assert.match(convert, /return \[clamp\(x, domainXMin, domainXMax\), clamp\(y, domainYMin, domainYMax\)\];/);
  // The keyboard's crosshair is not a press: it keeps its own unit steps.
  assert.doesNotMatch(region(plane, 'const moveKeyboardCursor = (dx, dy) => {', 'const handleKeyDown', 'the keyboard crosshair'), /snapInsideWindow|FINGER_REACH_PX/);
});
