/*
 * WHAT THE STUDENT-BUILD INEQUALITY CHECKS MAY SAY BEFORE SUBMIT.
 *
 * The student-build systems-of-inequalities mode walks a student through each
 * constraint — boundary, solid or dashed, which side to shade — and then the
 * reasoning about the combined region: its classification, test points and
 * vertices. Each has its own "Check" button. Where the activity shows outcomes
 * at once those checks are verdicts ("Correct boundary.", "Correct shading.",
 * "Correct — every part of your reasoning…"), the constraint chips tick only
 * when a step is right, and the overlap stays locked "until every constraint
 * above is correct". That is good practice.
 *
 * On a DOL, quiz or test (ToolRuntimeContext.showImmediateFeedback false) it is
 * a free answer key: solid or dashed is a two-way guess the Check settles, the
 * shading another, and the lock on the overlap says the constraints are right
 * the moment it opens. So without outcomes:
 *
 *   - a check says only whether that step is FINISHED, never whether it is
 *     right, in the same words for right and wrong work;
 *   - a chip ticks once its step is finished;
 *   - the overlap opens once every constraint is finished;
 *   - a vertex snaps only to the corners of the student's OWN region, never to
 *     the true corners (a magnet that finds the answer is a verdict too);
 *   - the boundary questions under the student's own test point appear when it
 *     is on one of the student's OWN lines, never because it is on a true one;
 *   - each constraint is graded at submission from the work as it stands.
 *
 * Nothing here grades. The grade is the workspace's shared grader's, the
 * function the server runs (serverGrading/tools/systemsWorkspace/graphical.mjs):
 * the screen's work carries `outcomesWithheld` where they are withheld, and the
 * grader then marks each constraint as it stands instead of checked-and-right.
 *
 * With outcomes shown, everything below is exactly the behaviour practice had.
 * No React here, so it is tested in node (tests/platform/inequalityBuildOutcomePolicy).
 */

export const INEQUALITY_BUILD_STEPS = Object.freeze(['boundary', 'lineStyle', 'shading']);

// Where each step keeps how many times its Check was pressed.
const ATTEMPT_FIELD = Object.freeze({ boundary: 'boundaryAttempts', lineStyle: 'styleAttempts', shading: 'shadeAttempts' });

/**
 * @param showImmediateFeedback  false on a DOL, quiz or test
 * @param buildConfig            which steps the question asks the student to build
 * @param build                  the student's per-constraint build entries
 * @param constraintCount        how many constraints the question has
 * @param rewriteVerified(i)     the constraint's rewrite is finished (or not asked)
 * @param stepCorrect(i, step)   that step's work, as it stands, is right
 * @param stepFinished(i, step)  that step's work is all there — never compared with the answer
 * @param stepCheckedAsItStands(i, step)
 *                               the step's work is still the work its last Check
 *                               was about (inequalityBuildFlow.js). A step edited
 *                               after its Check is not checked again until the
 *                               student presses Check, and its old line goes:
 *                               otherwise dragging a point after one Check turned
 *                               the tick on and off live.
 */
export const resolveInequalityBuildGate = ({
  showImmediateFeedback = true,
  buildConfig = {},
  build = [],
  constraintCount = 0,
  rewriteVerified = () => true,
  stepCorrect = () => false,
  stepFinished = () => false,
  stepCheckedAsItStands = () => true,
} = {}) => {
  const verdictsShown = showImmediateFeedback !== false;
  const entries = Array.isArray(build) ? build : [];
  const enabled = (step) => Boolean(buildConfig?.[step]);
  const checked = (index, step) => Number(entries[index]?.[ATTEMPT_FIELD[step]]) > 0
    && Boolean(stepCheckedAsItStands(index, step));
  const indices = Array.from({ length: Math.max(0, Number(constraintCount) || 0) }, (_, index) => index);

  // Whether a step counts as done: checked and right where outcomes are
  // shown (unchanged practice), finished where they are withheld.
  const stepDone = (index, step) => !enabled(step) || (verdictsShown
    ? checked(index, step) && Boolean(stepCorrect(index, step))
    : Boolean(stepFinished(index, step)));
  const constraintDone = (index) => Boolean(rewriteVerified(index)) && INEQUALITY_BUILD_STEPS.every((step) => stepDone(index, step));

  return {
    verdictsShown,
    stepDone,
    constraintDone,
    // Whether "Find overlap / Combine regions" is open.
    allConstraintsDone: indices.length > 0 && indices.every(constraintDone),
    // The line under a step's Check, once pressed: a verdict, or only whether
    // the step is finished.
    stepReport: (index, step) => {
      if (!enabled(step) || !checked(index, step)) return null;
      return verdictsShown
        ? { kind: 'verdict', passed: Boolean(stepCorrect(index, step)) }
        : { kind: 'completion', complete: Boolean(stepFinished(index, step)) };
    },
    // The same for a reasoning check (classification, a test point, a vertex).
    reasoningReport: ({ pressed = false, complete = false, correct = false } = {}) => {
      if (!pressed) return null;
      return verdictsShown
        ? { kind: 'verdict', passed: Boolean(correct) }
        : { kind: 'completion', complete: Boolean(complete) };
    },
    // May a tapped vertex snap to a TRUE corner of the region?
    snapToExpectedVertices: verdictsShown,
    // The "Does this point lie exactly on one of the boundary lines?" questions
    // under the student's OWN test point appear only when the point is on a
    // boundary. Measured against the TRUE boundaries, their appearance tells a
    // student who taps along a line they built whether that line is right; so
    // where outcomes are withheld it is measured against the student's own
    // lines. (A teacher's point is the question's content: unchanged.)
    probeFromOwnLines: !verdictsShown,
  };
};

/** The completion line for one build step, in the words every student gets. */
export const INEQUALITY_STEP_COMPLETION_TEXT = Object.freeze({
  boundary: {
    complete: 'Boundary recorded. It is graded when you submit.',
    incomplete: 'Not finished yet — choose a method and finish your boundary line.',
  },
  lineStyle: {
    complete: 'Line style recorded. It is graded when you submit.',
    incomplete: 'Not finished yet — choose solid or dashed.',
  },
  shading: {
    complete: 'Shading recorded. It is graded when you submit.',
    incomplete: 'Not finished yet — tap the side of your boundary to shade.',
  },
});

export const REASONING_COMPLETION_TEXT = Object.freeze({
  complete: 'Recorded. It is graded when you submit.',
  incomplete: 'Not finished yet — answer every part above.',
});
