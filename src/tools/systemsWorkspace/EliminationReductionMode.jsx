/*
 * 3×3 SYSTEMS BY ELIMINATION — THE SCREEN (#359).
 *
 * See eliminationReduction.js for the round as data. This file performs no
 * algebra: every scaled or combined equation the student sees is either the
 * original authored equation or the student's own typed result, checked —
 * never generated or previewed before they submit it. Student-agency rules
 * from issue #359 this screen must hold:
 *
 *   - no suggested "best" variable or equation pair;
 *   - no preview of the combined equation before the student performs and
 *     types the combination;
 *   - more than one mathematically valid elimination route is accepted;
 *   - Undo backs the student out to an earlier strategic choice;
 *   - exact fractions stay exact (exactNumberText/formatLinearForm);
 *   - work history shows classroom algebra, never parser syntax;
 *   - "token" never appears in student-facing text.
 *
 * The reduced 2×2 (R1, R2) is the existing mature AlgebraicSystemMode,
 * mounted under its own draft scope and Undo channel exactly the way
 * SubstitutionReductionMode embeds it, with method "studentChoice" so
 * elimination is available there too, not only substitution.
 */
import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState, { ToolDraftScopeProvider, readToolDraftRecord, useToolDraftScope } from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { WorkViewUndoProvider, questionUndoResetKey, useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import { Panel, ResultPill, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import AlgebraicSystemMode, {
  MathDragToken,
  VariableDropEquation,
  SystemsWorkTrail,
  solvedExpressionFor,
  solvedNumberFor,
  subsystemReportFromDraft,
} from './AlgebraicSystemMode.jsx';
import { classroomEquationText, exactNumberText, normalizeAlgebraicSystemConfig, substituteIntoEquation, substitutedEquationLatex } from './algebraicSystemsEngine.js';
import { buildReductionSystem, reductionAnswerKey } from './substitutionReduction.js';
import {
  activeEliminationRoundKey,
  attemptEliminationBackPlacement,
  checkEliminationCombination,
  chooseEliminationPair,
  chooseEliminationVariable,
  clearEliminationBackDestination,
  eliminationBackSubstitutionDestinations,
  eliminationBackSubstitutionEquation,
  eliminationKnownSolution,
  eliminationPairOptions,
  eliminationPhase,
  eliminationReducedSystem,
  emptyEliminationState,
  recordEliminationBackSolve,
  repairEliminationState,
  resetEliminationRound,
  setEliminationCombinedDraft,
  setEliminationMultiplierDraft,
  setEliminationOperation,
} from './eliminationReduction.js';
import {
  allOriginalsVerified,
  checkVerification,
  placeVerificationValue,
  setVerificationAnswer,
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
const feedbackText = (note, system) => {
  if (!note) return null;
  const labelFor = (id) => system.equations.find((equation) => equation.id === id)?.label || 'That equation';
  switch (`${note.stage}:${note.reason}`) {
    case 'pair:variable-absent':
      return `${labelFor(note.equationId)} has no ${note.variable} term, so ${note.variable} cannot be eliminated from that pair. Choose a different pair.`;
    case 'pair:pair-repeated':
      return 'The other round already used this exact pair. Choose two different equations so the two reduced equations are independent.';
    case 'multiplier:invalid-multiplier':
      return 'That scale factor is not a valid nonzero number. Leave it blank if the equation needs no scaling, or enter a nonzero value.';
    case 'combine:parse-error':
      return 'MathMaster could not read that as an equation. Check the equals sign and try again.';
    case 'combine:not-equivalent':
      return 'That is not the result of combining the two scaled equations. Check your scaling and your addition or subtraction, then try again.';
    case 'combine:does-not-eliminate':
      return `That combination still has a ${note.variable} term. Check your scale factors — the ${note.variable} coefficients need to cancel.`;
    case 'back:destination-lacks-unknown':
      return `${labelFor(note.destinationId)} has no ${note.variable}, so it cannot give the value of ${note.variable}. Choose another equation.`;
    case 'back:wrong-variable':
    case 'verification:wrong-variable':
      return 'That value was placed on a different variable than the one it represents. Use the variable named on the value to choose another location.';
    default:
      return null;
  }
};

export default function EliminationReductionMode({ questionData = {}, onAction, draftKey = null }) {
  const config = useMemo(() => normalizeAlgebraicSystemConfig(questionData), [questionData]);
  const system = useMemo(
    () => buildReductionSystem({ variables: config.variables, equations: config.equations }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.variables.join('|'), config.equations.join('|')],
  );
  const answerKey = useMemo(() => reductionAnswerKey(system), [system]);

  const [storedElimination, setStoredElimination] = usePersistentToolState('elimination', emptyEliminationState);
  const elimination = useMemo(() => repairEliminationState(storedElimination, system), [storedElimination, system]);

  const [feedbackNote, setFeedbackNote] = useState(null);
  const [armedToken, setArmedToken] = useState(null);
  const [subsystemUndoController, setSubsystemUndoController] = useState(null);
  const [subsystemReport, setSubsystemReport] = useState(null);
  const { feedback, submit } = useToolSubmission(onAction);

  const apply = useCallback((transition) => {
    if (!transition) return;
    if (transition.state && transition.state !== elimination) setStoredElimination(transition.state);
    setFeedbackNote(transition.feedback || null);
    if (!transition.feedback && transition.state !== elimination) setArmedToken(null);
  }, [elimination, setStoredElimination]);

  /* ----------------------------------------------------- reduced subsystem */
  const reduced = useMemo(() => eliminationReducedSystem(elimination, system), [elimination, system]);
  const reducedIdentity = reduced ? `${reduced.variables.join(',')}|${reduced.equations.map((eq) => eq.text).join('|')}` : null;
  const scopeContext = useToolDraftScope();
  const subsystemScope = reducedIdentity ? `${scopeContext?.scope || 'tool'}:elim-reduced-${hashText(reducedIdentity)}` : null;
  const handleSubsystemSolution = useCallback((report) => {
    setSubsystemReport({ identity: reducedIdentity, report });
  }, [reducedIdentity]);
  const subsystemState = useMemo(() => {
    if (!reducedIdentity) return null;
    if (subsystemReport?.identity === reducedIdentity) return subsystemReport.report;
    if (!scopeContext?.draftKey || !subsystemScope) return null;
    return subsystemReportFromDraft(readToolDraftRecord(scopeContext.draftKey, subsystemScope));
  }, [reducedIdentity, subsystemReport, scopeContext?.draftKey, subsystemScope]);
  const reducedSolution = subsystemState?.solution || null;

  const activeRound = activeEliminationRoundKey(elimination);
  const variable = elimination.variable;
  const allVerified = allOriginalsVerified(elimination, system);
  const phase = eliminationPhase(elimination, system, { reducedSolution, requireVerification: config.requireVerification, allVerified });
  const solution = eliminationKnownSolution(elimination, reducedSolution);
  const fullSolution = elimination.back?.solved ? solution : null;
  const backEquation = reducedSolution ? eliminationBackSubstitutionEquation(elimination, system, reducedSolution) : null;

  /* ------------------------------------------------------------ undo */
  const historyState = useMemo(() => ({ elimination: storedElimination }), [storedElimination]);
  const restore = useCallback((value) => setStoredElimination(value?.elimination ?? emptyEliminationState()), [setStoredElimination]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last 3×3 elimination edit',
    state: historyState,
    onRestore: restore,
    resetKey: questionUndoResetKey(questionData),
    ownerId: 'algebraic-elimination-history',
  });
  const hasPostSubsystemWork = Boolean(elimination.back?.destinationId || Object.keys(elimination.verification || {}).length);
  const compositeUndo = useMemo(() => {
    const historyController = { canUndo: undoHistory.canUndo, onUndo: undoHistory.undo, label: 'Undo the last 3×3 elimination edit' };
    if (phase === 'subsystem' && subsystemUndoController?.canUndo) return subsystemUndoController;
    if (reducedSolution && !hasPostSubsystemWork && subsystemUndoController?.canUndo) return subsystemUndoController;
    return historyController;
  }, [subsystemUndoController, phase, reducedSolution, hasPostSubsystemWork, undoHistory.canUndo, undoHistory.undo]);
  useActiveUndoOwner({ id: 'algebraic-elimination-composite', active: true, priority: 60, controller: compositeUndo });
  const undoCapability = {
    label: '↶ Undo',
    title: compositeUndo.label || 'Undo the last algebra step',
    onAction: () => compositeUndo.onUndo?.(),
    disabled: !compositeUndo.canUndo,
    studentState: true,
  };

  /* -------------------------------------------------------- handlers */
  const handleBackSolved = useCallback((latexResponse) => {
    const value = solvedNumberFor(latexResponse, variable);
    const text = solvedExpressionFor(latexResponse, variable);
    if (value != null) apply(recordEliminationBackSolve(elimination, value, text));
  }, [apply, elimination, variable]);

  const readyToSubmit = phase === 'complete';
  const check = () => {
    const key = answerKey;
    const valuesCorrect = Boolean(fullSolution && key.type === 'unique'
      && system.variables.every((name) => Number.isFinite(fullSolution[name]) && Math.abs(fullSolution[name] - key.solution[name]) <= 1e-6 * Math.max(1, Math.abs(key.solution[name]))));
    const verified = !config.requireVerification || allVerified;
    submit({ isCorrect: valuesCorrect && verified, score: (valuesCorrect && verified) ? 1 : 0 }, fullSolution, {
      mode: 'algebraic',
      dimension: config.dimension,
      method: 'elimination',
      elimination: {
        variable,
        round1: elimination.rounds.round1,
        round2: elimination.rounds.round2,
      },
      reducedSystem: reduced ? { variables: reduced.variables, equations: reduced.equations.map((equation) => equation.text) } : null,
      subsystem: subsystemState?.detail || null,
      backSubstitution: { ...elimination.back, equation: backEquation },
      verification: elimination.verification,
      solution: fullSolution,
      expected: key,
    });
  };

  /* ------------------------------------------------------- work trail */
  const roundSummary = (roundKey) => {
    const round = elimination.rounds[roundKey];
    if (!round.combinedText) return '';
    return `${lineageName(roundKey === 'round1' ? 'R1' : 'R2')}: ${round.combinedText}`;
  };
  const workTrailStages = [
    { id: 'method', label: 'Method', complete: true, summary: 'Elimination' },
    { id: 'variable', label: 'Eliminate', complete: Boolean(variable), summary: variable || '' },
    { id: 'round1', label: 'First pair', complete: Boolean(elimination.rounds.round1.combinedText), summary: roundSummary('round1') },
    { id: 'round2', label: 'Second pair', complete: Boolean(elimination.rounds.round2.combinedText), summary: roundSummary('round2') },
    {
      id: 'subsystem',
      label: 'Solve 2×2',
      complete: Boolean(reducedSolution),
      summary: reducedSolution ? Object.keys(reducedSolution).map((name) => `${name} = ${exactNumberText(reducedSolution[name])}`).join(', ') : '',
    },
    {
      id: 'back',
      label: 'Back-substitute',
      complete: Boolean(elimination.back?.solved),
      summary: elimination.back?.solved && variable ? `${variable} = ${elimination.back.solved.text}` : '',
    },
    {
      id: 'verify',
      label: 'Verify',
      complete: !config.requireVerification || allVerified,
      summary: allVerified ? 'Checked in all three original equations' : '',
    },
  ];

  const note = feedbackText(feedbackNote, system);
  const unsupported = answerKey.type !== 'unique';

  return (
    <EnlargeableFigure
      label="3×3 algebraic systems workspace"
      enlargeLabel="Enlarge 3×3 algebraic systems workspace"
      style={{ width: '100%' }}
      capabilities={{
        undo: undoCapability,
        equationInput: { label: 'All three equations and every algebraic move', studentState: true },
        numericControls: { label: 'Scale factors, combined equations, and the final solution', studentState: true },
        instruction: { text: 'Solve the 3×3 system by elimination, showing every mathematical decision.' },
        primaryActions: readyToSubmit ? [{ id: 'check-algebraic-system', label: 'Check my work', onAction: check }] : [],
      }}
    >
      <div className="mathmaster-reduction-layout">
        <aside className="mathmaster-reduction-reference" aria-label="Equations and their lineage">
          <div className="mathmaster-reduction-reference-heading">Original equations</div>
          {system.equations.map((equation) => (
            <div key={equation.id} className="mathmaster-reduction-equation-card" data-equation-id={equation.id}>
              <span className="mathmaster-reduction-equation-label">{equation.label}</span>
              <MathDisplay value={equation.text} format="ascii-math" />
            </div>
          ))}

          {(elimination.rounds.round1.combinedText || elimination.rounds.round2.combinedText) ? (
            <>
              <div className="mathmaster-reduction-reference-heading">Reduced subsystem</div>
              {['round1', 'round2'].map((roundKey) => {
                const round = elimination.rounds[roundKey];
                if (!round.combinedText) return null;
                const id = roundKey === 'round1' ? 'R1' : 'R2';
                const fromLabels = round.pair.map((eqId) => system.equations.find((equation) => equation.id === eqId)?.label).join(' & ');
                return (
                  <div key={roundKey} className="mathmaster-reduction-equation-card is-derived is-reduced" data-reduced-id={id}>
                    <span className="mathmaster-reduction-equation-label">
                      {lineageName(id)} <span className="mathmaster-reduction-lineage-from">from {fromLabels}</span>
                    </span>
                    <MathDisplay value={classroomEquationText(round.combinedText)} format="ascii-math" />
                  </div>
                );
              })}
            </>
          ) : null}

          {solution && Object.keys(solution).length ? (
            <div className="mathmaster-reduction-solved-values" aria-label="Solved values">
              {system.variables.filter((name) => solution[name] != null).map((name) => (
                <span key={name} className="mathmaster-reduction-value-chip">{name} = {name === variable ? elimination.back.solved.text : exactNumberText(solution[name])}</span>
              ))}
            </div>
          ) : null}
          {fullSolution ? (
            <div className="mathmaster-reduction-ordered-triple">
              <strong>Ordered triple:</strong> ({system.variables.map((name) => (name === variable ? elimination.back.solved.text : exactNumberText(fullSolution[name]))).join(', ')})
            </div>
          ) : null}
        </aside>

        <div className="mathmaster-reduction-workflow">
          <Panel title="3×3 elimination workflow">
            {unsupported ? (
              <div className="mathmaster-reduction-unsupported" role="alert">
                <strong>This system cannot be solved in this workspace yet.</strong>
                <p>It does not have exactly one solution, and the 3×3 elimination workspace only supports systems that do. Nothing you did caused this. Let your teacher know so they can fix the question.</p>
              </div>
            ) : (
              <>
                <SystemsWorkTrail stages={workTrailStages} />

                {phase === 'choose-variable' ? (
                  <div className="mathmaster-reduction-stage">
                    <p className="mathmaster-systems-substitution-direction">Which variable will you eliminate?</p>
                    <div className="mathmaster-reduction-button-row">
                      {system.variables.map((name) => (
                        <button key={name} type="button" style={secondaryButtonStyle} onClick={() => apply(chooseEliminationVariable(elimination, system, name))} aria-label={`Eliminate ${name}`}>
                          Eliminate {name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(phase === 'round1-pair' || phase === 'round2-pair') ? (
                  <EliminationPairChoice
                    label={phase === 'round1-pair' ? 'First pair' : 'Second pair'}
                    system={system}
                    roundKey={activeRound}
                    elimination={elimination}
                    apply={apply}
                  />
                ) : null}

                {(phase === 'round1-combine' || phase === 'round2-combine') ? (
                  <EliminationCombineStage
                    label={phase === 'round1-combine' ? 'First pair' : 'Second pair'}
                    system={system}
                    roundKey={activeRound}
                    variable={variable}
                    elimination={elimination}
                    apply={apply}
                  />
                ) : null}

                {reduced ? (
                  <div className="mathmaster-reduction-subsystem" hidden={phase !== 'subsystem'}>
                    <div className="mathmaster-reduction-subsystem-heading">
                      <strong>Reduced subsystem</strong>
                      <span>{reduced.equations.map((equation) => `${lineageName(equation.id)} from ${equation.fromPair.map((eqId) => system.equations.find((original) => original.id === eqId)?.label).join(' & ')}`).join(' · ')}</span>
                    </div>
                    <ReducedEliminationSubsystem
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
                  <EliminationBackSubstitution
                    elimination={elimination}
                    system={system}
                    reducedSolution={reducedSolution}
                    backEquation={backEquation}
                    armedToken={armedToken}
                    setArmedToken={setArmedToken}
                    apply={apply}
                    draftKey={draftKey}
                    onSolved={handleBackSolved}
                    variable={variable}
                  />
                ) : null}

                {fullSolution && config.requireVerification ? (
                  <EliminationVerification
                    elimination={elimination}
                    system={system}
                    solution={fullSolution}
                    variable={variable}
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
                'Any two of the three equations may be combined first — nothing is the "right" starting pair.',
                'Scale an equation only if it needs it. If a variable’s coefficients already match or are opposite, add or subtract directly.',
                'The second pair must be different from the first, so the two reduced equations use independent information.',
                'Once two values are known, put them back into an original equation that still has the third variable.',
              ]}
              onHintUsed={() => onAction?.('HINT_USED')}
            />
          </Panel>
        </div>
      </div>
    </EnlargeableFigure>
  );
}

/* Choosing the equation pair for this round — every pair shown with equal weight, nothing marked as suggested. */
function EliminationPairChoice({ label, system, roundKey, elimination, apply }) {
  const options = useMemo(() => eliminationPairOptions(system), [system]);
  return (
    <div className="mathmaster-reduction-stage">
      <p className="mathmaster-systems-substitution-direction">{label}: which two equations will you combine to eliminate {elimination.variable}?</p>
      <div className="mathmaster-reduction-button-row">
        {options.map((option) => (
          <button key={option.id} type="button" style={secondaryButtonStyle} onClick={() => apply(chooseEliminationPair(elimination, system, roundKey, option.id))}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/*
 * Scale (optional) and combine. Nothing here computes or previews the scaled
 * or combined equation for the student — the multiplier fields are theirs to
 * fill in (or leave blank, meaning no scaling), and the combined-equation
 * field is checked only once they submit it.
 */
function EliminationCombineStage({ label, system, roundKey, variable, elimination, apply }) {
  const round = elimination.rounds[roundKey];
  const [idA, idB] = round.pair;
  const equationA = system.equations.find((equation) => equation.id === idA);
  const equationB = system.equations.find((equation) => equation.id === idB);
  return (
    <div className="mathmaster-systems-substitution-stage mathmaster-reduction-reduce-stage">
      <p className="mathmaster-systems-substitution-direction">
        {label}: {equationA.label} and {equationB.label}. Scale either equation if it needs it — leave a scale factor blank if it does not — then choose add or subtract, and write the resulting equation.
      </p>
      <button type="button" onClick={() => apply(resetEliminationRound(elimination, roundKey))} style={{ ...secondaryButtonStyle, fontSize: 12, width: 'fit-content' }}>Choose a different pair</button>

      <div className="mathmaster-reduction-target-grid">
        {[[idA, equationA], [idB, equationB]].map(([id, equation]) => (
          <div key={id} className="mathmaster-reduction-target-card" data-equation-id={id}>
            <div className="mathmaster-systems-backsub-equation-label">{equation.label}</div>
            <MathDisplay value={equation.text} format="ascii-math" />
            <label className="mathmaster-reduction-field">
              Scale factor (leave blank for none)
              <MathInput
                value={round.multiplierDrafts?.[id] || ''}
                onChange={(value) => apply(setEliminationMultiplierDraft(elimination, roundKey, id, value))}
                placeholder="e.g. 2 or -1/3"
                ariaLabel={`Scale factor for ${equation.label}`}
                toolProfile="algebra-operation"
                compact
              />
            </label>
          </div>
        ))}
      </div>

      <div className="mathmaster-reduction-button-row">
        <button
          type="button"
          onClick={() => apply(setEliminationOperation(elimination, roundKey, 'add'))}
          style={round.operation === 'add' ? actionStyle : secondaryButtonStyle}
        >
          Add the two (scaled) equations
        </button>
        <button
          type="button"
          onClick={() => apply(setEliminationOperation(elimination, roundKey, 'subtract'))}
          style={round.operation === 'subtract' ? actionStyle : secondaryButtonStyle}
        >
          Subtract the two (scaled) equations
        </button>
      </div>

      {round.operation ? (
        <label className="mathmaster-reduction-field">
          Write the combined equation, after eliminating {variable}
          <MathInput
            value={round.combinedDraft || ''}
            onChange={(value) => apply(setEliminationCombinedDraft(elimination, roundKey, value))}
            placeholder="e.g. x + 3z = 18"
            ariaLabel="Combined equation"
            toolProfile="algebra-operation"
          />
          <button type="button" onClick={() => apply(checkEliminationCombination(elimination, system, roundKey))} style={smallActionStyle}>Check my combination</button>
        </label>
      ) : null}
    </div>
  );
}

function ReducedEliminationSubsystem({ reduced, identity, scope, scopeContext, parentQuestionData, draftKey, onAction, onSolutionChange, onUndoController }) {
  const questionData = useMemo(() => ({
    questionId: `${questionUndoResetKey(parentQuestionData) ?? 'algebraic-3x3-elimination'}:reduced:${identity}`,
    type: 'systemsWorkspace',
    mode: 'algebraic',
    // The mature 2×2 workspace offers elimination here too, not only
    // substitution: the reduced system is real algebra work, not a formality.
    method: 'studentChoice',
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
          draftKey={draftKey ? `${draftKey}:elimination:reduced:${identity}` : null}
          subsystem={subsystem}
        />
      </WorkViewUndoProvider>
    </ToolDraftScopeProvider>
  );
}

function EliminationBackSubstitution({ elimination, system, reducedSolution, backEquation, armedToken, setArmedToken, apply, draftKey, onSolved, variable }) {
  const destinations = eliminationBackSubstitutionDestinations(elimination, system);
  const chosen = elimination.back?.destinationId || null;
  const solved = elimination.back?.solved || null;
  const knownNames = Object.keys(reducedSolution);
  return (
    <div className="mathmaster-systems-substitution-stage mathmaster-reduction-back-stage">
      <p className="mathmaster-systems-substitution-direction">
        Use the values you found to solve for {variable}. Choose any original equation, then place each value where it belongs.
        <span> Drag a value, or select it and then select a variable.</span>
      </p>
      {!solved ? (
        <div className="mathmaster-reduction-button-row">
          {knownNames.map((name) => (
            <MathDragToken
              key={name}
              payloadPrefix="mathmaster-elim-back-value:"
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
              ? Object.fromEntries(knownNames.filter((name) => elimination.back.placed?.[name]).map((name) => [name, exactNumberText(reducedSolution[name])]))
              : {};
            return (
              <div key={destination.id} className={`mathmaster-reduction-target-card${chosen === destination.id ? ' is-active' : ''}`} data-destination-id={destination.id}>
                <div className="mathmaster-systems-backsub-equation-label">{destination.label}</div>
                <VariableDropEquation
                  equationText={destination.text}
                  variables={system.variables}
                  payloadPrefix="mathmaster-elim-back-value:"
                  onVariableAttempt={(targetVariable, tokenVariable) => apply(attemptEliminationBackPlacement(elimination, system, reducedSolution, destination.id, targetVariable, tokenVariable))}
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
          <button type="button" onClick={() => apply(clearEliminationBackDestination(elimination))} style={{ ...secondaryButtonStyle, fontSize: 12, width: 'fit-content' }}>Choose a different equation</button>
          <BackSolveEntry backEquation={backEquation} variable={variable} draftKey={draftKey} onSolved={onSolved} />
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

/**
 * A lightweight solve-for-one-variable entry, matching the classroom step of
 * substituting two known values into an original equation and solving for
 * the third. This is ordinary numeric arithmetic (not a multi-step
 * expression to isolate), so it uses the same plain MathInput pattern as
 * every other single-value entry in this workspace rather than opening a
 * full Step Algebra instance for one arithmetic step.
 */
function BackSolveEntry({ backEquation, variable, onSolved }) {
  const [draft, setDraft] = useState('');
  const [checked, setChecked] = useState(false);
  const submit = () => {
    setChecked(true);
    const responseText = `${variable} = ${draft}`;
    onSolved(responseText);
  };
  return (
    <div className="mathmaster-reduction-ready-card">
      <MathDisplay value={substitutedEquationLatex(backEquation) || backEquation} format={substitutedEquationLatex(backEquation) ? 'latex' : 'ascii-math'} />
      <label className="mathmaster-reduction-field">
        Solve for {variable}
        <MathInput
          value={draft}
          onChange={(value) => { setDraft(value); setChecked(false); }}
          placeholder={`value of ${variable}`}
          ariaLabel={`Solve for ${variable}`}
          toolProfile="algebra-operation"
          compact
        />
      </label>
      <button type="button" onClick={submit} style={smallActionStyle}>Check my solution</button>
      {checked ? <p className="mathmaster-systems-substitution-feedback">If that value is not yet accepted above, double-check your arithmetic and try again.</p> : null}
    </div>
  );
}

function EliminationVerification({ elimination, system, solution, variable, armedToken, setArmedToken, apply }) {
  const display = (name) => (name === variable ? elimination.back.solved.text : exactNumberText(solution[name]));
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
            payloadPrefix="mathmaster-elim-verification:"
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
          const entry = elimination.verification?.[equation.id] || { placed: {} };
          const ready = verificationReady(elimination, system, equation.id);
          return (
            <div key={equation.id} className={`mathmaster-systems-verification-card${entry.valid ? ' is-valid' : ''}`} data-verify-id={equation.id}>
              <div className="mathmaster-systems-backsub-equation-label">{equation.label}</div>
              {!ready ? (
                <VariableDropEquation
                  equationText={equation.text}
                  variables={system.variables}
                  payloadPrefix="mathmaster-elim-verification:"
                  onVariableAttempt={(targetVariable, tokenVariable) => apply(placeVerificationValue(elimination, system, equation.id, targetVariable, tokenVariable))}
                  tokenArmed={armedToken?.kind === 'verification'}
                  armedPayloadValue={armedToken?.kind === 'verification' ? armedToken.variable : null}
                  placedValues={Object.fromEntries(system.variables.filter((name) => entry.placed?.[name]).map((name) => [name, display(name)]))}
                  label={`${equation.label}: place the solved values`}
                />
              ) : (
                <>
                  <div className="mathmaster-systems-verification-substitution">
                    <span>Values substituted</span>
                    {(() => {
                      const substituted = verificationVariables(system, equation.id).reduce((text, name) => substituteIntoEquation(text, name, display(name)), equation.text);
                      const latex = substitutedEquationLatex(substituted);
                      return <MathDisplay value={latex || substituted} format={latex ? 'latex' : 'ascii-math'} />;
                    })()}
                  </div>
                  <div className="mathmaster-systems-verification-arithmetic">
                    <label className="mathmaster-reduction-field">
                      Left side simplifies to
                      <MathInput
                        value={entry.leftAnswer || ''}
                        onChange={(value) => apply(setVerificationAnswer(elimination, equation.id, 'leftAnswer', value))}
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
                        onChange={(value) => apply(setVerificationAnswer(elimination, equation.id, 'rightAnswer', value))}
                        placeholder="value"
                        ariaLabel={`${equation.label} right side value`}
                        toolProfile="algebra-operation"
                        compact
                      />
                    </label>
                    <button type="button" onClick={() => apply(checkVerification(elimination, system, solution, equation.id))} style={smallActionStyle}>Check {equation.label.toLowerCase()}</button>
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
