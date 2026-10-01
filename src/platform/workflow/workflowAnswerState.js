/*
 * WHAT A COMPOSED QUESTION REPORTS TO QUESTIONENGINE AS ITS ANSWER STATE.
 *
 * WorkflowRunner holds the stage responses; this turns them into the
 * `answerState` every question reports (isComplete, isCorrect, parts, partial
 * credit, responseKey, questionDetails) plus the structured `toolResponse` that
 * travels with the attempt.
 *
 * THE VERDICT COMES FROM THE SHARED GRADER. The stage responses become student
 * work (`{ responses }`, composedWorkflowContract.mjs), are serialized into the
 * exact tool response the server will read, and are marked by
 * functions/shared/serverGrading/questionGraders/composedWorkflow.mjs — the
 * function ingestion, the deadline finalizer and Recovery run on the same
 * bytes. answerStateFromSharedGrading applies the same attempt mapping the
 * server applies, so Submit records what the server would record.
 *
 * A question the shared grader declines (a graph-construction stage, whose
 * mark lives in InteractiveGraphWorkspace; see the declaration's blocker) is
 * still marked here by gradeWorkflow on the raw responses, as it always was,
 * and is declared client-graded so the server keeps that record bounded rather
 * than re-marking it. So are the two responses the shared grader declines for
 * the server's sake (DEVICE_MARKED_REASONS).
 *
 * Pure: no React.
 */
import { gradeComposedWorkflowCheck } from '../../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { composedWorkflowWork } from '../../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { answerStateFromSharedGrading } from '../grading/sharedAnswerState.js';
import { describeWorkflowResponses, gradeWorkflow } from './workflowGrading.js';

// The shared grader declines these responses for reasons the server shares —
// it cannot read an oversize response, and it will not run unsafe student
// text (ingestion holds that attempt for review). The device's marking is
// still computed for the screen, but QuestionEngine records no attempt while
// `sharedGradingWithheld` is set.
const DEVICE_MARKED_REASONS = new Set(['oversize-response', 'unsafe-expression']);

export const buildWorkflowAnswerState = ({ question, stages = [], responses = {}, grading = null } = {}) => {
  const check = gradeComposedWorkflowCheck(question, composedWorkflowWork(responses));
  if (check.supported && !DEVICE_MARKED_REASONS.has(check.reason)) {
    const state = answerStateFromSharedGrading(check, {
      questionDetails: describeWorkflowResponses(stages, responses),
    });
    return {
      ...state,
      gradedCount: state.parts.filter((part) => part?.graded !== false).length,
    };
  }
  // Declared client-graded for this question: the device's own marking,
  // unchanged, with the student's bounded work attached for the record.
  // When the question IS server-graded but this work was declined, the reason
  // travels with the state (`sharedGradingWithheld`) so the host can tell
  // "marked on the device by declaration" from "the server will not mark this
  // work" — ingestion holds an unsafe-expression attempt for teacher review.
  return {
    ...gradeWorkflow({ stages, responses, grading }),
    toolResponse: check.toolResponse,
    ...(check.supported ? { sharedGradingWithheld: check.reason } : {}),
  };
};
