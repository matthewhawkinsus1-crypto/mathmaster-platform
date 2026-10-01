/*
 * Shared grader for Step Algebra (`stepAlgebra` and its `algebra` alias):
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 */
import { ungradedResult } from '../gradingResult.mjs';
import { gradeStepAlgebraFinalAnswer } from '../stepAlgebraFinalAnswer.mjs';

const text = (value) => String(value ?? '');

const grade = (question, response) => {
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

export default Object.freeze({
  // The workspace's response key: `<final equation>|<prompt answers JSON>`.
  accepts: (response) => Boolean(response) && typeof response === 'object' && text(response.value).trim() !== '',
  grade,
});
