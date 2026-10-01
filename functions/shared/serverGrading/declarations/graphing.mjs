/*
 * Grading declaration for the `graphing` structured question surface — a question
 * type rendered by QuestionEngine (not a registry tool) whose verdict comes
 * from a shared grader over a structured raw response (toolResponseContract).
 *
 * Light by design. The mathematics is in ../tools/graphing.mjs.
 */
import { clientGraded, declareTool } from '../toolGraderDefinition.mjs';

export default declareTool({
  contractVersion: 1,
  defaultMode: 'default',
  modes: {
    default: clientGraded('PENDING: shared server grader not yet implemented for graphing.'),
  },
});
