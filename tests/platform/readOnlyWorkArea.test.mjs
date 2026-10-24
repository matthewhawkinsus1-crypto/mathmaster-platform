/*
 * AX01 (Q-97): A FINISHED QUESTION'S WORK IS READ-ONLY, NOT INERT.
 *
 * `inert` took a closed question's graph, number line, 3D model and the
 * student's own answers out of the accessibility tree, so a screen-reader
 * student could not review them. Finished work now stays in the tree and stays
 * locked: the disabled fieldset, plus a guard on the work area that stops
 * every key, press, paste and drop that could change it
 * (src/platform/interaction/readOnlyWorkArea.js). Waiting work (a submit in
 * flight, the "Let's back up" step, another tab) is still inert.
 *
 * Browser proof (Chromium accessibility tree, keys and Work View):
 * tests/browser/figureDescriptions.mjs ("a closed question's work can be read
 * and not changed") and tests/browser/moduleRecoveryLock.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  READ_ONLY_EFFECT,
  READ_ONLY_GUARDED_EVENTS,
  READ_ONLY_WORK_AREA_ATTRIBUTE,
  READ_ONLY_WORK_AREA_LABEL,
  READ_ONLY_WORK_AREA_SELECTOR,
  bindReadOnlyWorkArea,
  guardReadOnlyEvent,
  readOnlyEventEffect,
  readOnlyKeyEffect,
} from '../../src/platform/interaction/readOnlyWorkArea.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const { PASS, STOP, BLOCK } = READ_ONLY_EFFECT;

const key = (value, modifiers = {}) => ({ type: 'keydown', key: value, ...modifiers });

// A work area as the guard sees it, and events with their two methods recorded.
const area = (readOnly) => ({ getAttribute: (name) => (name === READ_ONLY_WORK_AREA_ATTRIBUTE && readOnly ? 'true' : null) });
const event = (fields, currentTarget) => {
  const calls = [];
  return {
    cancelable: true,
    ...fields,
    currentTarget,
    calls,
    stopPropagation: () => calls.push('stop'),
    preventDefault: () => calls.push('prevent'),
  };
};

test('typing, deleting, pressing and editing shortcuts are blocked; Tab and Escape pass', () => {
  for (const typed of ['a', 'Z', '7', '-', '/', '=', '(', ' ', 'π', 'é']) {
    assert.equal(readOnlyKeyEffect(key(typed)), BLOCK, `typing "${typed}"`);
    assert.equal(readOnlyKeyEffect(key(typed, { shiftKey: true })), BLOCK, `Shift+"${typed}"`);
  }
  // Option (Mac) and AltGr type characters too.
  assert.equal(readOnlyKeyEffect(key('π', { altKey: true })), BLOCK);
  for (const editing of ['Enter', 'Backspace', 'Delete']) {
    assert.equal(readOnlyKeyEffect(key(editing)), BLOCK, editing);
    assert.equal(readOnlyKeyEffect(key(editing, { ctrlKey: true })), BLOCK, `Ctrl+${editing}`);
  }
  for (const letter of ['v', 'x', 'z', 'y', 'V', 'Z']) {
    assert.equal(readOnlyKeyEffect(key(letter, { ctrlKey: true })), BLOCK, `Ctrl+${letter}`);
    assert.equal(readOnlyKeyEffect(key(letter, { metaKey: true })), BLOCK, `Cmd+${letter}`);
  }
  // Moving through the work and closing Work View from it.
  assert.equal(readOnlyKeyEffect(key('Tab')), PASS);
  assert.equal(readOnlyKeyEffect(key('Tab', { shiftKey: true })), PASS);
  assert.equal(readOnlyKeyEffect(key('Escape')), PASS);
});

// MathLive moves focus on Tab itself and cancels the browser's Tab; it cannot
// see a <fieldset disabled>, so in finished work its "next control" was a
// disabled button and Tab never left the field (found in Chromium, AX01). In a
// math field Tab stops at the area: the browser's own Tab moves on.
test('Tab in a finished math field is the browser\'s, so it cannot be trapped there', () => {
  const inField = { closest: (selector) => (selector === 'math-field' ? {} : null) };
  const elsewhere = { closest: () => null };
  assert.equal(readOnlyKeyEffect({ type: 'keydown', key: 'Tab', target: inField }), STOP);
  assert.equal(readOnlyKeyEffect({ type: 'keydown', key: 'Tab', shiftKey: true, target: inField }), STOP);
  assert.equal(readOnlyKeyEffect({ type: 'keydown', key: 'Tab', target: elsewhere }), PASS, 'elsewhere Tab passes untouched');
  assert.equal(readOnlyKeyEffect({ type: 'keydown', key: 'Escape', target: inField }), PASS, 'Escape still closes Work View from the field');
  const tab = event({ type: 'keydown', key: 'Tab', target: inField }, area(true));
  guardReadOnlyEvent(tab);
  assert.deepEqual(tab.calls, ['stop'], 'MathLive never hears it; the browser still moves focus');
});

test('a key that cannot edit stops at the area but keeps its browser default (scroll, zoom, find, copy)', () => {
  for (const navigation of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'F5', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Insert', 'Unidentified', 'Process', 'Dead']) {
    assert.equal(readOnlyKeyEffect(key(navigation)), STOP, navigation);
  }
  // A widget's own arrow-key moves never reach it, with any modifier.
  assert.equal(readOnlyKeyEffect(key('ArrowUp', { shiftKey: true })), STOP);
  for (const browser of ['+', '=', '-', '0', 'c', 'a', 'f', 'p', 'C']) {
    assert.equal(readOnlyKeyEffect(key(browser, { ctrlKey: true })), STOP, `Ctrl+${browser}`);
    assert.equal(readOnlyKeyEffect(key(browser, { metaKey: true })), STOP, `Cmd+${browser}`);
  }
  // keyup and keypress follow keydown.
  assert.equal(readOnlyEventEffect({ type: 'keyup', key: 'ArrowLeft' }), STOP);
  assert.equal(readOnlyEventEffect({ type: 'keypress', key: 'a' }), BLOCK);
  assert.equal(readOnlyEventEffect({ type: 'keyup', key: 'Tab' }), PASS);
});

test('presses, a screen reader\'s click, pastes, drops and text input are stopped; reading is not', () => {
  for (const type of ['beforeinput', 'paste', 'cut', 'drop', 'dragstart', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick']) {
    assert.equal(readOnlyEventEffect({ type }), BLOCK, type);
  }
  // Text that arrives without a key (a phone keyboard, dictation, an IME) is
  // never seen by the field's own listeners; a touch still scrolls the page.
  for (const type of ['input', 'change', 'compositionstart', 'compositionupdate', 'compositionend', 'touchstart', 'touchend']) {
    assert.equal(readOnlyEventEffect({ type }), STOP, type);
  }
  for (const type of ['focus', 'focusin', 'blur', 'wheel', 'scroll', 'copy', 'selectstart', 'contextmenu', 'pointermove', 'mousemove']) {
    assert.equal(readOnlyEventEffect({ type }), PASS, type);
    assert.ok(!READ_ONLY_GUARDED_EVENTS.includes(type), `${type} is not even listened for`);
  }
});

test('the guard acts only on work the page marks read-only', () => {
  const typed = event({ type: 'keydown', key: '5' }, area(true));
  assert.equal(guardReadOnlyEvent(typed), BLOCK);
  assert.deepEqual(typed.calls, ['stop', 'prevent'], 'a digit typed into finished work reaches nothing and types nothing');

  const arrow = event({ type: 'keydown', key: 'ArrowRight' }, area(true));
  assert.equal(guardReadOnlyEvent(arrow), STOP);
  assert.deepEqual(arrow.calls, ['stop'], 'an arrow key does not move a point, and still scrolls the page');

  const tab = event({ type: 'keydown', key: 'Tab' }, area(true));
  assert.equal(guardReadOnlyEvent(tab), PASS);
  assert.deepEqual(tab.calls, [], 'Tab moves on untouched (the Work View focus trap hears it)');

  const click = event({ type: 'click' }, area(true));
  guardReadOnlyEvent(click);
  assert.deepEqual(click.calls, ['stop', 'prevent'], 'a screen reader\'s click on a plotted point does nothing');

  // A non-cancelable event is still stopped.
  const late = event({ type: 'beforeinput', cancelable: false }, area(true));
  guardReadOnlyEvent(late);
  assert.deepEqual(late.calls, ['stop']);

  // Open work, or waiting work (it is inert instead): the guard is not there.
  for (const open of [area(false), null, {}]) {
    const typedOpen = event({ type: 'keydown', key: '5' }, open);
    assert.equal(guardReadOnlyEvent(typedOpen), PASS);
    assert.deepEqual(typedOpen.calls, []);
  }
});

test('the guard listens on the area itself, in the capture phase, before anything below it', () => {
  const listeners = [];
  const element = {
    addEventListener: (type, listener, options) => listeners.push({ type, listener, options, on: true }),
    removeEventListener: (type, listener, options) => {
      const found = listeners.find((entry) => entry.on && entry.type === type && entry.listener === listener
        && Boolean(typeof entry.options === 'object' ? entry.options.capture : entry.options) === Boolean(typeof options === 'object' ? options.capture : options));
      if (found) found.on = false;
    },
  };
  const unbind = bindReadOnlyWorkArea(element);
  assert.equal(typeof unbind, 'function', 'a React 19 callback ref with its own cleanup');
  assert.deepEqual(listeners.map((entry) => entry.type).sort(), [...READ_ONLY_GUARDED_EVENTS].sort());
  listeners.forEach(({ type, options, listener }) => {
    const capture = typeof options === 'object' ? options.capture : options;
    assert.equal(capture, true, `${type} is guarded on the way down`);
    assert.equal(listener, guardReadOnlyEvent);
  });
  // Touch is listened to passively: the guard never cancels a scroll.
  assert.deepEqual(listeners.filter((entry) => typeof entry.options === 'object' && entry.options.passive).map((entry) => entry.type).sort(), ['touchend', 'touchstart']);
  for (const type of ['keydown', 'beforeinput', 'paste', 'click', 'pointerdown']) assert.ok(READ_ONLY_GUARDED_EVENTS.includes(type), type);
  unbind();
  assert.equal(listeners.filter((entry) => entry.on).length, 0, 'unmounting removes every listener');
  assert.equal(bindReadOnlyWorkArea(null), undefined, 'React calls a ref with nothing on old engines');
});

test('QuestionEngine: finished work is read-only and named, waiting work is inert', () => {
  const engine = read('src/QuestionEngine.jsx');
  assert.match(engine, /^import \{ READ_ONLY_WORK_AREA_LABEL, READ_ONLY_WORK_AREA_SELECTOR, bindReadOnlyWorkArea \} from '\.\/platform\/interaction\/readOnlyWorkArea\.js';$/m);
  // Waiting is everything that closes the area except the question being finished.
  const inert = engine.match(/const workAreaInert = ([^;]+);/)?.[1] || '';
  assert.match(inert, /^!moduleFailed && Boolean\(scaffoldRequired \|\| contextScaffoldRequired \|\| submitting \|\| pausedByAnotherTab\)$/, 'inert while waiting, lifted for a failed module');
  assert.doesNotMatch(inert, /\blocked\b/, 'a finished question is not inert');
  assert.match(engine, /const workAreaReadOnly = workAreaClosed && !workAreaInert;/);

  const wrapper = region(engine, '<div aria-disabled={workAreaClosed', '>', 'the work area');
  assert.match(wrapper, /inert=\{workAreaInert \? true : undefined\}/, 'a boolean: React 19 reads inert="" as false');
  assert.match(wrapper, new RegExp(`${READ_ONLY_WORK_AREA_ATTRIBUTE}=\\{workAreaReadOnly \\? 'true' : undefined\\}`), 'the page says when the work is read-only');
  assert.match(wrapper, /ref=\{bindReadOnlyWorkArea\}/, 'the guard is bound to the area that holds the module');
  assert.match(wrapper, /pointerEvents: workAreaClosed \? 'none' : 'auto'/);
  assert.match(region(engine, '<fieldset disabled={workAreaClosed}', '>', 'the fieldset'), /aria-label=\{workAreaReadOnly \? READ_ONLY_WORK_AREA_LABEL : undefined\}/);
  assert.equal(READ_ONLY_WORK_AREA_SELECTOR, `[${READ_ONLY_WORK_AREA_ATTRIBUTE}="true"]`);
  assert.doesNotMatch(READ_ONLY_WORK_AREA_LABEL, /\b(inert|disabled|aria|locked)\b/i, 'the student\'s words');
});

test('QuestionEngine: focus a close leaves on finished work goes on to Next, as when the work went inert', () => {
  const engine = read('src/QuestionEngine.jsx');
  const focus = region(engine, 'const was = wasLockedRef.current;', '}, [locked, assignmentLocked', 'focus on lock');
  assert.match(focus, /const stranded = Boolean\(active\?\.closest\?\.\(READ_ONLY_WORK_AREA_SELECTOR\) && questionEngineRef\.current\?\.contains\?\.\(active\)\);/);
  assert.match(focus, /const ours = [^;]*\|\| stranded;\s*if \(!ours\) return;/);
});

test('Work View\'s focus trap skips a button its fieldset disables (finished work is in the dialog now)', () => {
  const dialog = read('src/ui/Dialog.jsx');
  const disabled = region(dialog, 'const actuallyDisabled = (element) => {', '\n};', 'actually disabled');
  assert.match(disabled, /if \(element\.disabled === true\) return true;/);
  assert.match(disabled, /return element\.matches\(':disabled'\);/);
  assert.match(region(dialog, 'const tabbableWithin = (root) => {', '\n};', 'tabbable'), /disabled: actuallyDisabled\(element\),/);
});
