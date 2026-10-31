/*
 * GRAPH-READING ITEMS AND SCREEN READERS: WHICH ITEMS NEED A DESCRIPTION.
 *
 * While a question can be answered, a coordinate plane's generated
 * screen-reader description says only what KINDS of objects are drawn ("1
 * line, 3 points"), never where (src/platform/language/graphDescription.js):
 * "crosses the y-axis at −4" would answer "What is the y-intercept?" for
 * anyone who turns a screen reader on. So on an item whose task IS reading the
 * graph, a blind student gets nothing they can answer from — unless the author
 * wrote a description that conveys the graph without giving the answer away,
 * the student's plan gives them the Graph read-out (AX03,
 * src/platform/supports/graphReadOut.js), or they have a human reader or a
 * tactile graphic.
 *
 * Graph-reading means:
 *   - a stimulus or question graph with readCoordinates: true, or
 *   - a workflow step that asks the student to mark a feature on the graph
 *     (graphFeatureSelect).
 * An authored `accessibleDescription` on the graph (or step) silences it.
 *
 * Shared by the lesson Pre-Flight (src/platform/preflight/
 * graphAccessibilityPreflight.js) and the Test Cycle Pre-Flight
 * (./testCyclePreflight.mjs), which the server runs too. Both only WARN: the
 * teacher decides. Pure.
 */

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasAuthoredDescription = (graph) => Boolean(clean(graph?.accessibleDescription));

const stimulusGraphs = (stimulus) => {
  if (!isObject(stimulus)) return [];
  return [stimulus.graph, ...asArray(stimulus.panels).flatMap(stimulusGraphs)].filter(isObject);
};

/** Why `question` needs an authored graph description, or null. */
export const graphReadingWithoutDescription = (question) => {
  if (!isObject(question)) return null;
  const readGraphs = [...stimulusGraphs(question.stimulus), question.graph]
    .filter((graph) => graph?.readCoordinates === true && !hasAuthoredDescription(graph));
  if (readGraphs.length) return 'asks students to read coordinates off a graph';
  const featureSteps = asArray(question.workflow)
    .filter((step) => step?.kind === 'graphFeatureSelect' && !hasAuthoredDescription(step.graph) && !clean(step.accessibleDescription));
  if (featureSteps.length) return `asks students to mark ${featureSteps.length === 1 ? 'a feature' : 'features'} on a graph`;
  return null;
};

/**
 * The same question of a bank family: its own template and every variant it
 * can issue (a variant may hold its question as `template`). The first reason
 * found, or null.
 */
export const familyGraphReadingWithoutDescription = (family) => {
  if (!isObject(family)) return null;
  const variants = asArray(family.variants).map((variant) => (isObject(variant?.template) ? variant.template : variant));
  for (const source of [family, ...variants]) {
    const reason = graphReadingWithoutDescription(source);
    if (reason) return reason;
  }
  return null;
};

/** The sentence every such warning ends with: why, and what a blind student can be given. */
export const GRAPH_READING_REMEDIES = 'While a question can be answered, a screen reader hears only what is drawn, not where, so a blind student needs an authored description that does not give the answer away, the Graph read-out support on their plan, a human reader or a tactile graphic.';
