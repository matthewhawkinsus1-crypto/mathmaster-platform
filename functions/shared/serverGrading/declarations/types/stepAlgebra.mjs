/*
 * Grading declaration for Step Algebra (`stepAlgebra`, and the retired
 * `algebra` alias that renders the same workspace).
 *
 * A Question Family instance carries its generated answer, so the server can
 * confirm the student's FINAL equation isolates the variable at the instance's
 * value (../../stepAlgebraFinalAnswer.mjs).
 *
 * Light: declarations only. The grader is ../../questionGraders/stepAlgebra.mjs.
 */
import { declareQuestionGrader } from '../../surfaceDeclarations.mjs';

export default declareQuestionGrader({
  graderVersion: 'step-algebra-final-answer-v1',
  supports: (question) => (
    Number.isFinite(Number(question?.generatedAnswer))
      ? { supported: true }
      : { supported: false, reason: 'no-step-answer-key' }
  ),
  blocker: 'PENDING: grading audit for authored (non-family) Step Algebra questions.',
});
