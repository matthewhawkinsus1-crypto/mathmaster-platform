/*
 * MARKING THE NON-TOOL SURFACES: ordinary question types and the question
 * graders (Step Algebra's family final answer).
 *
 * The LIGHT half of the dispatch: no registry tool grader is loaded here, so
 * a caller on the student app's startup path (teacher Pre-Flight's answer-key
 * self-check, for one) can mark these without downloading every tool.
 * serverResponseGrading.mjs delegates here for every non-tool surface, so
 * there is still exactly one implementation of each.
 *
 * Pure.
 */
import { gradeOrdinaryResponse, responseIsBlank } from '../ordinaryResponseGrading.mjs';
import { GRADING_MANIFEST } from './gradingManifest.mjs';
import { ungradedResult } from './gradingResult.mjs';
import { serverResponseGradingSupport } from './gradingSupport.mjs';
import { isToolResponse } from './toolResponseContract.mjs';
import { resolveGradingSurfaceId } from './gradingManifest.mjs';
import composedWorkflow from './questionGraders/composedWorkflow.mjs';
import figureMatch from './questionGraders/figureMatch.mjs';
import fraction from './questionGraders/fraction.mjs';
import functionCharacteristics from './questionGraders/functionCharacteristics.mjs';
import graphChoicePreview from './questionGraders/graphChoicePreview.mjs';
import literalWorkspace from './questionGraders/literalWorkspace.mjs';
import numberLine from './questionGraders/numberLine.mjs';
import stepAlgebra from './questionGraders/stepAlgebra.mjs';


/*
 * Question-type graders that are neither ordinary nor tools, one module per
 * surface (./questionGraders/<surface>.mjs): { accepts(response), grade(question, response) }.
 */
export const QUESTION_GRADERS = Object.freeze({
  stepAlgebra,
  algebra: stepAlgebra,
  literalWorkspace,
  fraction,
  numberLine,
  composedWorkflow,
  functionCharacteristics,
  figureMatch,
  graphChoicePreview,
});

/**
 * Will this surface's question grader read this response shape? A response it
 * will not read (an older client's opaque string) keeps the bounded legacy
 * path at ingestion rather than being blocked.
 */
export const questionGraderAccepts = (question, response) => {
  const surfaceId = resolveGradingSurfaceId(question);
  const grader = QUESTION_GRADERS[surfaceId];
  if (!grader || GRADING_MANIFEST[surfaceId]?.kind !== 'question') return true;
  try {
    return grader.accepts(response) === true;
  } catch {
    return false;
  }
};

/**
 * Mark a response to an ordinary type or a question-grader surface. A
 * registry tool question is answered `graded: false` (reason
 * `tool-surface-needs-tool-grader`) — use serverResponseGrading.mjs.
 */
export const gradeQuestionResponse = ({ question, response } = {}) => {
  const support = serverResponseGradingSupport(question);
  const surfaceId = support.surfaceId;
  if (!support.supported) return { ...ungradedResult(support.reason), surfaceId, mode: support.mode || null };
  const declaration = GRADING_MANIFEST[surfaceId];

  if (declaration.kind === 'ordinary') {
    if (isToolResponse(response)) return { ...ungradedResult('response-shape-mismatch'), surfaceId, mode: null };
    const ordinary = gradeOrdinaryResponse({ question, response });
    if (!ordinary.graded) return { ...ungradedResult(ordinary.reason), parts: ordinary.parts || [], surfaceId, mode: null };
    return {
      ...ordinary,
      score: ordinary.isCorrect ? 1 : 0,
      surfaceId,
      graderVersion: declaration.graderVersion,
      mode: null,
    };
  }

  if (declaration.kind === 'question') {
    const grader = QUESTION_GRADERS[surfaceId];
    if (!grader) return { ...ungradedResult(`no-question-grader:${surfaceId}`), surfaceId, mode: null };
    if (!response || typeof response !== 'object' || responseIsBlank(response)) {
      return { ...ungradedResult('blank-response'), surfaceId, mode: null };
    }
    if (!questionGraderAccepts(question, response)) return { ...ungradedResult('response-shape-not-accepted'), surfaceId, mode: null };
    let result;
    try {
      result = grader.grade(question, response);
    } catch (error) {
      result = ungradedResult('malformed-response', { detail: String(error?.message || '').slice(0, 200) });
    }
    return { ...result, surfaceId, graderVersion: declaration.graderVersion, mode: support.mode || null };
  }

  return { ...ungradedResult('tool-surface-needs-tool-grader'), surfaceId, mode: support.mode || null };
};
