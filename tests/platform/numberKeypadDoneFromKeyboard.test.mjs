/*
 * DONE ON THE NUMBER KEYPAD, PRESSED FROM THE KEYBOARD, GOES ON (keypad-done; WCAG 2.4.3, 2.1.1).
 *
 * Done closes the keypad by taking it off the page, Done included. A student who reached Done with Tab and pressed
 * Enter or Space (a touch-screen Chromebook with a keyboard shows the keypad and takes keys) was left with nothing
 * focused, and the next Tab started again from the top of the page. Pressed from the keyboard, Done now goes where Tab
 * off it goes, the work bar's first control; with no bar under the keys (a phone on its side, a solver workspace, a
 * box in a dialog) it goes back to the box it served, which keeps its keypad closed until the student touches it
 * again. A finger's press is as it was: focus left on the page, no ring, no keypad, no screen keyboard.
 *
 * The browser proof is tests/browser/studentUxPlatform.mjs `keypad-done` (CI: student-teacher-journeys, student):
 * 390×844 with touch, a tap on Done, then Enter and Space on it; on its side, Enter, the box kept closed until a tap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { focusAfterKeypadDone, keypadTargetOnFocus, pressReopensKeypad } from '../../src/platform/mobile/mobileFocusViewport.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// Elements as the helpers read them: a bar's controls, a box on the page (or gone from it), and what is inside it.
const control = (name, { disabled = false, tabIndex = 0, hiddenAbove = false } = {}) => ({
  name, disabled, tabIndex, closest: (selector) => (hiddenAbove && /aria-hidden|inert/.test(selector) ? {} : null),
});
const holding = (...elements) => ({ querySelectorAll: () => elements });
const boxOnPage = (name, { connected = true, holds = [] } = {}) => {
  const box = { name, isConnected: connected };
  box.contains = (node) => node === box || holds.includes(node);
  return box;
};
// A click no pointer made (Enter or Space on a focused button, or a screen reader's press) has detail 0; a finger's,
// a pen's or a mouse's counts its presses.
const fromKeyboard = { detail: 0 };
const tapped = { detail: 1 };

test('Done pressed from the keyboard goes on to the work bar\'s first control that takes focus, as Tab off it does', () => {
  const startOver = control('Start question over');
  const box = boxOnPage('Slope m');
  assert.deepEqual(focusAfterKeypadDone(fromKeyboard, { bar: holding(startOver, control('Scratchpad')), box }), { focus: startOver, keepClosed: null });
  // A disabled control, one out of the tab order, or one inside a hidden part of the bar is passed over.
  const submit = control('Submit');
  const bar = holding(control('Undo', { disabled: true }), control('Tools', { tabIndex: -1 }), control('Hint', { hiddenAbove: true }), submit);
  assert.equal(focusAfterKeypadDone(fromKeyboard, { bar, box }).focus, submit);
});

test('with no bar under the keys, Done pressed from the keyboard goes back to the box, which keeps its keypad closed', () => {
  const box = boxOnPage('Slope m');
  // A phone on its side, a solver workspace or a box in a dialog: the question hands no bar.
  assert.deepEqual(focusAfterKeypadDone(fromKeyboard, { bar: null, box }), { focus: box, keepClosed: box });
  // A bar with nothing in it that takes focus is no way on either.
  assert.deepEqual(focusAfterKeypadDone(fromKeyboard, { bar: holding(control('Submit', { disabled: true })), box }), { focus: box, keepClosed: box });
  // A box no longer on the page (the question moved on) is nowhere to go: Done closes the keypad as before.
  assert.equal(focusAfterKeypadDone(fromKeyboard, { bar: null, box: boxOnPage('Slope m', { connected: false }) }), null);
  assert.equal(focusAfterKeypadDone(fromKeyboard, {}), null);
});

test('a press of a finger, a pen or a mouse is left as it was: no focus moved, no box kept closed', () => {
  const bar = holding(control('Start question over'));
  const box = boxOnPage('Slope m');
  assert.equal(focusAfterKeypadDone(tapped, { bar, box }), null, 'a tap');
  assert.equal(focusAfterKeypadDone({ detail: 2 }, { bar, box }), null, 'a second press in a row');
  assert.equal(focusAfterKeypadDone(tapped, { bar: null, box }), null, 'a tap with no bar under the keys');
  assert.equal(focusAfterKeypadDone(null, { bar, box }), null);
});

test('the box Done closed opens no keypad when focus comes back to it, and a press on it opens it again', () => {
  const field = { name: 'the box\'s text' };
  const box = boxOnPage('Slope m', { holds: [field] });
  const other = boxOnPage('y-intercept b');
  // Focus on it opens no keypad, and closes one open for another box; any other box opens its own, as before.
  assert.equal(keypadTargetOnFocus(box, box), null);
  assert.equal(keypadTargetOnFocus(other, box), other);
  assert.equal(keypadTargetOnFocus(box, null), box, 'no box kept closed: every box opens its keypad');
  // A press on it, or on what it holds, opens it again; a press anywhere else does not.
  assert.equal(pressReopensKeypad(box, box), true);
  assert.equal(pressReopensKeypad(box, field), true);
  assert.equal(pressReopensKeypad(box, other), false);
  assert.equal(pressReopensKeypad(null, box), false, 'no box kept closed');
  assert.equal(pressReopensKeypad(box, null), false);
});

test('the phone question\'s Done hands focus on only when pressed from the keyboard, and keeps the box closed until touched', () => {
  const container = executableSource(readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'));
  // Done reads the bar under the keys, as Tab off the keypad does (numberKeypadTabToWorkBar.test.mjs), and the box.
  assert.match(container, /<button type="button" className="mathmaster-keypad-done" onClick=\{handleKeypadDone\}>Done<\/button>/, 'Done is wired to its handler');
  const done = region(container, 'const handleKeypadDone = (event) => {', '\n  };', 'Done\'s handler');
  assert.match(done, /const next = focusAfterKeypadDone\(event, \{ bar: barUnderKeys\(\), box: numericTarget \}\);/);
  // From the keyboard: the place to go on to, handed to the effect that focuses it once the keypad is gone, and the
  // box to keep closed. A finger's press blurs the box, as it always has. The keypad closes either way.
  assert.match(done, /if \(next\) \{\s*closeFocusRef\.current = next\.focus;\s*if \(next\.keepClosed\) keptClosedRef\.current = next\.keepClosed;\s*\} else \{\s*numericTarget\?\.blur\?\.\(\);\s*\}\s*setNumericTarget\(null\);$/);
  const effect = region(container, 'useLayoutEffect(() => {\n    const next = closeFocusRef.current;', '}, [numericTarget]);', 'the hand-off');
  assert.match(effect, /if \(numericTarget \|\| !next\) return;\s*closeFocusRef\.current = null;\s*if \(next\.isConnected\) next\.focus\(\);/);
  // Focus on the kept box opens no keypad; a press on it opens it, at once when it already has focus.
  const focus = region(container, 'const handleFocusCapture = (event) => {', 'const localScroller', 'the focus handler');
  assert.match(focus, /if \(target\?\.matches\?\.\(NUMERIC_SELECTOR\)\) \{\s*(?:\/\/[^\n]*\n\s*)*setNumericTarget\(keypadTargetOnFocus\(target, keptClosedRef\.current\)\);/);
  const press = region(container, 'const handlePointerDownCapture = (event) => {', '\n  };', 'the press handler');
  assert.match(press, /pointerPressRef\.current = event\.target;/, 'a press is still remembered for the drawing surfaces');
  assert.match(press, /if \(!pressReopensKeypad\(keptClosed, event\.target\)\) return;\s*keptClosedRef\.current = null;\s*if \(isMobile && document\.activeElement === keptClosed\) setNumericTarget\(keptClosed\);/);
  assert.match(container, /onPointerDownCapture=\{handlePointerDownCapture\}/, 'the question listens for presses');
  // A closed question keeps no box closed.
  const terminal = region(container, 'if (!questionTerminal) return;', '}, [questionTerminal]);', 'the closed question');
  assert.match(terminal, /keptClosedRef\.current = null;/);
});

// The browser proof by keyboard: the keyboard sweep, on a 390×844 phone that answers touch (CI: accessibility-
// certification.yml browser-keyboard-sweep (phone i/3), with --gate). Where its forward walk went through the keypad to
// Done, the scene is opened again for Enter and for Space on Done, and once more on its side; a press that leaves focus
// out of the question, or the keypad open, counts into the gate's focusLost (keyboardSweepGate.test.mjs). Taken out, the
// nine phone scenes with a number box fail it again: focusLost 3 each.
test('the keyboard sweep presses Done with Enter and with Space where its walk went through the keypad, and on its side', () => {
  const sweep = executableSource(readFileSync(new URL('../browser/keyboardSweep.mjs', import.meta.url), 'utf8'));
  assert.match(sweep, /if \(keypadDoneInWalk\(entry\.forward\)\) \{\s*entry\.keypadDone = await keypadDoneProbe\(open, entry\.forward\);/, 'the scene loop runs it where the walk met Done');
  const probe = region(sweep, 'const keypadDoneProbe = async (open, forward) => {', '\n};', 'the probe');
  assert.match(probe, /for \(const press of \['Enter', 'Space'\]\) \{\s*const \{ page, errors: pageErrors \} = await open\(\);/, 'each press on a fresh copy of the scene');
  assert.match(probe, /await page\.keyboard\.press\(press\);/);
  assert.match(probe, /asTab: after\.landed === tabLanded/, 'where Tab off Done went in the walk is the comparison');
  assert.match(probe, /setViewportSize\(\{ width: VIEWPORT\.height, height: VIEWPORT\.width \}\)[\s\S]*keyboard\.press\('Enter'\)/, 'and on its side');
  assert.match(probe, /const lost = \(result\) => result\.reached && \(result\.body \|\| !result\.inQuestion \|\| result\.keypadOpen\);/);
  assert.match(probe, /focusLost: presses\.filter\(\(result\) => !result\.reached \|\| lost\(result\)\)\.length \+ \(lost\(sideways\) \? 1 : 0\),/, 'a press that never reached Done is not a pass');
  assert.match(sweep, /focusLostAfterKeypadDone: entry\.keypadDone \? entry\.keypadDone\.focusLost : null,/, 'written where the gate reads it');
});
