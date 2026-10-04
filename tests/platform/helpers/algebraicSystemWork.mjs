/*
 * The work a student's Systems Workspace (algebraic 2×2) reports, for a
 * generated systems.algebraic2x2 question — in exactly the shape
 * AlgebraicSystemMode.jsx builds (`work`, just above its `check`):
 *
 *   { dimension: 2, method, values: { x, y }, verification: { E1, E2 },
 *     reducedStatement, specialCase: { statementTruth, solutionCount, classification } }
 *
 * Values are what the embedded Step Algebra solve yields: the float of the
 * exact value (13/7 → 1.8571428571428572), never a rounded decimal.
 * Verification sides are typed the way a student evaluates them: the exact
 * value of each side at the solved point.
 */
import { toNumber, toRational, rationalText } from '../../../functions/shared/questionFamilyExact.mjs';
import { evaluateEquationSides } from '../../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';

const exactSideText = (value) => {
  // The side's value at an exact rational point is itself rational; read it
  // back exactly from the float (small denominators only).
  for (let denominator = 1; denominator <= 1000; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(numerator / denominator - value) < 1e-9) return rationalText(toRational(`${numerator}/${denominator}`));
  }
  return String(value);
};

export const pointWork = (question, point, { method = 'elimination', verify = true } = {}) => {
  const values = { x: point.x, y: point.y };
  const verification = {};
  if (verify) {
    question.equations.forEach((equation, index) => {
      const sides = evaluateEquationSides(equation, values);
      verification[`E${index + 1}`] = { left: exactSideText(sides.left), right: exactSideText(sides.right) };
    });
  }
  return {
    dimension: 2,
    method,
    values,
    verification,
    reducedStatement: null,
    specialCase: { statementTruth: '', solutionCount: '', classification: '' },
  };
};

export const specialWork = (question, { truth, count, classification, statement, method = 'elimination' }) => ({
  dimension: 2,
  method,
  values: {},
  verification: {},
  reducedStatement: statement,
  specialCase: { statementTruth: truth, solutionCount: count, classification },
});

const exactPoint = (key) => ({ x: toNumber(key.x), y: toNumber(key.y) });

/** The complete, correct work for the generated question's own key. */
export const correctAlgebraicSystemWork = (question, options = {}) => {
  const key = question.solutionKey;
  if (key.outcome === 'point') return pointWork(question, exactPoint(key), options);
  if (key.outcome === 'noSolution') {
    return specialWork(question, { truth: 'false', count: 'none', classification: 'inconsistent', statement: '0 = 7', ...options });
  }
  return specialWork(question, { truth: 'true', count: 'infinite', classification: 'consistent-dependent', statement: '0 = 0', ...options });
};

/** The same work with the mathematics wrong in one place. */
export const wrongAlgebraicSystemWork = (question, options = {}) => {
  const key = question.solutionKey;
  if (key.outcome === 'point') {
    const point = exactPoint(key);
    return pointWork(question, { x: point.x + 1, y: point.y }, options);
  }
  if (key.outcome === 'noSolution') {
    return specialWork(question, { truth: 'true', count: 'infinite', classification: 'consistent-dependent', statement: '0 = 0', ...options });
  }
  return specialWork(question, { truth: 'false', count: 'none', classification: 'inconsistent', statement: '0 = 7', ...options });
};
