import React, { useCallback, useMemo, useRef, useState } from 'react';
import { evaluate } from 'mathjs';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey, useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import { Panel, ResultPill, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import { matchesNumericAnswer } from '../shared/toolMath';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import StepByStepAlgebraCore from '../../StepByStepAlgebraCore.jsx';
import { expressionsEquivalent, latexToExpression, expressionToLatex } from '../../algebraAstEngine.js';
import './AlgebraicSystemMode.css';
import {
  normalizeAlgebraicSystemConfig,
  variableIsIsolated,
  isolatedExpressionFor,
  substituteIntoEquation,
  applyEquationMultiplier,
  multiplierProductValue,
  combineCoefficients,
  eliminatesVariable,
  isDegenerateStatement,
  degenerateStatementTruth,
  formatLinearEquation,
  linearEquationCoefficients,
  solveAlgebraicSystem,
  evaluateEquationSides,
  normalizeEquationForStepAlgebra,
  repairPersistedIsolation,
  equationMentionsVariable,
  exactNumberText,
  presentableExpression,
  classroomEquationText,
} from './algebraicSystemsEngine.js';

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #cfd8e6', borderRadius: 9, background: '#fff', fontSize: 15, minHeight: 44 };
const actionStyle = { marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const Field = ({ label, children }) => <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#465267' }}>{label}<div style={{ marginTop: 5 }}>{children}</div></label>;

const secondaryButtonStyle = { ...actionStyle, marginTop: 0, padding: '9px 14px', fontSize: 13, background: '#eef4ff', color: '#174ea6' };
const smallActionStyle = { ...actionStyle, marginTop: 8, padding: '9px 14px', fontSize: 13 };

const classroomEquationLatex = (equationText) => {
  const parts = String(equationText || '').split('=');
  if (parts.length !== 2) return null;
  try {
    return `${expressionToLatex(parts[0].trim())} = ${expressionToLatex(parts[1].trim())}`;
  } catch {
    return null;
  }
};

const classroomAssignmentLatex = (variable, expression) => {
  try {
    return `${variable} = ${expressionToLatex(expression)}`;
  } catch {
    return null;
  }
};

const emptyVerificationEntry = () => ({ placed: {}, leftAnswer: '', rightAnswer: '', checked: false, valid: false });
const emptySpecialCase = () => ({ isTrueAnswer: '', solutionsAnswer: '', classificationAnswer: '' });
const emptyMultiplierWork = () => ({ active: false, a: '', b: '', c: '', checked: false, valid: false });

const equationIdentity = (value) => {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function MathDragToken({
  payloadPrefix,
  payloadValue,
  expression,
  label,
  onArm,
  ariaLabel,
}) {
  const dragPayload = `${payloadPrefix}${payloadValue}`;
  return (
    <button
      type="button"
      className="mathmaster-systems-substitution-token"
      draggable
      onClick={onArm}
      onDragStart={(event) => {
        event.dataTransfer?.setData('text/plain', dragPayload);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
        onArm?.();
      }}
      aria-label={ariaLabel || `Pick up ${expression}`}
      title="Drag this token onto the place you think it belongs. On touch or keyboard, select the token and then select a destination."
    >
      {label ? <span className="mathmaster-systems-token-label">{label}</span> : null}
      <MathDisplay value={expression} format="ascii-math" inline />
      <span aria-hidden="true" className="mathmaster-systems-token-grip">⠿</span>
    </button>
  );
}

export function SubstitutionToken({ variable, expression, onArm, label = null }) {
  return (
    <MathDragToken
      payloadPrefix="mathmaster-substitution:"
      payloadValue={variable}
      expression={expression}
      label={label}
      onArm={onArm}
      ariaLabel={`Pick up the expression ${expression} from the isolated equation`}
    />
  );
}

export function VariableDropEquation({
  equationText,
  variables,
  onVariableAttempt,
  tokenArmed = false,
  armedPayloadValue = null,
  payloadPrefix = 'mathmaster-substitution:',
  placedValues = {},
  label = 'Equation',
}) {
  const [dragOverVariable, setDragOverVariable] = useState(null);
  const pattern = useMemo(
    () => new RegExp(`(${variables.map(escapeRegex).sort((a, b) => b.length - a.length).join('|')})`, 'g'),
    [variables],
  );
  const parts = useMemo(() => String(equationText || '').split(pattern), [equationText, pattern]);

  return (
    <div className="mathmaster-systems-drop-equation" role="group" aria-label={label}>
      {parts.map((part, index) => {
        if (!variables.includes(part)) {
          // Typeset minus, not a hyphen: "= −y − z" instead of "=- y - z".
          return <span key={`text-${index}`} className="mathmaster-systems-equation-text">{part.replace(/-/g, '\u2212')}</span>;
        }
        const hasPlacedValue = Object.prototype.hasOwnProperty.call(placedValues || {}, part);
        return (
          <button
            key={`variable-${index}-${part}`}
            type="button"
            className={`mathmaster-systems-variable-drop${tokenArmed ? ' is-armed' : ''}${dragOverVariable === part ? ' is-drag-over' : ''}${hasPlacedValue ? ' is-filled' : ''}`}
            data-variable={part}
            onClick={() => { if (tokenArmed) onVariableAttempt(part, armedPayloadValue); }}
            onDragEnter={(event) => {
              if (event.dataTransfer?.types?.includes('text/plain')) {
                event.preventDefault();
                setDragOverVariable(part);
              }
            }}
            onDragOver={(event) => {
              if (event.dataTransfer?.types?.includes('text/plain')) {
                event.preventDefault();
                setDragOverVariable(part);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDragOverVariable((current) => current === part ? null : current);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOverVariable(null);
              const payload = event.dataTransfer?.getData('text/plain') || '';
              if (!payload.startsWith(payloadPrefix)) return;
              onVariableAttempt(part, payload.slice(payloadPrefix.length));
            }}
            aria-label={hasPlacedValue
              ? `Variable ${part} currently has value ${placedValues[part]}`
              : `Variable ${part}. Drop the selected math token here`}
            title="Drop the selected value or expression here if you think it belongs at this variable."
          >
            {hasPlacedValue ? <MathDisplay value={String(placedValues[part])} format="ascii-math" inline /> : part}
          </button>
        );
      })}
    </div>
  );
}

export function SystemsWorkTrail({ stages = [] }) {
  const activeIndex = stages.findIndex((stage) => !stage.complete);
  return (
    <div className="mathmaster-systems-work-trail">
      <div className="mathmaster-systems-work-trail-steps" aria-label="Systems solving progress">
        {stages.map((stage, index) => {
          const active = activeIndex === index || (activeIndex < 0 && index === stages.length - 1);
          return (
            <div
              key={stage.id}
              className={`mathmaster-systems-work-step${stage.complete ? ' is-complete' : ''}${active ? ' is-active' : ''}`}
            >
              <span aria-hidden="true">{stage.complete ? '✓' : index + 1}</span>
              <strong>{stage.label}</strong>
            </div>
          );
        })}
      </div>
      <div className="mathmaster-systems-completed-work">
        {stages.filter((stage) => stage.complete && (stage.summary || stage.summaryMath || stage.summaryLatex)).map((stage) => (
          <div key={`summary-${stage.id}`} className="mathmaster-systems-completed-chip">
            <span aria-hidden="true">✓</span>
            {stage.summaryPrefix ? <span>{stage.summaryPrefix}</span> : null}
            {stage.summaryMath || stage.summaryLatex ? (
              <span
                className="mathmaster-systems-completed-math"
                data-summary-math={stage.summaryMath || ''}
                aria-label={stage.summaryMath || stage.summaryLatex}
              >
                <MathDisplay
                  value={stage.summaryLatex || stage.summaryMath}
                  format={stage.summaryLatex ? 'latex' : 'ascii-math'}
                  inline
                />
              </span>
            ) : <span>{stage.summary}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const cleanCoefficient = (value) => {
  const rounded = Math.round(Number(value) * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const coefficientTermText = (value, variable) => {
  const coefficient = cleanCoefficient(value);
  if (coefficient === 0) return `0${variable}`;
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${coefficient}${variable}`;
};

function AlignedEquationRow({ equationText, variables, targetVariable, multiplier = null, cancelled = false, label, onTargetTermClick = null }) {
  const coefficients = useMemo(() => linearEquationCoefficients(equationText, variables), [equationText, variables]);
  if (!coefficients) {
    return (
      <div className="mathmaster-systems-aligned-equation-row">
        {label ? <span className="mathmaster-systems-equation-row-label">{label}</span> : null}
        <MathDisplay value={equationText} format="ascii-math" inline />
      </div>
    );
  }
  const entries = [
    { variable: variables[0], value: coefficients.a },
    { variable: variables[1], value: coefficients.b },
  ];
  return (
    <div className="mathmaster-systems-aligned-equation-row">
      {label ? <span className="mathmaster-systems-equation-row-label">{label}</span> : null}
      {multiplier != null ? <span className="mathmaster-systems-applied-multiplier">· {multiplier}</span> : null}
      <div className="mathmaster-systems-equation-columns">
        {entries.map((entry, index) => (
          entry.variable === targetVariable && onTargetTermClick ? (
            <button
              key={entry.variable}
              type="button"
              className={`mathmaster-systems-equation-term mathmaster-systems-cancellation-target is-target-column${cancelled ? ' is-cancelled' : ''}`}
              onClick={onTargetTermClick}
              aria-pressed={cancelled}
              aria-label={`${cancelled ? 'Unmark' : 'Mark'} ${coefficientTermText(entry.value, entry.variable)} for elimination cancellation`}
            >
              {index === 1 && cleanCoefficient(entry.value) >= 0 ? '+ ' : ''}
              {coefficientTermText(entry.value, entry.variable)}
            </button>
          ) : (
            <span
              key={entry.variable}
              className={`mathmaster-systems-equation-term${entry.variable === targetVariable ? ' is-target-column' : ''}${cancelled && entry.variable === targetVariable ? ' is-cancelled' : ''}`}
            >
              {index === 1 && cleanCoefficient(entry.value) >= 0 ? '+ ' : ''}
              {coefficientTermText(entry.value, entry.variable)}
            </span>
          )
        ))}
        <span className="mathmaster-systems-equation-equals">=</span>
        <span className="mathmaster-systems-equation-constant">{cleanCoefficient(coefficients.c)}</span>
      </div>
    </div>
  );
}

/** Extracts the plain-expression value a solved Step Algebra equation isolated `variable` to. */
export const solvedExpressionFor = (latexResponse, variable) => {
  try {
    const plain = latexToExpression(latexResponse);
    const expression = isolatedExpressionFor(plain, variable);
    return expression == null ? null : presentableExpression(expression);
  } catch {
    return null;
  }
};

export const solvedNumberFor = (latexResponse, variable) => {
  const expr = solvedExpressionFor(latexResponse, variable);
  if (expr == null) return null;
  try {
    const value = Number(evaluate(expr));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const solvedRecordFor = (latexResponse, variable) => {
  const expression = solvedExpressionFor(latexResponse, variable);
  if (expression == null) return null;
  try {
    const value = Number(evaluate(expression));
    return Number.isFinite(value) ? { variable, value, expression } : null;
  } catch {
    return null;
  }
};

const solvedRecordExpression = (record) => {
  const exact = String(record?.expression || '').trim();
  return exact ? presentableExpression(exact) : exactNumberText(record?.value);
};

/*
 * The one seam this feature opens into the existing, mature equation solver.
 *
 * Every isolation, every one-variable solve, and every back-substitution solve
 * in this workspace is handed to `StepByStepAlgebraCore` — the same balanced-
 * operation, distribution and cancellation engine standalone Step Algebra
 * questions use. This component only watches for the moment Step Algebra
 * itself reports the equation solved (`isSolvedEquation`, inside the core) and
 * reports the resulting text one level up. It never solves, isolates, or
 * simplifies anything itself.
 */
export function EmbeddedStepAlgebra({ label, prompt, equationText, solveFor, draftKey, onSolved, onUndoStateChange, workspaceDifficulty, autoReveal = false, autoOpenDistribution = false, simplifyDistributedProducts = false, inlineExpressionTools = true, objective = null, requireSimplifiedFinalForm = false, showHint = true }) {
  const normalizedEquationText = useMemo(() => {
    try {
      return normalizeEquationForStepAlgebra(equationText);
    } catch {
      return equationText;
    }
  }, [equationText]);
  // `objective` lets a reduction ask for a finished standard form instead of an
  // isolated variable; `requireSimplifiedFinalForm` makes a value solve end on
  // the student's own simplified number, so the workspace never evaluates
  // x = 6 - (-1) - 3 on their behalf (#341). Both default off, which is the
  // exact question every existing 2×2 embed has always built.
  // Keyed by VALUE: a caller writing `objective={{ ... }}` inline must not hand
  // Step Algebra a new question on every render, which restarts its setup.
  const objectiveKey = objective ? JSON.stringify(objective) : '';
  const question = useMemo(() => ({
    equation: normalizedEquationText,
    solveFor,
    prompt,
    workspaceDifficulty,
    ...(objectiveKey ? { objective: JSON.parse(objectiveKey) } : {}),
    ...(requireSimplifiedFinalForm ? { requireSimplifiedFinalForm: true } : {}),
    ...(showHint ? {} : { showHint: false }),
  }), [normalizedEquationText, solveFor, prompt, workspaceDifficulty, objectiveKey, requireSimplifiedFinalForm, showHint]);
  const hostRef = useRef(null);
  const lastReportedRef = useRef(null);
  const embeddedEquationIdentity = useMemo(
    () => `${draftKey || 'embedded'}:${solveFor || ''}:${equationIdentity(normalizedEquationText)}`,
    [draftKey, normalizedEquationText, solveFor],
  );

  React.useEffect(() => {
    lastReportedRef.current = null;
  }, [embeddedEquationIdentity]);

  React.useEffect(() => {
    if (!autoReveal || !hostRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      hostRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      hostRef.current?.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoReveal, normalizedEquationText]);
  const handleStateChange = useCallback((payload) => {
    const part = payload?.parts?.find((p) => p?.id === 'algebra-objective');
    if (!part?.isComplete || !part.response) return;
    if (lastReportedRef.current === part.response) return;
    lastReportedRef.current = part.response;
    onSolved(part.response);
  }, [onSolved]);
  return (
    <div ref={hostRef} tabIndex={-1} className="mathmaster-systems-embedded-step-algebra">
      {label ? <div style={{ marginBottom: 8, fontWeight: 800 }}>{label}</div> : null}
      <StepByStepAlgebraCore
        key={embeddedEquationIdentity}
        question={question}
        questionRecord={null}
        draftKey={draftKey}
        onStateChange={handleStateChange}
        onStepGrade={null}
        onUndoStateChange={onUndoStateChange}
        autoOpenDistribution={autoOpenDistribution}
        simplifyDistributedProducts={simplifyDistributedProducts}
        inlineExpressionTools={inlineExpressionTools}
      />
    </div>
  );
}

/**
 * The reduced subsystem's solution as its own draft record holds it, so a 3×3
 * parent restored from a draft knows the subsystem is solved on its FIRST
 * render instead of flashing the finished subsystem open for a frame. The
 * field names are this component's, which is why the reader lives here.
 */
export const subsystemReportFromDraft = (record) => {
  const first = record?.firstSolved;
  const second = record?.secondSolved;
  if (!first?.variable || !second?.variable || first.value == null || second.value == null) return null;
  const firstValue = Number(first.value);
  const secondValue = Number(second.value);
  if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) return null;
  return {
    solution: { [first.variable]: firstValue, [second.variable]: secondValue },
    detail: {
      selection: record.selection || null,
      isolation: record.isolation ? { expression: record.isolation.expression ?? null, tokenExpression: record.isolation.tokenExpression ?? null } : null,
      substitution: record.substitution || null,
      firstSolved: first,
      backSub: record.backSub || null,
      secondSolved: second,
    },
  };
};

/*
 * `subsystem` (#341): the SAME 2×2 workflow, run as the reduced system inside a
 * 3×3 substitution. The parent (SubstitutionReductionMode) mounts it under its
 * own draft scope and Undo channel, so every field below persists and undoes
 * exactly as it does in a standalone 2×2 question. In this role it:
 *   - labels its equations with the parent's lineage names (R₁, R₂);
 *   - solves values in simplified final form and writes them exactly (7/3,
 *     never 2.3333333333333335);
 *   - owns no submission, verification or hint panel — it reports its
 *     solution (or its absence, after an Undo) through `onSolutionChange`, and
 *     the parent verifies in all three ORIGINAL equations.
 */
export default function AlgebraicSystemMode({ questionData = {}, onAction, draftKey = null, subsystem = null }) {
  const config = useMemo(() => normalizeAlgebraicSystemConfig(questionData), [questionData]);
  const { variables, equations } = config;
  const equationName = (index) => subsystem?.equationLabels?.[index] || `Equation ${index + 1}`;
  const valueText = (value) => (subsystem ? exactNumberText(value) : String(value));

  const [method, setMethod] = usePersistentToolState('method', config.method === 'studentChoice' ? '' : config.method);
  const effectiveMethod = config.method === 'studentChoice' ? method : config.method;

  const [selection, setSelection] = usePersistentToolState('selection', { equationIndex: null, variable: null });
  const [storedIsolation, setIsolation] = usePersistentToolState('isolation', { expression: null, tokenExpression: null, simplificationDraft: '', simplifying: false, simplificationChecked: false, simplificationValid: false });
  // A draft saved before issue #334 can hold Step Algebra's LaTeX spacing
  // ("-(3)+(2~ y)") in these plain-expression fields. Every read goes through
  // the repair, so a reopened question behaves exactly like a fresh one.
  const isolation = useMemo(() => repairPersistedIsolation(storedIsolation), [storedIsolation]);
  const [substitution, setSubstitution] = usePersistentToolState('substitution', { targetVariable: null, targetEquationIndex: null, equationText: null });
  const [multipliers, setMultipliers] = usePersistentToolState('multipliers', { 0: '1', 1: '1' });
  const [appliedMultipliers, setAppliedMultipliers] = usePersistentToolState('appliedMultipliers', { 0: false, 1: false });
  const [multiplierWork, setMultiplierWork] = usePersistentToolState('multiplierWork', { 0: emptyMultiplierWork(), 1: emptyMultiplierWork() });
  const [combination, setCombination] = usePersistentToolState('combination', {
    operation: null,
    attempts: 0,
    coefficients: null,
    text: null,
    pendingCoefficients: null,
    cancelledRows: { 0: false, 1: false },
  });
  const [firstSolved, setFirstSolved] = usePersistentToolState('firstSolved', { variable: null, value: null, expression: null });
  const [specialCase, setSpecialCase] = usePersistentToolState('specialCase', null);
  const [backSub, setBackSub] = usePersistentToolState('backSub', { equationIndex: null });
  const [secondSolved, setSecondSolved] = usePersistentToolState('secondSolved', { variable: null, value: null, expression: null });
  const [verification, setVerification] = usePersistentToolState('verification', { 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
  const [methodEfficiencyReason, setMethodEfficiencyReason] = usePersistentToolState('methodEfficiencyReason', '');
  // Which slot the student's last substitution attempt landed on. Interaction
  // feedback only — the moment a correct placement is made, the actual
  // mathematics goes into `substitution`, which is draft-backed above.
  const [slotAttempt, setSlotAttempt] = useState(null);
  // While a nested Step Algebra solve is on screen, its own step history must
  // own the universal Undo button. Otherwise the parent systems history sees
  // only stage-level changes and Undo appears broken during the actual algebra.
  const [embeddedUndoController, setEmbeddedUndoController] = useState(null);
  const { feedback, submit } = useToolSubmission(onAction);

  const resetFromSelection = useCallback(() => {
    setSelection({ equationIndex: null, variable: null });
    setIsolation({ expression: null, tokenExpression: null, simplificationDraft: '', simplifying: false, simplificationChecked: false, simplificationValid: false });
    setSubstitution({ targetVariable: null, targetEquationIndex: null, equationText: null });
    setMultipliers({ 0: '1', 1: '1' });
    setAppliedMultipliers({ 0: false, 1: false });
    setMultiplierWork({ 0: emptyMultiplierWork(), 1: emptyMultiplierWork() });
    setCombination({ operation: null, attempts: 0, coefficients: null, text: null, pendingCoefficients: null, cancelledRows: { 0: false, 1: false } });
    setFirstSolved({ variable: null, value: null, expression: null });
    setSpecialCase(null);
    setBackSub({ equationIndex: null });
    setSecondSolved({ variable: null, value: null, expression: null });
    setVerification({ 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
    setSlotAttempt(null);
  }, []);

  const resetFromBackSub = useCallback(() => {
    setBackSub({ equationIndex: null });
    setSecondSolved({ variable: null, value: null, expression: null });
    setVerification({ 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
    setSlotAttempt(null);
  }, []);

  const mathState = useMemo(() => ({
    method, selection, isolation, substitution, multipliers, appliedMultipliers, multiplierWork, combination,
    firstSolved, specialCase, backSub, secondSolved, verification, methodEfficiencyReason,
  }), [method, selection, isolation, substitution, multipliers, appliedMultipliers, multiplierWork, combination, firstSolved, specialCase, backSub, secondSolved, verification, methodEfficiencyReason]);
  const restore = useCallback((value) => {
    setMethod(value?.method ?? (config.method === 'studentChoice' ? '' : config.method));
    setSelection(value?.selection || { equationIndex: null, variable: null });
    setIsolation({ expression: null, tokenExpression: null, simplificationDraft: '', simplifying: false, simplificationChecked: false, simplificationValid: false, ...(value?.isolation || {}) });
    setSubstitution({ targetVariable: null, targetEquationIndex: null, equationText: null, ...(value?.substitution || {}) });
    setMultipliers(value?.multipliers || { 0: '1', 1: '1' });
    setAppliedMultipliers(value?.appliedMultipliers || { 0: false, 1: false });
    setMultiplierWork(value?.multiplierWork || { 0: emptyMultiplierWork(), 1: emptyMultiplierWork() });
    setCombination({
      operation: null,
      attempts: 0,
      coefficients: null,
      text: null,
      pendingCoefficients: null,
      cancelledRows: { 0: false, 1: false },
      ...(value?.combination || {}),
    });
    setFirstSolved({ variable: null, value: null, expression: null, ...(value?.firstSolved || {}) });
    setSpecialCase(value?.specialCase || null);
    setBackSub(value?.backSub || { equationIndex: null });
    setSecondSolved({ variable: null, value: null, expression: null, ...(value?.secondSolved || {}) });
    setVerification(value?.verification || { 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
    setMethodEfficiencyReason(value?.methodEfficiencyReason || '');
  }, [config.method]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last algebraic-systems edit',
    state: mathState,
    onRestore: restore,
    resetKey: questionUndoResetKey(questionData),
    ...(subsystem ? { ownerId: 'algebraic-subsystem-history' } : {}),
  });

  // The open Step Algebra owns Undo only while it has something to undo. A
  // freshly opened solver used to hold the button disabled; now the press falls
  // through to the systems history — the next most local action (#341).
  useActiveUndoOwner({
    id: subsystem ? 'algebraic-subsystem-embedded-step-algebra' : 'algebraic-system-embedded-step-algebra',
    active: Boolean(embeddedUndoController?.canUndo),
    priority: 50,
    controller: embeddedUndoController,
  });

  const activeUndoCapability = embeddedUndoController?.canUndo
    ? {
      label: '↶ Undo',
      title: embeddedUndoController.label || 'Undo the last algebra step',
      onAction: () => embeddedUndoController.onUndo?.(),
      disabled: false,
      studentState: true,
    }
    : undoHistory.capability;

  // --- Derived workflow state -------------------------------------------
  const removedVariable = selection.variable; // isolated first (substitution) / targeted for elimination
  const survivingVariable = removedVariable ? variables.find((v) => v !== removedVariable) : null;
  const selectionMade = selection.equationIndex != null && Boolean(selection.variable);

  const sourceEquationText = selectionMade ? equations[selection.equationIndex] : null;
  const otherIndex = selectionMade ? 1 - selection.equationIndex : null;
  const alreadyIsolated = sourceEquationText ? variableIsIsolated(sourceEquationText, selection.variable) : false;
  const isolatedExpr = alreadyIsolated ? isolatedExpressionFor(sourceEquationText, selection.variable) : isolation.expression;
  const isolationDone = Boolean(isolatedExpr);
  const substitutionTokenExpression = String(isolation.tokenExpression || '').trim() || null;
  const substitutionTokenReady = Boolean(substitutionTokenExpression);

  const multipliedEq = useCallback((index) => {
    try {
      return applyEquationMultiplier(equations[index], latexToExpression(multipliers[index]), variables);
    } catch {
      return null;
    }
  }, [equations, multipliers, variables]);
  const multiplierIsIdentity = useCallback((index) => {
    try {
      const value = Number(evaluate(latexToExpression(multipliers[index])));
      return Number.isFinite(value) && Math.abs(value - 1) <= 1e-9;
    } catch {
      return false;
    }
  }, [multipliers]);
  // A factor of 1 means the equation is already prepared. Do not make the
  // student perform or confirm a meaningless "multiply by 1" step.
  const multiplierRowReady = useCallback(
    (index) => appliedMultipliers[index] || multiplierIsIdentity(index),
    [appliedMultipliers, multiplierIsIdentity],
  );
  const multipliersApplied = multiplierRowReady(0) && multiplierRowReady(1);
  const combinationLocked = Boolean(combination.text);
  const cancellationPending = Boolean(combination.pendingCoefficients && !combination.text);
  const cancellationComplete = Boolean(combination.cancelledRows?.[0] && combination.cancelledRows?.[1]);

  const reduceInputText = effectiveMethod === 'substitution' ? substitution.equationText : combination.text;
  const reduceCoefficients = effectiveMethod === 'substitution'
    ? (reduceInputText ? linearEquationCoefficients(reduceInputText, variables) : null)
    : combination.coefficients;
  const isDegenerate = reduceCoefficients ? isDegenerateStatement(reduceCoefficients) : false;
  const degenerateTruth = isDegenerate ? degenerateStatementTruth(reduceCoefficients) : null;

  const firstSolvedDone = firstSolved.value != null;
  const firstSolvedExpression = firstSolvedDone ? solvedRecordExpression(firstSolved) : '';
  const backSubChosen = backSub.equationIndex != null;
  const backSubEquationText = (backSubChosen && firstSolvedDone)
    ? substituteIntoEquation(equations[backSub.equationIndex], survivingVariable, firstSolvedExpression)
    : null;
  const secondSolvedDone = secondSolved.value != null;
  const secondSolvedExpression = secondSolvedDone ? solvedRecordExpression(secondSolved) : '';
  const solution = secondSolvedDone ? { [survivingVariable]: firstSolved.value, [removedVariable]: secondSolved.value } : null;
  const solutionExpressions = secondSolvedDone
    ? { [survivingVariable]: firstSolvedExpression, [removedVariable]: secondSolvedExpression }
    : null;
  const displayedIsolationExpression = presentableExpression(substitutionTokenExpression || isolatedExpr || '');

  // Subsystem role: report the solution the moment it exists, and its absence
  // the moment an Undo takes it back. The parent mirrors it; this component's
  // draft-backed fields remain the source of truth.
  const onSubsystemSolutionChange = subsystem?.onSolutionChange;
  const subsystemSolutionKey = solution ? JSON.stringify(solution) : '';
  React.useEffect(() => {
    if (!onSubsystemSolutionChange) return;
    onSubsystemSolutionChange(solution ? {
      solution,
      detail: {
        selection,
        isolation: { expression: isolatedExpr, tokenExpression: substitutionTokenExpression },
        substitution,
        firstSolved,
        backSub,
        secondSolved,
      },
    } : null);
    // Keyed on the solution itself: re-reporting an identical solution on
    // every render would churn the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSubsystemSolutionChange, subsystemSolutionKey]);

  // Only the variables an equation actually contains can be placed in it; a
  // zero-coefficient equation (2x = 6) must not wait forever for a y.
  const bothPlaced = (index) => variables
    .filter((v) => equationMentionsVariable(equations[index], v))
    .every((v) => verification[index]?.placed?.[v]);
  const allVerified = solution && verification[0].checked && verification[0].valid && verification[1].checked && verification[1].valid;

  // --- Handlers ------------------------------------------------------------
  const chooseSelection = (equationIndex, variable) => {
    // A variable that does not appear in the chosen equation cannot be
    // isolated from it; opening Step Algebra would strand the student. Say so
    // neutrally and leave the choice with them.
    if (equationIndex != null && !equationMentionsVariable(equations[equationIndex], variable)) {
      setSlotAttempt({ stage: 'selection', equationIndex, variable, correct: false, reason: 'variable-absent', armed: false });
      return;
    }
    resetFromSelection();
    setSelection({ equationIndex, variable });
  };

  const handleIsolated = useCallback((latexResponse) => {
    const expr = solvedExpressionFor(latexResponse, selection.variable);
    if (expr == null) return;
    setIsolation({
      // -(3) + (2y) reads as -3 + 2y: redundant grouping only, same tree.
      expression: presentableExpression(expr),
      tokenExpression: null,
      simplificationDraft: '',
      simplifying: false,
      simplificationChecked: false,
      simplificationValid: false,
    });
  }, [selection.variable]);

  const useIsolatedExpressionAsToken = () => {
    if (!isolatedExpr) return;
    setIsolation((current) => ({
      ...current,
      tokenExpression: isolatedExpr,
      simplifying: false,
      simplificationChecked: false,
      simplificationValid: false,
    }));
    setSlotAttempt(null);
  };

  const startOptionalIsolationSimplification = () => {
    setIsolation((current) => ({
      ...current,
      tokenExpression: null,
      simplifying: true,
      simplificationDraft: current?.simplificationDraft || '',
      simplificationChecked: false,
      simplificationValid: false,
    }));
    setSlotAttempt(null);
  };

  const setIsolationSimplificationDraft = (value) => {
    setIsolation((current) => ({
      ...current,
      simplificationDraft: value,
      simplificationChecked: false,
      simplificationValid: false,
    }));
  };

  const checkAndUseIsolationSimplification = () => {
    const draft = String(isolation.simplificationDraft || '').trim();
    if (!draft || !isolatedExpr) {
      setIsolation((current) => ({ ...current, simplificationChecked: true, simplificationValid: false }));
      return;
    }
    const valid = expressionsEquivalent(draft, isolatedExpr, selection.variable);
    if (!valid) {
      setIsolation((current) => ({ ...current, simplificationChecked: true, simplificationValid: false }));
      return;
    }
    let tokenExpression = draft;
    try {
      tokenExpression = latexToExpression(draft);
    } catch {
      // MathInput can return plain ASCII math already. Equivalence was proven
      // above, so the student's visible expression remains safe to substitute.
    }
    setIsolation((current) => ({
      ...current,
      tokenExpression,
      simplificationDraft: draft,
      simplifying: false,
      simplificationChecked: true,
      simplificationValid: true,
    }));
    setSlotAttempt(null);
  };

  const changeSubstitutionTokenExpression = () => {
    setIsolation((current) => ({
      ...current,
      tokenExpression: null,
      simplifying: false,
      simplificationChecked: false,
      simplificationValid: false,
    }));
    setSlotAttempt(null);
  };

  const attemptSubstitution = (equationIndex, clickedVariable) => {
    const sameEquation = equationIndex === selection.equationIndex;
    if (sameEquation) {
      setSlotAttempt({
        stage: 'substitution',
        equationIndex,
        variable: clickedVariable,
        correct: false,
        reason: 'source-equation',
        armed: true,
      });
      return;
    }
    if (clickedVariable !== selection.variable) {
      setSlotAttempt({
        stage: 'substitution',
        equationIndex,
        variable: clickedVariable,
        correct: false,
        reason: 'wrong-variable',
        armed: true,
      });
      return;
    }
    const replacementExpression = substitutionTokenExpression || isolatedExpr;
    // Draft-backed token text can survive a deploy. Try the exact prepared
    // token first, then the original isolated expression as a mathematically
    // equivalent recovery path. Both came from this same isolation step; an
    // optional rewritten token was equivalence-checked before it was accepted.
    // This prevents old presentation syntax from permanently stranding a
    // student on the substitution board.
    const replacementCandidates = [...new Set(
      [replacementExpression, isolatedExpr]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )];
    let reducedEquation = null;
    let acceptedReplacementExpression = null;
    for (const candidate of replacementCandidates) {
      try {
        reducedEquation = substituteIntoEquation(
          equations[equationIndex],
          selection.variable,
          candidate,
        );
        acceptedReplacementExpression = candidate;
        break;
      } catch {
        // Try the next equivalent machine-safe form before showing an error.
      }
    }
    if (!reducedEquation) {
      setSlotAttempt({
        stage: 'substitution',
        equationIndex,
        variable: clickedVariable,
        correct: false,
        reason: 'expression-parse',
        armed: true,
      });
      return;
    }
    if (acceptedReplacementExpression !== replacementExpression) {
      setIsolation((current) => ({
        ...current,
        tokenExpression: acceptedReplacementExpression,
      }));
    }

    // Do not run the completed substitution back through the coefficient
    // sampler here. The source expression was either produced by Step Algebra
    // or equivalence-checked before becoming a token, and the target variable
    // and equation have already been validated above. Sampling a perfectly
    // valid but presentation-heavy expression (for example -(3) + (2y)) can
    // return null even though Step Algebra can solve it. That false negative
    // was what stranded Classwork Q2. Once substitution parses successfully,
    // hand the exact reduced equation to Step Algebra and let the solver own
    // the remaining algebra.

    setSubstitution({
      targetVariable: selection.variable,
      targetEquationIndex: equationIndex,
      equationText: reducedEquation,
    });
    setSlotAttempt(null);
  };

  const parseNumericEntry = (value) => {
    try {
      const numeric = Number(evaluate(latexToExpression(value)));
      return Number.isFinite(numeric) ? numeric : NaN;
    } catch {
      return NaN;
    }
  };

  const resetCombination = () => setCombination({
    operation: null,
    attempts: 0,
    coefficients: null,
    text: null,
    pendingCoefficients: null,
    cancelledRows: { 0: false, 1: false },
  });

  const setMultiplierValue = (index, value) => {
    setMultipliers((current) => ({ ...current, [index]: value }));
    setAppliedMultipliers((current) => ({ ...current, [index]: false }));
    setMultiplierWork((current) => ({ ...current, [index]: emptyMultiplierWork() }));
    resetCombination();
  };

  const setMultiplierProduct = (index, field, value) => {
    setMultiplierWork((current) => ({
      ...current,
      [index]: {
        ...(current[index] || emptyMultiplierWork()),
        [field]: value,
        checked: false,
        valid: false,
      },
    }));
  };

  const checkMultiplierProducts = (index) => {
    const expected = multipliedEq(index);
    if (!expected) {
      setSlotAttempt({ stage: 'multiplier', index, correct: false, reason: 'invalid-multiplier', armed: true });
      return;
    }
    const work = multiplierWork[index] || emptyMultiplierWork();
    const supplied = {
      a: multiplierProductValue(work.a, variables[0], variables),
      b: multiplierProductValue(work.b, variables[1], variables),
      c: multiplierProductValue(work.c, null, variables),
    };
    const valid = ['a', 'b', 'c'].every((key) => (
      Number.isFinite(supplied[key])
      && Math.abs(supplied[key] - expected.coefficients[key]) <= 1e-7
    ));
    setMultiplierWork((current) => ({
      ...current,
      [index]: { ...(current[index] || emptyMultiplierWork()), checked: true, valid },
    }));
    if (!valid) {
      setSlotAttempt({ stage: 'multiplier-products', index, correct: false, reason: 'incorrect-products', armed: false });
      return;
    }
    setAppliedMultipliers((current) => ({ ...current, [index]: true }));
    setSlotAttempt({ stage: 'multiplier-products', index, correct: true, armed: false });
  };

  const applyMultiplier = (index) => {
    const parsed = multipliedEq(index);
    if (!parsed) {
      setSlotAttempt({ stage: 'multiplier', index, correct: false, reason: 'invalid-multiplier', armed: true });
      return;
    }
    let numericMultiplier = NaN;
    try {
      numericMultiplier = Number(evaluate(latexToExpression(multipliers[index])));
    } catch {
      numericMultiplier = NaN;
    }

    // ×1 changes no coefficient. The student still had to choose and place the
    // multiplier token on the whole equation, so no extra product-entry step is
    // needed. Every real scaling step must be calculated by the student.
    if (Number.isFinite(numericMultiplier) && Math.abs(numericMultiplier - 1) <= 1e-9) {
      setAppliedMultipliers((current) => ({ ...current, [index]: true }));
      setMultiplierWork((current) => ({ ...current, [index]: { ...emptyMultiplierWork(), valid: true } }));
      setSlotAttempt({ stage: 'multiplier', index, correct: true, armed: false });
      return;
    }

    setAppliedMultipliers((current) => ({ ...current, [index]: false }));
    setMultiplierWork((current) => ({
      ...current,
      [index]: { ...emptyMultiplierWork(), active: true },
    }));
    setSlotAttempt({ stage: 'multiplier-products', index, correct: null, armed: false });
  };

  const armMultiplier = (index) => {
    setSlotAttempt({ stage: 'multiplier', index, correct: null, armed: true });
  };

  const dropMultiplier = (targetIndex, payloadIndex = targetIndex) => {
    if (Number(payloadIndex) !== targetIndex) {
      setSlotAttempt({ stage: 'multiplier', index: targetIndex, sourceIndex: Number(payloadIndex), correct: false, reason: 'wrong-equation', armed: true });
      return;
    }
    applyMultiplier(targetIndex);
  };

  const handleCombine = (operation) => {
    const eq0 = multipliedEq(0);
    const eq1 = multipliedEq(1);
    if (!eq0 || !eq1) return;
    const combined = combineCoefficients(eq0.coefficients, eq1.coefficients, operation);
    const eliminates = eliminatesVariable(combined, selection.variable, variables);
    setCombination((current) => ({
      operation,
      attempts: current.attempts + 1,
      coefficients: null,
      text: null,
      pendingCoefficients: eliminates ? combined : null,
      cancelledRows: { 0: false, 1: false },
    }));
    setSlotAttempt({ stage: 'combine', operation, correct: eliminates, armed: !eliminates });
  };

  const toggleCancellationRow = (index) => {
    if (!cancellationPending) return;
    setCombination((current) => ({
      ...current,
      cancelledRows: {
        ...(current.cancelledRows || { 0: false, 1: false }),
        [index]: !current.cancelledRows?.[index],
      },
    }));
  };

  const confirmEliminationCancellation = () => {
    if (!cancellationPending || !cancellationComplete) return;
    const combined = combination.pendingCoefficients;
    setCombination((current) => ({
      ...current,
      coefficients: combined,
      text: formatLinearEquation(combined, variables),
      pendingCoefficients: null,
    }));
    setSlotAttempt({ stage: 'cancellation', correct: true, armed: false });
  };

  const handleReduceSolved = useCallback((latexResponse) => {
    const solved = solvedRecordFor(latexResponse, survivingVariable);
    if (!solved) return;
    setFirstSolved(solved);
  }, [survivingVariable]);

  const chooseSpecialCaseField = (field, value) => {
    setSpecialCase((current) => ({ ...(current || emptySpecialCase()), [field]: value }));
  };

  const chooseBackSub = (equationIndex) => {
    resetFromBackSub();
    setBackSub({ equationIndex });
  };

  const attemptBackSubstitution = (equationIndex, clickedVariable) => {
    if (clickedVariable !== survivingVariable) {
      setSlotAttempt({ stage: 'backSubstitution', equationIndex, variable: clickedVariable, correct: false, armed: true });
      return;
    }
    setSlotAttempt({ stage: 'backSubstitution', equationIndex, variable: clickedVariable, correct: true, armed: false });
    chooseBackSub(equationIndex);
  };

  const handleSecondSolved = useCallback((latexResponse) => {
    const solved = solvedRecordFor(latexResponse, removedVariable);
    if (!solved) return;
    setSecondSolved(solved);
  }, [removedVariable]);

  const armVerificationValue = (variable) => {
    setSlotAttempt({ stage: 'verification', tokenVariable: variable, correct: null, armed: true });
  };

  const placeVerificationValue = (index, targetVariable, tokenVariable) => {
    if (!tokenVariable) return;
    if (targetVariable !== tokenVariable) {
      setSlotAttempt({
        stage: 'verification',
        equationIndex: index,
        tokenVariable,
        variable: targetVariable,
        correct: false,
        armed: true,
      });
      return;
    }
    setVerification((current) => ({
      ...current,
      [index]: {
        ...current[index],
        placed: { ...current[index].placed, [targetVariable]: true },
        checked: false,
        valid: false,
      },
    }));
    setSlotAttempt({ stage: 'verification', tokenVariable, variable: targetVariable, correct: true, armed: false });
  };
  const setVerificationAnswer = (index, side, value) => {
    setVerification((current) => ({ ...current, [index]: { ...current[index], [side]: value, checked: false } }));
  };
  const numericVerificationEntry = parseNumericEntry;

  const checkVerification = (index) => {
    const actual = evaluateEquationSides(equations[index], solution);
    const leftValue = numericVerificationEntry(verification[index].leftAnswer);
    const rightValue = numericVerificationEntry(verification[index].rightAnswer);
    const leftOk = Number.isFinite(leftValue) && Math.abs(leftValue - actual.left) <= 0.05;
    const rightOk = Number.isFinite(rightValue) && Math.abs(rightValue - actual.right) <= 0.05;
    const equalityHolds = Math.abs(actual.left - actual.right) < 1e-6;
    setVerification((current) => ({ ...current, [index]: { ...current[index], checked: true, valid: leftOk && rightOk && equalityHolds } }));
  };

  const specialCaseAnswered = specialCase?.isTrueAnswer && specialCase?.solutionsAnswer && specialCase?.classificationAnswer;
  const specialCaseCorrect = specialCase && degenerateTruth && (
    (specialCase.isTrueAnswer === 'true') === degenerateTruth.isTrue
    && specialCase.solutionsAnswer === (degenerateTruth.isTrue ? 'infinite' : 'none')
    && specialCase.classificationAnswer === (degenerateTruth.isTrue ? 'consistent-dependent' : 'inconsistent')
  );

  const readyToSubmit = isDegenerate ? Boolean(specialCaseAnswered) : Boolean(solution && (!config.requireVerification || allVerified));

  const check = () => {
    const expected = solveAlgebraicSystem(config.coefficients);
    const metadata = {
      mode: 'algebraic',
      method: effectiveMethod,
      selection,
      isolation: effectiveMethod === 'substitution' ? { expression: isolatedExpr, alreadyIsolated } : undefined,
      substitution: effectiveMethod === 'substitution' ? substitution : undefined,
      multipliers: effectiveMethod === 'elimination' ? multipliers : undefined,
      multiplierWork: effectiveMethod === 'elimination' ? multiplierWork : undefined,
      combinationOperation: effectiveMethod === 'elimination' ? combination.operation : undefined,
      combinationAttempts: effectiveMethod === 'elimination' ? combination.attempts : undefined,
      eliminationCancellation: effectiveMethod === 'elimination' ? combination.cancelledRows : undefined,
      transformedEquations: effectiveMethod === 'elimination' ? [multipliedEq(0)?.text, multipliedEq(1)?.text] : undefined,
      reducedEquation: reduceInputText,
      firstSolvedVariable: firstSolved,
      backSubstitution: { equationIndex: backSub.equationIndex, substitution: backSubEquationText },
      secondSolvedVariable: secondSolved,
      solution,
      specialCase,
      verification,
      methodEfficiencyReason: config.askEfficiency ? methodEfficiencyReason : undefined,
      expected,
    };
    const isCorrect = isDegenerate
      ? Boolean(specialCaseCorrect)
      : Boolean(solution && expected.type === 'one'
        && matchesNumericAnswer(solution[variables[0]], expected.x, 0.05)
        && matchesNumericAnswer(solution[variables[1]], expected.y, 0.05)
        && (!config.requireVerification || allVerified));
    submit({ isCorrect, score: isCorrect ? 1 : 0 }, isDegenerate ? specialCase : solution, metadata);
  };

  const methodTitle = effectiveMethod === 'elimination' ? 'Elimination' : 'Substitution';
  const isolationSolverActive = Boolean(selectionMade && !isolationDone && !alreadyIsolated);
  const reducedEquationSolverActive = Boolean(reduceInputText && !isDegenerate && !firstSolvedDone);
  const backSubSolverActive = Boolean(firstSolvedDone && !isDegenerate && backSubChosen && !secondSolvedDone);
  const embeddedSolverActive = isolationSolverActive || reducedEquationSolverActive || backSubSolverActive;

  const workTrailStages = useMemo(() => {
    const commonEnd = isDegenerate ? [
      {
        id: 'interpret',
        label: 'Interpret',
        complete: Boolean(specialCaseCorrect),
        summary: specialCaseCorrect
          ? (degenerateTruth?.isTrue ? 'Infinitely many solutions · consistent and dependent' : 'No solution · inconsistent')
          : '',
      },
    ] : [
      {
        id: 'solve-first',
        label: 'Solve',
        complete: firstSolvedDone,
        summaryMath: firstSolvedDone ? `${firstSolved.variable} = ${firstSolvedExpression}` : '',
        summaryLatex: firstSolvedDone ? classroomAssignmentLatex(firstSolved.variable, firstSolvedExpression) : '',
      },
      {
        id: 'back-substitute',
        label: 'Back-substitute',
        complete: secondSolvedDone,
        summaryMath: secondSolvedDone ? `${secondSolved.variable} = ${secondSolvedExpression}` : '',
        summaryLatex: secondSolvedDone ? classroomAssignmentLatex(secondSolved.variable, secondSolvedExpression) : '',
      },
      {
        id: 'verify',
        label: 'Verify',
        complete: !config.requireVerification || Boolean(allVerified),
        summary: allVerified ? 'Checked in both original equations' : '',
      },
    ];

    if (effectiveMethod === 'elimination') {
      return [
        { id: 'method', label: 'Method', complete: Boolean(effectiveMethod), summary: effectiveMethod ? 'Elimination' : '' },
        {
          id: 'target',
          label: 'Target',
          complete: Boolean(selection.variable),
          summary: selection.variable ? `Eliminate ${selection.variable}` : '',
        },
        {
          id: 'prepare',
          label: 'Prepare',
          complete: multipliersApplied,
          summary: multipliersApplied ? `Eq. 1 · ${multipliers[0]}   Eq. 2 · ${multipliers[1]}` : '',
        },
        {
          id: 'combine',
          label: 'Combine',
          complete: combinationLocked,
          summaryPrefix: combinationLocked ? `${combination.operation === 'subtract' ? 'Equation 1 − Equation 2' : 'Equation 1 + Equation 2'} →` : '',
          summaryMath: combinationLocked ? classroomEquationText(combination.text) : '',
          summaryLatex: combinationLocked ? classroomEquationLatex(combination.text) : '',
        },
        ...commonEnd,
      ];
    }

    return [
      { id: 'method', label: 'Method', complete: Boolean(effectiveMethod), summary: effectiveMethod ? 'Substitution' : '' },
      {
        id: 'isolate',
        label: 'Isolate',
        complete: isolationDone,
        summaryMath: isolationDone && selection.variable ? `${selection.variable} = ${displayedIsolationExpression}` : '',
        summaryLatex: isolationDone && selection.variable ? classroomAssignmentLatex(selection.variable, displayedIsolationExpression) : '',
      },
      {
        id: 'substitute',
        label: 'Substitute',
        complete: Boolean(substitution.equationText),
        summaryPrefix: substitution.equationText ? `${equationName(Number(substitution.targetEquationIndex ?? otherIndex))}:` : '',
        summaryMath: substitution.equationText ? classroomEquationText(substitution.equationText) : '',
        summaryLatex: substitution.equationText ? classroomEquationLatex(substitution.equationText) : '',
      },
      ...commonEnd,
    ];
  }, [
    effectiveMethod,
    isDegenerate,
    specialCaseCorrect,
    degenerateTruth,
    firstSolvedDone,
    firstSolved,
    firstSolvedExpression,
    secondSolvedDone,
    secondSolved,
    secondSolvedExpression,
    config.requireVerification,
    allVerified,
    selection.variable,
    multipliersApplied,
    multipliers,
    combinationLocked,
    combination.operation,
    combination.text,
    isolationDone,
    isolatedExpr,
    displayedIsolationExpression,
    substitution.equationText,
    substitution.targetEquationIndex,
    otherIndex,
  ]);

  const workflowBody = (
    <>
          {config.method === 'studentChoice' && !method ? (
            <div>
              <p style={{ margin: '0 0 10px', color: '#3c4756' }}>Choose the method you will use to solve this system.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setMethod('substitution')} style={secondaryButtonStyle}>Substitution</button>
                <button type="button" onClick={() => setMethod('elimination')} style={secondaryButtonStyle}>Elimination</button>
              </div>
            </div>
          ) : null}

          {effectiveMethod && config.askEfficiency ? (
            <div style={{ marginTop: 12 }}>
              <Field label="Why is this method efficient for this system? (optional)">
                <textarea value={methodEfficiencyReason} onChange={(e) => setMethodEfficiencyReason(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} />
              </Field>
            </div>
          ) : null}

          {effectiveMethod ? <SystemsWorkTrail stages={workTrailStages} /> : null}

          {effectiveMethod === 'substitution' ? (
            <div style={{ display: 'grid', gap: 14, marginTop: effectiveMethod ? 12 : 0 }}>
              {!selectionMade ? (
                <div>
                  <p style={{ margin: '0 0 8px', color: '#3c4756' }}>Which equation and variable will you isolate first?</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {equations.map((eq, eqIndex) => (
                      <div key={eqIndex} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#5f6b7a', minWidth: 74 }}>{equationName(eqIndex)}:</span>
                        {variables.map((v) => (
                          <button key={v} type="button" onClick={() => chooseSelection(eqIndex, v)} style={secondaryButtonStyle} aria-label={`Isolate ${v} in ${equationName(eqIndex)}`}>Isolate {v}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                  {slotAttempt?.stage === 'selection' && slotAttempt.reason === 'variable-absent' ? (
                    <p className="mathmaster-systems-substitution-feedback is-error" style={{ marginTop: 8 }}>
                      {equationName(slotAttempt.equationIndex)} has no {slotAttempt.variable} term, so {slotAttempt.variable} cannot be isolated from it. Choose another equation or variable.
                    </p>
                  ) : null}
                </div>
              ) : !isolationDone ? (
                <div>
                  <p style={{ margin: '0 0 6px', color: '#3c4756' }}>
                    Isolating <strong>{selection.variable}</strong> in {equationName(selection.equationIndex)}.
                  </p>
                  <button type="button" onClick={resetFromSelection} style={{ ...secondaryButtonStyle, fontSize: 12 }}>Choose a different equation/variable</button>
                </div>
              ) : null}

              {selectionMade && !isolationDone ? (
                alreadyIsolated ? null : (
                  <EmbeddedStepAlgebra
                    label={`Isolate ${selection.variable}`}
                    prompt={`Isolate ${selection.variable} in this equation.`}
                    equationText={sourceEquationText}
                    solveFor={selection.variable}
                    draftKey={draftKey ? `${draftKey}:algebraic:isolate:${selection.equationIndex}:${selection.variable}` : null}
                    onSolved={handleIsolated}
                    onUndoStateChange={setEmbeddedUndoController}
                    workspaceDifficulty={questionData.workspaceDifficulty}
                  />
                )
              ) : null}

              {isolationDone && !substitution.equationText ? (
                <div className="mathmaster-systems-substitution-stage">
                  {!substitutionTokenReady ? (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ padding: '12px 14px', border: '1px solid #dbe3ef', borderRadius: 10, background: '#f8fbff' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#174ea6', marginBottom: 6 }}>Isolated expression ready</div>
                        <MathDisplay value={`${selection.variable} = ${isolatedExpr}`} format="ascii-math" />
                        <p style={{ margin: '8px 0 0', color: '#3c4756', lineHeight: 1.5 }}>
                          This form is already mathematically valid. You may turn it into the substitution token now, or simplify the expression first.
                          Simplifying is optional and does not change your credit.
                        </p>
                      </div>

                      {!isolation.simplifying ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" onClick={useIsolatedExpressionAsToken} style={secondaryButtonStyle}>Use this form as the token</button>
                          <button type="button" onClick={startOptionalIsolationSimplification} style={secondaryButtonStyle}>Simplify first (optional)</button>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 8, padding: '12px 14px', border: '1px solid #dbe3ef', borderRadius: 10, background: '#fff' }}>
                          <Field label="Write an equivalent, simpler expression">
                            <MathInput
                              value={isolation.simplificationDraft || ''}
                              onChange={setIsolationSimplificationDraft}
                              placeholder="e.g. 2x - 7"
                              ariaLabel="Optional simplified expression for the substitution token"
                              toolProfile="algebra-operation"
                            />
                          </Field>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" onClick={checkAndUseIsolationSimplification} style={smallActionStyle}>Check and use my simplification</button>
                            <button type="button" onClick={useIsolatedExpressionAsToken} style={secondaryButtonStyle}>Skip simplification</button>
                          </div>
                          {isolation.simplificationChecked && !isolation.simplificationValid ? (
                            <p className="mathmaster-systems-substitution-feedback is-error" style={{ margin: 0 }}>
                              That rewrite is not equivalent to the isolated expression yet. Revise it, or use the original form.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mathmaster-systems-substitution-direction">
                        Use the prepared expression to create a one-variable equation. Decide which equation and which variable should receive it.
                        <span> Drag the token, or select it and then select a variable.</span>
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <SubstitutionToken
                          variable={selection.variable}
                          expression={substitutionTokenExpression}
                          onArm={() => setSlotAttempt({ stage: 'substitution', armed: true, correct: null, variable: null })}
                        />
                        <button type="button" onClick={changeSubstitutionTokenExpression} style={{ ...secondaryButtonStyle, fontSize: 12 }}>
                          Change expression
                        </button>
                      </div>
                      <div className="mathmaster-systems-substitution-equation-choices">
                        {equations.map((equationText, equationIndex) => (
                          <div key={equationIndex}>
                            <div className="mathmaster-systems-backsub-equation-label">{equationName(equationIndex)}</div>
                            <VariableDropEquation
                              equationText={equationText}
                              variables={variables}
                              onVariableAttempt={(variable) => attemptSubstitution(equationIndex, variable)}
                              tokenArmed={slotAttempt?.stage === 'substitution' && slotAttempt?.armed}
                              armedPayloadValue={selection.variable}
                              label={`${equationName(equationIndex)}: choose where the isolated expression belongs`}
                            />
                          </div>
                        ))}
                      </div>
                      {slotAttempt?.stage === 'substitution' && slotAttempt.correct === false ? (
                        <p className="mathmaster-systems-substitution-feedback is-error">
                          {slotAttempt.reason === 'source-equation'
                            ? 'That placement puts the expression back into the equation it came from. Ask which equation needs the isolated expression to leave only one variable.'
                            : slotAttempt.reason === 'expression-parse'
                              ? 'MathMaster could not open the next solving step from that token form. Your work is still here. Choose Change expression and use an equivalent form, or try the original isolated form again.'
                              : 'That variable does not match the isolated equation. Look back at what the expression is equal to, then try the placement again.'}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {effectiveMethod === 'elimination' ? (
            <div className="mathmaster-systems-elimination-stage">
              {!selection.variable ? (
                <div>
                  <p style={{ margin: '0 0 8px', color: '#3c4756' }}>Which variable will you eliminate?</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {variables.map((v) => (
                      <button key={v} type="button" onClick={() => chooseSelection(null, v)} style={secondaryButtonStyle}>Eliminate {v}</button>
                    ))}
                  </div>
                </div>
              ) : !combinationLocked ? (
                <div className="mathmaster-systems-elimination-board">
                  <div className="mathmaster-systems-elimination-heading">
                    <div>
                      <strong>Prepare the equations</strong>
                      <span>
                        You chose to eliminate {selection.variable}. Enter a scale factor only when an equation needs one, then place that factor directly on the equation.
                      </span>
                    </div>
                    <button type="button" onClick={resetFromSelection}>Change target</button>
                  </div>

                  <div className="mathmaster-systems-elimination-equations">
                    {[0, 1].map((index) => {
                      const transformed = appliedMultipliers[index] ? multipliedEq(index) : null;
                      const expectedTransformed = multipliedEq(index);
                      const originalCoefficients = linearEquationCoefficients(equations[index], variables);
                      const work = multiplierWork[index] || emptyMultiplierWork();
                      const multiplierArmed = slotAttempt?.stage === 'multiplier' && slotAttempt?.armed && Number(slotAttempt?.index) === index;
                      const parsedMultiplier = parseNumericEntry(multipliers[index]);
                      const identityMultiplier = Number.isFinite(parsedMultiplier) && Math.abs(parsedMultiplier - 1) <= 1e-9;
                      const rowPrepared = appliedMultipliers[index] || identityMultiplier;
                      const productSpecs = expectedTransformed && originalCoefficients ? [
                        {
                          field: 'a',
                          source: coefficientTermText(originalCoefficients.a, variables[0]),
                          variable: variables[0],
                          placeholder: coefficientTermText(expectedTransformed.coefficients.a, variables[0]),
                        },
                        {
                          field: 'b',
                          source: coefficientTermText(originalCoefficients.b, variables[1]),
                          variable: variables[1],
                          placeholder: coefficientTermText(expectedTransformed.coefficients.b, variables[1]),
                        },
                        {
                          field: 'c',
                          source: String(cleanCoefficient(originalCoefficients.c)),
                          variable: null,
                          placeholder: String(cleanCoefficient(expectedTransformed.coefficients.c)),
                        },
                      ] : [];
                      return (
                        <div key={index} className={`mathmaster-systems-elimination-equation-card${rowPrepared ? ' is-prepared' : ''}`}>
                          <div className="mathmaster-systems-multiplier-composer">
                            <span>{identityMultiplier ? 'No scale needed' : 'Scale by'}</span>
                            <MathInput
                              value={multipliers[index]}
                              onChange={(value) => setMultiplierValue(index, value)}
                              placeholder="1"
                              ariaLabel={`Multiplier for equation ${index + 1}`}
                              toolProfile="algebra-operation"
                              compact
                              maxWidth={150}
                            />
                            {identityMultiplier ? (
                              <span className="mathmaster-systems-scale-not-needed">Equation stays as written</span>
                            ) : (
                              <button
                                type="button"
                                className={`mathmaster-systems-multiplier-token${multiplierArmed ? ' is-armed' : ''}`}
                                draggable
                                onClick={() => armMultiplier(index)}
                                onDragStart={(event) => {
                                  event.dataTransfer?.setData('text/plain', `mathmaster-system-multiplier:${index}`);
                                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                                  armMultiplier(index);
                                }}
                                aria-pressed={multiplierArmed}
                                aria-label={`Pick up scale factor ${multipliers[index]} for equation ${index + 1}`}
                              >
                                ⠿ · {multipliers[index] || '?'}
                              </button>
                            )}
                          </div>

                          <div
                            className={`mathmaster-systems-equation-multiplier-target${multiplierArmed ? ' is-armed' : ''}${rowPrepared ? ' is-prepared' : ''}`}
                            role={multiplierArmed ? 'button' : undefined}
                            tabIndex={multiplierArmed ? 0 : undefined}
                            onClick={() => {
                              if (multiplierArmed) dropMultiplier(index, slotAttempt?.index);
                            }}
                            onKeyDown={(event) => {
                              if (multiplierArmed && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault();
                                dropMultiplier(index, slotAttempt?.index);
                              }
                            }}
                            onDragOver={(event) => {
                              if (event.dataTransfer?.types?.includes('text/plain')) event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const payload = event.dataTransfer?.getData('text/plain') || '';
                              if (!payload.startsWith('mathmaster-system-multiplier:')) return;
                              dropMultiplier(index, payload.split(':').pop());
                            }}
                            aria-label={multiplierArmed
                              ? `Place scale factor on equation ${index + 1}`
                              : `Equation ${index + 1}`}
                          >
                            <AlignedEquationRow
                              equationText={transformed?.text || equations[index]}
                              variables={variables}
                              targetVariable={selection.variable}
                              multiplier={appliedMultipliers[index] && !identityMultiplier ? multipliers[index] : null}
                              label={rowPrepared ? 'Prepared equation' : `Equation ${index + 1}`}
                            />
                          </div>

                          {work.active && expectedTransformed && originalCoefficients ? (
                            <div className="mathmaster-systems-multiplier-products">
                              <div className="mathmaster-systems-multiplier-products-heading">
                                <strong>Complete the scaled equation</strong>
                                <span>Enter the resulting terms where they belong. You may type a full term such as 3x or just its coefficient.</span>
                              </div>
                              <div className="mathmaster-systems-product-operation-row" aria-hidden="true">
                                {productSpecs.map((spec, specIndex) => (
                                  <React.Fragment key={spec.field}>
                                    {specIndex === 2 ? <span className="mathmaster-systems-product-equals">=</span> : null}
                                    <span className="mathmaster-systems-product-operation">
                                      {spec.source} · {multipliers[index]}
                                    </span>
                                  </React.Fragment>
                                ))}
                              </div>
                              <div className="mathmaster-systems-product-entry-row">
                                {productSpecs.map((spec, specIndex) => (
                                  <React.Fragment key={spec.field}>
                                    {specIndex === 2 ? <span className="mathmaster-systems-product-equals">=</span> : null}
                                    <MathInput
                                      value={work[spec.field] || ''}
                                      onChange={(value) => setMultiplierProduct(index, spec.field, value)}
                                      onSubmit={() => checkMultiplierProducts(index)}
                                      placeholder={spec.placeholder}
                                      ariaLabel={spec.variable
                                        ? `Scaled ${spec.variable} term for equation ${index + 1}`
                                        : `Scaled right side for equation ${index + 1}`}
                                      toolProfile="algebra-operation"
                                      compact
                                      maxWidth={160}
                                    />
                                  </React.Fragment>
                                ))}
                              </div>
                              <button
                                type="button"
                                className="mathmaster-systems-check-products"
                                onClick={() => checkMultiplierProducts(index)}
                              >
                                Check scaled equation
                              </button>
                              {work.checked && !work.valid ? (
                                <p className="mathmaster-systems-substitution-feedback is-error">
                                  One or more products do not match the scaled equation yet. Apply the same multiplier to every term and the right side.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {slotAttempt?.stage === 'multiplier' && slotAttempt.correct === false ? (
                    <p className="mathmaster-systems-substitution-feedback is-error">
                      {slotAttempt.reason === 'invalid-multiplier'
                        ? 'That multiplier could not be read as a nonzero number. Check the sign or fraction and try again.'
                        : 'That scale-factor token belongs to the other equation. Pick up the factor beside the equation you want to transform.'}
                    </p>
                  ) : null}

                  {multipliersApplied ? (
                    <div className="mathmaster-systems-combine-stage">
                      {!cancellationPending ? (
                        <>
                          <p>Choose + or − beside the second equation. The equations stay in place while you decide how to combine them.</p>
                          <div className="mathmaster-systems-combine-stack">
                            <div className="mathmaster-systems-combine-row">
                              <div className="mathmaster-systems-operation-spacer" aria-hidden="true" />
                              <AlignedEquationRow
                                equationText={multipliedEq(0)?.text || equations[0]}
                                variables={variables}
                                targetVariable={selection.variable}
                                label="Prepared equation 1"
                              />
                            </div>
                            <div className="mathmaster-systems-combine-row">
                              <div className="mathmaster-systems-operation-rail" aria-label="Choose how to combine the equations">
                                <button
                                  type="button"
                                  className={combination.operation === 'add' && combination.attempts > 0 ? 'is-selected' : ''}
                                  onClick={() => handleCombine('add')}
                                  aria-label="Add equation 2 to equation 1"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  className={combination.operation === 'subtract' && combination.attempts > 0 ? 'is-selected' : ''}
                                  onClick={() => handleCombine('subtract')}
                                  aria-label="Subtract equation 2 from equation 1"
                                >
                                  −
                                </button>
                              </div>
                              <AlignedEquationRow
                                equationText={multipliedEq(1)?.text || equations[1]}
                                variables={variables}
                                targetVariable={selection.variable}
                                label="Prepared equation 2"
                              />
                            </div>
                            <div className="mathmaster-systems-combine-result-line" />
                          </div>
                          {combination.attempts > 0 && !combinationLocked ? (
                            <p className="mathmaster-systems-substitution-feedback is-error">
                              That operation does not eliminate the variable you chose. Recheck the signs or change a multiplier.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <div className="mathmaster-systems-cancellation-stage">
                          <div className="mathmaster-systems-cancellation-heading">
                            <strong>
                              {combination.operation === 'subtract' ? 'Subtract the equations' : 'Add the equations'} — mark the {selection.variable} terms that cancel
                            </strong>
                            <span>Select the {selection.variable} term in each prepared row. MathMaster will not cross them out for you.</span>
                          </div>
                          <div className="mathmaster-systems-combine-stack">
                            <div className="mathmaster-systems-combine-row">
                              <div className="mathmaster-systems-operation-spacer" aria-hidden="true" />
                              <AlignedEquationRow
                                equationText={multipliedEq(0)?.text || equations[0]}
                                variables={variables}
                                targetVariable={selection.variable}
                                cancelled={Boolean(combination.cancelledRows?.[0])}
                                onTargetTermClick={() => toggleCancellationRow(0)}
                                label="Prepared equation 1"
                              />
                            </div>
                            <div className="mathmaster-systems-combine-row">
                              <div className="mathmaster-systems-operation-symbol" aria-hidden="true">
                                {combination.operation === 'subtract' ? '−' : '+'}
                              </div>
                              <AlignedEquationRow
                                equationText={multipliedEq(1)?.text || equations[1]}
                                variables={variables}
                                targetVariable={selection.variable}
                                cancelled={Boolean(combination.cancelledRows?.[1])}
                                onTargetTermClick={() => toggleCancellationRow(1)}
                                label="Prepared equation 2"
                              />
                            </div>
                            <div className="mathmaster-systems-combine-result-line" />
                          </div>
                          <div className="mathmaster-systems-cancellation-progress">
                            {cancellationComplete
                              ? 'Both cancelling terms are marked.'
                              : `Marked ${Number(Boolean(combination.cancelledRows?.[0])) + Number(Boolean(combination.cancelledRows?.[1]))} of 2 cancelling terms.`}
                          </div>
                          <button
                            type="button"
                            className="mathmaster-systems-confirm-cancellation"
                            onClick={confirmEliminationCancellation}
                            disabled={!cancellationComplete}
                          >
                            Confirm cancellation and combine
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {combinationLocked && !firstSolvedDone ? (
                <div className="mathmaster-systems-elimination-result">
                  <div className="mathmaster-systems-combine-stack is-complete">
                    <div className="mathmaster-systems-combine-row">
                      <div className="mathmaster-systems-operation-spacer" aria-hidden="true" />
                      <AlignedEquationRow
                        equationText={multipliedEq(0)?.text || equations[0]}
                        variables={variables}
                        targetVariable={selection.variable}
                        cancelled
                        label="Prepared equation 1"
                      />
                    </div>
                    <div className="mathmaster-systems-combine-row">
                      <div className="mathmaster-systems-operation-symbol" aria-hidden="true">
                        {combination.operation === 'subtract' ? '−' : '+'}
                      </div>
                      <AlignedEquationRow
                        equationText={multipliedEq(1)?.text || equations[1]}
                        variables={variables}
                        targetVariable={selection.variable}
                        cancelled
                        label="Prepared equation 2"
                      />
                    </div>
                    <div className="mathmaster-systems-combine-result-line" />
                  </div>
                  <div className="mathmaster-systems-combined-equation">
                    <span>{combination.operation === 'subtract' ? 'Equation 1 − Equation 2' : 'Equation 1 + Equation 2'}</span>
                    <MathDisplay value={combination.text} format="ascii-math" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {reduceInputText && !isDegenerate && !firstSolvedDone ? (
            <div style={{ marginTop: 14 }}>
              <EmbeddedStepAlgebra
                label={`Solve for ${survivingVariable}`}
                prompt={`Solve this equation for ${survivingVariable}.`}
                equationText={reduceInputText}
                solveFor={survivingVariable}
                draftKey={draftKey && reduceInputText
                  ? `${draftKey}:algebraic:reduce:${effectiveMethod}:${selection.variable}:${substitution.targetEquationIndex ?? 'combined'}:${equationIdentity(reduceInputText)}`
                  : null}
                onSolved={handleReduceSolved}
                onUndoStateChange={setEmbeddedUndoController}
                workspaceDifficulty={questionData.workspaceDifficulty}
                requireSimplifiedFinalForm={Boolean(subsystem)}
                autoReveal
                autoOpenDistribution={effectiveMethod === 'substitution'}
                // Distribution is a student-owned algebra step. After the
                // factor has been placed on every term, keep the resulting
                // products visible (for example 3(-3) + 3(2y) + 5y = 24).
                // The student must simplify those products and then combine
                // like terms; the systems wrapper must not do either for them.
                simplifyDistributedProducts={false}
                inlineExpressionTools
              />
            </div>
          ) : null}

          {isDegenerate ? (
            <div style={{ marginTop: 14, padding: 10, border: '1px solid #dbe3ef', borderRadius: 8, background: '#fff' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>This reduces to a statement with no variable. Interpret it before moving on.</p>
              <MathDisplay value={formatLinearEquation(reduceCoefficients, variables)} format="ascii-math" />
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <Field label="Is this statement true or false?">
                  <select value={specialCase?.isTrueAnswer || ''} onChange={(e) => chooseSpecialCaseField('isTrueAnswer', e.target.value)} style={inputStyle}>
                    <option value="">Choose…</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </Field>
                <Field label="What does that mean for the system?">
                  <select value={specialCase?.solutionsAnswer || ''} onChange={(e) => chooseSpecialCaseField('solutionsAnswer', e.target.value)} style={inputStyle}>
                    <option value="">Choose…</option>
                    <option value="none">No solution</option>
                    <option value="infinite">Infinitely many solutions</option>
                  </select>
                </Field>
                <Field label="How would you classify this system?">
                  <select value={specialCase?.classificationAnswer || ''} onChange={(e) => chooseSpecialCaseField('classificationAnswer', e.target.value)} style={inputStyle}>
                    <option value="">Choose…</option>
                    <option value="inconsistent">Inconsistent</option>
                    <option value="consistent-dependent">Consistent and dependent</option>
                  </select>
                </Field>
                {specialCaseAnswered ? (
                  <p style={{ margin: 0, color: specialCaseCorrect ? '#137333' : '#a02020', fontSize: 13 }}>
                    {specialCaseCorrect
                      ? 'Correct interpretation.'
                      : (specialCase.isTrueAnswer === 'true') !== degenerateTruth.isTrue
                        ? `${formatLinearEquation(reduceCoefficients, variables)} is ${degenerateTruth.isTrue ? 'true' : 'false'} — check that statement again before deciding what it means for the system.`
                        : '0 = 0 is a true statement; a false statement like -4 = 8 means the system has no solution. Re-check the number of solutions and the classification together.'}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {firstSolvedDone && !isDegenerate ? (
            <div style={{ marginTop: 14 }}>
              {!backSubChosen ? (
                <div className="mathmaster-systems-substitution-stage">
                  <p className="mathmaster-systems-substitution-direction">
                    {subsystem
                      ? 'Back-substitute the solved value into one reduced equation. Decide which equation and which variable should receive it.'
                      : 'Back-substitute the solved value into one original equation. Decide which equation and which variable should receive it.'}
                    <span> Drag the token, or select it and then select a variable.</span>
                  </p>
                  <SubstitutionToken
                    variable={survivingVariable}
                    expression={firstSolvedExpression}
                    label="Solved value"
                    onArm={() => setSlotAttempt({ stage: 'backSubstitution', armed: true, correct: null, variable: null })}
                  />
                  <div className="mathmaster-systems-backsub-equations">
                    {equations.map((eq, index) => (
                      <div key={index}>
                        <div className="mathmaster-systems-backsub-equation-label">{equationName(index)}</div>
                        <VariableDropEquation
                          equationText={eq}
                          variables={variables}
                          onVariableAttempt={(variable) => attemptBackSubstitution(index, variable)}
                          tokenArmed={slotAttempt?.stage === 'backSubstitution' && slotAttempt?.armed}
                          armedPayloadValue={survivingVariable}
                          label={`${equationName(index)}: choose where the solved value belongs`}
                        />
                      </div>
                    ))}
                  </div>
                  {slotAttempt?.stage === 'backSubstitution' && slotAttempt.correct === false ? (
                    <p className="mathmaster-systems-substitution-feedback is-error">
                      That placement does not match the variable represented by the solved value. Look back at the equation you just solved and try again.
                    </p>
                  ) : null}
                </div>
              ) : !secondSolvedDone ? (
                <EmbeddedStepAlgebra
                  label="Solve the back-substitution equation"
                  prompt={`Use your substitution to solve this equation for ${removedVariable}.`}
                  equationText={backSubEquationText}
                  solveFor={removedVariable}
                  draftKey={draftKey && backSubEquationText
                    ? `${draftKey}:algebraic:back-solve:${backSub.equationIndex}:${equationIdentity(backSubEquationText)}`
                    : null}
                  onSolved={handleSecondSolved}
                  onUndoStateChange={setEmbeddedUndoController}
                  workspaceDifficulty={questionData.workspaceDifficulty}
                  requireSimplifiedFinalForm={Boolean(subsystem)}
                />
              ) : null}
            </div>
          ) : null}

          {solution && config.requireVerification ? (
            <div className="mathmaster-systems-verification-stage">
              <div className="mathmaster-systems-verification-heading">
                <strong>Verify the ordered pair in both original equations</strong>
                <span>Pick up each solved value and place it where it belongs. The variable locations are not pre-highlighted.</span>
              </div>
              <div className="mathmaster-systems-verification-token-bank">
                {variables.map((variable) => (
                    <MathDragToken
                      key={variable}
                      payloadPrefix="mathmaster-verification:"
                      payloadValue={variable}
                      expression={`${variable} = ${solutionExpressions[variable]}`}
                      label="Solved value"
                      onArm={() => armVerificationValue(variable)}
                      ariaLabel={`Pick up solved value ${solutionExpressions[variable]} for ${variable}`}
                    />
                ))}
              </div>

              <div className="mathmaster-systems-verification-equations">
                {equations.map((eq, index) => (
                  <div key={index} className={`mathmaster-systems-verification-card${verification[index].valid ? ' is-valid' : ''}`}>
                    <div className="mathmaster-systems-backsub-equation-label">Equation {index + 1}</div>
                    {!bothPlaced(index) ? (
                      <VariableDropEquation
                        equationText={eq}
                        variables={variables}
                        payloadPrefix="mathmaster-verification:"
                        onVariableAttempt={(targetVariable, tokenVariable) => placeVerificationValue(index, targetVariable, tokenVariable)}
                        tokenArmed={slotAttempt?.stage === 'verification' && slotAttempt?.armed}
                        armedPayloadValue={slotAttempt?.stage === 'verification' ? slotAttempt?.tokenVariable : null}
                        placedValues={Object.fromEntries(
                          variables
                            .filter((variable) => verification[index].placed[variable])
                            .map((variable) => [variable, solutionExpressions[variable]]),
                        )}
                        label={`Equation ${index + 1}: place both solved values`}
                      />
                    ) : (
                      <div className="mathmaster-systems-verification-substitution">
                        <span>Values substituted</span>
                        <MathDisplay
                          value={substituteIntoEquation(
                            substituteIntoEquation(eq, variables[0], solutionExpressions[variables[0]]),
                            variables[1],
                            solutionExpressions[variables[1]],
                          )}
                          format="ascii-math"
                        />
                      </div>
                    )}

                    {slotAttempt?.stage === 'verification'
                      && slotAttempt?.correct === false
                      && slotAttempt?.equationIndex === index ? (
                        <p className="mathmaster-systems-substitution-feedback is-error">
                          That value was placed on a different variable than the one it represents. Use the solved assignment on the token to choose another location.
                        </p>
                      ) : null}

                    {bothPlaced(index) ? (
                      <div className="mathmaster-systems-verification-arithmetic">
                        <Field label="Left side simplifies to">
                          <MathInput
                            value={verification[index].leftAnswer}
                            onChange={(value) => setVerificationAnswer(index, 'leftAnswer', value)}
                            placeholder="value"
                            ariaLabel={`Equation ${index + 1} left side value`}
                            toolProfile="algebra-operation"
                            compact
                          />
                        </Field>
                        <Field label="Right side simplifies to">
                          <MathInput
                            value={verification[index].rightAnswer}
                            onChange={(value) => setVerificationAnswer(index, 'rightAnswer', value)}
                            placeholder="value"
                            ariaLabel={`Equation ${index + 1} right side value`}
                            toolProfile="algebra-operation"
                            compact
                          />
                        </Field>
                        <button type="button" onClick={() => checkVerification(index)} style={smallActionStyle}>Check equation {index + 1}</button>
                        {verification[index].checked ? (
                          <p className={`mathmaster-systems-verification-feedback${verification[index].valid ? ' is-valid' : ' is-error'}`}>
                            {verification[index].valid
                              ? 'Both sides check out.'
                              : 'The values are placed. Recheck the arithmetic on each side; the two sides should match.'}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {readyToSubmit ? (
            // A reduced subsystem submits nothing: its solution goes up to the
            // 3×3 workflow, which verifies in the original equations.
            subsystem ? null : <button type="button" onClick={check} style={actionStyle}>Check my work</button>
          ) : null}
          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
            </div>
          ) : null}

          {subsystem ? null : <HintPanel
            hints={effectiveMethod === 'elimination' ? [
              'Look at the coefficients of the variable you want to eliminate. If they are already opposites, you can add the equations directly.',
              'If the coefficients are the same sign and size, subtracting removes that variable. Otherwise, multiply one or both equations so the coefficients become opposites.',
              'A multiplier must apply to every term on both sides of the equation.',
            ] : [
              'Isolating the variable with a coefficient of 1 usually avoids fractions.',
              'You isolated one variable — replace every occurrence of that exact variable in the other equation with its expression.',
              'Keep the substituted expression in parentheses until you distribute it in the algebra solver.',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />}
    </>
  );

  if (subsystem) {
    // Reduced-subsystem role: no second Work View host, no givens column and no
    // bordered panel of its own — the parent's lineage column already shows
    // where these equations came from. Just the equations and the workflow.
    return (
      <div className={`mathmaster-algebraic-subsystem${embeddedSolverActive ? ' has-active-solver' : ''}`}>
        <div className="mathmaster-algebraic-subsystem-equations" role="group" aria-label="Reduced subsystem equations">
          {equations.map((eq, index) => (
            <div key={index} className="mathmaster-algebraic-subsystem-equation">
              <span>{equationName(index)}</span>
              <MathDisplay value={eq} format="ascii-math" inline />
            </div>
          ))}
        </div>
        {workflowBody}
      </div>
    );
  }

  return (
    <EnlargeableFigure
      label="Algebraic systems workspace"
      enlargeLabel="Enlarge algebraic systems workspace"
      style={{ width: '100%' }}
      capabilities={{
        undo: activeUndoCapability,
        equationInput: { label: 'Both equations and every algebraic move', studentState: true },
        numericControls: { label: 'Method, targets, and the final solution', studentState: true },
        instruction: { text: 'Solve the system with substitution or elimination, showing every mathematical decision.' },
        primaryActions: readyToSubmit ? [{ id: 'check-algebraic-system', label: 'Check my work', onAction: check }] : [],
      }}
    >
      <div className={`mathmaster-algebraic-system-layout${embeddedSolverActive ? ' has-active-solver' : ''}`}>
        <div className="mathmaster-algebraic-system-givens">
        <Panel title="Both original equations">
          <div style={{ display: 'grid', gap: 8 }}>
            {equations.map((eq, index) => (
              <div key={index} style={{ padding: '8px 10px', border: '1px solid #dbe3ef', borderRadius: 8, background: '#fff' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7a' }}>Equation {index + 1}</span>
                <MathDisplay value={eq} format="ascii-math" />
              </div>
            ))}
          </div>
          {solution && solutionExpressions ? (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#f0fbf4' }}>
              <strong>Ordered-pair solution:</strong>{' '}
              <MathDisplay
                value={`(${solutionExpressions[variables[0]]}, ${solutionExpressions[variables[1]]})`}
                format="ascii-math"
                inline
              />
            </div>
          ) : null}
          {isDegenerate ? (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: specialCaseCorrect ? '#f0fbf4' : '#f3f4f6' }}>
              <strong>Reduced statement:</strong> <MathDisplay value={formatLinearEquation(reduceCoefficients, variables)} format="ascii-math" inline />
            </div>
          ) : null}
        </Panel>
        </div>

        <div className="mathmaster-algebraic-system-workflow">
        <Panel title={`${methodTitle} workflow`}>
          {workflowBody}
        </Panel>
        </div>
      </div>
    </EnlargeableFigure>
  );
}
