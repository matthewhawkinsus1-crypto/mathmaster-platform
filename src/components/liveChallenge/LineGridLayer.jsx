import { memo, useMemo } from 'react';
import { formatCoordinate, lineAxisLabels, lineGrid, unitX, unitY } from '../../platform/liveChallenge/lineGraphModel.js';

/*
 * THE GRID UNDER EVERY GRAPH THE LINE PICTURE: the student's grid
 * (LineGraphCanvas) and a revealed line (LineRevealGraph). Grid lines at every
 * whole number, both axes, labels thinned to fit, drawn in SVG pixels at the
 * square the screen gives it. It changes only with the view or the size, so
 * it is memoized: a dragged point redraws only the marks above it.
 */

const LABEL_GAP = 6;
const halo = { paintOrder: 'stroke', stroke: 'var(--mm-graph-bg)', strokeWidth: 3, strokeLinejoin: 'round' };

function LineGridLayer({ view, side }) {
  const grid = useMemo(() => lineGrid(view), [view]);
  const labels = useMemo(() => lineAxisLabels(view, side), [view, side]);
  const font = Math.max(11, Math.min(15, Math.round(side / 40)));
  const axisX = grid.axisU * side;
  const axisY = grid.axisV * side;
  // Labels sit beside their axis, flipping to the other side near an edge.
  const xLabelY = axisY + font + 3 > side - 2 ? axisY - LABEL_GAP : axisY + font + 3;
  const yLabelOnLeft = axisX > font * 2.6;
  return (
    <g aria-hidden="true">
      <rect width={side} height={side} fill="var(--mm-graph-bg)" />
      {grid.verticals.map((line) => (
        <line key={`gx${line.value}`} x1={line.u * side} x2={line.u * side} y1={0} y2={side} stroke="var(--mm-graph-grid)" strokeWidth={1} />
      ))}
      {grid.horizontals.map((line) => (
        <line key={`gy${line.value}`} x1={0} x2={side} y1={line.v * side} y2={line.v * side} stroke="var(--mm-graph-grid)" strokeWidth={1} />
      ))}
      <line x1={0} x2={side} y1={axisY} y2={axisY} stroke="var(--mm-graph-axis)" strokeWidth={2} />
      <line x1={axisX} x2={axisX} y1={0} y2={side} stroke="var(--mm-graph-axis)" strokeWidth={2} />
      <g fill="var(--mm-graph-label)" fontSize={font} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {labels.x.map((value) => (
          <text key={`lx${value}`} x={unitX(view, value) * side} y={xLabelY} textAnchor="middle" style={halo}>{formatCoordinate(value)}</text>
        ))}
        {labels.y.map((value) => (
          <text key={`ly${value}`} x={yLabelOnLeft ? axisX - LABEL_GAP : axisX + LABEL_GAP} y={unitY(view, value) * side + font * 0.35} textAnchor={yLabelOnLeft ? 'end' : 'start'} style={halo}>
            {formatCoordinate(value)}
          </text>
        ))}
        <text x={yLabelOnLeft ? axisX - LABEL_GAP : axisX + LABEL_GAP} y={xLabelY} textAnchor={yLabelOnLeft ? 'end' : 'start'} style={halo}>0</text>
      </g>
    </g>
  );
}

export default memo(LineGridLayer);
