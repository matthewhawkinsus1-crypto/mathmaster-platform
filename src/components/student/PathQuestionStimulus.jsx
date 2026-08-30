import React from 'react';
import MathText from '../common/MathText.jsx';
import CoordinatePlane from '../../tools/shared/CoordinatePlane.jsx';
import { feasibleRegionPolygon } from '../../tools/systemsWorkspace/systemsMath.js';

// The material a Path question gives the student to work FROM.
//
// A table to read, a set of ordered pairs to classify, another student's work
// to find the error in, a list of expressions to compare. Before this existed
// the only way to put a table in a non-tool Path question was to draw it in the
// prompt with pipes and dashes, which is why every starter item ended up being
// a paragraph with "A) … B) … C) …" typed at the bottom.
//
// Rendered ABOVE the response controls and inside the same card, so on a
// Chromebook the student can see what they are reading and what they are
// answering at the same time without scrolling between them.

const shell = {
  margin: '0 0 16px',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #dfe3e8',
  background: '#fbfcfe',
};

const titleStyle = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: '#5f6368',
};

const cellStyle = {
  padding: '7px 12px',
  border: '1px solid #dfe3e8',
  fontSize: 15,
  color: '#202124',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

function StimulusTable({ table }) {
  if (!table?.rows?.length && !table?.headers?.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', margin: '0 auto', minWidth: 'min(100%, 220px)' }}>
        {table.headers?.length > 0 && (
          <thead>
            <tr>
              {table.headers.map((header, index) => (
                <th key={`h-${index}`} scope="col" style={{ ...cellStyle, background: '#eef3fb', fontWeight: 900 }}>
                  <MathText>{header}</MathText>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(table.rows || []).map((row, rowIndex) => {
            // Firestore-safe Path rows are stored as { cells: [...] }. Accept
            // the original array form too so previews/older local content
            // continue to render without a migration.
            const cells = Array.isArray(row) ? row : (Array.isArray(row?.cells) ? row.cells : []);
            return (
              <tr key={`r-${rowIndex}`}>
                {cells.map((cell, cellIndex) => (
                  <td key={`c-${rowIndex}-${cellIndex}`} style={cellStyle}>
                    <MathText>{cell}</MathText>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const graphPoint = (point) => (
  Array.isArray(point)
    ? { x:Number(point[0]), y:Number(point[1]) }
    : { x:Number(point?.x), y:Number(point?.y), label:point?.label ? String(point.label) : undefined }
);

const lineFromVisiblePoints = (entry = {}) => {
  const points = Array.isArray(entry.points) ? entry.points.map(graphPoint).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
  if (points.length < 2) return null;
  const [first, second] = points;
  if (Math.abs(second.x - first.x) <= 1e-9) {
    return { vertical:true, x:first.x, entry };
  }
  const m = (second.y - first.y) / (second.x - first.x);
  const b = first.y - m * first.x;
  return { vertical:false, m, b, entry };
};

function StimulusGraph({ graph }) {
  if (!graph || typeof graph !== 'object') return null;
  const bounds = {
    xMin:Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -6,
    xMax:Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 6,
    yMin:Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -6,
    yMax:Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 6,
  };
  const sourceLines = Array.isArray(graph.lines) ? graph.lines : [];
  const resolvedLines = sourceLines.map(lineFromVisiblePoints);
  const lines = resolvedLines
    .map((line, index) => (!line || line.vertical ? null : ({
      m:line.m,
      b:line.b,
      dash:String(line.entry?.boundaryStyle || '') === 'dashed' ? '10 6' : undefined,
      stroke:line.entry?.stroke,
      label:line.entry?.label || `Line ${index + 1}`,
    })))
    .filter(Boolean);
  const verticalLines = resolvedLines.filter((line) => line?.vertical).map((line) => line.x);
  const points = (Array.isArray(graph.points) ? graph.points : [])
    .map(graphPoint)
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const curves = (Array.isArray(graph.curves) ? graph.curves : [])
    .map((curve, index) => ({
      label:String(curve?.label || `Curve ${index + 1}`),
      points:(Array.isArray(curve?.points) ? curve.points : [])
        .map(graphPoint)
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
    }))
    .filter((curve) => curve.points.length >= 2);

  const regions = (Array.isArray(graph.shading) ? graph.shading : [])
    .map((shade) => {
      const line = resolvedLines[Number(shade?.lineIndex)];
      if (!line || line.vertical || !['above', 'below'].includes(String(shade?.side || ''))) return null;
      const relation = shade.side === 'above' ? '>=' : '<=';
      return {
        points:feasibleRegionPolygon([{ m:line.m, b:line.b, relation }], bounds),
        opacity:0.34,
      };
    })
    .filter(Boolean);

  if (!lines.length && !verticalLines.length && !points.length && !curves.length && !regions.length) return null;

  return (
    <div>
      <CoordinatePlane
        {...bounds}
        height={340}
        points={points}
        lines={lines}
        verticalLines={verticalLines}
        regions={regions}
        ariaLabel={graph.ariaLabel || 'Question graph'}
      >
        {({ sx, sy }) => curves.map((curve, index) => (
          <polyline
            key={`curve-${index}`}
            points={curve.points.map((point) => `${sx(point.x)},${sy(point.y)}`).join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-label={curve.label}
          />
        ))}
      </CoordinatePlane>
      {sourceLines.length > 1 && (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', justifyContent:'center', marginTop:8, fontSize:12, color:'#5f6368' }}>
          {sourceLines.map((line, index) => (
            <span key={`legend-${index}`}>
              <strong>{line.label || `Line ${index + 1}`}</strong>
              {line.boundaryStyle === 'dashed' ? ' · dashed' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderedPairList({ pairs }) {
  if (!pairs?.length) return null;
  return (
    <p style={{ margin: 0, fontSize: 17, color: '#202124', lineHeight: 1.7, textAlign: 'center' }}>
      {'{ '}
      {pairs.map((pair, index) => (
        <span key={`p-${index}`} style={{ whiteSpace: 'nowrap' }}>
          ({pair.x}, {pair.y}){index < pairs.length - 1 ? ', ' : ''}
        </span>
      ))}
      {' }'}
    </p>
  );
}

function WorkedSteps({ steps }) {
  if (!steps?.length) return null;
  return (
    <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
      {steps.map((step) => (
        <li key={step.id} style={{ fontSize: 15, color: '#202124', lineHeight: 1.6 }}>
          <span style={{ color: '#5f6368', fontWeight: 700, marginRight: 8 }}>{step.label}</span>
          <MathText>{step.work}</MathText>
        </li>
      ))}
    </ol>
  );
}

function ExpressionList({ expressions }) {
  if (!expressions?.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      {expressions.map((expression, index) => (
        <MathText key={`e-${index}`} style={{ fontSize: 18, color: '#202124' }}>{expression}</MathText>
      ))}
    </div>
  );
}

function LabelledItems({ items }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 5 }}>
      {items.map((item) => (
        <li key={item.id} style={{ fontSize: 15, color: '#202124', lineHeight: 1.6 }}>
          <MathText>{item.label}</MathText>
        </li>
      ))}
    </ul>
  );
}

export const PathQuestionStimulus = ({ stimulus }) => {
  if (!stimulus) return null;
  const hasContent = Boolean(
    stimulus.graph
    || stimulus.table?.rows?.length
    || stimulus.orderedPairs?.length
    || stimulus.steps?.length
    || stimulus.expressions?.length
    || stimulus.items?.length,
  );
  if (!hasContent) return null;

  return (
    <section style={shell} aria-label={stimulus.title || 'Question information'}>
      {stimulus.title && <h2 style={titleStyle}>{stimulus.title}</h2>}
      <StimulusGraph graph={stimulus.graph} />
      <StimulusTable table={stimulus.table} />
      <OrderedPairList pairs={stimulus.orderedPairs} />
      <WorkedSteps steps={stimulus.steps} />
      <ExpressionList expressions={stimulus.expressions} />
      <LabelledItems items={stimulus.items} />
      {stimulus.note && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#5f6368', lineHeight: 1.55 }}>
          <MathText>{stimulus.note}</MathText>
        </p>
      )}
    </section>
  );
};

export default PathQuestionStimulus;
