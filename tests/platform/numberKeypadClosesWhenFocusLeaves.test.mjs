/*
 * THE NUMBER KEYPAD CLOSES WHEN FOCUS LEAVES THE QUESTION (student-a11y-3;
 * WCAG 2.4.11 Focus Not Obscured).
 *
 * My Math Path after a submitted question, with the phone's number keypad up:
 * the keypad stays up while focus moves on to a button inside the question (so
 * Step Algebra's move from its number box to "Apply to both sides" counts), and
 * so it was still up when Tab went on from the question to the session's
 * "Next question", which sat under it. Nothing the question does reveals a
 * control it does not hold. Focus leaving the question's root for another
 * element now closes the keypad, as a software keyboard closes when its box is
 * left; focus moving inside the question, or going nowhere, leaves it as it was.
 *
 * The browser proof is tests/browser/studentShellLargeText.mjs --check=obscured,
 * scene session-hosts/path-after-submit: on a 390×844 phone it found "Next
 * question" under the keypad, forward and back, until this.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { focusLeavesQuestion } from '../../src/platform/mobile/mobileFocusViewport.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// A question root and the elements it holds, as the DOM's contains() answers.
const element = (name) => ({ nodeType: 1, name });
const rootHolding = (...held) => ({ contains: (node) => held.includes(node) });

test('focus moving out of the question to another control is leaving it', () => {
  const box = element('the number box');
  const apply = element('Apply to both sides');
  const keypadKey = element('the keypad\'s 7');
  const next = element('Next question');
  const root = rootHolding(box, apply, keypadKey);
  assert.equal(focusLeavesQuestion(root, next), true, 'the session\'s Next question is outside the question');
  // Inside the question the keypad stays: the box's own buttons and the keypad's keys.
  assert.equal(focusLeavesQuestion(root, apply), false);
  assert.equal(focusLeavesQuestion(root, keypadKey), false);
  assert.equal(focusLeavesQuestion(root, box), false);
  // Focus going nowhere (the page, another window) is not a control the keypad is in the way of.
  assert.equal(focusLeavesQuestion(root, null), false);
  assert.equal(focusLeavesQuestion(root, { nodeType: 3 }), false, 'not an element');
  assert.equal(focusLeavesQuestion(null, next), false, 'no question');
});

test('the phone question closes its keypad when focus leaves it, and only then', () => {
  const container = executableSource(readFileSync(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8'));
  const blur = region(container, 'const handleBlurCapture = (event) => {', '\n  };', 'the blur handler');
  // Focus still inside the question returns first, so the keypad stays for "Apply to both sides".
  assert.match(blur, /^const handleBlurCapture = \(event\) => \{\s*if \(rootRef\.current\?\.contains\?\.\(event\.relatedTarget\)\) return;\s*if \(focusLeavesQuestion\(rootRef\.current, event\.relatedTarget\)\) setNumericTarget\(null\);/);
  // The blur is the question's own: the root listens for it.
  assert.match(container, /onBlurCapture=\{handleBlurCapture\}/);
  // A button inside the question still keeps it open (the focus handler's rule is unchanged).
  const focus = region(container, 'const handleFocusCapture = (event) => {', 'const localScroller', 'the focus handler');
  assert.match(focus, /!target\?\.closest\?\.\('\.mathmaster-mobile-numeric-keypad'\)\s*&& !target\?\.closest\?\.\('button'\)/);
});
