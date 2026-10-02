/*
 * Grader slot for the `numberLine` question surface:
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 *
 * Declared client-graded (../declarations/types/numberLine.mjs): the server cannot
 * rebuild the per-student instance QuestionEngine generates, so there is no
 * server verdict to give. The browser's verdict comes from the shared
 * ordinary grader (ordinaryResponseGrading.mjs) and is bounded at ingestion.
 * This slot accepts nothing, so it can never mark the stored, overwritten
 * question by mistake.
 */
import { ungradedResult } from '../gradingResult.mjs';

export default Object.freeze({
  accepts: () => false,
  grade: () => ungradedResult('client-graded-surface:numberLine'),
});
