/*
 * SHOW THE STEP: THE STEP ITSELF, ON THE SCREEN (SP-4).
 *
 * One part's checkpoint, drawn above its answer box: the plane to pick points
 * on, Step Algebra to solve in, the boxes for a factor pair or a table's rows.
 * Each is the platform's own tool (CoordinatePlane, StepByStepAlgebraCore),
 * and each check is that tool's engine (checkpointEngine.js).
 *
 * It holds no answer of its own. The student's work is the one line of text
 * the answer boxes keep beside the part (`value`, `onChange`), so the draft,
 * Undo and the submitted response carry it as they carry any box. `onStatus`
 * tells the boxes when the step lets the answer box open:
 *
 *   Classwork and Practice   once the engine accepts the step. The student
 *                            asks with "Check my step" and is told in words
 *                            what is off; nothing here states the answer.
 *                            After two refusals "Answer without this step"
 *                            opens the box: recorded as skipped, no penalty.
 *   DOL, quiz and test       (`verdictsWithheld`) once the step is done.
 *                            Nothing says right or wrong.
 *   See every part at once   (`optional`, the student's support) at once.
 *                            Whatever step work is done is still recorded.
 *
 * A lazy chunk: the question engine loads it only for a part that has a step.
 * The engine also hands in the Step Algebra workspace it already holds
 * (`StepByStepAlgebraCore`), so this chunk does not carry a second route to
 * it and the app's first load is not reshuffled.
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import CoordinatePlane from '../../../tools/shared/CoordinatePlane.jsx';
import { ToolRuntimeProvider } from '../../../tools/shared/ToolRuntimeContext.jsx';
import MathDisplay from '../../../MathDisplay.jsx';
import { CHECKPOINT_KIND, checkCheckpoint, readCheckpointSource } from './checkpointEngine.js';
import { readCheckpointWork, writeCheckpointWork } from './checkpointLine.js';
import { stepInstruction, stepProblemText, stepSummary } from './checkpointWords.js';

const BOX = {
  display: 'grid', gap: 10, padding: 14, minWidth: 0, textAlign: 'left',
  border: '2px solid var(--mm-tint-border)', borderRadius: 10, background: 'var(--mm-surface-tint, var(--mm-surface))',
};
const HEADING = { margin: 0, fontSize: 'calc(15 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-strong)' };
const TEXT = { margin: 0, fontSize: 'calc(15 * var(--mm-px))', lineHeight: 1.45, color: 'var(--mm-text)' };
const ENTRY = {
  width: '100%', minHeight: 48, padding: '8px 10px', boxSizing: 'border-box', borderRadius: 8,
  border: '2px solid var(--mm-primary)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)',
  fontSize: 'calc(17 * var(--mm-px))', fontFamily: 'inherit',
};
const BUTTON = (enabled, quiet = false) => ({
  minHeight: 44, padding: '0 16px', borderRadius: 8, fontWeight: 800, fontSize: 'calc(15 * var(--mm-px))', fontFamily: 'inherit',
  border: quiet ? '2px solid var(--mm-tint-border)' : 0,
  background: quiet ? 'var(--mm-surface)' : enabled ? 'var(--mm-primary)' : 'var(--mm-surface-control-strong)',
  color: quiet ? 'var(--mm-primary-text)' : enabled ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)',
  cursor: enabled ? 'pointer' : 'not-allowed',
});
const NOTE = (tone) => ({
  margin: 0, padding: '8px 10px', borderRadius: 8, fontSize: 'calc(15 * var(--mm-px))', lineHeight: 1.45, fontWeight: 700,
  background: tone === 'good' ? 'var(--mm-success-subtle)' : 'var(--mm-warning-bg)',
  color: tone === 'good' ? 'var(--mm-success-text, var(--mm-text-strong))' : 'var(--mm-warning-text)',
  border: `1px solid ${tone === 'good' ? 'var(--mm-success-border)' : 'var(--mm-warning-border, var(--mm-border))'}`,
});

const NumberEntry = ({ label, value, onChange, disabled, name }) => {
  const id = useId();
  return (
    <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 'calc(14 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text)' }}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={16}
        disabled={disabled}
        data-step-entry={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={ENTRY}
      />
    </span>
  );
};

function PickPoints({ source, work, onWork, disabled }) {
  const { relation, count, bounds } = source;
  const points = work?.points || [];
  const check = useMemo(() => checkCheckpoint({ kind: source.kind, count, of: source.of }, work), [source, count, work]);
  const setPoints = (next) => onWork({ points: next, rise: work?.rise || '', run: work?.run || '' });
  const plot = (point) => {
    if (disabled) return;
    const [x, y] = Array.isArray(point) ? point : [point?.x, point?.y];
    if (![x, y].every(Number.isFinite)) return;
    // A press on a point already picked takes it away again.
    const held = points.findIndex((existing) => existing[0] === x && existing[1] === y);
    // …and once the step has all its points, a new one takes the place of
    // the last one picked (Graphing's own rule replaces the nearest: here the
    // points are few and named, so the last is the one a student means).
    setPoints(held >= 0 ? points.filter((_, index) => index !== held) : [...points.slice(0, count - 1), [x, y]]);
  };
  const functions = useMemo(() => (relation.kind === 'function' ? [(x) => relation.at(x) ?? NaN] : []), [relation]);
  const verticalLines = useMemo(() => (relation.kind === 'vertical' ? [{ x: relation.x }] : []), [relation]);
  const plotted = points.map(([x, y], index) => ({ x, y, label: `P${index + 1}` }));
  const asks = check.facts?.asksRiseRun === true || (relation.kind === 'function' && relation.straight && count === 2);
  const placed = points.length >= count;
  return (
    <>
      <div style={{ width: '100%', maxWidth: 520, minWidth: 0 }}>
      <CoordinatePlane
        xMin={bounds.min} xMax={bounds.max} yMin={bounds.min} yMax={bounds.max}
        equalUnits
        functions={functions}
        verticalLines={verticalLines}
        points={plotted}
        onPlot={plot}
        plotProgress={`${points.length} of ${count} ${count === 1 ? 'point' : 'points'} picked.`}
        cursorLabel="Pick"
        ariaLabel="Coordinate plane for picking your points"
        enlargeable={false}
        viewResetKey={source.of}
      />
      </div>
      <p style={TEXT} data-step-points="">
        {points.length ? `Your points: ${points.map(([x, y]) => `(${x}, ${y})`).join(' and ')}.` : 'No points picked yet.'}
      </p>
      {points.length ? (
        <button type="button" disabled={disabled} onClick={() => onWork({ points: [], rise: '', run: '' })} style={{ ...BUTTON(true, true), justifySelf: 'start' }}>
          Clear my points
        </button>
      ) : null}
      {asks && placed ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          <NumberEntry name="rise" label={`Rise from (${points[0][0]}, ${points[0][1]}) to (${points[1][0]}, ${points[1][1]})`} value={work?.rise || ''} disabled={disabled} onChange={(rise) => onWork({ points, rise, run: work?.run || '' })} />
          <NumberEntry name="run" label="Run between the same two points" value={work?.run || ''} disabled={disabled} onChange={(run) => onWork({ points, rise: work?.rise || '', run })} />
        </div>
      ) : null}
    </>
  );
}

function StepMoves({ source, onWork, disabled, draftKey, verdictsWithheld, value, onSlip, StepByStepAlgebraCore }) {
  const pristine = source.equation;
  // The moves are Step Algebra's to keep (its own draft and Undo). If the
  // line beside the answer is changed from outside (the answer boxes' Undo),
  // it is written again from the moves the workspace still shows.
  const stepsRef = useRef(null);
  // On a device that does not hold the workspace's draft (the item reopened
  // elsewhere) the workspace opens with no moves. Until it has held a move
  // here, it must not erase the moves the saved line already records.
  const heldMoves = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const report = useCallback((steps) => {
    stepsRef.current = steps;
    const lines = [{ left: pristine.left, right: pristine.right }, ...(Array.isArray(steps) ? steps : []).map((step) => step?.after).filter((after) => after?.left && after?.right)];
    if (lines.length > 1) heldMoves.current = true;
    else if (!heldMoves.current && String(valueRef.current || '').trim()) return;
    onWork(lines.length > 1 ? { lines } : null);
  }, [onWork, pristine]);
  useEffect(() => {
    if (stepsRef.current) report(stepsRef.current);
  }, [value, report]);
  const ignore = useCallback(() => {}, []);
  if (!StepByStepAlgebraCore) return null;
  return (
    <ToolRuntimeProvider hintsAllowed={!verdictsWithheld} verdictsWithheld={verdictsWithheld} showImmediateFeedback={!verdictsWithheld}>
      <StepByStepAlgebraCore
        embedded
        embeddedTitle="Your moves"
        question={source.question}
        questionRecord={null}
        draftKey={draftKey}
        onStateChange={ignore}
        onStepGrade={null}
        onWorkStepsChange={report}
        showPrompt={false}
        disabled={disabled}
        hintsAllowed={!verdictsWithheld}
        onSlip={onSlip}
      />
    </ToolRuntimeProvider>
  );
}

function FactorPair({ work, onWork, disabled }) {
  const pair = work?.pair || ['', ''];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 12 }}>
      <NumberEntry name="pair-0" label="First number" value={pair[0]} disabled={disabled} onChange={(value) => onWork({ pair: [value, pair[1]] })} />
      <NumberEntry name="pair-1" label="Second number" value={pair[1]} disabled={disabled} onChange={(value) => onWork({ pair: [pair[0], value] })} />
    </div>
  );
}

function TableRows({ source, work, onWork, disabled }) {
  const { count, rule } = source;
  const rows = Array.from({ length: count }, (_, index) => work?.rows?.[index] || ['', '']);
  const set = (rowIndex, column, value) => onWork({ rows: rows.map((row, index) => (index === rowIndex ? (column === 0 ? [value, row[1]] : [row[0], value]) : row)) });
  const cell = { padding: 6, border: '1px solid var(--mm-tint-border)' };
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 360 }} data-step-table="">
      <thead>
        <tr>
          <th scope="col" style={{ ...cell, fontWeight: 800 }}>{rule.input}</th>
          <th scope="col" style={{ ...cell, fontWeight: 800 }}>{rule.output}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <tr key={index}>
            {[0, 1].map((column) => (
              <td key={column} style={cell}>
                <input
                  type="text" inputMode="text" autoComplete="off" spellCheck={false} maxLength={16} disabled={disabled}
                  aria-label={`Row ${index + 1}, ${column === 0 ? rule.input : rule.output}`}
                  data-step-entry={`row-${index}-${column}`}
                  value={row[column]}
                  onChange={(event) => set(index, column, event.target.value)}
                  style={{ ...ENTRY, minHeight: 44 }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ShowTheStep({
  checkpoint, value = '', onChange, onStatus, verdictsWithheld = false, optional = false, disabled = false, draftKey = null, partLabel = '',
  StepByStepAlgebraCore = null, carriedOver = false,
}) {
  const read = useMemo(() => readCheckpointSource(checkpoint), [checkpoint]);
  // A step in Step Algebra needs the workspace its host holds. Without it the
  // step cannot be drawn, and (like a checkpoint its tool cannot read) it
  // never holds the answer box shut.
  const source = read.ok && read.kind === CHECKPOINT_KIND.STEP_MOVES && !StepByStepAlgebraCore ? { ok: false } : read;
  const kind = source.ok ? source.kind : null;
  const work = useMemo(() => (kind ? readCheckpointWork(kind, value) : null), [kind, value]);
  const check = useMemo(() => checkCheckpoint(checkpoint, work), [checkpoint, work]);
  // Step Algebra accepts or refuses each move itself, so its step is checked
  // as it is made; the others are checked when the student asks.
  const asksForCheck = !verdictsWithheld && kind !== CHECKPOINT_KIND.STEP_MOVES;
  // Work that was already right when the part opened (a restored draft) needs
  // no second press.
  const [checked, setChecked] = useState(() => (check.ok ? value : null));
  const isChecked = checked === value;
  // A STUCK STUDENT IS NEVER LOCKED OUT (Classwork and Practice). Once the
  // engine has refused the step twice, "Answer without this step" opens the
  // answer box. The step is recorded as skipped, with whatever was done, and
  // costs nothing.
  const [refusals, setRefusals] = useState(0);
  const refused = useCallback(() => setRefusals((count) => count + 1), []);
  const skipped = check.skipped === true;
  // `optional`: the student's See every part at once support. The answer box
  // is open from the start, and any step work is still recorded.
  const accepted = asksForCheck ? check.ok && isChecked : check.ok;
  // Where verdicts are withheld nothing may say the step is right, so the box
  // cannot wait for a right one. It opens once the step is done; for Step
  // Algebra, once a move is made, so a student who cannot finish solving is
  // not kept from answering.
  const attempted = check.done || (kind === CHECKPOINT_KIND.STEP_MOVES && (work?.lines?.length || 0) >= 2);
  // `carriedOver`: the part already had an answer when it opened (a saved
  // draft, perhaps on another device). That answer is never locked behind
  // the step again: the box is open, and the step is there to do. A step
  // that did not come with it is recorded as nothing: not skipped, not done.
  const open = !source.ok || optional || carriedOver || (verdictsWithheld ? attempted : accepted || skipped);
  const offerSkip = !verdictsWithheld && !optional && !open && refusals >= 2;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    // A step whose tool cannot read it never holds the answer box shut.
    onStatusRef.current?.({ open, done: !source.ok || check.done });
  }, [open, check.done, source.ok]);

  // Stable for the tools below (Step Algebra reports its steps from an effect
  // keyed on this), and silent when the line has not changed.
  const latest = useRef({ onChange, value, skipped });
  latest.current = { onChange, value, skipped };
  const onWork = useCallback((next) => {
    if (!kind) return;
    // A skipped step stays skipped while the student works on it again, until
    // the engine accepts what they have done.
    const keepSkip = latest.current.skipped && !(next && checkCheckpoint(checkpoint, next).ok);
    const line = keepSkip ? writeCheckpointWork(kind, { ...next, skipped: true }) : next ? writeCheckpointWork(kind, next) : '';
    if (line !== latest.current.value) latest.current.onChange?.(line);
  }, [kind, checkpoint]);
  const skip = () => latest.current.onChange?.(writeCheckpointWork(kind, { ...work, skipped: true }));
  const pressCheck = () => {
    setChecked(value);
    if (!check.ok) refused();
  };

  if (!source.ok) return null;
  const headingText = partLabel ? `First, show the step for: ${partLabel}` : 'First, show the step';
  const shared = { source, work, onWork, disabled };
  const verdict = !verdictsWithheld && check.done && (asksForCheck ? isChecked : true) && !(skipped && !check.ok);
  return (
    <div role="group" aria-label={headingText} data-show-the-step={kind} data-step-open={open ? 'true' : 'false'} style={BOX}>
      <h4 style={HEADING}>First, show the step</h4>
      <p style={TEXT} data-step-instruction="">{stepInstruction(source)}</p>
      {kind !== CHECKPOINT_KIND.STEP_MOVES && kind !== CHECKPOINT_KIND.PICK_POINTS ? (
        <div style={{ fontSize: 'calc(18 * var(--mm-px))' }}><MathDisplay value={source.of} format="text" /></div>
      ) : null}
      {kind === CHECKPOINT_KIND.PICK_POINTS && <PickPoints {...shared} />}
      {kind === CHECKPOINT_KIND.STEP_MOVES && <StepMoves {...shared} value={value} draftKey={draftKey} verdictsWithheld={verdictsWithheld} onSlip={refused} StepByStepAlgebraCore={StepByStepAlgebraCore} />}
      {kind === CHECKPOINT_KIND.FACTOR_PAIR && <FactorPair {...shared} />}
      {kind === CHECKPOINT_KIND.TABLE_ROW && <TableRows {...shared} />}
      {asksForCheck ? (
        <button type="button" data-step-check="" disabled={disabled || !check.done} onClick={pressCheck} style={{ ...BUTTON(check.done && !disabled), justifySelf: 'start' }}>
          Check my step
        </button>
      ) : null}
      <p role="status" data-step-status="" style={verdict ? NOTE(check.ok ? 'good' : 'warn') : { ...TEXT, color: 'var(--mm-text-muted)' }}>
        {verdict
          ? (check.ok ? `${stepSummary(source, check)} Now answer the part below.` : stepProblemText(source, check))
          : skipped ? 'You chose to answer without this step. It does not change your score. You can still do the step: your teacher sees what you did.'
            : optional ? 'This step is optional for you. Any work you do here is saved with your answer.'
              : carriedOver && !check.done ? 'Your answer from before is kept. Your step was not carried over: you can do it again, and your teacher sees what you do.'
              : verdictsWithheld && attempted ? 'Step recorded. Now answer the part below.'
                : 'The answer box opens when this step is done.'}
      </p>
      {offerSkip ? (
        <button type="button" data-step-skip="" disabled={disabled} onClick={skip} style={{ ...BUTTON(true, true), justifySelf: 'start' }}>
          Answer without this step
        </button>
      ) : null}
    </div>
  );
}
