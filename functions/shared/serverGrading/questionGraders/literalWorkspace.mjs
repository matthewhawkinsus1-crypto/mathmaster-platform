/*
 * Shared grader for the `literalWorkspace` question surface:
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 * A response this grader does not accept (e.g. one queued by an older client)
 * takes the bounded legacy path at ingestion instead of being blocked.
 */
import { ungradedResult } from '../gradingResult.mjs';

export default Object.freeze({
  accepts: () => false,
  grade: () => ungradedResult('no-shared-grader:literalWorkspace'),
});
