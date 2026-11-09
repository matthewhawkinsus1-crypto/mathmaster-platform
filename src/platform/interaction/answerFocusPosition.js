/*
 * WHICH ANSWER BOX THE CURSOR IS IN, ON ITS OWN (PF01).
 *
 * App asks only this of the answer-entry contract: before a server copy
 * remounts the open question, where the student's cursor is, so the remount
 * can put it back (answerFocusPosition below). Everything else in
 * ./answerEntryUx.js (Enter, focus on open, the math field's focus handoff) is
 * the question runtime's and loads with it; importing that file from App put
 * all of it in front of every student's Home. answerEntryUx.js reads the boxes
 * through this file and re-exports answerFocusPosition, so the question
 * runtime and App count the same boxes, and no caller changes.
 */

const focusableAnswerSelector = [
  'math-field:not([disabled])',
  'input:not([disabled]):not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"])',
  'textarea:not([disabled])',
].join(',');

export const visiblyFocusable = (element) => {
  if (!element || typeof element.focus !== 'function') return false;
  if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
  const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
};

/** The answer-entry controls a question or workspace shows, in page order. */
export const visibleAnswerControls = (root) => (
  root?.querySelectorAll ? [...root.querySelectorAll(focusableAnswerSelector)].filter(visiblyFocusable) : []
);

/**
 * Where the cursor is among a question's answer-entry controls: the box it is
 * in, by position, and how many boxes there are — or null when it is not in
 * one of them.
 *
 * A server copy that lands after a question opened remounts the question to
 * show the restored work (App.jsx, PQ-044), and a mount puts the cursor in the
 * FIRST box. A student who had clicked into the second box and started typing
 * then typed into the first, over the answer just restored there. Read before
 * the remount, this puts the cursor back where the student had it.
 */
export const answerFocusPosition = (root, active = typeof document !== 'undefined' ? document.activeElement : null) => {
  if (!active || typeof root?.contains !== 'function' || !root.contains(active)) return null;
  const controls = visibleAnswerControls(root);
  const index = controls.findIndex((control) => control === active || control.contains?.(active));
  return index === -1 ? null : { index, count: controls.length };
};
