/*
 * A GRAPH-CONSTRUCTION STAGE OF A COMPOSED WORKFLOW, AS PURE DATA.
 *
 * A `coordinatePlot` or `functionGraph` stage hands the student an
 * InteractiveGraphWorkspace built from their own earlier work: the pairs of the
 * table they filled in (or their equation sampled at the table's inputs, or the
 * authored pairs), the function they wrote (or the authored one), the authored
 * window widened to show their points, the snap targets their completed table
 * earns, whether their discrete/continuous choice makes it points-only, and the
 * domain restriction that decides which graph ends need open or closed
 * markers. The workspace then marks the student's construction against THAT
 * sub-question.
 *
 * This module is the one place that sub-question is built. WorkflowRunner.jsx's
 * graph delegates render it, and the shared composed-workflow grader
 * (serverGrading/questionGraders/composedWorkflow.mjs) rebuilds it from the
 * authoritative question plus the student's work and marks the stage with the
 * shared graph-workspace grader. Both read the stage responses in the same
 * form — the bounded composed work, with every table's source model and every
 * table-derived value (points, consistency) rebuilt from the cells the student
 * typed — so the graph on screen and the graph the server marks are the same.
 *
 * The derivations below are WorkflowRunner's own, moved verbatim (the window
 * expansion, the table artifact, the two delegates), plus the domain
 * restriction and endpoint rule from workflowGraphVisuals.js.
 *
 * Pure: no React, no DOM. mathjs is reached through modelExpression.mjs for the
 * student's own function and table entries.
 */
import { evaluateGraphFunction } from '../graphWorkspace/functionGraphUtils.mjs';
import { buildStudentTableMagneticTargets } from '../graphWorkspace/graphInteractionPrecision.mjs';
import { graphWorkspaceWorkFromState, normalizeGraphWorkspaceWork } from '../graphWorkspace/graphWorkspaceModel.mjs';
import {
  buildExpressionFunctionSpec,
  evaluateModelAt,
  evaluateNumericValue,
  parseIntervalDomainRestriction,
} from '../graphWorkspace/modelExpression.mjs';
import { GRAPH_CONSTRUCTION_STAGE_KINDS, withDerivedTableSources } from './composedWorkflowContract.mjs';
import { activeStages, hasStageResponse, resolveStageInput } from './questionWorkflow.mjs';
import { checkTableConsistency } from './workflowGrading.mjs';
import { WORKFLOW_ARTIFACT, isWorkflowArtifact, stageWorkIsComplete, workflowTableLayout } from './workflowStageWork.mjs';

/** Stages rendered by InteractiveGraphWorkspace (WorkflowRunner's graph delegates). */
export const WORKFLOW_GRAPH_STAGE_KINDS = GRAPH_CONSTRUCTION_STAGE_KINDS;

export const isWorkflowGraphStage = (stage) => WORKFLOW_GRAPH_STAGE_KINDS.includes(stage?.kind);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const DEFAULT_GRAPH_WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });

/* ---------------------------------------------------------------------------
 * The window a dependent graph is drawn in. Moved from WorkflowRunner.jsx.
 * ------------------------------------------------------------------------- */

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

// The authored viewport is a minimum useful window, not a cage. A dependent
// graph must always be able to display the points the student actually made.
// Expand only when upstream work falls outside the authored bounds; never
// silently clip a table point just because the original answer key fit.
export const expandGraphWindowToPoints = (graph = {}, points = []) => {
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

/* ---------------------------------------------------------------------------
 * The domain a student-built graph honours, and whether its ends are marked.
 * Moved from src/platform/workflow/workflowGraphVisuals.js (which re-exports).
 * ------------------------------------------------------------------------- */

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

export const workflowRequiresEndpointMarkers = ({ pointOnly = false, authored, domain = null } = {}) => {
  if (pointOnly) return false;
  if (typeof authored === 'boolean') return authored;
  const bounds = normalizeWorkflowDomain(domain);
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

/**
 * Resolve the finite domain a student-built graph must honor.
 *
 * A simple workflow historically stored its key at grading.domain. Branched
 * continuity workflows store one key per visible branch instead
 * (domain-continuous / domain-discrete, or any authored stage id). The graph
 * runtime used to look only at grading.domain, so a correct continuous
 * real-world model silently became an unbounded function and demanded arrows.
 *
 * Read the ACTIVE workflow, never a hidden branch. That preserves the
 * assessment: the student's discrete/continuous choice decides which domain
 * stage exists, and only then does the graph receive the matching boundary
 * semantics.
 */
export const workflowGraphDomainRestriction = ({
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

/* ---------------------------------------------------------------------------
 * The table a graph is built from. Moved from WorkflowRunner.jsx.
 * ------------------------------------------------------------------------- */

const numericTablePoints = ({ stage, cells }) => {
  const { responseColumn, xValues } = workflowTableLayout(stage);
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
  const { responseColumn, xValues } = workflowTableLayout(stage);
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

/**
 * A `tableInput` stage's artifact: the cells the student typed plus what the
 * workflow derives from them — the numeric points a later graph plots, the
 * model the table follows (`sourceModel`, the student's equation) or else the
 * authored function (`sourceFunctionSpec`), and whether the cells agree with it.
 *
 * WorkflowRunner records this when the table reports; a graph built from the
 * table reads it back through workflowGraphStageView below, rebuilt from the
 * cells, never from the derived fields a response carries.
 */
export const workflowTableArtifact = ({ stage = {}, cells = {}, isComplete = false, sourceModel = null, content = null } = {}) => {
  const { responseColumn } = workflowTableLayout(stage);
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
    isComplete: Boolean(isComplete),
    cells,
    xValues: Array.isArray(stage.xValues) ? stage.xValues : [],
    points: numericTablePoints({ stage, cells }),
    sourceModel,
    sourceFunctionSpec,
    sourceChecked: consistency?.checked || 0,
    sourceConsistent: consistency ? consistency.consistent : null,
  };
};

/* ---------------------------------------------------------------------------
 * The two graph delegates' sub-questions. Moved from WorkflowRunner.jsx.
 * ------------------------------------------------------------------------- */

/*
 * Does the plotting surface print what the student is aiming at?
 *
 * Normally yes: a student told to plot (3, -2) is marked on placing it, not on
 * reading it back, and the readout stops a slip of the finger costing a point.
 * A question that LATER asks them to write a coordinate turns it off, because
 * by then reading the plane is the thing being assessed.
 *
 * NOTE FOR AUTHORS: InteractiveGraphWorkspace forces the readout back on when
 * the grid is drawn coarser than one unit, since a value you cannot count to is
 * a value you cannot read. Suppressing coordinates on a grid stepped by 2 does
 * nothing at all.
 */
export const coordinateReadout = (stage, content) => (
  stage?.showCoordinates
  ?? stage?.graph?.showCoordinates
  ?? content?.graph?.showCoordinates
  ?? true
);

/**
 * `coordinatePlot`: plot the points. From the student's table, else their
 * equation at the table's inputs, else the authored pairs.
 */
export const coordinatePlotQuestion = ({ stage, input, content, outcomesWithheld = false }) => {
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
  // The magnet is offered only for a table that agrees with its source, so
  // whether it appears says whether the table is right: where outcomes are
  // withheld it stays off and the points are placed on the grid like any other.
  const magneticSnapTargets = !outcomesWithheld
    && source?.[WORKFLOW_ARTIFACT] === 'table'
    && source.isComplete
    && source.sourceConsistent !== false
    ? buildStudentTableMagneticTargets(pairs)
    : [];

  return {
    status: 'ready',
    question: {
      // THE STAGE PROMPT, NOT AN EMPTY STRING.
      //
      // The workspace shows its own title and a fallback question card only
      // when it believes nobody else is showing a prompt — which is what an
      // empty string told it. But the stage prompt is rendered directly
      // above it by renderStage, so a student read the same instruction
      // three times: the step heading, the stage prompt, then "Plot the
      // Points" over "YOUR QUESTION: Plot every point from your table."
      //
      // The workspace renders nothing for a non-empty prompt — it only uses
      // it to know somebody else has this covered — so passing the real one
      // removes the duplicates and the ~130px they cost above the plane.
      prompt: stage.prompt || '',
      graph: expandGraphWindowToPoints(stage.graph || content?.graph || DEFAULT_GRAPH_WINDOW, pairs),
      plotMode: 'points',
      pointOnly: true,
      pointTasks,
      stimulus: stage.stimulus || content?.stimulus,
      magneticSnapTargets,
      functionSpec: { type: 'expression', expression: '0', variable: 'x', referencePoints: pairs },
      showCoordinates: coordinateReadout(stage, content),
      requireEndpointMarkers: false,
    },
  };
};

/**
 * `functionGraph`: build the graph of the student's function from their table
 * (or of the authored function when no model was written).
 *
 *   { status: 'ready', question }
 *   { status: 'conflict' }     the table and the function disagree: no single
 *                              graph exists, and the runner says so
 *   { status: 'unbuildable' }  no function to graph yet
 */
export const functionGraphQuestion = ({ stage, input, content, outcomesWithheld = false }) => {
  const source = input?.from === 'student' ? input.value : null;
  const sourceIsTable = source?.[WORKFLOW_ARTIFACT] === 'table';
  const tablePoints = sourceIsTable && Array.isArray(source.points) ? source.points : [];
  const sourceModel = sourceIsTable ? source.sourceModel : (typeof source === 'string' ? source : null);
  const sourceFunctionSpec = sourceIsTable ? source.sourceFunctionSpec : null;
  const resolvedGraphMode = String(stage.resolvedGraphMode || stage.graphMode || 'continuous').toLowerCase();
  const pointOnly = resolvedGraphMode === 'discrete';
  const authoredGraphWindow = stage.graph || content?.graph || DEFAULT_GRAPH_WINDOW;
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
  // See coordinatePlotQuestion: the magnet's presence would say the table is right.
  const magneticSnapTargets = !outcomesWithheld
    && sourceIsTable
    && source.isComplete
    && source.sourceConsistent !== false
    ? buildStudentTableMagneticTargets(points)
    : [];

  // The graph must represent the student's own prior work. For a table that
  // came from an equation, contradictory work has no single graph; the runner
  // makes that conflict visible rather than secretly switching to the key.
  //
  // Not where outcomes are withheld (a DOL, quiz or test). "Your table and
  // function do not agree" is a verdict on the table — against the AUTHORED
  // function when the table was not built from the student's own equation —
  // and it could be asked again after every edit. There the graph is built
  // from the student's own table and function as they stand (never from the
  // answer key), and both are marked when the question is submitted.
  if (!outcomesWithheld && sourceIsTable && (source.sourceModel || source.sourceFunctionSpec) && source.sourceChecked > 0 && source.sourceConsistent === false) {
    return { status: 'conflict', question: null };
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

  if (!functionSpec) return { status: 'unbuildable', question: null };

  return {
    status: 'ready',
    question: {
      // The stage prompt, for the reason given in coordinatePlotQuestion.
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
      // A restricted relationship needs explicit visual boundaries. The
      // domain stage still asks the student to STATE the domain, but the
      // graph itself is incomplete until its open/closed endpoints are shown.
      requireEndpointMarkers: workflowRequiresEndpointMarkers({
        pointOnly,
        authored: stage.requireEndpointMarkers,
        domain: stage.domainRestriction,
      }),
    },
  };
};

/**
 * The stage as the runner renders it (WorkflowRunner renderStage's
 * `effectiveStage`): a functionGraph takes the active workflow's domain
 * restriction, and a stage tied to a continuity choice takes the student's
 * discrete/continuous answer as its graph mode.
 */
export const effectiveWorkflowGraphStage = ({ stage, workflow = [], grading = null, responses = {} }) => {
  const domainRestriction = stage.kind === 'functionGraph'
    ? workflowGraphDomainRestriction({ graphStage: stage, workflow, grading })
    : null;
  const baseEffectiveStage = domainRestriction && !stage.domainRestriction
    ? { ...stage, domainRestriction }
    : stage;
  return stage.continuityStageId
    ? {
        ...baseEffectiveStage,
        resolvedGraphMode: String(responses?.[stage.continuityStageId] || '').toLowerCase(),
      }
    : baseEffectiveStage;
};

/* ---------------------------------------------------------------------------
 * The whole resolution, from the composed work.
 * ------------------------------------------------------------------------- */

/*
 * What a graph stage's source looks like to the delegate.
 *
 * A table's derived fields (points, the authored function, the consistency
 * verdict) and its completeness are rebuilt from the cells it carries and the
 * source model rebuilt by withDerivedTableSources — the same function the
 * browser records them with, so for honest work the rebuilt view is the
 * browser's artifact; a forged `points` or `sourceConsistent` is never read.
 * A table artifact can only come from a tableInput stage; anywhere else it is
 * not a source at all.
 */
const sourceView = ({ upstreamStage, upstream, content }) => {
  if (!isWorkflowArtifact(upstream, 'table')) return upstream;
  if (upstreamStage?.kind !== 'tableInput') return null;
  return workflowTableArtifact({
    stage: upstreamStage,
    cells: isPlainObject(upstream.cells) ? upstream.cells : {},
    isComplete: stageWorkIsComplete(upstreamStage, upstream),
    sourceModel: typeof upstream.sourceModel === 'string' && upstream.sourceModel ? upstream.sourceModel : null,
    content,
  });
};

/**
 * Resolve every graph-construction stage the student is on, from the composed
 * work (`{ responses }` as it crosses the contract; composedWorkflowWork).
 *
 *   Map(stageId -> { status, question, stage, input })
 *
 *   status  'ready'        `question` is the workspace's sub-question
 *           'waiting'      the stage's source (or continuity choice) is not
 *                          finished, so the stage is not on screen
 *           'conflict'     the table and function disagree (no workspace)
 *           'unbuildable'  no function to graph (no workspace)
 *
 * `workflow` is the authored, normalized workflow (readComposedQuestion); the
 * student's branch is resolved here, as the runner resolves it.
 * `outcomesWithheld` is a DOL, quiz or test: no magnet and no conflict block,
 * whose presence would say whether the student's table is right.
 */
export const resolveWorkflowGraphStages = ({ workflow = [], content = null, grading = null, responses = {}, outcomesWithheld = false } = {}) => {
  const stages = Array.isArray(workflow) ? workflow : [];
  const resolved = new Map();
  if (!stages.some(isWorkflowGraphStage)) return resolved;
  const answers = withDerivedTableSources({ workflow: stages, content, responses: isPlainObject(responses) ? responses : {} });
  const active = activeStages(stages, answers);
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  active.filter(isWorkflowGraphStage).forEach((stage) => {
    const effective = effectiveWorkflowGraphStage({ stage, workflow: active, grading, responses: answers });
    const upstreamId = stage.sourceStageId;
    const view = upstreamId
      ? { ...answers, [upstreamId]: sourceView({ upstreamStage: byId.get(upstreamId), upstream: answers[upstreamId], content }) }
      : answers;
    const input = resolveStageInput({ stage, responses: view, content });
    const continuityReady = !stage.continuityStageId || hasStageResponse(answers[stage.continuityStageId]);
    if ((Boolean(upstreamId) && !input.ready) || !continuityReady) {
      resolved.set(stage.id, { status: 'waiting', question: null, stage: effective, input });
      return;
    }
    const built = stage.kind === 'coordinatePlot'
      ? coordinatePlotQuestion({ stage: effective, input, content, outcomesWithheld })
      : functionGraphQuestion({ stage: effective, input, content, outcomesWithheld });
    resolved.set(stage.id, { ...built, stage: effective, input });
  });
  return resolved;
};

/* ---------------------------------------------------------------------------
 * A graph stage's response: the workspace's own work.
 * ------------------------------------------------------------------------- */

const parseJsonObject = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const graphArtifactOf = (work, { isComplete, isCorrect }) => ({
  [WORKFLOW_ARTIFACT]: 'graph',
  // The workspace's own claims, for the runner's screen only: whether the
  // next step can open ("Graph completed") and the "Your checked graph"
  // review. Neither travels as work (composedWorkflowStageWork) and no grader
  // reads them — the stage is re-marked from `construction` / `analysis`.
  isComplete: isComplete === true,
  isCorrect: isCorrect === true,
  construction: work.construction,
  analysis: work.analysis,
});

/**
 * The graph stage's response, from the answer state InteractiveGraphWorkspace
 * reports: its raw work (the bounded construction/analysis it was marked on,
 * `toolResponse.value`), normalized. Never its verdict, parts or responseKey.
 */
export const workflowGraphArtifact = (payload) => {
  const raw = parseJsonObject(payload?.toolResponse?.value) || parseJsonObject(payload?.responseKey);
  const work = raw ? normalizeGraphWorkspaceWork(raw) : normalizeGraphWorkspaceWork({});
  return graphArtifactOf(work, { isComplete: payload?.isComplete === true, isCorrect: payload?.isCorrect === true });
};

/*
 * A DRAFT SAVED BEFORE GRAPH STAGES CARRIED THEIR WORK.
 *
 * The old graph artifact held the workspace's verdict and its state only as a
 * JSON string (`responseKey`, the workspace's `{ construction, analysis }`
 * undo state). That state is exactly what the workspace restores from its own
 * draft when the student next opens the stage, so it is upgraded the way the
 * workspace reports it (graphWorkspaceWorkFromState: the "Check Point
 * Placements" commit and the snapped sketch become the work's commits) — the
 * stage is marked as it would be the moment the student touched it, which
 * matters for a plot step the student can no longer reopen (a later step
 * locks it). Work already in the canonical shape is normalized as it is. An
 * artifact whose state cannot be read stays as it was, carries no work, and
 * is marked unanswered — never correct, never silently wrong.
 */
export const upgradeLegacyGraphArtifact = (value) => {
  if (!isWorkflowArtifact(value, 'graph') || isPlainObject(value.construction)) return value;
  const state = parseJsonObject(value.responseKey);
  if (!state || !isPlainObject(state.construction)) return value;
  const canonical = ['pointsLocked', 'sketchLocked'].some((key) => Object.prototype.hasOwnProperty.call(state.construction, key));
  const work = canonical ? normalizeGraphWorkspaceWork(state) : graphWorkspaceWorkFromState(state);
  return graphArtifactOf(work, { isComplete: value.isComplete === true, isCorrect: value.isCorrect === true });
};

/** Every legacy graph artifact in a response map upgraded; the same object when there is none. */
export const upgradeLegacyGraphResponses = (responses) => {
  if (!isPlainObject(responses)) return responses;
  let changed = false;
  const next = {};
  Object.entries(responses).forEach(([stageId, value]) => {
    const upgraded = upgradeLegacyGraphArtifact(value);
    if (upgraded !== value) changed = true;
    next[stageId] = upgraded;
  });
  return changed ? next : responses;
};

/** The workspace work a graph stage's response carries, or null (unanswered). */
export const workflowGraphStageWork = (response) => (
  isWorkflowArtifact(response, 'graph') && isPlainObject(response.construction)
    ? { construction: response.construction, analysis: isPlainObject(response.analysis) ? response.analysis : {} }
    : null
);
