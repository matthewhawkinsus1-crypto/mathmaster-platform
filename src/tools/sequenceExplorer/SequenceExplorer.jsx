import React, { useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { matchesNumericAnswer, round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  compareSequencesAt,
  generateSequence,
  normalizeSequenceSpec,
  sequenceChange,
  sequencePartialSum,
  sequenceEvidenceCount,
  sequenceRuleParts,
  sequenceTerm,
} from './sequenceMath';

const inputStyle = { width: '100%', padding: 9, border: '1px solid #cfd8e6', borderRadius: 8, boxSizing: 'border-box' };
const actionStyle = { marginTop: 14, padding: '10px 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const numberText = (value) => `${round(value, 4)}`;
const matchesNumber = (answer, expected, tolerance = 0.01) => matchesNumericAnswer(answer, expected, tolerance);

const sequenceFromQuestion = (questionData = {}) => {
  const kind = questionData.sequence?.kind || questionData.kind || 'arithmetic';
  return normalizeSequenceSpec({ ...questionData.sequence, kind }, kind);
};

const graphBounds = (values = []) => {
  const finite = values.filter(Number.isFinite);
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const span = Math.max(4, high - low);
  const margin = Math.max(2, span * 0.12);
  return { yMin: Math.floor(low - margin), yMax: Math.ceil(high + margin) };
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
      points={rows.map((row) => ({ 0: row.n, 1: row.value, label: `a${row.n}` }))}
    />
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
        <thead><tr><th style={{ padding: 6 }}>n</th>{rows.map((row) => <th key={row.n} style={{ padding: 6 }}>{row.n}</th>)}</tr></thead>
        <tbody><tr><th style={{ padding: 6 }}>aₙ</th>{rows.map((row) => <td key={row.n} style={{ padding: 6, textAlign: 'center' }}>{numberText(row.value)}</td>)}</tr></tbody>
      </table>
    </div>
    <p style={{ marginBottom: 0, color: '#5f6b7a' }}>A sequence is a function with discrete term-number inputs. The graph keeps those inputs visually separate.</p>
  </Panel>;
}

export default function SequenceExplorer({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'analyze';
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'ruleBridge') return <RuleBridge questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'missingTerm') return <MissingTerm questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'partialSum') return <PartialSum questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'compare') return <CompareSequences questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <AnalyzeSequence questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function AnalyzeSequence({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const targetN = Number(questionData.targetN ?? 8);
  const expectedChange = sequenceChange(spec);
  const expectedTerm = sequenceTerm(spec, targetN);
  const [kindAnswer, setKindAnswer] = useState('');
  const [changeAnswer, setChangeAnswer] = useState('');
  const [termAnswer, setTermAnswer] = useState('');
  const check = () => {
    const checks = [kindAnswer === spec.kind, matchesNumber(changeAnswer, expectedChange, 0.001), matchesNumber(termAnswer, expectedTerm, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { kindAnswer, changeAnswer, termAnswer }, { mode: 'analyze', targetN });
  };
  return <ToolShell title="Analyze the Sequence" subtitle="Connect the pattern, table, discrete graph, and term structure." badge="Pattern and terms">
    <TaskCard question={questionData} task={'Decide whether this sequence is arithmetic or geometric, then give its change and the requested term.'} steps={['Compare consecutive terms by subtracting, then by dividing.', 'Whichever stays constant tells you the type.', 'Use that constant to reach the requested term.']} />
    <ToolGrid min={340}>
      <SequenceVisual spec={spec} count={sequenceEvidenceCount(questionData.displayCount ?? 7, targetN, { revealTarget: questionData.revealTargetTerm === true })} />
      <Panel title="Analyze the pattern">
        <label>Sequence family<select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="arithmetic">Arithmetic</option><option value="geometric">Geometric</option></select></label>
        <label style={{ display: 'block', marginTop: 10 }}>Common {kindAnswer === 'arithmetic' ? 'difference' : kindAnswer === 'geometric' ? 'ratio' : 'change'}<input value={changeAnswer} onChange={(event) => setChangeAnswer(event.target.value)} inputMode="decimal" style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>a<sub>{targetN}</sub><input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} inputMode="decimal" style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check analysis</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Pattern, common change, and target term all agree.' : 'Use equal differences for arithmetic sequences and equal ratios for geometric sequences.'}</ResultPill></div> : null}
      <HintPanel hints={['Look at how each term becomes the next one. Adding the same amount every time is arithmetic; multiplying by the same amount is geometric.', 'Subtract each term from the one after it. If you always get the same number, that number is the common difference.', 'If subtraction does not give a constant, try dividing instead — a constant ratio means geometric.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function RuleBridge({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const parts = sequenceRuleParts(spec);
  const [explicitFirst, setExplicitFirst] = useState('');
  const [explicitChange, setExplicitChange] = useState('');
  const [recursiveFirst, setRecursiveFirst] = useState('');
  const [recursiveChange, setRecursiveChange] = useState('');
  const changeName = spec.kind === 'arithmetic' ? 'D' : 'R';
  const check = () => {
    const checks = [
      matchesNumber(explicitFirst, parts.first, 0.001), matchesNumber(explicitChange, parts.change, 0.001),
      matchesNumber(recursiveFirst, parts.first, 0.001), matchesNumber(recursiveChange, parts.change, 0.001),
    ];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { explicitFirst, explicitChange, recursiveFirst, recursiveChange }, { mode: 'ruleBridge', kind: spec.kind });
  };
  return <ToolShell title="Write the Sequence Rules" subtitle="Move between explicit and recursive descriptions of the same sequence." badge="Recursive and explicit">
    <TaskCard question={questionData} task={'Write the same sequence both explicitly and recursively.'} steps={['The explicit rule gets any term directly from its position n.', 'The recursive rule builds each term from the one before it.', 'Both must produce the same sequence.']} />
    <ToolGrid min={330}>
      <SequenceVisual spec={spec} count={6} title="Evidence from the sequence" />
      <Panel title="Complete both rules">
        <p style={{ fontWeight: 900 }}>{parts.explicitTemplate}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>A<input value={explicitFirst} onChange={(event) => setExplicitFirst(event.target.value)} style={inputStyle} /></label><label>{changeName}<input value={explicitChange} onChange={(event) => setExplicitChange(event.target.value)} style={inputStyle} /></label></div>
        <p style={{ fontWeight: 900, marginTop: 18 }}>{parts.recursiveTemplate}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>a₁<input value={recursiveFirst} onChange={(event) => setRecursiveFirst(event.target.value)} style={inputStyle} /></label><label>{spec.kind === 'arithmetic' ? 'added change' : 'multiplier'}<input value={recursiveChange} onChange={(event) => setRecursiveChange(event.target.value)} style={inputStyle} /></label></div>
        <button type="button" onClick={check} style={actionStyle}>Check both representations</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The explicit and recursive rules encode the same structure.' : 'Both forms must use the same first term and the same common change.'}</ResultPill></div> : null}
      <HintPanel hints={['An explicit rule is a shortcut to any term. A recursive rule is a set of instructions you follow term by term.', 'For an arithmetic sequence the explicit rule is first term + (n − 1) × common difference.', 'A recursive rule always needs two pieces: the starting term, and how to get from one term to the next.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function MissingTerm({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const missingIndex = Number(questionData.missingIndex ?? 4);
  const count = Math.max(6, Number(questionData.displayCount ?? 7), missingIndex + 1);
  const rows = generateSequence(spec, count);
  const expected = sequenceTerm(spec, missingIndex);
  const [termAnswer, setTermAnswer] = useState('');
  const [kindAnswer, setKindAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(termAnswer, expected, 0.01), kindAnswer === spec.kind];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { termAnswer, kindAnswer }, { mode: 'missingTerm', missingIndex });
  };
  return <ToolShell title="Find the Missing Term" subtitle="Recover a missing term from the sequence pattern." badge="Sequence pattern">
    <TaskCard question={questionData} task={'Recover the missing term and say what kind of sequence this is.'} steps={['Look at the terms either side of the gap.', 'Work out the constant difference or ratio from terms you can see.', 'Apply it to fill the gap.']} />
    <ToolGrid min={320}>
      <Panel title="Sequence with a gap">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{rows.map((row) => <div key={row.n} style={{ minWidth: 66, padding: '10px 12px', textAlign: 'center', borderRadius: 10, border: '1px solid #d9e2f1', background: row.n === missingIndex ? '#fff7e6' : '#fff' }}><div style={{ fontSize: 11, color: '#667085' }}>a{row.n}</div><strong>{row.n === missingIndex ? '?' : numberText(row.value)}</strong></div>)}</div>
        <p style={{ color: '#5f6b7a' }}>Use the terms on both sides of the gap. A valid common change must work across the entire sequence.</p>
      </Panel>
      <Panel title="Recover the structure">
        <label>Missing value a<sub>{missingIndex}</sub><input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Sequence family<select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="arithmetic">Arithmetic</option><option value="geometric">Geometric</option></select></label>
        <button type="button" onClick={check} style={actionStyle}>Check missing term</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The missing term preserves the sequence structure.' : 'Check the common difference or ratio on both sides of the blank.'}</ResultPill></div> : null}
      <HintPanel hints={['The structure of a sequence does not change partway through, so terms you can see tell you about the ones you cannot.', 'Use two consecutive known terms to find the difference or the ratio.', 'Then step forward from the term before the gap using that same difference or ratio.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function PartialSum({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const sumN = Number(questionData.sumN ?? 6);
  const expectedLast = sequenceTerm(spec, sumN);
  const expectedSum = sequencePartialSum(spec, sumN);
  const [lastTerm, setLastTerm] = useState('');
  const [sumAnswer, setSumAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(lastTerm, expectedLast, 0.01), matchesNumber(sumAnswer, expectedSum, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { lastTerm, sumAnswer }, { mode: 'partialSum', sumN });
  };
  return <ToolShell title="Find the Finite Sum" subtitle="Connect a sequence of terms to the finite series formed by adding them." badge="Finite series">
    <TaskCard question={questionData} task={'Find the last term of this finite sequence and the sum of all its terms.'} steps={['Extend the sequence to the requested number of terms.', 'Identify the last term.', 'Add all the terms, or use the appropriate sum formula.']} />
    <ToolGrid min={320}>
      <SequenceVisual spec={spec} count={sequenceEvidenceCount(7, sumN, { revealTarget: questionData.revealTargetTerm === true, cap: 7 })} title="Sequence evidence" />
      <Panel title={`Find S${sumN}`}>
        <p><strong>S<sub>{sumN}</sub> = a₁ + a₂ + ··· + a<sub>{sumN}</sub></strong></p>
        <label>Last included term a<sub>{sumN}</sub><input value={lastTerm} onChange={(event) => setLastTerm(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Partial sum S<sub>{sumN}</sub><input value={sumAnswer} onChange={(event) => setSumAnswer(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check finite sum</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The last term and finite sum are consistent.' : 'Find the correct final term first, then include every term from a₁ through it.'}</ResultPill></div> : null}
      <HintPanel hints={['A series is what you get when you add the terms of a sequence together.', 'Find the last term first — you need it before you can use most sum formulas.', 'For an arithmetic series the sum is the number of terms times the average of the first and last term.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function CompareSequences({ questionData, feedback, submit, onAction }) {
  const left = normalizeSequenceSpec(questionData.left || { kind: 'arithmetic', first: 3, difference: 4 }, questionData.left?.kind || 'arithmetic');
  const right = normalizeSequenceSpec(questionData.right || { kind: 'geometric', first: 1, ratio: 2 }, questionData.right?.kind || 'geometric');
  const compareN = Number(questionData.compareN ?? 7);
  const result = compareSequencesAt(left, right, compareN);
  const leftLabel = questionData.leftLabel || 'Sequence A';
  const rightLabel = questionData.rightLabel || 'Sequence B';
  const evidenceCount = sequenceEvidenceCount(questionData.displayCount ?? 7, compareN, { revealTarget: questionData.revealCompareTerm === true, cap: 7 });
  const leftRows = generateSequence(left, evidenceCount);
  const rightRows = generateSequence(right, evidenceCount);
  const bounds = graphBounds([...leftRows, ...rightRows].map((row) => row.value));
  const [relation, setRelation] = useState('');
  const [difference, setDifference] = useState('');
  const expectedRelation = result.relation === 'left' ? 'A' : result.relation === 'right' ? 'B' : 'equal';
  const check = () => {
    const checks = [relation === expectedRelation, matchesNumber(difference, result.difference, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { relation, difference }, { mode: 'compare', compareN });
  };
  return <ToolShell title="Compare the Sequences" subtitle="Compare additive and multiplicative growth at the same term number." badge="Growth comparison">
    <TaskCard question={questionData} task={'Compare the two sequences at the given term number.'} steps={['Work out the requested term of each sequence separately.', 'Compare the two values.', 'Choose the relationship and give the difference.']} />
    <ToolGrid min={330}>
      <Panel title="Two discrete models">
        <CoordinatePlane xMin={0} xMax={evidenceCount + 1} yMin={bounds.yMin} yMax={bounds.yMax} points={[...leftRows.map((row) => ({ 0: row.n, 1: row.value, fill: '#1a73e8' })), ...rightRows.map((row) => ({ 0: row.n, 1: row.value, fill: '#d93025' }))]} />
        <p><span style={{ color: '#1a73e8', fontWeight: 900 }}>● {leftLabel}</span> &nbsp; <span style={{ color: '#d93025', fontWeight: 900 }}>● {rightLabel}</span></p>
        <p style={{ color: '#5f6b7a' }}>Do not decide from the first few terms alone; compare both rules at the requested index.</p>
      </Panel>
      <Panel title={`Compare at n = ${compareN}`}>
        <label>Larger term<select value={relation} onChange={(event) => setRelation(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="A">{leftLabel}</option><option value="B">{rightLabel}</option><option value="equal">They are equal</option></select></label>
        <label style={{ display: 'block', marginTop: 10 }}>Absolute difference between the terms<input value={difference} onChange={(event) => setDifference(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check comparison</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The comparison uses the same term number for both sequences.' : `Evaluate both rules at n = ${compareN}, then compare their outputs.`}</ResultPill></div> : null}
      <HintPanel hints={['Do not judge by the early terms — additive and multiplicative growth trade places.', 'Compute the requested term of each sequence independently before comparing anything.', 'Geometric growth starts slower but overtakes arithmetic growth eventually, and then pulls away fast.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}
