import React, { useEffect, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { HintPanel, Panel, ResultPill, TaskCard, ToolGrid } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import inverseCompositionGrader from '../../../functions/shared/serverGrading/tools/inverseCompositionLab.mjs';
import {
  applyInverseDerivationOperation,
  createLinearInverseDerivation,
  formatInverseDerivationRelation,
  isLinearInverseSolved,
} from './inverseDerivationMath';
import { DEFAULT_INVERSE_LAB_F, functionLabel } from './inverseCompositionMath';

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 10px',
  border: '1px solid var(--mm-tint-border)',
  borderRadius: 8,
  background: 'var(--mm-surface)',
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
  const f = questionData.f || DEFAULT_INVERSE_LAB_F;
  const resetKey = JSON.stringify({ type: f.type, a: f.a, h: f.h, k: f.k });
  const makeInitial = () => createLinearInverseDerivation(f);
  const [derivation, setDerivation] = usePersistentToolState('derivation', makeInitial);
  const [operation, setOperation] = usePersistentToolState('operation', 'subtract');
  const [operand, setOperand] = usePersistentToolState('operand', '');
  const [operationError, setOperationError] = useState('');
  const { feedback, submit } = useToolSubmission(onAction);

  // Reset when the AUTHORED FUNCTION changes — not on mount.
  //
  // This effect used to run on every mount, which was invisible while the
  // derivation lived in component state and started empty anyway. Now that a
  // half-finished derivation is restored from the draft, an unconditional reset
  // here would throw the student's staged work away the instant they navigated
  // back to it.
  const resetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
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

  // The student's work, exactly as the shared grader reads it: the current
  // equation (its coefficients — the verdict depends on nothing else), plus
  // the equation as written and the number of steps, for the teacher.
  const work = useMemo(() => ({
    equation: { left: derivation.left, right: derivation.right },
    relation: currentRelation,
    steps: derivation.history?.length || 0,
  }), [derivation, currentRelation]);
  useReportToolWork(work);

  const check = () => {
    const result = gradeToolCheck(inverseCompositionGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'deriveInverse', parts: result.parts });
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
          <div style={{ padding: 14, borderRadius: 10, background: 'var(--mm-primary-subtle)', fontWeight: 900, fontSize: 20 }}>
            {functionLabel(f, 'f')}
          </div>
          <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>
            The first required inverse step is to exchange the input and output variables. That creates the inverse relation you will solve for y.
          </p>
          <button
            type="button"
            onClick={swapVariables}
            disabled={swapped}
            style={{ ...buttonStyle, background: swapped ? 'var(--mm-surface-control-strong)' : '#1a73e8', color: swapped ? 'var(--mm-text-muted)' : '#fff' }}
          >
            {swapped ? '✓ x and y swapped' : 'Swap x and y'}
          </button>
        </Panel>

        <Panel title="2 · Balanced algebra workspace">
          <div style={{ padding: 16, borderRadius: 10, background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--mm-text-muted)', fontWeight: 800 }}>Current equation</div>
            <div style={{ marginTop: 7, fontSize: 25, fontWeight: 900 }}>{currentRelation}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--mm-text-muted)' }}>
              Operation on both sides
              <select value={operation} onChange={(event) => setOperation(event.target.value)} disabled={!swapped || solved} style={{ ...inputStyle, marginTop: 5 }}>
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
                <option value="multiply">Multiply by</option>
                <option value="divide">Divide by</option>
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 800, color: 'var(--mm-text-muted)' }}>
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
            <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: typeof preview === 'string' && preview.includes('=') ? 'var(--mm-success-bg)' : 'var(--mm-warning-bg)', color: 'var(--mm-text)' }}>
              <strong>Preview:</strong> {preview}
            </div>
          ) : null}
          {operationError ? <div style={{ marginTop: 12, padding: 11, borderRadius: 9, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }}>{operationError}</div> : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              onClick={applyOperation}
              disabled={!swapped || solved || operand === ''}
              style={{ ...buttonStyle, background: !swapped || solved || operand === '' ? 'var(--mm-surface-control)' : '#1a73e8', color: !swapped || solved || operand === '' ? 'var(--mm-text-muted)' : '#fff' }}
            >
              Apply to both sides
            </button>
            <button type="button" onClick={undo} disabled={!derivation.history?.length} style={{ ...buttonStyle, background: 'var(--mm-primary-subtle)', color: 'var(--mm-text)' }}>Undo</button>
            <button type="button" onClick={startOver} style={{ ...buttonStyle, background: 'var(--mm-primary-subtle)', color: 'var(--mm-text)' }}>Start over</button>
          </div>
        </Panel>

        <Panel title="3 · Step history">
          <div style={{ display: 'grid', gap: 8 }}>
            {history.map((step, index) => (
              <div key={`${index}-${formatInverseDerivationRelation(step)}`} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 8, alignItems: 'center', padding: 10, borderRadius: 9, background: index === history.length - 1 ? 'var(--mm-primary-subtle)' : 'var(--mm-surface-sunken)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', fontWeight: 900 }}>{index + 1}</div>
                <div style={{ fontWeight: index === history.length - 1 ? 900 : 700 }}>{formatInverseDerivationRelation(step)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="4 · State the inverse">
          {solved ? (
            <>
              <ResultPill stageCheck ok>y isolated</ResultPill>
              <div style={{ marginTop: 12, padding: 15, borderRadius: 10, background: 'var(--mm-success-bg)', fontSize: 22, fontWeight: 900 }}>
                f⁻¹(x) = {inverseExpression(derivation)}
              </div>
              <div style={{ marginTop: 12, padding: 12, borderRadius: 9, background: 'var(--mm-warning-bg)', lineHeight: 1.5 }}>
                <strong>Domain/range connection:</strong> the domain of f becomes the range of f⁻¹, and the range of f becomes the domain of f⁻¹. Graphically, the two functions reflect across y = x.
              </div>
            </>
          ) : (
            <p style={{ marginTop: 0, color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>Keep the equation balanced until y is alone with coefficient 1. The inverse statement will appear when isolation is mathematically complete.</p>
          )}

          <button data-mm-enter-action="submit" type="button" onClick={check} style={{ ...buttonStyle, marginTop: 14, background: '#1a73e8', color: '#fff' }}>Check derivation</button>
          {feedback ? (
            <div style={{ marginTop: 12 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Complete' : 'Keep going'}</ResultPill>
              <p style={{ color: 'var(--mm-text)', lineHeight: 1.5 }}>
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
