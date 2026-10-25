/*
 * TOOL-11 (pass 3): on a phone, plane text is readable and a missed drag keeps
 * the line (Graphing replaces the nearest point; a press is snapped to the grid
 * before any pick-up check, so a wider pick-up radius would change nothing). The browser half (rendered sizes at 390 px, a press beside P2
 * picking it up, a third point keeping the line) is tests/browser/
 * planePhoneReach.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_PLANE_DOT_RADIUS_PX, MIN_PLANE_TEXT_PX, STANDARD_PLANE_DOT_RADIUS, baselineBelowAxis, originLabelPlacement, planeDotGrowth, planeFontSize, renderedFontPx } from '../../src/tools/shared/planeTextScale.js';
import { placePoint } from '../../src/tools/graphing2/placePoint.js';
import { describePlot } from '../../src/tools/shared/plotAnnouncement.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { readFileSync } from 'node:fs';

test('plane text grows on a narrow plane to the 12 px floor, and only there', () => {
  // 560-unit viewBox drawn 322 px wide (a 390 px phone column).
  for (const authored of [10, 11, 13]) {
    const size = planeFontSize(authored, 560, 322);
    assert.ok(renderedFontPx(size, 560, 322) >= MIN_PLANE_TEXT_PX - 0.05, `${authored} renders at ${renderedFontPx(size, 560, 322)} px`);
  }
  // Wide enough already: the authored size.
  assert.equal(planeFontSize(11, 560, 640), 11);
  assert.equal(planeFontSize(13, 560, 560), 13);
  // Not measured yet: the authored size.
  assert.equal(planeFontSize(11, 560, null), 11);
  // Never more than 2.25 times its size on a very small plane.
  assert.equal(planeFontSize(10, 560, 100), 22.5);
});

test('numbers below an axis stay below it when phone text grows', () => {
  // The authored place on a wide plane (x ticks 17 below the axis, the origin's 0 at 15).
  assert.equal(baselineBelowAxis(planeFontSize(11, 560, 1120), 17, 6), 17);
  assert.equal(baselineBelowAxis(planeFontSize(10, 560, 1120), 15, 5), 15);
  // A 390 px phone column: the whole em box of the grown digits stays below the axis.
  for (const [authored, offset, gap] of [[11, 17, 6], [10, 15, 5]]) {
    const grown = planeFontSize(authored, 560, 322);
    assert.ok(baselineBelowAxis(grown, offset, gap) - grown >= gap, `${authored}: baseline ${baselineBelowAxis(grown, offset, gap)} for a ${grown}-unit font`);
  }
});

/*
 * PH02: on a phone the origin's "0" was drawn through the "-1" under it. Both
 * grow to the 12px floor (21 units on a 322px plane) while the ticks stay 30
 * units apart, so the "0" (one line below the x axis, left of the y axis) and
 * the "-1" (one tick down, left of the y axis) were closer than they are tall.
 * The browser half is tests/browser/figureDescriptions.mjs, which reads every
 * label's box off the real plane at 390x844.
 */
const phoneFonts = { originFont: planeFontSize(10, 560, 322), tickFont: planeFontSize(11, 560, 322) };
const wideFonts = { originFont: planeFontSize(10, 560, 1120), tickFont: planeFontSize(11, 560, 1120) };
const SPOT = { axisX: 200, axisY: 150 };
// Where the neighbours sit on the Path scene's plane: ticks 30 units apart down
// the y axis, 100 apart along the x axis.
const BELOW = { y: 180, text: '-1' };
const RIGHT = { x: 300, text: '2' };

// A label's drawn box, from where the plane puts it.
const drawnBox = ({ x, y, anchor }, fontSize, text = '0') => {
  const width = text.length * 0.56 * fontSize;
  return { left: anchor === 'end' ? x - width : x, right: anchor === 'end' ? x : x + width, top: y - 0.72 * fontSize, bottom: y };
};
const cross = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('the origin\'s 0 stays below the axis and left of it while nothing is there, and on a wide plane', () => {
  const placed = originLabelPlacement({ ...SPOT, ...wideFonts, firstBelow: BELOW, firstRight: RIGHT });
  assert.deepEqual(placed, { x: 194, y: 165, anchor: 'end' }, 'where it always was: 6 left of the axis, 15 below it');
  // No number under the axis (the window starts at 0): nothing to touch.
  assert.equal(originLabelPlacement({ ...SPOT, ...phoneFonts, firstBelow: null, firstRight: RIGHT }).anchor, 'end');
});

test('on a phone the 0 moves to the right of the y axis when the first number under the axis would touch it', () => {
  const placed = originLabelPlacement({ ...SPOT, ...phoneFonts, firstBelow: BELOW, firstRight: RIGHT });
  assert.equal(placed.anchor, 'start', 'it starts right of the axis');
  assert.ok(placed.x > SPOT.axisX, 'on the right of the y axis');
  assert.ok(placed.y > SPOT.axisY, 'still below the x axis');
  // Whatever it chose, it touches neither neighbour.
  const zero = drawnBox(placed, phoneFonts.originFont);
  const below = drawnBox({ x: SPOT.axisX - 9, y: BELOW.y + 4, anchor: 'end' }, phoneFonts.tickFont, BELOW.text);
  const right = drawnBox({ x: RIGHT.x - (RIGHT.text.length * 0.56 * phoneFonts.tickFont) / 2, y: SPOT.axisY + baselineBelowAxis(phoneFonts.tickFont, 17, 6), anchor: 'start' }, phoneFonts.tickFont, RIGHT.text);
  assert.equal(cross(zero, below), false, 'not through the "-1"');
  assert.equal(cross(zero, right), false, 'not through the "2"');
});

test('when both sides are crowded the 0 is left out, never drawn over a number', () => {
  // Ticks every half unit: the "-0.5" under the axis and the "0.5" beside it.
  const crowded = originLabelPlacement({ ...SPOT, ...phoneFonts, firstBelow: { y: 165, text: '-0.5' }, firstRight: { x: 212, text: '0.5' } });
  assert.equal(crowded, null);
});

test('at every phone size the 0 the plane draws touches no number beside it', () => {
  for (const rendered of [250, 272, 300, 322, 360, 420]) {
    const fonts = { originFont: planeFontSize(10, 560, rendered), tickFont: planeFontSize(11, 560, rendered) };
    for (const spacing of [15, 20, 30, 40, 60]) {
      const below = { y: SPOT.axisY + spacing, text: '-1' };
      const along = { x: SPOT.axisX + 4 * spacing, text: '1' };
      const placed = originLabelPlacement({ ...SPOT, ...fonts, firstBelow: below, firstRight: along });
      if (!placed) continue;
      const zero = drawnBox(placed, fonts.originFont);
      assert.equal(cross(zero, drawnBox({ x: SPOT.axisX - 9, y: below.y + 4, anchor: 'end' }, fonts.tickFont, below.text)), false, `${rendered}px plane, ticks ${spacing} apart: through the "-1"`);
      const alongBox = drawnBox({ x: along.x - (0.56 * fonts.tickFont) / 2, y: SPOT.axisY + baselineBelowAxis(fonts.tickFont, 17, 6), anchor: 'start' }, fonts.tickFont, along.text);
      assert.equal(cross(zero, alongBox), false, `${rendered}px plane, ticks ${spacing} apart: through the "1"`);
    }
  }
});

test('the plane draws the origin\'s 0 where that placement says, and nowhere else', () => {
  const plane = executableSource(readFileSync(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8'));
  const spot = region(plane, 'const originSpot = originVisible', ': null;', 'the placement the plane asks for');
  assert.match(spot, /originLabelPlacement\(\{/);
  assert.match(spot, /firstBelow: firstYBelow === null \? null : \{ y: sy\(firstYBelow\), text: tidy\(firstYBelow\) \}/, 'the first number under the axis');
  assert.match(spot, /firstRight: firstXRight === null \? null : \{ x: sx\(firstXRight\), text: tidy\(firstXRight\) \}/, 'and the first along it');
  // The label is drawn from it, so no second, fixed copy is left behind.
  const zeros = plane.match(/>0<\/text>/g) || [];
  assert.equal(zeros.length, 1, 'one origin label');
  // (It also yields to a point's name drawn over it: planePointLabels.test.mjs.)
  assert.match(region(plane, '{originVisible && originSpot && !originUnderLabel ?', '>0</text>', 'the origin label'), /x=\{originSpot\.x\} y=\{originSpot\.y\} textAnchor=\{originSpot\.anchor\}/);
});

test('a point past the last replaces the nearest one instead of restarting the line', () => {
  assert.deepEqual(placePoint([], [1, 1]), [[1, 1]]);
  assert.deepEqual(placePoint([[0, 0]], [3, 0]), [[0, 0], [3, 0]]);
  assert.deepEqual(placePoint([[0, 0], [3, 0]], [4, 0]), [[0, 0], [4, 0]], 'a miss beside P2 moves P2');
  assert.deepEqual(placePoint([[0, 0], [3, 0]], [0, 1]), [[0, 1], [3, 0]], 'beside P1 moves P1');
  assert.deepEqual(placePoint([[0, 0], [2, 0]], [1, 5]), [[0, 0], [1, 5]], 'a tie replaces the later point');
  assert.deepEqual(placePoint([[0, 0], [1, 1], [2, 2]], [2, 3], 3), [[0, 0], [1, 1], [2, 3]]);
});

// TL19 (owner decision: keep the replacement, no dialog): it is said, naming
// the point it took. The Undo that puts the point back is proved in the
// browser (planePhoneReach.mjs), on the real tool.
test('TL19: a replacement is announced with the point it replaced', () => {
  const before = [[0, 0], [4, 0]];
  const after = placePoint(before, [3, 4]);
  assert.deepEqual(after, [[0, 0], [3, 4]]);
  assert.equal(describePlot({ point: [3, 4], before, after, progress: '2 of 2 points plotted.' }), 'Plotted (3, 4). It replaced (4, 0). 2 of 2 points plotted.');
});

/*
 * PH09 (C1-130): the dots were 3.5px of radius on a 390px phone, 7px across. The
 * browser half is tests/browser/planePhoneReach.mjs, which reads the plotted
 * dots' rendered radius off the real plane at 390x844 and 1366x768.
 */
test('point dots grow on a narrow plane until the standard dot is 5px of radius, and only there', () => {
  // A 560-unit plane drawn 322, 276 and 252px wide: the work area of a 390, 344 and 320px phone.
  for (const rendered of [322, 276, 252]) {
    const growth = planeDotGrowth(560, rendered);
    const px = STANDARD_PLANE_DOT_RADIUS * growth * (rendered / 560);
    assert.ok(px >= MIN_PLANE_DOT_RADIUS_PX - 0.1, `${rendered}px plane: the standard dot renders ${px.toFixed(2)}px of radius`);
    assert.ok(growth > 1 && growth <= 2.25, `${rendered}px plane: grows by ${growth}`);
  }
  // Wide enough already, or not measured yet: the authored size.
  assert.equal(planeDotGrowth(560, 560), 1, 'a 560px plane: 6px of radius is already enough');
  assert.equal(planeDotGrowth(560, 700), 1);
  assert.equal(planeDotGrowth(560, null), 1);
  // Never more than 2.25 times its size, as the text.
  assert.equal(planeDotGrowth(560, 100), 2.25);
});

test('every dot of a plane grows by one factor, so a tool\'s bigger and smaller dots stay so', () => {
  // Sequence Explorer draws its two series as a radius 8 and a radius 5 dot: a cue that is not colour.
  const plane = executableSource(readFileSync(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8'));
  assert.match(plane, /const dotGrowth = planeDotGrowth\(width, renderedWidth\);\s*const dotRadius = \(radius\) => radius \* dotGrowth;/, 'the same factor for every radius');
  assert.match(plane, /const pointRadius = dotRadius\(resolvePointRadius\(point, 6\)\);/, 'an authored radius is scaled, not replaced');
  // A floor shared by every dot (Math.max over the radius) would make the 8 and the 5 the same size on a phone.
  assert.doesNotMatch(plane, /pointRadius = Math\.max\(/);
  // The preview ring is a dot too.
  assert.match(plane, /r=\{dotRadius\(5\)\}/);
  // How far a press reaches to pick a point up is not part of this.
  assert.match(plane, /const HIT_RADIUS = 18;/);
});
