import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ResultPill, ToolGrid } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluateFunctionSpec } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  buildDefaultRepresentationSets,
  findTableMismatchIndexes,
  mixedRepresentationCards,
  mismatchedRepresentationKinds,
  representationById,
  scoreRepresentationMatch,
  tableRowsForFunction,
} from './representationMath';

const inputStyle = { display: 'block', width: '100%', padding: 10, marginTop: 5, border: '1px solid #cdd6e4', borderRadius: 8 };
const buttonStyle = { padding: '10px 16px', background: '#1a73e8', color: '#fff', border: 0, borderRadius: 8, fontWeight: 800, cursor: 'pointer' };

export default function RepresentationMatch({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'completeSet';
  const sets = useMemo(() => questionData.sets?.length ? questionData.sets : buildDefaultRepresentationSets(), [questionData.sets]);
  const targetId = questionData.targetId || sets[0]?.id;
  const choices = useMemo(() => [...sets].reverse(), [sets]);
  const fallbackMismatchId = sets.find((item) => item.id !== targetId)?.id || targetId;
  const mixed = questionData.mixedSet || { equationId: targetId, tableId: fallbackMismatchId, contextId: targetId };
  const tableSpec = questionData.function || { type: 'quadratic', a: 1, h: 0, k: 0 };
  const tableRows = useMemo(() => {
    if (questionData.rows?.length) return questionData.rows;
    const rows = tableRowsForFunction(tableSpec, [-2, -1, 0, 1, 2]);
    return rows.map((row, index) => index === Math.min(2, rows.length - 1) ? [row[0], row[1] + 2] : row);
  }, [questionData.rows, tableSpec.type, tableSpec.a, tableSpec.h, tableSpec.k, tableSpec.base]);
  const [equation, setEquation] = useState('');
  const [table, setTable] = useState('');
  const [context, setContext] = useState('');
  const [mismatchKind, setMismatchKind] = useState('');
  const [badRow, setBadRow] = useState(null);
  const [graphId, setGraphId] = useState('');
  const { feedback, submit } = useToolSubmission(onAction);

  const checkCompleteSet = () => {
    const response = { equation, table, context };
    const result = scoreRepresentationMatch(targetId, response);
    submit({ isCorrect: result.isCorrect, score: result.score }, response, { mode, targetId });
  };

  const checkMismatch = () => {
    const expected = mismatchedRepresentationKinds(targetId, mixed);
    const ok = expected.length === 1 && mismatchKind === expected[0];
    submit({ isCorrect: ok, score: ok ? 1 : 0 }, { mismatchKind }, { mode, targetId, sourceIds: mixed });
  };

  const checkTable = () => {
    const expected = findTableMismatchIndexes(tableSpec, tableRows, Number(questionData.tolerance ?? 0.01));
    const ok = expected.length === 1 && Number(badRow) === expected[0];
    submit({ isCorrect: ok, score: ok ? 1 : 0 }, { rowIndex: badRow }, { mode, expectedMismatchCount: expected.length });
  };

  const checkGraph = () => {
    const ok = graphId === targetId;
    submit({ isCorrect: ok, score: ok ? 1 : 0 }, { graphId }, { mode, targetId });
  };

  const selectRepresentation = (label, value, setter) => <label style={{ display: 'block', marginBottom: 12 }}>{label}<select value={value} onChange={(event) => setter(event.target.value)} style={inputStyle}><option value="">Choose…</option>{choices.map((item) => <option value={item.id} key={item.id}>{item[label.toLowerCase()]}</option>)}</select></label>;
  const targetSet = representationById(sets, targetId);
  const cards = mixedRepresentationCards(sets, mixed);

  return <ToolShell title="Representation Match v2" subtitle="Treat equations, tables, contexts, and graphs as coordinated views of the same relationship." badge="Batch D · Algebra I / II">
    <ToolGrid min={330}>
      <Panel title={mode === 'completeSet' ? 'Build a consistent representation set' : mode === 'findMismatch' ? 'Find the broken link' : mode === 'tableAudit' ? 'Audit the table' : 'Match the graph'}>
        {mode === 'completeSet' ? <>
          <p style={{ color: '#5f6b7a' }}>Choose three representations that all describe <strong>{targetId}</strong>.</p>
          {selectRepresentation('Equation', equation, setEquation)}
          {selectRepresentation('Table', table, setTable)}
          {selectRepresentation('Context', context, setContext)}
          <button type="button" onClick={checkCompleteSet} style={buttonStyle}>Check set</button>
        </> : null}

        {mode === 'findMismatch' ? <>
          <p>Two cards come from the target relationship. One does not. Identify the mismatched representation.</p>
          <div style={{ display: 'grid', gap: 10 }}>{cards.map((card) => <button type="button" key={card.kind} onClick={() => setMismatchKind(card.kind)} style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: mismatchKind === card.kind ? '2px solid #1a73e8' : '1px solid #d9e2f1', background: mismatchKind === card.kind ? '#eef4ff' : '#fff', cursor: 'pointer' }}><strong style={{ textTransform: 'capitalize' }}>{card.kind}</strong><div style={{ marginTop: 5, color: '#44536a' }}>{card.value}</div></button>)}</div>
          <button type="button" onClick={checkMismatch} disabled={!mismatchKind} style={{ ...buttonStyle, marginTop: 12, opacity: mismatchKind ? 1 : .55 }}>Check mismatch</button>
        </> : null}

        {mode === 'tableAudit' ? <>
          <p>Exactly one row does not satisfy the relationship. Select it.</p>
          <div style={{ display: 'grid', gap: 8 }}>{tableRows.map((row, index) => <button type="button" key={index} onClick={() => setBadRow(index)} style={{ padding: 10, borderRadius: 9, border: badRow === index ? '2px solid #1a73e8' : '1px solid #d9e2f1', background: badRow === index ? '#eef4ff' : '#fff', fontWeight: 700, cursor: 'pointer' }}>Row {index + 1}: ({row[0]}, {row[1]})</button>)}</div>
          <button type="button" onClick={checkTable} disabled={badRow == null} style={{ ...buttonStyle, marginTop: 12, opacity: badRow == null ? .55 : 1 }}>Check row</button>
        </> : null}

        {mode === 'graphMatch' ? <>
          <p><strong>Target equation:</strong> {targetSet?.equation || 'Match the target relationship.'}</p>
          <div style={{ display: 'grid', gap: 12 }}>{sets.map((item, index) => <button type="button" key={item.id} onClick={() => setGraphId(item.id)} style={{ textAlign: 'left', padding: 10, borderRadius: 12, border: graphId === item.id ? '2px solid #1a73e8' : '1px solid #d9e2f1', background: graphId === item.id ? '#eef4ff' : '#fff', cursor: 'pointer' }}><strong>Graph {String.fromCharCode(65 + index)}</strong><div style={{ marginTop: 8 }}><CoordinatePlane width={420} height={230} xMin={-5} xMax={5} yMin={-5} yMax={9} functions={[x => evaluateFunctionSpec(item.graphSpec || {}, x)]} /></div></button>)}</div>
          <button type="button" onClick={checkGraph} disabled={!graphId} style={{ ...buttonStyle, marginTop: 12, opacity: graphId ? 1 : .55 }}>Check graph</button>
        </> : null}

        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The representations are connected correctly.' : 'Trace the same inputs, outputs, and rate or shape across the representations.'}</ResultPill></div> : null}
      </Panel>

      <Panel title="Representation reasoning">
        <ul style={{ lineHeight: 1.8, paddingLeft: 20, marginTop: 0 }}><li>An equation encodes the rule.</li><li>A table samples input-output pairs.</li><li>A graph shows shape, rate, and defining features.</li><li>A context gives quantities meaning and units.</li></ul>
        <p style={{ color: '#5f6b7a', marginBottom: 0 }}>No representation is treated as the default; the goal is to prove that the representations describe the same relationship.</p>
      </Panel>
    </ToolGrid>
  </ToolShell>;
}
