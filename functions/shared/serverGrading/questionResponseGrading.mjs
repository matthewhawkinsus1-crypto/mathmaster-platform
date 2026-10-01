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
import { gradeStepAlgebraFinalAnswer } from './stepAlgebraFinalAnswer.mjs';
import { isToolResponse } from './toolResponseContract.mjs';

const text = (value) => String(value ?? '');

/*
 * Question-type graders that are neither ordinary nor tools. Keyed by surface
 * id; each takes (question, normalizedResponse) and returns the
 * gradingResult.mjs shape.
 */
const stepAlgebraGrader = (question, response) => {
  const result = gradeStepAlgebraFinalAnswer({ question, responseValue: response?.value });
  if (!result.graded) return ungradedResult(result.reason);
  return {
    graded: true,
    reason: null,
    isComplete: true,
    isCorrect: result.isCorrect === true,
    score: result.isCorrect === true ? 1 : 0,
    parts: [{
      id: 'algebra-objective',
      label: 'Final equation',
      isComplete: true,
      isCorrect: result.isCorrect === true,
      credit: result.isCorrect === true ? 1 : 0,
      weight: 1,
      response: text(response?.value).split('|')[0].slice(0, 240),
    }],
  };
};

export const QUESTION_GRADERS = Object.freeze({
  stepAlgebra: stepAlgebraGrader,
  algebra: stepAlgebraGrader,
});

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
    if (!response || typeof response !== 'object' || isToolResponse(response) || responseIsBlank(response)) {
      return { ...ungradedResult('blank-response'), surfaceId, mode: null };
    }
    return { ...grader(question, response), surfaceId, graderVersion: declaration.graderVersion, mode: support.mode || null };
  }

  return { ...ungradedResult('tool-surface-needs-tool-grader'), surfaceId, mode: support.mode || null };
};
