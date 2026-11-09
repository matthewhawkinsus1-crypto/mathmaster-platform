// THE SIGN-IN PATH READS THE PINCH-ZOOM CHECK ALONE (PF01, the sign-in path).
//
// main.jsx installs the pinch-zoom root flag before the sign-in screen draws
// (platform/layout/pinchZoomReveal.js), so typing while zoomed does not jump
// the page there either. The flag needs two names: the zoom threshold and
// whether the visual viewport is past it. They came from
// mobileInteractionFoundation.js, which also holds the breakpoints, tap
// placement and popover layout only the app's screens use, and that whole
// module (1.1 KB gzip) loaded before the sign-in screen and before Home. The
// two names live in pinchZoomScale.js now, re-exported by the foundation as
// the same bindings, so no caller and no answer changes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, repo, signInGraph } from './helpers/firstLoadGraph.mjs';
import * as foundation from '../../src/platform/mobile/mobileInteractionFoundation.js';
import * as scale from '../../src/platform/mobile/pinchZoomScale.js';
import { PINCH_ZOOM_ROOT_ATTRIBUTE, installPinchZoomRootFlag } from '../../src/platform/layout/pinchZoomReveal.js';

const file = (name) => path.join(repo, name);
const signIn = signInGraph();

test('the walker reaches the pinch-zoom root flag and its check on the sign-in path', () => {
  for (const name of ['src/platform/layout/pinchZoomReveal.js', 'src/platform/mobile/pinchZoomScale.js']) {
    assert.ok(signIn.has(file(name)), `${name} is not on the sign-in path: the walk or the wiring changed, so the absence below proves nothing`);
  }
});

test('mobileInteractionFoundation.js is not on the sign-in path', () => {
  const key = file('src/platform/mobile/mobileInteractionFoundation.js');
  assert.ok(existsSync(key), 'mobileInteractionFoundation.js no longer exists: point this test at the module that took its place');
  assert.ok(!signIn.has(key), `mobileInteractionFoundation.js is on the sign-in path: ${signIn.has(key) ? chainTo(signIn, key) : ''}`);
});

test('every caller reads the same check: the foundation re-exports the same bindings', () => {
  assert.equal(foundation.PINCH_ZOOM_THRESHOLD, scale.PINCH_ZOOM_THRESHOLD);
  assert.equal(foundation.isBrowserPinchZoomed, scale.isBrowserPinchZoomed);
  // The threshold and the reading as they were before the move.
  assert.equal(scale.PINCH_ZOOM_THRESHOLD, 1.02);
  assert.equal(scale.isBrowserPinchZoomed({ visualViewport: { scale: 1.03 } }), true);
  assert.equal(scale.isBrowserPinchZoomed({ visualViewport: { scale: 1.02 } }), false);
  assert.equal(scale.isBrowserPinchZoomed({}), false);
  assert.equal(scale.isBrowserPinchZoomed(null), false);
  // The foundation's own viewport reading still uses the threshold.
  assert.equal(foundation.readStableViewportBox({ innerWidth: 390, innerHeight: 844, visualViewport: { scale: 1.5, width: 260, height: 563 } }).pinchZoomed, true);
});

test('the root flag the sign-in screen installs follows the zoom', () => {
  const listeners = {};
  const attributes = {};
  const fakeWindow = {
    visualViewport: { scale: 1, addEventListener: (type, listener) => { listeners[type] = listener; }, removeEventListener: () => {} },
    document: { documentElement: { setAttribute: (name, value) => { attributes[name] = value; }, removeAttribute: (name) => { delete attributes[name]; } } },
  };
  const uninstall = installPinchZoomRootFlag(fakeWindow);
  fakeWindow.visualViewport.scale = 1.5;
  Object.values(listeners).forEach((listener) => listener());
  assert.equal(attributes[PINCH_ZOOM_ROOT_ATTRIBUTE], 'true');
  fakeWindow.visualViewport.scale = 1;
  Object.values(listeners).forEach((listener) => listener());
  assert.equal(attributes[PINCH_ZOOM_ROOT_ATTRIBUTE], undefined);
  if (typeof uninstall === 'function') uninstall();
});
