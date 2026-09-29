import { focusMathFieldWithoutScroll } from './mathFieldFocusHandoff.js';

const SINGLE_LINE_INPUT_TYPES = new Set([
  '', 'text', 'number', 'numeric', 'decimal', 'email', 'tel', 'url', 'search',
]);

const normalizedTag = (target) => String(target?.tagName || target?.nodeName || '').toLowerCase();
const normalizedType = (target) => String(target?.type || target?.getAttribute?.('type') || '').toLowerCase();

const calculatorOwnsEnter = (target) => Boolean(
  target?.closest?.('.mathmaster-calculator-panel')
  || target?.getAttribute?.('data-calculator-expression') === 'true',
);

/**
 * Whether an Enter keypress belongs to a single-line answer control.
 *
 * Textareas keep Enter for new lines; radios, checkboxes, ranges and selects
 * keep their native keyboard behavior. MathLive fields are included when the
 * caller has one unambiguous primary Check/Submit action.
 */
export const isSingleLineAnswerTarget = (target) => {
  if (calculatorOwnsEnter(target)) return false;
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
  if (calculatorOwnsEnter(event.target)) return false;
  const tag = normalizedTag(event.target);
  if (tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return false;
  if (event.target?.closest?.('[role="dialog"], [aria-modal="true"]')) return false;
  return true;
};

/*
 * THE ENTER CONTRACT.
 *
 * Enter used to find a "primary" button by reading button TEXT —
 * /^(check|submit|verify|evaluate|lock in|record answer|apply)/ — first in the
 * field's panel and then anywhere in the tool. Measured across the registry
 * (student UX pass, R-12), Enter in the FIRST of several fields submitted a
 * graded attempt with the rest still blank in Parabola Geometry, Complex Plane,
 * Relation Mapping, Exponential/Log, Inverse Composition, Constraint Builder,
 * Function Operations and Data Modeling; in Data Modeling and Function
 * Operations a field in one panel pressed the whole lab's Check in another.
 * On PR #397's board the same guess found "Submit".
 *
 * Nothing is guessed now. A tool DECLARES the button Enter may use:
 *
 *   data-mm-enter-action="card"    acts on the card/panel the field is in
 *                                  (a stage check, a card check). Pressed.
 *   data-mm-enter-action="submit"  submits the whole question (uses an
 *   data-primary-answer-action     attempt). Pressed only when the field is
 *     ="true"  (legacy spelling)   the ONE answer box in its scope — the
 *                                  single-answer convention. Otherwise Enter
 *                                  MOVES FOCUS to it, and a second Enter —
 *                                  a deliberate one, with the button in view —
 *                                  presses it.
 *
 * Scope: the nearest `[data-mm-enter-scope]` or `.mathmaster-tool-panel`. A
 * declared button outside the field's scope is used only if it is the only one
 * in the tool, and never pressed directly from there.
 *
 * Nothing is pressed while a box in its scope is empty: Enter moves to the next
 * empty box instead. Enter in the empty box itself does nothing. Textareas,
 * selects, radios and the calculator keep Enter (isSingleLineAnswerTarget).
 */
export const ENTER_ACTION_SELECTOR = 'button[data-mm-enter-action], button[data-primary-answer-action="true"]';
export const ENTER_SCOPE_SELECTOR = '[data-mm-enter-scope], .mathmaster-tool-panel';

const enterActionKind = (button) => {
  const declared = button?.getAttribute?.('data-mm-enter-action');
  if (declared === 'card') return 'card';
  return 'submit';
};

const shownAndEnabled = (element) => visiblyFocusable(element) && !element.disabled && element.getAttribute?.('aria-disabled') !== 'true';

const answerFieldsIn = (scope) => (
  scope?.querySelectorAll
    ? [...scope.querySelectorAll('math-field, input')].filter((element) => isSingleLineAnswerTarget(element) && shownAndEnabled(element))
    : []
);

const fieldIsEmpty = (element) => String(element?.value ?? '').trim() === '';

/** The next empty answer box after `field` in `scope`, wrapping; null if every box is filled. */
export const nextEmptyAnswerField = (scope, field) => {
  const fields = answerFieldsIn(scope);
  const start = fields.indexOf(field);
  const ordered = start >= 0 ? [...fields.slice(start + 1), ...fields.slice(0, start)] : fields;
  return ordered.find(fieldIsEmpty) || null;
};

/**
 * What Enter in `field` should do inside `shell`.
 *
 * @returns {{ kind: 'press' | 'focus', target: Element } | { kind: 'none' }}
 */
export const resolveToolEnterAction = ({ field, shell } = {}) => {
  const none = { kind: 'none' };
  if (!field || !shell?.querySelectorAll || !isSingleLineAnswerTarget(field)) return none;
  const scope = field.closest?.(ENTER_SCOPE_SELECTOR);
  const localScope = scope && scope !== shell && shell.contains?.(scope) ? scope : null;

  const declaredIn = (root) => [...root.querySelectorAll(ENTER_ACTION_SELECTOR)].filter(visiblyFocusable);
  let button = null;
  let local = false;
  if (localScope) {
    const here = declaredIn(localScope);
    if (here.length > 1) return none; // two declared actions in one card: ambiguous, so neither
    if (here.length === 1) { button = here[0]; local = true; }
  }
  if (!button) {
    const everywhere = declaredIn(shell);
    if (everywhere.length !== 1) return none;
    [button] = everywhere;
  }

  const actionScope = local ? localScope : shell;
  if (fieldIsEmpty(field)) return none;
  const nextEmpty = nextEmptyAnswerField(actionScope, field);
  if (nextEmpty) return { kind: 'focus', target: nextEmpty };
  if (!shownAndEnabled(button)) return none;

  if (local && enterActionKind(button) === 'card') return { kind: 'press', target: button };
  const onlyBox = local && answerFieldsIn(localScope).length === 1;
  return onlyBox ? { kind: 'press', target: button } : { kind: 'focus', target: button };
};

/**
 * What Enter in an answer field of a whole QUESTION (QuestionEngine) should do.
 *
 *   'submit'        the single-answer convention: one box, complete, Enter submits.
 *   'focus-submit'  complete, but a multi-part or one-attempt (DOL / assessment)
 *                   question: Enter brings the Submit button into focus and a
 *                   second Enter presses it.
 *   'next-field'    incomplete: Enter moves to the next empty box.
 *   'none'          everything else keeps its native Enter.
 */
export const resolveQuestionEnterIntent = ({
  event,
  responseComplete = false,
  canSubmit = false,
  multipart = false,
  deliberateSubmit = false,
} = {}) => {
  if (!event || event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return 'none';
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 'none';
  if (!canSubmit || !isSingleLineAnswerTarget(event.target)) return 'none';
  if (!responseComplete) return 'next-field';
  return multipart || deliberateSubmit ? 'focus-submit' : 'submit';
};

/** Focus an answer box or button and bring it into view, without jumping sideways. */
export const focusForEnter = (element) => {
  if (!element) return false;
  if (String(element.tagName || '').toLowerCase() === 'math-field') {
    if (!focusMathFieldWithoutScroll(element)) element.focus?.();
  } else {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus?.();
    }
  }
  try {
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  } catch {
    // Older engines: focus already happened, which is what matters.
  }
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
export const shouldFocusAnswerOnOpen = ({ composed = false, narrowViewport = false, touchPrimary = false } = {}) => (
  !composed && !narrowViewport && !touchPrimary
);

/*
 * A TABLET IS A PHONE AS FAR AS THE KEYBOARD IS CONCERNED.
 *
 * `narrowViewport` measures width, because layout is about space. An iPad is
 * 820px wide and is laid out like a laptop — correctly — so the width test let
 * it autofocus, and focusing an answer field on an iPad raises the on-screen
 * keyboard (or MathMaster's math keypad) before the student has read the
 * question: measured at 820×1180, the Standard form keypad covered the lower
 * half of a board the student had not started.
 *
 * Whether a keyboard pops up is a property of the POINTER, not the width. A
 * device whose primary pointer is a finger and which cannot hover has an
 * on-screen keyboard; a Chromebook with a touchscreen reports a fine primary
 * pointer (its trackpad) and keeps autofocus.
 */
export const isTouchPrimaryPointer = (windowObject = typeof window !== 'undefined' ? window : null) => {
  try {
    return Boolean(windowObject?.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches);
  } catch {
    return false;
  }
};

const visibleAnswerControls = (root) => (
  root?.querySelectorAll ? [...root.querySelectorAll(focusableAnswerSelector)].filter(visiblyFocusable) : []
);

/** How many answer-entry controls a workspace shows — "the" box only when it is one. */
export const countAnswerControls = (root) => visibleAnswerControls(root).length;

/** Put the cursor in the first real answer-entry control in a question/workspace. */
export const focusFirstAnswerControl = (root) => {
  const target = visibleAnswerControls(root)[0];
  if (!target) return false;
  // A math field's own focus() ignores preventScroll and scrolled the page to
  // the field — past the prompt of a long question the student had not read.
  if (String(target.tagName || '').toLowerCase() === 'math-field' && focusMathFieldWithoutScroll(target)) return true;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
  return true;
};

export default {
  countAnswerControls,
  focusForEnter,
  nextEmptyAnswerField,
  resolveQuestionEnterIntent,
  resolveToolEnterAction,
  focusFirstAnswerControl,
  isTouchPrimaryPointer,
  shouldFocusAnswerOnOpen,
  isSingleLineAnswerTarget,
  shouldSubmitAnswerOnEnter,
  shouldAdvanceOnEnter,
};
