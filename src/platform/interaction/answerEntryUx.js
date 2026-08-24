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
  isSingleLineAnswerTarget,
  shouldSubmitAnswerOnEnter,
};
