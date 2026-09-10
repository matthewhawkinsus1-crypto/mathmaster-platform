import React, { useEffect, useMemo, useState } from 'react';
import ToolShell, { HintPanel, Panel, ResultPill, TaskCard, ToolGrid } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import {
  applyInverseDerivationOperation,
  createLinearInverseDerivation,
  formatInverseDerivationRelation,
  isLinearInverseSolved,
} from './inverseDerivationMath';
import { functionLabel } from './inverseCompositionMath';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 10px',
  border: '1px solid #cfd8e6',
  borderRadius: 8,
  background: '#fff',
};

const buttonStyle = {
  padding: '10px 14px',
  border: 0,
  borderRadius: 8,
  fontWeight: 800,
  cursor: 'pointer',
};

const inverseExpression = (state) => {
  if (!state?.inverse) return '';
  const relation = formatInverseDerivationRelation(state);
  if (relation.endsWith(' = y')) return relation.slice(0, -4);
  if (relation.startsWith('y = ')) return relation.slice(4);
  return relation;
};

export default function InverseDerivationLab({ questionData = {}, onAction }) {
  const f = questionData.f || { type: 'linear', a: 2, h: 0, k: 3 };
  const resetKey = JSON.stringify({ type: f.type, a: f.a, h: f.h, k: f.k });
  const makeInitial = () => createLinearInverseDerivation(f);
  const [derivation, setDerivation] = useState(makeInitial);
  const [operation, setOperation] = useState('subtract');
  const [operand, setOperand] = useState('');
  const [operationError, setOperationError] = useState('');
  const { feedback, submit } = useToolSubmission(onAction);

  useEffect(() => {
    setDerivation(makeInitial());
    setOperand('');
    setOperationError('');
  // resetKey intentionally captures the authored linear function values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const swapped = derivation.phase !== 'original';
  const solved = isLinearInverseSolved(derivation);
  const currentRelation = formatInverseDerivationRelation(derivation);

  const preview = useMemo(() => {
    if (!swapped || solved || operand === '') return null;
    try {
      return formatInverseDerivationRelation(
        applyInverseDerivationOperation(derivation, operation, Number(operand)),
      );
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [derivation, operand, operation, solved, swapped]);

  const swapVariables = () => {
    try {
      setDerivation((current) => applyInverseDerivationOperation(current, 'swapVariables'));
      setOperationError('');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    }
  };

  const applyOperation = () => {
    try {
      const next = applyInverseDerivationOperation(derivation, operation, Number(operand));
      setDerivation(next);
      setOperand('');
      setOperationError('');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    }
  };

  const undo = () => {
    setDerivation((current) => applyInverseDerivationOperation(current, 'undo'));
    setOperationError('');
  };

  const startOver = () => {
    setDerivation(makeInitial());
    setOperand('');
    setOperationError('');
  };

  const check = () => {
    const parts = { swapped, isolated: solved };
    const score = (swapped ? 0.4 : 0) + (solved ? 0.6 : 0);
    submit(
      { isCorrect: solved, score },
      {
        relation: currentRelation,
        historyLength: derivation.history?.length || 0,
        inverse: derivation.inverse,
      },
      { mode: 'deriveInverse', parts, expected: { linearInverse: true } },
    );
  };

  const history = [...(derivation.history || []), derivation];

  return (
    <ToolShell
      title="Inverse & Composition Lab"
      subtitle="Derive a linear inverse by swapping x and y, then keeping every algebra move balanced."
      badge="Algebra II · Functions"
    >
      <TaskCard
        question={questionData}
        task="Derive f⁻¹(x) step by step. Do not jump straight to the answer."
        steps={[
          'Rewrite f(x) as y, then swap x and y.',
          'Use the same operation on both sides until y is isolated.',
          'State the inverse and connect the original domain/range to the inverse.',
        ]}
      />

      <ToolGrid min={360}>
        <Panel title="1 · Start with the function">
          <div style={{ padding: 14, borderRadius: 10, background: '#eef4ff', fontWeight: 900, fontSize: 20 }}>
            {functionLabel(f, 'f')}
          </div>
          <p style={{ color: '#5f6b7a', lineHeight: 1.55 }}>
            The first required inverse step is to exchange the input and output variables. That creates the inverse relation you will solve for y.
          </p>
          <button
            type="button"
            onClick={swapVariables}
            disabled={swapped}
            style={{ ...buttonStyle, background: swapped ? '#dfe3e7' : '#1a73e8', color: swapped ? '#667085' : '#fff' }}
          >
            {swapped ? '✓ x and y swapped' : 'Swap x and y'}
          </button>
        </Panel>

        <Panel title="2 · Balanced algebra workspace">
          <div style={{ padding: 16, borderRadius: 10, background: '#f8fbff', border: '1px solid #dce8f8', textAlign: 'center' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: '#667085', fontWeight: 800 }}>Current equation</div>
            <div style={{ marginTop: 7, fontSize: 25, fontWeight: 900 }}>{currentRelation}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 800, color: '#465267' }}>
              Operation on both sides
              <select value={operation} onChange={(event) => setOperation(event.target.value)} disabled={!swapped || solved} style={{ ...inputStyle, marginTop: 5 }}>
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
                <option value="multiply">Multiply by</option>
                <option value="divide">Divide by</option>
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 800, color: '#465267' }}>
              Number
              <input
                type="number"
                step="any"
                value={operand}
                onChange={(event) => setOperand(event.target.value)}
                disabled={!swapped || solved}
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </label>
          </div>

          {preview ? (
            <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: typeof preview === 'string' && preview.includes('=') ? '#eef7ee' : '#fff4e5', color: '#3c4756' }}>
              <strong>Preview:</strong> {preview}
            </div>
          ) : null}
          {operationError ? <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: '#fce8e6', color: '#8a1c13' }}>{operationError}</div> : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={applyOperation}
              disabled={!swapped || solved || operand === ''}
              style={{ ...buttonStyle, background: !swapped || solved || operand === '' ? '#dfe3e7' : '#1a73e8', color: !swapped || solved || operand === '' ? '#667085' : '#fff' }}
            >
              Apply to both sides
            </button>
            <button type="button" onClick={undo} disabled={!derivation.history?.length} style={{ ...buttonStyle, background: '#eef1f5', color: '#344054' }}>Undo</button>
            <button type="button" onClick={startOver} style={{ ...buttonStyle, background: '#eef1f5', color: '#344054' }}>Start over</button>
          </div>
        </Panel>

        <Panel title="3 · Step history">
          <div style={{ display: 'grid', gap: 8 }}>
            {history.map((step, index) => (
              <div key={`${index}-${formatInverseDerivationRelation(step)}`} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 8, alignItems: 'center', padding: 10, borderRadius: 9, background: index === history.length - 1 ? '#eef4ff' : '#f8f9fa' }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#fff', border: '1px solid #d0d5dd', fontWeight: 900 }}>{index + 1}</div>
                <div style={{ fontWeight: index === history.length - 1 ? 900 : 700 }}>{formatInverseDerivationRelation(step)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="4 · State the inverse">
          {solved ? (
            <>
              <ResultPill ok>y isolated</ResultPill>
              <div style={{ marginTop: 12, padding: 15, borderRadius: 10, background: '#e9f7ef', fontSize: 22, fontWeight: 900 }}>
                f⁻¹(x) = {inverseExpression(derivation)}
              </div>
              <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: '#fff8e6', lineHeight: 1.5 }}>
                <strong>Domain/range connection:</strong> the domain of f becomes the range of f⁻¹, and the range of f becomes the domain of f⁻¹. Graphically, the two functions reflect across y = x.
              </div>
            </>
          ) : (
            <p style={{ marginTop: 0, color: '#5f6b7a', lineHeight: 1.55 }}>Keep the equation balanced until y is alone with coefficient 1. The inverse statement will appear when isolation is mathematically complete.</p>
          )}

          <button type="button" onClick={check} style={{ ...buttonStyle, marginTop: 14, background: '#1a73e8', color: '#fff' }}>Check derivation</button>
          {feedback ? (
            <div style={{ marginTop: 12 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Complete' : 'Keep going'}</ResultPill>
              <p style={{ color: '#3c4756', lineHeight: 1.5 }}>
                {feedback.isCorrect
                  ? 'Your swap and balanced algebra correctly isolate y, so the inverse is complete.'
                  : swapped
                    ? 'The variable swap is complete. Continue applying valid operations to both sides until y is isolated.'
                    : 'Start by swapping x and y before solving the inverse relation.'}
              </p>
            </div>
          ) : null}
          <HintPanel
            hints={[
              'An inverse exchanges inputs and outputs, so swap x and y before doing algebra.',
              'Whatever operation you choose must be applied to both sides of the equation.',
              'When y is isolated, replace y with f⁻¹(x).',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
        </Panel>
      </ToolGrid>
    </ToolShell>
  );
}
