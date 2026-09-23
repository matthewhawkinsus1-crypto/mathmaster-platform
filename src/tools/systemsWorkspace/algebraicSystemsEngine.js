/*
 * SYSTEM-LEVEL ORCHESTRATION MATH FOR THE ALGEBRAIC (SUBSTITUTION/ELIMINATION)
 * SYSTEMS WORKSPACE MODE.
 *
 * This module answers workflow questions — "is this variable already
 * isolated", "what does equation 2 look like after multiplying by -2",
 * "does this combination actually cancel the target variable" — so
 * AlgebraicSystemMode.jsx can decide what stage to show next.
 *
 * It deliberately does NOT solve a one-variable equation, isolate a
 * variable, distribute, or simplify a multi-step expression. Every one of
 * those is handed to the existing Step Algebra engine
 * (StepByStepAlgebraCore). Duplicating that logic here is exactly the
 * "second mini equation solver" this feature must not become.
 */
import { evaluate, parse } from 'mathjs';

const EPS = 1e-7;

const splitEquation = (text) => {
  const parts = String(text || '').split('=');
  if (parts.length !== 2) throw new Error('Expected exactly one equation with one equals sign.');
  return { left: parts[0].trim(), right: parts[1].trim() };
};

/**
 * `{ a, b, c }` such that the equation is equivalent to
 * `a * variables[0] + b * variables[1] = c`.
 *
 * Samples the (left - right) expression at three points rather than parsing
 * structurally, the same technique already used by
 * EmbeddedInequalityRewrite's `affineCoefficients` for inequality rewrites.
 * Returns null for anything that is not affine in the two named variables.
 */
export const linearEquationCoefficients = (text, variables = ['x', 'y']) => {
  const [v1, v2] = variables;
  try {
    const { left, right } = splitEquation(text);
    const diff = `(${left}) - (${right})`;
    const at = (val1, val2) => Number(evaluate(diff, { [v1]: val1, [v2]: val2 }));
    const c0 = at(0, 0);
    const a = at(1, 0) - c0;
    const b = at(0, 1) - c0;
    if (![a, b, c0].every(Number.isFinite)) return null;
    // Guard against a nonlinear expression matching three sample points.
    if (Math.abs(at(2, 3) - (2 * a + 3 * b + c0)) > 1e-6) return null;
    return { a, b, c: -c0 };
  } catch {
    return null;
  }
};

const cleanNumber = (value) => {
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const formatCoefficientTerm = (value, symbol, isFirst) => {
  const cleaned = Math.abs(value) < EPS ? 0 : cleanNumber(value);
  if (cleaned === 0) return '';
  const magnitudeText = Math.abs(Math.abs(cleaned) - 1) < EPS ? '' : String(Math.abs(cleaned));
  if (isFirst) return `${cleaned < 0 ? '-' : ''}${magnitudeText}${symbol}`;
  return ` ${cleaned < 0 ? '-' : '+'} ${magnitudeText}${symbol}`;
};

/** Canonical display/parse text for `a*v1 + b*v2 = c`. A zero coefficient just omits that term, same as a person writing the equation by hand — it never collapses the whole equation. */
export const formatLinearEquation = ({ a, b, c }, variables = ['x', 'y']) => {
  const [v1, v2] = variables;
  const first = formatCoefficientTerm(a, v1, true);
  const second = formatCoefficientTerm(b, v2, !first);
  const left = (first + second).trim() || '0';
  return `${left} = ${cleanNumber(Math.abs(c) < EPS ? 0 : c)}`;
};

/** Is `variable` already alone on one side, with the other side free of it? */
export const variableIsIsolated = (text, variable) => {
  try {
    const { left, right } = splitEquation(text);
    const bareLeft = parse(left).type === 'SymbolNode' && left.trim() === variable;
    const bareRight = parse(right).type === 'SymbolNode' && right.trim() === variable;
    const otherSide = bareLeft ? right : left;
    if (!bareLeft && !bareRight) return false;
    const symbols = new Set(parse(otherSide).filter((node) => node.isSymbolNode).map((node) => node.name));
    return !symbols.has(variable);
  } catch {
    return false;
  }
};

/** The plain-expression text a variable is isolated to (whichever side is bare). */
export const isolatedExpressionFor = (text, variable) => {
  const { left, right } = splitEquation(text);
  if (left.trim() === variable) return right.trim();
  if (right.trim() === variable) return left.trim();
  return null;
};

/**
 * Replace every occurrence of `variable` in `text` with `replacementExpression`,
 * grouped in parentheses so the substitution is safe wherever it lands
 * (distribution across the parentheses is Step Algebra's job, not this
 * function's).
 */
export const substituteVariable = (text, variable, replacementExpression) => {
  const node = parse(String(text));
  const replacement = parse(`(${replacementExpression})`);
  const transformed = node.transform((n) => (
    n.type === 'SymbolNode' && n.name === variable ? replacement : n
  ));
  return transformed.toString({ parenthesis: 'keep', implicit: 'hide' });
};

export const substituteIntoEquation = (equationText, variable, replacementExpression) => {
  const { left, right } = splitEquation(equationText);
  return `${substituteVariable(left, variable, replacementExpression)} = ${substituteVariable(right, variable, replacementExpression)}`;
};

/** Multiply every term on both sides by `multiplier`. Returns the resulting equation text and its coefficients. */
export const applyEquationMultiplier = (equationText, multiplier, variables = ['x', 'y']) => {
  const coeffs = linearEquationCoefficients(equationText, variables);
  if (!coeffs) return null;
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m === 0) return null;
  const scaled = { a: coeffs.a * m, b: coeffs.b * m, c: coeffs.c * m };
  return { coefficients: scaled, text: formatLinearEquation(scaled, variables) };
};

/** Add or subtract two equations' coefficient triples: `eq1 (op) eq2`. */
export const combineCoefficients = (coeffs1, coeffs2, operation) => {
  const sign = operation === 'subtract' ? -1 : 1;
  return {
    a: coeffs1.a + sign * coeffs2.a,
    b: coeffs1.b + sign * coeffs2.b,
    c: coeffs1.c + sign * coeffs2.c,
  };
};

/** Does this combination cancel `variable` (index 0 or 1 of `variables`)? */
export const eliminatesVariable = (combinedCoefficients, variable, variables = ['x', 'y']) => {
  const key = variable === variables[0] ? 'a' : 'b';
  return Math.abs(combinedCoefficients[key]) < 1e-6;
};

/** True once a combined/substituted one-"variable" equation actually has zero variable terms left — the contradiction/identity special case. */
export const isDegenerateStatement = (coefficients) => (
  Math.abs(coefficients.a) < 1e-6 && Math.abs(coefficients.b) < 1e-6
);

/** For a degenerate `0 = c` style statement, what the two (already-simplified) sides evaluate to and whether the statement is true. */
export const degenerateStatementTruth = (coefficients) => {
  const rightSide = coefficients.c;
  const isTrue = Math.abs(rightSide) < 1e-6;
  return { leftValue: 0, rightValue: rightSide, isTrue };
};

/**
 * Authored config -> the normalized shape AlgebraicSystemMode reads.
 *
 * `equations` must be exactly two linear equation strings in `variables`
 * (default ['x','y']). `method` may force 'substitution' or 'elimination',
 * or leave the choice to the student with 'studentChoice'.
 */
export const normalizeAlgebraicSystemConfig = (questionData = {}) => {
  const variables = Array.isArray(questionData.variables) && questionData.variables.length === 2
    ? questionData.variables
    : ['x', 'y'];
  const equations = Array.isArray(questionData.equations) && questionData.equations.length === 2
    ? questionData.equations.map(String)
    : ['x - 2y = -3', '3x + 5y = 24'];
  const coefficients = equations.map((eq) => linearEquationCoefficients(eq, variables));
  const method = ['substitution', 'elimination', 'studentChoice'].includes(questionData.method)
    ? questionData.method
    : 'studentChoice';
  return {
    variables,
    equations,
    coefficients,
    method,
    requireVerification: questionData.requireVerification !== false,
    askEfficiency: Boolean(questionData.askEfficiency),
  };
};

/** The actual solution of the authored system, for grading/verification — never shown to the student directly. */
export const solveAlgebraicSystem = (coefficients) => {
  const [eq1, eq2] = coefficients;
  if (!eq1 || !eq2) return { type: 'none' };
  const det = eq1.a * eq2.b - eq1.b * eq2.a;
  if (Math.abs(det) > EPS) {
    return {
      type: 'one',
      x: (eq1.c * eq2.b - eq1.b * eq2.c) / det,
      y: (eq1.a * eq2.c - eq1.c * eq2.a) / det,
    };
  }
  const consistent = Math.abs(eq1.a * eq2.c - eq1.c * eq2.a) <= EPS && Math.abs(eq1.b * eq2.c - eq1.c * eq2.b) <= EPS;
  return { type: consistent ? 'infinite' : 'none' };
};

export const evaluateEquationSides = (equationText, values) => {
  const { left, right } = splitEquation(equationText);
  return { left: Number(evaluate(left, values)), right: Number(evaluate(right, values)) };
};
