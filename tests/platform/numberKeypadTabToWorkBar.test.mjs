/*
 * TAB OFF THE NUMBER KEYPAD GOES ON TO THE WORK BAR (student-keyboard-ci; WCAG 2.1.1, 2.4.3).
 *
 * On a phone held upright the open number keypad takes the work bar's place: the bar is hidden under it, which
 * suits a finger, and Done brings it back. By keyboard, Tab from the keypad's last key went on past the hidden bar
 * and out of the question, and the keypad closed behind it, so going forward Tab never stopped on Submit once an
 * answer was typed, nor on Start over, the Scratchpad, the Calculator or the hint button. The keyboard sweep on a
 * phone found it on four legacy question types (a table, a graph, a function graph, a function investigation).
 * Tab off the keypad's last key now closes the keypad, as Done does, and goes on to the bar's first control.
 *
 * The browser proof is tests/browser/keyboardSweep.mjs --viewport=phone --gate (the accessibility workflow's
 * browser-keyboard-sweep jobs): with this taken out, those four scenes fail it again, `unreached` and an enabled
 * Submit never reached by Tab.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workBarControlAfterKeypad } from '../../src/platform/mobile/mobileFocusViewport.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// Elements as the helper reads them: a keypad's keys, a bar's controls, and the DOM's closest().
const control = (name, { disabled = false, tabIndex = 0, hiddenAbove = false } = {}) => ({
  name, disabled, tabIndex, closest: (selector) => (hiddenAbove && /aria-hidden|inert/.test(selector) ? {} : null),
});
const holding = (...elements) => ({ querySelectorAll: () => elements });
const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', '.', 'Delete', 'Clear', 'Done'].map((key) => control(key));
const keypad = holding(...KEYS);
const done = KEYS.at(-1);
const tab = (target, more = {}) => ({ key: 'Tab', target, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...more });

test('Tab off the keypad\'s last key goes on to the work bar\'s first control that takes focus', () => {
  const startOver = control('Start over');
  const bar = holding(startOver, control('Scratchpad'), control('Submit', { disabled: true }));
  assert.equal(workBarControlAfterKeypad(tab(done), keypad, bar), startOver);
  // A disabled control, one out of the tab order, or one inside a hidden part of the bar is passed over.
  const submit = control('Submit');
  assert.equal(workBarControlAfterKeypad(tab(done), keypad, holding(control('Undo', { disabled: true }), control('Tools', { tabIndex: -1 }), control('Hint', { hiddenAbove: true }), submit)), submit);
});

test('anything else is left to the browser, as before', () => {
  const bar = holding(control('Start over'));
  assert.equal(workBarControlAfterKeypad(tab(KEYS[0]), keypad, bar), null, 'Tab between the keys');
  assert.equal(workBarControlAfterKeypad(tab(KEYS.at(-2)), keypad, bar), null, 'a key that is not the last');
  assert.equal(workBarControlAfterKeypad(tab(done, { shiftKey: true }), keypad, bar), null, 'Shift+Tab goes back into the keys');
  for (const chord of ['altKey', 'ctrlKey', 'metaKey']) assert.equal(workBarControlAfterKeypad(tab(done, { [chord]: true }), keypad, bar), null, chord);
  assert.equal(workBarControlAfterKeypad({ key: 'Enter', target: done }, keypad, bar), null, 'Enter presses Done');
  assert.equal(workBarControlAfterKeypad(tab(done), keypad, holding(control('Submit', { disabled: true }))), null, 'a bar with nothing to focus: Tab goes on');
  assert.equal(workBarControlAfterKeypad(tab(done), keypad, null), null, 'no bar (on its side, or in Work View)');
  assert.equal(workBarControlAfterKeypad(tab(done), null, bar), null, 'no keypad');
  assert.equal(workBarControlAfterKeypad(null, keypad, bar), null);
});

test('the phone question hands Tab off its keypad to the bar, only where the bar is under the keys', () => {
  const container = executableSource(readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'));
  const handler = region(container, 'const handleKeypadKeyDown = (event) => {', '\n  };', 'the keypad\'s key handler');
  // The bar under the keys (barUnderKeys, which Done pressed from the keyboard reads too): none on its side or in a
  // focused workspace (no portrait bar), and none from inside Work View, whose row is above the keys.
  const bar = region(container, 'const barUnderKeys = () => (', ');', 'the bar under the keys');
  assert.match(bar, /^const barUnderKeys = \(\) => \(isLandscape \|\| workspaceActive \|\| numericTarget\?\.closest\?\.\('\[role="dialog"\], \[aria-modal="true"\]'\)\s*\? null\s*: rootRef\.current\?\.querySelector\(':scope > \.portrait-action-bar'\)$/, 'the question\'s own bar, and only there');
  assert.match(handler, /^const handleKeypadKeyDown = \(event\) => \{\s*const next = workBarControlAfterKeypad\(event, keypadRef\.current, barUnderKeys\(\)\);/, 'Tab hands off to that bar');
  assert.match(handler, /if \(!next\) return;\s*event\.preventDefault\(\);\s*closeFocusRef\.current = next;\s*setNumericTarget\(null\);/, 'the keypad closes, as Done closes it');
  // Focus goes on once the keypad is gone and the bar is shown again (before the next frame, so no key lands between).
  const effect = region(container, 'useLayoutEffect(() => {\n    const next = closeFocusRef.current;', '}, [numericTarget]);', 'the hand-off');
  assert.match(effect, /if \(numericTarget \|\| !next\) return;\s*closeFocusRef\.current = null;\s*if \(next\.isConnected\) next\.focus\(\);/);
  assert.match(container, /role="group" aria-label="Number keypad" onKeyDown=\{handleKeypadKeyDown\}/, 'the keypad listens');
  // The bar it hands off to is the one the open keypad hides.
  const css = readFileSync(new URL('../../src/components/student/MathToolMobileLayout.css', import.meta.url), 'utf8');
  assert.match(css, /\.mathmaster-question-container\.mode-portrait\.numeric-keypad-open \.portrait-action-bar \{\s*display: none;/);
  assert.match(container, /className="portrait-action-bar"/);
});
