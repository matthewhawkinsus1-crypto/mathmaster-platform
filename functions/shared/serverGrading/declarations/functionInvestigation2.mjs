/*
 * Grading declaration for the `functionInvestigation2` registry tool.
 *
 * Every mode is a typed or chosen answer checked against values the server
 * recomputes from the question's own `function` (or `left` / `right` / `x`
 * for a comparison) — nothing the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/functionInvestigation2.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The views FunctionInvestigation2.jsx renders an answer panel for.
const RENDERED_MODES = Object.freeze(['features', 'domainRange', 'intercepts', 'behavior', 'compare']);

/*
 * The mode the component GRADES for this question, reproduced exactly.
 *
 * The component reads `questionData.mode || 'features'` and compares it
 * strictly against the five names above. Its Check routing is a chain whose
 * final `else` is the comparison check, so a mode it does not recognise
 * (a typo, a different case, a padded string, a non-string) renders no answer
 * controls at all and its only Check — the Work View's primary action — is
 * `checkComparison`. That is what the browser grades there, so it is what the
 * server grades: with no comparison control on screen the answer is blank,
 * which is incomplete and incorrect on both sides. Falling back to
 * `features` instead (resolveToolMode's default) would grade a check the
 * student's screen never ran.
 *
 * Returned verbatim from the strict comparison, never trimmed or re-cased,
 * because the component does neither.
 */
export const resolveFunctionInvestigationMode = (question = {}) => {
  const mode = question?.mode || 'features';
  return RENDERED_MODES.includes(mode) ? mode : 'compare';
};

export default declareTool({
  // Work shape v1 — per mode, exactly the fields the tool's inputs hold, raw:
  //   features     { anchorX, anchorY, verticalAsymptote, horizontalAsymptote }  typed numbers, as typed
  //   domainRange  { domainCode, rangeCode }                                     selected codes
  //   intercepts   { xIntercepts, yIntercept }                                   typed lists ("-2, 3" | "none")
  //   behavior     { behavior }                                                  selected code
  //   compare      { comparison }                                                'left'|'right'|'equal'|'undefined'
  contractVersion: 1,
  // FunctionInvestigation2.jsx: `questionData.mode || 'features'`.
  defaultMode: 'features',
  resolveMode: resolveFunctionInvestigationMode,
  modes: {
    features: SHARED,
    domainRange: SHARED,
    intercepts: SHARED,
    behavior: SHARED,
    compare: SHARED,
  },
});
