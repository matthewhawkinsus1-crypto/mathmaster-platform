/*
 * A LINEAR EQUATION WHOSE VARIABLE CANCELS OPENS WHERE IT CAN BE FINISHED.
 *
 * A linear equation with no solution (2x + 3 = 2x + 5), or with every number
 * as a solution (2x + 3 = 2x + 3), cannot be finished on the balance
 * workspace: the student's own balanced steps reach a statement with no
 * variable (3 = 5) and there is nothing more to do with it. The relation
 * workspace can: it accepts "No solution" or "All real numbers" only once the
 * student's own steps reach a statement with no variable left
 * (obviousSpecialClaim), and grades that claim against the equation itself.
 * Every special-case Question Family version opens there
 * (questionFamiliesLinearCases.mjs), and so does a hand-written one a teacher
 * imports (assignmentBlueprint.js, below the import's other repairs).
 *
 * One rule, read by both places that act on it:
 *   - the import (normalizeQuestionStorageShapes) stores "relationWorkspace":
 *     true on the item and lists the repair;
 *   - Pre-Flight (validateQuestionSemantics) warns about an item that reaches
 *     it without that import: a Question Editor replacement, a repair pack, an
 *     assignment stored before imports did it. A warning, never a refusal, and
 *     nothing stored or graded changes: routing an item already delivered would
 *     change the workspace its students' saved work was made in and the
 *     grader the server marks it with.
 *
 * Returns the equation's outcome ('noSolution' | 'allReals') when it would
 * otherwise open on the balance, else null. A family slot or template has no
 * equation yet; a rewrite or intercept objective is not solving.
 */
import { getEquationAnalysis, parseEquationInput } from '../../../functions/shared/algebra/algebraAstEngine.mjs';
import { usesRelationWorkspace } from '../../../functions/shared/serverGrading/stepAlgebraRouting.mjs';

export const specialCaseOnBalanceWorkspace = (question) => {
  if (question.relationWorkspace !== undefined || usesRelationWorkspace(question)) return null;
  if (question.questionFamily || question.generator || question.mode === 'linearIntercepts' || question.targetForm) return null;
  if ((question.objective?.kind || 'isolate') !== 'isolate') return null;
  if (/\{\{/.test(String(question.equation ?? question.equationLatex ?? ''))) return null;
  try {
    const analysis = getEquationAnalysis(parseEquationInput(question));
    if (!analysis.numericLinear || analysis.hasUniqueSolution) return null;
    return Math.abs(analysis.constantDifference) < 1e-9 ? 'allReals' : 'noSolution';
  } catch {
    return null;
  }
};

/** The conclusion's name on the relation workspace's button. */
export const specialCaseConclusion = (outcome) => (outcome === 'noSolution' ? 'No solution' : 'All real numbers');
