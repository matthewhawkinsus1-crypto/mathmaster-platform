import LineEquation from './LineEquation.jsx';
import LineGridLayer from './LineGridLayer.jsx';
import { formatPoint, lineSegmentInView, unitX, unitY } from '../../platform/liveChallenge/lineGraphModel.js';

/*
 * A GRAPH THE LINE ROUND THE CLASS PLAYED TOGETHER, SHOWN AFTER IT CLOSED.
 *
 * The line everyone was given, through its key points, beside its equation;
 * and — only when at least two students gave it — the wrong answer the class
 * gave most, dashed, with how many gave it. Counts, never names. Drawn from
 * the round's published solution (lineGraphReveal.mjs), which the server
 * writes only once nobody can answer the round; the projector, the teacher's
 * console and each student's results card all draw this one component.
 *
 * Colour is never the only signal: the right line is solid and labelled, the
 * class's mistake dashed and labelled.
 */

const halo = { paintOrder: 'stroke', stroke: 'var(--mm-graph-bg)', strokeWidth: 4, strokeLinejoin: 'round' };

function SegmentLine({ line, view, side, stroke, width, dash = null }) {
  const segment = lineSegmentInView(line, view);
  if (!segment) return null;
  const [from, to] = segment.map((point) => ({ x: unitX(view, point.x) * side, y: unitY(view, point.y) * side }));
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth={width} strokeDasharray={dash || undefined} strokeLinecap="round" />;
}

/** One sentence for the class's round: how many got it, and the common wrong answer. */
export const lineRevealSummary = (lineGraph = {}) => {
  const facts = lineGraph?.class;
  if (!facts || !facts.answered) return '';
  const got = `${facts.correct} of ${facts.answered} ${facts.answered === 1 ? 'student' : 'students'} got it${facts.firstTry ? ` (${facts.firstTry} on the first try)` : ''}.`;
  const mistake = facts.mistake;
  if (!mistake) return got;
  const did = lineGraph.itemType === 'graph' ? 'drew' : 'chose';
  // No-break spaces: the equation never splits across two lines of the sentence.
  const written = mistake.text ? mistake.text.replace(/ /g, '\u00a0') : 'the dashed line';
  return `${got} Most common mistake: ${mistake.students} ${did} ${written}${mistake.label ? ` (${mistake.label.toLowerCase()})` : ''}.`;
};

/**
 * @param {object} props.lineGraph  the published solution's `lineGraph`
 * @param {number} props.size       the graph's side in CSS pixels
 * @param {boolean} props.dark      drawn on the projector's dark arena
 */
export default function LineRevealGraph({ lineGraph, size = 280, dark = false }) {
  if (!lineGraph?.view || !lineGraph?.line) return null;
  const { view, line } = lineGraph;
  const points = (lineGraph.keyPoints?.length ? lineGraph.keyPoints : lineGraph.revealPoints) || [];
  const mistake = lineGraph.class?.mistake || null;
  const summary = lineRevealSummary(lineGraph);
  const textColor = dark ? '#f7f9ff' : 'var(--mm-text-strong)';
  return (
    <figure data-mm-line-reveal="1" style={{ margin: 0, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg
        role="img"
        aria-label={`The line ${lineGraph.equation?.speech || lineGraph.equation?.text || ''}${mistake ? `, and dashed, the wrong line ${mistake.students} students gave` : ''}.`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', borderRadius: 12, flex: '0 0 auto', boxShadow: dark ? '0 8px 30px rgba(0,0,0,.35)' : 'none', border: dark ? 0 : '1px solid var(--mm-border)' }}
      >
        <LineGridLayer view={view} side={size} />
        {mistake && <SegmentLine line={mistake.line} view={view} side={size} stroke="#d93025" width={4} dash="10 8" />}
        <SegmentLine line={line} view={view} side={size} stroke="#1e8e3e" width={5} />
        {points.map((point) => {
          const cx = unitX(view, point.x) * size;
          const cy = unitY(view, point.y) * size;
          const nearRight = cx > size - 70;
          return (
            <g key={`${point.x},${point.y}`}>
              <circle cx={cx} cy={cy} r={6} fill="#1e8e3e" stroke="var(--mm-graph-bg)" strokeWidth={2.5} />
              <text x={nearRight ? cx - 10 : cx + 10} y={cy < 22 ? cy + 20 : cy - 10} textAnchor={nearRight ? 'end' : 'start'} fontSize={12} fontWeight={900} fill="var(--mm-graph-label)" style={halo} aria-hidden="true">
                {formatPoint(point)}
              </text>
            </g>
          );
        })}
        {lineGraph.marked && (
          <circle cx={unitX(view, lineGraph.marked.x) * size} cy={unitY(view, lineGraph.marked.y) * size} r={6} fill="var(--mm-primary)" stroke="var(--mm-graph-bg)" strokeWidth={2.5} />
        )}
      </svg>
      <figcaption style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 8, color: textColor }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span aria-hidden="true" style={{ width: 28, height: 0, borderTop: '5px solid #1e8e3e', borderRadius: 3 }} />
          <LineEquation equation={lineGraph.equation} style={{ fontSize: '1.35em', fontWeight: 900 }} />
        </span>
        {mistake && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span aria-hidden="true" style={{ width: 28, height: 0, borderTop: '4px dashed #d93025' }} />
            <span style={{ fontWeight: 800 }}>{mistake.students} students{mistake.label ? ` · ${mistake.label}` : ''}</span>
          </span>
        )}
        {summary && <span style={{ fontWeight: 700, opacity: 0.9 }}>{summary}</span>}
      </figcaption>
    </figure>
  );
}
