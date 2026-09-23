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
import { latexToExpression } from '../../algebraAstEngine.js';
import './AlgebraicSystemMode.css';
import {
  normalizeAlgebraicSystemConfig,
  variableIsIsolated,
  isolatedExpressionFor,
  substituteIntoEquation,
  applyEquationMultiplier,
  combineCoefficients,
  eliminatesVariable,
  isDegenerateStatement,
  degenerateStatementTruth,
  formatLinearEquation,
  linearEquationCoefficients,
  solveAlgebraicSystem,
  evaluateEquationSides,
} from './algebraicSystemsEngine.js';

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #cfd8e6', borderRadius: 9, background: '#fff', fontSize: 15, minHeight: 44 };
const actionStyle = { marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const Field = ({ label, children }) => <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#465267' }}>{label}<div style={{ marginTop: 5 }}>{children}</div></label>;

const secondaryButtonStyle = { ...actionStyle, marginTop: 0, padding: '9px 14px', fontSize: 13, background: '#eef4ff', color: '#174ea6' };
const activeButtonStyle = { ...secondaryButtonStyle, background: '#174ea6', color: '#fff' };
const smallActionStyle = { ...actionStyle, marginTop: 8, padding: '9px 14px', fontSize: 13 };

const emptyVerificationEntry = () => ({ placed: {}, leftAnswer: '', rightAnswer: '', checked: false, valid: false });
const emptySpecialCase = () => ({ isTrueAnswer: '', solutionsAnswer: '', classificationAnswer: '' });

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function MathDragToken({
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

function SubstitutionToken({ variable, expression, onArm, label = 'Expression from isolated equation' }) {
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

function VariableDropEquation({
  equationText,
  variables,
  onVariableAttempt,
  tokenArmed = false,
  armedPayloadValue = null,
  payloadPrefix = 'mathmaster-substitution:',
  label = 'Equation',
}) {
  const pattern = useMemo(
    () => new RegExp(`(${variables.map(escapeRegex).sort((a, b) => b.length - a.length).join('|')})`, 'g'),
    [variables],
  );
  const parts = useMemo(() => String(equationText || '').split(pattern), [equationText, pattern]);

  return (
    <div className="mathmaster-systems-drop-equation" role="group" aria-label={label}>
      {parts.map((part, index) => {
        if (!variables.includes(part)) {
          return <span key={`text-${index}`} className="mathmaster-systems-equation-text">{part}</span>;
        }
        return (
          <button
            key={`variable-${index}-${part}`}
            type="button"
            className={`mathmaster-systems-variable-drop${tokenArmed ? ' is-armed' : ''}`}
            data-variable={part}
            onClick={() => { if (tokenArmed) onVariableAttempt(part, armedPayloadValue); }}
            onDragOver={(event) => {
              if (event.dataTransfer?.types?.includes('text/plain')) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const payload = event.dataTransfer?.getData('text/plain') || '';
              if (!payload.startsWith(payloadPrefix)) return;
              onVariableAttempt(part, payload.slice(payloadPrefix.length));
            }}
            aria-label={`Variable ${part}. Drop the selected math token here`}
            title="Drop the selected value or expression here if you think it belongs at this variable."
          >
            {part}
          </button>
        );
      })}
    </div>
  );
}

function SystemsWorkTrail({ stages = [] }) {
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
        {stages.filter((stage) => stage.complete && stage.summary).map((stage) => (
          <div key={`summary-${stage.id}`} className="mathmaster-systems-completed-chip">
            <span aria-hidden="true">✓</span>
            <span>{stage.summary}</span>
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
  if (coefficient === 0) return '0';
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${coefficient}${variable}`;
};

function AlignedEquationRow({ equationText, variables, targetVariable, multiplier = null, cancelled = false, label }) {
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
      {multiplier != null ? <span className="mathmaster-systems-applied-multiplier">× {multiplier}</span> : null}
      <div className="mathmaster-systems-equation-columns">
        {entries.map((entry, index) => (
          <span
            key={entry.variable}
            className={`mathmaster-systems-equation-term${entry.variable === targetVariable ? ' is-target-column' : ''}${cancelled && entry.variable === targetVariable ? ' is-cancelled' : ''}`}
          >
            {index === 1 && cleanCoefficient(entry.value) >= 0 ? '+ ' : ''}
            {coefficientTermText(entry.value, entry.variable)}
          </span>
        ))}
        <span className="mathmaster-systems-equation-equals">=</span>
        <span className="mathmaster-systems-equation-constant">{cleanCoefficient(coefficients.c)}</span>
      </div>
    </div>
  );
}

/** Extracts the plain-expression value a solved Step Algebra equation isolated `variable` to. */
const solvedExpressionFor = (latexResponse, variable) => {
  try {
    const plain = latexToExpression(latexResponse);
    return isolatedExpressionFor(plain, variable);
  } catch {
    return null;
  }
};

const solvedNumberFor = (latexResponse, variable) => {
  const expr = solvedExpressionFor(latexResponse, variable);
  if (expr == null) return null;
  try {
    const value = Number(evaluate(expr));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
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
function EmbeddedStepAlgebra({ label, prompt, equationText, solveFor, draftKey, onSolved, onUndoStateChange, workspaceDifficulty }) {
  const question = useMemo(() => ({
    equation: equationText, solveFor, prompt, workspaceDifficulty,
  }), [equationText, solveFor, prompt, workspaceDifficulty]);
  const lastReportedRef = useRef(null);
  const handleStateChange = useCallback((payload) => {
    const part = payload?.parts?.find((p) => p?.id === 'algebra-objective');
    if (!part?.isComplete || !part.response) return;
    if (lastReportedRef.current === part.response) return;
    lastReportedRef.current = part.response;
    onSolved(part.response);
  }, [onSolved]);
  return (
    <div className="mathmaster-systems-embedded-step-algebra">
      {label ? <div style={{ marginBottom: 8, fontWeight: 800 }}>{label}</div> : null}
      <StepByStepAlgebraCore
        question={question}
        questionRecord={null}
        draftKey={draftKey}
        onStateChange={handleStateChange}
        onStepGrade={null}
        onUndoStateChange={onUndoStateChange}
      />
    </div>
  );
}

export default function AlgebraicSystemMode({ questionData = {}, onAction, draftKey = null }) {
  const config = useMemo(() => normalizeAlgebraicSystemConfig(questionData), [questionData]);
  const { variables, equations } = config;

  const [method, setMethod] = usePersistentToolState('method', config.method === 'studentChoice' ? '' : config.method);
  const effectiveMethod = config.method === 'studentChoice' ? method : config.method;

  const [selection, setSelection] = usePersistentToolState('selection', { equationIndex: null, variable: null });
  const [isolation, setIsolation] = usePersistentToolState('isolation', { expression: null });
  const [substitution, setSubstitution] = usePersistentToolState('substitution', { targetVariable: null, targetEquationIndex: null, equationText: null });
  const [multipliers, setMultipliers] = usePersistentToolState('multipliers', { 0: '1', 1: '1' });
  const [appliedMultipliers, setAppliedMultipliers] = usePersistentToolState('appliedMultipliers', { 0: false, 1: false });
  const [combination, setCombination] = usePersistentToolState('combination', { operation: null, attempts: 0, coefficients: null, text: null });
  const [firstSolved, setFirstSolved] = usePersistentToolState('firstSolved', { variable: null, value: null });
  const [specialCase, setSpecialCase] = usePersistentToolState('specialCase', null);
  const [backSub, setBackSub] = usePersistentToolState('backSub', { equationIndex: null });
  const [secondSolved, setSecondSolved] = usePersistentToolState('secondSolved', { variable: null, value: null });
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
    setIsolation({ expression: null });
    setSubstitution({ targetVariable: null, targetEquationIndex: null, equationText: null });
    setMultipliers({ 0: '1', 1: '1' });
    setAppliedMultipliers({ 0: false, 1: false });
    setCombination({ operation: null, attempts: 0, coefficients: null, text: null });
    setFirstSolved({ variable: null, value: null });
    setSpecialCase(null);
    setBackSub({ equationIndex: null });
    setSecondSolved({ variable: null, value: null });
    setVerification({ 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
    setSlotAttempt(null);
  }, []);

  const resetFromBackSub = useCallback(() => {
    setBackSub({ equationIndex: null });
    setSecondSolved({ variable: null, value: null });
    setVerification({ 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
    setSlotAttempt(null);
  }, []);

  const mathState = useMemo(() => ({
    method, selection, isolation, substitution, multipliers, appliedMultipliers, combination,
    firstSolved, specialCase, backSub, secondSolved, verification, methodEfficiencyReason,
  }), [method, selection, isolation, substitution, multipliers, appliedMultipliers, combination, firstSolved, specialCase, backSub, secondSolved, verification, methodEfficiencyReason]);
  const restore = useCallback((value) => {
    setMethod(value?.method ?? (config.method === 'studentChoice' ? '' : config.method));
    setSelection(value?.selection || { equationIndex: null, variable: null });
    setIsolation(value?.isolation || { expression: null });
    setSubstitution({ targetVariable: null, targetEquationIndex: null, equationText: null, ...(value?.substitution || {}) });
    setMultipliers(value?.multipliers || { 0: '1', 1: '1' });
    setAppliedMultipliers(value?.appliedMultipliers || { 0: false, 1: false });
    setCombination(value?.combination || { operation: null, attempts: 0, coefficients: null, text: null });
    setFirstSolved(value?.firstSolved || { variable: null, value: null });
    setSpecialCase(value?.specialCase || null);
    setBackSub(value?.backSub || { equationIndex: null });
    setSecondSolved(value?.secondSolved || { variable: null, value: null });
    setVerification(value?.verification || { 0: emptyVerificationEntry(), 1: emptyVerificationEntry() });
    setMethodEfficiencyReason(value?.methodEfficiencyReason || '');
  }, [config.method]);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last algebraic-systems edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  useActiveUndoOwner({
    id: 'algebraic-system-embedded-step-algebra',
    active: Boolean(embeddedUndoController),
    priority: 50,
    controller: embeddedUndoController,
  });

  const activeUndoCapability = embeddedUndoController
    ? {
      label: '↶ Undo',
      title: embeddedUndoController.label || 'Undo the last algebra step',
      onAction: () => embeddedUndoController.onUndo?.(),
      disabled: !embeddedUndoController.canUndo,
      studentState: true,
    }
    : undoHistory.capability;

  // --- Derived workflow state -------------------------------------------
  const removedVariable = selection.variable; // isolated first (substitution) / targeted for elimination
  const survivingVariable = removedVariable ? variables.find((v) => v !== removedVariable) : null;
  const selectionMade = selection.equationIndex != null && Boolean(selection.variable);

  const sourceEquationText = selectionMade ? equations[selection.equationIndex] : null;
  const otherIndex = selectionMade ? 1 - selection.equationIndex : null;
  const targetEquationText = otherIndex != null ? equations[otherIndex] : null;
  const alreadyIsolated = sourceEquationText ? variableIsIsolated(sourceEquationText, selection.variable) : false;
  const isolatedExpr = alreadyIsolated ? isolatedExpressionFor(sourceEquationText, selection.variable) : isolation.expression;
  const isolationDone = Boolean(isolatedExpr);

  const multipliedEq = useCallback((index) => {
    try {
      return applyEquationMultiplier(equations[index], latexToExpression(multipliers[index]), variables);
    } catch {
      return null;
    }
  }, [equations, multipliers, variables]);
  const multipliersApplied = appliedMultipliers[0] && appliedMultipliers[1];
  const combinationLocked = Boolean(combination.text);

  const reduceInputText = effectiveMethod === 'substitution' ? substitution.equationText : combination.text;
  const reduceCoefficients = effectiveMethod === 'substitution'
    ? (reduceInputText ? linearEquationCoefficients(reduceInputText, variables) : null)
    : combination.coefficients;
  const isDegenerate = reduceCoefficients ? isDegenerateStatement(reduceCoefficients) : false;
  const degenerateTruth = isDegenerate ? degenerateStatementTruth(reduceCoefficients) : null;

  const firstSolvedDone = firstSolved.value != null;
  const backSubChosen = backSub.equationIndex != null;
  const backSubEquationText = (backSubChosen && firstSolvedDone)
    ? substituteIntoEquation(equations[backSub.equationIndex], survivingVariable, String(firstSolved.value))
    : null;
  const secondSolvedDone = secondSolved.value != null;
  const solution = secondSolvedDone ? { [survivingVariable]: firstSolved.value, [removedVariable]: secondSolved.value } : null;

  const bothPlaced = (index) => variables.every((v) => verification[index]?.placed?.[v]);
  const allVerified = solution && verification[0].checked && verification[0].valid && verification[1].checked && verification[1].valid;

  // --- Handlers ------------------------------------------------------------
  const chooseSelection = (equationIndex, variable) => {
    resetFromSelection();
    setSelection({ equationIndex, variable });
  };

  const handleIsolated = useCallback((latexResponse) => {
    const expr = solvedExpressionFor(latexResponse, selection.variable);
    if (expr == null) return;
    setIsolation({ expression: expr });
  }, [selection.variable]);

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
    setSlotAttempt({ stage: 'substitution', equationIndex, variable: clickedVariable, correct: true, armed: false });
    setSubstitution({
      targetVariable: selection.variable,
      targetEquationIndex: equationIndex,
      equationText: substituteIntoEquation(equations[equationIndex], selection.variable, isolatedExpr),
    });
  };

  const setMultiplierValue = (index, value) => {
    setMultipliers((current) => ({ ...current, [index]: value }));
    setAppliedMultipliers((current) => ({ ...current, [index]: false }));
    setCombination({ operation: null, attempts: 0, coefficients: null, text: null });
  };

  const applyMultiplier = (index) => {
    const parsed = multipliedEq(index);
    if (!parsed) {
      setSlotAttempt({ stage: 'multiplier', index, correct: false, reason: 'invalid-multiplier', armed: true });
      return;
    }
    setAppliedMultipliers((current) => ({ ...current, [index]: true }));
    setSlotAttempt({ stage: 'multiplier', index, correct: true, armed: false });
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
      coefficients: eliminates ? combined : current.coefficients,
      text: eliminates ? formatLinearEquation(combined, variables) : current.text,
    }));
  };

  const handleReduceSolved = useCallback((latexResponse) => {
    const value = solvedNumberFor(latexResponse, survivingVariable);
    if (value == null) return;
    setFirstSolved({ variable: survivingVariable, value });
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
    const value = solvedNumberFor(latexResponse, removedVariable);
    if (value == null) return;
    setSecondSolved({ variable: removedVariable, value });
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
  const checkVerification = (index) => {
    const actual = evaluateEquationSides(equations[index], solution);
    const leftOk = matchesNumericAnswer(verification[index].leftAnswer, actual.left, 0.05);
    const rightOk = matchesNumericAnswer(verification[index].rightAnswer, actual.right, 0.05);
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
      combinationOperation: effectiveMethod === 'elimination' ? combination.operation : undefined,
      combinationAttempts: effectiveMethod === 'elimination' ? combination.attempts : undefined,
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
          {solution ? (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#f0fbf4' }}>
              <strong>Ordered-pair solution:</strong>{' '}
              ({solution[variables[0]]}, {solution[variables[1]]})
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

          {effectiveMethod === 'substitution' ? (
            <div style={{ display: 'grid', gap: 14, marginTop: effectiveMethod ? 12 : 0 }}>
              {!selectionMade ? (
                <div>
                  <p style={{ margin: '0 0 8px', color: '#3c4756' }}>Which equation and variable will you isolate first?</p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {equations.map((eq, eqIndex) => (
                      <div key={eqIndex} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#5f6b7a', minWidth: 74 }}>Equation {eqIndex + 1}:</span>
                        {variables.map((v) => (
                          <button key={v} type="button" onClick={() => chooseSelection(eqIndex, v)} style={secondaryButtonStyle}>Isolate {v}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: '0 0 6px', color: '#3c4756' }}>
                    Isolating <strong>{selection.variable}</strong> in Equation {selection.equationIndex + 1}.
                  </p>
                  <button type="button" onClick={resetFromSelection} style={{ ...secondaryButtonStyle, fontSize: 12 }}>Choose a different equation/variable</button>
                </div>
              )}

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
                  <p className="mathmaster-systems-substitution-direction">
                    Drag the expression onto the variable it replaces in Equation {otherIndex + 1}.
                    <span> On touch or keyboard, select the token, then select the variable.</span>
                  </p>
                  <SubstitutionToken
                    variable={selection.variable}
                    expression={isolatedExpr}
                    onArm={() => setSlotAttempt({ stage: 'substitution', armed: true, correct: null, variable: null })}
                  />
                  <VariableDropEquation
                    equationText={targetEquationText}
                    variables={variables}
                    replacementVariable={selection.variable}
                    onVariableAttempt={attemptSubstitution}
                    tokenArmed={slotAttempt?.stage === 'substitution' && slotAttempt?.armed}
                    label={`Equation ${otherIndex + 1}: choose where to substitute`}
                  />
                  {slotAttempt?.stage === 'substitution' && slotAttempt.correct === false ? (
                    <p className="mathmaster-systems-substitution-feedback is-error">
                      You isolated {selection.variable}, so replace {selection.variable} with the expression — not {slotAttempt.variable}.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {substitution.equationText ? (
                <div className="mathmaster-systems-substituted-equation" style={{ padding: 10, border: '1px solid #dbe3ef', borderRadius: 8, background: '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7a', marginBottom: 4 }}>Substituted equation</div>
                  <MathDisplay value={substitution.equationText} format="ascii-math" />
                </div>
              ) : null}
            </div>
          ) : null}

          {effectiveMethod === 'elimination' ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
              {!selection.variable ? (
                <div>
                  <p style={{ margin: '0 0 8px', color: '#3c4756' }}>Which variable will you eliminate?</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {variables.map((v) => (
                      <button key={v} type="button" onClick={() => chooseSelection(null, v)} style={secondaryButtonStyle}>Eliminate {v}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ margin: '0 0 6px', color: '#3c4756' }}>Eliminating <strong>{selection.variable}</strong>.</p>
                  <button type="button" onClick={resetFromSelection} style={{ ...secondaryButtonStyle, fontSize: 12 }}>Choose a different variable</button>
                </div>
              )}

              {selection.variable && !combinationLocked ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {[0, 1].map((index) => (
                    <div key={index} style={{ padding: 10, border: '1px solid #dbe3ef', borderRadius: 8, background: '#fff' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7a', marginBottom: 4 }}>Equation {index + 1}</div>
                      <MathDisplay value={equations[index]} format="ascii-math" />
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: 13 }}>Multiply by</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={multipliers[index]}
                          onChange={(e) => setMultiplierValue(index, e.target.value)}
                          style={{ ...inputStyle, width: 70, minHeight: 36, padding: '6px 8px' }}
                        />
                        <button type="button" onClick={() => applyMultiplier(index)} style={secondaryButtonStyle}>Apply</button>
                      </div>
                      {appliedMultipliers[index] && multipliedEq(index) ? (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ fontSize: 12, color: '#5f6b7a' }}>becomes:</span>
                          <MathDisplay value={multipliedEq(index).text} format="ascii-math" />
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {multipliersApplied ? (
                    <div>
                      <p style={{ margin: '0 0 8px', color: '#3c4756' }}>Add or subtract the transformed equations:</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => handleCombine('add')} style={combination.operation === 'add' ? activeButtonStyle : secondaryButtonStyle}>Add</button>
                        <button type="button" onClick={() => handleCombine('subtract')} style={combination.operation === 'subtract' ? activeButtonStyle : secondaryButtonStyle}>Subtract</button>
                      </div>
                      {combination.attempts > 0 && !combinationLocked ? (
                        <p style={{ margin: '8px 0 0', color: '#a02020', fontSize: 13 }}>
                          These coefficients do not cancel {selection.variable} when the equations are {combination.operation === 'subtract' ? 'subtracted' : 'added'}. Check your selected operation or multiplier.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {combinationLocked ? (
                <div style={{ padding: 10, border: '1px solid #dbe3ef', borderRadius: 8, background: '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7a', marginBottom: 4 }}>
                    Combined ({combination.operation}) — {selection.variable} cancels
                  </div>
                  <MathDisplay value={combination.text} format="ascii-math" />
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
                draftKey={draftKey ? `${draftKey}:algebraic:reduce:${effectiveMethod}:${selection.variable}` : null}
                onSolved={handleReduceSolved}
                onUndoStateChange={setEmbeddedUndoController}
                workspaceDifficulty={questionData.workspaceDifficulty}
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
                    Back-substitute by dragging the solved value onto {survivingVariable} in either original equation.
                    <span> On touch or keyboard, select the token, then select {survivingVariable}.</span>
                  </p>
                  <SubstitutionToken
                    variable={survivingVariable}
                    expression={String(firstSolved.value)}
                    onArm={() => setSlotAttempt({ stage: 'backSubstitution', armed: true, correct: null, variable: null })}
                  />
                  <div className="mathmaster-systems-backsub-equations">
                    {equations.map((eq, index) => (
                      <div key={index}>
                        <div className="mathmaster-systems-backsub-equation-label">Equation {index + 1}</div>
                        <VariableDropEquation
                          equationText={eq}
                          variables={variables}
                          replacementVariable={survivingVariable}
                          onVariableAttempt={(variable) => attemptBackSubstitution(index, variable)}
                          tokenArmed={slotAttempt?.stage === 'backSubstitution' && slotAttempt?.armed}
                          label={`Equation ${index + 1}: choose where to back-substitute`}
                        />
                      </div>
                    ))}
                  </div>
                  {slotAttempt?.stage === 'backSubstitution' && slotAttempt.correct === false ? (
                    <p className="mathmaster-systems-substitution-feedback is-error">
                      The solved value belongs where {survivingVariable} appears, not where {slotAttempt.variable} appears.
                    </p>
                  ) : null}
                </div>              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ padding: 10, border: '1px solid #dbe3ef', borderRadius: 8, background: '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7a', marginBottom: 4 }}>Equation {backSub.equationIndex + 1} with the value substituted</div>
                    <MathDisplay value={backSubEquationText} format="ascii-math" />
                  </div>
                  {!secondSolvedDone ? (
                    <div style={{ marginTop: 10 }}>
                      <EmbeddedStepAlgebra
                        label={`Solve for ${removedVariable}`}
                        prompt={`Solve this equation for ${removedVariable}.`}
                        equationText={backSubEquationText}
                        solveFor={removedVariable}
                        draftKey={draftKey ? `${draftKey}:algebraic:back-solve:${backSub.equationIndex}` : null}
                        onSolved={handleSecondSolved}
                        onUndoStateChange={setEmbeddedUndoController}
                        workspaceDifficulty={questionData.workspaceDifficulty}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {solution && config.requireVerification ? (
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Verify the ordered pair in both original equations.</p>
              {equations.map((eq, index) => (
                <div key={index} style={{ padding: 10, border: '1px solid #dbe3ef', borderRadius: 8, background: verification[index].valid ? '#f0fbf4' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5f6b7a', marginBottom: 4 }}>Equation {index + 1}</div>
                  <MathDisplay value={eq} format="ascii-math" />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => placeVerificationValue(index, v)}
                        style={verification[index].placed[v] ? activeButtonStyle : secondaryButtonStyle}
                      >
                        Place {v} = {solution[v]}
                      </button>
                    ))}
                  </div>
                  {bothPlaced(index) ? (
                    <div style={{ marginTop: 8 }}>
                      <MathDisplay value={substituteIntoEquation(substituteIntoEquation(eq, variables[0], String(solution[variables[0]])), variables[1], String(solution[variables[1]]))} format="ascii-math" />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                        <Field label="Left side simplifies to">
                          <input type="number" inputMode="decimal" value={verification[index].leftAnswer} onChange={(e) => setVerificationAnswer(index, 'leftAnswer', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label="Right side simplifies to">
                          <input type="number" inputMode="decimal" value={verification[index].rightAnswer} onChange={(e) => setVerificationAnswer(index, 'rightAnswer', e.target.value)} style={inputStyle} />
                        </Field>
                      </div>
                      <button type="button" onClick={() => checkVerification(index)} style={smallActionStyle}>Check equation {index + 1}</button>
                      {verification[index].checked ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: verification[index].valid ? '#137333' : '#a02020' }}>
                          {verification[index].valid ? 'Both sides check out.' : 'Substitute the values in again and simplify each side carefully — the two sides should match.'}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {readyToSubmit ? (
            <button type="button" onClick={check} style={actionStyle}>Check my work</button>
          ) : null}
          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
            </div>
          ) : null}

          <HintPanel
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
          />
        </Panel>
        </div>
      </div>
    </EnlargeableFigure>
  );
}
