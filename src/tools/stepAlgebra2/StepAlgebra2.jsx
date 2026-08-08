import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import { nearlyEqual, round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';

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

export default function StepAlgebra2({ questionData = {}, onAction }) {
  const original = questionData.equation || { a: 3, b: 6, c: 21 };
  const [state, setState] = useState({ ...original });
  const [operation, setOperation] = useState('subtract');
  const [operand, setOperand] = useState('');
  const [history, setHistory] = useState([]);
  const [inputError, setInputError] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

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
  const previewState = operandIsUsable ? applyOperation(state, operation, operandValue) : null;

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

  const undo = () => {
    if (!history.length) return;
    clearFeedback();
    setState(history[history.length - 1].before);
    setHistory(history.slice(0, -1));
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

  return (
    <ToolShell
      title="Solving Equations Step by Step"
      subtitle="Do the same thing to both sides, one move at a time, and watch the equation simplify."
      badge="Linear equations"
    >
      <TaskCard
        question={questionData}
        task={`Solve ${formatEquation(original)} for x.`}
        steps={[
          'Pick an operation and a number, then check the preview of what both sides will become.',
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

          <div style={{ fontSize: 30, fontWeight: 800, textAlign: 'center', padding: '20px 12px', background: '#fff', border: `2px solid ${solved ? '#a8dab5' : '#d9e2f1'}`, borderRadius: 12, color: '#172033' }}>
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
                onKeyDown={(event) => { if (event.key === 'Enter') apply(); }}
                placeholder="e.g. 6"
                style={controlStyle}
              />
            </label>
          </div>

          <div aria-live="polite" style={{ minHeight: 46, marginTop: 10, padding: '10px 12px', borderRadius: 9, background: inputError || blockReason ? '#fce8e6' : previewState ? '#f4f8ff' : '#f8f9fa', color: inputError || blockReason ? '#c5221f' : '#3c4756', fontSize: 14 }}>
            {inputError || blockReason
              ? (inputError || blockReason)
              : previewState
                ? <><strong>{describeOperation(operation, operandValue)}:</strong> {formatEquation(state)} → {formatEquation(previewState)}</>
                : 'Choose an operation and a number to see what it does to both sides.'}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={apply} disabled={!operandIsUsable} style={{ ...primaryButton, opacity: operandIsUsable ? 1 : 0.5, cursor: operandIsUsable ? 'pointer' : 'not-allowed' }}>Apply to both sides</button>
            <button type="button" onClick={undo} disabled={!history.length} style={{ ...secondaryButton, opacity: history.length ? 1 : 0.5 }}>Undo step</button>
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
}
