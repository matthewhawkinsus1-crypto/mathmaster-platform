import React, { useEffect, useState } from 'react';
import { CALCULATOR_MODES } from '../platform/policies/calculatorPolicy';
import { evaluateCalculatorExpression } from '../platform/policies/calculatorExpression';

export { evaluateCalculatorExpression } from '../platform/policies/calculatorExpression';

const baseButtons = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '^', '='];
const scientificButtons = ['sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'ln(', 'π'];

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

  useEffect(() => {
    setEstimate('');
    setEstimateUnlocked(!estimationRequired);
  }, [estimationRequired]);

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

  const handleCalculatorButton = (button) => {
    if (button === 'C') {
      setDisplay('0');
      return;
    }
    if (button === '=') {
      try {
        setDisplay(String(evaluateCalculatorExpression(display)));
      } catch {
        setDisplay('Error');
      }
      return;
    }
    setDisplay((current) => (current === '0' || current === 'Error' ? button : `${current}${button}`));
  };

  const advanced = [CALCULATOR_MODES.SCIENTIFIC, CALCULATOR_MODES.GRAPHING].includes(policy.mode);
  const buttons = advanced ? [...scientificButtons, ...baseButtons] : baseButtons;

  return (
    <div className="mathmaster-calculator-drawer" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 9000 }}>
      <button type="button" onClick={toggleDrawer} style={{ padding: '10px 16px', borderRadius: '24px', background: '#1a73e8', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        🧮 {policy.source === 'accommodation' ? 'Calculator (Support Plan)' : 'Calculator'}
      </button>
      {isOpen && (
        <div style={{ position: 'absolute', bottom: '50px', right: 0, width: '300px', background: '#fff', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid #dadce0', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#3c4043' }}>{String(policy.mode).toUpperCase()} CALCULATOR</span>
            <button type="button" aria-label="Close calculator" onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          </div>
          {!estimateUnlocked ? (
            <form onSubmit={handleEstimateSubmit} style={{ textAlign: 'left', fontSize: '13px' }}>
              <p style={{ margin: '0 0 8px', color: '#5f6368' }}><strong>Calculator literacy:</strong> Estimate first, then unlock the calculator.</p>
              <input type="number" step="any" aria-label="Estimate" value={estimate} onChange={(event) => setEstimate(event.target.value)} style={{ width: '100%', padding: '8px', marginBottom: '8px', boxSizing: 'border-box' }} />
              <button type="submit" style={{ width: '100%', padding: '8px', background: '#137333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Unlock Calculator</button>
            </form>
          ) : (
            <div>
              <input aria-label="Calculator expression" value={display} onChange={(event) => setDisplay(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: '#f1f3f4', padding: '12px', borderRadius: '6px', border: 0, textAlign: 'right', fontSize: '20px', fontFamily: 'monospace', marginBottom: '12px' }} />
              {policy.mode === CALCULATOR_MODES.GRAPHING && <p style={{ margin: '-3px 0 10px', color: '#5f6368', fontSize: '11px' }}>Graph construction stays in the MathMaster graph workspace; this drawer supplies numeric/scientific calculations.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {buttons.map((button) => (
                  <button key={button} type="button" onClick={() => handleCalculatorButton(button)} style={{ padding: '10px 5px', fontSize: button.length > 2 ? '12px' : '15px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #dadce0', background: button === '=' ? '#1a73e8' : button === 'C' ? '#fce8e6' : '#fff', color: button === '=' ? '#fff' : button === 'C' ? '#c5221f' : '#202124', cursor: 'pointer' }}>
                    {button}
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
