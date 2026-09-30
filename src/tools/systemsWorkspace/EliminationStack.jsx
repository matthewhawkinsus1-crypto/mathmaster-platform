/*
 * ONE ELIMINATION BOARD FOR EVERY SYSTEM SIZE.
 *
 *        Eq. 1      2x  −  y  + 2z  =  15
 *     +  Eq. 2     −x  +  y  +  z  =   3
 *                 ───────────────────────
 *        R₁          x        + 3z  =  18
 *
 * The pieces of a stacked, column-aligned elimination: the equation rows, the
 * scale editor and term-by-term distribution that open under a row, the
 * + / − rail beside the second row, and the entry line under the rule where
 * the student writes what remains. The 3×3 pair rounds
 * (EliminationReductionMode) and every 2×2 elimination (AlgebraicSystemMode,
 * standalone and as the reduced 2×2 inside a 3×3) are drawn from these same
 * components, so a student meets one elimination interface on the whole
 * platform. Before this module the 2×2 had its own side-by-side "Prepare the
 * equations" cards, a drag-the-factor chip, a separate "Complete the scaled
 * equation" grid and a Confirm press, and it changed under the student
 * halfway through a 3×3 problem.
 *
 * Presentation only: every component here renders what it is given and
 * reports what the student typed or pressed. Neither the scaled nor the
 * combined equation is ever computed here.
 */
import React from 'react';
import MathInput from '../../MathInput';
import { exactNumberText } from './algebraicSystemsEngine.js';

const actionStyle = { marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44 };
export const eliminationSecondaryButtonStyle = { ...actionStyle, marginTop: 0, padding: '9px 14px', fontSize: 13, background: '#eef4ff', color: '#174ea6' };
export const eliminationSmallActionStyle = { ...actionStyle, marginTop: 8, padding: '9px 14px', fontSize: 13 };

const MINUS = '−';

/** One signed column entry: "2x", "− y", "+ 2z"; blank for a zero coefficient. */
export const columnTermText = (coefficient, variable, leading) => {
  const value = Number(coefficient);
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return '';
  const magnitude = Math.abs(value);
  const digits = Math.abs(magnitude - 1) < 1e-9 ? '' : exactNumberText(magnitude);
  const body = `${digits}${variable}`;
  if (leading) return value < 0 ? `${MINUS}${body}` : body;
  return `${value < 0 ? MINUS : '+'} ${body}`;
};

export const constantText = (value) => {
  const text = exactNumberText(value);
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
};

/** "· 2", never "× 2": beside a column of x terms the times sign reads as another x. */
export const scaleBadgeText = (factor) => `· ${String(factor).trim().replace(/^-/, MINUS)}`;

/** Whether each column is the first non-zero term of its row (no leading "+"). */
const leadingFlags = (form, variables) => {
  let seen = false;
  return variables.map((name) => {
    const nonzero = Math.abs(Number(form?.coefficients?.[name] || 0)) > 1e-9;
    const leading = nonzero && !seen;
    if (nonzero) seen = true;
    return leading;
  });
};

/** One equation of the stack, one column per variable. The target term is a button while cancellation is open. */
export function EliminationStackRow({
  variables,
  target,
  form,
  label,
  badge = null,
  opCell = null,
  cancelled = false,
  onToggleCancel = null,
  labelAction = null,
  rowId,
}) {
  const leading = leadingFlags(form, variables);
  const allZero = form && variables.every((name) => Math.abs(Number(form?.coefficients?.[name] || 0)) < 1e-9);
  return (
    <div className="mathmaster-elim-row" data-row-id={rowId}>
      <div className="mathmaster-elim-op">{opCell}</div>
      <div className="mathmaster-elim-label">
        <span>{label}</span>
        {badge ? <span className="mathmaster-elim-badge">{badge}</span> : null}
        {labelAction}
      </div>
      {variables.map((name, index) => {
        const text = allZero && index === variables.length - 1 ? '0' : columnTermText(form?.coefficients?.[name], name, leading[index]);
        const isTarget = name === target;
        if (isTarget && onToggleCancel && text) {
          return (
            <button
              key={name}
              type="button"
              className={`mathmaster-elim-term is-target is-markable${cancelled ? ' is-cancelled' : ''}`}
              onClick={onToggleCancel}
              aria-pressed={cancelled}
              aria-label={`${cancelled ? 'Unmark' : 'Mark'} the ${name} term ${text.replace(/\s+/g, '')} in ${label} as cancelling`}
            >
              {text}
            </button>
          );
        }
        return (
          <span key={name} className={`mathmaster-elim-term${isTarget ? ' is-target' : ''}${isTarget && cancelled ? ' is-cancelled' : ''}`}>
            {text}
          </span>
        );
      })}
      <span className="mathmaster-elim-equals">=</span>
      <span className="mathmaster-elim-constant">{form ? constantText(form.constant) : ''}</span>
    </div>
  );
}

/** The "Scale" / "Change" link under a row's label. */
export function EliminationScaleButton({ equationLabel, scaled, onOpen }) {
  return (
    <button
      type="button"
      className="mathmaster-elim-scale-button"
      onClick={onOpen}
      aria-label={scaled ? `Change the scale factor for ${equationLabel}` : `Scale ${equationLabel}`}
    >
      {scaled ? 'Change' : 'Scale'}
    </button>
  );
}

/** The factor field that opens directly under the row being scaled. */
export function EliminationScaleEditor({ equationLabel, value, onChange, onApply, onKeep, editorId }) {
  return (
    <div className="mathmaster-elim-row-tools" data-scale-editor={editorId}>
      <label className="mathmaster-reduction-field mathmaster-elim-factor-field">
        Scale {equationLabel} by
        <MathInput
          value={value || ''}
          onChange={onChange}
          onSubmit={onApply}
          placeholder="factor"
          ariaLabel={`Scale factor for ${equationLabel}`}
          toolProfile="algebra-operation"
          compact
          maxWidth={150}
        />
      </label>
      <button type="button" onClick={onApply} style={eliminationSmallActionStyle}>Apply this factor</button>
      <button type="button" onClick={onKeep} style={{ ...eliminationSecondaryButtonStyle, marginTop: 8 }}>Keep as written</button>
    </div>
  );
}

/**
 * The distribution step: one entry under each term of the row being scaled,
 * plus the right side. `entries` is [{ key, variable }] with variable null for
 * the right side; the key is whatever the caller stores the typed term under.
 */
export function EliminationDistribution({ equationLabel, factorText, entries, values, onTerm, onCheck, onKeep, distributionId, revealRef = null, error = null }) {
  return (
    <div ref={revealRef} className="mathmaster-elim-distribution" data-distribution={distributionId}>
      <p className="mathmaster-elim-hint">
        Multiply every term of {equationLabel} by {factorText}, including the right side. Write each new term under the term it came from.
      </p>
      <div className="mathmaster-elim-row mathmaster-elim-entry-row">
        <div className="mathmaster-elim-op" />
        <div className="mathmaster-elim-label"><span>{scaleBadgeText(factorText)}</span></div>
        {entries.map(({ key, variable }) => (
          <React.Fragment key={key}>
            {variable ? null : <span className="mathmaster-elim-equals">=</span>}
            <div className={variable ? 'mathmaster-elim-term' : 'mathmaster-elim-constant'}>
              <span className="mathmaster-elim-entry-label" aria-hidden="true">{variable ? `${variable} term` : 'Right side'}</span>
              <MathInput
                value={values?.[key] || ''}
                onChange={(value) => onTerm(key, value)}
                onSubmit={onCheck}
                placeholder={variable ? 'term' : 'value'}
                ariaLabel={variable ? `Scaled ${variable} term for ${equationLabel}` : `Scaled right side for ${equationLabel}`}
                toolProfile="algebra-operation"
                compact
                hideToolsToggle
              />
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="mathmaster-elim-actions">
        <button type="button" onClick={onCheck} style={eliminationSmallActionStyle}>Check my scaled terms</button>
        <button type="button" onClick={onKeep} style={{ ...eliminationSecondaryButtonStyle, marginTop: 8 }}>Keep as written</button>
      </div>
      {error ? <p className="mathmaster-systems-substitution-feedback is-error" role="status">{error}</p> : null}
    </div>
  );
}

/** + / − beside the second row: the student's own choice of operation. */
export function EliminationOperationRail({ operation, onChoose, firstLabel, secondLabel }) {
  return (
    <div className="mathmaster-systems-operation-rail mathmaster-elim-rail" role="group" aria-label={`Add or subtract ${secondLabel} and ${firstLabel}`}>
      <button
        type="button"
        className={operation === 'add' ? 'is-selected' : ''}
        aria-pressed={operation === 'add'}
        onClick={() => onChoose('add')}
        aria-label={`Add ${secondLabel} to ${firstLabel}`}
      >
        +
      </button>
      <button
        type="button"
        className={operation === 'subtract' ? 'is-selected' : ''}
        aria-pressed={operation === 'subtract'}
        onClick={() => onChoose('subtract')}
        aria-label={`Subtract ${secondLabel} from ${firstLabel}`}
      >
        −
      </button>
    </div>
  );
}

/** The chosen operation, once it is part of the work being combined. */
export function EliminationOperationSymbol({ operation }) {
  if (!operation) return null;
  return <span className="mathmaster-systems-operation-symbol" aria-label={operation === 'subtract' ? 'minus' : 'plus'}>{operation === 'subtract' ? '−' : '+'}</span>;
}

/**
 * The line under the rule where the student writes what remains, column by
 * column. The eliminated column shows a dash; every other variable and the
 * right side is the student's own entry. `values` and `onTerm` are keyed by
 * variable name and 'constant'.
 */
export function EliminationCombinationEntry({ variables, target, label, values, onTerm, onCheck, entryId, revealRef = null }) {
  return (
    <div ref={revealRef} className="mathmaster-elim-row mathmaster-elim-entry-row mathmaster-elim-result-entry" data-combination-entry={entryId}>
      <div className="mathmaster-elim-op" />
      <div className="mathmaster-elim-label"><span>{label}</span></div>
      {variables.map((name) => (name === target ? (
        <span key={name} className="mathmaster-elim-term is-eliminated" aria-label={`${name} eliminated`}>—</span>
      ) : (
        <div key={name} className="mathmaster-elim-term">
          <span className="mathmaster-elim-entry-label" aria-hidden="true">{name} term</span>
          <MathInput
            value={values?.[name] || ''}
            onChange={(value) => onTerm(name, value)}
            onSubmit={onCheck}
            placeholder="term"
            ariaLabel={`Combined ${name} term`}
            toolProfile="algebra-operation"
            compact
            hideToolsToggle
          />
        </div>
      )))}
      <span className="mathmaster-elim-equals">=</span>
      <div className="mathmaster-elim-constant">
        <span className="mathmaster-elim-entry-label" aria-hidden="true">Right side</span>
        <MathInput
          value={values?.constant || ''}
          onChange={(value) => onTerm('constant', value)}
          onSubmit={onCheck}
          placeholder="value"
          ariaLabel="Combined right side"
          toolProfile="algebra-operation"
          compact
          hideToolsToggle
        />
      </div>
    </div>
  );
}

/** The direction line over an open board — the same words at every system size. */
export const eliminationDirection = ({ variable, anyEditorOpen, operationChosen, eliminates, combinationOpen, markedCount }) => {
  if (anyEditorOpen) return 'Type the factor, apply it, then multiply every term. Or keep the equation as written.';
  if (!operationChosen) return `Scale an equation only if its ${variable} term needs it. Then choose + or − beside the second equation.`;
  if (eliminates === false) return null;
  if (!combinationOpen) return `Mark the ${variable} term in each equation that cancels · ${markedCount} of 2 marked.`;
  return 'Now combine what remains, column by column, on the line under the equations.';
};
