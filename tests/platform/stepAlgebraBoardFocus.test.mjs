/*
 * WHERE THE CURSOR GOES ON STEP ALGEBRA'S BOARD WHEN WHAT HELD IT GOES AWAY
 * (src/platform/algebra/boardFocus.js).
 *
 * After a committed step (Enter in the simplification box, Check my
 * simplification, Keep as written, the last cross-out) the control the cursor
 * was in goes with the step, and focus fell to the page, in a composed
 * question and on the standalone board alike. It now goes back to the tile the
 * move began from. And a character typed at the tile just chosen, before its
 * box's deferred focus, went to the tile and cost the box its cursor; it now
 * goes into the box. tests/browser/workflowStepEnter.mjs and
 * tests/browser/stepAlgebraFirstOperand.mjs press the keys in Chromium; these
 * pin the rules and the board's wiring. Every rule below is mutation-checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  focusFellToPage,
  operationTileAfterStep,
  operationTileKeyAction,
  typeAheadIntoOperand,
  typesACharacter,
} from '../../src/platform/algebra/boardFocus.js';
import { h } from './helpers/miniDom.mjs';
import { fieldWithKeyboardPath, installKeyEvents } from './helpers/mathLiveKeyPath.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/* ------------------------------------------------------- after a step */

test('focus has fallen to the page when nothing, the body or the root holds it', () => {
  const body = { tagName: 'BODY' };
  const root = { tagName: 'HTML' };
  const doc = (activeElement) => ({ activeElement, body, documentElement: root });
  assert.equal(focusFellToPage(doc(body)), true);
  assert.equal(focusFellToPage(doc(root)), true);
  assert.equal(focusFellToPage(doc(null)), true, 'the element that had it is gone');
  assert.equal(focusFellToPage(doc({ tagName: 'BUTTON' })), false, 'a student who went somewhere else stays there');
  const sink = { tagName: 'TEXTAREA' };
  assert.equal(focusFellToPage(doc({ tagName: 'MATH-FIELD', shadowRoot: { activeElement: sink } })), false, 'a box with the cursor inside it');
  assert.equal(focusFellToPage(null), false, 'no document: nothing to decide');
});

const OPERATION_LABELS = ['Add', 'Subtract', 'Multiply by', 'Divide by'];
const tiles = (group, { disabled = [] } = {}) => OPERATION_LABELS.map((label) => h('button', {
  type: 'button', 'aria-label': `Choose ${label} operation`, 'data-group': group, ...(disabled.includes(label) ? { disabled: true } : {}),
}));
const desktopBoard = (options = {}) => h('section', {},
  h('div', { class: 'algebra-rail algebra-rail-left' }, ...tiles('left', options.left)),
  h('div', { 'data-math-state': 'x=7' }),
  h('div', { class: 'algebra-rail algebra-rail-right' }, ...tiles('right', options.right)));
const phoneBoard = () => h('section', {},
  h('div', { class: 'algebra-mobile-operation-palette' }, ...tiles('phone')));
const named = (tile) => tile && `${tile.getAttribute('data-group')}:${tile.getAttribute('aria-label')}`;

test('the cursor goes back to the tile the move began from, in the rail it was chosen from', () => {
  assert.equal(named(operationTileAfterStep(desktopBoard(), { label: 'Divide by', side: 'left' })), 'left:Choose Divide by operation');
  assert.equal(named(operationTileAfterStep(desktopBoard(), { label: 'Divide by', side: 'right' })), 'right:Choose Divide by operation');
  assert.equal(named(operationTileAfterStep(desktopBoard(), { label: 'Subtract' })), 'left:Choose Subtract operation', 'a move with no side recorded: the left rail');
  assert.equal(named(operationTileAfterStep(phoneBoard(), { label: 'Divide by', side: 'right', phone: true })), 'phone:Choose Divide by operation', 'a phone has one palette');
});

test('a tile that cannot take the cursor is passed over, and nothing is invented', () => {
  assert.equal(
    named(operationTileAfterStep(desktopBoard({ right: { disabled: ['Divide by'] } }), { label: 'Divide by', side: 'right' })),
    'left:Choose Divide by operation',
    'the same tile in the other rail',
  );
  assert.equal(
    named(operationTileAfterStep(desktopBoard({ left: { disabled: OPERATION_LABELS }, right: { disabled: ['Divide by'] } }), { label: 'Divide by' })),
    'right:Choose Add operation',
    'then the first tile on the board that can take it',
  );
  assert.equal(named(operationTileAfterStep(desktopBoard(), { label: 'Square root' })), 'left:Choose Add operation', 'an operation with no tile of its own');
  assert.equal(operationTileAfterStep(h('section', {}, h('div', { 'data-math-state': 'x=7' })), { label: 'Divide by' }), null, 'no tile shown (an inline tool is open)');
  assert.equal(operationTileAfterStep(desktopBoard({ left: { disabled: OPERATION_LABELS }, right: { disabled: OPERATION_LABELS } }), { label: 'Divide by' }), null, 'a locked board');
  assert.equal(operationTileAfterStep(null, { label: 'Divide by' }), null);
});

/* ------------------------------------------- a key typed at the tile */

const key = (value, extra = {}) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
  prevented: false,
  preventDefault() { this.prevented = true; this.defaultPrevented = true; },
  ...extra,
});

test('only a key that types one character is taken from the tile', () => {
  ['5', 'x', '-', '/', '(', 'π'].forEach((value) => assert.equal(typesACharacter(key(value)), true, value));
  assert.equal(typesACharacter(key(' ')), false, 'Space presses the tile');
  assert.equal(typesACharacter(key('Enter')), false, 'so does Enter');
  ['Tab', 'Shift', 'ArrowRight', 'Backspace', 'Escape'].forEach((value) => assert.equal(typesACharacter(key(value)), false, value));
  assert.equal(typesACharacter(key('c', { ctrlKey: true })), false, 'a shortcut');
  assert.equal(typesACharacter(key('v', { metaKey: true })), false);
  assert.equal(typesACharacter(key('5', { altKey: true })), false);
  assert.equal(typesACharacter(key('5', { isComposing: true })), false, 'mid-composition');
  assert.equal(typesACharacter(key('5', { defaultPrevented: true })), false, 'already handled');
  assert.equal(typesACharacter(null), false);
});

// A stand-in <math-field> with MathLive's keyboard path on its sink
// (helpers/mathLiveKeyPath.mjs): a key pressed in it, and a character merely
// inserted into it, come out differently, as they do in the browser.
installKeyEvents();
const makeField = (options = {}) => fieldWithKeyboardPath({ name: 'operand', ...options });
// The student's next key, once the box has the cursor: MathLive's own path.
const typeInBox = (field, value) => {
  const down = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, composed: true });
  down.isTrusted = true;
  if (field.sink.dispatchEvent(down)) field.sink.dispatchEvent(new InputEvent('input', { data: value, inputType: 'insertText' }));
};

test('a character typed at the tile goes into the box, which takes the cursor in the same event', () => {
  const field = makeField();
  const event = key('5', { code: 'Digit5' });
  assert.equal(typeAheadIntoOperand(event, field), true);
  assert.equal(field.value, '5', 'the character is in the box');
  assert.deepEqual(field.sink.focusCalls, [{ preventScroll: true }], 'with the cursor, and the page does not scroll');
  assert.equal(event.prevented, true, 'the tile does nothing with it, and the browser types it nowhere else');
  assert.deepEqual(field.keysSeen, ['5'], 'the box saw the key once, as a key pressed in it');
});

// Review after 608e5ee6: replayed with executeCommand(['typedText', key]) the
// key skipped the box's keyboard path. Measured in Chromium, typed before the
// box's first frame: "(-5)" became \left((-5\right) (shown "((-5)"; placed on
// both sides, "Parenthesis ) expected"), "pi" and "sqrt(2)" stayed letters.
test('the key is typed as a key pressed in the box: "(" opens its pair, and "p" then "i" make π', () => {
  const paren = makeField();
  typeAheadIntoOperand(key('(', { code: 'Digit9', shiftKey: true }), paren);
  assert.equal(paren.value, '\\left(\\right)', 'the box\'s own pair, not a bare "("');
  assert.deepEqual(paren.commands, [], 'nothing inserted behind the keyboard path');

  const pi = makeField();
  typeAheadIntoOperand(key('p', { code: 'KeyP' }), pi);
  typeInBox(pi, 'i');
  assert.equal(pi.value, '\\pi', 'the shortcut sees the first letter too');

  // What the old replay did, in the same stand-in: the letters stay letters.
  const inserted = makeField();
  inserted.executeCommand(['typedText', 'p']);
  typeInBox(inserted, 'i');
  assert.equal(inserted.value, 'pi');
});

test('the replayed key carries what the student pressed, and is typed exactly once', () => {
  const field = makeField();
  const seen = [];
  field.sink.addEventListener('keydown', (event) => seen.push({ key: event.key, code: event.code, shiftKey: event.shiftKey, bubbles: event.bubbles, composed: event.composed, cancelable: event.cancelable }), { capture: true });
  const inputs = [];
  field.sink.addEventListener('input', (event) => inputs.push(event.data));
  typeAheadIntoOperand(key('(', { code: 'Digit9', shiftKey: true }), field);
  assert.deepEqual(seen, [{ key: '(', code: 'Digit9', shiftKey: true, bubbles: true, composed: true, cancelable: true }]);
  assert.deepEqual(inputs, [], 'a key the box took as it went down sends no text after it');
  typeAheadIntoOperand(key('7', { code: 'Digit7' }), field);
  assert.deepEqual(inputs, ['7'], 'a character it left to text entry arrives once, as the browser would send it');
  assert.equal(field.value, '\\left(\\right)7');
});

test('anything else is left to the tile', () => {
  for (const value of [' ', 'Enter', 'Tab']) {
    const field = makeField();
    const event = key(value);
    assert.equal(typeAheadIntoOperand(event, field), false, value);
    assert.equal(event.prevented, false);
    assert.equal(field.sink.focusCalls.length, 0);
  }
  const unbuilt = makeField({ built: false });
  const early = key('5');
  assert.equal(typeAheadIntoOperand(early, unbuilt), false, 'a box MathLive has not built yet');
  assert.equal(early.prevented, false);
  assert.equal(typeAheadIntoOperand(key('5'), makeField({ connected: false })), false, 'a box no longer on the page');
  assert.equal(typeAheadIntoOperand(key('5'), null), false, 'no box open');
});

/* -------------------------------------------------- the board's wiring */

const board = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));

test('the board sends the cursor back to the tile after a committed step, through the question\'s authority', () => {
  assert.match(board, /import \{[^}]*\bfocusFellToPage\b[^}]*\boperationTileAfterStep\b[^}]*\} from '\.\/platform\/algebra\/boardFocus\.js';/);
  const commit = region(board, 'const commitMove = async', 'const hasPartialCancellationSelection', 'commitMove');
  // Taken as the student commits, before the step settles.
  const ticket = commit.match(/const (\w+) = deferredFocusHost\?\.ticket\(\{ since: 'now', channel: '([\w-]+)' \}\) \|\| null;/);
  assert.ok(ticket, 'a ticket of its own, from the moment of the commit');
  assert.ok(commit.indexOf(ticket[0]) < commit.indexOf('window.setTimeout('), 'before the step settles');
  // Asked for only once the step is committed: not when the save was not queued.
  const signal = commit.indexOf('setStepCommitFocus({');
  assert.ok(signal > commit.indexOf('setPendingMove(null);'), 'after the step leaves the board');
  assert.ok(signal > commit.indexOf('if (holdUnsavedStep('), 'never for a step that was held');
  assert.match(commit.slice(signal), new RegExp(`^setStepCommitFocus\\(\\{\\s*ticket: ${ticket[1]},\\s*operation: operationTileRef\\.current\\?\\.operation \\|\\| move\\.operation,\\s*side: operationTileRef\\.current\\?\\.sourceSide \\|\\| 'left',\\s*phone: Boolean\\(mobileInteraction\\?\\.isMobile\\),\\s*\\}\\);`));
  // The focus itself, a frame after the render that removed the step's controls.
  const effect = region(board, 'if (!stepCommitFocus) return undefined;', '}, [stepCommitFocus', 'the step-commit focus effect');
  assert.match(effect, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(effect, /if \(ticket && !deferredFocusHost\?\.isLive\(ticket\)\) return;\s*if \(!focusFellToPage\(document\)\) return;/, 'only while that moment is the present, and only when focus fell to the page');
  assert.match(effect, /const tile = operationTileAfterStep\(boardRootRef\.current, \{ label, side, phone \}\);[\s\S]*?tile\?\.focus\(\{ preventScroll: true \}\);/);
  // The tile the move began from is the one the student chose.
  assert.match(region(board, 'const selectOperation = (operation, sourceSide) => {', 'setArmedTile({ operation, sourceSide });'), /operationTileRef\.current = \{ operation, sourceSide \};/);
});

// A pair cancelled with no operation in hand (commitStandaloneCancellation):
// measured in Chromium before this (stepAlgebraFirstOperand.mjs `cancel`),
// the pressed term went with its pair and the cursor fell to the page in 8 of
// 8 runs (left and right side, Chromebook and phone, keyboard and pointer).
test('with no operation in hand the cursor goes to the first tile of the cancelled side\'s rail, or the phone\'s palette', () => {
  assert.equal(named(operationTileAfterStep(desktopBoard(), { label: '', side: 'left' })), 'left:Choose Add operation');
  assert.equal(named(operationTileAfterStep(desktopBoard(), { label: '', side: 'right' })), 'right:Choose Add operation');
  assert.equal(named(operationTileAfterStep(phoneBoard(), { label: '', side: 'right', phone: true })), 'phone:Choose Add operation');
  assert.equal(named(operationTileAfterStep(desktopBoard({ right: { disabled: ['Add'] } }), { label: '', side: 'right' })), 'right:Choose Subtract operation', 'the first that can take it');
});

test('a cancellation committed with no operation in hand sends the cursor where a committed step does, through the question\'s authority', () => {
  const cancel = region(board, 'const commitStandaloneCancellation = async (side, model) => {', 'const registerCancellationHits = async', 'commitStandaloneCancellation');
  // Taken as the student completes the pair, before the cancellation settles.
  const ticket = cancel.match(/const (\w+) = deferredFocusHost\?\.ticket\(\{ since: 'now', channel: 'step-commit' \}\) \|\| null;/);
  assert.ok(ticket, 'a ticket of its own, from the moment the pair is complete');
  assert.ok(cancel.indexOf(ticket[0]) < cancel.indexOf('window.setTimeout('), 'before it settles');
  // Asked for only once the cancellation is committed, never for a held one.
  const signal = cancel.indexOf('setStepCommitFocus({');
  assert.ok(signal > cancel.indexOf('setEquation(nextEquation);'), 'after the pair leaves the board');
  assert.ok(signal > cancel.indexOf('if (holdUnsavedStep('), 'never for a cancellation that was held');
  assert.match(cancel.slice(signal), new RegExp(`^setStepCommitFocus\\(\\{ ticket: ${ticket[1]}, operation: null, side, phone: Boolean\\(mobileInteraction\\?\\.isMobile\\) \\}\\);`), 'no operation, on the cancelled side');
});

test('every tile chooses itself on Space going down, and the tile just chosen sends a character typed at it into its box', () => {
  const handler = region(board, 'const typeIntoOperationBox = useCallback((event) => {', '}, []);', 'the tile key handler');
  assert.match(handler, /typeAheadIntoOperand\(event, operationComposerRef\.current\?\.querySelector\('math-field'\)\);/, 'the operation box, as Enter there reads it');
  assert.match(board, /<div ref=\{operationComposerRef\} className="algebra-operation-composer"/, 'which is the composer\'s own box');
  assert.match(board, /import \{[^}]*\boperationTileKeyAction\b[^}]*\} from '\.\/platform\/algebra\/boardFocus\.js';/);
  const keyDown = region(board, 'const operationTileKeyDown = (event, operation, sourceSide) => {', 'const activateTapPlacement', 'the tile key handler');
  assert.match(keyDown, /const action = operationTileKeyAction\(event, \{ chosen: armedTile\?\.operation === operation \}\);/, 'chosen: the tile of the operation in hand');
  assert.match(keyDown, /if \(action === 'choose'\) \{\s*event\.preventDefault\(\);\s*selectOperation\(operation, sourceSide\);\s*\} else if \(action === 'type'\) \{\s*typeIntoOperationBox\(event\);\s*\}/, 'Space chooses it as a click does, and its release clicks nothing');
  const tileTags = board.match(/<button type="button" key=\{`(?:mobile|left|right)-\$\{operation\.id\}`\}[\s\S]*?aria-label=\{`Choose \$\{operation\.label\} operation`\}>/g) || [];
  assert.equal(tileTags.length, 3, 'the phone palette and both rails');
  tileTags.forEach((tag) => {
    const side = tag.match(/onClick=\{\(\) => selectOperation\(operation\.id, '(left|right)'\)\}/)?.[1];
    assert.ok(side, tag.slice(0, 60));
    assert.ok(tag.includes(`onKeyDown={(event) => operationTileKeyDown(event, operation.id, '${side}')}`), `${tag.slice(0, 60)}: every tile, the side its click chooses from`);
  });
});

// A review after #386: a tile pressed with Space is chosen as Space comes up,
// so a 5 typed while Space was still held reached a tile not chosen yet and
// was lost (Space held, 5, Space up: an empty box), measured in Chromium
// (stepAlgebraFirstOperand.mjs `space`).
test('Space on a tile chooses it as it goes down; a character goes to the box only from the tile already chosen', () => {
  assert.equal(operationTileKeyAction(key(' ')), 'choose');
  assert.equal(operationTileKeyAction(key(' '), { chosen: true }), 'choose', 'the tile in hand too, as a click on it does');
  assert.equal(operationTileKeyAction(key(' ', { repeat: true })), null, 'a held Space repeating chooses nothing again');
  assert.equal(operationTileKeyAction(key(' ', { ctrlKey: true })), null, 'nor a shortcut');
  assert.equal(operationTileKeyAction(key(' ', { isComposing: true })), null);
  assert.equal(operationTileKeyAction(key(' ', { defaultPrevented: true })), null, 'nor a key already handled');
  assert.equal(operationTileKeyAction(key('Enter')), null, 'Enter presses the tile as it goes down already');
  assert.equal(operationTileKeyAction(key('5')), null, 'a tile not chosen keeps a character');
  assert.equal(operationTileKeyAction(key('5'), { chosen: true }), 'type');
  assert.equal(operationTileKeyAction(key('Tab'), { chosen: true }), null);
  assert.equal(operationTileKeyAction(null), null);
});
