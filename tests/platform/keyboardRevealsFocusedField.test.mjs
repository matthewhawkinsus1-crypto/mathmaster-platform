/*
 * THE SCREEN KEYBOARD DOES NOT HIDE THE BOX BEING TYPED INTO (PH05; findings
 * B-68, C2-76, W7 decision 29).
 *
 * With the keyboard open at 390x480 the focused answer box showed 11 of its
 * 70px (38 on the base the finding was first measured on). Two causes, both
 * here:
 *
 *   - the keyboard opens AFTER focus lands. Focus revealed the box while the
 *     screen was whole, then the visible height fell from 844 to 480 and
 *     nothing looked again;
 *   - on Android Chrome and iOS the keyboard shrinks only the VISUAL viewport:
 *     the layout viewport and every getBoundingClientRect keep their size, so a
 *     box can be "inside its scroller" and under the keyboard at once.
 *
 * The real browser proof, in the App's phone shell, is
 * tests/browser/teacherWorkflow/keyboardPhoneJourneys.mjs (math box and plain
 * boxes, at 390x844 shrinking to 390x480). These run the reveal itself with
 * the geometry of the visual-viewport case, which Chromium cannot make on its
 * own, and bind the container's wiring. Each assertion was broken once to see
 * it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { revealFocusedControlAfterResize, scrollFocusedControlVertically } from '../../src/platform/mobile/mobileFocusViewport.js';

// A scroller and a box in layout coordinates, a visual viewport, and what the reveal did.
const scene = ({ scroller, target, visual = null, scale = 1, keypad = null }) => {
  const calls = [];
  const scrollerElement = {
    scrollLeft: 0,
    scrollTop: 0,
    parentElement: null,
    matches: () => false,
    getBoundingClientRect: () => ({ top: scroller.top, bottom: scroller.bottom, left: 0, right: 390 }),
    scrollBy: (options) => { calls.push(options); scrollerElement.scrollTop += options.top; },
  };
  const targetElement = {
    closest: () => scrollerElement,
    getBoundingClientRect: () => ({ top: target.top, bottom: target.bottom, left: 27, right: 313 }),
  };
  const windowObject = {
    scrollX: 0,
    scrollY: 0,
    scrollTo() {},
    visualViewport: visual ? { offsetTop: 0, offsetLeft: 0, scale, ...visual } : undefined,
  };
  const documentObject = {
    scrollingElement: { scrollLeft: 0, scrollTop: 0 },
    documentElement: { scrollLeft: 0 },
    body: { scrollLeft: 0 },
    querySelector: (selector) => (selector.includes('numeric-keypad') && keypad ? { getBoundingClientRect: () => ({ top: keypad.top, bottom: 844, left: 0, right: 390, height: 844 - keypad.top }) } : null),
  };
  const run = () => scrollFocusedControlVertically(targetElement, { root: null, margin: 12, windowObject, documentObject });
  return { run, calls, scrollerElement, targetElement, windowObject, documentObject };
};

test('a box inside its scroller but under the keyboard is scrolled up to just above it', () => {
  // Layout viewport 844 tall, keyboard up so the visible part is 480 tall: the scroller still ends at 783.
  const { run, calls } = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 627, bottom: 696 }, visual: { height: 480 } });
  assert.equal(run(), true);
  assert.equal(calls.length, 1);
  // Its bottom edge lands 12px above the top of the keyboard (480): 696 - 468.
  assert.equal(calls[0].top, 696 - (480 - 12));
  assert.equal(calls[0].left, 0, 'never sideways');
});

test('with the screen whole nothing moves', () => {
  const whole = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 627, bottom: 696 }, visual: { height: 844 } });
  assert.equal(whole.run(), true);
  assert.equal(whole.calls.length, 0, 'a box that is on screen is left where it is');
  const noVisualViewport = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 627, bottom: 696 } });
  noVisualViewport.run();
  assert.equal(noVisualViewport.calls.length, 0, 'a browser without a visual viewport behaves as it did');
});

test('a view the keyboard has panned down is measured from where it starts', () => {
  // iOS pans the visual viewport: it shows 190 to 670 of the layout.
  const below = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 640, bottom: 709 }, visual: { height: 480, offsetTop: 190 } });
  below.run();
  assert.equal(below.calls[0].top, 709 - (670 - 12), 'brought up to the bottom of what is showing');
  const above = scene({ scroller: { top: 100, bottom: 783 }, target: { top: 150, bottom: 219 }, visual: { height: 480, offsetTop: 190 } });
  above.run();
  assert.equal(above.calls[0].top, 150 - (190 + 12), 'brought down to the top of what is showing');
});

test('the keyboard of the page itself (the number keypad) still wins when it covers more', () => {
  const { run, calls } = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 450, bottom: 494 }, visual: { height: 700 }, keypad: { top: 480 } });
  run();
  assert.equal(calls[0].top, 494 - (480 - 12));
});

test('pinch zoom is a magnifying glass, not a keyboard: the visible band is not used', () => {
  // The same numbers as the keyboard case, at 2.5x: nothing is brought up.
  const { run, calls } = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 627, bottom: 696 }, visual: { height: 480 }, scale: 2.5 });
  run();
  assert.equal(calls.length, 0);
});

test('after the keyboard opens, the box being typed into is revealed again; nothing else is', () => {
  const inside = scene({ scroller: { top: 273, bottom: 783 }, target: { top: 627, bottom: 696 }, visual: { height: 480 } });
  // A button in the question, below the visible part: focused, it is the browser's to bring into view, not the typing reveal's.
  const button = { matches: () => false, getBoundingClientRect: () => ({ top: 700, bottom: 744 }), closest: () => inside.scrollerElement };
  const root = { contains: (element) => element === inside.targetElement || element === button };
  const documentWith = (active) => ({ ...inside.documentObject, activeElement: active });
  const reveal = (active, extra = {}) => revealFocusedControlAfterResize({ root, windowObject: inside.windowObject, documentObject: documentWith(active), ...extra });

  inside.targetElement.matches = (selector) => /math-field/.test(selector) || /\binput\b/.test(selector);
  assert.equal(reveal(inside.targetElement), true, 'a typing surface in the question');
  assert.equal(inside.calls.length, 1);

  const before = inside.calls.length;
  assert.equal(reveal(button), false, 'a button is not a typing surface');
  assert.equal(reveal(null), false, 'nothing has focus');
  const outside = { matches: () => true, getBoundingClientRect: () => ({ top: 700, bottom: 744 }), closest: () => inside.scrollerElement };
  assert.equal(reveal(outside), false, 'a box outside the question is not this container\'s to move');
  assert.equal(inside.calls.length, before, 'no scrolling for any of them');
});

test('the container looks again when the visible height changes, and only then', () => {
  const source = executableSource(readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'));
  const update = region(source, 'const updateViewportMode = () => {', 'updateViewportMode();', 'the viewport update');
  assert.match(update, /revealFocusedControlAfterResize\(\{ root: rootRef\.current \}\)/, 'it reveals the focused box');
  // Only on a phone, only when the height moved (not on a pan), never while zoomed.
  assert.match(update, /if \(mobile && Math\.abs\(nextViewport\.height - lastVisibleHeight\) > 1 && !nextViewport\.pinchZoomed\)/);
  // Two frames on: the container has its new height before the box is measured.
  assert.equal((update.match(/requestAnimationFrame/g) || []).length, 2);
  assert.match(update, /lastVisibleHeight = nextViewport\.height;/, 'the height it compares with is the last one seen');
});
