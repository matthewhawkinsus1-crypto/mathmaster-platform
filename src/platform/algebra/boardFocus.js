/*
 * WHERE THE CURSOR GOES ON STEP ALGEBRA'S BOARD WHEN WHAT HELD IT GOES AWAY.
 *
 * Two moments, both measured in Chromium (tests/browser/workflowStepEnter.mjs,
 * tests/browser/stepAlgebraFirstOperand.mjs).
 *
 * AFTER A STEP IS COMMITTED (#386, after R5). Checking a simplification (Enter
 * in its box, or Check my simplification), keeping a move as written, or
 * crossing out the last matching factor commits the step, and the control the
 * cursor was in goes with it: the simplification box, its buttons, the factor
 * just crossed out. Focus fell to the page, on the standalone board and in a
 * composed question alike, so the next Tab started again from the top of the
 * page and a screen reader lost its place on the board. The next thing the
 * student acts on is the next move, so the cursor goes back to the operation
 * tile this step began from: the same tile, in the rail the student chose it
 * from (or the phone's palette), as Simplify sends it back to the Simplify
 * button when it closes. Only when focus fell to the page: a student who
 * clicked or tabbed somewhere else while the step settled stays there.
 *
 * A KEY TYPED BEFORE THE OPERATION BOX HAS THE CURSOR (#386, after R12).
 * Choosing an operation opens "Divide by what?" and puts the cursor in it a
 * frame later (MathInput's focus signal, a deferred focus). A digit typed in
 * between went to the tile, which still had focus, and did nothing; and
 * because the student had pressed a key since, the deferred focus was dropped
 * (deferredFocusAuthority.js), so the box never got the cursor and the next
 * keys went to the tile as well. A character typed at a tile while its box is
 * on the page now goes into the box, with the cursor, the way a key reaching
 * a math field MathLive has left is replayed on the field the student chose
 * (mathFieldFocusHandoff.js guardStaleKeys).
 */
import { deepActiveElement, focusMathFieldWithoutScroll } from '../interaction/mathFieldFocusHandoff.js';

/** The cursor is nowhere: on the page itself, as when the control that had it was removed. */
export const focusFellToPage = (documentObject = typeof document !== 'undefined' ? document : null) => {
  if (!documentObject) return false;
  const active = deepActiveElement(documentObject);
  return !active || active === documentObject.body || active === documentObject.documentElement;
};

const TILE_GROUPS = Object.freeze({
  phone: '.algebra-mobile-operation-palette',
  left: '.algebra-rail-left',
  right: '.algebra-rail-right',
});

const takesFocus = (button) => Boolean(button) && !button.disabled && !button.hidden;

/**
 * The tile to put the cursor back on after a step: the operation the student
 * chose (`label`, as its tile names it), in the group they chose it from — the
 * phone's palette, or the rail on `side` — then the same tile in another group
 * on the board, then the first tile there that can take focus. Null when the
 * board shows no tile (an inline tool is open, the board is locked).
 */
export const operationTileAfterStep = (root, { label = '', side = 'left', phone = false } = {}) => {
  if (!root?.querySelector) return null;
  const rails = side === 'right' ? ['right', 'left'] : ['left', 'right'];
  const groups = (phone ? ['phone', ...rails] : [...rails, 'phone'])
    .map((name) => root.querySelector(TILE_GROUPS[name]))
    .filter(Boolean);
  if (label) {
    for (const group of groups) {
      const tile = group.querySelector(`button[aria-label="Choose ${label} operation"]`);
      if (takesFocus(tile)) return tile;
    }
  }
  for (const group of groups) {
    const tile = Array.from(group.querySelectorAll('button')).find(takesFocus);
    if (tile) return tile;
  }
  return null;
};

/** A key that types one character: not Space or Enter (they press the tile), not a shortcut, not mid-composition. */
export const typesACharacter = (event) => Boolean(
  event
    && typeof event.key === 'string'
    && event.key.length === 1
    && event.key !== ' '
    && !event.ctrlKey && !event.metaKey && !event.altKey
    && !event.isComposing
    && !event.defaultPrevented,
);

/**
 * A character typed at an operation tile goes into the operation box (`field`)
 * when the box is on the page and MathLive has built it: the box takes the
 * cursor in this same event and the character is typed there. Returns whether
 * the key was taken. Anything else — Space, Enter, Tab, a shortcut, no box
 * yet — is left to the tile.
 */
export const typeAheadIntoOperand = (event, field) => {
  if (!typesACharacter(event) || !field?.isConnected) return false;
  if (!focusMathFieldWithoutScroll(field)) return false;
  event.preventDefault();
  try {
    field.executeCommand?.(['typedText', event.key]);
    // MathInput follows the box's input events, and a command need not send
    // one (as guardStaleKeys replays a key).
    field.dispatchEvent?.(new Event('input', { bubbles: true, composed: true }));
  } catch {
    // The box has the cursor; only this one key is dropped.
  }
  return true;
};
