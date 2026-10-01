/*
 * Shared grader for the `composedWorkflow` question surface:
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 * A response this grader does not accept (e.g. one queued by an older client)
 * takes the bounded legacy path at ingestion instead of being blocked.
 *
 * ONE MARKING, TWO CALLERS. WorkflowRunner marks a student's stages through
 * gradeComposedWorkflowCheck — which serializes the work into the exact tool
 * response the server will read and then calls `grade` below — and ingestion,
 * the deadline finalizer and Recovery reach `grade` through
 * questionResponseGrading.mjs. Both read the question the way WorkflowRunner
 * renders it (readComposedQuestion: runtime repair, then recipe expansion) and
 * mark it with gradeWorkflow, stage by stage, so the parts, partial credit and
 * verdict a student sees on Submit are the ones the gradebook records.
 *
 * The score is the workflow's own: weighted stage credit over the graded
 * stages, rounded to a whole percent and held at 90 until every graded stage
 * is right (workflowGrading.mjs gradeWorkflow). A stage nobody can mark (an
 * interpretation, a manual rubric) is reported `graded: false` and never
 * counts for or against the student.
 */
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { buildToolResponse, isToolResponse, readToolWork } from '../toolResponseContract.mjs';
import {
  COMPOSED_WORKFLOW_CONTRACT_VERSION,
  COMPOSED_WORKFLOW_TOOL_ID,
  resolveComposedWorkflow,
  withDerivedTableSources,
} from '../../toolMath/workflow/composedWorkflowContract.mjs';
import { unsafeExpressionStage } from '../../toolMath/workflow/expressionSafety.mjs';
import { activeStageIds } from '../../toolMath/workflow/questionWorkflow.mjs';
import { gradeWorkflow } from '../../toolMath/workflow/workflowGrading.mjs';

const text = (value) => String(value ?? '');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Mark normalized work (`{ responses }`) against the authoritative question.
 * Pure. The work must already have crossed the contract (readToolWork) — use
 * `grade` or gradeComposedWorkflowCheck, never raw browser state.
 */
export const gradeComposedWorkflowWork = (question, work) => {
  const { composed, support } = resolveComposedWorkflow(question);
  if (!support.supported) return ungradedResult(support.reason, { mode: support.mode || null });
  if (!isPlainObject(work)) return ungradedResult('empty-response', { mode: support.mode });
  // A tampered response with no stage map is a submission with nothing in it:
  // every stage unanswered, exactly what an empty workflow reports. What each
  // table was built from is rebuilt from the responses it copies, never read
  // from the work (composedWorkflowContract.mjs withDerivedTableSources).
  const sent = isPlainObject(work.responses) ? work.responses : {};
  const responses = withDerivedTableSources({ workflow: composed.workflow, content: composed.content, responses: sent });
  // Student text that would make the expression engine allocate, loop or
  // reconfigure itself is never run here (expressionSafety.mjs): no verdict,
  // and ingestion holds the attempt for review.
  const unsafeStage = unsafeExpressionStage({
    workflow: composed.workflow,
    grading: composed.grading,
    responses,
    active: activeStageIds(composed.workflow, responses),
  });
  if (unsafeStage) return ungradedResult('unsafe-expression', { mode: support.mode, detail: `stage:${unsafeStage}`.slice(0, 120) });
  const marked = gradeWorkflow({ stages: composed.workflow, responses, grading: composed.grading });
  const percent = Number(marked.partialCreditPercent);
  return {
    ...gradedResult({
      parts: marked.parts.map((part) => ({ ...part, response: sent[part.id] ?? '' })),
      isComplete: marked.isComplete,
      isCorrect: marked.isCorrect,
      // The workflow's own number (capped at 90 until all graded stages are
      // right); attemptInputsFromGrading turns it back into the same percent.
      score: marked.partialCreditPercent !== null && Number.isFinite(percent) ? percent / 100 : 0,
    }),
    mode: support.mode,
  };
};

const grade = (question, response) => {
  if (!isToolResponse(response) || text(response.toolId) !== COMPOSED_WORKFLOW_TOOL_ID) {
    return ungradedResult('response-tool-mismatch');
  }
  const claimedVersion = Math.max(1, Math.floor(Number(response.contractVersion) || 1));
  // A newer client than this server: the work is kept, the verdict waits.
  if (claimedVersion > COMPOSED_WORKFLOW_CONTRACT_VERSION) return ungradedResult('response-contract-newer-than-server');
  const read = readToolWork(response);
  if (!read.ok) return ungradedResult(read.reason);
  return gradeComposedWorkflowWork(question, read.work);
};

/**
 * The browser's Check: mark the work through the exact bytes the server will
 * parse (the same bounding, dropped keys and oversize refusal), and return the
 * tool response that travels with the attempt. `supported: false` means the
 * question is declared client-graded (see composedWorkflowContract.mjs) and
 * carries no shared verdict.
 */
export const gradeComposedWorkflowCheck = (question, work) => {
  const { support } = resolveComposedWorkflow(question);
  const toolResponse = buildToolResponse({
    question,
    toolId: COMPOSED_WORKFLOW_TOOL_ID,
    mode: support.mode,
    contractVersion: COMPOSED_WORKFLOW_CONTRACT_VERSION,
    work,
  });
  if (!support.supported) {
    return { ...ungradedResult(support.reason), mode: support.mode || null, supported: false, toolResponse };
  }
  return { ...grade(question, toolResponse), supported: true, toolResponse };
};

export default Object.freeze({
  // Only the structured composed-workflow response. A pre-contract client's
  // opaque `JSON.stringify(responses)` keeps the bounded legacy path.
  accepts: (response) => isToolResponse(response) && text(response.toolId) === COMPOSED_WORKFLOW_TOOL_ID,
  grade,
});
