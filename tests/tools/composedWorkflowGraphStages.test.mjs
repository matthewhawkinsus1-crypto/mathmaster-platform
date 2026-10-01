/*
 * COMPOSED WORKFLOWS WITH GRAPH-CONSTRUCTION STAGES — SERVER-AUTHORITATIVE.
 *
 * A `coordinatePlot` or `functionGraph` stage hands the student an
 * InteractiveGraphWorkspace built from their own earlier work (their table,
 * their equation, their discrete/continuous choice, the domain's boundary
 * rule). Until this change the whole question stayed graded on the device:
 * the workflow kept only the workspace's own verdict for that stage, and the
 * server could neither rebuild the graph nor see the construction.
 *
 * Now (functions/shared/toolMath/workflow/workflowGraphStage.mjs):
 *   - the sub-question is ONE pure function of (question, work), which
 *     WorkflowRunner renders and the composed grader rebuilds;
 *   - the stage's response is the workspace's raw, bounded work;
 *   - the composed grader marks it with the shared graph-workspace grader and
 *     reads that verdict where it used to read the workspace's claim.
 *
 * These tests pin, for the default functionCharacteristics recipe,
 * relationRepresentations with a plot, functionModeling (with and without a
 * continuity choice) and V5-compiled workflows (functionGraph and
 * coordinatePlot stages, compiled through the real V5 authoring path):
 *   - browser path == server path, exactly (verdict, completeness, score, parts);
 *   - the answer state WorkflowRunner reports is the attempt the server records;
 *   - DIFFERENTIAL: for honest work, the same marking as the merge-base device
 *     (a7a3b4e), whose graph delegates are ported verbatim below;
 *   - correct, incorrect, partial, tampered, oversize, legacy drafts;
 *   - the WorkflowRunner wiring that makes the screen and the server agree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import {
  composedWorkflowStageWork,
  composedWorkflowSupport,
  composedWorkflowWork,
} from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import {
  resolveWorkflowGraphStages,
  upgradeLegacyGraphArtifact,
  upgradeLegacyGraphResponses,
  workflowGraphArtifact,
  workflowGraphStageWork,
  workflowTableArtifact,
} from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { unsafeExpressionStage } from '../../functions/shared/toolMath/workflow/expressionSafety.mjs';
import graphWorkspaceGrader from '../../functions/shared/serverGrading/tools/graphWorkspace.mjs';
import { resolveGraphWorkspaceMode } from '../../functions/shared/serverGrading/declarations/graphWorkspace.mjs';
import { resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import {
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  SKETCH_LIMITS,
  boundSketchStrokes,
  constructionSketchMatches,
  graphWorkspaceModelFor,
  graphWorkspaceWorkFromState,
} from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { placementsMatchTasks, resolveTaskExpected } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';
import { evaluateGraphFunction } from '../../functions/shared/toolMath/graphWorkspace/functionGraphUtils.mjs';
import { buildStudentTableMagneticTargets } from '../../functions/shared/toolMath/graphWorkspace/graphInteractionPrecision.mjs';
import {
  buildExpressionFunctionSpec,
  evaluateModelAt,
  evaluateNumericValue,
  parseIntervalDomainRestriction,
} from '../../functions/shared/toolMath/graphWorkspace/modelExpression.mjs';
import { gradeTableResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { activeStages, hasStageResponse, readComposedQuestion, resolveStageInput } from '../../src/platform/workflow/questionWorkflow.js';
import { checkTableConsistency, gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { buildWorkflowAnswerState, workflowStageWorkResponses } from '../../src/platform/workflow/workflowAnswerState.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from '../../src/platform/grading/sharedAnswerState.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { zoomedWindow } from '../../src/graphWorkspaceViewport.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARTIFACT = '__mathmasterWorkflowArtifact';
const WORKFLOW_ARTIFACT = ARTIFACT;

/* ======================================================================== *
 * MERGE-BASE PORT BEGIN
 *
 * The device marking this change replaced, as it stood at the merge base
 * (a7a3b4e): WorkflowRunner.jsx's table artifact, its two graph delegates
 * (the sub-question each handed to InteractiveGraphWorkspace) and its
 * renderStage effective stage, plus workflowGraphVisuals.js's domain and
 * end-marker rules. Copied verbatim; only the lines marked `// adapter` turn
 * a component into a function that returns the question it would have
 * rendered. The provenance test below checks every other line against
 * `git show a7a3b4e:...` when the history is available.
 * ======================================================================== */

const mbFiniteNumber = (value) => { // adapter
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const mbNormalizeWorkflowDomain = (domain = null) => { // adapter
  const source = domain && typeof domain === 'object' ? domain : {};
  return {
    min: mbFiniteNumber(source.min), // adapter
    max: mbFiniteNumber(source.max), // adapter
    minClosed: source.minClosed !== false && source.minInclusive !== false,
    maxClosed: source.maxClosed !== false && source.maxInclusive !== false,
  };
};

const mbWorkflowRequiresEndpointMarkers = ({ pointOnly = false, authored, domain = null } = {}) => { // adapter
  if (pointOnly) return false;
  if (typeof authored === 'boolean') return authored;
  const bounds = mbNormalizeWorkflowDomain(domain); // adapter
  return bounds.min !== null || bounds.max !== null;
};

const restrictionFromGradingRule = (rule) => {
  const options = Array.isArray(rule)
    ? rule
    : (rule && typeof rule === 'object' && !Array.isArray(rule))
      ? (Array.isArray(rule.anyOf) ? rule.anyOf : [rule.equals ?? rule])
      : [rule];
  for (const option of options) {
    const parsed = parseIntervalDomainRestriction(option);
    if (parsed) return parsed;
  }
  return null;
};

const mbWorkflowGraphDomainRestriction = ({ // adapter
  graphStage = null,
  workflow = [],
  grading = null,
} = {}) => {
  const authored = parseIntervalDomainRestriction(graphStage?.domainRestriction);
  if (authored) return authored;

  const rules = grading && typeof grading === 'object' && !Array.isArray(grading) ? grading : {};
  const direct = restrictionFromGradingRule(rules.domain);
  if (direct) return direct;

  for (const stage of Array.isArray(workflow) ? workflow : []) {
    if (stage?.kind !== 'domainInput') continue;
    const parsed = restrictionFromGradingRule(rules[stage.id]);
    if (parsed) return parsed;
  }
  return null;
};

const niceGridStep = (range, fallback = 1) => {
  const safeRange = Math.abs(Number(range));
  const safeFallback = Number(fallback);
  if (!Number.isFinite(safeRange) || safeRange <= 0) return Number.isFinite(safeFallback) && safeFallback > 0 ? safeFallback : 1;
  const raw = safeRange / 10;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const scaled = raw / power;
  const multiplier = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return multiplier * power;
};

const expandGraphWindowToPoints = (graph = {}, points = []) => {
  const base = {
    xMin: Number.isFinite(Number(graph.xMin)) ? Number(graph.xMin) : -10,
    xMax: Number.isFinite(Number(graph.xMax)) ? Number(graph.xMax) : 10,
    yMin: Number.isFinite(Number(graph.yMin)) ? Number(graph.yMin) : -10,
    yMax: Number.isFinite(Number(graph.yMax)) ? Number(graph.yMax) : 10,
    ...graph,
  };
  const valid = (Array.isArray(points) ? points : [])
    .filter((point) => Array.isArray(point) && point.length === 2 && point.every((entry) => Number.isFinite(Number(entry))))
    .map(([x, y]) => [Number(x), Number(y)]);
  if (!valid.length) return base;

  const xs = valid.map(([x]) => x);
  const ys = valid.map(([, y]) => y);
  const baseXRange = Math.max(1, Number(base.xMax) - Number(base.xMin));
  const baseYRange = Math.max(1, Number(base.yMax) - Number(base.yMin));
  const xPad = Math.max(Number(base.xStep) || 0, baseXRange * 0.08, 0.5);
  const yPad = Math.max(Number(base.yStep) || 0, baseYRange * 0.08, 0.5);

  const expanded = {
    ...base,
    xMin: Math.min(Number(base.xMin), Math.min(...xs) < Number(base.xMin) ? Math.min(...xs) - xPad : Number(base.xMin)),
    xMax: Math.max(Number(base.xMax), Math.max(...xs) > Number(base.xMax) ? Math.max(...xs) + xPad : Number(base.xMax)),
    yMin: Math.min(Number(base.yMin), Math.min(...ys) < Number(base.yMin) ? Math.min(...ys) - yPad : Number(base.yMin)),
    yMax: Math.max(Number(base.yMax), Math.max(...ys) > Number(base.yMax) ? Math.max(...ys) + yPad : Number(base.yMax)),
  };
  const xRange = expanded.xMax - expanded.xMin;
  const yRange = expanded.yMax - expanded.yMin;
  const currentXStep = Number(base.xStep) || 1;
  const currentYStep = Number(base.yStep) || 1;
  if (xRange / currentXStep > 20) expanded.xStep = niceGridStep(xRange, currentXStep);
  if (yRange / currentYStep > 20) expanded.yStep = niceGridStep(yRange, currentYStep);
  return expanded;
};

const numericTablePoints = ({ stage, cells }) => {
  const columns = Array.isArray(stage.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const xValues = Array.isArray(stage.xValues) ? stage.xValues : [];
  return xValues.map((x, rowIndex) => {
    const rawY = cells?.[`${rowIndex}:${responseColumn}`];
    if (String(rawY ?? '').trim() === '') return null;
    const numericX = evaluateNumericValue(x);
    const y = evaluateNumericValue(rawY);
    return numericX !== null && y !== null ? [numericX, y] : null;
  }).filter(Boolean);
};

const checkTableAgainstFunctionSpec = ({ cells = {}, stage, functionSpec }) => {
  if (!functionSpec) return null;
  const columns = Array.isArray(stage.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const xValues = Array.isArray(stage.xValues) ? stage.xValues : [];
  const rows = [];
  xValues.forEach((x, rowIndex) => {
    const entered = cells?.[`${rowIndex}:${responseColumn}`];
    if (String(entered ?? '').trim() === '') return;
    const numericX = evaluateNumericValue(x);
    const expected = numericX === null ? Number.NaN : evaluateGraphFunction(functionSpec, numericX);
    const enteredNumber = evaluateNumericValue(entered);
    rows.push({
      x,
      entered,
      expected,
      matches: Number.isFinite(expected)
        ? (enteredNumber !== null && Math.abs(enteredNumber - expected) <= 1e-6)
        : null,
    });
  });
  const checked = rows.filter((row) => row.matches !== null);
  return {
    checked: checked.length,
    consistent: checked.length > 0 && checked.every((row) => row.matches),
    mismatches: checked.filter((row) => !row.matches),
    rows,
  };
};

const parseResponseKey = (payload) => {
  try {
    return JSON.parse(payload?.responseKey || '{}');
  } catch {
    return {};
  }
};

const tableArtifact = (payload, { stage, input, content }) => {
  const cells = parseResponseKey(payload);
  const sourceModel = typeof input?.value === 'string'
    ? input.value
    : input?.value?.sourceModel || null;
  const columns = Array.isArray(stage.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const sourceFunctionSpec = !sourceModel && content?.functionSpec ? content.functionSpec : null;
  const consistency = sourceModel
    ? checkTableConsistency({
      response: cells,
      xValues: Array.isArray(stage.xValues) ? stage.xValues : [],
      model: sourceModel,
      responseColumn,
    })
    : checkTableAgainstFunctionSpec({ cells, stage, functionSpec: sourceFunctionSpec });

  return {
    [WORKFLOW_ARTIFACT]: 'table',
    isComplete: Boolean(payload?.isComplete),
    cells,
    xValues: Array.isArray(stage.xValues) ? stage.xValues : [],
    points: numericTablePoints({ stage, cells }),
    sourceModel,
    sourceFunctionSpec,
    sourceChecked: consistency?.checked || 0,
    sourceConsistent: consistency ? consistency.consistent : null,
  };
};

const graphArtifact = (payload) => ({
  [WORKFLOW_ARTIFACT]: 'graph',
  isComplete: Boolean(payload?.isComplete),
  isCorrect: Boolean(payload?.isCorrect),
  responseKey: payload?.responseKey || '',
  parts: Array.isArray(payload?.parts) ? payload.parts : [],
});

const coordinateReadout = (stage, content) => (
  stage?.showCoordinates
  ?? stage?.graph?.showCoordinates
  ?? content?.graph?.showCoordinates
  ?? true
);

const MERGE_BASE_DELEGATES = { // adapter
  coordinatePlot: ({ stage, input, content }) => { // adapter
    const source = input?.from === 'student' ? input.value : null;
    const fromTable = source?.[WORKFLOW_ARTIFACT] === 'table' ? source.points : null;
    const equationPoints = typeof source === 'string'
      ? (Array.isArray(content?.tableXValues) && content.tableXValues.length ? content.tableXValues : [0, 1, 2, 3, 4])
        .map((x) => {
          const y = evaluateModelAt(source, Number(x));
          return y === null ? null : [Number(x), y];
        }).filter(Boolean)
      : [];
    const rawPairs = Array.isArray(fromTable) && fromTable.length
      ? fromTable
      : (equationPoints.length ? equationPoints : (stage.pairs || content?.pairs || []));
    const pairs = (Array.isArray(rawPairs) ? rawPairs : []).map((pair) => {
      if (Array.isArray(pair)) return [Number(pair[0]), Number(pair[1])];
      return [Number(pair?.x), Number(pair?.y)];
    }).filter((pair) => pair.every(Number.isFinite));
    const pointTasks = pairs.map((point, index) => ({
      id: `point-${index + 1}`,
      label: `P${index + 1}`,
      role: 'point',
      x: point[0],
      expected: point,
      lockedX: true,
    }));
    const magneticSnapTargets = source?.[WORKFLOW_ARTIFACT] === 'table'
      && source.isComplete
      && source.sourceConsistent !== false
      ? buildStudentTableMagneticTargets(pairs)
      : [];

    return { status: 'ready', question: { // adapter
      prompt: stage.prompt || '',
      graph: expandGraphWindowToPoints(stage.graph || content?.graph || { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, pairs),
      plotMode: 'points',
      pointOnly: true,
      pointTasks,
      stimulus: stage.stimulus || content?.stimulus,
      magneticSnapTargets,
      functionSpec: { type: 'expression', expression: '0', variable: 'x', referencePoints: pairs },
      showCoordinates: coordinateReadout(stage, content),
      requireEndpointMarkers: false,
    } }; // adapter
  },
  functionGraph: ({ stage, input, content }) => { // adapter
    const source = input?.from === 'student' ? input.value : null;
    const sourceIsTable = source?.[WORKFLOW_ARTIFACT] === 'table';
    const tablePoints = sourceIsTable && Array.isArray(source.points) ? source.points : [];
    const sourceModel = sourceIsTable ? source.sourceModel : (typeof source === 'string' ? source : null);
    const sourceFunctionSpec = sourceIsTable ? source.sourceFunctionSpec : null;
    const resolvedGraphMode = String(stage.resolvedGraphMode || stage.graphMode || 'continuous').toLowerCase();
    const pointOnly = resolvedGraphMode === 'discrete';
    const authoredGraphWindow = stage.graph || content?.graph || { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
    const points = tablePoints.length ? tablePoints : (() => {
      if (!sourceModel) return [];
      const xMin = Number(authoredGraphWindow.xMin);
      const xMax = Number(authoredGraphWindow.xMax);
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return [];
      const candidates = Array.from({ length: 5 }, (_, index) => xMin + (index / 4) * (xMax - xMin));
      return candidates.map((x) => {
        const y = evaluateModelAt(sourceModel, x);
        return y === null ? null : [Number(x.toFixed(6)), Number(y.toFixed(6))];
      }).filter(Boolean);
    })();
    const graphWindow = expandGraphWindowToPoints(authoredGraphWindow, points);
    const magneticSnapTargets = sourceIsTable
      && source.isComplete
      && source.sourceConsistent !== false
      ? buildStudentTableMagneticTargets(points)
      : [];

    if (sourceIsTable && (source.sourceModel || source.sourceFunctionSpec) && source.sourceChecked > 0 && source.sourceConsistent === false) {
      return { status: 'conflict', question: null }; // adapter
    }

    const fallbackFunctionSpec = sourceFunctionSpec || content?.functionSpec;
    const functionSpec = sourceModel
      ? buildExpressionFunctionSpec(sourceModel, { referencePoints: points, domain: stage.domainRestriction || null })
      : (fallbackFunctionSpec
        ? {
            ...fallbackFunctionSpec,
            ...(stage.domainRestriction ? { domain: stage.domainRestriction } : {}),
          }
        : null);

    if (!functionSpec) {
      return { status: 'unbuildable', question: null }; // adapter
    }

    return { status: 'ready', question: { // adapter
      prompt: stage.prompt || '',
      graph: graphWindow,
      functionSpec,
      equationLatex: sourceModel || undefined,
      graphAnswer: points.length ? { suggestedPoints: points } : undefined,
      magneticSnapTargets,
      showCoordinates: coordinateReadout(stage, content),
      studentChoosesX: false,
      pointOnly,
      plotMode: pointOnly ? 'points' : undefined,
      requireEndpointMarkers: mbWorkflowRequiresEndpointMarkers({ // adapter
        pointOnly,
        authored: stage.requireEndpointMarkers,
        domain: stage.domainRestriction,
      }),
    } }; // adapter
  },
};

// renderStage, for one graph stage: the effective stage, the input and the
// waiting rule, then the delegate.
const mergeBaseGraphStage = ({ stage, workflow, responses, content, grading }) => { // adapter
    const domainRestriction = stage.kind === 'functionGraph'
      ? mbWorkflowGraphDomainRestriction({ // adapter
          graphStage: stage,
          workflow,
          grading,
        })
      : null;
    const baseEffectiveStage = domainRestriction && !stage.domainRestriction
      ? { ...stage, domainRestriction }
      : stage;
    const effectiveStage = stage.continuityStageId
      ? {
          ...baseEffectiveStage,
          resolvedGraphMode: String(responses?.[stage.continuityStageId] || '').toLowerCase(),
        }
      : baseEffectiveStage;
    const input = resolveStageInput({ stage, responses, content });
    const continuityReady = !stage.continuityStageId || hasStageResponse(responses?.[stage.continuityStageId]);
    const waiting = (Boolean(stage.sourceStageId) && !input.ready) || !continuityReady;
  if (waiting) return { status: 'waiting', question: null }; // adapter
  return MERGE_BASE_DELEGATES[stage.kind]({ stage: effectiveStage, input, content }); // adapter
}; // adapter

/* MERGE-BASE PORT END */

const mergeBaseTable = ({ stage, cells, responses, content }) => {
  const input = resolveStageInput({ stage, responses, content });
  const { blanks } = tableLayoutOf(stage);
  const payload = {
    isComplete: gradeTableResponse({ table: { answers: {}, blanks } }, cells).isComplete,
    responseKey: JSON.stringify(cells),
  };
  return tableArtifact(payload, { stage, input, content });
};

/* ------------------------------------------------------------------------ *
 * What the runner records, now: TableGrader's report read by
 * readDelegateResponse.tableInput, and the workspace's report read by
 * readDelegateResponse.coordinatePlot / functionGraph.
 * ------------------------------------------------------------------------ */

function tableLayoutOf(stage) {
  const columns = Array.isArray(stage.columns) && stage.columns.length ? stage.columns : [{ key: 'x' }, { key: 'y' }];
  const responseColumn = stage.responseColumn || columns[columns.length - 1]?.key || 'y';
  const xValues = Array.isArray(stage.xValues) ? stage.xValues : [];
  return { responseColumn, xValues, blanks: xValues.map((_, row) => `${row}:${responseColumn}`) };
}

const runnerTable = ({ stage, cells, responses, content }) => {
  const input = resolveStageInput({ stage, responses, content });
  const { blanks } = tableLayoutOf(stage);
  return workflowTableArtifact({
    stage,
    cells,
    isComplete: gradeTableResponse({ table: { answers: {}, blanks } }, cells).isComplete,
    sourceModel: typeof input?.value === 'string' ? input.value : input?.value?.sourceModel || null,
    content,
  });
};

/* ------------------------------------------------------------------------ *
 * A student at the workspace: the component's own handlers (place, "Check
 * Point Placements", draw strokes until the sketch snaps, drop end markers),
 * over the state shape it keeps — the same driver the graph-workspace parity
 * test uses.
 * ------------------------------------------------------------------------ */

const VIEWBOX = Object.freeze({ width: 760, height: 540, padding: 56 });
const toScreen = (camera) => ([x, y]) => [
  VIEWBOX.padding + ((x - camera.xMin) / (camera.xMax - camera.xMin)) * (VIEWBOX.width - VIEWBOX.padding * 2),
  VIEWBOX.padding + ((camera.yMax - y) / (camera.yMax - camera.yMin)) * (VIEWBOX.height - VIEWBOX.padding * 2),
];
const capture = (points) => points.reduce((kept, point) => {
  const previous = kept[kept.length - 1];
  if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 3) kept.push(point);
  return kept;
}, []);
const cameraOf = (model, zoom = 0) => {
  let view = model.viewWindow;
  for (let index = 0; index < zoom; index += 1) {
    view = zoomedWindow({ from: view, authored: model.viewWindow, factor: 1 / 1.4, xStep: model.xGridStep, yStep: model.yGridStep });
  }
  return { xMin: Number(view.xMin), xMax: Number(view.xMax), yMin: Number(view.yMin), yMax: Number(view.yMax) };
};
const OTHER_MARKER = { open: 'closed', closed: 'open', arrow: 'open' };

/**
 * Build the graph in the workspace for `subQuestion`.
 *   misplace   a task id placed 2 units too high (the check then fails)
 *   check      press "Check Point Placements" (default true)
 *   sketch     'trace' | 'off' (traced 120 units low) | 'none'
 *   zoom       zoom steps before drawing
 *   markers    'right' | 'wrong' | 'none'
 */
const studentBuilds = (subQuestion, { misplace = null, check = true, sketch = 'trace', zoom = 0, markers = 'right' } = {}) => {
  const model = graphWorkspaceModelFor(subQuestion, { analysisMode: false });
  const chosenXValues = Object.fromEntries(model.tasks.filter((task) => Number.isFinite(Number(task.x))).map((task) => [task.id, String(task.x)]));
  const construction = { placements: {}, chosenXValues, pointsValidated: false, strokes: [], sketchView: null, snapped: false, markerPlacements: {} };
  model.tasks.forEach((task) => {
    const expected = resolveTaskExpected(task, model.functionSpec, chosenXValues);
    construction.placements[task.id] = task.id === misplace && Array.isArray(expected) ? [expected[0], expected[1] + 2] : expected;
  });
  if (check && placementsMatchTasks(model.tasks, construction.placements, model.pointTolerance, model.functionSpec, chosenXValues)) {
    construction.pointsValidated = true;
  }
  if (!model.pointOnly && construction.pointsValidated && sketch !== 'none') {
    const camera = cameraOf(model, zoom);
    const offset = sketch === 'off' ? 120 : 0;
    model.visiblePaths
      .map((path) => capture(path.map(toScreen(camera)).map(([x, y]) => [x, y + offset])))
      .filter((stroke) => stroke.length >= 2)
      .forEach((stroke) => {
        if (construction.snapped) return;
        construction.strokes = boundSketchStrokes([...construction.strokes, stroke], SKETCH_LIMITS.constructionPoints);
        construction.sketchView = { ...camera };
        construction.snapped = construction.strokes.length >= model.requiredStrokeCount
          && constructionSketchMatches(model, { strokes: construction.strokes, camera, chosenXValues });
      });
  }
  if (construction.snapped && markers !== 'none') {
    model.endpointRequirements.forEach((requirement) => {
      construction.markerPlacements[requirement.id] = {
        marker: markers === 'wrong' ? OTHER_MARKER[requirement.marker] : requirement.marker,
        point: requirement.point,
      };
    });
  }
  return {
    construction,
    analysis: { selections: {}, answers: {}, typedPoints: {}, noneSelections: {}, inversePointsValidated: false, inverseStrokes: [], inverseSketchView: null, inverseSnapped: false },
  };
};

/** What InteractiveGraphWorkspace reports for that state (its shared verdict). */
const workspaceReport = (subQuestion, state) => answerStateFromSharedGrading(
  gradeToolCheck(graphWorkspaceGrader, subQuestion, graphWorkspaceWorkFromState(state)),
  { questionDetails: '' },
);

/* ------------------------------------------------------------------------ *
 * Fixtures.
 * ------------------------------------------------------------------------ */

const selection = (points, none = false) => ({ [ARTIFACT]: 'featureSelection', feature: 'x', selections: points, none, isComplete: true });

// functionCharacteristics with no `ask`: the recipe default, plot first.
const FC = Object.freeze({
  type: 'functionCharacteristics',
  prompt: 'The table shows a function. Describe it.',
  recipe: 'functionCharacteristics',
  pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
  functionFamily: 'Quadratic',
  extreme: { kind: 'maximum' },
  correctDomain: 'all real numbers',
  correctRange: 'y <= 9',
});
const FC_ANSWERS = Object.freeze({
  right: {
    model: 'Quadratic', xInterceptExists: 'Yes', xIntercept: selection([[-1, 0], [5, 0]]),
    xInterceptValue: '(-1, 0), (5, 0)', zeros: '\\left\\{-1,5\\right\\}', yInterceptExists: 'Yes',
    yIntercept: selection([[0, 5]]), yInterceptValue: '(0, 5)', extremeKind: 'Maximum',
    extremePoint: selection([[2, 9]]), extremeValue: '(2, 9)', axisOfSymmetry: 'x = 2',
    asymptote: 'none', behavior: 'Increasing, then decreasing', domain: 'all real numbers', range: 'y \\le 9',
  },
  wrong: {
    model: 'Exponential', xInterceptExists: 'No', xIntercept: selection([[-1, 0]]), xInterceptValue: '(1, 0)',
    zeros: '{1}', yInterceptExists: 'No', yIntercept: selection([[0, 4]]), yInterceptValue: '(0, 4)',
    extremeKind: 'Minimum', extremePoint: selection([[2, 8]]), extremeValue: '(2, 8)', axisOfSymmetry: 'x = 3',
    asymptote: 'y = 0', behavior: 'Increasing everywhere', domain: 'x >= 0', range: 'y >= 9',
  },
});

// relationRepresentations with a plot step.
const RELATION_PLOT = Object.freeze({
  type: 'relationMapping',
  prompt: 'Study the relation {(-4, 1), (-2, 3), (1, 3), (3, 5)}.',
  pairs: [[-4, 1], [-2, 3], [1, 3], [3, 5]],
  recipe: { ask: ['mapping', 'plot', 'domain', 'range', 'isFunction'] },
});
const RELATION_ANSWERS = Object.freeze({
  right: { mapping: [[-4, 1], [-2, 3], [1, 3], [3, 5]], domain: '{-4, -2, 1, 3}', range: '{1, 3, 5}', isFunction: 'Yes' },
  wrong: { mapping: [[-4, 1], [-2, 3], [1, 4], [3, 5]], domain: '{-4, -2, 1}', range: '{1, 3, 5, 6}', isFunction: 'No' },
});

// functionModeling: table from the student's equation, graph from the table,
// a finite domain that needs closed end markers.
const MODELING = Object.freeze({
  type: 'relationshipModel',
  prompt: 'A plumber charges a $40 call-out fee plus $5 per hour, for at most 12 hours.',
  recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'table', 'graph', 'domain', 'range'] },
  quantities: [{ id: 't', label: 'Time (hours)' }, { id: 'c', label: 'Cost (dollars)' }],
  correctIndependentId: 't',
  correctDependentId: 'c',
  correctEquation: 'C(t)=5t+40',
  tableXValues: [0, 1, 2, 3],
  graph: { xMin: -1, xMax: 14, yMin: -10, yMax: 120, xStep: 1, yStep: 10 },
  correctDomain: '0 \\leq t \\leq 12',
  correctRange: '40 \\leq C \\leq 100',
  notation: 'inequality',
});
const MODELING_ANSWERS = Object.freeze({
  right: { quantities: { independent: 't', dependent: 'c' }, equation: 'C(t)=5t+40', domain: '0 \\leq t \\leq 12', range: '40 \\leq C \\leq 100' },
  wrong: { quantities: { independent: 'c', dependent: 't' }, equation: 'C(t)=4t+40', domain: 't \\geq 0', range: 'C \\geq 40' },
  // A different, valid model the table and graph can follow.
  equations: ['C(t)=5t+40', 'C(t)=40+5t', 'C(t)=4t+40', 'y=6x+30'],
});

// V5-compiled, through the real authoring path.
const compileV5 = (intent) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Graph stages', courseId: 'algebra1' },
  sections: [{ role: 'classwork', questions: [intent] }],
}).package.sections[0].questions[0];

// A relationship model asking continuity before the graph: functionModeling
// recipe, the graph's mode is the student's own discrete/continuous choice.
const V5_MODEL = compileV5({
  standard: 'A.3C',
  prompt: 'Build one model from the situation.',
  scenario: 'Water enters an empty container at 5 liters per minute for 10 minutes.',
  studentActions: ['identifyQuantities', 'writeEquation', 'completeTable', 'constructGraph', 'stateDomain', 'stateRange', 'classifyContinuity'],
  quantities: [{ id: 'time', label: 'Time' }, { id: 'water', label: 'Water' }],
  correctIndependentId: 'time',
  correctDependentId: 'water',
  answerModel: { equation: 'W(t)=5t', tableXValues: [0, 1, 2, 3], domain: '0<=t<=10', range: '0<=W<=50', continuity: 'continuous' },
});
// An explicit workflow: equation -> table -> functionGraph -> domain.
const V5_GRAPH = compileV5({
  standard: 'A.3C',
  prompt: 'Write the rule, fill the table, graph it and give the domain.',
  studentActions: ['writeEquation', 'completeTable', 'constructGraph', 'stateDomain'],
  function: { family: 'linear', m: 2, b: 1 },
  answerModel: { equation: 'y=2x+1', tableXValues: [0, 1, 2, 3], domain: '0 <= x <= 3' },
});
// An explicit workflow with a coordinatePlot (a discrete relation).
const V5_PLOT = compileV5({
  standard: 'A.3C',
  prompt: 'Tickets cost $5 each. Write the rule, fill the table, plot it and give the domain.',
  studentActions: ['writeEquation', 'completeTable', 'constructGraph', 'stateDomain'],
  function: { family: 'linear', m: 5, b: 0 },
  graph: { xMin: -1, xMax: 6, yMin: -5, yMax: 30, yStep: 5 },
  answerModel: { equation: 'y=5x', tableXValues: [0, 1, 2, 3], domain: '{0,1,2,3}', continuity: 'discrete' },
});
// A table checked against the authored function (no equation), then a graph
// of that function; a graph with no source and no rule.
const V5_KEYED = compileV5({
  standard: 'A.3C',
  prompt: 'Complete the table, then graph the function and state its range.',
  studentActions: ['completeTable', 'constructGraph', 'stateRange'],
  function: { family: 'linear', m: -1, b: 4 },
  answerModel: { tableXValues: [0, 1, 2, 3] },
});
const V5_UNSOURCED = compileV5({
  standard: 'A.3C',
  prompt: 'Graph the function on its domain, then state the domain and range.',
  studentActions: ['constructGraph', 'stateDomain', 'stateRange'],
  function: { family: 'linear', m: 2, b: 1, domain: { min: 0, max: 5 } },
});

const GRAPH_FIXTURES = Object.freeze({ FC, RELATION_PLOT, MODELING, V5_MODEL, V5_GRAPH, V5_PLOT, V5_KEYED, V5_UNSOURCED });

/* ------------------------------------------------------------------------ *
 * Playing a workflow: every stage the student reaches, in order, recorded
 * twice — as the runner records it now, and as the merge-base runner did.
 * ------------------------------------------------------------------------ */

const studentModelFor = (question, responses) => {
  const equation = responses.equation;
  return typeof equation === 'string' && equation ? equation : null;
};

/**
 * `choose(stage, { responses, content })` returns the student's action:
 *   { value }                 a plain response
 *   { cells }                 a table, filled with these cells
 *   { build: options }        a graph, built with studentBuilds(options)
 *   null                      skipped
 */
const playWorkflow = (question, choose) => {
  const { workflow, content, grading } = readComposedQuestion(question);
  const now = {};
  const before = {};
  const graphs = {};
  workflow.forEach((stage) => {
    if (!activeStages(workflow, now).some((entry) => entry.id === stage.id)) return;
    const action = choose(stage, { responses: now, content });
    if (!action) return;
    if ('cells' in action) {
      now[stage.id] = runnerTable({ stage, cells: action.cells, responses: now, content });
      before[stage.id] = mergeBaseTable({ stage, cells: action.cells, responses: before, content });
      return;
    }
    if ('build' in action) {
      const fresh = resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(now) }).get(stage.id);
      const old = mergeBaseGraphStage({ stage, workflow: activeStages(workflow, before), responses: before, content, grading });
      graphs[stage.id] = { fresh, old };
      if (fresh?.status !== 'ready' || old.status !== 'ready') return;
      const state = studentBuilds(fresh.question, action.build);
      now[stage.id] = workflowGraphArtifact(workspaceReport(fresh.question, state));
      const oldReport = workspaceReport(old.question, state);
      before[stage.id] = graphArtifact({ ...oldReport, responseKey: JSON.stringify(state) });
      return;
    }
    now[stage.id] = action.value;
    before[stage.id] = action.value;
  });
  return { now, before, graphs, workflow, content, grading };
};

const cellsFor = (stage, evaluate, { wrongRow = null, blankRow = null } = {}) => {
  const { responseColumn, xValues } = tableLayoutOf(stage);
  return Object.fromEntries(xValues.flatMap((x, row) => {
    if (row === blankRow) return [];
    const y = evaluate(Number(x));
    const value = row === wrongRow ? Number(y) + 1 : y;
    return [[`${row}:${responseColumn}`, Number.isFinite(Number(value)) ? String(Number(value)) : 'oops']];
  }));
};

/** The whole question answered correctly. */
const rightPlay = (question, { build = {} } = {}) => playWorkflow(question, (stage, { responses, content }) => {
  if (stage.kind === 'coordinatePlot' || stage.kind === 'functionGraph') return { build };
  if (stage.kind === 'tableInput') {
    const model = studentModelFor(question, responses);
    if (model) return { cells: cellsFor(stage, (x) => evaluateModelAt(model, x)) };
    return { cells: cellsFor(stage, (x) => evaluateGraphFunction(content.functionSpec, x)) };
  }
  return { value: rightValue(question, stage) };
});

function rightValue(question, stage) {
  const { grading } = readComposedQuestion(question);
  // By prompt, so a variant of a fixture (an authored rule, an altered key)
  // is answered the same way.
  const answers = question.prompt === FC.prompt ? FC_ANSWERS.right
    : question.prompt === RELATION_PLOT.prompt ? RELATION_ANSWERS.right
      : question.prompt === MODELING.prompt ? MODELING_ANSWERS.right
        : {};
  if (stage.id in answers) return answers[stage.id];
  const rule = grading?.[stage.id];
  if (stage.kind === 'quantityRoles' && rule) return { ...rule };
  if (typeof rule === 'string') return rule;
  if (stage.kind === 'classification') return stage.choices?.[0];
  return 'my answer';
}

/* ------------------------------------------------------------------------ *
 * The paths.
 * ------------------------------------------------------------------------ */

/** Browser Check vs server ingestion over the serialized response: identical. */
const bothPaths = (question, responses) => {
  const { workflow } = readComposedQuestion(question);
  const work = composedWorkflowWork(upgradeLegacyGraphResponses(responses));
  const browser = gradeComposedWorkflowCheck(question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.reason, browser.reason ?? null, 'reason');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  return { browser, server, workflow };
};

/** What WorkflowRunner reports to QuestionEngine for these responses. */
const runnerState = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return buildWorkflowAnswerState({ question, stages: activeStages(workflow, responses), responses, grading });
};

/** The merge-base device marking, on the merge-base runner's responses. */
const mergeBaseMarking = (question, before) => {
  const { workflow, grading } = readComposedQuestion(question);
  return gradeWorkflow({ stages: activeStages(workflow, before), responses: before, grading });
};

const partSummary = (parts) => parts.map((part) => ({
  id: part.id,
  graded: part.graded !== false,
  isComplete: part.isComplete,
  isCorrect: part.isCorrect,
  credit: Number.isFinite(Number(part.credit)) ? Number(part.credit) : (part.isCorrect ? 1 : 0),
  weight: part.weight,
}));

const verdicts = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.graded === false ? 'ungraded' : part.isCorrect]));

/**
 * The full parity check for one played workflow: both paths agree, the runner
 * reports what the server records, and — for honest work — the marking is the
 * merge-base device's, stage by stage.
 */
const assertParity = (question, played, label) => {
  const { browser, server } = bothPaths(question, played.now);
  const state = runnerState(question, played.now);
  const recorded = attemptInputsFromGrading(server);
  assert.equal(server.graded, true, `${label}: ${server.reason}`);
  assert.equal(state.isCorrect, recorded.isCorrect, `${label}: runner isCorrect`);
  assert.equal(state.isComplete, server.isComplete, `${label}: runner isComplete`);
  assert.equal(state.partialCreditPercent, recorded.partialCreditPercent, `${label}: runner partial credit`);
  assert.deepEqual(state.parts, recorded.parts, `${label}: runner parts`);
  assert.equal(state.toolResponse.value, browser.toolResponse.value, `${label}: the attempt carries the bytes the server read`);

  const old = mergeBaseMarking(question, played.before);
  assert.equal(server.isCorrect, old.isCorrect, `${label}: merge-base isCorrect`);
  assert.equal(server.isComplete, old.isComplete, `${label}: merge-base isComplete`);
  assert.equal(recorded.partialCreditPercent, old.partialCreditPercent ?? 0, `${label}: merge-base partial credit`);
  assert.deepEqual(partSummary(server.parts), partSummary(old.parts), `${label}: merge-base parts`);
  return { server, state, old };
};

/* ======================================================================== *
 * Declaration and routing.
 * ======================================================================== */

test('workflows with graph-construction stages are server-graded, and resolve to the mode WorkflowRunner renders', () => {
  const expected = {
    FC: ['recipe:functionCharacteristics', ['coordinatePlot']],
    RELATION_PLOT: ['recipe:relationRepresentations', ['coordinatePlot']],
    MODELING: ['recipe:functionModeling', ['functionGraph']],
    V5_MODEL: ['recipe:functionModeling', ['functionGraph']],
    V5_GRAPH: ['workflow', ['functionGraph']],
    V5_PLOT: ['workflow', ['coordinatePlot']],
    V5_KEYED: ['workflow', ['functionGraph']],
    V5_UNSOURCED: ['workflow', ['functionGraph']],
  };
  Object.entries(GRAPH_FIXTURES).forEach(([name, question]) => {
    const { composed, workflow } = readComposedQuestion(question);
    assert.equal(composed, true, `${name}: WorkflowRunner renders it`);
    assert.deepEqual(workflow.filter((stage) => ['coordinatePlot', 'functionGraph'].includes(stage.kind)).map((stage) => stage.kind), expected[name][1], name);
    assert.equal(resolveGradingSurfaceId(question), 'composedWorkflow', name);
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, true, `${name}: ${support.reason}`);
    assert.equal(support.authority, GRADING_AUTHORITY.SHARED_SERVER, name);
    assert.equal(support.mode, expected[name][0], name);
    assert.equal(composedWorkflowSupport(question).supported, true, name);
  });
});

test('each graph stage is a workspace in the view WorkflowRunner mounts: points-only for a plot or a discrete choice, construct otherwise', () => {
  // WorkflowRunner mounts every graph stage with mode="construct" (never the
  // analysis view), and the workspace picks points-only from the sub-question.
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  const delegates = region(runner, '  coordinatePlot: ({ graphStage, onChange, draftKey }) => {', '  algebraWorkspace:', 'graph delegates');
  assert.equal((delegates.match(/<InteractiveGraphWorkspace\s+question=\{graphStage\.question\}\s+mode="construct"/g) || []).length, 2);

  const modeOf = (question, stageId, responses) => {
    const played = responses || rightPlay(question).now;
    const { workflow, content, grading } = readComposedQuestion(question);
    const resolution = resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(played) }).get(stageId);
    return resolveGraphWorkspaceMode(resolution.question);
  };
  assert.equal(modeOf(FC, 'plot'), 'pointOnly');
  assert.equal(modeOf(RELATION_PLOT, 'plot'), 'pointOnly');
  assert.equal(modeOf(V5_PLOT, 'graph'), 'pointOnly');
  assert.equal(modeOf(MODELING, 'graph'), 'construct');
  assert.equal(modeOf(V5_GRAPH, 'graph'), 'construct');
  // The student's continuity choice decides it.
  const discrete = playWorkflow(V5_MODEL, (stage, { responses }) => (stage.id === 'continuity'
    ? { value: 'discrete' }
    : (stage.kind === 'tableInput' ? { cells: cellsFor(stage, (x) => evaluateModelAt(responses.equation, x)) } : (stage.kind === 'functionGraph' ? null : { value: rightValue(V5_MODEL, stage) }))));
  assert.equal(modeOf(V5_MODEL, 'graph', discrete.now), 'pointOnly');
  assert.equal(modeOf(V5_MODEL, 'graph'), 'construct');
});

/* ======================================================================== *
 * Correct work.
 * ======================================================================== */

test('fully correct work is correct, complete and scores 1 on both paths, exactly as the merge-base device marked it', () => {
  Object.entries(GRAPH_FIXTURES).forEach(([name, question]) => {
    const played = rightPlay(question);
    Object.entries(played.graphs).forEach(([stageId, { fresh, old }]) => {
      // The sub-question is the one the merge-base runner rendered.
      assert.equal(fresh.status, 'ready', `${name}/${stageId}`);
      assert.deepEqual(fresh.question, old.question, `${name}/${stageId}: the same graph`);
    });
    const { server } = assertParity(question, played, name);
    const graphIds = Object.keys(played.graphs);
    graphIds.forEach((stageId) => {
      const part = server.parts.find((entry) => entry.id === stageId);
      assert.equal(part.isComplete, true, `${name}/${stageId} complete`);
      if (part.graded !== false) assert.equal(part.isCorrect, true, `${name}/${stageId} correct`);
    });
    const unkeyedOnly = server.parts.every((part) => part.graded === false || part.isCorrect);
    assert.equal(unkeyedOnly, true, `${name}: ${JSON.stringify(verdicts(server))}`);
    assert.equal(server.isComplete, true, name);
  });
  // With every graded stage right, the question is right.
  ['FC', 'MODELING', 'V5_MODEL', 'V5_GRAPH', 'V5_PLOT'].forEach((name) => {
    const { server } = assertParity(GRAPH_FIXTURES[name], rightPlay(GRAPH_FIXTURES[name]), name);
    assert.equal(server.isCorrect, true, `${name}: ${JSON.stringify(verdicts(server))}`);
    assert.equal(server.score, 1, name);
  });
});

/* ======================================================================== *
 * Incorrect, partial, unfinished — and equivalent forms.
 * ======================================================================== */

/** functionModeling with the student's own equation, a table that follows it, and a graph built with `build`. */
const modelingPlay = ({ equation = 'C(t)=5t+40', build = {}, table = {}, others = MODELING_ANSWERS.right } = {}) => playWorkflow(MODELING, (stage, { responses }) => {
  if (stage.id === 'equation') return { value: equation };
  if (stage.kind === 'tableInput') return { cells: cellsFor(stage, (x) => evaluateModelAt(responses.equation, x), table) };
  if (stage.kind === 'functionGraph') return build === null ? null : { build };
  return { value: others[stage.id] };
});

test('a graph with the wrong end markers is complete and wrong; the rest keeps its credit, held at 90', () => {
  const played = modelingPlay({ build: { markers: 'wrong' } });
  const { server } = assertParity(MODELING, played, 'wrong markers');
  const graph = server.parts.find((part) => part.id === 'graph');
  assert.deepEqual([graph.isComplete, graph.isCorrect, graph.credit], [true, false, 0]);
  assert.equal(server.isComplete, true);
  assert.equal(server.isCorrect, false);
  // Five of six stages right: 83%.
  assert.equal(attemptInputsFromGrading(server).partialCreditPercent, 83);
});

test('an unfinished graph is graded but incomplete: points not committed, no sketch, a sketch that never snapped, ends unmarked', () => {
  [
    ['a point misplaced, so "Check Point Placements" never passes', { misplace: 'point-2' }],
    ['points placed but never checked', { check: false }],
    ['no sketch', { sketch: 'none' }],
    ['a sketch that never snapped', { sketch: 'off' }],
    ['the ends left unmarked', { markers: 'none' }],
  ].forEach(([label, build]) => {
    const { server } = assertParity(MODELING, modelingPlay({ build }), label);
    const graph = server.parts.find((part) => part.id === 'graph');
    assert.deepEqual([graph.isComplete, graph.isCorrect, graph.credit], [false, false, 0], label);
    assert.equal(server.isComplete, false, label);
    assert.equal(server.isCorrect, false, label);
  });
  // The plot of a function-characteristics question the same way.
  const { server } = assertParity(FC, rightPlay(FC, { build: { misplace: 'point-3' } }), 'FC misplaced');
  assert.deepEqual([server.parts[0].id, server.parts[0].isComplete, server.parts[0].isCorrect], ['plot', false, false]);
  // Never built at all.
  const skipped = assertParity(MODELING, modelingPlay({ build: null }), 'graph skipped').server;
  assert.equal(skipped.parts.find((part) => part.id === 'graph').isComplete, false);
});

test('a graph is marked against the student\'s OWN model and table, as on the device', () => {
  // A wrong equation, a table that follows it, and the graph of that table:
  // the equation is wrong, the table and the graph are right.
  const own = modelingPlay({ equation: 'C(t)=4t+40' });
  const { server } = assertParity(MODELING, own, 'own model');
  assert.deepEqual(
    { equation: verdicts(server).equation, table: verdicts(server).table, graph: verdicts(server).graph },
    { equation: false, table: true, graph: true },
  );
  // A table that disagrees with the equation has no single graph: the runner
  // shows the conflict, no workspace is built, and the stage is unanswered.
  const conflict = modelingPlay({ table: { wrongRow: 1 } });
  assert.equal(conflict.graphs.graph.fresh.status, 'conflict');
  assert.equal(conflict.graphs.graph.old.status, 'conflict');
  const marked = assertParity(MODELING, conflict, 'conflict').server;
  assert.deepEqual([verdicts(marked).table, marked.parts.find((part) => part.id === 'graph').isComplete], [false, false]);
});

test('equivalent valid forms are accepted: a rearranged equation, a zoomed-in sketch, a graph within tolerance', () => {
  assert.equal(assertParity(MODELING, modelingPlay({ equation: 'C(t)=40+5t' }), 'rearranged').server.isCorrect, true);
  assert.equal(assertParity(MODELING, modelingPlay({ build: { zoom: 2 } }), 'zoomed').server.isCorrect, true);
  assert.equal(assertParity(V5_GRAPH, rightPlay(V5_GRAPH, { build: { zoom: 1 } }), 'V5 zoomed').server.isCorrect, true);
  // Placements off by less than the point tolerance still commit and count.
  const { workflow, content, grading } = readComposedQuestion(FC);
  const played = rightPlay(FC);
  const subQuestion = resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(played.now) }).get('plot').question;
  const state = studentBuilds(subQuestion);
  Object.keys(state.construction.placements).forEach((id) => {
    const [x, y] = state.construction.placements[id];
    state.construction.placements[id] = [x, y + 0.2];
  });
  const nudged = { ...played.now, plot: workflowGraphArtifact(workspaceReport(subQuestion, state)) };
  const { server } = bothPaths(FC, nudged);
  assert.equal(verdicts(server).plot, true);
});

test('partial credit is the workflow\'s own: a right graph beside wrong stages', () => {
  const played = modelingPlay({ others: { ...MODELING_ANSWERS.right, quantities: MODELING_ANSWERS.wrong.quantities, range: 'C \\geq 40' } });
  const { server } = assertParity(MODELING, played, 'partial');
  assert.equal(verdicts(server).graph, true);
  assert.equal(server.isCorrect, false);
  assert.equal(attemptInputsFromGrading(server).partialCreditPercent, 67);
});

/* ======================================================================== *
 * Tampered and malformed work: the stage is re-marked, never believed.
 * ======================================================================== */

test('a forged verdict on the graph artifact is never read: no work, no credit', () => {
  const honest = modelingPlay();
  const forged = {
    ...honest.now,
    graph: { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, partialCreditPercent: 100, parts: [{ id: 'point-1', isCorrect: true }], responseKey: 'not the work' },
  };
  // The claim never becomes work...
  assert.deepEqual(composedWorkflowStageWork(forged.graph), { [ARTIFACT]: 'graph', isComplete: true });
  const { server } = bothPaths(MODELING, forged);
  const graph = server.parts.find((part) => part.id === 'graph');
  assert.deepEqual([graph.isComplete, graph.isCorrect, graph.credit], [false, false, 0]);
  assert.equal(server.isCorrect, false);
  // ...and on the device it would have been believed.
  assert.equal(verdicts(mergeBaseMarking(MODELING, { ...honest.before, graph: forged.graph })).graph, true);

  // Sent straight to the server, verdicts beside real (empty) work are dropped.
  const work = composedWorkflowWork(honest.now);
  const injected = { responses: { ...work.responses, graph: { ...work.responses.graph, isCorrect: true, score: 1, construction: { ...work.responses.graph.construction, placements: {}, expected: [[0, 40]] } } } };
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['expected', 'isCorrect', 'score']);
  assert.equal(gradeComposedWorkflowCheck(MODELING, injected).parts.find((part) => part.id === 'graph').isCorrect, false);
});

test('a forged commit (pointsLocked, sketchLocked) on wrong placements earns nothing', () => {
  const honest = modelingPlay();
  const work = workflowGraphStageWork(honest.now.graph);
  const wrongPlacements = Object.fromEntries(Object.entries(work.construction.placements).map(([id, [x, y]]) => [id, [x, y + 3]]));
  const forged = {
    ...honest.now,
    graph: { ...honest.now.graph, isCorrect: true, construction: { ...work.construction, placements: wrongPlacements, pointsLocked: true, sketchLocked: true } },
  };
  const graph = bothPaths(MODELING, forged).server.parts.find((part) => part.id === 'graph');
  assert.deepEqual([graph.isComplete, graph.isCorrect], [false, false]);
});

test('a classmate\'s graph does not fit this student\'s table: the sub-question is rebuilt from THIS student\'s work', () => {
  const classmate = modelingPlay({ equation: 'C(t)=4t+40' });
  const student = modelingPlay();
  // Same question, same authored key; the classmate wrote 4t + 40, this
  // student 5t + 40. The classmate's correct graph, sent as this student's:
  const copied = { ...student.now, graph: classmate.now.graph };
  const graph = bothPaths(MODELING, copied).server.parts.find((part) => part.id === 'graph');
  assert.equal(graph.isCorrect, false);
  assert.equal(graph.isComplete, false);
  assert.equal(verdicts(bothPaths(MODELING, classmate.now).server).graph, true, 'it is right for the classmate');
});

test('what a graph is built from is rebuilt from the cells, never from points or a consistency flag the work claims', () => {
  // A table that disagrees with the equation (row 1), claiming it agrees and
  // carrying the points of a consistent table.
  const consistent = modelingPlay();
  const disagreeing = modelingPlay({ table: { wrongRow: 1 } });
  const forgedTable = {
    ...disagreeing.now.table,
    points: consistent.now.table.points,
    sourceConsistent: true,
    sourceChecked: 4,
    sourceFunctionSpec: { type: 'linear', m: 0, b: 0 },
    sourceModel: '0',
  };
  const forged = { ...disagreeing.now, table: forgedTable, graph: consistent.now.graph };
  const { workflow, content, grading } = readComposedQuestion(MODELING);
  const resolution = resolveWorkflowGraphStages({ workflow, content, grading, responses: composedWorkflowWork(forged).responses }).get('graph');
  assert.equal(resolution.status, 'conflict', 'rebuilt from the cells and the student\'s equation');
  const { server } = bothPaths(MODELING, forged);
  assert.equal(server.parts.find((part) => part.id === 'graph').isComplete, false);
  assert.equal(verdicts(server).table, false);
  // The forged fields never even travel from this client...
  const table = composedWorkflowWork(forged).responses.table;
  ['points', 'sourceConsistent', 'sourceChecked', 'sourceFunctionSpec'].forEach((key) => assert.equal(key in table, false, key));
  // ...and a client that sends them anyway (the work as it reaches ingestion,
  // never passed through composedWorkflowWork) gains nothing: the server's
  // view of the table is still rebuilt from its cells.
  const direct = { responses: { ...composedWorkflowWork(forged).responses, table: forgedTable } };
  assert.equal(boundToolWork(direct).work.responses.table.sourceConsistent, true, 'the forged fields do reach the server');
  assert.equal(resolveWorkflowGraphStages({ workflow, content, grading, responses: direct.responses }).get('graph').status, 'conflict');
  const directCheck = gradeComposedWorkflowCheck(MODELING, direct);
  const directServer = gradeServerResponse({ question: MODELING, response: JSON.parse(JSON.stringify(directCheck.toolResponse)) });
  [directCheck, directServer].forEach((result) => {
    assert.equal(result.graded, true);
    assert.deepEqual([result.parts.find((part) => part.id === 'graph').isComplete, verdicts(result).graph], [false, false]);
  });
});

test('malformed graph work never crashes and never earns credit', () => {
  const honest = modelingPlay();
  [
    'graph',
    42,
    ['construction'],
    { [ARTIFACT]: 'graph', construction: 'everything' },
    { [ARTIFACT]: 'graph', construction: { placements: [1, 2, 3], strokes: 'many', pointsLocked: 'yes', markerPlacements: { 'endpoint-min': 7 } }, analysis: 9 },
    { [ARTIFACT]: 'graph', construction: { placements: { 'point-1': ['a', 'b'], __proto__: { polluted: true } } } },
    { [ARTIFACT]: 'table', cells: {} },
    { construction: workflowGraphStageWork(honest.now.graph).construction },
  ].forEach((graph) => {
    const { server } = bothPaths(MODELING, { ...honest.now, graph });
    assert.equal(server.graded, true, JSON.stringify(graph));
    const part = server.parts.find((entry) => entry.id === 'graph');
    assert.equal(part.isCorrect, false, JSON.stringify(graph));
    assert.equal(server.isCorrect, false);
  });
  assert.equal({}.polluted, undefined);
});

/* ======================================================================== *
 * Unauthored defaults, discrimination.
 * ======================================================================== */

test('unauthored defaults: no window, no graph rule, no ask', () => {
  // No authored window: the default plane, widened to the student's points.
  const plot = rightPlay(RELATION_PLOT).graphs.plot.fresh.question;
  assert.deepEqual([plot.graph.xMin, plot.graph.xMax, plot.graph.yMin, plot.graph.yMax], [-10, 10, -10, 10]);
  // No rule for the graph (an unsourced V5 graph): reported ungraded, never
  // wrong, but it must still be built for the question to be complete.
  const built = assertParity(V5_UNSOURCED, rightPlay(V5_UNSOURCED), 'unsourced').server;
  const graph = built.parts.find((part) => part.id === 'graph');
  assert.deepEqual([graph.graded, graph.isComplete], [false, true]);
  const unbuilt = assertParity(V5_UNSOURCED, rightPlay(V5_UNSOURCED, { build: { check: false } }), 'unsourced, unbuilt').server;
  assert.equal(unbuilt.parts.find((part) => part.id === 'graph').isComplete, false);
  assert.equal(unbuilt.isComplete, false);
  // No `ask`: the recipe's default steps, the plot first (covered by FC).
  assert.equal(readComposedQuestion(FC).workflow[0].kind, 'coordinatePlot');
});

test('discrimination: the same correct graph fails against an altered key', () => {
  const played = rightPlay(FC);
  const movedPair = { ...FC, pairs: [[-1, 0], [0, 5], [2, 9], [4, 6], [5, 0]] };
  assert.equal(verdicts(bothPaths(FC, played.now).server).plot, true);
  assert.equal(verdicts(bothPaths(movedPair, played.now).server).plot, false);

  const modeled = modelingPlay();
  const shorterDomain = { ...MODELING, correctDomain: '0 \\leq t \\leq 10' };
  assert.equal(verdicts(bothPaths(MODELING, modeled.now).server).graph, true);
  assert.equal(verdicts(bothPaths(shorterDomain, modeled.now).server).graph, false, 'the graph must end where the domain does');
});

/* ======================================================================== *
 * Drafts saved before this change.
 * ======================================================================== */

test('an old draft\'s graph artifact is upgraded from the workspace state it carries, and marked as the device marked it', () => {
  [
    ['MODELING', MODELING, modelingPlay()],
    ['MODELING wrong ends', MODELING, modelingPlay({ build: { markers: 'wrong' } })],
    ['MODELING unfinished', MODELING, modelingPlay({ build: { sketch: 'none' } })],
    ['FC', FC, rightPlay(FC)],
  ].forEach(([label, question, played]) => {
    // The merge-base runner stored { isComplete, isCorrect, responseKey:
    // JSON of the workspace's undo state, parts } — `played.before`.
    const legacy = { ...played.now };
    Object.keys(played.graphs).forEach((stageId) => { legacy[stageId] = played.before[stageId]; });
    const upgraded = upgradeLegacyGraphResponses(legacy);
    Object.keys(played.graphs).forEach((stageId) => {
      assert.deepEqual(workflowGraphStageWork(upgraded[stageId]), workflowGraphStageWork(played.now[stageId]), `${label}: the same work`);
    });
    // The runner and the server mark the old draft exactly as the new artifact.
    const fromLegacy = runnerState(question, legacy);
    const fromNew = runnerState(question, played.now);
    assert.equal(fromLegacy.toolResponse.value, fromNew.toolResponse.value, label);
    assert.equal(fromLegacy.isCorrect, fromNew.isCorrect, label);
    assert.equal(fromLegacy.partialCreditPercent, fromNew.partialCreditPercent, label);
    // ...which is the merge-base device's marking of that same draft.
    assert.equal(fromLegacy.isCorrect, mergeBaseMarking(question, played.before).isCorrect, label);
  });
  // A draft from the graph-workspace contract's first version (its canonical
  // work as the responseKey) is read as the work it already is.
  const played = modelingPlay();
  const canonical = { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, responseKey: JSON.stringify(workflowGraphStageWork(played.now.graph)), parts: [] };
  assert.deepEqual(workflowGraphStageWork(upgradeLegacyGraphArtifact(canonical)), workflowGraphStageWork(played.now.graph));
});

test('an old artifact that cannot be read is unanswered — never correct, never silently wrong', () => {
  const played = modelingPlay();
  [
    { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, responseKey: '', parts: [] },
    { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, responseKey: '{"construction":"lost"', parts: [] },
    { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, responseKey: '[1,2,3]', parts: [] },
  ].forEach((graph) => {
    assert.equal(upgradeLegacyGraphArtifact(graph), graph, 'left as it was');
    const state = runnerState(MODELING, { ...played.now, graph });
    const part = state.parts.find((entry) => entry.id === 'graph');
    assert.deepEqual([part.isComplete, part.isCorrect], [false, false]);
    assert.equal(state.isComplete, false, 'so a deadline never auto-submits it');
  });
  // The server never upgrades anything. An old artifact that reached it as
  // work carries no construction, so the stage is unanswered...
  const asWork = { responses: { ...composedWorkflowWork(played.now).responses, graph: composedWorkflowStageWork(played.before.graph) } };
  assert.deepEqual(asWork.responses.graph, { [ARTIFACT]: 'graph', isComplete: true });
  const marked = gradeComposedWorkflowCheck(MODELING, asWork);
  assert.deepEqual([marked.parts.find((part) => part.id === 'graph').isComplete, marked.isCorrect], [false, false]);
  // ...and the raw old artifact sent as work (its state as a JSON string, in
  // a stage a consistency rule reads) is not marked at all.
  const raw = gradeComposedWorkflowCheck(MODELING, { responses: { ...asWork.responses, graph: played.before.graph } });
  assert.deepEqual([raw.graded, raw.reason], [false, 'unsafe-expression']);
});

/* ======================================================================== *
 * Bounds.
 * ======================================================================== */

test('realistic maximal work fits the response limits; oversize work is never marked', () => {
  // Twenty table rows, every text stage at the 1,000-character cap, and the
  // longest freehand sketch the workspace keeps (40 strokes, thinned to 960
  // points) with both end markers.
  const rows = Array.from({ length: 20 }, (_, index) => index);
  const big = {
    ...MODELING,
    recipe: { name: 'functionModeling', ask: ['quantities', 'equation', 'table', 'graph', 'domain', 'domainWords', 'range', 'rangeWords', 'interpretation'] },
    tableXValues: rows,
  };
  const played = playWorkflow(big, (stage, { responses }) => {
    if (stage.kind === 'tableInput') return { cells: cellsFor(stage, (x) => evaluateModelAt(responses.equation, x)) };
    if (stage.kind === 'functionGraph') return { build: {} };
    if (['interpretation', 'shortResponse'].includes(stage.kind)) return { value: 'w'.repeat(1000) };
    return { value: MODELING_ANSWERS.right[stage.id] ?? 'x'.repeat(1000) };
  });
  const work = workflowGraphStageWork(played.now.graph);
  const scribble = Array.from({ length: 40 }, (_, stroke) => Array.from({ length: 240 }, (_, index) => [700 - index * 2.5, 480 - stroke * 9 - (index % 7)]));
  const maximal = {
    ...played.now,
    graph: { ...played.now.graph, construction: { ...work.construction, strokes: boundSketchStrokes([...scribble, ...work.construction.strokes], SKETCH_LIMITS.constructionPoints) } },
  };
  const json = canonicalToolWorkJson(composedWorkflowWork(maximal));
  const strokesJson = JSON.stringify(maximal.graph.construction.strokes).length;
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${json.length} chars`);
  assert.ok(strokesJson > 8_000, `the sketch alone is ${strokesJson} chars`);
  const bounded = boundToolWork(composedWorkflowWork(maximal));
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  bothPaths(big, maximal);

  // THE EXPLICIT DECISION FOR THE EXTREME CASE. Measured: an honest snapped
  // sketch is ~120 points (~1,200 chars) and a whole honest workflow ~5,400;
  // the longest sketch the workspace keeps (960 points, already thinned by it,
  // SKETCH_LIMITS) is ~9,700, and this workflow with it and every text answer
  // at its cap ~13,900. A hand-authored workflow with TWO graph stages each
  // holding that sketch fits beside ordinary answers (~21,500) but not beside
  // every text answer at the 1,000-character cap (~24,200): that response is
  // refused as oversize on both paths — no verdict, never a wrong one; the
  // runner records no attempt and the student is told the work was saved but
  // not checked. Thinning further would change the sketch check the student
  // saw, so the strokes travel exactly as the workspace marked them.
  const twoMaximalGraphs = { ...maximal, graph2: maximal.graph };
  assert.ok(canonicalToolWorkJson(composedWorkflowWork(twoMaximalGraphs)).length > TOOL_RESPONSE_LIMITS.maxJsonLength);
  assert.equal(gradeComposedWorkflowCheck(big, composedWorkflowWork(twoMaximalGraphs)).reason, 'oversize-response');
  const ordinary = Object.fromEntries(Object.entries(twoMaximalGraphs).map(([id, value]) => [id, typeof value === 'string' && value.length >= 1000 ? 'from 0 to 12 hours' : value]));
  assert.ok(canonicalToolWorkJson(composedWorkflowWork(ordinary)).length < TOOL_RESPONSE_LIMITS.maxJsonLength);

  // Oversize: never marked on either path; the runner keeps its own marking
  // for the screen and records nothing (sharedGradingWithheld).
  const stuffed = { ...played.now, graph: { ...played.now.graph, analysis: { answers: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`a${index}`, 'z'.repeat(1000)])) } } };
  const check = gradeComposedWorkflowCheck(big, composedWorkflowWork(stuffed));
  assert.equal(check.reason, 'oversize-response');
  assert.equal(gradeServerResponse({ question: big, response: check.toolResponse }).graded, false);
  assert.equal(runnerState(big, stuffed).sharedGradingWithheld, 'oversize-response');
});

/* ======================================================================== *
 * Recipes and edge states.
 * ======================================================================== */

test('relationRepresentations marks a plot by the rebuilt graph (fix: its { pairs } rule marked every plot wrong)', () => {
  // The recipe used to key `plot` with { pairs }, which gradeStage compares
  // with the response as a list of arrows — and a graph's response is not one,
  // so on the merge-base device a correct plot was always marked wrong and the
  // question could never be fully correct. The recipe now marks the stage by
  // the rebuilt workspace verdict, whose point tasks are exactly those pairs.
  // The old rule, authored explicitly, still shows what it did: a correct plot
  // is marked wrong.
  const oldRule = { ...RELATION_PLOT, grading: { plot: { pairs: RELATION_PLOT.pairs } } };
  assert.equal(verdicts(assertParity(oldRule, rightPlay(oldRule), 'relation plot, old rule').server).plot, false);
  const { server } = assertParity(RELATION_PLOT, rightPlay(RELATION_PLOT), 'relation plot');
  assert.deepEqual(verdicts(server), { mapping: true, plot: true, domain: true, range: true, isFunction: true });
  assert.equal(server.isCorrect, true);
  const misplaced = bothPaths(RELATION_PLOT, rightPlay(RELATION_PLOT, { build: { misplace: 'point-2' } }).now).server;
  assert.deepEqual([verdicts(misplaced).plot, misplaced.isComplete], [false, false]);
});

test('a graph whose source the student reopened is unanswered until rebuilt, on screen and on the server (behavior change)', () => {
  // The student built the graph, then cleared a table cell. The runner shows
  // the graph step as waiting; the old artifact stays in the responses.
  const played = modelingPlay();
  const { workflow } = readComposedQuestion(MODELING);
  const tableStage = workflow.find((stage) => stage.id === 'table');
  const reopened = { ...played.now, table: runnerTable({ stage: tableStage, cells: cellsFor(tableStage, (x) => 5 * x + 40, { blankRow: 2 }), responses: played.now, content: readComposedQuestion(MODELING).content }) };
  const { content, grading } = readComposedQuestion(MODELING);
  assert.equal(resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(reopened) }).get('graph').status, 'waiting');
  const { server } = bothPaths(MODELING, reopened);
  const graph = server.parts.find((part) => part.id === 'graph');
  // BEFORE: the device kept the stale artifact's own verdict (correct) for a
  // graph the student could no longer see. AFTER: unanswered.
  const before = mergeBaseMarking(MODELING, { ...played.before, table: mergeBaseTable({ stage: tableStage, cells: reopened.table.cells, responses: played.before, content }) });
  assert.equal(verdicts(before).graph, true);
  assert.deepEqual([graph.isComplete, graph.isCorrect], [false, false]);
  assert.equal(server.isComplete, false);
});

test('a table recorded before its equation changed is graphed from the equation as it is now (behavior change)', () => {
  // Focus mode mounts only the step on screen, so a table left closed keeps
  // the model it was recorded with. The merge-base graph step drew THAT
  // (stale) model; the table itself was already marked against the current
  // one. The graph now follows the current one too, on screen and on the
  // server, so all three agree.
  const played = modelingPlay();
  const stale = { ...played.now, equation: 'C(t)=6t+34' };
  const { workflow, content, grading } = readComposedQuestion(MODELING);
  const fresh = resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(stale) }).get('graph');
  const old = mergeBaseGraphStage({ stage: workflow.find((stage) => stage.id === 'graph'), workflow, responses: { ...played.before, equation: 'C(t)=6t+34' }, content, grading });
  assert.equal(old.question.functionSpec.originalEquation, 'C(t)=5t+40', 'the merge-base runner drew the stale model');
  // The current model (6t + 34) disagrees with the table the student filled
  // from 5t + 40, so the table is in conflict with it: no single graph, as
  // the runner now shows — and as the table's own mark already said.
  assert.equal(fresh.status, 'conflict');
  assert.equal(verdicts(bothPaths(MODELING, stale).server).table, false);
  // A current model the table still follows (the same function, rewritten).
  const rewritten = { ...played.now, equation: 'C(t)=40+5t' };
  const followed = resolveWorkflowGraphStages({ workflow, content, grading, responses: workflowStageWorkResponses(rewritten) }).get('graph');
  assert.equal(followed.question.functionSpec.originalEquation, 'C(t)=40+5t');
  assert.equal(verdicts(bothPaths(MODELING, rewritten).server).graph, true);
});

test('a graph whose source changed while it was off screen is marked against the graph as it is now (behavior change)', () => {
  // Focus mode mounts only the step on screen. A student who built a graph,
  // then went back and revised what it is built from — and submitted without
  // reopening the graph — left the workspace's last claim in the responses.
  // BEFORE: the device believed that claim, a verdict about a graph the
  // student no longer has (reopened, the workspace starts over, because its
  // draft key follows the source). AFTER: the construction is re-marked
  // against the graph the current work builds, the only verdict the server
  // can reproduce from the work.
  const { workflow, content } = readComposedQuestion(MODELING);
  const tableStage = workflow.find((stage) => stage.id === 'table');
  // Built for C(t) = 4t + 40, then the model AND the table revised to 5t + 40.
  const first = modelingPlay({ equation: 'C(t)=4t+40' });
  assert.equal(verdicts(bothPaths(MODELING, first.now).server).graph, true, 'right for the model it was built from');
  const cells = cellsFor(tableStage, (x) => 5 * x + 40);
  const now = { ...first.now, equation: 'C(t)=5t+40' };
  now.table = runnerTable({ stage: tableStage, cells, responses: now, content });
  const before = { ...first.before, equation: 'C(t)=5t+40' };
  before.table = mergeBaseTable({ stage: tableStage, cells, responses: before, content });
  const old = mergeBaseMarking(MODELING, before);
  assert.deepEqual([verdicts(old).graph, old.isCorrect], [true, true], 'the device credited the stale graph');
  const { server } = bothPaths(MODELING, now);
  const graph = server.parts.find((part) => part.id === 'graph');
  assert.deepEqual([graph.isComplete, graph.isCorrect, server.isCorrect], [false, false, false]);
  assert.equal(runnerState(MODELING, now).isCorrect, false, 'the screen records what the server records');
  // Rebuilt against the current table, it is right again on every path.
  const rebuilt = modelingPlay();
  assert.equal(assertParity(MODELING, rebuilt, 'rebuilt').server.isCorrect, true);

  // A continuity choice flipped from discrete to continuous after a
  // points-only graph: the graph now needs its curve and its ends.
  const discrete = playWorkflow(V5_MODEL, (stage, { responses }) => {
    if (stage.id === 'continuity') return { value: 'discrete' };
    if (stage.kind === 'tableInput') return { cells: cellsFor(stage, (x) => evaluateModelAt(responses.equation, x)) };
    if (stage.kind === 'functionGraph') return { build: {} };
    return { value: rightValue(V5_MODEL, stage) };
  });
  assert.equal(verdicts(bothPaths(V5_MODEL, discrete.now).server).graph, true);
  const flipped = verdicts(mergeBaseMarking(V5_MODEL, { ...discrete.before, continuity: 'continuous' }));
  assert.equal(flipped.graph, true, 'the device kept the points-only claim');
  const remarked = bothPaths(V5_MODEL, { ...discrete.now, continuity: 'continuous' }).server.parts.find((part) => part.id === 'graph');
  assert.deepEqual([remarked.isComplete, remarked.isCorrect], [false, false]);
});

test('a question the shared grader declines still graphs a stage the contract would strip, from the student\'s own work', () => {
  // A stage named `solution` is a key the response contract strips, so the
  // question is declined (graded on the device). Its graph must still be
  // built from the student's equation, as the merge-base runner built it —
  // the bounded view the server reads would have lost that source and fallen
  // back to "cannot be graphed".
  const question = {
    type: 'functionGraph',
    prompt: 'Write the rule, fill the table, graph it.',
    graph: { xMin: -2, xMax: 6, yMin: -2, yMax: 12 },
    workflow: [
      { id: 'solution', kind: 'equationInput' },
      { id: 'table', kind: 'tableInput', source: { fromStage: 'solution' }, xValues: [0, 1, 2] },
      { id: 'graph', kind: 'functionGraph', source: { fromStage: 'table' } },
    ],
    grading: { solution: 'y=2x+1', table: { consistentWith: 'solution' }, graph: { consistentWith: 'table', useStageVerdict: true } },
  };
  assert.deepEqual([composedWorkflowSupport(question).supported, composedWorkflowSupport(question).reason], [false, 'work-key-not-contract-safe']);
  const { workflow, content, grading } = readComposedQuestion(question);
  const tableStage = workflow.find((stage) => stage.id === 'table');
  const graphStage = workflow.find((stage) => stage.id === 'graph');
  const cells = cellsFor(tableStage, (x) => 2 * x + 1);
  const now = { solution: 'y=2x+1' };
  now.table = runnerTable({ stage: tableStage, cells, responses: now, content });
  const before = { solution: 'y=2x+1' };
  before.table = mergeBaseTable({ stage: tableStage, cells, responses: before, content });

  const resolve = (responses) => resolveWorkflowGraphStages({ workflow, content, grading, responses }).get('graph');
  assert.equal(resolve(workflowStageWorkResponses(now)).status, 'unbuildable', 'the bounded view loses `solution`');
  const fresh = resolve(workflowStageWorkResponses(now, { serverGraded: false }));
  const old = mergeBaseGraphStage({ stage: graphStage, workflow: activeStages(workflow, before), responses: before, content, grading });
  assert.equal(fresh.status, 'ready');
  assert.deepEqual(fresh.question, old.question, 'the graph the merge-base runner drew');
  assert.equal(fresh.question.functionSpec.originalEquation, 'y=2x+1');

  // Marked on the device, as before: the workspace's own claim on that graph.
  const state = studentBuilds(fresh.question);
  now.graph = workflowGraphArtifact(workspaceReport(fresh.question, state));
  before.graph = graphArtifact({ ...workspaceReport(old.question, state), responseKey: JSON.stringify(state) });
  const reported = runnerState(question, now);
  const device = mergeBaseMarking(question, before);
  assert.equal(reported.sharedGradingWithheld, undefined, 'declared client-graded, not withheld');
  assert.deepEqual([reported.isCorrect, reported.isComplete, reported.partialCreditPercent], [device.isCorrect, device.isComplete, device.partialCreditPercent]);
  assert.equal(reported.isCorrect, true);
});

test('student text a graph is rebuilt from is screened before anything evaluates it', () => {
  // A plot driven by a keyed table (no consistency rule names the table, so
  // only the graph rebuild evaluates its cells).
  const question = {
    type: 'table',
    prompt: 'Complete the table, then plot it.',
    workflow: [
      { id: 'values', kind: 'tableInput', xValues: [0, 1, 2] },
      { id: 'plot', kind: 'coordinatePlot', source: { fromStage: 'values' } },
    ],
    grading: { values: { values: { '0:y': '1', '1:y': '3', '2:y': '5' } }, plot: { useStageVerdict: true } },
  };
  const { workflow, grading } = readComposedQuestion(question);
  const responses = { values: { [ARTIFACT]: 'table', isComplete: true, cells: { '0:y': '1', '1:y': 'zeros(600,600)', '2:y': '5' } } };
  assert.equal(unsafeExpressionStage({ workflow, grading, responses }), 'values');
  const declined = gradeComposedWorkflowCheck(question, { responses });
  assert.deepEqual([declined.graded, declined.reason], [false, 'unsafe-expression']);
  // Honest work in the same question is marked.
  const honest = playWorkflow(question, (stage) => (stage.kind === 'tableInput'
    ? { cells: cellsFor(stage, (x) => 2 * x + 1) }
    : { build: {} }));
  assert.equal(assertParity(question, honest, 'keyed plot').server.isCorrect, true);
});

/* ======================================================================== *
 * The browser wiring: the screen renders what the server rebuilds.
 * ======================================================================== */

test('WorkflowRunner builds its graph stages from the work the server reads, with the shared resolver', () => {
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  // One resolution per render, from the bounded work (never the raw state) —
  // unbounded only for a question the shared grader declines, which has no
  // server view (see 'a question the shared grader declines...').
  const resolution = region(runner, 'const graphStages = useMemo(() => resolveWorkflowGraphStages({', '}), [', 'graph stage resolution');
  assert.match(resolution, /workflow: authoredWorkflow,[\s\S]*content,[\s\S]*grading,[\s\S]*responses: workflowStageWorkResponses\(responses, \{ serverGraded \}\),/);
  assert.match(runner, /const serverGraded = useMemo\(\(\) => composedWorkflowSupport\(question\)\.supported === true, \[question\]\);/);
  assert.match(runner, /import \{[^}]*\bcomposedWorkflowSupport\b[^}]*\} from '\.\.\/\.\.\/\.\.\/functions\/shared\/toolMath\/workflow\/composedWorkflowContract\.mjs';/);
  assert.match(runner, /import \{[^}]*\bresolveWorkflowGraphStages\b[^}]*\} from '\.\.\/\.\.\/\.\.\/functions\/shared\/toolMath\/workflow\/workflowGraphStage\.mjs';/);
  assert.match(runner, /import \{[^}]*\bworkflowStageWorkResponses\b[^}]*\} from '\.\/workflowAnswerState\.js';/);
  // Each stage gets its own resolution, and the delegates render only that.
  const render = region(runner, 'const renderStage = (stage, index', 'const promptAndScenario', 'renderStage');
  assert.match(render, /const graphStage = graphStages\.get\(stage\.id\) \|\| null;/);
  assert.match(region(render, '<StageBody', '/>', 'StageBody props'), /graphStage=\{graphStage\}/);
  assert.match(region(runner, 'function StageBody(', 'switch (stage.kind)', 'StageBody'), /delegate\(\{[^}]*\bgraphStage\b[^}]*\}\)/);
  const delegates = region(runner, '  coordinatePlot: ({ graphStage, onChange, draftKey }) => {', '  algebraWorkspace:', 'graph delegates');
  assert.doesNotMatch(delegates, /expandGraphWindowToPoints|buildExpressionFunctionSpec|pointTasks|functionSpec:/, 'no second sub-question builder');
  // The responses the delegates record are the workspace's work.
  const readers = region(runner, 'const readDelegateResponse = {', '};', 'readDelegateResponse');
  assert.match(readers, /coordinatePlot: \(payload\) => workflowGraphArtifact\(payload\),/);
  assert.match(readers, /functionGraph: \(payload\) => workflowGraphArtifact\(payload\),/);
  assert.match(region(runner, 'const tableArtifact = (payload', '});', 'tableArtifact'), /workflowTableArtifact\(\{/);
  // An old draft is upgraded in place.
  const upgrade = region(runner, 'useEffect(() => {\n    if (upgradeLegacyGraphResponses(responses) === responses) return;', '}, [responses, setResponses]);', 'legacy upgrade');
  assert.match(upgrade, /setResponses\(\(current\) => upgradeLegacyGraphResponses\(current\)\);/);
  // The answer state marks the upgraded work.
  const answerState = executableSource(read('src/platform/workflow/workflowAnswerState.js'));
  assert.match(answerState, /const workflowWork = \(responses\) => composedWorkflowWork\(upgradeLegacyGraphResponses\(responses\)\);/);
  assert.match(answerState, /gradeComposedWorkflowCheck\(question, workflowWork\(responses\)\)/);
});

test('the composed grader marks graph stages with the shared graph-workspace grader, never a claim', () => {
  const grader = executableSource(read('functions/shared/serverGrading/questionGraders/composedWorkflow.mjs'));
  assert.match(grader, /import graphWorkspaceGrader from '\.\.\/tools\/graphWorkspace\.mjs';/);
  const verdict = region(grader, 'const graphStageVerdict = (resolution, response) => {', '\n};', 'graph stage verdict');
  assert.match(verdict, /gradeWorkWithGrader\(\{ grader: graphWorkspaceGrader, question: resolution\.question, work \}\)/);
  assert.doesNotMatch(verdict, /response\.isCorrect|response\.isComplete|partialCreditPercent/);
  const marking = region(grader, 'export const gradeComposedWorkflowWork', '\n};', 'composed marking');
  assert.match(marking, /responses: withGraphStageVerdicts\(\{ composed, responses \}\)/);
});

/* ======================================================================== *
 * DIFFERENTIAL: honest work, marked as the merge-base device marked it.
 * ======================================================================== */

const mulberry32 = (seed) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const EQUATIONS = new Map([
  [MODELING, MODELING_ANSWERS.equations],
  [V5_MODEL, ['W(t)=5t', 'W(t)=4t', 'y=5x+2']],
  [V5_GRAPH, ['y=2x+1', 'y=1+2x', 'y=3x']],
  [V5_PLOT, ['y=5x', 'y=4x', 'y=5x+5']],
]);
const WRONG = new Map([[FC, FC_ANSWERS.wrong], [RELATION_PLOT, RELATION_ANSWERS.wrong], [MODELING, MODELING_ANSWERS.wrong]]);
const BUILDS = [{}, {}, {}, { misplace: 'point-2' }, { check: false }, { sketch: 'none' }, { sketch: 'off' }, { markers: 'wrong' }, { markers: 'none' }, { zoom: 1 }, { zoom: 2 }];

/** A random honest student: every graph is built in the workspace it was shown. */
const randomStudent = (question, rng) => (stage, { responses, content }) => {
  const roll = rng();
  if (stage.kind === 'coordinatePlot' || stage.kind === 'functionGraph') {
    return roll < 0.1 ? null : { build: BUILDS[Math.floor(rng() * BUILDS.length)] };
  }
  if (stage.kind === 'tableInput') {
    if (roll < 0.08) return null;
    const model = typeof responses.equation === 'string' && responses.equation ? responses.equation : null;
    const evaluate = model ? (x) => evaluateModelAt(model, x) : (x) => evaluateGraphFunction(content.functionSpec || {}, x);
    const rows = tableLayoutOf(stage).xValues.length;
    return {
      cells: cellsFor(stage, evaluate, {
        wrongRow: rng() < 0.2 ? Math.floor(rng() * rows) : null,
        blankRow: rng() < 0.1 ? Math.floor(rng() * rows) : null,
      }),
    };
  }
  if (stage.id === 'equation' && EQUATIONS.has(question)) {
    const options = EQUATIONS.get(question);
    return roll < 0.05 ? null : { value: options[Math.floor(rng() * options.length)] };
  }
  if (stage.kind === 'classification' && Array.isArray(stage.choices) && stage.choices.length && roll < 0.5) {
    return { value: stage.choices[Math.floor(rng() * stage.choices.length)] };
  }
  if (stage.kind === 'quantityRoles' && roll < 0.3) {
    const right = rightValue(question, stage);
    return { value: right && typeof right === 'object' ? { independent: right.dependent, dependent: right.independent } : right };
  }
  if (roll < 0.6) return { value: rightValue(question, stage) };
  if (roll < 0.85) return { value: WRONG.get(question)?.[stage.id] ?? 'nope' };
  return null;
};

test('differential fuzz: honest work is marked exactly as the merge-base device marked it, on both paths', () => {
  let plays = 0;
  let built = 0;
  Object.entries(GRAPH_FIXTURES).forEach(([name, question], fixtureIndex) => {
    const rng = mulberry32(0xC0FFEE + fixtureIndex);
    for (let sample = 0; sample < 30; sample += 1) {
      const played = playWorkflow(question, randomStudent(question, rng));
      Object.entries(played.graphs).forEach(([stageId, { fresh, old }]) => {
        assert.equal(fresh?.status, old.status, `${name}#${sample}/${stageId}: status`);
        assert.deepEqual(fresh.question, old.question, `${name}#${sample}/${stageId}: the same graph`);
        if (fresh.status === 'ready') built += 1;
      });
      assertParity(question, played, `${name}#${sample}`);
      plays += 1;
    }
  });
  assert.equal(plays, 240);
  assert.ok(built > 120, `${built} graphs built`);
});

/* ======================================================================== *
 * The merge-base port is the merge-base code.
 * ======================================================================== */

test('provenance: every ported line is a line of the merge-base runner (when the history is available)', (t) => {
  let mergeBase;
  try {
    mergeBase = ['src/platform/workflow/WorkflowRunner.jsx', 'src/platform/workflow/workflowGraphVisuals.js']
      .map((file) => execFileSync('git', ['show', `a7a3b4e:${file}`], { cwd: new URL('../..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
      .join('\n');
  } catch {
    t.skip('merge-base history not available (shallow clone)');
    return;
  }
  const known = new Set(mergeBase.split('\n').map((line) => line.trim()));
  const self = read('tests/tools/composedWorkflowGraphStages.test.mjs');
  const port = region(self, 'MERGE-BASE PORT BEGIN', 'MERGE-BASE PORT END', 'merge-base port');
  const checked = port.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.includes('MERGE-BASE PORT') && !line.includes('// adapter') && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'));
  assert.ok(checked.length > 150, `${checked.length} ported lines`);
  const foreign = checked.filter((line) => !known.has(line));
  assert.deepEqual(foreign, [], 'lines in the port that are not merge-base code');
});
