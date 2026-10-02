/*
 * Grading declaration for the `graphing` structured question surface — the
 * "Graphing Lines" screen (src/GraphLine.jsx), rendered by QuestionEngine (not
 * a registry tool). Its verdict comes from the shared grader over a structured
 * raw response (toolResponseContract), on the device and on the server.
 *
 * The student types the slope and the y-intercept; both are checked against
 * the question's own key, so the server can reproduce the verdict exactly. A
 * legacy `generator` item (per-student m/b) is graded on the device and
 * refused on the server by the common exclusions, not by this declaration.
 *
 * Light by design. The checks are in ../tools/graphing.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1: { slope: string, intercept: string } — the two input boxes.
  contractVersion: 1,
  // GraphLine.jsx has exactly one view and never reads question.mode.
  defaultMode: 'lineFeatures',
  resolveMode: () => 'lineFeatures',
  modes: {
    lineFeatures: SHARED,
  },
});
