import React, { useState } from 'react';
import MatrixGrid from '../../components/common/MatrixGrid.jsx';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import { nextCalculatorHistory } from './matrixCalculatorDisplay.js';
import { CALCULATOR_ERROR_TEXT, dimensionsOf, formatDecimal, formatRational, parseMatrix, runCalculator } from './matrixLabMath.js';
import { buttonStyle, choiceStyle } from './matrixLabUi.jsx';
import { spokenMathValue } from '../shared/spokenMathValue.js';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

/*
 * THE "TECHNOLOGY" THE LESSON KEEPS ASKING FOR.
 *
 * Algebra II's A2.3B asks students to solve three-variable systems "using
 * technology with matrices": enter the coefficient and constant matrices into
 * a graphing calculator, take [A]⁻¹, multiply by [B], read X. A browser
 * assignment cannot assume a TI-84 on the desk, so the lab carries one — only
 * the matrix commands the question allows, operating on the matrices the
 * STUDENT entered (in a solve question, the A and B they built), never on a
 * hidden key. A wrong A gives a wrong X here exactly as it would on the
 * calculator.
 *
 * Results are exact (59/4, not 14.75000001) with a decimal view, and the two
 * errors students meet in the lesson read the way the calculator prints them:
 * ERR: SINGULAR MATRIX and ERR: DIMENSION MISMATCH.
 */

const OPERATION_LABEL = Object.freeze({
  multiply: (left, right) => `[${left}]·[${right}]`,
  add: (left, right) => `[${left}]+[${right}]`,
  inverse: (left) => `[${left}]⁻¹`,
  inverseTimes: (left, right) => `[${left}]⁻¹·[${right}]`,
});

// The keys print the way a TI-84 does ("[A]⁻¹·[B]"); a screen reader spelled
// that out bracket by bracket. Their names say it: "A inverse times B".
const spokenOperation = (label) => spokenMathValue(label);

const ERROR_EXPLANATION = Object.freeze({
  singular: 'This matrix has no inverse.',
  dimension: 'These dimensions cannot be combined this way.',
  notSquare: 'Only a square matrix can have an inverse.',
  invalid: 'Fill every cell of the matrices with a number first.',
});

const dimsText = (cells) => {
  const parsed = parseMatrix(cells);
  if (!parsed) return 'not ready';
  const { rows, cols } = dimensionsOf(parsed);
  return `${rows} × ${cols}`;
};

export default function MatrixCalculator({ left, right, operations = [], onRun, title = 'Matrix calculator', historyKey = 'calculatorHistory' }) {
  // The commands the student ran, newest first (TL26). Their results stay on
  // screen side by side, so A⁻¹ is still there beside X, and they come back
  // after a reload. Only the commands are kept: each result is worked out
  // again from the matrices as they are now, so none outlives its matrix.
  const [history, setHistory] = usePersistentToolState(historyKey, []);
  const [view, setView] = useState('fraction');
  if (!operations.length || !left) return null;
  const available = (operation) => Boolean(OPERATION_LABEL[operation]) && operations.includes(operation) && (operation === 'inverse' || Boolean(right));
  const [result, ...earlier] = (Array.isArray(history) ? history : []).filter(available).map((operation) => ({
    operation,
    label: OPERATION_LABEL[operation](left.name, right?.name),
    ...runCalculator(operation, left.cells, right?.cells),
  }));
  const run = (operation) => {
    const outcome = runCalculator(operation, left.cells, right?.cells);
    setHistory((current) => nextCalculatorHistory(current, operation));
    onRun?.(operation, outcome);
  };
  const format = view === 'decimal' ? (value) => formatDecimal(value, 4) : formatRational;
  return (
    <section aria-label={title} data-matrix-calculator="true" style={{ border: '2px solid #3c4043', borderRadius: 14, padding: '12px 14px', background: 'var(--mm-surface-sunken)', marginTop: 12 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{title}</h3>
      <p style={{ margin: '0 0 10px', fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
        Loaded: [{left.name}] {dimsText(left.cells)}{right ? <> · [{right.name}] {dimsText(right.cells)}</> : null}. The calculator uses the matrices exactly as they are entered.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {operations.filter((operation) => OPERATION_LABEL[operation] && (operation === 'inverse' || right)).map((operation) => (
          <button key={operation} type="button" onClick={() => run(operation)} aria-label={spokenOperation(OPERATION_LABEL[operation](left.name, right?.name))} style={{ ...buttonStyle, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {OPERATION_LABEL[operation](left.name, right?.name)}
          </button>
        ))}
      </div>
      <div aria-live="polite" style={{ marginTop: 12, minHeight: 48 }}>
        {/* One live region: the error inside it was also role="status", a
            second region, so it was read twice (TL26). */}
        {result?.error ? (
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 800, color: 'var(--mm-error-text)', fontSize: 'calc(16 * var(--mm-px))' }}>
            <span aria-hidden="true">{result.label}</span><span style={SR_ONLY_STYLE}>{spokenOperation(result.label)}</span>: {CALCULATOR_ERROR_TEXT[result.error]}
            <div style={{ fontFamily: 'inherit', fontWeight: 600, color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginTop: 4 }}>{ERROR_EXPLANATION[result.error]}</div>
          </div>
        ) : null}
        {result?.value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 800 }}><span aria-hidden="true">{result.label} =</span><span style={SR_ONLY_STYLE}>{spokenOperation(result.label)} equals</span></span>
            <MatrixGrid showName={false} rows={result.value.map((row) => row.map(format))} ariaLabel={`Calculator result ${spokenOperation(result.label)}`} fontSize={18} />
            <div role="group" aria-label="Show the result as" style={{ display: 'flex', gap: 6 }}>
              <button type="button" aria-pressed={view === 'fraction'} onClick={() => setView('fraction')} style={{ ...choiceStyle(view === 'fraction'), minHeight: 44, minWidth: 44, padding: '4px 10px' }}>▸Frac</button>
              <button type="button" aria-pressed={view === 'decimal'} onClick={() => setView('decimal')} style={{ ...choiceStyle(view === 'decimal'), minHeight: 44, minWidth: 44, padding: '4px 10px' }}>▸Dec</button>
            </div>
          </div>
        ) : null}
      </div>
      {/* Earlier results, outside the live region: shown, not read again. */}
      {earlier.length ? (
        <div data-matrix-calculator-history="true" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--mm-border)' }}>
          <p style={{ margin: '0 0 6px', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text-muted)' }}>Earlier results</p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {earlier.map((entry) => (
              <div key={entry.operation} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700 }}>
                  <span aria-hidden="true">{entry.label} =</span><span style={SR_ONLY_STYLE}>{spokenOperation(entry.label)} equals</span>
                </span>
                {entry.value ? (
                  <MatrixGrid showName={false} rows={entry.value.map((row) => row.map(format))} ariaLabel={`Earlier result ${spokenOperation(entry.label)}`} fontSize={15} />
                ) : (
                  <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--mm-error-text)' }}>{CALCULATOR_ERROR_TEXT[entry.error]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
