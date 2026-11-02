import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createFieldEchoGuard } from './platform/interaction/fieldEchoGuard.js';
import './platform/math/mathliveRuntime.js';
import { requiredAnswerToolForSymbol, resolveRequiredAnswerSymbols } from './platform/interaction/answerEntryTools.js';
import { buildMobileMathTools } from './platform/interaction/mobileKeypadPolicy.js';
import { keysForConstants, useKeypadConstants } from './platform/interaction/keypadConstants.js';
import { scheduleHorizontalViewportStabilization } from './platform/mobile/mobileFocusViewport.js';
import { bindMathFieldFocusHandoff, focusMathFieldWithoutScroll } from './platform/interaction/mathFieldFocusHandoff.js';
import { useDeferredFocusHost } from './platform/interaction/answerFocusPolicy.js';
import { revealMathFieldHost, revealUnlessVisibleWhileZoomed } from './platform/layout/pinchZoomReveal.js';
import { useQuestionLifecycle } from './platform/question/QuestionLifecycleContext.jsx';
import { useRovingToolbar } from './platform/interaction/rovingToolbar.js';
import { mathFieldAccessibleName, useMathFieldName } from './platform/math/mathFieldName.js';
import { settleMathFieldBlur } from './platform/math/mathLiveCompat.js';
import {
  TYPED_FRACTION_OPENING,
  mixedNumberKeyStep,
  mixedNumberSpaceStep,
  typedFractionCommandStep,
  typedFractionKeyStep,
  typedFractionValueStep,
} from './platform/math/typedFractionEntry.js';
import { mathFieldAccessibleDescription, useMathFieldDescription } from './platform/math/mathFieldDescription.js';

// π, e and logₐ are `constant` keys: inside a question they show only where
// the item's math uses them (TL23, keypadConstants.js).
const BASIC_KEYS = [
  { label: 'π', command: '\\pi', ariaLabel: 'Insert pi', constant: 'pi' },
  { label: 'e', command: 'e', ariaLabel: 'Insert e', constant: 'e' },
  { label: 'logₐ', command: '\\log_{#?}\\left(#0\\right)', ariaLabel: 'Insert logarithm with a base', constant: 'log' },
  { label: '√', command: '\\sqrt{#0}', ariaLabel: 'Insert square root' },
  { label: 'ⁿ√', command: '\\sqrt[#?]{#0}', ariaLabel: 'Insert nth root' },
  { label: 'x²', command: '#@^{2}', ariaLabel: 'Insert square exponent' },
  { label: 'xⁿ', command: '#@^{#?}', ariaLabel: 'Insert exponent' },
  { label: '|x|', command: '\\left|#0\\right|', ariaLabel: 'Insert absolute value' },
  { label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' },
];

const MOBILE_ENTRY_KEYS = [
  ...['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].map((label) => ({ label, command: label, ariaLabel: `Insert ${label}` })),
  { label: '.', command: '.', ariaLabel: 'Insert decimal point' },
  // Commas are structural math notation, not punctuation students should have
  // to borrow from the phone keyboard. Keeping one on the base touch pad also
  // protects ordered pairs when older content is missing an answerFormat tag.
  { label: ',', command: ',', ariaLabel: 'Insert comma' },
  { label: '−', command: '-', ariaLabel: 'Insert negative sign' },
  { label: '+', command: '+', ariaLabel: 'Insert plus sign' },
  { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
];

const MOBILE_BACKSPACE_KEY = { label: '⌫', action: 'deleteBackward', ariaLabel: 'Delete previous character' };

const FUNCTION_KEYS = [
  { label: 'x', command: 'x', ariaLabel: 'Insert x' },
  { label: 'y', command: 'y', ariaLabel: 'Insert y' },
  { label: 't', command: 't', ariaLabel: 'Insert t' },
  { label: 'n', command: 'n', ariaLabel: 'Insert n' },
  { label: 'M', command: 'M', ariaLabel: 'Insert capital M' },
  { label: 'V', command: 'V', ariaLabel: 'Insert capital V' },
  { label: 'C', command: 'C', ariaLabel: 'Insert capital C' },
  { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
  { label: 'f(x)', command: 'f(x)', ariaLabel: 'Insert f of x' },
  { label: 'g(x)', command: 'g(x)', ariaLabel: 'Insert g of x' },
];

const NUMBER_KEYS = [
  { label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' },
];

const ORDERED_PAIR_KEYS = [
  { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
  { label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' },
];

const EQUATION_ENTRY_KEYS = [
  { label: 'x', command: 'x', ariaLabel: 'Insert x' },
  { label: 'y', command: 'y', ariaLabel: 'Insert y' },
  { label: 'f(x)', command: 'f(x)', ariaLabel: 'Insert f of x' },
  { label: 'f⁻¹(x)', command: 'f^{-1}(x)', ariaLabel: 'Insert inverse function f inverse of x' },
  { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
];


// Literal-equation operations need arbitrary symbolic factors on touch devices.
// The generic basic keypad intentionally has no alphabet, so a student trying
// to divide by r, lw, or Pt otherwise has no way to enter the operation when
// the device keyboard is suppressed.
const ALGEBRA_OPERATION_KEYS = [
  ...['a', 'b', 'c', 'd', 'h', 'l', 'm', 'n', 'p', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y'].map((label) => ({ label, command: label, ariaLabel: `Insert ${label}` })),
  ...['A', 'C', 'F', 'I', 'M', 'P', 'V'].map((label) => ({ label, command: label, ariaLabel: `Insert capital ${label}` })),
  { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
];

const algebraOperationKeysForContext = (contextSymbols = []) => {
  const unique = [...new Set((contextSymbols || []).filter((symbol) => /^[A-Za-z]$/.test(String(symbol))))];
  const symbolKeys = unique.map((label) => ({
    label,
    command: label,
    ariaLabel: `Insert ${/[A-Z]/.test(label) ? 'capital ' : ''}${label}`,
  }));
  return [
    ...symbolKeys,
    { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
    { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
    { label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' },
  ];
};

const INTERVAL_KEYS = [
  { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  { label: ',', command: ',', ariaLabel: 'Insert comma' },
  { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
  { label: '[', command: '[', ariaLabel: 'Insert open bracket' },
  { label: ']', command: ']', ariaLabel: 'Insert close bracket' },
  { label: '−∞', command: '-\\infty', ariaLabel: 'Insert negative infinity' },
  { label: '∞', command: '\\infty', ariaLabel: 'Insert positive infinity' },
  { label: '∪', command: '\\cup', ariaLabel: 'Insert union' },
];


const SET_KEYS = [
  { label: '{', command: '\\lbrace', ariaLabel: 'Insert opening set brace' },
  { label: '}', command: '\\rbrace', ariaLabel: 'Insert closing set brace' },
  { label: ',', command: ',', ariaLabel: 'Insert comma' },
  { label: '∅', command: '\\varnothing', ariaLabel: 'Insert empty set' },
];

const INEQUALITY_KEYS = [
  { label: '<', command: '<', ariaLabel: 'Insert less than' },
  // Insert the complete Unicode relation character, not a bare LaTeX command
  // prefix such as "\\le". If the next character is a variable (especially t),
  // MathLive can otherwise serialize "\\le" + "t" as the command-like token
  // "\\let". A keypad press must be an atomic mathematical symbol.
  { label: '≤', command: '≤', ariaLabel: 'Insert less than or equal to' },
  { label: '>', command: '>', ariaLabel: 'Insert greater than' },
  { label: '≥', command: '≥', ariaLabel: 'Insert greater than or equal to' },
  { label: '≠', command: '≠', ariaLabel: 'Insert not equal to' },
];

// Infinity and union belong to interval/set notation, not inequality notation.
// Keeping them off this keypad prevents Algebra I students from being nudged
// toward -∞<x<∞ when the correct course-language response is "All Real Numbers."
// INTERVAL_KEYS still provides ±∞ and ∪ wherever interval notation is actually
// in scope.

// THE WAY OUT.
//
// A math field is structural: `/` opens a fraction and the cursor lands in the
// denominator, `^` opens a power and the cursor lands in the exponent, and both
// keep everything typed afterwards. Typing `3/4x+2` therefore produces
// three over four-x-plus-two — a different expression from the one the student
// meant, and one they can see but may not recognise as wrong.
//
// MathLive's way out is the space bar, which nothing tells a student. This is
// the same gesture with a name on it, and it is on every keypad because every
// keypad can open a group.
//
// It was labelled "↷ out": ↷ is the redo arrow, and "out" alone said neither
// what moves nor where to (TL23). The label now says the move in plain words,
// with the arrow pointing the way the cursor goes.
const EXIT_GROUP_KEY = {
  label: 'move out →',
  action: 'moveAfterParent',
  ariaLabel: 'Move the cursor out of the fraction, exponent or bracket',
};

// A keypad needs the way out only if one of its own keys can put the cursor
// inside something.
//
// MathLive placeholders are the tell: `\sqrt{#0}`, `#@^{2}` and
// `\left|#0\right|` all leave the cursor in a group, and the space bar is the
// only documented way out. `<`, `≤`, `[` and `,` do not — they are single
// characters, and the cursor never goes anywhere it needs rescuing from.
//
// This was appended to every profile unconditionally, which put a button
// labelled "out" on the inequality keypad, where nothing can open a group. That
// keypad is the one domain and range questions use, so the least useful key on
// the platform sat on its most-used pad. Deriving the decision from the keys
// means a pad that gains a root or an exponent later gets the exit key with it,
// and one that never does never shows it.
const opensAGroup = (key) => /#0|#\?|#@/.test(String(key?.command || ''));

const withExit = (keys) => (keys.some(opensAGroup) ? [...keys, EXIT_GROUP_KEY] : [...keys]);

const mergeToolKeys = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((tool) => {
    if (!tool) return false;
    const key = String(tool.label || tool.ariaLabel || tool.command || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getToolKeys = (profile, { isMobile = false, contextSymbols = [], functionNotationKeys = [] } = {}) => {
  const authoredFunctionKeys = (Array.isArray(functionNotationKeys) ? functionNotationKeys : [])
    .filter((entry) => entry?.label && entry?.command)
    .map((entry) => ({
      label: String(entry.label),
      command: String(entry.command),
      ariaLabel: entry.ariaLabel || `Insert ${entry.label}`,
    }));
  if (profile === 'interval') return withExit(INTERVAL_KEYS);
  if (profile === 'inequality') return withExit(INEQUALITY_KEYS);
  if (profile === 'set') return withExit([...SET_KEYS, ...INEQUALITY_KEYS, ...INTERVAL_KEYS.filter((item) => ['(', ')', '[', ']'].includes(item.label))]);
  if (profile === 'function') return withExit([...authoredFunctionKeys, ...FUNCTION_KEYS, ...BASIC_KEYS]);
  if (profile === 'algebra-operation') return withExit(isMobile ? algebraOperationKeysForContext(contextSymbols) : [...ALGEBRA_OPERATION_KEYS, ...BASIC_KEYS]);
  if (profile === 'basic+set') return withExit([...BASIC_KEYS, ...SET_KEYS, ...INEQUALITY_KEYS]);
  if (profile === 'equation') return withExit([...EQUATION_ENTRY_KEYS, ...BASIC_KEYS]);
  if (profile === 'expression') return withExit(BASIC_KEYS);
  // A number answer needs digits, a sign, a decimal point and — because
  // fractions are numbers — a stacked fraction. Nothing else. Anything a
  // particular question genuinely requires still arrives through
  // `requiredSymbols`, which surfaces its own row of keys.
  if (profile === 'number') return withExit(NUMBER_KEYS);
  // An ordered pair is two numbers, a comma and a pair of brackets.
  if (profile === 'orderedPair') return withExit(ORDERED_PAIR_KEYS);
  return withExit(BASIC_KEYS);
};

const EMPTY_KEYS = Object.freeze([]);

// A profile's keys with a caller's extra keys after them, and the way out
// when any of them opens a group.
const withExtraKeys = (keys, extraKeys) => (extraKeys.length
  ? withExit(mergeToolKeys(keys.filter((key) => key !== EXIT_GROUP_KEY), extraKeys))
  : keys);

const detectMobileInput = () => typeof window !== 'undefined' && (window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches === true);

// The keypad toggle's picture: a small keyboard (TL23). Drawn, not a glyph, so
// every device shows the same shape; decorative, because the button's name
// ("Show math tools" / "Hide math tools") says what it does.
const KeypadIcon = () => (
  <svg data-math-tools-icon="keypad" aria-hidden="true" focusable="false" width="22" height="16" viewBox="0 0 22 16" style={{ display: 'block', margin: '0 auto' }}>
    <rect x="1" y="1" width="20" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    {[4.5, 9, 13.5, 18].map((x) => <rect key={`top-${x}`} x={x - 1.4} y="4" width="2.8" height="2.4" rx="0.6" fill="currentColor" />)}
    {[6.75, 11.25, 15.75].map((x) => <rect key={`mid-${x}`} x={x - 1.4} y="7.6" width="2.8" height="2.4" rx="0.6" fill="currentColor" />)}
    <rect x="6.5" y="11.2" width="9" height="1.8" rx="0.6" fill="currentColor" />
  </svg>
);

export default function MathInput({
  value,
  onChange,
  placeholder = '',
  ariaLabel = '',
  showToolsInitially = false,
  toolProfile = 'basic',
  onUndoStateChange = null,
  inputStatus = 'neutral',
  // A graded entry says so to a screen reader as well as by its border: the
  // caller that marks it in words passes the mark's id, and whether it is wrong
  // (GradedEntryMark.jsx, VH-13).
  ariaInvalid = false,
  ariaDescribedBy = '',
  focusSignal = 0,
  compact = false,
  maxWidth = 540,
  contextSymbols = [],
  functionNotationKeys = [],
  answerFormat = '',
  requiredSymbols = [],
  collapseSignal = 0,
  onSubmit = null,
  // Desktop only: drop the "Show math tools" pill for a field that sits in a
  // tight, column-aligned layout (a stacked elimination row). A physical
  // keyboard types everything these fields take. On a phone the tools ARE the
  // keypad (the native keyboard is suppressed), so they are never hidden there.
  hideToolsToggle = false,
  // Keys a caller adds to the keypad itself, uncaptioned (a secure test item:
  // secureAnswerEntry.js). Unlike `requiredSymbols`, nothing here appears in
  // the "Needed for this answer" row, which on a test would hint at the answer.
  extraKeys = EMPTY_KEYS,
  // Never name a symbol the field needs (a secure test item): a symbol no key
  // types still keeps the phone's own keyboard, but "Additional symbol
  // needed: …" would tell a student about the answer.
  hideNeededSymbols = false,
}) {
  const mfRef = useRef(null);
  const onChangeRef = useRef(onChange);
  // The newest onSubmit, and the last value reported upward: Enter reports the
  // field first when MathLive has not yet, then acts through these (below).
  const onSubmitRef = useRef(onSubmit);
  const reportedRef = useRef(null);
  // Every value this field reports upward goes through `emit`, so the prop
  // sync below can tell its own late echo from a change made elsewhere.
  const echoGuardRef = useRef(null);
  if (!echoGuardRef.current) echoGuardRef.current = createFieldEchoGuard();
  // Whether the cursor sits in the denominator of a fraction the student opened
  // by typing `/`, and what they have typed there (typedFractionEntry.js).
  const typedFractionRef = useRef(null);
  // A space typed after a whole number, waiting to see whether a mixed number
  // follows (GR33, typedFractionEntry.js mixedNumberKeyStep).
  const mixedNumberRef = useRef(null);
  const emit = useCallback((next) => {
    echoGuardRef.current.emitted(next);
    reportedRef.current = next;
    onChangeRef.current(next);
  }, []);
  const [showTools, setShowTools] = useState(showToolsInitially || requiredSymbols.length > 0);
  const [isMobile, setIsMobile] = useState(detectMobileInput);
  // Is the student working in THIS field right now? On a touch device the
  // math keypad is the keyboard, so it belongs to the active field only: a
  // board of seven fields used to leave every visited field's keypad (and its
  // "Needed for this answer" row) open down the page (student UX pass, R-11).
  // A desktop keeps the student's own choice.
  const [fieldActive, setFieldActive] = useState(false);
  const rootRef = useRef(null);
  const toolsId = `mm-math-tools-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // `showToolsInitially` still opens a desktop keypad on arrival. On a touch
  // device the keypad opens the moment the field is tapped anyway, so there
  // "initially" means "while this field is the one being typed in" — the
  // multi-answer grader asked for it on every field that needed a fraction,
  // and each such keypad stayed open whichever box the student was in.
  // A closed question's boxes are read-only: its keypad closes with it
  // (student pass 3) instead of staying open over the worked solution.
  const { terminal: questionTerminal } = useQuestionLifecycle();
  const toolsVisible = !questionTerminal && (isMobile ? showTools && fieldActive : showTools);
  const requiredKeysVisible = !questionTerminal && isMobile && fieldActive;

  /*
   * ESCAPE IN A MATH FIELD LEAVES THE FIELD, NEVER WORK VIEW (TL15, owner
   * decision; was PR #454's "Escape there still closes the dialog").
   *
   * A student presses Escape in a field mostly to put the keypad away, and it
   * closed Work View: an easy exit nobody meant (nothing was lost, but the
   * student was thrown out of the bigger view mid-answer). Now Escape in the
   * field — or on one of its keys — closes the keypad and moves focus out of
   * the field, onto the field's own √x button beside it, so a keyboard or
   * screen-reader student stays exactly where they were (Shift+Tab is back in
   * the field). Without that button (a desktop row that hides it), the field
   * simply blurs; from a key, focus goes back into the field. The key is
   * marked handled, so a dialog around the field stays open (src/ui/Dialog.jsx);
   * it is not stopped, so the plane's hover readout still hears it.
   *
   * The way out of Work View is therefore always two Escapes from a field,
   * keypad open or closed: the first leaves the field, the second — focus no
   * longer in a field — closes Work View, as Escape does everywhere else.
   * One press, one step: the field takes Escape only for what it opened (its
   * keypad, its own focus). A phone gets its keypad back on the next tap into
   * the field, which focuses it again.
   */
  const toggleRef = useRef(null);
  const leaveOnEscape = useCallback(({ fromKeys = false } = {}) => {
    setShowTools(false);
    const toggle = toggleRef.current;
    if (toggle?.isConnected) {
      toggle.focus({ preventScroll: true });
      return;
    }
    const mathField = mfRef.current;
    if (fromKeys) {
      if (!focusMathFieldWithoutScroll(mathField)) mathField?.focus?.({ preventScroll: true });
      return;
    }
    mathField?.blur?.();
  }, []);
  const escapeFromKeys = (event) => {
    if (event.key !== 'Escape' || event.isComposing) return false;
    event.preventDefault();
    leaveOnEscape({ fromKeys: true });
    return true;
  };

  const stabilizeMobileViewport = useCallback(() => {
    const root = mfRef.current?.closest?.('.mathmaster-question-container')
      || mfRef.current?.closest?.('.mathmaster-question-stage')
      || null;
    // Horizontal caret panning is not actually a "mobile-only" browser
    // behavior. Touch Chromebooks and desktop Chrome can pan an overflow:auto
    // question workspace to keep a MathLive caret visible too. The safe rule is
    // platform-wide: math entry may move vertically, never the question's x
    // position.
    scheduleHorizontalViewportStabilization({ root });
  }, []);
  const requiredAnswerSymbols = useMemo(
    () => resolveRequiredAnswerSymbols({ answerFormat, toolProfile, requiredSymbols }),
    [answerFormat, toolProfile, requiredSymbols],
  );
  const requiredTools = useMemo(
    () => requiredAnswerSymbols.map((symbol) => requiredAnswerToolForSymbol(symbol)).filter(Boolean),
    [requiredAnswerSymbols],
  );
  const unservedRequiredSymbols = useMemo(
    () => requiredAnswerSymbols.filter((symbol) => !requiredAnswerToolForSymbol(symbol)),
    [requiredAnswerSymbols],
  );
  const shouldSuppressNativeKeyboard = isMobile && toolProfile !== 'function' && unservedRequiredSymbols.length === 0;
  // π, e and logₐ that the question's math does not use are left off the
  // profile's keys — before a caller's extra keys and the keys this answer
  // needs are added, so neither can ever be removed (TL23, keypadConstants.js).
  const keypadConstants = useKeypadConstants();
  const tools = useMemo(() => {
    if (!isMobile) return mergeToolKeys(
      withExtraKeys(keysForConstants(getToolKeys(toolProfile, { contextSymbols, functionNotationKeys }), keypadConstants), extraKeys),
      requiredTools,
    );

    // Mobile equation pads are intentionally opinionated:
    // - parentheses are ALWAYS directly reachable;
    // - semantic duplicates such as the second '=' are removed;
    // - nth root is omitted from the crowded generic equation pad unless the
    //   question explicitly declares it as a required symbol;
    // - Backspace stays fixed in the final grid position.
    return buildMobileMathTools({
      toolProfile,
      entryKeys: MOBILE_ENTRY_KEYS,
      profileKeys: withExtraKeys(keysForConstants(getToolKeys(toolProfile, { isMobile: true, contextSymbols, functionNotationKeys }), keypadConstants), extraKeys),
      requiredTools,
      backspaceKey: MOBILE_BACKSPACE_KEY,
    });
  }, [toolProfile, isMobile, contextSymbols, functionNotationKeys, requiredTools, extraKeys, keypadConstants]);

  useEffect(() => {
    const update = () => setIsMobile(detectMobileInput());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // A layout effect, so the render that flushSync below forces has set it.
  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  // Declared BEFORE the listener effect below, so on mount its stale-key guard
  // is the first capture listener on the host and runs ahead of Enter/space
  // handling: a key meant for another box never reaches this field's handlers.
  // See mathFieldFocusHandoff.js — clicking a field and typing at once used to
  // edit the field the student had just left.
  useEffect(() => bindMathFieldFocusHandoff(mfRef.current), []);

  // A math field MathLive still counts as focused when it leaves the page
  // stays MathLive's "focused" field after it is gone, and the next field a
  // student taps tries to blur it: MathLive threw reading the removed field's
  // model (atomToString -> options), e.g. after "Continue here" remounted a
  // question focused while its tab was in the background, where no real blur
  // ever reached it (RT06). A layout cleanup runs before React removes the
  // element: tell its model there, while it is whole (settleMathFieldBlur:
  // MathLive's own flag, not the page's focus).
  useLayoutEffect(() => {
    const mathField = mfRef.current;
    return () => { settleMathFieldBlur(mathField); };
  }, []);

  // A screen reader lands in MathLive's keyboard sink, which MathLive leaves
  // unnamed: the sink gets the host's name too (mathFieldName.js, A11Y-3).
  // On a closed question the name says the answer as well (AX01).
  const fieldName = mathFieldAccessibleName({ name: ariaLabel || placeholder, value, closed: questionTerminal });
  useMathFieldName(mfRef, fieldName);

  // And what is in it, said once focus lands: the name took over the label
  // MathLive's own account of the content used to sit in, so a filled box was
  // heard by its name alone (mathFieldDescription.js, AX11). It follows every
  // key, so it is worked out once per value.
  const fieldDescription = useMemo(
    () => mathFieldAccessibleDescription({ value, closed: questionTerminal }),
    [value, questionTerminal],
  );
  useMathFieldDescription(mfRef, fieldDescription);

  useEffect(() => {
    const mathField = mfRef.current;
    if (!mathField) return undefined;

    mathField.mathVirtualKeyboardPolicy = 'manual';
    // MathLive reveals the field on focus and on every edit. Pinch-zoomed onto
    // it, a field the person can see stays put (platform/layout/pinchZoomReveal.js).
    mathField.onScrollIntoView = revealMathFieldHost;
    // Most math responses use MathMaster's controlled mobile keypad. Function
    // rules are different: students may legitimately need arbitrary names, so
    // keep the device keyboard there. Algebra operations now have an equation-
    // aware symbol strip, so they no longer need the full phone keyboard.
    if (shouldSuppressNativeKeyboard) mathField.setAttribute('inputmode', 'none');
    else mathField.removeAttribute('inputmode');
    mathField.menuItems = [];
    // Interval delimiters carry endpoint inclusion semantics, and an ordered
    // pair's parentheses carry coordinate-pair semantics. MathLive's smart
    // fences can rewrite a physically typed delimiter differently from the
    // identical MathMaster keypad button — e.g. a typed `(` can serialize as
    // `\left(` while the on-screen `(` key inserts a bare `(` — which used to
    // let a visually-correct ordered pair fail grading. Keep fences literal
    // for both structural profiles while retaining smart fences for
    // equations and expressions, where fence style carries no meaning.
    mathField.smartFence = toolProfile !== 'interval' && toolProfile !== 'orderedPair';
    mathField.smartSuperscript = true;
    mathField.placeholder = placeholder ? `\\text{${placeholder}}` : '';
    window.mathVirtualKeyboard?.hide?.();

    const handleInput = () => {
      typedFractionRef.current = typedFractionValueStep(typedFractionRef.current, mathField.value);
      emit(mathField.value);
      stabilizeMobileViewport();
    };

    // Climb out of every open fraction, power or root. Stops when the cursor
    // stops moving, which is how a top-level position announces itself.
    const leaveAllGroups = () => {
      for (let guard = 0; guard < 12; guard += 1) {
        const before = mathField.position;
        mathField.executeCommand('moveAfterParent');
        if (mathField.position === before) return;
      }
    };

    const preventUnusedModes = (event) => {
      // "3 1/2" is 3½: the digits after a space that followed a whole number
      // become the numerator, not part of the whole number (GR33).
      if (event.key !== ' ' && event.code !== 'Space') {
        const mixed = mixedNumberKeyStep(mixedNumberRef.current, event);
        mixedNumberRef.current = mixed.state;
        if (mixed.numerator) {
          event.preventDefault();
          event.stopPropagation();
          for (let typed = 0; typed < mixed.numerator.length; typed += 1) mathField.executeCommand('deleteBackward');
          mathField.insert(`\\frac{${mixed.numerator}}{#?}`, { selectionMode: 'placeholder' });
          typedFractionRef.current = TYPED_FRACTION_OPENING;
          emit(mathField.value);
          stabilizeMobileViewport();
          return;
        }
      }
      // A typed `/` builds the fraction the same characters mean as text:
      // once the denominator is a plain number, a letter, operator, relation,
      // comma or bracket starts after it — y=-2/3x+4 is −(2/3)x + 4,
      // not −2/(3x + 4) (PQ-040). Runs before MathLive inserts the key, like
      // the `=` rule below; anything it does not recognise changes nothing.
      const fractionStep = typedFractionKeyStep(typedFractionRef.current, event, mathField.value);
      typedFractionRef.current = fractionStep.state;
      if (fractionStep.leaveFraction) mathField.executeCommand('moveAfterParent');
      if (event.key === 'Enter' && onSubmit && !event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        // MathLive shows a key before it reports it: the `input` event comes a
        // beat later. On a slow Chromebook Enter can land in that beat, and the
        // answer checked or submitted was the one before the last keys (a box
        // showing −2 was checked as the −1 typed before it: afterLastMiss.mjs,
        // the 3×3 practice). Report the field as it stands, let the parent
        // render that, and act through the parent's newest onSubmit.
        if (mathField.value !== reportedRef.current) flushSync(() => emit(mathField.value));
        onSubmitRef.current?.();
        return;
      }
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        event.stopPropagation();
        const before = mathField.position;
        mathField.executeCommand?.('moveAfterParent');
        // Only a space at the top level can start a mixed number: one inside
        // a power or a fraction leaves it, as it always has.
        mixedNumberRef.current = mathField.position === before
          ? mixedNumberSpaceStep(mathField.getValue?.(0, mathField.position, 'latex'))
          : null;
        emit(mathField.value);
        stabilizeMobileViewport();
        return;
      }
      if (event.key === 'Escape') {
        // Never MathLive's LaTeX mode: the student's way out of the field
        // (TL15, leaveOnEscape above). Handled here, so Work View stays open.
        event.preventDefault();
        if (!event.isComposing) leaveOnEscape();
        return;
      }
      if (event.key === '\\') {
        event.preventDefault();
        mathField.insert('\\backslash', { selectionMode: 'after' });
      }
      // An equals sign always starts the other side of the statement, never the
      // inside of a denominator or an exponent. Without this, a student typing
      // `f^-1(x)=(x+9)/4` got the whole equation buried in the superscript,
      // because `^` opens a group and nothing closes it. `+` and `-` are left
      // alone deliberately: `1/x-2` is a student legitimately building the
      // denominator x−2, and guessing there would take it away from them.
      if (event.key === '=') {
        leaveAllGroups();
      }
    };
    const preventContextMenu = (event) => event.preventDefault();
    // A click or tap can put the caret anywhere: stop watching the fraction.
    const forgetTypedFraction = () => {
      typedFractionRef.current = null;
      mixedNumberRef.current = null;
    };
    const handleFocus = () => {
      forgetTypedFraction();
      stabilizeMobileViewport();
    };

    mathField.addEventListener('input', handleInput);
    mathField.addEventListener('focus', handleFocus);
    mathField.addEventListener('keydown', preventUnusedModes, { capture: true });
    mathField.addEventListener('contextmenu', preventContextMenu);
    mathField.addEventListener('pointerdown', forgetTypedFraction);

    return () => {
      mathField.removeEventListener('input', handleInput);
      mathField.removeEventListener('focus', handleFocus);
      mathField.removeEventListener('keydown', preventUnusedModes, { capture: true });
      mathField.removeEventListener('contextmenu', preventContextMenu);
      mathField.removeEventListener('pointerdown', forgetTypedFraction);
    };
  }, [placeholder, isMobile, toolProfile, onSubmit, shouldSuppressNativeKeyboard, stabilizeMobileViewport, emit, leaveOnEscape]);

  // A value the field itself emitted and has since typed past is not written
  // back: that is how fast typing lost characters (see fieldEchoGuard.js).
  useEffect(() => {
    const mathField = mfRef.current;
    if (mathField && echoGuardRef.current.shouldWrite(mathField.value, value)) {
      mathField.value = value || '';
      // Written from outside: whatever the student was typing into is gone.
      typedFractionRef.current = null;
      mixedNumberRef.current = null;
      // And so is the field's own undo history. MathLive keeps one per field,
      // and after a platform Undo cleared "[-3,5)" a Ctrl+Z in the field put
      // it straight back (tests/browser/undoTyping.mjs). The field's history
      // now starts at what the platform wrote.
      mathField.resetUndo?.();
      stabilizeMobileViewport();
    }
  }, [value, stabilizeMobileViewport]);

  // Some tools intentionally move the student's attention into a math field
  // immediately after they choose an action. A numeric signal avoids making
  // every MathInput autofocus on mount: only an explicit increment focuses it.
  //
  // Inside a question the focus waits for the next frame through the
  // question's deferred-focus authority: the action that raised the signal
  // already happened, so only a press or key AFTER it cancels the focus (the
  // student clicked somewhere else first), as does the question going away.
  //
  // ONLY THE SIGNAL FOCUSES. Whether this is a phone is read when the focus
  // happens; it is not a reason to focus again. `isMobile` follows the
  // window's width, and while it was one of this effect's dependencies every
  // window that crossed 768px ran it again and pulled focus back into this
  // field from wherever the student was; zooming a 1366px Chromebook to 200%
  // or snapping it to half the screen is enough. On a secure test that took
  // focus out of the open question list: Escape no longer closed the list,
  // and the next keys typed into the answer under it
  // (tests/browser/secureExamNavigation.mjs; in CI a full-page screenshot's
  // momentary 1x1 viewport did it).
  const deferredFocusHost = useDeferredFocusHost();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  useEffect(() => {
    if (!focusSignal || !mfRef.current) return undefined;
    const focusField = () => {
      const mathField = mfRef.current;
      // MathfieldElement.focus() ignores preventScroll; the sink does not.
      if (!focusMathFieldWithoutScroll(mathField)) mathField?.focus?.({ preventScroll: true });
      // On a Chromebook the field the student was just sent to could sit under
      // the sticky Undo / Reset / Calculator bar (live QA: "Subtract what?" and
      // its Pick up chip were hidden there). 'nearest' leaves a visible field
      // alone; the field's scroll-margin keeps it clear of the bar. Phones keep
      // their own viewport stabilisation.
      // Pinch-zoomed onto a field that is already on the magnified screen, it
      // is left exactly where it is.
      if (!isMobileRef.current) revealUnlessVisibleWhileZoomed(mathField, { block: 'nearest', inline: 'nearest' });
    };
    if (deferredFocusHost) return deferredFocusHost.request(focusField, { since: 'now', channel: 'field' });
    const frame = window.requestAnimationFrame(focusField);
    return () => window.cancelAnimationFrame(frame);
  }, [focusSignal, deferredFocusHost]);

  useEffect(() => {
    if (!collapseSignal) return;
    setShowTools(false);
  }, [collapseSignal]);

  const undo = useCallback(() => {
    const mathField = mfRef.current;
    if (!mathField) return;
    mathField.focus({ preventScroll: true });
    mathField.executeCommand?.('undo');
    emit(mathField.value);
    stabilizeMobileViewport();
  }, [stabilizeMobileViewport, emit]);

  useEffect(() => {
    onUndoStateChange?.({
      canUndo: Boolean(value),
      onUndo: undo,
      label: 'Undo last input edit',
    });
    return () => onUndoStateChange?.(null);
  }, [value, undo, onUndoStateChange]);

  const insert = useCallback((command, action = null) => {
    const mathField = mfRef.current;
    if (!mathField) return;
    mathField.focus({ preventScroll: true });
    if (action) {
      typedFractionRef.current = null;
      mixedNumberRef.current = null;
      mathField.executeCommand?.(action);
      emit(mathField.value);
      stabilizeMobileViewport();
      return;
    }
    // A keypad x, +, × or digit after a typed 2/3 follows the same rule as the
    // physical key; a template key (a/b, xʸ, √) ends the watch.
    const fractionStep = typedFractionCommandStep(typedFractionRef.current, command, mathField.value);
    typedFractionRef.current = fractionStep.state;
    mixedNumberRef.current = null;
    if (fractionStep.leaveFraction) mathField.executeCommand?.('moveAfterParent');
    mathField.insert(command, {
      insertionMode: 'replaceSelection',
      selectionMode: /#0|#\?/.test(command) ? 'placeholder' : 'after',
    });
    emit(mathField.value);
    stabilizeMobileViewport();
  }, [stabilizeMobileViewport, emit]);

  // Each keypad is one Tab stop: arrows, Home and End move between its keys
  // (rovingToolbar.js, student pass 3 PR-27).
  const requiredKeysToolbar = useRovingToolbar(requiredTools.length);
  const toolsToolbar = useRovingToolbar(tools.length);

  const borderColor = inputStatus === 'incorrect'
    ? '#d93025'
    : inputStatus === 'correct'
      ? '#188038'
      : '#1a73e8';

  return (
    <div
      ref={rootRef}
      className="mathmaster-math-input"
      onFocus={() => setFieldActive(true)}
      onBlur={(event) => {
        // Moving between the field and its own keys is still "in the field".
        const next = event.relatedTarget;
        if (rootRef.current?.contains?.(next)) return;
        // Close only when the student has moved somewhere else to TYPE. A tap
        // on a button — this card's Check, right under the keypad — blurs the
        // field on pointerdown; collapsing the keypad then moved the button up
        // out from under the finger and the tap missed (PR #397 phone journey:
        // "slope −2 accepted on a phone" failed). The keypad stays until the
        // next field, input or select takes focus.
        const typingElsewhere = Boolean(next) && (/^(MATH-FIELD|INPUT|TEXTAREA|SELECT)$/.test(String(next.tagName || '').toUpperCase()) || next.isContentEditable);
        if (typingElsewhere) setFieldActive(false);
      }}
      style={{
        width: `min(100%, ${maxWidth}px)`,
        maxWidth: '100%',
        minWidth: 0,
        margin: '0 auto',
        overflowX: 'hidden',
        contain: 'inline-size',
      }}
    >
      {/* THE FIELD AND ITS TOOLS BUTTON SHARE ONE ROW.
          "Show math tools" was a pill on its own line under every field:
          seven fields on the representation board, seven rows of the same
          button. It is now a compact √x button beside the field — same
          accessible name, same keypad, no extra row. */}
      <div className="mathmaster-math-input-row" style={{ display: 'flex', alignItems: 'stretch', gap: 6, width: '100%', minWidth: 0 }}>
      <math-field
        ref={mfRef}
        // A field with its own Enter action says so, so the question-level
        // Enter routing (QuestionEngine) never takes the key from it.
        data-mm-enter-owner={onSubmit ? 'field' : undefined}
        aria-label={fieldName}
        aria-invalid={ariaInvalid ? 'true' : undefined}
        aria-describedby={ariaDescribedBy || undefined}
        math-virtual-keyboard-policy="manual"
        inputmode={shouldSuppressNativeKeyboard ? 'none' : undefined}
        onFocus={() => {
          if (isMobile) {
            setShowTools(true);
            stabilizeMobileViewport();
          }
        }}
        style={{
          display: 'block',
          flex: '1 1 auto',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          minHeight: compact ? '44px' : '54px',
          fontSize: compact ? 'calc(20 * var(--mm-px))' : 'calc(24 * var(--mm-px))',
          padding: compact ? '8px 10px' : '12px 14px',
          borderRadius: '8px',
          border: `2px solid ${borderColor}`,
          background: inputStatus === 'incorrect' ? 'var(--mm-error-subtle)' : inputStatus === 'correct' ? 'var(--mm-success-subtle)' : 'var(--mm-surface)',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
        }}
      />
      {hideToolsToggle && !isMobile ? null : (
        <button
          ref={toggleRef}
          type="button"
          className="mathmaster-math-tools-toggle"
          // Keeps focus (and a phone's keypad) in the field while toggling.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (toolsVisible) {
              setShowTools(false);
              return;
            }
            setShowTools(true);
            // On a touch device the keypad belongs to the active field, so
            // asking for it from outside the field puts the student in it.
            if (isMobile && !fieldActive) focusMathFieldWithoutScroll(mfRef.current);
          }}
          aria-expanded={toolsVisible}
          aria-controls={toolsVisible ? toolsId : undefined}
          aria-label={toolsVisible ? 'Hide math tools' : 'Show math tools'}
          title={toolsVisible ? 'Hide math tools' : 'Show math tools (fractions, powers, roots…)'}
          style={{
            flex: '0 0 auto',
            minWidth: 44,
            minHeight: 44,
            padding: '0 8px',
            border: '1px solid var(--mm-tint-border)',
            borderRadius: 8,
            background: toolsVisible ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
            color: 'var(--mm-primary-text)',
            fontWeight: 800,
            fontSize: 'calc(15 * var(--mm-px))',
            fontFamily: 'serif',
            cursor: 'pointer',
          }}
        >
          {/* A keypad, not "√x": the button opens every key, and √x read
              as "insert a square root" (TL23). The name stays the words. */}
          <KeypadIcon />
        </button>
      )}
      </div>

      {requiredKeysVisible && requiredTools.length > 0 && (
        <div
          className="mathmaster-required-answer-keys"
          role="toolbar"
          aria-label="Keys needed for this answer"
          onKeyDown={(event) => { if (!escapeFromKeys(event)) requiredKeysToolbar.onKeyDown(event); }}
          style={{
            display: 'grid',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            gridTemplateColumns: `repeat(${Math.min(4, requiredTools.length)}, minmax(0, 1fr))`,
            gap: '8px',
            marginTop: '10px',
            padding: '10px',
            border: '2px solid var(--mm-primary-border)',
            borderRadius: '10px',
            background: 'var(--mm-primary-subtle)',
          }}
        >
          <div style={{ gridColumn: '1 / -1', color: 'var(--mm-primary-text)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 900, textAlign: 'left' }}>Needed for this answer</div>
          {requiredTools.map((tool, index) => (
            <button
              type="button"
              key={`required-${tool.ariaLabel}`}
              {...requiredKeysToolbar.itemProps(index)}
              aria-label={tool.ariaLabel}
              title={tool.ariaLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insert(tool.command, tool.action)}
              style={{
                minHeight: '48px',
                minWidth: 0,
                maxWidth: '100%',
                border: '2px solid var(--mm-primary-border)',
                borderRadius: '8px',
                background: 'var(--mm-surface)',
                color: 'var(--mm-primary-text)',
                fontSize: 'calc(21 * var(--mm-px))',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {tool.label}
            </button>
          ))}
        </div>
      )}

      {isMobile && !hideNeededSymbols && unservedRequiredSymbols.length > 0 && (
        <div role="status" style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 700 }}>
          Additional symbol needed: {unservedRequiredSymbols.join(', ')}. Your device keyboard remains available.
        </div>
      )}

      {toolsVisible && (
        <div
          id={toolsId}
          className={`mathmaster-math-input-tools mathmaster-math-input-tools-${toolProfile}`}
          role="toolbar"
          aria-label="Math tools"
          onKeyDown={(event) => { if (!escapeFromKeys(event)) toolsToolbar.onKeyDown(event); }}
          style={{
            display: 'grid',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            gridTemplateColumns: 'repeat(auto-fit, minmax(48px, 1fr))',
            gap: '8px',
            marginTop: '10px',
            padding: '10px',
            border: '1px solid var(--mm-tint-border)',
            borderRadius: '10px',
            background: 'var(--mm-surface-tint)',
          }}
        >
          {tools.map((tool, index) => (
            <button
              type="button"
              key={`${toolProfile}-${tool.ariaLabel}`}
              {...toolsToolbar.itemProps(index)}
              aria-label={tool.ariaLabel}
              title={tool.ariaLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insert(tool.command, tool.action)}
              className={tool.action === 'deleteBackward' ? 'mathmaster-fixed-backspace' : undefined}
              style={{
                minHeight: '44px',
                minWidth: 0,
                maxWidth: '100%',
                overflow: 'hidden',
                border: '1px solid var(--mm-primary-border)',
                borderRadius: '7px',
                background: 'var(--mm-surface)',
                color: 'var(--mm-text-strong)',
                fontSize: 'calc(18 * var(--mm-px))',
                fontWeight: 'bold',
                cursor: 'pointer',
                ...(isMobile && tool.action === 'deleteBackward' ? {
                  gridColumn: '-2 / -1',
                  background: 'var(--mm-primary-soft)',
                  borderColor: 'var(--mm-primary-border)',
                  color: 'var(--mm-primary-text)',
                } : {}),
                // The one key that is words (TL23): two keys wide, like a
                // space bar, so "move out →" reads on one line.
                ...(tool === EXIT_GROUP_KEY ? {
                  gridColumn: 'span 2',
                  fontSize: 'calc(15 * var(--mm-px))',
                  whiteSpace: 'nowrap',
                } : {}),
              }}
            >
              {tool.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
