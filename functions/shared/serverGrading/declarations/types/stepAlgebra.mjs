/*
 * Grading declaration for Step Algebra (`stepAlgebra`, and the retired
 * `algebra` alias that renders the same workspace).
 *
 * EVERY ROUTE IS SHARED. QuestionEngine opens one of three engines
 * (../../stepAlgebraRouting.mjs resolveStepAlgebraMode — the same function the
 * renderer's route calls), and each reports its work through the structured
 * response contract (`answerState.toolResponse`, toolId `stepAlgebra`):
 *
 *   equation          { equation: { left, right }, promptAnswers: [{ id, value }] }
 *                     StepByStepAlgebraCore: isolate, slope-intercept,
 *                     factored-linear and standard-form objectives, prompts.
 *   relation          { relation: { branches, connective, special },
 *                       awaitingSymbolDecision, candidateChecks: [{ candidate, choice }],
 *                       representation: { intervals, notation, inequality } | null }
 *                     MultiRelationAlgebraCore: inequalities, absolute value,
 *                     x^2, candidate checks, number-line representations.
 *   linearIntercepts  { xIntercept, yIntercept }   (`stepAlgebra` only)
 *
 * The grader (../../stepAlgebraWorkspaceGrading.mjs) marks the FINAL work:
 * solved for the question's own objective AND the same solutions as the
 * question's original equation (a Question Family instance: its generated
 * answer). The pre-contract response (`<final>|<JSON>`) is still read, so an
 * offline queue from an older client is graded the same way.
 *
 * Light: declarations only. The grader is ../../questionGraders/stepAlgebra.mjs.
 */
import { GRADING_AUTHORITY } from '../../gradingAuthority.mjs';
import { declareQuestionGrader } from '../../surfaceDeclarations.mjs';
import { withPromptRelationSource } from '../../../runtime/stepAlgebraRelationRouting.mjs';
import {
  STEP_ALGEBRA_MODES,
  hasGeneratedAnswer,
  linearInterceptSourcePresent,
  relationSourceFromQuestion,
  resolveStepAlgebraMode,
  stepAlgebraEquationSourcePresent,
} from '../../stepAlgebraRouting.mjs';

const UNREADABLE = 'A Step Algebra question with no equation the workspace can read (equation, equationAscii, '
  + 'initialEquation, equationLatex or leftExpression/rightExpression; a relation source; or an intercept line) '
  + 'opens "This question could not be loaded" on every device. It produces no work, so there is nothing to grade.';

/** Can the workspace this question opens read anything to solve? */
const readableFor = (question, mode) => {
  if (mode === STEP_ALGEBRA_MODES.RELATION) return Boolean(relationSourceFromQuestion(withPromptRelationSource(question)));
  if (mode === STEP_ALGEBRA_MODES.LINEAR_INTERCEPTS) return linearInterceptSourcePresent(question);
  // A Question Family instance's old final-answer response is marked by its
  // generated answer alone (../../stepAlgebraFinalAnswer.mjs).
  return stepAlgebraEquationSourcePresent(question) || hasGeneratedAnswer(question);
};

export { resolveStepAlgebraMode };

export default declareQuestionGrader({
  graderVersion: 'step-algebra-workspace-v2',
  supports: (question) => {
    const mode = resolveStepAlgebraMode(question);
    return readableFor(question, mode)
      ? { supported: true, mode }
      : { supported: false, reason: 'no-readable-equation', mode, authority: GRADING_AUTHORITY.NON_GRADED, blocker: UNREADABLE };
  },
  blocker: UNREADABLE,
  fallbackAuthority: GRADING_AUTHORITY.NON_GRADED,
});
