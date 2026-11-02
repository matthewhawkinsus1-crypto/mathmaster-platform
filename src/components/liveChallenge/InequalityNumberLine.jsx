import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  describeLineCursor,
  formatLineNumber,
  isLineCursorKey,
  lineCursorEnd,
  lineEndAtPixel,
  moveLineCursor,
  numberAtPixel,
  numberLineLayout,
  numberLineMarks,
} from '../../platform/liveChallenge/numberLineModel.js';
import { pointerKindOf } from '../../platform/liveChallenge/rushGraphModel.js';

/*
 * THE NUMBER LINE A STUDENT GRAPHS AN INEQUALITY ON (Inequality Graphing Rush).
 *
 * Drawn in CSS pixels at whatever width the screen gives it: −10 to 10, a
 * tick a whole number. A tap anywhere on it — above or below the line counts
 * — drops a dot at the nearest number (the round's session cycles it ● → ○ →
 * gone), and a tap on one of the line's own end arrows turns "keeps going"
 * that way on or off; the keyboard moves a cursor along the ticks, and one
 * step past either end onto its arrow, with Enter to tap. The student's own
 * drawing is in the curve colour; the answer, shown as an item moves on after
 * its third miss, in the found colour.
 */

const BAND = 10;
const DOT_RADIUS = 9;
const ARROW_LENGTH = 15;
const ARROW_HALF_WIDTH = 8;

// How the student last used the page, as the graph tracks it: a line focused
// when play begins shows its keyboard cursor only to a student who has been
// using the keyboard; a finger or a mouse never sees it.
let lastModality = 'pointer';
let modalityListeners = false;
const watchModality = () => {
  if (modalityListeners || typeof document === 'undefined') return;
  modalityListeners = true;
  document.addEventListener('keydown', (event) => { if (!event.metaKey && !event.altKey && !event.ctrlKey) lastModality = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { lastModality = 'pointer'; }, true);
};

const arrowHead = (tipX, cy, outward) => [
  `${tipX},${cy}`,
  `${tipX - outward * ARROW_LENGTH},${cy - ARROW_HALF_WIDTH}`,
  `${tipX - outward * ARROW_LENGTH},${cy + ARROW_HALF_WIDTH}`,
].join(' ');

function LineMarks({ marks, cy, tone }) {
  if (!marks) return null;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {marks.bands.map((band) => (
        <line key={`band${band.from}-${band.to}`} x1={band.from} x2={band.to} y1={cy} y2={cy} stroke={tone} strokeOpacity={0.5} strokeWidth={BAND} strokeLinecap={band.single ? 'round' : 'butt'} />
      ))}
      {marks.arrows.left !== null && <polygon points={arrowHead(marks.arrows.left, cy, -1)} fill={tone} />}
      {marks.arrows.right !== null && <polygon points={arrowHead(marks.arrows.right, cy, 1)} fill={tone} />}
      {marks.dots.map((dot) => (
        <circle key={`dot${dot.value}`} cx={dot.x} cy={cy} r={DOT_RADIUS} fill={dot.closed ? tone : 'var(--mm-graph-bg)'} stroke={tone} strokeWidth={3} />
      ))}
    </g>
  );
}

/**
 * @param {object}   props.question  the item (numberLine, prompt)
 * @param {object}   props.drawing   the student's drawing (numberLineSets)
 * @param {object}   props.reveal    the answer's drawing, while it is shown
 * @param {number}   props.width     CSS pixels
 * @param {number}   props.height    CSS pixels
 * @param {boolean}  props.paused    input paused: drawn dimmed; taps still
 *                                   reach onTap, which refuses them
 * @param {Function} props.onTap     ({ x, y, pointer }) => void, x the number;
 *                                   ({ end: 'left' | 'right', pointer }) for an end arrow
 */
function InequalityNumberLine({ question, drawing = null, reveal = null, width, height, paused = false, onTap, label }) {
  const svgRef = useRef(null);
  const line = question.numberLine;
  const layout = useMemo(() => numberLineLayout(line, width), [line, width]);
  const [cursor, setCursor] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  useEffect(watchModality, []);
  // A new item starts the cursor at 0 again, before it can take a key.
  useLayoutEffect(() => {
    setCursor(0);
    setAnnouncement('');
  }, [question.questionIndex]);

  // After Enter, say what is now at the cursor: "3, closed dot", "3, open dot", "3".
  const keyedRef = useRef(false);
  useEffect(() => {
    if (keyedRef.current) setAnnouncement(describeLineCursor(drawing, cursor));
    keyedRef.current = false;
  }, [drawing, cursor]);

  const cy = Math.round(height * 0.46);
  const font = Math.max(12, Math.min(17, Math.round(width / 46)));
  const marks = useMemo(() => numberLineMarks(line, width, drawing), [line, width, drawing]);
  const revealMarks = useMemo(() => (reveal ? numberLineMarks(line, width, reveal) : null), [line, width, reveal]);

  const tap = (value, pointer) => {
    const end = lineCursorEnd(value);
    if (end) onTap?.({ end, pointer });
    else onTap?.({ x: value, y: 0, pointer });
  };

  const handlePointerDown = (event) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    setCursorVisible(false);
    const px = ((event.clientX - rect.left) / Math.max(1, rect.width)) * width;
    const end = lineEndAtPixel(line, width, px);
    if (end) {
      setCursor(end === 'left' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
      onTap?.({ end, pointer: pointerKindOf(event.pointerType) });
      return;
    }
    const value = numberAtPixel(line, width, px);
    if (value === null) return;
    setCursor(value);
    tap(value, pointerKindOf(event.pointerType));
  };

  const handleKeyDown = (event) => {
    if (isLineCursorKey(event.key)) {
      event.preventDefault();
      const next = moveLineCursor(line, cursor, event.key, { large: event.shiftKey });
      setCursor(next);
      setCursorVisible(true);
      setAnnouncement(describeLineCursor(drawing, next));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setCursorVisible(true);
      keyedRef.current = true;
      tap(cursor, 'keyboard');
    }
  };

  const tickHalf = 9;
  const cursorEnd = lineCursorEnd(cursor);
  let cursorX = layout.xOf(cursor);
  if (cursorEnd === 'left') cursorX = layout.left + ARROW_LENGTH / 2;
  else if (cursorEnd === 'right') cursorX = layout.right - ARROW_LENGTH / 2;
  return (
    <>
      <svg
        ref={svgRef}
        className="mm-rush-graph mm-rush-line"
        role="application"
        aria-roledescription="number line"
        aria-label={label}
        aria-disabled={paused}
        tabIndex={0}
        data-focus-ring="own"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
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
          cursor: paused ? 'not-allowed' : 'pointer',
          borderRadius: 12,
          outline: cursorVisible ? '3px solid var(--mm-focus)' : 'none',
          outlineOffset: 3,
        }}
      >
        <rect width={width} height={height} fill="var(--mm-graph-bg)" />
        <g aria-hidden="true">
          <line x1={layout.left + ARROW_LENGTH - 2} x2={layout.right - ARROW_LENGTH + 2} y1={cy} y2={cy} stroke="var(--mm-graph-axis)" strokeWidth={2.5} />
          <polygon points={arrowHead(layout.left, cy, -1)} fill="var(--mm-graph-axis)" opacity={0.7} />
          <polygon points={arrowHead(layout.right, cy, 1)} fill="var(--mm-graph-axis)" opacity={0.7} />
          {layout.ticks.map((tick) => (
            <g key={tick.value}>
              <line x1={tick.x} x2={tick.x} y1={cy - (tick.labeled ? tickHalf : tickHalf * 0.6)} y2={cy + (tick.labeled ? tickHalf : tickHalf * 0.6)} stroke="var(--mm-graph-axis)" strokeWidth={tick.value === 0 ? 2.5 : 1.5} />
              {tick.labeled && (
                <text x={tick.x} y={cy + tickHalf + font + 6} textAnchor="middle" fontSize={font} fontWeight={tick.value === 0 ? 900 : 700} fill="var(--mm-graph-label)">
                  {formatLineNumber(tick.value)}
                </text>
              )}
            </g>
          ))}
        </g>
        {revealMarks
          ? <LineMarks marks={revealMarks} cy={cy} tone="var(--mm-rush-found)" />
          : <LineMarks marks={marks} cy={cy} tone="var(--mm-rush-curve)" />}
        {cursorVisible && (
          <g aria-hidden="true" pointerEvents="none">
            <line x1={cursorX} x2={cursorX} y1={cy - 30} y2={cy + 30} stroke="var(--mm-focus)" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={cursorX} cy={cy} r={DOT_RADIUS + 4} fill="none" stroke="var(--mm-focus)" strokeWidth={3} />
          </g>
        )}
      </svg>
      <div aria-live="polite" className="mm-rush-visually-hidden">{announcement}</div>
    </>
  );
}

export default memo(InequalityNumberLine);
