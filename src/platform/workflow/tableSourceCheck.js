/*
 * DOES A TABLE STEP AGREE WITH WHAT IT WAS BUILT FROM?
 *
 * A composed question's table step is checked against the student's own
 * equation when the table was built from one, and otherwise against the
 * question's function — the AUTHORED one, so on a DOL, quiz or test the answer
 * is a verdict on the table. The step reports it beside the cells
 * (`sourceChecked`, `sourceConsistent`, and the function it used,
 * `sourceFunctionSpec`), and nothing grades from it: a plotting step that is
 * built from the table offers its magnet, and on practice says "Your table and
 * function do not agree yet", only when the check allows.
 *
 * The server copy of the answers carries the table as the student's work alone
 * (workflowDraftProjection.js). So the check is worked out here — from the
 * student's cells and the question, by one function — when the step reports,
 * wherever a later step reads it, and when a table comes back from the server
 * copy on another Chromebook: there the answer is made again exactly as the
 * device that did the work stored it, so what is submitted is byte for byte the
 * same.
 */
import { checkTableConsistency } from './workflowGrading.js';
import { evaluateNumericValue } from './modelExpression.js';
import { evaluateGraphFunction } from '../../functionGraphUtils.js';

const WORKFLOW_ARTIFACT = '__mathmasterWorkflowArtifact';
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const responseColumnOf = (stage) => {
  const columns = Array.isArray(stage?.columns) && stage.columns.length
    ? stage.columns
    : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
  return stage?.responseColumn || columns[columns.length - 1]?.key || 'y';
};

export const checkTableAgainstFunctionSpec = ({ cells = {}, stage, functionSpec }) => {
  if (!functionSpec) return null;
  const responseColumn = responseColumnOf(stage);
  const xValues = Array.isArray(stage?.xValues) ? stage.xValues : [];
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

/** The function a table without a student equation is checked against. */
export const tableSourceFunctionSpec = ({ sourceModel = null, content }) => (
  !sourceModel && content?.functionSpec ? content.functionSpec : null
);

/** The full check, from the student's cells and the question. */
export const tableSourceConsistency = ({ cells = {}, stage, sourceModel = null, content }) => (
  sourceModel
    ? checkTableConsistency({
      response: cells,
      xValues: Array.isArray(stage?.xValues) ? stage.xValues : [],
      model: sourceModel,
      responseColumn: responseColumnOf(stage),
    })
    : checkTableAgainstFunctionSpec({ cells, stage: stage || {}, functionSpec: tableSourceFunctionSpec({ sourceModel, content }) })
);

/** What a table step stores beside its cells, in the order it stores it. */
export const tableSourceFields = ({ cells = {}, stage, sourceModel = null, content }) => {
  const consistency = tableSourceConsistency({ cells, stage, sourceModel, content });
  return {
    sourceFunctionSpec: tableSourceFunctionSpec({ sourceModel, content }),
    sourceChecked: consistency?.checked || 0,
    sourceConsistent: consistency ? consistency.consistent : null,
  };
};

/** The check a step built from this table reads: worked out, never stored. */
export const tableSourceCheck = ({ table, tableStage, content }) => {
  if (!isObject(table) || table[WORKFLOW_ARTIFACT] !== 'table' || !tableStage) return null;
  const consistency = tableSourceConsistency({
    cells: isObject(table.cells) ? table.cells : {},
    stage: tableStage,
    sourceModel: table.sourceModel || null,
    content,
  });
  return consistency ? { checked: consistency.checked, consistent: consistency.consistent } : null;
};

/** A table answer that came back from the server copy, without what is derived from it. */
export const tableAwaitsRederivation = (value) => isObject(value)
  && value[WORKFLOW_ARTIFACT] === 'table'
  && !Object.prototype.hasOwnProperty.call(value, 'sourceChecked');

/**
 * Every table answer that came back from the server copy, made again as the
 * device that did the work stored it. The same object when there is none.
 */
export const rederiveRestoredTables = ({ responses, stages = [], content }) => {
  if (!isObject(responses)) return responses;
  let changed = false;
  const next = { ...responses };
  (Array.isArray(stages) ? stages : []).forEach((stage) => {
    const table = responses[stage?.id];
    if (!tableAwaitsRederivation(table)) return;
    next[stage.id] = {
      ...table,
      ...tableSourceFields({
        cells: isObject(table.cells) ? table.cells : {},
        stage,
        sourceModel: table.sourceModel || null,
        content,
      }),
    };
    changed = true;
  });
  return changed ? next : responses;
};
