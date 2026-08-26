import React, { useCallback, useEffect, useRef, useState } from 'react';
import 'mathlive';
import { getCalculatorButtonsForMode, getCalculatorModeLabel } from '../platform/policies/calculatorPolicy';
import { evaluateCalculatorExpression } from '../platform/policies/calculatorExpression';
import { clampCalculatorPosition } from './calculatorPanelGeometry.js';

export { evaluateCalculatorExpression } from '../platform/policies/calculatorExpression';

const buttonSpec = (raw) => {
  const value = String(raw ?? '');
  if (value === 'C') return { label: 'C', action: 'clear' };
  if (value === '=') return { label: '=', action: 'equals' };
  if (value === '÷') return { label: '÷', command: '\\div' };
  if (value === '×') return { label: '×', command: '\\times' };
  if (value === '^') return { label: 'xʸ', command: '#@^{#?}' };
  if (value === 'sin(') return { label: 'sin', command: '\\sin\\left(#0\\right)' };
  if (value === 'cos(') return { label: 'cos', command: '\\cos\\left(#0\\right)' };
  if (value === 'tan(') return { label: 'tan', command: '\\tan\\left(#0\\right)' };
  if (value === 'sqrt(' || value === '√(') return { label: '√', command: '\\sqrt{#0}' };
  if (value === 'log(') return { label: 'log', command: '\\log\\left(#0\\right)' };
  if (value === 'ln(') return { label: 'ln', command: '\\ln\\left(#0\\right)' };
  if (value === 'π') return { label: 'π', command: '\\pi' };
  return { label: value === '-' ? '−' : value, command: value };
};

const calculatorButtonsForPolicy = (mode) => {
  const specs = getCalculatorButtonsForMode(mode).map(buttonSpec);
  const equalsIndex = specs.findIndex((button) => button.action === 'equals');
  const fraction = { label: 'a⁄b', command: '\\frac{#0}{#?}' };
  if (equalsIndex >= 0) specs.splice(equalsIndex, 0, fraction);
  else specs.push(fraction);
  return specs;
};

const expressionFromMathField = (mathField, fallback = '') => {
  try {
    const ascii = mathField?.getValue?.('ascii-math');
    if (String(ascii ?? '').trim()) return String(ascii).trim();
  } catch {
    // Fall through to the visible value if this MathLive build cannot emit ASCIIMath.
  }
  return String(fallback ?? '').trim();
};

export const CalculatorPanel = ({
  policy,
  onCalculatorOpened,
  estimationRequired = false,
  onEstimationComplete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [estimate, setEstimate] = useState('');
  const [estimateUnlocked, setEstimateUnlocked] = useState(!estimationRequired);
  const [display, setDisplay] = useState('0');
  const [panelPosition, setPanelPosition] = useState(null);
  const mathFieldRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    setEstimate('');
    setEstimateUnlocked(!estimationRequired);
  }, [estimationRequired]);

  useEffect(() => {
    const mathField = mathFieldRef.current;
    if (!mathField || !isOpen || !estimateUnlocked) return undefined;
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.setAttribute('inputmode', 'none');
    mathField.menuItems = [];
    mathField.smartFence = true;
    mathField.smartSuperscript = true;
    if (mathField.value !== display) mathField.value = display;
    window.mathVirtualKeyboard?.hide?.();

    const handleInput = () => setDisplay(mathField.value || '0');
    const preventContextMenu = (event) => event.preventDefault();
    mathField.addEventListener('input', handleInput);
    mathField.addEventListener('contextmenu', preventContextMenu);
    return () => {
      mathField.removeEventListener('input', handleInput);
      mathField.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [isOpen, estimateUnlocked, display]);

  useEffect(() => {
    const mathField = mathFieldRef.current;
    if (mathField && mathField.value !== display) mathField.value = display;
  }, [display]);

  useEffect(() => {
    if (!isOpen || !panelPosition) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      setPanelPosition((current) => (current ? clampCalculatorPosition({
        x: current.x,
        y: current.y,
        panelWidth: rect.width,
        panelHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }) : current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, panelPosition]);

  useEffect(() => {
    const handleResize = () => {
      setPanelPosition((current) => {
        const panel = panelRef.current;
        if (!current || !panel) return current;
        const rect = panel.getBoundingClientRect();
        return clampCalculatorPosition({
          x: current.x,
          y: current.y,
          panelWidth: rect.width,
          panelHeight: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        });
      });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  if (!policy?.available) return null;

  const toggleDrawer = () => {
    if (!isOpen) onCalculatorOpened?.();
    setIsOpen((current) => !current);
  };

  const handleEstimateSubmit = (event) => {
    event.preventDefault();
    const value = Number(estimate);
    if (!estimate.trim() || !Number.isFinite(value)) return;
    setEstimateUnlocked(true);
    onEstimationComplete?.(value);
  };

  const setCalculatorValue = useCallback((value) => {
    const next = String(value ?? '0');
    setDisplay(next);
    if (mathFieldRef.current) mathFieldRef.current.value = next;
  }, []);

  const insertCalculatorCommand = useCallback((command) => {
    const mathField = mathFieldRef.current;
    if (!mathField || !command) return;
    mathField.focus();
    if (display === '0' || display === 'Error') {
      mathField.value = '';
      setDisplay('');
    }
    mathField.insert(command, {
      insertionMode: 'replaceSelection',
      selectionMode: /#0|#\?/.test(command) ? 'placeholder' : 'after',
    });
    setDisplay(mathField.value || '0');
  }, [display]);

  const handleCalculatorButton = useCallback((button) => {
    if (button.action === 'clear') {
      setCalculatorValue('0');
      return;
    }
    if (button.action === 'equals') {
      try {
        const expression = expressionFromMathField(mathFieldRef.current, display);
        setCalculatorValue(String(evaluateCalculatorExpression(expression, policy.mode)));
      } catch {
        setCalculatorValue('Error');
      }
      return;
    }
    insertCalculatorCommand(button.command);
  }, [display, insertCalculatorCommand, policy.mode, setCalculatorValue]);

  const startDrag = (event) => {
    if (event.target?.closest?.('button')) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      panelWidth: rect.width,
      panelHeight: rect.height,
    };
    setPanelPosition({ x: rect.left, y: rect.top });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPanelPosition(clampCalculatorPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
      panelWidth: drag.panelWidth,
      panelHeight: drag.panelHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
    event.preventDefault();
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const buttons = calculatorButtonsForPolicy(policy.mode);
  const panelStyle = panelPosition
    ? { left: panelPosition.x, top: panelPosition.y }
    : { right: 8, bottom: 70 };

  return (
    <div className={`mathmaster-calculator-drawer ${isOpen ? 'is-open' : ''}`} style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9000 }}>
      <button className="mathmaster-calculator-toggle" type="button" onClick={toggleDrawer} style={{ padding: '10px 16px', borderRadius: '24px', background: '#1a73e8', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        🧮 {policy.source === 'accommodation' ? 'Calculator (Support Plan)' : 'Calculator'}
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          className="mathmaster-calculator-panel"
          style={{
            position: 'fixed',
            width: 'min(320px, calc(100vw - 16px))',
            maxHeight: 'calc(100vh - 88px)',
            overflowY: 'auto',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            border: '1px solid #dadce0',
            padding: '16px',
            boxSizing: 'border-box',
            zIndex: 9001,
            ...panelStyle,
          }}
        >
          <div
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ display: 'flex', justifyContent: 'space-between', margin: '-6px -4px 12px', padding: '6px 4px', alignItems: 'center', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
            title="Drag calculator"
          >
            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#3c4043' }}>↕ {getCalculatorModeLabel(policy.mode)} CALCULATOR</span>
            <button type="button" aria-label="Close calculator" onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', minWidth: 34, minHeight: 34 }}>✕</button>
          </div>
          {!estimateUnlocked ? (
            <form onSubmit={handleEstimateSubmit} style={{ textAlign: 'left', fontSize: '13px' }}>
              <p style={{ margin: '0 0 8px', color: '#5f6368' }}><strong>Calculator literacy:</strong> Estimate first, then unlock the calculator.</p>
              <input type="number" step="any" aria-label="Estimate" value={estimate} onChange={(event) => setEstimate(event.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '8px', boxSizing: 'border-box' }} />
              <button type="submit" style={{ width: '100%', padding: '8px', background: '#137333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Unlock Calculator</button>
            </form>
          ) : (
            <div>
              <math-field
                ref={mathFieldRef}
                aria-label="Calculator expression"
                math-virtual-keyboard-policy="manual"
                inputmode="none"
                style={{ display: 'block', width: '100%', minHeight: '58px', boxSizing: 'border-box', background: '#f1f3f4', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dadce0', textAlign: 'right', fontSize: '24px', marginBottom: '12px' }}
              />
              {policy.mode === 'graphing' && <p style={{ margin: '-3px 0 10px', color: '#5f6368', fontSize: '11px' }}>Graph construction stays in the MathMaster graph workspace; this drawer supplies numeric/scientific calculations.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {buttons.map((button) => (
                  <button
                    key={`${button.label}-${button.action || button.command}`}
                    type="button"
                    onClick={() => handleCalculatorButton(button)}
                    style={{
                      padding: '10px 5px',
                      minHeight: '42px',
                      fontSize: button.label.length > 3 ? '12px' : '15px',
                      fontWeight: 'bold',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      background: button.action === 'equals' ? '#1a73e8' : button.action === 'clear' ? '#fce8e6' : '#fff',
                      color: button.action === 'equals' ? '#fff' : button.action === 'clear' ? '#c5221f' : '#202124',
                      cursor: 'pointer',
                    }}
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CalculatorPanel;
