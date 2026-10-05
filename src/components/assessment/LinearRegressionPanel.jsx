import React, { useState } from 'react';
import { regressionCalculatorStats } from '../../../functions/shared/pathRegressionCalculatorGrading.mjs';

// Permitted technology: students enter data and obtain a fitted line. It does
// not import the question's table, fill answers, predict, or give feedback.
export default function LinearRegressionPanel({ value = null, onChange = null, onUsed = null }) {
  const [local, setLocal] = useState({ rows: Array.from({ length: 6 }, () => ['', '']), ran: false });
  const [notice, setNotice] = useState('');
  const state = value || local;
  const update = (next) => { setLocal(next); onChange?.(next); };
  const points = state.rows.filter(row => row.every(cell => String(cell).trim() !== '' && Number.isFinite(Number(cell)))).map(row => row.map(Number));
  const stats = state.ran ? regressionCalculatorStats(points) : null;
  return <details style={{ margin: '18px 0', border: '1px solid var(--mm-border)', borderRadius: 8, padding: 12 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Linear regression calculator</summary>
    <p>Enter the data pairs, then calculate the fitted line y = mx + b.</p>
    <table style={{ width: '100%', maxWidth: 420 }}>
      <thead><tr><th scope="col">x</th><th scope="col">y</th></tr></thead>
      <tbody>{state.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>
        <input aria-label={`Regression row ${index + 1} ${column ? 'y' : 'x'}`} type="text" inputMode="decimal" value={cell}
          onChange={(event) => { setNotice(''); update({ rows: state.rows.map((r, i) => i === index ? r.map((v, j) => j === column ? event.target.value : v) : r), ran: false }); }}
          style={{ minHeight: 40, width: '100%', boxSizing: 'border-box' }} />
      </td>)}</tr>)}</tbody>
    </table>
    <button type="button" onClick={() => {
      if (points.length !== state.rows.length || !regressionCalculatorStats(points)) { setNotice('Enter six complete numeric pairs with varying x and y.'); return; }
      update({ ...state, ran: true }); onUsed?.(); setNotice('');
    }} style={{ minHeight: 42, marginTop: 10 }}>Calculate linear regression</button>
    {notice && <p role="status">{notice}</p>}
    {stats && <output style={{ display: 'block', padding: 10 }}>m = {Number(stats.m.toFixed(8))} · b = {Number(stats.b.toFixed(8))} · r = {Number(stats.r.toFixed(8))}</output>}
  </details>;
}
