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
 *
 *   3. A FIELD THE PAGE HAS MOVED ON FROM CANNOT TAKE FOCUS BACK
 *      (guardStaleMathFieldFocus). The same 60 ms timer runs whenever ANYTHING
 *      focuses a field — the cursor a cross-device restore puts back included
 *      — and when it fires it focuses that field's sink without asking
 *      whether the field is still the one in use. A student who clicked the
 *      next box inside those 60 ms had focus pulled back to the restored one,
 *      and MathLive blurred the box they chose in its model, so part 2 had no
 *      active field to send their keys to: "-2/3" became "-2/34" (PR #435,
 *      `directions`). That focus is now refused when the latest press or
 *      focus on the page belongs to another element. Refused, not undone:
 *      nothing is blurred, nothing flickers.
 */

// The MathLive internals this relies on (the sink, hasFocus) live in
// mathLiveCompat.js, the one place a MathLive upgrade has to be checked.
import {
  mathFieldHasFocus as mathLiveHasFocus,
  mathFieldKeyboardSink,
  reportMathLiveCompatProblem,
  settleMathFieldBlur,
} from '../math/mathLiveCompat.js';

export { mathFieldKeyboardSink };

/** The element that really has focus, through open shadow roots (a math field's sink). */
export const deepActiveElement = (documentObject = typeof document !== 'undefined' ? document : null) => {
  let active = documentObject?.activeElement || null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
};

// Set while MathMaster itself focuses a sink (focusMathFieldWithoutScroll): a
// focus the platform decided on now is never a stale one.
let platformFocusDepth = 0;
const guardedSinks = new WeakMap();

/*
 * THE PAGE'S LATEST FOCUS INTENT: the target of the most recent trusted press
 * (pointer, mouse, touch) or of the most recent focusin, whoever caused it —
 * the student, a screen reader, a dialog opening, the platform. MathLive's
 * deferred focus was asked for before it; when that intent belongs to another
 * element, the deferred focus is stale.
 */
const intentTracking = new WeakMap();
const trackFocusIntent = (documentObject) => {
  if (!documentObject?.addEventListener) return null;
  let tracker = intentTracking.get(documentObject);
  if (tracker) return tracker;
  tracker = { target: null };
  const record = (event) => {
    if (event.type !== 'focusin' && event.isTrusted !== true) return;
    tracker.target = lightDomOwner(event.composedPath?.()?.[0] || event.target || null);
  };
  ['pointerdown', 'mousedown', 'touchstart', 'focusin'].forEach((type) => {
    documentObject.addEventListener(type, record, { capture: true, passive: true });
  });
  intentTracking.set(documentObject, tracker);
  return tracker;
};
// Recorded as the element in the page that owns the event's target: MathLive
// re-renders its shadow tree on a press, so the node pressed inside a field
// may be gone by the time anyone asks which field it was in.
const lightDomOwner = (node) => {
  let owner = node;
  while (owner?.getRootNode?.()?.host) owner = owner.getRootNode().host;
  return owner || null;
};
const belongsTo = (target, mathField) => Boolean(target) && (target === mathField || Boolean(mathField.contains?.(target)));

/**
 * Refuse MathLive's deferred focus of a field the page has moved on from
 * (part 3).
 *
 * MathLive calls the sink's own `focus` method from its timer, so the guard
 * sits on that one element. Its model is no help: for the whole 60 ms it marks
 * the field mid-transition and ignores a blur, so the field the student just
 * left still reports hasFocus(). What is known is what happened on the page
 * since. A call is refused only when all of these hold:
 *
 *   - MathMaster is not the caller (its own focus was decided just now);
 *   - focus is not already on this sink (then the call changes nothing);
 *   - the page's latest focus intent — a trusted press, or focus arriving
 *     anywhere — belongs to something other than this field.
 *
 * So a click, tap or Tab to another box, a screen reader moving focus, Work
 * View opening its dialog, or a press on the page around the question all
 * outrank MathLive's late focus of the box before. MathLive refocusing its
 * own field (an IME composition cancelled; its own keyboard toggle) and app
 * code calling the field's focus() (recorded as an intent for it) do not.
 *
 * Idempotent; returns the cleanup, or null while the field has no sink yet.
 */
export const guardStaleMathFieldFocus = (mathField, { documentObject = typeof document !== 'undefined' ? document : null } = {}) => {
  const sink = mathFieldKeyboardSink(mathField);
  if (!sink || typeof sink.focus !== 'function') return null;
  const existing = guardedSinks.get(sink);
  if (existing) return existing.release;
  const tracker = trackFocusIntent(documentObject);
  const ownProperty = (element, name) => Object.prototype.hasOwnProperty.call(element, name);
  const hadOwnSinkFocus = ownProperty(sink, 'focus');
  const hadOwnFieldFocus = ownProperty(mathField, 'focus');
  const nativeSinkFocus = sink.focus;
  const nativeFieldFocus = mathField.focus;

  const guardedSinkFocus = function focus(...args) {
    if (platformFocusDepth === 0 && tracker?.target && deepActiveElement(documentObject) !== sink
      && !belongsTo(tracker.target, mathField)) {
      // Refused. MathLive ignored the real blur while it waited to focus, so
      // its model still calls this field focused; once its timer has
      // finished, give it that blur (no DOM focus moves).
      const settle = () => { if (deepActiveElement(documentObject) !== sink) settleMathFieldBlur(mathField); };
      if (typeof queueMicrotask === 'function') queueMicrotask(settle);
      else Promise.resolve().then(settle);
      return undefined;
    }
    return nativeSinkFocus.apply(this, args);
  };
  // Code that focuses the field itself (a keypad key, Undo) means this field.
  const guardedFieldFocus = function focus(...args) {
    if (tracker) tracker.target = mathField;
    return nativeFieldFocus.apply(this, args);
  };
  sink.focus = guardedSinkFocus;
  if (typeof nativeFieldFocus === 'function') mathField.focus = guardedFieldFocus;

  const release = () => {
    if (guardedSinks.get(sink)?.release !== release) return;
    guardedSinks.delete(sink);
    if (sink.focus === guardedSinkFocus) {
      if (hadOwnSinkFocus) sink.focus = nativeSinkFocus;
      else delete sink.focus;
    }
    if (mathField.focus === guardedFieldFocus) {
      if (hadOwnFieldFocus) mathField.focus = nativeFieldFocus;
      else delete mathField.focus;
    }
  };
  guardedSinks.set(sink, { release });
  return release;
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
  // Guarded before the focus starts MathLive's 60 ms timer, so that timer can
  // never fire into a field the student has left by then.
  guardStaleMathFieldFocus(mathField);
  const tracker = trackFocusIntent(typeof document !== 'undefined' ? document : null);
  if (tracker) tracker.target = mathField;
  platformFocusDepth += 1;
  try {
    sink.focus({ preventScroll: true });
  } catch {
    sink.focus();
  } finally {
    platformFocusDepth -= 1;
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

  // The sink exists once MathLive has upgraded the element — normally before
  // this runs; if not, the first press, focus or MathLive's `mount` does it.
  let releaseGuard = null;
  const guard = () => {
    if (!releaseGuard) releaseGuard = guardStaleMathFieldFocus(mathField, { documentObject });
  };
  guard();

  let compatChecked = false;
  const handOver = () => {
    guard();
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
    guard();
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
  mathField.addEventListener('focusin', guard);
  mathField.addEventListener('mount', guard);
  return () => {
    mathField.removeEventListener('pointerdown', handOver);
    mathField.removeEventListener('mousedown', handOver);
    mathField.removeEventListener('keydown', guardStaleKeys, { capture: true });
    mathField.removeEventListener('focusin', guard);
    mathField.removeEventListener('mount', guard);
    releaseGuard?.();
    releaseGuard = null;
  };
};

export default bindMathFieldFocusHandoff;
