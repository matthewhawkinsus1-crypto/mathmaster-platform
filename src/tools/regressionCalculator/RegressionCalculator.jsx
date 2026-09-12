import React, { useMemo, useRef, useState } from 'react';
import ToolShell, { TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import CoordinatePlane from '../shared/CoordinatePlane';
import { cleanRegressionPoints, regressionCalculatorStats } from './regressionCalculatorMath.js';
import './RegressionCalculator.css';

const EMPTY_EXPRESSION = () => ({ id: crypto.randomUUID(), type: 'expression', value: '' });
const orderedPair = (value) => {
  const match = String(value).trim().match(/^\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const isRegressionExpression = (value) => /^\s*y(?:₁|_?1)\s*[~∼]\s*m\s*x(?:₁|_?1)\s*\+\s*b\s*$/i.test(String(value));
const validRows = (rows = []) => rows.filter((row) => row.every((cell) => String(cell).trim() !== '' && Number.isFinite(Number(cell)))).map(([x, y]) => [Number(x), Number(y)]);
const describe = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});
const samePairs = (left, right) => JSON.stringify([...left].sort(([ax, ay], [bx, by]) => ax - bx || ay - by))
  === JSON.stringify([...right].sort(([ax, ay], [bx, by]) => ax - bx || ay - by));
const boundsFor = (points) => {
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const padded = (values) => { const min = Math.min(...values, 0); const max = Math.max(...values, 1); const pad = Math.max(1, (max - min) * 0.15); return [min - pad, max + pad]; };
  const [xMin, xMax] = padded(xs); const [yMin, yMax] = padded(ys);
  return { xMin, xMax, yMin, yMax };
};

export default function RegressionCalculator({ questionData = {}, onAction }) {
  const source = cleanRegressionPoints(questionData.sourceData || questionData.points);
  const sourceMode = questionData.sourceMode === 'scatterplot' ? 'scatterplot' : 'data';
  const [rows, setRows] = useState(() => [EMPTY_EXPRESSION()]);
  const [selectedId, setSelectedId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [run, setRun] = useState(null);
  const [direction, setDirection] = useState('');
  const [strength, setStrength] = useState('');
  const [notice, setNotice] = useState('');
  const [processEvidence, setProcessEvidence] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const inputRefs = useRef([]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  const record = (type, detail = {}) => setProcessEvidence((events) => [...events, { type, ...detail }]);
  const commitRows = (next) => { setHistory((items) => [...items, rows]); setFuture([]); setRows(next); };
  const tableRow = rows.find((row) => row.type === 'table');
  const tablePoints = useMemo(() => validRows(tableRow?.rows), [tableRow]);
  const expressionPoints = useMemo(() => rows.filter((row) => row.type === 'expression').map((row) => orderedPair(row.value)).filter(Boolean), [rows]);
  const plotted = tableRow ? tablePoints : expressionPoints;
  const graphBounds = useMemo(() => boundsFor(plotted.length ? plotted : source), [plotted, source]);
  const selected = rows.find((row) => row.id === selectedId);
  const conversionAvailable = selected?.type === 'expression' && Boolean(orderedPair(selected.value));
  const sourceGraphBounds = questionData.sourceGraphBounds || boundsFor(source);

  const updateExpression = (id, value) => {
    const before = rows.find((row) => row.id === id)?.value;
    setRows((current) => current.map((row) => row.id === id ? { ...row, value } : row));
    if (!orderedPair(before) && orderedPair(value)) record('orderedPairEntered', { expressionId: id });
    setRun(null); clearFeedback();
  };
  const addExpression = () => {
    const row = EMPTY_EXPRESSION(); commitRows([...rows, row]); setSelectedId(row.id); setEditOpen(false);
    record('expressionAdded'); requestAnimationFrame(() => document.getElementById(`regression-${row.id}`)?.focus());
  };
  const addTable = () => {
    if (tableRow) return;
    const row = { id: crypto.randomUUID(), type: 'table', rows: Array.from({ length: Math.max(4, source.length) }, () => ['', '']) };
    commitRows([...rows, row]); setSelectedId(row.id); record('tableCreated', { fromOrderedPair: false });
  };
  const openEdit = () => {
    setEditOpen((open) => !open); record('editModeOpened', { expressionId: selectedId });
    if (conversionAvailable) record('tableConversionOffered', { expressionId: selectedId });
  };
  const convertToTable = () => {
    const pair = orderedPair(selected?.value); if (!pair) return;
    const table = { id: selected.id, type: 'table', rows: [pair.map(String), ...Array.from({ length: Math.max(3, source.length - 1) }, () => ['', ''])] };
    commitRows(rows.map((row) => row.id === selected.id ? table : row)); setEditOpen(false); setNotice('Table created.');
    record('tableCreated', { fromOrderedPair: true });
  };
  const updateTable = (rowIndex, column, value) => {
    setRows((current) => current.map((row) => row.type !== 'table' ? row : { ...row, rows: row.rows.map((pair, index) => index === rowIndex ? pair.map((cell, c) => c === column ? value : cell) : pair) }));
    record('tableEdited', { row: rowIndex + 1, column: column ? 'y1' : 'x1' }); setRun(null); clearFeedback();
  };
  const undo = () => { if (!history.length) return; setFuture((items) => [rows, ...items]); setRows(history.at(-1)); setHistory((items) => items.slice(0, -1)); setRun(null); setNotice(''); };
  const redo = () => { if (!future.length) return; setHistory((items) => [...items, rows]); setRows(future[0]); setFuture((items) => items.slice(1)); setRun(null); };
  const execute = (row) => {
    if (!tableRow || tablePoints.length < 3 || !isRegressionExpression(row.value)) return;
    const stats = regressionCalculatorStats(tablePoints); if (!stats) return;
    const regressionRun = { operation: 'linearRegression', table: tablePoints.map((pair) => [...pair]), ...stats, r2: stats.r ** 2 };
    setRun(regressionRun); record('regressionExpressionEntered'); record('regressionExecuted', { operation: 'linearRegression' }); record('correlationProduced', { value: stats.r });
  };
  const check = () => {
    const entered = tablePoints; const expected = regressionCalculatorStats(source); const interpretation = expected ? describe(expected.r) : {};
    const raw = { table: entered, regressionRun: run, interpretation: { direction, strength }, processEvidence };
    const tableCorrect = samePairs(entered, source);
    const parts = { [sourceMode === 'scatterplot' ? 'graph-to-table' : 'data-entry']: tableCorrect, 'linear-regression': tableCorrect && run?.operation === 'linearRegression' && samePairs(run.table, entered), 'correlation-produced': tableCorrect && Math.abs(Number(run?.r) - Number(expected?.r)) <= 0.0005, interpretation: questionData.requireInterpretation === false || (direction === interpretation.direction && strength === interpretation.strength) };
    const required = questionData.requireInterpretation === false ? Object.values(parts).slice(0, 3) : Object.values(parts);
    submit({ isCorrect: required.every(Boolean), score: required.filter(Boolean).length / required.length }, raw, { parts });
  };
  const feedbackText = feedback && (!Object.values(feedback.metadata.parts)[0] ? 'Data entry/table does not match the provided data.' : !feedback.metadata.parts['linear-regression'] ? 'Regression setup is incomplete or invalid.' : !feedback.metadata.parts['correlation-produced'] ? 'A correlation value has not been produced.' : !feedback.metadata.parts.interpretation ? 'Check the direction/strength interpretation.' : 'Workflow complete.');

  return <ToolShell title="Regression Calculator" subtitle="Build a table and regression expression in the calculator workspace." badge="Assessment statistics">
    <TaskCard question={questionData} task="Use the calculator to model the source data and interpret its correlation." steps={[]} />
    {sourceMode === 'data' ? <aside className="regression-givens" aria-label="Source data"><strong>Source data</strong>{source.map(([x,y], i) => <span key={i}>({x}, {y})</span>)}</aside> : <aside className="regression-givens regression-source-context"><strong>Source scatterplot</strong><div data-regression-source-graph><CoordinatePlane {...sourceGraphBounds} points={source.map(([x,y])=>({x,y}))} revealCoordinates={false} pointHoverEnabled={false} enlargeable={false} panZoom={false} ariaLabel="Source scatterplot; coordinates are intentionally not revealed" /></div></aside>}
    <div className={`regression-calculator ${collapsed ? 'is-collapsed' : ''}`}>
      <section className="regression-graph" data-regression-graph aria-label="Calculator graph"><CoordinatePlane {...graphBounds} points={plotted.map(([x,y])=>({x,y}))} lines={run ? [{m:run.m,b:run.b}] : []} enlargeable={false} panZoom={false} ariaLabel="Student data graph and fitted regression line" /></section>
      <nav className="regression-toolbar" aria-label="Calculator toolbar">
        <button type="button" onClick={addExpression} aria-label="Add expression">＋ Expression</button><button type="button" onClick={addTable} disabled={Boolean(tableRow)} aria-label="Add table">▦ Table</button>
        <button type="button" onClick={undo} disabled={!history.length} aria-label="Undo">↶</button><button type="button" onClick={redo} disabled={!future.length} aria-label="Redo">↷</button>
        <button type="button" onClick={openEdit} aria-label="Settings and edit">⚙ Edit</button><button type="button" onClick={()=>setCollapsed((value)=>!value)} aria-label={`${collapsed ? 'Expand' : 'Collapse'} expression area`}>{collapsed ? 'Expand' : 'Collapse'}</button>
      </nav>
      <section className="regression-editor" aria-label="Expression and table editor">
        {editOpen && <div className="regression-edit-menu" role="menu" aria-label="Expression settings">{conversionAvailable ? <button type="button" role="menuitem" onClick={convertToTable} aria-label="Convert ordered pair to table">▦ Convert to table</button> : <span>Select a valid ordered-pair expression to see table actions.</span>}</div>}
        {notice && <div className="regression-notice" role="status">{notice} <button type="button" onClick={undo}>Undo</button></div>}
        <ol className="regression-rows">{rows.map((row, rowIndex) => <li key={row.id} className={selectedId === row.id ? 'is-selected' : ''} onClick={()=>setSelectedId(row.id)}>
          <span className="regression-row-number">{rowIndex + 1}</span>
          {row.type === 'expression' ? <div className="regression-expression-row"><input id={`regression-${row.id}`} aria-label={`Expression ${rowIndex + 1}`} value={row.value} placeholder="Expression" autoComplete="off" onFocus={()=>setSelectedId(row.id)} onChange={(event)=>updateExpression(row.id,event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'){event.preventDefault();if(isRegressionExpression(row.value)) execute(row); else addExpression();}}} />{isRegressionExpression(row.value) && tableRow ? <button type="button" onClick={()=>execute(row)} aria-label="Evaluate regression expression">▶</button> : null}</div> : <div className="regression-table-wrap"><table className="regression-table"><thead><tr><th aria-label="Row"></th><th>x₁</th><th>y₁</th></tr></thead><tbody>{row.rows.map((pair, r) => <tr key={r}><th>{r+1}</th>{pair.map((value,c)=>{const index=r*2+c;return <td key={c}><input ref={(node)=>{inputRefs.current[index]=node;}} aria-label={`${c?'y':'x'} row ${r+1}`} inputMode="decimal" value={value} onFocus={()=>setSelectedId(row.id)} onChange={(event)=>updateTable(r,c,event.target.value)} onKeyDown={(event)=>{const columns=2;let target=index;if(event.key==='Enter'||event.key==='ArrowRight')target=index+1;if(event.key==='ArrowLeft')target=index-1;if(event.key==='ArrowDown')target=index+columns;if(event.key==='ArrowUp')target=index-columns;if(target!==index){event.preventDefault();inputRefs.current[target]?.focus();}}}/></td>})}</tr>)}</tbody></table></div>}
        </li>)}</ol>
        {run && <output className="regression-result" aria-live="polite"><strong>y₁ = {run.m.toFixed(4)}x₁ {run.b < 0 ? '−' : '+'} {Math.abs(run.b).toFixed(4)}</strong><span>m = {run.m.toFixed(4)}</span><span>b = {run.b.toFixed(4)}</span><span>r = {run.r.toFixed(4)}</span><span>R² = {run.r2.toFixed(4)}</span></output>}
        {run && questionData.requireInterpretation !== false && <div className="regression-interpretation"><label>Direction<select value={direction} onChange={(e)=>{setDirection(e.target.value);record('interpretationSelected',{kind:'direction'});}}><option value="">Choose…</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="none">None</option></select></label><label>Strength<select value={strength} onChange={(e)=>{setStrength(e.target.value);record('interpretationSelected',{kind:'strength'});}}><option value="">Choose…</option><option value="strong">Strong</option><option value="moderate">Moderate</option><option value="weak">Weak</option><option value="none">None</option></select></label></div>}
      </section>
    </div>
    <button className="regression-submit" data-primary-answer-action="true" type="button" onClick={check}>Submit workflow</button>
    {feedbackText && <p role="status">{feedbackText}</p>}
  </ToolShell>;
}
