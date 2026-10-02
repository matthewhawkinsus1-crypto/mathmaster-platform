/*
 * HAS THIS EQUATION BEEN SOLVED — THE STEP ALGEBRA EQUATION WORKSPACE'S VERDICT.
 *
 * The one definition of "the equation workspace reached its objective with the
 * question's own solutions": the equation StepByStepAlgebraCore opened, the
 * objective the QUESTION sets (never one the work claims), the safety screen
 * every student expression passes before an engine sees it, and the check
 * that the final equation keeps the original's solutions (or a Question
 * Family's generated value). stepAlgebraWorkspaceGrading.mjs builds its
 * graded result from it, prompts and all.
 *
 * Light on purpose: the algebra engine and the equivalence screen, nothing
 * from the relation or interval workspaces. A tool that embeds the workspace
 * for one step of its own process — the Multiple Representations board's
 * "solve for y" and "substitute 0 and solve" — marks that step with this,
 * without carrying the whole Step Algebra grader onto the app's startup path
 * (tests/platform/sharedGradersStayOutOfStartupBundle.test.mjs).
 *
 * Pure.
 */
import { equationToLatex, isSolvedEquation, parseEquationInput } from '../algebra/algebraAstEngine.mjs';
import {
  equationMatchesOriginal,
  isSafeStudentExpression,
  isolatedNumericValue,
  studentExpressionBudget,
} from './stepAlgebraEquivalence.mjs';
import { hasGeneratedAnswer } from './stepAlgebraRouting.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The equation the workspace opened, exactly as StepByStepAlgebraCore read it. */
export const pristineEquation = (question) => {
  try {
    const equation = parseEquationInput(question);
    return equation?.left && equation?.right ? equation : null;
  } catch {
    return null;
  }
};

export const equationObjectiveLabel = (question, pristine) => question.objective?.label || (
  pristine.objective?.kind === 'slopeIntercept' ? 'Write in slope-intercept form'
    : pristine.objective?.kind === 'factoredLinear' ? 'Write in factored linear form'
      : pristine.objective?.kind === 'linearStandardForm' ? 'Write in standard form'
        : `Isolate ${pristine.objective?.variable || pristine.variable}`
);

export const equationLatexOrText = (equation) => {
  try {
    return equationToLatex(equation);
  } catch {
    return `${equation.left} = ${equation.right}`;
  }
};

const familyAnswer = (question) => (hasGeneratedAnswer(question) ? Number(question.generatedAnswer) : null);

/**
 * The objective part of the equation workspace for `work.equation`, or null
 * when the question opens no readable equation.
 *
 *   { pristine, part: { id: 'algebra-objective', label, isComplete, isCorrect, response } }
 */
export const gradeEquationObjective = (question = {}, work = {}) => {
  const pristine = pristineEquation(question);
  if (!pristine) return null;
  // Only plain algebra, no larger than the question's own equation allows, is
  // read; anything else (a forged function call, an assignment, a chain long
  // enough to stall the simplifier, a number where text belongs) is not a
  // finished equation.
  const budget = studentExpressionBudget(pristine.left, pristine.right);
  const readableSide = (value) => typeof value === 'string' && isSafeStudentExpression(value, budget);
  const submitted = isObject(work?.equation) && readableSide(work.equation.left) && readableSide(work.equation.right)
    ? { left: work.equation.left, right: work.equation.right }
    : null;
  // The objective and variable are the QUESTION's — a forged objective in the
  // work could otherwise declare any equation finished.
  const final = submitted ? { ...submitted, variable: pristine.variable, objective: pristine.objective } : null;
  let solved = false;
  try {
    solved = Boolean(final) && isSolvedEquation(final);
  } catch {
    solved = false;
  }
  const key = familyAnswer(question);
  const keyApplies = key !== null && (!pristine.objective?.kind || pristine.objective.kind === 'isolate');
  const value = solved && keyApplies ? isolatedNumericValue(final, pristine.objective?.variable || pristine.variable) : null;
  const sameSolutions = solved && (keyApplies
    ? value !== null && Math.abs(value - key) <= 1e-9
    : equationMatchesOriginal({ original: pristine, final, objective: pristine.objective, variable: pristine.variable }));
  return {
    pristine,
    part: {
      id: 'algebra-objective',
      label: equationObjectiveLabel(question, pristine),
      isComplete: solved,
      isCorrect: solved && sameSolutions,
      response: final ? equationLatexOrText(final) : '',
    },
  };
};
