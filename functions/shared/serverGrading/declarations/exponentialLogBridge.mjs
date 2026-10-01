/*
 * Grading declaration for the `exponentialLogBridge` registry tool.
 *
 * Every mode is a set of typed numbers (and, for inverse, one <select>)
 * checked against values the server recomputes from the question's own base,
 * exponent, equation, exponential spec and sample inputs — nothing the browser
 * holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/exponentialLogBridge.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The views ExponentialLogBridge.jsx routes to by exact `mode` match; anything
// else (missing, unknown, mis-cased, padded, not a string) renders Equivalent
// Forms.
const ROUTED_VIEWS = Object.freeze(['solveExponential', 'solveLogarithmic', 'inverse', 'composition']);

export default declareTool({
  // Work shape v1 — per mode, exactly the state the bridge's inputs hold:
  //   equivalentForms   { logAnswer, expAnswer }                          typed numbers
  //   solveExponential  { xAnswer, exponentAnswer }                       typed numbers
  //   solveLogarithmic  { argumentAnswer, xAnswer }                       typed numbers
  //   inverse           { inverseAnswer, asymptote, domainSide: ''|'greater'|'less' }
  //   composition       { inverseAfterForward, forwardAfterInverse }      typed numbers
  contractVersion: 1,
  // ExponentialLogBridge.jsx: `questionData.mode || 'equivalentForms'`, then
  // strict `===` against each routed view, falling through to EquivalentForms.
  // The manifest's generic fallback trims and stringifies the mode; this
  // reproduces the screen exactly.
  defaultMode: 'equivalentForms',
  resolveMode: (question) => {
    const mode = question?.mode || 'equivalentForms';
    return ROUTED_VIEWS.includes(mode) ? mode : 'equivalentForms';
  },
  modes: {
    equivalentForms: SHARED,
    solveExponential: SHARED,
    solveLogarithmic: SHARED,
    inverse: SHARED,
    composition: SHARED,
  },
});
