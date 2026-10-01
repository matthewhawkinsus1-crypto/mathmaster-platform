/*
 * Grading declaration for the `graphing2` registry tool.
 *
 * Graphing2 is a LINE-CONSTRUCTION tool: in every mode the student plots
 * points on a coordinate plane and the points themselves are the answer. The
 * verdict is a pure function of those points and the authored question (its
 * line / factored / givenPoints / point+slope / standard / orientation+value
 * data, its constructionPolicy and its tolerance), so every mode is graded by
 * the shared server grader. The tool has no inequality, region, open/closed
 * or solid/dashed state; other tools handle those.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/graphing2.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The modes Graphing2.jsx renders a dedicated view for (MODE_LABELS,
// targetPrompt, hintsForMode) and src/tools/toolSchemas.js accepts.
const GRAPHING2_MODES = Object.freeze([
  'slopeIntercept',
  'factoredLinear',
  'throughPoints',
  'pointSlope',
  'standardForm',
  'verticalHorizontal',
]);

export default declareTool({
  // Work shape v1, the same in every mode:
  //   { points: [[x, y], ...], studentLine: { kind, m, b } | { kind, x } | null }
  // `points` are the student's plotted points in plotting order (2, or the
  // policy's minimumPoints under a form-aware constructionPolicy).
  // `studentLine` is the "Your line" readout the student sees (the line
  // through their first two points). It is a description and is never
  // graded: the grader rebuilds everything from `points`.
  contractVersion: 1,
  // Graphing2.jsx: `questionData.mode || 'slopeIntercept'`. An unknown mode
  // falls through every mode branch to the slope-intercept view (prompt,
  // hints, construction rules), so it resolves to slopeIntercept here. The
  // grader reads `question.mode` exactly as the tool does, so the verdict for
  // such a question matches the tool's whatever the mode label says.
  defaultMode: 'slopeIntercept',
  resolveMode: (question) => {
    const mode = question?.mode || 'slopeIntercept';
    return GRAPHING2_MODES.includes(mode) ? mode : 'slopeIntercept';
  },
  modes: {
    slopeIntercept: SHARED,
    factoredLinear: SHARED,
    throughPoints: SHARED,
    pointSlope: SHARED,
    standardForm: SHARED,
    verticalHorizontal: SHARED,
  },
});
