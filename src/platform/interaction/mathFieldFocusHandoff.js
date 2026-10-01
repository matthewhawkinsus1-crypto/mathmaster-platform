/*
 * THE FIELD A STUDENT CLICKED IS THE FIELD THAT GETS THEIR TYPING.
 *
 * MathLive 0.110 moves keyboard focus LATE. A pointerdown on a math field
 * cancels the browser's own focus change (`evt.preventDefault()`), marks the
 * field focused in MathLive's model, and then focuses the field's hidden
 * keyboard sink in a `setTimeout(…, 60)`. Until that timer fires — 60 ms on a
 * fast machine, far longer on a loaded Chromebook — the PREVIOUS field's sink
 * still owns DOM focus, and MathLive's keystroke handler on it does not check
 * whether its field is still the active one. So a student who clicks the next
 * answer box and types straight away edits the box they just left:
 *
 *   Slope "5" → click y-intercept → Backspace, 4   ⇒   Slope "4", y-intercept ""
 *
 * Reproduced on every attempt in Chrome at 1366×768 with no throttling (PR #397
 * QA saw it first). The typing is not lost — it is worse: it silently changes a
 * finished answer.
 *
 * Two parts, no timers:
 *
 *   1. HAND FOCUS OVER SYNCHRONOUSLY. After MathLive's own pointerdown handler
 *      has run (a bubble-phase listener on the host runs after the shadow
 *      tree's), if MathLive now considers this field focused but its sink does
 *      not own DOM focus yet, focus the sink ourselves, in the same event. Every
 *      keystroke queued behind the pointerdown then lands on the new field.
 *
 *   2. A STALE FIELD CANNOT CONSUME A KEY. If a keydown still reaches a field
 *      MathLive has already blurred (some other route kept its sink focused),
 *      the key is stopped before MathLive sees it, focus moves to the field
 *      that is actually active, and a printable key or Backspace is replayed
 *      there. A finished answer is never edited by a key meant for another box.
 */

// The MathLive internals this relies on (the sink, hasFocus) live in
// mathLiveCompat.js, the one place a MathLive upgrade has to be checked.
import {
  mathFieldHasFocus as mathLiveHasFocus,
  mathFieldKeyboardSink,
  reportMathLiveCompatProblem,
} from '../math/mathLiveCompat.js';

export { mathFieldKeyboardSink };

const deepActiveElement = (documentObject = typeof document !== 'undefined' ? document : null) => {
  let active = documentObject?.activeElement || null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
};

/**
 * Focus a math field WITHOUT scrolling the page.
 *
 * `MathfieldElement.focus()` drops its options and calls MathLive's internal
 * focus with none, which scrolls the field into view. Autofocus on question
 * open therefore jumped the page to the first field of a long board, past the
 * prompt the student had not read. Focusing the sink directly runs the same
 * MathLive focus path (its focus listener calls the internal onFocus) without
 * the scroll.
 */
export const focusMathFieldWithoutScroll = (mathField) => {
  const sink = mathFieldKeyboardSink(mathField);
  if (!sink || typeof sink.focus !== 'function') return false;
  try {
    sink.focus({ preventScroll: true });
  } catch {
    sink.focus();
  }
  return true;
};

const allMathFields = (documentObject) => (
  documentObject?.querySelectorAll ? [...documentObject.querySelectorAll('math-field')] : []
);

// The field MathLive itself considers focused, if any — the one the student
// last activated. Searched through the document because the stale field has no
// reference to it.
const activeMathField = (except, documentObject) => allMathFields(documentObject)
  .find((field) => field !== except && field.isConnected && mathLiveHasFocus(field)) || null;

const PRINTABLE = (event) => event.key && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

/**
 * Wire the handoff onto one `<math-field>`. Returns the cleanup.
 */
export const bindMathFieldFocusHandoff = (mathField, { documentObject = typeof document !== 'undefined' ? document : null } = {}) => {
  if (!mathField?.addEventListener) return () => {};

  let compatChecked = false;
  const handOver = () => {
    // The first real press is when the field is certainly upgraded, so it is
    // where a MathLive upgrade that removed the sink or hasFocus() is reported
    // (development and test builds only; see mathLiveCompat.js).
    if (!compatChecked) {
      compatChecked = true;
      reportMathLiveCompatProblem(mathField);
    }
    if (!mathLiveHasFocus(mathField)) return;
    const sink = mathFieldKeyboardSink(mathField);
    if (!sink || deepActiveElement(documentObject) === sink) return;
    try {
      sink.focus({ preventScroll: true });
    } catch {
      sink.focus?.();
    }
  };

  const guardStaleKeys = (event) => {
    if (event.isComposing) return;
    const sink = mathFieldKeyboardSink(mathField);
    // Only a key that is really arriving at THIS field's sink while MathLive
    // has already moved on from this field.
    if (!sink || deepActiveElement(documentObject) !== sink || mathLiveHasFocus(mathField)) return;
    const target = activeMathField(mathField, documentObject);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    focusMathFieldWithoutScroll(target);
    try {
      if (PRINTABLE(event)) target.executeCommand?.(['typedText', event.key]);
      else if (event.key === 'Backspace') target.executeCommand?.('deleteBackward');
      else if (event.key === 'Delete') target.executeCommand?.('deleteForward');
      else return;
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    } catch {
      // A replay that fails leaves the key dropped, which is still better than
      // editing the answer the student already finished.
    }
  };

  // Bubble phase on the host: MathLive's pointerdown handler lives inside the
  // shadow tree and has already run by the time this fires.
  mathField.addEventListener('pointerdown', handOver);
  mathField.addEventListener('mousedown', handOver);
  // Capture on the host runs before the sink's own capture listener, so a
  // stale key is stopped before MathLive can act on it.
  mathField.addEventListener('keydown', guardStaleKeys, { capture: true });
  return () => {
    mathField.removeEventListener('pointerdown', handOver);
    mathField.removeEventListener('mousedown', handOver);
    mathField.removeEventListener('keydown', guardStaleKeys, { capture: true });
  };
};

export default bindMathFieldFocusHandoff;
