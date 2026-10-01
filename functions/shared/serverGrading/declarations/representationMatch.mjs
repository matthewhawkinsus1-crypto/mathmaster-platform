/*
 * Grading declaration for the `representationMatch` registry tool.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/representationMatch.mjs.
 */
import { clientGraded, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  contractVersion: 1,
  defaultMode: 'default',
  modes: {
    default: clientGraded('PENDING: shared server grader not yet implemented for representationMatch.'),
  },
});
