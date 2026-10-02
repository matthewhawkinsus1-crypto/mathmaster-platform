/*
 * THE INTERACTIVE GRAPH WORKSPACE, AS PURE DATA.
 *
 * `functionGraph`, `functionInvestigation` and `graphAnalysis` all render
 * src/InteractiveGraphWorkspace.jsx. Everything that workspace needs to decide
 * whether a student is right — the point tasks, the authored window, the
 * reachable snap step (which sets every tolerance), the graph-end
 * requirements, the analysis parts with their derived accepted answers, and
 * the freehand-sketch check — is derived here, from the question alone, so the
 * browser (for what it draws and what it reports) and the shared grader
 * (functions/shared/serverGrading/tools/graphWorkspace.mjs) derive exactly the
 * same things.
 *
 * THE FREEHAND SKETCH IS REPRODUCIBLE. The browser's snap check
 * (roughSketchMatchesGraph) compares strokes in the 760x540 SVG viewBox — a
 * fixed coordinate system, not the device's pixels — with the ideal curve
 * mapped through whatever window was ON SCREEN when the stroke ended (the
 * student's zoom). The work therefore carries the strokes in viewBox units
 * (rounded to whole units and bounded) AND that camera window, and the check
 * below re-runs on both sides. A camera is honoured only when it is one the
 * zoom controls can produce (inside the authored window, never tighter than
 * two grid steps); anything else falls back to the authored window, so a
 * forged camera can never be more lenient than a real student's zoom.
 *
 * Pure: no React, no DOM, no clock. mathjs is reached only for a student-built
 * `expression` model (modelExpression.mjs).
 */
import { POINT_FEATURES } from '../../analysisRequestCatalog.mjs';
import { pathAnalysisTextMatches } from '../../pathToolContracts.mjs';
import { evaluateGraphFunction } from './functionGraphUtils.mjs';
import { resolveReachableSnapStep } from './graphInteractionPrecision.mjs';
import {
  analysisSelectionsAreCorrect,
  buildInteractiveGraphWindow,
  buildInteractivePointTasks,
  getDefaultEndpointRequirements,
  getDomainRangeAcceptedAnswers,
  getGraphFeaturePoints,
  getMonotonicAcceptedAnswers,
  getSignAcceptedAnswers,
  pointSetInputMatches,
  resolveTaskExpected,
  roughSketchMatchesGraph,
  sampleVisibleFunctionPaths,
} from './interactiveGraphEngine.mjs';

/** The workspace's SVG drawing: viewBox size and the plotting inset. */
export const GRAPH_WORKSPACE_VIEWBOX = Object.freeze({ width: 760, height: 540, padding: 56 });

/** A sketch "snaps" when it stays within this many viewBox units of the curve. */
export const SKETCH_TOLERANCE = 68;

/*
 * How much freehand drawing travels with the work. A stroke keeps at most
 * `maxStrokePoints` points (the browser already drops points closer than 3
 * units, so only a stroke longer than ~700 units is thinned); the most recent
 * `maxStrokes` strokes are kept; and when the strokes together exceed the
 * budget, every stroke is thinned evenly rather than an old one dropped, so an
 * earlier branch keeps counting toward the check exactly as it did on screen.
 * Whole viewBox units are ~1 CSS pixel against a 68-unit tolerance.
 */
export const SKETCH_LIMITS = Object.freeze({
  maxStrokePoints: 240,
  maxStrokes: 40,
  constructionPoints: 960,
  inversePoints: 480,
});

const POINT_KINDS = new Set(['point', 'inversePoint']);
const MAX_MAP_ENTRIES = 100;
const MAX_SELECTED_POINTS = 50;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (map, key) => (isPlainObject(map) && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined);
const pointLabel = ([x, y]) => `(${x}, ${y})`;

/* ---------------------------------------------------------------------------
 * The analysis parts.
 * ------------------------------------------------------------------------- */

/**
 * Every analysis request, resolved to what the student is asked and what is
 * accepted. Moved verbatim from InteractiveGraphWorkspace.jsx.
 */
export const normalizeAnalysisRequests = (question, spec, viewWindow, allowDefault) => {
  const provided = Array.isArray(question.analysisRequests) && question.analysisRequests.length ? question.analysisRequests : null;
  const requests = provided || (allowDefault ? [{ id: 'feature', kind: 'point', feature: question.analysisFeature || 'vertex', label: question.analysisFeatureLabel || question.analysisFeature || 'requested feature' }] : []);
  return requests.map((request, index) => {
    const id = String(request.id || `analysis-${index + 1}`);
    if (request.kind === 'inversePoint') {
      const sourceTask = (question.pointTasks || []).find((task) => String(task?.id || '') === String(request.sourceTaskId || ''));
      const sourceX = Number(sourceTask?.x);
      const sourceY = Number.isFinite(sourceX) ? evaluateGraphFunction(spec, sourceX) : Number.NaN;
      const expected = Number.isFinite(sourceX) && Number.isFinite(sourceY) ? [[sourceY, sourceX]] : [];
      return {
        ...request,
        id,
        kind: 'inversePoint',
        expected,
        requiredCount: expected.length,
        allowNone: false,
        responseMode: request.responseMode || 'click',
      };
    }
    if (request.kind === 'value') {
      const authoredExpected = Array.isArray(request.expected)
        ? request.expected
        : request.expected !== undefined && request.expected !== null
          ? [request.expected]
          : [];
      const authoredAccepted = Array.isArray(request.acceptedAnswers) ? request.acceptedAnswers : [];
      return {
        ...request,
        id,
        kind: 'value',
        label: request.label || request.prompt || 'Answer',
        responseMode: request.responseMode || 'input',
        acceptedAnswers: authoredAccepted.length ? authoredAccepted : authoredExpected,
      };
    }
    if (['domain', 'range'].includes(request.kind)) {
      const notation = request.notation || 'interval';
      return { ...request, id, kind: request.kind, label: request.label || `${request.kind === 'domain' ? 'Domain' : 'Range'} in ${notation} notation`, notation, acceptedAnswers: request.acceptedAnswers || getDomainRangeAcceptedAnswers(spec, request.kind, notation) };
    }
    if (['positive', 'negative'].includes(request.kind)) {
      const notation = request.notation || 'interval';
      return {
        ...request, id, kind: request.kind, notation,
        label: request.label || `Interval(s) where the function is ${request.kind}`,
        acceptedAnswers: request.acceptedAnswers || getSignAcceptedAnswers(spec, request.kind, notation),
        // See below: offered on every interval question, not only the empty ones.
        allowsEmptyAnswer: true,
      };
    }
    if (['increasing', 'decreasing', 'constant'].includes(request.kind)) {
      const notation = request.notation || 'interval';
      return {
        ...request, id, kind: request.kind, notation,
        label: request.label || `${request.kind[0].toUpperCase()}${request.kind.slice(1)} interval(s)`,
        acceptedAnswers: request.acceptedAnswers || getMonotonicAcceptedAnswers(spec, request.kind, notation),
        // "Does not exist" used to appear only on `constant` requests, so a
        // student asked for the decreasing intervals of y = x³ — which are
        // empty — had no way to say so and had to guess at typing "none".
        //
        // It is now offered on EVERY interval question rather than only on the
        // ones whose answer is empty. Showing it only where it applies would
        // announce the answer: the button's presence would be the answer. A
        // control that is always there carries no information.
        allowsEmptyAnswer: true,
      };
    }
    // An unrecognised kind used to land here and become a point task named
    // after the kind — "point", "positive" — with no locatable feature, so the
    // student saw an empty click target they could never satisfy. Fall back to
    // the vertex, which every supported function has, rather than to nothing.
    const requestedFeature = request.feature || request.kind;
    const feature = POINT_FEATURES.includes(requestedFeature) ? requestedFeature : 'vertex';
    const expected = request.expected || getGraphFeaturePoints(spec, feature, viewWindow);
    return {
      ...request,
      id,
      kind: 'point',
      feature,
      expected,
      label: request.label || feature,
      requiredCount: expected.length,
      allowNone: request.allowNone !== false,
      responseMode: request.responseMode || request.answerMode || 'click',
    };
  });
};

/* ---------------------------------------------------------------------------
 * The workspace model.
 * ------------------------------------------------------------------------- */

/**
 * Everything the workspace derives from its question.
 *
 * `analysisMode` is the Analyze-only view (GraphAnalysis, `graphAnalysis`);
 * otherwise the student constructs the graph first (FunctionGraphBuilder and
 * the workflow plot stages). The derivations are the component's own, in the
 * same order, so the tolerances the grader applies are the ones on screen.
 */
export const buildGraphWorkspaceModel = (question = {}, { analysisMode = false } = {}) => {
  const functionSpec = question.functionSpec || {};
  const graph = question.graph || {};
  const studentChoosesX = Boolean(question.studentChoosesX || question.chooseXValues);
  const pointOnly = Boolean(question.pointOnly || question.plotMode === 'points');
  const constructionEnabled = !analysisMode;
  const inverseReflection = question.inverseReflection?.enabled ? question.inverseReflection : null;
  const inverseReflectionEnabled = Boolean(inverseReflection && constructionEnabled);
  const tasks = constructionEnabled
    ? (question.pointTasks || buildInteractivePointTasks(functionSpec, {
      points: question.graphAnswer?.suggestedPoints,
      includeUndefinedChecks: question.includeUndefinedChecks,
      undefinedCount: question.undefinedCount,
      studentChoosesX,
    }))
    : [];

  const inversePreviewPoints = (() => {
    if (!inverseReflectionEnabled) return [];
    const requested = new Set((inverseReflection.sourceTaskIds || []).map(String));
    return (question.pointTasks || [])
      .filter((task) => !requested.size || requested.has(String(task?.id || '')))
      .map((task) => {
        const sourceX = Number(task?.x);
        const sourceY = Number.isFinite(sourceX) ? evaluateGraphFunction(functionSpec, sourceX) : Number.NaN;
        return Number.isFinite(sourceX) && Number.isFinite(sourceY) ? [sourceY, sourceX] : null;
      })
      .filter(Boolean);
  })();

  const baseWindow = buildInteractiveGraphWindow(functionSpec, tasks, graph);
  const viewWindow = (() => {
    if (!inverseReflectionEnabled || !inversePreviewPoints.length) return baseWindow;
    const margin = Math.max(1, Number(baseWindow.snapStep || 0.5) * 2);
    return {
      ...baseWindow,
      xMin: Math.min(Number(baseWindow.xMin), ...inversePreviewPoints.map((point) => point[0] - margin)),
      xMax: Math.max(Number(baseWindow.xMax), ...inversePreviewPoints.map((point) => point[0] + margin)),
      yMin: Math.min(Number(baseWindow.yMin), ...inversePreviewPoints.map((point) => point[1] - margin)),
      yMax: Math.max(Number(baseWindow.yMax), ...inversePreviewPoints.map((point) => point[1] + margin)),
    };
  })();

  const xGridStep = Math.max(0.000001, Number(viewWindow.xStep ?? 1));
  const yGridStep = Math.max(0.000001, Number(viewWindow.yStep ?? 1));
  // Grid spacing is a display choice; the construction snap is resolved
  // separately (see graphInteractionPrecision.mjs).
  const requestedSnapStep = graph.snapStep ?? viewWindow.snapStep;
  const visiblePaths = pointOnly ? [] : sampleVisibleFunctionPaths(functionSpec, viewWindow);
  // The snap rule needs to know where the curve actually is, so the samples
  // are taken before the snap is resolved rather than after.
  const curveSamples = visiblePaths.flat();
  const snapStep = resolveReachableSnapStep(requestedSnapStep, tasks, curveSamples);
  const endpointRequirements = pointOnly
    ? []
    : (constructionEnabled
      ? (question.endpointRequirements || getDefaultEndpointRequirements(functionSpec, visiblePaths, { ...question, graph: viewWindow }))
      : getDefaultEndpointRequirements(functionSpec, visiblePaths, { ...question, graph: viewWindow }));
  const analysisParts = normalizeAnalysisRequests(question, functionSpec, viewWindow, analysisMode);
  const analysisEnabled = analysisMode || analysisParts.length > 0;
  const inverseVisiblePaths = inverseReflectionEnabled
    ? visiblePaths
      .map((path) => path.map(([x, y]) => [y, x]).filter(([x, y]) => x >= viewWindow.xMin && x <= viewWindow.xMax && y >= viewWindow.yMin && y <= viewWindow.yMax))
      .filter((path) => path.length > 1)
    : [];

  return {
    functionSpec,
    graph,
    studentChoosesX,
    pointOnly,
    analysisMode,
    constructionEnabled,
    inverseReflection,
    inverseReflectionEnabled,
    inverseSketchRequired: Boolean(inverseReflectionEnabled && inverseReflection?.requireInverseSketch !== false),
    tasks,
    viewWindow,
    xGridStep,
    yGridStep,
    visiblePaths,
    snapStep,
    endpointRequirements,
    analysisParts,
    analysisEnabled,
    inverseVisiblePaths,
    requiredStrokeCount: functionSpec.type === 'rational' ? 2 : 1,
    // The three tolerances, all in graph units, all scaled by the snap step.
    pointTolerance: Math.max(0.22, snapStep * 0.48),
    analysisTolerance: Math.max(0.28, snapStep * 0.58),
    markerTolerance: Math.max(0.55, snapStep * 1.8),
  };
};

/*
 * THE SAME MODEL, BUILT ONCE PER QUESTION.
 *
 * The browser grades on every edit (a keystroke in an analysis box is a new
 * piece of work), and building the model samples the curve and searches for
 * zeros and intercepts — milliseconds each time on a Chromebook. The model is a
 * pure function of the question, so it is remembered per question object and
 * re-derived whenever that object's content changes (the fingerprint is the
 * question's own JSON), never served stale. Callers treat it as read-only.
 */
const MODEL_CACHE = new WeakMap();

export const graphWorkspaceModelFor = (question, { analysisMode = false } = {}) => {
  if (!question || typeof question !== 'object') return buildGraphWorkspaceModel(question || {}, { analysisMode });
  let fingerprint;
  try {
    fingerprint = `${analysisMode ? 'analysis' : 'construct'}|${JSON.stringify(question)}`;
  } catch {
    return buildGraphWorkspaceModel(question, { analysisMode });
  }
  const cached = MODEL_CACHE.get(question);
  if (cached && cached.fingerprint === fingerprint) return cached.model;
  const model = buildGraphWorkspaceModel(question, { analysisMode });
  MODEL_CACHE.set(question, { fingerprint, model });
  return model;
};

/* ---------------------------------------------------------------------------
 * The freehand sketch.
 * ------------------------------------------------------------------------- */

// A sketch check is a pure function of (model, strokes, camera, chosen x), so
// a few recent results are remembered per model: typing an analysis answer
// does not re-run a check on strokes that have not changed.
const SKETCH_CACHE = new WeakMap();
const rememberSketch = (model, key, compute) => {
  let entries = SKETCH_CACHE.get(model);
  if (!entries) {
    entries = new Map();
    SKETCH_CACHE.set(model, entries);
  }
  if (entries.has(key)) return entries.get(key);
  const value = compute();
  if (entries.size >= 8) entries.delete(entries.keys().next().value);
  entries.set(key, value);
  return value;
};

const finiteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

/** A graph point the student placed: two finite coordinates, or null. */
export const readGraphPoint = (value) => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = finiteNumber(value[0]);
  const y = finiteNumber(value[1]);
  return x === null || y === null ? null : [x, y];
};

const readSketchPoint = (value) => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = finiteNumber(value[0]);
  const y = finiteNumber(value[1]);
  return x === null || y === null ? null : [Math.round(x), Math.round(y)];
};

const thinStroke = (stroke, maximum) => (stroke.length <= maximum
  ? stroke
  : Array.from({ length: maximum }, (_, index) => stroke[Math.round((index * (stroke.length - 1)) / (maximum - 1))]));

/**
 * Freehand strokes as they travel with the work: whole viewBox units, at most
 * SKETCH_LIMITS of them. Idempotent, so bounding work that was already bounded
 * changes nothing — the browser bounds a stroke the moment it ends and checks
 * the bounded strokes, and the grader re-reads exactly those.
 */
export const boundSketchStrokes = (strokes, totalPoints = SKETCH_LIMITS.constructionPoints) => {
  const read = (Array.isArray(strokes) ? strokes : [])
    .map((stroke) => (Array.isArray(stroke) ? stroke : []).map(readSketchPoint).filter(Boolean))
    .filter((stroke) => stroke.length >= 2)
    .slice(-SKETCH_LIMITS.maxStrokes)
    .map((stroke) => thinStroke(stroke, SKETCH_LIMITS.maxStrokePoints));
  const total = read.reduce((sum, stroke) => sum + stroke.length, 0);
  if (total <= totalPoints || !read.length) return read;
  const share = Math.max(2, Math.floor(totalPoints / read.length));
  return read.map((stroke) => thinStroke(stroke, share));
};

/** The camera a sketch was checked under: four finite numbers, or null. */
export const readSketchCamera = (value) => {
  if (!isPlainObject(value)) return null;
  const camera = {
    xMin: finiteNumber(value.xMin),
    xMax: finiteNumber(value.xMax),
    yMin: finiteNumber(value.yMin),
    yMax: finiteNumber(value.yMax),
  };
  return Object.values(camera).every((entry) => entry !== null) ? camera : null;
};

/**
 * The window a sketch is judged in.
 *
 * Honoured only when the zoom controls could have produced it
 * (graphWorkspaceViewport.js zoomedWindow): inside the authored window and no
 * tighter than two grid steps (or the whole authored span when that is
 * smaller). Anything else — absent, malformed, forged — is judged in the
 * authored window, the widest view a student ever has.
 */
export const resolveSketchCamera = (model, camera) => {
  const authored = {
    xMin: Number(model.viewWindow.xMin),
    xMax: Number(model.viewWindow.xMax),
    yMin: Number(model.viewWindow.yMin),
    yMax: Number(model.viewWindow.yMax),
  };
  const view = readSketchCamera(camera);
  if (!view) return authored;
  const xSpan = authored.xMax - authored.xMin;
  const ySpan = authored.yMax - authored.yMin;
  const xEpsilon = 1e-6 * Math.max(1, Math.abs(xSpan));
  const yEpsilon = 1e-6 * Math.max(1, Math.abs(ySpan));
  const legitimate = view.xMax > view.xMin
    && view.yMax > view.yMin
    && view.xMin >= authored.xMin - xEpsilon
    && view.xMax <= authored.xMax + xEpsilon
    && view.yMin >= authored.yMin - yEpsilon
    && view.yMax <= authored.yMax + yEpsilon
    && view.xMax - view.xMin >= Math.min(Math.abs(model.xGridStep) * 2, xSpan) - xEpsilon
    && view.yMax - view.yMin >= Math.min(Math.abs(model.yGridStep) * 2, ySpan) - yEpsilon;
  return legitimate ? view : authored;
};

/** Graph units to viewBox units through a camera — the component's own toScreenX/Y. */
export const graphToViewBox = (camera) => {
  const { width, height, padding } = GRAPH_WORKSPACE_VIEWBOX;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return ([x, y]) => [
    padding + ((x - camera.xMin) / (camera.xMax - camera.xMin)) * innerWidth,
    padding + ((camera.yMax - y) / (camera.yMax - camera.yMin)) * innerHeight,
  ];
};

/**
 * Does the construction sketch snap? Through every resolved point (except a
 * rational center) and along the true curve, under the camera it was drawn in.
 */
export const constructionSketchMatches = (model, { strokes = [], camera = null, chosenXValues = {} } = {}) => {
  if (!model.constructionEnabled || model.pointOnly) return false;
  const view = resolveSketchCamera(model, camera);
  const bounded = boundSketchStrokes(strokes, SKETCH_LIMITS.constructionPoints);
  const required = model.tasks
    .map((task) => ({ task, expected: resolveTaskExpected(task, model.functionSpec, chosenXValues) }))
    .filter(({ task, expected }) => Array.isArray(expected) && task.role !== 'center')
    .map(({ expected }) => expected);
  return rememberSketch(model, JSON.stringify(['construction', view, required, bounded]), () => {
    const toViewBox = graphToViewBox(view);
    return roughSketchMatchesGraph({
      strokes: bounded,
      requiredScreenPoints: required.map(toViewBox),
      idealScreenPaths: model.visiblePaths.map((path) => path.map(toViewBox)),
      requiredStrokeCount: model.requiredStrokeCount,
      tolerance: SKETCH_TOLERANCE,
    });
  });
};

/** Does the inverse sketch snap? Through the reflected points, along f⁻¹. */
export const inverseSketchMatches = (model, { strokes = [], camera = null } = {}) => {
  if (!model.inverseReflectionEnabled) return false;
  const view = resolveSketchCamera(model, camera);
  const bounded = boundSketchStrokes(strokes, SKETCH_LIMITS.inversePoints);
  return rememberSketch(model, JSON.stringify(['inverse', view, bounded]), () => {
    const toViewBox = graphToViewBox(view);
    return roughSketchMatchesGraph({
      strokes: bounded,
      requiredScreenPoints: model.analysisParts
        .filter((part) => part.kind === 'inversePoint')
        .flatMap((part) => part.expected || [])
        .map(toViewBox),
      idealScreenPaths: model.inverseVisiblePaths.map((path) => path.map(toViewBox)),
      requiredStrokeCount: 1,
      tolerance: SKETCH_TOLERANCE,
    });
  });
};

/** ViewBox units back to graph units through a camera — graphToViewBox reversed. */
export const viewBoxToGraph = (camera) => {
  const { width, height, padding } = GRAPH_WORKSPACE_VIEWBOX;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return ([x, y]) => [
    camera.xMin + ((x - padding) / innerWidth) * (camera.xMax - camera.xMin),
    camera.yMax - ((y - padding) / innerHeight) * (camera.yMax - camera.yMin),
  ];
};

/*
 * WHERE OUTCOMES ARE WITHHELD, A SKETCH IS DRAWN THROUGH THE STUDENT'S OWN POINTS.
 *
 * On a DOL, quiz or test nothing on screen may say whether the work is right
 * (PQ-036). The checks above cannot run while the student draws: a sketch that
 * may only snap through the TRUE points is an answer oracle, passed or failed
 * as often as the student likes. So there the student draws through their own
 * points, and the sketch is accepted — committed, as a snap commits it in
 * practice — once it passes through them, under the camera it was drawn in
 * (the browser runs this same function at the end of each stroke). Whether it
 * is the graph of the function is decided only at submission, by the grader,
 * and never shown.
 */
const sketchThroughPoints = (model, { strokes, camera, points, requiredStrokeCount, limit }) => {
  const placed = points.map(readGraphPoint).filter(Boolean);
  if (!placed.length) return false;
  const toViewBox = graphToViewBox(resolveSketchCamera(model, camera));
  return roughSketchMatchesGraph({
    strokes: boundSketchStrokes(strokes, limit),
    requiredScreenPoints: placed.map(toViewBox),
    idealScreenPaths: [],
    requiredStrokeCount,
    tolerance: SKETCH_TOLERANCE,
  });
};

/** Does the construction sketch pass through the student's own placed points (all but a center)? */
export const constructionSketchThroughOwnPoints = (model, { strokes = [], camera = null, placements = {} } = {}) => (
  model.constructionEnabled && !model.pointOnly && sketchThroughPoints(model, {
    strokes,
    camera,
    points: model.tasks.filter((task) => task.role !== 'center').map((task) => own(placements, task.id)),
    requiredStrokeCount: model.requiredStrokeCount,
    limit: SKETCH_LIMITS.constructionPoints,
  })
);

/** Does the inverse sketch pass through the student's own reflected points? */
export const inverseSketchThroughOwnPoints = (model, { strokes = [], camera = null, selections = {} } = {}) => (
  model.inverseReflectionEnabled && sketchThroughPoints(model, {
    strokes,
    camera,
    points: model.analysisParts.filter((part) => part.kind === 'inversePoint').flatMap((part) => own(selections, part.id) || []),
    requiredStrokeCount: 1,
    limit: SKETCH_LIMITS.inversePoints,
  })
);

/*
 * AT SUBMISSION, JUDGED IN THE QUESTION'S OWN WINDOW.
 *
 * The sketch check's tolerance is in viewBox units, so the same curve judged
 * under a zoomed-in camera is held to a tighter band in graph units. In
 * practice the student sees that check and can draw again; where outcomes are
 * withheld nothing told them the zoom mattered. So the silent verdict is taken
 * in the authored window whatever the zoom while drawing: the strokes are
 * carried from the camera they were drawn under into it (B-20).
 */
const strokesInAuthoredWindow = (model, strokes, camera, limit) => {
  const toGraph = viewBoxToGraph(resolveSketchCamera(model, camera));
  const toViewBox = graphToViewBox(resolveSketchCamera(model, null));
  return boundSketchStrokes(strokes, limit).map((stroke) => stroke.map((point) => toViewBox(toGraph(point))));
};

/** Is the construction sketch the graph of the function? Judged in the authored window. */
export const constructionSketchFollowsFunction = (model, { strokes = [], camera = null, chosenXValues = {} } = {}) => constructionSketchMatches(model, {
  strokes: strokesInAuthoredWindow(model, strokes, camera, SKETCH_LIMITS.constructionPoints),
  camera: null,
  chosenXValues,
});

/** Is the inverse sketch the graph of the inverse? Judged in the authored window. */
export const inverseSketchFollowsInverse = (model, { strokes = [], camera = null } = {}) => inverseSketchMatches(model, {
  strokes: strokesInAuthoredWindow(model, strokes, camera, SKETCH_LIMITS.inversePoints),
  camera: null,
});

/* ---------------------------------------------------------------------------
 * The student's work.
 * ------------------------------------------------------------------------- */

// Never a key a parsed object may carry (the response contract drops them too).
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const readEntries = (map, readValue) => {
  if (!isPlainObject(map)) return {};
  const output = {};
  Object.keys(map).filter((key) => !UNSAFE_KEYS.has(key)).slice(0, MAX_MAP_ENTRIES).forEach((key) => {
    const value = readValue(map[key]);
    if (value !== undefined) output[key] = value;
  });
  return output;
};

const readPlacement = (value) => (value === 'undefined' ? 'undefined' : (readGraphPoint(value) ?? undefined));
const readChosenX = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};
const readMarker = (value) => {
  // A bare string is a legacy draft's marker with no location — kept as the
  // student's symbol, graded as unplaced in position.
  if (typeof value === 'string') return value ? { marker: value, point: null } : undefined;
  if (!isPlainObject(value)) return undefined;
  return { marker: typeof value.marker === 'string' ? value.marker : '', point: readGraphPoint(value.point) };
};
const readText = (value) => (typeof value === 'string' ? value : undefined);
const readSelected = (value) => (Array.isArray(value)
  ? value.slice(0, MAX_SELECTED_POINTS).map(readGraphPoint).filter(Boolean)
  : undefined);
const readTrue = (value) => (value === true ? true : undefined);

/**
 * The workspace's raw work — what the browser reports and the server grades.
 *
 * Accepts work that crossed the wire (or was built by
 * graphWorkspaceWorkFromState) and returns the one canonical shape. Idempotent.
 *
 * Student work only: placements, chosen x-values, whether the student has
 * committed those placements (`pointsLocked`, below), the sketch and its
 * camera and whether it was committed (`sketchLocked`), the end markers
 * (symbol and where it was dropped), and the analysis answers with the inverse
 * sketch, its camera and its commit (`inverseSketchLocked`). The browser's own
 * flags — pointsValidated, snapped, a marker's locationCorrect,
 * inversePointsValidated, inverseSnapped — are never read under those names:
 * every verdict is recomputed from this work by the grader.
 *
 * THE THREE LOCKS ARE THE STUDENT'S COMMITS, NOT VERDICTS. In the workspace a
 * student presses "Check Point Placements"; when the placements are right they
 * lock (they can no longer be moved) and the drawing layer opens. A sketch is
 * committed the same way: the moment a stroke ends and the sketch passes, it
 * snaps to the true curve and the drawing layer closes. Until a commit the
 * workspace has never counted that piece of work — not as complete, not as
 * correct, not toward partial credit. Strokes that WOULD pass but were never
 * committed are reachable (Undo after a snap takes back the snap and keeps
 * the stroke; retyping a chosen x moves a required point under strokes drawn
 * earlier), and the workspace showed those as not snapped, so the grader must
 * too. It keeps the rule by crediting each piece only when it is locked AND
 * its own re-check of the work passes (gradeGraphWorkspace), so a lock can
 * only withhold credit: a forged `true` on wrong work earns nothing.
 *
 * WHERE OUTCOMES ARE WITHHELD THE WORK IS GRADED AS PLACED. On a DOL, quiz or
 * test there is no check to pass: every placed point is an answer, and the
 * points stay movable until the student submits or draws a curve through them;
 * a curve is drawn through the student's own points and is committed once it
 * passes through them (`sketchLocked`, re-checked by
 * constructionSketchThroughOwnPoints); the inverse likewise. The work says so
 * with `pointsGradedAsPlaced`, and the grader then marks each placed point
 * where it sits — right or wrong — instead of waiting for a commit, and marks
 * the curve and the inverse against the function at submission. It changes
 * when the work is graded, never how: it cannot turn a wrong point right, and
 * a curve counts only when it is the graph of the function through right
 * points.
 *
 * Keeps the `{ construction, analysis }` envelope and the per-id maps My Math
 * Path's raw builder reads (src/platform/path/pathToolResponses.js).
 */
export const normalizeGraphWorkspaceWork = (raw = {}) => {
  const construction = isPlainObject(raw?.construction) ? raw.construction : {};
  const analysis = isPlainObject(raw?.analysis) ? raw.analysis : {};
  return {
    construction: {
      placements: readEntries(construction.placements, readPlacement),
      chosenXValues: readEntries(construction.chosenXValues, readChosenX),
      pointsLocked: construction.pointsLocked === true,
      pointsGradedAsPlaced: construction.pointsGradedAsPlaced === true,
      strokes: boundSketchStrokes(construction.strokes, SKETCH_LIMITS.constructionPoints),
      sketchView: readSketchCamera(construction.sketchView),
      sketchLocked: construction.sketchLocked === true,
      markerPlacements: readEntries(construction.markerPlacements, readMarker),
    },
    analysis: {
      selections: readEntries(analysis.selections, readSelected),
      answers: readEntries(analysis.answers, readText),
      typedPoints: readEntries(analysis.typedPoints, readText),
      noneSelections: readEntries(analysis.noneSelections, readTrue),
      inverseStrokes: boundSketchStrokes(analysis.inverseStrokes, SKETCH_LIMITS.inversePoints),
      inverseSketchView: readSketchCamera(analysis.inverseSketchView),
      inverseSketchLocked: analysis.inverseSketchLocked === true,
    },
  };
};

/**
 * The workspace's raw work, from the component's own state.
 *
 * The component keeps its stage flow in its undo history (and in saved
 * drafts) under its historical names. The pieces of that flow that are the
 * student's commits travel under their own names — the placements committed
 * with "Check Point Placements" (`pointsValidated`) as `pointsLocked`, the
 * snapped sketch (`snapped`) as `sketchLocked`, the snapped inverse sketch
 * (`inverseSnapped`) as `inverseSketchLocked` — and every other flag stays
 * behind. Work graded as placed (outcomes withheld: no check to pass) sets
 * `pointsGradedAsPlaced` on the state it hands over; the component never
 * keeps it in its history. (`inversePointsValidated` only gates the inverse drawing layer; the
 * reflected points are graded from the selections themselves.)
 */
export const graphWorkspaceWorkFromState = ({ construction = {}, analysis = {} } = {}) => {
  const state = isPlainObject(construction) ? construction : {};
  const analysisState = isPlainObject(analysis) ? analysis : {};
  return normalizeGraphWorkspaceWork({
    construction: {
      ...state,
      pointsLocked: state.pointsValidated === true,
      pointsGradedAsPlaced: state.pointsGradedAsPlaced === true,
      sketchLocked: state.snapped === true,
    },
    analysis: { ...analysisState, inverseSketchLocked: analysisState.inverseSnapped === true },
  });
};

/* ---------------------------------------------------------------------------
 * One analysis part — the grader's, and the browser's reflected-point check.
 * ------------------------------------------------------------------------- */

/** What the student answered for one analysis part, as the attempt shows it. */
export const analysisPartResponse = (part, analysis = {}) => {
  if (POINT_KINDS.has(part.kind)) {
    const selected = own(analysis.selections, part.id) || [];
    const noneSelected = Boolean(own(analysis.noneSelections, part.id));
    const typed = String(own(analysis.typedPoints, part.id) || '');
    return `${noneSelected ? 'Does not exist' : selected.map(pointLabel).join(', ')}${typed ? `; typed: ${typed}` : ''}`;
  }
  return String(own(analysis.answers, part.id) || '');
};

/**
 * Grade one analysis part against normalized work. A point part is answered
 * by clicking, typing or both (`responseMode`); a text part goes through the
 * same matcher My Math Path uses (pathAnalysisTextMatches).
 */
export const gradeAnalysisPart = (part, analysis = {}, tolerance = 0.28) => {
  if (POINT_KINDS.has(part.kind)) {
    const selected = own(analysis.selections, part.id) || [];
    const noneSelected = Boolean(own(analysis.noneSelections, part.id));
    const typed = String(own(analysis.typedPoints, part.id) || '');
    const clickRequired = part.responseMode !== 'input';
    const inputRequired = part.responseMode !== 'click';
    const clickComplete = !clickRequired || noneSelected || selected.length === part.expected.length;
    const inputComplete = !inputRequired || typed.trim() !== '';
    const clickCorrect = !clickRequired || analysisSelectionsAreCorrect(selected, part.expected, tolerance, noneSelected);
    const inputCorrect = !inputRequired || pointSetInputMatches(typed, part.expected, tolerance);
    return {
      id: part.id,
      label: part.label,
      isComplete: clickComplete && inputComplete,
      isCorrect: clickCorrect && inputCorrect,
      response: analysisPartResponse(part, analysis),
    };
  }
  const response = analysisPartResponse(part, analysis);
  return {
    id: part.id,
    label: part.label,
    isComplete: response.trim() !== '',
    isCorrect: response.trim() !== '' && pathAnalysisTextMatches(
      response,
      part.acceptedAnswers,
      { kind: part.kind, notation: part.notation, tolerance },
    ),
    response,
  };
};
