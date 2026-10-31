/*
 * A WORK VIEW RAIL THAT HOLDS MORE THAN FITS SHOWS IT (PH08; findings C1-115,
 * B-74).
 *
 * Graphing 2's practice rail holds seven actions. On a phone on its side at
 * 740x360 seven 44px targets are 308px of a 311px rail, a fit the short-landscape
 * rules below were tuned to reach (workViewPhoneChrome.test.mjs, studentWorkspace
 * Visibility.test.mjs). There is no spare row: an eighth action (Hint, Read
 * aloud) is under the screen's edge, reached only by scrolling a rail that gave
 * no sign it scrolls.
 *
 * The geometry is proved in a browser (tests/browser/studentUxPlatform.mjs
 * `rail`: at 844x390, 740x360 and 667x375 every action Graphing 2 has is on
 * screen; with two more the rail scrolls, shows a soft edge, and its last action
 * is reached by scrolling). Nothing here renders CSS, so this binds the rule the
 * cue depends on. Each assertion was broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCss, declared, rulesFor } from './helpers/cssRules.mjs';

const css = parseCss(readFileSync(new URL('../../src/components/common/WorkViewShell.css', import.meta.url), 'utf8'));
const RAIL = '[data-open="true"] .mathmaster-work-view-actions';

test('the rail scrolls when it holds more than fits, whichever side it is on', () => {
  // The first rule for the rail makes it a scroller; the soft edge below depends on that.
  const own = rulesFor(css, RAIL, { media: null }).find((rule) => 'overflow' in rule.declarations);
  assert.equal(own?.declarations.overflow.value, 'auto');
  // The bottom row (a phone upright) scrolls the same way, capped at a quarter of the screen.
  assert.equal(declared(css, '[data-open="true"][data-controls="bottom"] .mathmaster-work-view-actions', 'overflow-y', { media: null })?.value, 'auto');
});

test('a soft edge shows on the side that has more, and a rail that fits shows neither', () => {
  const layers = declared(css, RAIL, 'background', { media: null })?.value ?? '';
  // Two covers that scroll with the content hide the two shadows fixed to the rail once an end is reached...
  assert.equal((layers.match(/\blocal\b/g) || []).length, 2, 'two covers');
  assert.equal((layers.match(/\bscroll\b/g) || []).length, 2, 'two shadows');
  assert.ok(layers.lastIndexOf('local') < layers.indexOf('scroll'), 'the covers are drawn over the shadows');
  // ...so a rail with nothing to scroll to is the plain surface: the colour under them is the rail's own.
  assert.match(layers, /,\s*var\(--mm-surface\)$/, 'the base colour is the rail\'s surface');
  // The covers are that same surface, or they would show as bands at the ends of a rail that fits.
  const covers = layers.split('local').slice(0, 2).join('');
  assert.equal((covers.match(/var\(--mm-surface\)/g) || []).length, 2, 'both covers are the surface colour');
  // Top and bottom, not the sides: the rail scrolls vertically.
  assert.match(layers, /to bottom, var\(--mm-surface\), transparent\) top center/);
  assert.match(layers, /to top, var\(--mm-surface\), transparent\) bottom center/);
});
