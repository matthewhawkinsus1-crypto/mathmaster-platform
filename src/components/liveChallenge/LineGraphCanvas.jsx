import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import LineGridLayer from './LineGridLayer.jsx';
import {
  DRAFT_OUTCOME,
  cancelDraft,
  describeLineCursor,
  draftPoints,
  emptyDraft,
  formatPoint,
  heldLabelSpot,
  initialLineCursor,
  isLineCursorKey,
  keyboardEnter,
  lineSegmentInView,
  lineThrough,
  moveDraft,
  moveLineCursor,
  pointBox,
  pointLabelSpot,
  pointerPoint,
  pointsKey,
  pressDraft,
  releaseDraft,
  slopeStepText,
  unitX,
  unitY,
  verdictBadgeSpot,
} from '../../platform/liveChallenge/lineGraphModel.js';

/*
 * THE GRID A STUDENT DRAWS A LINE ON.
 *
 * Press anywhere on the grid: a point follows the finger, snapped to the
 * nearest grid point, with its coordinates shown ABOVE the finger, where the
 * finger does not cover them (beside it, at the top edge). Let go to place it. Letting go of the second
 * point draws the line and checks it — there is no Submit button. A wrong
 * line stays: drag either point to fix it (each release that changes the
 * line is checked again), or press on empty grid to move the nearer point
 * there. Nothing is checked mid-drag (lineGraphModel.js decides all of it).
 *
 * `mode="show"` draws an item's own line for the student to name, with its
 * marked point; it takes no input.
 *
 * Input: pointer events with capture, so a drag may leave the plot and come
 * back; `touch-action: none`, so a vertical drag never scrolls the page and
 * drops the point; and the keyboard — arrows move a crosshair, Enter places,
 * picks up and drops a point, Escape puts a held point back.
 */

// The keyboard ring shows only to a student using the keyboard
// (GraphFeatureRushGraph's rule): a finger or a mouse never sees it. The svg
// opts out of the page's own :focus-visible ring (data-focus-ring="own"),
// which a focus given when play begins would otherwise leave on through every
// press of a mouse or a finger.
let lastModality = 'pointer';
let modalityListeners = false;
const watchModality = () => {
  if (modalityListeners || typeof document === 'undefined') return;
  modalityListeners = true;
  document.addEventListener('keydown', (event) => { if (!event.metaKey && !event.altKey && !event.ctrlKey) lastModality = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { lastModality = 'pointer'; }, true);
};

const halo = { paintOrder: 'stroke', stroke: 'var(--mm-graph-bg)', strokeWidth: 3, strokeLinejoin: 'round' };

const toScreen = (view, side, point) => ({ x: unitX(view, point.x) * side, y: unitY(view, point.y) * side });

/** A line from edge to edge of the plot, in pixels. */
function FullLine({ line, view, side, stroke, width = 4, dash = null, opacity = 1, className = undefined }) {
  const segment = lineSegmentInView(line, view);
  if (!segment) return null;
  const [from, to] = segment.map((point) => toScreen(view, side, point));
  return (
    <line
      className={className}
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dash || undefined}
      opacity={opacity}
    />
  );
}

// The ✓ or ✗ on a judged line, clear of its points and their coordinates:
// colour is never the only signal.
function VerdictBadge({ line, points, view, side, right }) {
  const segment = lineSegmentInView(line, view);
  if (!segment) return null;
  const [from, to] = segment.map((point) => toScreen(view, side, point));
  const avoid = points.flatMap((point) => {
    const at = toScreen(view, side, point);
    return [pointBox(at), pointLabelSpot({ at, side, text: formatPoint(point) }).box];
  });
  const { x: cx, y: cy } = verdictBadgeSpot({ from, to, avoid, side });
  const fill = right ? 'var(--mm-line-right)' : 'var(--mm-line-wrong)';
  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={13} fill={fill} stroke="var(--mm-graph-bg)" strokeWidth={2.5} />
      {right
        ? <path d={`M${cx - 6} ${cy + 0.5} L${cx - 1.5} ${cy + 5} L${cx + 6.5} ${cy - 5}`} fill="none" stroke="var(--mm-graph-bg)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        : <path d={`M${cx - 5} ${cy - 5} L${cx + 5} ${cy + 5} M${cx + 5} ${cy - 5} L${cx - 5} ${cy + 5}`} stroke="var(--mm-graph-bg)" strokeWidth={3} strokeLinecap="round" />}
    </g>
  );
}

// "up 2, right 3": the run then the rise, from the first point to the second.
function SlopeSteps({ from, to, view, side }) {
  const text = slopeStepText(from, to);
  if (!text) return null;
  const a = toScreen(view, side, from);
  const corner = toScreen(view, side, { x: to.x, y: from.y });
  const b = toScreen(view, side, to);
  const [rise, run] = [to.y - from.y, to.x - from.x];
  const labelHalo = { ...halo, strokeWidth: 4 };
  return (
    <g aria-hidden="true" pointerEvents="none">
      <path d={`M${a.x} ${a.y} L${corner.x} ${corner.y} L${b.x} ${b.y}`} fill="none" stroke="var(--mm-line-helper)" strokeWidth={2.5} strokeDasharray="6 5" />
      <g fontSize={13} fontWeight={900} fill="var(--mm-line-helper)">
        {run !== 0 && <text x={(a.x + corner.x) / 2} y={corner.y + (rise > 0 ? 18 : -9)} textAnchor="middle" style={labelHalo}>{`${run > 0 ? 'right' : 'left'} ${Math.abs(run)}`}</text>}
        {rise !== 0 && <text x={corner.x + (run >= 0 ? 8 : -8)} y={(corner.y + b.y) / 2 + 4} textAnchor={run >= 0 ? 'start' : 'end'} style={labelHalo}>{`${rise > 0 ? 'up' : 'down'} ${Math.abs(rise)}`}</text>}
      </g>
    </g>
  );
}

function PointMark({ point, view, side, held = false, label = true }) {
  const at = toScreen(view, side, point);
  const text = formatPoint(point);
  const spot = pointLabelSpot({ at, side, text });
  return (
    <g pointerEvents="none">
      {held && <circle cx={at.x} cy={at.y} r={20} fill="var(--mm-line-draw)" opacity={0.18} />}
      <circle cx={at.x} cy={at.y} r={held ? 10 : 8} fill="var(--mm-line-draw)" stroke="var(--mm-graph-bg)" strokeWidth={3} />
      {label && !held && (
        <text
          x={spot.x}
          y={spot.y}
          textAnchor={spot.anchor}
          fontSize={12}
          fontWeight={800}
          fill="var(--mm-graph-label)"
          style={{ ...halo, strokeWidth: 4 }}
          aria-hidden="true"
        >
          {text}
        </text>
      )}
    </g>
  );
}

// The held point's coordinates: above the finger, or beside it at the top edge.
function HeldLabel({ point, view, side, holder }) {
  const text = formatPoint(point);
  const width = 14 + text.length * 9.5;
  const { x: cx, y: cy } = heldLabelSpot({ at: toScreen(view, side, point), side, holder, width, height: 30 });
  return (
    <g className="mm-line-held" pointerEvents="none" aria-hidden="true">
      <rect x={cx - width / 2} y={cy - 15} width={width} height={30} rx={15} fill="var(--mm-line-label-bg)" stroke="var(--mm-line-draw)" strokeWidth={2} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={17} fontWeight={900} fill="var(--mm-line-label-text)" style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</text>
    </g>
  );
}

/**
 * @param {object}   props.question  the public item (view, line, marked, reveal)
 * @param {number}   props.side      plot size in CSS pixels
 * @param {string}   props.mode      'draw' (Graph it) or 'show' (Name it)
 * @param {boolean}  props.paused    no input (a pause after misses, a flash, time up)
 * @param {object}   props.verdict   { key, kind } — how the line through exactly
 *                                   these points (pointsKey) was judged:
 *                                   'correct' | 'wrong' | 'method'
 * @param {boolean}  props.revealed  out of tries: draw the answer, dashed
 * @param {boolean}  props.slopeHelper  show "up 2, right 3" between the points
 * @param {string}   props.resetKey  a new value clears the points (new item, Start over)
 * @param {Function} props.onLine    (points) => void, on a release that completes or changes a line
 */
function LineGraphCanvas({
  question,
  side,
  mode = 'draw',
  paused = false,
  verdict = null,
  revealed = false,
  slopeHelper = false,
  resetKey = '',
  onLine,
  label = 'Graph',
}) {
  const view = question.view;
  const svgRef = useRef(null);
  const [draft, setDraftState] = useState(emptyDraft);
  const draftRef = useRef(draft);
  const pointerRef = useRef(null);
  const [holder, setHolder] = useState('mouse');
  const [cursor, setCursor] = useState(() => initialLineCursor(view));
  const [cursorVisible, setCursorVisible] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(watchModality, []);

  const setDraft = (next) => {
    draftRef.current = next;
    setDraftState(next);
  };

  // A new item (or Start over) starts from an empty grid. A LAYOUT effect, so
  // the reset has happened before the browser can hand this item a key: as a
  // passive effect it ran a moment after the commit, and an arrow pressed in
  // that moment was moved and announced by its handler, then undone by the
  // late reset (the same race the Rush graph had, CI06).
  useLayoutEffect(() => {
    pointerRef.current = null;
    setDraft(emptyDraft());
    setCursor(initialLineCursor(view));
    setAnnouncement('');
  }, [resetKey, view]);

  // A pause (time up, the flash) drops whatever is held.
  useEffect(() => {
    if (paused && draftRef.current.active) {
      pointerRef.current = null;
      setDraft(cancelDraft(draftRef.current));
    }
  }, [paused]);

  const settle = ({ draft: next, outcome }) => {
    setDraft(next);
    if (outcome === DRAFT_OUTCOME.LINE) {
      setAnnouncement(`Line through ${formatPoint(next.points[0])} and ${formatPoint(next.points[1])}.`);
      onLine?.(next.points);
    } else if (outcome === DRAFT_OUTCOME.PLACED) {
      setAnnouncement(`Point placed at ${formatPoint(next.points[0])}. Now place a second point.`);
    } else if (outcome === DRAFT_OUTCOME.SAME_POINT) {
      setAnnouncement('A line needs two different points — that point is already placed.');
    } else if (outcome === DRAFT_OUTCOME.PICKED_UP) {
      setAnnouncement('Point picked up. Move it with the arrow keys, then press Enter to drop it.');
    }
  };

  const drawing = mode === 'draw';
  const rectOf = () => svgRef.current?.getBoundingClientRect();

  const handlePointerDown = (event) => {
    if (!drawing || pausedRef.current || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = pointerPoint({ clientX: event.clientX, clientY: event.clientY, rect: rectOf(), view });
    if (!point) return;
    // No emulated mouse events, no text selection, no double-tap zoom.
    event.preventDefault();
    try { svgRef.current?.setPointerCapture?.(event.pointerId); } catch { /* capture is a nicety */ }
    pointerRef.current = event.pointerId;
    setHolder(event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse');
    setCursorVisible(false);
    setDraft(pressDraft(draftRef.current, point, { view }));
  };

  const handlePointerMove = (event) => {
    if (pointerRef.current === null || event.pointerId !== pointerRef.current) return;
    const point = pointerPoint({ clientX: event.clientX, clientY: event.clientY, rect: rectOf(), view, clamp: true });
    if (!point) return;
    const next = moveDraft(draftRef.current, point, { view });
    if (next !== draftRef.current) setDraft(next);
  };

  const handlePointerUp = (event) => {
    if (pointerRef.current === null || event.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    // A release counts where the finger WAS: the last move put it there.
    settle(releaseDraft(draftRef.current));
  };

  const handlePointerCancel = (event) => {
    if (pointerRef.current === null || event.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    setDraft(cancelDraft(draftRef.current));
  };

  const handleKeyDown = (event) => {
    if (!drawing) return;
    if (isLineCursorKey(event.key)) {
      event.preventDefault();
      const next = moveLineCursor(view, cursor, event.key, { large: event.shiftKey });
      setCursor(next);
      setCursorVisible(true);
      const held = moveDraft(draftRef.current, next, { view });
      if (held !== draftRef.current) setDraft(held);
      setAnnouncement(describeLineCursor(next, held));
      return;
    }
    if (event.key === 'Escape' && draftRef.current.active) {
      event.preventDefault();
      setDraft(cancelDraft(draftRef.current));
      setAnnouncement('Point put back.');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setCursorVisible(true);
      if (pausedRef.current) return;
      setHolder('keyboard');
      settle(keyboardEnter(draftRef.current, cursor, { view }));
    }
  };

  const points = draftPoints(draft);
  const held = draft.active;
  const studentLine = points.length === 2 ? lineThrough(points[0], points[1]) : null;
  const judged = !held && verdict && verdict.key === pointsKey(draft.points) ? verdict.kind : null;
  let stroke = 'var(--mm-line-draw)';
  if (judged === 'correct') stroke = 'var(--mm-line-right)';
  else if (judged === 'wrong') stroke = 'var(--mm-line-wrong)';
  else if (judged === 'method') stroke = 'var(--mm-line-method)';
  const answerLine = revealed && question.reveal?.points?.length === 2 ? lineThrough(question.reveal.points[0], question.reveal.points[1]) : null;
  const cursorAt = toScreen(view, side, cursor);

  return (
    <>
      <svg
        ref={svgRef}
        className="mm-line-graph"
        role={drawing ? 'application' : 'img'}
        aria-roledescription={drawing ? 'graph' : undefined}
        aria-label={label}
        aria-disabled={drawing ? paused : undefined}
        tabIndex={drawing ? 0 : -1}
        data-focus-ring="own"
        width={side}
        height={side}
        viewBox={`0 0 ${side} ${side}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        onKeyDown={handleKeyDown}
        onFocus={() => setCursorVisible(drawing && lastModality === 'keyboard')}
        onBlur={() => setCursorVisible(false)}
        style={{
          display: 'block',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          cursor: drawing ? (paused ? 'not-allowed' : 'crosshair') : 'default',
          overflow: 'hidden',
          borderRadius: 12,
          outline: cursorVisible ? '3px solid var(--mm-focus)' : 'none',
          outlineOffset: 3,
        }}
      >
        <LineGridLayer view={view} side={side} />
        {!drawing && <FullLine line={question.line} view={view} side={side} stroke="var(--mm-line-given)" width={4} />}
        {!drawing && question.marked && (
          <circle cx={toScreen(view, side, question.marked).x} cy={toScreen(view, side, question.marked).y} r={7} fill="var(--mm-line-given)" stroke="var(--mm-graph-bg)" strokeWidth={3} />
        )}
        {drawing && studentLine && <FullLine line={studentLine} view={view} side={side} stroke={stroke} width={judged ? 5 : 4} opacity={answerLine ? 0.35 : 1} />}
        {drawing && slopeHelper && points.length === 2 && !answerLine && judged !== 'correct' && <SlopeSteps from={points[0]} to={points[1]} view={view} side={side} />}
        {answerLine && <FullLine line={answerLine} view={view} side={side} stroke="var(--mm-line-right)" width={5} dash="12 9" className="mm-line-reveal" />}
        {answerLine && question.reveal.points.map((point) => {
          const at = toScreen(view, side, point);
          return <circle key={`r${point.x},${point.y}`} cx={at.x} cy={at.y} r={7} fill="var(--mm-line-right)" stroke="var(--mm-graph-bg)" strokeWidth={3} />;
        })}
        {drawing && points.map((point, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <PointMark key={index} point={point} view={view} side={side} held={held?.index === index} label={!answerLine} />
        ))}
        {drawing && studentLine && (judged === 'correct' || judged === 'wrong') && !answerLine && (
          <VerdictBadge line={studentLine} points={points} view={view} side={side} right={judged === 'correct'} />
        )}
        {held && <HeldLabel point={held.point} view={view} side={side} holder={holder} />}
        {cursorVisible && (
          <g aria-hidden="true" pointerEvents="none">
            <line x1={cursorAt.x} x2={cursorAt.x} y1={0} y2={side} stroke="var(--mm-focus)" strokeWidth={1.5} strokeDasharray="4 4" />
            <line x1={0} x2={side} y1={cursorAt.y} y2={cursorAt.y} stroke="var(--mm-focus)" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={cursorAt.x} cy={cursorAt.y} r={11} fill="none" stroke="var(--mm-focus)" strokeWidth={3} />
          </g>
        )}
      </svg>
      <div aria-live="polite" className="mm-line-visually-hidden">{announcement}</div>
    </>
  );
}

export default memo(LineGraphCanvas);
