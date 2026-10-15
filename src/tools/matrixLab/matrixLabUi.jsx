import React from 'react';
import MatrixGrid from '../../components/common/MatrixGrid.jsx';
import MathText from '../../components/common/MathText.jsx';
import { ResultPill } from '../shared/ToolShell';

/*
 * The small pieces every Matrix Lab view shares: a matrix cell a student types
 * in, a matrix of those cells, the system of equations as a brace, the Check
 * button, and the verdict with the parts to reconsider.
 */

export const cellInputStyle = {
  width: 'calc(64 * var(--mm-px))',
  minWidth: 52,
  maxWidth: 96,
  minHeight: 44,
  padding: '6px 4px',
  border: '1.5px solid var(--mm-tint-border)',
  borderRadius: 8,
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  textAlign: 'center',
  fontSize: 'calc(18 * var(--mm-px))',
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
};

export const buttonStyle = {
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 9,
  border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 'calc(15 * var(--mm-px))',
};

export const primaryStyle = (enabled = true) => ({
  ...buttonStyle,
  border: 0,
  background: enabled ? '#1a73e8' : 'var(--mm-surface-control)',
  color: enabled ? '#fff' : 'var(--mm-text-muted)',
  cursor: enabled ? 'pointer' : 'default',
});

export const choiceStyle = (selected) => ({
  ...buttonStyle,
  background: selected ? '#1a73e8' : 'var(--mm-surface)',
  color: selected ? '#fff' : 'var(--mm-text-strong)',
  border: selected ? '1px solid #1a73e8' : buttonStyle.border,
});

/**
 * One typed cell. A text keyboard, not inputMode="decimal": the iPhone decimal
 * pad has no minus sign and no slash, and matrices are full of both.
 */
export function CellInput({ value, onChange, label, onFocus, style = null, invalid = false }) {
  return (
    <input
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      aria-label={label}
      aria-invalid={invalid || undefined}
      style={{ ...cellInputStyle, ...(invalid ? { borderColor: 'var(--mm-error-border)' } : null), ...style }}
    />
  );
}

/** A matrix the student fills in, drawn with brackets like every other matrix. */
export function MatrixInput({ name, cells, onCell, rowLabels = null, colLabels = null, rowTitle = null, colTitle = null, onFocusCell, highlightRow = null, highlightCol = null, labelFor = null, showName = true }) {
  const label = labelFor || ((i, j) => `${name ? `Matrix ${name}, ` : ''}row ${i + 1}, column ${j + 1}`);
  return (
    <MatrixGrid
      name={name}
      showName={showName}
      rows={cells}
      rowLabels={rowLabels}
      colLabels={colLabels}
      rowTitle={rowTitle}
      colTitle={colTitle}
      highlightRow={highlightRow}
      highlightCol={highlightCol}
      cellMinWidth={56}
      renderCell={(i, j, value) => (
        <CellInput value={value} label={label(i, j)} onChange={(next) => onCell(i, j, next)} onFocus={() => onFocusCell?.(i, j)} />
      )}
    />
  );
}

/** The system as a brace, one equation per line. */
export function SystemDisplay({ equations = [], label = 'The system' }) {
  if (!equations.length) return null;
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', alignItems: 'stretch', gap: 8, margin: '4px 0' }}>
      <div aria-hidden="true" style={{ width: 10, border: '2.5px solid var(--mm-text-strong)', borderRight: 'none', borderRadius: '10px 0 0 10px' }} />
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {equations.map((equation, index) => (
          <li key={index} style={{ fontSize: 'calc(19 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>
            <MathText>{`$${equation}$`}</MathText>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "x", "y", "z" as the variable matrix X. */
export function VariableMatrix({ variables }) {
  return (
    <MatrixGrid
      name="X"
      showName={false}
      rows={variables.map((variable) => [variable])}
      cellMinWidth={36}
      ariaLabel={`Variable matrix X: ${variables.join(', ')}`}
      renderCell={(i, _j, variable) => <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: 'calc(21 * var(--mm-px))' }}>{variable}</span>}
    />
  );
}

export function Symbol({ children }) {
  // A multiplication dot drawn at the size of the other symbols: the text "·"
  // at 26px is a speck beside two bracketed matrices.
  const dot = children === '·';
  return <span aria-hidden="true" style={{ fontSize: dot ? 'calc(40 * var(--mm-px))' : 'calc(26 * var(--mm-px))', lineHeight: 1, fontWeight: 900, color: 'var(--mm-text-strong)', padding: '0 2px' }}>{children}</span>;
}

/** A labelled step: the lab's work is a short sequence, numbered as the student goes. */
export function Step({ number, title, children, note = null }) {
  return (
    <section aria-label={`Step ${number}: ${title}`} style={{ border: '1px solid var(--mm-tint-border)', borderRadius: 12, padding: '12px 14px', marginTop: 12, background: 'var(--mm-surface)' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-primary-text)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.85em', height: '1.85em', borderRadius: '50%', background: '#1a73e8', color: '#fff', marginRight: 8, fontSize: 'calc(13 * var(--mm-px))', verticalAlign: 'middle' }}>{number}</span>
        {title}
      </h3>
      {note ? <p style={{ margin: '0 0 10px', color: 'var(--mm-text-muted)', fontSize: 'calc(14 * var(--mm-px))', lineHeight: 1.45 }}>{note}</p> : null}
      {children}
    </section>
  );
}

/** Two dimension boxes: "__ × __". */
export function DimensionsInput({ value = {}, onChange, label }) {
  return (
    <span role="group" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <CellInput value={value.rows} label={`${label}: number of rows`} onChange={(rows) => onChange({ ...value, rows })} style={{ width: 56 }} />
      <span aria-hidden="true" style={{ fontWeight: 800, fontSize: 'calc(18 * var(--mm-px))' }}>×</span>
      <CellInput value={value.cols} label={`${label}: number of columns`} onChange={(cols) => onChange({ ...value, cols })} style={{ width: 56 }} />
    </span>
  );
}

/** Yes / No as two buttons, the way the lab asks every judgment. */
export function YesNo({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[['yes', 'Yes'], ['no', 'No']].map(([id, text]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)} style={choiceStyle(value === id)}>{text}</button>
      ))}
    </div>
  );
}

/**
 * Check, and what came back: a verdict, and — when wrong — which parts to
 * reconsider, named but never answered. `notes` are lesson-specific reasons
 * ({ partId, text }: a row copied before moving terms) the view already worked
 * out; a part with a note is not listed a second time.
 */
export function CheckRow({ label, onCheck, enabled, feedback, notes = [] }) {
  const explained = new Set(notes.map((note) => note.partId));
  const wrong = (feedback?.metadata?.parts || []).filter((part) => !part.isCorrect && !explained.has(part.id));
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button data-primary-answer-action="true" data-mm-enter-action="submit" type="button" onClick={onCheck} disabled={!enabled} style={primaryStyle(enabled)}>{label}</button>
        {feedback ? <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet — see what to reconsider'}</ResultPill> : null}
      </div>
      {feedback && !feedback.isCorrect && (wrong.length || notes.length) ? (
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--mm-text)', lineHeight: 1.55, textAlign: 'left' }}>
          {notes.map((note) => <li key={`n-${note.partId}`}><MathText>{note.text}</MathText></li>)}
          {wrong.slice(0, 8).map((part) => <li key={part.id}>Reconsider: <strong>{part.label}</strong></li>)}
          {wrong.length > 8 ? <li>…and {wrong.length - 8} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Resize a 2-D cell array to height × width, keeping what fits. */
export const resizeCells = (cells, height, width, fill = '') => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => (Array.isArray(cells?.[i]) && cells[i][j] !== undefined ? cells[i][j] : fill)));

export const setCell = (cells, i, j, value) => cells.map((row, r) => (r === i ? row.map((cell, c) => (c === j ? value : cell)) : row));
