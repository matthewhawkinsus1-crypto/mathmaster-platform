import { useEffect, useMemo, useState } from 'react';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput.jsx';
import StepByStepAlgebraCore from './StepByStepAlgebraCore';
import EnlargeableFigure from './components/common/EnlargeableFigure';
import { readQuestionDraft, writeQuestionDraft } from './questionDraftStorage';
import { compareOrderedPair, parseOrderedPair } from './answerUtils.js';
import { round } from './tools/shared/toolMath.js';
import { InteractiveStandardEquation } from './tools/stepAlgebra2/linearInterceptsConceptualUi.jsx';
import {
  INTERCEPT_FEEDBACK_TIMINGS,
  buildSubstitutionState,
  conceptualRedirect,
  expectedInterceptPoint,
  formatStandardEquation,
  formatSubstitutionEquation,
  resolveStandardCoefficients,
  shouldShowConceptRedirect,
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

// The one-variable equation StepByStepAlgebraCore solves after substitution.
// buildSubstitutionState always leaves `constant` at 0 (see
// linearInterceptsMath.js), so this is exactly `coefficient * variable = right`.
const substitutionEquationText = (state) => {
  const coefficient = round(Number(state.coefficient), 8);
  const right = round(Number(state.right), 8);
  if (Math.abs(coefficient - 1) < 1e-9) return `${state.variable} = ${right}`;
  if (Math.abs(coefficient + 1) < 1e-9) return `-${state.variable} = ${right}`;
  return `${coefficient}${state.variable} = ${right}`;
};

export default function LinearInterceptsOrchestrator({
  question = {},
  onStateChange,
  onStepGrade,
  onUndoStateChange,
  disabled = false,
  draftKey = null,
}) {
  const standard = useMemo(() => resolveStandardCoefficients(question), [question]);
  const feedbackTiming = INTERCEPT_FEEDBACK_TIMINGS.includes(question.feedbackTiming)
    ? question.feedbackTiming
    : 'delayed';

  const workDraftKey = draftKey ? `${draftKey}:linear-intercepts` : null;
  const [work, setWork] = useState(() => readQuestionDraft(workDraftKey, null) || initialWork());
  const [zeroArmed, setZeroArmed] = useState(false);
  const [stageHistory, setStageHistory] = useState([]); // conceptual-stage undo, current kind only
  const [message, setMessage] = useState('');

  useEffect(() => {
    writeQuestionDraft(workDraftKey, work);
  }, [workDraftKey, work]);

  const kind = work.activeKind === 'y' ? 'y' : 'x';
  const stage = work[kind] || initialStage();
  const expectedPoint = useMemo(() => expectedInterceptPoint(standard, kind), [standard, kind]);
  // There is no per-move workHistory array on this side of the refactor — the
  // balanced-operation steps now live inside the mounted StepByStepAlgebraCore,
  // not on this orchestrator's own stage object. Treat "solved" as the
  // work-has-happened signal instead: guided timing still redirects the
  // instant a wrong zero is placed, delayed timing waits until the student
  // has actually finished the (wrong-path) algebra before saying so.
  const progressiveRedirect = shouldShowConceptRedirect(
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

  const pushStageHistory = () => setStageHistory((current) => [...current.slice(-19), stage]);

  // Conceptual-stage undo. Once the substitution is committed, undo ownership
  // moves to the mounted StepByStepAlgebraCore (its own registration effect
  // takes over the same onUndoStateChange channel); this effect explicitly
  // steps aside so the two never fight over one Undo button.
  useEffect(() => {
    if (stage.committed || !onUndoStateChange) return undefined;
    const canUndo = stageHistory.length > 0;
    onUndoStateChange({
      canUndo,
      label: 'Undo the last substitution choice',
      onUndo: canUndo ? () => {
        setStageHistory((current) => {
          if (!current.length) return current;
          const previous = current[current.length - 1];
          updateStage(previous);
          return current.slice(0, -1);
        });
      } : null,
    });
    return () => onUndoStateChange({ canUndo: false, onUndo: null, label: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.committed, stageHistory, onUndoStateChange, kind]);

  if (!standard || Math.abs(Number(standard.A)) <= 1e-12 || Math.abs(Number(standard.B)) <= 1e-12) {
    return (
      <p style={{ color: '#a50e0e' }}>
        This intercept question requires a two-variable linear equation with nonzero x- and y-coefficients.
      </p>
    );
  }

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

  const solverState = stage.committed ? buildSubstitutionState(standard, stage.placedZeroVariable) : null;
  const subEquationQuestion = useMemo(() => {
    if (!solverState) return null;
    return {
      ...question,
      mode: undefined,
      standard: undefined,
      equationText: undefined,
      feedbackTiming: undefined,
      targetForm: undefined,
      requireSimplifiedFinalForm: false,
      objective: undefined,
      equation: substitutionEquationText(solverState),
      equationLatex: undefined,
      leftExpression: undefined,
      rightExpression: undefined,
      solveFor: solverState.variable,
      variable: solverState.variable,
      prompt: `Solve for ${solverState.variable}.`,
    };
    // Rebuild only when the committed substitution itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.committed, stage.placedZeroVariable, kind]);

  const handleSubEquationStateChange = (payload) => {
    const solved = Boolean(payload?.isComplete && payload?.isCorrect);
    const response = payload?.parts?.find((part) => part?.id === 'algebra-objective')?.response || '';
    if (solved === stage.solved && response === stage.solvedEquationLatex) return;
    updateStage((current) => ({ ...current, solved, solvedEquationLatex: solved ? response : '' }));
  };

  const setPoint = (value) => {
    setMessage('');
    updateStage((current) => ({ ...current, point: value, checked: false, completed: false }));
  };

  const checkCurrentIntercept = () => {
    const pair = parseOrderedPair(stage.point);
    const isCorrect = Boolean(pair && expectedPoint && compareOrderedPair(stage.point, expectedPoint, 1e-6));
    const nextStage = { ...stage, checked: true, completed: isCorrect };

    if (!isCorrect) {
      updateStage(nextStage);
      if (!pair) setMessage('Enter the intercept as an ordered pair, such as (3, 0).');
      else if (kind === 'x' && Math.abs(pair[1]) > 1e-6) setMessage('An x-intercept is a point on the x-axis, so its y-coordinate is 0.');
      else if (kind === 'y' && Math.abs(pair[0]) > 1e-6) setMessage('A y-intercept is a point on the y-axis, so its x-coordinate is 0.');
      else setMessage('That point does not match this equation. Recheck the value you solved for.');
      return;
    }

    setMessage('');
    onStepGrade?.({
      stepGrade: {
        kind: 'linear-intercept',
        label: `Found the ${stageLabel(kind)}`,
        productive: true,
        accepted: true,
        earned: 1,
        possible: 1,
        equationBefore: formatStandardEquation(standard),
        equationAfter: `${stageLabel(kind)} = ${stage.point}`,
        expectedTotalPoints: 2,
      },
      countsAttempt: false,
    });

    if (kind === 'x') {
      setWork((current) => ({ ...current, x: nextStage, activeKind: 'y' }));
      setZeroArmed(false);
      return;
    }

    const finishedWork = { ...work, y: nextStage, activeKind: 'y' };
    setWork(finishedWork);
    const xPoint = parseOrderedPair(finishedWork.x.point);
    const yPoint = nextStage.completed ? parseOrderedPair(nextStage.point) : null;
    onStateChange?.({
      isComplete: true,
      isCorrect: true,
      questionDetails: `x-intercept ${finishedWork.x.point}, y-intercept ${nextStage.point}`,
      responseKey: JSON.stringify({ x: xPoint, y: yPoint }),
      parts: [
        { id: 'x-intercept', label: 'x-intercept', isComplete: true, isCorrect: true, response: finishedWork.x.point },
        { id: 'y-intercept', label: 'y-intercept', isComplete: true, isCorrect: true, response: nextStage.point },
      ],
    });
  };

  const activeRedirect = progressiveRedirect ? conceptualRedirect(kind) : '';
  const statusMessage = mismatch
    ? `You chose ${stage.conceptualZeroChoice} = 0, but your zero is on ${stage.placedZeroVariable}. Which one do you mean?`
    : activeRedirect || message;

  const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
  const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };

  const content = !stage.committed ? (
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
              background: stage.conceptualZeroChoice === variable ? '#e8f0fe' : '#fff',
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
            border: zeroArmed ? '3px solid #174ea6' : '2px solid #9bb8e8',
            background: zeroArmed ? '#e8f0fe' : '#fff', color: '#174ea6',
            fontSize: 26, fontWeight: 950, cursor: 'grab',
          }}
        >
          0
        </button>
        <span style={{ color: '#5f6b7a', lineHeight: 1.45, flex: '1 1 220px' }}>
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
        <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: '#f7faff', color: '#3c4756' }}>
          Your staged substitution: <strong>{formatSubstitutionEquation(standard, stage.placedZeroVariable)}</strong>
        </div>
      )}

      {statusMessage && (
        <div role="status" aria-live="polite" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: mismatch ? '#fff4e5' : '#f7faff', color: mismatch ? '#7a4b00' : '#3c4756', lineHeight: 1.5 }}>
          {statusMessage}
        </div>
      )}

      <button
        type="button"
        onClick={commitSubstitution}
        disabled={disabled || !stage.conceptualZeroChoice || !stage.placedZeroVariable}
        style={{ ...primaryButton, width: '100%', marginTop: 12, opacity: disabled || !stage.conceptualZeroChoice || !stage.placedZeroVariable ? 0.5 : 1 }}
      >
        Commit substitution
      </button>
    </div>
  ) : (
    <div>
      <div style={{ padding: 11, borderRadius: 9, background: '#f7faff', color: '#3c4756', marginBottom: 10 }}>
        <strong>Substitution:</strong> {formatSubstitutionEquation(standard, stage.placedZeroVariable)}
      </div>

      {!stage.solved ? (
        <StepByStepAlgebraCore
          key={`${kind}-${stage.placedZeroVariable}`}
          question={subEquationQuestion}
          questionRecord={null}
          onStateChange={handleSubEquationStateChange}
          onStepGrade={onStepGrade}
          onUndoStateChange={onUndoStateChange}
          disabled={disabled}
          draftKey={draftKey ? `${draftKey}:${kind}-intercept` : null}
        />
      ) : (
        <>
          <div style={{ marginTop: 4, padding: 12, borderRadius: 10, background: '#e6f4ea', color: '#137333', fontWeight: 800 }}>
            <MathDisplay value={stage.solvedEquationLatex} format="latex" /> — now write the {stageLabel(kind)} as an ordered pair.
          </div>
          <div style={{ marginTop: 14 }}>
            <MathInput
              value={stage.point}
              onChange={setPoint}
              toolProfile="orderedPair"
              answerFormat="orderedPair"
              ariaLabel={`${stageLabel(kind)} as an ordered pair`}
              placeholder="(x, y)"
            />
          </div>
          {statusMessage && (
            <div role="status" aria-live="polite" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: '#fff4e5', color: '#7a4b00', lineHeight: 1.5 }}>
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
        <span style={{ padding: '6px 10px', borderRadius: 999, background: work.x?.completed ? '#e6f4ea' : kind === 'x' ? '#e8f0fe' : '#f1f3f4', color: work.x?.completed ? '#137333' : '#3c4756', fontWeight: 850 }}>
          {work.x?.completed ? '✓' : kind === 'x' ? '→' : '○'} x-intercept
        </span>
        <span style={{ padding: '6px 10px', borderRadius: 999, background: work.y?.completed ? '#e6f4ea' : kind === 'y' ? '#e8f0fe' : '#f1f3f4', color: work.y?.completed ? '#137333' : '#3c4756', fontWeight: 850 }}>
          {work.y?.completed ? '✓' : kind === 'y' ? '→' : '○'} y-intercept
        </span>
      </div>
      {content}
    </EnlargeableFigure>
  );
}
