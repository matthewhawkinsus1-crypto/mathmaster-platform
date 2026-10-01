/*
 * Shared grader for the `literalWorkspace` question surface:
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 *
 * The question is the STORED literal question. The grader builds the
 * workspace question from it exactly as QuestionEngine does
 * (buildLiteralWorkspaceQuestion) and then:
 *
 *   - built: the work (a `literalWorkspace` tool response, or the pre-contract
 *     `<final equation>|<JSON>` key) is marked by the shared Step Algebra
 *     grader on the built question — the letter isolated, and the isolated
 *     side equivalent to the original formula;
 *   - not built: QuestionEngine showed the typed LiteralGrader, so the answer
 *     is an ordinary literal answer, marked by the ordinary literal grader.
 *
 * A scalar answer with no equals sign was typed into an answer box (a client
 * that predates the workspace, or a question edited since), never produced
 * by the workspace, whose answer is always an equation. It is marked as the
 * typed answer it is — never as an unreadable workspace equation.
 */
import { gradeOrdinaryResponse, serverGradingSupport as ordinaryServerGradingSupport } from '../../ordinaryResponseGrading.mjs';
import { ungradedResult } from '../gradingResult.mjs';
import { isToolResponse } from '../toolResponseContract.mjs';
import {
  LITERAL_WORKSPACE_SURFACE,
  legacyKeyReadsFaithfully,
  literalWorkspaceQuestion,
  literalWorkspaceWorkGrader,
} from '../stepAlgebraWorkspaceGrading.mjs';
import { gradeLegacyStepAlgebraValue, gradeStepAlgebraToolResponse } from './stepAlgebra.mjs';

const text = (value) => String(value ?? '');

const answerBox = (question, response) => {
  // The workspace could not be built, so the student saw the typed answer
  // box. Without `acceptedAnswers` the server holds no key for it: that is a
  // device-graded question (the declaration's documented blocker), which
  // ingestion records on the sanitized path rather than holding for review.
  if (!ordinaryServerGradingSupport(question).supported) return ungradedResult('mode-not-server-gradable:answerBox');
  const ordinary = gradeOrdinaryResponse({ question, response });
  if (!ordinary.graded) return { ...ungradedResult(ordinary.reason), parts: ordinary.parts || [] };
  return { ...ordinary, score: ordinary.isCorrect ? 1 : 0 };
};

const grade = (question, response) => {
  const built = literalWorkspaceQuestion(question);
  if (isToolResponse(response)) {
    if (!built.question) return ungradedResult('literal-workspace-unavailable');
    return gradeStepAlgebraToolResponse(question, response, literalWorkspaceWorkGrader);
  }
  if (!built.question) return answerBox(question, response);
  const typedAnswer = !text(response?.value).split('|')[0].includes('=');
  if (typedAnswer) return answerBox(question, response);
  return gradeLegacyStepAlgebraValue(built.question, response?.value, literalWorkspaceWorkGrader, { literal: true });
};

export default Object.freeze({
  // A structured workspace response for THIS surface, or a typed / pre-contract
  // scalar answer.
  accepts: (response) => {
    if (!response || typeof response !== 'object') return false;
    if (isToolResponse(response)) return text(response.toolId) === LITERAL_WORKSPACE_SURFACE;
    const value = text(response.value);
    if (!value.trim()) return false;
    // A typed answer (no equals sign) is an ordinary literal answer; an old
    // workspace key is read only when it reads back faithfully.
    return !value.split('|')[0].includes('=') || legacyKeyReadsFaithfully(value, { literal: true });
  },
  grade,
});
