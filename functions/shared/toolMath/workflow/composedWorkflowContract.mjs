/*
 * THE COMPOSED-WORKFLOW RESPONSE CONTRACT — WHAT CROSSES THE BOUNDARY, AND
 * WHICH COMPOSED QUESTIONS THE SERVER CAN MARK.
 *
 * A composed question (an explicit `workflow`, or a `recipe` that expands into
 * one — questionWorkflow.mjs readComposedQuestion) is answered stage by stage
 * in WorkflowRunner. Its raw work is the map of stage responses:
 *
 *   work = { responses: { [stageId]: <that stage's response> } }
 *
 * carried as a structured tool response (toolId `composedWorkflow`, contract
 * version 1; toolResponseContract.mjs), and marked by ONE function on both
 * sides: serverGrading/questionGraders/composedWorkflow.mjs.
 *
 * WORK IS STUDENT WORK. A delegated stage reports a status object, and some of
 * that is not the student's: a graph stage's `isCorrect`, `parts` and
 * `partialCreditPercent` are InteractiveGraphWorkspace's own verdict; a table's
 * `sourceFunctionSpec` is the AUTHORED function (answer-key material), and its
 * `sourceConsistent` / `sourceChecked` / `points` are values derived by the
 * browser. composedWorkflowStageWork keeps only what the student did.
 *
 * WHICH QUESTIONS ARE MARKED ON THE SERVER (composedWorkflowSupport): every
 * stage the grader marks must be markable from that work alone. Two things
 * keep a question on the device, each with its exact reason:
 *
 *   - a graph-construction stage (coordinatePlot / functionGraph). The graph
 *     workspace marks it against a sub-question WorkflowRunner.jsx's graph
 *     delegates (React) assemble from the student's earlier stages; the
 *     workflow keeps only that workspace's own claim (`useStageVerdict`),
 *     which the contract strips as a verdict, and the construction travels
 *     only as one opaque string. Its completeness is the same claim.
 *   - a stage, figure or table-cell key the contract would strip or bound
 *     (a verdict / answer-key name, a prototype key, an over-long key), so
 *     that stage's work could not reach the server intact.
 *
 * Light and pure: no mathjs, no React. The grading manifest's declaration
 * (serverGrading/declarations/types/composedWorkflow.mjs) imports it.
 */
import { GRADING_AUTHORITY } from '../../serverGrading/gradingAuthority.mjs';
import { NON_WORK_KEYS, TOOL_RESPONSE_LIMITS } from '../../serverGrading/toolResponseContract.mjs';
import { matchItems } from './figureMatch.mjs';
import { hasStageResponse, readComposedQuestion } from './questionWorkflow.mjs';
import { WORKFLOW_ARTIFACT, isWorkflowArtifact, workflowTableLayout } from './workflowStageWork.mjs';

export const COMPOSED_WORKFLOW_TOOL_ID = 'composedWorkflow';
export const COMPOSED_WORKFLOW_CONTRACT_VERSION = 1;

/** Stages rendered by InteractiveGraphWorkspace (WorkflowRunner DELEGATES). */
export const GRAPH_CONSTRUCTION_STAGE_KINDS = Object.freeze(['coordinatePlot', 'functionGraph']);

export const COMPOSED_WORKFLOW_BLOCKERS = Object.freeze({
  graphStage: "Its graph-building step is marked against a graph the browser assembles from the student's earlier "
    + 'steps, which the server cannot rebuild yet. A composed workflow with a graph-construction stage '
    + '(coordinatePlot or functionGraph) is graded on the device: the graph workspace marks that stage against a '
    + "sub-question that WorkflowRunner.jsx's graph delegates (React) assemble at render time from the student's "
    + 'table points and their consistency with the function the student wrote, the continuity choice, the authored '
    + 'window and domain restriction, and the snap targets. The workflow then keeps only that workspace\'s own '
    + 'isCorrect / partialCreditPercent / isComplete claim (gradeStage\'s useStageVerdict branch), which the response '
    + 'contract strips, and the construction itself (placements, strokes, camera, end markers) travels only inside '
    + 'one JSON string the composed contract does not carry. The server can neither rebuild that sub-question nor '
    + 're-mark the construction until both are pure shared modules.',
  unsafeKey: "One of its step, figure or table-cell names is a word the grading contract reserves, so that work "
    + "cannot reach the server intact. A stage id, figure id or table-cell key in this composed workflow is"
    + " one the tool-response contract strips or bounds (a verdict or answer-key name such as `score` or "
    + "`solution`, a prototype key, a key longer than 80 characters, or more than 120 of them), so that "
    + "stage's work could not reach the server intact; the question stays graded on the device.",
  notComposed: "Its `recipe` expands to no steps, so the student sees an ordinary question rather than the composed "
    + "workflow the server would mark. This question names a `recipe` that expands to no stages, so "
    + "QuestionEngine renders it by its `type` rather than as a composed workflow; the composed-workflow "
    + "grader declines rather than marking a screen the student never saw.",
});

const NON_WORK_KEY_SET = new Set(NON_WORK_KEYS);
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '');

/** Would this object key survive boundToolWork unchanged? */
const contractSafeKey = (key) => {
  const value = text(key);
  return value !== ''
    && value.length <= TOOL_RESPONSE_LIMITS.maxKeyLength
    && !NON_WORK_KEY_SET.has(value)
    && !UNSAFE_KEYS.has(value);
};

const keysFit = (keys) => keys.length <= TOOL_RESPONSE_LIMITS.maxObjectKeys && keys.every(contractSafeKey);

/**
 * The keys a composed question's work is written under: stage ids (the
 * `responses` map), figure ids (a figureMatch stage's `assignments`) and table
 * cells (a tableInput stage's `cells`). Each must survive the contract.
 */
const workKeysFit = (workflow) => keysFit(workflow.map((stage) => text(stage?.id)))
  && workflow.every((stage) => {
    if (stage?.kind === 'figureMatch') {
      return keysFit(matchItems(stage).map((item) => text(item?.id).trim()).filter(Boolean));
    }
    if (stage?.kind === 'tableInput') return keysFit(workflowTableLayout(stage).blanks);
    return true;
  });

/** The view mode the question is graded under: a recipe, or an explicit workflow. */
const modeOf = (composed) => (composed.recipe ? `recipe:${text(composed.recipe).slice(0, 60)}` : 'workflow');

/**
 * The question exactly as WorkflowRunner reads it (runtime repair, then recipe
 * expansion — readComposedQuestion), with the server's answer to "can this be
 * marked from its work alone?".
 *
 *   { composed, support: { supported, reason, mode, authority?, blocker? } }
 */
export const resolveComposedWorkflow = (question) => {
  let composed;
  try {
    composed = readComposedQuestion(question);
  } catch {
    composed = null;
  }
  if (!composed?.composed) {
    return {
      composed,
      support: {
        supported: false,
        reason: 'not-a-composed-workflow',
        mode: null,
        authority: GRADING_AUTHORITY.CLIENT_GRADED,
        blocker: COMPOSED_WORKFLOW_BLOCKERS.notComposed,
      },
    };
  }
  const mode = modeOf(composed);
  if (composed.workflow.some((stage) => GRAPH_CONSTRUCTION_STAGE_KINDS.includes(stage?.kind))) {
    return {
      composed,
      support: {
        supported: false,
        reason: 'graph-construction-stage',
        mode,
        authority: GRADING_AUTHORITY.CLIENT_GRADED,
        blocker: COMPOSED_WORKFLOW_BLOCKERS.graphStage,
      },
    };
  }
  if (!workKeysFit(composed.workflow)) {
    return {
      composed,
      support: {
        supported: false,
        reason: 'work-key-not-contract-safe',
        mode,
        authority: GRADING_AUTHORITY.CLIENT_GRADED,
        blocker: COMPOSED_WORKFLOW_BLOCKERS.unsafeKey,
      },
    };
  }
  return { composed, support: { supported: true, reason: null, mode } };
};

/** Can the shared grader mark this composed question from its work alone? */
export const composedWorkflowSupport = (question) => resolveComposedWorkflow(question).support;

/**
 * One stage's response, as student work.
 *
 * Plain answers (text, a chosen option, arrows, intervals, a figure match, an
 * axis setup, quantity roles) are already only the student's. Three delegated
 * artifacts carry more than that, and keep only the fields the grader reads:
 *
 *   graph             its kind and completeness claim; never the workspace's
 *                     verdict (`isCorrect`, `parts`, `partialCreditPercent`)
 *                     or its raw construction JSON (unbounded, and read by no
 *                     grader — a graph stage is graded on the device)
 *   table             the cells, the completeness claim, and `sourceModel` —
 *                     the student's own equation the table was built from;
 *                     never `sourceFunctionSpec` (the authored function) or
 *                     the browser's derived points / consistency flags.
 *                     `sourceModel` is a COPY of an upstream response: it
 *                     travels so the record (and the post-submit review,
 *                     which marks a table "changed" when the function under
 *                     it changes) shows what the table followed, but the
 *                     grader never marks against it — it rebuilds it from the
 *                     response it copies (withDerivedTableSources)
 *   featureSelection  the marked points and the "none" claim
 */
export const composedWorkflowStageWork = (value) => {
  if (!isPlainObject(value) || !value[WORKFLOW_ARTIFACT]) return value;
  switch (value[WORKFLOW_ARTIFACT]) {
    case 'graph':
      return { [WORKFLOW_ARTIFACT]: 'graph', isComplete: value.isComplete === true };
    case 'table':
      return {
        [WORKFLOW_ARTIFACT]: 'table',
        isComplete: value.isComplete === true,
        cells: isPlainObject(value.cells) ? value.cells : {},
        sourceModel: typeof value.sourceModel === 'string' ? value.sourceModel : null,
      };
    case 'featureSelection':
      return {
        [WORKFLOW_ARTIFACT]: 'featureSelection',
        selections: Array.isArray(value.selections) ? value.selections : [],
        none: value.none === true,
        isComplete: value.isComplete === true,
      };
    default:
      return value;
  }
};

/** The whole composed question's work: `{ responses }`, student work only. */
export const composedWorkflowWork = (responses) => ({
  responses: isPlainObject(responses)
    ? Object.fromEntries(Object.entries(responses)
      .filter(([, value]) => value !== undefined)
      .map(([stageId, value]) => [stageId, composedWorkflowStageWork(value)]))
    : {},
});

/*
 * WHAT EACH TABLE WAS BUILT FROM, REBUILT FROM THE WORK.
 *
 * WorkflowRunner's table artifact records `sourceModel`: the response of the
 * stage the table is driven by (resolveStageInput — the student's equation,
 * or the model an upstream table was itself built from). gradeStage reads it
 * when a `consistentWith` rule points at a TABLE stage: "is this consistent
 * with the function your table was built from?". It is a copy of other work,
 * so the grader never takes it from the response — forged, it would let a
 * table be "consistent" with a model the student never wrote (`0`, say, with
 * a column of zeros). It is rebuilt here, exactly as the browser builds it,
 * from the responses it copies:
 *
 *   driven (`source.fromStage`)  the upstream response once it is answered
 *                                (hasStageResponse): a string as it is, a
 *                                table's own rebuilt model, otherwise its
 *                                `sourceModel` field; null while unanswered
 *   not driven                   the question content's `sourceModel`, if any
 *
 * Only table artifacts at tableInput stages are touched; every other response
 * is returned as it came.
 */
const modelText = (value) => (typeof value === 'string' && value ? value : null);

export const withDerivedTableSources = ({ workflow = [], content = null, responses = {} } = {}) => {
  const answers = isPlainObject(responses) ? responses : {};
  const stages = Array.isArray(workflow) ? workflow : [];
  const tableStages = new Map(stages
    .filter((stage) => stage?.kind === 'tableInput')
    .map((stage) => [text(stage.id), stage]));
  if (!tableStages.size) return answers;

  const derived = new Map();
  const sourceModelOf = (stageId, visiting = new Set()) => {
    if (derived.has(stageId)) return derived.get(stageId);
    if (visiting.has(stageId)) return null;
    visiting.add(stageId);
    const stage = tableStages.get(stageId);
    let model = null;
    if (!stage?.sourceStageId) {
      model = isPlainObject(content) ? modelText(content.sourceModel) : null;
    } else {
      const upstreamId = text(stage.sourceStageId);
      const upstream = answers[upstreamId];
      if (hasStageResponse(upstream)) {
        if (typeof upstream === 'string') model = upstream;
        else if (isWorkflowArtifact(upstream, 'table') && tableStages.has(upstreamId)) model = sourceModelOf(upstreamId, visiting);
        else model = isPlainObject(upstream) ? modelText(upstream.sourceModel) : null;
      }
    }
    derived.set(stageId, model);
    return model;
  };

  const next = { ...answers };
  tableStages.forEach((stage, stageId) => {
    if (isWorkflowArtifact(answers[stageId], 'table')) {
      next[stageId] = { ...answers[stageId], sourceModel: sourceModelOf(stageId) };
    }
  });
  return next;
};
