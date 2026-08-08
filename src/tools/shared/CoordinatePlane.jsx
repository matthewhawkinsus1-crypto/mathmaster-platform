import React from 'react';
import { clientPointToGraphCoordinate } from '../../utils/responsiveCoordinates.js';

// Shared by every Batch A-D tool, so an unguarded window froze three labs at
// once. A step of 0/NaN never terminates, and a legitimate step across a huge
// window runs for billions of iterations; both are reachable from authored
// question JSON. 200 ticks is past the point axis labels stay readable.
const MAX_TICKS = 200;

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

export default function CoordinatePlane({
  xMin = -10, xMax = 10, yMin = -10, yMax = 10,
  width = 560, height = 380,
  points = [], lines = [], functions = [], verticalLines = [], horizontalLines = [],
  onPlot = null, children,
}) {
  const pad = 42;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const sx = (x) => pad + ((Number(x) - xMin) / (xMax - xMin)) * innerW;
  const sy = (y) => height - pad - ((Number(y) - yMin) / (yMax - yMin)) * innerH;
  const xStep = xMax - xMin > 20 ? 5 : xMax - xMin > 10 ? 2 : 1;
  const yStep = yMax - yMin > 20 ? 5 : yMax - yMin > 10 ? 2 : 1;
  const xTicks = buildTicks(xMin, xMax, xStep);
  const yTicks = buildTicks(yMin, yMax, yStep);

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

  const handleClick = (event) => {
    if (!onPlot) return;
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
    if (point) onPlot([Math.round(point.x * 2) / 2, Math.round(point.y * 2) / 2]);
  };

  return (
    <svg className={onPlot ? 'mathmaster-responsive-canvas mathmaster-touch-surface' : 'mathmaster-responsive-canvas'} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role={onPlot ? 'application' : 'img'} aria-label="Coordinate plane" onClick={handleClick}
      style={{ width: '100%', height: 'auto', maxWidth: '100%', maxHeight: '100%', border: '1px solid #d9e2f1', borderRadius: 12, background: '#fff', cursor: onPlot ? 'crosshair' : 'default', touchAction: onPlot ? 'none' : 'auto', userSelect: 'none' }}>
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="#fff" />
      {xTicks.map((x) => <line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={pad} y2={height - pad} stroke="#edf1f6" strokeWidth="1" />)}
      {yTicks.map((y) => <line key={`gy${y}`} x1={pad} x2={width - pad} y1={sy(y)} y2={sy(y)} stroke="#edf1f6" strokeWidth="1" />)}
      {xMin <= 0 && xMax >= 0 ? <line x1={sx(0)} x2={sx(0)} y1={pad} y2={height-pad} stroke="#667085" strokeWidth="1.5" /> : null}
      {yMin <= 0 && yMax >= 0 ? <line x1={pad} x2={width-pad} y1={sy(0)} y2={sy(0)} stroke="#667085" strokeWidth="1.5" /> : null}
      {xTicks.filter((x) => x !== 0).map((x) => <text key={`tx${x}`} x={sx(x)} y={sy(0)+16} textAnchor="middle" fontSize="10" fill="#667085">{x}</text>)}
      {yTicks.filter((y) => y !== 0).map((y) => <text key={`ty${y}`} x={sx(0)-8} y={sy(y)+4} textAnchor="end" fontSize="10" fill="#667085">{y}</text>)}
      {verticalLines.map((x, index) => <line key={`v${index}`} x1={sx(x)} x2={sx(x)} y1={pad} y2={height-pad} stroke="#8a3ffc" strokeDasharray="7 5" strokeWidth="2" />)}
      {horizontalLines.map((y, index) => <line key={`h${index}`} x1={pad} x2={width-pad} y1={sy(y)} y2={sy(y)} stroke="#8a3ffc" strokeDasharray="7 5" strokeWidth="2" />)}
      {functions.map((fn, index) => <path key={`f${index}`} d={pathForFunction(fn)} fill="none" stroke={index === 0 ? '#1a73e8' : '#d93025'} strokeWidth="3" />)}
      {lines.map((line, index) => {
        const y1 = Number(line.m) * xMin + Number(line.b);
        const y2 = Number(line.m) * xMax + Number(line.b);
        return <line key={`l${index}`} x1={sx(xMin)} y1={sy(y1)} x2={sx(xMax)} y2={sy(y2)} stroke={line.stroke || (index === 0 ? '#1a73e8' : '#d93025')} strokeWidth="3" />;
      })}
      {points.map((point, index) => <g key={`p${index}`}>
        <circle cx={sx(point[0])} cy={sy(point[1])} r={point.r || 5} fill={point.fill || '#1a73e8'} stroke="#fff" strokeWidth="2" />
        {point.label ? <text x={sx(point[0])+8} y={sy(point[1])-8} fontSize="11" fill="#24324a">{point.label}</text> : null}
      </g>)}
      {typeof children === 'function' ? children({ sx, sy, pad, innerW, innerH, width, height }) : children}
    </svg>
  );
}
