import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import sequenceExplorerGrader from '../../../functions/shared/serverGrading/tools/sequenceExplorer.mjs';
import {
  compareSequencesAt,
  comparePlotCount,
  compareSpecsFromQuestion,
  fullBridgeTermCount,
  generateSequence,
  inferPlotSnapStep,
  missingTermCount,
  sequenceEvidenceCount,
  sequenceSpecFromQuestion,
  sequenceStudentActions,
  sequenceTerm,
} from './sequenceMath';
import { FRACTION_ENTRY_PROPS } from '../../platform/interaction/numberEntry.js';

/*
 * Every Check is marked by the shared grader
 * (functions/shared/serverGrading/tools/sequenceExplorer.mjs) — the function
 * the server runs as the authority — through the same bounded bytes the
 * server reads. Each view reports the same `work` object it submits, so a
 * deadline can finalize the student's unsubmitted work.
 *
 * Where a view asks for a term (aₙ, a missing term, Sₙ, the comparison term),
 * it still evaluates that term while rendering: an index the sequence has no
 * term for (0, 2.5, NaN) fails before the screen draws, as it always has,
 * rather than showing a question that can never be answered.
 */
const inputStyle = { width: '100%', padding: 9, border: '1px solid var(--mm-tint-border)', borderRadius: 8, boxSizing: 'border-box' };
const actionStyle = { marginTop: 14, padding: '10px 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const numberText = (value) => `${round(value, 4)}`;

const graphBounds = (values = []) => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { yMin: -5, yMax: 5 };
  const dataLow = Math.min(...finite);
  const dataHigh = Math.max(...finite);
  const span = Math.max(4, dataHigh - dataLow);
  const margin = Math.max(2, span * 0.12);
  let low = dataLow - margin;
  let high = dataHigh + margin;

  // Include zero when the data naturally lives near it or crosses it, but do
  // not waste most of the graph on empty space. This matters for sequences
  // such as 125, 143, 161, ... where forcing y=0 made the actual points appear
  // in a tiny strip at the top of a dense grid.
  if (dataLow <= 0 && dataHigh >= 0) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  } else if (dataLow > 0 && dataLow <= span * 0.6) {
    low = 0;
  } else if (dataHigh < 0 && Math.abs(dataHigh) <= span * 0.6) {
    high = 0;
  }

  return { yMin: Math.floor(low), yMax: Math.ceil(high) };
};

function SequenceVisual({ spec, count = 7, title = 'Table + discrete graph' }) {
  const rows = generateSequence(spec, count);
  const bounds = graphBounds(rows.map((row) => row.value));
  return <Panel title={title}>
    <CoordinatePlane
      xMin={0}
      xMax={count + 1}
      yMin={bounds.yMin}
      yMax={bounds.yMax}
      points={rows.map((row) => ({ x: row.n, y: row.value, label: `a${row.n}` }))}
      enlargeable={false}
    />
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
        <thead><tr><th style={{ padding: 6 }}>n</th>{rows.map((row) => <th key={row.n} style={{ padding: 6 }}>{row.n}</th>)}</tr></thead>
        <tbody><tr><th style={{ padding: 6 }}>aₙ</th>{rows.map((row) => <td key={row.n} style={{ padding: 6, textAlign: 'center' }}>{numberText(row.value)}</td>)}</tr></tbody>
      </table>
    </div>
    <p style={{ marginBottom: 0, color: 'var(--mm-text-muted)' }}>A sequence is a function with discrete term-number inputs. The graph keeps those inputs visually separate.</p>
  </Panel>;
}

export default function SequenceExplorer({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'analyze';
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'fullBridge') return <FullSequenceBridge questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'ruleBridge') return <RuleBridge questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'missingTerm') return <MissingTerm questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'partialSum') return <PartialSum questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'compare') return <CompareSequences questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <AnalyzeSequence questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function AnalyzeSequence({ questionData, feedback, submit, onAction }) {
  const spec = sequenceSpecFromQuestion(questionData);
  const targetN = Number(questionData.targetN ?? 8);
  sequenceTerm(spec, targetN); // a target with no term fails before render (see top of file)
  const [kindAnswer, setKindAnswer] = usePersistentToolState('kindAnswer', '');
  const [changeAnswer, setChangeAnswer] = usePersistentToolState('changeAnswer', '');
  const [termAnswer, setTermAnswer] = usePersistentToolState('termAnswer', '');
  const mathState = useMemo(() => ({ kindAnswer, changeAnswer, termAnswer }), [kindAnswer, changeAnswer, termAnswer]);
  const restore = useCallback((value) => { setKindAnswer(value?.kindAnswer || ''); setChangeAnswer(value?.changeAnswer || ''); setTermAnswer(value?.termAnswer || ''); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last sequence answer edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });
  const work = { kindAnswer, changeAnswer, termAnswer };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(sequenceExplorerGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'analyze', targetN, parts: result.parts });
  };
  return <ToolShell title="Analyze the Sequence" subtitle="Connect the pattern, table, discrete graph, and term structure." badge="Pattern and terms">
    <TaskCard question={questionData} task={'Decide whether this sequence is arithmetic or geometric, then give its change and the requested term.'} steps={['Compare consecutive terms by subtracting, then by dividing.', 'Whichever stays constant tells you the type.', 'Use that constant to reach the requested term.']} />
    <EnlargeableFigure label="Sequence analysis workspace" enlargeLabel="Enlarge sequence workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, tableData: { label: 'Sequence table' }, equationInput: { label: 'Sequence analysis', studentState: true }, instruction: { text: 'Classify the pattern and find the requested term.' }, primaryActions: [{ id: 'check-analysis', label: 'Check analysis', onAction: check }] }}>
    <ToolGrid min={340}>
      <SequenceVisual spec={spec} count={sequenceEvidenceCount(questionData.displayCount ?? 7, targetN, { revealTarget: questionData.revealTargetTerm === true })} />
      <Panel title="Analyze the pattern">
        <label>Sequence family<select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="arithmetic">Arithmetic</option><option value="geometric">Geometric</option></select></label>
        <label style={{ display: 'block', marginTop: 10 }}>Common {kindAnswer === 'arithmetic' ? 'difference' : kindAnswer === 'geometric' ? 'ratio' : 'change'}<input value={changeAnswer} onChange={(event) => setChangeAnswer(event.target.value)} {...FRACTION_ENTRY_PROPS} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>a<sub>{targetN}</sub><input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} {...FRACTION_ENTRY_PROPS} style={inputStyle} /></label>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}>Check analysis</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Pattern, common change, and target term all agree.' : 'Use equal differences for arithmetic sequences and equal ratios for geometric sequences.'}</ResultPill></div> : null}
      <HintPanel hints={['Look at how each term becomes the next one. Adding the same amount every time is arithmetic; multiplying by the same amount is geometric.', 'Subtract each term from the one after it. If you always get the same number, that number is the common difference.', 'If subtraction does not give a constant, try dividing instead — a constant ratio means geometric.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid></EnlargeableFigure>
  </ToolShell>;
}


function FullSequenceBridge({ questionData, feedback, submit, onAction }) {
  const spec = sequenceSpecFromQuestion(questionData);
  const actions = sequenceStudentActions(questionData);
  const targetN = Number(questionData.targetN || 0);
  const count = fullBridgeTermCount(questionData);
  const rows = generateSequence(spec, count);
  const bounds = graphBounds(rows.map((row) => row.value));
  const plotSnapStep = inferPlotSnapStep(rows, questionData.plotSnapStep);

  const requireTable = actions.includes('buildSequenceTable');
  const requirePlot = actions.includes('plotSequence');
  const requireAnalyze = actions.includes('analyzeSequence');
  const requireExplicit = actions.includes('writeExplicit');
  const requireRecursive = actions.includes('writeRecursive');
  const requireTarget = actions.includes('findSequenceTerm') && targetN > 0;

  const [tableValues, setTableValues] = usePersistentToolState('tableValues', () => rows.map(() => ''));
  const [plottedPoints, setPlottedPoints] = usePersistentToolState('plottedPoints', []);
  const [plotMessage, setPlotMessage] = useState('');
  const [kindAnswer, setKindAnswer] = usePersistentToolState('kindAnswer', '');
  const [changeAnswer, setChangeAnswer] = usePersistentToolState('changeAnswer', '');
  const [explicitRule, setExplicitRule] = usePersistentToolState('explicitRule', '');
  const [recursiveFirst, setRecursiveFirst] = usePersistentToolState('recursiveFirst', '');
  const [recursiveRule, setRecursiveRule] = usePersistentToolState('recursiveRule', '');
  const [termAnswer, setTermAnswer] = usePersistentToolState('termAnswer', '');

  const mathState = useMemo(() => ({
    tableValues, plottedPoints, kindAnswer, changeAnswer, explicitRule,
    recursiveFirst, recursiveRule, termAnswer,
  }), [tableValues, plottedPoints, kindAnswer, changeAnswer, explicitRule, recursiveFirst, recursiveRule, termAnswer]);
  const restoreMathState = useCallback((previous) => {
    setTableValues(previous?.tableValues || rows.map(() => ''));
    setPlottedPoints(previous?.plottedPoints || []);
    setKindAnswer(previous?.kindAnswer || '');
    setChangeAnswer(previous?.changeAnswer || '');
    setExplicitRule(previous?.explicitRule || '');
    setRecursiveFirst(previous?.recursiveFirst || '');
    setRecursiveRule(previous?.recursiveRule || '');
    setTermAnswer(previous?.termAnswer || '');
  }, [rows]);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last sequence edit', state: mathState,
    onRestore: restoreMathState, resetKey: questionUndoResetKey(questionData),
  });

  const handlePlot = (point) => {
    const rawN = Number(point?.[0]);
    const value = Number(point?.[1]);
    const n = Math.round(rawN);
    if (!Number.isFinite(rawN) || !Number.isFinite(value) || Math.abs(rawN - n) > 1e-7 || n < 1 || n > count) {
      setPlotMessage(`Sequence inputs are whole-number term positions from n = 1 through n = ${count}.`);
      return;
    }
    setPlotMessage('');
    setPlottedPoints((current) => {
      const withoutSameInput = current.filter((entry) => Number(entry[0]) !== n);
      return [...withoutSameInput, [n, value]].sort((left, right) => Number(left[0]) - Number(right[0]));
    });
  };

  const work = {
    tableValues,
    plottedPoints,
    kindAnswer,
    changeAnswer,
    explicitRule,
    recursiveFirst,
    recursiveRule,
    termAnswer,
  };
  useReportToolWork(work);

  const check = () => {
    const result = gradeToolCheck(sequenceExplorerGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      {
        mode: 'fullBridge',
        targetN: requireTarget ? targetN : null,
        representationCount: count,
        parts: result.parts,
      },
    );
  };

  const taskSteps = [
    requireTable && 'Build the table so the term number n is the input and aₙ is the output.',
    requirePlot && 'Plot the ordered pairs (n, aₙ) as separate discrete points.',
    requireAnalyze && 'Classify the pattern and identify its common difference or ratio.',
    (requireExplicit || requireRecursive) && 'Write the sequence rules, not just the constants in a template.',
    requireTarget && `Use your explicit rule to determine a₍${targetN}₎ without extending every intermediate term.`,
  ].filter(Boolean);

  return <ToolShell title="Build the Sequence Model" subtitle="Keep the table, discrete graph, pattern, and rules connected in one piece of work." badge="Integrated sequence model">
    <TaskCard
      question={questionData}
      task="Build the sequence as a discrete function, then use the same connected representations to complete the requested analysis."
      steps={taskSteps}
    />
    <EnlargeableFigure
      label="Sequence workspace"
      enlargeLabel="Enlarge sequence workspace"
      taskText={questionData.prompt || 'Build the complete sequence model.'}
      style={{ width: '100%' }}
      capabilities={{
        undo: undoHistory.capability,
        tableData: { label: 'Sequence table', studentState: true },
        pointEditing: { label: 'Plot sequence points', studentState: true },
        equationInput: { label: 'Explicit and recursive rules', studentState: true },
        numericControls: { label: 'Sequence analysis', studentState: true },
        instruction: { text: taskSteps[0] || 'Complete the connected sequence representations.' },
        primaryActions: [{ id: 'check-sequence', label: 'Check complete model', onAction: check }],
      }}
    >
    <ToolGrid min={360}>
      <Panel title="1. Build the table and discrete graph">
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
            <thead>
              <tr>
                <th style={{ padding: 7, textAlign: 'left' }}>Domain input n</th>
                {rows.map((row) => <th key={row.n} style={{ padding: 7 }}>{row.n}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th style={{ padding: 7, textAlign: 'left' }}>Output aₙ</th>
                {rows.map((row, index) => (
                  <td key={row.n} style={{ padding: 5 }}>
                    <input
                      aria-label={`Sequence output a${row.n}`}
                      value={tableValues[index] ?? ''}
                      // One entry per row on screen: a draft saved when the
                      // table had fewer rows still lets every box be filled,
                      // and the grader reads every row.
                      onChange={(event) => setTableValues((current) => rows.map((_row, valueIndex) => (
                        valueIndex === index ? event.target.value : (current?.[valueIndex] ?? '')
                      )))}
                      {...FRACTION_ENTRY_PROPS}
                      style={{ ...inputStyle, minWidth: 72, textAlign: 'center' }}
                      disabled={!requireTable}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', lineHeight: 1.45 }}>
          The term number <strong>n is the domain input</strong>. Each sequence value aₙ is the output paired with that input.
          A sequence graph is discrete, so plot only the individual ordered pairs — do not connect them.
        </p>
        <CoordinatePlane
          xMin={0}
          xMax={count + 1}
          yMin={bounds.yMin}
          yMax={bounds.yMax}
          points={plottedPoints.map(([x, y]) => ({ x, y, label: `(${numberText(x)}, ${numberText(y)})` }))}
          onPlot={requirePlot ? handlePlot : null}
          // A sequence point belongs to its term position, and handlePlot
          // already replaces whatever sits at the n a point lands on. So a drag
          // is just a re-plot at the new spot — no index bookkeeping needed.
          onMovePoint={requirePlot ? (index, point) => handlePlot(point) : null}
          viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
          snapStep={plotSnapStep}
          cursorLabel="Sequence point"
          ariaLabel="Discrete sequence graph"
          enlargeable={false}
        />
        {requirePlot && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setPlottedPoints([])}
              disabled={!plottedPoints.length}
              style={{ ...actionStyle, marginTop: 0, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)' }}
            >
              Clear graph
            </button>
            <span style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>{plottedPoints.length}/{rows.length} term inputs plotted</span>
          </div>
        )}
        {plotMessage && <p style={{ margin: '8px 0 0', color: 'var(--mm-warning-text)', fontWeight: 700 }}>{plotMessage}</p>}
      </Panel>

      <Panel title="2. Analyze and write the rules">
        {requireAnalyze && <>
          <label>
            Sequence family
            <select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}>
              <option value="">Choose…</option>
              <option value="arithmetic">Arithmetic</option>
              <option value="geometric">Geometric</option>
            </select>
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Common {kindAnswer === 'arithmetic' ? 'difference' : kindAnswer === 'geometric' ? 'ratio' : 'change'}
            <input value={changeAnswer} onChange={(event) => setChangeAnswer(event.target.value)} {...FRACTION_ENTRY_PROPS} style={inputStyle} />
          </label>
        </>}

        {requireExplicit && (
          <label style={{ display: 'block', marginTop: 16 }}>
            Explicit rule
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <strong style={{ fontSize: 20 }}>aₙ =</strong>
              <input
                value={explicitRule}
                onChange={(event) => setExplicitRule(event.target.value)}
                placeholder={spec.kind === 'arithmetic' ? 'Write an expression in n' : 'Write an exponential expression in n'}
                style={inputStyle}
              />
            </div>
          </label>
        )}

        {requireRecursive && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Recursive rule</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 18 }}>a₁ =</strong>
                <input value={recursiveFirst} onChange={(event) => setRecursiveFirst(event.target.value)} {...FRACTION_ENTRY_PROPS} style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 18 }}>aₙ =</strong>
                <input
                  value={recursiveRule}
                  onChange={(event) => setRecursiveRule(event.target.value)}
                  placeholder="Use aₙ₋₁ in your rule"
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        )}

        {requireTarget && (
          <label style={{ display: 'block', marginTop: 16 }}>
            Use the rule to find a<sub>{targetN}</sub>
            <input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} {...FRACTION_ENTRY_PROPS} style={inputStyle} />
          </label>
        )}

        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}>Check the complete sequence model</button>
        {feedback ? <div style={{ marginTop: 12 }}>
          <ResultPill ok={feedback.isCorrect}>
            {feedback.isCorrect
              ? 'Your table, discrete graph, pattern, formulas, and requested term all describe the same sequence.'
              : 'Keep every representation consistent: n is the table/graph input, the plotted points must match the table, and both rules must generate those same outputs.'}
          </ResultPill>
        </div> : null}
        <HintPanel
          hints={[
            'Start with the table: n = 1, 2, 3, … are the domain inputs. Generate the matching sequence outputs before you graph anything.',
            'Every point on the graph should be (term number, term value). Sequence graphs use separate points because n takes whole-number positions.',
            spec.kind === 'arithmetic'
              ? 'For an arithmetic sequence, an explicit rule can be written as aₙ = a₁ + (n − 1)d. The recursive rule starts at a₁ and adds d to the previous term.'
              : 'For a geometric sequence, an explicit rule can be written as aₙ = a₁(r)ⁿ⁻¹. The recursive rule starts at a₁ and multiplies the previous term by r.',
          ]}
          onHintUsed={() => onAction?.("HINT_USED")}
        />
      </Panel>
    </ToolGrid>
    </EnlargeableFigure>
  </ToolShell>;
}

function RuleBridge({ questionData, feedback, submit, onAction }) {
  const spec = sequenceSpecFromQuestion(questionData);
  const [explicitRule, setExplicitRule] = usePersistentToolState('explicitRule', '');
  const [recursiveFirst, setRecursiveFirst] = usePersistentToolState('recursiveFirst', '');
  const [recursiveRule, setRecursiveRule] = usePersistentToolState('recursiveRule', '');
  const mathState = useMemo(() => ({ explicitRule, recursiveFirst, recursiveRule }), [explicitRule, recursiveFirst, recursiveRule]);
  const restore = useCallback((value) => { setExplicitRule(value?.explicitRule || ''); setRecursiveFirst(value?.recursiveFirst || ''); setRecursiveRule(value?.recursiveRule || ''); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last rule edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });
  const work = { explicitRule, recursiveFirst, recursiveRule };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(sequenceExplorerGrader, questionData, work);
    // The sequence family is not reported: other views grade it as an answer.
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'ruleBridge', parts: result.parts });
  };
  return <ToolShell title="Write the Sequence Rules" subtitle="Write complete explicit and recursive equations for the same sequence." badge="Recursive and explicit">
    <TaskCard
      question={questionData}
      task="Write the same sequence both explicitly and recursively."
      steps={[
        'The explicit equation must give aₙ directly from n.',
        'The recursive definition needs the starting value a₁ and a rule using aₙ₋₁.',
        'Both equations must generate the sequence shown.',
      ]}
    />
    <EnlargeableFigure label="Sequence rule workspace" enlargeLabel="Enlarge sequence workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, tableData: { label: 'Sequence evidence' }, equationInput: { label: 'Explicit and recursive equations', studentState: true }, instruction: { text: 'Write both rules for the same sequence.' }, primaryActions: [{ id: 'check-rules', label: 'Check both equations', onAction: check }] }}>
    <ToolGrid min={330}>
      <SequenceVisual spec={spec} count={6} title="Evidence from the sequence" />
      <Panel title="Write both equations">
        <label>
          Explicit rule
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <strong style={{ fontSize: 20 }}>aₙ =</strong>
            <input value={explicitRule} onChange={(event) => setExplicitRule(event.target.value)} placeholder="Write the full expression in n" style={inputStyle} />
          </div>
        </label>
        <div style={{ marginTop: 18, fontWeight: 800 }}>Recursive rule</div>
        <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <strong style={{ fontSize: 18 }}>a₁ =</strong>
          <input value={recursiveFirst} onChange={(event) => setRecursiveFirst(event.target.value)} {...FRACTION_ENTRY_PROPS} style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <strong style={{ fontSize: 18 }}>aₙ =</strong>
          <input value={recursiveRule} onChange={(event) => setRecursiveRule(event.target.value)} placeholder="Use aₙ₋₁ in your rule" style={inputStyle} />
        </label>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}>Check both equations</button>
        {feedback ? <div style={{ marginTop: 12 }}>
          <ResultPill ok={feedback.isCorrect}>
            {feedback.isCorrect
              ? 'Both equations generate the same sequence.'
              : 'Check the starting value, the previous-term rule, and the explicit expression in n.'}
          </ResultPill>
        </div> : null}
        <HintPanel
          hints={[
            'An explicit rule is a shortcut to any term. A recursive rule builds one term from the previous term.',
            spec.kind === 'arithmetic'
              ? 'Arithmetic: use aₙ = a₁ + (n − 1)d and aₙ = aₙ₋₁ + d.'
              : 'Geometric: use aₙ = a₁(r)ⁿ⁻¹ and aₙ = r·aₙ₋₁.',
            'You are writing the actual equations now — not just filling in A, D, or R.',
          ]}
          onHintUsed={() => onAction?.("HINT_USED")}
        />
      </Panel>
    </ToolGrid></EnlargeableFigure>
  </ToolShell>;
}

function MissingTerm({ questionData, feedback, submit, onAction }) {
  const spec = sequenceSpecFromQuestion(questionData);
  const missingIndex = Number(questionData.missingIndex ?? 4);
  const count = missingTermCount(questionData);
  const rows = generateSequence(spec, count);
  sequenceTerm(spec, missingIndex); // a gap with no term fails before render (see top of file)
  const [termAnswer, setTermAnswer] = usePersistentToolState('termAnswer', '');
  const [kindAnswer, setKindAnswer] = usePersistentToolState('kindAnswer', '');
  const mathState = useMemo(() => ({ termAnswer, kindAnswer }), [termAnswer, kindAnswer]);
  const restore = useCallback((value) => { setTermAnswer(value?.termAnswer || ''); setKindAnswer(value?.kindAnswer || ''); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last missing-term edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });
  const work = { termAnswer, kindAnswer };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(sequenceExplorerGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'missingTerm', missingIndex, parts: result.parts });
  };
  return <ToolShell title="Find the Missing Term" subtitle="Recover a missing term from the sequence pattern." badge="Sequence pattern">
    <TaskCard question={questionData} task={'Recover the missing term and say what kind of sequence this is.'} steps={['Look at the terms either side of the gap.', 'Work out the constant difference or ratio from terms you can see.', 'Apply it to fill the gap.']} />
    <EnlargeableFigure label="Missing term workspace" enlargeLabel="Enlarge sequence workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, tableData: { label: 'Sequence with a gap' }, numericControls: { label: 'Missing term controls', studentState: true }, instruction: { text: 'Recover the missing term and classify the sequence.' }, primaryActions: [{ id: 'check-missing', label: 'Check missing term', onAction: check }] }}>
    <ToolGrid min={320}>
      <Panel title="Sequence with a gap">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{rows.map((row) => <div key={row.n} style={{ minWidth: 66, padding: '10px 12px', textAlign: 'center', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: row.n === missingIndex ? 'var(--mm-warning-bg)' : 'var(--mm-surface)' }}><div style={{ fontSize: 11, color: 'var(--mm-text-muted)' }}>a{row.n}</div><strong>{row.n === missingIndex ? '?' : numberText(row.value)}</strong></div>)}</div>
        <p style={{ color: 'var(--mm-text-muted)' }}>Use the terms on both sides of the gap. A valid common change must work across the entire sequence.</p>
      </Panel>
      <Panel title="Recover the structure">
        <label>Missing value a<sub>{missingIndex}</sub><input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Sequence family<select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="arithmetic">Arithmetic</option><option value="geometric">Geometric</option></select></label>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}>Check missing term</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The missing term preserves the sequence structure.' : 'Check the common difference or ratio on both sides of the blank.'}</ResultPill></div> : null}
      <HintPanel hints={['The structure of a sequence does not change partway through, so terms you can see tell you about the ones you cannot.', 'Use two consecutive known terms to find the difference or the ratio.', 'Then step forward from the term before the gap using that same difference or ratio.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid></EnlargeableFigure>
  </ToolShell>;
}

function PartialSum({ questionData, feedback, submit, onAction }) {
  const spec = sequenceSpecFromQuestion(questionData);
  const sumN = Number(questionData.sumN ?? 6);
  sequenceTerm(spec, sumN); // a sum length with no last term fails before render (see top of file)
  const [lastTerm, setLastTerm] = usePersistentToolState('lastTerm', '');
  const [sumAnswer, setSumAnswer] = usePersistentToolState('sumAnswer', '');
  const mathState = useMemo(() => ({ lastTerm, sumAnswer }), [lastTerm, sumAnswer]);
  const restore = useCallback((value) => { setLastTerm(value?.lastTerm || ''); setSumAnswer(value?.sumAnswer || ''); }, []);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last finite-sum edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });
  const work = { lastTerm, sumAnswer };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(sequenceExplorerGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'partialSum', sumN, parts: result.parts });
  };
  return <ToolShell title="Find the Finite Sum" subtitle="Connect a sequence of terms to the finite series formed by adding them." badge="Finite series">
    <TaskCard question={questionData} task={'Find the last term of this finite sequence and the sum of all its terms.'} steps={['Extend the sequence to the requested number of terms.', 'Identify the last term.', 'Add all the terms, or use the appropriate sum formula.']} />
    <EnlargeableFigure label="Finite sequence workspace" enlargeLabel="Enlarge sequence workspace" style={{ width: '100%' }} capabilities={{ undo: undoHistory.capability, tableData: { label: 'Sequence evidence' }, numericControls: { label: 'Finite sum controls', studentState: true }, instruction: { text: `Find the last term and S${sumN}.` }, primaryActions: [{ id: 'check-sum', label: 'Check finite sum', onAction: check }] }}>
    <ToolGrid min={320}>
      <SequenceVisual spec={spec} count={sequenceEvidenceCount(7, sumN, { revealTarget: questionData.revealTargetTerm === true, cap: 7 })} title="Sequence evidence" />
      <Panel title={`Find S${sumN}`}>
        <p><strong>S<sub>{sumN}</sub> = a₁ + a₂ + ··· + a<sub>{sumN}</sub></strong></p>
        <label>Last included term a<sub>{sumN}</sub><input value={lastTerm} onChange={(event) => setLastTerm(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Partial sum S<sub>{sumN}</sub><input value={sumAnswer} onChange={(event) => setSumAnswer(event.target.value)} style={inputStyle} /></label>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}>Check finite sum</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The last term and finite sum are consistent.' : 'Find the correct final term first, then include every term from a₁ through it.'}</ResultPill></div> : null}
      <HintPanel hints={['A series is what you get when you add the terms of a sequence together.', 'Find the last term first — you need it before you can use most sum formulas.', 'For an arithmetic series the sum is the number of terms times the average of the first and last term.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid></EnlargeableFigure>
  </ToolShell>;
}

function CompareSequences({ questionData, feedback, submit, onAction }) {
  const { left, right } = compareSpecsFromQuestion(questionData);
  const actions = sequenceStudentActions(questionData);
  const requirePlot = actions.includes('plotSequence');
  const compareN = Number(questionData.compareN ?? 7);
  compareSequencesAt(left, right, compareN); // a comparison term that does not exist fails before render (see top of file)
  const leftLabel = questionData.leftLabel || 'Sequence A';
  const rightLabel = questionData.rightLabel || 'Sequence B';
  const plotCount = comparePlotCount(questionData);
  const leftRows = generateSequence(left, plotCount);
  const rightRows = generateSequence(right, plotCount);
  const bounds = graphBounds([...leftRows, ...rightRows].map((row) => row.value));
  const plotSnapStep = inferPlotSnapStep([...leftRows, ...rightRows], questionData.plotSnapStep);
  const [activeSeries, setActiveSeries] = usePersistentToolState('activeSeries', 'A');
  const [leftPlottedPoints, setLeftPlottedPoints] = usePersistentToolState('leftPlottedPoints', []);
  const [rightPlottedPoints, setRightPlottedPoints] = usePersistentToolState('rightPlottedPoints', []);
  const [plotMessage, setPlotMessage] = useState('');
  const [relation, setRelation] = usePersistentToolState('relation', '');
  const [difference, setDifference] = usePersistentToolState('difference', '');
  const mathState = useMemo(() => ({ activeSeries, leftPlottedPoints, rightPlottedPoints, relation, difference }),
    [activeSeries, leftPlottedPoints, rightPlottedPoints, relation, difference]);
  const restoreMathState = useCallback((previous) => {
    setActiveSeries(previous?.activeSeries || 'A');
    setLeftPlottedPoints(previous?.leftPlottedPoints || []);
    setRightPlottedPoints(previous?.rightPlottedPoints || []);
    setRelation(previous?.relation || '');
    setDifference(previous?.difference || '');
  }, []);
  const undoHistory = useMathUndoHistory({
    label: 'Undo the last sequence comparison edit', state: mathState,
    onRestore: restoreMathState, resetKey: questionUndoResetKey(questionData),
  });
  // Both plotted point sets travel with every comparison: when the question
  // requires plotting, the shared grader marks each against its own sequence.
  const work = { relation, difference, leftPlottedPoints, rightPlottedPoints };
  useReportToolWork(work);

  const handlePlot = (point) => {
    const rawN = Number(point?.[0]);
    const value = Number(point?.[1]);
    const n = Math.round(rawN);
    if (!Number.isFinite(rawN) || !Number.isFinite(value) || Math.abs(rawN - n) > 1e-7 || n < 1 || n > plotCount) {
      setPlotMessage('Sequence inputs are whole-number term positions from n = 1 through n = ' + plotCount + '.');
      return;
    }
    setPlotMessage('');
    const setPoints = activeSeries === 'A' ? setLeftPlottedPoints : setRightPlottedPoints;
    setPoints((current) => {
      const withoutSameInput = current.filter((entry) => Number(entry[0]) !== n);
      return [...withoutSameInput, [n, value]].sort((a, b) => Number(a[0]) - Number(b[0]));
    });
  };

  const check = () => {
    const result = gradeToolCheck(sequenceExplorerGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode: 'compare', compareN, plotRequired: requirePlot, plotCount: requirePlot ? plotCount : 0, parts: result.parts },
    );
  };

  const taskSteps = requirePlot
    ? [
        'Select Sequence A and plot its ordered pairs as discrete points.',
        'Select Sequence B and plot its ordered pairs on the same coordinate plane.',
        'Use the graphs and rules to compare both sequences at the requested term.',
        'Choose the larger term and give the absolute difference.',
      ]
    : [
        'Work out the requested term of each sequence separately.',
        'Compare the two values.',
        'Choose the relationship and give the difference.',
      ];

  const visiblePoints = requirePlot
    ? [
        ...leftPlottedPoints.map(([x, y]) => ({ x, y, fill: '#1a73e8', radius: 8 })),
        ...rightPlottedPoints.map(([x, y]) => ({ x, y, fill: '#d93025', radius: 5 })),
      ]
    : [
        ...leftRows.map((row) => ({ x: row.n, y: row.value, fill: '#1a73e8', radius: 8 })),
        ...rightRows.map((row) => ({ x: row.n, y: row.value, fill: '#d93025', radius: 5 })),
      ];
  return <ToolShell title="Compare the Sequences" subtitle="Compare additive and multiplicative growth at the same term number." badge="Growth comparison">
    <TaskCard
      question={questionData}
      task={requirePlot ? 'Plot both sequences as discrete functions, then compare them at the requested term number.' : 'Compare the two sequences at the given term number.'}
      steps={taskSteps}
    />
    <EnlargeableFigure label="Sequence comparison workspace" enlargeLabel="Enlarge sequence workspace"
      taskText={questionData.prompt || 'Compare both sequences.'} style={{ width: '100%' }}
      capabilities={{
        undo: undoHistory.capability,
        pointEditing: requirePlot ? { label: 'Plot both sequences', studentState: true } : null,
        tableData: { label: 'Sequence evidence' },
        numericControls: { label: 'Comparison controls', studentState: true },
        instruction: { text: taskSteps[0] },
        primaryActions: [{ id: 'check-comparison', label: 'Check comparison', onAction: check }],
      }}>
    <ToolGrid min={330}>
      <Panel title={requirePlot ? 'Plot the two sequences' : 'Two discrete models'}>
        {requirePlot && (
          <>
            <p style={{ marginTop: 0, color: 'var(--mm-text-muted)' }}>
              Choose a sequence, then click each ordered pair on the graph. Switching sequences changes which model receives the next point.
            </p>
            <div role="group" aria-label="Sequence to plot" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button
                type="button"
                aria-pressed={activeSeries === 'A'}
                onClick={() => setActiveSeries('A')}
                style={{
                  ...actionStyle,
                  marginTop: 0,
                  background: activeSeries === 'A' ? '#1a73e8' : 'var(--mm-surface)',
                  color: activeSeries === 'A' ? '#fff' : 'var(--mm-primary-text)',
                  border: '2px solid #1a73e8',
                }}
              >
                ● Plot {leftLabel}
              </button>
              <button
                type="button"
                aria-pressed={activeSeries === 'B'}
                onClick={() => setActiveSeries('B')}
                style={{
                  ...actionStyle,
                  marginTop: 0,
                  background: activeSeries === 'B' ? '#d93025' : 'var(--mm-surface)',
                  color: activeSeries === 'B' ? '#fff' : 'var(--mm-error-text)',
                  border: '2px solid #d93025',
                }}
              >
                ● Plot {rightLabel}
              </button>
            </div>
          </>
        )}
        <CoordinatePlane
          xMin={0}
          xMax={plotCount + 1}
          yMin={bounds.yMin}
          yMax={bounds.yMax}
          points={visiblePoints}
          onPlot={requirePlot ? handlePlot : null}
          // A sequence point belongs to its term position, and handlePlot
          // already replaces whatever sits at the n a point lands on. So a drag
          // is just a re-plot at the new spot — no index bookkeeping needed.
          onMovePoint={requirePlot ? (index, point) => handlePlot(point) : null}
          viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
          snapStep={plotSnapStep}
          cursorLabel={activeSeries === 'A' ? leftLabel + ' point' : rightLabel + ' point'}
          ariaLabel={requirePlot ? 'Interactive graph for plotting two discrete sequences' : 'Graph comparing two discrete sequences'}
          enlargeable={false}
        />
        <p><span style={{ color: 'var(--mm-primary)', fontWeight: 900 }}>● {leftLabel}</span> &nbsp; <span style={{ color: 'var(--mm-danger)', fontWeight: 900 }}>● {rightLabel}</span></p>
        {requirePlot ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setLeftPlottedPoints([])}
                disabled={!leftPlottedPoints.length}
                style={{ ...actionStyle, marginTop: 0, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)' }}
              >
                Clear {leftLabel}
              </button>
              <button
                type="button"
                onClick={() => setRightPlottedPoints([])}
                disabled={!rightPlottedPoints.length}
                style={{ ...actionStyle, marginTop: 0, background: 'var(--mm-surface)', color: 'var(--mm-error-text)', border: '1px solid var(--mm-error-border-soft)' }}
              >
                Clear {rightLabel}
              </button>
              <button
                type="button"
                onClick={() => { setLeftPlottedPoints([]); setRightPlottedPoints([]); }}
                disabled={!leftPlottedPoints.length && !rightPlottedPoints.length}
                style={{ ...actionStyle, marginTop: 0, background: 'var(--mm-surface)', color: 'var(--mm-text-muted)', border: '1px solid var(--mm-tint-border)' }}
              >
                Clear both
              </button>
              <span style={{ color: 'var(--mm-text-muted)', fontSize: 13 }}>
                {leftLabel}: {leftPlottedPoints.length}/{leftRows.length} · {rightLabel}: {rightPlottedPoints.length}/{rightRows.length}
              </span>
            </div>
            {plotMessage && <p style={{ margin: '8px 0 0', color: 'var(--mm-warning-text)', fontWeight: 700 }}>{plotMessage}</p>}
            <p style={{ color: 'var(--mm-text-muted)', marginBottom: 0 }}>
              Term number n is the domain input. Plot separate points only; a sequence graph is discrete.
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--mm-text-muted)' }}>Do not decide from the first few terms alone; compare both rules at the requested index.</p>
        )}
      </Panel>
      <Panel title={`Compare at n = ${compareN}`}>
        <label>Larger term<select value={relation} onChange={(event) => setRelation(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="A">{leftLabel}</option><option value="B">{rightLabel}</option><option value="equal">They are equal</option></select></label>
        <label style={{ display: 'block', marginTop: 10 }}>Absolute difference between the terms<input value={difference} onChange={(event) => setDifference(event.target.value)} style={inputStyle} /></label>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}>Check comparison</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? (requirePlot ? 'Both discrete graphs and the comparison agree.' : 'The comparison uses the same term number for both sequences.') : (requirePlot ? 'Check every plotted point for both sequences, then compare the two requested terms.' : 'Evaluate both rules at n = ' + compareN + ', then compare their outputs.')}</ResultPill></div> : null}
      <HintPanel hints={['Do not judge by the early terms — additive and multiplicative growth trade places.', 'Compute the requested term of each sequence independently before comparing anything.', 'Geometric growth starts slower but overtakes arithmetic growth eventually, and then pulls away fast.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
    </EnlargeableFigure>
  </ToolShell>;
}
