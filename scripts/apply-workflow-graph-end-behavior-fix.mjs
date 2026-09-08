import { readFile, writeFile } from 'node:fs/promises';

const replaceExact = async (path, before, after) => {
  const source = await readFile(path, 'utf8');
  if (!source.includes(before)) {
    throw new Error(`Expected source block not found in ${path}`);
  }
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`Expected exactly one source block in ${path}; found ${matches}`);
  }
  await writeFile(path, source.replace(before, after));
};

const helper = `import { staticGraphAsymptotes } from '../../graphSpecUtils.js';

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const normalizeWorkflowDomain = (domain = null) => {
  const source = domain && typeof domain === 'object' ? domain : {};
  return {
    min: finiteNumber(source.min),
    max: finiteNumber(source.max),
    minClosed: source.minClosed !== false && source.minInclusive !== false,
    maxClosed: source.maxClosed !== false && source.maxInclusive !== false,
  };
};

export const restrictEvaluatorToDomain = (evaluate, domain = null) => {
  if (typeof evaluate !== 'function') return () => Number.NaN;
  const bounds = normalizeWorkflowDomain(domain);
  if (bounds.min === null && bounds.max === null) return evaluate;

  return (rawX) => {
    const x = Number(rawX);
    if (!Number.isFinite(x)) return Number.NaN;
    if (bounds.min !== null) {
      if (x < bounds.min || (!bounds.minClosed && x <= bounds.min)) return Number.NaN;
    }
    if (bounds.max !== null) {
      if (x > bounds.max || (!bounds.maxClosed && x >= bounds.max)) return Number.NaN;
    }
    const y = evaluate(x);
    return Number.isFinite(y) ? y : Number.NaN;
  };
};

const inView = (point, view) => (
  point
  && Number.isFinite(point[0])
  && Number.isFinite(point[1])
  && point[0] >= view.xMin - 1e-9
  && point[0] <= view.xMax + 1e-9
  && point[1] >= view.yMin - 1e-9
  && point[1] <= view.yMax + 1e-9
);

const sampledVisiblePoints = (evaluate, view, domain) => {
  const bounds = normalizeWorkflowDomain(domain);
  const low = bounds.min === null ? view.xMin : Math.max(view.xMin, bounds.min);
  const high = bounds.max === null ? view.xMax : Math.min(view.xMax, bounds.max);
  if (!(high > low)) return [];

  const samples = 320;
  const rows = [];
  for (let index = 0; index <= samples; index += 1) {
    const x = low + ((high - low) * index) / samples;
    const y = evaluate(x);
    if (Number.isFinite(y) && y >= view.yMin && y <= view.yMax) rows.push([x, y]);
  }
  return rows;
};

export const workflowEndpointMarkers = ({ evaluate, domain = null, viewWindow = {} } = {}) => {
  if (typeof evaluate !== 'function') return [];
  const view = {
    xMin: finiteNumber(viewWindow.xMin) ?? -10,
    xMax: finiteNumber(viewWindow.xMax) ?? 10,
    yMin: finiteNumber(viewWindow.yMin) ?? -10,
    yMax: finiteNumber(viewWindow.yMax) ?? 10,
  };
  const bounds = normalizeWorkflowDomain(domain);
  const markers = [];

  const boundary = (side, x, closed) => {
    if (x === null) return;
    const y = evaluate(x);
    const point = [x, y];
    if (!inView(point, view)) return;
    markers.push({
      x,
      y,
      marker: closed ? 'closed' : 'open',
      movable: false,
      r: 7,
      ariaLabel: `${closed ? 'Closed' : 'Open'} endpoint`,
      endpointSide: side,
    });
  };

  boundary('min', bounds.min, bounds.minClosed);
  boundary('max', bounds.max, bounds.maxClosed);

  const visible = sampledVisiblePoints(evaluate, view, domain);
  if (visible.length >= 2) {
    if (bounds.min === null) {
      const point = visible[0];
      const inner = visible[1];
      markers.push({
        x: point[0], y: point[1], marker: 'arrow', movable: false,
        vector: [point[0] - inner[0], point[1] - inner[1]],
        r: 8, ariaLabel: 'Function continues', endpointSide: 'min',
      });
    }
    if (bounds.max === null) {
      const point = visible[visible.length - 1];
      const inner = visible[visible.length - 2];
      markers.push({
        x: point[0], y: point[1], marker: 'arrow', movable: false,
        vector: [point[0] - inner[0], point[1] - inner[1]],
        r: 8, ariaLabel: 'Function continues', endpointSide: 'max',
      });
    }
  }

  return markers;
};

export const workflowHorizontalAsymptotes = (functionSpec = null) => {
  if (!functionSpec || typeof functionSpec !== 'object') return [];
  return staticGraphAsymptotes(functionSpec)
    .filter((line) => line?.axis === 'horizontal' && Number.isFinite(Number(line.value)))
    .map((line) => Number(line.value));
};
`;

await writeFile('src/platform/workflow/workflowGraphVisuals.js', helper);

await replaceExact(
  'src/platform/workflow/questionRecipes.js',
  `const featureGraph = (question) => ({
  ...(isObject(question.graph) ? question.graph : { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }),
  points: normalizedPairs(question.pairs),
  ...(typeof question.correctEquation === 'string' && question.correctEquation.trim()
    ? { model: question.correctEquation.trim() }
    : {}),
});`,
  `const featureGraph = (question) => ({
  ...(isObject(question.graph) ? question.graph : { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }),
  points: normalizedPairs(question.pairs),
  // Keep the structured function alongside the display equation. The workflow
  // renderer needs the domain restriction, function family and translations to
  // draw endpoints, continuation arrows and asymptotes correctly.
  ...(isObject(question.functionSpec) ? { functionSpec: question.functionSpec } : {}),
  ...(typeof question.correctEquation === 'string' && question.correctEquation.trim()
    ? { model: question.correctEquation.trim() }
    : {}),
});`,
);

await replaceExact(
  'src/platform/workflow/WorkflowRunner.jsx',
  `import { choiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from '../interaction/choiceOptions.js';
import './WorkflowFocusMode.css';`,
  `import { choiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from '../interaction/choiceOptions.js';
import { workflowEndpointMarkers } from './workflowGraphVisuals.js';
import './WorkflowFocusMode.css';`,
);

await replaceExact(
  'src/platform/workflow/WorkflowRunner.jsx',
  `function ChoicePreviewGraph({ stage, value }) {
  const config = isObject(stage?.previewOnGraph) ? stage.previewOnGraph : null;
  const graph = isObject(config?.graph) ? config.graph : (isObject(config) ? config : {});
  const model = typeof graph.model === 'string' ? graph.model.trim() : '';

  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    return Number.isFinite(evaluate(0)) || Number.isFinite(evaluate(1)) ? [evaluate] : [];
  }, [model]);

  const figures = previewFigures(value);
  const given = Array.isArray(graph.points) ? graph.points : [];

  return (
    <div style={{ marginBottom: 12 }}>
      <CoordinatePlane
        xMin={Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10}
        xMax={Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10}
        yMin={Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10}
        yMax={Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10}
        functions={functions}
        points={[...given, ...figures.points]}
        lines={figures.lines}
        verticalLines={figures.verticalLines}
        horizontalLines={figures.horizontalLines}
        ariaLabel={value ? `Graph showing the option you selected, ${value}` : 'Graph'}
      />`,
  `function ChoicePreviewGraph({ stage, value }) {
  const config = isObject(stage?.previewOnGraph) ? stage.previewOnGraph : null;
  const graph = isObject(config?.graph) ? config.graph : (isObject(config) ? config : {});
  const model = typeof graph.model === 'string' ? graph.model.trim() : '';
  const viewWindow = {
    xMin: Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10,
    xMax: Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10,
    yMin: Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10,
    yMax: Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10,
  };

  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    return Number.isFinite(evaluate(0)) || Number.isFinite(evaluate(1)) ? [evaluate] : [];
  }, [model]);
  const endpointMarkers = useMemo(
    () => (functions.length ? workflowEndpointMarkers({ evaluate: functions[0], viewWindow }) : []),
    [functions, viewWindow.xMin, viewWindow.xMax, viewWindow.yMin, viewWindow.yMax],
  );

  const figures = previewFigures(value);
  const given = Array.isArray(graph.points) ? graph.points : [];

  return (
    <div style={{ marginBottom: 12 }}>
      <CoordinatePlane
        {...viewWindow}
        functions={functions}
        points={[...given, ...figures.points, ...endpointMarkers]}
        lines={figures.lines}
        verticalLines={figures.verticalLines}
        horizontalLines={figures.horizontalLines}
        ariaLabel={value ? `Graph showing the option you selected, ${value}` : 'Graph'}
      />`,
);

await replaceExact(
  'src/platform/workflow/WorkflowRunner.jsx',
  `function StageFigure({ graph, label }) {
  const spec = isObject(graph) ? graph : {};
  const model = typeof spec.model === 'string' ? spec.model.trim() : '';
  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    return Number.isFinite(evaluate(0)) || Number.isFinite(evaluate(1)) ? [evaluate] : [];
  }, [model]);
  const points = Array.isArray(spec.points) ? spec.points : [];
  if (!functions.length && !points.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <CoordinatePlane
        xMin={Number.isFinite(Number(spec.xMin)) ? Number(spec.xMin) : -10}
        xMax={Number.isFinite(Number(spec.xMax)) ? Number(spec.xMax) : 10}
        yMin={Number.isFinite(Number(spec.yMin)) ? Number(spec.yMin) : -10}
        yMax={Number.isFinite(Number(spec.yMax)) ? Number(spec.yMax) : 10}
        functions={functions}
        points={points.map((point) => (Array.isArray(point)
          ? { x: point[0], y: point[1], fill: '#1a73e8', r: 5 }
          : point))}
        revealCoordinates={false}
        // Zoomable even though it takes no answer. On a 390px phone the plane
        // is 338px wide and a restricted domain's endpoints can sit two
        // gridlines apart; being able to zoom in on the part that matters is
        // the difference between reading it and guessing. Buttons, not just
        // pinch — see the note in CoordinatePlane.
        panZoom
        ariaLabel={label || 'Graph'}
      />
    </div>
  );
}`,
  `function StageFigure({ graph, label }) {
  const spec = isObject(graph) ? graph : {};
  const structuredFunction = staticGraphSpec(spec.functionSpec);
  const model = typeof spec.model === 'string' ? spec.model.trim() : '';
  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    return Number.isFinite(evaluate(0)) || Number.isFinite(evaluate(1)) ? [evaluate] : [];
  }, [model]);
  const points = Array.isArray(spec.points) ? spec.points : [];

  // Structured functions go through the canonical static graph renderer. It
  // already owns domain clipping, open/closed endpoints, continuation arrows
  // and automatic asymptotes. Sampling only the equation string here was the
  // reason restricted functions were drawn across the whole viewport.
  if (structuredFunction) {
    const displayGraph = {
      ...spec,
      functions: [structuredFunction],
      points,
      ariaLabel: label || spec.ariaLabel || 'Graph',
    };
    delete displayGraph.model;
    delete displayGraph.functionSpec;
    // End behavior is derived from the structured function rather than trusting
    // duplicated authored marker metadata that can disagree with the domain.
    delete displayGraph.endpointRequirements;
    return (
      <div style={{ marginBottom: 12 }}>
        <GraphDisplay graph={displayGraph} title={label || 'Graph'} />
      </div>
    );
  }

  if (!functions.length && !points.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <CoordinatePlane
        xMin={Number.isFinite(Number(spec.xMin)) ? Number(spec.xMin) : -10}
        xMax={Number.isFinite(Number(spec.xMax)) ? Number(spec.xMax) : 10}
        yMin={Number.isFinite(Number(spec.yMin)) ? Number(spec.yMin) : -10}
        yMax={Number.isFinite(Number(spec.yMax)) ? Number(spec.yMax) : 10}
        functions={functions}
        points={points.map((point) => (Array.isArray(point)
          ? { x: point[0], y: point[1], fill: '#1a73e8', r: 5 }
          : point))}
        revealCoordinates={false}
        panZoom
        ariaLabel={label || 'Graph'}
      />
    </div>
  );
}`,
);

await replaceExact(
  'src/platform/workflow/GraphFeatureSelectStage.jsx',
  `import { evaluateModelAt } from './modelExpression';`,
  `import { evaluateModelAt } from './modelExpression';
import { restrictEvaluatorToDomain, workflowEndpointMarkers, workflowHorizontalAsymptotes } from './workflowGraphVisuals.js';`,
);

await replaceExact(
  'src/platform/workflow/GraphFeatureSelectStage.jsx',
  `  // The curve the student is reading. A model expression is sampled; a bare
  // list of points is drawn as points, which is correct for a discrete relation.
  const model = typeof graph.model === 'string' ? graph.model.trim() : '';
  const functions = useMemo(() => {
    if (!model) return [];
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    // An unevaluable model must not render as a flat line at zero.
    return Number.isFinite(evaluate(viewWindow.xMin)) || Number.isFinite(evaluate(0)) ? [evaluate] : [];
  }, [model, viewWindow.xMin]);

  const curvePoints = useMemo(`,
  `  // The curve the student is reading. Keep an unrestricted evaluator for
  // computing exact boundary points, then restrict only the drawn path.
  const model = typeof graph.model === 'string' ? graph.model.trim() : '';
  const functionSpec = graph.functionSpec && typeof graph.functionSpec === 'object' ? graph.functionSpec : null;
  const functionDomain = functionSpec?.domain || graph.domain || null;
  const baseEvaluate = useMemo(() => {
    if (!model) return null;
    const evaluate = (x) => {
      const y = evaluateModelAt(model, x);
      return Number.isFinite(y) ? y : Number.NaN;
    };
    return Number.isFinite(evaluate(viewWindow.xMin)) || Number.isFinite(evaluate(0)) ? evaluate : null;
  }, [model, viewWindow.xMin]);
  const functions = useMemo(
    () => (baseEvaluate ? [restrictEvaluatorToDomain(baseEvaluate, functionDomain)] : []),
    [baseEvaluate, functionDomain],
  );
  const endpointMarkers = useMemo(
    () => (baseEvaluate ? workflowEndpointMarkers({ evaluate: baseEvaluate, domain: functionDomain, viewWindow }) : []),
    [baseEvaluate, functionDomain, viewWindow.xMin, viewWindow.xMax, viewWindow.yMin, viewWindow.yMax],
  );
  const asymptotes = useMemo(() => workflowHorizontalAsymptotes(functionSpec), [functionSpec]);

  const curvePoints = useMemo(`,
);

await replaceExact(
  'src/platform/workflow/GraphFeatureSelectStage.jsx',
  `        points={[...curvePoints.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5 })), ...marks]}
        functions={functions}
        {...(!model && curvePoints.length > 1 && graph.connect !== false
          ? { polylines: [curvePoints] }
          : {})}`,
  `        // Student marks come first so onMovePoint(index) still indexes the
        // student's selections. Given points and visual endpoint markers are
        // explicitly non-movable annotations.
        points={[
          ...marks,
          ...curvePoints.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5, movable: false })),
          ...endpointMarkers,
        ]}
        functions={functions}
        horizontalLines={[
          ...(Array.isArray(graph.horizontalLines) ? graph.horizontalLines : []),
          ...asymptotes,
        ]}
        {...(!model && curvePoints.length > 1 && graph.connect !== false
          ? { polylines: [curvePoints] }
          : {})}`,
);

await replaceExact(
  'src/platform/workflow/FigureMatchStage.jsx',
  `import { evaluateModelAt } from './modelExpression';`,
  `import { evaluateModelAt } from './modelExpression';
import { workflowEndpointMarkers } from './workflowGraphVisuals.js';`,
);

await replaceExact(
  'src/platform/workflow/FigureMatchStage.jsx',
  `  const points = useMemo(
    () => (Array.isArray(spec.points) ? spec.points : []).map(normalizePoint).filter(Boolean),
    [spec.points],
  );

  return (
    <CoordinatePlane
      {...viewWindow}
      points={points.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5 }))}
      functions={functions}`,
  `  const points = useMemo(
    () => (Array.isArray(spec.points) ? spec.points : []).map(normalizePoint).filter(Boolean),
    [spec.points],
  );
  const endpointMarkers = useMemo(
    () => (functions.length ? workflowEndpointMarkers({ evaluate: functions[0], viewWindow }) : []),
    [functions, viewWindow.xMin, viewWindow.xMax, viewWindow.yMin, viewWindow.yMax],
  );

  return (
    <CoordinatePlane
      {...viewWindow}
      points={[
        ...points.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5, movable: false })),
        ...endpointMarkers,
      ]}
      functions={functions}`,
);

await replaceExact(
  'src/tools/shared/CoordinatePlane.jsx',
  `    points.forEach((point, index) => {
      const [px, py] = pointXY(point);`,
  `    points.forEach((point, index) => {
      if (point?.movable === false || point?.marker) return;
      const [px, py] = pointXY(point);`,
);

await replaceExact(
  'src/tools/shared/CoordinatePlane.jsx',
  `          const hovered = hoveredPointIndex === index;
          const pointFill = resolvePointFill(point, '#1a73e8');
          const pointRadius = resolvePointRadius(point, 6);
          let [pointX, pointY] = pointXY(point);
          // While a point is held, draw it where the finger is. Leaving it at
          // its old coordinates makes the drag look broken until release.
          if (dragIndex === index && pointerPreview) [pointX, pointY] = pointerPreview;
          if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
          const held = dragIndex === index;
          return (
            <g key={\`p\${index}\`} onPointerEnter={() => setHoveredPointIndex(index)} onPointerLeave={() => setHoveredPointIndex(null)}>
              {hovered || held ? <circle cx={sx(pointX)} cy={sy(pointY)} r={pointRadius + (held ? 10 : 6)} fill={pointFill} opacity={held ? 0.26 : 0.18} /> : null}
              <circle cx={sx(pointX)} cy={sy(pointY)} r={hovered || held ? pointRadius + 2 : pointRadius} fill={pointFill} stroke="#fff" strokeWidth="2" />
              {point?.label ? <text x={sx(pointX) + 10} y={sy(pointY) - 9} fontSize="11" fontWeight="700" fill="#24324a">{point.label}</text> : null}
              {hovered && revealCoordinates ? <text x={sx(pointX) + 10} y={sy(pointY) + 16} fontSize="11" fill="#24324a">{formatCoordinate(point)}</text> : null}
            </g>
          );`,
  `          const markerOpen = point?.marker === 'open';
          const markerClosed = point?.marker === 'closed';
          const markerArrow = point?.marker === 'arrow';
          const fixed = point?.movable === false || markerOpen || markerClosed || markerArrow;
          const hovered = !fixed && hoveredPointIndex === index;
          const pointFill = resolvePointFill(point, '#1a73e8');
          const pointRadius = resolvePointRadius(point, 6);
          let [pointX, pointY] = pointXY(point);
          // While a point is held, draw it where the finger is. Leaving it at
          // its old coordinates makes the drag look broken until release.
          if (!fixed && dragIndex === index && pointerPreview) [pointX, pointY] = pointerPreview;
          if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;

          if (markerArrow) {
            const vector = Array.isArray(point?.vector) ? point.vector : [1, 0];
            const dx = Number(vector[0]);
            const dy = Number(vector[1]);
            const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
            const cx = sx(pointX);
            const cy = sy(pointY);
            const size = Math.max(8, pointRadius + 2);
            return (
              <polygon
                key={\`p\${index}\`}
                points={\`\${cx},\${cy} \${cx - size * 1.7},\${cy - size * 0.72} \${cx - size * 1.7},\${cy + size * 0.72}\`}
                transform={\`rotate(\${angle} \${cx} \${cy})\`}
                fill={pointFill}
                stroke={pointFill}
                strokeWidth="1.5"
                pointerEvents="none"
                aria-label={point?.ariaLabel || 'Function continues'}
              />
            );
          }

          if (markerOpen || markerClosed) {
            return (
              <circle
                key={\`p\${index}\`}
                cx={sx(pointX)}
                cy={sy(pointY)}
                r={Math.max(7, pointRadius)}
                fill={markerOpen ? '#fff' : pointFill}
                stroke={pointFill}
                strokeWidth="3"
                pointerEvents="none"
                aria-label={point?.ariaLabel || (markerOpen ? 'Open endpoint' : 'Closed endpoint')}
              />
            );
          }

          const held = dragIndex === index;
          return (
            <g key={\`p\${index}\`} onPointerEnter={() => setHoveredPointIndex(index)} onPointerLeave={() => setHoveredPointIndex(null)}>
              {hovered || held ? <circle cx={sx(pointX)} cy={sy(pointY)} r={pointRadius + (held ? 10 : 6)} fill={pointFill} opacity={held ? 0.26 : 0.18} /> : null}
              <circle cx={sx(pointX)} cy={sy(pointY)} r={hovered || held ? pointRadius + 2 : pointRadius} fill={pointFill} stroke="#fff" strokeWidth="2" />
              {point?.label ? <text x={sx(pointX) + 10} y={sy(pointY) - 9} fontSize="11" fontWeight="700" fill="#24324a">{point.label}</text> : null}
              {hovered && revealCoordinates ? <text x={sx(pointX) + 10} y={sy(pointY) + 16} fontSize="11" fill="#24324a">{formatCoordinate(point)}</text> : null}
            </g>
          );`,
);

console.log('Applied workflow graph end-behavior production fix.');
