import React, { useEffect, useRef, useState } from 'react';
// The outcome is drawn below the fix list (CheckRow), not inside the pill.
import { AttemptOutcome } from '../shared/ToolShell';
import MatrixGrid from '../../components/common/MatrixGrid.jsx';
import MathText from '../../components/common/MathText.jsx';
import { ResultPill } from '../shared/ToolShell';
import { SubmitText, useSubmitActionName } from '../shared/ToolRuntimeContext';
import { ChoiceMark, useChoiceGroup } from '../../platform/interaction/choiceGroup.js';

/*
 * The small pieces every Matrix Lab view shares: a matrix cell a student types
 * in, a matrix of those cells, the system of equations as a brace, the Check
 * button, and the verdict with the parts to reconsider.
 */

export const cellInputStyle = {
  // 64px, narrower on a phone under 360px wide (MatrixGrid.css): a 3×3 matrix
  // with its name was 7px wider than a 344px phone's box and scrolled inside it
  // for 7px (PH09, D-61).
  width: 'var(--mm-matrix-cell-width, calc(64 * var(--mm-px)))',
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
  background: enabled ? 'var(--mm-primary)' : 'var(--mm-surface-control)',
  color: enabled ? 'var(--mm-on-primary)' : 'var(--mm-text-muted)',
  cursor: enabled ? 'pointer' : 'default',
});

export const choiceStyle = (selected) => ({
  ...buttonStyle,
  background: selected ? 'var(--mm-primary)' : 'var(--mm-surface)',
  color: selected ? 'var(--mm-on-primary)' : 'var(--mm-text-strong)',
  border: selected ? '1px solid var(--mm-primary)' : buttonStyle.border,
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

/**
 * A matrix the student fills in, drawn with brackets like every other matrix.
 * `invalidCells` ("i,j" keys) are the cells the latest visible verdict marked
 * wrong (P2-5: A⁻¹ and a product are marked cell by cell).
 */
export function MatrixInput({ name, cells, onCell, rowLabels = null, colLabels = null, rowTitle = null, colTitle = null, onFocusCell, highlightRow = null, highlightCol = null, labelFor = null, showName = true, invalidCells = null }) {
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
        <CellInput value={value} label={label(i, j)} onChange={(next) => onCell(i, j, next)} onFocus={() => onFocusCell?.(i, j)} invalid={Boolean(invalidCells?.has?.(`${i},${j}`))} />
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
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.85em', height: '1.85em', borderRadius: '50%', background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', marginRight: 8, fontSize: 'calc(13 * var(--mm-px))', verticalAlign: 'middle' }}>{number}</span>
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

/**
 * A choice among a few buttons: one radio group (choiceGroup.js) — one tab
 * stop, arrows move and select — and the chosen one carries a ✓. `lead` is
 * words drawn before the buttons, inside the group ("The constants in B").
 */
export function ChoiceRadios({ label, options, value, onChange, lead = null, style = null }) {
  const ids = options.map(([id]) => id);
  const optionProps = useChoiceGroup({ ids, value, onSelect: onChange });
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...style }}>
      {lead}
      {options.map(([id, text], index) => (
        <button key={id} type="button" {...optionProps(index)} onClick={() => onChange(id)} style={choiceStyle(value === id)}>
          <ChoiceMark selected={value === id} />{text}
        </button>
      ))}
    </div>
  );
}

/** Yes / No as two buttons, the way the lab asks every judgment. */
export function YesNo({ value, onChange, label }) {
  return <ChoiceRadios label={label} options={[['yes', 'Yes'], ['no', 'No']]} value={value} onChange={onChange} />;
}

/**
 * Check, and what came back: a verdict and ONE list of what to fix
 * (matrixLabFixList: each line names a row, a cell or a field, and says why
 * when the reason is in the student's own work), then the platform's outcome
 * for the attempt.
 *
 * The order is the point (student pass 3, P2-1 and P2-3). The outcome box
 * ("Not quite. You have 2 tries left…") scrolls itself clear of the work bar
 * once per attempt, so it comes AFTER the list: the list is then on screen
 * too, where it used to sit under the bar. And the outcome is told not to
 * repeat the parts as "Focus on: …" — this list already names them, so the
 * student reads one list, not three.
 *
 * `blocker` is a format message shown before any try is spent: Check stays
 * off while a cell is not a number yet (a bare "−"), or while the work is the
 * matrix as it was given (P2-10). It describes only what the student typed,
 * so it is shown on an exit ticket too.
 *
 * `confirm` asks once before a Check that would spend a try on work the
 * student has not touched (an authored start left as given): the first press
 * shows it, a second press checks. Never a dead end — an item published with
 * a right start stays answerable.
 *
 * Nothing here renders while the activity withholds outcome feedback:
 * `feedback` is null there (useToolSubmission), so no line can reveal a key.
 */
// How long after the "check it as it is?" prompt a second press still counts
// as the same gesture.
const CONFIRM_SETTLE_MS = 400;

export function CheckRow({ label, onCheck, enabled, feedback, fixList = [], blocker = null, confirm = null }) {
  // The confirmation answered for this exact message; any edit that changes
  // or clears it asks again.
  const [confirmed, setConfirmed] = useState(null);
  useEffect(() => { if (!confirm) setConfirmed(null); }, [confirm]);
  const asking = Boolean(confirm) && confirmed === confirm;
  // A double-click or double-tap is one gesture: its second press must not
  // answer a prompt the student has not read yet. A timestamp, not a timer —
  // Check never goes dead.
  const askedAt = useRef(0);
  const press = () => {
    // `confirm` may be a function of the button's name (UNTOUCHED_START):
    // stored as itself, never called as a state updater.
    if (confirm && !asking) { askedAt.current = Date.now(); setConfirmed(() => confirm); return; }
    if (asking && Date.now() - askedAt.current < CONFIRM_SETTLE_MS) return;
    setConfirmed(null);
    onCheck();
  };
  // What the prompt calls this button: the button's own first word (D9).
  const actionName = useSubmitActionName('Check');
  const lines = feedback && !feedback.isCorrect ? fixList : [];
  const lineText = (line) => line.text || `Reconsider: ${line.labels.join(', ')}`.replace(/([^.?!])$/, '$1.');
  const verdict = feedback ? (feedback.isCorrect ? 'Correct' : 'Not yet — see what to fix') : null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button data-primary-answer-action="true" data-mm-enter-action="submit" type="button" onClick={press} disabled={!enabled} style={primaryStyle(enabled)}><SubmitText>{label}</SubmitText></button>
        {/* stageCheck: the outcome is drawn below the list, not inside the pill. */}
        {feedback ? <ResultPill ok={feedback.isCorrect} stageCheck>{verdict}</ResultPill> : null}
      </div>
      {asking ? (
        <p role="status" data-matrix-confirm-message="" style={{ margin: '10px 0 0', color: 'var(--mm-text)', lineHeight: 1.5 }}>{typeof confirm === 'function' ? confirm(actionName) : confirm}</p>
      ) : null}
      {blocker ? (
        <p role="status" data-matrix-format-message="" style={{ margin: '10px 0 0', color: 'var(--mm-text)', lineHeight: 1.5 }}>{blocker}</p>
      ) : null}
      {lines.length ? (
        <ul data-matrix-fix-list="" style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--mm-text)', lineHeight: 1.55, textAlign: 'left' }}>
          {lines.slice(0, 8).map((line) => (
            <li key={line.ids.join('|')}>
              {line.text ? <MathText>{line.text}</MathText> : <>Reconsider: <strong>{line.labels.join(', ')}</strong></>}
            </li>
          ))}
          {lines.length > 8 ? <li>…and {lines.length - 8} more</li> : null}
        </ul>
      ) : null}
      {feedback ? <AttemptOutcome showDetail={false} verdict={verdict} coaching={lines.map(lineText).join(' ') || null} /> : null}
    </div>
  );
}

/** Resize a 2-D cell array to height × width, keeping what fits. */
export const resizeCells = (cells, height, width, fill = '') => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => (Array.isArray(cells?.[i]) && cells[i][j] !== undefined ? cells[i][j] : fill)));

export const setCell = (cells, i, j, value) => cells.map((row, r) => (r === i ? row.map((cell, c) => (c === j ? value : cell)) : row));
