/*
 * WHAT A FORM-AWARE GRAPHING 2 QUESTION WILL CHECK, SAID BEFORE ANY CHECK.
 *
 * Under `constructionPolicy.strategy: 'formAware'` the grader requires the
 * piece the question's form exposes (functions/shared/toolMath/graphing2/
 * constructionPolicy.mjs): the y-intercept, the given point, the x-intercept,
 * or the intercepts. The note says so before the first point, so the student
 * is told what to show rather than learning it from a wrong-answer message.
 * With no such policy the grader takes any two points on the line, and there
 * is no note. It never names a coordinate.
 *
 * On an exit ticket, quiz or test a sentence that names a route is shown only
 * where the grader requires that route, and then it says what will be checked
 * (the owner, 2026-10-23, B-92 / C1-134). Factored form's note also says how
 * to find the second point ("use the slope"), but its grader takes any second
 * point on the line. So where the method is withheld the note says only what
 * is checked, as the Representation Bridge's graph stage does.
 */
export const anchorInstruction = (mode, policy, { methodWithheld = false } = {}) => {
  if (policy?.strategy !== 'formAware') return null;
  if (mode === 'slopeIntercept') return 'This question requires you to plot the y-intercept as one of your points.';
  if (mode === 'factoredLinear') {
    return methodWithheld
      ? 'This question requires you to plot the x-intercept yourself, and a second point on your line.'
      : 'This question requires you to plot the x-intercept yourself, then use the slope for another point.';
  }
  if (mode === 'pointSlope') return 'This question requires you to plot the given point yourself — it is not already on the graph.';
  if (mode === 'standardForm') return 'This question requires you to plot the line’s intercept(s) as your evidence, not just any two points on the line.';
  return null;
};
