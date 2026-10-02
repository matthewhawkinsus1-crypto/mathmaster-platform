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
 * function do not agree yet", only when the check allows — worked out again
 * from the cells wherever that step is built (workflowGraphStage.mjs).
 *
 * There is ONE computation: workflowTableArtifact in
 * functions/shared/toolMath/workflow/workflowGraphStage.mjs, which builds the
 * table step's answer when it reports and rebuilds a table from its cells
 * wherever a graph is built from it, on the device and on the server.
 *
 * The server copy of the answers carries the table as the student's work alone
 * (workflowDraftProjection.mjs). When a table comes back from it on another
 * Chromebook, the answer is made again here, by that same function, exactly as
 * the device that did the work stored it — so what is submitted is byte for
 * byte the same, and a graph step built from the table finds its own draft
 * (named after the table) where that device left it.
 */
import { workflowTableArtifact } from '../../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';

const WORKFLOW_ARTIFACT = '__mathmasterWorkflowArtifact';
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** What a table step stores beside its cells, in the order it stores it. */
export const tableSourceFields = ({ cells = {}, stage, sourceModel = null, content }) => {
  const { sourceFunctionSpec, sourceChecked, sourceConsistent } = workflowTableArtifact({
    stage: stage || {},
    cells,
    sourceModel,
    content,
  });
  return { sourceFunctionSpec, sourceChecked, sourceConsistent };
};

/** The check a step built from this table reads: worked out, never stored. */
export const tableSourceCheck = ({ table, tableStage, content }) => {
  if (!isObject(table) || table[WORKFLOW_ARTIFACT] !== 'table' || !tableStage) return null;
  const { sourceChecked, sourceConsistent } = tableSourceFields({
    cells: isObject(table.cells) ? table.cells : {},
    stage: tableStage,
    sourceModel: table.sourceModel || null,
    content,
  });
  // No source to check against: no check at all, rather than a failed one.
  return sourceConsistent === null ? null : { checked: sourceChecked, consistent: sourceConsistent };
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
