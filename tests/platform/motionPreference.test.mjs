import test from 'node:test';
import assert from 'node:assert/strict';
import { motionDuration, prefersReducedMotion, watchReducedMotion } from '../../src/motionPreference.js';

const withWindow = (matchMedia, run) => {
  const previous = globalThis.window;
  globalThis.window = { matchMedia };
  try {
    return run();
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};

test('no window, no crash — the preference is simply unknown', () => {
  assert.equal(prefersReducedMotion(), false);
  assert.equal(typeof watchReducedMotion(() => {}), 'function');
});

test('the media query decides', () => {
  assert.equal(withWindow(() => ({ matches: true }), prefersReducedMotion), true);
  assert.equal(withWindow(() => ({ matches: false }), prefersReducedMotion), false);
});

test('a browser that throws on the query is treated as no preference', () => {
  assert.equal(withWindow(() => { throw new Error('unsupported'); }, prefersReducedMotion), false);
});

test('turning reduced motion on mid-session is believed without a reload', () => {
  const listeners = [];
  const query = {
    matches: false,
    addEventListener: (_event, handler) => listeners.push(handler),
    removeEventListener: (_event, handler) => {
      const index = listeners.indexOf(handler);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  withWindow(() => query, () => {
    const seen = [];
    const stop = watchReducedMotion((value) => seen.push(value));
    assert.equal(listeners.length, 1);
    listeners[0]({ matches: true });
    assert.deepEqual(seen, [true]);
    stop();
    assert.equal(listeners.length, 0, 'the listener must be removed on unmount');
  });
});

test('Safari\'s deprecated listener form is still supported', () => {
  const added = [];
  const query = { matches: false, addListener: (handler) => added.push(handler), removeListener: () => added.pop() };
  withWindow(() => query, () => {
    const stop = watchReducedMotion(() => {});
    assert.equal(added.length, 1);
    stop();
    assert.equal(added.length, 0);
  });
});

// --- The durations ----------------------------------------------------------

test('reduced motion shortens a step rather than skipping it', () => {
  // Ordinary motion is untouched.
  assert.equal(motionDuration(620, false), 620);
  assert.equal(motionDuration(620, false, { floor: 40 }), 620);
  // A step that carries meaning keeps a floor, so the change is still noticed.
  assert.equal(motionDuration(620, true, { floor: 40 }), 40);
  // Pure decoration goes to nothing.
  assert.equal(motionDuration(620, true), 0);
});

test('a floor never lengthens a step that was already shorter', () => {
  assert.equal(motionDuration(20, true, { floor: 40 }), 20);
});

test('nonsense durations do not become NaN timeouts', () => {
  assert.equal(motionDuration(undefined, false), 0);
  assert.equal(motionDuration(-50, false), 0);
  assert.equal(motionDuration('oops', true, { floor: 40 }), 0);
});
