/*
 * MODAL DIALOG FOCUS — the rules every aria-modal dialog follows.
 *
 * `aria-modal="true"` is a promise to assistive technology that nothing behind
 * the dialog can be reached. Before this module only three of MathMaster's
 * dialogs kept it: the rest let Tab walk out into the page behind the
 * backdrop, opened with focus left on the button underneath, and dropped focus
 * on <body> when they closed (WCAG 2.1 2.4.3 Focus Order, 2.1.2 No Keyboard
 * Trap's inverse, 4.1.2 Name, Role, Value).
 *
 * The decisions are pure functions so tests/platform can prove them without a
 * DOM; ./Dialog.jsx applies them to real elements.
 *
 *   tabbable order      what Tab may land on, in document order
 *   nextFocusIndex      Tab on the last item wraps to the first, Shift+Tab on
 *                       the first wraps to the last, and focus that escaped
 *                       the dialog is pulled back in
 *   dialog stack        only the TOPMOST open dialog traps and answers Escape,
 *                       so a confirm opened from a drawer closes alone
 */

export const TABBABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'math-field',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(', ');

/**
 * Whether a candidate (already matched by TABBABLE_SELECTOR) can take Tab
 * focus. `facts` is plain data so the rule is testable without a DOM:
 * { tabIndex, disabled, hidden, inert, rendered }.
 */
export const isTabbableFacts = (facts = {}) => {
  if (facts.disabled || facts.hidden || facts.inert) return false;
  if (facts.rendered === false) return false;
  return !(Number.isFinite(facts.tabIndex) && facts.tabIndex < 0);
};

/**
 * Where focus goes on Tab. `count` tabbable items, `activeIndex` is the
 * focused item's index or -1 when focus is not on any of them (it escaped, or
 * sits on the dialog container itself). Returns the index to focus, or null
 * to let the browser move focus normally.
 */
export const nextFocusIndex = ({ count, activeIndex, shift = false }) => {
  if (!count) return null;
  if (activeIndex < 0) return shift ? count - 1 : 0;
  if (shift && activeIndex === 0) return count - 1;
  if (!shift && activeIndex === count - 1) return 0;
  return null;
};

/**
 * Which element opens focused. An explicit initial-focus target wins; then an
 * element marked [data-autofocus]; then the first tabbable item that is not a
 * close button (landing a student on "×" makes Enter dismiss what they just
 * opened); then the first tabbable item; finally the dialog itself, which
 * Dialog.jsx gives tabIndex -1 so its accessible name is announced.
 */
export const initialFocusChoice = ({ hasExplicit = false, autofocusIndex = -1, items = [] } = {}) => {
  if (hasExplicit) return { kind: 'explicit' };
  if (autofocusIndex >= 0) return { kind: 'item', index: autofocusIndex };
  const firstNonClose = items.findIndex((item) => !item.isClose);
  if (firstNonClose >= 0) return { kind: 'item', index: firstNonClose };
  if (items.length) return { kind: 'item', index: 0 };
  return { kind: 'container' };
};

// ---------------------------------------------------------------- the stack
// Entries are { token, contains(entry) }. A dialog opened later is on top —
// except that a dialog containing another one is always below it: React mounts
// a child's effects before its parent's, so a parent and a nested child that
// open together would otherwise register in the wrong order.
const stack = [];

export const pushDialog = (token, { contains = () => false } = {}) => {
  if (!stack.some((entry) => entry.token === token)) {
    const entry = { token, contains };
    const firstNested = stack.findIndex((other) => contains(other.token));
    if (firstNested >= 0) stack.splice(firstNested, 0, entry);
    else stack.push(entry);
  }
  return () => {
    const index = stack.findIndex((entry) => entry.token === token);
    if (index >= 0) stack.splice(index, 1);
  };
};

export const isTopDialog = (token) => stack.length > 0 && stack[stack.length - 1].token === token;

export const openDialogCount = () => stack.length;

/** Close-button heuristic: aria-label/text "Close…", "Dismiss…", "×", "✕", "x". */
export const looksLikeCloseControl = ({ label = '', text = '' } = {}) => {
  const value = `${label || ''} ${text || ''}`.trim().toLowerCase();
  if (!value) return false;
  return /^(×|✕|✖|x)$/.test(value) || /^(close|dismiss)\b/.test(value);
};
