import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'mathlive';
import { requiredAnswerToolForSymbol, resolveRequiredAnswerSymbols } from './platform/interaction/answerEntryTools.js';
import { buildMobileMathTools } from './platform/interaction/mobileKeypadPolicy.js';
import { scheduleHorizontalViewportStabilization } from './platform/mobile/mobileFocusViewport.js';

const BASIC_KEYS = [
  { label: 'π', command: '\\pi', ariaLabel: 'Insert pi' },
  { label: 'e', command: 'e', ariaLabel: 'Insert e' },
  { label: 'logₐ', command: '\\log_{#?}\\left(#0\\right)', ariaLabel: 'Insert logarithm with a base' },
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
  { label: '−∞', command: '-\\infty', ariaLabel: 'Insert negative infinity' },
  { label: '∞', command: '\\infty', ariaLabel: 'Insert positive infinity' },
  { label: '∪', command: '\\cup', ariaLabel: 'Insert union' },
];

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
const EXIT_GROUP_KEY = {
  label: '↷ out',
  action: 'moveAfterParent',
  ariaLabel: 'Move the cursor out of the fraction, exponent or bracket',
};

const withExit = (keys) => [...keys, EXIT_GROUP_KEY];

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
  return withExit(BASIC_KEYS);
};

const detectMobileInput = () => typeof window !== 'undefined' && (window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches === true);

export default function MathInput({
  value,
  onChange,
  placeholder = '',
  ariaLabel = '',
  showToolsInitially = false,
  toolProfile = 'basic',
  onUndoStateChange = null,
  inputStatus = 'neutral',
  focusSignal = 0,
  compact = false,
  maxWidth = 540,
  contextSymbols = [],
  functionNotationKeys = [],
  answerFormat = '',
  requiredSymbols = [],
  collapseSignal = 0,
  onSubmit = null,
}) {
  const mfRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [showTools, setShowTools] = useState(showToolsInitially);
  const [isMobile, setIsMobile] = useState(detectMobileInput);

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
  const tools = useMemo(() => {
    if (!isMobile) return getToolKeys(toolProfile, { contextSymbols, functionNotationKeys });

    // Mobile equation pads are intentionally opinionated:
    // - parentheses are ALWAYS directly reachable;
    // - semantic duplicates such as the second '=' are removed;
    // - nth root is omitted from the crowded generic equation pad unless the
    //   question explicitly declares it as a required symbol;
    // - Backspace stays fixed in the final grid position.
    return buildMobileMathTools({
      toolProfile,
      entryKeys: MOBILE_ENTRY_KEYS,
      profileKeys: getToolKeys(toolProfile, { isMobile: true, contextSymbols, functionNotationKeys }),
      requiredTools,
      backspaceKey: MOBILE_BACKSPACE_KEY,
    });
  }, [toolProfile, isMobile, contextSymbols, functionNotationKeys, requiredTools]);

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

  useEffect(() => {
    const mathField = mfRef.current;
    if (!mathField) return undefined;

    mathField.mathVirtualKeyboardPolicy = 'manual';
    // Most math responses use MathMaster's controlled mobile keypad. Function
    // rules are different: students may legitimately need arbitrary names, so
    // keep the device keyboard there. Algebra operations now have an equation-
    // aware symbol strip, so they no longer need the full phone keyboard.
    if (shouldSuppressNativeKeyboard) mathField.setAttribute('inputmode', 'none');
    else mathField.removeAttribute('inputmode');
    mathField.menuItems = [];
    mathField.smartFence = true;
    mathField.smartSuperscript = true;
    mathField.placeholder = placeholder ? `\\text{${placeholder}}` : '';
    window.mathVirtualKeyboard?.hide?.();

    const handleInput = () => {
      onChangeRef.current(mathField.value);
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
      if (event.key === 'Enter' && onSubmit && !event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        onSubmit();
        return;
      }
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        event.stopPropagation();
        mathField.executeCommand?.('moveAfterParent');
        onChangeRef.current(mathField.value);
        stabilizeMobileViewport();
        return;
      }
      if (event.key === 'Escape') event.preventDefault();
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
    const handleFocus = () => stabilizeMobileViewport();

    mathField.addEventListener('input', handleInput);
    mathField.addEventListener('focus', handleFocus);
    mathField.addEventListener('keydown', preventUnusedModes, { capture: true });
    mathField.addEventListener('contextmenu', preventContextMenu);

    return () => {
      mathField.removeEventListener('input', handleInput);
      mathField.removeEventListener('focus', handleFocus);
      mathField.removeEventListener('keydown', preventUnusedModes, { capture: true });
      mathField.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [placeholder, isMobile, toolProfile, onSubmit, shouldSuppressNativeKeyboard, stabilizeMobileViewport]);

  useEffect(() => {
    if (mfRef.current && mfRef.current.value !== value) {
      mfRef.current.value = value || '';
      stabilizeMobileViewport();
    }
  }, [value, stabilizeMobileViewport]);

  // Some tools intentionally move the student's attention into a math field
  // immediately after they choose an action. A numeric signal avoids making
  // every MathInput autofocus on mount: only an explicit increment focuses it.
  useEffect(() => {
    if (!focusSignal || !mfRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => mfRef.current?.focus?.({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusSignal]);

  useEffect(() => {
    if (!collapseSignal) return;
    setShowTools(false);
  }, [collapseSignal]);

  const undo = useCallback(() => {
    const mathField = mfRef.current;
    if (!mathField) return;
    mathField.focus({ preventScroll: true });
    mathField.executeCommand?.('undo');
    onChangeRef.current(mathField.value);
    stabilizeMobileViewport();
  }, [stabilizeMobileViewport]);

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
      mathField.executeCommand?.(action);
      onChangeRef.current(mathField.value);
      stabilizeMobileViewport();
      return;
    }
    mathField.insert(command, {
      insertionMode: 'replaceSelection',
      selectionMode: /#0|#\?/.test(command) ? 'placeholder' : 'after',
    });
    onChangeRef.current(mathField.value);
    stabilizeMobileViewport();
  }, [stabilizeMobileViewport]);

  const borderColor = inputStatus === 'incorrect'
    ? '#d93025'
    : inputStatus === 'correct'
      ? '#188038'
      : '#1a73e8';

  return (
    <div
      className="mathmaster-math-input"
      style={{
        width: `min(100%, ${maxWidth}px)`,
        maxWidth: '100%',
        minWidth: 0,
        margin: '0 auto',
        overflowX: 'hidden',
        contain: 'inline-size',
      }}
    >
      <math-field
        ref={mfRef}
        aria-label={ariaLabel || placeholder || 'Math answer'}
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
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          minHeight: compact ? '44px' : '54px',
          fontSize: compact ? '20px' : '24px',
          padding: compact ? '8px 10px' : '12px 14px',
          borderRadius: '8px',
          border: `2px solid ${borderColor}`,
          background: inputStatus === 'incorrect' ? '#fff8f7' : inputStatus === 'correct' ? '#f4fbf5' : '#fff',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
        }}
      />

      {isMobile && requiredTools.length > 0 && (
        <div
          className="mathmaster-required-answer-keys"
          aria-label="Keys needed for this answer"
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
            border: '2px solid #8ab4f8',
            borderRadius: '10px',
            background: '#eef4ff',
          }}
        >
          <div style={{ gridColumn: '1 / -1', color: '#174ea6', fontSize: '12px', fontWeight: 900, textAlign: 'left' }}>Needed for this answer</div>
          {requiredTools.map((tool) => (
            <button
              type="button"
              key={`required-${tool.ariaLabel}`}
              aria-label={tool.ariaLabel}
              title={tool.ariaLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insert(tool.command, tool.action)}
              style={{
                minHeight: '48px',
                minWidth: 0,
                maxWidth: '100%',
                border: '2px solid #8ab4f8',
                borderRadius: '8px',
                background: '#fff',
                color: '#174ea6',
                fontSize: '21px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {tool.label}
            </button>
          ))}
        </div>
      )}

      {isMobile && unservedRequiredSymbols.length > 0 && (
        <div role="status" style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: '#fff4ce', color: '#7a4f00', fontSize: '12px', fontWeight: 700 }}>
          Additional symbol needed: {unservedRequiredSymbols.join(', ')}. Your device keyboard remains available.
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowTools((current) => !current)}
        aria-expanded={showTools}
        style={{
          marginTop: '8px',
          border: '1px solid #c5d5ef',
          borderRadius: '999px',
          padding: '7px 13px',
          background: showTools ? '#e8f0fe' : '#fff',
          color: '#174ea6',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        {showTools ? 'Hide math tools' : 'Show math tools'}
      </button>

      {showTools && (
        <div
          className={`mathmaster-math-input-tools mathmaster-math-input-tools-${toolProfile}`}
          aria-label="Math tools"
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
            border: '1px solid #d9e2f1',
            borderRadius: '10px',
            background: '#f8fbff',
          }}
        >
          {tools.map((tool) => (
            <button
              type="button"
              key={`${toolProfile}-${tool.ariaLabel}`}
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
                border: '1px solid #b8c8df',
                borderRadius: '7px',
                background: '#fff',
                color: '#202124',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
                ...(isMobile && tool.action === 'deleteBackward' ? {
                  gridColumn: '-2 / -1',
                  background: '#e8f0fe',
                  borderColor: '#8ab4f8',
                  color: '#174ea6',
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
