/*
 * WHERE THE CURSOR GOES ON STEP ALGEBRA'S BOARD WHEN WHAT HELD IT GOES AWAY
 * (src/platform/algebra/boardFocus.js).
 *
 * After a committed step (Enter in the simplification box, Check my
 * simplification, Keep as written, the last cross-out) the control the cursor
 * was in goes with the step, and focus fell to the page, in a composed
 * question and on the standalone board alike. It now goes back to the tile the
 * move began from. tests/browser/workflowStepEnter.mjs and
 * tests/browser/stepAlgebraFirstOperand.mjs press the keys in Chromium; these
 * pin the rule and the board's wiring. Every rule below is mutation-checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { focusFellToPage, operationTileAfterStep } from '../../src/platform/algebra/boardFocus.js';
import { h } from './helpers/miniDom.mjs';
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
