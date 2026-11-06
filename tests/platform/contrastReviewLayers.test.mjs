/*
 * THE CONTRAST REVIEW COMPOSITES A BOX'S BACKGROUND IMAGES AS LAYERS
 * (tests/browser/support/backgroundLayers.mjs, used by contrastReview.mjs).
 *
 * Fixtures are computed styles as Chromium writes them. A dark stage whose
 * glows fade to transparent over its own dark gradient (the Live Challenge
 * projector's stage, before it was given an opaque colour) must pass with its
 * light text; read as one list of stops over the white page, it failed. Light
 * text over a light gradient must still fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backgroundLayersInPage, compositeLayers, gradientLayers } from '../browser/support/backgroundLayers.mjs';
import { luminance, worstRatio } from '../browser/contrastReview.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const PAGE = [255, 255, 255];
const parseColour = (value) => {
  const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(value);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])] : null;
};
// What the review does for each box from the root down: its colour, then its
// images, the last first (the first is painted on top).
const backgroundsOf = (boxes) => boxes.reduce((candidates, { color = 'rgba(0, 0, 0, 0)', image = 'none' }) => {
  const colour = parseColour(color);
  const layers = [...(colour && colour[3] > 0 ? [[colour]] : []), ...[...gradientLayers(image)].reverse()];
  return compositeLayers(candidates, layers);
}, [PAGE]);

// LiveChallengeArenaProjector.jsx's stage, computed, with no colour under it.
const STAGE = 'radial-gradient(at 12% 12%, rgba(74, 103, 255, 0.24), rgba(0, 0, 0, 0) 34%), radial-gradient(at 88% 4%, rgba(174, 83, 255, 0.2), rgba(0, 0, 0, 0) 31%), radial-gradient(at 74% 90%, rgba(0, 206, 209, 0.12), rgba(0, 0, 0, 0) 36%), linear-gradient(145deg, rgb(17, 24, 49) 0%, rgb(9, 17, 40) 48%, rgb(18, 20, 46) 100%)';
const STAGE_TEXT = [247, 249, 255, 1];

test('a background\'s images are layers, read first image on top, each with its own stops', () => {
  const layers = gradientLayers(STAGE);
  assert.equal(layers.length, 4);
  assert.deepEqual(layers[0], [[74, 103, 255, 0.24], [0, 0, 0, 0]]);
  assert.deepEqual(layers[3], [[17, 24, 49, 1], [9, 17, 40, 1], [18, 20, 46, 1]], 'the stage itself, last');
  assert.deepEqual(gradientLayers('url("a.png"), linear-gradient(transparent, rgb(1, 2, 3))'), [[[0, 0, 0, 0], [1, 2, 3, 1]]], 'an image has no stops');
  assert.deepEqual(gradientLayers('none'), []);
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

test('the page runs the same two functions, and the review reads every box\'s images through them', () => {
  // Self-contained: evaluated with nothing around them, they answer as here.
  const window = {};
  new Function('window', backgroundLayersInPage)(window);
  assert.deepEqual(window.__crLayers.gradientLayers(STAGE), gradientLayers(STAGE));
  assert.deepEqual(window.__crLayers.compositeLayers([PAGE], gradientLayers(STAGE).reverse()), compositeLayers([PAGE], gradientLayers(STAGE).reverse()));
  const review = executableSource(readFileSync(new URL('../browser/contrastReview.mjs', import.meta.url), 'utf8'));
  assert.match(review, /await page\.evaluate\(backgroundLayersInPage\);\s*const described = await page\.evaluate\(collectInPage,/, 'given to the page before it is read');
  assert.match(review, /const images = node === el && gradientText\.length \? \[\] : window\.__crLayers\.gradientLayers\(s\.backgroundImage\);\s*for \(const stopsOfLayer of \[\.\.\.images\]\.reverse\(\)\)/, 'the last image first');
  assert.match(review, /candidates = window\.__crLayers\.compositeLayers\(candidates, layers\);/);
});
