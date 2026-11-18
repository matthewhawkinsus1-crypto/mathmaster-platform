/*
 * THE VIEWPORT IS READ ONCE PER CHANGE, HOWEVER MANY COMPONENTS ASK.
 *
 * Reading the visual viewport's size or offset (or, on a phone, innerWidth and
 * innerHeight) makes the browser lay the page out first when anything on it
 * has changed. A question's components read it as they render and again as
 * they mount (MobileViewportContainer, the question's focus policy, Work
 * View, MathInput), so after a write the first of those reads was a forced
 * layout on opening an assignment, on every Next and on opening Work View
 * (the runtime driver's trace mode). mobileInteractionFoundation.js keeps one
 * reading from one change of the viewport to the next, and the browser says
 * when it changes: the window's resize and orientationchange, the visual
 * viewport's resize and scroll. Its listeners are added at the first reading,
 * before any listener that reads through it (every reader reads as it renders,
 * before its effects listen), so a handler of the event (the phone keyboard
 * opening) reads the viewport the event reports. Not as the module loads: a
 * module that does something as it loads is loaded by every screen that uses
 * one of its constants, and this one's are on the student's first load.
 *
 * Each test loads its own copy of the module with a fake window, the way the
 * app's copy loads with the browser's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const viewportWindow = ({ visual = true } = {}) => {
  // How often each property a layout is needed for was read (one reading reads each once).
  const reads = { visual: 0, innerWidth: 0, innerHeight: 0 };
  const state = { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1, innerWidth: 390, innerHeight: 844 };
  const listeners = { window: [], visual: [] };
  const listen = (list) => (type, callback) => list.push({ type, callback });
  const visualViewport = {
    get width() { reads.visual += 1; return state.width; },
    get height() { return state.height; },
    get offsetTop() { return state.offsetTop; },
    get offsetLeft() { return state.offsetLeft; },
    get scale() { return state.scale; },
    addEventListener: listen(listeners.visual),
    removeEventListener() {},
  };
  const win = {
    ...(visual ? { visualViewport } : {}),
    get innerWidth() { reads.innerWidth += 1; return state.innerWidth; },
    get innerHeight() { reads.innerHeight += 1; return state.innerHeight; },
    addEventListener: listen(listeners.window),
    removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    document: { documentElement: { dataset: { mobileKeypadOpen: 'true' }, style: { getPropertyValue: () => '274px' } } },
  };
  // Listeners run in the order they were added, as a browser runs those of the window and the visual viewport.
  const dispatch = (target, type) => listeners[target].filter((entry) => entry.type === type).forEach((entry) => entry.callback({ type }));
  return { win, reads, state, dispatch, listeners };
};

const withWindow = async (win, run) => {
  const previous = globalThis.window;
  globalThis.window = win;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

test('the viewport is read once per change, however many components ask', async () => {
  const fake = viewportWindow();
  await withWindow(fake.win, async () => {
    // A copy of the module that loads with this window, as the app's loads with the browser's.
    const foundation = await import('../../src/platform/mobile/mobileInteractionFoundation.js?viewport-read-once');
    assert.deepEqual([fake.listeners.window.length, fake.listeners.visual.length], [0, 0], 'loading the module does nothing');
    const box = foundation.readStableViewportBox();
    assert.deepEqual([fake.listeners.window.length, fake.listeners.visual.length], [2, 2], 'the first reading listens for the changes');
    assert.deepEqual(box, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1, pinchZoomed: false });
    // A question's components each ask as they render and mount.
    foundation.readStableViewportBox();
    foundation.readRuntimeMobileInteraction();
    foundation.readStableViewportBox(fake.win);
    foundation.readViewportInnerSize();
    assert.deepEqual(fake.reads, { visual: 1, innerWidth: 1, innerHeight: 1 }, 'the visual viewport and the inner size, each read once');

    // Each event that says the viewport changed: the next read is the new viewport.
    const events = [['window', 'resize'], ['window', 'orientationchange'], ['visual', 'resize'], ['visual', 'scroll']];
    for (const [target, type] of events) {
      fake.state.height -= 10;
      fake.state.innerHeight -= 10;
      assert.equal(foundation.readStableViewportBox().height, fake.state.height + 10, `kept until something says it changed (${target} ${type})`);
      fake.dispatch(target, type);
      assert.equal(foundation.readStableViewportBox().height, fake.state.height, `read again after ${target} ${type}`);
      assert.equal(foundation.readViewportInnerSize().height, fake.state.innerHeight);
    }
    assert.deepEqual(fake.reads, { visual: 5, innerWidth: 5, innerHeight: 5 }, 'once per change');

    // A component's own listener is added after the module's, so a handler of the event reads the viewport it reports
    // (the phone keyboard opening: MobileViewportContainer, Work View, useMobileInteractionMode all listen).
    let seen = null;
    fake.win.visualViewport.addEventListener('resize', () => { seen = foundation.readStableViewportBox().height; });
    fake.state.height = 480;
    fake.dispatch('visual', 'resize');
    assert.equal(seen, 480);

    // innerWidth alone (MathInput, the keypad's docking) does not measure the visual viewport, which a desktop lays
    // the page out to report.
    fake.dispatch('window', 'resize');
    const before = { ...fake.reads };
    foundation.readViewportInnerSize();
    foundation.readViewportInnerSize();
    assert.deepEqual(fake.reads, { visual: before.visual, innerWidth: before.innerWidth + 1, innerHeight: before.innerHeight + 1 });

    // Another window (a test's, a frame's) is read each time.
    const other = viewportWindow();
    foundation.readStableViewportBox(other.win);
    foundation.readStableViewportBox(other.win);
    assert.equal(other.reads.visual, 2);
  });
});

test('Work View\'s viewport reads go through the same reading', async () => {
  const fake = viewportWindow();
  await withWindow(fake.win, async () => {
    const workView = await import('../../src/platform/workView/workViewViewport.js?viewport-read-once');
    const first = workView.readWorkViewViewport();
    assert.equal(workView.readBottomKeypadHeight(), 274);
    assert.deepEqual(workView.readWorkViewViewport(), first);
    assert.deepEqual(fake.reads, { visual: 1, innerWidth: 1, innerHeight: 1 }, 'opening Work View with the keypad up reads the viewport once');
  });
  const mathInput = executableSource(read('src/MathInput.jsx'));
  assert.match(mathInput, /const detectMobileInput = \(\) => typeof window !== 'undefined' && \(readViewportInnerSize\(window\)\.width <= 768 \|\|/);
});

test('a window with no visual viewport to say when it changes is read each time', async () => {
  const fake = viewportWindow({ visual: false });
  await withWindow(fake.win, async () => {
    const foundation = await import('../../src/platform/mobile/mobileInteractionFoundation.js?no-visual-viewport');
    foundation.readStableViewportBox();
    foundation.readStableViewportBox();
    assert.equal(fake.reads.innerWidth, 2);
  });
});
