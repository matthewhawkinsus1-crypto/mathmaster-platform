import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ensureMathElementRenders, mathElementHasRendered } from '../../src/platform/math/ensureMathElementRenders.js';

// Live QA round 2, 390×844 phone Work View: a Step Algebra board opened during
// interaction showed "LEFT SIDE = RIGHT SIDE" with no terms. MathLive's own
// lazy observer never reported the zero-width, not-yet-rendered elements.
const fakeWindow = () => {
  const timers = [];
  const frames = [];
  let observerCallback = null;
  const win = {
    innerHeight: 844,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    IntersectionObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() {}
    },
  };
  return { win, runTimers: () => timers.forEach((fn) => fn()), runFrames: () => frames.forEach((fn) => fn()), intersect: () => observerCallback?.([{ isIntersecting: true }]) };
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
  const { win, runTimers } = fakeWindow();
  const el = element(400);
  assert.equal(mathElementHasRendered(el), false);
  ensureMathElementRenders(el, win);
  runTimers();
  assert.equal(el.renders, 1);
  runTimers();
  assert.equal(el.renders, 1, 'rendered once');
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
  const { win, runTimers } = fakeWindow();
  const el = element(5000);
  ensureMathElementRenders(el, win);
  runTimers();
  assert.equal(el.renders, 0);
});

test('MathDisplay wires the fallback to its element', () => {
  const source = readFileSync(new URL('../../src/MathDisplay.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ ensureMathElementRenders \} from '\.\/platform\/math\/ensureMathElementRenders\.js';/);
  assert.match(source, /useEffect\(\(\) => ensureMathElementRenders\(elementRef\.current\), \[cleanValue, format\]\);\s*if \(!cleanValue\) return null;/);
  assert.match(source, /<Element\s*ref=\{elementRef\}/);
});
