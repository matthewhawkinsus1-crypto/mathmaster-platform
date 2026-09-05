const SINGLE_LINE_INPUT_TYPES = new Set([
  '', 'text', 'number', 'numeric', 'decimal', 'email', 'tel', 'url', 'search',
]);

const normalizedTag = (target) => String(target?.tagName || target?.nodeName || '').toLowerCase();
const normalizedType = (target) => String(target?.type || target?.getAttribute?.('type') || '').toLowerCase();

/**
 * Whether an Enter keypress belongs to a single-line answer control.
 *
 * Textareas keep Enter for new lines; radios, checkboxes, ranges and selects
 * keep their native keyboard behavior. MathLive fields are included when the
 * caller has one unambiguous primary Check/Submit action.
 */
export const isSingleLineAnswerTarget = (target) => {
  const tag = normalizedTag(target);
  if (tag === 'math-field') return true;
  if (tag !== 'input') return false;
  return SINGLE_LINE_INPUT_TYPES.has(normalizedType(target));
};

export const shouldSubmitAnswerOnEnter = ({ event, responseComplete = false, canSubmit = false } = {}) => {
  if (!event || event.key !== 'Enter' || event.isComposing) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (!responseComplete || !canSubmit) return false;
  return isSingleLineAnswerTarget(event.target);
};

/**
 * A second Enter press after a correct response advances to the next logical
 * question/section. This is deliberately broader than answer submission: once
 * the response is locked the browser may move focus away from the disabled
 * answer field, so the shortcut has to work from the page, not only the input.
 * Dialogs and multiline/editable controls keep ownership of Enter.
 */
export const shouldAdvanceOnEnter = ({ event, canAdvance = false } = {}) => {
  if (!event || event.defaultPrevented || event.key !== 'Enter' || event.isComposing || event.repeat) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !canAdvance) return false;
  const tag = normalizedTag(event.target);
  if (tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return false;
  if (event.target?.closest?.('[role="dialog"], [aria-modal="true"]')) return false;
  return true;
};

export const ENTER_TO_CONTINUE_HINT = 'Shortcut: press Enter again to continue.';

const focusableAnswerSelector = [
  'math-field:not([disabled])',
  'input:not([disabled]):not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"])',
  'textarea:not([disabled])',
].join(',');

const visiblyFocusable = (element) => {
  if (!element || typeof element.focus !== 'function') return false;
  if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
  const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(element) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
};

/**
 * Should a question put the cursor in an answer field the moment it opens?
 *
 * On a Chromebook with one text box, yes: the student lands on the page ready
 * to type instead of hunting for the field. Two cases turn it off, and both
 * were found by measuring a real phone rather than by reasoning about one:
 *
 * A PHONE ANSWERS WITH A KEYBOARD, AND THE KEYBOARD COVERS THE WORK. Focusing
 * a numeric field opens the on-screen keypad — 266px of a 664px screen — and
 * the layout then scrolls that field into view, which on a graphing question
 * scrolled the workspace 721px of its 1440 and left the student looking at the
 * middle of a stage they had not read yet, graph and prompt both off screen.
 * Nobody asked to type; the keypad should arrive when they tap a field.
 *
 * A COMPOSED QUESTION HAS NO "THE" ANSWER BOX. Its first focusable input is one
 * cell of a workspace — a coordinate of the third point of a table the student
 * is meant to plot — and putting the cursor there says the question starts
 * with typing when it starts with reading a graph. That one is wrong on every
 * device, so it is not conditioned on width.
 */
export const shouldFocusAnswerOnOpen = ({ composed = false, narrowViewport = false } = {}) => (
  !composed && !narrowViewport
);

/** Put the cursor in the first real answer-entry control in a question/workspace. */
export const focusFirstAnswerControl = (root) => {
  if (!root?.querySelectorAll) return false;
  const candidates = [...root.querySelectorAll(focusableAnswerSelector)];
  const target = candidates.find(visiblyFocusable);
  if (!target) return false;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
  return true;
};

export default {
  focusFirstAnswerControl,
  shouldFocusAnswerOnOpen,
  isSingleLineAnswerTarget,
  shouldSubmitAnswerOnEnter,
  shouldAdvanceOnEnter,
};
