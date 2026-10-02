/*
 * Grading declaration for the `expressionMeaning` registry tool.
 *
 * One view (ExpressionMeaning.jsx never reads `question.mode`): a meaning
 * matrix where, for every authored expression, the student picks a unit, a
 * contextual meaning and a mathematical role. Each pick is checked against
 * the question's own authored expressions, which the server holds, so the
 * mode is server graded.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/expressionMeaning.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — what the matrix's Submit sends:
  //   selections  [{ id, unit, contextMeaning, mathRole }]  one entry per
  //               authored expression, in matrix order: the option the
  //               student chose for each dimension, as the bank holds it
  //               (text, or a number/boolean option; '' when not chosen yet).
  // An array carrying the authored id as a VALUE, never an object keyed by
  // it: the response contract strips keys such as `score`, `expected` or
  // `__proto__` at every depth, so an expression authored with that id would
  // otherwise arrive blank and be marked wrong however it was answered.
  contractVersion: 1,
  defaultMode: 'default',
  modes: {
    default: SHARED,
  },
});
