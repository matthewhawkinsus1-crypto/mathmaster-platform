import React, { useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import {
  intervalTruth,
  normalizeRows,
  pairKey,
  scoreLinearTableWorkbench,
} from './linearTableWorkbenchMath.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid #c9d6e8', background: '#fff', fontWeight: 800, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: 9, border: '1px solid #c9d6e8', borderRadius: 8, fontSize: 15 };
const formatCoord = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000));

const emptyState = { evidence: [], classification: '', repairRowIndex: null, repairedValue: '', m: '', b: '', equation: '' };

export default function LinearTableWorkbench({ questionData = {}, onAction }) {
  const rows = useMemo(() => normalizeRows(questionData.rows), [questionData.rows]);
  const mode = questionData.mode || 'constantRate';
  const requiredComparisons = Math.max(1, Number(questionData.requiredComparisons) || 3);

  const [evidence, setEvidence] = usePersistentToolState('evidence', []);
  const [classification, setClassification] = usePersistentToolState('classification', '');
  const [repairRowIndex, setRepairRowIndex] = usePersistentToolState('repairRowIndex', null);
  const [repairedValue, setRepairedValue] = usePersistentToolState('repairedValue', '');
  const [m, setM] = usePersistentToolState('m', '');
  const [b, setB] = usePersistentToolState('b', '');
  const [equation, setEquation] = usePersistentToolState('equation', '');
  const [stagingDx, setStagingDx] = usePersistentToolState('stagingDx', '');
  const [stagingDy, setStagingDy] = usePersistentToolState('stagingDy', '');
  const [stagingRate, setStagingRate] = usePersistentToolState('stagingRate', '');

  // Which rows are currently picked up before a comparison is recorded.
  // Selection, not committed evidence, so it stays out of the draft/undo history.
  const [selectedRows, setSelectedRows] = useState([]);
  const [notice, setNotice] = useState('');
  const [redoDepth, setRedoDepth] = useState(0);
  const redoStackRef = useRef([]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const mathematicalState = useMemo(
    () => ({ evidence, classification, repairRowIndex, repairedValue, m, b, equation }),
    [evidence, classification, repairRowIndex, repairedValue, m, b, equation],
  );
  const mathematicalStateRef = useRef(mathematicalState);
  mathematicalStateRef.current = mathematicalState;

  const applyState = (next) => {
    const value = next || emptyState;
    setEvidence(value.evidence || []);
    setClassification(value.classification || '');
    setRepairRowIndex(value.repairRowIndex ?? null);
    setRepairedValue(value.repairedValue || '');
    setM(value.m || '');
    setB(value.b || '');
    setEquation(value.equation || '');
  };

  const undoHistory = useMathUndoHistory({
    label: 'Undo the last Linear Table Workbench change',
    state: mathematicalState,
    resetKey: questionUndoResetKey(questionData),
    onRestore: (restored) => {
      redoStackRef.current = [...redoStackRef.current, mathematicalStateRef.current].slice(-60);
      setRedoDepth(redoStackRef.current.length);
      applyState(restored);
      setNotice('');
      clearFeedback();
    },
  });

  const clearRedo = () => {
    if (!redoStackRef.current.length) return;
    redoStackRef.current = [];
    setRedoDepth(0);
  };

  const undo = () => { if (undoHistory.undo()) setNotice(''); };
  const redo = () => {
    const restored = redoStackRef.current.at(-1);
    if (!restored) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setRedoDepth(redoStackRef.current.length);
    applyState(restored);
    setNotice('');
    clearFeedback();
  };

  const startOver = () => {
    const hasWork = evidence.length || classification || repairRowIndex != null || repairedValue || m || b || equation;
    if (!hasWork) return;
    clearRedo();
    applyState(emptyState);
    setSelectedRows([]);
    setStagingDx('');
    setStagingDy('');
    setStagingRate('');
    setNotice('Workspace cleared.');
    clearFeedback();
  };

  const toggleRow = (index) => {
    clearFeedback();
    setSelectedRows((current) => {
      if (current.includes(index)) return current.filter((entry) => entry !== index);
      const next = [...current, index];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  const [i, j] = selectedRows.length === 2 ? selectedRows : [null, null];
  const truth = i != null && j != null ? intervalTruth(rows[i], rows[j]) : null;
  const currentKey = i != null && j != null ? pairKey(i, j) : null;
  const alreadyRecorded = currentKey != null && evidence.some((entry) => pairKey(entry.i, entry.j) === currentKey);

  const recordInterval = () => {
    if (!truth || alreadyRecorded) return;
    clearRedo();
    setEvidence((current) => [...current, { i, j, dx: stagingDx, dy: stagingDy, rate: stagingRate }]);
    setStagingDx('');
    setStagingDy('');
    setStagingRate('');
    setSelectedRows([]);
    setNotice('');
    clearFeedback();
  };

  const removeEvidence = (index) => {
    clearRedo();
    setEvidence((current) => current.filter((_, entryIndex) => entryIndex !== index));
    clearFeedback();
  };

  const distinctPairCount = new Set(evidence.map((entry) => pairKey(entry.i, entry.j))).size;
  const readyToClassify = distinctPairCount >= requiredComparisons;

  const check = () => {
    const response = { evidence, classification, repairRowIndex, repairedValue, m, b, equation };
    const result = scoreLinearTableWorkbench(questionData, response);
    const parts = Object.entries(result.parts).map(([id, isCorrect]) => ({ id, label: partLabel(id), isCorrect, isComplete: true }));
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      response,
      { parts, evidenceCorrectness: result.evidenceCorrectness },
    );
  };

  const partLabel = (id) => ({
    evidenceCount: `At least ${requiredComparisons} distinct recorded intervals`,
    evidenceAccuracy: 'Δx, Δy, and rate for every recorded interval',
    classification: 'Linear vs. nonlinear classification',
    repairIndex: 'Identified offending row',
    repairValue: 'Corrected value',
    slope: 'Slope (m)',
    intercept: 'y-intercept (b)',
    equation: 'Equation y = mx + b',
  }[id] || id);

  const feedbackParts = feedback?.metadata?.parts || [];
  const firstWrong = feedbackParts.find((part) => !part.isCorrect);

  return (
    <ToolShell
      title="Linear Table Workbench"
      subtitle="Select two rows to build an interval, record what you calculate, and repeat until you can prove whether the rate of change is constant."
      badge="Rate-of-change evidence"
    >
      <TaskCard
        question={questionData}
        task="Select pairs of rows, compute Δx, Δy, and the rate for each interval you record, then classify the table."
        steps={[
          'Tap two rows to form an interval.',
          'Compute Δx, Δy, and Δy/Δx for that interval yourself and enter them below.',
          'Record the interval as evidence, then repeat with a different pair of rows.',
          `Record at least ${requiredComparisons} different intervals before classifying the table.`,
          mode === 'repairValue'
            ? 'One row breaks the pattern. Identify it and enter its corrected value, then confirm the repaired table is linear.'
            : mode === 'deriveEquation'
              ? 'If the rate is constant, determine m and b and write the equation.'
              : 'Decide whether the table represents a linear relationship.',
        ]}
        note="MathMaster never calculates the rate for you — every value here is checked against the table, not handed to you."
      />

      <Panel title={`Table (${rows.length} rows)`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {rows.map((row, index) => {
            const selected = selectedRows.includes(index);
            const isRepairTarget = mode === 'repairValue' && repairRowIndex === index;
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleRow(index)}
                aria-pressed={selected}
                aria-label={`Row ${index + 1}: x equals ${formatCoord(row.x)}, y equals ${formatCoord(row.y)}`}
                style={{
                  ...button,
                  minHeight: 56,
                  border: selected ? '3px solid #1a73e8' : isRepairTarget ? '3px solid #b06000' : '1px solid #c9d6e8',
                  background: selected ? '#eef4ff' : '#fff',
                }}
              >
                <div style={{ fontSize: 11, color: '#5f6b7a', fontWeight: 700 }}>Row {index + 1}</div>
                <div>({formatCoord(row.x)}, {formatCoord(row.y)})</div>
              </button>
            );
          })}
        </div>
      </Panel>

      {truth ? (
        <Panel title={`Interval: Row ${i + 1} → Row ${j + 1}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Δx</span>
              <input style={input} inputMode="decimal" value={stagingDx} onChange={(event) => { setStagingDx(event.target.value); clearFeedback(); }} aria-label="Change in x for this interval" />
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Δy</span>
              <input style={input} inputMode="decimal" value={stagingDy} onChange={(event) => { setStagingDy(event.target.value); clearFeedback(); }} aria-label="Change in y for this interval" />
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Δy/Δx</span>
              <input style={input} inputMode="decimal" value={stagingRate} onChange={(event) => { setStagingRate(event.target.value); clearFeedback(); }} aria-label="Rate of change for this interval" />
            </label>
          </div>
          <button type="button" onClick={recordInterval} disabled={alreadyRecorded} style={{ ...button, marginTop: 10, background: alreadyRecorded ? '#f1f3f4' : '#1a73e8', color: alreadyRecorded ? '#5f6368' : '#fff', border: 0 }}>
            {alreadyRecorded ? 'Already recorded' : 'Record this interval'}
          </button>
          {alreadyRecorded ? <p style={{ color: '#7a4f01', fontSize: 13 }}>You already recorded this exact pair. Choose a different pair of rows for another piece of evidence.</p> : null}
        </Panel>
      ) : selectedRows.length === 1 ? (
        <p style={{ color: '#5f6b7a' }}>Row {selectedRows[0] + 1} selected. Tap a second row to form an interval.</p>
      ) : null}

      <Panel title={`Recorded intervals (${evidence.length}, need ${requiredComparisons})`}>
        {evidence.length ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {evidence.map((entry, index) => (
              <li key={`${entry.i}-${entry.j}`} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #dde5f0', borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ fontWeight: 800 }}>Row {entry.i + 1} → Row {entry.j + 1}</span>
                <span>Δx = {entry.dx || '—'}</span>
                <span>Δy = {entry.dy || '—'}</span>
                <span>rate = {entry.rate || '—'}</span>
                <button type="button" onClick={() => removeEvidence(index)} aria-label={`Remove interval between row ${entry.i + 1} and row ${entry.j + 1}`} style={{ ...button, marginLeft: 'auto', minHeight: 32, padding: '4px 9px' }}>×</button>
              </li>
            ))}
          </ul>
        ) : <p style={{ color: '#80868b' }}>No intervals recorded yet.</p>}
      </Panel>

      <Panel title="Classification">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['linear', 'nonlinear'].map((option) => (
            <button
              key={option}
              type="button"
              disabled={!readyToClassify}
              onClick={() => { setClassification(option); clearFeedback(); }}
              aria-pressed={classification === option}
              style={{ ...button, background: classification === option ? '#1a73e8' : '#fff', color: classification === option ? '#fff' : '#172033', opacity: readyToClassify ? 1 : 0.5 }}
            >
              {option === 'linear' ? 'Constant rate (linear)' : 'Not a constant rate (nonlinear)'}
            </button>
          ))}
        </div>
        {!readyToClassify ? <p style={{ color: '#5f6b7a', fontSize: 13 }}>Record {requiredComparisons - distinctPairCount} more interval(s) before classifying.</p> : null}
      </Panel>

      {mode === 'repairValue' ? (
        <Panel title="Repair the table">
          <p style={{ marginTop: 0, color: '#3c4756' }}>One row breaks the pattern. Tap the offending row above, then enter its corrected y-value.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Offending row</span>
              <select style={input} value={repairRowIndex ?? ''} onChange={(event) => { setRepairRowIndex(event.target.value === '' ? null : Number(event.target.value)); clearFeedback(); }}>
                <option value="">Choose a row…</option>
                {rows.map((row, index) => <option key={index} value={index}>Row {index + 1}: ({formatCoord(row.x)}, {formatCoord(row.y)})</option>)}
              </select>
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Corrected y-value</span>
              <input style={input} inputMode="decimal" value={repairedValue} onChange={(event) => { setRepairedValue(event.target.value); clearFeedback(); }} aria-label="Corrected y-value for the offending row" />
            </label>
          </div>
        </Panel>
      ) : null}

      {mode === 'deriveEquation' ? (
        <Panel title="Determine the equation">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>m</span>
              <input style={input} inputMode="decimal" value={m} onChange={(event) => { setM(event.target.value); clearFeedback(); }} aria-label="Slope m" />
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>b</span>
              <input style={input} inputMode="decimal" value={b} onChange={(event) => { setB(event.target.value); clearFeedback(); }} aria-label="y-intercept b" />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Equation</span>
              <input style={input} value={equation} onChange={(event) => { setEquation(event.target.value); clearFeedback(); }} placeholder="y = mx + b" aria-label="Equation in y = mx + b form" />
            </label>
          </div>
        </Panel>
      ) : null}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={undo} disabled={!undoHistory.canUndo} style={{ ...button }} aria-label="Undo">↶ Undo</button>
        <button type="button" onClick={redo} disabled={!redoDepth} style={{ ...button }} aria-label="Redo">↷ Redo</button>
        <button type="button" onClick={startOver} style={{ ...button }}>Start over</button>
        <button
          className="linear-table-workbench-submit"
          data-primary-answer-action="true"
          type="button"
          onClick={check}
          disabled={!readyToClassify || !classification}
          style={{ ...button, background: '#1a73e8', color: '#fff', border: 0 }}
        >
          Check my work
        </button>
        {feedback ? <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Needs another look'}</ResultPill> : null}
      </div>
      {notice ? <p role="status" style={{ color: '#5f6b7a' }}>{notice} <button type="button" onClick={undo}>Restore</button></p> : null}
      {feedback && !feedback.isCorrect && firstWrong ? (
        <p style={{ color: '#5f6b7a', lineHeight: 1.55 }}>Check this part again: <strong>{firstWrong.label}</strong>. MathMaster will not tell you the correct value — recompute it from the table.</p>
      ) : null}
    </ToolShell>
  );
}
