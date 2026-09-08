from pathlib import Path


def replace_exact(path, before, after):
    target = Path(path)
    source = target.read_text(encoding="utf-8")
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"Expected exactly one source block in {path}; found {count}")
    target.write_text(source.replace(before, after), encoding="utf-8")


helper = r'''import { staticGraphAsymptotes } from '../../graphSpecUtils.js';

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
'''
Path('src/platform/workflow/workflowGraphVisuals.js').write_text(helper, encoding='utf-8')

replace_exact(
    'src/platform/workflow/questionRecipes.js',
    r'''const featureGraph = (question) => ({
  ...(isObject(question.graph) ? question.graph : { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }),
  points: normalizedPairs(question.pairs),
  ...(typeof question.correctEquation === 'string' && question.correctEquation.trim()
    ? { model: question.correctEquation.trim() }
    : {}),
});''',
    r'''const featureGraph = (question) => ({
  ...(isObject(question.graph) ? question.graph : { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }),
  points: normalizedPairs(question.pairs),
  // Preserve the structured function. The workflow needs its family and domain
  // to draw restrictions, continuation arrows and asymptotes correctly.
  ...(isObject(question.functionSpec) ? { functionSpec: question.functionSpec } : {}),
  ...(typeof question.correctEquation === 'string' && question.correctEquation.trim()
    ? { model: question.correctEquation.trim() }
    : {}),
});'''
)

replace_exact(
    'src/platform/workflow/WorkflowRunner.jsx',
    "import { choiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from '../interaction/choiceOptions.js';\nimport './WorkflowFocusMode.css';",
    "import { choiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from '../interaction/choiceOptions.js';\nimport { workflowEndpointMarkers } from './workflowGraphVisuals.js';\nimport './WorkflowFocusMode.css';"
)

replace_exact(
    'src/platform/workflow/WorkflowRunner.jsx',
    """function StageFigure({ graph, label }) {\n  const spec = isObject(graph) ? graph : {};""",
    """function StageFigure({ graph, label }) {\n  const spec = isObject(graph) ? graph : {};\n  const structuredFunction = staticGraphSpec(spec.functionSpec);\n\n  // Function-characteristics used to throw away functionSpec and sample only\n  // the equation string. That made a restricted function look unrestricted.\n  // The canonical static renderer already owns domain clipping, endpoint\n  // circles, continuation arrows, and automatic asymptotes, so structured\n  // workflow graphs delegate to it instead of reimplementing those rules.\n  if (structuredFunction) {\n    const displayGraph = {\n      ...spec,\n      functions: [structuredFunction],\n      points: Array.isArray(spec.points) ? spec.points : [],\n      ariaLabel: label || spec.ariaLabel || 'Graph',\n    };\n    delete displayGraph.model;\n    delete displayGraph.functionSpec;\n    delete displayGraph.endpointRequirements;\n    return (\n      <div style={{ marginBottom: 12 }}>\n        <GraphDisplay graph={displayGraph} title={label || 'Graph'} />\n      </div>\n    );\n  }"""
)

replace_exact(
    'src/platform/workflow/WorkflowRunner.jsx',
    """  const figures = previewFigures(value);\n  const given = Array.isArray(graph.points) ? graph.points : [];\n\n  return (""",
    """  const figures = previewFigures(value);\n  const given = Array.isArray(graph.points) ? graph.points : [];\n  const viewWindow = {\n    xMin: Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10,\n    xMax: Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10,\n    yMin: Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10,\n    yMax: Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10,\n  };\n  const endpointMarkers = functions.length\n    ? workflowEndpointMarkers({ evaluate: functions[0], viewWindow })\n    : [];\n\n  return ("""
)

replace_exact(
    'src/platform/workflow/WorkflowRunner.jsx',
    """        points={[...given, ...figures.points]}""",
    """        points={[...given, ...figures.points, ...endpointMarkers]}"""
)

replace_exact(
    'src/platform/workflow/GraphFeatureSelectStage.jsx',
    "import { evaluateModelAt } from './modelExpression';",
    "import { evaluateModelAt } from './modelExpression';\nimport { restrictEvaluatorToDomain, workflowEndpointMarkers, workflowHorizontalAsymptotes } from './workflowGraphVisuals.js';"
)

replace_exact(
    'src/platform/workflow/GraphFeatureSelectStage.jsx',
    r'''  // The curve the student is reading. A model expression is sampled; a bare
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
  }, [model, viewWindow.xMin]);''',
    r'''  // Keep one unrestricted evaluator to compute exact boundary points, then
  // restrict only the curve that is drawn.
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
  const asymptotes = useMemo(() => workflowHorizontalAsymptotes(functionSpec), [functionSpec]);'''
)

replace_exact(
    'src/platform/workflow/GraphFeatureSelectStage.jsx',
    r'''        points={[...curvePoints.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5 })), ...marks]}
        functions={functions}
        {...(!model && curvePoints.length > 1 && graph.connect !== false
          ? { polylines: [curvePoints] }
          : {})}''',
    r'''        // Keep student marks first so onMovePoint(index) still indexes the
        // student's selections. The curve's given points and endpoint markers
        // are fixed visual annotations.
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
          : {})}'''
)

replace_exact(
    'src/platform/workflow/FigureMatchStage.jsx',
    "import { evaluateModelAt } from './modelExpression';",
    "import { evaluateModelAt } from './modelExpression';\nimport { workflowEndpointMarkers } from './workflowGraphVisuals.js';"
)

replace_exact(
    'src/platform/workflow/FigureMatchStage.jsx',
    r'''  const points = useMemo(
    () => (Array.isArray(spec.points) ? spec.points : []).map(normalizePoint).filter(Boolean),
    [spec.points],
  );

  return (''',
    r'''  const points = useMemo(
    () => (Array.isArray(spec.points) ? spec.points : []).map(normalizePoint).filter(Boolean),
    [spec.points],
  );
  const endpointMarkers = useMemo(
    () => (functions.length ? workflowEndpointMarkers({ evaluate: functions[0], viewWindow }) : []),
    [functions, viewWindow.xMin, viewWindow.xMax, viewWindow.yMin, viewWindow.yMax],
  );

  return ('''
)

replace_exact(
    'src/platform/workflow/FigureMatchStage.jsx',
    r'''      points={points.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5 }))}''',
    r'''      points={[
        ...points.map(([x, y]) => ({ x, y, fill: '#1a73e8', r: 5, movable: false })),
        ...endpointMarkers,
      ]}'''
)

replace_exact(
    'src/tools/shared/CoordinatePlane.jsx',
    r'''    points.forEach((point, index) => {
      const [px, py] = pointXY(point);''',
    r'''    points.forEach((point, index) => {
      if (point?.movable === false || point?.marker) return;
      const [px, py] = pointXY(point);'''
)

replace_exact(
    'src/tools/shared/CoordinatePlane.jsx',
    r'''          if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
          const held = dragIndex === index;
          return (''',
    r'''          if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;

          if (point?.marker === 'arrow') {
            const vector = Array.isArray(point?.vector) ? point.vector : [1, 0];
            const dx = Number(vector[0]);
            const dy = Number(vector[1]);
            const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
            const cx = sx(pointX);
            const cy = sy(pointY);
            const size = Math.max(8, pointRadius + 2);
            return (
              <polygon
                key={`p${index}`}
                points={`${cx},${cy} ${cx - size * 1.7},${cy - size * 0.72} ${cx - size * 1.7},${cy + size * 0.72}`}
                transform={`rotate(${angle} ${cx} ${cy})`}
                fill={pointFill}
                stroke={pointFill}
                strokeWidth="1.5"
                pointerEvents="none"
              />
            );
          }

          if (point?.marker === 'open' || point?.marker === 'closed') {
            const open = point?.marker === 'open';
            return (
              <circle
                key={`p${index}`}
                cx={sx(pointX)}
                cy={sy(pointY)}
                r={Math.max(7, pointRadius)}
                fill={open ? '#fff' : pointFill}
                stroke={pointFill}
                strokeWidth="3"
                pointerEvents="none"
              />
            );
          }

          const held = dragIndex === index;
          return ('''
)

print('Applied workflow graph end-behavior production fix.')
