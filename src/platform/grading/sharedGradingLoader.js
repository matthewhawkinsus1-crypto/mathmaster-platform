/*
 * THE SHARED GRADERS, LOADED WHEN A STUDENT FIRST NEEDS ONE.
 *
 * functions/shared/serverGrading/serverResponseGrading.mjs imports every
 * registry tool's grader — and through them each tool's mathematics and
 * mathjs. Putting that in the main bundle would make every student download
 * every tool to open any assignment. So QuestionEngine loads it here, once,
 * the first time a registry tool reports work or is checked; the tool itself
 * already holds its own grader in its own lazy chunk, which is what decides
 * the feedback the student sees instantly.
 *
 * A failed load is not cached: the next call tries again (a flaky Chromebook
 * connection must not disable shared grading for the rest of the session).
 */
let pending = null;

export const loadSharedGrading = () => {
  if (!pending) {
    pending = import('../../../functions/shared/serverGrading/serverResponseGrading.mjs').catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
};
