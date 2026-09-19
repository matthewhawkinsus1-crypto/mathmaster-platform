import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure';
import useMathUndoHistory from '../../platform/workView/useMathUndoHistory';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import MathDisplay from '../../MathDisplay';
import useToolSubmission from '../shared/useToolSubmission';
import {
  applyRewriteBalancedOperation,
  buildInitialEquationState,
  checkSideRewrite,
  describeRewriteGap,
  formatEquationLatex,
} from './rewriteLinearFormMath';

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };
const controlStyle = { padding: '11px 12px', border: '1px solid #cdd6e4', borderRadius: 9, fontSize: 15, minHeight: 44, width: '100%' };

const OPERATIONS = {
  add: { label: 'Add', preposition: 'to' },
  subtract: { label: 'Subtract', preposition: 'from' },
  multiply: { label: 'Multiply', preposition: 'by' },
  divide: { label: 'Divide', preposition: 'by' },
};

const SCOPES = [['left', 'Left side'], ['right', 'Right side'], ['both', 'Both sides']];

const GAP_MESSAGES = {
  isolateVariable: 'y is not isolated on the left side yet. Use a balanced operation, then rewrite that side down to plain y.',
  variableOnBothSides: 'y still appears on the right side. It needs to end up only on the left.',
  needsSimplification: 'This is equivalent to the target line, but it is not yet written as y = mx + b. Combine like terms or simplify the rational coefficient.',
};

export default function RewriteLinearForm({ questionData = {}, onAction }) {
  const initialEquationState = useMemo(() => buildInitialEquationState(questionData), [questionData]);
  const [equationState, setEquationState] = usePersistentToolState('rewriteEquationState', initialEquationState);
  const [history, setHistory] = usePersistentToolState('rewriteHistory', []);
  const [operation, setOperation] = usePersistentToolState('rewriteOperation', 'subtract');
  const [operand, setOperand] = usePersistentToolState('rewriteOperand', '');
  const [scope, setScope] = usePersistentToolState('rewriteScope', 'both');
  const [rewriteInputs, setRewriteInputs] = usePersistentToolState('rewriteInputs', { left: '', right: '' });
  const [operationError, setOperationError] = useState('');
  const [rewriteError, setRewriteError] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const restoreWork = useCallback((snapshot) => {
    setEquationState(snapshot.equationState);
    setHistory(snapshot.history);
    setOperand('');
    setRewriteInputs({ left: '', right: '' });
    setOperationError('');
    setRewriteError('');
    clearFeedback();
  }, [clearFeedback, setEquationState, setHistory, setOperand, setRewriteInputs]);

  const undoHistory = useMathUndoHistory({
    label: 'Undo the last committed equation step',
    state: { equationState, history },
    onRestore: restoreWork,
    resetKey: questionData.questionId ?? questionData.id ?? null,
  });

  const gap = describeRewriteGap(equationState);
  const complete = gap === null;
  const leftIsolated = gap !== 'isolateVariable';
  const noVariableOnRight = leftIsolated && gap !== 'variableOnBothSides';

  const applyOperation = () => {
    if (operand.trim() === '') { setOperationError('Enter a number or expression first.'); return; }
    let result;
    try {
      result = applyRewriteBalancedOperation(equationState, operation, operand);
    } catch (error) {
      setOperationError(error.message || 'That operation is not valid here.');
      return;
    }
    setOperationError('');
    clearFeedback();
    const before = { left: equationState.left, right: equationState.right };
    const next = { ...equationState, left: result.unsimplified.left, right: result.unsimplified.right };
    setHistory((current) => [...current, {
      kind: 'operation',
      description: `${result.operationLabel} ${result.operandExpression} on both sides`,
      before,
      after: { left: next.left, right: next.right },
    }]);
    setEquationState(next);
    setOperand('');
  };

  const applyRewrite = () => {
    const inputs = scope === 'both' ? rewriteInputs : rewriteInputs[scope];
    const result = checkSideRewrite(equationState, scope, inputs);
    if (!result.ok) {
      setRewriteError(
        result.reason === 'empty'
          ? 'Enter the equivalent expression first.'
          : result.reason === 'invalid'
            ? 'That is not a valid algebraic expression.'
            : `That is not equivalent to the current ${result.side} side. Check your distribution and signs.`,
      );
      return;
    }
    setRewriteError('');
    clearFeedback();
    const before = { left: equationState.left, right: equationState.right };
    setHistory((current) => [...current, {
      kind: 'rewrite',
      description: scope === 'both' ? 'Rewrote both sides' : `Rewrote the ${scope} side`,
      before,
      after: { left: result.equationState.left, right: result.equationState.right },
    }]);
    setEquationState(result.equationState);
    setRewriteInputs({ left: '', right: '' });
  };

  const startOver = () => {
    setEquationState(initialEquationState);
    setHistory([]);
    setOperand('');
    setRewriteInputs({ left: '', right: '' });
    setOperationError('');
    setRewriteError('');
    clearFeedback();
  };

  const check = () => {
    const score = complete ? 1 : gap === 'needsSimplification' ? 0.75 : gap === 'variableOnBothSides' ? 0.4 : history.length ? 0.15 : 0;
    submit({ isCorrect: complete, score }, { equationState, history }, { mode: 'rewriteLinearForm', gap });
  };

  const feedbackMessage = () => {
    if (feedback.isCorrect) return 'Correct — that is equivalent to the original equation and written in slope-intercept form.';
    return GAP_MESSAGES[feedback.metadata?.gap] || 'Not yet — keep transforming the equation.';
  };

  const goalChip = (done, label) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999,
      background: done ? '#e6f4ea' : '#f1f3f4', color: done ? '#137333' : '#5f6b7a', fontWeight: 800, fontSize: 12,
    }}>
      {done ? '✓' : '○'} {label}
    </span>
  );

  const currentLatex = formatEquationLatex(equationState);

  const activity = (
    <ToolShell
      title="Rewriting a Linear Equation"
      subtitle="Transform the equation one equivalence-preserving move at a time until y is isolated in slope-intercept form."
      badge="Rewrite to slope-intercept form"
    >
      <TaskCard
        question={questionData}
        task="Rewrite the given equation in slope-intercept form (y = mx + b)."
        steps={[
          'Apply an operation to both sides, or rewrite a side into an equivalent expression (distribute, combine like terms, simplify).',
          'Repeat until y is alone on the left and the right side is simplified.',
          'Press Check equation when you are done.',
        ]}
        note="Every move must keep the equation equivalent to the original — the tool checks each rewrite for you."
      />

      <ToolGrid min={330}>
        <Panel title="Equation workspace">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {goalChip(leftIsolated, 'y isolated on the left')}
            {goalChip(noVariableOnRight, 'No y on the right')}
            {goalChip(complete, 'Written as y = mx + b')}
          </div>

          <div style={{ padding: '20px 12px', background: '#fff', border: `2px solid ${complete ? '#a8dab5' : '#d9e2f1'}`, borderRadius: 12, textAlign: 'center' }}>
            <MathDisplay value={currentLatex} format="latex" ariaLabel="Current equation" style={{ fontSize: 26 }} />
          </div>

          <h3 style={{ margin: '18px 0 8px', fontSize: 14, color: '#3c4756' }}>Apply an operation to both sides</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>
              Operation
              <select value={operation} onChange={(event) => { setOperation(event.target.value); setOperationError(''); }} style={controlStyle}>
                {Object.entries(OPERATIONS).map(([value, spec]) => <option key={value} value={value}>{spec.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>
              Expression
              <input
                type="text"
                inputMode="text"
                value={operand}
                onChange={(event) => { setOperand(event.target.value); setOperationError(''); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyOperation(); } }}
                placeholder="e.g. 5x or 1/2"
                aria-label="Expression to apply to both sides"
                style={controlStyle}
              />
            </label>
          </div>
          {operationError ? <p role="alert" style={{ color: '#c5221f', fontSize: 13, marginTop: 6 }}>{operationError}</p> : null}
          <button type="button" onClick={applyOperation} style={{ ...primaryButton, marginTop: 10 }}>Apply to both sides</button>

          <h3 style={{ margin: '22px 0 8px', fontSize: 14, color: '#3c4756' }}>Rewrite a side (distribute, combine, simplify)</h3>
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 10px' }}>
            <legend style={{ fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 6 }}>Which side?</legend>
            <div role="radiogroup" aria-label="Side to rewrite" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SCOPES.map(([value, label]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  key={value}
                  onClick={() => { setScope(value); setRewriteError(''); }}
                  style={{
                    padding: '9px 14px', minHeight: 40, borderRadius: 999, cursor: 'pointer',
                    border: scope === value ? '2px solid #1a73e8' : '1px solid #cdd6e4',
                    background: scope === value ? '#eef4ff' : '#fff', fontWeight: 700, color: '#202124',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {(scope === 'both' ? ['left', 'right'] : [scope]).map((side) => (
            <label key={side} style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#3c4756', marginBottom: 8 }}>
              Equivalent {side} side
              <input
                type="text"
                value={rewriteInputs[side] || ''}
                onChange={(event) => { setRewriteInputs((current) => ({ ...current, [side]: event.target.value })); setRewriteError(''); }}
                placeholder={side === 'left' ? 'e.g. y' : 'e.g. -(5/2)x + 3'}
                aria-label={`Equivalent ${side} side`}
                style={controlStyle}
              />
            </label>
          ))}
          {rewriteError ? <p role="alert" style={{ color: '#c5221f', fontSize: 13, marginTop: 2 }}>{rewriteError}</p> : null}
          <button type="button" onClick={applyRewrite} style={{ ...secondaryButton, marginTop: 4 }}>Check and commit rewrite</button>

          <button type="button" onClick={check} style={{ ...primaryButton, marginTop: 18, width: '100%', background: complete ? '#137333' : '#1a73e8' }}>
            Check equation
          </button>
          <button type="button" onClick={startOver} disabled={!history.length} style={{ ...secondaryButton, marginTop: 8, opacity: history.length ? 1 : 0.5 }}>
            Start over
          </button>

          {feedback ? (
            <div style={{ marginTop: 14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p>
            </div>
          ) : null}
        </Panel>

        <Panel title="Your steps">
          {history.length ? (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {history.map((step, index) => (
                <li key={index} style={{ padding: '9px 0', borderBottom: index === history.length - 1 ? 'none' : '1px solid #edf1f6' }}>
                  <strong>{step.description}</strong>
                  <div style={{ color: '#5f6b7a', fontSize: 13, marginTop: 3 }}>
                    <MathDisplay value={formatEquationLatex(step.before)} format="latex" inline ariaLabel={`Before: ${step.description}`} style={{ fontSize: 14 }} />
                    {' → '}
                    <MathDisplay value={formatEquationLatex(step.after)} format="latex" inline ariaLabel={`After: ${step.description}`} style={{ fontSize: 14 }} />
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: '#5f6b7a', margin: 0 }}>
              Each committed equation appears here, so you can see your reasoning and undo a step without starting over.
            </p>
          )}

          <HintPanel
            hints={[
              'First get every y-term alone on one side by adding or subtracting the x-term from both sides.',
              'Divide both sides by the coefficient of y — watch the sign if that coefficient is negative.',
              'Finally, rewrite the right side so it reads as a single x-term plus a constant: y = mx + b.',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolGrid>
    </ToolShell>
  );

  return (
    <EnlargeableFigure
      label="Rewrite linear form working activity"
      enlargeLabel="Enlarge algebra workspace"
      style={{ width: '100%' }}
      taskText="Rewrite the given equation in slope-intercept form."
      capabilities={{
        undo: undoHistory.capability,
        equationInput: { label: 'Both sides of the equation', studentState: true },
        numericControls: { label: 'Operation and rewrite controls', studentState: true },
        instruction: { text: 'Apply balanced operations and equivalent rewrites until y = mx + b.' },
        task: { text: 'Rewrite the given equation in slope-intercept form.' },
        help: { content: 'Use inverse operations to isolate y, then simplify the remaining side into mx + b.' },
        primaryActions: [{ id: 'check-rewrite-linear-form', label: 'Check equation', onAction: check }],
        secondaryActions: [{ id: 'start-over-rewrite-linear-form', label: 'Start over', onAction: startOver, disabled: !history.length }],
      }}
    >
      {activity}
    </EnlargeableFigure>
  );
}
