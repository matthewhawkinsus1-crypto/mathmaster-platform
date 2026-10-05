/*
 * CLICK A FIELD, TYPE AT ONCE: THE KEYS GO TO THE FIELD YOU CLICKED.
 *
 * MathLive 0.110 focuses a clicked field's keyboard sink 60 ms after the
 * pointerdown, and the previous field's sink keeps handling keys meanwhile.
 * In a real browser (student UX pass, R-4) "Slope 5 → click y-intercept →
 * Backspace, 4" produced Slope "4" and an empty y-intercept on every attempt.
 * tests/browser/studentUxPlatform.mjs drives the real thing; these pin the two
 * mechanisms with stand-in elements so the suite catches a regression without a
 * browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bindMathFieldFocusHandoff,
  focusMathFieldWithoutScroll,
  guardStaleMathFieldFocus,
  mathFieldKeyboardSink,
} from '../../src/platform/interaction/mathFieldFocusHandoff.js';
import { executableSource } from './helpers/sourceContract.mjs';

const makeDocument = () => {
  const doc = { activeElement: null, fields: [] };
  doc.querySelectorAll = (selector) => (selector === 'math-field' ? doc.fields : []);
  return doc;
};

// A stand-in <math-field>: a host with listeners, an open shadow root holding
// a focusable sink, and MathLive's own idea of focus (`hasFocus`).
const makeField = (doc, name) => {
  const listeners = [];
  const sink = { name: `${name}-sink`, focusCalls: [] };
  const field = {
    name,
    isConnected: true,
    mathLiveFocused: false,
    value: '',
    commands: [],
    dispatched: [],
    shadowRoot: {
      activeElement: null,
      querySelector: (selector) => (/keyboard-sink/.test(selector) ? sink : null),
    },
    hasFocus() { return this.mathLiveFocused; },
    addEventListener(type, handler, options) { listeners.push({ type, handler, capture: Boolean(options?.capture || options === true) }); },
    removeEventListener(type, handler) {
      const index = listeners.findIndex((entry) => entry.type === type && entry.handler === handler);
      if (index >= 0) listeners.splice(index, 1);
    },
    executeCommand(command) {
      this.commands.push(command);
      if (Array.isArray(command) && command[0] === 'typedText') this.value += command[1];
      if (command === 'deleteBackward') this.value = this.value.slice(0, -1);
      return true;
    },
    dispatchEvent(event) { this.dispatched.push(event.type); return true; },
    listeners,
    sink,
  };
  sink.focus = (options) => {
    sink.focusCalls.push(options);
    doc.fields.forEach((other) => { other.shadowRoot.activeElement = null; });
    field.shadowRoot.activeElement = sink;
    doc.activeElement = field;
  };
  doc.fields.push(field);
  return field;
};

const fire = (field, type, event, { capture } = {}) => {
  field.listeners
    .filter((entry) => entry.type === type && (capture === undefined || entry.capture === capture))
    .forEach((entry) => entry.handler(event));
};

const keyEvent = (key) => ({
  key,
  isComposing: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopPropagation() { this.stopped = true; },
  stopImmediatePropagation() { this.stopped = true; },
});

test('a click hands DOM focus to the clicked field in the same event, not 60 ms later', () => {
  const doc = makeDocument();
  const slope = makeField(doc, 'slope');
  const intercept = makeField(doc, 'intercept');
  bindMathFieldFocusHandoff(slope, { documentObject: doc });
  bindMathFieldFocusHandoff(intercept, { documentObject: doc });

  slope.sink.focus();
  slope.mathLiveFocused = true;

  // MathLive's own pointerdown handler: marks the new field focused and blurs
  // the old one in its model, but leaves the old sink holding DOM focus.
  intercept.mathLiveFocused = true;
  slope.mathLiveFocused = false;
  assert.equal(doc.activeElement, slope, 'precondition: the old field still owns DOM focus');

  fire(intercept, 'pointerdown', {}, { capture: false });
  assert.equal(doc.activeElement, intercept);
  assert.equal(intercept.shadowRoot.activeElement, intercept.sink);
  assert.deepEqual(intercept.sink.focusCalls.at(-1), { preventScroll: true }, 'a hand-over never scrolls the page');
});

test('a pointerdown MathLive did not turn into focus hands nothing over', () => {
  const doc = makeDocument();
  const field = makeField(doc, 'only');
  bindMathFieldFocusHandoff(field, { documentObject: doc });
  fire(field, 'pointerdown', {}, { capture: false });
  assert.equal(field.sink.focusCalls.length, 0);
});

test('a key reaching a field MathLive has left is replayed on the active field, never applied to the old one', () => {
  const doc = makeDocument();
  const slope = makeField(doc, 'slope');
  const intercept = makeField(doc, 'intercept');
  slope.value = '5';
  bindMathFieldFocusHandoff(slope, { documentObject: doc });
  bindMathFieldFocusHandoff(intercept, { documentObject: doc });

  slope.sink.focus();
  intercept.mathLiveFocused = true;
  slope.mathLiveFocused = false;

  const backspace = keyEvent('Backspace');
  fire(slope, 'keydown', backspace, { capture: true });
  assert.equal(backspace.prevented && backspace.stopped, true, 'the stale field must not see the key');
  assert.equal(slope.value, '5', 'the finished answer is untouched');
  assert.equal(doc.activeElement, intercept, 'focus follows the field the student chose');

  // A real browser now sends the next key to the new field directly. Put DOM
  // focus back on the stale sink to prove a printable key is routed too.
  slope.sink.focus();
  fire(slope, 'keydown', keyEvent('4'), { capture: true });
  assert.equal(slope.value, '5');
  assert.equal(intercept.value, '4');
  assert.ok(intercept.dispatched.includes('input'), 'the replay reports an input so React state follows');
});

test('the active field handles its own keys untouched', () => {
  const doc = makeDocument();
  const field = makeField(doc, 'x');
  bindMathFieldFocusHandoff(field, { documentObject: doc });
  field.sink.focus();
  field.mathLiveFocused = true;
  const event = keyEvent('7');
  fire(field, 'keydown', event, { capture: true });
  assert.equal(event.prevented || event.stopped, false);
});

test('the binding cleans up after itself', () => {
  const doc = makeDocument();
  const field = makeField(doc, 'x');
  const unbind = bindMathFieldFocusHandoff(field, { documentObject: doc });
  assert.ok(field.listeners.length >= 3);
  unbind();
  assert.equal(field.listeners.length, 0);
});

test('autofocus focuses the sink with preventScroll instead of MathfieldElement.focus()', () => {
  const doc = makeDocument();
  const field = makeField(doc, 'x');
  assert.equal(focusMathFieldWithoutScroll(field), true);
  assert.deepEqual(field.sink.focusCalls, [{ preventScroll: true }]);
  assert.equal(mathFieldKeyboardSink({}), null);
  assert.equal(focusMathFieldWithoutScroll({}), false);
});

test('every math field the student types into is bound, and bound first', () => {
  const input = executableSource(readFileSync('src/MathInput.jsx', 'utf8'));
  const bind = input.indexOf('bindMathFieldFocusHandoff(mfRef.current)');
  const listeners = input.indexOf("mathField.addEventListener('keydown', preventUnusedModes");
  assert.ok(bind > 0, 'MathInput must bind the focus hand-off');
  assert.ok(bind < listeners, 'the stale-key guard must be registered before Enter/space handling');
  const calculator = executableSource(readFileSync('src/components/CalculatorPanel.jsx', 'utf8'));
  assert.match(calculator, /bindMathFieldFocusHandoff\(mathFieldRef\.current\)/);
});

/*
 * MATHLIVE'S OWN LATE FOCUS (part 3 of the hand-off).
 *
 * Anything that focuses a field — the cursor a cross-device restore puts back
 * included — makes MathLive focus that field's sink AGAIN 60 ms later, and for
 * those 60 ms its model ignores a blur. A student who clicked box B in that
 * window had focus pulled back to box A, B blurred in MathLive's model, and
 * their keys typed into A over the restored answer (PR #435 `directions`).
 */
// A page that reports presses and focus arriving, as a browser does, to the
// capture listeners the guard installs.
const makeTrackingDocument = () => {
  const doc = makeDocument();
  doc.listeners = [];
  doc.body = { tagName: 'BODY' };
  doc.addEventListener = (type, handler) => doc.listeners.push({ type, handler });
  doc.dispatch = (type, target, extra = {}) => doc.listeners
    .filter((entry) => entry.type === type)
    .forEach((entry) => entry.handler({ type, isTrusted: true, target, composedPath: () => [target], ...extra }));
  return doc;
};
// A field whose shadow content knows its host, and whose host can be focused
// by code (MathfieldElement.focus()).
const makeHostedField = (doc, name) => {
  const field = makeField(doc, name);
  field.inner = { name: `${name}-glyph`, getRootNode: () => ({ host: field }) };
  field.sink.getRootNode = () => ({ host: field });
  field.getRootNode = () => doc;
  field.contains = (node) => node === field;
  field.hostFocusCalls = 0;
  field.focus = function focus() { this.hostFocusCalls += 1; };
  field.dispatchEvent = function dispatchEvent(event) { this.dispatched.push(event.type); return true; };
  return field;
};
const flushMicrotasks = () => new Promise((resolve) => { setImmediate(resolve); });

test('MathLive\'s late focus of the box the student left is refused, and its model is told', async () => {
  const doc = makeTrackingDocument();
  const restored = makeHostedField(doc, 'restored');
  const chosen = makeHostedField(doc, 'chosen');
  bindMathFieldFocusHandoff(restored, { documentObject: doc });
  bindMathFieldFocusHandoff(chosen, { documentObject: doc });

  // The restore puts the cursor back in A (MathMaster's own focus: allowed),
  // and MathLive marks A focused — and queues its own focus of A for later.
  assert.equal(focusMathFieldWithoutScroll(restored), true);
  assert.equal(doc.activeElement, restored);
  restored.mathLiveFocused = true;
  doc.dispatch('focusin', restored.sink);

  // The student presses B. MathLive marks B focused but cannot blur A (mid
  // transition); the hand-off gives B's sink DOM focus in the same event.
  doc.dispatch('pointerdown', chosen.inner);
  chosen.mathLiveFocused = true;
  fire(chosen, 'pointerdown', {}, { capture: false });
  assert.equal(doc.activeElement, chosen, 'precondition: the click put the cursor in B');
  doc.dispatch('focusin', chosen.sink);

  // MathLive's timer for A fires.
  const callsBefore = restored.sink.focusCalls.length;
  restored.sink.focus({ preventScroll: true });
  assert.equal(doc.activeElement, chosen, 'the cursor stays in the box the student chose');
  assert.equal(restored.sink.focusCalls.length, callsBefore, 'refused before it reached the element — nothing to undo, nothing blurred');
  await flushMicrotasks();
  assert.ok(restored.dispatched.includes('blur'), 'MathLive is told A is no longer focused (its model ignored the real blur)');
  assert.ok(!chosen.dispatched.includes('blur'), 'B, which has focus, is never blurred');
});

test('the same holds when the student tabs away, or a screen reader or Work View moves focus', async () => {
  const doc = makeTrackingDocument();
  const restored = makeHostedField(doc, 'restored');
  bindMathFieldFocusHandoff(restored, { documentObject: doc });
  focusMathFieldWithoutScroll(restored);
  restored.mathLiveFocused = true;
  doc.dispatch('focusin', restored.sink);
  const elsewhere = { name: 'Work View close' };
  doc.activeElement = elsewhere;
  doc.dispatch('focusin', elsewhere, { isTrusted: false });
  restored.sink.focus({ preventScroll: true });
  assert.equal(doc.activeElement, elsewhere);
});

test('a field the student is still in, or went back to, is refocused by MathLive as usual', () => {
  const doc = makeTrackingDocument();
  const field = makeHostedField(doc, 'x');
  const other = makeHostedField(doc, 'y');
  bindMathFieldFocusHandoff(field, { documentObject: doc });
  bindMathFieldFocusHandoff(other, { documentObject: doc });

  // Nothing pressed yet: MathLive focusing a field for the first time.
  field.sink.focus();
  assert.equal(doc.activeElement, field);

  // Focus already on this sink: the late call changes nothing and is allowed.
  doc.dispatch('focusin', field.sink);
  field.sink.focus();
  assert.equal(doc.activeElement, field);

  // The student is in Y, then presses X again: X's own late focus is theirs.
  doc.activeElement = other;
  doc.dispatch('pointerdown', field.inner);
  field.sink.focus();
  assert.equal(doc.activeElement, field);
});

test('code that focuses a field itself (a keypad key, Undo) means that field', () => {
  const doc = makeTrackingDocument();
  const field = makeHostedField(doc, 'x');
  bindMathFieldFocusHandoff(field, { documentObject: doc });
  const button = { name: 'keypad 7' };
  doc.activeElement = button;
  doc.dispatch('pointerdown', button);
  field.focus();
  assert.equal(field.hostFocusCalls, 1, 'the element\'s own focus still runs');
  field.sink.focus();
  assert.equal(doc.activeElement, field, 'MathLive\'s focus that follows is not stale');
});

test('the guard is installed once and removed with the binding', () => {
  const doc = makeTrackingDocument();
  const field = makeHostedField(doc, 'x');
  const ownSinkFocus = field.sink.focus;
  const ownHostFocus = field.focus;
  const unbind = bindMathFieldFocusHandoff(field, { documentObject: doc });
  assert.notEqual(field.sink.focus, ownSinkFocus);
  const guarded = field.sink.focus;
  assert.equal(typeof guardStaleMathFieldFocus(field, { documentObject: doc }), 'function');
  assert.equal(field.sink.focus, guarded, 'idempotent: one guard per sink');
  unbind();
  assert.equal(field.sink.focus, ownSinkFocus);
  assert.equal(field.focus, ownHostFocus);
  assert.equal(guardStaleMathFieldFocus({}, { documentObject: doc }), null, 'no sink yet: nothing to guard');
});

