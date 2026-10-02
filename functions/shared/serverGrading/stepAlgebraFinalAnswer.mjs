/*
 * THE STEP ALGEBRA FINAL-ANSWER CHECK FOR A QUESTION FAMILY INSTANCE.
 *
 * Moved here unchanged from questionFamilyGrading.mjs (which re-exports it) so
 * the shared dispatch can use it without an import cycle.
 *
 * The workspace only permits balanced steps, so reaching an isolated variable
 * already means the student solved it; this confirms the final value really is
 * the instance's answer before any credit counts.
 *
 * Pure.
 */
import { evaluateExpression } from '../pathQuestionGeneration.mjs';

/** "\frac{-14}{-7}" -> "(-14)/(-7)", "21-6" stays; null for anything else. */
const latexNumericToExpression = (latex) => {
  let text = String(latex ?? '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[dt]?frac/g, '\\frac')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '');
  for (let guard = 0; guard < 20 && text.includes('\\frac'); guard += 1) {
    const next = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/, '($1)/($2)');
    if (next === text) return null;
    text = next;
  }
  if (/[\\{}]/.test(text)) return null;
  return text;
};

/**
 * Check a Step Algebra final equation ("x = 21-6", "3 = x") against the
 * instance's answer.
 */
export const gradeStepAlgebraFinalAnswer = ({ question = null, responseValue = '' } = {}) => {
  const expected = Number(question?.generatedAnswer);
  const variable = String(question?.variable || question?.objective?.variable || 'x').trim();
  if (!Number.isFinite(expected) || !variable) return { graded: false, reason: 'no-step-answer-key', isCorrect: false };
  const equation = String(responseValue ?? '').split('|')[0];
  const sides = equation.split('=');
  if (sides.length !== 2) return { graded: false, reason: 'step-answer-unparseable', isCorrect: false };
  const [left, right] = sides.map((side) => side.replace(/\s+/g, ''));
  const isVariable = (side) => side.replace(/[{}]/g, '') === variable;
  const valueSide = isVariable(left) ? right : isVariable(right) ? left : null;
  if (valueSide === null) return { graded: true, reason: null, isComplete: true, isCorrect: false };
  const expression = latexNumericToExpression(valueSide);
  const value = expression === null ? null : evaluateExpression(expression, {});
  if (value === null) return { graded: false, reason: 'step-answer-unparseable', isCorrect: false };
  return { graded: true, reason: null, isComplete: true, isCorrect: Math.abs(value - expected) <= 1e-9 };
};
