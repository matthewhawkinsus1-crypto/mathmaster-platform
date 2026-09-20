import React, { useCallback, useMemo, useState } from 'react';
import MathInput from '../../MathInput.jsx';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { HintPanel, Panel, ResultPill, TaskCard, ToolGrid } from '../shared/ToolShell.jsx';
import useToolSubmission from '../shared/useToolSubmission.js';
import { InteractiveStandardEquation } from './linearInterceptsConceptualUi.jsx';
import {
  INTERCEPT_FEEDBACK_TIMINGS,
  applyInterceptOperation,
  buildInterceptEvidence,
  buildSubstitutionState,
  choicePlacementMismatch,
  conceptualRedirect,
  evaluateInterceptStage,
  formatSolverEquation,
  formatStandardEquation,
  formatSubstitutionEquation,
  initialInterceptWork,
  parseNumericMath,
  resolveStandardCoefficients,
  shouldShowConceptRedirect,
  solverIsSolved,
} from './linearInterceptsMath.js';

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };

const OPERATIONS = {
  add: { label: 'Add', preposition: 'to' },
  subtract: { label: 'Subtract', preposition: 'from' },
  multiply: { label: 'Multiply', preposition: 'by' },
  divide: { label: 'Divide', preposition: 'by' },
};

const stageLabel = (kind) => (kind === 'x' ? 'x-intercept' : 'y-intercept');

const targetPrompt = (kind) => (
  kind === 'x'
    ? 'Find the x-intercept. Decide which variable becomes 0, place the 0 on that variable, solve, then write the intercept as an ordered pair.'
    : 'Find the y-intercept. Decide which variable becomes 0, place the 0 on that variable, solve, then write the intercept as an ordered pair.'
);

const operationDescription = (operation, operand) => {
  const spec = OPERATIONS[operation];
  if (!spec || operand == null) return '';
  return `${spec.label} ${operand < 0 ? `(${operand})` : operand} ${spec.preposition} both sides`;
};

export default function LinearIntercepts({ questionData = {}, onAction }) {
  const standard = useMemo(() => resolveStandardCoefficients(questionData), [questionData]);
  const feedbackTiming = INTERCEPT_FEEDBACK_TIMINGS.includes(questionData.feedbackTiming)
    ? questionData.feedbackTiming
    : 'delayed';
  const [work, setWork] = usePersistentToolState('linearInterceptWork', initialInterceptWork);
  const [operation, setOperation] = usePersistentToolState('linearInterceptOperation', 'divide');
  const [operand, setOperand] = usePersistentToolState('linearInterceptOperand', '');
  const [zeroArmed, setZeroArmed] = useState(false);
  const [localMessage, setLocalMessage] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const kind = work?.activeKind === 'y' ? 'y' : 'x';
  const stage = work?.[kind] || initialInterceptWork()[kind];
  const mismatch = choicePlacementMismatch(stage);
  const progressiveRedirect = shouldShowConceptRedirect(stage, kind, feedbackTiming);

  const updateStage = useCallback((targetKind, updater) => {
    setWork((current) => {
      const safe = current || initialInterceptWork();
      const before = safe[targetKind] || initialInterceptWork()[targetKind];
      const nextStage = typeof updater === 'function' ? updater(before) : updater;
      return { ...safe, [targetKind]: nextStage };
    });
  }, [setWork]);

  const restoreWork = useCallback((snapshot) => {
    setWork(snapshot.work);
    setOperand(snapshot.operand || '');
    setLocalMessage('');
    clearFeedback();
  }, [setWork, setOperand, clearFeedback]);

  const undoHistory = useMathUndoHistory({
    label: 'Undo the last intercept-work step',
    state: { work, operand },
    onRestore: restoreWork,
    resetKey: questionUndoResetKey(questionData),
  });

  if (!standard || Math.abs(Number(standard.A)) <= 1e-12 || Math.abs(Number(standard.B)) <= 1e-12) {
    return (
      <ToolShell title="Find Intercepts Algebraically" subtitle="Set one variable to zero, solve, and write the intercept as a point." badge="Linear intercepts">
        <Panel title="This question needs repair">
          <p style={{ margin: 0, color: '#a50e0e', lineHeight: 1.55 }}>
            This intercept workbench requires a two-variable linear equation with nonzero x- and y-coefficients. Use the vertical/horizontal graphing mode for a one-variable line.
          </p>
        </Panel>
      </ToolShell>
    );
  }

  const selectZeroChoice = (variable) => {
    clearFeedback();
    setLocalMessage('');
    updateStage(kind, (current) => ({
      ...current,
      conceptualZeroChoice: variable,
      completed: false,
      checked: false,
    }));
  };

  const placeZero = (variable) => {
    clearFeedback();
    setLocalMessage('');
    updateStage(kind, (current) => ({
      ...current,
      placedZeroVariable: variable,
      completed: false,
      checked: false,
    }));
    setZeroArmed(false);
  };

  const commitSubstitution = () => {
    if (!stage.conceptualZeroChoice || !stage.placedZeroVariable) {
      setLocalMessage('Choose which variable equals 0, then pick up the 0 and place it on that variable.');
      return;
    }
    if (mismatch) {
      setLocalMessage(`You chose ${stage.conceptualZeroChoice} = 0, but your substitution replaced ${stage.placedZeroVariable}. Which one do you mean?`);
      return;
    }
    const solverState = buildSubstitutionState(standard, stage.placedZeroVariable);
    updateStage(kind, (current) => ({
      ...current,
      committed: true,
      solverState,
      workHistory: [],
      point: { x: '', y: '' },
      completed: false,
      checked: false,
    }));
    setOperand('');
    setLocalMessage('');
  };

  const operandValue = parseNumericMath(operand);
  const operationBlocked = operandValue == null
    ? (String(operand || '').trim() ? 'Enter a valid number.' : '')
    : operation === 'divide' && Math.abs(operandValue) <= 1e-12
      ? 'You cannot divide both sides by 0.'
      : operation === 'multiply' && Math.abs(operandValue) <= 1e-12
        ? 'Multiplying both sides by 0 would destroy the equation.'
        : '';

  const applyOperation = () => {
    if (operandValue == null || operationBlocked) {
      setLocalMessage(operationBlocked || 'Enter a number first.');
      return;
    }
    const next = applyInterceptOperation(stage.solverState, operation, operandValue);
    if (!next) {
      setLocalMessage('That operation cannot be applied here.');
      return;
    }
    const before = stage.solverState;
    updateStage(kind, (current) => ({
      ...current,
      solverState: next,
      workHistory: [
        ...(current.workHistory || []),
        {
          operation,
          operand: operandValue,
          before,
          after: next,
          description: operationDescription(operation, operandValue),
        },
      ],
      checked: false,
      completed: false,
    }));
    setOperand('');
    setLocalMessage('');
    clearFeedback();
  };

  const changeSubstitution = () => {
    updateStage(kind, (current) => ({
      ...current,
      committed: false,
      solverState: null,
      workHistory: [],
      point: { x: '', y: '' },
      completed: false,
      checked: false,
    }));
    setOperand('');
    setLocalMessage('');
    setZeroArmed(false);
    clearFeedback();
  };

  const setPointCoordinate = (coordinate, value) => {
    updateStage(kind, (current) => ({
      ...current,
      point: { ...(current.point || { x: '', y: '' }), [coordinate]: value },
      checked: false,
      completed: false,
    }));
    setLocalMessage('');
    clearFeedback();
  };

  const checkCurrentIntercept = () => {
    const result = evaluateInterceptStage(stage, standard, kind);
    const nextStage = { ...stage, checked: true, completed: result.isCorrect };

    if (!result.isCorrect) {
      updateStage(kind, nextStage);
      if (!result.correctZeroChoice || !result.correctPlacement) {
        setLocalMessage(conceptualRedirect(kind));
      } else if (!result.solved) {
        setLocalMessage('Your substitution is set up. Finish the algebra until the remaining variable is isolated.');
      } else if (!result.scalarCorrect) {
        setLocalMessage('The variable is isolated, but the value does not match the original equation. Undo the step where the balance changed.');
      } else if (!result.pointCorrect) {
        setLocalMessage(
          kind === 'x'
            ? `You found x = ${result.solvedNumber}. An x-intercept is a point on the x-axis. Write the full ordered pair.`
            : `You found y = ${result.solvedNumber}. A y-intercept is a point on the y-axis. Write the full ordered pair.`,
        );
      }
      return;
    }

    setLocalMessage('');
    if (kind === 'x') {
      setWork((current) => ({
        ...current,
        x: nextStage,
        activeKind: 'y',
      }));
      setOperand('');
      setZeroArmed(false);
      return;
    }

    const finishedWork = { ...work, y: nextStage, activeKind: 'y' };
    setWork(finishedWork);
    const evidence = buildInterceptEvidence(finishedWork, standard);
    submit(
      { isCorrect: true, score: 1 },
      {
        intercepts: {
          x: evidence.xIntercept.point,
          y: evidence.yIntercept.point,
        },
        work: evidence,
      },
      {
        mode: 'linearIntercepts',
        feedbackTiming,
        derivedPoints: [evidence.xIntercept.point, evidence.yIntercept.point],
      },
    );
  };

  const solverSolved = solverIsSolved(stage.solverState);
  const activeRedirect = progressiveRedirect ? conceptualRedirect(kind) : '';
  const statusMessage = mismatch
    ? `You chose ${stage.conceptualZeroChoice} = 0, but your zero is on ${stage.placedZeroVariable}. Which one do you mean?`
    : activeRedirect || localMessage;

  const activity = (
    <ToolShell
      title="Find Intercepts Algebraically"
      subtitle="Choose the zero coordinate, make the substitution yourself, solve, and turn the result into a point."
      badge="Standard form"
    >
      <TaskCard
        question={questionData}
        task={targetPrompt(kind)}
        steps={[
          `Decide which coordinate is always 0 at the ${stageLabel(kind)}.`,
          'Pick up the 0 and place it on the variable you are replacing.',
          'Commit the substitution, solve the one-variable equation, then write the ordered pair.',
        ]}
        note="MathMaster will let you make a mathematically meaningful wrong substitution. Use the equation and the axis meaning to decide whether your path matches the intercept you were asked to find."
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ padding: '6px 10px', borderRadius: 999, background: work.x?.completed ? '#e6f4ea' : kind === 'x' ? '#e8f0fe' : '#f1f3f4', color: work.x?.completed ? '#137333' : '#3c4756', fontWeight: 850 }}>
          {work.x?.completed ? '✓' : kind === 'x' ? '→' : '○'} x-intercept
        </span>
        <span style={{ padding: '6px 10px', borderRadius: 999, background: work.y?.completed ? '#e6f4ea' : kind === 'y' ? '#e8f0fe' : '#f1f3f4', color: work.y?.completed ? '#137333' : '#3c4756', fontWeight: 850 }}>
          {work.y?.completed ? '✓' : kind === 'y' ? '→' : '○'} y-intercept
        </span>
      </div>

      <ToolGrid min={340}>
        <Panel title={stage.committed ? 'Solve your substitution' : 'Build the substitution'}>
          {!stage.committed ? (
            <>
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
                  onDragStart={(event) => {
                    event.dataTransfer?.setData('text/plain', 'mathmaster-zero-token');
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => setZeroArmed((current) => !current)}
                  aria-pressed={zeroArmed}
                  aria-label="Pick up zero for substitution"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    border: zeroArmed ? '3px solid #174ea6' : '2px solid #9bb8e8',
                    background: zeroArmed ? '#e8f0fe' : '#fff',
                    color: '#174ea6',
                    fontSize: 26,
                    fontWeight: 950,
                    cursor: 'grab',
                  }}
                >
                  0
                </button>
                <span style={{ color: '#5f6b7a', lineHeight: 1.45, flex: '1 1 220px' }}>
                  Drag the 0 onto x or y. On a touch screen, tap the 0 and then tap the variable.
                </span>
              </div>

              <InteractiveStandardEquation
                standard={standard}
                placedVariable={stage.placedZeroVariable}
                zeroArmed={zeroArmed}
                disabled={false}
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
                disabled={!stage.conceptualZeroChoice || !stage.placedZeroVariable}
                style={{ ...primaryButton, width: '100%', marginTop: 12, opacity: !stage.conceptualZeroChoice || !stage.placedZeroVariable ? 0.5 : 1 }}
              >
                Commit substitution
              </button>
            </>
          ) : (
            <>
              <div style={{ padding: 11, borderRadius: 9, background: '#f7faff', color: '#3c4756', marginBottom: 10 }}>
                <strong>Substitution:</strong> {formatSubstitutionEquation(standard, stage.placedZeroVariable)}
              </div>
              <div data-math-state={formatSolverEquation(stage.solverState)} style={{ fontSize: 30, fontWeight: 850, textAlign: 'center', padding: 18, borderRadius: 12, border: `2px solid ${solverSolved ? '#a8dab5' : '#d9e2f1'}`, background: '#fff' }}>
                {formatSolverEquation(stage.solverState)}
              </div>

              {statusMessage && (
                <div role="status" aria-live="polite" style={{ marginTop: 10, padding: 10, borderRadius: 9, background: activeRedirect ? '#fff4e5' : '#f7faff', color: activeRedirect ? '#7a4b00' : '#3c4756', lineHeight: 1.5 }}>
                  {statusMessage}
                </div>
              )}

              {!solverSolved ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.8fr) minmax(150px, 1.2fr)', gap: 10, marginTop: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 750 }}>
                      Operation
                      <select value={operation} onChange={(event) => setOperation(event.target.value)} style={{ width: '100%', minHeight: 44, marginTop: 5, borderRadius: 9, border: '1px solid #cdd6e4', fontSize: 16, padding: 8 }}>
                        {Object.entries(OPERATIONS).map(([value, spec]) => <option key={value} value={value}>{spec.label}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 750 }}>
                      Number
                      <MathInput
                        value={operand}
                        onChange={setOperand}
                        toolProfile="number"
                        answerFormat="number"
                        ariaLabel="Number to apply to both sides"
                        compact
                      />
                    </label>
                  </div>
                  {operationBlocked && <div role="alert" style={{ marginTop: 8, color: '#a50e0e', fontSize: 13 }}>{operationBlocked}</div>}
                  <button type="button" onClick={applyOperation} disabled={operandValue == null || Boolean(operationBlocked)} style={{ ...primaryButton, width: '100%', marginTop: 10, opacity: operandValue == null || operationBlocked ? 0.5 : 1 }}>
                    Apply to both sides
                  </button>
                </>
              ) : (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#e6f4ea', color: '#137333', fontWeight: 800 }}>
                  The variable is isolated. Now turn that value into the intercept point.
                </div>
              )}

              <button type="button" onClick={changeSubstitution} style={{ ...secondaryButton, width: '100%', marginTop: 10 }}>
                Return to substitution
              </button>

              {solverSolved && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                  <strong>Write the {stageLabel(kind)} as an ordered pair.</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(90px, 1fr) auto minmax(90px, 1fr) auto', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 24, fontWeight: 900 }}>
                    <span>(</span>
                    <MathInput value={stage.point?.x || ''} onChange={(value) => setPointCoordinate('x', value)} toolProfile="number" answerFormat="number" ariaLabel="x-coordinate of intercept" compact />
                    <span>,</span>
                    <MathInput value={stage.point?.y || ''} onChange={(value) => setPointCoordinate('y', value)} toolProfile="number" answerFormat="number" ariaLabel="y-coordinate of intercept" compact />
                    <span>)</span>
                  </div>
                  <button type="button" onClick={checkCurrentIntercept} style={{ ...primaryButton, width: '100%', marginTop: 12 }}>
                    Check {stageLabel(kind)}
                  </button>
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Your reasoning">
          <p style={{ marginTop: 0 }}><strong>Original equation:</strong> {formatStandardEquation(standard)}</p>
          {stage.workHistory?.length ? (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {stage.workHistory.map((step, index) => (
                <li key={index} style={{ padding: '8px 0', borderBottom: index === stage.workHistory.length - 1 ? 'none' : '1px solid #edf1f6' }}>
                  <strong>{step.description}</strong>
                  <div style={{ marginTop: 3, color: '#5f6b7a', fontSize: 13 }}>
                    {formatSolverEquation(step.before)} → {formatSolverEquation(step.after)}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: '#5f6b7a' }}>
              Your substitution and each balanced algebra step will stay here while you work.
            </p>
          )}

          <HintPanel
            hints={[
              `An intercept is a point on an axis. Think about which coordinate is always zero on the ${kind}-axis.`,
              'Your zero choice and your zero placement should describe the same substitution.',
              'After substituting, solve the one-variable equation without changing only one side.',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolGrid>

      {feedback ? (
        <div style={{ marginTop: 14 }}>
          <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Both intercepts complete' : 'Keep working'}</ResultPill>
        </div>
      ) : null}
    </ToolShell>
  );

  return (
    <EnlargeableFigure
      label="Linear intercept algebra workbench"
      enlargeLabel="Enlarge intercept workspace"
      style={{ width: '100%' }}
      taskText={targetPrompt(kind)}
      capabilities={{
        undo: undoHistory.capability,
        equationInput: { label: 'Zero substitution and intercept point', studentState: true },
        numericControls: { label: 'Balanced operation controls', studentState: true },
        instruction: { text: 'Choose which variable becomes zero, place the zero on that variable, solve, and write the intercept point.' },
        task: { text: targetPrompt(kind) },
        help: { content: 'Use the axis meaning first. Then keep the resulting one-variable equation balanced.' },
        primaryActions: solverSolved ? [{ id: 'check-linear-intercept', label: `Check ${stageLabel(kind)}`, onAction: checkCurrentIntercept }] : [],
        secondaryActions: stage.committed ? [{ id: 'change-linear-intercept-substitution', label: 'Return to substitution', onAction: changeSubstitution }] : [],
      }}
    >
      {activity}
    </EnlargeableFigure>
  );
}
