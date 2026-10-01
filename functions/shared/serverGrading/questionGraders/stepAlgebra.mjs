/*
 * Shared grader for Step Algebra (`stepAlgebra` and its `algebra` alias):
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 *
 * Three response shapes reach it:
 *
 *   - the structured tool response every workspace now reports
 *     (`answerState.toolResponse`, toolId `stepAlgebra`) — the work is read
 *     out of it and marked by the shared grader the workspace itself ran
 *     (../stepAlgebraWorkspaceGrading.mjs);
 *   - a Question Family instance's old final-answer response (`x = 5|{}`),
 *     still marked by the instance's generated answer exactly as before
 *     (../stepAlgebraFinalAnswer.mjs) — Recovery and queued submissions; a
 *     final that parser cannot read is re-read by the shared grader against
 *     the same generated answer;
 *   - any other pre-contract response (`<final>|<JSON>`), rebuilt into the
 *     work shape and marked by the same shared grader.
 *
 * Nothing the response claims about itself (a verdict, a score, an objective)
 * is read: only the final work, against the authoritative question.
 */
import { ungradedResult } from '../gradingResult.mjs';
import { gradeStepAlgebraFinalAnswer } from '../stepAlgebraFinalAnswer.mjs';
import { hasGeneratedAnswer } from '../stepAlgebraRouting.mjs';
import { isToolResponse, readToolWork } from '../toolResponseContract.mjs';
import {
  STEP_ALGEBRA_TOOL_ID,
  legacyKeyReadsFaithfully,
  legacyStepAlgebraWork,
  stepAlgebraWorkGrader,
} from '../stepAlgebraWorkspaceGrading.mjs';

const text = (value) => String(value ?? '');

/** Read the work out of a structured response and grade it with `grader`. */
export const gradeStepAlgebraToolResponse = (question, response, grader) => {
  if (text(response?.toolId) !== grader.toolId) return ungradedResult('response-tool-mismatch');
  const claimedVersion = Math.max(1, Math.floor(Number(response?.contractVersion) || 1));
  // A newer client than this server: the work is kept, the verdict waits.
  if (claimedVersion > grader.contractVersion) return ungradedResult('response-contract-newer-than-server');
  const work = readToolWork(response);
  if (!work.ok) return ungradedResult(work.reason);
  return grader.grade(question, work.work);
};

/**
 * A pre-contract response rebuilt into work. accepts() only lets through keys
 * that read back faithfully (legacyKeyReadsFaithfully); these guards hold the
 * rest rather than mark them wrong:
 *
 *   - a relation solve that had to be represented on a number line carried
 *     only the nested verdict, never the graph;
 *   - the old workspaces wrote a key ONLY for finished work (the key was ''
 *     until the work was complete, and Submit needs complete work), so a key
 *     that reads back as unfinished was misread — or forged.
 */
export const gradeLegacyStepAlgebraValue = (question, value, grader, { literal = false } = {}) => {
  const work = legacyStepAlgebraWork(question, value, { literal });
  if (!work) return ungradedResult('legacy-response-unreadable');
  const result = grader.grade(question, work);
  if (result.graded && result.parts.some((part) => part.id === 'solution-representations')) {
    return ungradedResult('legacy-response-missing-representation');
  }
  if (result.graded && !result.isComplete) return ungradedResult('legacy-response-unreadable');
  return result;
};

const familyInstanceResult = (question, response) => {
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


const grade = (question, response) => {
  if (isToolResponse(response)) return gradeStepAlgebraToolResponse(question, response, stepAlgebraWorkGrader);
  if (hasGeneratedAnswer(question)) {
    const family = familyInstanceResult(question, response);
    // The final-answer parser reads numeric LaTeX only. A final it cannot
    // read (an unsimplified product such as `n = -2\left(2\right)`, which the
    // workspace accepts as solved) is re-read by the shared grader — still
    // against the instance's generated answer — rather than left unmarked.
    if (family.graded || family.reason !== 'step-answer-unparseable') return family;
    return gradeLegacyStepAlgebraValue(question, response?.value, stepAlgebraWorkGrader);
  }
  return gradeLegacyStepAlgebraValue(question, response?.value, stepAlgebraWorkGrader);
};

export default Object.freeze({
  // A structured response for THIS surface, or a pre-contract response key
  // (`<final equation>|<prompt answers JSON>`, the relation text, the
  // intercept pairs) that reads back as exactly the work it stood for. Any
  // other old key keeps the sanitized legacy path at ingestion.
  accepts: (response) => {
    if (!response || typeof response !== 'object') return false;
    if (isToolResponse(response)) return text(response.toolId) === STEP_ALGEBRA_TOOL_ID;
    return legacyKeyReadsFaithfully(response.value);
  },
  grade,
});
