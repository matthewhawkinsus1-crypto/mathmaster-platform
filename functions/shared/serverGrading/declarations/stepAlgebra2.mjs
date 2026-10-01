/*
 * Grading declaration for the `stepAlgebra2` registry tool.
 *
 * WHICH stepAlgebra2 QUESTIONS STILL REACH THIS TOOL.
 *
 * Every host applies assignmentRuntimeRepair before rendering — QuestionEngine
 * through prepareQuestionForRuntimeRouting, the server through
 * deliveredQuestionForGrading — and that repair moves most stored
 * stepAlgebra2 questions onto the mature `stepAlgebra` engine, whose own
 * surface grades them:
 *
 *   mode (any letter case) "linearIntercepts"                   -> stepAlgebra
 *   mode "rewriteLinearForm", targetForm not "factoredlinear"   -> stepAlgebra
 *   no mode, `equation` a text equation ("3x + 6 = 21")         -> stepAlgebra
 *
 * What is left on this tool:
 *
 *   default            the legacy ax + b = c balance solver: a mode-less
 *                      question whose `equation` is {a, b, c} (or missing —
 *                      the solver then opens 3x + 6 = 21), and any question
 *                      whose `mode` is not exactly one of the two below.
 *   rewriteLinearForm  `mode: "rewriteLinearForm"` with a factored-linear
 *                      target (the mature engine has no factored objective).
 *
 * The mode is the one StepAlgebra2.jsx renders: it compares `mode` exactly,
 * so "RewriteLinearForm" opens the default solver, never the rewrite screen.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/stepAlgebra2.mjs.
 */
import { SHARED, clientGraded, declareTool } from '../toolGraderDefinition.mjs';

/** The view StepAlgebra2.jsx renders for a question (exact `mode` match). */
export const resolveStepAlgebra2Mode = (question = {}) => {
  if (question?.mode === 'rewriteLinearForm') return 'rewriteLinearForm';
  if (question?.mode === 'linearIntercepts') return 'linearIntercepts';
  return 'default';
};

export default declareTool({
  // Work shape v1 — student work only, never the stored equation or a verdict:
  //   default            { steps: [{ operation, operand }], stepCount }
  //                      every balanced move, in order; the grader replays
  //                      them on the question's own equation.
  //   rewriteLinearForm  { equation: { left, right }, steps: [{ left, right }] }
  //                      the current equation, and the equation after each
  //                      committed step.
  contractVersion: 1,
  defaultMode: 'default',
  resolveMode: resolveStepAlgebra2Mode,
  modes: {
    default: SHARED,
    rewriteLinearForm: SHARED,
    linearIntercepts: clientGraded(
      'Never rendered by this registry tool on a path the manifest grades: assignmentRuntimeRepair '
      + '(consolidateStepAlgebra2Question) rewrites every stored stepAlgebra2 question whose mode is '
      + 'linearIntercepts, in any letter case, to type stepAlgebra before QuestionEngine renders it and '
      + 'before the server grades it (deliveredQuestionForGrading), so the stepAlgebra surface owns its '
      + 'grade. The registry LinearIntercepts view mounts only where QuestionEngine skips that repair '
      + '(serverGrading hosts), and those send raw work to their own server subsystem. Declared non-shared '
      + 'so an unrepaired linearIntercepts question fails closed instead of being marked by the ax + b = c '
      + 'solver grader.',
    ),
  },
});
