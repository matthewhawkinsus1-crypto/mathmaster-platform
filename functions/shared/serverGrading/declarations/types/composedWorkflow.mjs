/*
 * Grading declaration for the `composedWorkflow` question surface — a question
 * defined by its workflow (an explicit `workflow`, or a `recipe` that expands
 * into one), whatever its `type`. resolveGradingSurfaceId routes every such
 * question here before any tool or type lookup, exactly as QuestionEngine
 * routes it to WorkflowRunner first.
 *
 * Server-authoritative per question: the shared grader marks the stage
 * responses with the same gradeWorkflow the browser runs. A graph-construction
 * stage (coordinatePlot / functionGraph) is re-marked from the workspace's raw
 * work against the graph rebuilt from the student's earlier stages, by the
 * shared graph-workspace grader (../../../toolMath/workflow/workflowGraphStage
 * .mjs). A question it cannot mark from the work alone — one with a
 * stage/figure/cell key the response contract would strip — is declined with
 * its exact reason and stays graded on the device
 * (../../../toolMath/workflow/composedWorkflowContract.mjs).
 *
 * Light: declarations only (no mathjs). The grader is
 * ../../questionGraders/composedWorkflow.mjs.
 */
import { declareQuestionGrader } from '../../surfaceDeclarations.mjs';
import {
  COMPOSED_WORKFLOW_BLOCKERS,
  composedWorkflowSupport,
} from '../../../toolMath/workflow/composedWorkflowContract.mjs';

export default declareQuestionGrader({
  graderVersion: 'composed-workflow-v1',
  supports: (question) => composedWorkflowSupport(question),
  // The fallback reason for a declined question. Each declined question also
  // reports its own specific blocker through `supports`.
  blocker: COMPOSED_WORKFLOW_BLOCKERS.unsafeKey,
  note: 'Graded from `{ responses }` (toolId composedWorkflow, contract v1) by gradeWorkflow; '
    + 'graph-construction stages are re-marked from their workspace work by the graph-workspace grader.',
});
