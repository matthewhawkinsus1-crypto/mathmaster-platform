import React, { useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import CoordinatePlane from '../shared/CoordinatePlane';
import { intervalTruth, pairKey } from '../linearTableWorkbench/linearTableWorkbenchMath.js';
import { choiceBankFor, EXPRESSION_MEANING_DIMENSIONS } from '../expressionMeaning/expressionMeaningMath.js';
import { formatLine, lineFromPoints } from '../graphing2/graphingMath.js';
import {
  bridgeMeaningQuestion,
  deriveLinearBridge,
  REPRESENTATION_BRIDGE_HIGHLIGHTS,
  resolveFeedbackTiming,
  resolveGraphBounds,
  resolveRequiredStages,
  scoreRepresentationBridge,
} from './representationBridgeMath.js';

const button = { minHeight: 42, padding: '9px 13px', borderRadius: 9, border: '1px solid #c9d6e8', background: '#fff', fontWeight: 800, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: 9, border: '1px solid #c9d6e8', borderRadius: 8, fontSize: 15 };
const formatCoord = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000));

const DIMENSION_LABEL = { unit: 'Unit', contextMeaning: 'Contextual meaning', mathRole: 'Mathematical role' };
const HIGHLIGHT_LABEL = { rate: 'RATE / SLOPE', start: 'START / Y-INTERCEPT', zero: 'ZERO / X-INTERCEPT' };
const MEANING_ROWS = ['rate', 'yIntercept', 'zero'];

const emptyState = {
  tableEvidence: [], studentSlope: '', rateConclusion: '',
  generalM: '', generalB: '', generalEquation: '',
  factoredA: '', factoredC: '', factoredEquation: '',
  graphPoints: [], meaningAssignments: {}, stageChecks: {},
  stagingDx: '', stagingDy: '', stagingRate: '',
};

// A highlight may only emphasize WHERE a concept lives, or the student's OWN
// value once they have legitimately produced it — never the hidden true
// value. `revealed` says, per concept, whether the student's own work for it
// is already individually correct.
const highlightBorder = (active, matches) => (active && matches ? '3px solid #b06000' : undefined);
const highlightBackground = (active, matches) => (active && matches ? '#fff6e5' : undefined);

export default function RepresentationBridge({ questionData = {}, onAction }) {
  const derived = useMemo(() => deriveLinearBridge(questionData), [questionData]);
  const requiredStages = useMemo(() => resolveRequiredStages(questionData), [questionData]);
  const feedbackTiming = resolveFeedbackTiming(questionData);
  const requiredComparisons = Math.max(1, Math.min(Number(questionData.requiredComparisons) || 3, (derived.rows.length * (derived.rows.length - 1)) / 2));
  const graphBounds = useMemo(() => resolveGraphBounds(questionData, derived), [questionData, derived]);
  const meaningQuestion = useMemo(() => ({
    ...bridgeMeaningQuestion(questionData),
    questionId: questionData.questionId || questionData.id || 'representationBridge',
  }), [questionData]);
  const context = questionData.context || {};

  const [tableEvidence, setTableEvidence] = usePersistentToolState('tableEvidence', []);
  const [studentSlope, setStudentSlope] = usePersistentToolState('studentSlope', '');
  const [rateConclusion, setRateConclusion] = usePersistentToolState('rateConclusion', '');
  const [generalM, setGeneralM] = usePersistentToolState('generalM', '');
  const [generalB, setGeneralB] = usePersistentToolState('generalB', '');
  const [generalEquation, setGeneralEquation] = usePersistentToolState('generalEquation', '');
  const [factoredA, setFactoredA] = usePersistentToolState('factoredA', '');
  const [factoredC, setFactoredC] = usePersistentToolState('factoredC', '');
  const [factoredEquation, setFactoredEquation] = usePersistentToolState('factoredEquation', '');
  const [graphPoints, setGraphPoints] = usePersistentToolState('graphPoints', []);
  const [meaningAssignments, setMeaningAssignments] = usePersistentToolState('meaningAssignments', {});
  const [stageChecks, setStageChecks] = usePersistentToolState('stageChecks', {});
  const [stagingDx, setStagingDx] = usePersistentToolState('stagingDx', '');
  const [stagingDy, setStagingDy] = usePersistentToolState('stagingDy', '');
  const [stagingRate, setStagingRate] = usePersistentToolState('stagingRate', '');

  // UI emphasis only — never mathematical answer state, so none of this
  // participates in the draft/undo history (see toolStatePersistence.js).
  const [selectedRows, setSelectedRows] = useState([]);
  const [activeHighlight, setActiveHighlight] = useState(null);
  const [activeMeaningRow, setActiveMeaningRow] = useState(MEANING_ROWS[0]);
  const [notice, setNotice] = useState('');
  const [redoDepth, setRedoDepth] = useState(0);
  const redoStackRef = useRef([]);

  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const response = useMemo(() => ({
    tableEvidence,
    studentSlope,
    rateConclusion,
    generalForm: { m: generalM, b: generalB, equation: generalEquation },
    factoredForm: { a: factoredA, c: factoredC, equation: factoredEquation },
    graphConstruction: { points: graphPoints },
    meaningAssignments,
  }), [tableEvidence, studentSlope, rateConclusion, generalM, generalB, generalEquation, factoredA, factoredC, factoredEquation, graphPoints, meaningAssignments]);

  // The SAME grading function submission uses, called on the current draft so
  // "guided"/"checkpoint" panels can show real feedback before Submit — never
  // a second, looser approximation of correctness.
  const liveResult = useMemo(() => scoreRepresentationBridge(questionData, response), [questionData, response]);

  // What is safe to reveal through a highlight: the student's own value for a
  // concept, once their work for it is independently correct. Never the
  // hidden target — a wrong or empty value never gets "corrected" by a
  // highlight either, it just is not shown yet.
  const stageRevealAllowed = (stage) => {
    if (feedbackTiming === 'guided') return true;
    if (feedbackTiming === 'checkpoint') return stageChecks[stage] === true;
    return Boolean(feedback);
  };
  const revealed = {
    rate: stageRevealAllowed('rateEvidence') && liveResult.parts.rateEvidence === true,
    start: stageRevealAllowed('generalForm') && liveResult.parts.generalForm === true,
    zero: stageRevealAllowed('factoredForm') && liveResult.parts.factoredForm === true,
  };

  // Staging Δx/Δy/rate values are draft-backed (they survive navigation and
  // refresh) but deliberately excluded from the undo snapshot, the same way
  // LinearTableWorkbench excludes them: they are typing-in-progress toward a
  // not-yet-recorded interval, not committed mathematical evidence, so every
  // keystroke there must not push an undo entry.
  const mathematicalState = useMemo(() => ({
    tableEvidence, studentSlope, rateConclusion, generalM, generalB, generalEquation,
    factoredA, factoredC, factoredEquation, graphPoints, meaningAssignments, stageChecks,
  }), [tableEvidence, studentSlope, rateConclusion, generalM, generalB, generalEquation, factoredA, factoredC, factoredEquation, graphPoints, meaningAssignments, stageChecks]);
  const mathematicalStateRef = useRef(mathematicalState);
  mathematicalStateRef.current = mathematicalState;

  const applyState = (next) => {
    const value = next || emptyState;
    setTableEvidence(value.tableEvidence || []);
    setStudentSlope(value.studentSlope || '');
    setRateConclusion(value.rateConclusion || '');
    setGeneralM(value.generalM || '');
    setGeneralB(value.generalB || '');
    setGeneralEquation(value.generalEquation || '');
    setFactoredA(value.factoredA || '');
    setFactoredC(value.factoredC || '');
    setFactoredEquation(value.factoredEquation || '');
    setGraphPoints(value.graphPoints || []);
    setMeaningAssignments(value.meaningAssignments || {});
    setStageChecks(value.stageChecks || {});
  };

  const undoHistory = useMathUndoHistory({
    label: 'Undo the last Representation Bridge change',
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
    clearRedo();
    applyState(emptyState);
    setSelectedRows([]);
    setStagingDx('');
    setStagingDy('');
    setStagingRate('');
    setNotice('Workspace cleared.');
    clearFeedback();
  };

  // --- Stage 1: table / rate evidence -------------------------------------
  const toggleRow = (index) => {
    clearFeedback();
    setSelectedRows((current) => {
      if (current.includes(index)) return current.filter((entry) => entry !== index);
      const next = [...current, index];
      return next.length > 2 ? next.slice(next.length - 2) : next;
    });
  };
  const [rowI, rowJ] = selectedRows.length === 2 ? selectedRows : [null, null];
  const truth = rowI != null && rowJ != null ? intervalTruth(derived.rows[rowI], derived.rows[rowJ]) : null;
  const currentPairKey = rowI != null && rowJ != null ? pairKey(rowI, rowJ) : null;
  const alreadyRecorded = currentPairKey != null && tableEvidence.some((entry) => pairKey(entry.i, entry.j) === currentPairKey);

  const recordInterval = () => {
    if (!truth || alreadyRecorded) return;
    clearRedo();
    setTableEvidence((current) => [...current, { i: rowI, j: rowJ, dx: stagingDx, dy: stagingDy, rate: stagingRate }]);
    setStagingDx(''); setStagingDy(''); setStagingRate('');
    setSelectedRows([]);
    clearFeedback();
  };
  const removeEvidence = (index) => {
    clearRedo();
    setTableEvidence((current) => current.filter((_, entryIndex) => entryIndex !== index));
    clearFeedback();
  };
  const distinctPairCount = new Set(tableEvidence.map((entry) => pairKey(entry.i, entry.j))).size;
  const readyToConclude = distinctPairCount >= requiredComparisons;

  // --- Stage 4: graph ------------------------------------------------------
  const graphRequiredPoints = 2;
  const studentGraphLine = useMemo(() => (graphPoints.length >= 2 ? lineFromPoints(graphPoints[0], graphPoints[1]) : null), [graphPoints]);
  const plotPoint = (point) => {
    clearFeedback();
    setGraphPoints((current) => (current.length >= graphRequiredPoints ? [point] : [...current, point]));
  };
  const moveGraphPoint = (index, point) => {
    clearFeedback();
    setGraphPoints((current) => current.map((existing, i) => (i === index ? point : existing)));
  };

  // --- Stage 5: meaning ------------------------------------------------------
  const assignMeaning = (rowId, dimension, value) => {
    clearFeedback();
    setMeaningAssignments((current) => ({ ...current, [rowId]: { ...current[rowId], [dimension]: value } }));
  };
  const meaningRowLabel = {
    rate: `m = ${studentSlope || generalM || '?'}`,
    yIntercept: `b = ${generalB || '?'}`,
    zero: `c = ${factoredC || '?'}`,
  };
  const meaningComplete = MEANING_ROWS.every((rowId) => {
    const given = meaningAssignments[rowId] || {};
    return EXPRESSION_MEANING_DIMENSIONS.every((dimension) => String(given[dimension] || '').trim());
  });

  // --- Checkpoint gating ------------------------------------------------------
  const checkStage = (stage) => {
    const passed = Boolean(liveResult.parts[stage]);
    setStageChecks((current) => ({ ...current, [stage]: passed }));
    setNotice(passed ? '' : 'That stage needs another look — nothing here has been auto-corrected.');
  };
  const stageBlocked = (stage) => {
    if (feedbackTiming !== 'checkpoint') return false;
    const order = ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'];
    const priorRequired = order.slice(0, order.indexOf(stage)).filter((entry) => requiredStages.includes(entry));
    return priorRequired.some((entry) => stageChecks[entry] !== true);
  };
  const readyToSubmit = feedbackTiming !== 'checkpoint' || requiredStages.every((stage) => stageChecks[stage] === true);

  const check = () => {
    submit(
      { isCorrect: liveResult.isCorrect, score: liveResult.score },
      response,
      { parts: liveResult.parts, evidence: liveResult.evidence, requiredStages },
    );
  };

  const highlightControls = (
    <div role="group" aria-label="Highlight a connection across every panel" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {REPRESENTATION_BRIDGE_HIGHLIGHTS.map((concept) => (
        <button
          key={concept}
          type="button"
          onClick={() => setActiveHighlight((current) => (current === concept ? null : concept))}
          aria-pressed={activeHighlight === concept}
          style={{ ...button, minHeight: 44, background: activeHighlight === concept ? '#b06000' : '#fff', color: activeHighlight === concept ? '#fff' : '#172033' }}
        >
          {HIGHLIGHT_LABEL[concept]}
        </button>
      ))}
    </div>
  );

  const gridTwoColumn = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginTop: 16 };

  return (
    <ToolShell
      title="Representation Bridge"
      subtitle="One linear relationship, five connected views: the table, the rate of change, general and factored equations, the graph, and what every part means. Work moves between panels; nothing here replaces the whole screen."
      badge="Connected linear representations"
    >
      <TaskCard
        question={questionData}
        task="Build the same linear relationship across every representation, then check that they all agree."
        steps={[
          'Table: select two rows, compute Δx, Δy, and the rate yourself, and record it. Repeat, then conclude whether the rate is constant and state m.',
          'General form: write y = mx + b using the b you determine yourself.',
          'Factored form: rewrite your equation as y = a(x − c).',
          'Graph: plot the x-intercept from your factored form, then a second point using the slope.',
          'Meaning: connect m, b, and c to their units, contextual meanings, and mathematical roles.',
        ]}
        note="Use the highlight buttons below to see how one concept — rate, start, or zero — shows up in every panel at once."
      />

      {highlightControls}

      <Panel title="Context">
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px' }}>
          {context.inputLabel ? (<><dt style={{ color: '#5f6b7a', fontSize: 13 }}>Input</dt><dd style={{ margin: 0 }}>{context.inputLabel}{context.inputUnit ? ` (${context.inputUnit})` : ''}</dd></>) : null}
          {context.outputLabel ? (<><dt style={{ color: '#5f6b7a', fontSize: 13 }}>Output</dt><dd style={{ margin: 0 }}>{context.outputLabel}{context.outputUnit ? ` (${context.outputUnit})` : ''}</dd></>) : null}
        </dl>
      </Panel>

      <div style={gridTwoColumn}>
        <Panel title={`Table & rate of change (${derived.rows.length} rows)`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 12 }}>
            {derived.rows.map((row, index) => {
              const selected = selectedRows.includes(index);
              const startMatch = activeHighlight === 'start' && revealed.start && Math.abs(row.x) < 1e-9;
              const zeroMatch = activeHighlight === 'zero' && revealed.zero && Math.abs(row.y) < 1e-9;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleRow(index)}
                  aria-pressed={selected}
                  aria-label={`Row ${index + 1}: x equals ${formatCoord(row.x)}, y equals ${formatCoord(row.y)}`}
                  style={{
                    ...button, minHeight: 54,
                    border: selected ? '3px solid #1a73e8' : highlightBorder(true, startMatch || zeroMatch) || '1px solid #c9d6e8',
                    background: selected ? '#eef4ff' : highlightBackground(true, startMatch || zeroMatch) || '#fff',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#5f6b7a', fontWeight: 700 }}>Row {index + 1}</div>
                  <div>({formatCoord(row.x)}, {formatCoord(row.y)})</div>
                </button>
              );
            })}
          </div>

          {truth ? (
            <div style={{ border: '1px solid #dde5f0', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Interval: Row {rowI + 1} → Row {rowJ + 1}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
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
            </div>
          ) : selectedRows.length === 1 ? <p style={{ color: '#5f6b7a' }}>Row {selectedRows[0] + 1} selected. Tap a second row to form an interval.</p> : null}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Recorded intervals ({tableEvidence.length}, need {requiredComparisons})</div>
            {tableEvidence.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {tableEvidence.map((entry, index) => {
                  const rateMatch = activeHighlight === 'rate';
                  return (
                    <li key={`${entry.i}-${entry.j}`} style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid #dde5f0', borderRadius: 8, padding: '7px 9px',
                      borderColor: highlightBorder(true, rateMatch) ? '#b06000' : undefined,
                      background: highlightBackground(true, rateMatch),
                    }}>
                      <span style={{ fontWeight: 800 }}>Row {entry.i + 1} → Row {entry.j + 1}</span>
                      <span>Δx = {entry.dx || '—'}</span>
                      <span>Δy = {entry.dy || '—'}</span>
                      <span>rate = {entry.rate || '—'}</span>
                      <button type="button" onClick={() => removeEvidence(index)} aria-label={`Remove interval between row ${entry.i + 1} and row ${entry.j + 1}`} style={{ ...button, marginLeft: 'auto', minHeight: 32, padding: '4px 9px' }}>×</button>
                    </li>
                  );
                })}
              </ul>
            ) : <p style={{ color: '#80868b', margin: 0 }}>No intervals recorded yet.</p>}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {['constant', 'not constant'].map((option) => (
              <button
                key={option}
                type="button"
                disabled={!readyToConclude}
                onClick={() => { setRateConclusion(option); clearFeedback(); }}
                aria-pressed={rateConclusion === option}
                style={{ ...button, background: rateConclusion === option ? '#1a73e8' : '#fff', color: rateConclusion === option ? '#fff' : '#172033', opacity: readyToConclude ? 1 : 0.5 }}
              >
                {option === 'constant' ? 'The rate is constant' : 'The rate is not constant'}
              </button>
            ))}
          </div>
          {!readyToConclude ? <p style={{ color: '#5f6b7a', fontSize: 13 }}>Record {requiredComparisons - distinctPairCount} more interval(s) before concluding.</p> : null}

          <label style={{ display: 'block', maxWidth: 220 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: highlightBorder(true, activeHighlight === 'rate') ? '#b06000' : undefined }}>m (your slope)</span>
            <input style={{ ...input, border: highlightBorder(true, activeHighlight === 'rate') || input.border }} inputMode="decimal" value={studentSlope} onChange={(event) => { setStudentSlope(event.target.value); clearFeedback(); }} aria-label="Your slope m" />
          </label>

          {feedbackTiming !== 'submitOnly' ? (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => checkStage('rateEvidence')} disabled={!requiredStages.includes('rateEvidence')} style={{ ...button }}>Check this stage</button>
              {stageChecks.rateEvidence != null ? <ResultPill ok={stageChecks.rateEvidence}>{stageChecks.rateEvidence ? 'Rate evidence correct' : 'Needs another look'}</ResultPill> : null}
            </div>
          ) : null}
        </Panel>

        <Panel title="Equations">
          <div style={{ border: '1px solid #dde5f0', borderRadius: 10, padding: 12, marginBottom: 12, opacity: stageBlocked('generalForm') ? 0.7 : 1 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>General form: y = mx + b</div>
            {stageBlocked('generalForm') ? <p style={{ color: '#7a4f01', fontSize: 13 }}>Check the table/rate stage first.</p> : null}
            <p style={{ fontSize: 13, color: '#5f6b7a', margin: '0 0 8px' }}>Your slope from the table stage: <strong>{studentSlope || '—'}</strong>. Determine b yourself — it is never filled in for you.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
              <label>
                <span style={{ fontWeight: 800, fontSize: 13, color: highlightBorder(true, activeHighlight === 'rate') ? '#b06000' : undefined }}>m</span>
                <input style={{ ...input, border: highlightBorder(true, activeHighlight === 'rate') || input.border }} inputMode="decimal" value={generalM} disabled={stageBlocked('generalForm')} onChange={(event) => { setGeneralM(event.target.value); clearFeedback(); }} aria-label="Slope m in general form" />
              </label>
              <label>
                <span style={{ fontWeight: 800, fontSize: 13, color: highlightBorder(true, activeHighlight === 'start') ? '#b06000' : undefined }}>b {revealed.start && activeHighlight === 'start' ? `(= ${generalB})` : ''}</span>
                <input style={{ ...input, border: highlightBorder(true, activeHighlight === 'start') || input.border }} inputMode="decimal" value={generalB} disabled={stageBlocked('generalForm')} onChange={(event) => { setGeneralB(event.target.value); clearFeedback(); }} aria-label="y-intercept b in general form" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>Equation</span>
                <input style={input} value={generalEquation} disabled={stageBlocked('generalForm')} onChange={(event) => { setGeneralEquation(event.target.value); clearFeedback(); }} placeholder="y = mx + b" aria-label="Equation in general/slope-intercept form" />
              </label>
            </div>
            {feedbackTiming !== 'submitOnly' ? (
              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={() => checkStage('generalForm')} disabled={!requiredStages.includes('generalForm') || stageBlocked('generalForm')} style={{ ...button }}>Check this stage</button>
                {stageChecks.generalForm != null ? <ResultPill ok={stageChecks.generalForm}>{stageChecks.generalForm ? 'General form correct' : 'Needs another look'}</ResultPill> : null}
              </div>
            ) : null}
          </div>

          <div style={{ border: '1px solid #dde5f0', borderRadius: 10, padding: 12, opacity: stageBlocked('factoredForm') ? 0.7 : 1 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Factored linear form: y = a(x − c)</div>
            {stageBlocked('factoredForm') ? <p style={{ color: '#7a4f01', fontSize: 13 }}>Check the general form stage first.</p> : null}
            <p style={{ fontSize: 13, color: '#5f6b7a', margin: '0 0 8px' }}>Rewrite your own general-form equation: a is the rate, c is the zero/x-intercept.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
              <label>
                <span style={{ fontWeight: 800, fontSize: 13, color: highlightBorder(true, activeHighlight === 'rate') ? '#b06000' : undefined }}>a</span>
                <input style={{ ...input, border: highlightBorder(true, activeHighlight === 'rate') || input.border }} inputMode="decimal" value={factoredA} disabled={stageBlocked('factoredForm')} onChange={(event) => { setFactoredA(event.target.value); clearFeedback(); }} aria-label="Coefficient a in factored form" />
              </label>
              <label>
                <span style={{ fontWeight: 800, fontSize: 13, color: highlightBorder(true, activeHighlight === 'zero') ? '#b06000' : undefined }}>c {revealed.zero && activeHighlight === 'zero' ? `(= ${factoredC})` : ''}</span>
                <input style={{ ...input, border: highlightBorder(true, activeHighlight === 'zero') || input.border }} inputMode="decimal" value={factoredC} disabled={stageBlocked('factoredForm')} onChange={(event) => { setFactoredC(event.target.value); clearFeedback(); }} aria-label="Zero c in factored form" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>Equation</span>
                <input style={input} value={factoredEquation} disabled={stageBlocked('factoredForm')} onChange={(event) => { setFactoredEquation(event.target.value); clearFeedback(); }} placeholder="y = a(x - c)" aria-label="Equation in factored linear form" />
              </label>
            </div>
            {feedbackTiming !== 'submitOnly' ? (
              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={() => checkStage('factoredForm')} disabled={!requiredStages.includes('factoredForm') || stageBlocked('factoredForm')} style={{ ...button }}>Check this stage</button>
                {stageChecks.factoredForm != null ? <ResultPill ok={stageChecks.factoredForm}>{stageChecks.factoredForm ? 'Factored form correct' : 'Needs another look'}</ResultPill> : null}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div style={gridTwoColumn}>
        <Panel title="Graph">
          {stageBlocked('graph') ? <p style={{ color: '#7a4f01', fontSize: 13 }}>Check the factored form stage first.</p> : null}
          <p style={{ fontSize: 13, color: '#5f6b7a' }}>Plot the x-intercept from your factored form, then a second point using the slope. {activeHighlight === 'zero' ? 'Highlighted: the x-intercept is where the line crosses the x-axis.' : ''} {activeHighlight === 'start' ? 'Highlighted: the y-intercept is where the line crosses the y-axis.' : ''}</p>
          <CoordinatePlane
            {...graphBounds}
            onPlot={stageBlocked('graph') ? undefined : plotPoint}
            onMovePoint={stageBlocked('graph') ? undefined : moveGraphPoint}
            viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
            snapStep={Number.isInteger(derived.m) && Number.isInteger(derived.zero) ? 1 : 0.5}
            points={graphPoints.map((point, index) => ({ x: point[0], y: point[1], label: `P${index + 1}`, fill: '#1a73e8' }))}
            lines={studentGraphLine?.kind === 'slopeIntercept' ? [{ m: studentGraphLine.m, b: studentGraphLine.b, stroke: '#1a73e8' }] : []}
            cursorLabel="Plot"
            ariaLabel="Coordinate plane for the graph representation"
            enlargeable={false}
          />
          <p style={{ margin: '8px 0 0', color: '#3c4756', fontWeight: 700 }}>Your line: {studentGraphLine ? formatLine(studentGraphLine) : 'Plot two different points'}</p>
          {feedbackTiming !== 'submitOnly' ? (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => checkStage('graph')} disabled={!requiredStages.includes('graph') || stageBlocked('graph')} style={{ ...button }}>Check this stage</button>
              {stageChecks.graph != null ? <ResultPill ok={stageChecks.graph}>{stageChecks.graph ? 'Graph correct' : 'Needs another look'}</ResultPill> : null}
            </div>
          ) : null}
        </Panel>

        <Panel title="What the parts mean">
          {stageBlocked('meaning') ? <p style={{ color: '#7a4f01', fontSize: 13 }}>Check the graph stage first.</p> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {MEANING_ROWS.map((rowId) => {
              const given = meaningAssignments[rowId] || {};
              const complete = EXPRESSION_MEANING_DIMENSIONS.every((dimension) => String(given[dimension] || '').trim());
              const highlightKey = rowId === 'rate' ? 'rate' : rowId === 'yIntercept' ? 'start' : 'zero';
              return (
                <button
                  key={rowId}
                  type="button"
                  onClick={() => setActiveMeaningRow(rowId)}
                  disabled={stageBlocked('meaning')}
                  aria-pressed={activeMeaningRow === rowId}
                  aria-label={`Edit the meaning of ${meaningRowLabel[rowId]}`}
                  style={{
                    ...button, minHeight: 44,
                    border: activeMeaningRow === rowId ? '3px solid #1a73e8' : highlightBorder(true, activeHighlight === highlightKey) || '1px solid #c9d6e8',
                    background: complete ? '#e6f4ea' : (highlightBackground(true, activeHighlight === highlightKey) || '#fff'),
                  }}
                >
                  {meaningRowLabel[rowId]}
                </button>
              );
            })}
          </div>
          {EXPRESSION_MEANING_DIMENSIONS.map((dimension) => {
            const bank = choiceBankFor(meaningQuestion, dimension);
            const currentValue = meaningAssignments[activeMeaningRow]?.[dimension] || '';
            return (
              <div key={dimension} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{DIMENSION_LABEL[dimension]}</div>
                <div role="group" aria-label={DIMENSION_LABEL[dimension]} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {bank.map((option) => {
                    const selected = currentValue === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => assignMeaning(activeMeaningRow, dimension, option)}
                        disabled={stageBlocked('meaning')}
                        aria-pressed={selected}
                        style={{ ...button, minHeight: 44, background: selected ? '#1a73e8' : '#fff', color: selected ? '#fff' : '#172033' }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {feedbackTiming !== 'submitOnly' ? (
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => checkStage('meaning')} disabled={!requiredStages.includes('meaning') || !meaningComplete || stageBlocked('meaning')} style={{ ...button }}>Check this stage</button>
              {stageChecks.meaning != null ? <ResultPill ok={stageChecks.meaning}>{stageChecks.meaning ? 'Meaning connections correct' : 'Needs another look'}</ResultPill> : null}
            </div>
          ) : null}
        </Panel>
      </div>

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={undo} disabled={!undoHistory.canUndo} style={{ ...button }} aria-label="Undo">↶ Undo</button>
        <button type="button" onClick={redo} disabled={!redoDepth} style={{ ...button }} aria-label="Redo">↷ Redo</button>
        <button type="button" onClick={startOver} style={{ ...button }}>Start over</button>
        <button
          className="representation-bridge-submit"
          data-primary-answer-action="true"
          type="button"
          onClick={check}
          disabled={!readyToSubmit}
          style={{ ...button, background: readyToSubmit ? '#1a73e8' : '#dadce0', color: readyToSubmit ? '#fff' : '#5f6368', border: 0 }}
        >
          Submit the bridge
        </button>
        {feedback ? <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Every representation agrees' : 'Some representations need another look'}</ResultPill> : null}
      </div>
      {feedbackTiming === 'checkpoint' && !readyToSubmit ? <p style={{ color: '#5f6b7a', fontSize: 13 }}>Check every required stage above before submitting the whole bridge.</p> : null}
      {notice ? <p role="status" style={{ color: '#5f6b7a' }}>{notice}</p> : null}
      {feedback && !feedback.isCorrect ? (
        <ul style={{ color: '#5f6b7a', lineHeight: 1.55 }}>
          {Object.entries(feedback.metadata?.parts || {}).filter(([, ok]) => !ok).map(([id]) => (
            <li key={id}>{id === 'crossRepresentationConsistency' ? 'Your representations do not all describe the same line — recheck them against each other.' : `Recheck: ${id}.`}</li>
          ))}
        </ul>
      ) : null}
    </ToolShell>
  );
}
