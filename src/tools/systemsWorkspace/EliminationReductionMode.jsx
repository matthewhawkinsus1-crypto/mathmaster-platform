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
import React, { useCallback, useMemo, useRef, useState } from 'react';
import usePersistentToolState, { ToolDraftScopeProvider, readToolDraftRecord, useToolDraftScope } from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { WorkViewUndoProvider, questionUndoResetKey, useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import { Panel, ResultPill, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import AlgebraicSystemMode, {
  EmbeddedStepAlgebra,
  MathDragToken,
  VariableDropEquation,
  SystemsWorkTrail,
  solvedExpressionFor,
  solvedNumberFor,
  subsystemReportFromDraft,
} from './AlgebraicSystemMode.jsx';
import { applyFormMultiplier, classroomEquationText, exactNumberText, linearEquationForm, normalizeAlgebraicSystemConfig } from './algebraicSystemsEngine.js';
import { verificationTokenNeeded } from './verificationTokenState.js';
import { buildReductionSystem, reductionAnswerKey } from './substitutionReduction.js';
import {
  activeEliminationRoundKey,
  applyEliminationMultiplier,
  attemptEliminationBackPlacement,
  checkEliminationCombination,
  checkEliminationMultiplierProducts,
  chooseEliminationPair,
  chooseEliminationVariable,
  clearEliminationBackDestination,
  eliminationBackSubstitutionDestinations,
  eliminationBackSubstitutionEquation,
  eliminationKnownSolution,
  eliminationPairOptions,
  eliminationPhase,
  eliminationReducedSystem,
  eliminationRoundEliminates,
  eliminationRoundStage,
  eliminationScaleEditorOpen,
  emptyEliminationState,
  keepEliminationEquationAsWritten,
  openEliminationScaleEditor,
  recordEliminationBackSolve,
  repairEliminationState,
  resetEliminationRound,
  setEliminationCombinationTerm,
  setEliminationMultiplierDraft,
  setEliminationMultiplierProductTerm,
  setEliminationOperation,
  toggleEliminationCancellation,
} from './eliminationReduction.js';
import { allOriginalsVerified } from './substitutionReduction.js';
import OriginalEquationsVerification from './OriginalEquationsVerification.jsx';
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

/** "an x term", "a y term": the article follows how the letter is said aloud. */
const articleFor = (variable) => (/^[aefhilmnorsx]/i.test(String(variable || '')) ? 'an' : 'a');

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
      return 'That scale factor is not a valid nonzero number. Enter a nonzero number such as 2 or −1/3, or keep the equation as written.';
    case 'multiplier-products:incorrect-products':
      return 'One or more of those terms do not match the scaled equation yet. Apply the same multiplier to every term, including the right side.';
    case 'combine:not-equivalent':
      return 'That is not the result of combining the two scaled equations. Check your arithmetic on each term, then try again.';
    case 'combine:does-not-eliminate':
      return `That combination still has ${articleFor(note.variable)} ${note.variable} term. Scale an equation so the ${note.variable} terms cancel, or try the other operation.`;
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
  const [embeddedUndoController, setEmbeddedUndoController] = useState(null);
  const [subsystemUndoController, setSubsystemUndoController] = useState(null);
  const [subsystemReport, setSubsystemReport] = useState(null);
  const [showSolvedSubsystem, setShowSolvedSubsystem] = useState(false);
  const { feedback, submit } = useToolSubmission(onAction);

  // A stage that appears while the student works (the next pair choice, a
  // distribution row, the combination line) comes into view instead of opening
  // below the fold with nothing to say it is there. Not on the first render:
  // a resumed question's position belongs to the question-entry scroll.
  const mountedRef = useRef(false);
  React.useEffect(() => { mountedRef.current = true; }, []);
  const revealOnAppear = useCallback((element) => {
    if (!element || !mountedRef.current || typeof window === 'undefined') return;
    window.requestAnimationFrame(() => element.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
  }, []);

  const apply = useCallback((transition) => {
    if (!transition) return;
    if (transition.state && transition.state !== elimination) setStoredElimination(transition.state);
    setFeedbackNote(transition.feedback || null);
    if (!transition.feedback && transition.state && transition.state !== elimination) {
      setArmedToken((current) => {
        if (!current) return null;
        if (current.kind === 'verification') {
          const stillNeeds = verificationTokenNeeded(transition.state, system.equations, current.variable);
          return stillNeeds ? current : null;
        }
        return null;
      });
    }
  }, [elimination, setStoredElimination, system.equations]);

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
    if (embeddedUndoController?.canUndo) return embeddedUndoController;
    if (phase === 'subsystem' && subsystemUndoController?.canUndo) return subsystemUndoController;
    if (reducedSolution && !hasPostSubsystemWork && subsystemUndoController?.canUndo) return subsystemUndoController;
    return historyController;
  }, [embeddedUndoController, subsystemUndoController, phase, reducedSolution, hasPostSubsystemWork, undoHistory.canUndo, undoHistory.undo]);
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
  const workTrailStages = [
    { id: 'method', label: 'Method', complete: true, summary: 'Elimination' },
    { id: 'variable', label: 'Eliminate', complete: Boolean(variable), summary: variable || '' },
    // R₁ and R₂ are written out in their own round boards and pinned in the
    // reference column; a third copy as trail chips only added noise (#361).
    { id: 'round1', label: 'First pair', complete: Boolean(elimination.rounds.round1.combinedText) },
    { id: 'round2', label: 'Second pair', complete: Boolean(elimination.rounds.round2.combinedText) },
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

                {/* Each round is written out as a stacked elimination and
                    stays on the page once it is done (#361): the reduced 2×2
                    below is visibly built from the two rounds above it. */}
                {elimination.rounds.round1.pair ? (
                  <EliminationRoundBoard
                    label="First pair"
                    system={system}
                    roundKey="round1"
                    variable={variable}
                    elimination={elimination}
                    apply={apply}
                    readOnly={phase !== 'round1-combine'}
                    revealOnAppear={revealOnAppear}
                  />
                ) : null}

                {(phase === 'round1-pair' || phase === 'round2-pair') ? (
                  <div ref={revealOnAppear}>
                    <EliminationPairChoice
                      label={phase === 'round1-pair' ? 'First pair' : 'Second pair'}
                      system={system}
                      roundKey={activeRound}
                      elimination={elimination}
                      apply={apply}
                    />
                  </div>
                ) : null}

                {elimination.rounds.round2.pair ? (
                  <EliminationRoundBoard
                    label="Second pair"
                    system={system}
                    roundKey="round2"
                    variable={variable}
                    elimination={elimination}
                    apply={apply}
                    readOnly={phase !== 'round2-combine'}
                    revealOnAppear={revealOnAppear}
                  />
                ) : null}

                {/* Once solved, the 2×2 folds away so back-substitution is the
                    next thing on screen, but it stays one click from view: the
                    student's elimination and Step Algebra work inside it is
                    part of this problem's written record (#361). */}
                {reduced && reducedSolution && phase !== 'subsystem' ? (
                  <div className="mathmaster-reduction-subsystem-solved">
                    <span>
                      <strong>Reduced 2×2 solved:</strong>{' '}
                      {Object.keys(reducedSolution).map((name) => `${name} = ${exactNumberText(reducedSolution[name])}`).join(', ')}
                    </span>
                    <button type="button" className="mathmaster-elim-header-button" aria-expanded={showSolvedSubsystem} onClick={() => setShowSolvedSubsystem((open) => !open)}>
                      {showSolvedSubsystem ? 'Hide my 2×2 work' : 'Show my 2×2 work'}
                    </button>
                  </div>
                ) : null}
                {reduced ? (
                  <div className="mathmaster-reduction-subsystem" hidden={phase !== 'subsystem' && !(reducedSolution && showSolvedSubsystem)}>
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
                    onUndoStateChange={setEmbeddedUndoController}
                    workspaceDifficulty={questionData.workspaceDifficulty}
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

/* --------------------------------------------------------------------------
 * ONE ELIMINATION ROUND, WRITTEN THE WAY IT IS WRITTEN ON THE BOARD (#361).
 *
 *        Eq. 1      2x  −  y  + 2z  =  15
 *     +  Eq. 2     −x  +  y  +  z  =   3
 *                 ───────────────────────
 *        R₁          x        + 3z  =  18
 *
 * The two equations of the pair are stacked in aligned columns, one column per
 * variable, exactly like the reduced 2×2's elimination (the same + / − rail
 * beside the second row, the same click-the-term cancellation, the same result
 * line). Before #361 a 3×3 round was a different interface — side-by-side
 * cards, generic Add/Subtract buttons, "Equation 1: y term cancels" buttons and
 * three boxes that did not sit under anything — and the student met the 2×2
 * version minutes later inside the same problem.
 *
 * Every scaled or combined term is the student's own entry, checked; nothing is
 * computed or previewed before they submit it. A finished round STAYS on the
 * page as read-only work, so the reduced 2×2 is visibly built from the rounds
 * above it instead of appearing from a summary chip.
 * ------------------------------------------------------------------------ */

const MINUS = '−';

/** One signed column entry: "2x", "− y", "+ 2z"; blank for a zero coefficient. */
const columnTermText = (coefficient, variable, leading) => {
  const value = Number(coefficient);
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return '';
  const magnitude = Math.abs(value);
  const digits = Math.abs(magnitude - 1) < 1e-9 ? '' : exactNumberText(magnitude);
  const body = `${digits}${variable}`;
  if (leading) return value < 0 ? `${MINUS}${body}` : body;
  return `${value < 0 ? MINUS : '+'} ${body}`;
};

const constantText = (value) => {
  const text = exactNumberText(value);
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
};

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

function EliminationStackRow({
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
  return (
    <div className="mathmaster-elim-row" data-row-id={rowId}>
      <div className="mathmaster-elim-op">{opCell}</div>
      <div className="mathmaster-elim-label">
        <span>{label}</span>
        {badge ? <span className="mathmaster-elim-badge">{badge}</span> : null}
        {labelAction}
      </div>
      {variables.map((name, index) => {
        const text = columnTermText(form?.coefficients?.[name], name, leading[index]);
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

function EliminationRoundBoard({ label, system, roundKey, variable, elimination, apply, readOnly = false, revealOnAppear }) {
  const round = elimination.rounds[roundKey];
  const [idA, idB] = round.pair;
  const equationA = system.equations.find((equation) => equation.id === idA);
  const equationB = system.equations.find((equation) => equation.id === idB);
  const stage = eliminationRoundStage(elimination, system, roundKey);
  const remaining = system.variables.filter((name) => name !== variable);
  const eliminates = round.operation ? eliminationRoundEliminates(elimination, system, roundKey) : null;
  const done = stage === 'done';
  const reducedName = lineageName(roundKey === 'round1' ? 'R1' : 'R2');

  const originalForm = (id) => linearEquationForm(system.equations.find((equation) => equation.id === id).text, system.variables);
  // A confirmed factor is the student's own, already-checked distribution, so
  // showing the scaled row is showing their work back to them.
  const shownForm = (id) => {
    const value = round.multiplierValues?.[id];
    return Number.isFinite(value) ? applyFormMultiplier(originalForm(id), value, system.variables) : originalForm(id);
  };
  const factorBadge = (id) => {
    const value = round.multiplierValues?.[id];
    // "·", never "×": beside a column of x terms the times sign reads as
    // another x (the 2×2 elimination made the same choice).
    return Number.isFinite(value) && Math.abs(value - 1) > 1e-9 ? `· ${exactNumberText(value)}` : null;
  };
  const editorOpen = (id) => eliminationScaleEditorOpen(round, id);
  const anyEditorOpen = editorOpen(idA) || editorOpen(idB);
  const bothConfirmed = [idA, idB].every((id) => Number.isFinite(round.multiplierValues?.[id]));
  const operationChosen = Boolean(round.operation);
  const cancellationOpen = operationChosen && eliminates;
  const markedCount = [idA, idB].filter((id) => round.cancelledEquations?.[id]).length;
  const combinedForm = done ? linearEquationForm(round.combinedText, remaining) : null;
  const combinedRowForm = combinedForm ? { coefficients: { ...combinedForm.coefficients, [variable]: 0 }, constant: combinedForm.constant } : null;
  const canEditRows = !readOnly && !done;

  const scaleAction = (id, equation) => {
    // Offered until the student commits to cancelling; after that the scale
    // is part of the work they are combining (Undo still reaches it).
    if (!canEditRows || editorOpen(id) || cancellationOpen) return null;
    const scaled = Boolean(factorBadge(id));
    return (
      <button
        type="button"
        className="mathmaster-elim-scale-button"
        onClick={() => apply(openEliminationScaleEditor(elimination, roundKey, id))}
        aria-label={scaled ? `Change the scale factor for ${equation.label}` : `Scale ${equation.label}`}
      >
        {scaled ? 'Change' : 'Scale'}
      </button>
    );
  };

  const scaleTools = (id, equation) => {
    if (!canEditRows) return null;
    const work = round.multiplierWork?.[id];
    if (!editorOpen(id)) return null;
    if (!work) {
      return (
        <div className="mathmaster-elim-row-tools" data-scale-editor={id}>
          <label className="mathmaster-reduction-field mathmaster-elim-factor-field">
            Scale {equation.label} by
            <MathInput
              value={round.multiplierDrafts?.[id] || ''}
              onChange={(value) => apply(setEliminationMultiplierDraft(elimination, roundKey, id, value))}
              onSubmit={() => apply(applyEliminationMultiplier(elimination, system, roundKey, id))}
              placeholder="factor"
              ariaLabel={`Scale factor for ${equation.label}`}
              toolProfile="algebra-operation"
              compact
              maxWidth={150}
            />
          </label>
          <button type="button" onClick={() => apply(applyEliminationMultiplier(elimination, system, roundKey, id))} style={smallActionStyle}>Apply this factor</button>
          <button type="button" onClick={() => apply(keepEliminationEquationAsWritten(elimination, roundKey, id))} style={{ ...secondaryButtonStyle, marginTop: 8 }}>Keep as written</button>
        </div>
      );
    }
    const factorText = round.multiplierDrafts?.[id] || '';
    return (
      <div ref={revealOnAppear} className="mathmaster-elim-distribution" data-distribution={id}>
        <p className="mathmaster-elim-hint">
          Multiply every term of {equation.label} by {factorText}, including the right side. Write each new term under the term it came from.
        </p>
        <div className="mathmaster-elim-row mathmaster-elim-entry-row">
          <div className="mathmaster-elim-op" />
          <div className="mathmaster-elim-label"><span>· {factorText}</span></div>
          {[...system.variables, 'constant'].map((key) => (
            <React.Fragment key={key}>
              {key === 'constant' ? <span className="mathmaster-elim-equals">=</span> : null}
              <div className={key === 'constant' ? 'mathmaster-elim-constant' : 'mathmaster-elim-term'}>
                <span className="mathmaster-elim-entry-label" aria-hidden="true">{key === 'constant' ? 'Right side' : `${key} term`}</span>
                <MathInput
                  value={work[key] || ''}
                  onChange={(value) => apply(setEliminationMultiplierProductTerm(elimination, roundKey, id, key, value))}
                  onSubmit={() => apply(checkEliminationMultiplierProducts(elimination, system, roundKey, id))}
                  placeholder={key === 'constant' ? 'value' : 'term'}
                  ariaLabel={`Scaled ${key === 'constant' ? 'right side' : `${key} term`} for ${equation.label}`}
                  toolProfile="algebra-operation"
                  compact
                  hideToolsToggle
                />
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="mathmaster-elim-actions">
          <button type="button" onClick={() => apply(checkEliminationMultiplierProducts(elimination, system, roundKey, id))} style={smallActionStyle}>Check my scaled terms</button>
          <button type="button" onClick={() => apply(keepEliminationEquationAsWritten(elimination, roundKey, id))} style={{ ...secondaryButtonStyle, marginTop: 8 }}>Keep as written</button>
        </div>
      </div>
    );
  };

  const opRail = canEditRows && bothConfirmed && !anyEditorOpen ? (
    <div className="mathmaster-systems-operation-rail mathmaster-elim-rail" role="group" aria-label={`Add or subtract ${equationB.label} and ${equationA.label}`}>
      <button
        type="button"
        className={round.operation === 'add' ? 'is-selected' : ''}
        aria-pressed={round.operation === 'add'}
        onClick={() => apply(setEliminationOperation(elimination, roundKey, 'add'))}
        aria-label={`Add ${equationA.label} and ${equationB.label}`}
      >
        +
      </button>
      <button
        type="button"
        className={round.operation === 'subtract' ? 'is-selected' : ''}
        aria-pressed={round.operation === 'subtract'}
        onClick={() => apply(setEliminationOperation(elimination, roundKey, 'subtract'))}
        aria-label={`Subtract ${equationB.label} from ${equationA.label}`}
      >
        −
      </button>
    </div>
  ) : (round.operation ? <span className="mathmaster-systems-operation-symbol" aria-label={round.operation === 'subtract' ? 'minus' : 'plus'}>{round.operation === 'subtract' ? '−' : '+'}</span> : null);

  const direction = (() => {
    if (!canEditRows) return null;
    if (anyEditorOpen) return 'Type the factor, apply it, then multiply every term. Or keep the equation as written.';
    if (!operationChosen) return `Scale an equation only if its ${variable} term needs it. Then choose + or − beside the second equation.`;
    if (eliminates === false) return null;
    if (!round.combinationWork) return `Mark the ${variable} term in each equation that cancels · ${markedCount} of 2 marked.`;
    return 'Now combine what remains, column by column, on the line under the equations.';
  })();

  return (
    <section
      className={`mathmaster-elim-round${done ? ' is-complete' : ''}${readOnly ? ' is-readonly' : ''}`}
      data-round={roundKey}
      aria-label={done ? `${reducedName} from ${equationA.label} and ${equationB.label}` : `${label}: ${equationA.label} and ${equationB.label}`}
    >
      <header className="mathmaster-elim-round-header">
        <strong>{done ? `${reducedName} from ${equationA.label} & ${equationB.label}` : `${label}: ${equationA.label} and ${equationB.label}`}</strong>
        {canEditRows ? (
          <button type="button" onClick={() => apply(resetEliminationRound(elimination, roundKey))} className="mathmaster-elim-header-button">Choose a different pair</button>
        ) : null}
      </header>
      {direction ? <p className="mathmaster-elim-direction">{direction}</p> : null}

      <div className="mathmaster-elim-stack" style={{ '--elim-vars': system.variables.length }}>
        <EliminationStackRow
          rowId={idA}
          variables={system.variables}
          target={variable}
          form={shownForm(idA)}
          label={equationA.label}
          badge={factorBadge(idA)}
          labelAction={scaleAction(idA, equationA)}
          cancelled={Boolean(round.cancelledEquations?.[idA]) || done}
          onToggleCancel={canEditRows && cancellationOpen ? () => apply(toggleEliminationCancellation(elimination, system, roundKey, idA)) : null}
        />
        {scaleTools(idA, equationA)}
        <EliminationStackRow
          rowId={idB}
          variables={system.variables}
          target={variable}
          form={shownForm(idB)}
          label={equationB.label}
          badge={factorBadge(idB)}
          opCell={opRail}
          labelAction={scaleAction(idB, equationB)}
          cancelled={Boolean(round.cancelledEquations?.[idB]) || done}
          onToggleCancel={canEditRows && cancellationOpen ? () => apply(toggleEliminationCancellation(elimination, system, roundKey, idB)) : null}
        />
        {scaleTools(idB, equationB)}
        <div className="mathmaster-elim-rule" aria-hidden="true" />

        {done && combinedRowForm ? (
          <EliminationStackRow
            rowId={roundKey === 'round1' ? 'R1' : 'R2'}
            variables={system.variables}
            target={null}
            form={combinedRowForm}
            label={reducedName}
          />
        ) : null}

        {!done && canEditRows && round.combinationWork ? (
          <div ref={revealOnAppear} className="mathmaster-elim-row mathmaster-elim-entry-row mathmaster-elim-result-entry" data-combination-entry={roundKey}>
            <div className="mathmaster-elim-op" />
            <div className="mathmaster-elim-label"><span>{reducedName}</span></div>
            {system.variables.map((name) => (name === variable ? (
              <span key={name} className="mathmaster-elim-term is-eliminated" aria-label={`${name} eliminated`}>—</span>
            ) : (
              <div key={name} className="mathmaster-elim-term">
                <span className="mathmaster-elim-entry-label" aria-hidden="true">{name} term</span>
                <MathInput
                  value={round.combinationWork[name] || ''}
                  onChange={(value) => apply(setEliminationCombinationTerm(elimination, roundKey, name, value))}
                  onSubmit={() => apply(checkEliminationCombination(elimination, system, roundKey))}
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
                value={round.combinationWork.constant || ''}
                onChange={(value) => apply(setEliminationCombinationTerm(elimination, roundKey, 'constant', value))}
                onSubmit={() => apply(checkEliminationCombination(elimination, system, roundKey))}
                placeholder="value"
                ariaLabel="Combined constant"
                toolProfile="algebra-operation"
                compact
                hideToolsToggle
              />
            </div>
          </div>
        ) : null}
      </div>

      {round.operation && eliminates === false && canEditRows ? (
        <p className="mathmaster-systems-substitution-feedback is-error" role="status">
          That combination still has {articleFor(variable)} {variable} term. Scale an equation so the {variable} terms cancel, or try the other operation.
        </p>
      ) : null}

      {!done && canEditRows && round.combinationWork ? (
        <button type="button" onClick={() => apply(checkEliminationCombination(elimination, system, roundKey))} style={{ ...smallActionStyle, justifySelf: 'start' }}>Check my combination</button>
      ) : null}
    </section>
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

function EliminationBackSubstitution({ elimination, system, reducedSolution, backEquation, armedToken, setArmedToken, apply, draftKey, onSolved, onUndoStateChange, workspaceDifficulty, variable }) {
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
          <EmbeddedStepAlgebra
            label={`Solve for ${variable}`}
            prompt={`Use your substitution to solve this equation for ${variable}.`}
            equationText={backEquation}
            solveFor={variable}
            requireSimplifiedFinalForm
            draftKey={draftKey ? `${draftKey}:elimination:back-solve:${elimination.back.destinationId}:${hashText(backEquation)}` : null}
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

function EliminationVerification({ elimination, system, solution, variable, armedToken, setArmedToken, apply }) {
  return (
    <OriginalEquationsVerification
      state={elimination}
      system={system}
      solution={solution}
      display={(name) => (name === variable ? elimination.back.solved.text : exactNumberText(solution[name]))}
      payloadPrefix="mathmaster-elim-verification:"
      armedToken={armedToken}
      setArmedToken={setArmedToken}
      apply={apply}
    />
  );
}
