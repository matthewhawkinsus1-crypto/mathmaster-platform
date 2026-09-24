/*
 * 3×3 SYSTEMS BY SUBSTITUTION — ONE ROUND OF DIMENSIONAL REDUCTION (#341).
 *
 *   E1, E2, E3 in x, y, z
 *     choose an equation + variable           (the student; nothing suggested)
 *     isolate it                              (Step Algebra)
 *     substitute into BOTH other equations    (the same token, twice, any order)
 *     simplify each to standard form          (Step Algebra, objective ay + bz = c)
 *   = R1, R2 in the two remaining variables
 *     solve that 2×2                          (the REAL 2×2 workflow, embedded)
 *     back-substitute both values             (the student's placements)
 *     solve for the isolated variable         (Step Algebra, simplified final form)
 *     verify in all three ORIGINAL equations  (the student's arithmetic)
 *
 * The round itself is data — src/tools/systemsWorkspace/substitutionReduction.js
 * holds the lineage and every transition as a pure function. This file is its
 * screen. It performs no algebra: every expression comes from Step Algebra or
 * from the student and is checked, never generated.
 *
 * Persistence: the whole round is one draft-backed, versioned field
 * (`reduction`) read back through a deterministic repair. The reduced 2×2 is
 * the existing AlgebraicSystemMode mounted under its own draft scope, keyed by
 * the exact reduced equations, so it persists, restores and undoes exactly as
 * a standalone 2×2 question does.
 *
 * Undo: one composite controller, most local first — the open Step Algebra,
 * then whichever of this round's history and the reduced subsystem's history
 * holds the most recent work (see `compositeUndo`).
 */
import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState, { ToolDraftScopeProvider, readToolDraftRecord, useToolDraftScope } from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { WorkViewUndoProvider, questionUndoResetKey, useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import { Panel, ResultPill, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import { latexToExpression } from '../../algebraAstEngine.js';
import AlgebraicSystemMode, {
  EmbeddedStepAlgebra,
  MathDragToken,
  SubstitutionToken,
  SystemsWorkTrail,
  VariableDropEquation,
  solvedExpressionFor,
  solvedNumberFor,
  subsystemReportFromDraft,
} from './AlgebraicSystemMode.jsx';
import { classroomEquationText, exactNumberText, normalizeAlgebraicSystemConfig, substituteIntoEquation } from './algebraicSystemsEngine.js';
import {
  RELATION_DESTINATION_ID,
  allOriginalsVerified,
  allTargetsReduced,
  attemptBackPlacement,
  attemptTargetSubstitution,
  backSubstitutionDestinations,
  backSubstitutionEquation,
  buildReductionSystem,
  carryTargetUnchanged,
  changeSubstitutionToken,
  checkTokenSimplification,
  checkVerification,
  chooseReductionSource,
  clearBackDestination,
  emptyReductionState,
  gradeReduction,
  isolatedExpression,
  knownSolution,
  openTargetSimplification,
  placeVerificationValue,
  recordBackSolve,
  recordIsolatedExpression,
  recordTargetStandardForm,
  reducedEquationId,
  reducedSystem,
  reducedSystemIdentity,
  reductionAnswerKey,
  reductionPhase,
  reductionTargets,
  remainingVariables,
  repairReductionState,
  resetReductionSource,
  setTokenSimplificationDraft,
  setVerificationAnswer,
  sourceAlreadyIsolated,
  startTokenSimplification,
  substitutionToken,
  targetIsReduced,
  useIsolatedExpressionAsToken,
  verificationReady,
  verificationVariables,
} from './substitutionReduction.js';
import './AlgebraicSystemMode.css';

const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const lineageName = (id) => String(id || '').replace(/\d/g, (digit) => SUBSCRIPTS[Number(digit)]);

const actionStyle = { marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButtonStyle = { ...actionStyle, marginTop: 0, padding: '9px 14px', fontSize: 13, background: '#eef4ff', color: '#174ea6' };
const smallActionStyle = { ...actionStyle, marginTop: 8, padding: '9px 14px', fontSize: 13 };

const hashText = (value) => {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

/** Neutral words for a rejected move. They name the structural problem, never the answer. */
const feedbackText = (note, system, sourceVariable) => {
  if (!note) return null;
  const labelFor = (id) => (id === RELATION_DESTINATION_ID ? 'The isolated relationship' : system.equations.find((equation) => equation.id === id)?.label || 'That equation');
  switch (`${note.stage}:${note.reason}`) {
    case 'source:variable-absent':
      return `${labelFor(note.equationId)} has no ${note.variable} term, so ${note.variable} cannot be isolated from it. Choose another equation or variable.`;
    case 'substitution:source-equation':
      return 'That placement puts the expression back into the equation it came from. Which equations still need it?';
    case 'substitution:already-substituted':
      return `${labelFor(note.equationId)} has already received the expression.`;
    case 'substitution:wrong-variable':
      return 'That variable does not match the isolated equation. Look back at what the expression is equal to, then try the placement again.';
    case 'substitution:contains-variable':
      return `${labelFor(note.equationId)} still contains ${sourceVariable}. Place the expression there instead of carrying the equation over.`;
    case 'substitution:expression-parse':
      return 'MathMaster could not open the next solving step from that token form. Your work is still here. Choose Change expression and use an equivalent form, or try the original isolated form again.';
    case 'token:token-in-use':
      return 'The expression is already in a reduced equation. Undo that substitution first if you want to change it.';
    case 'reduce:not-equivalent':
      return 'That form is not the same equation the substitution produced. Keep working in the solver.';
    case 'back:destination-lacks-unknown':
      return `${labelFor(note.destinationId)} has no ${note.variable}, so it cannot give the value of ${note.variable}. Choose another equation.`;
    case 'back:wrong-variable':
    case 'verification:wrong-variable':
      return 'That value was placed on a different variable than the one it represents. Use the variable named on the token to choose another location.';
    default:
      return null;
  }
};

export default function SubstitutionReductionMode({ questionData = {}, onAction, draftKey = null }) {
  const config = useMemo(() => normalizeAlgebraicSystemConfig(questionData), [questionData]);
  const system = useMemo(
    () => buildReductionSystem({ variables: config.variables, equations: config.equations }),
    // The config object is rebuilt per questionData; the system only changes when the mathematics does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.variables.join('|'), config.equations.join('|')],
  );
  const answerKey = useMemo(() => reductionAnswerKey(system), [system]);

  const [storedReduction, setStoredReduction] = usePersistentToolState('reduction', emptyReductionState);
  // Every read goes through the repair, so a draft from an older build or an
  // edited question reopens on exactly the work that is still true.
  const reduction = useMemo(() => repairReductionState(storedReduction, system), [storedReduction, system]);

  // Transient presentation only — see toolStatePersistence.js.
  const [reductionFeedback, setReductionFeedback] = useState(null);
  const [armedToken, setArmedToken] = useState(null);
  const [embeddedUndoController, setEmbeddedUndoController] = useState(null);
  const [subsystemUndoController, setSubsystemUndoController] = useState(null);
  const [subsystemReport, setSubsystemReport] = useState(null);
  const { feedback, submit } = useToolSubmission(onAction);

  const apply = useCallback((transition) => {
    if (!transition) return;
    if (transition.state && transition.state !== reduction) setStoredReduction(transition.state);
    setReductionFeedback(transition.feedback || null);
    // A placement that landed puts the token down; a rejected one leaves it in
    // hand so the student can try another location.
    if (!transition.feedback && transition.state !== reduction) setArmedToken(null);
  }, [reduction, setStoredReduction]);

  /* ----------------------------------------------------- reduced subsystem */
  const reduced = useMemo(() => reducedSystem(reduction, system), [reduction, system]);
  const reducedIdentity = reduced ? reducedSystemIdentity(reduced) : null;
  const scopeContext = useToolDraftScope();
  const subsystemScope = reducedIdentity ? `${scopeContext?.scope || 'tool'}:reduced-${reducedIdentity}` : null;
  const handleSubsystemSolution = useCallback((report) => {
    setSubsystemReport({ identity: reducedIdentity, report });
  }, [reducedIdentity]);
  // The subsystem's own draft record is the truth; its report keeps this
  // render in step with it. Before it has reported (the first render after a
  // reload) read the record directly so a solved subsystem does not flash open.
  const subsystemState = useMemo(() => {
    if (!reducedIdentity) return null;
    if (subsystemReport?.identity === reducedIdentity) return subsystemReport.report;
    if (!scopeContext?.draftKey || !subsystemScope) return null;
    return subsystemReportFromDraft(readToolDraftRecord(scopeContext.draftKey, subsystemScope));
  }, [reducedIdentity, subsystemReport, scopeContext?.draftKey, subsystemScope]);
  const reducedSolution = subsystemState?.solution || null;

  const phase = reductionPhase(reduction, system, { reducedSolution, requireVerification: config.requireVerification });
  const source = reduction.source;
  const sourceVariable = source?.variable || null;
  const isolated = isolatedExpression(reduction, system);
  const token = substitutionToken(reduction);
  const targets = reductionTargets(reduction, system);
  const remaining = remainingVariables(reduction, system);
  const remainingKey = remaining.join('|');
  const standardFormObjective = useMemo(() => {
    const names = remainingKey.split('|');
    return { kind: 'linearStandardForm', variable: names[0], variables: names };
  }, [remainingKey]);
  const reducedCount = targets.filter((equation) => targetIsReduced(reduction.targets[equation.id])).length;
  const solution = knownSolution(reduction, reducedSolution);
  const fullSolution = reduction.back?.solved ? solution : null;
  const backEquation = reducedSolution ? backSubstitutionEquation(reduction, system, reducedSolution) : null;

  /* ------------------------------------------------------------ undo */
  const historyState = useMemo(() => ({ reduction: storedReduction }), [storedReduction]);
  const restore = useCallback((value) => setStoredReduction(value?.reduction ?? emptyReductionState()), [setStoredReduction]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last 3×3 substitution edit',
    state: historyState,
    onRestore: restore,
    resetKey: questionUndoResetKey(questionData),
    ownerId: 'algebraic-reduction-history',
  });
  const hasPostSubsystemWork = Boolean(reduction.back?.destinationId || Object.keys(reduction.verification || {}).length);
  // Most local first. The reduced subsystem's work happened after this
  // round's reduction and before its back-substitution, so it is undone
  // between the two.
  const compositeUndo = useMemo(() => {
    const historyController = { canUndo: undoHistory.canUndo, onUndo: undoHistory.undo, label: 'Undo the last 3×3 substitution edit' };
    if (embeddedUndoController?.canUndo) return embeddedUndoController;
    if (phase === 'subsystem' && subsystemUndoController?.canUndo) return subsystemUndoController;
    if (reducedSolution && !hasPostSubsystemWork && subsystemUndoController?.canUndo) return subsystemUndoController;
    return historyController;
  }, [embeddedUndoController, subsystemUndoController, phase, reducedSolution, hasPostSubsystemWork, undoHistory.canUndo, undoHistory.undo]);
  useActiveUndoOwner({ id: 'algebraic-reduction-composite', active: true, priority: 60, controller: compositeUndo });
  const undoCapability = {
    label: '↶ Undo',
    title: compositeUndo.label || 'Undo the last algebra step',
    onAction: () => compositeUndo.onUndo?.(),
    disabled: !compositeUndo.canUndo,
    studentState: true,
  };

  /* -------------------------------------------------------- handlers */
  const handleIsolated = useCallback((latexResponse) => {
    const expression = solvedExpressionFor(latexResponse, sourceVariable);
    if (expression != null) apply(recordIsolatedExpression(reduction, system, expression));
  }, [apply, reduction, system, sourceVariable]);

  const activeTargetId = reduction.activeTargetId;
  const handleStandardized = useCallback((latexResponse) => {
    if (!activeTargetId) return;
    let text = null;
    try { text = latexToExpression(latexResponse); } catch { text = null; }
    if (text) apply(recordTargetStandardForm(reduction, system, activeTargetId, text));
  }, [apply, reduction, system, activeTargetId]);

  const handleBackSolved = useCallback((latexResponse) => {
    const value = solvedNumberFor(latexResponse, sourceVariable);
    const text = solvedExpressionFor(latexResponse, sourceVariable);
    if (value != null) apply(recordBackSolve(reduction, value, text));
  }, [apply, reduction, sourceVariable]);

  const readyToSubmit = phase === 'complete';
  const check = () => {
    const grade = gradeReduction(reduction, system, reducedSolution, { requireVerification: config.requireVerification });
    submit({ isCorrect: grade.isCorrect, score: grade.isCorrect ? 1 : 0 }, grade.solution, {
      mode: 'algebraic',
      dimension: config.dimension,
      method: 'substitution',
      // The lineage, whole: what was isolated where, what each target became,
      // how the reduced 2×2 was solved, and where the last value came from.
      reduction: {
        source: reduction.source,
        isolatedExpression: isolated,
        alreadyIsolated: sourceAlreadyIsolated(reduction, system),
        tokenExpression: token,
        targets: targets.map((equation) => ({
          fromEquationId: equation.id,
          reducedEquationId: reducedEquationId(reduction, system, equation.id),
          ...reduction.targets[equation.id],
        })),
      },
      reducedSystem: reduced ? { variables: reduced.variables, equations: reduced.equations.map((equation) => equation.text) } : null,
      subsystem: subsystemState?.detail || null,
      backSubstitution: { ...reduction.back, equation: backEquation },
      verification: reduction.verification,
      solution: grade.solution,
      expected: answerKey,
    });
  };

  /* ------------------------------------------------------- work trail */
  const workTrailStages = [
    { id: 'method', label: 'Method', complete: true, summary: 'Substitution' },
    {
      id: 'isolate',
      label: 'Isolate',
      complete: Boolean(token || targets.some((equation) => reduction.targets[equation.id])),
      summary: token && sourceVariable ? `${sourceVariable} = ${token}` : '',
    },
    {
      id: 'reduce',
      label: `Reduce ${reducedCount}/${targets.length || system.equations.length - 1}`,
      complete: allTargetsReduced(reduction, system),
      summary: reduced ? reduced.equations.map((equation) => `${lineageName(equation.id)}: ${equation.text}`).join(' · ') : '',
    },
    {
      id: 'subsystem',
      label: `Solve ${system.variables.length - 1}×${system.variables.length - 1}`,
      complete: Boolean(reducedSolution),
      summary: reducedSolution ? remaining.map((name) => `${name} = ${exactNumberText(reducedSolution[name])}`).join(', ') : '',
    },
    {
      id: 'back',
      label: 'Back-substitute',
      complete: Boolean(reduction.back?.solved),
      summary: reduction.back?.solved && sourceVariable ? `${sourceVariable} = ${reduction.back.solved.text}` : '',
    },
    {
      id: 'verify',
      label: 'Verify',
      complete: !config.requireVerification || allOriginalsVerified(reduction, system),
      summary: allOriginalsVerified(reduction, system) ? 'Checked in all three original equations' : '',
    },
  ];

  const embeddedSolverActive = ['isolate'].includes(phase)
    || (phase === 'reduce' && Boolean(activeTargetId))
    || (phase === 'back-substitute' && Boolean(backEquation));
  const note = feedbackText(reductionFeedback, system, sourceVariable);

  /* ------------------------------------------------------------ view */
  const unsupported = answerKey.type !== 'unique';
  return (
    <EnlargeableFigure
      label="3×3 algebraic systems workspace"
      enlargeLabel="Enlarge 3×3 algebraic systems workspace"
      style={{ width: '100%' }}
      capabilities={{
        undo: undoCapability,
        equationInput: { label: 'All three equations and every algebraic move', studentState: true },
        numericControls: { label: 'Targets, reduced equations, and the final solution', studentState: true },
        instruction: { text: 'Solve the 3×3 system by substitution, showing every mathematical decision.' },
        primaryActions: readyToSubmit ? [{ id: 'check-algebraic-system', label: 'Check my work', onAction: check }] : [],
      }}
    >
      <div className={`mathmaster-reduction-layout${embeddedSolverActive ? ' has-active-solver' : ''}`}>
        <aside className="mathmaster-reduction-reference" aria-label="Equations and their lineage">
          <div className="mathmaster-reduction-reference-heading">Original equations</div>
          {system.equations.map((equation) => (
            <div
              key={equation.id}
              className={`mathmaster-reduction-equation-card${source?.equationId === equation.id ? ' is-source' : ''}`}
              data-equation-id={equation.id}
            >
              <span className="mathmaster-reduction-equation-label">{equation.label}</span>
              <MathDisplay value={equation.text} format="ascii-math" />
              {source?.equationId === equation.id && token ? (
                <span className="mathmaster-reduction-lineage-chip">{sourceVariable} = <MathDisplay value={token} format="ascii-math" inline /></span>
              ) : null}
            </div>
          ))}

          {targets.some((equation) => reduction.targets[equation.id]) ? (
            <>
              <div className="mathmaster-reduction-reference-heading">Reduced subsystem</div>
              {targets.filter((equation) => reduction.targets[equation.id]).map((equation) => {
                const entry = reduction.targets[equation.id];
                const id = reducedEquationId(reduction, system, equation.id);
                return (
                  <div key={equation.id} className={`mathmaster-reduction-equation-card is-derived${targetIsReduced(entry) ? ' is-reduced' : ''}`} data-reduced-id={id}>
                    <span className="mathmaster-reduction-equation-label">
                      {lineageName(id)} <span className="mathmaster-reduction-lineage-from">from {equation.label}{entry.mode === 'carried' ? ' (carried over)' : ''}</span>
                    </span>
                    <MathDisplay value={classroomEquationText(entry.standardText || entry.rawText)} format="ascii-math" />
                  </div>
                );
              })}
            </>
          ) : null}

          {solution && Object.keys(solution).length ? (
            <div className="mathmaster-reduction-solved-values" aria-label="Solved values">
              {system.variables.filter((name) => solution[name] != null).map((name) => (
                <span key={name} className="mathmaster-reduction-value-chip">{name} = {name === sourceVariable ? reduction.back.solved.text : exactNumberText(solution[name])}</span>
              ))}
            </div>
          ) : null}
          {fullSolution ? (
            <div className="mathmaster-reduction-ordered-triple">
              <strong>Ordered triple:</strong> ({system.variables.map((name) => (name === sourceVariable ? reduction.back.solved.text : exactNumberText(fullSolution[name]))).join(', ')})
            </div>
          ) : null}
        </aside>

        <div className="mathmaster-reduction-workflow">
          <Panel title="3×3 substitution workflow">
            {unsupported ? (
              <div className="mathmaster-reduction-unsupported" role="alert">
                <strong>This system cannot be solved in this workspace yet.</strong>
                <p>It does not have exactly one solution, and the 3×3 substitution workspace only supports systems that do. Nothing you did caused this. Let your teacher know so they can fix the question.</p>
              </div>
            ) : (
              <>
                <SystemsWorkTrail stages={workTrailStages} />

                {phase === 'choose-source' ? (
                  <div className="mathmaster-reduction-stage">
                    <p className="mathmaster-systems-substitution-direction">Which equation and variable will you isolate first?</p>
                    <div className="mathmaster-reduction-source-grid">
                      {system.equations.map((equation) => (
                        <div key={equation.id} className="mathmaster-reduction-source-row">
                          <span>{equation.label}:</span>
                          {system.variables.map((name) => (
                            <button
                              key={name}
                              type="button"
                              style={secondaryButtonStyle}
                              onClick={() => apply(chooseReductionSource(reduction, system, equation.id, name))}
                              aria-label={`Isolate ${name} in ${equation.label}`}
                            >
                              Isolate {name}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {phase === 'isolate' ? (
                  <div className="mathmaster-reduction-stage">
                    <p className="mathmaster-systems-substitution-direction">
                      Isolating <strong>{sourceVariable}</strong> in {system.equations.find((equation) => equation.id === source.equationId)?.label}.
                    </p>
                    <button type="button" onClick={() => apply(resetReductionSource())} style={{ ...secondaryButtonStyle, fontSize: 12, width: 'fit-content' }}>Choose a different equation/variable</button>
                    <EmbeddedStepAlgebra
                      label={`Isolate ${sourceVariable}`}
                      prompt={`Isolate ${sourceVariable} in this equation.`}
                      equationText={system.equations.find((equation) => equation.id === source.equationId)?.text}
                      solveFor={sourceVariable}
                      draftKey={draftKey ? `${draftKey}:reduction:isolate:${source.equationId}:${sourceVariable}` : null}
                      onSolved={handleIsolated}
                      onUndoStateChange={setEmbeddedUndoController}
                      workspaceDifficulty={questionData.workspaceDifficulty}
                    />
                  </div>
                ) : null}

                {phase === 'prepare-token' ? (
                  <div className="mathmaster-systems-substitution-stage">
                    <div className="mathmaster-reduction-ready-card">
                      <div className="mathmaster-reduction-ready-title">Isolated expression ready</div>
                      <MathDisplay value={`${sourceVariable} = ${isolated}`} format="ascii-math" />
                      <p>This form is already mathematically valid. You may turn it into the substitution token now, or simplify the expression first. Simplifying is optional and does not change your credit.</p>
                    </div>
                    {!reduction.isolation.simplifying ? (
                      <div className="mathmaster-reduction-button-row">
                        <button type="button" onClick={() => apply(useIsolatedExpressionAsToken(reduction, system))} style={secondaryButtonStyle}>Use this form as the token</button>
                        <button type="button" onClick={() => apply(startTokenSimplification(reduction))} style={secondaryButtonStyle}>Simplify first (optional)</button>
                      </div>
                    ) : (
                      <div className="mathmaster-reduction-ready-card">
                        <label className="mathmaster-reduction-field">
                          Write an equivalent, simpler expression
                          <MathInput
                            value={reduction.isolation.simplificationDraft || ''}
                            onChange={(value) => apply(setTokenSimplificationDraft(reduction, value))}
                            placeholder="e.g. 6 - y - z"
                            ariaLabel="Optional simplified expression for the substitution token"
                            toolProfile="algebra-operation"
                          />
                        </label>
                        <div className="mathmaster-reduction-button-row">
                          <button type="button" onClick={() => apply(checkTokenSimplification(reduction, system))} style={smallActionStyle}>Check and use my simplification</button>
                          <button type="button" onClick={() => apply(useIsolatedExpressionAsToken(reduction, system))} style={secondaryButtonStyle}>Skip simplification</button>
                        </div>
                        {reduction.isolation.simplificationChecked && !reduction.isolation.simplificationValid ? (
                          <p className="mathmaster-systems-substitution-feedback is-error">That rewrite is not equivalent to the isolated expression yet. Revise it, or use the original form.</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}

                {phase === 'reduce' ? (
                  <div className="mathmaster-systems-substitution-stage mathmaster-reduction-reduce-stage">
                    <p className="mathmaster-systems-substitution-direction">
                      Substitute the isolated expression into each of the other equations. You choose each equation and where the expression goes, in any order.
                      <span> Drag the token, or select it and then select a variable.</span>
                    </p>
                    <div className="mathmaster-reduction-progress" aria-live="polite">Reduced equations {reducedCount} of {targets.length}</div>
                    {targets.some((equation) => !reduction.targets[equation.id]) ? (
                      <div className="mathmaster-reduction-button-row">
                        <SubstitutionToken
                          variable={sourceVariable}
                          expression={token || isolated}
                          onArm={() => { setArmedToken({ kind: 'substitution', variable: sourceVariable }); setReductionFeedback(null); }}
                        />
                        {!Object.values(reduction.targets).some((entry) => entry?.mode === 'substituted') ? (
                          <button type="button" onClick={() => apply(changeSubstitutionToken(reduction))} style={{ ...secondaryButtonStyle, fontSize: 12 }}>Change expression</button>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mathmaster-reduction-target-grid">
                      {targets.map((equation) => {
                        const entry = reduction.targets[equation.id];
                        const id = reducedEquationId(reduction, system, equation.id);
                        if (!entry) {
                          return (
                            <div key={equation.id} className="mathmaster-reduction-target-card" data-target-id={equation.id}>
                              <div className="mathmaster-systems-backsub-equation-label">{equation.label} → {lineageName(id)}</div>
                              <VariableDropEquation
                                equationText={equation.text}
                                variables={system.variables}
                                onVariableAttempt={(variable) => apply(attemptTargetSubstitution(reduction, system, equation.id, variable))}
                                tokenArmed={armedToken?.kind === 'substitution'}
                                armedPayloadValue={sourceVariable}
                                label={`${equation.label}: choose where the isolated expression belongs`}
                              />
                              <button type="button" className="mathmaster-reduction-carry" onClick={() => apply(carryTargetUnchanged(reduction, system, equation.id))}>
                                Carry this equation over unchanged
                              </button>
                            </div>
                          );
                        }
                        const reducedDone = targetIsReduced(entry);
                        const isActive = activeTargetId === equation.id;
                        return (
                          <div key={equation.id} className={`mathmaster-reduction-target-card is-substituted${reducedDone ? ' is-reduced' : ''}${isActive ? ' is-active' : ''}`} data-target-id={equation.id}>
                            <div className="mathmaster-systems-backsub-equation-label">{lineageName(id)} · from {equation.label}</div>
                            <MathDisplay value={classroomEquationText(reducedDone ? entry.standardText : entry.rawText)} format="ascii-math" />
                            {reducedDone ? (
                              <span className="mathmaster-reduction-done">✓ Standard form</span>
                            ) : isActive ? (
                              <span className="mathmaster-reduction-working">Simplifying below</span>
                            ) : (
                              <button type="button" style={{ ...secondaryButtonStyle, width: 'fit-content' }} onClick={() => apply(openTargetSimplification(reduction, equation.id))}>
                                Simplify {lineageName(id)}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {activeTargetId && reduction.targets[activeTargetId] && !targetIsReduced(reduction.targets[activeTargetId]) ? (
                      <EmbeddedStepAlgebra
                        label={`Simplify ${lineageName(reducedEquationId(reduction, system, activeTargetId))} to standard form`}
                        prompt={`Distribute, simplify, and combine like terms until the equation has the form ${remaining.map((name, index) => `${String.fromCharCode(97 + index)}${name}`).join(' + ')} = ${String.fromCharCode(97 + remaining.length)}.`}
                        equationText={reduction.targets[activeTargetId].rawText}
                        solveFor={remaining[0]}
                        objective={standardFormObjective}
                        requireSimplifiedFinalForm
                        showHint={false}
                        draftKey={draftKey ? `${draftKey}:reduction:standardize:${activeTargetId}:${hashText(reduction.targets[activeTargetId].rawText)}` : null}
                        onSolved={handleStandardized}
                        onUndoStateChange={setEmbeddedUndoController}
                        workspaceDifficulty={questionData.workspaceDifficulty}
                        autoReveal
                        autoOpenDistribution
                        // Distribution leaves products for the student: 2(6) + 2(-y) + 2(-z).
                        simplifyDistributedProducts={false}
                      />
                    ) : null}
                  </div>
                ) : null}

                {reduced ? (
                  // Mounted from the moment the reduced system exists, and kept
                  // mounted once solved (only hidden), so an Undo can still walk
                  // back into it. Its own draft scope and Undo channel.
                  <div className="mathmaster-reduction-subsystem" hidden={phase !== 'subsystem'}>
                    <div className="mathmaster-reduction-subsystem-heading">
                      <strong>Reduced subsystem</strong>
                      <span>{reduced.equations.map((equation) => `${lineageName(equation.id)} from ${system.equations.find((original) => original.id === equation.fromEquationId)?.label}`).join(' · ')}</span>
                    </div>
                    <ReducedSubsystem
                      reduced={reduced}
                      identity={reducedIdentity}
                      scope={subsystemScope}
                      scopeContext={scopeContext}
                      parentQuestionData={questionData}
                      draftKey={draftKey}
                      onAction={onAction}
                      onSolutionChange={handleSubsystemSolution}
                      onUndoController={setSubsystemUndoController}
                    />
                  </div>
                ) : null}

                {['back-substitute', 'verify', 'complete'].includes(phase) && reducedSolution ? (
                  <BackSubstitution
                    reduction={reduction}
                    system={system}
                    reducedSolution={reducedSolution}
                    backEquation={backEquation}
                    armedToken={armedToken}
                    setArmedToken={setArmedToken}
                    apply={apply}
                    draftKey={draftKey}
                    onSolved={handleBackSolved}
                    onUndoStateChange={setEmbeddedUndoController}
                    workspaceDifficulty={questionData.workspaceDifficulty}
                  />
                ) : null}

                {fullSolution && config.requireVerification ? (
                  <Verification
                    reduction={reduction}
                    system={system}
                    solution={fullSolution}
                    sourceVariable={sourceVariable}
                    armedToken={armedToken}
                    setArmedToken={setArmedToken}
                    apply={apply}
                  />
                ) : null}

                {note ? <p className="mathmaster-systems-substitution-feedback is-error" role="status">{note}</p> : null}

                {readyToSubmit ? <button type="button" onClick={check} style={actionStyle}>Check my work</button> : null}
                {feedback ? (
                  <div style={{ marginTop: 14 }}>
                    <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
                  </div>
                ) : null}
              </>
            )}

            <HintPanel
              hints={[
                'Isolating a variable with a coefficient of 1 usually avoids fractions.',
                'The isolated expression goes into every OTHER equation. Each substitution leaves an equation in the two remaining variables.',
                'Simplify each new equation to the form ay + bz = c before solving the smaller system.',
                'Once two values are known, put them back into an equation that still has the third variable.',
              ]}
              onHintUsed={() => onAction?.('HINT_USED')}
            />
          </Panel>
        </div>
      </div>
    </EnlargeableFigure>
  );
}

/*
 * The reduced 2×2 is the existing 2×2 workflow — not a copy of it. It gets its
 * own draft scope (so its fields never collide with this round's) keyed by
 * the exact reduced equations, its own Step Algebra keys under this question's
 * draft key, and an Undo channel captured here so the parent decides when its
 * history is the most local one.
 */
function ReducedSubsystem({ reduced, identity, scope, scopeContext, parentQuestionData, draftKey, onAction, onSolutionChange, onUndoController }) {
  const questionData = useMemo(() => ({
    questionId: `${questionUndoResetKey(parentQuestionData) ?? 'algebraic-3x3'}:reduced:${identity}`,
    type: 'systemsWorkspace',
    mode: 'algebraic',
    method: 'substitution',
    variables: reduced.variables,
    equations: reduced.equations.map((equation) => equation.text),
    requireVerification: false,
    askEfficiency: false,
    workspaceDifficulty: parentQuestionData.workspaceDifficulty,
  }), [reduced, identity, parentQuestionData]);
  const subsystem = useMemo(() => ({
    equationLabels: reduced.equations.map((equation) => lineageName(equation.id)),
    onSolutionChange,
  }), [reduced, onSolutionChange]);
  return (
    <ToolDraftScopeProvider draftKey={scopeContext?.draftKey || null} scope={scope} canonicalSavedAt={scopeContext?.canonicalSavedAt || 0}>
      <WorkViewUndoProvider register={onUndoController} resetKey={identity}>
        <AlgebraicSystemMode
          key={identity}
          questionData={questionData}
          onAction={onAction}
          draftKey={draftKey ? `${draftKey}:reduction:reduced:${identity}` : null}
          subsystem={subsystem}
        />
      </WorkViewUndoProvider>
    </ToolDraftScopeProvider>
  );
}

function BackSubstitution({ reduction, system, reducedSolution, backEquation, armedToken, setArmedToken, apply, draftKey, onSolved, onUndoStateChange, workspaceDifficulty }) {
  const variable = reduction.source.variable;
  const destinations = backSubstitutionDestinations(reduction, system);
  const chosen = reduction.back?.destinationId || null;
  const solved = reduction.back?.solved || null;
  const knownNames = Object.keys(reducedSolution);
  return (
    <div className="mathmaster-systems-substitution-stage mathmaster-reduction-back-stage">
      <p className="mathmaster-systems-substitution-direction">
        Use the values you found to solve for {variable}. Choose the isolated relationship or any original equation, then place each value where it belongs.
        <span> Drag a value, or select it and then select a variable.</span>
      </p>
      {!solved ? (
        <div className="mathmaster-reduction-button-row">
          {knownNames.map((name) => (
            <MathDragToken
              key={name}
              payloadPrefix="mathmaster-back-value:"
              payloadValue={name}
              expression={`${name} = ${exactNumberText(reducedSolution[name])}`}
              label="Solved value"
              onArm={() => setArmedToken({ kind: 'back', variable: name })}
              ariaLabel={`Pick up solved value ${exactNumberText(reducedSolution[name])} for ${name}`}
            />
          ))}
        </div>
      ) : null}
      {!backEquation && !solved ? (
        <div className="mathmaster-reduction-target-grid">
          {destinations.map((destination) => {
            const placedValues = chosen === destination.id
              ? Object.fromEntries(knownNames.filter((name) => reduction.back.placed?.[name]).map((name) => [name, exactNumberText(reducedSolution[name])]))
              : {};
            return (
              <div key={destination.id} className={`mathmaster-reduction-target-card${chosen === destination.id ? ' is-active' : ''}`} data-destination-id={destination.id}>
                <div className="mathmaster-systems-backsub-equation-label">{destination.label}</div>
                <VariableDropEquation
                  equationText={destination.text}
                  variables={system.variables}
                  payloadPrefix="mathmaster-back-value:"
                  onVariableAttempt={(targetVariable, tokenVariable) => apply(attemptBackPlacement(reduction, system, reducedSolution, destination.id, targetVariable, tokenVariable))}
                  tokenArmed={armedToken?.kind === 'back'}
                  armedPayloadValue={armedToken?.kind === 'back' ? armedToken.variable : null}
                  placedValues={placedValues}
                  label={`${destination.label}: place the solved values`}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {backEquation && !solved ? (
        <>
          <button type="button" onClick={() => apply(clearBackDestination(reduction))} style={{ ...secondaryButtonStyle, fontSize: 12, width: 'fit-content' }}>Choose a different equation</button>
          <EmbeddedStepAlgebra
            label={`Solve for ${variable}`}
            prompt={`Use your substitution to solve this equation for ${variable}.`}
            equationText={backEquation}
            solveFor={variable}
            requireSimplifiedFinalForm
            draftKey={draftKey ? `${draftKey}:reduction:back-solve:${reduction.back.destinationId}:${hashText(backEquation)}` : null}
            onSolved={onSolved}
            onUndoStateChange={onUndoStateChange}
            workspaceDifficulty={workspaceDifficulty}
            autoReveal
          />
        </>
      ) : null}
      {solved ? (
        <div className="mathmaster-reduction-ready-card">
          <MathDisplay value={`${variable} = ${solved.text}`} format="ascii-math" />
        </div>
      ) : null}
    </div>
  );
}

function Verification({ reduction, system, solution, sourceVariable, armedToken, setArmedToken, apply }) {
  const display = (name) => (name === sourceVariable ? reduction.back.solved.text : exactNumberText(solution[name]));
  return (
    <div className="mathmaster-systems-verification-stage">
      <div className="mathmaster-systems-verification-heading">
        <strong>Verify the ordered triple in all three original equations</strong>
        <span>Pick up each solved value and place it where it belongs. The variable locations are not pre-highlighted.</span>
      </div>
      <div className="mathmaster-systems-verification-token-bank">
        {system.variables.map((name) => (
          <MathDragToken
            key={name}
            payloadPrefix="mathmaster-verification:"
            payloadValue={name}
            expression={`${name} = ${display(name)}`}
            label="Solved value"
            onArm={() => setArmedToken({ kind: 'verification', variable: name })}
            ariaLabel={`Pick up solved value ${display(name)} for ${name}`}
          />
        ))}
      </div>
      <div className="mathmaster-systems-verification-equations mathmaster-reduction-verification-grid">
        {system.equations.map((equation) => {
          const entry = reduction.verification?.[equation.id] || { placed: {} };
          const ready = verificationReady(reduction, system, equation.id);
          return (
            <div key={equation.id} className={`mathmaster-systems-verification-card${entry.valid ? ' is-valid' : ''}`} data-verify-id={equation.id}>
              <div className="mathmaster-systems-backsub-equation-label">{equation.label}</div>
              {!ready ? (
                <VariableDropEquation
                  equationText={equation.text}
                  variables={system.variables}
                  payloadPrefix="mathmaster-verification:"
                  onVariableAttempt={(targetVariable, tokenVariable) => apply(placeVerificationValue(reduction, system, equation.id, targetVariable, tokenVariable))}
                  tokenArmed={armedToken?.kind === 'verification'}
                  armedPayloadValue={armedToken?.kind === 'verification' ? armedToken.variable : null}
                  placedValues={Object.fromEntries(system.variables.filter((name) => entry.placed?.[name]).map((name) => [name, display(name)]))}
                  label={`${equation.label}: place the solved values`}
                />
              ) : (
                <>
                  <div className="mathmaster-systems-verification-substitution">
                    <span>Values substituted</span>
                    <MathDisplay
                      value={verificationVariables(system, equation.id).reduce((text, name) => substituteIntoEquation(text, name, display(name)), equation.text)}
                      format="ascii-math"
                    />
                  </div>
                  <div className="mathmaster-systems-verification-arithmetic">
                    <label className="mathmaster-reduction-field">
                      Left side simplifies to
                      <MathInput
                        value={entry.leftAnswer || ''}
                        onChange={(value) => apply(setVerificationAnswer(reduction, equation.id, 'leftAnswer', value))}
                        placeholder="value"
                        ariaLabel={`${equation.label} left side value`}
                        toolProfile="algebra-operation"
                        compact
                      />
                    </label>
                    <label className="mathmaster-reduction-field">
                      Right side simplifies to
                      <MathInput
                        value={entry.rightAnswer || ''}
                        onChange={(value) => apply(setVerificationAnswer(reduction, equation.id, 'rightAnswer', value))}
                        placeholder="value"
                        ariaLabel={`${equation.label} right side value`}
                        toolProfile="algebra-operation"
                        compact
                      />
                    </label>
                    <button type="button" onClick={() => apply(checkVerification(reduction, system, solution, equation.id))} style={smallActionStyle}>Check {equation.label.toLowerCase()}</button>
                    {entry.checked ? (
                      <p className={`mathmaster-systems-verification-feedback${entry.valid ? ' is-valid' : ' is-error'}`}>
                        {entry.valid ? 'Both sides check out.' : 'The values are placed. Recheck the arithmetic on each side; the two sides should match.'}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
