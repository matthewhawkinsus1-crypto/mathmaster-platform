/*
 * THE ANSWER STATE OF A QUESTION GRADED BY A SHARED STRUCTURED GRADER.
 *
 * Ordinary graders report `answerState` to QuestionEngine through
 * onStateChange. A question type whose verdict comes from a shared grader
 * (functions/shared/serverGrading/tools/<type>.mjs, via gradeToolCheck)
 * builds that state here, through the SAME mapping the server applies to the
 * same work (attemptInputsFromGrading) — so the parts, partial credit and
 * verdict a manual Submit records are the ones ingestion, a deadline or a
 * delayed queue would record. `toolResponse` carries the raw work.
 */
import { attemptInputsFromGrading } from '../../../functions/shared/serverGrading/gradingResult.mjs';

export const answerStateFromSharedGrading = (result, { questionDetails = '' } = {}) => {
  const graded = result?.graded === true;
  const inputs = attemptInputsFromGrading(graded ? result : { isCorrect: false, score: 0, parts: [] });
  return {
    isComplete: graded && result.isComplete === true,
    isCorrect: graded && inputs.isCorrect,
    responseKey: result?.toolResponse?.value || '',
    questionDetails,
    parts: inputs.parts,
    partialCreditPercent: graded ? inputs.partialCreditPercent : null,
    toolResponse: result?.toolResponse || null,
  };
};
