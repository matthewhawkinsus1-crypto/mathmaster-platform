// TOASTS NEVER COVER THE ACTION BAR: the clearance follows the bar every frame
// while a toast is shown (src/platform/layout/toastClearance.js).
//
// It was measured on a scroll, a resize or the page changing size, and went
// stale when the bar arrived or moved without any of those: CI's
// studentScreenChange S7 found "That question has moved" over Submit at
// 1366×768. Here a page is driven frame by frame, its bar moved with no event
// at all, as a late workspace or a compacting navigator moves it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_BAR_CLEARANCE_VAR,
  ACTION_BAR_SELECTOR,
  actionBarClearance,
  followActionBarClearance,
} from '../../src/platform/layout/toastClearance.js';

const box = (top, height) => ({ top, height, bottom: top + height });

// A page: its bars (each a box, or null while it is not laid out), its toast
// viewport, its frames and the variable on the root.
const makePage = ({ innerHeight = 768, wide = true } = {}) => {
  const props = new Map();
  const writes = [];
  const style = {
    getPropertyValue: (name) => props.get(name) || '',
    setProperty: (name, value) => { props.set(name, value); writes.push([name, value]); },
    removeProperty: (name) => { props.delete(name); writes.push([name, null]); },
  };
  const page = {
    bars: [],
    toasts: 0,
    measured: 0,
    frames: new Map(),
    nextFrame: 1,
    observers: [],
    writes,
    value: () => props.get(ACTION_BAR_CLEARANCE_VAR) ?? null,
  };
  const viewport = { querySelector: (selector) => (selector === '.mm-toast' && page.toasts > 0 ? {} : null) };
  page.doc = {
    documentElement: { style },
    querySelector: (selector) => (selector === '.mm-toast-viewport' ? viewport : null),
    querySelectorAll: (selector) => {
      assert.equal(selector, ACTION_BAR_SELECTOR);
      return page.bars.map((bar) => ({
        getBoundingClientRect: () => { page.measured += 1; return bar || { top: 0, bottom: 0, height: 0 }; },
      }));
    },
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.target = null; page.observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.target = null; }
  }
  page.win = {
    innerHeight,
    matchMedia: (query) => { assert.equal(query, '(min-width: 641px)'); return { matches: wide }; },
    requestAnimationFrame: (callback) => { const id = page.nextFrame; page.nextFrame += 1; page.frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => { page.frames.delete(id); },
    MutationObserver: FakeMutationObserver,
  };
  // The browser draws a frame: every animation frame callback queued so far runs.
  page.frame = () => {
    const due = [...page.frames.entries()];
    page.frames.clear();
    due.forEach(([, callback]) => callback());
  };
  // Toasts are added and removed; the viewport's observer hears it (a microtask, before the next frame).
  page.setToasts = (count) => {
    page.toasts = count;
    page.observers.filter((observer) => observer.target).forEach((observer) => observer.callback([]));
  };
  return page;
};

test('the clearance clears the highest bar on screen, and no bar that is not on screen', () => {
  // The desktop bar in the flow, 40px above the bottom of a 768px screen.
  assert.equal(actionBarClearance([box(663, 65)], 768), 105);
  // Stuck to the bottom.
  assert.equal(actionBarClearance([box(703, 65)], 768), 65);
  // Two bars on screen: the toast clears the higher one, whichever comes first.
  assert.equal(actionBarClearance([box(703, 65), box(600, 56)], 768), 168);
  // Not laid out, below the screen, scrolled off the top, or none at all.
  assert.equal(actionBarClearance([box(663, 0)], 768), 0);
  assert.equal(actionBarClearance([box(780, 65)], 768), 0);
  assert.equal(actionBarClearance([box(-80, 65)], 768), 0);
  assert.equal(actionBarClearance([], 768), 0);
  assert.equal(actionBarClearance(undefined, 768), 0);
});

test('with no toast nothing is measured, and no frame keeps running', () => {
  const page = makePage();
  page.bars = [box(663, 65)];
  followActionBarClearance({ doc: page.doc, win: page.win });
  page.frame();
  page.frame();
  assert.equal(page.measured, 0);
  assert.equal(page.frames.size, 0);
  assert.equal(page.value(), null);
  // The toast viewport is watched for a toast to arrive.
  assert.equal(page.observers.length, 1);
  assert.deepEqual(page.observers[0].options, { childList: true, subtree: true });
});

test('a toast is clear from its first frame, and follows the bar every frame it shows, with no scroll, resize or page resize', () => {
  const page = makePage();
  // S7: the workspace is still arriving, its bar not laid out, when the notice shows.
  page.bars = [null];
  followActionBarClearance({ doc: page.doc, win: page.win });
  page.frame();
  page.setToasts(1);
  page.frame();
  assert.equal(page.value(), '0px');
  // The bar arrives, in the flow, and nothing else happens: the next frame clears it.
  page.bars = [box(663, 65)];
  page.frame();
  assert.equal(page.value(), '105px');
  // The navigator compacts: the bar moves up.
  page.bars = [box(620, 65)];
  page.frame();
  assert.equal(page.value(), '148px');
  // The page grows under it and the bar sticks to the bottom.
  page.bars = [box(703, 65)];
  page.frame();
  assert.equal(page.value(), '65px');
  // A second toast changes nothing about the frames: one follows.
  page.setToasts(2);
  assert.equal(page.frames.size, 1);
  // The last toast leaves: the frame after that stops.
  page.setToasts(0);
  page.frame();
  assert.equal(page.frames.size, 0);
  const measured = page.measured;
  page.bars = [box(500, 65)];
  page.frame();
  assert.equal(page.measured, measured, 'nothing is measured once no toast is shown');
});

test('a toast already up when the assignment screen opens is followed from the first frame', () => {
  const page = makePage();
  page.toasts = 1;
  page.bars = [box(663, 65)];
  followActionBarClearance({ doc: page.doc, win: page.win });
  page.frame();
  assert.equal(page.value(), '105px');
  assert.equal(page.frames.size, 1);
});

test('the variable is written only when the clearance changes', () => {
  const page = makePage();
  page.toasts = 1;
  page.bars = [box(663, 65)];
  followActionBarClearance({ doc: page.doc, win: page.win });
  for (let frame = 0; frame < 30; frame += 1) page.frame();
  assert.deepEqual(page.writes, [[ACTION_BAR_CLEARANCE_VAR, '105px']]);
});

test('a phone, whose toasts sit at the top of the screen, measures nothing', () => {
  const page = makePage({ wide: false });
  page.toasts = 1;
  page.bars = [box(783, 61)];
  followActionBarClearance({ doc: page.doc, win: page.win });
  page.frame();
  page.frame();
  assert.equal(page.measured, 0);
  assert.equal(page.value(), null);
});

test('stopping cancels the frame, lets go of the toast viewport and removes the variable', () => {
  const page = makePage();
  page.toasts = 1;
  page.bars = [box(663, 65)];
  const stop = followActionBarClearance({ doc: page.doc, win: page.win });
  page.frame();
  assert.equal(page.value(), '105px');
  stop();
  assert.equal(page.frames.size, 0);
  assert.equal(page.observers[0].target, null);
  assert.equal(page.value(), null);
  page.setToasts(2);
  assert.equal(page.frames.size, 0);
});

test('without a document (server rendering, a test) it does nothing', () => {
  const stop = followActionBarClearance({ doc: null, win: null });
  assert.equal(typeof stop, 'function');
  stop();
});
