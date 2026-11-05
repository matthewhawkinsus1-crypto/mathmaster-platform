/*
 * N60 (2026-11-03 walkthrough, Algebra I M3 T2 L4 and L5): on a 390x844 phone
 * the Systems Workspace's −10 to 10 grid is drawn 302x206 CSS px, 12.8 px a
 * unit across and 8.0 px up, so a tap gives the point it aims at only within
 * 6.4 px and 4.0 px of it. The plane shows the point a lift will give while a
 * finger is down, and these hold that a student can read it there and gets
 * it (planeTouch.js, CoordinatePlane.jsx). The browser half, on the real
 * workspace by touch at 390x844 and by mouse at 1366x768, is the
 * `phonePrecision` scenario of tests/browser/systemsWorkspaceStudio.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINGER_CLEARANCE_PX, readoutChipSpot } from '../../src/tools/shared/planeTouch.js';
import { planeFontSize } from '../../src/tools/shared/planeTextScale.js';
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
