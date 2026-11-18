/*
 * WHAT A COMPOSED QUESTION'S SAVED ANSWERS MAY HOLD.
 *
 * Every step's answer is kept in one draft, `workflow-responses`, by step id
 * (WorkflowRunner.jsx), and read back as the question opens
 * (checkedQuestionDraft.js). A step draws its answer the moment it is shown:
 * a typed step puts it in its math box, a point step reads its coordinates, a
 * matching step its assignments. An answer of the wrong kind threw there, on
 * every reload, until the student started the question fresh.
 *
 * Each step's answer is checked as the kind that step writes (below); one
 * that is not is dropped, and that step opens unanswered. A part inside an
 * answer that is not one (a selected point with no coordinates, a table cell
 * holding a record) is dropped from it. Answers the steps of this question do
 * not name, and every part these shapes do not name, are kept as they are.
 * A valid answer comes back exactly as saved.
 */
import { draftShape } from '../../tools/shared/toolDraftShape.js';

const TYPED = draftShape.nullable(draftShape.cell());
const RECORD = draftShape.record({});
// A point a step reads as [x, y] or { x, y } (GraphFeatureSelectStage's normalizePoint).
const graphPoint = draftShape.either(draftShape.list(TYPED), draftShape.record({ x: TYPED, y: TYPED }));
const INTERVAL_OR_ARROW = draftShape.either(RECORD, draftShape.list(TYPED));

// The answer each kind of step writes.
const STEP_ANSWER = Object.freeze({
  // Typed into a math box or a text area, or a choice's id.
  equationInput: TYPED,
  domainInput: TYPED,
  rangeInput: TYPED,
  intervalInput: TYPED,
  valueSet: TYPED,
  pointInput: TYPED,
  interpretation: TYPED,
  shortResponse: TYPED,
  classification: TYPED,
  multipleChoice: TYPED,
  // The equation the algebra step reports.
  algebraWorkspace: TYPED,
  quantityRoles: draftShape.record({ independent: TYPED, dependent: TYPED }),
  axisSetup: draftShape.record({
    ...Object.fromEntries(['xLabel', 'xUnit', 'yLabel', 'yUnit', 'xStep', 'yStep'].map((field) => [field, TYPED])),
    isComplete: draftShape.boolean(),
  }),
  graphFeatureSelect: draftShape.record({
    feature: draftShape.nullable(draftShape.text()),
    selections: draftShape.list(graphPoint),
    none: draftShape.boolean(),
    isComplete: draftShape.boolean(),
  }),
  figureMatch: draftShape.record({ assignments: draftShape.map(TYPED), isComplete: draftShape.boolean() }),
  tableInput: draftShape.record({
    isComplete: draftShape.boolean(),
    cells: draftShape.map(TYPED),
    xValues: draftShape.list(TYPED),
    // Each a pair the summary reads as [x, y].
    points: draftShape.list(draftShape.list(TYPED)),
    sourceModel: draftShape.nullable(draftShape.either(draftShape.text(), RECORD)),
    sourceFunctionSpec: draftShape.nullable(RECORD),
    sourceChecked: draftShape.number(),
    sourceConsistent: draftShape.nullable(draftShape.boolean()),
  }),
  // The graph workspace's work, read again by the shared graph stage
  // (workflowGraphStage.mjs) with its own checks.
  functionGraph: RECORD,
  coordinatePlot: RECORD,
  // The intervals or arrows the tool reports (an interval a record, an arrow
  // its [input, output] pair), or its whole response.
  numberLine: draftShape.either(draftShape.list(INTERVAL_OR_ARROW), RECORD),
  mappingDiagram: draftShape.either(draftShape.list(INTERVAL_OR_ARROW), RECORD),
});

/**
 * The draft normalizer's shape for these steps' answers, by step id. A step
 * may hold null: a tool step whose tool reported nothing yet saves it so.
 */
export const workflowResponsesDraftShape = (stages = []) => draftShape.record(Object.fromEntries(
  (Array.isArray(stages) ? stages : [])
    .filter((stage) => stage?.id && STEP_ANSWER[stage.kind])
    .map((stage) => [String(stage.id), draftShape.nullable(STEP_ANSWER[stage.kind])]),
));
