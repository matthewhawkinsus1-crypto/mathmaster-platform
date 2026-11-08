/*
 * P-5: THE WORK VIEW BUTTON'S ROOM IS PUBLISHED AFTER ITS RESIZEOBSERVER HAS
 * DELIVERED, NEVER INSIDE THE CALLBACK.
 *
 * On Algebra I M3 T1 L1 DOL 2 and its Honors twin (the relation workspace on
 * an exit ticket), a phone at 200% text raised "ResizeObserver loop completed
 * with undelivered notifications" whenever it was turned or its text size
 * changed, and on a full-page screenshot (the walkthrough's screen pass, which
 * is likely how it met the error "on opening"). In the lesson harness, with
 * CI's fonts: 12 of 44 runs on a phone, none on a laptop. The only callback in
 * each failing frame was EnlargeableFigure's measurement of the button,
 * delivering the work area's resize; its writes (the button moving between
 * the corner and a row of its own, and the room the rows beside it keep)
 * resized that work area again, inside the callback, where the browser cannot
 * deliver it. observeOpenerRoom (platform/workView/openerPlacement.js) now
 * publishes an observed change in the next frame: 0 of 48 runs.
 *
 * Nothing in this suite lays a page out. A fake ResizeObserver delivers as the
 * browser does, and this holds that nothing is written during a delivery.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { observeOpenerRoom } from '../../src/platform/workView/openerPlacement.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** A browser's ResizeObserver delivery and animation frames, by hand. */
const fakeBrowser = () => {
  const observers = [];
  let frames = [];
  let delivering = 0;
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.connected = true;
      observers.push(this);
    }

    observe(target) { this.targets.push(target); }

    disconnect() {
      this.connected = false;
      this.targets = [];
    }
  }
  return {
    observers,
    FakeResizeObserver,
    get delivering() { return delivering > 0; },
    // The browser reports that `target` changed size.
    deliver(target) {
      delivering += 1;
      try {
        observers.filter((observer) => observer.connected && observer.targets.includes(target))
          .forEach((observer) => observer.callback([{ target }], observer));
      } finally {
        delivering -= 1;
      }
    },
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame(id) { frames[id - 1] = null; },
    runFrame() {
      const due = frames;
      frames = [];
      due.forEach((callback) => callback?.());
    },
    get pendingFrames() { return frames.filter(Boolean).length; },
  };
};

const opener = { name: 'the button' };
const surface = { name: 'the work area' };

const observeWith = (browser, publish) => observeOpenerRoom({
  opener,
  surface,
  publish,
  ResizeObserverClass: browser.FakeResizeObserver,
  requestFrame: (callback) => browser.requestFrame(callback),
  cancelFrame: (id) => browser.cancelFrame(id),
});

test('the button\'s room is measured at once, and a change is published in the next frame, never during the delivery', () => {
  const browser = fakeBrowser();
  const published = [];
  observeWith(browser, () => published.push({ duringDelivery: browser.delivering }));
  assert.equal(published.length, 1, 'before the first paint');
  // Both are watched: the room beside the button changes with the screen too.
  assert.equal(browser.observers.length, 1);
  assert.deepEqual(browser.observers[0].targets, [opener, surface]);
  browser.deliver(surface);
  assert.equal(published.length, 1, 'nothing is written while the observer delivers');
  assert.equal(browser.pendingFrames, 1);
  browser.runFrame();
  assert.equal(published.length, 2);
  browser.deliver(opener);
  browser.runFrame();
  assert.equal(published.length, 3, 'the button changing counts too');
  assert.deepEqual(published.map((entry) => entry.duringDelivery), [false, false, false]);
});

test('however many changes arrive before the frame, one publication, and its own resize cannot re-enter it', () => {
  const browser = fakeBrowser();
  let depth = 0;
  let deepest = 0;
  let publications = 0;
  observeWith(browser, () => {
    depth += 1;
    deepest = Math.max(deepest, depth);
    publications += 1;
    // What the writes do: the work area changes size, and the browser says so.
    if (publications <= 3) browser.deliver(surface);
    depth -= 1;
  });
  // The first measurement's own resize is reported, not handled inside it.
  assert.equal(deepest, 1);
  browser.deliver(opener);
  browser.deliver(surface);
  assert.equal(browser.pendingFrames, 1, 'one frame for every change before it');
  for (let frame = 0; frame < 5; frame += 1) browser.runFrame();
  assert.equal(deepest, 1, 'a publication never runs inside another');
  assert.equal(publications, 4, 'it settles once its writes change nothing');
  assert.equal(browser.pendingFrames, 0);
});

test('stopping drops the pending frame and the observer', () => {
  const browser = fakeBrowser();
  let publications = 0;
  const stop = observeWith(browser, () => { publications += 1; });
  browser.deliver(surface);
  stop();
  browser.runFrame();
  assert.equal(publications, 1, 'nothing is published after the button is gone');
  assert.equal(browser.observers[0].connected, false);
  browser.deliver(surface);
  assert.equal(browser.pendingFrames, 0);
});

test('EnlargeableFigure measures the button through it', () => {
  const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));
  const effect = region(figure, 'const publishSpace = () => {', '}, [enlarged]);', 'the opener measurement');
  assert.match(effect, /const stopObserving = observeOpenerRoom\(\{ opener, surface, publish: publishSpace \}\);/);
  assert.doesNotMatch(effect, /new ResizeObserver\(/, 'no observer of its own calls the measurement directly');
  assert.match(effect, /return \(\) => \{\s*stopObserving\(\);/);
  assert.match(figure, /import \{ OPENER_GAP, observeOpenerRoom, openerSharesRow \} from '\.\.\/\.\.\/platform\/workView\/openerPlacement\.js';/);
});
