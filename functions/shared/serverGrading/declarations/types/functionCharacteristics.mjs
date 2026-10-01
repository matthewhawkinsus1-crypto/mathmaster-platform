/*
 * Grading declaration for the BARE `functionCharacteristics` question surface.
 *
 * A `functionCharacteristics` question that carries a `recipe` or a `workflow`
 * is a composed question: resolveGradingSurfaceId routes it to the
 * `composedWorkflow` surface (./composedWorkflow.mjs), exactly as
 * QuestionEngine routes it to WorkflowRunner. What reaches THIS declaration is
 * the bare type, which QuestionEngine cannot render: it is not composed
 * (readRecipeRequest needs a `recipe` before the catalogued
 * functionCharacteristics recipe can expand), it is not a registry tool, and
 * QuestionEngine's type switch has no case for it, so the student sees the
 * "This question could not be displayed" panel. Its answer state never becomes
 * complete, Submit stays disabled, and no attempt exists to grade.
 *
 * Light: declarations only. The grader is
 * ../../questionGraders/functionCharacteristics.mjs.
 */
import { declareNonGraded } from '../../surfaceDeclarations.mjs';

export default declareNonGraded({
  reason: 'A bare `functionCharacteristics` question (no `recipe` and no `workflow`) is not composed, is not a registry tool and '
    + 'has no QuestionEngine case, so it renders the "could not be displayed" panel: its answer state never '
    + 'completes, Submit stays disabled and no attempt is recorded. With a recipe or workflow it is graded as '
    + 'the composedWorkflow surface.',
});
