import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput.jsx';
import StepByStepAlgebraCore from './StepByStepAlgebraCore';
import EnlargeableFigure from './components/common/EnlargeableFigure';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import { parseOrderedPair } from './answerUtils.js';
import { gradeToolCheck } from './tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from './platform/grading/sharedAnswerState.js';
import {
  checkLinearIntercept,
  linearInterceptsWork,
  stepAlgebraWorkGrader,
} from '../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
// The intercept check's credit, its raw work, and the sub-equation each
// substitution opens: one definition, shared with the server, which derives
// the same step credit from that work.
import {
  interceptStepGrade,
  interceptStepWork,
  interceptSubEquationQuestion,
} from '../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { InteractiveStandardEquation } from './tools/stepAlgebra2/linearInterceptsConceptualUi.jsx';
import {
  INTERCEPT_FEEDBACK_TIMINGS,
  conceptualRedirect,
  formatSubstitutionEquation,
  resolveInterceptCheck,
  resolveStandardCoefficients,
  shouldShowConceptRedirect,
  solvedStageUpdate,
} from './tools/stepAlgebra2/linearInterceptsMath.js';

/*
 * THE INTERCEPT ORCHESTRATOR, NOT A SECOND SOLVER.
 *
 * Issue #297: finding x/y-intercepts algebraically keeps its own conceptual
 * stage (decide which variable is 0, place the 0 token on the original
 * equation, commit the substitution) but MUST hand the actual algebra to the
 * same mature Step Algebra engine every other equation in this platform uses
 * — never a second, narrower numeric mini-solver. This component owns only
 * the substitution stage and the ordered-pair completion; StepByStepAlgebraCore
 * owns everything about solving the resulting one-variable equation,
 * including its own balanced-operation undo, step evidence and persistence.
 *
 * QuestionEngine mounts this in place of StepByStepAlgebra whenever
 * `question.mode === 'linearIntercepts'` on a `type: 'stepAlgebra'` question
 * (see the 'stepAlgebra' case in QuestionEngine.jsx), so it receives the
 * exact same props (onStateChange/onStepGrade/onUndoStateChange/draftKey) a
 * literal-equation or rewrite question would — no registry bridging needed.
 */

const stageLabel = (kind) => (kind === 'x' ? 'x-intercept' : 'y-intercept');

const targetPrompt = (kind) => (
  kind === 'x'
    ? 'Find the x-intercept. Decide which variable becomes 0, place the 0 on that variable, then solve the resulting equation.'
    : 'Find the y-intercept. Decide which variable becomes 0, place the 0 on that variable, then solve the resulting equation.'
);

const initialStage = () => ({
  conceptualZeroChoice: null,
  placedZeroVariable: null,
  committed: false,
  solved: false,
  solvedEquationLatex: '',
  point: '',
  checked: false,
  completed: false,
});

const initialWork = () => ({ activeKind: 'x', x: initialStage(), y: initialStage() });

// Told when a finished intercept is reopened on a DOL, quiz or test: the
// question is no longer complete, so Submit waits again.
const INCOMPLETE_PAYLOAD = Object.freeze({ isComplete: false, isCorrect: false, questionDetails: '', responseKey: '', parts: [] });

export default function LinearInterceptsOrchestrator({
  question = {},
  onStateChange,
  onStepGrade,
  onUndoStateChange,
  questionRecord = null,
  maximumAttempts = 3,
  attemptsDoNotExpire = false,
  disabled = false,
  draftKey = null,
  hintsAllowed = true,
  onHintUsed = null,
  // May a check say whether the work is right before the question is
  // submitted? QuestionEngine's showOutcomeFeedback: false on a DOL, quiz or
  // test until feedback is released. Defaults to the practice behaviour.
  revealCorrectness = true,
}) {
  const standard = useMemo(() => resolveStandardCoefficients(question), [question]);
  const feedbackTiming = INTERCEPT_FEEDBACK_TIMINGS.includes(question.feedbackTiming)
    ? question.feedbackTiming
    : 'delayed';

  // Keep the existing draft-key shape so work already saved by students remains
  // restorable and continues to flow through the universal server draft sync.
  const workDraftKey = draftKey ? `${draftKey}:linear-intercepts` : null;
  const workDraftKeyRef = useRef(workDraftKey);
  const [work, setWorkState] = useState(() => readQuestionDraft(workDraftKey, null) || initialWork());
  const [zeroArmed, setZeroArmed] = useState(false);
  const [stageHistory, setStageHistory] = useState(() => ({ kind: 'x', entries: [] })); // conceptual undo, scoped per intercept
  const [message, setMessage] = useState('');

  /*
   * Persist mathematical work inside the same state transition that accepts the
   * edit. The previous passive effect could be skipped when navigation
   * unmounted this question immediately after a click/keystroke, and it could
   * also write the previous question's in-memory work under a newly changed
   * draft key. This mirrors the write-through contract used by registry tools.
   */
  const setWork = useCallback((next) => {
    setWorkState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      if (Object.is(resolved, current)) return current;
      writeQuestionDraft(workDraftKeyRef.current, resolved);
      return resolved;
    });
  }, []);

  // Defensive restore for hosts that swap the question beneath a mounted
  // component. QuestionEngine also keys this orchestrator by draft identity, so
  // normal assignment navigation remounts cleanly; this prevents a future host
  // from reintroducing cross-question state leakage.
  useEffect(() => {
    if (workDraftKeyRef.current === workDraftKey) return;
    workDraftKeyRef.current = workDraftKey;
    setWorkState(readQuestionDraft(workDraftKey, null) || initialWork());
    setZeroArmed(false);
    setStageHistory({ kind: 'x', entries: [] });
    setMessage('');
  }, [workDraftKey]);

  const kind = work.activeKind === 'y' ? 'y' : 'x';
  const stage = work[kind] || initialStage();

  // Keep attempt/partial-credit history from the parent question, but never
  // seed a new x/y sub-solve from the parent record's last algebra equation.
  // Each intercept has its own draftKey and authored substitution equation.
  const solverQuestionRecord = useMemo(
    () => (questionRecord ? { ...questionRecord, algebraState: null } : null),
    [questionRecord],
  );
  // What the host is told once both intercepts are checked. Built in one place
  // because it is said twice: when the second Check succeeds, and again when a
  // reload restores two checked intercepts that were never submitted. The
  // verdict is the shared grader's — the function the server runs on the same
  // two ordered pairs — never a hard-coded "correct". On a DOL, quiz or test a
  // recorded point can be wrong: that part is complete and wrong, earns
  // nothing, and the question is not correct.
  const interceptCompletionPayload = (finishedWork) => {
    const xIntercept = finishedWork.x?.point || '';
    const yIntercept = finishedWork.y?.point || '';
    const result = gradeToolCheck(stepAlgebraWorkGrader, question, linearInterceptsWork({ xIntercept, yIntercept }));
    return {
      ...answerStateFromSharedGrading(result, { questionDetails: `x-intercept ${xIntercept}, y-intercept ${yIntercept}` }),
      responseKey: JSON.stringify({ x: parseOrderedPair(xIntercept), y: parseOrderedPair(yIntercept) }),
    };
  };
  // There is no per-move workHistory array on this side of the refactor — the
  // balanced-operation steps now live inside the mounted StepByStepAlgebraCore,
  // not on this orchestrator's own stage object. Treat "solved" as the
  // work-has-happened signal instead: guided timing still redirects the
  // instant a wrong zero is placed, delayed timing waits until the student
  // has actually finished the (wrong-path) algebra before saying so.
  //
  // The redirect appears only when the substitution is on the WRONG variable,
  // so it is a verdict: where outcomes are withheld it never appears, and the
  // point the wrong path leads to is graded at submission like any other.
  const progressiveRedirect = revealCorrectness && shouldShowConceptRedirect(
    { committed: stage.committed, placedZeroVariable: stage.placedZeroVariable, workHistory: stage.solved ? [1] : [] },
    kind,
    feedbackTiming,
  );

  const updateStage = (updater) => {
    setWork((current) => {
      const before = current[kind] || initialStage();
      const next = typeof updater === 'function' ? updater(before) : updater;
      return { ...current, [kind]: next };
    });
  };

  const pushStageHistory = () => setStageHistory((current) => {
    const entries = current.kind === kind ? current.entries : [];
    return { kind, entries: [...entries.slice(-19), stage] };
  });

  // Conceptual-stage undo. Once the substitution is committed, undo ownership
  // moves to the mounted StepByStepAlgebraCore (its own registration effect
  // takes over the same onUndoStateChange channel); this effect explicitly
  // steps aside so the two never fight over one Undo button.
  useEffect(() => {
    if (stage.committed || !onUndoStateChange) return undefined;
    const entries = stageHistory.kind === kind ? stageHistory.entries : [];
    const canUndo = entries.length > 0;
    onUndoStateChange({
      canUndo,
      label: 'Undo the last substitution choice',
      onUndo: canUndo ? () => {
        setStageHistory((current) => {
          const currentEntries = current.kind === kind ? current.entries : [];
          if (!currentEntries.length) return { kind, entries: [] };
          const previous = currentEntries[currentEntries.length - 1];
          updateStage(previous);
          return { kind, entries: currentEntries.slice(0, -1) };
        });
      } : null,
    });
    return () => onUndoStateChange({ canUndo: false, onUndo: null, label: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.committed, stageHistory, onUndoStateChange, kind]);

  // Both intercepts checked is the end of this workflow. A reload between the
  // last Check and Submit restores the two ✓ from the draft, but the host only
  // learned the question was complete from that Check — so the Submit button
  // was gone until the student checked the point again. Say it once more.
  const bothInterceptsFound = Boolean(work.x?.completed && work.y?.completed);
  const completionReportedRef = useRef(false);
  useEffect(() => {
    if (!bothInterceptsFound || disabled || completionReportedRef.current) return;
    completionReportedRef.current = true;
    onStateChange?.(interceptCompletionPayload(work));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothInterceptsFound, disabled]);

  const standardUsable = Boolean(standard)
    && Math.abs(Number(standard.A)) > 1e-12 && Math.abs(Number(standard.B)) > 1e-12;

  const selectZeroChoice = (variable) => {
    pushStageHistory();
    setMessage('');
    updateStage((current) => ({ ...current, conceptualZeroChoice: variable }));
  };

  const placeZero = (variable) => {
    pushStageHistory();
    setMessage('');
    updateStage((current) => ({ ...current, placedZeroVariable: variable }));
    setZeroArmed(false);
  };

  const mismatch = Boolean(
    stage.conceptualZeroChoice && stage.placedZeroVariable && stage.conceptualZeroChoice !== stage.placedZeroVariable,
  );

  const commitSubstitution = () => {
    if (!stage.conceptualZeroChoice || !stage.placedZeroVariable) {
      setMessage('Choose which variable equals 0, then pick up the 0 and place it on that variable.');
      return;
    }
    if (mismatch) {
      setMessage(`You chose ${stage.conceptualZeroChoice} = 0, but your substitution replaced ${stage.placedZeroVariable}. Which one do you mean?`);
      return;
    }
    setMessage('');
    updateStage((current) => ({ ...current, committed: true }));
  };

  const returnToSubstitution = () => {
    setMessage('');
    setZeroArmed(false);
    updateStage((current) => ({
      ...current, committed: false, solved: false, solvedEquationLatex: '', point: '', checked: false, completed: false,
    }));
  };

  // The one-variable equation StepByStepAlgebraCore solves after substitution
  // — built by the shared interceptSubEquationQuestion, the same question the
  // server checks this sub-solve's steps against.
  const subEquationQuestion = useMemo(
    () => (standardUsable && stage.committed ? interceptSubEquationQuestion(question, standard, stage.placedZeroVariable) : null),
    // Rebuild only when the committed substitution itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage.committed, stage.placedZeroVariable, kind],
  );
  // Which equation the sub-solve opened, so its steps' raw work names it.
  const subSolveStepWorkContext = stage.committed ? { zeroVariable: stage.placedZeroVariable } : null;

  // After every hook, never before one: an early return above the useMemo made
  // its call conditional on the question's coefficients.
  if (!standardUsable) {
    return (
      <p style={{ color: 'var(--mm-error-text)' }}>
        This intercept question requires a two-variable linear equation with nonzero x- and y-coefficients.
      </p>
    );
  }

  const handleSubEquationStateChange = (payload) => {
    const update = solvedStageUpdate(stage, payload);
    if (!update) return;
    updateStage((current) => ({ ...current, ...update }));
  };

  const setPoint = (value) => {
    setMessage('');
    updateStage((current) => ({ ...current, point: value, checked: false, completed: false }));
  };

  const checkCurrentIntercept = () => {
    // Whether the point is right is the shared grader's per-intercept check —
    // the one it applies to the submission. What the check may do with that
    // is the activity's: a verdict where outcomes are shown; on a DOL, quiz or
    // test the point is recorded as written and graded at submission
    // (resolveInterceptCheck).
    const isCorrect = checkLinearIntercept(standard, kind, stage.point);
    const decision = resolveInterceptCheck({ revealCorrectness, kind, point: stage.point, isCorrect });
    const nextStage = { ...stage, checked: true, completed: decision.completes };

    if (!decision.completes) {
      updateStage(nextStage);
      setMessage(decision.message);
      return;
    }

    setMessage('');
    // Step credit only where the check is a verdict: on a DOL, quiz or test no
    // step is reported, so neither the device nor the server credits anything
    // before Submit.
    if (decision.earnsStepCredit) {
      onStepGrade?.({
        stepGrade: interceptStepGrade({ standard, intercept: kind, point: stage.point }),
        countsAttempt: false,
        // The raw work: which intercept and the pair as typed. The server
        // re-checks it against the line and derives the same credit.
        stepWork: interceptStepWork({ intercept: kind, point: stage.point }),
      });
    }

    // The other intercept next, unless it is already in (a DOL student who
    // reopened this one to change it).
    const otherKind = kind === 'x' ? 'y' : 'x';
    if (!work[otherKind]?.completed) {
      setWork((current) => ({ ...current, [kind]: nextStage, activeKind: otherKind }));
      setZeroArmed(false);
      return;
    }

    const finishedWork = { ...work, [kind]: nextStage, activeKind: kind };
    setWork(finishedWork);
    completionReportedRef.current = true;
    onStateChange?.(interceptCompletionPayload(finishedWork));
  };

  // A DOL, quiz or test only: a recorded intercept can be changed until the
  // question is submitted, because nothing told the student whether it was
  // right. (In practice an intercept completes only once it is right.)
  const reopenIntercept = (target) => {
    setMessage('');
    setZeroArmed(false);
    if (bothInterceptsFound) {
      completionReportedRef.current = false;
      onStateChange?.(INCOMPLETE_PAYLOAD);
    }
    setWork((current) => ({
      ...current,
      activeKind: target,
      [target]: { ...(current[target] || initialStage()), checked: false, completed: false },
    }));
  };

  const activeRedirect = progressiveRedirect ? conceptualRedirect(kind) : '';
  const statusMessage = mismatch
    ? `You chose ${stage.conceptualZeroChoice} = 0, but your zero is on ${stage.placedZeroVariable}. Which one do you mean?`
    : activeRedirect || message;

  const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
  const secondaryButton = { ...primaryButton, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)' };

  const content = bothInterceptsFound ? (revealCorrectness ? (
    // The stage below would still read "now write the y-intercept" over a
    // Check button, while the only thing left to do is submit.
    <div role="status" style={{ padding: 14, borderRadius: 10, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', lineHeight: 1.5 }}>
      <strong>Both intercepts found.</strong>
      <div style={{ marginTop: 4 }}>x-intercept {work.x.point} · y-intercept {work.y.point}</div>
      {!disabled ? <div style={{ marginTop: 4, fontWeight: 800 }}>Submit your answer to finish this question.</div> : null}
    </div>
  ) : (
    // A DOL, quiz or test: the same neutral summary for right and wrong
    // points, and either one can still be changed before Submit.
    <div role="status" data-intercepts-recorded="true" style={{ padding: 14, borderRadius: 10, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', lineHeight: 1.5 }}>
      <strong>Both intercepts recorded.</strong>
      <div style={{ marginTop: 4 }}>x-intercept {work.x.point} · y-intercept {work.y.point}</div>
      {!disabled ? (
        <>
          <div style={{ marginTop: 4, fontWeight: 800 }}>They are graded when you submit. Submit your answer to finish this question.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" onClick={() => reopenIntercept('x')} style={secondaryButton}>Change x-intercept</button>
            <button type="button" onClick={() => reopenIntercept('y')} style={secondaryButton}>Change y-intercept</button>
          </div>
        </>
      ) : null}
    </div>
  )) : !stage.committed ? (
    <div>
      <p style={{ marginTop: 0, lineHeight: 1.5 }}>
        At the <strong>{stageLabel(kind)}</strong>, which variable equals 0?
      </p>
      <div role="radiogroup" aria-label={`Variable that equals zero at the ${stageLabel(kind)}`} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {['x', 'y'].map((variable) => (
          <button
            key={variable}
            type="button"
            role="radio"
            aria-checked={stage.conceptualZeroChoice === variable}
            disabled={disabled}
            onClick={() => selectZeroChoice(variable)}
            style={{
              ...secondaryButton,
              border: stage.conceptualZeroChoice === variable ? '2px solid #174ea6' : secondaryButton.border,
              background: stage.conceptualZeroChoice === variable ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
            }}
          >
            {variable} = 0
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          type="button"
          draggable
          disabled={disabled}
          onDragStart={(event) => {
            event.dataTransfer?.setData('text/plain', 'mathmaster-zero-token');
            event.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => setZeroArmed((current) => !current)}
          aria-pressed={zeroArmed}
          aria-label="Pick up zero for substitution"
          style={{
            width: 52, height: 52, borderRadius: 14,
            border: zeroArmed ? '3px solid #174ea6' : '2px solid var(--mm-primary-border)',
            background: zeroArmed ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', color: 'var(--mm-primary-text)',
            fontSize: 26, fontWeight: 950, cursor: 'grab',
          }}
        >
          0
        </button>
        <span style={{ color: 'var(--mm-text-muted)', lineHeight: 1.45, flex: '1 1 220px' }}>
          Drag the 0 onto x or y. On a touch screen or keyboard, tap/select the 0, then tap/select the variable.
        </span>
      </div>

      <InteractiveStandardEquation
        standard={standard}
        placedVariable={stage.placedZeroVariable}
        zeroArmed={zeroArmed}
        disabled={disabled}
        onPlace={placeZero}
      />

      {stage.placedZeroVariable && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: 'var(--mm-surface-tint)', color: 'var(--mm-text)' }}>
          Your substitution: <strong>{formatSubstitutionEquation(standard, stage.placedZeroVariable)}</strong>
        </div>
      )}

      {statusMessage && (
        <div role="status" aria-live="polite" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: mismatch ? 'var(--mm-warning-bg)' : 'var(--mm-surface-tint)', color: mismatch ? 'var(--mm-warning-text)' : 'var(--mm-text)', lineHeight: 1.5 }}>
          {statusMessage}
        </div>
      )}

      <button
        type="button"
        onClick={commitSubstitution}
        disabled={disabled || !stage.conceptualZeroChoice || !stage.placedZeroVariable}
        style={{ ...primaryButton, width: '100%', marginTop: 12, opacity: disabled || !stage.conceptualZeroChoice || !stage.placedZeroVariable ? 0.5 : 1 }}
      >
        Substitute and solve
      </button>
    </div>
  ) : (
    <div>
      <div style={{ padding: 11, borderRadius: 9, background: 'var(--mm-surface-tint)', color: 'var(--mm-text)', marginBottom: 10 }}>
        <strong>Substitution:</strong> {formatSubstitutionEquation(standard, stage.placedZeroVariable)}
      </div>

      {!stage.solved ? (
        <StepByStepAlgebraCore
          key={`${draftKey || 'local'}:${kind}-${stage.placedZeroVariable}`}
          question={subEquationQuestion}
          questionRecord={solverQuestionRecord}
          onStateChange={handleSubEquationStateChange}
          onStepGrade={onStepGrade}
          stepWorkContext={subSolveStepWorkContext}
          onUndoStateChange={onUndoStateChange}
          maximumAttempts={maximumAttempts}
          attemptsDoNotExpire={attemptsDoNotExpire}
          disabled={disabled}
          draftKey={draftKey ? `${draftKey}:${kind}-intercept` : null}
          hintsAllowed={hintsAllowed}
          onHintUsed={onHintUsed}
        />
      ) : (
        <>
          <div style={{ marginTop: 4, padding: 12, borderRadius: 10, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', fontWeight: 800 }}>
            <MathDisplay value={stage.solvedEquationLatex} format="latex" /> — now write the {stageLabel(kind)} as an ordered pair.
          </div>
          <div style={{ marginTop: 14 }}>
            <MathInput
              value={stage.point}
              onChange={setPoint}
              // Enter checks the point, as it submits every other answer field.
              onSubmit={disabled ? null : checkCurrentIntercept}
              toolProfile="orderedPair"
              answerFormat="orderedPair"
              ariaLabel={`${stageLabel(kind)} as an ordered pair`}
              placeholder="(x, y)"
            />
          </div>
          {statusMessage && (
            <div role="status" aria-live="polite" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', lineHeight: 1.5 }}>
              {statusMessage}
            </div>
          )}
          <button type="button" onClick={checkCurrentIntercept} disabled={disabled} style={{ ...primaryButton, width: '100%', marginTop: 12 }}>
            Check {stageLabel(kind)}
          </button>
        </>
      )}

      <button type="button" onClick={returnToSubstitution} disabled={disabled} style={{ ...secondaryButton, width: '100%', marginTop: 10 }}>
        Return to substitution
      </button>
    </div>
  );

  return (
    <EnlargeableFigure
      label="Linear intercepts, solved with Step Algebra"
      taskText={targetPrompt(kind)}
      enlargeLabel="Enlarge intercept workspace"
      style={{ width: '100%' }}
      capabilities={{
        equationInput: { label: 'Zero substitution and intercept point', studentState: true },
        instruction: { text: 'Choose which variable becomes zero, place the zero on that variable, solve with Step Algebra, then write the intercept point.' },
        task: { text: targetPrompt(kind) },
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {['x', 'y'].map((chipKind) => {
          const done = Boolean(work[chipKind]?.completed);
          // A green ✓ only where it means "right" (practice); on a DOL, quiz or
          // test a finished intercept is marked recorded, in a neutral colour.
          const doneLook = revealCorrectness
            ? { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', mark: '✓', suffix: '' }
            : { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', mark: '•', suffix: ' recorded' };
          return (
            <span key={chipKind} data-intercept-chip={chipKind} style={{ padding: '6px 10px', borderRadius: 999, background: done ? doneLook.background : kind === chipKind ? 'var(--mm-primary-soft)' : 'var(--mm-surface-control)', color: done ? doneLook.color : 'var(--mm-text)', fontWeight: 850 }}>
              {done ? doneLook.mark : kind === chipKind ? '→' : '○'} {chipKind}-intercept{done ? doneLook.suffix : ''}
            </span>
          );
        })}
        {!revealCorrectness && !bothInterceptsFound && !disabled && ['x', 'y'].filter((chipKind) => chipKind !== kind && work[chipKind]?.completed).map((chipKind) => (
          <button key={`change-${chipKind}`} type="button" onClick={() => reopenIntercept(chipKind)} style={{ ...secondaryButton, minHeight: 32, padding: '4px 10px' }}>
            Change {chipKind}-intercept
          </button>
        ))}
      </div>
      {content}
    </EnlargeableFigure>
  );
}
