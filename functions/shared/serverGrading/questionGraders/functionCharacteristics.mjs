/*
 * Grader slot for the BARE `functionCharacteristics` question surface:
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 *
 * Declared non-graded (../declarations/types/functionCharacteristics.mjs): without a `recipe` or
 * `workflow` the question cannot be rendered or submitted, so there is no
 * attempt to mark. With one it is the composedWorkflow surface, marked by
 * ./composedWorkflow.mjs. This slot accepts nothing.
 */
import { ungradedResult } from '../gradingResult.mjs';

export default Object.freeze({
  accepts: () => false,
  grade: () => ungradedResult('non-graded-surface:functionCharacteristics'),
});
