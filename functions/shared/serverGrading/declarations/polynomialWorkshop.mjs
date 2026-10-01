/*
 * Grading declaration for the `polynomialWorkshop` registry tool.
 *
 * Every view is a few typed numbers or coefficient lists and/or <select>
 * choices, checked against values the server recomputes from the question's
 * own coefficients, binomials, dividend/divisor, roots and target — nothing
 * the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/polynomialWorkshop.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The views PolynomialWorkshop.jsx routes to by exact `mode` match; anything
// else (missing, unknown, mis-cased, padded, not a string) renders FactorZero.
const ROUTED_VIEWS = Object.freeze(['multiplyArea', 'factorQuadratic', 'division', 'graphConnection', 'rationalFeatures']);

export default declareTool({
  // Work shape v1 — per mode, exactly the state the workshop's inputs hold:
  //   factorZero        { value, factorChoice: 'yes'|'no' }
  //   multiplyArea      { cells: [4 typed coefficients], expanded: 'a, b, c' }
  //   factorQuadratic   { p, q }
  //   division          { quotient: 'a, b, …', remainder: 'r, …' }
  //   graphConnection   { behavior: 'crosses'|'touches', end: <one of four end-behaviour labels> }
  //   rationalFeatures  { choice: 'hole'|'verticalAsymptote'|'zero'|'none' }
  contractVersion: 1,
  // PolynomialWorkshop.jsx: `questionData.mode || 'factorZero'`, then strict
  // `===` against each routed view, falling through to FactorZero. The
  // manifest's generic fallback trims and stringifies the mode, so a padded
  // ' division ' would resolve to division there while the screen shows
  // FactorZero; this reproduces the screen exactly.
  defaultMode: 'factorZero',
  resolveMode: (question) => {
    const mode = question?.mode || 'factorZero';
    return ROUTED_VIEWS.includes(mode) ? mode : 'factorZero';
  },
  modes: {
    factorZero: SHARED,
    multiplyArea: SHARED,
    factorQuadratic: SHARED,
    division: SHARED,
    graphConnection: SHARED,
    rationalFeatures: SHARED,
  },
});
