/*
 * WHEN THE NUMBER KEYPAD CHANGES SIZE, WHAT HAS FOCUS IS BROUGHT INTO VIEW (WCAG 2.4.11 Focus Not Obscured).
 *
 * The keypad publishes its height as it opens and whenever it changes size, and the question then scrolls
 * the box it types into back into view, because focus scrolled that box before the keys were there. The
 * keypad stays up while focus moves on to a button inside the question (Step Algebra's "Apply to both
 * sides"; Tab from the box to "Show a hint"), and a resize then still brought the box back: on a 390×844
 * phone the Constraint Function Builder's "Show a hint" had been scrolled to y 522 to 566, just above the
 * keys at 570, and the box's reveal moved the work 137px down, leaving the focused button under the keys'
 * 5 and 2. The reveal now follows focus.
 *
 * The browser proof is tests/browser/studentShellLargeText.mjs --check=obscured, scene
 * registry-tools/constraintFunctionBuilder on the phone: CI's run on main found "Show a hint" under a key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keypadRevealTarget } from '../../src/platform/mobile/mobileFocusViewport.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// Elements and the containers that hold them, as the DOM's contains() answers.
const element = (name) => ({ nodeType: 1, name });
const holding = (...held) => ({ contains: (node) => held.includes(node) });

test('the box is revealed while it, or one of the keypad\'s keys, has focus, or nothing in the question does', () => {
  const box = element('the number box');
  const seven = element('the keypad\'s 7');
  const hint = element('Show a hint');
  const keypad = holding(seven);
  const root = holding(box, hint, seven);
  assert.equal(keypadRevealTarget({ numericTarget: box, active: box, root, keypad }), box);
  assert.equal(keypadRevealTarget({ numericTarget: box, active: seven, root, keypad }), box, 'the keys type into the box');
  assert.equal(keypadRevealTarget({ numericTarget: box, active: null, root, keypad }), box, 'focus gone to nothing');
  // A keypad outside the question (a sibling of it) still counts its own keys.
  assert.equal(keypadRevealTarget({ numericTarget: box, active: seven, root: holding(box, hint), keypad }), box);
  // Focus outside the question is the question's blur's business (it closes the keypad); the reveal is as it was.
  assert.equal(keypadRevealTarget({ numericTarget: box, active: element('Next question'), root, keypad }), box);
  assert.equal(keypadRevealTarget({ numericTarget: box, active: { nodeType: 3 }, root, keypad }), box, 'not an element');
});

test('once focus has moved on to another control in the question, that control is revealed', () => {
  const box = element('the number box');
  const hint = element('Show a hint');
  const apply = element('Apply to both sides');
  const keypad = holding(element('the keypad\'s 7'));
  const root = holding(box, hint, apply);
  assert.equal(keypadRevealTarget({ numericTarget: box, active: hint, root, keypad }), hint);
  assert.equal(keypadRevealTarget({ numericTarget: box, active: apply, root, keypad }), apply);
  // No keypad target, nothing to reveal for the keypad.
  assert.equal(keypadRevealTarget({ numericTarget: null, active: hint, root, keypad }), null);
  // Without a question root nothing counts as "moved on": the box, as before.
  assert.equal(keypadRevealTarget({ numericTarget: box, active: hint, root: null, keypad }), box);
});

test('the keypad\'s resize reveal asks keypadRevealTarget, with focus, the question and the keypad', () => {
  const container = executableSource(readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'));
  const effect = region(container, 'root.dataset.mobileKeypadOpen = \'true\';', 'observer.observe(keypadRef.current)', 'the keypad height effect');
  assert.match(effect, /keypadRevealTarget\(\{\s*numericTarget,\s*active: document\.activeElement,\s*root: rootRef\.current,\s*keypad: keypadRef\.current,\s*\}\)/);
  assert.match(effect, /if \(target\?\.isConnected\) scrollFocusedControlVertically\(target, \{ root: rootRef\.current \}\);/);
  // The box itself is no longer revealed unconditionally there.
  assert.doesNotMatch(effect, /scrollFocusedControlVertically\(numericTarget,/);
});
