/*
 * Grading declaration for the `linearTableWorkbench` registry tool.
 *
 * Every mode is marked from the student's own recorded intervals, chosen
 * classification and typed repair / equation answers against truths the
 * server derives from the question's authored rows — the interval Δx/Δy/rate,
 * the linear/nonlinear classification, the single offending row and its
 * corrected value, the fitted m and b. Nothing is looked up from a hidden key
 * the browser holds and the server does not, so every mode is server graded.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/linearTableWorkbench.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The same list as LINEAR_TABLE_WORKBENCH_MODES in the tool's mathematics
// (tests/tools/linearTableWorkbenchSharedGrading pins them equal); repeated
// here because that module loads mathjs, which this light file must not.
const VIEWS = Object.freeze(['constantRate', 'deriveEquation', 'repairValue']);

/**
 * The view the workbench renders for a question. LinearTableWorkbench.jsx
 * routes with this same function, and scoreLinearTableWorkbench resolves its
 * mode the same way: an exact authored mode name, otherwise constantRate (a
 * missing, misspelled or non-string `mode` shows the constant-rate view).
 */
export const resolveLinearTableWorkbenchMode = (question) => (
  VIEWS.includes(question?.mode) ? question.mode : 'constantRate'
);

export default declareTool({
  // Work shape v1 — exactly what the workbench's Check submits:
  //   intervals       [{ i, j, dx, dy, rate }]  each recorded interval: the two
  //                   row indexes the student picked and the three values they
  //                   typed for it (text, fractions like "1/2" allowed). The
  //                   workbench's own state calls this list `evidence`; it
  //                   travels as `intervals` so it can never be mistaken for
  //                   (or stripped as) a verdict's evidence.
  //   classification  '' | 'linear' | 'nonlinear'
  //   repairRowIndex  null | row index chosen as the offending row (repairValue)
  //   repairedValue   typed corrected y-value (repairValue)
  //   m, b, equation  typed slope, intercept and equation (deriveEquation)
  contractVersion: 1,
  defaultMode: 'constantRate',
  resolveMode: resolveLinearTableWorkbenchMode,
  modes: {
    constantRate: SHARED,
    deriveEquation: SHARED,
    repairValue: SHARED,
  },
});
