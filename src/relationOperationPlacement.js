/*
 * HOW A BALANCED OPERATION IS PLACED, SAID ON SCREEN (F-SW-PLACEMENT-HOW).
 *
 * In the relation solver (the Systems Workspace's Rewrite step, the
 * absolute-value lessons) a student chooses an operation, types its value and
 * then places it on both sides before "Commit step" opens. How to place it —
 * click a term, then Before, Under or After — was only in a hover tooltip, so
 * after choosing Subtract and typing 2x a student read "Place the balanced
 * operation on both sides." in 10.5 px under a disabled Commit step, and had
 * nothing to go on with a touch screen or a keyboard.
 *
 * The solver now says how, in the line under the operations, while nothing is
 * placed yet. A line that says to click or tap names the keyboard route in the
 * same line (AX32), in the style of the Systems Workspace's PLANE_KEYS: a term
 * is a button, so Tab reaches it, Enter opens Before / Under / After, and Tab
 * and Enter choose one.
 *
 * No React here: tests/platform/relationOperationPlacement.test.mjs.
 */

/** How a term is reached without a pointer, for the end of a line that says to click one. */
export const TERM_KEYS = 'Tab to it and press Enter';

/**
 * The line under the operations once an operation and its value are chosen
 * and nothing is placed yet: how to place it on every side (`regions`: 2 for
 * an equation or inequality, 3 for a compound one). Null for an operation
 * that is not placed side by side.
 */
export const placementInstruction = ({ operation = '', regions = 2 } = {}) => {
  const three = Number(regions) === 3;
  if (operation === 'add' || operation === 'subtract') {
    return `Click or tap a term ${three ? 'in each of the three regions' : 'on each side'} (or ${TERM_KEYS}), then choose where the operation goes.`;
  }
  // Multiply and divide are placed with a button under each side, which the keyboard reaches like any button.
  if (operation === 'multiply') return `Press “Place multiplier” under ${three ? 'each of the three regions' : 'each side'}.`;
  if (operation === 'divide') return `Press “Place divisor” under ${three ? 'each of the three regions' : 'each side'}.`;
  return null;
};
