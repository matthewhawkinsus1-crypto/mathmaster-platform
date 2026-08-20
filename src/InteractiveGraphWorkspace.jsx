import { useEffect, useMemo, useRef, useState } from 'react';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import QuestionPrompt from './QuestionPrompt';
import { FUNCTION_GRAPH_LABELS } from './functionGraphUtils';
import { POINT_FEATURES } from './analysisRequestCatalog';
import useUndoHistory from './useUndoHistory';
import useLocalDraftState from './useLocalDraftState';
import useMobileInteractionMode from './platform/mobile/useMobileInteractionMode.js';
import {
  MAGNETIC_POINT_SNAP_PIXELS,
  findMagneticSnapTarget,
  normalizeMagneticSnapTargets,
  positiveStep,
  resolveReachableSnapStep,
  snapValue,
} from './graphInteractionPrecision';
import {
  analysisSelectionsAreCorrect,
  buildInteractiveGraphWindow,
  buildInteractivePointTasks,
  buildSmoothGraphPath,
  getDefaultEndpointRequirements,
  getDomainRangeAcceptedAnswers,
  getGraphFeaturePoints,
  getMonotonicAcceptedAnswers,
  gradePointPlacements,
  placementsMatchTasks,
  pointDistance,
  pointSetInputMatches,
  resolveTaskExpected,
  roughSketchMatchesGraph,
  sampleVisibleFunctionPaths,
  setAnswerMatches,
  getSignAcceptedAnswers,
} from './interactiveGraphEngine';

const WIDTH = 760;
const HEIGHT = 540;
const PADDING = 56;
const POINT_GUIDE_COLOR = '#00a6a6';
const MARKER_SNAP_PIXELS = 82;

// Matches GraphDisplay's cap. Guarding the step alone is not enough: a valid
// step of 1 across a blueprint window of -1e9..1e9 is two billion iterations,
// which hard-freezes the tab the student is working in.
const MAX_TICKS = 200;

const buildTicks = (minimum, maximum, step) => {
  const min = Number(minimum);
  const max = Number(maximum);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];

  let safeStep = Number(step) > 0 ? Number(step) : 1;
  const span = max - min;
  if (span / safeStep > MAX_TICKS) safeStep = span / MAX_TICKS;
  if (!Number.isFinite(safeStep) || safeStep <= 0) return [];

  const ticks = [];
  const first = Math.ceil(min / safeStep) * safeStep;
  if (!Number.isFinite(first)) return [];

  for (let value = first; value <= max + safeStep * 0.001; value += safeStep) {
    ticks.push(Number(value.toFixed(6)));
    if (ticks.length >= MAX_TICKS) break;
  }
  return ticks;
};

const pointLabel = ([x, y]) => `(${x}, ${y})`;
const taskPlacementLabel = (placement) => placement === 'undefined' ? 'Undefined' : Array.isArray(placement) ? pointLabel(placement) : 'Not placed';
const markerLabels = { arrow: 'Arrow', open: 'Open Circle', closed: 'Closed Circle' };
const markerExplanations = { arrow: 'Function continues', open: 'Endpoint excluded', closed: 'Endpoint included' };
const markerSymbols = { arrow: '➤', open: '○', closed: '●' };
const markerValue = (placement) => typeof placement === 'string' ? placement : placement?.marker || '';
const markerPoint = (placement) => Array.isArray(placement?.point) ? placement.point : null;

function EndpointMarker({ type, x, y, angle = 0, color = '#1a73e8', opacity = 1, scale = 1 }) {
  if (!type) return null;
  if (type === 'open' || type === 'closed') {
    return <circle cx={x} cy={y} r={9 * scale} fill={type === 'closed' ? color : 'rgba(255,255,255,0.72)'} stroke={color} strokeWidth={4 * scale} opacity={opacity} />;
  }
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} opacity={opacity}><polygon points="14,0 -6,-9 -6,9" fill={color} /></g>;
}

const makePointDragImage = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 44;
  canvas.height = 44;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(0,166,166,0.28)';
  context.beginPath();
  context.arc(22, 22, 17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = POINT_GUIDE_COLOR;
  context.beginPath();
  context.arc(22, 22, 8, 0, Math.PI * 2);
  context.fill();
  return canvas;
};

const makeMarkerDragImage = (type) => {
  const canvas = document.createElement('canvas');
  canvas.width = 52;
  canvas.height = 52;
  const context = canvas.getContext('2d');
  context.globalAlpha = 0.62;
  context.strokeStyle = '#1a73e8';
  context.fillStyle = '#1a73e8';
  context.lineWidth = 4;
  if (type === 'arrow') {
    context.beginPath();
    context.moveTo(42, 26);
    context.lineTo(15, 10);
    context.lineTo(15, 42);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(26, 26, 12, 0, Math.PI * 2);
    if (type === 'closed') context.fill();
    else context.stroke();
  }
  return canvas;
};

const normalizeAnalysisRequests = (question, spec, window, allowDefault) => {
  const provided = Array.isArray(question.analysisRequests) && question.analysisRequests.length ? question.analysisRequests : null;
  const requests = provided || (allowDefault ? [{ id: 'feature', kind: 'point', feature: question.analysisFeature || 'vertex', label: question.analysisFeatureLabel || question.analysisFeature || 'requested feature' }] : []);
  return requests.map((request, index) => {
    const id = String(request.id || `analysis-${index + 1}`);
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
    const expected = request.expected || getGraphFeaturePoints(spec, feature, window);
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

const stageButtonStyle = (active, disabled = false) => ({
  border: active ? '2px solid #1a73e8' : '1px solid #c5d5ef',
  background: active ? '#e8f0fe' : '#fff',
  color: active ? '#174ea6' : '#5f6368',
  borderRadius: '999px',
  padding: '8px 14px',
  fontWeight: 'bold',
  opacity: disabled ? 0.45 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

export default function InteractiveGraphWorkspace({ question, onStateChange, mode = 'investigate', onUndoStateChange = null, feedback = null, draftKey = null }) {
  const mobileInteraction = useMobileInteractionMode();
  const svgRef = useRef(null);
  const drawingRef = useRef([]);
  const [drawing, setDrawing] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [draggingMarkerType, setDraggingMarkerType] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [dropCandidate, setDropCandidate] = useState(null);
  const [dropMagneticTarget, setDropMagneticTarget] = useState(null);
  const [pointFeedback, setPointFeedback] = useState('');
  const [drawFeedback, setDrawFeedback] = useState('');
  const [activeMarker, setActiveMarker] = useState(null);
  const [activeAnalysisPartId, setActiveAnalysisPartId] = useState(null);
  const [stage, setStage] = useLocalDraftState(draftKey ? `${draftKey}:graph-stage` : null, mode === 'analysis' ? 'analysis' : 'construct');
  const lastMarkerFeedbackRef = useRef('');

  const functionSpec = question.functionSpec || {};
  const graph = question.graph || {};
  const requestedShowCoordinates = question.showCoordinates ?? graph.showCoordinates ?? true;
  const studentChoosesX = Boolean(question.studentChoosesX || question.chooseXValues);
  const pointOnly = Boolean(question.pointOnly || question.plotMode === 'points');
  const constructionEnabled = mode !== 'analysis';
  const tasks = useMemo(() => constructionEnabled ? (question.pointTasks || buildInteractivePointTasks(functionSpec, { points: question.graphAnswer?.suggestedPoints, includeUndefinedChecks: question.includeUndefinedChecks, undefinedCount: question.undefinedCount, studentChoosesX })) : [], [question, functionSpec, studentChoosesX, constructionEnabled]);
  // Magnetic targets are NEVER inferred from task.expected. They must be
  // explicitly supplied as student-known coordinates (for example, points from
  // a completed/validated table stage). This keeps magnetic snapping from
  // becoming an invisible answer-finder.
  const magneticSnapTargets = useMemo(
    () => normalizeMagneticSnapTargets(question.magneticSnapTargets, tasks),
    [question.magneticSnapTargets, tasks],
  );
  const window = useMemo(() => buildInteractiveGraphWindow(functionSpec, tasks, graph), [functionSpec, tasks, graph]);
  const xGridStep = Math.max(0.000001, Number(window.xStep ?? 1));
  const yGridStep = Math.max(0.000001, Number(window.yStep ?? 1));
  const skipCounting = xGridStep > 1 || yGridStep > 1;
  // Grid spacing is a DISPLAY choice, not an answer-input restriction. The old
  // code snapped to xStep/yStep, so a normal grid with step 1 made points such
  // as (1, 1.5) literally impossible to place even though the graph engine's
  // own default snapStep is 0.5. Honor the construction snap independently and
  // allow an author to make either axis finer when a task needs it.
  const requestedSnapStep = graph.snapStep ?? window.snapStep;
  const visiblePaths = useMemo(() => pointOnly ? [] : sampleVisibleFunctionPaths(functionSpec, window), [functionSpec, window, pointOnly]);
  // Rule 5 needs to know where the curve actually is, so the samples are taken
  // before the snap is resolved rather than after.
  const curveSamples = useMemo(() => visiblePaths.flat(), [visiblePaths]);
  const snapStep = useMemo(
    () => resolveReachableSnapStep(requestedSnapStep, tasks, curveSamples),
    [requestedSnapStep, tasks, curveSamples],
  );
  // The visible grid and the accepted precision are separate: the graph may
  // accept a quarter without drawing quarter lines everywhere.
  const xSnapStep = Math.min(xGridStep, snapStep, positiveStep(graph.xSnapStep ?? window.xSnapStep, snapStep));
  const ySnapStep = Math.min(yGridStep, snapStep, positiveStep(graph.ySnapStep ?? window.ySnapStep, snapStep));
  const showCoordinates = skipCounting ? true : requestedShowCoordinates;
  const endpointRequirements = useMemo(() => pointOnly ? [] : (constructionEnabled ? (question.endpointRequirements || getDefaultEndpointRequirements(functionSpec, visiblePaths, { ...question, graph: window })) : getDefaultEndpointRequirements(functionSpec, visiblePaths, { ...question, graph: window })), [question, functionSpec, visiblePaths, window, constructionEnabled, pointOnly]);
  const boundaryOnly = endpointRequirements.length > 0 && endpointRequirements.every((requirement) => requirement.marker === 'open' || requirement.marker === 'closed');
  const continuationOnly = endpointRequirements.length > 0 && endpointRequirements.every((requirement) => requirement.marker === 'arrow');
  const availableMarkerTypes = boundaryOnly ? ['open', 'closed'] : continuationOnly ? ['arrow'] : ['arrow', 'open', 'closed'];
  const endpointSectionTitle = boundaryOnly ? 'Boundary Markers' : continuationOnly ? 'Continuation' : 'Graph End Markers';
  const endpointInstruction = boundaryOnly
    ? 'Show exactly where the relationship stops. Choose whether each boundary value is included (closed) or excluded (open).'
    : continuationOnly
      ? 'Show that the function continues beyond the visible coordinate plane.'
      : 'Use arrows for continuation and open/closed circles for finite boundaries.';
  const endpointCompletionNoun = boundaryOnly ? 'boundary marker' : continuationOnly ? 'continuation arrow' : 'end marker';
  const analysisParts = useMemo(() => normalizeAnalysisRequests(question, functionSpec, window, mode === 'analysis'), [question, functionSpec, window, mode]);
  const analysisEnabled = mode === 'analysis' || analysisParts.length > 0;

  // Parent components often rebuild an equivalent question object while a
  // student is working. Object identity is not a reason to clear selections,
  // feedback, or a partially-built graph. Reset only when the mathematical
  // graph task actually changes (or its draft key changes).
  const questionSemanticKey = JSON.stringify({
    mode,
    functionSpec,
    graph: window,
    pointTasks: tasks,
    analysisRequests: analysisParts,
    pointOnly,
  });

  const initialChosenX = useMemo(() => Object.fromEntries(tasks.filter((task) => Number.isFinite(Number(task.x))).map((task) => [task.id, String(task.x)])), [tasks]);
  const constructionHistory = useUndoHistory(
    { placements: {}, chosenXValues: initialChosenX, pointsValidated: false, strokes: [], snapped: false, markerPlacements: {} },
    60,
    draftKey ? `${draftKey}:graph-construction` : null,
  );
  const analysisHistory = useUndoHistory(
    { selections: {}, answers: {}, typedPoints: {}, noneSelections: {} },
    60,
    draftKey ? `${draftKey}:graph-analysis` : null,
  );
  const construction = constructionHistory.value;
  const analysis = analysisHistory.value;

  const innerWidth = WIDTH - PADDING * 2;
  const innerHeight = HEIGHT - PADDING * 2;
  const toScreenX = (x) => PADDING + ((x - window.xMin) / (window.xMax - window.xMin)) * innerWidth;
  const toScreenY = (y) => PADDING + ((window.yMax - y) / (window.yMax - window.yMin)) * innerHeight;
  const fromScreenX = (screenX) => window.xMin + ((screenX - PADDING) / innerWidth) * (window.xMax - window.xMin);
  const fromScreenY = (screenY) => window.yMax - ((screenY - PADDING) / innerHeight) * (window.yMax - window.yMin);
  const xTicks = useMemo(() => buildTicks(window.xMin, window.xMax, window.xStep ?? 1), [window]);
  const yTicks = useMemo(() => buildTicks(window.yMin, window.yMax, window.yStep ?? 1), [window]);
  const axisX = window.yMin <= 0 && window.yMax >= 0 ? toScreenY(0) : toScreenY(window.yMin);
  const axisY = window.xMin <= 0 && window.xMax >= 0 ? toScreenX(0) : toScreenX(window.xMin);
  const idealPaths = useMemo(() => visiblePaths.map((path) => buildSmoothGraphPath(path, toScreenX, toScreenY)), [visiblePaths, window]);
  const idealScreenPointPaths = useMemo(() => visiblePaths.map((path) => path.map(([x, y]) => [toScreenX(x), toScreenY(y)])), [visiblePaths, window]);
  const resolvedPointTasks = useMemo(() => tasks.map((task) => ({ ...task, resolvedExpected: resolveTaskExpected(task, functionSpec, construction.chosenXValues) })), [tasks, functionSpec, construction.chosenXValues]);
  const requiredGraphPoints = useMemo(() => resolvedPointTasks.filter((task) => Array.isArray(task.resolvedExpected) && task.role !== 'center').map((task) => [toScreenX(task.resolvedExpected[0]), toScreenY(task.resolvedExpected[1])]), [resolvedPointTasks, window]);
  const requiredStrokeCount = functionSpec.type === 'rational' ? 2 : 1;
  const pointParts = useMemo(() => gradePointPlacements(tasks, construction.placements, functionSpec, construction.chosenXValues, Math.max(0.22, snapStep * 0.48)), [tasks, construction.placements, construction.chosenXValues, functionSpec, snapStep]);
  const allMarkersPlaced = endpointRequirements.every((requirement) => Boolean(construction.markerPlacements[requirement.id]));
  const constructionReadyForAnalysis = !constructionEnabled || (construction.pointsValidated && (pointOnly || (construction.snapped && allMarkersPlaced)));

  useEffect(() => {
    if (!draftKey) {
      constructionHistory.reset({ placements: {}, chosenXValues: initialChosenX, pointsValidated: false, strokes: [], snapped: false, markerPlacements: {} });
      analysisHistory.reset({ selections: {}, answers: {}, typedPoints: {}, noneSelections: {} });
    }
    setActiveTaskId(null);
    setDraggingTaskId(null);
    setDraggingMarkerType(null);
    setHoverPoint(null);
    setDropCandidate(null);
    setDropMagneticTarget(null);
    setPointFeedback('');
    setDrawFeedback('');
    setActiveMarker(null);
    setActiveAnalysisPartId(analysisParts.find((part) => part.kind === 'point')?.id || analysisParts[0]?.id || null);
    if (!draftKey) setStage(mode === 'analysis' ? 'analysis' : 'construct');
  }, [questionSemanticKey, draftKey]);

  useEffect(() => {
    if (mode === 'investigate' && analysisEnabled && constructionReadyForAnalysis) setStage('analysis');
  }, [mode, analysisEnabled, constructionReadyForAnalysis]);

  useEffect(() => {
    const history = stage === 'analysis' ? analysisHistory : constructionHistory;
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: stage === 'analysis' ? 'Undo the last investigation response' : 'Undo the last graph-construction action' });
    return () => onUndoStateChange?.(null);
  }, [stage, construction, analysis, constructionHistory.canUndo, analysisHistory.canUndo, onUndoStateChange]);

  const analysisGradeParts = useMemo(() => analysisParts.map((part) => {
    if (part.kind === 'point') {
      const selected = analysis.selections[part.id] || [];
      const noneSelected = Boolean(analysis.noneSelections[part.id]);
      const typed = String(analysis.typedPoints[part.id] || '');
      const clickRequired = part.responseMode !== 'input';
      const inputRequired = part.responseMode !== 'click';
      const clickComplete = !clickRequired || noneSelected || selected.length === part.expected.length;
      const inputComplete = !inputRequired || typed.trim() !== '';
      const clickCorrect = !clickRequired || analysisSelectionsAreCorrect(selected, part.expected, Math.max(0.28, snapStep * 0.58), noneSelected);
      const inputCorrect = !inputRequired || pointSetInputMatches(typed, part.expected, Math.max(0.28, snapStep * 0.58));
      return { id: part.id, label: part.label, isComplete: clickComplete && inputComplete, isCorrect: clickCorrect && inputCorrect, response: `${noneSelected ? 'Does not exist' : selected.map(pointLabel).join(', ')}${typed ? `; typed: ${typed}` : ''}` };
    }
    const response = String(analysis.answers[part.id] || '');
    return { id: part.id, label: part.label, isComplete: response.trim() !== '', isCorrect: response.trim() !== '' && setAnswerMatches(response, part.acceptedAnswers), response };
  }), [analysisParts, analysis, snapStep]);

  const markerParts = useMemo(() => endpointRequirements.flatMap((requirement, index) => {
    const placement = construction.markerPlacements[requirement.id];
    const point = markerPoint(placement);
    const locationCorrect = Boolean(placement) && (typeof placement === 'string' || placement.locationCorrect === true || (point && pointDistance(point, requirement.point) <= Math.max(0.55, snapStep * 1.8)));
    return [
      { id: `${requirement.id}-placement`, label: `Graph end ${index + 1}: symbol placement`, isComplete: Boolean(placement), isCorrect: locationCorrect, response: point ? pointLabel(point) : placement ? 'snapped to endpoint' : '' },
      { id: `${requirement.id}-type`, label: `Graph end ${index + 1}: symbol type`, isComplete: Boolean(placement), isCorrect: markerValue(placement) === requirement.marker, response: markerValue(placement) },
    ];
  }), [endpointRequirements, construction.markerPlacements, snapStep]);

  useEffect(() => {
    if (!feedback || feedback.isCorrect !== false || !Array.isArray(feedback.partGrades)) return;
    const feedbackKey = `${feedback.attemptCount ?? ''}|${feedback.status ?? ''}|${feedback.remainingAttempts ?? ''}`;
    if (lastMarkerFeedbackRef.current === feedbackKey) return;
    const incorrectEndpointIds = new Set();
    feedback.partGrades.forEach((part) => {
      if (part?.isCorrect) return;
      const match = String(part?.id || '').match(/^(endpoint-.*)-(placement|type)$/);
      if (match) incorrectEndpointIds.add(match[1]);
    });
    if (!incorrectEndpointIds.size) return;
    lastMarkerFeedbackRef.current = feedbackKey;
    constructionHistory.setValue((current) => {
      const markerPlacements = { ...current.markerPlacements };
      incorrectEndpointIds.forEach((id) => delete markerPlacements[id]);
      return { ...current, markerPlacements };
    }, { record: false });
    setStage('construct');
    setDrawFeedback(`One or more ${boundaryOnly ? 'boundary markers' : 'graph-end markers'} need revision. The incorrect symbol was removed; use the highlighted graph end to try again.`);
  }, [feedback, constructionHistory]);

  useEffect(() => {
    const constructionParts = constructionEnabled ? [
      ...pointParts.map((part) => ({ ...part, label: `Point placement: ${part.label}`, isComplete: construction.pointsValidated && part.isComplete, isCorrect: construction.pointsValidated && part.isCorrect })),
      ...(pointOnly ? [] : [{ id: 'graph-curve', label: 'Freehand curve and snap', isComplete: construction.snapped, isCorrect: construction.snapped, response: construction.snapped ? 'snapped' : 'not snapped' }]),
      ...(pointOnly ? [] : markerParts),
    ] : [];
    const parts = [...constructionParts, ...(analysisEnabled ? analysisGradeParts : [])];
    const constructionComplete = !constructionEnabled || (construction.pointsValidated && (pointOnly || (construction.snapped && allMarkersPlaced)));
    const analysisComplete = !analysisEnabled || (analysisGradeParts.length > 0 && analysisGradeParts.every((part) => part.isComplete));
    const complete = constructionComplete && analysisComplete;
    const correct = complete && parts.every((part) => part.isCorrect);
    onStateChange({
      isComplete: complete,
      isCorrect: correct,
      responseKey: JSON.stringify({ construction, analysis }),
      questionDetails: `${question.prompt || (pointOnly ? 'Plot the table points.' : 'Investigate the function.')} Points: ${Object.entries(construction.placements).map(([id, value]) => `${id}=${taskPlacementLabel(value)}`).join('; ') || 'not required'}. ${pointOnly ? 'Point-only graph.' : `Curve: ${construction.snapped ? 'complete' : 'incomplete'}. Graph boundaries/continuation: ${Object.entries(construction.markerPlacements).map(([id, value]) => `${id}=${markerValue(value)}`).join('; ') || 'not entered'}.`} Analysis: ${analysisGradeParts.map((part) => `${part.label}=${part.response || 'blank'}`).join('; ') || 'not required'}.`,
      parts,
    });
  }, [construction, analysis, constructionEnabled, analysisEnabled, pointParts, markerParts, analysisGradeParts, allMarkersPlaced, pointOnly, question, onStateChange]);

  const eventToScreenPoint = (event) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rectangle = svg.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return [(clientX - rectangle.left) * (WIDTH / rectangle.width), (clientY - rectangle.top) * (HEIGHT / rectangle.height)];
  };
  const eventToGraphPoint = (event) => {
    const screen = eventToScreenPoint(event);
    if (!screen || screen[0] < PADDING || screen[0] > WIDTH - PADDING || screen[1] < PADDING || screen[1] > HEIGHT - PADDING) return null;
    return [snapValue(fromScreenX(screen[0]), xSnapStep), snapValue(fromScreenY(screen[1]), ySnapStep)];
  };

  const eventToTaskPlacement = (event, taskId) => {
    const screen = eventToScreenPoint(event);
    if (!screen || screen[0] < PADDING || screen[0] > WIDTH - PADDING || screen[1] < PADDING || screen[1] > HEIGHT - PADDING) return null;
    const latticePoint = [snapValue(fromScreenX(screen[0]), xSnapStep), snapValue(fromScreenY(screen[1]), ySnapStep)];
    if (!taskId || !magneticSnapTargets.length) return { point: latticePoint, magnetic: null };
    const rectangle = svgRef.current?.getBoundingClientRect?.();
    const magnetic = findMagneticSnapTarget({
      taskId,
      rawScreenPoint: screen,
      targets: magneticSnapTargets,
      toScreenPoint: (point) => [toScreenX(point[0]), toScreenY(point[1])],
      cssScaleX: rectangle?.width ? rectangle.width / WIDTH : 1,
      cssScaleY: rectangle?.height ? rectangle.height / HEIGHT : 1,
      radiusPixels: MAGNETIC_POINT_SNAP_PIXELS,
    });
    return { point: magnetic?.point || latticePoint, magnetic };
  };

  // KEYBOARD ACCESS TO THE PLANE.
  //
  // This workspace renders the largest group of tool-backed Path questions, and
  // it had no keyboard path of any kind — no tabIndex, no onKeyDown. Every
  // placement was a drag, or a click-the-card-then-click-the-pixel. A student
  // who cannot use a trackpad accurately, or cannot use one at all, could not
  // answer these questions.
  //
  // Two routes are added, and they are alternatives to the mouse rather than
  // replacements for the thinking: the student still has to decide WHICH point
  // to place. Nothing here computes a coordinate for them.
  const [keyboardCursor, setKeyboardCursor] = useState(null);
  const [typedX, setTypedX] = useState('');
  const [typedY, setTypedY] = useState('');
  const [keyboardAnnouncement, setKeyboardAnnouncement] = useState('');

  /** Where an arrow-key cursor should start: the middle of the visible plane. */
  const defaultCursor = () => [
    Number((((window.xMin + window.xMax) / 2)).toFixed(4)),
    Number((((window.yMin + window.yMax) / 2)).toFixed(4)),
  ];

  const clampToWindow = ([x, y]) => [
    Math.min(window.xMax, Math.max(window.xMin, x)),
    Math.min(window.yMax, Math.max(window.yMin, y)),
  ];

  const placeTask = (taskId, point, options = {}) => {
    if (!taskId || !point || construction.pointsValidated) return;
    constructionHistory.setValue((current) => ({ ...current, placements: { ...current.placements, [taskId]: point } }));
    const task = tasks.find((item) => item.id === taskId);
    setActiveTaskId(null);
    setDraggingTaskId(null);
    setDropCandidate(null);
    setDropMagneticTarget(null);
    setPointFeedback(options.magnetic ? `${task?.label || 'Point'} snapped to your validated coordinate ${pointLabel(point)}.` : '');
  };

  const nearestEndpoint = (point) => {
    if (!point || !endpointRequirements.length) return null;
    const unfilled = endpointRequirements.filter((requirement) => !construction.markerPlacements[requirement.id]);
    const candidates = unfilled.length ? unfilled : endpointRequirements;
    return candidates.map((requirement) => ({ requirement, distance: Math.hypot(toScreenX(point[0]) - toScreenX(requirement.point[0]), toScreenY(point[1]) - toScreenY(requirement.point[1])) })).sort((a, b) => a.distance - b.distance)[0];
  };

  const placeMarkerAt = (markerType, point) => {
    if (!construction.snapped || !markerType || !point) return;
    const nearest = nearestEndpoint(point);
    if (!nearest) return;
    const magnetic = nearest.distance <= MARKER_SNAP_PIXELS;
    constructionHistory.setValue((current) => ({
      ...current,
      markerPlacements: {
        ...current.markerPlacements,
        [nearest.requirement.id]: { marker: markerType, point: magnetic ? nearest.requirement.point : point, droppedPoint: point, locationCorrect: magnetic },
      },
    }));
    setActiveMarker(null);
    setDraggingMarkerType(null);
    setDropCandidate(null);
    setDropMagneticTarget(null);
    setDrawFeedback(magnetic ? `The ${markerLabels[markerType]} snapped to End ${endpointRequirements.indexOf(nearest.requirement) + 1}.` : `The marker was recorded for End ${endpointRequirements.indexOf(nearest.requirement) + 1}. Its placement will be graded separately.`);
  };

  const handleGridClick = (event) => {
    const point = eventToGraphPoint(event);
    if (!point) return;
    if (stage === 'analysis') {
      const part = analysisParts.find((item) => item.id === activeAnalysisPartId && item.kind === 'point');
      if (!part || part.responseMode === 'input') return;
      analysisHistory.setValue((current) => {
        const existing = current.selections[part.id] || [];
        const selected = existing.length >= Math.max(1, part.expected.length) ? [point] : [...existing, point];
        return { ...current, noneSelections: { ...current.noneSelections, [part.id]: false }, selections: { ...current.selections, [part.id]: selected } };
      });
      return;
    }
    if (construction.snapped && activeMarker) placeMarkerAt(activeMarker, point);
    else if (!construction.pointsValidated && activeTaskId) {
      const placement = eventToTaskPlacement(event, activeTaskId);
      if (placement) placeTask(activeTaskId, placement.point, { magnetic: Boolean(placement.magnetic) });
    }
  };

  /**
   * Place at an explicit coordinate — the shared destination for the arrow-key
   * cursor and the typed-entry box.
   *
   * Deliberately the SAME code path the mouse uses (placeTask / placeMarkerAt /
   * the analysis selection), so a keyboard student's answer is graded by the
   * same rules and cannot drift from the pointer student's.
   */
  const placeAtCoordinate = (point) => {
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
    const target = clampToWindow(point);
    if (stage === 'analysis') {
      const part = analysisParts.find((item) => item.id === activeAnalysisPartId && item.kind === 'point');
      if (!part || part.responseMode === 'input') {
        setKeyboardAnnouncement('Choose which part you are answering first.');
        return false;
      }
      analysisHistory.setValue((current) => {
        const existing = current.selections[part.id] || [];
        const selected = existing.length >= Math.max(1, part.expected.length) ? [target] : [...existing, target];
        return {
          ...current,
          noneSelections: { ...current.noneSelections, [part.id]: false },
          selections: { ...current.selections, [part.id]: selected },
        };
      });
      setKeyboardAnnouncement(`Selected ${pointLabel(target)} for ${part.label}.`);
      return true;
    }
    if (construction.snapped && activeMarker) {
      placeMarkerAt(activeMarker, target);
      setKeyboardAnnouncement(`Placed ${markerLabels[activeMarker] || 'marker'} at ${pointLabel(target)}.`);
      return true;
    }
    if (!construction.pointsValidated && activeTaskId) {
      const task = tasks.find((item) => item.id === activeTaskId);
      placeTask(activeTaskId, target);
      setKeyboardAnnouncement(`Placed ${task?.label || 'point'} at ${pointLabel(target)}.`);
      return true;
    }
    setKeyboardAnnouncement('Choose which point you are placing first, then press Enter on the grid.');
    return false;
  };

  /**
   * Arrow keys move a cursor; Enter places at it.
   *
   * One snap step per press, five with Shift, so a student can cross the plane
   * without hundreds of keystrokes but can still land on an exact lattice
   * point.
   */
  const handleGridKeyDown = (event) => {
    const STEP_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const delta = STEP_KEYS[event.key];
    if (delta) {
      event.preventDefault();
      const step = (Number(snapStep) || 0.5) * (event.shiftKey ? 5 : 1);
      setKeyboardCursor((current) => {
        const base = current || defaultCursor();
        const next = clampToWindow([
          Number((base[0] + delta[0] * step).toFixed(4)),
          Number((base[1] + delta[1] * step).toFixed(4)),
        ]);
        setKeyboardAnnouncement(pointLabel(next));
        return next;
      });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const cursor = keyboardCursor || defaultCursor();
      if (!keyboardCursor) setKeyboardCursor(cursor);
      placeAtCoordinate(cursor);
      return;
    }
    if (event.key === 'Escape') {
      setActiveTaskId(null);
      setKeyboardCursor(null);
      setKeyboardAnnouncement('Cursor cleared.');
    }
  };

  const checkPoints = () => {
    const correct = placementsMatchTasks(tasks, construction.placements, Math.max(0.22, snapStep * 0.48), functionSpec, construction.chosenXValues);
    if (correct) {
      constructionHistory.setValue((current) => ({ ...current, pointsValidated: true }));
      setPointFeedback(pointOnly ? 'All point placements are correct.' : 'All point placements are correct. The drawing layer is unlocked.');
    } else {
      const incorrect = pointParts.filter((part) => !part.isCorrect).map((part) => part.label);
      const centerX = Number(functionSpec.h ?? 0);
      const chosenValues = tasks.filter((task) => task.studentChoosesX).map((task) => Number(construction.chosenXValues[task.id])).filter(Number.isFinite);
      const needsBothSides = ['absolute', 'quadratic', 'cubic', 'cubeRoot', 'rational'].includes(functionSpec.type);
      const distributionHint = studentChoosesX && needsBothSides && (chosenValues.filter((value) => value < centerX).length < 2 || chosenValues.filter((value) => value > centerX).length < 2) ? ' Choose two outer x-values on each side of the center.' : '';
      setPointFeedback(`Revise: ${incorrect.join(', ') || 'one or more point tasks'}.${distributionHint} Use Undo to remove the last placement.`);
    }
  };

  const beginDrawing = (event) => {
    if (pointOnly || stage !== 'construct' || !construction.pointsValidated || construction.snapped) return;
    const point = eventToScreenPoint(event);
    if (!point) return;
    drawingRef.current = [point];
    setDrawing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueDrawing = (event) => {
    const taskPlacement = stage === 'construct' && !construction.pointsValidated && activeTaskId
      ? eventToTaskPlacement(event, activeTaskId)
      : null;
    const graphPoint = taskPlacement?.point || eventToGraphPoint(event);
    setHoverPoint(graphPoint);
    if (taskPlacement) {
      setDropCandidate(taskPlacement.point);
      setDropMagneticTarget(taskPlacement.magnetic);
    }
    if (pointOnly || !drawing || !construction.pointsValidated || construction.snapped) return;
    const point = eventToScreenPoint(event);
    if (!point) return;
    const previous = drawingRef.current[drawingRef.current.length - 1];
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 3) drawingRef.current.push(point);
  };
  const endDrawing = (event) => {
    if (pointOnly || !drawing) return;
    setDrawing(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const finished = [...drawingRef.current];
    drawingRef.current = [];
    if (finished.length < 2) return;
    const completed = [...construction.strokes, finished];
    constructionHistory.setValue((current) => ({ ...current, strokes: completed }));
    if (completed.length < requiredStrokeCount) {
      setDrawFeedback(`Draw ${requiredStrokeCount - completed.length} more branch before the graph can snap.`);
      return;
    }
    const matches = roughSketchMatchesGraph({ strokes: completed, requiredScreenPoints: requiredGraphPoints, idealScreenPaths: idealScreenPointPaths, requiredStrokeCount, tolerance: 68 });
    if (matches) {
      constructionHistory.setValue((current) => ({ ...current, strokes: completed, snapped: true }));
      setDrawFeedback(endpointRequirements.length ? `The sketch passed through the validated points and snapped to the exact function. Add the required ${endpointCompletionNoun}${endpointRequirements.length === 1 ? '' : 's'}.` : 'The sketch passed through the validated points and snapped to the exact function.');
    } else setDrawFeedback('The sketch must travel through the plotted points. Use Undo or Clear Sketch and trace the function again.');
  };

  const showPredrawnGraph = !pointOnly && (mode === 'analysis' || construction.snapped);
  const activePointPart = analysisParts.find((part) => part.id === activeAnalysisPartId && part.kind === 'point');
  const dragGuideActive = Boolean((draggingTaskId || activeTaskId) && dropCandidate && !construction.pointsValidated);
  const markerGhostActive = Boolean((draggingMarkerType || activeMarker) && dropCandidate && construction.snapped);

  const workspaceTitle = pointOnly
    ? 'Plot the Points'
    : question.type === 'functionGraph'
      ? 'Graph the Function'
    : mode === 'analysis'
      ? 'Analyze the Graph'
      : 'Explore the Function';

  return (
    <div style={{ textAlign: 'left' }}>
      <h2 style={{ color: '#202124', marginTop: 0, textAlign: 'center' }}>{workspaceTitle}</h2>
      <QuestionPrompt>{question.prompt || (pointOnly ? 'Plot every point from your table.' : 'Construct the function, show its boundaries or continuation clearly, and complete every requested analysis part.')}</QuestionPrompt>
      {question.showEquation !== false && question.equationLatex && <div style={{ margin: '18px auto', padding: '14px 20px', width: 'fit-content', maxWidth: '100%', borderRadius: '10px', background: '#f8f9fa', color: '#1a73e8', fontSize: '27px', fontWeight: 'bold' }}><MathDisplay value={question.equationLatex} format="latex" /></div>}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '9px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {constructionEnabled && <button type="button" onClick={() => setStage('construct')} style={stageButtonStyle(stage === 'construct')}>{pointOnly ? '1. Plot Points' : '1. Construct Graph'}</button>}
        {analysisEnabled && <button type="button" disabled={!constructionReadyForAnalysis} onClick={() => constructionReadyForAnalysis && setStage('analysis')} style={stageButtonStyle(stage === 'analysis', !constructionReadyForAnalysis)}>2. Analyze Function</button>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <span style={{ padding: '7px 12px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontWeight: 'bold' }}>{pointOnly ? 'Table Points' : (FUNCTION_GRAPH_LABELS[functionSpec.type] || 'Function')}</span>
        <span style={{ padding: '7px 12px', borderRadius: '999px', background: showCoordinates ? '#e6f4ea' : '#f1f3f4', color: showCoordinates ? '#137333' : '#5f6368', fontWeight: 'bold' }}>Coordinates {showCoordinates ? 'shown' : 'hidden'}{skipCounting ? ' · required for skip-count grid' : ''}</span>
        {studentChoosesX && constructionEnabled && <span style={{ padding: '7px 12px', borderRadius: '999px', background: '#f3e8fd', color: '#681da8', fontWeight: 'bold' }}>Choose your own x-values</span>}
      </div>

      <div className="mathmaster-function-workspace-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(195px, 235px) minmax(0, 760px)', gap: '16px', justifyContent: 'center', alignItems: 'start' }}>
        <aside style={{ border: '1px solid #dfe3e7', borderRadius: '12px', background: '#f8fbff', padding: '12px' }}>
          {stage === 'construct' ? (
            <>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#174ea6' }}>Plotting Points</h3>
              <p style={{ margin: '0 0 10px', color: '#5f6368', fontSize: '12px' }}>{mobileInteraction.isMobile ? 'Tap a point card, then tap its location on the coordinate plane.' : 'Drag a point, or select it and click the coordinate plane. Colored guides show the exact location.'}</p>
              {magneticSnapTargets.length > 0 && <p style={{ margin: '0 0 10px', padding: '7px 8px', borderRadius: '7px', background: '#e6f4ea', color: '#137333', fontSize: '12px', lineHeight: 1.4 }}><strong>Magnetic placement is on.</strong> Points from your completed table will gently snap to the exact coordinate when you get close.</p>}
              <div style={{ display: 'grid', gap: '8px' }}>
                {tasks.map((task) => {
                  const placement = construction.placements[task.id];
                  const active = activeTaskId === task.id;
                  const xValue = construction.chosenXValues[task.id] ?? '';
                  const canPlace = task.expected === 'undefined' || Number.isFinite(Number(xValue));
                  return <div key={task.id} style={{ border: active ? '2px solid #1a73e8' : '1px solid #c9d4e5', borderRadius: '9px', background: placement ? '#eef5ff' : '#fff', padding: '9px' }}>
                    <button type="button" draggable={!mobileInteraction.isMobile && !construction.pointsValidated && canPlace} onDragStart={(event) => { event.dataTransfer.setData('application/x-mathmaster-point', task.id); event.dataTransfer.setDragImage(makePointDragImage(), 22, 22); setDraggingTaskId(task.id); }} onDragEnd={() => { setDraggingTaskId(null); setDropCandidate(null); setDropMagneticTarget(null); }} aria-pressed={active}
                    aria-label={`${task.label}${active ? ' — selected. Move the cursor on the plane and press Enter, or type an exact coordinate.' : ''}`}
                    onClick={() => { if (!construction.pointsValidated && canPlace) { setActiveTaskId(task.id); setKeyboardAnnouncement(`${task.label} selected. Use the arrow keys on the plane and press Enter, or type an exact coordinate below.`); } }} style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: construction.pointsValidated || !canPlace ? 'default' : 'grab' }}>
                      <strong style={{ color: '#202124' }}>{task.label}{!['center', 'key'].includes(task.role) && task.x !== null ? `: x = ${task.x}` : ''}</strong>
                      <span style={{ display: 'block', color: placement ? '#174ea6' : '#5f6368', fontSize: '12px', marginTop: '3px' }}>{taskPlacementLabel(placement)}</span>
                    </button>
                    {task.studentChoosesX && <label style={{ display: 'block', marginTop: '7px', fontSize: '12px', fontWeight: 'bold', color: '#5f6368' }}>Choose x<input type="number" step={xSnapStep} value={xValue} onChange={(event) => constructionHistory.setValue((current) => ({ ...current, chosenXValues: { ...current.chosenXValues, [task.id]: event.target.value }, placements: { ...current.placements, [task.id]: undefined } }))} style={{ width: '100%', marginTop: '4px', padding: '7px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #9fb8dd' }} /></label>}
                  </div>;
                })}
              </div>
              {tasks.some((task) => task.expected === 'undefined') && <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); placeTask(event.dataTransfer.getData('application/x-mathmaster-point') || activeTaskId, 'undefined'); }} onClick={() => activeTaskId && placeTask(activeTaskId, 'undefined')} style={{ width: '100%', marginTop: '12px', minHeight: '72px', border: '2px dashed #9334e6', borderRadius: '10px', background: '#f8f0ff', color: '#6f2da8', fontWeight: 'bold' }}>Not Real / Undefined</button>}
              {!construction.pointsValidated && <button type="button" onClick={checkPoints} disabled={Object.keys(construction.placements).length < tasks.length} style={{ width: '100%', marginTop: '12px', padding: '10px', border: 'none', borderRadius: '8px', background: Object.keys(construction.placements).length >= tasks.length ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 'bold' }}>Check Point Placements</button>}
              {construction.snapped && endpointRequirements.length > 0 && <div style={{ marginTop: '14px', borderTop: '1px solid #dfe3e7', paddingTop: '12px' }}>
                <h3 style={{ margin: '0 0 5px', fontSize: '15px' }}>{endpointSectionTitle}</h3>
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#5f6368', lineHeight: 1.45 }}>{endpointInstruction} {mobileInteraction.isMobile ? 'Tap a marker, then tap near a graph end; a generous magnetic area helps it snap into place.' : 'Drag or select a marker, then place it near a graph end; a generous magnetic area helps it snap into place.'}</p>
                {availableMarkerTypes.map((type) => { const label = markerLabels[type]; return <button key={type} type="button" draggable={!mobileInteraction.isMobile} onDragStart={(event) => { event.dataTransfer.setData('application/x-mathmaster-marker', type); event.dataTransfer.setDragImage(makeMarkerDragImage(type), 26, 26); setDraggingMarkerType(type); }} onDragEnd={() => { setDraggingMarkerType(null); setDropCandidate(null); setDropMagneticTarget(null); }} aria-pressed={activeMarker === type}
                  onClick={() => { setActiveMarker(type); setKeyboardAnnouncement(`${label} selected. Use the arrow keys on the plane and press Enter, or type an exact coordinate.`); }} style={{ width: '100%', marginTop: '6px', padding: '9px', border: activeMarker === type ? '2px solid #1a73e8' : '1px solid #c9d4e5', borderRadius: '8px', background: '#fff', fontWeight: 'bold', cursor: 'grab', display: 'flex', alignItems: 'center', gap: '9px' }}><span style={{ fontSize: '23px', color: '#1a73e8' }}>{markerSymbols[type]}</span><span><span style={{ display: 'block' }}>{label}</span><span style={{ display: 'block', fontSize: '11px', color: '#5f6368', fontWeight: 400 }}>{markerExplanations[type]}</span></span></button>; })}
                <div style={{ marginTop: '10px', display: 'grid', gap: '5px' }}>{endpointRequirements.map((requirement, index) => { const placement = construction.markerPlacements[requirement.id]; return <div key={requirement.id} style={{ fontSize: '12px', color: placement ? '#174ea6' : '#5f6368' }}>{boundaryOnly ? 'Boundary' : 'End'} {index + 1}: {placement ? markerLabels[markerValue(placement)] : 'not placed'}</div>; })}</div>
              </div>}
            </>
          ) : (
            <>
              <h3 style={{ margin: '0 0 8px', fontSize: '16px', color: '#174ea6' }}>Analysis Parts</h3>
              {analysisParts.map((part) => {
                const grade = feedback?.partGrades?.find((item) => item.id === part.id);
                const selected = analysis.selections[part.id] || [];
                const noneSelected = Boolean(analysis.noneSelections[part.id]);
                return <div key={part.id} style={{ marginTop: '9px', padding: '10px', borderRadius: '9px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : activeAnalysisPartId === part.id ? '#1a73e8' : '#d9e2f1'}`, background: grade && !grade.isCorrect ? '#fff8f7' : '#fff' }}>
                  <button type="button" onClick={() => setActiveAnalysisPartId(part.id)} style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', fontWeight: 'bold', color: '#202124' }}>{part.label}</button>
                  {part.kind === 'point' ? <>
                    {part.responseMode !== 'input' && <div style={{ marginTop: '5px', fontSize: '12px', color: '#5f6368' }}>{noneSelected ? 'Marked: does not exist' : `${selected.length}/${part.expected.length || 1} selected`}</div>}
                    {part.allowNone && part.responseMode !== 'input' && <button type="button" onClick={() => analysisHistory.setValue((current) => ({ ...current, noneSelections: { ...current.noneSelections, [part.id]: !current.noneSelections[part.id] }, selections: { ...current.selections, [part.id]: [] } }))} style={{ marginTop: '7px', padding: '6px 9px', borderRadius: '7px', border: '1px solid #c5d5ef', background: noneSelected ? '#e8f0fe' : '#fff', color: '#174ea6', fontWeight: 'bold' }}>Does not exist</button>}
                    {part.responseMode !== 'click' && <div style={{ marginTop: '8px' }}><MathInput value={analysis.typedPoints[part.id] || ''} onChange={(value) => analysisHistory.setValue((current) => ({ ...current, typedPoints: { ...current.typedPoints, [part.id]: value } }))} placeholder={part.expected.length > 1 ? '(x₁, y₁), (x₂, y₂)' : '(x, y) or DNE'} inputStatus={grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral'} /></div>}
                  </> : <div style={{ marginTop: '8px' }}>{part.allowsEmptyAnswer && <button type="button" onClick={() => analysisHistory.setValue((current) => ({ ...current, answers: { ...current.answers, [part.id]: 'does not exist' } }))} style={{ marginBottom: '7px', padding: '6px 9px', borderRadius: '7px', border: '1px solid #c5d5ef', background: String(analysis.answers[part.id] || '').toLowerCase().includes('exist') ? '#e8f0fe' : '#fff', color: '#174ea6', fontWeight: 'bold' }}>Does not exist</button>}<MathInput value={analysis.answers[part.id] || ''} onChange={(value) => analysisHistory.setValue((current) => ({ ...current, answers: { ...current.answers, [part.id]: value } }))} toolProfile={part.notation === 'inequality' ? 'inequality' : part.notation === 'set' ? 'set' : 'interval'} showToolsInitially placeholder={part.notation} inputStatus={grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral'} /></div>}
                </div>;
              })}
            </>
          )}
        </aside>

        <figure style={{ margin: 0, width: 'min(100%, 780px)', padding: '10px', border: '1px solid #dfe3e7', borderRadius: '12px', background: '#fff', boxSizing: 'border-box' }}>
          <svg ref={svgRef} className="mathmaster-responsive-canvas mathmaster-touch-surface" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet" role="application"
            aria-label="Coordinate plane. Use the arrow keys to move the cursor, hold Shift to move faster, and press Enter to place at the cursor."
            tabIndex={0}
            onKeyDown={handleGridKeyDown}
            onFocus={() => { if (!keyboardCursor) { const start = defaultCursor(); setKeyboardCursor(start); setKeyboardAnnouncement(`Cursor at ${pointLabel(start)}. Arrow keys move, Enter places.`); } }}
            onClick={handleGridClick}
            onDragOver={(event) => {
              event.preventDefault();
              if (draggingTaskId) {
                const placement = eventToTaskPlacement(event, draggingTaskId);
                setDropCandidate(placement?.point || null);
                setDropMagneticTarget(placement?.magnetic || null);
                setHoverPoint(placement?.point || null);
              } else {
                const candidate = eventToGraphPoint(event);
                setDropCandidate(candidate);
                setDropMagneticTarget(null);
                setHoverPoint(candidate);
              }
            }}
            onDragLeave={() => { setDropCandidate(null); setDropMagneticTarget(null); }}
            onDrop={(event) => {
              event.preventDefault();
              const taskId = event.dataTransfer.getData('application/x-mathmaster-point');
              const markerType = event.dataTransfer.getData('application/x-mathmaster-marker');
              if (taskId) {
                const placement = eventToTaskPlacement(event, taskId);
                if (placement) placeTask(taskId, placement.point, { magnetic: Boolean(placement.magnetic) });
              } else if (markerType) {
                placeMarkerAt(markerType, eventToGraphPoint(event));
              }
            }}
            onPointerDown={beginDrawing} onPointerMove={continueDrawing} onPointerUp={endDrawing} onPointerCancel={endDrawing} onPointerLeave={() => { setHoverPoint(null); if (!draggingTaskId) { setDropCandidate(null); setDropMagneticTarget(null); } }}
            style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: stage === 'analysis' || (!construction.pointsValidated && activeTaskId) || (construction.snapped && activeMarker) ? 'crosshair' : (!pointOnly && construction.pointsValidated && !construction.snapped ? 'crosshair' : 'default') }}>
            <rect x={PADDING} y={PADDING} width={innerWidth} height={innerHeight} fill="#fff" stroke={(draggingTaskId || draggingMarkerType) && dropCandidate ? POINT_GUIDE_COLOR : '#cfd4da'} strokeWidth={(draggingTaskId || draggingMarkerType) && dropCandidate ? 4 : 1} />
            {xTicks.map((tick) => { const x = toScreenX(tick); return <g key={`x-${tick}`}><line x1={x} y1={PADDING} x2={x} y2={HEIGHT - PADDING} stroke="#eceff1" /><text x={x} y={axisX + 20} textAnchor="middle" fontSize="12" fill="#5f6368">{tick}</text></g>; })}
            {yTicks.map((tick) => { const y = toScreenY(tick); return <g key={`y-${tick}`}><line x1={PADDING} y1={y} x2={WIDTH - PADDING} y2={y} stroke="#eceff1" />{tick !== 0 && <text x={axisY - 9} y={y + 4} textAnchor="end" fontSize="12" fill="#5f6368">{tick}</text>}</g>; })}
            <line x1={PADDING} y1={axisX} x2={WIDTH - PADDING} y2={axisX} stroke="#5f6368" strokeWidth="2" /><line x1={axisY} y1={PADDING} x2={axisY} y2={HEIGHT - PADDING} stroke="#5f6368" strokeWidth="2" />

            {/* The keyboard cursor. Visible, because a student navigating by
                arrow keys still needs to see where they are. */}
            {keyboardCursor && (
              <g pointerEvents="none">
                <line x1={toScreenX(keyboardCursor[0])} y1={PADDING} x2={toScreenX(keyboardCursor[0])} y2={HEIGHT - PADDING} stroke="#9334e6" strokeWidth="1.5" strokeDasharray="5 4" />
                <line x1={PADDING} y1={toScreenY(keyboardCursor[1])} x2={WIDTH - PADDING} y2={toScreenY(keyboardCursor[1])} stroke="#9334e6" strokeWidth="1.5" strokeDasharray="5 4" />
                <circle cx={toScreenX(keyboardCursor[0])} cy={toScreenY(keyboardCursor[1])} r="9" fill="none" stroke="#9334e6" strokeWidth="3" />
                <text x={toScreenX(keyboardCursor[0]) + 13} y={toScreenY(keyboardCursor[1]) - 11} fontSize="13" fontWeight="700" fill="#6f2da8">{pointLabel(keyboardCursor)}</text>
              </g>
            )}

            {showPredrawnGraph && idealPaths.map((path, index) => <path key={`ideal-${index}`} className={construction.snapped ? 'mathmaster-snap-curve' : ''} d={path} fill="none" stroke="#1a73e8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
            {mode === 'analysis' && endpointRequirements.map((requirement) => { const x = toScreenX(requirement.point[0]); const y = toScreenY(requirement.point[1]); const angle = (Math.atan2(toScreenY(requirement.point[1] + requirement.vector[1]) - y, toScreenX(requirement.point[0] + requirement.vector[0]) - x) * 180) / Math.PI; return <EndpointMarker key={`analysis-${requirement.id}`} type={requirement.marker} x={x} y={y} angle={angle} color="#1a73e8" />; })}
            {!construction.snapped && construction.strokes.map((stroke, strokeIndex) => <polyline key={`stroke-${strokeIndex}`} points={stroke.map((point) => point.join(',')).join(' ')} fill="none" stroke="#7baaf7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />)}
            {drawing && drawingRef.current.length > 1 && <polyline points={drawingRef.current.map((point) => point.join(',')).join(' ')} fill="none" stroke="#7baaf7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />}

            {constructionEnabled && tasks.filter((task) => Array.isArray(construction.placements[task.id])).map((task) => { const point = construction.placements[task.id]; const isCenter = task.role === 'center'; const x = toScreenX(point[0]); const y = toScreenY(point[1]); return <g key={task.id}><circle cx={x} cy={y} r={isCenter ? 10 : 8} fill={isCenter ? '#fff' : POINT_GUIDE_COLOR} stroke={isCenter ? '#9334e6' : '#fff'} strokeWidth="3" />{isCenter && <text x={x - 4} y={y + 5} fontSize="17" fontWeight="bold" fill="#9334e6">×</text>}<rect x={x + 8} y={y - 29} width={Math.max(36, task.label.length * 7 + 12)} height="21" rx="6" fill="rgba(255,255,255,0.58)" /><text x={x + 14} y={y - 14} fontSize="12" fontWeight="bold" fill="#174ea6">{task.label}</text></g>; })}
            {dragGuideActive && <g pointerEvents="none"><line x1={toScreenX(dropCandidate[0])} y1={PADDING} x2={toScreenX(dropCandidate[0])} y2={HEIGHT - PADDING} stroke={POINT_GUIDE_COLOR} strokeWidth={dropMagneticTarget ? 4 : 3} strokeDasharray="8 5" opacity="0.84" /><line x1={PADDING} y1={toScreenY(dropCandidate[1])} x2={WIDTH - PADDING} y2={toScreenY(dropCandidate[1])} stroke={POINT_GUIDE_COLOR} strokeWidth={dropMagneticTarget ? 4 : 3} strokeDasharray="8 5" opacity="0.84" />{dropMagneticTarget && <circle cx={toScreenX(dropCandidate[0])} cy={toScreenY(dropCandidate[1])} r="24" fill="rgba(19,115,51,0.10)" stroke="#137333" strokeWidth="3" strokeDasharray="5 4" />}<circle cx={toScreenX(dropCandidate[0])} cy={toScreenY(dropCandidate[1])} r="15" fill="rgba(0,166,166,0.22)" stroke={dropMagneticTarget ? '#137333' : POINT_GUIDE_COLOR} strokeWidth="4" /><circle cx={toScreenX(dropCandidate[0])} cy={toScreenY(dropCandidate[1])} r="6" fill={dropMagneticTarget ? '#137333' : POINT_GUIDE_COLOR} />{dropMagneticTarget && <text x={toScreenX(dropCandidate[0])} y={toScreenY(dropCandidate[1]) - 31} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#137333">Snap</text>}</g>}
            {stage === 'analysis' && activePointPart && (analysis.selections[activePointPart.id] || []).map((point, index) => <g key={`analysis-${index}`}><circle cx={toScreenX(point[0])} cy={toScreenY(point[1])} r="8" fill="#d93025" stroke="#fff" strokeWidth="3" /><rect x={toScreenX(point[0]) + 8} y={toScreenY(point[1]) - 29} width="82" height="22" rx="6" fill="rgba(255,255,255,0.62)" /><text x={toScreenX(point[0]) + 13} y={toScreenY(point[1]) - 14} fontSize="12" fontWeight="bold" fill="#3c4043">{pointLabel(point)}</text></g>)}

            {construction.snapped && endpointRequirements.map((requirement) => { const placement = construction.markerPlacements[requirement.id]; const displayPoint = markerPoint(placement) || requirement.point; const x = toScreenX(displayPoint[0]); const y = toScreenY(displayPoint[1]); const correctX = toScreenX(requirement.point[0]); const correctY = toScreenY(requirement.point[1]); const angle = (Math.atan2(toScreenY(requirement.point[1] + requirement.vector[1]) - correctY, toScreenX(requirement.point[0] + requirement.vector[0]) - correctX) * 180) / Math.PI; return <g key={requirement.id}>{!placement && <><circle cx={correctX} cy={correctY} r="25" fill="rgba(251,188,4,0.10)" stroke="#f9ab00" strokeWidth="2" strokeDasharray="6 6" className="mathmaster-endpoint-pulse" /><text x={correctX} y={correctY - 31} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#8a5a00">Graph end {endpointRequirements.indexOf(requirement) + 1}</text></>}{placement && <EndpointMarker type={markerValue(placement)} x={x} y={y} angle={angle} />}</g>; })}
            {markerGhostActive && <EndpointMarker type={draggingMarkerType || activeMarker} x={toScreenX(dropCandidate[0])} y={toScreenY(dropCandidate[1])} opacity={0.55} scale={1.15} />}
            {showCoordinates && hoverPoint && <g pointerEvents="none"><rect x={Math.min(WIDTH - 132, toScreenX(hoverPoint[0]) + 10)} y={Math.max(12, toScreenY(hoverPoint[1]) - 35)} width="116" height="27" rx="6" fill="#202124" opacity="0.66" /><text x={Math.min(WIDTH - 122, toScreenX(hoverPoint[0]) + 20)} y={Math.max(31, toScreenY(hoverPoint[1]) - 16)} fontSize="13" fill="#fff">{pointLabel(hoverPoint)}</text></g>}
          </svg>
          <figcaption style={{ color: '#5f6368', fontSize: '13px', padding: '8px 4px 0' }}>{pointOnly ? 'Plot each ordered pair from your completed table.' : boundaryOnly ? 'This relationship has a finite domain. Its graph must stop at explicit open or closed boundary markers.' : continuationOnly ? 'Arrows show that the function continues beyond the visible coordinate plane.' : 'Arrows show continuation; open and closed circles show finite-domain boundaries.'}</figcaption>
        </figure>
      </div>

      {stage === 'construct' && <div style={{ maxWidth: '960px', margin: '14px auto 0', textAlign: 'center' }}>
        {pointFeedback && <p style={{ margin: '8px 0', color: construction.pointsValidated ? '#137333' : '#8a5a00', fontWeight: 'bold' }}>{pointFeedback}</p>}
        {!pointOnly && construction.pointsValidated && !construction.snapped && <p style={{ margin: '8px 0', color: '#174ea6', fontWeight: 'bold' }}>Draw through all validated points. {requiredStrokeCount === 2 ? 'Draw both rational branches as separate strokes.' : ''}</p>}
        {drawFeedback && <p style={{ margin: '8px 0', color: construction.snapped ? '#137333' : '#8a5a00', fontWeight: 'bold' }}>{drawFeedback}</p>}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '9px', flexWrap: 'wrap', marginTop: '10px' }}>
          {/* EXACT ENTRY. The equal-precision alternative to pointing, and the
              one that matters most: a trackpad on a school Chromebook cannot
              reliably hit (2, -3.5), and fighting the interface is not part of
              the mathematics. The student still has to work out the coordinate
              — nothing here computes one. */}
          <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#3c4043' }}>
              x
              <input
                type="number"
                inputMode="decimal"
                value={typedX}
                onChange={(event) => setTypedX(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('graph-exact-place')?.click(); } }}
                style={{ display: 'block', width: '84px', minHeight: '40px', marginTop: '3px', padding: '6px 8px', border: '1px solid #c9ced6', borderRadius: '7px' }}
              />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#3c4043' }}>
              y
              <input
                type="number"
                inputMode="decimal"
                value={typedY}
                onChange={(event) => setTypedY(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('graph-exact-place')?.click(); } }}
                style={{ display: 'block', width: '84px', minHeight: '40px', marginTop: '3px', padding: '6px 8px', border: '1px solid #c9ced6', borderRadius: '7px' }}
              />
            </label>
            <button
              id="graph-exact-place"
              type="button"
              onClick={() => {
                const point = [Number(typedX), Number(typedY)];
                if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
                  setKeyboardAnnouncement('Enter a number for both x and y.');
                  return;
                }
                if (placeAtCoordinate(point)) { setTypedX(''); setTypedY(''); }
              }}
              style={{ minHeight: '40px', padding: '9px 14px', border: '1px solid #c5d5ef', borderRadius: '8px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}
            >
              Place at this coordinate
            </button>
          </div>

          {!pointOnly && construction.pointsValidated && !construction.snapped && <button type="button" onClick={() => constructionHistory.setValue((current) => ({ ...current, strokes: [] }))} style={{ padding: '9px 14px', border: '1px solid #c5d5ef', borderRadius: '8px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>Clear Sketch</button>}
          <button type="button" onClick={() => constructionHistory.reset({ placements: {}, chosenXValues: initialChosenX, pointsValidated: false, strokes: [], snapped: false, markerPlacements: {} })} style={{ padding: '9px 14px', border: '1px solid #e0b4b0', borderRadius: '8px', background: '#fff', color: '#a50e0e', fontWeight: 'bold' }}>Reset Graph</button>
        </div>
        {!pointOnly && construction.snapped && endpointRequirements.length > 0 && <p style={{ margin: '12px 0 0', color: allMarkersPlaced ? '#137333' : '#6f2da8', fontWeight: 'bold' }}>{allMarkersPlaced ? (analysisEnabled ? `All ${endpointCompletionNoun}${endpointRequirements.length === 1 ? '' : 's'} are entered. Continue to Analyze Function; each placement and symbol will be graded separately.` : `All ${endpointCompletionNoun}${endpointRequirements.length === 1 ? '' : 's'} are entered. You may submit even if a placement or symbol is incorrect; partial credit is calculated by part.`) : `Place one ${endpointCompletionNoun} at each of the ${endpointRequirements.length} graph ends.`}</p>}
      </div>}
      {/* Everything the keyboard route does, said out loud. Without this a
          screen-reader student presses Enter and receives silence. */}
      <p role="status" aria-live="polite" style={{ margin: '8px 0 0', fontSize: '13px', color: '#174ea6', minHeight: '18px', textAlign: 'center' }}>
        {keyboardAnnouncement}
      </p>

      {stage === 'analysis' && activePointPart && activePointPart.responseMode !== 'input' && <div style={{ textAlign: 'center', marginTop: '12px' }}><p style={{ color: '#174ea6', fontWeight: 'bold' }}>Active part: {activePointPart.label}. Select {activePointPart.expected.length || 1} location(s), or choose “Does not exist.”</p>{(analysis.selections[activePointPart.id] || []).length > 0 && <button type="button" onClick={() => analysisHistory.setValue((current) => ({ ...current, selections: { ...current.selections, [activePointPart.id]: [] } }))} style={{ padding: '9px 14px', border: '1px solid #c5d5ef', borderRadius: '8px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>Clear This Selection</button>}</div>}
    </div>
  );
}
