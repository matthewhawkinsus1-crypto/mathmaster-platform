import QuestionPrompt from './QuestionPrompt';
import { evaluateStaticGraphFunction, fitStaticGraphViewport, resolvePointFill, resolvePointRadius } from './graphSpecUtils';
import { readGraphPointCoordinates } from './graphPointUtils.js';
import EnlargeableFigure from './components/common/EnlargeableFigure.jsx';

const DEFAULT_WIDTH = 620;
const DEFAULT_HEIGHT = 430;
const PADDING = 48;

const clampRange = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getStep = (range) => {
  if (range <= 12) return 1;
  if (range <= 30) return 2;
  if (range <= 60) return 5;
  return 10;
};

// Axis labels stop being readable long before this many, so the cap is a
// rendering decision as much as a safety one.
const MAX_TICKS = 200;

const buildTicks = (minimum, maximum, step) => {
  const min = Number(minimum);
  const max = Number(maximum);
  let increment = Number(step);

  // A non-finite or non-positive step never terminates the loop below, and a
  // huge range with a small step generated hundreds of millions of ticks --
  // enough to freeze the browser tab a student is working in. Both are
  // reachable from hand-edited blueprint JSON, so both are clamped here rather
  // than trusted from the caller.
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  if (!Number.isFinite(increment) || increment <= 0) increment = (max - min) / 10;
  if (!Number.isFinite(increment) || increment <= 0) return [];

  const span = max - min;
  if (span / increment > MAX_TICKS) increment = span / MAX_TICKS;

  const ticks = [];
  const first = Math.ceil(min / increment) * increment;
  if (!Number.isFinite(first)) return [];

  for (let value = first; value <= max + increment * 0.001; value += increment) {
    ticks.push(Number(value.toFixed(8)));
    if (ticks.length >= MAX_TICKS) break;
  }
  return ticks;
};

const normalizeFunctionList = (graph) => {
  const functions = Array.isArray(graph.functions) ? [...graph.functions] : [];

  if (graph.line) {
    functions.push({ type: 'line', ...graph.line });
  }
  if (Number.isFinite(Number(graph.m)) || Number.isFinite(Number(graph.b))) {
    functions.push({ type: 'line', m: Number(graph.m || 0), b: Number(graph.b || 0) });
  }

  return functions;
};

// The one evaluator, shared with the authoring guardrails so that what
// Preflight measures is exactly what this component will draw. It also reads a
// quadratic in BOTH published forms — `a,b,c` and `a,h,k` — which this file
// used not to: a vertex-form parabola was silently drawn as y = ax², so an
// authored arch peaking at (4, 16) rendered as a curve falling off the bottom
// of its own viewport.
const evaluateFunction = evaluateStaticGraphFunction;

const buildFunctionPaths = (spec, xMin, xMax, yMin, yMax, toScreenX, toScreenY) => {
  const sampleCount = 500;
  const paths = [];
  let current = [];
  let previousY = null;

  for (let index = 0; index <= sampleCount; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / sampleCount;
    const y = evaluateFunction(spec, x);
    const invalid = !Number.isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin);
    const jump = previousY !== null && Math.abs(y - previousY) > (yMax - yMin) * 0.65;

    if (invalid || jump) {
      if (current.length > 1) paths.push(current);
      current = [];
      previousY = null;
      continue;
    }

    current.push([toScreenX(x), toScreenY(y)]);
    previousY = y;
  }

  if (current.length > 1) paths.push(current);
  return paths;
};

const toPathData = (points) =>
  points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');

const restrictedFunctionEndpoints = (functions = []) => functions.flatMap((spec, functionIndex) => {
  const domain = spec?.domain || spec?.restrictedDomain;
  if (!domain || typeof domain !== 'object') return [];

  const unrestricted = { ...spec };
  delete unrestricted.domain;
  delete unrestricted.restrictedDomain;

  const boundaries = [
    {
      side: 'min',
      value: Number(domain.min),
      closed: domain.minClosed !== false && domain.minInclusive !== false,
    },
    {
      side: 'max',
      value: Number(domain.max),
      closed: domain.maxClosed !== false && domain.maxInclusive !== false,
    },
  ];

  return boundaries.flatMap((boundary) => {
    if (!Number.isFinite(boundary.value)) return [];
    const y = evaluateFunction(unrestricted, boundary.value);
    if (!Number.isFinite(y)) return [];
    return [{
      id: `function-${functionIndex}-${boundary.side}-boundary`,
      point: [boundary.value, y],
      marker: boundary.closed ? 'closed' : 'open',
    }];
  });
});

const axisTitle = (label, unit) => {
  const cleanLabel = String(label || '').trim();
  const cleanUnit = String(unit || '').trim();
  if (cleanLabel && cleanUnit) return `${cleanLabel} (${cleanUnit})`;
  return cleanLabel || cleanUnit;
};

/**
 * Safe, structured graph renderer. It intentionally does not execute equation
 * strings. Blueprints describe graphs with numeric fields instead.
 *
 * Optional graph.axisDisplay flags let a question hide labels, units, or
 * numeric tick labels until the student supplies them. This is especially
 * useful for graph-labeling and scale questions.
 */
export default function GraphDisplay({ graph, title = 'Coordinate graph' }) {
  if (!graph) return null;

  const displayGraph = fitStaticGraphViewport(graph);
  let xMin = clampRange(displayGraph.xMin, -10);
  let xMax = clampRange(displayGraph.xMax, 10);
  let yMin = clampRange(displayGraph.yMin, -10);
  let yMax = clampRange(displayGraph.yMax, 10);

  if (xMin >= xMax) [xMin, xMax] = [-10, 10];
  if (yMin >= yMax) [yMin, yMax] = [-10, 10];

  const innerWidth = DEFAULT_WIDTH - PADDING * 2;
  const innerHeight = DEFAULT_HEIGHT - PADDING * 2;
  const toScreenX = (x) => PADDING + ((x - xMin) / (xMax - xMin)) * innerWidth;
  const toScreenY = (y) => PADDING + ((yMax - y) / (yMax - yMin)) * innerHeight;

  const xStep = clampRange(displayGraph.xStep, getStep(xMax - xMin));
  const yStep = clampRange(displayGraph.yStep, getStep(yMax - yMin));
  const xTicks = buildTicks(xMin, xMax, xStep > 0 ? xStep : 1);
  const yTicks = buildTicks(yMin, yMax, yStep > 0 ? yStep : 1);
  const functions = normalizeFunctionList(displayGraph);
  const points = Array.isArray(displayGraph.points) ? displayGraph.points : [];
  const segments = Array.isArray(displayGraph.segments) ? displayGraph.segments : [];
  const authoredEndpointRequirements = Array.isArray(displayGraph.endpointRequirements) ? displayGraph.endpointRequirements : [];
  const endpointRequirements = authoredEndpointRequirements.length
    ? authoredEndpointRequirements
    : restrictedFunctionEndpoints(functions);
  const axisDisplay = displayGraph.axisDisplay && typeof displayGraph.axisDisplay === 'object' ? displayGraph.axisDisplay : {};
  const showXTickLabels = axisDisplay.showXTickLabels !== false;
  const showYTickLabels = axisDisplay.showYTickLabels !== false;
  const showAxisSymbols = axisDisplay.showAxisSymbols !== false;
  const showAxisTitles = axisDisplay.showAxisTitles !== false;
  const xTitle = showAxisTitles ? axisTitle(displayGraph.xAxisLabel, displayGraph.xAxisUnit) : '';
  const yTitle = showAxisTitles ? axisTitle(displayGraph.yAxisLabel, displayGraph.yAxisUnit) : '';
  const interactionHighlight = graph.interactionHighlight && typeof graph.interactionHighlight === 'object'
    ? graph.interactionHighlight
    : {};
  const highlightX = Number(interactionHighlight.xValue);
  const highlightY = Number(interactionHighlight.yValue);
  const showHighlightX = Number.isFinite(highlightX) && highlightX >= xMin && highlightX <= xMax;
  const showHighlightY = Number.isFinite(highlightY) && highlightY >= yMin && highlightY <= yMax;
  const xAxisActive = interactionHighlight.xAxisActive === true;
  const yAxisActive = interactionHighlight.yAxisActive === true;

  const axisX = yMin <= 0 && yMax >= 0 ? toScreenY(0) : toScreenY(yMin);
  const axisY = xMin <= 0 && xMax >= 0 ? toScreenX(0) : toScreenX(xMin);

  return (
    // Readable at 680px, and enlargeable when it is not — reading a value off a
    // graph is exactly the task where a bigger picture is the difference
    // between an answer and a guess.
    <EnlargeableFigure
      label={graph.ariaLabel || title}
      style={{
        margin: '24px auto',
        width: 'min(100%, 680px)',
        background: '#fff',
        border: '1px solid #dfe3e7',
        borderRadius: '12px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(60,64,67,0.08)',
      }}
    >
      <svg
        className="mathmaster-responsive-canvas"
        viewBox={`0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={graph.ariaLabel || title}
        style={{ display: 'block', width: '100%', height: 'auto', maxWidth: '100%', maxHeight: '100%' }}
      >
        <title>{graph.ariaLabel || title}</title>
        <rect x={PADDING} y={PADDING} width={innerWidth} height={innerHeight} fill="#ffffff" stroke="#cfd4da" />

        {xTicks.map((tick) => {
          const x = toScreenX(tick);
          return (
            <g key={`x-${tick}`}>
              <line x1={x} y1={PADDING} x2={x} y2={PADDING + innerHeight} stroke="#eceff1" />
              {showXTickLabels && (
                <text x={x} y={axisX + 20} textAnchor="middle" fontSize="12" fill="#5f6368">
                  {tick}
                </text>
              )}
            </g>
          );
        })}

        {yTicks.map((tick) => {
          const y = toScreenY(tick);
          return (
            <g key={`y-${tick}`}>
              <line x1={PADDING} y1={y} x2={PADDING + innerWidth} y2={y} stroke="#eceff1" />
              {showYTickLabels && tick !== 0 && (
                <text x={axisY - 9} y={y + 4} textAnchor="end" fontSize="12" fill="#5f6368">
                  {tick}
                </text>
              )}
            </g>
          );
        })}

        <line x1={PADDING} y1={axisX} x2={PADDING + innerWidth} y2={axisX} stroke={xAxisActive ? '#174ea6' : '#5f6368'} strokeWidth={xAxisActive ? '4' : '2'} />
        <line x1={axisY} y1={PADDING} x2={axisY} y2={PADDING + innerHeight} stroke={yAxisActive ? '#9334e6' : '#5f6368'} strokeWidth={yAxisActive ? '4' : '2'} />

        {showHighlightX && (
          <line
            x1={toScreenX(highlightX)}
            y1={PADDING}
            x2={toScreenX(highlightX)}
            y2={PADDING + innerHeight}
            stroke="#f9ab00"
            strokeWidth="3"
            strokeDasharray="8 6"
            opacity="0.9"
          />
        )}
        {showHighlightY && (
          <line
            x1={PADDING}
            y1={toScreenY(highlightY)}
            x2={PADDING + innerWidth}
            y2={toScreenY(highlightY)}
            stroke="#f9ab00"
            strokeWidth="3"
            strokeDasharray="8 6"
            opacity="0.9"
          />
        )}

        {functions.map((spec, functionIndex) =>
          buildFunctionPaths(spec, xMin, xMax, yMin, yMax, toScreenX, toScreenY).map((path, pathIndex) => (
            <path
              key={`function-${functionIndex}-${pathIndex}`}
              d={toPathData(path)}
              fill="none"
              stroke={spec.stroke || '#1a73e8'}
              strokeWidth={spec.strokeWidth || 3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )),
        )}

        {segments.map((segment, index) => {
          const from = segment.from || segment.start;
          const to = segment.to || segment.end;
          if (!Array.isArray(from) || !Array.isArray(to)) return null;
          return (
            <line
              key={`segment-${index}`}
              x1={toScreenX(Number(from[0]))}
              y1={toScreenY(Number(from[1]))}
              x2={toScreenX(Number(to[0]))}
              y2={toScreenY(Number(to[1]))}
              stroke={segment.stroke || '#9334e6'}
              strokeWidth={segment.strokeWidth || 3}
            />
          );
        })}

        {endpointRequirements.map((requirement, index) => {
          const point = requirement.point;
          if (!Array.isArray(point)) return null;
          const x = toScreenX(Number(point[0]));
          const y = toScreenY(Number(point[1]));
          if (requirement.marker === 'open' || requirement.marker === 'closed') {
            return <circle key={`endpoint-${index}`} cx={x} cy={y} r="8" fill={requirement.marker === 'closed' ? '#1a73e8' : '#fff'} stroke="#1a73e8" strokeWidth="4" />;
          }
          const vector = Array.isArray(requirement.vector) ? requirement.vector : [1, 0];
          const angle = (Math.atan2(-Number(vector[1] || 0), Number(vector[0] || 0)) * 180) / Math.PI;
          return <g key={`endpoint-${index}`} transform={`translate(${x} ${y}) rotate(${angle})`}><polygon points="14,0 -7,-9 -7,9" fill="#1a73e8" /></g>;
        })}

        {points.map((point, index) => {
          const coordinates = readGraphPointCoordinates(point);
          if (!coordinates) return null;
          const [x, y] = coordinates;
          return (
            <g key={`point-${index}`}>
              <circle cx={toScreenX(x)} cy={toScreenY(y)} r={resolvePointRadius(point, 5)} fill={resolvePointFill(point, '#d93025')} stroke="#fff" strokeWidth="2" />
              {!Array.isArray(point) && point.label && (
                <text x={toScreenX(x) + 9} y={toScreenY(y) - 9} fontSize="13" fontWeight="bold" fill="#3c4043">
                  {point.label}
                </text>
              )}
            </g>
          );
        })}

        {interactionHighlight.showPoint === true && showHighlightX && showHighlightY && (
          <g>
            <circle
              cx={toScreenX(highlightX)}
              cy={toScreenY(highlightY)}
              r="12"
              fill="#fff4ce"
              stroke="#f9ab00"
              strokeWidth="4"
            />
            <circle cx={toScreenX(highlightX)} cy={toScreenY(highlightY)} r="5" fill="#d93025" />
            {interactionHighlight.label && (
              <text
                x={toScreenX(highlightX) + 15}
                y={toScreenY(highlightY) - 13}
                fontSize="14"
                fontWeight="bold"
                fill="#8a4f00"
              >
                {interactionHighlight.label}
              </text>
            )}
          </g>
        )}

        {showAxisSymbols && !xTitle && (
          <text x={PADDING + innerWidth - 4} y={axisX - 9} textAnchor="end" fontSize="14" fontWeight="bold" fill="#3c4043">x</text>
        )}
        {showAxisSymbols && !yTitle && (
          <text x={axisY + 9} y={PADDING + 14} fontSize="14" fontWeight="bold" fill="#3c4043">y</text>
        )}
        {xTitle && (
          <text x={PADDING + innerWidth / 2} y={DEFAULT_HEIGHT - 9} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#174ea6">
            {xTitle}
          </text>
        )}
        {yTitle && (
          <text
            x="15"
            y={PADDING + innerHeight / 2}
            textAnchor="middle"
            fontSize="14"
            fontWeight="bold"
            fill="#174ea6"
            transform={`rotate(-90 15 ${PADDING + innerHeight / 2})`}
          >
            {yTitle}
          </text>
        )}
      </svg>
      {graph.caption && (
        <figcaption style={{ color: '#5f6368', fontSize: '14px', padding: '8px 6px 2px' }}>
          <QuestionPrompt variant="plain" style={{ color: '#5f6368', fontSize: '14px', lineHeight: 1.45, margin: 0 }}>
            {graph.caption}
          </QuestionPrompt>
        </figcaption>
      )}
    </EnlargeableFigure>
  );
}
