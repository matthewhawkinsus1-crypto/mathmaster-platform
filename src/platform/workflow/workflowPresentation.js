const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const GRAPH_EVIDENCE_STAGE_KINDS = new Set([
  'coordinatePlot',
  'functionGraph',
  'graphFeatureSelect',
]);

const GRAPH_CONSTRUCTION_STAGE_KINDS = new Set([
  'coordinatePlot',
  'functionGraph',
  'graphConstruction',
]);

/**
 * The sentence that belongs in the student's global YOUR TASK strip.
 *
 * Long workflows deliberately show one mathematical stage at a time. The
 * question-level prompt explains the overall problem; the active stage prompt
 * tells the student what to do right now. Keeping this pure also means mobile,
 * desktop and future presentation shells can all ask the workflow for the same
 * task instead of inventing their own interpretation.
 */
export const resolveWorkflowTaskPrompt = ({ workflow = [], activeStageIndex = 0 } = {}) => {
  const stages = Array.isArray(workflow) ? workflow : [];
  if (!stages.length) return '';
  const index = Math.min(Math.max(0, Number(activeStageIndex) || 0), stages.length - 1);
  return String(stages[index]?.prompt || stages[index]?.label || '').trim();
};

export const workflowUsesGraphEvidence = (workflow = []) => (
  (Array.isArray(workflow) ? workflow : []).some((stage) => (
    isObject(stage?.graph)
    || GRAPH_EVIDENCE_STAGE_KINDS.has(stage?.kind)
  ))
);

/**
 * Pick the one graph the student should keep looking at while a focus-mode
 * workflow moves through graph-reading subtasks.
 *
 * A checked graph the student actually built outranks the original evidence.
 * Otherwise an authored graph is returned BY IDENTITY — not rebuilt from an
 * equation/functionSpec — so labels, window, points and styling remain exactly
 * the graph the question started with. An authored answer graph is never shown
 * while the workflow is asking the student to construct that graph themselves.
 * Text-only workflows return null and therefore can never acquire a synthetic
 * y=x graph.
 */
export const selectPersistentWorkflowGraph = ({
  content = {},
  workflow = [],
  checkedGraph = null,
} = {}) => {
  if (isObject(checkedGraph)) return checkedGraph;

  const stages = Array.isArray(workflow) ? workflow : [];
  if (stages.some((stage) => GRAPH_CONSTRUCTION_STAGE_KINDS.has(stage?.kind))) return null;
  if (!workflowUsesGraphEvidence(stages)) return null;
  if (isObject(content?.graph)) return content.graph;

  const stageGraph = stages.find((stage) => isObject(stage?.graph))?.graph;
  return stageGraph || null;
};
