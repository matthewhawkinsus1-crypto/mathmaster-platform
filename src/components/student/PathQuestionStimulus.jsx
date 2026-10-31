import React from 'react';
import MathText from '../common/MathText.jsx';
import CoordinatePlane from '../../tools/shared/CoordinatePlane.jsx';
import { stimulusShadingRegions } from '../../platform/graph/stimulusShading.js';
import { boundaryDash } from '../../platform/graph/verticalLineStyle.js';

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
  border: '1px solid var(--mm-border)',
  background: 'var(--mm-surface)',
};

const titleStyle = {
  margin: '0 0 8px',
  fontSize: 'calc(12 * var(--mm-px))',
  fontWeight: 900,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'var(--mm-text-muted)',
};

const cellStyle = {
  padding: '7px 12px',
  border: '1px solid var(--mm-border)',
  fontSize: 'calc(15 * var(--mm-px))',
  color: 'var(--mm-text-strong)',
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
                <th key={`h-${index}`} scope="col" style={{ ...cellStyle, background: 'var(--mm-primary-subtle)', fontWeight: 900 }}>
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

function StimulusGraph({ graph, describeFeatures = null }) {
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
      dash:boundaryDash({ boundaryStyle:line.entry?.boundaryStyle }),
      stroke:line.entry?.stroke,
      label:line.entry?.label || `Line ${index + 1}`,
    })))
    .filter(Boolean);
  // An authored vertical line is a boundary like any other line here, so it
  // keeps its style: x = 5 of x ≤ 5 is solid, as the key and the legend say.
  const verticalLines = resolvedLines
    .filter((line) => line?.vertical)
    .map((line) => ({ x:line.x, boundaryStyle:line.entry?.boundaryStyle, stroke:line.entry?.stroke }));
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

  // Above or below a line; left or right of a vertical boundary (MP16).
  const regions = stimulusShadingRegions({ shading:graph.shading, lines:resolvedLines, bounds });

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
        xTickStep={graph.xTickStep}
        yTickStep={graph.yTickStep}
        revealCoordinates={!graph.readCoordinates}
        pointHoverEnabled={!graph.readCoordinates}
        // Reading the graph is the task: never a table of its values.
        dataTable={!graph.readCoordinates}
        // An author's description that does not give the answer away
        // (src/platform/preflight/graphAccessibilityPreflight.js warns without one).
        description={graph.accessibleDescription || null}
        // null: the question's lifecycle decides (kinds only while it can be
        // answered). A screen that asks nothing — the session recap — passes
        // true for the full reading.
        describeFeatures={describeFeatures}
      >
        {({ sx, sy, plotClip }) => curves.map((curve, index) => (
          <polyline
            key={`curve-${index}`}
            clipPath={plotClip}
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
      {(graph.xAxisLabel || graph.yAxisLabel) && <p style={{ textAlign: 'center', margin: '6px 0', fontSize: 'calc(13 * var(--mm-px))' }}>
        Horizontal axis: {graph.xAxisLabel || 'x'} · Vertical axis: {graph.yAxisLabel || 'y'}
      </p>}
      {sourceLines.length > 1 && (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', justifyContent:'center', marginTop:8, fontSize:'calc(12 * var(--mm-px))', color:'var(--mm-text-muted)' }}>
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
    <p style={{ margin: 0, fontSize: 'calc(17 * var(--mm-px))', color: 'var(--mm-text-strong)', lineHeight: 1.7, textAlign: 'center' }}>
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
        <li key={step.id} style={{ fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--mm-text-muted)', fontWeight: 700, marginRight: 8 }}>{step.label}</span>
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
        <MathText key={`e-${index}`} style={{ fontSize: 'calc(18 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{expression}</MathText>
      ))}
    </div>
  );
}

function LabelledItems({ items }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 5 }}>
      {items.map((item) => (
        <li key={item.id} style={{ fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)', lineHeight: 1.6 }}>
          <MathText>{item.label}</MathText>
        </li>
      ))}
    </ul>
  );
}

// `headingLevel`: the title's level on the page it sits in — 2 under a Path
// question's h1, 4 under a Test result's h3 (SecureExamReview). A panel's
// title is one deeper than its parent's.
const titleTag = (level) => `h${Math.min(6, Math.max(2, Number(level) || 2))}`;

export const PathQuestionStimulus = ({ stimulus, describeFeatures = null, headingLevel = 2 }) => {
  if (!stimulus) return null;
  const hasContent = Boolean(
    stimulus.graph
    || stimulus.note
    || stimulus.table?.rows?.length
    || stimulus.orderedPairs?.length
    || stimulus.steps?.length
    || stimulus.expressions?.length
    || stimulus.items?.length
    || stimulus.panels?.length,
  );
  if (!hasContent) return null;
  const Title = titleTag(headingLevel);

  return (
    <section style={shell} aria-label={stimulus.title || 'Question information'}>
      {/* Titles carry mathematics as often as the cells beneath them do —
          "Candidate check for $\sqrt{x+1}=x-(-1)$" is a stimulus title in the
          Algebra II bank — so the heading gets the same rendering the rest of
          this component already gave its content. */}
      {stimulus.title && <Title style={titleStyle}><MathText>{stimulus.title}</MathText></Title>}
      {(stimulus.panels || []).map((panel, index) => <PathQuestionStimulus key={index} stimulus={panel} describeFeatures={describeFeatures} headingLevel={Math.min(6, headingLevel + 1)} />)}
      <StimulusGraph graph={stimulus.graph} describeFeatures={describeFeatures} />
      <StimulusTable table={stimulus.table} />
      <OrderedPairList pairs={stimulus.orderedPairs} />
      <WorkedSteps steps={stimulus.steps} />
      <ExpressionList expressions={stimulus.expressions} />
      <LabelledItems items={stimulus.items} />
      {stimulus.note && (
        <p style={{ margin: '10px 0 0', fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>
          <MathText>{stimulus.note}</MathText>
        </p>
      )}
    </section>
  );
};

export default PathQuestionStimulus;
