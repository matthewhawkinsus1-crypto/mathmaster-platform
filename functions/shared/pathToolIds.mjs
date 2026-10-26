/*
 * WHICH PATH TOOL A QUESTION NAMES, WITHOUT THE TOOLS' GRADERS (PF01, C1-103).
 *
 * pathToolContracts.mjs is every Path tool's public/private contract and its
 * grader: data modelling, graphing, systems of inequalities, the solver race
 * and the answer rules under them, about 90 KB of source. Saying WHICH tool a
 * question names needs none of that, only the names: the tools that have a
 * contract, and the authoring names that mean the same tool. A student's Home
 * needs exactly that (a Test Cycle's blueprint resolves each target's tool
 * while an assignment is read) and not one grader, so the names live here and
 * the graders stay out of the first load (scripts/first-load-baseline.json).
 *
 * pathToolContracts.mjs imports this and re-exports resolvePathToolId, so every
 * caller keeps its import and gets the answer it always got.
 *
 * WHEN YOU ADD A CONTRACT to CONTRACTS in pathToolContracts.mjs, add its id to
 * PATH_CONTRACT_TOOL_IDS here. tests/platform/pathToolIds.test.mjs fails until
 * you do, and says which id is missing.
 *
 * Pure: no Firestore, no DOM, no imports.
 */

// Every tool with a Path Tool Contract: the keys of CONTRACTS in
// pathToolContracts.mjs, in its order.
export const PATH_CONTRACT_TOOL_IDS = Object.freeze([
  'algebra',
  'system',
  'systemsWorkspace',
  'dataModelingLab',
  'regressionCalculator',
  'graphing2',
  'relationMapping',
  'intervalNumberLine',
  'stepAlgebra',
  'functionInvestigation',
  'multiAnswer',
]);

// Authoring names that mean the same tool. `functionGraph` and
// `functionInvestigation` are the same workspace in two modes, and one contract
// covers both rather than two contracts drifting apart.
//
// `literal` is deliberately NOT aliased here even though it can render on the
// same workspace: solving a formula for one of its letters produces an
// expression, and marking an expression needs symbolic equivalence the server
// does not have.
export const PATH_TOOL_ALIASES = Object.freeze({
  functionGraph: 'functionInvestigation',
  // Existing authoring uses the shorter semantic name while the shared tool
  // registry renders the component under dataModelingLab. Resolve once here so
  // the server, simulator and browser all agree on the canonical Path tool id.
  dataModeling: 'dataModelingLab',
});

/**
 * Which tool grades this question, from the question itself.
 *
 * Never from anything the browser sends: the grader is chosen from what the
 * server stored when it issued the question.
 */
export const resolvePathToolId = (question) => {
  const explicit = String(question?.pathToolId || question?.toolId || question?.type || '').trim();
  const resolved = PATH_TOOL_ALIASES[explicit] || explicit;
  return PATH_CONTRACT_TOOL_IDS.includes(resolved) ? resolved : null;
};
