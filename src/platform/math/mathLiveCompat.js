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
 *                    src/index.css, and `keyboard-sink`, repositioned there
 *                    onto its own field so typing while pinch-zoomed does not
 *                    pan the page (platform/layout/pinchZoomReveal.js). CSS
 *                    cannot import this file, so the names are listed for the
 *                    compatibility test to hold both to.
 *   deferred focus   MathLive focuses a field's sink from a 60 ms timer after
 *                    the field's onFocus, by calling the sink element's own
 *                    `focus` method — which is where guardStaleMathFieldFocus
 *                    (mathFieldFocusHandoff.js) refuses a stale one.
 *   host blur        the field listens for `blur` on its host and blurs its
 *                    model there (settleMathFieldBlur). During those 60 ms
 *                    the model ignores a real blur, so a field whose late
 *                    focus was refused still thinks it is focused until told.
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
