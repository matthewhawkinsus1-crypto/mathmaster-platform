/*
 * AUDITED BANK ITEMS THAT PROMISE A GRAPH THEY DO NOT SHOW, AS THEY WERE WORDED
 * IN PRODUCTION.
 *
 * CT01 repaired the audited bank items that said "the graph of …" with no graph
 * to show (the `graph` check in semanticValidation.js refuses them), so the bank
 * no longer holds one. Several tests are about what MathMaster does with such an
 * item when one is offered: Create failing at Question 24, Pre-Flight skipping it
 * and keeping a passing one, the import keeping the teacher's question. They need
 * the failure, not the bank's old defect, so these are the items as the bank
 * worded them: the first is the one that failed Create in production.
 */
export const WORDED_AS_IN_PRODUCTION = Object.freeze({
  'mm_sat_A_3E_5_intercept-change_v21':
    'The graph of $y={{m}}x {{b|signed}}$ is translated $k$ units vertically, producing a line with $y$-intercept ${{newb}}$. A positive value of $k$ means the graph moved up. What is the value of $k$?',
  'mm_sat_A_3E_1_vertical-shift-intercept_v21':
    'The function $f(x)={{m}}x {{b|signed}}$. The graph of $g$ is obtained by shifting the graph of $f$ upward {{k}} units. What is the $y$-intercept of the graph of $g$?',
  'mm_sat_A_3E_4_scale-output-slope_v21':
    'The function $g$ is defined by $g(x)={{a}}f(x)$, where $f(x)={{m}}x {{b|signed}}$. What is the slope of the graph of $g$?',
});

/** A converted bank item with the wording it had in production: it refers to a graph the question does not contain. */
export const promisingAGraph = (intent) => {
  const prompt = WORDED_AS_IN_PRODUCTION[intent?.ccmrSource?.documentId];
  if (!prompt) throw new Error(`${intent?.ccmrSource?.documentId} has no production wording on file`);
  return { ...intent, prompt };
};
