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

const SPECIAL_OUTCOMES = Object.freeze({ 'No solution': 'noSolution', 'All real numbers': 'allReals' });
const EXACT_VALUE = /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/;

/*
 * The exact key of a Question Family instance whose answer is a fraction or
 * a special outcome (linear.multiStepEquation v2 and later). Such an instance
 * carries no numeric `generatedAnswer` — a fraction is never stored as a
 * decimal — but `solutionKey`: { outcome: 'value', value: '7/3' },
 * { outcome: 'noSolution' } or { outcome: 'allReals' }. An instance with a
 * numeric `generatedAnswer` never reaches this: it is read exactly as before.
 */
const exactKeyFor = (question) => {
  const key = question?.solutionKey;
  if (key?.outcome === 'noSolution' || key?.outcome === 'allReals') return { outcome: key.outcome };
  const exact = key?.outcome === 'value' ? EXACT_VALUE.exec(String(key.value ?? '')) : null;
  if (exact && Number(exact[2] ?? 1) > 0) return { outcome: 'value', value: Number(exact[1]) / Number(exact[2] ?? 1) };
  return null;
};

/** The value side of "x = 21-6" / "3 = x" as a number; null when unreadable, undefined when not isolated. */
const finalEquationValue = (responseValue, variable) => {
  const equation = String(responseValue ?? '').split('|')[0];
  const sides = equation.split('=');
  if (sides.length !== 2) return null;
  const [left, right] = sides.map((side) => side.replace(/\s+/g, ''));
  const isVariable = (side) => side.replace(/[{}]/g, '') === variable;
  const valueSide = isVariable(left) ? right : isVariable(right) ? left : null;
  if (valueSide === null) return undefined;
  const expression = latexNumericToExpression(valueSide);
  return expression === null ? null : evaluateExpression(expression, {});
};

const verdictFor = (value, expected) => {
  if (value === undefined) return { graded: true, reason: null, isComplete: true, isCorrect: false };
  if (value === null) return { graded: false, reason: 'step-answer-unparseable', isCorrect: false };
  return { graded: true, reason: null, isComplete: true, isCorrect: Math.abs(value - expected) <= 1e-9 };
};

/**
 * Check a Step Algebra final equation ("x = 21-6", "3 = x") against the
 * instance's answer — or, for an instance with an exact key, a declared
 * outcome ("No solution", "All real numbers") too.
 */
export const gradeStepAlgebraFinalAnswer = ({ question = null, responseValue = '' } = {}) => {
  const expected = Number(question?.generatedAnswer);
  const variable = String(question?.variable || question?.objective?.variable || 'x').trim();
  if (Number.isFinite(expected) && variable) return verdictFor(finalEquationValue(responseValue, variable), expected);
  const key = exactKeyFor(question);
  if (!key || !variable) return { graded: false, reason: 'no-step-answer-key', isCorrect: false };
  const head = String(responseValue ?? '').split('|')[0].trim();
  if (SPECIAL_OUTCOMES[head]) {
    return { graded: true, reason: null, isComplete: true, isCorrect: key.outcome === SPECIAL_OUTCOMES[head] };
  }
  // An equation answering a question whose answer is "no solution" or "all
  // real numbers" is complete, and wrong.
  if (key.outcome !== 'value') return { graded: true, reason: null, isComplete: true, isCorrect: false };
  return verdictFor(finalEquationValue(responseValue, variable), key.value);
};
