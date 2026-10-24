/*
 * A filled math box says what is in it when focus lands (AX11).
 *
 * The defect: a screen reader lands in MathLive's keyboard sink. Naming the sink
 * (A11Y-3, mathFieldName.js) replaced the label MathLive used to put there with
 * the box's content, and MathLive hides its typeset math from assistive
 * technology — so a student returning to a filled box heard "Slope, edit text"
 * and nothing of what they had typed. The content is now the sink's
 * aria-description, read after the name and the role, in the words MathDisplay
 * uses for the same math.
 *
 * The binder (platform/math/mathFieldDescription.js) is tested as behaviour
 * against a fake field, as mathFieldName.test.mjs does for the name; MathInput's
 * wiring is asserted against the region that does the work. The real field is
 * read from Chromium's accessibility tree by tests/browser/studentAccessibleNames.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindMathFieldDescription,
  describeMathFieldSink,
  mathFieldAccessibleDescription,
} from '../../src/platform/math/mathFieldDescription.js';
import { bindMathFieldName } from '../../src/platform/math/mathFieldName.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const fakeElement = () => {
  const attributes = new Map();
  return {
    attributes,
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
};

const fakeWindow = () => {
  const waiting = [];
  return {
    waiting,
    customElements: { whenDefined: () => new Promise((resolve) => { waiting.push(resolve); }) },
    // The upgrade finishes: the field gets its sink, then whoever waited is let go.
    async upgrade(field) {
      field.sink = fakeElement();
      waiting.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    },
  };
};

const fakeField = ({ sink = fakeElement() } = {}) => {
  const listeners = {};
  const field = {
    sink,
    shadowRoot: { querySelector: (selector) => (/keyboard-sink/.test(selector) ? field.sink : null) },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((entry) => entry !== fn); },
    dispatch: (type) => (listeners[type] || []).forEach((fn) => fn({ type })),
    listeners,
  };
  return field;
};

test('an open box describes what it holds, in the words the screen uses for the same math', () => {
  assert.equal(mathFieldAccessibleDescription({ value: '\\frac{3}{4}' }), '3 over 4');
  assert.equal(mathFieldAccessibleDescription({ value: '\\frac34' }), '3 over 4', 'MathLive\'s own spelling of a fraction');
  assert.equal(mathFieldAccessibleDescription({ value: 'y=-\\frac{2}{3}x+4' }), 'y equals negative 2 over 3 x plus 4');
  assert.equal(mathFieldAccessibleDescription({ value: 'x^{2}+3x' }), 'x squared plus 3x');
  assert.equal(mathFieldAccessibleDescription({ value: '12' }), '12');
  assert.equal(mathFieldAccessibleDescription({ value: 'x\\le 4' }), 'x is less than or equal to 4');
});

test('an empty box, and a closed question\'s box (its name already says the answer), describe nothing', () => {
  assert.equal(mathFieldAccessibleDescription({ value: '' }), '');
  assert.equal(mathFieldAccessibleDescription({ value: '   ' }), '');
  assert.equal(mathFieldAccessibleDescription({}), '');
  assert.equal(mathFieldAccessibleDescription(), '');
  assert.equal(mathFieldAccessibleDescription({ value: '\\frac{3}{4}', closed: true }), '', 'never said twice');
});

test('the sink gets the description as soon as it exists, and loses it when the box is emptied', () => {
  const field = fakeField();
  const stop = bindMathFieldDescription(field, '3 over 4', { win: fakeWindow() });
  assert.equal(field.sink.getAttribute('aria-description'), '3 over 4');
  stop();
  describeMathFieldSink(field, '');
  assert.equal(field.sink.getAttribute('aria-description'), null, 'an empty description is no attribute, not an empty one');
  describeMathFieldSink(field, '  ');
  assert.equal(field.sink.getAttribute('aria-description'), null);
  describeMathFieldSink(field, 'x squared');
  assert.equal(field.sink.getAttribute('aria-description'), 'x squared');
  assert.equal(describeMathFieldSink({}, 'x'), null, 'a field that is not upgraded has no sink to describe');
  assert.equal(describeMathFieldSink(null, 'x'), null);
});

test('typing re-binds: the new content replaces the old, and clearing the box removes it', () => {
  const field = fakeField();
  const win = fakeWindow();
  let stop = bindMathFieldDescription(field, '3', { win });
  assert.equal(field.sink.getAttribute('aria-description'), '3');
  stop(); stop = bindMathFieldDescription(field, '3 over 4', { win });
  assert.equal(field.sink.getAttribute('aria-description'), '3 over 4');
  stop(); stop = bindMathFieldDescription(field, '', { win });
  assert.equal(field.sink.getAttribute('aria-description'), null);
  stop();
});

test('a sink MathLive rebuilt is described again on the next focusin', () => {
  const field = fakeField();
  bindMathFieldDescription(field, '3 over 4', { win: fakeWindow() });
  field.sink = fakeElement();
  assert.equal(field.sink.getAttribute('aria-description'), null);
  field.dispatch('focusin');
  assert.equal(field.sink.getAttribute('aria-description'), '3 over 4');
});

test('a field MathLive has not upgraded yet is described once it is', async () => {
  const field = fakeField();
  field.sink = null;
  const win = fakeWindow();
  bindMathFieldDescription(field, '3 over 4', { win });
  assert.equal(win.waiting.length, 1, 'it waits for the upgrade');
  await win.upgrade(field);
  assert.equal(field.sink.getAttribute('aria-description'), '3 over 4');
});

test('a box removed before MathLive upgrades it is never touched', async () => {
  const field = fakeField();
  field.sink = null;
  const win = fakeWindow();
  const stop = bindMathFieldDescription(field, '3 over 4', { win });
  stop();
  await win.upgrade(field);
  assert.equal(field.sink.getAttribute('aria-description'), null);
});

test('cleanup stops describing; no field is left alone', () => {
  const field = fakeField();
  const stop = bindMathFieldDescription(field, '3 over 4', { win: fakeWindow() });
  stop();
  assert.deepEqual(field.listeners.focusin, []);
  field.sink = fakeElement();
  field.dispatch('focusin');
  assert.equal(field.sink.getAttribute('aria-description'), null, 'nothing is written after cleanup');
  assert.doesNotThrow(() => bindMathFieldDescription(null, 'x', { win: fakeWindow() })());
  assert.doesNotThrow(() => bindMathFieldDescription({ addEventListener() {}, removeEventListener() {} }, 'x', { win: fakeWindow() })());
});

test('the description and the name sit on the sink side by side: neither overwrites the other', () => {
  const field = fakeField();
  const win = fakeWindow();
  win.MutationObserver = class { observe() {} disconnect() {} };
  bindMathFieldName(field, 'Slope', { win });
  bindMathFieldDescription(field, '3 over 4', { win });
  assert.equal(field.sink.getAttribute('aria-label'), 'Slope');
  assert.equal(field.sink.getAttribute('aria-description'), '3 over 4');
  field.sink = fakeElement();
  field.dispatch('focusin');
  assert.equal(field.sink.getAttribute('aria-label'), 'Slope');
  assert.equal(field.sink.getAttribute('aria-description'), '3 over 4');
});

const MATH_INPUT = executableSource(componentSource('src/MathInput.jsx'));

test('MathInput describes its sink from the box\'s value, and not once the question is closed', () => {
  assert.match(MATH_INPUT, /^import \{[^}]*\bmathFieldAccessibleDescription\b[^}]*\buseMathFieldDescription\b[^}]*\} from '\.\/platform\/math\/mathFieldDescription\.js';$/m);
  const body = region(MATH_INPUT, 'export default function MathInput(', '\n  return (', 'MathInput hooks');
  const description = body.match(/const (\w+) = useMemo\(\s*\(\) => mathFieldAccessibleDescription\(\{ value, closed: questionTerminal \}\),\s*\[value, questionTerminal\],\s*\);/);
  assert.ok(description, 'one description, worked out from the value and whether the question is closed, once per value');
  assert.match(body, new RegExp(`useMathFieldDescription\\(mfRef, ${description[1]}\\);`), 'on the sink of THIS field');
  assert.match(body, /const \{ terminal: questionTerminal \} = useQuestionLifecycle\(\);/);
  // The host keeps only its name: the description belongs where focus lands.
  const host = region(MATH_INPUT, '<math-field', '/>', 'the math-field host');
  assert.doesNotMatch(host, /aria-description/);
});
