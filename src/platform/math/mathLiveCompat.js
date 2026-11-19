/*
 * EVERY MATHLIVE INTERNAL MATHMASTER DEPENDS ON, IN ONE PLACE.
 *
 * Most of what MathMaster does with MathLive is its public API (`value`,
 * `executeCommand`, `setValue`, events). A few student-critical fixes cannot
 * be: they depend on how MathLive 0.110 builds its shadow DOM. Scattered, those
 * are silent failure points on an upgrade — the P0 focus hand-off
 * (mathFieldFocusHandoff.js) would quietly stop working and keys would again
 * edit the answer box the student just left.
 *
 * So each internal is named here, once, and nowhere else:
 *
 *   keyboard sink    `part="keyboard-sink"` / `.ML__keyboard-sink` inside the
 *                    field's shadow root. The element that really owns DOM
 *                    focus while a student types.
 *   hasFocus()       whether MathLive's model considers a field focused. It is
 *                    typed public API, but the hand-off relies on it changing
 *                    BEFORE the sink gets DOM focus (MathLive's 60 ms timer).
 *   render part      `part="render"` inside <math-span>/<math-div>, whose child
 *                    count says whether lazy typesetting has happened.
 *   CSS parts        `virtual-keyboard-toggle`, `menu-toggle`, hidden in
 *                    src/index.css, `keyboard-sink`, repositioned there
 *                    onto its own field so typing while pinch-zoomed does not
 *                    pan the page (platform/layout/pinchZoomReveal.js), and
 *                    `placeholder`, recoloured so an empty box's hint can be
 *                    read (AX17). CSS cannot import this file, so the names
 *                    are listed for the compatibility test to hold both to.
 *   style variables  `--highlight-text`, `--text-highlight-background-color`:
 *                    the tint MathLive puts behind a focused field's
 *                    text-mode content (a placeholder is text mode). The light
 *                    and dark schemes read different names; index.css sets
 *                    both on the field.
 *   deferred focus   MathLive focuses a field's sink from a 60 ms timer after
 *                    the field's onFocus, by calling the sink element's own
 *                    `focus` method — which is where guardStaleMathFieldFocus
 *                    (mathFieldFocusHandoff.js) refuses a stale one.
 *   host blur        the field listens for `blur` on its host and blurs its
 *                    model there (settleMathFieldBlur). During those 60 ms
 *                    the model ignores a real blur, so a field whose late
 *                    focus was refused still thinks it is focused until told.
 *   keystroke path   a key pressed in a field reaches MathLive as a `keydown`
 *                    on the sink, where a capture listener runs its keystroke
 *                    handler (the paired fence a "(" opens, inline shortcuts
 *                    such as "pi" and "sqrt", key bindings); a character that
 *                    handler leaves to the browser is typed from the sink's
 *                    `input` event, by its `data`. The handler skips a key the
 *                    page already handled only when the key is trusted
 *                    (pressKeyInMathField).
 *
 * Two alarms, neither visible to a student:
 *
 *   tests/platform/mathLiveCompat.test.mjs reads the INSTALLED MathLive bundle
 *   and fails the ordinary suite if any of these disappears — the upgrade PR
 *   goes red before it merges.
 *
 *   reportMathLiveCompatProblem() console.errors once per problem in
 *   development and test builds, at the first real interaction with a field
 *   that no longer exposes what the hand-off needs. Production stays quiet and
 *   degrades exactly as before: without a sink the hand-off does nothing.
 */

export const MATHLIVE_VERIFIED_VERSION = '0.110.0';

export const MATHLIVE_KEYBOARD_SINK_SELECTOR = '[part="keyboard-sink"], .ML__keyboard-sink';
export const MATHLIVE_RENDER_PART_SELECTOR = '[part="render"]';
// The on-screen math keyboard, appended to <body> outside any dialog that
// opened it: focus there is not an escape from the dialog (src/ui/Dialog.jsx).
export const MATHLIVE_VIRTUAL_KEYBOARD_SELECTOR = '.ML__keyboard';
export const MATHLIVE_HIDDEN_CSS_PARTS = Object.freeze(['virtual-keyboard-toggle', 'menu-toggle']);
// Styled, not hidden: index.css moves the sink from MathLive's position: fixed
// (the field's PAGE position) onto the field itself.
export const MATHLIVE_REPOSITIONED_CSS_PARTS = Object.freeze(['keyboard-sink']);
// Recoloured: the grey hint of an empty box, which MathLive draws too pale to
// read (src/index.css, AX17).
export const MATHLIVE_RECOLORED_CSS_PARTS = Object.freeze(['placeholder']);
// Custom properties MathLive reads for the tint behind text-mode content,
// which src/index.css sets on every field.
export const MATHLIVE_TEXT_TINT_VARIABLES = Object.freeze(['--highlight-text', '--text-highlight-background-color']);

/** The hidden element that owns DOM focus while a student types in a field. */
export const mathFieldKeyboardSink = (mathField) => (
  mathField?.shadowRoot?.querySelector?.(MATHLIVE_KEYBOARD_SINK_SELECTOR) || null
);

/** Whether MathLive's own model considers this field focused. */
export const mathFieldHasFocus = (mathField) => {
  try {
    return Boolean(mathField?.hasFocus?.());
  } catch {
    return false;
  }
};

/*
 * A KEY REPLAYED INTO A FIELD IS TYPED AS IF IT WERE PRESSED THERE.
 *
 * Two places type a key into a field it did not reach: Step Algebra's tile,
 * when a character is typed at it before its operation box has the cursor
 * (boardFocus.js typeAheadIntoOperand), and a field MathLive has left, when a
 * key still reaches its sink (mathFieldFocusHandoff.js guardStaleKeys). Both
 * replayed it with `executeCommand(['typedText', key])`, which inserts the
 * bare character and skips the keystroke path above. Measured in Chromium
 * (tests/browser/stepAlgebraFirstOperand.mjs `blind`, tests/browser/
 * mathBoxFocus.mjs): "(-5)" became `\left((-5\right)`, shown "((-5)", a "("
 * alone stayed unclosed, and "pi" and "sqrt(2)" stayed letters, every time.
 *
 * So the key goes through the field's own keyboard path: a keydown on its sink
 * carrying what the original key said (key, code, location, modifiers), past
 * every listener a key typed in the field passes (MathInput's typed fraction,
 * root and mixed-number rules, then MathLive's), and, for a character nothing
 * took at keydown, the `input` the browser's text entry would send next. A key
 * the page handled above the sink (MathInput's own "\") stops there, as
 * MathLive's handler would skip it if it were trusted. The caller has given
 * the sink focus and prevented the original key's default, so nothing else
 * types it: the key is typed once. Returns whether the key was pressed in the
 * field: false when it has no sink yet (MathLive has not built it).
 */
export const pressKeyInMathField = (mathField, key) => {
  const sink = mathFieldKeyboardSink(mathField);
  if (!sink || !key?.key || typeof KeyboardEvent !== 'function') return false;
  // What a KeyboardEvent says, copied as it is: an absent part takes the default.
  const { key: name, code, location, shiftKey, ctrlKey, altKey, metaKey, repeat } = key;
  const root = sink.getRootNode?.();
  const handledAbove = (event) => { if (event.defaultPrevented) event.stopPropagation(); };
  root?.addEventListener('keydown', handledAbove, true);
  let leftToTextEntry;
  try {
    leftToTextEntry = sink.dispatchEvent(new KeyboardEvent('keydown', {
      key: name, code, location, shiftKey, ctrlKey, altKey, metaKey, repeat, bubbles: true, cancelable: true, composed: true,
    }));
  } finally {
    root?.removeEventListener('keydown', handledAbove, true);
  }
  // One character (not a key name such as "Backspace"), with no shortcut held.
  if (leftToTextEntry && [...name].length === 1 && !ctrlKey && !metaKey && !altKey) {
    sink.dispatchEvent(new InputEvent('input', { data: name, inputType: 'insertText', bubbles: true, composed: true }));
  }
  return true;
};

/** Whether a <math-span>/<math-div> has typeset its content yet. */
export const mathElementHasRendered = (element) => Boolean(
  element?.shadowRoot?.querySelector?.(MATHLIVE_RENDER_PART_SELECTOR)?.childElementCount,
);

/**
 * What a mounted, upgraded <math-field> is missing that MathMaster relies on.
 * An element MathLive has not upgraded yet (no shadow root) reports nothing:
 * that is a loading state, not an incompatibility.
 */
export const mathFieldCompatProblems = (mathField) => {
  if (!mathField?.shadowRoot) return [];
  const problems = [];
  if (typeof mathField.hasFocus !== 'function') problems.push('MathfieldElement.hasFocus() is missing');
  if (!mathFieldKeyboardSink(mathField)) problems.push(`no keyboard sink matches ${MATHLIVE_KEYBOARD_SINK_SELECTOR}`);
  return problems;
};

const developmentBuild = () => {
  try {
    // Same rule as draftSyncDiagnostics.js: Vite replaces import.meta.env at
    // build time; node has none and counts as development.
    const env = import.meta.env;
    if (!env) return true;
    return Boolean(env.DEV) || env.MODE === 'test';
  } catch {
    return true;
  }
};

const reported = new Set();

/**
 * Say loudly, once, in development and test builds that a MathLive upgrade has
 * removed something the student-facing fixes depend on. Returns the problems.
 */
export const reportMathLiveCompatProblem = (mathField, { log = console } = {}) => {
  const problems = mathFieldCompatProblems(mathField);
  if (!problems.length || !developmentBuild()) return problems;
  problems.forEach((problem) => {
    if (reported.has(problem)) return;
    reported.add(problem);
    log?.error?.(`[MathMaster MathLive compat] ${problem}. Verified against MathLive ${MATHLIVE_VERIFIED_VERSION}; the focus hand-off (mathFieldFocusHandoff.js) is inactive until src/platform/math/mathLiveCompat.js is updated.`);
  });
  return problems;
};

/** Test hook: forget what has been reported. */
export const resetMathLiveCompatReports = () => reported.clear();

/**
 * Tell a field that focus is no longer in it, when MathLive's model still
 * says it is (see "host blur" above). Dispatches the `blur` MathLive's own
 * host listener handles; DOM focus is not touched, so the element the
 * student is in keeps it — nothing flickers. Returns whether it told it.
 */
export const settleMathFieldBlur = (mathField) => {
  if (!mathFieldHasFocus(mathField) || typeof mathField?.dispatchEvent !== 'function') return false;
  const BlurEvent = typeof FocusEvent === 'function' ? FocusEvent : Event;
  mathField.dispatchEvent(new BlurEvent('blur', { bubbles: false, composed: false }));
  return true;
};
