/*
 * Grading declaration for the `functionOperationsLab` registry tool.
 *
 * The lab has ONE view: an expression box for each requested operation (and,
 * for a quotient, the excluded x-values). Every expected expression and
 * exclusion is derived from the question's own f, g, operations, composeOrder
 * and restrictions — nothing the browser holds that the server does not.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/functionOperationsLab.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  // Work shape v1 — exactly the state the lab's inputs hold:
  //   functionOperations  {
  //     responses:    { sum?, difference?, product?, quotient?, composition? }
  //                   one typed expression (MathInput text) per operation
  //     restrictions: the typed excluded x-values, comma-separated ('' = none)
  //   }
  contractVersion: 1,
  // FunctionOperationsLab.jsx never reads `questionData.mode`: every question,
  // whatever its mode field says, renders the one operations view.
  defaultMode: 'functionOperations',
  resolveMode: () => 'functionOperations',
  modes: {
    functionOperations: SHARED,
  },
});
