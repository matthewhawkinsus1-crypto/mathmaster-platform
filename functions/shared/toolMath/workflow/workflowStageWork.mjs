/*
 * WHAT A COMPOSED-WORKFLOW STAGE'S WORK IS, AND WHEN IT IS FINISHED.
 *
 * Shared by the browser (WorkflowRunner, which builds the stages) and the
 * shared grader (workflowGrading.mjs, which marks them), so the two read one
 * definition of a stage's table layout and of when its work is complete.
 *
 * Light and pure: no mathjs, no React.
 */
import { gradeTableResponse } from '../../ordinaryResponseGrading.mjs';
import { isFigureMatchComplete } from './figureMatch.mjs';

/** The key a delegated stage's structured response carries its kind under. */
export const WORKFLOW_ARTIFACT = '__mathmasterWorkflowArtifact';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isWorkflowArtifact = (value, kind = null) => Boolean(
  isPlainObject(value)
  && value[WORKFLOW_ARTIFACT]
  && (!kind || value[WORKFLOW_ARTIFACT] === kind),
);

const DEFAULT_TABLE_COLUMNS = Object.freeze([{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }]);

/**
 * A `tableInput` stage's layout: its columns, which column the student fills,
 * and the editable cells (`<row>:<column>`) the table renders. WorkflowRunner
 * builds the table from this, so a grader that asks "is every cell filled?"
 * asks about exactly the cells the student was shown.
 */
export const workflowTableLayout = (stage = {}) => {
  const columns = Array.isArray(stage?.columns) && stage.columns.length ? stage.columns : DEFAULT_TABLE_COLUMNS;
  const inputColumn = stage?.inputColumn || columns[0]?.key || 'x';
  const responseColumn = stage?.responseColumn || columns[columns.length - 1]?.key || 'y';
  const xValues = Array.isArray(stage?.xValues) ? stage.xValues : [];
  return {
    columns,
    inputColumn,
    responseColumn,
    xValues,
    blanks: xValues.map((_, rowIndex) => `${rowIndex}:${responseColumn}`),
  };
};

/*
 * A DELEGATED STAGE REPORTS ITS OWN COMPLETENESS — VERIFY IT WHERE THE WORK CAN.
 *
 * `hasStageResponse` trusts an artifact's `isComplete`, because the browser
 * component that built the artifact is the one that knows. A grader cannot
 * take that on trust: a table checked for CONSISTENCY with the student's own
 * function skips blank rows, so a table claiming completeness with one row
 * filled would score as a finished, consistent table. Where the work itself
 * determines completeness, the claim must agree with it — through the SAME
 * function the component uses, so an honest response is never re-judged:
 *
 *   table        every editable cell is filled (gradeTableResponse, which is
 *                what TableGrader reports as its `isComplete`)
 *   figureMatch  every figure is placed (isFigureMatchComplete, which is what
 *                FigureMatchStage reports)
 *
 * Every other artifact keeps its own claim. None of them can gain from it: the
 * points, figures and axis fields they carry are each marked against the key,
 * so claiming unfinished work finished only submits it to be marked wrong.
 *
 * KEYED ON THE STAGE, NOT ON THE RESPONSE'S OWN TAG. The tag is part of the
 * work, so forged work can drop or change it: an untagged `{ '0:y': '40' }`
 * (or one tagged `axes`) for a table checked against the student's function
 * would otherwise skip this check and score as a finished, consistent table
 * from a single row. WorkflowRunner always reports a tableInput stage as a
 * table artifact and a figureMatch stage as a figure-match artifact, so for
 * honest work this is the same check; for anything else it reads the cells /
 * assignments the grader itself marks.
 */
const tableCellsOf = (response) => {
  if (isWorkflowArtifact(response, 'table')) return isPlainObject(response.cells) ? response.cells : {};
  // What gradeStage's responsePayload marks for a response that is not a table artifact.
  return isPlainObject(response) ? response : {};
};

export const stageWorkIsComplete = (stage, response) => {
  if (stage?.kind === 'tableInput') {
    const { blanks } = workflowTableLayout(stage);
    return gradeTableResponse({ table: { answers: {}, blanks } }, tableCellsOf(response)).isComplete;
  }
  if (stage?.kind === 'figureMatch') return isFigureMatchComplete(stage, response);
  return true;
};
