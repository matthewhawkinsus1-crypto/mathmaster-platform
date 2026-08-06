import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'mathlive';

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

const INTERVAL_KEYS = [
  { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
  { label: '[', command: '[', ariaLabel: 'Insert open bracket' },
  { label: ']', command: ']', ariaLabel: 'Insert close bracket' },
  { label: '−∞', command: '-\\infty', ariaLabel: 'Insert negative infinity' },
  { label: '∞', command: '\\infty', ariaLabel: 'Insert positive infinity' },
  { label: '∪', command: '\\cup', ariaLabel: 'Insert union' },
  { label: '∩', command: '\\cap', ariaLabel: 'Insert intersection' },
];

const INEQUALITY_KEYS = [
  { label: '<', command: '<', ariaLabel: 'Insert less than' },
  { label: '≤', command: '\\le', ariaLabel: 'Insert less than or equal to' },
  { label: '>', command: '>', ariaLabel: 'Insert greater than' },
  { label: '≥', command: '\\ge', ariaLabel: 'Insert greater than or equal to' },
  { label: '≠', command: '\\ne', ariaLabel: 'Insert not equal to' },
  { label: '−∞', command: '-\\infty', ariaLabel: 'Insert negative infinity' },
  { label: '∞', command: '\\infty', ariaLabel: 'Insert positive infinity' },
  { label: '∪', command: '\\cup', ariaLabel: 'Insert union' },
  { label: '∩', command: '\\cap', ariaLabel: 'Insert intersection' },
];

const getToolKeys = (profile) => {
  if (profile === 'interval') return INTERVAL_KEYS;
  if (profile === 'inequality') return INEQUALITY_KEYS;
  if (profile === 'set') return [...INEQUALITY_KEYS, ...INTERVAL_KEYS.filter((item) => ['(', ')', '[', ']'].includes(item.label))];
  if (profile === 'basic+set') return [...BASIC_KEYS, ...INEQUALITY_KEYS];
  return BASIC_KEYS;
};

export default function MathInput({
  value,
  onChange,
  placeholder = '',
  ariaLabel = '',
  showToolsInitially = false,
  toolProfile = 'basic',
  onUndoStateChange = null,
  inputStatus = 'neutral',
}) {
  const mfRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [showTools, setShowTools] = useState(showToolsInitially);
  const tools = useMemo(() => getToolKeys(toolProfile), [toolProfile]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const mathField = mfRef.current;
    if (!mathField) return undefined;

    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.menuItems = [];
    mathField.smartFence = true;
    mathField.smartSuperscript = true;
    mathField.placeholder = placeholder ? `\\text{${placeholder}}` : '';
    window.mathVirtualKeyboard?.hide?.();

    const handleInput = () => onChangeRef.current(mathField.value);
    const preventUnusedModes = (event) => {
      if (event.key === 'Escape') event.preventDefault();
      if (event.key === '\\') {
        event.preventDefault();
        mathField.insert('\\backslash', { selectionMode: 'after' });
      }
    };
    const preventContextMenu = (event) => event.preventDefault();

    mathField.addEventListener('input', handleInput);
    mathField.addEventListener('keydown', preventUnusedModes, { capture: true });
    mathField.addEventListener('contextmenu', preventContextMenu);

    return () => {
      mathField.removeEventListener('input', handleInput);
      mathField.removeEventListener('keydown', preventUnusedModes, { capture: true });
      mathField.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [placeholder]);

  useEffect(() => {
    if (mfRef.current && mfRef.current.value !== value) mfRef.current.value = value || '';
  }, [value]);

  const undo = useCallback(() => {
    const mathField = mfRef.current;
    if (!mathField) return;
    mathField.focus();
    mathField.executeCommand?.('undo');
    onChangeRef.current(mathField.value);
  }, []);

  useEffect(() => {
    onUndoStateChange?.({
      canUndo: Boolean(value),
      onUndo: undo,
      label: 'Undo last input edit',
    });
    return () => onUndoStateChange?.(null);
  }, [value, undo, onUndoStateChange]);

  const insert = useCallback((command) => {
    const mathField = mfRef.current;
    if (!mathField) return;
    mathField.focus();
    mathField.insert(command, {
      insertionMode: 'replaceSelection',
      selectionMode: /#0|#\?/.test(command) ? 'placeholder' : 'after',
    });
    onChangeRef.current(mathField.value);
  }, []);

  const borderColor = inputStatus === 'incorrect'
    ? '#d93025'
    : inputStatus === 'correct'
      ? '#188038'
      : '#1a73e8';

  return (
    <div style={{ width: 'min(100%, 540px)', margin: '0 auto' }}>
      <math-field
        ref={mfRef}
        aria-label={ariaLabel || placeholder || 'Math answer'}
        math-virtual-keyboard-policy="manual"
        style={{
          display: 'block',
          width: '100%',
          minHeight: '54px',
          fontSize: '24px',
          padding: '12px 14px',
          borderRadius: '8px',
          border: `2px solid ${borderColor}`,
          background: inputStatus === 'incorrect' ? '#fff8f7' : inputStatus === 'correct' ? '#f4fbf5' : '#fff',
          boxSizing: 'border-box',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
        }}
      />

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
          aria-label="Math tools"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(54px, 1fr))',
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
              onClick={() => insert(tool.command)}
              style={{
                minHeight: '44px',
                border: '1px solid #b8c8df',
                borderRadius: '7px',
                background: '#fff',
                color: '#202124',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
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
