import React, { useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import {
  intervalTruth,
  normalizeRows,
  pairKey,
} from './linearTableWorkbenchMath.js';
import linearTableWorkbenchGrader, {
  linearTableEvidenceChecks,
  linearTableRequiredComparisons,
} from '../../../functions/shared/serverGrading/tools/linearTableWorkbench.mjs';
import { resolveLinearTableWorkbenchMode } from '../../../functions/shared/serverGrading/declarations/linearTableWorkbench.mjs';
import { FRACTION_ENTRY_PROPS } from '../../platform/interaction/numberEntry.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', fontWeight: 800, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: 9, border: '1px solid var(--mm-tint-border)', borderRadius: 8, fontSize: 15 };
const formatCoord = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000));

const emptyState = { evidence: [], classification: '', repairRowIndex: null, repairedValue: '', m: '', b: '', equation: '' };

export default function LinearTableWorkbench({ questionData = {}, onAction }) {
  const rows = useMemo(() => normalizeRows(questionData.rows), [questionData.rows]);
  // The view, resolved by the same function the grading declaration uses, so
  // the shared grader always marks the screen the student is looking at.
  const mode = resolveLinearTableWorkbenchMode(questionData);
  const requiredComparisons = linearTableRequiredComparisons(questionData);

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
  // Editing a recorded interval is intentionally transient. The committed
  // evidence remains untouched until the student presses Save changes, so
  // navigation/Undo can never destroy the last recorded version by accident.
  const [editingEvidenceIndex, setEditingEvidenceIndex] = useState(null);
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
  // The student's work: exactly what Check submits and what a deadline
  // checkpoints (the recorded intervals travel as `intervals`). Staging boxes
  // and row selection are not work until the student records the interval.
  const work = useMemo(
    () => ({ intervals: evidence, classification, repairRowIndex, repairedValue, m, b, equation }),
    [evidence, classification, repairRowIndex, repairedValue, m, b, equation],
  );
  useReportToolWork(work);

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
      setEditingEvidenceIndex(null);
      setSelectedRows([]);
      setStagingDx('');
      setStagingDy('');
      setStagingRate('');
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
    setEditingEvidenceIndex(null);
    setStagingDx('');
    setStagingDy('');
    setStagingRate('');
    setNotice('Workspace cleared.');
    clearFeedback();
  };

  const toggleRow = (index) => {
    clearFeedback();
    // Picking a new pair means the student has left an interval edit. Keep the
    // committed version intact and start a fresh comparison instead of silently
    // repurposing the edit form for another pair.
    if (editingEvidenceIndex != null) {
      setEditingEvidenceIndex(null);
      setStagingDx('');
      setStagingDy('');
      setStagingRate('');
      setNotice('');
    }
    setSelectedRows((current) => {
      if (current.includes(index)) return current.filter((entry) => entry !== index);
      const next = [...current, index];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };

  const [i, j] = selectedRows.length === 2 ? selectedRows : [null, null];
  const truth = i != null && j != null ? intervalTruth(rows[i], rows[j]) : null;
  const currentKey = i != null && j != null ? pairKey(i, j) : null;
  const alreadyRecorded = currentKey != null && evidence.some((entry, index) => (
    index !== editingEvidenceIndex && pairKey(entry.i, entry.j) === currentKey
  ));

  const recordInterval = () => {
    if (!truth || alreadyRecorded) return;
    clearRedo();
    const nextEntry = { i, j, dx: stagingDx, dy: stagingDy, rate: stagingRate };
    if (editingEvidenceIndex != null) {
      setEvidence((current) => current.map((entry, index) => (index === editingEvidenceIndex ? nextEntry : entry)));
      setNotice(`Updated Row ${i + 1} → Row ${j + 1}.`);
    } else {
      setEvidence((current) => [...current, nextEntry]);
      setNotice('');
    }
    setEditingEvidenceIndex(null);
    setStagingDx('');
    setStagingDy('');
    setStagingRate('');
    setSelectedRows([]);
    clearFeedback();
  };

  const editEvidence = (index) => {
    const entry = evidence[index];
    if (!entry) return;
    setEditingEvidenceIndex(index);
    setSelectedRows([Number(entry.i), Number(entry.j)]);
    setStagingDx(String(entry.dx ?? ''));
    setStagingDy(String(entry.dy ?? ''));
    setStagingRate(String(entry.rate ?? ''));
    setNotice(`Editing Row ${Number(entry.i) + 1} → Row ${Number(entry.j) + 1}. Change any value, then save.`);
    clearFeedback();
  };

  const cancelEvidenceEdit = () => {
    setEditingEvidenceIndex(null);
    setSelectedRows([]);
    setStagingDx('');
    setStagingDy('');
    setStagingRate('');
    setNotice('');
  };

  const removeEvidence = (index) => {
    clearRedo();
    setEvidence((current) => current.filter((_, entryIndex) => entryIndex !== index));
    if (editingEvidenceIndex === index) cancelEvidenceEdit();
    else if (editingEvidenceIndex != null && index < editingEvidenceIndex) setEditingEvidenceIndex(editingEvidenceIndex - 1);
    clearFeedback();
  };

  const distinctPairCount = new Set(evidence.map((entry) => pairKey(entry.i, entry.j))).size;
  const readyToClassify = distinctPairCount >= requiredComparisons;

  const check = () => {
    // The verdict is the shared grader's — the one the server records. The
    // per-interval detail (which box of which interval to recheck, never its
    // value) comes from the same scorer call the grader makes.
    const result = gradeToolCheck(linearTableWorkbenchGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode, parts: result.parts, evidenceCorrectness: linearTableEvidenceChecks(questionData, work) },
    );
  };

  const feedbackParts = feedback?.metadata?.parts || [];
  const firstWrong = feedbackParts.find((part) => !part.isCorrect);
  const evidenceChecks = Array.isArray(feedback?.metadata?.evidenceCorrectness)
    ? feedback.metadata.evidenceCorrectness
    : [];

  const intervalIssueIndex = evidenceChecks.findIndex((entry) => entry && entry.complete !== true);
  const intervalIssue = intervalIssueIndex >= 0 ? evidenceChecks[intervalIssueIndex] : null;
  const intervalIssueEvidence = intervalIssueIndex >= 0 ? evidence[intervalIssueIndex] : null;
  const intervalIssueFields = intervalIssue ? [
    intervalIssue.dxCorrect === false ? 'Δx' : null,
    intervalIssue.dyCorrect === false ? 'Δy' : null,
    intervalIssue.rateCorrect === false ? 'rate of change' : null,
  ].filter(Boolean) : [];

  const feedbackGuidance = (() => {
    if (!feedback || feedback.isCorrect) return '';
    if (intervalIssue && intervalIssueEvidence) {
      if (intervalIssue.duplicate) {
        return `Check recorded interval ${intervalIssueIndex + 1}: Row ${Number(intervalIssueEvidence.i) + 1} → Row ${Number(intervalIssueEvidence.j) + 1} repeats a pair you already used. Edit it or choose a different pair.`;
      }
      const fields = intervalIssueFields.length ? intervalIssueFields.join(', ') : 'the interval entries';
      return `Check Row ${Number(intervalIssueEvidence.i) + 1} → Row ${Number(intervalIssueEvidence.j) + 1}: ${fields}. Recheck subtraction order and signs before changing anything else.`;
    }
    switch (firstWrong?.id) {
      case 'evidenceCount':
        return `You need at least ${requiredComparisons} different row-pair comparisons. Add or edit an interval before checking the later parts.`;
      case 'nonconstantRateEvidence':
        return 'Your classification says the rate changes, but the recorded intervals do not yet show two different correct rates. Recheck which row pairs best prove your claim.';
      case 'classification':
        return 'Your recorded interval work is ready to use. Compare the rates you found and recheck only the linear/nonlinear classification.';
      case 'repairIndex':
        return 'Your interval evidence is not the issue here. Recheck which single table row breaks the pattern.';
      case 'repairValue':
        return 'You found the row to repair. Recheck only the corrected y-value by extending the constant-rate pattern.';
      case 'slope':
        return 'Your interval evidence is recorded. Recheck slope m using Δy ÷ Δx, especially the sign.';
      case 'intercept':
        return 'Recheck only b. Substitute one table point and your slope into y = mx + b, then solve for b.';
      case 'equation':
        return 'Your m and b entries are checked separately. Recheck how you wrote the final equation in y = mx + b form.';
      default:
        return firstWrong ? `Check this part again: ${firstWrong.label}.` : 'Check the highlighted part again.';
    }
  })();

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
                  border: selected ? '3px solid #1a73e8' : isRepairTarget ? '3px solid #b06000' : '1px solid var(--mm-tint-border)',
                  background: selected ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--mm-text-muted)', fontWeight: 700 }}>Row {index + 1}</div>
                <div>({formatCoord(row.x)}, {formatCoord(row.y)})</div>
              </button>
            );
          })}
        </div>
      </Panel>

      {truth ? (
        <Panel title={`Interval: Row ${i + 1} → Row ${j + 1}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Δx</span>
              <input style={input} {...FRACTION_ENTRY_PROPS} value={stagingDx} onChange={(event) => { setStagingDx(event.target.value); clearFeedback(); }} aria-label="Change in x for this interval" />
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Δy</span>
              <input style={input} {...FRACTION_ENTRY_PROPS} value={stagingDy} onChange={(event) => { setStagingDy(event.target.value); clearFeedback(); }} aria-label="Change in y for this interval" />
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Δy/Δx</span>
              <input style={input} {...FRACTION_ENTRY_PROPS} value={stagingRate} onChange={(event) => { setStagingRate(event.target.value); clearFeedback(); }} aria-label="Rate of change for this interval" />
            </label>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={recordInterval} disabled={alreadyRecorded} style={{ ...button, background: alreadyRecorded ? 'var(--mm-surface-control)' : '#1a73e8', color: alreadyRecorded ? 'var(--mm-text-muted)' : '#fff', border: 0 }}>
              {alreadyRecorded ? 'Already recorded' : editingEvidenceIndex != null ? 'Save interval changes' : 'Record this interval'}
            </button>
            {editingEvidenceIndex != null ? (
              <button type="button" onClick={cancelEvidenceEdit} style={button}>Cancel edit</button>
            ) : null}
          </div>
          {editingEvidenceIndex != null ? (
            <p style={{ color: 'var(--mm-primary-text)', fontSize: 13, marginBottom: 0 }}>You are editing recorded interval {editingEvidenceIndex + 1}. Saving replaces that interval; it does not add a duplicate.</p>
          ) : null}
          {alreadyRecorded ? <p style={{ color: 'var(--mm-warning-text)', fontSize: 13 }}>That row pair is already recorded elsewhere. Keep this interval unique or edit the existing one.</p> : null}
        </Panel>
      ) : selectedRows.length === 1 ? (
        <p style={{ color: 'var(--mm-text-muted)' }}>Row {selectedRows[0] + 1} selected. Tap a second row to form an interval.</p>
      ) : null}

      <Panel title={`Recorded intervals (${evidence.length}, need ${requiredComparisons})`}>
        {evidence.length ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {evidence.map((entry, index) => {
              const check = evidenceChecks[index] || null;
              const needsAttention = Boolean(feedback && !feedback.isCorrect && check && check.complete !== true);
              const fieldsToCheck = check ? [
                check.dxCorrect === false ? 'Δx' : null,
                check.dyCorrect === false ? 'Δy' : null,
                check.rateCorrect === false ? 'rate' : null,
              ].filter(Boolean) : [];
              return (
                <li key={`${entry.i}-${entry.j}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: needsAttention ? '2px solid #d93025' : editingEvidenceIndex === index ? '2px solid #1a73e8' : '1px solid var(--mm-tint-border)', background: needsAttention ? 'var(--mm-error-subtle)' : editingEvidenceIndex === index ? 'var(--mm-surface-tint)' : 'var(--mm-surface)', borderRadius: 8, padding: '8px 10px' }}>
                  <span style={{ fontWeight: 800 }}>Row {entry.i + 1} → Row {entry.j + 1}</span>
                  <span>Δx = {entry.dx || '—'}</span>
                  <span>Δy = {entry.dy || '—'}</span>
                  <span>rate = {entry.rate || '—'}</span>
                  {needsAttention ? (
                    <span role="status" style={{ color: 'var(--mm-error-text)', fontSize: 12, fontWeight: 900 }}>
                      {check.duplicate ? 'Check: repeated row pair' : `Check: ${fieldsToCheck.join(', ') || 'this interval'}`}
                    </span>
                  ) : null}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => editEvidence(index)} aria-label={`Edit interval between row ${entry.i + 1} and row ${entry.j + 1}`} style={{ ...button, minHeight: 32, padding: '4px 10px', color: 'var(--mm-primary-text)' }}>Edit</button>
                    <button type="button" onClick={() => removeEvidence(index)} aria-label={`Remove interval between row ${entry.i + 1} and row ${entry.j + 1}`} style={{ ...button, minHeight: 32, padding: '4px 9px' }}>Remove</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p style={{ color: 'var(--mm-text-subtle)' }}>No intervals recorded yet.</p>}
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
              style={{ ...button, background: classification === option ? '#1a73e8' : 'var(--mm-surface)', color: classification === option ? '#fff' : 'var(--mm-text-strong)', opacity: readyToClassify ? 1 : 0.5 }}
            >
              {option === 'linear' ? 'Constant rate (linear)' : 'Not a constant rate (nonlinear)'}
            </button>
          ))}
        </div>
        {!readyToClassify ? <p style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>Record {requiredComparisons - distinctPairCount} more interval(s) before classifying.</p> : null}
      </Panel>

      {mode === 'repairValue' ? (
        <Panel title="Repair the table">
          <p style={{ marginTop: 0, color: 'var(--mm-text)' }}>One row breaks the pattern. Tap the offending row above, then enter its corrected y-value.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Offending row</span>
              <select style={input} value={repairRowIndex ?? ''} onChange={(event) => { setRepairRowIndex(event.target.value === '' ? null : Number(event.target.value)); clearFeedback(); }}>
                <option value="">Choose a row…</option>
                {rows.map((row, index) => <option key={index} value={index}>Row {index + 1}: ({formatCoord(row.x)}, {formatCoord(row.y)})</option>)}
              </select>
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Corrected y-value</span>
              <input style={input} {...FRACTION_ENTRY_PROPS} value={repairedValue} onChange={(event) => { setRepairedValue(event.target.value); clearFeedback(); }} aria-label="Corrected y-value for the offending row" />
            </label>
          </div>
        </Panel>
      ) : null}

      {mode === 'deriveEquation' ? (
        <Panel title="Determine the equation">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>m</span>
              <input style={input} {...FRACTION_ENTRY_PROPS} value={m} onChange={(event) => { setM(event.target.value); clearFeedback(); }} aria-label="Slope m" />
            </label>
            <label>
              <span style={{ fontWeight: 800, fontSize: 13 }}>b</span>
              <input style={input} {...FRACTION_ENTRY_PROPS} value={b} onChange={(event) => { setB(event.target.value); clearFeedback(); }} aria-label="y-intercept b" />
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
      {notice ? <p role="status" style={{ color: 'var(--mm-text-muted)' }}>{notice} <button type="button" onClick={undo}>Restore</button></p> : null}
      {feedback && !feedback.isCorrect && feedbackGuidance ? (
        <p role="status" style={{ color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>
          <strong>Where to check:</strong> {feedbackGuidance} MathMaster points you to the location of the issue without giving away the correct value.
        </p>
      ) : null}
    </ToolShell>
  );
}
