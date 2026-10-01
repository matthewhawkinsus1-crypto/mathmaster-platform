import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  axisLabels,
  describeCursor,
  formatCoordinate,
  formatPoint,
  initialCursor,
  isCursorKey,
  moveCursor,
  pointerKindOf,
  tapPoint,
  tapTolerance,
  unitX,
  unitY,
} from '../../platform/liveChallenge/rushGraphModel.js';

/*
 * THE GRAPH A STUDENT TAPS.
 *
 * Drawn in CSS pixels at whatever square the screen gives it. The grid, axes,
 * labels and curve change only with the question or the size, so they live in
 * a memoized layer; a tap redraws only the marks on top. Input is pointerdown
 * (no click delay on touch), and the keyboard moves a cursor on the half grid
 * — every target sits on it — with Enter to choose.
 */

const LABEL_GAP = 6;

// How the student last used the page. A graph focused when play begins shows
// its keyboard ring only to a student who has been using the keyboard; a
// finger or a mouse never sees it.
let lastModality = 'pointer';
let modalityListeners = false;
const watchModality = () => {
  if (modalityListeners || typeof document === 'undefined') return;
  modalityListeners = true;
  document.addEventListener('keydown', (event) => { if (!event.metaKey && !event.altKey && !event.ctrlKey) lastModality = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { lastModality = 'pointer'; }, true);
};

const GraphLayer = memo(function GraphLayer({ drawing, view, side }) {
  const labels = useMemo(() => axisLabels(view, side), [view, side]);
  const font = Math.max(11, Math.min(15, Math.round(side / 42)));
  const axisX = drawing.grid.axisU * side;
  const axisY = drawing.grid.axisV * side;
  // Labels sit beside their axis, flipping to the other side near an edge.
  const xLabelY = axisY + font + 3 > side - 2 ? axisY - LABEL_GAP : axisY + font + 3;
  const yLabelOnLeft = axisX > font * 2.6;
  const halo = { paintOrder: 'stroke', stroke: 'var(--mm-graph-bg)', strokeWidth: 3, strokeLinejoin: 'round' };
  return (
    <g aria-hidden="true">
      <rect width={side} height={side} fill="var(--mm-graph-bg)" />
      {drawing.grid.verticals.map((line) => (
        <line key={`gx${line.value}`} x1={line.u * side} x2={line.u * side} y1={0} y2={side} stroke="var(--mm-graph-grid)" strokeWidth={1} />
      ))}
      {drawing.grid.horizontals.map((line) => (
        <line key={`gy${line.value}`} x1={0} x2={side} y1={line.v * side} y2={line.v * side} stroke="var(--mm-graph-grid)" strokeWidth={1} />
      ))}
      <line x1={0} x2={side} y1={axisY} y2={axisY} stroke="var(--mm-graph-axis)" strokeWidth={2} />
      <line x1={axisX} x2={axisX} y1={0} y2={side} stroke="var(--mm-graph-axis)" strokeWidth={2} />
      <g fill="var(--mm-graph-label)" fontSize={font} fontWeight={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {labels.x.map((label) => (
          <text key={`lx${label.value}`} x={label.u * side} y={xLabelY} textAnchor="middle" style={halo}>{formatCoordinate(label.value)}</text>
        ))}
        {labels.y.map((label) => (
          <text
            key={`ly${label.value}`}
            x={yLabelOnLeft ? axisX - LABEL_GAP : axisX + LABEL_GAP}
            y={label.v * side + font * 0.35}
            textAnchor={yLabelOnLeft ? 'end' : 'start'}
            style={halo}
          >
            {formatCoordinate(label.value)}
          </text>
        ))}
        <text x={yLabelOnLeft ? axisX - LABEL_GAP : axisX + LABEL_GAP} y={xLabelY} textAnchor={yLabelOnLeft ? 'end' : 'start'} style={halo}>0</text>
      </g>
      {drawing.asymptotes.vertical.map((u) => (
        <line key={`av${u}`} x1={u * side} x2={u * side} y1={0} y2={side} stroke="var(--mm-graph-axis)" strokeWidth={1.5} strokeDasharray="7 6" opacity={0.75} />
      ))}
      {drawing.asymptotes.horizontal.map((v) => (
        <line key={`ah${v}`} x1={0} x2={side} y1={v * side} y2={v * side} stroke="var(--mm-graph-axis)" strokeWidth={1.5} strokeDasharray="7 6" opacity={0.75} />
      ))}
      <g transform={`scale(${side})`}>
        {drawing.paths.map((path, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <path key={index} d={path} fill="none" stroke="var(--mm-rush-curve)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {drawing.dots.map((dot) => (
        <circle
          key={`d${dot.u}-${dot.v}`}
          cx={dot.u * side}
          cy={dot.v * side}
          r={5.5}
          fill={dot.closed ? 'var(--mm-rush-curve)' : 'var(--mm-graph-bg)'}
          stroke="var(--mm-rush-curve)"
          strokeWidth={2.5}
        />
      ))}
    </g>
  );
});

function FoundMark({ target, view, side, fresh }) {
  const cx = unitX(view, target.x) * side;
  const cy = unitY(view, target.y) * side;
  const nearRight = cx > side - 90;
  const nearTop = cy < 28;
  return (
    <g className={fresh ? 'mm-rush-found mm-rush-found-fresh' : 'mm-rush-found'} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <circle cx={cx} cy={cy} r={11} fill="var(--mm-rush-found)" stroke="var(--mm-graph-bg)" strokeWidth={2.5} />
      <path d={`M${cx - 5} ${cy + 0.5} L${cx - 1.5} ${cy + 4} L${cx + 5.5} ${cy - 4}`} fill="none" stroke="var(--mm-graph-bg)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <text
        x={nearRight ? cx - 16 : cx + 16}
        y={nearTop ? cy + 24 : cy - 13}
        textAnchor={nearRight ? 'end' : 'start'}
        fontSize={13}
        fontWeight={900}
        fill="var(--mm-rush-found)"
        style={{ paintOrder: 'stroke', stroke: 'var(--mm-graph-bg)', strokeWidth: 4, strokeLinejoin: 'round' }}
      >
        {formatPoint(target)}
      </text>
    </g>
  );
}

function MissMark({ x, y, view, side }) {
  const cx = unitX(view, x) * side;
  const cy = unitY(view, y) * side;
  const arm = 7;
  return (
    <g className="mm-rush-miss" style={{ transformOrigin: `${cx}px ${cy}px` }} aria-hidden="true">
      <circle cx={cx} cy={cy} r={13} fill="none" stroke="var(--mm-rush-miss)" strokeWidth={2} opacity={0.6} />
      <path d={`M${cx - arm} ${cy - arm} L${cx + arm} ${cy + arm} M${cx + arm} ${cy - arm} L${cx - arm} ${cy + arm}`} stroke="var(--mm-rush-miss)" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/**
 * @param {object}   props.question   the public question (graph, view, targets)
 * @param {object}   props.drawing    graphDrawing(question), memoized by the caller
 * @param {number}   props.side       plot size in CSS pixels
 * @param {string[]} props.found      target ids already found on this graph
 * @param {object}   props.feedback   the session's latest feedback event
 * @param {boolean}  props.paused     input paused (cooldown, time up): drawn dimmed;
 *                                    taps still reach onTap, which refuses them
 * @param {Function} props.onTap      ({ x, y, pointer, tolerance }) => void
 */
function GraphFeatureRushGraph({ question, drawing, side, found = [], feedback = null, paused = false, onTap, label }) {
  const svgRef = useRef(null);
  const view = question.view;
  const [cursor, setCursor] = useState(() => initialCursor(view));
  const [cursorVisible, setCursorVisible] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  useEffect(watchModality, []);

  // A new graph starts the keyboard cursor at its origin again.
  useEffect(() => {
    setCursor(initialCursor(view));
    setAnnouncement('');
  }, [question.questionIndex, view]);

  const foundTargets = useMemo(
    () => (question.targets || []).filter((target) => found.includes(target.id)),
    [question.targets, found],
  );
  const freshTarget = feedback && feedback.questionIndex === question.questionIndex ? feedback.targetId : null;
  const missAt = feedback && feedback.kind === 'miss' && feedback.questionIndex === question.questionIndex && Number.isFinite(feedback.x)
    ? feedback
    : null;

  const choose = (point, pointer) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    onTap?.({ x: point.x, y: point.y, pointer, tolerance: tapTolerance({ pointer, rect, view }) });
  };

  const handlePointerDown = (event) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const point = tapPoint({ clientX: event.clientX, clientY: event.clientY, rect, view });
    if (!point) return;
    // No emulated mouse events, no text selection, no double-tap zoom.
    event.preventDefault();
    setCursorVisible(false);
    choose(point, pointerKindOf(event.pointerType));
  };

  const handleKeyDown = (event) => {
    if (isCursorKey(event.key)) {
      event.preventDefault();
      const next = moveCursor(view, cursor, event.key, { large: event.shiftKey });
      setCursor(next);
      setCursorVisible(true);
      setAnnouncement(describeCursor(question, next));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setCursorVisible(true);
      choose(cursor, 'keyboard');
    }
  };

  const cursorX = unitX(view, cursor.x) * side;
  const cursorY = unitY(view, cursor.y) * side;

  return (
    <>
      <svg
        ref={svgRef}
        className="mm-rush-graph"
        role="application"
        aria-roledescription="graph"
        aria-label={label}
        aria-disabled={paused}
        tabIndex={0}
        width={side}
        height={side}
        viewBox={`0 0 ${side} ${side}`}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onFocus={() => setCursorVisible(lastModality === 'keyboard')}
        onBlur={() => setCursorVisible(false)}
        style={{
          display: 'block',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: paused ? 'not-allowed' : 'crosshair',
          overflow: 'hidden',
          borderRadius: 12,
          outline: cursorVisible ? '3px solid var(--mm-focus)' : 'none',
          outlineOffset: 3,
        }}
      >
        <GraphLayer drawing={drawing} view={view} side={side} />
        {foundTargets.map((target) => (
          <FoundMark key={target.id} target={target} view={view} side={side} fresh={target.id === freshTarget} />
        ))}
        {missAt && <MissMark key={missAt.seq} x={missAt.x} y={missAt.y} view={view} side={side} />}
        {cursorVisible && (
          <g aria-hidden="true" pointerEvents="none">
            <line x1={cursorX} x2={cursorX} y1={0} y2={side} stroke="var(--mm-focus)" strokeWidth={1.5} strokeDasharray="4 4" />
            <line x1={0} x2={side} y1={cursorY} y2={cursorY} stroke="var(--mm-focus)" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={cursorX} cy={cursorY} r={9} fill="none" stroke="var(--mm-focus)" strokeWidth={3} />
          </g>
        )}
      </svg>
      <div aria-live="polite" className="mm-rush-visually-hidden">{announcement}</div>
    </>
  );
}

export default memo(GraphFeatureRushGraph);
