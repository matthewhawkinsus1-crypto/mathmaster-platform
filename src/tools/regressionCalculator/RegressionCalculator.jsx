import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import { cleanRegressionPoints, regressionCalculatorStats } from './regressionCalculatorMath.js';
import './RegressionCalculator.css';

const describe = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});

export default function RegressionCalculator({ questionData = {}, onAction }) {
  const source = cleanRegressionPoints(questionData.sourceData || questionData.points);
  const [table, setTable] = useState(() => source.map(() => ['', '']));
  const [operation, setOperation] = useState('');
  const [run, setRun] = useState(null);
  const [direction, setDirection] = useState('');
  const [strength, setStrength] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const entered = useMemo(() => table.map(([x, y]) => [Number(x), Number(y)]), [table]);

  const update = (row, column, value) => {
    setTable((current) => current.map((pair, index) => index === row ? pair.map((cell, c) => c === column ? value : cell) : pair));
    setRun(null); clearFeedback();
  };
  const execute = () => {
    if (operation !== 'linearRegression' || table.some((row) => row.some((cell) => String(cell).trim() === ''))) return;
    const stats = regressionCalculatorStats(entered);
    if (stats) setRun({ operation, table: entered.map((row) => [...row]), ...stats });
  };
  const check = () => {
    const expected = regressionCalculatorStats(source);
    const interpretation = expected ? describe(expected.r) : {};
    const raw = { table: entered, regressionRun: run, interpretation: { direction, strength } };
    const tableCorrect = JSON.stringify(entered) === JSON.stringify(source);
    const parts = {
      'data-entry': tableCorrect,
      'linear-regression': tableCorrect && run?.operation === 'linearRegression',
      'correlation-produced': tableCorrect && Math.abs(Number(run?.r) - Number(expected?.r)) <= 0.0005,
      interpretation: questionData.requireInterpretation === false || (direction === interpretation.direction && strength === interpretation.strength),
    };
    const required = questionData.requireInterpretation === false ? Object.values(parts).slice(0, 3) : Object.values(parts);
    submit({ isCorrect: required.every(Boolean), score: required.filter(Boolean).length / required.length }, raw, { parts });
  };

  return <ToolShell title="Regression Calculator" subtitle="Enter paired data, run linear regression, then interpret the correlation it produces." badge="Assessment statistics">
    <TaskCard question={questionData} task="Use the source data in the calculator workflow." steps={['Enter every x₁ and y₁ value.', 'Select and run linear regression.', 'Use the produced r to interpret direction and strength.']} />
    <div className="regression-workspace">
      <Panel title="Source data"><div className="source-data" aria-label="Source data">{source.map(([x,y], i) => <span key={i}>({x}, {y})</span>)}</div></Panel>
      <Panel title="1 · x₁ / y₁ table"><div className="regression-table"><b>Row</b><b>x₁</b><b>y₁</b>{table.map((row, i) => <React.Fragment key={i}><span>{i+1}</span>{row.map((value,c) => <input key={c} aria-label={`${c ? 'y' : 'x'} row ${i+1}`} inputMode="decimal" value={value} onChange={(e)=>update(i,c,e.target.value)} />)}</React.Fragment>)}</div></Panel>
      <Panel title="2 · Regression"><label>Calculation<select value={operation} onChange={(e)=>{setOperation(e.target.value);setRun(null);}}><option value="">Choose…</option><option value="linearRegression">Linear regression (LinReg)</option></select></label><button type="button" onClick={execute}>Run regression</button>{run && <output aria-live="polite"><strong>LinReg y = {run.m.toFixed(4)}x {run.b < 0 ? '−' : '+'} {Math.abs(run.b).toFixed(4)}</strong><span>r = {run.r.toFixed(4)}</span></output>}</Panel>
      <Panel title="3 · Interpretation"><label>Direction<select value={direction} onChange={(e)=>setDirection(e.target.value)}><option value="">Choose…</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="none">None</option></select></label><label>Strength<select value={strength} onChange={(e)=>setStrength(e.target.value)}><option value="">Choose…</option><option value="strong">Strong</option><option value="moderate">Moderate</option><option value="weak">Weak</option><option value="none">None</option></select></label></Panel>
    </div>
    <button className="regression-submit" type="button" onClick={check}>Submit workflow</button>
    {feedback && <p role="status">{feedback.isCorrect ? 'Workflow complete.' : 'Check each workflow stage.'}</p>}
  </ToolShell>;
}
