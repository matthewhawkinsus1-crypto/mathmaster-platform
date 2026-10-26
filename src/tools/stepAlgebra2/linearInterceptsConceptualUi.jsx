import React from 'react';
import { formatStandardEquation } from './linearInterceptsMath.js';
import { spokenMathValue } from '../shared/spokenMathValue.js';
import { ChoiceMark, useChoiceGroup } from '../../platform/interaction/choiceGroup.js';

// The zero-substitution stage shared by the legacy stepAlgebra2 compatibility
// shell (LinearIntercepts.jsx) and the consolidated LinearInterceptsOrchestrator
// (src/LinearInterceptsOrchestrator.jsx). Kept in one place so "choose which
// variable is zero, then drag/tap the 0 onto that variable" behaves and looks
// identical everywhere it appears, per issue #297.

// What is said beside the 0 token, in both shells (AX32). The token is a button
// and so is each variable: Enter on the 0 picks it up, and Enter on a variable
// puts it there (VariableDropTarget below), the same two steps as a tap.
export const ZERO_TOKEN_DIRECTIONS = 'Drag the 0 onto x or y. Or select the 0 and then the variable (click or tap, or Tab to each one and press Enter).';

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
          background: placed ? 'var(--mm-primary-soft)' : armed ? 'var(--mm-surface-tint)' : 'transparent',
          color: 'var(--mm-text-strong)',
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
      // A group named by the equation in words. Not role="img": that hides its
      // descendants, and the two substitution targets inside are the step's
      // only controls (pass 3 review).
      role="group"
      aria-label={`Equation ${spokenMathValue(formatStandardEquation(standard))}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        flexWrap: 'wrap',
        minHeight: 78,
        padding: '14px 10px',
        borderRadius: 12,
        border: '2px solid var(--mm-tint-border)',
        background: 'var(--mm-surface)',
        color: 'var(--mm-text-strong)',
        fontSize: 'calc(28 * var(--mm-px))',
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

/**
 * "At the x-intercept, which variable equals 0?": x = 0 or y = 0, one radio
 * group (choiceGroup.js) — one tab stop, arrows move and select — with a ✓ on
 * the chosen one. Choosing is not checking: nothing here spends a try.
 */
export function ZeroVariableChoice({ label, value, disabled = false, onSelect, buttonStyle }) {
  const variables = ['x', 'y'];
  const optionProps = useChoiceGroup({ ids: variables, value, onSelect, disabled });
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      {variables.map((variable, index) => (
        <button
          key={variable}
          type="button"
          {...optionProps(index)}
          disabled={disabled}
          onClick={() => onSelect(variable)}
          style={{
            ...buttonStyle,
            border: value === variable ? '2px solid #174ea6' : buttonStyle?.border,
            background: value === variable ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
          }}
        >
          <ChoiceMark selected={value === variable} />
          {variable} = 0
        </button>
      ))}
    </div>
  );
}
