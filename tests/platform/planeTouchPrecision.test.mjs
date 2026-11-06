/*
 * N60 (2026-11-03 walkthrough, Algebra I M3 T2 L4 and L5): on a 390x844 phone
 * the Systems Workspace's −10 to 10 grid is drawn 302x206 CSS px, 12.8 px a
 * unit across and 8.0 px up, so a tap gives the point it aims at only within
 * 6.4 px and 4.0 px of it. The plane shows the point a lift will give while a
 * finger is down, and these hold that a student can read it there and gets
 * it, that a finger's tap reaches the grid's edge from just outside it, and
 * that it is never given a point off the window (planeTouch.js,
 * CoordinatePlane.jsx); a mouse and a pen keep what they had. The same
 * walkthrough found the keyboard's crosshair stopping at a zoomed window's
 * edge, between grid lines, and Enter plotting it there: it now stands only
 * on a grid point inside the window (the keyboard tests at the end).
 * The browser half, on the real
 * workspace by touch at 390x844 and by mouse at 1366x768, is the
 * `phonePrecision` scenario of tests/browser/systemsWorkspaceStudio.mjs, and
 * its `zoomedKeyboard` scenario for the keyboard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINGER_CLEARANCE_PX, FINGER_REACH_PX, keyboardGridPoint, pressPicksUpPoint, readoutChipSpot, snapInsideWindow } from '../../src/tools/shared/planeTouch.js';
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

test('the plane gives a finger the reach and the window snap, and a mouse and a pen what they had', () => {
  const convert = region(plane, 'const graphPointFromEvent = (event) => {', 'const MIN_SPAN_STEPS', 'the press-to-point conversion');
  assert.match(convert, /const finger = event\.pointerType === 'touch';/);
  assert.match(convert, /reach: finger \? FINGER_REACH_PX \/ viewBoxRenderScale\(\{ rect, viewBoxWidth: width, viewBoxHeight: height \}\) : 0,/);
  assert.match(convert, /const x = finger \? snapInsideWindow\(point\.x, snapStep, xMin, xMax\) : snapValue\(point\.x, snapStep\);/);
  assert.match(convert, /const y = finger \? snapInsideWindow\(point\.y, snapStep, yMin, yMax\) : snapValue\(point\.y, snapStep\);/);
  // Still clamped to the authored domain after the snap (planePanZoomContract).
  assert.match(convert, /return \[clamp\(x, domainXMin, domainXMax\), clamp\(y, domainYMin, domainYMax\)\];/);
  // The keyboard's crosshair is not a press: no finger's reach. (Where it may
  // stand is the keyboard tests' below.)
  assert.doesNotMatch(region(plane, 'const moveKeyboardCursor = (dx, dy) => {', 'const handleKeyDown', 'the keyboard crosshair'), /FINGER_REACH_PX|graphPointFromEvent/);
});

/* ---------- the keyboard on a zoomed plane ---------- */

// The plane's zoom buttons, as applyZoom moves the window: about its centre.
const zoomed = (view, presses, factor = 1 / 1.4) => {
  const scale = factor ** presses;
  const cx = (view.xMin + view.xMax) / 2;
  const cy = (view.yMin + view.yMax) / 2;
  const halfX = ((view.xMax - view.xMin) * scale) / 2;
  const halfY = ((view.yMax - view.yMin) * scale) / 2;
  return { xMin: cx - halfX, xMax: cx + halfX, yMin: cy - halfY, yMax: cy + halfY };
};
// An arrow key, as the plane's moveKeyboardCursor applies it (CoordinatePlane.jsx).
const ARROWS = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] };
const keyPress = (cursor, key, step, view, domain, large = 1) => {
  const base = keyboardGridPoint(cursor || [0, 0], step, view, domain);
  return keyboardGridPoint([base[0] + ARROWS[key][0] * large * step, base[1] + ARROWS[key][1] * large * step], step, view, domain);
};
const keyPresses = (cursor, key, count, step, view, domain) => {
  let at = cursor;
  const passed = [];
  for (let index = 0; index < count; index += 1) {
    at = keyPress(at, key, step, view, domain);
    passed.push(at);
  }
  return { at, passed };
};
const onGridInside = ([x, y], step, view) => Number.isInteger(Number((x / step).toFixed(6))) && Number.isInteger(Number((y / step).toFixed(6)))
  && x >= view.xMin - 1e-9 && x <= view.xMax + 1e-9 && y >= view.yMin - 1e-9 && y <= view.yMax + 1e-9;

// The Systems Workspace's build grid, where the walkthrough saw it.
const BUILD = { xMin: -6, xMax: 8, yMin: -4, yMax: 10 };

test('on a zoomed plane the keyboard crosshair stops at the last grid line inside the window, and Enter plots there', () => {
  // Two presses of Zoom in: x from -2.571429 to 4.571429, y from -0.571429 to 6.571429.
  const view = zoomed(BUILD, 2);
  assert.ok(Math.abs(view.xMax - 4.571429) < 1e-6 && Math.abs(view.yMin + 0.571429) < 1e-6, JSON.stringify(view));
  const right = keyPresses(null, 'right', 6, 1, view, BUILD);
  assert.deepEqual(right.at, [4, 0], 'it stopped at 4.571429, and Enter plotted (4.571429, 0)');
  right.passed.forEach((at) => assert.ok(onGridInside(at, 1, view), `(${at}) is a grid point inside the window`));
  assert.deepEqual(keyPresses(right.at, 'left', 10, 1, view, BUILD).at, [-2, 0], 'the left edge: -2, not -2.571429');
  assert.deepEqual(keyPresses([0, 0], 'up', 10, 1, view, BUILD).at, [0, 6], 'the top: 6, not 6.571429');
  assert.deepEqual(keyPresses([0, 6], 'down', 10, 1, view, BUILD).at, [0, 0], 'the bottom: 0, the last grid line above -0.571429');
  // Shift moves five, and stops at the same line.
  assert.deepEqual(keyPress([0, 0], 'right', 1, view, BUILD, 5), [4, 0]);
  // Half steps stop at the last half step inside.
  assert.deepEqual(keyPresses(null, 'right', 20, 0.5, view, BUILD).at, [4.5, 0]);
  // Enter plots where the crosshair stands (handleKeyDown's target).
  assert.deepEqual(keyboardGridPoint(right.at, 1, view, BUILD), [4, 0]);
  // Three presses of Zoom in on -10 to 10: the window ends at 3.644.
  const three = zoomed({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, 3);
  assert.deepEqual(keyPresses(null, 'right', 9, 1, three, { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }).at, [3, 0]);
});

test('Enter never plots a point off the grid: a crosshair a zoom left outside the window comes back to the grid inside it', () => {
  const authored = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  // The crosshair at (7, 0), then three presses of Zoom in (the buttons take focus, so it is not moved).
  const left = keyPresses(null, 'right', 7, 1, authored, authored).at;
  assert.deepEqual(left, [7, 0]);
  const view = zoomed(authored, 3);
  assert.deepEqual(keyboardGridPoint(left, 1, view, authored), [3, 0], 'Enter: the last grid point inside, not (7, 0) off the window');
  assert.deepEqual(keyPress(left, 'left', 1, view, authored), [2, 0], 'and the next arrow moves on from there');
  // The first key on a window that does not hold the origin starts at the grid point nearest it.
  assert.deepEqual(keyboardGridPoint([0, 0], 1, { xMin: 0.4, xMax: 5.6, yMin: 2.2, yMax: 9.8 }), [1, 3]);
});

test('on the authored window the keyboard moves exactly as it did', () => {
  // The old arithmetic: one step a key, clamped to the window.
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const tidy = (value) => Number(Number(value).toFixed(6));
  const start = (low, high, step) => tidy(Math.round(clamp(0, low, high) / step) * step);
  const before = (cursor, [dx, dy], step, view) => {
    const base = cursor || [start(view.xMin, view.xMax, step), start(view.yMin, view.yMax, step)];
    return [clamp(tidy(base[0] + dx * step), view.xMin, view.xMax), clamp(tidy(base[1] + dy * step), view.yMin, view.yMax)];
  };
  // Authored windows end on grid lines, so nothing moves: 300 random key runs on each.
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const [view, step] of [[{ xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, 1], [BUILD, 1], [{ xMin: 0, xMax: 12, yMin: 0, yMax: 10 }, 1], [{ xMin: -5, xMax: 5, yMin: -6, yMax: 6 }, 0.5]]) {
    for (let run = 0; run < 300; run += 1) {
      let now = null;
      let old = null;
      for (let key = 0; key < 12; key += 1) {
        const name = Object.keys(ARROWS)[Math.floor(random() * 4)];
        const large = random() < 0.3 ? 5 : 1;
        now = keyPress(now, name, step, view, view, large);
        old = before(old, ARROWS[name].map((d) => d * large), step, view);
        assert.deepEqual(now, old, `${JSON.stringify(view)} by ${step}: ${name}${large === 5 ? ' (Shift)' : ''}`);
      }
    }
  }
});

test('zoomed out, the keyboard crosshair stays on the authored graph, as a press does', () => {
  // A press outside the authored graph lands on its edge (graphPointFromEvent
  // clamps to the domain); the crosshair stopped at the window's 14, and Enter
  // plotted a point the question never allowed.
  const authored = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const view = zoomed(authored, 1, 1.4);
  assert.ok(Math.abs(view.xMax - 14) < 1e-9);
  assert.deepEqual(keyPresses(null, 'right', 20, 1, view, authored).at, [10, 0]);
  assert.deepEqual(keyPresses(null, 'down', 20, 1, view, authored).at, [0, -10]);
});

test('the plane\'s keys go through that rule: the arrows, the first key and Enter', () => {
  assert.match(plane, /const keyboardSpot = \(point\) => keyboardGridPoint\(point, minorStep, \{ xMin, xMax, yMin, yMax \}, domain\);/, 'the window drawn, and the authored graph');
  const move = region(plane, 'const moveKeyboardCursor = (dx, dy) => {', 'const handleKeyDown', 'the arrow keys');
  assert.match(move, /const base = keyboardSpot\(current \|\| \[0, 0\]\);\s*return keyboardSpot\(\[base\[0\] \+ dx \* minorStep, base\[1\] \+ dy \* minorStep\]\);/, 'a grid step a key, from a grid point to a grid point');
  assert.doesNotMatch(move, /clamp\(tidy\(base/, 'no longer clamped to the window\'s edge');
  const enter = region(region(plane, 'const handleKeyDown = (event) => {', '\n  };', 'the plane\'s keys'), "case 'Enter':", "case 'Escape':", 'Enter');
  assert.match(enter, /const target = keyboardSpot\(keyboardCursor \|\| \[0, 0\]\);\s*setKeyboardCursor\(target\);/, 'Enter plots where the crosshair stands, on the grid');
});

/* ---------- what a press picks up ---------- */

// The plane's own drawing units, as CoordinatePlane draws a 560x380 plane with 42 of padding.
const unitsAcross = (view) => (VIEW.width - 2 * VIEW.pad) / (view.xMax - view.xMin);
const unitsUp = (view) => (VIEW.height - 2 * VIEW.pad) / (view.yMax - view.yMin);
const AUTHORED = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

test('a press on the grid point just above or below a placed point places a new point: why the pick-up is no longer 18 drawing units', () => {
  // On a -10 to 10 grid a row is 14.8 drawing units and a column 23.8. The
  // pick-up was any point within 18 units of the (already snapped) press, so
  // the grid points above and below a point picked it up, and the press moved
  // the point there instead of placing a second one.
  assert.equal(Number(unitsUp(AUTHORED).toFixed(6)), 14.8);
  assert.ok(unitsUp(AUTHORED) <= 18 && unitsAcross(AUTHORED) > 18, 'the old 18 reached the rows above and below, not the columns beside');
  const placed = [2, 3];
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      const press = [placed[0] + dx, placed[1] + dy];
      assert.equal(pressPicksUpPoint(press, placed, 1), dx === 0 && dy === 0, `a press on (${press}) ${dx || dy ? 'places a new point' : 'picks (2, 3) up'}`);
    }
  }
  // Half steps: the same, a half step apart.
  assert.equal(pressPicksUpPoint([2, 3.5], [2, 3], 0.5), false);
  assert.equal(pressPicksUpPoint([2, 3], [2, 3], 0.5), true);
});

test('a point between grid lines is picked up from a grid point nearest it, and from no other', () => {
  // A tool can hand the plane a movable point off its grid.
  const lattice = [];
  for (let x = -1; x <= 5; x += 1) for (let y = 0; y <= 7; y += 1) lattice.push([x, y]);
  for (const point of [[2.3, 3.6], [2.5, 3], [2.5, 3.5], [1.9, 4.05]]) {
    const nearest = Math.min(...lattice.map(([x, y]) => Math.max(Math.abs(x - point[0]), Math.abs(y - point[1]))));
    for (const press of lattice) {
      const distance = Math.max(Math.abs(press[0] - point[0]), Math.abs(press[1] - point[1]));
      assert.equal(pressPicksUpPoint(press, point, 1), distance <= nearest + 1e-9, `(${point}) from (${press})`);
    }
  }
  assert.deepEqual(lattice.filter((press) => pressPicksUpPoint(press, [2.5, 3], 1)), [[2, 3], [3, 3]], 'a tie: both nearest grid points');
});

// A plane drawn `cssWidth` CSS px wide, showing `view`: where a press at an
// offset from a grid point lands, as graphPointFromEvent gives it (a finger's
// reach and window snap; a mouse's plain rounding is the same away from the edges).
const planeDrawn = (cssWidth, view) => {
  const rect = { left: 0, top: 0, width: cssWidth, height: (cssWidth * VIEW.height) / VIEW.width };
  const scale = viewBoxRenderScale({ rect, viewBoxWidth: VIEW.width, viewBoxHeight: VIEW.height });
  const css = ([x, y]) => [(VIEW.pad + (x - view.xMin) * unitsAcross(view)) * scale, (VIEW.height - VIEW.pad - (y - view.yMin) * unitsUp(view)) * scale];
  const pressAt = ([cx, cy]) => {
    const at = clientPointToGraphCoordinate({ clientX: cx, clientY: cy, rect, viewBoxWidth: VIEW.width, viewBoxHeight: VIEW.height, padding: VIEW.pad, ...view, reach: FINGER_REACH_PX / scale });
    return at && [snapInsideWindow(at.x, 1, view.xMin, view.xMax), snapInsideWindow(at.y, 1, view.yMin, view.yMax)];
  };
  return { css, pressAt, cell: [unitsAcross(view) * scale, unitsUp(view) * scale] };
};

test('the pick-up target is the point\'s whole grid cell: the touch minimum wherever a cell is that large, and never another grid point', () => {
  const touchHalf = 44 / 2;
  const planes = [
    ['a 390 px phone', 302, AUTHORED],
    ['a laptop', 560, AUTHORED],
    ['a laptop, zoomed in three times', 560, zoomed(AUTHORED, 3)],
    ['a large screen, zoomed in three times', 900, zoomed(AUTHORED, 3)],
  ];
  for (const [name, width, view] of planes) {
    const plane = planeDrawn(width, view);
    const placed = [1, 1];
    const [px, py] = plane.css(placed);
    const reach = { left: 0, right: 0, up: 0, down: 0 };
    for (let ox = -70; ox <= 70; ox += 0.5) {
      for (let oy = -70; oy <= 70; oy += 0.5) {
        const press = plane.pressAt([px + ox, py + oy]);
        if (!press) continue;
        const landedOnIt = press[0] === placed[0] && press[1] === placed[1];
        // Every press the plane shows on the point's grid point picks it up; no other press does.
        assert.equal(pressPicksUpPoint(press, placed, 1), landedOnIt, `${name}: a press ${ox}, ${oy} px from the point, on (${press})`);
        if (landedOnIt && oy === 0) { reach.right = Math.max(reach.right, ox); reach.left = Math.max(reach.left, -ox); }
        if (landedOnIt && ox === 0) { reach.down = Math.max(reach.down, oy); reach.up = Math.max(reach.up, -oy); }
      }
    }
    // As large as the grid allows: half a cell each way (to the half pixel swept).
    const [across, up] = plane.cell;
    for (const side of ['left', 'right']) assert.ok(reach[side] >= Math.min(across / 2, 70) - 0.5, `${name}: ${reach[side]} px to the ${side}, the cell is ${across.toFixed(1)} px`);
    for (const side of ['up', 'down']) assert.ok(reach[side] >= Math.min(up / 2, 70) - 0.5, `${name}: ${reach[side]} px ${side}, the cell is ${up.toFixed(1)} px`);
    // And at least the touch minimum wherever the cell is that large.
    if (across >= 44) for (const side of ['left', 'right']) assert.ok(reach[side] >= touchHalf, `${name}: the touch minimum across`);
    if (up >= 44) for (const side of ['up', 'down']) assert.ok(reach[side] >= touchHalf, `${name}: the touch minimum up and down`);
  }
  // The large screen zoomed in has room for the touch minimum both ways, and gives it.
  const large = planeDrawn(900, zoomed(AUTHORED, 3));
  assert.ok(large.cell[0] >= 44 && large.cell[1] >= 44, `cells of ${large.cell.map((n) => n.toFixed(1))} px`);
});

test('the plane picks a point up by that rule, the nearest of those it allows, and by no fixed radius', () => {
  const pickUp = region(plane, 'const pointIndexNear = (graphPoint) => {', '\n  };', 'the pick-up');
  assert.match(pickUp, /if \(point\?\.movable === false \|\| point\?\.marker\) return;/, 'only the student\'s own points');
  assert.match(pickUp, /if \(!pressPicksUpPoint\(graphPoint, \[px, py\], minorStep\)\) return;/, 'only a point on the press\'s grid point');
  assert.match(pickUp, /if \(distance < bestDistance\) \{ bestDistance = distance; best = index; \}\s*\}\);\s*return best;/, 'the nearer of two on one grid point');
  assert.doesNotMatch(plane, /HIT_RADIUS|bestDistance <= /, 'no fixed reach left');
  // Asked with the press as the plane shows it: snapped first, by a press and by Enter.
  assert.match(region(plane, 'const handlePointerDown = (event) => {', 'const handlePointerMove', 'a press'), /const point = graphPointFromEvent\(event\);[\s\S]*setDragIndex\(pointIndexNear\(point\)\);/);
  assert.match(region(plane, "case 'Enter':", "case 'Escape':", 'Enter'), /const target = keyboardSpot\(keyboardCursor \|\| \[0, 0\]\);[\s\S]*pointIndexNear\(target\)/);
});
