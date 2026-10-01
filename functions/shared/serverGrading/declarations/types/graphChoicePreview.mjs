/*
 * Grading declaration for the BARE `graphChoicePreview` question surface.
 *
 * A `graphChoicePreview` question that carries a `recipe` or a `workflow` is a
 * composed question: resolveGradingSurfaceId routes it to the
 * `composedWorkflow` surface (./composedWorkflow.mjs), exactly as
 * QuestionEngine routes it to WorkflowRunner. What reaches THIS declaration is
 * the bare type, which QuestionEngine cannot render: it is not composed (the
 * V5 compiler emits it as a one-stage `workflow` holding a multipleChoice
 * stage with `previewOnGraph`, and a hand-authored item without that workflow
 * has none), it is not a registry tool, and QuestionEngine's type switch has
 * no case for it, so the student sees the "This question could not be
 * displayed" panel. Its answer state never becomes complete, Submit stays
 * disabled, and no attempt exists to grade.
 *
 * Light: declarations only. The grader is
 * ../../questionGraders/graphChoicePreview.mjs.
 */
import { declareNonGraded } from '../../surfaceDeclarations.mjs';

export default declareNonGraded({
  reason: 'A bare `graphChoicePreview` question (no `recipe` and no `workflow`) is not composed, is not a registry tool and '
    + 'has no QuestionEngine case, so it renders the "could not be displayed" panel: its answer state never '
    + 'completes, Submit stays disabled and no attempt is recorded. With a recipe or workflow it is graded as '
    + 'the composedWorkflow surface.',
});
