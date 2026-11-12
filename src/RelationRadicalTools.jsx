import { useEffect, useMemo, useState } from 'react';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import {
  RADICAL_POWER_CHOICES,
  factorTargetOfBranch,
  relationExpressionToLatex,
  zeroProductFactors,
} from './algebraRelationFoundation.js';
import {
  FACTOR_NEEDS_ZERO,
  MAX_ZERO_PRODUCT_ROWS,
  ZERO_PRODUCT_NEEDS_PRODUCT,
  factorResult,
  isRecordedCheck,
  powerChoiceLabel,
  raiseResult,
  readCheckDraft,
  readSolutionSetDraft,
  zeroProductResult,
} from './relationRadicalToolsModel.js';

/*
 * THE RADICAL-EQUATION AND QUADRATIC TOOLS OF THE RELATION WORKSPACE.
 *
 * Raise both sides to a power, Factor and the Zero-product property, and the
 * two stages that finish a radical solve: checking each candidate in the
 * ORIGINAL equation, and stating the final solution set.
 *
 * The student does the algebra. Each tool shows what the student has to work
 * on and asks for the next line; it never supplies it. A line goes through the
 * workspace's own validated commit (so Undo, history, the saved draft and the
 * server's step check all behave as for every other step), and a line that
 * does not follow is refused with a sentence, not committed.
 *
 * Everything typed here lives in this component until the student presses a
 * button. Nothing is written to the draft, or reported to the host, per
 * keystroke: only a recorded check or a recorded solution set is state.
 */

const panelStyle = {
  display: 'grid',
  gap: 9,
  marginBottom: 8,
  padding: '10px 12px',
  border: '1px solid var(--mm-primary-border)',
  borderRadius: 10,
  background: 'var(--mm-surface-tint)',
};
const rowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 };
const chip = (active = false) => ({
  minHeight: 38,
  padding: '5px 11px',
  borderRadius: 9,
  border: active ? '2px solid #174ea6' : '1px solid var(--mm-primary-border)',
  background: active ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
});
const primaryButton = (enabled) => ({
  ...chip(true),
  border: 0,
  background: enabled ? '#174ea6' : '#9fb7df',
  color: '#fff',
  cursor: enabled ? 'pointer' : 'not-allowed',
  whiteSpace: 'nowrap',
});
const captionStyle = { color: 'var(--mm-text-muted)', fontSize: 'calc(11.5 * var(--mm-px))', lineHeight: 1.4 };
const equationStyle = { fontSize: 'calc(22 * var(--mm-px))', color: 'var(--mm-text-strong)' };
const fieldLabel = { display: 'grid', gap: 3, minWidth: 0 };
const fieldCaption = { color: 'var(--mm-text-muted)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 800 };

const latexOf = (expression) => relationExpressionToLatex(String(expression ?? ''));
const equationLatex = (branch) => `${latexOf(branch?.expressions?.[0])} = ${latexOf(branch?.expressions?.[1])}`;

function PanelHeader({ title, onClose, children }) {
  return (
    <div style={rowStyle}>
      <strong style={{ color: 'var(--mm-primary-text)', fontSize: 'calc(13 * var(--mm-px))' }}>{title}</strong>
      {children}
      <button type="button" onClick={onClose} aria-label={`Close ${title}`} style={chip(false)}>×</button>
    </div>
  );
}

// --- Raise both sides to a power ----------------------------------------------------------

export function RelationRaisePowerPanel({ state, branchIndex = 0, onCommit, onClose, notify, disabled = false }) {
  const branch = state?.branches?.[branchIndex];
  const [power, setPower] = useState(null);
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [focusSignal, setFocusSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const ready = Boolean(power) && left.trim() !== '' && right.trim() !== '' && !disabled && !busy;

  const choosePower = (value) => {
    setPower(value);
    setFocusSignal((signal) => signal + 1);
  };
  const apply = async () => {
    const result = raiseResult({ state, branchIndex, power, left, right });
    if (!result.ready) {
      notify?.({ tone: 'growth', text: result.reason });
      return;
    }
    setBusy(true);
    try {
      const committed = await onCommit(result.state, result.label, result.kind, result.transition);
      if (committed) onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!branch) return null;
  return (
    <div className="relation-raise-panel" data-relation-tool="raisePower" role="group" aria-label="Raise both sides to a power" style={panelStyle}>
      <PanelHeader title="Raise both sides to a power" onClose={onClose}>
        {RADICAL_POWER_CHOICES.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={power === value}
            onClick={() => choosePower(value)}
            disabled={disabled}
            style={chip(power === value)}
          >
            {powerChoiceLabel(value)}
          </button>
        ))}
      </PanelHeader>
      {power ? (
        <>
          <div style={captionStyle}>
            Both sides of <MathDisplay value={equationLatex(branch)} format="latex" inline /> are raised to the power {power}:
          </div>
          <div style={equationStyle} data-relation-staged="raisePower">
            <MathDisplay
              value={`\\left(${latexOf(branch.expressions[0])}\\right)^{${power}} = \\left(${latexOf(branch.expressions[1])}\\right)^{${power}}`}
              format="latex"
              inline
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 8, alignItems: 'end' }}>
            <label style={fieldLabel}>
              <span style={fieldCaption}>Left side, written out</span>
              <MathInput
                value={left}
                onChange={setLeft}
                placeholder="Left side"
                ariaLabel="Left side after raising to the power"
                toolProfile="algebra-operation"
                compact
                focusSignal={focusSignal}
              />
            </label>
            <span aria-hidden="true" style={{ ...equationStyle, paddingBottom: 6 }}>=</span>
            <label style={fieldLabel}>
              <span style={fieldCaption}>Right side, written out</span>
              <MathInput
                value={right}
                onChange={setRight}
                placeholder="Right side"
                ariaLabel="Right side after raising to the power"
                toolProfile="algebra-operation"
                compact
              />
            </label>
          </div>
          <div style={{ ...rowStyle, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={chip(false)}>Cancel</button>
            <button type="button" onClick={apply} disabled={!ready} style={primaryButton(ready)}>Check and apply</button>
          </div>
        </>
      ) : (
        <div style={captionStyle}>Choose the power, then write what each side becomes.</div>
      )}
    </div>
  );
}

// --- Factor ---------------------------------------------------------------------------------

export function RelationFactorPanel({ state, branchIndex = 0, onCommit, onClose, notify, disabled = false }) {
  const branch = state?.branches?.[branchIndex];
  const target = useMemo(() => factorTargetOfBranch(branch, state?.variable || 'x'), [branch, state?.variable]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = text.trim() !== '' && !disabled && !busy;

  const apply = async () => {
    const result = factorResult({ state, branchIndex, text });
    if (!result.ready) {
      notify?.({ tone: 'growth', text: result.reason });
      return;
    }
    setBusy(true);
    try {
      const committed = await onCommit(result.state, result.label, result.kind, result.transition);
      if (committed) onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!branch) return null;
  return (
    <div className="relation-factor-panel" data-relation-tool="factor" role="group" aria-label="Factor" style={panelStyle}>
      <PanelHeader title="Factor" onClose={onClose}>
        <span style={equationStyle}><MathDisplay value={equationLatex(branch)} format="latex" inline /></span>
      </PanelHeader>
      {target ? (
        <>
          <label style={fieldLabel}>
            <span style={fieldCaption}>Write the {target.other === 0 ? 'left' : 'right'} side as a product of factors</span>
            <MathInput
              value={text}
              onChange={setText}
              placeholder="Factored form"
              ariaLabel="Factored form"
              toolProfile="algebra-operation"
              compact
              focusSignal={1}
            />
          </label>
          <div style={{ ...rowStyle, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={chip(false)}>Cancel</button>
            <button type="button" onClick={apply} disabled={!ready} style={primaryButton(ready)}>Check factoring</button>
          </div>
        </>
      ) : (
        <div style={captionStyle}>{FACTOR_NEEDS_ZERO}</div>
      )}
    </div>
  );
}

// --- Zero-product property -------------------------------------------------------------

const blankRows = () => [{ left: '', right: '' }, { left: '', right: '' }];

export function RelationZeroProductPanel({ state, branchIndex = 0, onCommit, onClose, notify, disabled = false }) {
  const branch = state?.branches?.[branchIndex];
  const factors = useMemo(() => zeroProductFactors(state, branchIndex), [state, branchIndex]);
  const [rows, setRows] = useState(blankRows);
  const [busy, setBusy] = useState(false);
  const ready = rows.every((row) => row.left.trim() !== '' && row.right.trim() !== '') && !disabled && !busy;

  const update = (index, side, value) => setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [side]: value } : row)));
  const apply = async () => {
    const result = zeroProductResult({ state, branchIndex, rows });
    if (!result.ready) {
      notify?.({ tone: 'growth', text: result.reason });
      return;
    }
    setBusy(true);
    try {
      const committed = await onCommit(result.state, result.label, result.kind, result.transition);
      if (committed) onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!branch) return null;
  return (
    <div className="relation-zero-product-panel" data-relation-tool="zeroProduct" role="group" aria-label="Zero-product property" style={panelStyle}>
      <PanelHeader title="Zero-product property" onClose={onClose}>
        <span style={equationStyle}><MathDisplay value={equationLatex(branch)} format="latex" inline /></span>
      </PanelHeader>
      {factors ? (
        <>
          <div style={captionStyle}>
            Write the equations that must hold. Add or remove an equation if you need to; a factor that repeats needs only one.
          </div>
          {rows.map((row, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
              <MathInput
                value={row.left}
                onChange={(value) => update(index, 'left', value)}
                placeholder={`Equation ${index + 1}, left side`}
                ariaLabel={`Equation ${index + 1} left side`}
                toolProfile="algebra-operation"
                compact
                focusSignal={index === 0 ? 1 : 0}
              />
              <span aria-hidden="true" style={equationStyle}>=</span>
              <MathInput
                value={row.right}
                onChange={(value) => update(index, 'right', value)}
                placeholder={`Equation ${index + 1}, right side`}
                ariaLabel={`Equation ${index + 1} right side`}
                toolProfile="algebra-operation"
                compact
              />
            </div>
          ))}
          <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
            <div style={rowStyle}>
              <button
                type="button"
                onClick={() => setRows((current) => [...current, { left: '', right: '' }])}
                disabled={rows.length >= MAX_ZERO_PRODUCT_ROWS}
                style={chip(false)}
              >
                Add an equation
              </button>
              <button
                type="button"
                onClick={() => setRows((current) => current.slice(0, -1))}
                disabled={rows.length <= 1}
                style={chip(false)}
              >
                Remove the last
              </button>
            </div>
            <div style={rowStyle}>
              <button type="button" onClick={onClose} style={chip(false)}>Cancel</button>
              <button type="button" onClick={apply} disabled={!ready} style={primaryButton(ready)}>Check</button>
            </div>
          </div>
        </>
      ) : (
        <div style={captionStyle}>{ZERO_PRODUCT_NEEDS_PRODUCT}</div>
      )}
    </div>
  );
}

// --- Check each candidate in the original equation ---------------------------------------

const CHOICES = [
  ['valid', 'Valid solution'],
  ['extraneous', 'Extraneous'],
];
const choiceWords = (choice) => (choice === 'valid' ? 'Valid solution' : 'Extraneous');

function CandidateCheckCard({ candidate, variable, sideLatex, entry, onRecord, onEdit, disabled, notify }) {
  const recorded = isRecordedCheck(entry);
  const [editing, setEditing] = useState(!recorded);
  const [left, setLeft] = useState(recorded ? entry.left : '');
  const [right, setRight] = useState(recorded ? entry.right : '');
  const [choice, setChoice] = useState(recorded ? entry.choice : null);

  // A check cleared elsewhere (the algebra changed, Undo) opens its fields again, empty.
  useEffect(() => {
    if (recorded) {
      setEditing(false);
    } else {
      setEditing(true);
      setLeft('');
      setRight('');
      setChoice(null);
    }
  }, [recorded]);

  const record = () => {
    const read = readCheckDraft({ left, right, choice });
    if (!read.ok) {
      notify?.({ tone: 'growth', text: read.reason });
      return;
    }
    onRecord(candidate.key, read.entry);
  };
  const edit = () => {
    setEditing(true);
    onEdit(candidate.key);
  };

  return (
    <div
      className="radical-candidate-check"
      data-candidate={candidate.key}
      style={{ display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)' }}
    >
      <div style={{ fontSize: 'calc(21 * var(--mm-px))', fontWeight: 800 }}>
        <MathDisplay value={`${latexOf(variable)} = ${latexOf(candidate.expression)}`} format="latex" inline />
      </div>
      {recorded && !editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span>Left side <strong><MathDisplay value={latexOf(entry.left)} format="latex" inline /></strong></span>
          <span>Right side <strong><MathDisplay value={latexOf(entry.right)} format="latex" inline /></strong></span>
          <span style={{ fontWeight: 800, color: 'var(--mm-primary-text)' }} data-candidate-choice={entry.choice}>{choiceWords(entry.choice)}</span>
          {!disabled && <button type="button" onClick={edit} style={chip(false)} aria-label={`Change the check of ${variable} = ${candidate.expression}`}>Change</button>}
        </div>
      ) : disabled ? (
        <div style={captionStyle}>This check was not recorded.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label style={fieldLabel}>
              <span style={fieldCaption}>
                Left side: <MathDisplay value={sideLatex.left} format="latex" inline /> =
              </span>
              <MathInput
                value={left}
                onChange={setLeft}
                placeholder="Value of the left side"
                ariaLabel={`Left side of the original equation when ${variable} = ${candidate.expression}`}
                toolProfile="algebra-operation"
                compact
              />
            </label>
            <label style={fieldLabel}>
              <span style={fieldCaption}>
                Right side: <MathDisplay value={sideLatex.right} format="latex" inline /> =
              </span>
              <MathInput
                value={right}
                onChange={setRight}
                placeholder="Value of the right side"
                ariaLabel={`Right side of the original equation when ${variable} = ${candidate.expression}`}
                toolProfile="algebra-operation"
                compact
              />
            </label>
          </div>
          <div style={rowStyle}>
            {CHOICES.map(([value, label]) => (
              <button type="button" key={value} aria-pressed={choice === value} onClick={() => setChoice(value)} style={{ ...chip(choice === value), minHeight: 40 }}>
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={record}
              disabled={!left.trim() || !right.trim() || !choice}
              style={primaryButton(Boolean(left.trim() && right.trim() && choice))}
            >
              Record this check
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function RadicalCandidateChecks({
  candidates,
  checks,
  variable,
  originalLatex,
  sideLatex,
  domainText,
  onRecord,
  onEdit,
  disabled = false,
  notify,
}) {
  return (
    <div
      className="radical-candidate-verification"
      style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)', color: 'var(--mm-text-strong)' }}
    >
      <div style={{ fontWeight: 900, color: 'var(--mm-primary-text)', marginBottom: 6 }}>Check each candidate in the original equation</div>
      <div style={{ ...captionStyle, fontSize: 'calc(12.5 * var(--mm-px))', marginBottom: 8 }}>
        Raising both sides to a power can create a candidate that does not satisfy the original equation.
        Substitute each value into BOTH sides of the original, work out what each side equals, and decide.
      </div>
      <div style={{ ...equationStyle, marginBottom: 4 }} data-original-equation="true">
        <MathDisplay value={originalLatex} format="latex" inline />
      </div>
      {domainText ? (
        <div style={{ ...captionStyle, marginBottom: 10 }} data-radical-domain="true">
          Real numbers only: the expression under the root must be 0 or more ({domainText}).
        </div>
      ) : <div style={{ marginBottom: 10 }} />}
      <div style={{ display: 'grid', gap: 10 }}>
        {candidates.map((candidate) => (
          <CandidateCheckCard
            key={candidate.key}
            candidate={candidate}
            variable={variable}
            sideLatex={sideLatex}
            entry={checks[candidate.key]}
            onRecord={onRecord}
            onEdit={onEdit}
            disabled={disabled}
            notify={notify}
          />
        ))}
      </div>
    </div>
  );
}

// --- The final solution set --------------------------------------------------------------

export function RadicalSolutionSet({ variable, recorded, onRecord, onEdit, disabled = false, notify }) {
  const [none, setNone] = useState(false);
  const [values, setValues] = useState(['']);

  useEffect(() => {
    if (!recorded) {
      setNone(false);
      setValues(['']);
    }
  }, [recorded]);

  const record = () => {
    const read = readSolutionSetDraft({ none, values });
    if (!read.ok) {
      notify?.({ tone: 'growth', text: read.reason });
      return;
    }
    onRecord(read.set);
  };

  return (
    <div
      className="radical-solution-set"
      style={{ marginTop: 12, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-tint)', color: 'var(--mm-text-strong)' }}
    >
      <div style={{ fontWeight: 900, color: 'var(--mm-primary-text)', marginBottom: 6 }}>Final solution set</div>
      <div style={{ ...captionStyle, fontSize: 'calc(12.5 * var(--mm-px))', marginBottom: 10 }}>
        Write every value that satisfies the original equation. If no real number does, choose No real solution.
      </div>
      {recorded ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }} data-solution-set-recorded="true">
          <strong>
            {recorded.none
              ? 'No real solution'
              : recorded.values.map((value, index) => (
                <span key={`${value}-${index}`}>
                  {index > 0 ? ', ' : ''}
                  <MathDisplay value={`${latexOf(variable)} = ${latexOf(value)}`} format="latex" inline />
                </span>
              ))}
          </strong>
          {!disabled && <button type="button" onClick={onEdit} style={chip(false)}>Change</button>}
        </div>
      ) : disabled ? (
        <div style={captionStyle}>A solution set was not recorded.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {!none && values.map((value, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 260px)', gap: 8, alignItems: 'center' }}>
              <span style={equationStyle}><MathDisplay value={`${latexOf(variable)} =`} format="latex" inline /></span>
              <MathInput
                value={value}
                onChange={(next) => setValues((current) => current.map((entry, entryIndex) => (entryIndex === index ? next : entry)))}
                placeholder={`Solution ${index + 1}`}
                ariaLabel={`Solution ${index + 1}`}
                toolProfile="algebra-operation"
                compact
              />
            </div>
          ))}
          <div style={rowStyle}>
            {!none && (
              <>
                <button type="button" onClick={() => setValues((current) => [...current, ''])} disabled={values.length >= 4} style={chip(false)}>Add another solution</button>
                {values.length > 1 && <button type="button" onClick={() => setValues((current) => current.slice(0, -1))} style={chip(false)}>Remove the last</button>}
              </>
            )}
            <button type="button" aria-pressed={none} onClick={() => setNone((current) => !current)} style={chip(none)}>No real solution</button>
            <button type="button" onClick={record} style={primaryButton(true)}>Record solution set</button>
          </div>
        </div>
      )}
    </div>
  );
}
