/*
 * Grading declaration for the `parabolaGeometryLab` registry tool.
 *
 * Every mode is a set of typed numbers (and, in two modes, one <select>)
 * checked against features the server recomputes from the question's own
 * vertex, p, orientation, point, focus and directrix — nothing the browser
 * holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/parabolaGeometryLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The views ParabolaGeometryLab.jsx routes to by exact `mode` match; anything
// else (missing, unknown, mis-cased, padded, not a string) renders Features.
const ROUTED_VIEWS = Object.freeze(['equidistance', 'fromGeometry', 'equation']);

export default declareTool({
  // Work shape v1 — per mode, exactly the state the lab's inputs hold:
  //   features      { focusX, focusY, directrix, latus }                typed numbers
  //   equidistance  { focusDistance, directrixDistance, onCurve: 'yes'|'no' }
  //   fromGeometry  { h, k, p }                                         typed numbers
  //   equation      { coefficient, opening: 'up'|'down'|'left'|'right' }
  contractVersion: 1,
  // ParabolaGeometryLab.jsx: `questionData.mode || 'features'`, then strict
  // `===` against each routed view, falling through to FeatureMode. The
  // manifest's generic fallback trims and stringifies the mode, so a padded
  // ' equation ' would resolve to equation there while the screen shows
  // Features; this reproduces the screen exactly.
  defaultMode: 'features',
  resolveMode: (question) => {
    const mode = question?.mode || 'features';
    return ROUTED_VIEWS.includes(mode) ? mode : 'features';
  },
  modes: {
    features: SHARED,
    equidistance: SHARED,
    fromGeometry: SHARED,
    equation: SHARED,
  },
});
