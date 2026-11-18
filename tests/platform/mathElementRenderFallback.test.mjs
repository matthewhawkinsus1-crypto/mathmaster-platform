import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ensureMathElementRenders, mathElementHasRendered } from '../../src/platform/math/ensureMathElementRenders.js';

// Live QA round 2, 390×844 phone Work View: a Step Algebra board opened during
// interaction showed "LEFT SIDE = RIGHT SIDE" with no terms. MathLive's own
// lazy observer never reported the zero-width, not-yet-rendered elements.
const fakeWindow = ({ observers = true } = {}) => {
  const timers = [];
  const frames = [];
  let observerCallback = null;
  const win = {
    innerHeight: 844,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    ...(observers ? {
      IntersectionObserver: class {
        constructor(callback) { observerCallback = callback; }
        observe() {}
        disconnect() {}
      },
    } : {}),
  };
  // The latest observer reports the element on screen (intersect) or off it (leave).
  return {
    win,
    runTimers: () => timers.forEach((fn) => fn()),
    runFrames: () => frames.forEach((fn) => fn()),
    intersect: () => observerCallback?.([{ isIntersecting: true }]),
    leave: () => observerCallback?.([{ isIntersecting: false }]),
  };
};
const element = (top) => {
  const el = {
    isConnected: true,
    renders: 0,
    shadowRoot: { querySelector: () => ({ childElementCount: el.renders }) },
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ top, bottom: top + 20 }),
    render() { el.renders += 1; },
  };
  return el;
};

test('an on-screen math element that never rendered is rendered', () => {
  // The first look never reported (no frame came): shortly after, a second observer looks.
  const { win, runTimers, intersect } = fakeWindow();
  const el = element(400);
  assert.equal(mathElementHasRendered(el), false);
  ensureMathElementRenders(el, win);
  runTimers();
  intersect();
  assert.equal(el.renders, 1);
  runTimers();
  assert.equal(el.renders, 1, 'rendered once');
  // A browser without observers measures it instead.
  const bare = fakeWindow({ observers: false });
  const measured = element(400);
  ensureMathElementRenders(measured, bare.win);
  bare.runTimers();
  assert.equal(measured.renders, 1);
});

test('the second observer renders it when it comes into view', () => {
  const { win, runFrames, intersect } = fakeWindow();
  const el = element(400);
  ensureMathElementRenders(el, win);
  runFrames();
  intersect();
  assert.equal(el.renders, 1);
});

test('off-screen math stays lazy', () => {
  const { win, runFrames, runTimers, leave } = fakeWindow();
  const el = element(5000);
  ensureMathElementRenders(el, win);
  runFrames();
  leave();
  runTimers();
  assert.equal(el.renders, 0);
  const bare = fakeWindow({ observers: false });
  const measured = element(5000);
  ensureMathElementRenders(measured, bare.win);
  bare.runTimers();
  assert.equal(measured.renders, 0);
});

test('MathDisplay wires the fallback to its element', () => {
  const source = readFileSync(new URL('../../src/MathDisplay.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ ensureMathElementRenders \} from '\.\/platform\/math\/ensureMathElementRenders\.js';/);
  assert.match(source, /useEffect\(\(\) => ensureMathElementRenders\(elementRef\.current\), \[cleanValue, format\]\);\s*if \(!cleanValue\) return null;/);
  assert.match(source, /<Element\s*ref=\{elementRef\}/);
});

// Each look is an observer's, which measures the element as the page is drawn:
// measured in the observer's callback or in the timer, after a render had
// changed the page, it laid the page out once more on a Next (forced layouts,
// the runtime driver's trace mode). The timer's second look is an observer of
// its own, and an element the first has reported off screen is left to it,
// which reports again when the element comes in.
const renderFallback = () => {
  const timers = [];
  const frames = [];
  let report = null;
  const win = {
    innerHeight: 844,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    IntersectionObserver: class {
      constructor(callback) { report = callback; }
      observe() {}
      disconnect() {}
    },
  };
  const element = { isConnected: true, renders: 0, measured: 0 };
  Object.assign(element, {
    shadowRoot: { querySelector: () => ({ childElementCount: element.renders }) },
    getClientRects: () => { element.measured += 1; return [1]; },
    getBoundingClientRect: () => { element.measured += 1; return { top: 400, bottom: 420 }; },
    render() { element.renders += 1; },
  });
  ensureMathElementRenders(element, win);
  frames.forEach((fn) => fn());
  return { element, report: (entries) => report(entries), runTimers: () => timers.forEach((fn) => fn()) };
};

test('the math render fallback renders from its observer\'s report without measuring the element again', () => {
  const onScreen = renderFallback();
  onScreen.report([{ isIntersecting: true }]);
  assert.deepEqual([onScreen.element.renders, onScreen.element.measured], [1, 0], 'rendered, and not measured: the observer already has');
  onScreen.runTimers();
  assert.equal(onScreen.element.renders, 1);

  const offScreen = renderFallback();
  offScreen.report([{ isIntersecting: false }]);
  offScreen.runTimers();
  assert.deepEqual([offScreen.element.renders, offScreen.element.measured], [0, 0], 'off screen stays lazy, and the timer leaves it to the observer');

  // The first observer had not reported when the timer came (a slow frame): the second look is another observer's.
  const unreported = renderFallback();
  unreported.runTimers();
  assert.deepEqual([unreported.element.renders, unreported.element.measured], [0, 0], 'not measured by the timer');
  unreported.report([{ isIntersecting: true }]);
  assert.deepEqual([unreported.element.renders, unreported.element.measured], [1, 0], 'rendered from the second observer\'s report');
});
