import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clientPointToGraphCoordinate } from '../../utils/responsiveCoordinates.js';
import { resolvePointFill, resolvePointRadius } from '../../graphSpecUtils';
import { readGraphPointCoordinates } from '../../graphPointUtils';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';

// Shared by every Batch A-D tool, so an unguarded window froze three labs at
// once. A step of 0/NaN never terminates, and a legitimate step across a huge
// window runs for billions of iterations; both are reachable from authored
// question JSON. 200 ticks is past the point axis labels stay readable.
const MAX_TICKS = 200;
// Minor gridlines are a readability aid, not data. Past this count they stop
// being countable squares and just grey the plot out, so we drop them.
const MAX_MINOR_LINES = 90;

// Square, and at the touch minimum. A zoom control small enough to miss is a
// zoom control that makes aiming worse, which is the problem it is here to fix.
const ZOOM_BUTTON = {
  minWidth: 44,
  minHeight: 44,
  border: '1px solid #c5d5ef',
  borderRadius: 8,
  background: '#fff',
  color: '#174ea6',
  fontWeight: 800,
  fontSize: 16,
  cursor: 'pointer',
};

const buildTicks = (min, max, step) => {
  const low = Number(min);
  const high = Number(max);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return [];

  let increment = Number(step);
  if (!Number.isFinite(increment) || increment <= 0) increment = (high - low) / 10;
  const span = high - low;
  if (span / increment > MAX_TICKS) increment = span / MAX_TICKS;
  if (!Number.isFinite(increment) || increment <= 0) return [];

  const ticks = [];
  const first = Math.ceil(low / increment) * increment;
  if (!Number.isFinite(first)) return [];
  for (let value = first; value <= high + 1e-9; value += increment) {
    ticks.push(value);
    if (ticks.length >= MAX_TICKS) break;
  }
  return ticks;
};

const tidy = (value) => Number(Number(value).toFixed(6));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// `Math.round(v / step) * step` reintroduces float noise for steps like 0.1,
// which would then render as "0.30000000000000004" in the coordinate readout.
const snapValue = (value, step) => {
  const size = Number(step);
  if (!Number.isFinite(value)) return null;
  if (!Number.isFinite(size) || size <= 0) return tidy(value);
  return tidy(Math.round(value / size) * size);
};

const pointXY = (point) => {
  const coordinates = readGraphPointCoordinates(point);
  return coordinates || [Number.NaN, Number.NaN];
};
const formatCoordinate = (point) => { const [x, y] = pointXY(point); return `(${tidy(x)}, ${tidy(y)})`; };

export default function CoordinatePlane({
  xMin: domainXMin = -10, xMax: domainXMax = 10, yMin: domainYMin = -10, yMax: domainYMax = 10,
  width = 560, height = 380,
  points = [], lines = [], functions = [], polylines = [], regions = [], verticalLines = [], horizontalLines = [],
  onPlot = null,
  // Given, an existing point can be picked up and moved instead of only being
  // replaced by plotting a new one. Optional: a tool that does not own indexed
  // points simply keeps the plot-only behaviour.
  onMovePoint = null,
  // Whole numbers by default: an Algebra I student asked to plot (3, -2) should
  // never be able to land on (3, -1.5). Tools pass 0.5/0.25 only when the
  // question genuinely lives between the gridlines.
  snapStep = 1,
  cursorLabel = 'Point',
  // COORDINATE READOUT — ON BY DEFAULT, OFF WHERE READING THE PLANE IS THE ANSWER.
  //
  // Normally the plane tells a student what they are aiming at, because landing
  // accurately on (3, -2) is the task and a misread axis is not what is being
  // assessed. But a question that asks a student to CLICK the x-intercept and
  // then WRITE it as an ordered pair is assessing exactly that reading, and a
  // chip printing "(4, 0)" the moment they touch it answers the second half for
  // them.
  //
  // Set false there. Gridlines, axis numbers and the crosshair all STAY —
  // counting gridlines is the skill, and hiding the grid would not make the
  // question harder, only unanswerable. What goes is the numeric readout.
  //
  // The screen-reader announcement is deliberately NOT suppressed. It is not a
  // hint, it is the only rendering of the plane a blind student has, and taking
  // it away makes the question impossible rather than harder. A sighted student
  // reads position off the axes; a screen-reader student reads it off the live
  // region. Both are reading the plane.
  revealCoordinates = true,
  ariaLabel = 'Coordinate plane',
  // EVERY PLANE CAN BE OPENED FULL WINDOW.
  //
  // This component is the plane behind fifteen surfaces, so the squeeze that
  // made one Path graph 587px wide on a 1366px Chromebook applies to all of
  // them: a card, then a tool shell, then a sidebar of controls, each cap
  // individually reasonable. Enlarging is safe here because the SVG scales from
  // its viewBox and every click is converted through getBoundingClientRect at
  // event time, so plotting stays accurate at any size.
  //
  // Set false where the plane sits INSIDE another control. A button nested in a
  // button is invalid markup, and the enlarge press would also fire the card
  // selection underneath it.
  //
  // A PLANE THE STUDENT PLOTS ON NEVER ENLARGES ITSELF, whatever this says.
  // The enlarged view is a modal, and this component holds only the plane — the
  // Check button, the task list and the feedback all belong to the tool around
  // it and stay behind the backdrop. Enlarging a read-only graph to look at it
  // is complete; enlarging a plane you are answering with is a dead end you
  // have to close before you can submit. Tools whose plane is interactive wrap
  // their whole split instead, so the controls come with it.
  enlargeable = true,
  // Pan and zoom. Null means "decide from context": a plane a student plots on
  // gets it, a read-only figure does not — a static graph is already framed the
  // way its author intended and moving it only loses that framing.
  panZoom = null,
  // Something that changes when the QUESTION changes. Needed because the tool
  // is not remounted between questions, and resetting on the bound values alone
  // misses the common case of two questions sharing a window: a student who
  // zoomed into a corner on one would arrive already zoomed into the next.
  viewResetKey = null,
  children,
}) {
  const pad = 42;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const interactive = typeof onPlot === 'function';

  /*
   * PAN AND ZOOM, WITHOUT STEALING THE PLOTTING FINGER.
   *
   * The reason this exists is a measurement: on a 390px phone the embedded plane
   * is 310px and enlarging it reaches 348px, because there is simply no more
   * room in portrait. Twelve percent does not make a target the width of a
   * fingertip any easier to hit. Being able to zoom in on the part of the plane
   * that matters does.
   *
   * THE GESTURE BUDGET IS THE WHOLE DESIGN PROBLEM. One finger already means
   * "place a point", and that must not change — it is the gesture students
   * learn first and use most. So:
   *
   *   one finger      place or drag a point   (unchanged)
   *   two fingers     pinch to zoom, slide to pan
   *   wheel           zoom about the cursor   (desktop)
   *   buttons         zoom in, zoom out, reset
   *
   * The buttons are not a fallback, they are the primary path for anyone who
   * cannot make a two-finger gesture — a trackpad user, someone using a
   * switch, a student with one hand on a bus. Everything reachable by pinch is
   * reachable by button.
   *
   * The view is a WINDOW ONTO the authored domain, never a replacement for it:
   * a plotted point is still clamped to the domain the question defined, so
   * zooming out past the axes cannot be used to answer outside them.
   */
  const domain = { xMin: domainXMin, xMax: domainXMax, yMin: domainYMin, yMax: domainYMax };
  const [view, setView] = useState(null);
  const zoomable = panZoom == null ? interactive : Boolean(panZoom);
  const xMin = view ? view.xMin : domainXMin;
  const xMax = view ? view.xMax : domainXMax;
  const yMin = view ? view.yMin : domainYMin;
  const yMax = view ? view.yMax : domainYMax;

  /*
   * A fresh question means a fresh view. Attempts on the SAME question keep it:
   * a student who zoomed in to place a point carefully should not be thrown back
   * out when they try again — the second attempt is the one where the zoom
   * matters most.
   */
  useEffect(() => { setView(null); }, [viewResetKey, domainXMin, domainXMax, domainYMin, domainYMax]);
  const canMovePoints = interactive && typeof onMovePoint === 'function';
  const [pointerPreview, setPointerPreview] = useState(null);
  const [keyboardCursor, setKeyboardCursor] = useState(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  // Which existing point the finger or mouse currently has hold of, and where it
  // has been dragged to. Null when the gesture is placing a new point instead.
  const [dragIndex, setDragIndex] = useState(null);
  const [gestureActive, setGestureActive] = useState(false);

  const sx = (x) => pad + ((Number(x) - xMin) / (xMax - xMin)) * innerW;
  const sy = (y) => height - pad - ((Number(y) - yMin) / (yMax - yMin)) * innerH;
  const xStep = xMax - xMin > 20 ? 5 : xMax - xMin > 10 ? 2 : 1;
  const yStep = yMax - yMin > 20 ? 5 : yMax - yMin > 10 ? 2 : 1;
  const xTicks = buildTicks(xMin, xMax, xStep);
  const yTicks = buildTicks(yMin, yMax, yStep);

  // Minor lines sit at the resolution the student can actually click, so the
  // grid tells the truth about where a point can land.
  const minorStep = Number.isFinite(Number(snapStep)) && Number(snapStep) > 0 ? Number(snapStep) : 1;
  const showMinorGrid = interactive
    && (xMax - xMin) / minorStep <= MAX_MINOR_LINES
    && (yMax - yMin) / minorStep <= MAX_MINOR_LINES
    && minorStep < xStep;
  const xMinor = showMinorGrid ? buildTicks(xMin, xMax, minorStep) : [];
  const yMinor = showMinorGrid ? buildTicks(yMin, yMax, minorStep) : [];

  // Keep the tick labels visible when the origin is scrolled out of the window
  // instead of letting them render off the edge of the plot.
  const axisY = clamp(sy(0), pad + 4, height - pad - 4);
  const axisX = clamp(sx(0), pad + 4, width - pad - 4);
  const originVisible = xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0;

  const pathForFunction = (fn) => {
    const coords = [];
    const samples = 220;
    for (let i = 0; i <= samples; i += 1) {
      const x = xMin + ((xMax - xMin) * i) / samples;
      const y = fn(x);
      if (Number.isFinite(y) && y >= yMin - 2 && y <= yMax + 2) coords.push([sx(x), sy(y)]);
      else coords.push(null);
    }
    let d = '';
    let open = false;
    coords.forEach((point) => {
      if (!point) { open = false; return; }
      d += `${open ? ' L' : ' M'} ${point[0]} ${point[1]}`;
      open = true;
    });
    return d;
  };

  const graphPointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = clientPointToGraphCoordinate({
      clientX: event.clientX,
      clientY: event.clientY,
      rect,
      viewBoxWidth: width,
      viewBoxHeight: height,
      padding: pad,
      xMin,
      xMax,
      yMin,
      yMax,
    });
    if (!point) return null;
    const x = snapValue(point.x, snapStep);
    const y = snapValue(point.y, snapStep);
    if (x == null || y == null) return null;
    // CLAMPED TO THE AUTHORED DOMAIN, not to the current view. Zooming out past
    // the axes must not become a way to answer outside them.
    return [clamp(x, domainXMin, domainXMax), clamp(y, domainYMin, domainYMax)];
  };

  /*
   * PRESS, DRAG, LIFT — the gesture a finger already expects.
   *
   * This used to be a bare click. On a phone that means the point lands wherever
   * the finger first touched down, which is under the finger and therefore
   * unseen; a student aiming at (4, -1) found out where they had actually hit
   * only after letting go. Now the press starts a placement, the preview follows
   * the finger, and the point is committed on LIFT — so what a student sees
   * before releasing is what they get, and they can slide to correct it without
   * ever having plotted wrong.
   *
   * The same gesture picks up an existing point when the tool accepts moves, so
   * a misplaced point is dragged rather than re-plotted.
   */
  // How far in and out the window may go. Zooming in past a few grid steps
  // leaves a student with no landmarks; zooming out past a few domain widths
  // shrinks the axes back into the uselessness this exists to fix.
  const MIN_SPAN_STEPS = 4;
  // Zooming out exists to recover a little context around the axes, not to make
  // them small again — and Reset already restores the authored window instantly,
  // so a large multiple buys nothing and costs legibility. Two is generous.
  const MAX_DOMAIN_MULTIPLE = 2;

  const clampSpan = (span, domainSpan) => Math.min(
    Math.max(span, minorStep * MIN_SPAN_STEPS),
    domainSpan * MAX_DOMAIN_MULTIPLE,
  );

  // Zoom about a fixed graph point, so the thing under the finger stays under
  // the finger. Zooming about the centre instead makes the plane slide away
  // from whatever the student was looking at.
  const applyZoom = (factor, focus = null) => {
    if (!zoomable) return;
    setView((current) => {
      const from = current || domain;
      const xSpan = clampSpan((from.xMax - from.xMin) * factor, domainXMax - domainXMin);
      const ySpan = clampSpan((from.yMax - from.yMin) * factor, domainYMax - domainYMin);
      const fx = focus && Number.isFinite(focus[0]) ? focus[0] : (from.xMin + from.xMax) / 2;
      const fy = focus && Number.isFinite(focus[1]) ? focus[1] : (from.yMin + from.yMax) / 2;
      const ratioX = (fx - from.xMin) / Math.max(1e-9, from.xMax - from.xMin);
      const ratioY = (fy - from.yMin) / Math.max(1e-9, from.yMax - from.yMin);
      return {
        xMin: fx - xSpan * ratioX, xMax: fx + xSpan * (1 - ratioX),
        yMin: fy - ySpan * ratioY, yMax: fy + ySpan * (1 - ratioY),
      };
    });
  };

  const applyPan = (dx, dy) => {
    if (!zoomable) return;
    setView((current) => {
      const from = current || domain;
      return { xMin: from.xMin + dx, xMax: from.xMax + dx, yMin: from.yMin + dy, yMax: from.yMax + dy };
    });
  };

  const resetView = () => setView(null);

  // Live pointers, so a second finger can turn a plot gesture into a pinch.
  const gesturePointers = useRef(new Map());
  const pinchRef = useRef(null);

  const pointerDistance = () => {
    const [a, b] = [...gesturePointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const pointerMidpoint = () => {
    const [a, b] = [...gesturePointers.current.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  };

  const HIT_RADIUS = 18;

  const pointIndexNear = (graphPoint) => {
    if (!canMovePoints || !graphPoint) return null;
    let best = null;
    let bestDistance = Infinity;
    points.forEach((point, index) => {
      const [px, py] = pointXY(point);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      const distance = Math.hypot(sx(px) - sx(graphPoint[0]), sy(py) - sy(graphPoint[1]));
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return bestDistance <= HIT_RADIUS ? best : null;
  };

  const handlePointerDown = (event) => {
    if (zoomable) gesturePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // A SECOND FINGER CANCELS THE PLACEMENT IT INTERRUPTED. Otherwise starting a
    // pinch would leave a point behind wherever the first finger happened to be.
    if (zoomable && gesturePointers.current.size === 2) {
      setGestureActive(false);
      setDragIndex(null);
      setPointerPreview(null);
      pinchRef.current = { distance: pointerDistance(), midpoint: pointerMidpoint() };
      return;
    }
    if (!interactive) return;
    const point = graphPointFromEvent(event);
    if (!point) return;
    setKeyboardActive(false);
    setGestureActive(true);
    setDragIndex(pointIndexNear(point));
    setPointerPreview(point);
    // Capture so the gesture survives the finger leaving the plane's bounds —
    // without it a drag toward the edge silently stops updating.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not fatal */ }
  };

  const handlePointerMove = (event) => {
    if (zoomable && gesturePointers.current.has(event.pointerId)) {
      gesturePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (zoomable && gesturePointers.current.size === 2 && pinchRef.current) {
      const distance = pointerDistance();
      const midpoint = pointerMidpoint();
      const previous = pinchRef.current;
      if (distance > 0 && previous.distance > 0) {
        // Pinch and slide are one gesture, so they are applied together: the
        // ratio zooms, the midpoint movement pans. Splitting them into modes
        // makes two fingers feel like they are fighting the plane.
        const factor = previous.distance / distance;
        const rect = event.currentTarget.getBoundingClientRect();
        const focus = clientPointToGraphCoordinate({
          clientX: midpoint.x, clientY: midpoint.y, rect,
          viewBoxWidth: width, viewBoxHeight: height, padding: pad, xMin, xMax, yMin, yMax,
        });
        if (Math.abs(factor - 1) > 0.005) applyZoom(factor, focus ? [focus.x, focus.y] : null);
        const unitsPerPx = (xMax - xMin) / Math.max(1, rect.width);
        const unitsPerPy = (yMax - yMin) / Math.max(1, rect.height);
        applyPan(-(midpoint.x - previous.midpoint.x) * unitsPerPx, (midpoint.y - previous.midpoint.y) * unitsPerPy);
      }
      pinchRef.current = { distance, midpoint };
      return;
    }
    if (!interactive) return;
    setKeyboardActive(false);
    setPointerPreview(graphPointFromEvent(event));
  };

  const handlePointerUp = (event) => {
    if (zoomable) {
      gesturePointers.current.delete(event.pointerId);
      if (gesturePointers.current.size < 2) pinchRef.current = null;
    }
    if (!interactive || !gestureActive) return;
    const point = graphPointFromEvent(event) || pointerPreview;
    const movedIndex = dragIndex;
    setGestureActive(false);
    setDragIndex(null);
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* not fatal */ }
    if (!point) return;
    if (movedIndex != null) onMovePoint(movedIndex, point);
    else onPlot(point);
    // A finger leaves no cursor behind, so the preview goes with it. A mouse
    // keeps hovering, and its next move re-establishes the preview anyway.
    if (event.pointerType === 'touch') setPointerPreview(null);
  };

  const handlePointerCancel = (event) => {
    if (zoomable) {
      gesturePointers.current.delete(event?.pointerId);
      if (gesturePointers.current.size < 2) pinchRef.current = null;
    }
    setGestureActive(false);
    setDragIndex(null);
    setPointerPreview(null);
  };

  const handlePointerLeave = () => {
    if (gestureActive) return;
    setPointerPreview(null);
    setHoveredPointIndex(null);
  };

  const moveKeyboardCursor = (dx, dy) => {
    setKeyboardActive(true);
    setPointerPreview(null);
    setKeyboardCursor((current) => {
      const base = current || [snapValue(clamp(0, xMin, xMax), snapStep), snapValue(clamp(0, yMin, yMax), snapStep)];
      return [
        clamp(tidy(base[0] + dx * minorStep), xMin, xMax),
        clamp(tidy(base[1] + dy * minorStep), yMin, yMax),
      ];
    });
  };

  const handleKeyDown = (event) => {
    if (!interactive) return;
    const large = event.shiftKey ? 5 : 1;
    switch (event.key) {
      case 'ArrowLeft': event.preventDefault(); moveKeyboardCursor(-large, 0); break;
      case 'ArrowRight': event.preventDefault(); moveKeyboardCursor(large, 0); break;
      case 'ArrowUp': event.preventDefault(); moveKeyboardCursor(0, large); break;
      case 'ArrowDown': event.preventDefault(); moveKeyboardCursor(0, -large); break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const target = keyboardCursor || [snapValue(clamp(0, xMin, xMax), snapStep), snapValue(clamp(0, yMin, yMax), snapStep)];
        setKeyboardCursor(target);
        setKeyboardActive(true);
        onPlot(target);
        break;
      }
      default: break;
    }
  };

  const preview = keyboardActive ? keyboardCursor : pointerPreview;
  const previewText = preview ? `${cursorLabel} ${formatCoordinate(preview)}` : '';

  // The readout chip flips to the other side of the cursor near the edges so it
  // never gets clipped by the plot border.
  const chip = useMemo(() => {
    if (!preview) return null;
    const cx = sx(preview[0]);
    const cy = sy(preview[1]);
    const chipWidth = revealCoordinates ? Math.max(58, previewText.length * 7.2) : 0;
    const left = cx + 12 + chipWidth > width - 4 ? cx - 12 - chipWidth : cx + 12;
    const top = cy - 30 < 4 ? cy + 14 : cy - 30;
    return { cx, cy, left, top, chipWidth };
  }, [preview, previewText, revealCoordinates, width, xMin, xMax, yMin, yMax]);

  const plane = (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        className={interactive ? 'mathmaster-responsive-canvas mathmaster-touch-surface' : 'mathmaster-responsive-canvas'}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role={interactive ? 'application' : 'img'}
        aria-label={interactive ? `${ariaLabel}. Click to plot, or use the arrow keys to move the crosshair and Enter to plot.` : ariaLabel}
        tabIndex={interactive ? 0 : undefined}
        onWheel={zoomable ? (event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const focus = clientPointToGraphCoordinate({
            clientX: event.clientX, clientY: event.clientY, rect,
            viewBoxWidth: width, viewBoxHeight: height, padding: pad, xMin, xMax, yMin, yMax,
          });
          applyZoom(event.deltaY > 0 ? 1.15 : 1 / 1.15, focus ? [focus.x, focus.y] : null);
        } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        style={{
          // `maxHeight` is NOT set here. It used to be an inline '100%', which
          // beats every stylesheet rule and so silently defeated the
          // short-viewport cap in App.css: on a phone held sideways the plane
          // laid itself out at 541px inside a 390px-tall screen. The cap now
          // lives with the other rules for this class, where the cascade can
          // reach it.
          width: '100%', height: 'auto', maxWidth: '100%',
          border: '1px solid #d9e2f1', borderRadius: 12, background: '#fff',
          cursor: interactive ? 'crosshair' : 'default',
          touchAction: interactive ? 'none' : 'auto', userSelect: 'none',
          outlineOffset: 2,
        }}
      >
        <rect x={pad} y={pad} width={innerW} height={innerH} fill="#fff" />

        {xMinor.map((x) => <line key={`mx${x}`} x1={sx(x)} x2={sx(x)} y1={pad} y2={height - pad} stroke="#eef3f9" strokeWidth="1" />)}
        {yMinor.map((y) => <line key={`my${y}`} x1={pad} x2={width - pad} y1={sy(y)} y2={sy(y)} stroke="#eef3f9" strokeWidth="1" />)}
        {xTicks.map((x) => <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={pad} y2={height - pad} stroke="#d5dfec" strokeWidth="1" />)}
        {yTicks.map((y) => <line key={`gy${y}`} x1={pad} x2={width - pad} y1={sy(y)} y2={sy(y)} stroke="#d5dfec" strokeWidth="1" />)}

        {regions.map((region, index) => {
          const rawPoints = Array.isArray(region) ? region : region?.points;
          const svgPoints = (Array.isArray(rawPoints) ? rawPoints : [])
            .map((point) => pointXY(point))
            .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
            .map(([x, y]) => `${sx(x)},${sy(y)}`)
            .join(' ');
          if (!svgPoints) return null;
          return (
            <polygon
              key={`region${index}`}
              points={svgPoints}
              fill={region?.fill || (index === 0 ? '#dce9ff' : '#fde2df')}
              fillOpacity={Number.isFinite(Number(region?.opacity)) ? Number(region.opacity) : 0.42}
              stroke="none"
            />
          );
        })}

        {xMin <= 0 && xMax >= 0 ? <line x1={sx(0)} x2={sx(0)} y1={pad} y2={height - pad} stroke="#5f6b7a" strokeWidth="2" /> : null}
        {yMin <= 0 && yMax >= 0 ? <line x1={pad} x2={width - pad} y1={sy(0)} y2={sy(0)} stroke="#5f6b7a" strokeWidth="2" /> : null}

        <text x={width - pad + 6} y={axisY + 4} fontSize="13" fontWeight="700" fill="#5f6b7a">x</text>
        <text x={axisX - 4} y={pad - 10} fontSize="13" fontWeight="700" fill="#5f6b7a" textAnchor="middle">y</text>
        {originVisible ? <text x={sx(0) - 9} y={sy(0) + 15} fontSize="10" fill="#8a93a1">0</text> : null}

        {xTicks.filter((x) => x !== 0).map((x) => (
          <g key={`tx${x}`}>
            <line x1={sx(x)} x2={sx(x)} y1={axisY - 4} y2={axisY + 4} stroke="#5f6b7a" strokeWidth="1.5" />
            <text x={sx(x)} y={axisY + 17} textAnchor="middle" fontSize="11" fill="#5f6b7a">{tidy(x)}</text>
          </g>
        ))}
        {yTicks.filter((y) => y !== 0).map((y) => (
          <g key={`ty${y}`}>
            <line x1={axisX - 4} x2={axisX + 4} y1={sy(y)} y2={sy(y)} stroke="#5f6b7a" strokeWidth="1.5" />
            <text x={axisX - 9} y={sy(y) + 4} textAnchor="end" fontSize="11" fill="#5f6b7a">{tidy(y)}</text>
          </g>
        ))}

        {verticalLines.map((x, index) => <line key={`v${index}`} x1={sx(x)} x2={sx(x)} y1={pad} y2={height - pad} stroke="#8a3ffc" strokeDasharray="7 5" strokeWidth="2" />)}
        {horizontalLines.map((y, index) => <line key={`h${index}`} x1={pad} x2={width - pad} y1={sy(y)} y2={sy(y)} stroke="#8a3ffc" strokeDasharray="7 5" strokeWidth="2" />)}
        {functions.map((fn, index) => (
          <path
            key={`f${index}`}
            d={pathForFunction(fn)}
            fill="none"
            stroke={index === 0 ? '#1a73e8' : '#d93025'}
            strokeWidth="3"
            // Shape as well as colour, so the two curves stay distinguishable
            // for a student who cannot separate blue from red.
            strokeDasharray={index === 0 ? undefined : '10 6'}
          />
        ))}
        {lines.map((line, index) => {
          const y1 = Number(line.m) * xMin + Number(line.b);
          const y2 = Number(line.m) * xMax + Number(line.b);
          return <line key={`l${index}`} x1={sx(xMin)} y1={sy(y1)} x2={sx(xMax)} y2={sy(y2)} stroke={line.stroke || (index === 0 ? '#1a73e8' : '#d93025')} strokeWidth="3" strokeDasharray={line.dash || undefined} />;
        })}
        {polylines.map((entry, index) => {
          const rawPoints = Array.isArray(entry) ? entry : entry?.points;
          const svgPoints = (Array.isArray(rawPoints) ? rawPoints : [])
            .map((point) => pointXY(point))
            .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
            .map(([x, y]) => `${sx(x)},${sy(y)}`)
            .join(' ');
          if (!svgPoints) return null;
          return (
            <polyline
              key={`poly${index}`}
              points={svgPoints}
              fill="none"
              stroke={entry?.stroke || (index === 0 ? '#5f6b7a' : '#1a73e8')}
              strokeWidth={entry?.strokeWidth || 3}
              strokeDasharray={entry?.dash || undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Preview crosshair: the student sees exactly where the click lands
            before committing to it. */}
        {preview && chip ? (
          <g pointerEvents="none">
            <line x1={chip.cx} x2={chip.cx} y1={pad} y2={height - pad} stroke="#1a73e8" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.55" />
            <line x1={pad} x2={width - pad} y1={chip.cy} y2={chip.cy} stroke="#1a73e8" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.55" />
            <circle cx={chip.cx} cy={chip.cy} r="9" fill="#1a73e8" opacity="0.16" />
            <circle cx={chip.cx} cy={chip.cy} r="5" fill="none" stroke="#1a73e8" strokeWidth="2.5" />
            {revealCoordinates ? (
              <>
                <rect x={chip.left} y={chip.top} width={chip.chipWidth} height="22" rx="7" fill="#174ea6" />
                <text x={chip.left + chip.chipWidth / 2} y={chip.top + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{formatCoordinate(preview)}</text>
              </>
            ) : null}
          </g>
        ) : null}

        {points.map((point, index) => {
          const hovered = hoveredPointIndex === index;
          const pointFill = resolvePointFill(point, '#1a73e8');
          const pointRadius = resolvePointRadius(point, 6);
          let [pointX, pointY] = pointXY(point);
          // While a point is held, draw it where the finger is. Leaving it at
          // its old coordinates makes the drag look broken until release.
          if (dragIndex === index && pointerPreview) [pointX, pointY] = pointerPreview;
          if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
          const held = dragIndex === index;
          return (
            <g key={`p${index}`} onPointerEnter={() => setHoveredPointIndex(index)} onPointerLeave={() => setHoveredPointIndex(null)}>
              {hovered || held ? <circle cx={sx(pointX)} cy={sy(pointY)} r={pointRadius + (held ? 10 : 6)} fill={pointFill} opacity={held ? 0.26 : 0.18} /> : null}
              <circle cx={sx(pointX)} cy={sy(pointY)} r={hovered || held ? pointRadius + 2 : pointRadius} fill={pointFill} stroke="#fff" strokeWidth="2" />
              {point?.label ? <text x={sx(pointX) + 10} y={sy(pointY) - 9} fontSize="11" fontWeight="700" fill="#24324a">{point.label}</text> : null}
              {hovered && revealCoordinates ? <text x={sx(pointX) + 10} y={sy(pointY) + 16} fontSize="11" fill="#24324a">{formatCoordinate(point)}</text> : null}
            </g>
          );
        })}

        {typeof children === 'function' ? children({ sx, sy, pad, innerW, innerH, width, height }) : children}
      </svg>

      {zoomable ? (
        <div
          role="group"
          aria-label="Zoom the coordinate plane"
          style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0 0' }}
        >
          <button type="button" onClick={() => applyZoom(1 / 1.4)} aria-label="Zoom in" style={ZOOM_BUTTON}>+</button>
          <button type="button" onClick={() => applyZoom(1.4)} aria-label="Zoom out" style={ZOOM_BUTTON}>−</button>
          <button type="button" onClick={resetView} disabled={!view} style={{ ...ZOOM_BUTTON, width: 'auto', padding: '0 12px', opacity: view ? 1 : 0.5 }}>
            Reset view
          </button>
          {view ? (
            <span aria-live="polite" style={{ fontSize: 12, color: '#5f6b7a' }}>
              Showing x {tidy(xMin)} to {tidy(xMax)}, y {tidy(yMin)} to {tidy(yMax)}
            </span>
          ) : null}
        </div>
      ) : null}

      {interactive ? (
        <>
          <p aria-live="polite" className="mm-sr-only">{previewText}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#5f6b7a' }}>
            Press the grid and slide to aim{minorStep === 1 ? ' at a whole-number point' : ''} — the point lands where you
            let go{canMovePoints ? ', and you can drag a point you have already placed' : ''}. Keyboard: arrow keys move the
            crosshair{minorStep === 1 ? ' one unit' : ` by ${tidy(minorStep)}`} (Shift for five), Enter plots it.
            {zoomable ? ' Pinch with two fingers, or scroll, to zoom — or use the buttons below.' : ''}
          </p>
        </>
      ) : null}
    </div>
  );

  if (!enlargeable) return plane;

  /*
   * AN INTERACTIVE PLANE IS THE ONE THAT MOST NEEDS ENLARGING, and it used to be
   * the only one that could not. The original reasoning was that a plane you
   * answer with becomes a dead end in a modal, because the Check button stays
   * behind the backdrop. But plotting inside the enlarged view updates the same
   * tool state, so closing it returns to the question with the work done — the
   * modal is a bigger place to aim, not a separate one. That is worth far more
   * than the round trip costs, especially on a phone where the embedded plane is
   * a few hundred pixels across and a student is aiming at a target the width of
   * a fingertip.
   */
  return (
    <EnlargeableFigure
      label={ariaLabel}
      enlargeLabel={interactive ? 'Enlarge to plot' : 'Enlarge graph'}
      style={{ width: '100%' }}
    >
      {plane}
    </EnlargeableFigure>
  );
}
