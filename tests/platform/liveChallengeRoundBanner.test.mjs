/*
 * THE LIVE CHALLENGE ROUND BANNER HAS CONTRAST TO SPARE (AX22).
 *
 * The banner over a student's question is white text on a blue gradient. Its
 * light end was #1a73e8: white on that is 4.51:1, one rounding from failing AA,
 * and the small lines drawn at 80-90% white ("Points banked", "Your extra time
 * is on") were 3.5 to 4.0:1 there. These tests measure the colours the round
 * actually draws, at its faintest text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUND_BANNER_COLORS, roundBannerBackground } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const parse = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((channel) => channel / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Text at `alpha` opacity over an opaque background, as the eye gets it.
const over = (textHex, backgroundHex, alpha) => parse(textHex).map((channel, at) => channel * alpha + parse(backgroundHex)[at] * (1 - alpha));

// The faintest white on the banner: the "keep going" line is 80%. The gold is
// the banked points figure (#fdd663 in LiveChallengeStudent.jsx).
const FAINTEST_WHITE = 0.8;
const GOLD = '#fdd663';

for (const [state, stops] of Object.entries(ROUND_BANNER_COLORS)) {
  for (const stop of stops) {
    test(`the ${state} banner at ${stop}: white, faint white and the gold points all reach 4.5:1`, () => {
      assert.ok(contrast(parse('#ffffff'), parse(stop)) >= 4.5, `white ${contrast(parse('#ffffff'), parse(stop)).toFixed(2)}`);
      const faint = contrast(over('#ffffff', stop, FAINTEST_WHITE), parse(stop));
      assert.ok(faint >= 4.5, `80% white ${faint.toFixed(2)}`);
      const gold = contrast(parse(GOLD), parse(stop));
      assert.ok(gold >= 4.5, `gold ${gold.toFixed(2)}`);
    });
  }
}

test('the banner background is a gradient of exactly those stops', () => {
  for (const [state, stops] of Object.entries(ROUND_BANNER_COLORS)) {
    const css = roundBannerBackground(state === 'urgent');
    assert.match(css, /^linear-gradient\(/);
    stops.forEach((stop) => assert.ok(css.includes(stop), `${state}: ${stop} is in ${css}`));
  }
  assert.notEqual(roundBannerBackground(true), roundBannerBackground(false), 'the last ten seconds look different');
});

test('the round draws its banner from them, with no colour of its own', () => {
  const round = executableSource(componentSource('src/components/liveChallenge/LiveChallengeStudent.jsx'));
  assert.match(round, /background: roundBannerBackground\(urgent\)/);
  assert.doesNotMatch(round, /linear-gradient\(135deg,#174ea6/, 'the old gradient is gone');
});
