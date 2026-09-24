import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure';
import useMathUndoHistory from '../../platform/workView/useMathUndoHistory';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import { nearlyEqual, round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import RewriteLinearForm from './RewriteLinearForm';
import LinearIntercepts from './LinearIntercepts';

const primaryButton = { padding: '11px 18px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 9, fontWeight: 800, cursor: 'pointer', minHeight: 44 };
const secondaryButton = { ...primaryButton, background: '#fff', color: '#174ea6', border: '1px solid #9bb8e8' };
const controlStyle = { padding: '11px 12px', border: '1px solid #cdd6e4', borderRadius: 9, fontSize: 15, minHeight: 44, width: '100%' };

const OPERATIONS = {
  add: { label: 'Add', preposition: 'to' },
  subtract: { label: 'Subtract', preposition: 'from' },
  multiply: { label: 'Multiply', preposition: 'by' },
  divide: { label: 'Divide', preposition: 'by' },
};

const formatEquation = (state) => {
  const a = round(state.a, 3);
  const b = round(state.b, 3);
  const c = round(state.c, 3);
  const coefficient = nearlyEqual(a, 1, 1e-9) ? 'x' : nearlyEqual(a, -1, 1e-9) ? '−x' : `${a}x`;
  if (nearlyEqual(b, 0, 1e-9)) return `${coefficient} = ${c}`;
  return `${coefficient} ${b >= 0 ? '+' : '−'} ${Math.abs(b)} = ${c}`;
};

const applyOperation = (state, operation, value) => {
  const next = { ...state };
  if (operation === 'add') { next.b += value; next.c += value; }
  if (operation === 'subtract') { next.b -= value; next.c -= value; }
  if (operation === 'multiply') { next.a *= value; next.b *= value; next.c *= value; }
  if (operation === 'divide') { next.a /= value; next.b /= value; next.c /= value; }
  return next;
};

const describeOperation = (operation, value) => {
  const spec = OPERATIONS[operation];
  if (!spec || !Number.isFinite(value)) return null;
  return `${spec.label} ${Math.abs(value) === value ? value : `(${value})`} ${spec.preposition} both sides`;
};

export default function StepAlgebra2({ questionData = {}, onAction, draftKey = null }) {
  // rewriteLinearForm is an additive mode (two-variable equation rewriting)
  // with a different workspace shape entirely; it is its own component so
  // the ax + b = c solving mode below is untouched for every existing
  // authored question, which has no `mode` field and defaults past this check.
  if (questionData.mode === 'rewriteLinearForm') {
    // draftKey: the embedded Step Algebra keeps its per-question draft (equation,
    // open factoring/splitting work, step log) under this question's key.
    return <RewriteLinearForm questionData={questionData} onAction={onAction} draftKey={draftKey} />;
  }
  if (questionData.mode === 'linearIntercepts') {
    return <LinearIntercepts questionData={questionData} onAction={onAction} />;
  }

  const original = questionData.equation || { a: 3, b: 6, c: 21 };
  const [state, setState] = usePersistentToolState('state', { ...original });
  const [operation, setOperation] = usePersistentToolState('operation', 'subtract');
  const [operand, setOperand] = usePersistentToolState('operand', '');
  const [history, setHistory] = usePersistentToolState('history', []);
  const [inputError, setInputError] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const restoreMathematicalWork = useCallback((snapshot) => {
    setState(snapshot.state);
    setHistory(snapshot.history);
    setOperand('');
    setInputError('');
    clearFeedback();
  }, [clearFeedback]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last completed equation step',
    state: { state, history },
    onRestore: restoreMathematicalWork,
    // Registry questions arrive with a canonical runtime identity. Prompt text
    // is deliberately not a fallback: two generated questions may use the
    // same wording while their Undo histories must remain isolated.
    resetKey: questionData.questionId ?? questionData.id ?? null,
  });

  const solution = useMemo(() => {
    const a = Number(original.a);
    if (!Number.isFinite(a) || nearlyEqual(a, 0, 1e-12)) return null;
    return (Number(original.c) - Number(original.b)) / a;
  }, [original]);

  const operandValue = Number(operand);
  // Explain a disabled Apply button rather than leaving the student poking at
  // it. The reason is computed as they type, not only when they click.
  const blockReason = operand === '' || !Number.isFinite(operandValue)
    ? null
    : operandValue === 0 && operation === 'divide'
      ? 'You cannot divide both sides by 0.'
      : operandValue === 0 && operation === 'multiply'
        ? 'Multiplying both sides by 0 turns the equation into 0 = 0, which loses the solution.'
        : null;
  const operandIsUsable = operand !== '' && Number.isFinite(operandValue) && !blockReason;
  // No preview of the resulting equation (#341): the move is the student's to
  // finish. The line below names the chosen move; the new equation appears
  // only once "Apply to both sides" commits it.

  const constantCleared = nearlyEqual(state.b, 0, 1e-9);
  const coefficientCleared = nearlyEqual(state.a, 1, 1e-9);
  const solved = coefficientCleared && constantCleared;

  const apply = () => {
    if (operand === '' || !Number.isFinite(operandValue)) {
      setInputError('Enter a number first.');
      return;
    }
    if (blockReason) {
      setInputError(blockReason);
      return;
    }
    setInputError('');
    clearFeedback();
    const next = applyOperation(state, operation, operandValue);
    setHistory((current) => [...current, { before: state, operation, operand: operandValue, after: next }]);
    setState(next);
    setOperand('');
  };

  const startOver = () => { clearFeedback(); setState({ ...original }); setHistory([]); setOperand(''); setInputError(''); };

  const check = () => {
    const correct = solved && solution != null && nearlyEqual(state.c, solution, 0.01);
    submit({ isCorrect: correct, score: correct ? 1 : solved ? 0.5 : 0 }, { history, state }, { stepCount: history.length });
  };

  const feedbackMessage = () => {
    if (feedback.isCorrect) return `Solved. x = ${round(solution, 3)}, and every step kept both sides balanced.`;
    if (!constantCleared) return `The equation still reads ${formatEquation(state)}. Undo the constant term first: whatever is added to the x-term must be removed from both sides.`;
    if (!coefficientCleared) return `You have ${formatEquation(state)}. x is still multiplied by ${round(state.a, 3)} — divide both sides by ${round(state.a, 3)} to finish.`;
    return 'The equation is in the form x = number, but that number does not check out. Undo a step and look for one where the two sides were changed differently.';
  };

  const goalChip = (done, label) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999,
      background: done ? '#e6f4ea' : '#f1f3f4', color: done ? '#137333' : '#5f6b7a', fontWeight: 800, fontSize: 12,
    }}>
      {done ? '✓' : '○'} {label}
    </span>
  );

  const activity = (
    <ToolShell
      title="Solving Equations Step by Step"
      subtitle="Do the same thing to both sides, one move at a time, and watch the equation simplify."
      badge="Linear equations"
    >
      <TaskCard
        question={questionData}
        task={`Solve ${formatEquation(original)} for x.`}
        steps={[
          'Pick an operation and a number for the move you want to make.',
          'Apply it. Repeat until the equation reads x = a number.',
          'Press Check solution when x is by itself.',
        ]}
        note="Every operation is applied to both sides at once — that is what keeps the equation true."
      />

      <ToolGrid min={330}>
        <Panel title="Equation workspace">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {goalChip(constantCleared, 'Constant moved off the x-side')}
            {goalChip(coefficientCleared, 'x has a coefficient of 1')}
          </div>

          <div data-math-state={formatEquation(state)} style={{ fontSize: 30, fontWeight: 800, textAlign: 'center', padding: '20px 12px', background: '#fff', border: `2px solid ${solved ? '#a8dab5' : '#d9e2f1'}`, borderRadius: 12, color: '#172033' }}>
            {formatEquation(state)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>
              Operation
              <select value={operation} onChange={(event) => { setOperation(event.target.value); setInputError(''); }} style={controlStyle}>
                {Object.entries(OPERATIONS).map(([value, spec]) => <option key={value} value={value}>{spec.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#3c4756' }}>
              Number
              <input
                type="number"
                inputMode="decimal"
                value={operand}
                onChange={(event) => { setOperand(event.target.value); setInputError(''); }}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply(); } }}
                placeholder="e.g. 6"
                style={controlStyle}
              />
            </label>
          </div>

          <div aria-live="polite" style={{ minHeight: 46, marginTop: 10, padding: '10px 12px', borderRadius: 9, background: inputError || blockReason ? '#fce8e6' : operandIsUsable ? '#f4f8ff' : '#f8f9fa', color: inputError || blockReason ? '#c5221f' : '#3c4756', fontSize: 14 }}>
            {inputError || blockReason
              ? (inputError || blockReason)
              : operandIsUsable
                ? <><strong>{describeOperation(operation, operandValue)}</strong> is ready. Apply it to both sides to see the new equation.</>
                : 'Choose an operation and a number, then apply it to both sides.'}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={apply} disabled={!operandIsUsable} style={{ ...primaryButton, opacity: operandIsUsable ? 1 : 0.5, cursor: operandIsUsable ? 'pointer' : 'not-allowed' }}>Apply to both sides</button>
            <button type="button" onClick={startOver} disabled={!history.length} style={{ ...secondaryButton, opacity: history.length ? 1 : 0.5 }}>Start over</button>
          </div>

          <button type="button" onClick={check} style={{ ...primaryButton, marginTop: 12, width: '100%', background: solved ? '#137333' : '#1a73e8' }}>
            Check solution
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
                  <strong>{describeOperation(step.operation, step.operand)}</strong>
                  <div style={{ color: '#5f6b7a', fontSize: 13, marginTop: 3 }}>{formatEquation(step.before)} → {formatEquation(step.after)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: '#5f6b7a', margin: 0 }}>
              Each move you make is recorded here, so you can see your reasoning and undo a step without starting over.
            </p>
          )}

          <HintPanel
            hints={[
              'Look at the side with the x. What is being done to x, and in what order?',
              `Undo the addition or subtraction first. Here that means ${Number(original.b) >= 0 ? 'subtracting' : 'adding'} ${Math.abs(Number(original.b))} ${Number(original.b) >= 0 ? 'from' : 'to'} both sides.`,
              `After that the equation is ${formatEquation(applyOperation(original, Number(original.b) >= 0 ? 'subtract' : 'add', Math.abs(Number(original.b))))}. Divide both sides by ${round(Number(original.a), 3)} to get x alone.`,
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolGrid>
    </ToolShell>
  );

  return (
    <EnlargeableFigure
      label="Step Algebra working activity"
      enlargeLabel="Enlarge algebra workspace"
      style={{ width: '100%' }}
      taskText={`Solve ${formatEquation(original)} for x.`}
      capabilities={{
        undo: undoHistory.capability,
        equationInput: { label: 'Both sides of the equation', studentState: true },
        numericControls: { label: 'Operation controls', studentState: true },
        instruction: { text: 'Choose an operation, apply it to both sides, and simplify until x is isolated.' },
        task: { text: `Solve ${formatEquation(original)} for x.` },
        help: { content: 'Use inverse operations in reverse order. Every committed operation changes both sides equally.' },
        primaryActions: [{ id: 'check-step-algebra', label: 'Check solution', onAction: check }],
        secondaryActions: [{ id: 'start-over-step-algebra', label: 'Start over', onAction: startOver, disabled: !history.length }],
      }}
    >
      {activity}
    </EnlargeableFigure>
  );
}
