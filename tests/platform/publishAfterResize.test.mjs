/*
 * THE STUDENT IDENTITY BAR'S HEIGHT IS PUBLISHED AFTER ITS RESIZEOBSERVER HAS
 * DELIVERED, NEVER INSIDE THE CALLBACK.
 *
 * On a phone the assignment screen is sized from the bar's published height
 * (100dvh less it, App.css). Published from inside the bar's observer, a bar
 * re-wrapped by 200% text or by turning the phone resized the whole screen
 * while the other observers were being delivered, and the browser fired
 * "ResizeObserver loop completed with undelivered notifications": with Work
 * View open on the Systems Workspace's construct question (390×844, CI's
 * fonts), two in every cycle of text size and turns. Answering only the bar's
 * observer in the next frame took them to none; deferring Work View's action
 * row or its task box changed nothing. tests/browser/teacherWorkflow/
 * resizeLoopJourneys.mjs drives that in the real App.
 *
 * Nothing in this suite lays a page out. A fake ResizeObserver delivers as the
 * browser does, and this holds that nothing is written during a delivery
 * (the same rule openerRoomObserver.test.mjs holds for the Work View button).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { observeThenPublish } from '../../src/platform/layout/publishAfterResize.js';
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

const bar = { name: 'the identity bar' };
const notice = { name: 'the pack-up line' };

const observeWith = (browser, publish, targets = [bar, notice]) => observeThenPublish({
  targets,
  publish,
  ResizeObserverClass: browser.FakeResizeObserver,
  requestFrame: (callback) => browser.requestFrame(callback),
  cancelFrame: (id) => browser.cancelFrame(id),
});

test('measured at once, and a change is published in the next frame, never during the delivery', () => {
  const browser = fakeBrowser();
  const published = [];
  observeWith(browser, () => published.push({ duringDelivery: browser.delivering }));
  assert.equal(published.length, 1, 'before the first paint');
  assert.deepEqual(browser.observers[0].targets, [bar, notice], 'the bar and its notice row');
  browser.deliver(bar);
  assert.equal(published.length, 1, 'nothing is written while the observer delivers');
  assert.equal(browser.pendingFrames, 1);
  browser.runFrame();
  assert.equal(published.length, 2);
  browser.deliver(notice);
  browser.runFrame();
  assert.equal(published.length, 3, 'the notice row changing counts too');
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
    // What the write does on a phone: the screen under the bar resizes, and the bar re-wraps.
    if (publications <= 3) browser.deliver(bar);
    depth -= 1;
  });
  assert.equal(deepest, 1);
  browser.deliver(bar);
  browser.deliver(notice);
  assert.equal(browser.pendingFrames, 1, 'one frame for every change before it');
  for (let frame = 0; frame < 5; frame += 1) browser.runFrame();
  assert.equal(deepest, 1, 'a publication never runs inside another');
  assert.equal(publications, 4, 'it settles once its writes change nothing');
  assert.equal(browser.pendingFrames, 0);
});

test('a missing notice row is not observed, and stopping drops the pending frame and the observer', () => {
  const browser = fakeBrowser();
  let publications = 0;
  const stop = observeWith(browser, () => { publications += 1; }, [bar, null]);
  assert.deepEqual(browser.observers[0].targets, [bar]);
  browser.deliver(bar);
  stop();
  browser.runFrame();
  assert.equal(publications, 1, 'nothing is published after the bar is gone');
  assert.equal(browser.observers[0].connected, false);
  // Without a ResizeObserver at all: measured once, nothing to stop.
  let once = 0;
  observeThenPublish({ targets: [bar], publish: () => { once += 1; }, ResizeObserverClass: null })();
  assert.equal(once, 1);
});

test('the identity bar publishes its height through it, and its own observer is gone', () => {
  const identity = executableSource(read('src/components/student/StudentIdentityBar.jsx'));
  const effect = region(identity, 'const publishHeight = () => {', '}, [hasNotice]);', 'the height publication');
  assert.match(effect, /const stopObserving = observeThenPublish\(\{ targets: \[bar, noticeRef\.current\], publish: publishHeight \}\);/);
  assert.match(effect, /return \(\) => \{\s*stopObserving\(\);/);
  assert.doesNotMatch(identity, /new ResizeObserver\(/, 'no observer of its own calls the measurement directly');
  assert.match(identity, /^import \{ observeThenPublish \} from '\.\.\/\.\.\/platform\/layout\/publishAfterResize\.js';$/m);
  // A layout effect: the first measurement is before the first paint.
  assert.match(region(identity, 'const hasNotice = Boolean(notice);', 'const publishHeight', 'the effect'), /useLayoutEffect\(\(\) => \{/);
});
