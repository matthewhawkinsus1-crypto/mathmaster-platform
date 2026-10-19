/*
 * GRAPH-READING ITEMS AND SCREEN READERS — a preflight WARNING, never a block.
 *
 * While a question can still be answered, a coordinate plane's generated
 * screen-reader description says only what KINDS of objects are drawn ("1
 * line, 3 points"), never where (src/platform/language/graphDescription.js):
 * "crosses the y-axis at −4" would answer "What is the y-intercept?" for
 * anyone who turns a screen reader on. So on an item whose task IS reading
 * the graph, a blind student gets nothing they can answer from — unless the
 * author wrote a description that conveys the graph without giving the answer
 * away, or the student has a human reader or a tactile graphic.
 *
 * This names those items so the teacher can decide. Graph-reading means:
 *   - a stimulus or question graph with readCoordinates: true, or
 *   - a workflow step that asks the student to mark a feature on the graph
 *     (graphFeatureSelect).
 * An authored `accessibleDescription` on the graph (or step) silences it.
 */

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);

const hasAuthoredDescription = (graph) => Boolean(clean(graph?.accessibleDescription));

const stimulusGraphs = (stimulus) => {
  if (!stimulus || typeof stimulus !== 'object') return [];
  return [stimulus.graph, ...asArray(stimulus.panels).flatMap(stimulusGraphs)].filter((graph) => graph && typeof graph === 'object');
};

/** Why `question` needs an authored graph description, or null. */
export const graphReadingWithoutDescription = (question) => {
  if (!question || typeof question !== 'object') return null;
  const readGraphs = [...stimulusGraphs(question.stimulus), question.graph]
    .filter((graph) => graph?.readCoordinates === true && !hasAuthoredDescription(graph));
  if (readGraphs.length) return 'asks students to read coordinates off a graph';
  const featureSteps = asArray(question.workflow)
    .filter((step) => step?.kind === 'graphFeatureSelect' && !hasAuthoredDescription(step.graph) && !clean(step.accessibleDescription));
  if (featureSteps.length) return `asks students to mark ${featureSteps.length === 1 ? 'a feature' : 'features'} on a graph`;
  return null;
};

export const auditAssignmentGraphAccessibility = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    if (deliveredOnly && question?.teacherExcluded === true) return;
    const reason = graphReadingWithoutDescription(question);
    if (!reason) return;
    warnings.push(`Question ${index + 1} ${reason} and has no screen-reader description (graph.accessibleDescription). While it can be answered, a screen reader hears only what is drawn, not where, so a blind student needs an authored description that does not give the answer away, a human reader or a tactile graphic.`);
  });
  return { warnings };
};

export default auditAssignmentGraphAccessibility;
