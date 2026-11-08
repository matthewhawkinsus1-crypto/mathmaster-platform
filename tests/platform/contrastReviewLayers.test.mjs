/*
 * THE CONTRAST REVIEW COMPOSITES A BOX'S BACKGROUND IMAGES AS LAYERS, READ
 * WHERE THE TEXT IS (tests/browser/support/backgroundLayers.mjs, used by
 * contrastReview.mjs).
 *
 * Fixtures are computed styles and boxes as Chromium gives them. A dark stage
 * whose glows fade to transparent over its own dark gradient (the Live
 * Challenge projector's stage, before it was given an opaque colour) must pass
 * with its light text, wherever the text is; read as one list of stops over the
 * white page, it failed. A glow is as bright as it is where the text is: the
 * student arena's pink glow is centred above the page, and read at its centre
 * it failed "Your score" (4.44:1) where the screen shows 6.8:1. Light text over
 * a light gradient must still fail, wherever it is read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  backgroundLayersInPage, cellsOf, colourAt, compositeLayers, gradientGeometry, gradientLayers, imageLayersAt, parseColour,
  parseGradient, resolveStops,
} from '../browser/support/backgroundLayers.mjs';
import { luminance, worstRatio } from '../browser/contrastReview.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const PAGE = [255, 255, 255];
// What the review did for each box from the root down, reading each image
// whole: its colour, then its images, the last first (the first is painted on
// top).
const backgroundsOf = (boxes) => boxes.reduce((candidates, { color = 'rgba(0, 0, 0, 0)', image = 'none' }) => {
  const colour = parseColour(color);
  const layers = [...(colour && colour[3] > 0 ? [[colour]] : []), ...[...gradientLayers(image)].reverse()];
  return compositeLayers(candidates, layers);
}, [PAGE]);

// A box as the review measures it (contrastReview.mjs): its border box, border
// and padding widths, the rectangle it paints (none for the page's own
// background, which covers the canvas), and whether it is plain (not turned,
// and the text cannot scroll across it).
const boxAt = (left, top, width, height, { borders = [0, 0, 0, 0], paddings = [0, 0, 0, 0], canvas = false, plain = true } = {}) => ({
  border: { left, top, width, height }, borders, paddings, clip: canvas ? null : { left, top, width, height }, plain,
});
const rectAt = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
// What the review does now, at one of the text's boxes: for each box from the
// root down, its colour, then its images read at that text box, the last first.
const backgroundsAt = (rect, boxes) => boxes.reduce((candidates, { color = 'rgba(0, 0, 0, 0)', background = {}, box }) => {
  const colour = parseColour(color);
  const images = imageLayersAt({ image: 'none', ...background }, box, rect).reverse().filter((layer) => layer.stops.length);
  return compositeLayers(candidates, [...(colour && colour[3] > 0 ? [[colour]] : []), ...images]);
}, [PAGE]);
// As the review reads one of the text's boxes: cell by cell (cellsOf).
const backgroundsOver = (rect, boxes) => [...new Map(cellsOf(rect).flatMap((cell) => backgroundsAt(cell, boxes)).map((c) => [c.join(), c])).values()];
const ratioOf = (text, candidates) => worstRatio(text, candidates).ratio;

// LiveChallengeArenaProjector.jsx's stage, computed, with no colour under it.
const STAGE = 'radial-gradient(circle at 12% 12%, rgba(74, 103, 255, 0.24), rgba(0, 0, 0, 0) 34%), radial-gradient(circle at 88% 4%, rgba(174, 83, 255, 0.2), rgba(0, 0, 0, 0) 31%), radial-gradient(circle at 74% 90%, rgba(0, 206, 209, 0.12), rgba(0, 0, 0, 0) 36%), linear-gradient(145deg, rgb(17, 24, 49) 0%, rgb(9, 17, 40) 48%, rgb(18, 20, 46) 100%)';
const STAGE_TEXT = [247, 249, 255, 1];

test('a background\'s images are layers, read first image on top, each with its own stops', () => {
  const layers = gradientLayers(STAGE);
  assert.equal(layers.length, 4);
  assert.deepEqual(layers[0], [[74, 103, 255, 0.24], [0, 0, 0, 0]]);
  assert.deepEqual(layers[3], [[17, 24, 49, 1], [9, 17, 40, 1], [18, 20, 46, 1]], 'the stage itself, last');
  assert.deepEqual(gradientLayers('url("a.png"), linear-gradient(transparent, rgb(1, 2, 3))'), [[[0, 0, 0, 0], [1, 2, 3, 1]]], 'an image has no stops');
  assert.deepEqual(gradientLayers('none'), []);
  // color-mix() computes to color(srgb …): the Work View rail's scroll shadow.
  assert.deepEqual(gradientLayers('linear-gradient(color(srgb 0.2 0.4 0.6 / 0.28), rgba(0, 0, 0, 0))')[0][0].map((v) => Math.round(v * 100) / 100), [51, 102, 153, 0.28]);
  assert.deepEqual(parseColour('rgb(17 24 49 / 50%)'), [17, 24, 49, 0.5]);
  assert.equal(parseColour('oklch(0.7 0.1 200)'), null, 'a colour space it cannot read is no colour');
});

test('a dark stage whose glows fade to transparent passes with light text; read as one list over the page, it failed', () => {
  const candidates = backgroundsOf([{ image: STAGE }]);
  assert.ok(candidates.every((colour) => luminance(colour) < 0.1), `only the stage's dark colours, its glows on it: ${JSON.stringify(candidates)}`);
  const { ratio } = worstRatio(STAGE_TEXT, candidates);
  assert.ok(ratio >= 4.5, `light text on the stage: ${ratio.toFixed(2)}:1`);
  // The old reading: every stop of every image composited over the white page.
  const flattened = compositeLayers([PAGE], [gradientLayers(STAGE).flat()]);
  assert.ok(worstRatio(STAGE_TEXT, flattened).ratio < 1.1, 'which found the page under a transparent stop');
  // A dark overlay that fades out, over that stage, is still dark.
  const overlay = backgroundsOf([{ image: STAGE }, { image: 'linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0))' }]);
  assert.ok(worstRatio(STAGE_TEXT, overlay).ratio >= 4.5);
});

test('light text over a light gradient still fails, and so does a light gradient fading to the white page', () => {
  const light = [200, 210, 230, 1];
  assert.ok(worstRatio(light, backgroundsOf([{ image: 'linear-gradient(rgb(255, 255, 255), rgb(232, 240, 254))' }])).ratio < 4.5);
  assert.ok(worstRatio(light, backgroundsOf([{ image: 'linear-gradient(rgba(232, 240, 254, 0), rgb(232, 240, 254))' }])).ratio < 4.5);
  // A box colour under the images is the bottom layer, not the top.
  assert.ok(worstRatio(light, backgroundsOf([{ color: 'rgb(9, 17, 40)', image: 'linear-gradient(rgb(255, 255, 255), rgb(240, 244, 255))' }])).ratio < 4.5);
});

// The student arena (grandPrixTheme.js ARENA, under every student Live
// Challenge screen), computed: three glows, each in its own corner, a fade and
// a grid over an opaque stage, on a box colour that stage hides.
const ARENA = 'radial-gradient(60% 45% at 50% -8%, rgba(255, 63, 209, 0.38), rgba(0, 0, 0, 0) 70%), radial-gradient(45% 40% at 0% 18%, rgba(53, 227, 255, 0.22), rgba(0, 0, 0, 0) 70%), radial-gradient(45% 40% at 100% 22%, rgba(61, 123, 255, 0.26), rgba(0, 0, 0, 0) 70%), linear-gradient(rgb(22, 11, 69) 0%, rgba(13, 15, 57, 0.55) 30%, rgba(10, 16, 52, 0) 55%), repeating-linear-gradient(90deg, rgba(53, 227, 255, 0.07) 0px, rgba(53, 227, 255, 0.07) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 64px), repeating-linear-gradient(0deg, rgba(53, 227, 255, 0.07) 0px, rgba(53, 227, 255, 0.07) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 64px), linear-gradient(rgb(22, 11, 69) 0%, rgb(10, 16, 52) 42%, rgb(6, 8, 24) 100%), none';
const ARENA_BOX = { color: 'rgb(6, 8, 24)', image: ARENA };

test('glows are not stacked on each other: each is over the stage beneath it, so the arena\'s header and score pass', () => {
  const candidates = backgroundsOf([{ color: 'rgb(255, 255, 255)' }, ARENA_BOX]);
  const lightest = candidates.reduce((a, b) => (luminance(a) > luminance(b) ? a : b));
  assert.deepEqual(lightest, [111, 31, 122], 'the lightest is the pink glow over the stage\'s top colour, alone');
  const [pinkOverCyan] = compositeLayers([[22, 11, 69]], [[[53, 227, 255, 0.22]], [[255, 63, 209, 0.38]]]);
  assert.ok(!candidates.some((colour) => colour.join() === pinkOverCyan.join()), 'never one glow over another');
  // Text the screens draw on it, from the review's run of live-challenge/lobby and /round.
  for (const [what, colour] of [['"MathMaster Live Challenge"', [255, 210, 63, 1]], ['"pts"', [195, 210, 234, 1]], ['the stage title', [255, 255, 255, 1]]]) {
    assert.ok(worstRatio(colour, candidates).ratio >= 4.5, `${what}: ${worstRatio(colour, candidates).ratio.toFixed(2)}:1`);
  }
  // Stacked, every glow over every other, the arena showed a light purple
  // (#7955b4) seen nowhere on it, and those texts failed.
  const everyLayerOverEvery = (beneath, layers) => layers.reduce((current, stops) => compositeLayers(current, [stops.map(([r, g, b, a]) => [r, g, b, Math.max(a, 1e-9)])]), beneath);
  const stacked = everyLayerOverEvery([PAGE], [[[6, 8, 24, 1]], ...[...gradientLayers(ARENA)].reverse()]);
  assert.ok(stacked.some((colour) => colour.join() === '121,85,180'));
  assert.ok(worstRatio([255, 210, 63, 1], stacked).ratio < 4.5);
});

test('a layer that covers its box covers the glows under it too, and a translucent box over the arena is over all of it', () => {
  const dark = [[[10, 10, 10, 1]]];
  const glow = [[255, 255, 255, 0.5], [0, 0, 0, 0]];
  const tint = [[0, 0, 0, 0.5]];
  const candidates = compositeLayers([PAGE], [...dark, glow, tint]);
  assert.deepEqual(candidates.sort(), [[5, 5, 5], [67, 67, 67]], 'the tint over the stage, and over the glow on it');
  const card = backgroundsOf([ARENA_BOX, { image: 'linear-gradient(160deg, rgba(42, 15, 92, 0.92) 0%, rgba(12, 20, 70, 0.94) 55%, rgba(8, 12, 42, 0.96) 100%)' }]);
  assert.ok(card.every((colour) => luminance(colour) < 0.03), `the lobby card: ${JSON.stringify(card.slice(0, 4))}`);
});

// The student Live Challenge page (LiveChallengeStudent.jsx, .mm-gp-arena-page,
// ARENA_PAGE_BACKGROUND) in the certified round scene at 1366×768, computed and
// measured: each arena layer on a tile as wide as the page and as tall as the
// screen, at its top, not repeated; the floor colour under them. "Your score"
// (#9fb0cc, 11px) sits at the header's right, under the white page around it.
const ARENA_PAGE = {
  color: 'rgb(6, 8, 24)',
  background: {
    image: ARENA,
    size: '100% 768px, 100% 768px, 100% 768px, 100% 768px, 100% 768px, 100% 768px, 100% 768px, auto',
    positionX: '50%, 50%, 50%, 50%, 50%, 50%, 50%, 0%',
    positionY: '0%, 0%, 0%, 0%, 0%, 0%, 0%, 0%',
    repeat: 'no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, no-repeat, repeat',
    origin: 'padding-box, padding-box, padding-box, padding-box, padding-box, padding-box, padding-box, padding-box',
    attachment: 'scroll, scroll, scroll, scroll, scroll, scroll, scroll, scroll',
  },
  box: boxAt(121, 39, 1124, 838, { paddings: [20, 14, 50, 14] }),
};
const SCORE_LABEL = { left: 925.36, top: 66.3, right: 1004.11, bottom: 80.3 };
const SCORE_TEXT = [159, 176, 204, 1];

test('a glow is read where the text is: the arena\'s pink glow behind "Your score" is as faint as it is drawn there, not its centre', () => {
  const page = { color: 'rgb(255, 255, 255)', box: boxAt(0, 0, 1366, 877, { canvas: true }) };
  const there = backgroundsOver(SCORE_LABEL, [page, ARENA_PAGE]);
  const ratio = ratioOf(SCORE_TEXT, there);
  assert.ok(ratio >= 4.5, `"Your score" read where it is: ${ratio.toFixed(2)}:1`);
  // The pixels behind the label give 6.8:1: the reading at the label is no
  // brighter than the screen there, nor darker.
  assert.ok(Math.abs(ratio - 6.8) < 0.3, `close to the pixels' 6.8:1: ${ratio.toFixed(2)}:1`);
  // Read whole, the glow counted at its centre colour over the stage's top
  // colour, which lies above the page: 4.44:1, a failure the screen never shows.
  const whole = backgroundsOf([{ color: 'rgb(255, 255, 255)' }, { color: ARENA_PAGE.color, image: ARENA }]);
  assert.equal(ratioOf(SCORE_TEXT, whole).toFixed(2), '4.44');
  // The pink is there, faintly: the label's lightest background is pinker than the stage.
  const lightest = there.reduce((a, b) => (luminance(a) > luminance(b) ? a : b));
  assert.ok(lightest[0] > 22 && lightest[0] < 111, `a faint pink over the stage: ${lightest}`);
});

test('light text on a light gradient still fails wherever it is read', () => {
  const light = [200, 210, 230, 1];
  const screen = boxAt(0, 0, 1366, 768);
  const page = { color: 'rgb(9, 17, 40)', box: boxAt(0, 0, 1366, 768, { canvas: true }) };
  const sweep = [];
  for (let top = 0; top < 768; top += 64) for (let left = 0; left < 1366; left += 128) sweep.push(rectAt(left, top, 96, 18));
  // A light gradient behind the text, every text box on it.
  const lightGradient = { background: { image: 'linear-gradient(rgb(255, 255, 255), rgb(232, 240, 254))' }, box: screen };
  for (const rect of sweep) assert.ok(ratioOf(light, backgroundsAt(rect, [page, lightGradient])) < 4.5, `on the light gradient at ${JSON.stringify(rect)}`);
  // A white glow on a dark stage: text on its bright middle fails; far from it, on the stage, passes.
  const glow = { background: { image: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.95), rgba(0, 0, 0, 0) 200px)' }, box: screen };
  assert.ok(ratioOf(light, backgroundsAt(rectAt(640, 375, 86, 18), [page, glow])) < 1.5, 'on the glow\'s middle');
  assert.ok(ratioOf(light, backgroundsAt(rectAt(20, 20, 86, 18), [page, glow])) >= 4.5, 'on the dark stage, far from it');
  // A white glow centred above the page, as the pink one is: at the page's top edge it is still bright.
  const above = { background: { image: 'radial-gradient(60% 45% at 50% -8%, rgba(255, 255, 255, 0.9), rgba(0, 0, 0, 0) 70%)' }, box: screen };
  assert.ok(ratioOf(light, backgroundsAt(rectAt(640, 4, 86, 18), [page, above])) < 4.5, 'at the top, under a glow centred above the page');
});

test('a dark glow fading over a dark stage passes wherever the text is, on a laptop and a phone', () => {
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const page = { color: 'rgb(255, 255, 255)', box: boxAt(0, 0, width, height, { canvas: true }) };
    const stage = { background: { image: STAGE }, box: boxAt(0, 0, width, height) };
    let worst = Infinity;
    for (let top = 0; top < height; top += 24) {
      for (let left = 0; left < width; left += 48) worst = Math.min(worst, ratioOf(STAGE_TEXT, backgroundsAt(rectAt(left, top, 72, 20), [page, stage])));
    }
    assert.ok(worst >= 4.5, `${width}×${height}: the lightest text box on the stage is ${worst.toFixed(2)}:1`);
  }
});

test('a long line is read cell by cell: two glows at its two ends are not counted on top of each other', () => {
  // A phone-wide line on a dark stage, a glow at each end of it, neither reaching the middle.
  const glows = 'radial-gradient(circle at 0% 50%, rgba(255, 255, 255, 0.5), rgba(0, 0, 0, 0) 120px), radial-gradient(circle at 100% 50%, rgba(255, 255, 255, 0.5), rgba(0, 0, 0, 0) 120px)';
  const boxes = [{ color: 'rgb(0, 0, 0)', box: boxAt(0, 0, 390, 100, { canvas: true }) }, { background: { image: glows }, box: boxAt(0, 0, 390, 100) }];
  const line = rectAt(10, 40, 370, 20);
  assert.ok(cellsOf(line).length > 1 && cellsOf(line).every((cell) => cell.right - cell.left <= 16 && cell.bottom - cell.top <= 16), 'cells of at most 16px');
  const lightest = (candidates) => Math.max(...candidates.map(luminance));
  const oneGlow = luminance(backgroundsAt(rectAt(10, 40, 1, 20), boxes).reduce((a, b) => (luminance(a) > luminance(b) ? a : b)));
  // Read as one box, the brightest end of each glow is put over the other's.
  assert.ok(lightest(backgroundsAt(line, boxes)) > oneGlow * 1.5, 'as one box: both ends at once');
  // Cell by cell, the line is never brighter than one glow's brightest point on it.
  assert.ok(lightest(backgroundsOver(line, boxes)) <= oneGlow + 1e-9, 'cell by cell: one glow at a time');
  // A box smaller than a cell is one cell.
  assert.deepEqual(cellsOf(rectAt(5, 5, 10, 10)), [rectAt(5, 5, 10, 10)]);
});

test('a tile that does not reach the text leaves it bare, and one it straddles shows both', () => {
  // A light glow on a tile as tall as one screen, at the top of a long page; the floor below.
  const background = { image: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.9))', size: '100% 768px', positionX: '50%', positionY: '0%', repeat: 'no-repeat' };
  const long = { color: 'rgb(6, 8, 24)', background, box: boxAt(0, 0, 1366, 2000) };
  const page = { color: 'rgb(255, 255, 255)', box: boxAt(0, 0, 1366, 2000, { canvas: true }) };
  assert.deepEqual(backgroundsAt(rectAt(100, 1000, 80, 20), [page, long]), [[6, 8, 24]], 'below the tile: the floor alone');
  const straddling = backgroundsAt(rectAt(100, 760, 80, 20), [page, long]);
  assert.equal(straddling.length, 2, `across its edge: the glow and the floor, ${JSON.stringify(straddling)}`);
  assert.ok(straddling.some((c) => c.join() === '6,8,24'));
  assert.deepEqual(backgroundsAt(rectAt(100, 100, 80, 20), [page, long]), [[230, 230, 232]], 'on it: the glow over the floor');
  // "right 10px bottom 4px", as Chromium computes it: a 50×20 tile 10px from the right and 4px from the bottom.
  const corner = { color: 'rgb(6, 8, 24)', background: { image: 'linear-gradient(rgb(255, 255, 255), rgb(255, 255, 255))', size: '50px 20px', positionX: 'calc(100% - 10px)', positionY: 'calc(100% - 4px)', repeat: 'no-repeat' }, box: boxAt(0, 0, 400, 300) };
  assert.deepEqual(backgroundsAt(rectAt(345, 280, 40, 12), [page, corner]), [[255, 255, 255]], 'on the tile in the corner');
  assert.deepEqual(backgroundsAt(rectAt(300, 280, 30, 12), [page, corner]), [[6, 8, 24]], 'beside it');
});

test('a repeating gradient is read by its period: a grid line counts only where the text box crosses one', () => {
  const grid = { background: { image: 'repeating-linear-gradient(90deg, rgba(53, 227, 255, 0.5) 0px, rgba(53, 227, 255, 0.5) 1px, rgba(0, 0, 0, 0) 1px, rgba(0, 0, 0, 0) 64px)' }, box: boxAt(0, 0, 1366, 768) };
  const stage = { color: 'rgb(6, 8, 24)', box: boxAt(0, 0, 1366, 768, { canvas: true }) };
  assert.deepEqual(backgroundsAt(rectAt(140, 10, 40, 20), [stage, grid]), [[6, 8, 24]], 'between two lines: the stage');
  const crossing = backgroundsAt(rectAt(180, 10, 40, 20), [stage, grid]);
  assert.ok(crossing.some((c) => c[1] > 100), `across the line at 192px: ${JSON.stringify(crossing)}`);
  assert.ok(backgroundsAt(rectAt(10, 10, 200, 20), [stage, grid]).some((c) => c[1] > 100), 'wider than a period: every colour of it');
});

test('gradient geometry: lines, corners, circles and ellipses where CSS draws them', () => {
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);
  // A corner: 0% at the opposite corner, 100% at that one, half way at the other two.
  const corner = gradientGeometry(parseGradient('linear-gradient(to right bottom, rgb(255, 0, 0), rgb(0, 0, 255))'), 400, 100);
  close(corner.at(0, 0), 0, 'from the top left');
  close(corner.at(400, 100), corner.length, 'to the bottom right');
  close(corner.at(400, 0), corner.length / 2, 'the top right');
  close(corner.at(0, 100), corner.length / 2, 'the bottom left');
  // An angle: 90deg runs left to right, the line as long as the box is wide.
  const right = gradientGeometry(parseGradient('linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))'), 400, 100);
  close(right.length, 400, 'its length');
  close(right.at(100, 77), 100, 'a point a quarter across');
  // No direction is "to bottom".
  close(gradientGeometry(parseGradient('linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))'), 400, 100).at(3, 25), 25, 'down');
  // An explicit ellipse: rx and ry are percentages of the tile's width and height.
  const glow = gradientGeometry(parseGradient(ARENA.split('), ')[0] + ')'), 1366, 768);
  close(glow.length, 0.6 * 1366, 'its ray');
  close(glow.at(683, -0.08 * 768), 0, 'its centre, above the tile');
  close(glow.at(683, -0.08 * 768 + 0.45 * 768), glow.length, 'its edge straight down');
  assert.deepEqual(glow.range(600, 10, 700, 30).map((t) => Math.round(t)), [Math.round(glow.at(683, 10)), Math.round(glow.at(600, 30))], 'over a box: nearest point to farthest corner');
  // A circle reaching the farthest corner by default, and closest-side.
  const circle = gradientGeometry(parseGradient('radial-gradient(circle at 35% 30%, rgb(255, 0, 0), rgb(0, 0, 255))'), 200, 100);
  close(circle.length, Math.hypot(130, 70), 'farthest corner');
  const nearest = gradientGeometry(parseGradient('radial-gradient(closest-side at 20px 30px, rgb(255, 0, 0), rgb(0, 0, 255))'), 200, 100);
  close(nearest.length, 20, 'an ellipse as wide as the nearest side is far');
  close(nearest.at(20, 60), nearest.length, 'and as tall: its edge 30px down');
  // The default ellipse passes through the corners.
  const ellipse = gradientGeometry(parseGradient('radial-gradient(rgb(255, 0, 0), rgb(0, 0, 255))'), 200, 100);
  close(ellipse.at(200, 100), ellipse.length, 'through the corner');
  close(ellipse.length, Math.SQRT2 * 100, 'sqrt(2) times half the width');
  assert.equal(gradientGeometry(parseGradient('conic-gradient(rgb(255, 0, 0), rgb(0, 0, 255))'), 10, 10), null, 'a conic gradient has no line or ray');
});

test('stops: places fixed up as CSS says, and colours mixed premultiplied as browsers mix them', () => {
  const stops = (css, length) => resolveStops(parseGradient(css).stops, length);
  assert.deepEqual(stops('linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255) 50%, rgb(0, 255, 0), rgb(255, 255, 0))', 100).map((s) => s.pos), [0, 50, 75, 100], 'unplaced stops spread between placed ones');
  assert.deepEqual(stops('linear-gradient(rgb(255, 0, 0) 50%, rgb(0, 0, 255) 20%)', 100).map((s) => s.pos), [50, 50], 'never before an earlier one');
  assert.deepEqual(stops('linear-gradient(rgb(255, 0, 0) 0px, rgb(0, 0, 255) 32px)', 64).map((s) => s.pos), [0, 32]);
  // Half way from a glow's centre to transparent: its own colour at half the alpha, not darkened toward black.
  const glow = stops('radial-gradient(rgba(255, 63, 209, 0.38), rgba(0, 0, 0, 0) 70%)', 100);
  assert.deepEqual(colourAt(glow, 35).map((v) => Math.round(v * 100) / 100), [255, 63, 209, 0.19]);
});

test('an image the review cannot place is read whole: a conic gradient, a turned box, a colour it cannot read, a hint', () => {
  const screen = boxAt(0, 0, 400, 300);
  const rect = rectAt(10, 10, 40, 20);
  const glow = 'radial-gradient(circle at 90% 90%, rgba(255, 255, 255, 0.9), rgba(0, 0, 0, 0) 30px)';
  assert.deepEqual(imageLayersAt({ image: glow }, screen, rect), [{ stops: [[0, 0, 0, 0]], placed: true }], 'far from the glow, placed: bare');
  assert.deepEqual(imageLayersAt({ image: glow }, { ...screen, plain: false }, rect), [{ stops: [[255, 255, 255, 0.9], [0, 0, 0, 0]], placed: false }], 'a turned box: every stop');
  assert.equal(imageLayersAt({ image: 'repeating-conic-gradient(rgb(244, 246, 255) 0%, rgb(244, 246, 255) 25%, rgb(17, 20, 42) 0%, rgb(17, 20, 42) 50%)' }, screen, rect)[0].placed, false);
  assert.equal(imageLayersAt({ image: 'linear-gradient(oklch(0.9 0.02 250), rgb(0, 0, 0))' }, screen, rect)[0].placed, false);
  assert.equal(imageLayersAt({ image: 'linear-gradient(rgb(0, 0, 0) 0%, 20%, rgb(200, 200, 200) 100%)' }, screen, rect)[0].placed, false, 'a colour hint');
  assert.equal(imageLayersAt({ image: glow, size: 'calc(50% + 10px) auto' }, screen, rect)[0].placed, false, 'a size in calc()');
  assert.equal(imageLayersAt({ image: glow, attachment: 'fixed' }, screen, rect)[0].placed, false, 'a fixed attachment');
  assert.deepEqual(imageLayersAt({ image: 'url("a.png")' }, screen, rect), [{ stops: [], placed: false }]);
  // Read whole, a fading layer is over what covers the box, never over another such layer.
  const two = compositeLayers([[0, 0, 0]], [[[255, 255, 255, 0.5], [0, 0, 0, 0]], [[255, 255, 255, 0.5], [0, 0, 0, 0]]]);
  assert.deepEqual(two.sort(), [[0, 0, 0], [128, 128, 128]]);
});

// The question panel's scroll shadows (.question-prompt-panel), as Chromium
// computes them on a phone, where the panel scrolls: two covers in the page's
// colour attached `local`, over two 10 px bands of 28% grey attached `scroll`.
// The exam-practice chip scene's "YOUR TASK" sits 10 px under the panel's top.
const SCROLL_SHADOWS = {
  image: 'linear-gradient(rgb(248, 249, 250), rgba(0, 0, 0, 0)), linear-gradient(to top, rgb(248, 249, 250), rgba(0, 0, 0, 0)), linear-gradient(color(srgb 0.12549 0.129412 0.141176 / 0.28), rgba(0, 0, 0, 0)), linear-gradient(to top, color(srgb 0.12549 0.129412 0.141176 / 0.28), rgba(0, 0, 0, 0))',
  size: '100% 20px, 100% 20px, 100% 10px, 100% 10px',
  positionX: '50%, 50%, 50%, 50%',
  positionY: '0%, 100%, 0%, 100%',
  repeat: 'no-repeat, no-repeat, no-repeat, no-repeat',
  attachment: 'local, local, scroll, scroll',
};
const PANEL = (scrollTop, extra = {}) => ({ ...boxAt(1, 70, 388, 211), scroll: { left: 0, top: scrollTop, width: 388, height: 600 }, ...extra });
const PHONE_PAGE = { color: 'rgb(248, 249, 250)', box: boxAt(0, 0, 390, 844, { canvas: true }) };
const panelAt = (rect, panel) => backgroundsOver(rect, [PHONE_PAGE, { background: SCROLL_SHADOWS, box: panel }]);
const TASK_LABEL = rectAt(13, 80, 72, 23);
const IN_THE_BAND = rectAt(13, 71, 72, 8);
const TASK_BLUE = [23, 78, 166, 1];
const TOOLS_GREY = [95, 99, 104, 1];
const darkest = (candidates) => Math.min(...candidates.map(([r, g, b]) => r + g + b));

test('a box that scrolls is read where it is scrolled to: the question panel\'s shadows count only in their bands', () => {
  for (const scrollTop of [0, 40, 389]) {
    const candidates = panelAt(TASK_LABEL, PANEL(scrollTop));
    assert.deepEqual(candidates.map((c) => c.slice(0, 3).map(Math.round)), [[248, 249, 250]], `scrolled ${scrollTop}: under "YOUR TASK", only the page`);
    assert.ok(ratioOf(TASK_BLUE, candidates) >= 4.5, `scrolled ${scrollTop}: "YOUR TASK" passes`);
  }
  // In the top band: at the top of the scroll the local cover hides the shadow;
  // scrolled, the cover has moved up with the content and the shadow shows.
  const covered = panelAt(IN_THE_BAND, PANEL(0));
  const shown = panelAt(IN_THE_BAND, PANEL(40));
  assert.ok(darkest(shown) < darkest(covered), 'the cover moves with the content, the shadow stays on the box');
  assert.ok(shown.some(([r, g, b]) => Math.abs(r - 194) <= 2 && Math.abs(g - 195) <= 2 && Math.abs(b - 196) <= 2), 'the band where the text is: the shadow at about 25% just under the top edge');
  assert.ok(ratioOf(TOOLS_GREY, shown) < 4.5, 'grey text in the shadow band still fails (3.43:1)');
  assert.ok(ratioOf(TOOLS_GREY, covered) >= 4.5, 'and passes there at the top of the scroll, under the cover (4.62:1)');
  // Read whole, as before (a box between it and the text scrolls), the band's grey
  // is behind the label too: the run that failed "YOUR TASK" at 4.17:1.
  const whole = panelAt(TASK_LABEL, PANEL(0, { plain: false }));
  assert.ok(whole.some(([r, g, b]) => Math.abs(r - 188) <= 2 && Math.abs(g - 189) <= 2 && Math.abs(b - 190) <= 2), 'read whole: the grey is a candidate');
  assert.ok(ratioOf(TASK_BLUE, whole) < 4.5);
});

test('`local` paints as `scroll` on a box that does not scroll, and with the content on one that does', () => {
  const band = { image: 'linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))', size: '100% 20px', positionX: '0%', positionY: '0%', repeat: 'no-repeat', attachment: 'local' };
  const still = boxAt(0, 100, 300, 200);
  assert.deepEqual(imageLayersAt(band, still, rectAt(10, 105, 50, 10))[0], { stops: [[0, 0, 0, 1]], placed: true }, 'not scrolling: the band is at the top of the box');
  const scrolled = { ...still, scroll: { left: 0, top: 50, width: 300, height: 500 } };
  assert.deepEqual(imageLayersAt(band, scrolled, rectAt(10, 105, 50, 10))[0], { stops: [[0, 0, 0, 0]], placed: true }, 'scrolled 50 px: the band has gone up with the content');
  assert.deepEqual(imageLayersAt({ ...band, attachment: 'scroll' }, scrolled, rectAt(10, 105, 50, 10))[0], { stops: [[0, 0, 0, 1]], placed: true }, '`scroll` stays on the box');
  assert.equal(imageLayersAt({ ...band, origin: 'border-box' }, scrolled, rectAt(10, 105, 50, 10))[0].placed, false, 'a local image placed from the border box is read whole');
});

test('the review places a box that scrolls by its own scroll, and reads whole only a box the text crosses inside another', () => {
  const review = executableSource(readFileSync(new URL('../browser/contrastReview.mjs', import.meta.url), 'utf8'));
  assert.match(review, /const still = !chain\.slice\(i \+ 1\)\.some\(\(_, k\) => moves\(i \+ 1 \+ k\)\);/, 'only the boxes between a box and the text decide whether it is read whole');
  assert.match(review, /const ownScroll = i > 0 && scrolls\(node, styles\[i\]\);/);
  assert.match(review, /scroll: ownScroll \? \{ left: node\.scrollLeft, top: node\.scrollTop, width: node\.scrollWidth, height: node\.scrollHeight \} : null,/, 'a box that scrolls hands over where it is scrolled to');
});

test('past 400 candidates, the darkest and the lightest are kept', () => {
  const stops = Array.from({ length: 600 }, (_, i) => [Math.floor(i / 3), (i % 3) * 10, 0, 1]);
  const candidates = compositeLayers([PAGE], [stops]);
  assert.equal(candidates.length, 400);
  assert.ok(candidates.some((c) => c.join() === '0,0,0'), 'the darkest');
  assert.ok(candidates.some((c) => c.join() === '199,20,0'), 'the lightest, which came last');
});

test('the page runs the same functions, and the review reads every box\'s images at each of the text\'s boxes', () => {
  // Self-contained: evaluated with nothing around them, they answer as here.
  const window = {};
  new Function('window', backgroundLayersInPage)(window);
  assert.deepEqual(window.__crLayers.gradientLayers(STAGE), gradientLayers(STAGE));
  assert.deepEqual(window.__crLayers.compositeLayers([PAGE], gradientLayers(STAGE).reverse()), compositeLayers([PAGE], gradientLayers(STAGE).reverse()));
  assert.deepEqual(window.__crLayers.imageLayersAt(ARENA_PAGE.background, ARENA_PAGE.box, SCORE_LABEL), imageLayersAt(ARENA_PAGE.background, ARENA_PAGE.box, SCORE_LABEL));
  const review = executableSource(readFileSync(new URL('../browser/contrastReview.mjs', import.meta.url), 'utf8'));
  assert.match(review, /await page\.evaluate\(backgroundLayersInPage\);\s*const described = await page\.evaluate\(collectInPage,/, 'given to the page before it is read');
  assert.match(review, /for \(const image of window\.__crLayers\.imageLayersAt\(background, boxes\[i\], rects\[k\] \|\| null\)\.reverse\(\)\)/, 'each box\'s images at each text box, the last first');
  assert.match(review, /perRect = perRect\.map\(\(candidates, k\) => window\.__crLayers\.compositeLayers\(candidates, layersByRect\[k\]\)\);/, 'composited for each text box');
  assert.match(review, /const rects = textBoxes\(el\)\.flatMap\(\(box\) => window\.__crLayers\.cellsOf\(box\)\);/, 'each text box cell by cell');
});
