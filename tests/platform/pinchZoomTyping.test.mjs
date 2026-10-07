// TYPING WHILE PINCH-ZOOMED MUST NOT MOVE THE PAGE.
//
// A teacher presenting to the room pinch-zooms onto an answer box and types; a
// student on a Chromebook or phone does the same. Measured with a real pinch to
// 2.5x (tests/browser/pinchZoomTyping.mjs), typing moved the magnified view by
// 46-279px and could put the box off screen — on the teacher's laptop, a
// Chromebook and a phone alike. Three causes, three fixes, each shown in that
// harness to be necessary on its own (src/platform/layout/pinchZoomReveal.js):
//
//   1. MathLive's keyboard sink is position: fixed at the field's PAGE
//      position; index.css sits it on its own field.
//   2. App.css reserves ~300-500px around a revealed field; index.css drops it
//      while html[data-mm-pinch-zoomed] is set, which main.jsx installs.
//   3. MathLive's own reveal moves a field wider than the zoomed view; MathInput
//      and the calculator give it revealMathFieldHost instead.
//
// node cannot run a browser here, so this holds the logic and the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PINCH_ZOOM_ROOT_ATTRIBUTE,
  elementIntersectsVisualViewport,
  installPinchZoomRootFlag,
  revealMathFieldHost,
  revealUnlessVisibleWhileZoomed,
} from '../../src/platform/layout/pinchZoomReveal.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(file, 'utf8');

// A 1280x800 laptop pinched to 2.5x: a 512x320 magnified view, panned to
// (300, 250) inside the layout viewport.
const zoomedWindow = ({ scale = 2.5, offsetLeft = 300, offsetTop = 250, width = 512, height = 320 } = {}) => {
  const listeners = new Map();
  const attributes = new Map();
  return {
    visualViewport: {
      scale, offsetLeft, offsetTop, width, height,
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    },
    document: {
      documentElement: {
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
      },
    },
    listeners,
    attributes,
  };
};

const element = (rect) => {
  const calls = [];
  return {
    calls,
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    scrollIntoView: (options) => calls.push(options),
  };
};

test('a field is on the magnified screen when any part of it is inside the visual viewport', () => {
  const win = zoomedWindow();
  // A 700px-wide answer box whose left part is on the zoomed screen: on screen,
  // even though it does not fit. This is the box MathLive's "nearest" moved.
  assert.equal(elementIntersectsVisualViewport(element({ left: 350, top: 380, width: 700, height: 40 }), win), true);
  // On the LAYOUT viewport, but above the magnified area.
  assert.equal(elementIntersectsVisualViewport(element({ left: 350, top: 100, width: 200, height: 40 }), win), false);
  // To the right of it.
  assert.equal(elementIntersectsVisualViewport(element({ left: 900, top: 380, width: 200, height: 40 }), win), false);
  // Not rendered.
  assert.equal(elementIntersectsVisualViewport(element({ left: 350, top: 380, width: 0, height: 0 }), win), false);
});

test('zoomed onto a visible field, nothing scrolls; anything else still scrolls exactly as before', () => {
  const options = { block: 'nearest', inline: 'nearest' };

  const visible = element({ left: 350, top: 380, width: 700, height: 40 });
  assert.equal(revealUnlessVisibleWhileZoomed(visible, options, zoomedWindow()), false);
  assert.deepEqual(visible.calls, [], 'the field the person is looking at is left where it is');

  const offScreen = element({ left: 350, top: 100, width: 200, height: 40 });
  revealUnlessVisibleWhileZoomed(offScreen, options, zoomedWindow());
  assert.deepEqual(offScreen.calls, [options], 'a field off the magnified screen is still brought in');

  const unzoomed = element({ left: 350, top: 380, width: 700, height: 40 });
  revealUnlessVisibleWhileZoomed(unzoomed, options, zoomedWindow({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 1280, height: 800 }));
  assert.deepEqual(unzoomed.calls, [options], 'at 1x behaviour is unchanged');
});

test('MathLive\'s reveal hook acts on the <math-field> host it is handed', () => {
  const host = element({ left: 350, top: 380, width: 700, height: 40 });
  revealMathFieldHost({ host }, zoomedWindow());
  assert.deepEqual(host.calls, []);
  revealMathFieldHost({ host }, zoomedWindow({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 1280, height: 800 }));
  assert.deepEqual(host.calls, [{ block: 'nearest', inline: 'nearest' }], 'unzoomed, the same call MathLive makes itself');
});

test('the page-wide zoom flag follows the visual viewport and is removed on cleanup', () => {
  const win = zoomedWindow({ scale: 1 });
  const uninstall = installPinchZoomRootFlag(win);
  assert.equal(win.attributes.has(PINCH_ZOOM_ROOT_ATTRIBUTE), false);
  win.visualViewport.scale = 2.5;
  win.listeners.get('resize')();
  assert.equal(win.attributes.get(PINCH_ZOOM_ROOT_ATTRIBUTE), 'true');
  win.visualViewport.scale = 1;
  win.listeners.get('resize')();
  assert.equal(win.attributes.has(PINCH_ZOOM_ROOT_ATTRIBUTE), false);
  win.visualViewport.scale = 2;
  win.listeners.get('resize')();
  uninstall();
  assert.equal(win.listeners.has('resize'), false);
  assert.equal(win.attributes.has(PINCH_ZOOM_ROOT_ATTRIBUTE), false);
});

test('the installed MathLive still has the two behaviours these fixes answer', () => {
  const bundle = read('node_modules/mathlive/mathlive.mjs');
  const UPGRADE = 'MathLive changed: re-run tests/browser/pinchZoomTyping.mjs and re-check src/platform/layout/pinchZoomReveal.js.';
  // 1. The sink is fixed-position. If MathLive stops doing that, the index.css
  //    override may be unnecessary — or wrong.
  const sinkRule = region(bundle, '.ML__keyboard-sink {', '}', 'MathLive keyboard sink CSS');
  assert.match(sinkRule, /position:\s*fixed/, UPGRADE);
  // 3. onScrollIntoView REPLACES the host scroll (it is not called after it).
  const reveal = region(bundle, '  scrollIntoView() {', 'if (this.dirty)', 'MathLive scrollIntoView');
  assert.match(reveal, /if \(this\.options\.onScrollIntoView\) this\.options\.onScrollIntoView\(this\);\s*else \{\s*this\.host\.scrollIntoView/, UPGRADE);
});

test('index.css sits the keyboard sink on its field and drops the reveal allowances while zoomed', () => {
  const css = executableSource(read('src/index.css'));
  const sink = region(css, 'math-field::part(keyboard-sink) {', '}', 'keyboard sink override');
  assert.match(sink, /position:\s*absolute/);
  assert.match(sink, /top:\s*auto/, 'MathLive writes offsets into the sink; they are pinned');
  assert.match(sink, /left:\s*auto/, 'MathLive writes left: -1000px into the sink on selection');

  const padding = region(css, 'html[data-mm-pinch-zoomed="true"],', '}', 'zoomed scroll-padding');
  assert.match(padding, /html\[data-mm-pinch-zoomed="true"\] \.mathmaster-assignment-screen/);
  assert.match(padding, /scroll-padding:\s*0 !important/);
  const margin = region(css, 'html[data-mm-pinch-zoomed="true"] * {', '}', 'zoomed scroll-margin');
  assert.match(margin, /scroll-margin:\s*0 !important/);
});

test('the zoom flag is installed once for the whole app, and the question no longer clears it', () => {
  const main = executableSource(read('src/main.jsx'));
  assert.match(main, /import \{ installPinchZoomRootFlag \} from '\.\/platform\/layout\/pinchZoomReveal\.js'/);
  assert.match(main, /^installPinchZoomRootFlag\(window\);/m);
  // It used to be set by MobileViewportContainer and deleted when it unmounted,
  // so the next question read "not zoomed" while the person was still zoomed.
  assert.doesNotMatch(executableSource(read('src/components/student/MobileViewportContainer.jsx')), /mmPinchZoomed/);
});

test('every <math-field> MathMaster creates hands MathLive the zoom-aware reveal', () => {
  for (const file of ['src/MathInput.jsx', 'src/components/CalculatorPanel.jsx']) {
    const source = executableSource(read(file));
    assert.match(source, /import \{[^}]*\brevealMathFieldHost\b[^}]*\} from '[./]+platform\/layout\/pinchZoomReveal\.js'/, `${file} imports what it assigns (no-undef is not linted here)`);
    assert.match(source, /mathField\.onScrollIntoView = revealMathFieldHost;/, `${file} sets the hook on its field`);
  }
  const mathInput = executableSource(read('src/MathInput.jsx'));
  const focusEffect = region(mathInput, 'if (!focusSignal || !mfRef.current) return undefined;', '}, [focusSignal, isMobile, deferredFocusHost]);', 'focusSignal effect');
  assert.match(focusEffect, /revealUnlessVisibleWhileZoomed\(mathField, \{ block: 'nearest', inline: 'nearest' \}\)/);
  assert.doesNotMatch(focusEffect, /mathField\?\.scrollIntoView/, 'the app\'s own reveal is zoom-aware too');
});
