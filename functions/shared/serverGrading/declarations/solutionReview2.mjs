/*
 * Grading declaration for `solutionReview2`.
 *
 * A read-only post-submission review: it shows the student's own submitted
 * work beside a worked solution and records nothing. There is no response to
 * grade, so it is declared non-graded rather than given an artificial grader.
 */
import { declareTool, nonGraded } from '../toolGraderDefinition.mjs';

export default declareTool({
  contractVersion: 1,
  defaultMode: 'review',
  modes: {
    review: nonGraded('Read-only post-submission solution review; it has no editable mathematical workspace and emits no attempt.'),
  },
});
