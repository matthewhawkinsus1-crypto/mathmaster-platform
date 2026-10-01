/*
 * THE INTERACTIVE GRAPH WORKSPACE: ONE VERDICT, WHICHEVER PATH MARKS IT.
 *
 * `functionGraph`, `functionInvestigation` and `graphAnalysis` render
 * src/InteractiveGraphWorkspace.jsx. Its verdict used to be assembled inline,
 * partly from flags the browser set about itself (pointsValidated, snapped, a
 * marker's locationCorrect, inverseSnapped). It now reports the shared grader
 * (functions/shared/serverGrading/tools/graphWorkspace.mjs) through
 * gradeToolCheck, and the server runs that grader as the authority. Pinned here:
 *
 *   - parity: the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse over the same bytes) agree on isCorrect, isComplete,
 *     score and parts for every fixture, in every mode;
 *   - fidelity: replaying the workspace's own interactions (place, check,
 *     draw, zoom, drop a marker, answer), the reported answer state equals what
 *     the old inline code reported at EVERY step — completeness, verdict,
 *     parts and the recorded partial credit;
 *   - the commits: placements count only once "Check Point Placements" has
 *     accepted them (work.construction.pointsLocked AND the grader's own
 *     re-check), and a sketch only once it snapped on screen (sketchLocked /
 *     inverseSketchLocked AND the grader's own sketch check) — including the
 *     states only Undo and a retyped chosen x reach; a commit never grants
 *     credit;
 *   - the freehand sketch: the shared check, run on bounded viewBox strokes
 *     plus the camera they were drawn under, agrees with the old screen-space
 *     check at every zoom level; a forged camera never helps;
 *   - hygiene: work carries student work only, forged verdicts are ignored,
 *     malformed and oversize work is refused rather than guessed at;
 *   - wiring: the component reports the shared grader's result and keeps the
 *     Path raw builder's envelope.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import graphWorkspaceGrader, { gradeGraphWorkspace } from '../../functions/shared/serverGrading/tools/graphWorkspace.mjs';
import graphWorkspaceDeclaration, { resolveGraphWorkspaceMode } from '../../functions/shared/serverGrading/declarations/graphWorkspace.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { pathAnalysisTextMatches } from '../../functions/shared/pathToolContracts.mjs';
import {
  GRAPH_WORKSPACE_VIEWBOX,
  SKETCH_LIMITS,
  boundSketchStrokes,
  buildGraphWorkspaceModel,
  constructionSketchMatches,
  graphWorkspaceModelFor,
  graphWorkspaceWorkFromState,
  inverseSketchMatches,
  normalizeGraphWorkspaceWork,
  resolveSketchCamera,
} from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import {
  analysisSelectionsAreCorrect,
  gradePointPlacements,
  placementsMatchTasks,
  pointDistance,
  pointSetInputMatches,
  resolveTaskExpected,
  roughSketchMatchesGraph,
} from '../../src/interactiveGraphEngine.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from '../../src/platform/grading/sharedAnswerState.js';
import { buildRawPathResponse } from '../../src/platform/path/pathToolResponses.js';
import { zoomedWindow } from '../../src/graphWorkspaceViewport.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const COMPONENT = executableSource(read('src/InteractiveGraphWorkspace.jsx'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const pointLabel = ([x, y]) => `(${x}, ${y})`;

/* ---------------------------------------------------------------------------
 * Fixtures — one per mode and per family the workspace treats differently.
 * ------------------------------------------------------------------------- */

// construct, every task and both end arrows derived (nothing authored but f).
const QUADRATIC = { type: 'functionGraph', prompt: 'Graph f(x) = (x - 1)^2 - 2.', functionSpec: { type: 'quadratic', a: 1, h: 1, k: -2 } };
// construct with a restricted domain: closed and open boundary markers.
const RESTRICTED_LINE = { type: 'functionGraph', functionSpec: { type: 'linear', m: 1, b: 1, domain: { min: -2, max: 3, minInclusive: true, maxInclusive: false } } };
// construct with an "Undefined" probe (square root, default undefined checks).
const SQUARE_ROOT = { type: 'functionGraph', functionSpec: { type: 'squareRoot', a: 1, h: 2, k: 0 } };
// construct with two branches (two strokes required) and a center task.
const RATIONAL = { type: 'functionGraph', functionSpec: { type: 'rational', a: 2, h: 1, k: 1 } };
// construct where the student chooses x for four of the points.
const CHOOSE_X = { type: 'functionGraph', functionSpec: { type: 'absolute', a: 1, h: 0, k: 1 }, studentChoosesX: true };
const CHOSEN = { 'point-1': '-3', 'point-2': '-2', 'point-4': '2', 'point-5': '3' };
// construct + analysis (functionInvestigation), every interval kind derived.
const INVESTIGATION = {
  type: 'functionInvestigation',
  functionSpec: { type: 'quadratic', a: 1, h: 1, k: -4 },
  graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 8 },
  pointTasks: [
    { id: 'p1', label: 'x = -1', x: -1, expected: [-1, 0] },
    { id: 'pv', label: 'Vertex', x: 1, expected: [1, -4], role: 'key' },
    { id: 'p3', label: 'x = 3', x: 3, expected: [3, 0] },
  ],
  analysisRequests: [
    { id: 'domain', kind: 'domain' },
    { id: 'range', kind: 'range', notation: 'inequality' },
    { id: 'inc', kind: 'increasing' },
    { id: 'neg', kind: 'negative' },
    { id: 'xint', kind: 'point', feature: 'xIntercepts' },
    { id: 'yint', kind: 'point', feature: 'yIntercept', responseMode: 'both' },
    { id: 'max', kind: 'point', feature: 'localMaximum' },
    { id: 'axis', kind: 'value', label: 'Axis of symmetry', expected: 'x=1' },
  ],
};
const INVESTIGATION_ANSWERS = { domain: '(-\\infty, \\infty)', range: 'y\\ge -4', inc: '(1, \\infty)', neg: '(-1, 3)', axis: 'x = 1' };
// pointOnly via plotMode.
const POINT_ONLY = {
  type: 'functionGraph',
  plotMode: 'points',
  functionSpec: { type: 'linear', m: 0.5, b: 1 },
  pointTasks: [
    { id: 'a', label: '(0, 1)', x: 0, expected: [0, 1] },
    { id: 'b', label: '(2, 2)', x: 2, expected: [2, 2] },
    { id: 'c', label: '(-2, 0)', x: -2, expected: [-2, 0] },
  ],
};
// pointOnly via the flag, with an analysis part.
const POINT_ONLY_ANALYSIS = {
  ...POINT_ONLY,
  type: 'functionInvestigation',
  plotMode: undefined,
  pointOnly: true,
  analysisRequests: [{ id: 'slope', kind: 'value', label: 'Slope', expected: ['0.5'] }],
};
// inverse reflection: reflected points, the inverse sketch, the equation.
const INVERSE = {
  type: 'functionInvestigation',
  functionSpec: { type: 'linear', m: 2, b: 1 },
  graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
  pointTasks: [
    { id: 'p0', label: 'x = 0', x: 0, expected: [0, 1] },
    { id: 'p1', label: 'x = 1', x: 1, expected: [1, 3] },
  ],
  inverseReflection: { enabled: true, sourceTaskIds: ['p0', 'p1'], requireInverseSketch: true, requireInverseEquation: true, equationPartId: 'inverse-equation' },
  analysisRequests: [
    { id: 'inverse-reflect-p0', kind: 'inversePoint', sourceTaskId: 'p0', responseMode: 'click' },
    { id: 'inverse-reflect-p1', kind: 'inversePoint', sourceTaskId: 'p1', responseMode: 'click' },
    { id: 'inverse-equation', kind: 'value', notation: 'equation', responseMode: 'text', expected: ['y=(x-1)/2'] },
  ],
};
// analysis only (graphAnalysis), typed vertex.
const ANALYSIS = {
  type: 'graphAnalysis',
  functionSpec: { type: 'absolute', a: -1, h: 2, k: 3 },
  analysisRequests: [
    { id: 'domain', kind: 'domain', notation: 'inequality' },
    { id: 'range', kind: 'range' },
    { id: 'vertex', kind: 'point', feature: 'vertex', responseMode: 'input' },
    { id: 'dec', kind: 'decreasing' },
  ],
};
const ANALYSIS_ANSWERS = { domain: '\\text{All Real Numbers}', range: '(-\\infty, 3]', dec: '(2, \\infty)' };
// analysis only, nothing authored: one click-the-vertex part.
const ANALYSIS_DEFAULT = { type: 'graphAnalysis', functionSpec: { type: 'quadratic', a: 2, h: -1, k: 3 } };

// construct with no graph-end markers to place (as a workflow graph stage
// often is): the snapped sketch is the last thing standing between the
// student and a complete construction.
const NO_ENDS = { type: 'functionGraph', functionSpec: { type: 'linear', m: 2, b: -1 }, requireEndpointMarkers: false };
// point-only, with the student choosing four of the x-values.
const POINT_ONLY_CHOOSE_X = { type: 'functionGraph', pointOnly: true, studentChoosesX: true, functionSpec: { type: 'absolute', a: 1, h: 0, k: 0 } };

const TYPED_FIXTURES = { QUADRATIC, RESTRICTED_LINE, SQUARE_ROOT, RATIONAL, CHOOSE_X, INVESTIGATION, POINT_ONLY, POINT_ONLY_ANALYSIS, INVERSE, ANALYSIS, ANALYSIS_DEFAULT };

/* ---------------------------------------------------------------------------
 * The component's routing and model.
 * ------------------------------------------------------------------------- */

// QuestionEngine: `graphAnalysis` -> <GraphAnalysis mode="analysis">,
// `functionGraph` / `functionInvestigation` -> <FunctionGraphBuilder
// mode="investigate">; WorkflowRunner mounts mode="construct". Pinned against
// the source in the routing test below.
const componentModeFor = (question) => (question.type === 'graphAnalysis' ? 'analysis' : 'investigate');
const modelFor = (question) => buildGraphWorkspaceModel(question, { analysisMode: componentModeFor(question) === 'analysis' });
const authoredCamera = (model) => ({
  xMin: Number(model.viewWindow.xMin), xMax: Number(model.viewWindow.xMax),
  yMin: Number(model.viewWindow.yMin), yMax: Number(model.viewWindow.yMax),
});
const zoomIn = (model, from, times = 1) => {
  let view = from || model.viewWindow;
  for (let index = 0; index < times; index += 1) {
    view = zoomedWindow({ from: view, authored: model.viewWindow, factor: 1 / 1.4, xStep: model.xGridStep, yStep: model.yGridStep });
  }
  return { xMin: view.xMin, xMax: view.xMax, yMin: view.yMin, yMax: view.yMax };
};

// The pre-change screen mapping: toScreenX / toScreenY under the window on screen.
const oldScreen = (renderWindow) => {
  const { width, height, padding } = { width: 760, height: 540, padding: 56 };
  return ([x, y]) => [
    padding + ((x - renderWindow.xMin) / (renderWindow.xMax - renderWindow.xMin)) * (width - padding * 2),
    padding + ((renderWindow.yMax - y) / (renderWindow.yMax - renderWindow.yMin)) * (height - padding * 2),
  ];
};

// A stroke the way the workspace captures one: a point only when it is at
// least 3 units from the previous one (continueDrawing).
const capture = (points) => points.reduce((kept, point) => {
  const previous = kept[kept.length - 1];
  if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 3) kept.push(point);
  return kept;
}, []);
// A student tracing graph-unit paths on screen under `camera`, optionally
// shifted by a screen offset — raw floats, as the pointer delivers them.
const trace = (paths, camera, [dx, dy] = [0, 0]) => paths
  .map((path) => capture(path.map(oldScreen(camera)).map(([x, y]) => [x + dx, y + dy])))
  .filter((stroke) => stroke.length >= 2);

/* ---------------------------------------------------------------------------
 * The OLD inline verdict, rebuilt from the unchanged engine exports and the
 * flags the old UI set (InteractiveGraphWorkspace.jsx before this change).
 * ------------------------------------------------------------------------- */

const oldSketchSnaps = (model, rawStrokes, renderWindow, chosenXValues) => {
  const toScreen = oldScreen(renderWindow);
  const required = model.tasks
    .map((task) => ({ ...task, resolvedExpected: resolveTaskExpected(task, model.functionSpec, chosenXValues) }))
    .filter((task) => Array.isArray(task.resolvedExpected) && task.role !== 'center')
    .map((task) => toScreen(task.resolvedExpected));
  if (rawStrokes.length < model.requiredStrokeCount) return false;
  return roughSketchMatchesGraph({ strokes: rawStrokes, requiredScreenPoints: required, idealScreenPaths: model.visiblePaths.map((path) => path.map(toScreen)), requiredStrokeCount: model.requiredStrokeCount, tolerance: 68 });
};
const oldInverseSnaps = (model, rawStrokes, renderWindow) => {
  const toScreen = oldScreen(renderWindow);
  const required = model.analysisParts.filter((part) => part.kind === 'inversePoint').flatMap((part) => part.expected || []).map(toScreen);
  return roughSketchMatchesGraph({ strokes: rawStrokes, requiredScreenPoints: required, idealScreenPaths: model.inverseVisiblePaths.map((path) => path.map(toScreen)), requiredStrokeCount: 1, tolerance: 68 });
};

const oldAnswerState = (question, { construction, analysis }) => {
  const model = modelFor(question);
  const { snapStep, constructionEnabled, pointOnly, analysisEnabled } = model;
  const markerValue = (placement) => (typeof placement === 'string' ? placement : placement?.marker || '');
  const markerPoint = (placement) => (Array.isArray(placement?.point) ? placement.point : null);
  const pointParts = gradePointPlacements(model.tasks, construction.placements, model.functionSpec, construction.chosenXValues, Math.max(0.22, snapStep * 0.48));
  const markerParts = model.endpointRequirements.flatMap((requirement, index) => {
    const placement = construction.markerPlacements[requirement.id];
    const point = markerPoint(placement);
    const locationCorrect = Boolean(placement) && (typeof placement === 'string' || placement.locationCorrect === true || (point && pointDistance(point, requirement.point) <= Math.max(0.55, snapStep * 1.8)));
    return [
      { id: `${requirement.id}-placement`, label: `Graph end ${index + 1}: symbol placement`, isComplete: Boolean(placement), isCorrect: locationCorrect, response: point ? pointLabel(point) : placement ? 'snapped to endpoint' : '' },
      { id: `${requirement.id}-type`, label: `Graph end ${index + 1}: symbol type`, isComplete: Boolean(placement), isCorrect: markerValue(placement) === requirement.marker, response: markerValue(placement) },
    ];
  });
  const tolerance = Math.max(0.28, snapStep * 0.58);
  const analysisGradeParts = model.analysisParts.map((part) => {
    if (['point', 'inversePoint'].includes(part.kind)) {
      const selected = analysis.selections[part.id] || [];
      const noneSelected = Boolean(analysis.noneSelections[part.id]);
      const typed = String(analysis.typedPoints[part.id] || '');
      const clickRequired = part.responseMode !== 'input';
      const inputRequired = part.responseMode !== 'click';
      const clickComplete = !clickRequired || noneSelected || selected.length === part.expected.length;
      const inputComplete = !inputRequired || typed.trim() !== '';
      const clickCorrect = !clickRequired || analysisSelectionsAreCorrect(selected, part.expected, tolerance, noneSelected);
      const inputCorrect = !inputRequired || pointSetInputMatches(typed, part.expected, tolerance);
      return { id: part.id, label: part.label, isComplete: clickComplete && inputComplete, isCorrect: clickCorrect && inputCorrect, response: `${noneSelected ? 'Does not exist' : selected.map(pointLabel).join(', ')}${typed ? `; typed: ${typed}` : ''}` };
    }
    const response = String(analysis.answers[part.id] || '');
    return { id: part.id, label: part.label, isComplete: response.trim() !== '', isCorrect: response.trim() !== '' && pathAnalysisTextMatches(response, part.acceptedAnswers, { kind: part.kind, notation: part.notation, tolerance }), response };
  });
  const inverseSketchComplete = !model.inverseSketchRequired || Boolean(analysis.inverseSnapped);
  const allMarkersPlaced = model.endpointRequirements.every((requirement) => Boolean(construction.markerPlacements[requirement.id]));
  const constructionParts = constructionEnabled ? [
    ...pointParts.map((part) => ({ ...part, label: `Point placement: ${part.label}`, isComplete: construction.pointsValidated && part.isComplete, isCorrect: construction.pointsValidated && part.isCorrect })),
    ...(pointOnly ? [] : [{ id: 'graph-curve', label: 'Freehand curve and snap', isComplete: construction.snapped, isCorrect: construction.snapped, response: construction.snapped ? 'snapped' : 'not snapped' }]),
    ...(pointOnly ? [] : markerParts),
  ] : [];
  const inverseSketchPart = model.inverseSketchRequired
    ? [{ id: 'inverse-line-sketch', label: 'Draw the inverse through the reflected points', isComplete: Boolean(analysis.inverseSnapped), isCorrect: Boolean(analysis.inverseSnapped), response: analysis.inverseSnapped ? 'snapped' : 'not complete' }]
    : [];
  const parts = [...constructionParts, ...(analysisEnabled ? [...analysisGradeParts, ...inverseSketchPart] : [])];
  const constructionComplete = !constructionEnabled || (construction.pointsValidated && (pointOnly || (construction.snapped && allMarkersPlaced)));
  const analysisComplete = !analysisEnabled || (analysisGradeParts.length > 0 && analysisGradeParts.every((part) => part.isComplete) && inverseSketchComplete);
  const complete = constructionComplete && analysisComplete;
  return { isComplete: complete, isCorrect: complete && parts.every((part) => part.isCorrect), parts };
};

/* ---------------------------------------------------------------------------
 * The NEW reported answer state: the component's effect, over its own state —
 * the work it builds (graphWorkspaceWorkFromState) and the shared grader's
 * result, reported as is. Pinned to the component source in the wiring test.
 * ------------------------------------------------------------------------- */

const reportedAnswerState = (question, state) => {
  const work = graphWorkspaceWorkFromState(state);
  const result = gradeToolCheck(graphWorkspaceGrader, question, work);
  return { ...answerStateFromSharedGrading(result, { questionDetails: '' }), result, work };
};

/* ---------------------------------------------------------------------------
 * Driving the workspace: the component's own handlers, applied to the old
 * state shape and the new one in lockstep.
 * ------------------------------------------------------------------------- */

const startSession = (question) => {
  const model = modelFor(question);
  const initialChosenX = Object.fromEntries(model.tasks.filter((task) => Number.isFinite(Number(task.x))).map((task) => [task.id, String(task.x)]));
  const blank = () => ({
    construction: { placements: {}, chosenXValues: { ...initialChosenX }, pointsValidated: false, strokes: [], sketchView: null, snapped: false, markerPlacements: {} },
    analysis: { selections: {}, answers: {}, typedPoints: {}, noneSelections: {}, inversePointsValidated: false, inverseStrokes: [], inverseSketchView: null, inverseSnapped: false },
  });
  const session = { question, model, old: blank(), now: blank(), camera: authoredCamera(model) };
  const both = (update) => { update(session.old, 'old'); update(session.now, 'now'); };
  const api = {
    session,
    zoom(times) { session.camera = times ? zoomIn(model, null, times) : authoredCamera(model); return api; },
    chooseX(id, value) {
      both((state) => { state.construction.chosenXValues[id] = value; state.construction.placements[id] = undefined; });
      return api;
    },
    place(id, point) {
      both((state) => { if (!state.construction.pointsValidated) state.construction.placements[id] = point; });
      return api;
    },
    placeAllCorrect() {
      model.tasks.forEach((task) => api.place(task.id, resolveTaskExpected(task, model.functionSpec, session.now.construction.chosenXValues)));
      return api;
    },
    checkPoints() {
      both((state) => {
        if (placementsMatchTasks(model.tasks, state.construction.placements, Math.max(0.22, model.snapStep * 0.48), model.functionSpec, state.construction.chosenXValues)) state.construction.pointsValidated = true;
      });
      return api;
    },
    draw(rawStroke) {
      const camera = session.camera;
      both((state, which) => {
        const c = state.construction;
        if (model.pointOnly || !c.pointsValidated || c.snapped) return;
        if (which === 'old') {
          c.strokes = [...c.strokes, rawStroke];
          c.snapped = oldSketchSnaps(model, c.strokes, camera, c.chosenXValues);
        } else {
          c.strokes = boundSketchStrokes([...c.strokes, rawStroke], SKETCH_LIMITS.constructionPoints);
          c.sketchView = { ...camera };
          c.snapped = c.strokes.length >= model.requiredStrokeCount && constructionSketchMatches(model, { strokes: c.strokes, camera, chosenXValues: c.chosenXValues });
        }
      });
      return api;
    },
    traceCurve(offset = [0, 0]) {
      trace(model.visiblePaths, session.camera, offset).forEach((stroke) => api.draw(stroke));
      return api;
    },
    clearSketch() { both((state) => { state.construction.strokes = []; }); return api; },
    // Undo right after a snap. useUndoHistory records one entry per setValue,
    // and endDrawing records the finished stroke (with its camera) and the
    // snap in two calls, so Undo restores the strokes with the snap taken
    // back: the screen shows the sketch as not snapped, drawing re-opens.
    undoSnap() { both((state) => { state.construction.snapped = false; }); return api; },
    undoInverseSnap() { both((state) => { state.analysis.inverseSnapped = false; }); return api; },
    dropMarker(type, point) {
      const toScreen = oldScreen(session.camera);
      both((state, which) => {
        const c = state.construction;
        if (!c.snapped) return;
        const unfilled = model.endpointRequirements.filter((requirement) => !c.markerPlacements[requirement.id]);
        const candidates = unfilled.length ? unfilled : model.endpointRequirements;
        const nearest = candidates.map((requirement) => {
          const [ax, ay] = toScreen(point);
          const [bx, by] = toScreen(requirement.point);
          return { requirement, distance: Math.hypot(ax - bx, ay - by) };
        }).sort((a, b) => a.distance - b.distance)[0];
        const magnetic = nearest.distance <= 82;
        c.markerPlacements[nearest.requirement.id] = which === 'old'
          ? { marker: type, point: magnetic ? nearest.requirement.point : point, droppedPoint: point, locationCorrect: magnetic }
          : { marker: type, point: magnetic ? nearest.requirement.point : point };
      });
      return api;
    },
    markAllEnds(override = {}) {
      model.endpointRequirements.forEach((requirement) => api.dropMarker(override[requirement.id] || requirement.marker, requirement.point));
      return api;
    },
    select(id, points) { both((state) => { state.analysis.selections[id] = points; state.analysis.noneSelections[id] = false; }); return api; },
    none(id) { both((state) => { state.analysis.noneSelections[id] = true; state.analysis.selections[id] = []; }); return api; },
    typePoint(id, text) { both((state) => { state.analysis.typedPoints[id] = text; }); return api; },
    answer(id, text) { both((state) => { state.analysis.answers[id] = text; }); return api; },
    checkInverse() {
      both((state) => {
        const old = oldAnswerState(question, session.old);
        const inverseIds = model.analysisParts.filter((part) => part.kind === 'inversePoint').map((part) => part.id);
        const grades = old.parts.filter((part) => inverseIds.includes(part.id));
        state.analysis.inversePointsValidated = grades.length > 0 && grades.every((part) => part.isComplete && part.isCorrect);
        state.analysis.inverseStrokes = [];
        state.analysis.inverseSnapped = false;
      });
      return api;
    },
    traceInverse(offset = [0, 0]) {
      const camera = session.camera;
      trace(model.inverseVisiblePaths, camera, offset).forEach((stroke) => both((state, which) => {
        const a = state.analysis;
        if (!a.inversePointsValidated || a.inverseSnapped) return;
        if (which === 'old') {
          a.inverseStrokes = [...a.inverseStrokes, stroke];
          a.inverseSnapped = oldInverseSnaps(model, a.inverseStrokes, camera);
        } else {
          a.inverseStrokes = boundSketchStrokes([...a.inverseStrokes, stroke], SKETCH_LIMITS.inversePoints);
          a.inverseSketchView = { ...camera };
          a.inverseSnapped = inverseSketchMatches(model, { strokes: a.inverseStrokes, camera });
        }
      }));
      return api;
    },
  };
  return api;
};

// The parity check every fixture goes through.
const gradeBothWays = (question, work, label = '') => {
  const browser = gradeToolCheck(graphWorkspaceGrader, question, work);
  const server = gradeServerResponse({ question, response: clone(browser.toolResponse) });
  const where = `${label} ${JSON.stringify(work).slice(0, 160)}`;
  assert.equal(server.graded, browser.graded, `graded differs: ${where}`);
  assert.equal(server.isCorrect, browser.isCorrect, `isCorrect differs: ${where}`);
  assert.equal(server.isComplete, browser.isComplete, `isComplete differs: ${where}`);
  assert.equal(server.score, browser.score, `score differs: ${where}`);
  assert.deepEqual(server.graded ? server.parts : [], browser.parts, `parts differ: ${where}`);
  if (!browser.graded) assert.equal(server.reason, browser.reason, `reason differs: ${where}`);
  return { browser, server };
};

// An unlabeled part (an authored inversePoint request with no label) is
// labeled by its id in the shared result (gradingResult.mjs); the old inline
// parts carried `undefined` there, which the attempt record showed as "Part n".
const comparable = (parts) => parts.map((part) => ({ id: part.id, label: part.label || part.id, isComplete: Boolean(part.isComplete), isCorrect: Boolean(part.isCorrect), response: String(part.response ?? '') }));
const recordFor = ({ isCorrect, parts, partialCreditPercent = null }) => recordQuestionAttempt({ record: {}, isCorrect, parts, partialCreditPercent }).record;

// Every state the session passes through: old and new agree on whether it may
// be submitted, on its verdict, on every part and on the attempt it would
// record; and the browser and server paths agree exactly.
const assertSessionFidelity = (api, label) => {
  const { question, old, now } = api.session;
  const before = oldAnswerState(question, old);
  const after = reportedAnswerState(question, now);
  assert.equal(after.isComplete, before.isComplete, `${label}: isComplete`);
  assert.equal(after.isCorrect, before.isCorrect, `${label}: isCorrect`);
  assert.deepEqual(comparable(after.parts), comparable(before.parts), `${label}: parts`);
  const recordedNow = recordFor(after);
  const recordedBefore = recordFor({ isCorrect: before.isCorrect, parts: before.parts });
  assert.equal(recordedNow.status, recordedBefore.status, `${label}: attempt status`);
  assert.equal(recordedNow.partialCredit, recordedBefore.partialCredit, `${label}: partial credit`);
  assert.deepEqual(boundToolWork(after.work).dropped, [], `${label}: work carries only student work`);
  if (question.type) gradeBothWays(question, after.work, label);
  return after;
};

/* ---------------------------------------------------------------------------
 * Declaration and routing.
 * ------------------------------------------------------------------------- */

test('the three graph types are one structured surface, every mode shared-server-authoritative', () => {
  ['functionGraph', 'functionInvestigation', 'graphAnalysis'].forEach((type) => {
    assert.equal(resolveGradingSurfaceId({ type }), type);
    assert.equal(GRADING_MANIFEST[type], graphWorkspaceDeclaration);
  });
  assert.equal(graphWorkspaceDeclaration.contractVersion, 1);
  assert.deepEqual(Object.keys(graphWorkspaceDeclaration.modes).sort(), ['analysis', 'construct', 'inverseReflection', 'pointOnly']);
  Object.values(graphWorkspaceDeclaration.modes).forEach((entry) => assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER));
  assert.deepEqual([...graphWorkspaceGrader.problems], []);
  assert.equal(graphWorkspaceGrader.toolId, 'graphWorkspace');
});

test('the declaration resolves the view the component renders, for every routing the component has', () => {
  // QuestionEngine routes by type; the wrappers fix the component's mode prop.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(region(engine, "case 'functionGraph':", "case 'graphAnalysis':"), /case 'functionInvestigation':\s*return <FunctionGraphBuilder/);
  assert.match(region(engine, "case 'graphAnalysis':", 'return <'), /case 'graphAnalysis':/);
  assert.match(region(engine, "case 'graphAnalysis':", '/>'), /<GraphAnalysis\b/);
  assert.match(read('src/FunctionGraphBuilder.jsx'), /<InteractiveGraphWorkspace \{\.\.\.props\} mode="investigate" \/>/);
  assert.match(read('src/GraphAnalysis.jsx'), /<InteractiveGraphWorkspace \{\.\.\.props\} mode="analysis" \/>/);
  // The workspace builds its model from that prop and nothing else.
  assert.match(COMPONENT, /(?:graphWorkspaceModelFor|buildGraphWorkspaceModel)\(question, \{ analysisMode: mode === 'analysis' \}\)/);

  const cases = [
    [{ type: 'functionGraph', functionSpec: { type: 'linear' } }, 'construct'],
    [{ type: 'functionInvestigation', analysisRequests: [{ id: 'd', kind: 'domain' }] }, 'construct'],
    [{ type: 'functionGraph', plotMode: 'points' }, 'pointOnly'],
    [{ type: 'functionInvestigation', pointOnly: true }, 'pointOnly'],
    [{ type: 'functionInvestigation', inverseReflection: { enabled: true } }, 'inverseReflection'],
    [{ type: 'functionInvestigation', inverseReflection: { enabled: false } }, 'construct'],
    [{ type: 'functionInvestigation', pointOnly: true, inverseReflection: { enabled: true } }, 'pointOnly'],
    [{ type: 'graphAnalysis' }, 'analysis'],
    [{ type: 'graphAnalysis', pointOnly: true, inverseReflection: { enabled: true } }, 'analysis'],
    [{ type: 'functionGraph', mode: 'analysis' }, 'construct'],
    [{ type: 'functionGraph', mode: 'no-such-view' }, 'construct'],
    // WorkflowRunner's untyped plot stages.
    [{ plotMode: 'points', pointOnly: true }, 'pointOnly'],
    [{ functionSpec: { type: 'expression', expression: 'x' } }, 'construct'],
  ];
  cases.forEach(([question, mode]) => {
    assert.equal(resolveGraphWorkspaceMode(question), mode, JSON.stringify(question));
    assert.equal(resolveToolMode(graphWorkspaceDeclaration, question), mode, JSON.stringify(question));
    const model = modelFor(question);
    assert.equal(model.analysisMode, mode === 'analysis', `analysis view: ${JSON.stringify(question)}`);
    if (mode !== 'analysis') {
      assert.equal(model.pointOnly, mode === 'pointOnly', `point-only view: ${JSON.stringify(question)}`);
      assert.equal(model.inverseReflectionEnabled && !model.pointOnly, mode === 'inverseReflection', `inverse view: ${JSON.stringify(question)}`);
    }
  });
  Object.values(TYPED_FIXTURES).forEach((question) => {
    assert.equal(serverResponseGradingSupport(question).supported, true, question.type);
    assert.equal(serverResponseGradingSupport(question).mode, resolveGraphWorkspaceMode(question));
  });
});

/* ---------------------------------------------------------------------------
 * Fidelity to the old inline verdict, replaying the workspace's own steps.
 * ------------------------------------------------------------------------- */

test('construct: points, check, sketch, markers — same states, verdicts and credit as before', () => {
  const api = startSession(QUADRATIC);
  const { model } = api.session;
  assertSessionFidelity(api, 'blank');
  api.place('point-1', [-1, 2]);
  assertSessionFidelity(api, 'one point');
  api.placeAllCorrect();
  assertSessionFidelity(api, 'all placed, not yet checked');
  api.checkPoints();
  assertSessionFidelity(api, 'checked');
  api.traceCurve([0, 140]);
  assert.equal(api.session.now.construction.snapped, false, 'a stroke far off the curve does not snap');
  assertSessionFidelity(api, 'bad sketch');
  api.clearSketch().traceCurve();
  assert.equal(api.session.now.construction.snapped, true);
  assertSessionFidelity(api, 'snapped');
  api.dropMarker('arrow', model.endpointRequirements[0].point);
  assertSessionFidelity(api, 'one end marked');
  api.dropMarker('open', model.endpointRequirements[1].point);
  const wrongSymbol = assertSessionFidelity(api, 'wrong symbol at end 2');
  assert.equal(wrongSymbol.isComplete, true);
  assert.equal(wrongSymbol.isCorrect, false);
  assert.equal(wrongSymbol.partialCreditPercent, Math.round((9 / 10) * 100));
});

test('construct: a correct graph is correct; a far-dropped marker loses only its placement part', () => {
  const correct = startSession(QUADRATIC).placeAllCorrect().checkPoints().traceCurve().markAllEnds();
  const done = assertSessionFidelity(correct, 'fully correct');
  assert.equal(done.isComplete, true);
  assert.equal(done.isCorrect, true);
  assert.equal(done.partialCreditPercent, 100);

  const far = startSession(QUADRATIC).placeAllCorrect().checkPoints().traceCurve();
  const end = far.session.model.endpointRequirements[0];
  far.dropMarker('arrow', [end.point[0] + 2.5, end.point[1] - 3]).dropMarker('arrow', far.session.model.endpointRequirements[1].point);
  const graded = assertSessionFidelity(far, 'marker dropped away from its end');
  assert.equal(graded.isComplete, true);
  assert.equal(graded.parts.find((part) => part.id === `${end.id}-placement`).isCorrect, false);
  assert.equal(graded.parts.find((part) => part.id === `${end.id}-type`).isCorrect, true);
});

test('construct: boundary markers, undefined probes, two rational branches and chosen x-values', () => {
  const boundary = startSession(RESTRICTED_LINE).placeAllCorrect().checkPoints().traceCurve();
  assert.deepEqual(boundary.session.model.endpointRequirements.map((requirement) => requirement.marker), ['closed', 'open']);
  assertSessionFidelity(boundary.markAllEnds(), 'closed and open ends');
  const swapped = startSession(RESTRICTED_LINE).placeAllCorrect().checkPoints().traceCurve().markAllEnds({ 'endpoint-0-start': 'open', 'endpoint-0-end': 'closed' });
  assert.equal(assertSessionFidelity(swapped, 'swapped boundaries').isCorrect, false);

  const root = startSession(SQUARE_ROOT);
  assert.ok(root.session.model.tasks.some((task) => task.expected === 'undefined'));
  root.placeAllCorrect().checkPoints().traceCurve().markAllEnds();
  assert.equal(assertSessionFidelity(root, 'undefined probe').isCorrect, true);

  const rational = startSession(RATIONAL).placeAllCorrect().checkPoints();
  assert.equal(rational.session.model.requiredStrokeCount, 2);
  const [left, right] = trace(rational.session.model.visiblePaths, rational.session.camera);
  rational.draw(left);
  assert.equal(rational.session.now.construction.snapped, false, 'one branch is not enough');
  assertSessionFidelity(rational, 'one branch');
  rational.draw(right).markAllEnds();
  assert.equal(assertSessionFidelity(rational, 'both branches').isCorrect, true);

  const chooser = startSession(CHOOSE_X);
  Object.entries(CHOSEN).forEach(([id, x]) => chooser.chooseX(id, x));
  chooser.placeAllCorrect().checkPoints().traceCurve().markAllEnds();
  assert.equal(assertSessionFidelity(chooser, 'chosen x-values').isCorrect, true);
  const unbalanced = startSession(CHOOSE_X);
  Object.entries({ 'point-1': '-3', 'point-2': '1', 'point-4': '2', 'point-5': '3' }).forEach(([id, x]) => unbalanced.chooseX(id, x));
  unbalanced.placeAllCorrect().checkPoints();
  assert.equal(unbalanced.session.now.construction.pointsValidated, false, 'three on one side never validates');
  assert.equal(assertSessionFidelity(unbalanced, 'unbalanced chosen x').isComplete, false);
});

test('construct + analysis: every analysis kind, the equivalent forms the tool accepts, and partial answers', () => {
  const api = startSession(INVESTIGATION).placeAllCorrect().checkPoints().traceCurve().markAllEnds();
  assertSessionFidelity(api, 'construction done, analysis blank');
  Object.entries(INVESTIGATION_ANSWERS).forEach(([id, text]) => api.answer(id, text));
  api.select('xint', [[3, 0], [-1, 0]]).select('yint', [[0, -3]]).typePoint('yint', '(0, -3)');
  assertSessionFidelity(api, 'one part missing');
  api.none('max');
  const done = assertSessionFidelity(api, 'all answered');
  assert.equal(done.isCorrect, true, JSON.stringify(done.parts.filter((part) => !part.isCorrect)));

  // Other forms of the same answers.
  api.answer('range', '-4 \\le y').answer('neg', '(-1,3)').answer('domain', '(-∞,∞)').typePoint('yint', '(0,-3)');
  assert.equal(assertSessionFidelity(api, 'equivalent forms').isCorrect, true);
  // Wrong answers cost exactly their own parts.
  api.answer('range', 'y > -4').select('xint', [[3, 0]]);
  const partial = assertSessionFidelity(api, 'two parts wrong');
  assert.equal(partial.isComplete, false, 'one x-intercept selected leaves the part incomplete');
  api.select('xint', [[3, 0], [1, 0]]);
  const wrong = assertSessionFidelity(api, 'wrong range and intercept');
  assert.equal(wrong.isComplete, true);
  assert.deepEqual(wrong.parts.filter((part) => !part.isCorrect).map((part) => part.id), ['range', 'xint']);
});

test('pointOnly: placing, the check, and analysis — same states and verdicts as before', () => {
  const api = startSession(POINT_ONLY);
  assert.equal(api.session.model.pointOnly, true);
  assert.deepEqual(api.session.model.endpointRequirements, []);
  api.place('a', [0, 1]).place('b', [2, 3]).place('c', [-2, 0]);
  assertSessionFidelity(api, 'one wrong, all placed');
  api.checkPoints();
  assert.equal(api.session.now.construction.pointsValidated, false);
  assert.equal(assertSessionFidelity(api, 'check refused').isComplete, false);
  api.place('b', [2, 2.2]).checkPoints();
  const done = assertSessionFidelity(api, 'within tolerance, checked');
  assert.equal(done.isComplete, true);
  assert.equal(done.isCorrect, true);

  const withAnalysis = startSession(POINT_ONLY_ANALYSIS).placeAllCorrect().checkPoints();
  assertSessionFidelity(withAnalysis, 'points done, slope blank');
  withAnalysis.answer('slope', '\\frac{1}{2}');
  assert.equal(assertSessionFidelity(withAnalysis, 'slope as a fraction').isCorrect, true);
  withAnalysis.answer('slope', '2');
  const wrong = assertSessionFidelity(withAnalysis, 'wrong slope');
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.partialCreditPercent, 75);
});

test('inverse reflection: reflected points, the inverse sketch and the equation', () => {
  const api = startSession(INVERSE).placeAllCorrect().checkPoints().traceCurve().markAllEnds();
  assertSessionFidelity(api, 'construction done');
  api.select('inverse-reflect-p0', [[1, 0]]).select('inverse-reflect-p1', [[3, 0]]).checkInverse();
  assert.equal(api.session.now.analysis.inversePointsValidated, false, 'an unreflected point never validates');
  assertSessionFidelity(api, 'wrong reflection');
  api.select('inverse-reflect-p1', [[3, 1]]).checkInverse();
  assert.equal(api.session.now.analysis.inversePointsValidated, true);
  assertSessionFidelity(api, 'reflected, not drawn');
  api.traceInverse();
  assert.equal(api.session.now.analysis.inverseSnapped, true);
  assertSessionFidelity(api, 'inverse drawn, equation blank');
  api.answer('inverse-equation', 'y=0.5x-0.5');
  const done = assertSessionFidelity(api, 'equivalent inverse equation');
  assert.equal(done.isCorrect, true);
  api.answer('inverse-equation', 'y=2x-1');
  assert.equal(assertSessionFidelity(api, 'wrong inverse').isCorrect, false);
});

test('analysis only: authored parts, the default vertex part, typed and clicked points', () => {
  const api = startSession(ANALYSIS);
  assertSessionFidelity(api, 'blank');
  Object.entries(ANALYSIS_ANSWERS).forEach(([id, text]) => api.answer(id, text));
  assertSessionFidelity(api, 'vertex not typed');
  api.typePoint('vertex', '(2, 3)');
  assert.equal(assertSessionFidelity(api, 'all answered').isCorrect, true);
  api.typePoint('vertex', '(3, 2)');
  assert.equal(assertSessionFidelity(api, 'swapped vertex').partialCreditPercent, 75);

  const fallback = startSession(ANALYSIS_DEFAULT);
  assert.deepEqual(fallback.session.model.analysisParts.map((part) => [part.id, part.feature]), [['feature', 'vertex']]);
  assertSessionFidelity(fallback, 'default blank');
  fallback.select('feature', [[-1, 3]]);
  assert.equal(assertSessionFidelity(fallback, 'default vertex').isCorrect, true);
  fallback.none('feature');
  assert.equal(assertSessionFidelity(fallback, '"does not exist" for a vertex').isCorrect, false);
});

/* ---------------------------------------------------------------------------
 * The sketch across zoom levels.
 * ------------------------------------------------------------------------- */

test('the shared sketch check agrees with the old screen-space check at every zoom level', () => {
  const variants = [
    ['traced', [0, 0]],
    ['traced slightly off', [0, 22]],
    ['traced well off', [0, 120]],
    ['traced sideways', [95, 0]],
  ];
  [QUADRATIC, RESTRICTED_LINE, SQUARE_ROOT, RATIONAL, INVESTIGATION].forEach((question) => {
    const model = modelFor(question);
    const chosen = Object.fromEntries(model.tasks.filter((task) => Number.isFinite(Number(task.x))).map((task) => [task.id, String(task.x)]));
    [0, 1, 2, 3, 5].forEach((times) => {
      const camera = times ? zoomIn(model, null, times) : authoredCamera(model);
      assert.deepEqual(resolveSketchCamera(model, camera), camera, `zoom ${times} is a camera the controls produce`);
      variants.forEach(([name, offset]) => {
        const raw = trace(model.visiblePaths, camera, offset);
        const before = oldSketchSnaps(model, raw, camera, chosen);
        const now = constructionSketchMatches(model, { strokes: boundSketchStrokes(raw), camera, chosenXValues: chosen });
        assert.equal(now, before, `${question.functionSpec.type} zoom ${times} ${name}`);
        // Both outcomes occur, so agreement is not agreement on "never snaps".
        if (name === 'traced') assert.equal(now, true, `${question.functionSpec.type} zoom ${times}: a traced curve snaps`);
        if (name === 'traced well off') assert.equal(now, false, `${question.functionSpec.type} zoom ${times}: a curve 120 units off does not`);
      });
      // Half the curve misses required points.
      const half = trace(model.visiblePaths.map((path) => path.slice(0, Math.floor(path.length / 2))), camera);
      assert.equal(constructionSketchMatches(model, { strokes: boundSketchStrokes(half), camera, chosenXValues: chosen }), oldSketchSnaps(model, half, camera, chosen));
    });
    // Drawn unzoomed, then judged after zooming: the strokes stay where they
    // were drawn on screen, in both the old check and the new one.
    const unzoomed = trace(model.visiblePaths, authoredCamera(model));
    const zoomed = zoomIn(model, null, 2);
    assert.equal(
      constructionSketchMatches(model, { strokes: boundSketchStrokes(unzoomed), camera: zoomed, chosenXValues: chosen }),
      oldSketchSnaps(model, unzoomed, zoomed, chosen),
    );
  });
  const inverse = modelFor(INVERSE);
  [0, 1, 3].forEach((times) => {
    const camera = times ? zoomIn(inverse, null, times) : authoredCamera(inverse);
    [[0, 0], [0, 30], [0, 140]].forEach((offset) => {
      const raw = trace(inverse.inverseVisiblePaths, camera, offset);
      assert.equal(inverseSketchMatches(inverse, { strokes: boundSketchStrokes(raw, SKETCH_LIMITS.inversePoints), camera }), oldInverseSnaps(inverse, raw, camera), `inverse zoom ${times} ${offset}`);
    });
  });
});

test('hand-drawn strokes: bounding never changes a clear pass or a clear fail, at any zoom — only strokes on the 68-unit boundary can differ', () => {
  // A student's hand: the curve traced under the camera, shifted by an offset
  // and wobbling by a jitter, captured the way the workspace captures it. The
  // old check ran on the raw floats; the shared one runs on the bounded
  // (rounded, thinned) strokes the browser now stores, checks and sends.
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const CUBIC = { type: 'functionGraph', functionSpec: { type: 'cubic', a: 0.5, h: 0, k: 0 } };
  let total = 0;
  let passes = 0;
  const disagreements = [];
  [QUADRATIC, RESTRICTED_LINE, SQUARE_ROOT, RATIONAL, CUBIC].forEach((question) => {
    const model = modelFor(question);
    const chosen = Object.fromEntries(model.tasks.filter((task) => Number.isFinite(Number(task.x))).map((task) => [task.id, String(task.x)]));
    [0, 1, 2, 3, 4].forEach((times) => {
      const camera = times ? zoomIn(model, null, times) : authoredCamera(model);
      const toScreen = oldScreen(camera);
      for (let trial = 0; trial < 40; trial += 1) {
        const dy = (random() - 0.5) * 160;
        const dx = (random() - 0.5) * 60;
        const jitter = random() * 30;
        const raw = model.visiblePaths
          .map((path) => capture(path.map(toScreen).map(([x, y]) => [x + dx + (random() - 0.5) * jitter, y + dy + (random() - 0.5) * jitter])))
          .filter((stroke) => stroke.length >= 2);
        const before = oldSketchSnaps(model, raw, camera, chosen);
        const now = constructionSketchMatches(model, { strokes: boundSketchStrokes(raw), camera, chosenXValues: chosen });
        total += 1;
        if (now) passes += 1;
        if (now !== before) disagreements.push({ type: question.functionSpec.type, times, offset: Math.hypot(dx, dy), jitter, before, now });
      }
    });
  });
  // Both verdicts occur often, so agreement is not agreement on one answer.
  assert.ok(passes > total * 0.3 && passes < total * 0.95, `passes ${passes}/${total}`);
  assert.ok(disagreements.length <= total * 0.02, `${disagreements.length}/${total} differ: ${JSON.stringify(disagreements)}`);
  // Every difference is a stroke sitting on the tolerance itself (68 units,
  // give or take the jitter) — never a clearly good or clearly bad sketch.
  disagreements.forEach((entry) => {
    assert.ok(entry.offset + entry.jitter >= 50 && entry.offset - entry.jitter <= 90, JSON.stringify(entry));
  });
});

test('a forged camera is never more lenient than the authored window', () => {
  const model = modelFor(QUADRATIC);
  const authored = authoredCamera(model);
  const forged = [
    { xMin: authored.xMin - 40, xMax: authored.xMax + 40, yMin: authored.yMin - 40, yMax: authored.yMax + 40 },
    { xMin: 0.9, xMax: 1.1, yMin: -2.1, yMax: -1.9 },
    { xMin: authored.xMax, xMax: authored.xMin, yMin: authored.yMin, yMax: authored.yMax },
    { xMin: 'a', xMax: 2, yMin: 0, yMax: 1 },
    null,
    'authored',
  ];
  forged.forEach((camera) => assert.deepEqual(resolveSketchCamera(model, camera), authored, JSON.stringify(camera)));
  // A scribble that only "matches" when the whole plane is squeezed to a dot.
  const huge = forged[0];
  const scribble = boundSketchStrokes(trace(model.visiblePaths, huge));
  assert.equal(constructionSketchMatches(model, { strokes: scribble, camera: huge }), false);
  const work = { construction: { placements: {}, strokes: scribble, sketchView: huge } };
  const { browser } = gradeBothWays(QUADRATIC, work, 'forged camera');
  assert.equal(browser.parts.find((part) => part.id === 'graph-curve').isCorrect, false);
});

/* ---------------------------------------------------------------------------
 * Hygiene: student work only, forged verdicts ignored, malformed refused.
 * ------------------------------------------------------------------------- */

const correctSession = (question) => {
  const api = startSession(question);
  const { model } = api.session;
  if (question === CHOOSE_X) Object.entries(CHOSEN).forEach(([id, x]) => api.chooseX(id, x));
  if (model.constructionEnabled) {
    api.placeAllCorrect().checkPoints();
    if (!model.pointOnly) {
      const branches = trace(model.visiblePaths, api.session.camera);
      branches.forEach((stroke) => api.draw(stroke));
      api.markAllEnds();
    }
  }
  model.analysisParts.forEach((part) => {
    if (['point', 'inversePoint'].includes(part.kind)) {
      if (part.responseMode !== 'input') {
        if (part.expected.length) api.select(part.id, part.expected.map((point) => [...point])); else api.none(part.id);
      }
      if (part.responseMode !== 'click') api.typePoint(part.id, part.expected.length ? part.expected.map(pointLabel).join(', ') : 'DNE');
    }
  });
  if (model.inverseReflectionEnabled) api.checkInverse().traceInverse();
  const answers = question === ANALYSIS ? ANALYSIS_ANSWERS
    : question === INVESTIGATION ? INVESTIGATION_ANSWERS
      : { slope: '0.5', 'inverse-equation': 'y=(x-1)/2' };
  model.analysisParts.filter((part) => !['point', 'inversePoint'].includes(part.kind)).forEach((part) => api.answer(part.id, answers[part.id]));
  return api;
};

test('fully correct work is correct in every fixture, on both paths, and carries only student work', () => {
  Object.entries(TYPED_FIXTURES).forEach(([name, question]) => {
    const state = correctSession(question).session.now;
    const work = graphWorkspaceWorkFromState(state);
    const { browser } = gradeBothWays(question, work, name);
    assert.equal(browser.graded, true, name);
    assert.equal(browser.isComplete, true, `${name}: ${JSON.stringify(browser.parts.filter((part) => !part.isComplete))}`);
    assert.equal(browser.isCorrect, true, `${name}: ${JSON.stringify(browser.parts.filter((part) => !part.isCorrect))}`);
    assert.equal(browser.score, 1, name);
    assert.deepEqual(boundToolWork(work).dropped, [], name);
    // No answer key or verdict travels as work.
    assert.doesNotMatch(canonicalToolWorkJson(work), /pointsValidated|snapped|locationCorrect|droppedPoint|inverseSnapped|expected|isCorrect/, name);
  });
});

test('the work format is canonical: normalizing twice changes nothing, and it survives the wire', () => {
  Object.values(TYPED_FIXTURES).forEach((question) => {
    const work = graphWorkspaceWorkFromState(correctSession(question).session.now);
    assert.deepEqual(normalizeGraphWorkspaceWork(work), work);
    assert.deepEqual(normalizeGraphWorkspaceWork(JSON.parse(canonicalToolWorkJson(work))), clone(work));
  });
});

test('forged verdicts and keys are ignored: the grade is the grade of the work alone', () => {
  const question = INVESTIGATION;
  const honest = graphWorkspaceWorkFromState(startSession(question).placeAllCorrect().checkPoints().session.now);
  assert.equal(honest.construction.pointsLocked, true);
  // The component's own pointsValidated flag never travels as work...
  assert.equal('pointsValidated' in honest.construction, false);
  // ...and on the wire it is not a commit: only the student's pointsLocked is.
  const claimedValidated = clone(honest);
  claimedValidated.construction.pointsLocked = false;
  claimedValidated.construction.pointsValidated = true;
  const claimed = gradeBothWays(question, claimedValidated, 'pointsValidated on the wire').browser;
  assert.equal(claimed.parts.filter((part) => part.id.startsWith('p')).some((part) => part.isCorrect), false);
  const forged = clone(honest);
  Object.assign(forged, { isCorrect: true, score: 1, checks: [true], expected: { domain: 'x' }, solution: 'all' });
  Object.assign(forged.construction, { pointsValidated: true, snapped: true, isCorrect: true });
  forged.construction.markerPlacements = Object.fromEntries(modelFor(question).endpointRequirements.map((requirement) => [requirement.id, { marker: 'open', point: [100, 100], locationCorrect: true, correct: true }]));
  Object.assign(forged.analysis, { inverseSnapped: true, inversePointsValidated: true, answers: { domain: 'nonsense', isCorrect: true } });
  const plain = clone(forged);
  delete plain.isCorrect; delete plain.score; delete plain.checks; delete plain.expected; delete plain.solution;
  const { browser } = gradeBothWays(question, forged, 'forged');
  const { browser: reference } = gradeBothWays(question, plain, 'reference');
  assert.equal(browser.isCorrect, false);
  assert.equal(browser.parts.find((part) => part.id === 'graph-curve').isCorrect, false, 'snapped: true is not a sketch');
  modelFor(question).endpointRequirements.forEach((requirement) => {
    assert.equal(browser.parts.find((part) => part.id === `${requirement.id}-placement`).isCorrect, false, 'locationCorrect is not a location');
  });
  assert.deepEqual(browser.parts, reference.parts);
  assert.equal(browser.score, reference.score);
  // A bare symbol (a legacy draft's marker) is the student's symbol, never a location.
  const bare = { construction: { ...honest.construction, markerPlacements: { 'endpoint-0-start': 'arrow' } } };
  const { browser: legacy } = gradeBothWays(question, bare, 'bare marker');
  assert.equal(legacy.parts.find((part) => part.id === 'endpoint-0-start-type').isCorrect, true);
  assert.equal(legacy.parts.find((part) => part.id === 'endpoint-0-start-placement').isCorrect, false);
});

test('malformed and non-object work is refused or graded as empty — never a crash, never a guess', () => {
  ['work', 7, [1, 2], null, true].forEach((work) => {
    const { browser } = gradeBothWays(QUADRATIC, work, `non-object ${JSON.stringify(work)}`);
    assert.equal(browser.graded, false);
    assert.equal(browser.isCorrect, false);
  });
  const wrongTypes = [
    { construction: 'x', analysis: [] },
    { construction: { placements: 'p', strokes: 'zzz', sketchView: 'q', markerPlacements: [1, 2], chosenXValues: 5 } },
    { construction: { placements: { 'point-key': 'abc', 'point-1': [null, null], 'point-2': [1] }, strokes: [[['a', 'b']], 'x', [[1, 2, 3]]] } },
    { analysis: { selections: { feature: 'x' }, answers: { feature: 9 }, typedPoints: [], noneSelections: { feature: 'yes' } } },
    {},
  ];
  [QUADRATIC, ANALYSIS_DEFAULT, INVESTIGATION].forEach((question) => wrongTypes.forEach((work, index) => {
    const { browser } = gradeBothWays(question, work, `wrong types ${index}`);
    assert.equal(browser.graded, true);
    assert.equal(browser.isComplete, false);
    assert.equal(browser.isCorrect, false);
  }));
  // Oversize work is refused on both paths rather than truncated and graded.
  const oversize = { analysis: { answers: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`a${index}`, 'x'.repeat(900)])) } };
  const { browser, server } = gradeBothWays(ANALYSIS, oversize, 'oversize');
  assert.equal(browser.reason, 'oversize-response');
  assert.equal(server.reason, 'oversize-response');
});

test('the largest work a student can produce stays well inside the response limits', () => {
  const model = modelFor(INVERSE);
  const camera = authoredCamera(model);
  // Forty long strokes — far past the budget — are thinned, never truncated.
  const long = trace(model.visiblePaths, camera)[0];
  const many = Array.from({ length: 60 }, (_, index) => long.map(([x, y]) => [x + (index % 7) * 0.37, y + (index % 5) * 0.53]));
  const strokes = boundSketchStrokes(many, SKETCH_LIMITS.constructionPoints);
  const inverseStrokes = boundSketchStrokes(many, SKETCH_LIMITS.inversePoints);
  assert.ok(strokes.length <= SKETCH_LIMITS.maxStrokes);
  assert.ok(strokes.flat().length <= SKETCH_LIMITS.constructionPoints);
  assert.ok(strokes.every((stroke) => stroke.length >= 2 && stroke.length <= SKETCH_LIMITS.maxStrokePoints));
  assert.deepEqual(boundSketchStrokes(strokes, SKETCH_LIMITS.constructionPoints), strokes, 'bounding is idempotent');
  // Pointer capture can report points past the plane.
  strokes[0][0] = [-1234, 1876];
  const work = normalizeGraphWorkspaceWork({
    construction: {
      placements: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`point-${index}`, [-12.25 + index, 17.75 - index]])),
      chosenXValues: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`point-${index}`, String(-12.25 + index)])),
      pointsLocked: true,
      strokes,
      sketchView: { xMin: -6.123456789, xMax: 5.987654321, yMin: -6.5, yMax: 6.5 },
      markerPlacements: Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`endpoint-${index}-start`, { marker: 'closed', point: [-5.37, 0.68603] }])),
    },
    analysis: {
      selections: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`part-${index}`, [[-1.25, 0], [3.75, 0]]])),
      answers: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`answer-${index}`, '(-\\infty, -1)\\cup(3, \\infty) and some more words'])),
      typedPoints: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`part-${index}`, '(-1.25, 0), (3.75, 0)'])),
      noneSelections: { max: true },
      inverseStrokes,
      inverseSketchView: camera,
    },
  });
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  const json = canonicalToolWorkJson(work);
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength * 0.85, `maximal work is ${json.length} characters`);
  const { browser } = gradeBothWays(INVERSE, work, 'maximal');
  assert.equal(browser.graded, true);
});

/* ---------------------------------------------------------------------------
 * Discrimination: correct work is correct only for its own key.
 * ------------------------------------------------------------------------- */

test('correct work graded against an altered key is not correct', () => {
  const altered = [
    [QUADRATIC, { ...QUADRATIC, functionSpec: { ...QUADRATIC.functionSpec, k: 0 } }],
    [RESTRICTED_LINE, { ...RESTRICTED_LINE, functionSpec: { ...RESTRICTED_LINE.functionSpec, domain: { min: -2, max: 3, minInclusive: false, maxInclusive: false } } }],
    [INVESTIGATION, { ...INVESTIGATION, analysisRequests: INVESTIGATION.analysisRequests.map((request) => (request.id === 'axis' ? { ...request, expected: 'x=2' } : request)) }],
    [POINT_ONLY, { ...POINT_ONLY, pointTasks: POINT_ONLY.pointTasks.map((task) => (task.id === 'b' ? { ...task, expected: [2, 3] } : task)) }],
    [INVERSE, { ...INVERSE, analysisRequests: INVERSE.analysisRequests.map((request) => (request.id === 'inverse-equation' ? { ...request, expected: ['y=(x+1)/2'] } : request)) }],
    [ANALYSIS, { ...ANALYSIS, functionSpec: { ...ANALYSIS.functionSpec, k: 4 } }],
    [ANALYSIS_DEFAULT, { ...ANALYSIS_DEFAULT, functionSpec: { ...ANALYSIS_DEFAULT.functionSpec, h: 1 } }],
  ];
  altered.forEach(([question, wrongKey]) => {
    const work = graphWorkspaceWorkFromState(correctSession(question).session.now);
    assert.equal(gradeBothWays(question, work, 'own key').browser.isCorrect, true, question.type);
    const { browser } = gradeBothWays(wrongKey, work, 'altered key');
    assert.equal(browser.isCorrect, false, `${question.type} graded against an altered key`);
    assert.ok(browser.score < 1);
  });
  // An authored end requirement with a different symbol.
  const model = modelFor(QUADRATIC);
  const work = graphWorkspaceWorkFromState(correctSession(QUADRATIC).session.now);
  const reauthored = { ...QUADRATIC, endpointRequirements: model.endpointRequirements.map((requirement, index) => (index ? { ...requirement, marker: 'closed' } : requirement)) };
  assert.equal(gradeBothWays(reauthored, work, 'reauthored end').browser.isCorrect, false);
});

test('point and marker tolerances follow the snap step, exactly as the workspace applied them', () => {
  const model = modelFor(QUADRATIC);
  assert.equal(model.snapStep, 0.5);
  assert.equal(model.pointTolerance, 0.24);
  assert.equal(model.markerTolerance, 0.9);
  const work = graphWorkspaceWorkFromState(correctSession(QUADRATIC).session.now);
  const nudge = (dx) => {
    const shifted = clone(work);
    shifted.construction.placements['point-1'] = [-1 + dx, 2];
    return gradeBothWays(QUADRATIC, shifted, `nudge ${dx}`).browser.parts.find((part) => part.id === 'point-1').isCorrect;
  };
  assert.equal(nudge(0.2), true);
  assert.equal(nudge(0.3), false);
  const end = model.endpointRequirements[0];
  const markerAt = (dx) => {
    const moved = clone(work);
    moved.construction.markerPlacements[end.id].point = [end.point[0] + dx, end.point[1]];
    return gradeBothWays(QUADRATIC, moved, `marker ${dx}`).browser.parts.find((part) => part.id === `${end.id}-placement`).isCorrect;
  };
  assert.equal(markerAt(0.85), true);
  assert.equal(markerAt(0.95), false);
});

test('analysis tolerances follow the snap step: clicked, typed and numeric answers', () => {
  const model = modelFor(INVESTIGATION);
  assert.equal(model.analysisTolerance, 0.29);
  const base = graphWorkspaceWorkFromState(correctSession(INVESTIGATION).session.now);
  const partCorrect = (mutate, id) => {
    const work = clone(base);
    mutate(work.analysis);
    return gradeBothWays(INVESTIGATION, work, `analysis tolerance ${id}`).browser.parts.find((part) => part.id === id).isCorrect;
  };
  assert.equal(partCorrect((analysis) => { analysis.selections.xint = [[-1.25, 0], [3, 0.2]]; }, 'xint'), true, 'clicked within 0.29');
  assert.equal(partCorrect((analysis) => { analysis.selections.xint = [[-1.35, 0], [3, 0]]; }, 'xint'), false, 'clicked beyond 0.29');
  assert.equal(partCorrect((analysis) => { analysis.typedPoints.yint = '(0, -2.75)'; }, 'yint'), true, 'typed within 0.29');
  assert.equal(partCorrect((analysis) => { analysis.typedPoints.yint = '(0, -2.6)'; }, 'yint'), false, 'typed beyond 0.29');
  const slope = graphWorkspaceWorkFromState(correctSession(POINT_ONLY_ANALYSIS).session.now);
  const slopeCorrect = (text) => {
    const work = clone(slope);
    work.analysis.answers.slope = text;
    return gradeBothWays(POINT_ONLY_ANALYSIS, work, `slope ${text}`).browser.parts.find((part) => part.id === 'slope').isCorrect;
  };
  assert.equal(slopeCorrect('0.75'), true, 'a value within 0.28 of 0.5');
  assert.equal(slopeCorrect('0.8'), false, 'a value beyond it');
});

test('a construction is complete only when every point is placed, the sketch snaps and every end is marked', () => {
  // The browser cannot reach these states (drawing and markers unlock in
  // order), but a deadline or a tampered client can deliver them; the server
  // must not call them complete.
  const lineNoEnds = { type: 'functionGraph', functionSpec: { type: 'linear', m: 2, b: -1 }, graph: { xMin: -5, xMax: 5, yMin: -10, yMax: 10 }, requireEndpointMarkers: false };
  [QUADRATIC, lineNoEnds, RATIONAL].forEach((question) => {
    const work = graphWorkspaceWorkFromState(correctSession(question).session.now);
    assert.equal(gradeBothWays(question, work, 'complete').browser.isComplete, true);
    const unsketched = clone(work);
    unsketched.construction.strokes = [];
    const noSketch = gradeBothWays(question, unsketched, 'no sketch').browser;
    assert.equal(noSketch.isComplete, false, `${question.functionSpec.type}: no sketch, not complete`);
    assert.equal(noSketch.isCorrect, false);
    const oneBranch = clone(work);
    oneBranch.construction.strokes = work.construction.strokes.slice(0, 1);
    if (modelFor(question).requiredStrokeCount === 2) assert.equal(gradeBothWays(question, oneBranch, 'one branch').browser.isComplete, false);
    const unplaced = clone(work);
    delete unplaced.construction.placements[modelFor(question).tasks[0].id];
    assert.equal(gradeBothWays(question, unplaced, 'missing point').browser.isComplete, false);
    if (modelFor(question).endpointRequirements.length) {
      const unmarked = clone(work);
      delete unmarked.construction.markerPlacements[modelFor(question).endpointRequirements[0].id];
      assert.equal(gradeBothWays(question, unmarked, 'missing marker').browser.isComplete, false);
    }
  });
  // pointOnly needs neither a sketch nor markers; analysis mode needs no construction.
  assert.equal(gradeBothWays(POINT_ONLY, { construction: { placements: { a: [0, 1], b: [2, 2], c: [-2, 0] }, pointsLocked: true } }, 'points only').browser.isCorrect, true);
  assert.equal(gradeBothWays(ANALYSIS_DEFAULT, { analysis: { selections: { feature: [[-1, 3]] } } }, 'analysis only').browser.isCorrect, true);
});

test('point placements count only once committed and all right — all or nothing, as the workspace always counted them', () => {
  const right = { a: [0, 1], b: [2, 2], c: [-2, 0] };
  const oneOff = { a: [0, 1], b: [2, 3], c: [-2, 0] };
  const grade = (placements, pointsLocked, label) => gradeBothWays(POINT_ONLY, { construction: { placements, pointsLocked } }, label).browser;

  // Committed and right: complete, correct, full credit.
  const committed = grade(right, true, 'committed and right');
  assert.equal(committed.isComplete, true);
  assert.equal(committed.isCorrect, true);
  assert.equal(attemptInputsFromGrading(committed).partialCreditPercent, 100);

  // Right but never committed with "Check Point Placements": the workspace
  // never counted these (Submit stayed closed), and neither does the grader.
  const uncommitted = grade(right, false, 'right, not committed');
  assert.equal(uncommitted.isComplete, false);
  assert.equal(uncommitted.isCorrect, false);
  assert.deepEqual(uncommitted.parts.map((part) => [part.isComplete, part.isCorrect]), [[false, false], [false, false], [false, false]]);
  assert.equal(attemptInputsFromGrading(uncommitted).partialCreditPercent, 0);
  // ...and the response still shows where each point was placed.
  assert.deepEqual(uncommitted.parts.map((part) => part.response), ['(0, 1)', '(2, 2)', '(-2, 0)']);

  // A forged commit on a wrong placement earns nothing: the placements are
  // re-marked, and one wrong point leaves every point part uncredited — the
  // button would never have accepted this set.
  const forged = grade(oneOff, true, 'forged commit, one point off');
  assert.equal(forged.isComplete, false);
  assert.equal(forged.isCorrect, false);
  assert.deepEqual(forged.parts.map((part) => part.isCorrect), [false, false, false]);
  assert.equal(attemptInputsFromGrading(forged).partialCreditPercent, 0);
  // So does a forged commit with a point missing.
  assert.equal(grade({ a: [0, 1], b: [2, 2] }, true, 'forged commit, one missing').isComplete, false);
  // Only a literal `true` commits; anything else is no commit.
  ['true', 1, {}, [true]].forEach((value) => assert.equal(grade(right, value, `commit ${JSON.stringify(value)}`).isCorrect, false));

  // The same rule in a full construction: an uncommitted, correct point set
  // with a perfect sketch and markers is still not complete.
  const work = graphWorkspaceWorkFromState(correctSession(QUADRATIC).session.now);
  assert.equal(work.construction.pointsLocked, true);
  assert.equal(gradeBothWays(QUADRATIC, work, 'committed construction').browser.isCorrect, true);
  const unlocked = clone(work);
  unlocked.construction.pointsLocked = false;
  const unlockedGrade = gradeBothWays(QUADRATIC, unlocked, 'uncommitted construction').browser;
  assert.equal(unlockedGrade.isComplete, false);
  assert.equal(unlockedGrade.parts.filter((part) => part.id.startsWith('point-')).some((part) => part.isCorrect), false);
  assert.equal(unlockedGrade.parts.find((part) => part.id === 'graph-curve').isCorrect, true, 'the sketch is still its own part');
});

test('a sketch counts only once it snapped on screen: Undo after a snap takes the credit back with it', () => {
  // Undo right after a snap keeps strokes that would pass. The workspace
  // showed that sketch as not snapped (drawing re-opens) and counted the curve
  // as missing; so must the grader — before the commit travelled with the
  // work, NO_ENDS here was reported complete and correct while the screen
  // asked the student to draw.
  [NO_ENDS, QUADRATIC].forEach((question) => {
    const api = startSession(question).placeAllCorrect().checkPoints().traceCurve();
    assert.equal(api.session.now.construction.snapped, true);
    assertSessionFidelity(api, 'snapped');
    api.undoSnap();
    const undone = assertSessionFidelity(api, 'snap undone, strokes kept');
    assert.equal(undone.work.construction.strokes.length > 0, true);
    assert.equal(undone.work.construction.sketchLocked, false);
    assert.equal(undone.isComplete, false);
    assert.equal(undone.parts.find((part) => part.id === 'graph-curve').isCorrect, false);
    // Drawing again re-runs the check over every stroke, and the snap returns.
    api.traceCurve().markAllEnds();
    const redone = assertSessionFidelity(api, 'drawn again');
    assert.equal(redone.isComplete, true);
    assert.equal(redone.isCorrect, true);
  });

  // The inverse sketch is committed the same way.
  const inverse = correctSession(INVERSE);
  assert.equal(assertSessionFidelity(inverse, 'inverse snapped').isCorrect, true);
  inverse.undoInverseSnap();
  const undone = assertSessionFidelity(inverse, 'inverse snap undone');
  assert.equal(undone.isComplete, false);
  assert.equal(undone.parts.find((part) => part.id === 'inverse-line-sketch').isCorrect, false);

  // A commit only withholds: a forged one on strokes off the curve earns
  // nothing, and only a literal `true` is a commit.
  const work = graphWorkspaceWorkFromState(correctSession(QUADRATIC).session.now);
  assert.equal(work.construction.sketchLocked, true);
  const model = modelFor(QUADRATIC);
  const offCurve = clone(work);
  offCurve.construction.strokes = trace(model.visiblePaths, authoredCamera(model), [0, 140]);
  assert.equal(gradeBothWays(QUADRATIC, offCurve, 'forged sketch commit').browser.parts.find((part) => part.id === 'graph-curve').isCorrect, false);
  ['true', 1, {}, [true]].forEach((value) => {
    const notACommit = clone(work);
    notACommit.construction.sketchLocked = value;
    const graded = gradeBothWays(QUADRATIC, notACommit, `sketch commit ${JSON.stringify(value)}`).browser;
    assert.equal(graded.parts.find((part) => part.id === 'graph-curve').isCorrect, false);
    assert.equal(graded.isComplete, false);
  });
  const inverseWork = graphWorkspaceWorkFromState(correctSession(INVERSE).session.now);
  assert.equal(inverseWork.analysis.inverseSketchLocked, true);
  const forgedInverse = clone(inverseWork);
  forgedInverse.analysis.inverseStrokes = trace(modelFor(INVERSE).inverseVisiblePaths, authoredCamera(modelFor(INVERSE)), [0, 160]);
  assert.equal(gradeBothWays(INVERSE, forgedInverse, 'forged inverse commit').browser.parts.find((part) => part.id === 'inverse-line-sketch').isCorrect, false);
});

test('retyping a chosen x after the commit clears only that point, exactly as the workspace counted it', () => {
  // The chosen-x box stays open after "Check Point Placements" (until the
  // sketch snaps), and retyping it clears that task's placement, which can no
  // longer be re-placed. The workspace kept the commit: the cleared part is
  // incomplete and incorrect, every other part keeps its own mark, and the
  // construction can still be finished and submitted.
  const committed = () => {
    const api = startSession(CHOOSE_X);
    Object.entries(CHOSEN).forEach(([id, x]) => api.chooseX(id, x));
    return api.placeAllCorrect().checkPoints();
  };
  const retyped = committed().chooseX('point-5', '1');
  const cleared = assertSessionFidelity(retyped, 'one chosen x retyped after the commit');
  const pointPart = (graded, id) => graded.parts.find((part) => part.id === id);
  assert.deepEqual([pointPart(cleared, 'point-5').isComplete, pointPart(cleared, 'point-5').isCorrect], [false, false]);
  assert.equal(['point-1', 'point-2', 'point-key', 'point-4'].every((id) => pointPart(cleared, id).isCorrect), true, 'the other points keep their credit');
  retyped.traceCurve().markAllEnds();
  const finished = assertSessionFidelity(retyped, 'finished after the retype');
  assert.equal(finished.isComplete, true);
  assert.equal(finished.isCorrect, false);
  assert.equal(finished.parts.filter((part) => !part.isCorrect).map((part) => part.id).join(), 'point-5');

  // A retype that unbalances the chosen x-values costs every student-chosen
  // point, as the spread rule always did — the fixed point keeps its credit.
  const unbalanced = committed().chooseX('point-5', '-1').traceCurve().markAllEnds();
  const spread = assertSessionFidelity(unbalanced, 'retype that unbalances the spread');
  assert.equal(spread.isComplete, true);
  assert.deepEqual(spread.parts.filter((part) => part.id.startsWith('point-')).map((part) => [part.id, part.isCorrect]), [['point-1', false], ['point-2', false], ['point-key', true], ['point-4', false], ['point-5', false]]);

  // Point-only: the commit is the whole construction.
  const plotted = startSession(POINT_ONLY_CHOOSE_X);
  Object.entries(CHOSEN).forEach(([id, x]) => plotted.chooseX(id, x));
  plotted.placeAllCorrect().checkPoints();
  assert.equal(assertSessionFidelity(plotted, 'point-only committed').isCorrect, true);
  plotted.chooseX('point-2', '-1');
  const pointOnly = assertSessionFidelity(plotted, 'point-only retyped');
  assert.equal(pointOnly.isComplete, true);
  assert.equal(pointOnly.partialCreditPercent, 80);

  // Only a student-chosen task can be missing from a committed set; anything
  // else is a set the button never accepted, and earns no point credit.
  const work = graphWorkspaceWorkFromState(committed().session.now);
  const fixedMissing = clone(work);
  delete fixedMissing.construction.placements['point-key'];
  const moved = clone(work);
  delete moved.construction.placements['point-5'];
  moved.construction.placements['point-1'] = [-3, 2];
  // ...and the re-check holds each placement to the point tolerance the button
  // used, not a looser one: half a unit off is past max(0.22, 0.48·snap).
  const nudged = clone(work);
  delete nudged.construction.placements['point-5'];
  nudged.construction.placements['point-1'] = [-3, 4.5];
  assert.ok(modelFor(CHOOSE_X).pointTolerance < 0.5);
  [[fixedMissing, 'fixed point missing'], [moved, 'chosen point missing and another moved'], [nudged, 'chosen point missing and another just past tolerance']].forEach(([forged, label]) => {
    const graded = gradeBothWays(CHOOSE_X, forged, label).browser;
    assert.equal(graded.parts.filter((part) => part.id.startsWith('point-')).some((part) => part.isCorrect), false, label);
  });
});

test('the per-question model memo never serves a stale model, and memoized checks equal fresh ones', () => {
  const question = clone(QUADRATIC);
  const first = graphWorkspaceModelFor(question);
  assert.equal(graphWorkspaceModelFor(question), first, 'the same question object reuses its model');
  assert.deepEqual(first, buildGraphWorkspaceModel(question));
  question.functionSpec.k = 1;
  const second = graphWorkspaceModelFor(question);
  assert.notEqual(second, first, 'an edited question is re-derived');
  assert.deepEqual(second, buildGraphWorkspaceModel(question));
  assert.notDeepEqual(second.tasks, first.tasks);
  assert.notEqual(graphWorkspaceModelFor(question, { analysisMode: true }), second, 'the analysis view is its own model');
  // Repeated and interleaved sketch checks return what a fresh model computes.
  const work = graphWorkspaceWorkFromState(correctSession(QUADRATIC).session.now);
  const fresh = (q, w) => constructionSketchMatches(buildGraphWorkspaceModel(q), { strokes: w.construction.strokes, camera: w.construction.sketchView, chosenXValues: w.construction.chosenXValues });
  const memo = graphWorkspaceModelFor(QUADRATIC);
  const shifted = clone(work);
  shifted.construction.strokes = shifted.construction.strokes.map((stroke) => stroke.map(([x, y]) => [x, y + 150]));
  [work, shifted, work, shifted].forEach((candidate) => {
    assert.equal(constructionSketchMatches(memo, { strokes: candidate.construction.strokes, camera: candidate.construction.sketchView, chosenXValues: candidate.construction.chosenXValues }), fresh(QUADRATIC, candidate));
  });
  assert.equal(gradeGraphWorkspace(question, work).isCorrect, false, 'work for the old key is not correct for the edited question');
});

/* ---------------------------------------------------------------------------
 * Wiring.
 * ------------------------------------------------------------------------- */

test('the workspace reports the shared grader, through the server bytes, with no verdict of its own', () => {
  assert.match(COMPONENT, /import graphWorkspaceGrader from '\.\.\/functions\/shared\/serverGrading\/tools\/graphWorkspace\.mjs';/);
  assert.match(COMPONENT, /import \{ gradeToolCheck \} from '\.\/tools\/shared\/sharedToolGrading\.js';/);
  assert.match(COMPONENT, /import \{ answerStateFromSharedGrading \} from '\.\/platform\/grading\/sharedAnswerState\.js';/);
  // The work is built from the component's state by the shared mapper (the one
  // place pointsValidated becomes the student's `pointsLocked` commit)...
  assert.match(COMPONENT, /const work = useMemo\(\(\) => graphWorkspaceWorkFromState\(\{ construction, analysis \}\), \[construction, analysis\]\);/);
  assert.match(COMPONENT, /const sharedGrade = useMemo\(\(\) => gradeToolCheck\(graphWorkspaceGrader, question, work\), \[question, work\]\);/);
  // ...and the effect reports the shared result as is: no verdict, completeness
  // or stage gate of the component's own is laid over it.
  const effect = region(COMPONENT, 'const questionDetails =', '}, [sharedGrade');
  assert.match(effect, /onStateChange\(answerStateFromSharedGrading\(sharedGrade, \{ questionDetails \}\)\);/);
  assert.doesNotMatch(effect, /isComplete|isCorrect|partialCreditPercent|parts\s*:/);
  assert.equal((COMPONENT.match(/onStateChange\(/g) || []).length, 1, 'the workspace reports its answer state in exactly one place');
  // The sketch is checked by the grader's own function, on bounded strokes,
  // under the camera that is stored with them.
  const drawing = region(COMPONENT, 'const endDrawing', 'const showPredrawnGraph');
  assert.match(drawing, /boundSketchStrokes\(\[\.\.\.construction\.strokes, finished\], SKETCH_LIMITS\.constructionPoints\)/);
  assert.match(drawing, /constructionSketchMatches\(model, \{ strokes: completed, camera: sketchCamera, chosenXValues: construction\.chosenXValues \}\)/);
  assert.match(drawing, /sketchView: sketchCamera/);
  assert.match(drawing, /inverseSketchMatches\(model, \{ strokes: completed, camera: sketchCamera \}\)/);
  assert.match(drawing, /inverseSketchView: sketchCamera/);
  // No inline verdict code is left.
  assert.doesNotMatch(COMPONENT, /locationCorrect|roughSketchMatchesGraph|pathAnalysisTextMatches|analysisSelectionsAreCorrect|pointSetInputMatches|normalizeAnalysisRequests\s*=/);
  assert.doesNotMatch(COMPONENT, /responseKey: JSON\.stringify/);
  assert.equal(GRAPH_WORKSPACE_VIEWBOX.width, 760);
  assert.match(COMPONENT, /const WIDTH = GRAPH_WORKSPACE_VIEWBOX\.width;/);
});

test('the reported answer state carries the raw work, and My Math Path still reads its envelope', () => {
  const state = correctSession(INVESTIGATION).session.now;
  const reported = reportedAnswerState(INVESTIGATION, state);
  assert.equal(reported.isComplete, true);
  assert.equal(reported.toolResponse.toolId, 'graphWorkspace');
  assert.equal(reported.toolResponse.type, 'functionInvestigation');
  assert.equal(reported.responseKey, reported.toolResponse.value);
  const raw = buildRawPathResponse({ pathToolId: 'functionInvestigation', answerState: reported });
  assert.deepEqual(raw, {
    placements: reported.work.construction.placements,
    markerPlacements: reported.work.construction.markerPlacements,
    answers: reported.work.analysis.answers,
    selections: reported.work.analysis.selections,
  });
  // The recorded attempt equals the server's mapping of the same work.
  const server = gradeServerResponse({ question: INVESTIGATION, response: clone(reported.toolResponse) });
  assert.deepEqual(attemptInputsFromGrading(server), { isCorrect: reported.isCorrect, parts: reported.parts, partialCreditPercent: reported.partialCreditPercent });
});

test('the grade function and the bound grader agree, and an untyped workflow plot grades like construct', () => {
  const work = graphWorkspaceWorkFromState(correctSession(QUADRATIC).session.now);
  const direct = gradeGraphWorkspace(QUADRATIC, work);
  const bound = graphWorkspaceGrader.grade(QUADRATIC, clone(work));
  assert.deepEqual(bound.parts, direct.parts);
  assert.equal(bound.mode, 'construct');
  const plot = { prompt: 'Plot your table.', graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, plotMode: 'points', pointOnly: true, requireEndpointMarkers: false, functionSpec: { type: 'expression', expression: '0', variable: 'x', referencePoints: [[1, 3], [2, 5]] }, pointTasks: [{ id: 't1', label: '(1, 3)', x: 1, expected: [1, 3] }, { id: 't2', label: '(2, 5)', x: 2, expected: [2, 5] }] };
  const api = startSession(plot).place('t1', [1, 3]).place('t2', [2, 5]).checkPoints();
  const done = assertSessionFidelity(api, 'workflow plot');
  assert.equal(done.isCorrect, true);
  assert.equal(graphWorkspaceGrader.grade(plot, done.work).mode, 'pointOnly');
});
