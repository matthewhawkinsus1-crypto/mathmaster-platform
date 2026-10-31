/*
 * WHAT A QUESTION PUTS IN FRONT OF A STUDENT, WITHOUT THE AUTHORING CATALOG (PF01).
 *
 * The question type catalog (src/platform/contract/questionTypeCatalog.js, and
 * its copy for the server) is authoring metadata: every type's label, purpose,
 * when to use it and when not to, its required fields and validators and a
 * worked example, plus the analysis-request catalog and the question recipes
 * those validators ask. A student's Home asks it one thing: what is this
 * question showing the student, for the live-presence heartbeat a teacher's
 * tile reads (App.jsx, getQuestionRepresentation). That is one name per type
 * and a few rules about what a question carries, so it lives here, and the
 * catalog stays out of the first load: 12.9 KB gzip in front of every student's
 * Home (scripts/first-load-baseline.json).
 *
 * The catalog imports this and re-exports REPRESENTATIONS and
 * getQuestionRepresentation, and each of its entries reads its `representation`
 * from REPRESENTATION_BY_TYPE, so there is one list and every caller keeps its
 * import and gets the answer it always got.
 *
 * WHEN YOU ADD A QUESTION TYPE to QUESTION_TYPE_CATALOG, add it to
 * REPRESENTATION_BY_TYPE here and write `representation:
 * REPRESENTATION_BY_TYPE.<type>` in its entry. tests/platform/
 * questionRepresentation.test.mjs fails until you do, and says which type.
 *
 * Pure: no Firestore, no DOM, no imports.
 */

export const REPRESENTATIONS = Object.freeze({
  GRAPH: 'graph',
  NUMBER_LINE: 'numberLine',
  TABLE: 'table',
  MAPPING: 'mapping',
  ORDERED_PAIRS: 'orderedPairs',
  SYMBOLIC: 'symbolic',
  TEXT: 'text',
  INTERACTIVE: 'interactive',
});

// What the student actually sees for each catalogued type, before the question
// itself is looked at (a symbolic type that carries a graph is a graph).
export const REPRESENTATION_BY_TYPE = Object.freeze({
  algebra: REPRESENTATIONS.SYMBOLIC,
  fraction: REPRESENTATIONS.SYMBOLIC,
  numberLine: REPRESENTATIONS.NUMBER_LINE,
  intervalNumberLine: REPRESENTATIONS.NUMBER_LINE,
  graphing: REPRESENTATIONS.GRAPH,
  functionGraph: REPRESENTATIONS.GRAPH,
  functionInvestigation: REPRESENTATIONS.GRAPH,
  graphAnalysis: REPRESENTATIONS.GRAPH,
  functionCharacteristics: REPRESENTATIONS.GRAPH,
  stepAlgebra: REPRESENTATIONS.SYMBOLIC,
  literal: REPRESENTATIONS.SYMBOLIC,
  system: REPRESENTATIONS.SYMBOLIC,
  table: REPRESENTATIONS.TABLE,
  orderedPair: REPRESENTATIONS.ORDERED_PAIRS,
  multiAnswer: REPRESENTATIONS.SYMBOLIC,
  relationshipModel: REPRESENTATIONS.INTERACTIVE,
  graphScenarioMatch: REPRESENTATIONS.GRAPH,
  graphComparison: REPRESENTATIONS.GRAPH,
  graphStory: REPRESENTATIONS.GRAPH,
  contextInterpretation: REPRESENTATIONS.GRAPH,
  relationMapping: REPRESENTATIONS.MAPPING,
  modelingLab: REPRESENTATIONS.INTERACTIVE,
});

// All the first load reads of a catalog entry is its `representation`. The
// lookup stays a plain object's, as the catalog's was, so every name gets the
// answer it always got.
const ENTRY_BY_TYPE = Object.fromEntries(
  Object.entries(REPRESENTATION_BY_TYPE).map(([type, representation]) => [type, { representation }]),
);

const has = (value) => value !== undefined && value !== null && value !== '';
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const get = (question, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), question);

// The representation a question actually puts in front of a student. Used by
// the Preflight audit to notice that a graph-heavy source produced no graphs.
const nativeStimulusRepresentation = (stimulus, depth = 0) => {
  if (!isObject(stimulus) || depth > 2) return null;
  const supplied = [
    isObject(stimulus.graph) ? REPRESENTATIONS.GRAPH : null,
    nonEmptyArray(stimulus.table?.rows) ? REPRESENTATIONS.TABLE : null,
    nonEmptyArray(stimulus.orderedPairs) ? REPRESENTATIONS.ORDERED_PAIRS : null,
    ...(Array.isArray(stimulus.panels) ? stimulus.panels : [])
      .map((panel) => nativeStimulusRepresentation(panel, depth + 1)),
  ];
  // A multipart task may ask students to read both a table and a graph. Count
  // it once, with graph taking priority, including nested relation panels.
  return [REPRESENTATIONS.GRAPH, REPRESENTATIONS.TABLE, REPRESENTATIONS.ORDERED_PAIRS]
    .find((representation) => supplied.includes(representation)) || null;
};

export const getQuestionRepresentation = (question = {}) => {
  const stimulusRepresentation = nativeStimulusRepresentation(question?.stimulus);
  if (stimulusRepresentation) return stimulusRepresentation;
  const type = question?.toolId || question?.type;
  const entry = ENTRY_BY_TYPE[type] || null;
  if (entry) {
    // A type that can carry a graph but was not given one is not a graph question.
    if (entry.representation === REPRESENTATIONS.GRAPH) {
      const hasGraph = isObject(question.graph) || isObject(question.visual)
        || has(get(question, 'functionSpec.type')) || nonEmptyArray(question.graphs);
      if (!hasGraph) return REPRESENTATIONS.TEXT;
    }
    if (entry.representation === REPRESENTATIONS.SYMBOLIC && isObject(question.graph)) {
      return REPRESENTATIONS.GRAPH;
    }
    if (entry.representation === REPRESENTATIONS.SYMBOLIC && isObject(question.table)) {
      return REPRESENTATIONS.TABLE;
    }
    return entry.representation;
  }
  // Interactive tools all render their own workspace.
  return type ? REPRESENTATIONS.INTERACTIVE : REPRESENTATIONS.TEXT;
};
