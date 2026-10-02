import React from 'react';
import MathDisplay from '../../../MathDisplay.jsx';
import MathInput from '../../../MathInput.jsx';

/*
 * THE SMALL PIECES PROCESS MODE IS BUILT FROM.
 *
 * Process Mode is an extension of the Multiple Representations board, not a
 * second application, so it speaks the board's visual language: the same
 * 44px touch targets, the same theme tokens (dark mode follows), the same
 * quiet status colours. Nothing here holds state.
 */

export const touchButton = {
  minHeight: 44,
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid #b8c7de',
  background: 'var(--mm-surface, #fff)',
  color: '#172033',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
};

export const primaryButton = {
  ...touchButton,
  background: 'var(--mm-primary)',
  color: 'var(--mm-on-primary)',
  border: '1px solid var(--mm-primary)',
};

export const quietButton = {
  ...touchButton,
  background: 'transparent',
  border: '1px solid transparent',
  color: '#174ea6',
  padding: '8px 10px',
};

export const muted = { fontSize: 13, color: '#5f6b7a', margin: 0, lineHeight: 1.45 };
export const errorText = { margin: 0, fontSize: 14, color: '#b3261e', fontWeight: 600, lineHeight: 1.4 };
export const successText = { margin: 0, fontSize: 14, color: '#137333', fontWeight: 700, lineHeight: 1.4 };
export const neutralText = { margin: 0, fontSize: 14, color: '#174ea6', fontWeight: 600, lineHeight: 1.4 };

/** A choice among a few options: radio semantics, chip looks, 44px targets. */
export function ChoiceChips({ label, options, value, onChange, disabled = false, name }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-process-choice={`${name || 'choice'}:${option.value}`}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            style={{
              ...touchButton,
              padding: '8px 12px',
              fontSize: 14,
              fontWeight: selected ? 800 : 700,
              border: selected ? '2px solid #174ea6' : '1px solid #b8c7de',
              background: selected ? '#e8f0fe' : 'var(--mm-surface, #fff)',
              color: selected ? '#123c8c' : '#24324a',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** One labelled answer box of a process: "m =", "Run", "(x₁, y₁) =". */
export function ProcessField({ field, label, labelLatex = null, value, onChange, profile = 'number', placeholder = '', status = 'neutral', disabled = false, width = 150 }) {
  return (
    // A field keeps room for what a student types (a fraction, a pair): in a
    // narrow row it wraps to its own line rather than shrinking.
    <label data-process-field={field} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '0 1 auto', maxWidth: '100%' }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: '#24324a', whiteSpace: 'nowrap' }}>
        {labelLatex ? <MathDisplay value={labelLatex} inline /> : label}
      </span>
      <span style={{ flex: `1 1 ${Math.max(width, 130)}px`, width: Math.max(width, 130) + 40, minWidth: 'min(130px, 100%)', maxWidth: 260 }}>
        <MathInput
          toolProfile={profile}
          placeholder={placeholder}
          ariaLabel={typeof label === 'string' ? label : field}
          value={value ?? ''}
          compact
          inputStatus={status}
          onChange={onChange}
          onSubmit={null}
          hideToolsToggle={disabled}
        />
      </span>
    </label>
  );
}

/** The quiet line under a process: what is wrong, what was saved, what is next. */
export function ProcessMessage({ tone = 'error', children }) {
  if (!children) return null;
  const style = tone === 'success' ? successText : tone === 'neutral' ? neutralText : errorText;
  return <p role="status" style={style}>{children}</p>;
}

/** A point written as a student writes it. */
export const pointLatex = (point) => (Array.isArray(point) ? `(${point.map((value) => fractionText(value)).join(', ')})` : '');

const fractionText = (value) => {
  if (value && typeof value === 'object' && Number.isFinite(value.n)) {
    const n = value.n === 0 ? 0 : value.n;
    if (value.d === 1) return String(n);
    return `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${value.d}}`;
  }
  return String(value ?? '');
};

/** A small inline LaTeX value. */
export function Latex({ value, label = null }) {
  return <MathDisplay value={value} inline ariaLabel={label || undefined} />;
}
