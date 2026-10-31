/*
 * A TABLET HELD UPRIGHT RUNS ITS WORK VIEW ACTIONS ALONG THE BOTTOM (PH11;
 * finding A2-50).
 *
 * At 820x1180 the Work View had a 240px rail down the right for seven buttons:
 * 29% of the width went to a column that was blank below its seventh button,
 * and the plane was squeezed into the other 580px of a screen that has height
 * to spare. A tablet upright is a phone's problem turned round: width is the
 * scarce dimension, so the actions take a row (with a tablet's full labels and
 * the line saying what the view does) and the work gets the whole width.
 *
 * Where the actions go is decided once, in resolveWorkViewLayout, and stamped on
 * the host as data-controls. This pins that decision for the screens a school
 * has, and the one stylesheet fact the tablet's row needs that a phone's did
 * not (its caption). The geometry itself is proved in a browser:
 * tests/browser/studentUxPlatform.mjs `rail` measures Graphing 2 at 744x1133,
 * 768x1024, 820x1180, 834x1194 and 1024x1366 (a row, the work as wide as the
 * screen) and on a tablet on its side and a Chromebook (the rail it had). Each
 * assertion was broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveWorkViewLayout, WORK_VIEW_PORTRAIT_TABLET_MAX } from '../../src/platform/workView/workViewViewport.js';
import { parseCss, declared } from './helpers/cssRules.mjs';

const placement = (width, height, extra = {}) => resolveWorkViewLayout({ width, height, ...extra }).controlsPlacement;

// iPad mini, iPad, iPad Air, iPad Pro 11, iPad Pro 12.9 (CSS pixels, upright).
const IPADS_UPRIGHT = [[744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]];

test('a tablet held upright puts its actions in a row, and is still the full desktop view', () => {
  for (const [width, height] of IPADS_UPRIGHT) {
    const layout = resolveWorkViewLayout({ width, height });
    assert.equal(layout.controlsPlacement, 'bottom', `${width}x${height}`);
    // Not a phone: the tool header, the labels and the caption are the desktop's.
    assert.equal(layout.mode, 'desktop', `${width}x${height} is not a phone`);
  }
});

test('a tablet on its side, a Chromebook and a desktop keep the rail beside the work', () => {
  const screens = [[1024, 768], [1180, 820], [1194, 834], [1366, 1024], [1366, 768], [1366, 640], [1536, 864], [1920, 1080], [2039, 1146]];
  for (const [width, height] of screens) assert.equal(placement(width, height), 'side', `${width}x${height}`);
});

test('a phone keeps what it had: a row upright, a rail when it is short on its side', () => {
  assert.equal(placement(390, 844), 'bottom');
  assert.equal(placement(375, 667), 'bottom');
  assert.equal(placement(844, 390), 'side');
  assert.equal(placement(664, 390), 'side');
  assert.equal(placement(740, 360), 'side');
  // Width, not the device, is what a phone is: 700 wide on its side with room to spare is a row, as it was.
  assert.equal(placement(700, 600), 'bottom');
});

test('the row is for a screen as narrow as a tablet; a tall desktop window keeps the rail', () => {
  assert.equal(placement(WORK_VIEW_PORTRAIT_TABLET_MAX, 1600), 'bottom');
  assert.equal(placement(WORK_VIEW_PORTRAIT_TABLET_MAX + 1, 1600), 'side');
  // The bound is a tablet's, not a number the iPads above only just fit under.
  assert.ok(WORK_VIEW_PORTRAIT_TABLET_MAX >= 1024 && WORK_VIEW_PORTRAIT_TABLET_MAX < 1200);
});

test('the software keyboard does not move the actions: the layout height decides, not the visible one', () => {
  // Typing an answer on an upright iPad shrinks the visual viewport to 600px, and the row stays where it was.
  const typing = resolveWorkViewLayout({ width: 820, height: 1180, visualHeight: 600 });
  assert.equal(typing.controlsPlacement, 'bottom');
  assert.equal(typing.keyboardOpen, true);
  // And a tablet on its side with its keyboard up (a visual 420px tall) keeps its rail.
  assert.equal(placement(1180, 820, { visualHeight: 420 }), 'side');
});

test('the caption that says what the view does shows in a tablet\'s row and only a phone hides it', () => {
  const css = parseCss(readFileSync(new URL('../../src/components/common/WorkViewShell.css', import.meta.url), 'utf8'));
  const CAPTION = '.mathmaster-work-view-capabilities';
  const ROW = '[data-open="true"][data-controls="bottom"] .mathmaster-work-view-actions';
  // The row wraps (a phone's rule), so a caption that asks for the whole row is a line of its own under the buttons...
  assert.equal(declared(css, ROW, 'flex-wrap', { media: null })?.value, 'wrap');
  assert.match(declared(css, `[data-open="true"][data-controls="bottom"] ${CAPTION}`, 'flex', { media: null })?.value ?? '', /\s100%$/);
  // ...and nothing but the phone layout takes it away: a tablet's layout is the desktop's.
  const hiding = css.filter((rule) => rule.declarations.display?.value === 'none'
    && rule.selectors.some((selector) => selector.endsWith(CAPTION)));
  assert.ok(hiding.length > 0, 'a phone has no room for the caption');
  for (const rule of hiding) {
    for (const selector of rule.selectors.filter((entry) => entry.endsWith(CAPTION))) {
      assert.match(selector, /\[data-layout="mobile"\]/, `${selector} would hide the caption on a tablet`);
    }
  }
});
