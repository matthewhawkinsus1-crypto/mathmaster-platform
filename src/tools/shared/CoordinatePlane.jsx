import React, { useMemo, useState } from 'react';
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
  xMin = -10, xMax = 10, yMin = -10, yMax = 10,
  width = 560, height = 380,
  points = [], lines = [], functions = [], polylines = [], regions = [], verticalLines = [], horizontalLines = [],
  onPlot = null,
  // Whole numbers by default: an Algebra I student asked to plot (3, -2) should
  // never be able to land on (3, -1.5). Tools pass 0.5/0.25 only when the
  // question genuinely lives between the gridlines.
  snapStep = 1,
  cursorLabel = 'Point',
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
  enlargeable = true,
  children,
}) {
  const pad = 42;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const interactive = typeof onPlot === 'function';
  const [pointerPreview, setPointerPreview] = useState(null);
  const [keyboardCursor, setKeyboardCursor] = useState(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);
  const [keyboardActive, setKeyboardActive] = useState(false);

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
    return [clamp(x, xMin, xMax), clamp(y, yMin, yMax)];
  };

  const handlePointerMove = (event) => {
    if (!interactive) return;
    setKeyboardActive(false);
    setPointerPreview(graphPointFromEvent(event));
  };

  const handlePointerLeave = () => {
    setPointerPreview(null);
    setHoveredPointIndex(null);
  };

  const handleClick = (event) => {
    if (!interactive) return;
    const point = graphPointFromEvent(event);
    if (point) onPlot(point);
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
    const chipWidth = Math.max(58, previewText.length * 7.2);
    const left = cx + 12 + chipWidth > width - 4 ? cx - 12 - chipWidth : cx + 12;
    const top = cy - 30 < 4 ? cy + 14 : cy - 30;
    return { cx, cy, left, top, chipWidth };
  }, [preview, previewText, width, xMin, xMax, yMin, yMax]);

  const plane = (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        className={interactive ? 'mathmaster-responsive-canvas mathmaster-touch-surface' : 'mathmaster-responsive-canvas'}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role={interactive ? 'application' : 'img'}
        aria-label={interactive ? `${ariaLabel}. Click to plot, or use the arrow keys to move the crosshair and Enter to plot.` : ariaLabel}
        tabIndex={interactive ? 0 : undefined}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%', height: 'auto', maxWidth: '100%', maxHeight: '100%',
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
            <rect x={chip.left} y={chip.top} width={chip.chipWidth} height="22" rx="7" fill="#174ea6" />
            <text x={chip.left + chip.chipWidth / 2} y={chip.top + 15} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{formatCoordinate(preview)}</text>
          </g>
        ) : null}

        {points.map((point, index) => {
          const hovered = hoveredPointIndex === index;
          const pointFill = resolvePointFill(point, '#1a73e8');
          const pointRadius = resolvePointRadius(point, 6);
          const [pointX, pointY] = pointXY(point);
          if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
          return (
            <g key={`p${index}`} onPointerEnter={() => setHoveredPointIndex(index)} onPointerLeave={() => setHoveredPointIndex(null)}>
              {hovered ? <circle cx={sx(pointX)} cy={sy(pointY)} r={pointRadius + 6} fill={pointFill} opacity="0.18" /> : null}
              <circle cx={sx(pointX)} cy={sy(pointY)} r={hovered ? pointRadius + 2 : pointRadius} fill={pointFill} stroke="#fff" strokeWidth="2" />
              {point?.label ? <text x={sx(pointX) + 10} y={sy(pointY) - 9} fontSize="11" fontWeight="700" fill="#24324a">{point.label}</text> : null}
              {hovered ? <text x={sx(pointX) + 10} y={sy(pointY) + 16} fontSize="11" fill="#24324a">{formatCoordinate(point)}</text> : null}
            </g>
          );
        })}

        {typeof children === 'function' ? children({ sx, sy, pad, innerW, innerH, width, height }) : children}
      </svg>

      {interactive ? (
        <>
          <p aria-live="polite" className="mm-sr-only">{previewText}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#5f6b7a' }}>
            Click the grid to plot{minorStep === 1 ? ' a whole-number point' : ''}. Keyboard: arrow keys move the crosshair
            {minorStep === 1 ? ' one unit' : ` by ${tidy(minorStep)}`} (Shift for five), Enter plots it.
          </p>
        </>
      ) : null}
    </div>
  );

  if (!enlargeable) return plane;

  return (
    <EnlargeableFigure label={ariaLabel} enlargeLabel="Enlarge graph" style={{ width: '100%' }}>
      {plane}
    </EnlargeableFigure>
  );
}
