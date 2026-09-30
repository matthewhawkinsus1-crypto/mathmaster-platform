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
