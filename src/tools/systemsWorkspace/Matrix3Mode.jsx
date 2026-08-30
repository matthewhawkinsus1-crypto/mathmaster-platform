import React, { useMemo, useState } from 'react';
import { Panel, ToolSplit, ResultPill, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import {
  applyMatrix3RowOperationToMatrix,
  normalizeMatrix3,
  rref3x4,
} from './systemsMath';

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 8px',
  border: '1px solid #cfd8e6', borderRadius: 8, background: '#fff',
  fontSize: 15, minHeight: 42, textAlign: 'center',
};
const actionStyle = {
  marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9,
  background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44,
};
const DEFAULT_MATRIX3 = {
  rows: [
    { a: 1, b: 1, c: 1, d: 6 },
    { a: 2, b: -1, c: 1, d: 3 },
    { a: 1, b: 2, c: -1, d: 2 },
  ],
};

const close = (left, right, tolerance = 0.02) => (
  Number.isFinite(Number(left)) && Number.isFinite(Number(right))
  && Math.abs(Number(left) - Number(right)) <= tolerance
);

const sameRow = (left, right, tolerance = 0.02) => (
  Array.isArray(left) && Array.isArray(right) && left.length === 4 && right.length === 4
  && left.every((entry, index) => close(entry, right[index], tolerance))
);

const sameMatrix = (left, right, tolerance = 0.02) => (
  Array.isArray(left) && Array.isArray(right) && left.length === 3 && right.length === 3
  && left.every((row, index) => sameRow(row, right[index], tolerance))
);

const display = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  if (Math.abs(number - Math.round(number)) < 1e-9) return String(Math.round(number));
  return String(Number(number.toFixed(3)));
};

const MatrixDisplay = ({ rows }) => (
  <div style={{ display: 'grid', gap: 8, justifyContent: 'center', margin: '18px 0' }}>
    {rows.map((row, rowIndex) => (
      <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(56px, 78px))', gap: 7 }}>
        {row.map((value, colIndex) => (
          <div
            key={colIndex}
            style={{
              padding: '11px 8px',
              textAlign: 'center',
              fontSize: 18,
              fontWeight: 800,
              borderRadius: 8,
              background: colIndex === 3 ? '#fff5e6' : '#eef4ff',
            }}
          >
            {display(value)}
          </div>
        ))}
      </div>
    ))}
  </div>
);

const operationLabel = (operation = {}) => {
  const target = Number(operation.targetRow) + 1;
  const source = Number(operation.sourceRow) + 1;
  const factor = Number(operation.factor);
  return `R${target} ← R${target} − (${display(factor)})R${source}`;
};

export default function Matrix3Mode({ questionData = {}, onAction }) {
  const matrix = questionData.matrix || DEFAULT_MATRIX3;
  const rows = useMemo(() => normalizeMatrix3(matrix), [matrix]);
  const solved = useMemo(() => rref3x4(matrix), [matrix]);
  const method = questionData.method === 'rref' ? 'rref' : 'gaussian';
  const operations = useMemo(() => (
    Array.isArray(questionData.rowOperations) && questionData.rowOperations.length
      ? questionData.rowOperations
      : (questionData.rowOperation ? [questionData.rowOperation] : [])
  ), [questionData.rowOperations, questionData.rowOperation]);

  const expectedCheckpoints = useMemo(() => {
    if (method !== 'gaussian') return [];
    let working = rows;
    const checkpoints = [];
    for (const operation of operations) {
      const next = applyMatrix3RowOperationToMatrix({ rows: working }, operation);
      if (!next) return [];
      working = next;
      checkpoints.push([...working[Number(operation.targetRow)]]);
    }
    return checkpoints;
  }, [method, rows, operations]);

  const [classification, setClassification] = useState('');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [z, setZ] = useState('');
  const [checkpoints, setCheckpoints] = useState(() => operations.map(() => ['', '', '', '']));
  const [rref, setRref] = useState(Array.from({ length: 3 }, () => ['', '', '', '']));
  const { feedback, submit } = useToolSubmission(onAction);
  const tolerance = Number(questionData.numericTolerance ?? 0.02);

  const setCheckpointValue = (rowIndex, colIndex, value) => {
    setCheckpoints((current) => current.map((row, index) => (
      index === rowIndex ? row.map((entry, c) => (c === colIndex ? value : entry)) : row
    )));
  };
  const setRrefValue = (rowIndex, colIndex, value) => {
    setRref((current) => current.map((row, r) => (
      r === rowIndex ? row.map((entry, c) => (c === colIndex ? value : entry)) : row
    )));
  };

  const check = () => {
    const classCorrect = classification === solved.type;
    const numericCheckpoints = checkpoints.map((row) => row.map(Number));
    const numericRref = rref.map((row) => row.map(Number));
    const proofCorrect = method === 'gaussian'
      ? expectedCheckpoints.length > 0
        && numericCheckpoints.length === expectedCheckpoints.length
        && expectedCheckpoints.every((row, index) => sameRow(numericCheckpoints[index], row, tolerance))
      : sameMatrix(numericRref, solved.matrix, tolerance);
    const solutionCorrect = solved.type !== 'one'
      || (close(x, solved.x, tolerance) && close(y, solved.y, tolerance) && close(z, solved.z, tolerance));
    const parts = [classCorrect, proofCorrect, ...(solved.type === 'one' ? [solutionCorrect] : [])];

    const response = {
      classification,
      x: Number(x),
      y: Number(y),
      z: Number(z),
      ...(method === 'gaussian'
        ? {
          checkpoints: numericCheckpoints,
          ...(numericCheckpoints.length === 1 ? { checkpoint: numericCheckpoints[0] } : {}),
        }
        : { rref: numericRref }),
    };

    submit(
      { isCorrect: parts.every(Boolean), score: parts.filter(Boolean).length / parts.length },
      response,
      { mode: 'matrix3', method, checks: { classCorrect, proofCorrect, solutionCorrect } },
    );
  };

  const feedbackMessage = () => {
    if (feedback?.isCorrect) return 'Correct — your row-reduction evidence and final solution agree.';
    const checks = feedback?.metadata?.checks || {};
    if (!checks.proofCorrect) {
      return method === 'gaussian'
        ? 'At least one elimination checkpoint is off. Apply each row operation to the current matrix, including the augmented constant.'
        : 'The RREF entries are not right yet. Re-run RREF and copy all 12 entries, including the augmented column.';
    }
    if (!checks.classCorrect) return 'Your row work is usable, but the number-of-solutions classification does not match the reduced system.';
    return 'The row work and classification are right. Recheck x, y, and z against the reduced rows.';
  };

  if (!rows.length) {
    return <Panel title="3×3 matrix"><p>This question is missing a valid 3×4 augmented matrix. Tell your teacher.</p></Panel>;
  }

  return (
    <ToolSplit>
      <Panel title="3×3 augmented matrix">
        <MatrixDisplay rows={rows} />
        <p style={{ margin: 0, color: '#5f6b7a', lineHeight: 1.55 }}>
          Columns 1–3 are the coefficients of x, y, and z. The shaded fourth column is the right-hand side.
        </p>
        {method === 'gaussian' ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#f8fbff', color: '#344563' }}>
            <strong>Gaussian elimination:</strong> complete the row operations in order. Each checkpoint uses the matrix produced by the step before it.
          </div>
        ) : (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#f8fbff', color: '#344563' }}>
            <strong>Matrix technology:</strong> use the RREF feature on the full 3×4 augmented matrix, then enter the matrix your technology returns.
          </div>
        )}
      </Panel>

      <Panel title={method === 'gaussian' ? 'Gaussian elimination evidence' : 'Technology RREF evidence'}>
        {method === 'gaussian' ? (
          <>
            {operations.length ? operations.map((operation, rowIndex) => (
              <div key={rowIndex} style={{ marginBottom: 14, padding: 11, border: '1px solid #dfe5ef', borderRadius: 9 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 800 }}>Step {rowIndex + 1}: {operationLabel(operation)}</p>
                <p style={{ margin: '0 0 8px', color: '#5f6b7a', fontSize: 13 }}>
                  Enter the four entries of the new target row.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                  {(checkpoints[rowIndex] || []).map((value, colIndex) => (
                    <input
                      key={colIndex}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      aria-label={`Gaussian step ${rowIndex + 1} entry ${colIndex + 1}`}
                      value={value}
                      onChange={(event) => setCheckpointValue(rowIndex, colIndex, event.target.value)}
                      style={inputStyle}
                    />
                  ))}
                </div>
              </div>
            )) : (
              <p style={{ color: '#b06000' }}>This Gaussian question is missing its required row-operation sequence.</p>
            )}
          </>
        ) : (
          <>
            <p style={{ marginTop: 0, color: '#5f6b7a' }}>Copy the complete 3×4 RREF matrix from your approved technology.</p>
            <div style={{ display: 'grid', gap: 7 }}>
              {rref.map((row, rowIndex) => (
                <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
                  {row.map((value, colIndex) => (
                    <input
                      key={colIndex}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      aria-label={`RREF row ${rowIndex + 1} column ${colIndex + 1}`}
                      value={value}
                      onChange={(event) => setRrefValue(rowIndex, colIndex, event.target.value)}
                      style={inputStyle}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        <label style={{ display: 'block', marginTop: 14, fontSize: 13, fontWeight: 700, color: '#465267' }}>
          How many solutions?
          <select value={classification} onChange={(event) => setClassification(event.target.value)} style={{ ...inputStyle, textAlign: 'left', marginTop: 5 }}>
            <option value="">Choose…</option>
            <option value="one">Exactly one solution</option>
            <option value="none">No solution</option>
            <option value="infinite">Infinitely many solutions</option>
          </select>
        </label>

        {classification === 'one' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 9, marginTop: 12 }}>
            {[['x', x, setX], ['y', y, setY], ['z', z, setZ]].map(([label, value, setter]) => (
              <label key={label} style={{ fontSize: 13, fontWeight: 700, color: '#465267' }}>
                {label}
                <input type="number" inputMode="decimal" step="any" value={value} onChange={(event) => setter(event.target.value)} style={{ ...inputStyle, marginTop: 5 }} />
              </label>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={check}
          disabled={!classification || (method === 'gaussian' && !operations.length)}
          style={{ ...actionStyle, opacity: classification && (method !== 'gaussian' || operations.length) ? 1 : 0.55 }}
        >
          Check 3×3 system
        </button>

        {feedback ? (
          <div style={{ marginTop: 14 }}>
            <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
            <p style={{ margin: '9px 0 0', color: '#3c4756', lineHeight: 1.55 }}>{feedbackMessage()}</p>
          </div>
        ) : null}

        <HintPanel
          hints={method === 'gaussian'
            ? [
              'A row operation changes the entire target row, including the augmented constant.',
              'Use the matrix produced by one step as the starting matrix for the next step.',
              'After creating triangular form, back-substitute to obtain x, y, and z.',
            ]
            : [
              'Enter the full augmented matrix before using RREF.',
              'A unique solution has pivots in all three variable columns.',
              'In a unique-solution RREF, the last column gives x, y, and z.',
            ]}
          onHintUsed={() => onAction?.('HINT_USED')}
        />
      </Panel>
    </ToolSplit>
  );
}
