/*
 * Grading declaration for the `regressionCalculator` registry tool.
 *
 * The calculator renders one workflow over two presentations of the source
 * data, chosen by `sourceMode` (RegressionCalculator.jsx routes through
 * resolveRegressionCalculatorMode below; it never reads `question.mode`):
 *
 *   data         the source pairs are listed as givens (any sourceMode other
 *                than 'scatterplot', including a missing one)
 *   scatterplot  the source is drawn as a scatterplot with its coordinates
 *                hidden, so entering the table is reading the graph
 *
 * Both modes are marked from the student's own work against the question's
 * sourceData — the table they built, the regression run they executed (its
 * table snapshot and the statistics the calculator showed them) and the
 * direction / strength they chose — so both are server graded.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/regressionCalculator.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

/**
 * The view the calculator renders for a question. The component routes with
 * this same function, so the grader can never mark a screen the student did
 * not see.
 */
export const resolveRegressionCalculatorMode = (question) => (
  question?.sourceMode === 'scatterplot' ? 'scatterplot' : 'data'
);

export default declareTool({
  // Work shape v1 — exactly what the calculator submits:
  //   table            [[x, y], ...]  the valid rows of the student's x₁/y₁ table
  //   regressionRun    null | { operation: 'linearRegression', table: [[x, y], ...],
  //                    m, b, r, r2 } — the run the student executed: the table
  //                    snapshot it ran on and the statistics it displayed
  //   interpretation   { direction, strength } — the two selects
  //   processEvidence  [{ type, ... }] — the teacher-review process trail
  //                    (most recent events, bounded); never graded
  contractVersion: 1,
  defaultMode: 'data',
  resolveMode: resolveRegressionCalculatorMode,
  modes: {
    data: SHARED,
    scatterplot: SHARED,
  },
});
