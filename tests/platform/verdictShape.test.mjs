import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  LONG_VERDICT_CHARACTERS,
  VERDICT_CARD_RADIUS,
  VERDICT_PILL_RADIUS,
  verdictRadius,
  verdictTextLength,
  verdictWraps,
} from '../../src/tools/shared/verdictShape.js';

/*
 * PLATFORM QUIRKS AUDIT PQ-032: A VERDICT THAT WRAPS IS A CARD, NOT A LOZENGE.
 *
 * ResultPill kept a 999px radius at every length, so a sentence verdict that
 * wrapped became a two- or three-line lozenge (322x84 at 390px, 454x92 at
 * 1366px) whose curved ends ate into its first and last lines.
 */
test('a short one-line verdict stays a pill; a long or wrapped one is a 10px card', () => {
  assert.equal(verdictRadius({ textLength: 7, wrapped: false }), VERDICT_PILL_RADIUS, '"Not yet"');
  assert.equal(verdictRadius({ textLength: LONG_VERDICT_CHARACTERS, wrapped: false }), VERDICT_PILL_RADIUS, 'sixty characters is still a pill');
  assert.equal(verdictRadius({ textLength: LONG_VERDICT_CHARACTERS + 1, wrapped: false }), VERDICT_CARD_RADIUS, 'longer is a card before it is measured');
  assert.equal(verdictRadius({ textLength: 40, wrapped: true }), VERDICT_CARD_RADIUS, 'a shorter verdict that wraps on a phone is a card');
  assert.equal(VERDICT_CARD_RADIUS, 10);
});

test('the text length counts what a verdict renders, through arrays and elements', () => {
  const element = (children) => ({ $$typeof: Symbol.for('react.element'), props: { children } });
  assert.equal(verdictTextLength('Not yet'), 7);
  assert.equal(verdictTextLength(['Result: ', '3 + 1i', '.']), 15);
  assert.equal(verdictTextLength(element(['Focus ', element('and'), ' directrix'])), 19);
  assert.equal(verdictTextLength([null, false, undefined, 42]), 2);
});

test('a measured pill wraps when its content is more than one and a half lines tall', () => {
  // The single-line "• Not yet" measured 40px tall with 7px padding at 16px.
  assert.equal(verdictWraps({ height: 40, lineHeight: 25.6, fontSize: 16, paddingTop: 7, paddingBottom: 7 }), false);
  // The Chromebook Parabola Geometry verdict: three lines, 92px.
  assert.equal(verdictWraps({ height: 92, lineHeight: 25.6, fontSize: 16, paddingTop: 7, paddingBottom: 7 }), true);
  // line-height "normal" reads as NaN: about 1.2 font-sizes.
  assert.equal(verdictWraps({ height: 33, lineHeight: Number.NaN, fontSize: 16, paddingTop: 7, paddingBottom: 7 }), false);
  assert.equal(verdictWraps({ height: 52, lineHeight: Number.NaN, fontSize: 16, paddingTop: 7, paddingBottom: 7 }), true);
  assert.equal(verdictWraps({ height: 0, lineHeight: 20, fontSize: 16 }), false, 'an unmeasured pill is not called wrapped');
});

test('ResultPill takes its radius from the rule, measured where it renders', () => {
  const shell = executableSource(readFileSync(new URL('../../src/tools/shared/ToolShell.jsx', import.meta.url), 'utf8'));
  const pill = region(shell, 'export const ResultPill', '\n};', 'ResultPill');
  assert.match(pill, /const radius = verdictRadius\(\{ textLength: verdictTextLength\(children\), wrapped \}\);/);
  assert.match(pill, /borderRadius: radius,/);
  assert.doesNotMatch(pill, /borderRadius: 999/, 'a fixed lozenge radius is the defect');
  // Wrapping is measured after layout and again whenever the pill's size changes.
  assert.match(pill, /setWrapped\(verdictWraps\(\{/);
  assert.match(pill, /new ResizeObserver\(measure\)/);
  assert.match(shell, /import \{[^}]*\bverdictRadius\b[^}]*\} from '\.\/verdictShape\.js';/);
});
