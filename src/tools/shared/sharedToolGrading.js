/*
 * HOW A REGISTRY TOOL DECIDES WHETHER ITS STUDENT IS RIGHT.
 *
 * It asks its shared grader — the same pure function the server runs as the
 * authority (functions/shared/serverGrading/tools/<toolId>.mjs) — through the
 * same bounded, serialized bytes the server will read. A tool therefore never
 * computes a verdict of its own: what the student sees on Check is what the
 * gradebook records, whichever path (Submit, an offline queue, a deadline)
 * delivers the work.
 *
 * Usage inside a tool's Check handler:
 *
 *   const work = { real, imaginary };
 *   const result = gradeToolCheck(complexPlaneGrader, questionData, work);
 *   submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode, parts: result.parts });
 *
 * Imports only the tool's own grader and a small helper, so a tool's lazy
 * chunk never carries every other tool's mathematics.
 */
import { gradeWorkWithGrader } from '../../../functions/shared/serverGrading/toolWorkGrading.mjs';

export const gradeToolCheck = (grader, questionData, work) => {
  const result = gradeWorkWithGrader({ grader, question: questionData || {}, work });
  const graded = result.graded === true;
  return {
    graded,
    reason: graded ? null : result.reason || 'ungraded',
    isComplete: graded && result.isComplete === true,
    isCorrect: graded && result.isCorrect === true,
    score: graded ? Math.max(0, Math.min(1, Number(result.score) || 0)) : 0,
    parts: graded && Array.isArray(result.parts) ? result.parts : [],
    toolResponse: result.toolResponse || null,
  };
};
