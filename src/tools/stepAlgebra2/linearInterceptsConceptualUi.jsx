import React from 'react';
import { formatStandardEquation } from './linearInterceptsMath.js';

// The zero-substitution stage shared by the legacy stepAlgebra2 compatibility
// shell (LinearIntercepts.jsx) and the consolidated LinearInterceptsOrchestrator
// (src/LinearInterceptsOrchestrator.jsx). Kept in one place so "choose which
// variable is zero, then drag/tap the 0 onto that variable" behaves and looks
// identical everywhere it appears, per issue #297.

export function VariableDropTarget({ variable, coefficient, placed, armed, disabled, onPlace }) {
  const magnitude = Math.abs(Number(coefficient));
  if (!Number.isFinite(magnitude) || magnitude <= 1e-12) return null;
  const coefficientLabel = magnitude === 1 ? '' : String(magnitude);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <span>{coefficientLabel}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${variable} variable substitution target`}
        onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          if (event.dataTransfer?.getData('text/plain') === 'mathmaster-zero-token') onPlace(variable);
        }}
        onClick={() => { if (!disabled && armed) onPlace(variable); }}
        onKeyDown={(event) => {
          if (disabled || !armed) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onPlace(variable);
          }
        }}
        style={{
          minWidth: 44,
          minHeight: 44,
          padding: '5px 8px',
          border: placed ? '2px solid #174ea6' : armed ? '2px dashed #7698cf' : '1px solid transparent',
          borderRadius: 8,
          background: placed ? '#e8f0fe' : armed ? '#f7faff' : 'transparent',
          color: '#172033',
          font: 'inherit',
          fontWeight: 900,
          cursor: disabled ? 'default' : armed ? 'copy' : 'default',
        }}
      >
        {placed ? '(0)' : variable}
      </button>
    </span>
  );
}

export function InteractiveStandardEquation({ standard, placedVariable, zeroArmed, disabled, onPlace }) {
  const A = Number(standard.A);
  const B = Number(standard.B);
  const firstNegative = A < 0;
  const bNegative = B < 0;
  return (
    <div
      aria-label={`Equation ${formatStandardEquation(standard)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        flexWrap: 'wrap',
        minHeight: 78,
        padding: '14px 10px',
        borderRadius: 12,
        border: '2px solid #d9e2f1',
        background: '#fff',
        color: '#172033',
        fontSize: 28,
        fontWeight: 850,
      }}
    >
      {Math.abs(A) > 1e-12 && firstNegative ? <span>−</span> : null}
      <VariableDropTarget
        variable="x"
        coefficient={A}
        placed={placedVariable === 'x'}
        armed={zeroArmed}
        disabled={disabled}
        onPlace={onPlace}
      />
      {Math.abs(B) > 1e-12 ? <span>{bNegative ? '−' : '+'}</span> : null}
      <VariableDropTarget
        variable="y"
        coefficient={B}
        placed={placedVariable === 'y'}
        armed={zeroArmed}
        disabled={disabled}
        onPlace={onPlace}
      />
      <span>=</span>
      <span>{standard.C}</span>
    </div>
  );
}
