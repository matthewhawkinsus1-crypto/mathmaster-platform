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
import { latexToExpression } from '../../algebraAstEngine.js';

const EPS = 1e-7;

const splitEquation = (text) => {
  const parts = String(text || '').split('=');
  if (parts.length !== 2) throw new Error('Expected exactly one equation with one equals sign.');
  return { left: parts[0].trim(), right: parts[1].trim() };
};

/**
 * Canonicalize only the presentation structure of an equation before handing
 * it to Step Algebra. This does NOT simplify, combine terms, distribute, or
 * solve. It removes redundant parenthesis wrappers introduced by repeated
 * token serialization while retaining every mathematically-required grouped
 * sum/difference.
 */
export const normalizeEquationForStepAlgebra = (equationText) => {
  const { left, right } = splitEquation(equationText);

  const normalizeSide = (side) => {
    let cleaned = parse(String(side));

    // MathJS transform is intentionally shallow when a ParenthesisNode is
    // replaced, so run a few idempotent passes. This removes wrappers like
    // (((200) - s)) -> (200 - s) while preserving one meaningful group around
    // a sum or an exact rational factor such as (20 / 9).
    for (let pass = 0; pass < 4; pass += 1) {
      cleaned = cleaned.transform((node) => {
        if (node?.type !== 'ParenthesisNode') return node;
        if (node.content?.type === 'ParenthesisNode') return node.content;
        if (['ConstantNode', 'SymbolNode'].includes(node.content?.type)) return node.content;
        return node;
      });
    }

    return cleaned.toString({
      parenthesis: 'keep',
      implicit: 'show',
    });
  };

  return `${normalizeSide(left)} = ${normalizeSide(right)}`;
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


/**
 * Recover a compact exact-looking rational from a numeric value when the
 * original symbolic expression is unavailable (legacy drafts).
 *
 * New systems work should persist the student's exact solved expression, so
 * this is intentionally only a fallback. The tolerance is strict enough that
 * ordinary rounded decimals are not casually rewritten as fractions.
 */
export const rationalExpressionFromNumber = (value, {
  maxDenominator = 1000,
  tolerance = 1e-10,
} = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (Math.abs(numeric - Math.round(numeric)) <= tolerance) return String(Math.round(numeric));

  const sign = numeric < 0 ? -1 : 1;
  const target = Math.abs(numeric);
  let bestNumerator = null;
  let bestDenominator = null;
  let bestError = Number.POSITIVE_INFINITY;

  for (let denominator = 1; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(target * denominator);
    const approximation = numerator / denominator;
    const error = Math.abs(target - approximation);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
    if (error <= tolerance * Math.max(1, target)) break;
  }

  if (
    bestNumerator != null
    && bestDenominator != null
    && bestError <= tolerance * Math.max(1, target)
  ) {
    const signedNumerator = sign * bestNumerator;
    return bestDenominator === 1
      ? String(signedNumerator)
      : `${signedNumerator}/${bestDenominator}`;
  }

  return String(cleanNumber(numeric));
};

/**
 * Preserve the algebraic form a student reached while removing only redundant
 * parser/serialization parentheses. This does not simplify, distribute,
 * combine terms, factor, or evaluate.
 */
export const normalizeStudentExpressionForDisplay = (rawExpression) => {
  const source = String(rawExpression ?? '').trim();
  if (!source) return '';
  try {
    const plain = latexToExpression(source);
    return parse(plain).toString({
      parenthesis: 'auto',
      implicit: 'show',
    });
  } catch {
    return source;
  }
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
 * Repair an `isolation` record read back from a question draft.
 *
 * `expression` and `tokenExpression` are plain MathJS text by contract, but a
 * draft written before issue #334 holds Step Algebra's LaTeX spacing in them —
 * "-(3)+(2~ y)" — which the work trail shows verbatim, with the tilde reading
 * as a minus sign. Pass both through the same LaTeX boundary a fresh attempt
 * goes through, so a reopened question reads exactly like a new one without
 * the student resetting it. Deterministic and idempotent: clean text comes back
 * unchanged, and an unchanged record comes back as the same object.
 */
export const repairPersistedIsolation = (isolation) => {
  if (!isolation || typeof isolation !== 'object') return isolation;
  const repair = (value) => (typeof value === 'string' ? latexToExpression(value) : value);
  const expression = repair(isolation.expression);
  const tokenExpression = repair(isolation.tokenExpression);
  if (expression === isolation.expression && tokenExpression === isolation.tokenExpression) return isolation;
  return { ...isolation, expression, tokenExpression };
};

/**
 * Canonicalize a substitution token at the systems -> MathJS boundary.
 *
 * Persisted drafts can outlive a deploy, so a token may still contain MathLive
 * LaTeX, Unicode operators, non-breaking spaces, or zero-width characters even
 * though the visible MathDisplay looks ordinary. Never make a correct algebra
 * step fail because presentation text was handed directly to MathJS.
 */
export const normalizeSubstitutionBoundaryExpression = (rawValue) => {
  let text = latexToExpression(rawValue)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[×·∙⋅]/g, '*')
    .trim();
  // Written algebra commonly places grouped factors adjacent to each other.
  // MathJS is stricter, so make only that unambiguous multiplication explicit.
  text = text.replace(/\)\s*\(/g, ')*(');
  if (!text) throw new Error('Substitution expression is empty.');
  return parse(text).toString({ parenthesis: 'keep', implicit: 'show' });
};

/**
 * Replace every occurrence of `variable` in `text` with `replacementExpression`,
 * grouped in parentheses so the substitution is safe wherever it lands
 * (distribution across the parentheses is Step Algebra's job, not this
 * function's).
 */
export const substituteVariable = (text, variable, replacementExpression) => {
  const node = parse(String(text));
  const replacementText = normalizeSubstitutionBoundaryExpression(replacementExpression);
  const replacement = parse(`(${replacementText})`);
  const transformed = node.transform((n) => (
    n.type === 'SymbolNode' && n.name === variable ? replacement : n
  ));

  // This string is handed back into MathJS by Step Algebra. Keep multiplication
  // explicit at this machine boundary. Hiding it can produce text such as
  // "3 (-3 + 2 y) + 5 y", which is visually natural but can be reinterpreted
  // ambiguously when a larger substitution token is parsed a second time.
  // Step Algebra/MathDisplay are responsible for turning the parsed structure
  // back into ordinary classroom notation for the student.
  return transformed.toString({ parenthesis: 'keep', implicit: 'show' });
};

export const substituteIntoEquation = (equationText, variable, replacementExpression) => {
  const { left, right } = splitEquation(equationText);
  return `${substituteVariable(left, variable, replacementExpression)} = ${substituteVariable(right, variable, replacementExpression)}`;
};

/** Multiply every term on both sides by `multiplier`. Returns the resulting equation text and its coefficients. */
export const applyEquationMultiplier = (equationText, multiplier, variables = ['x', 'y']) => {
  const coeffs = linearEquationCoefficients(equationText, variables);
  if (!coeffs) return null;
  let m;
  try {
    m = Number(evaluate(String(multiplier)));
  } catch {
    return null;
  }
  if (!Number.isFinite(m) || Math.abs(m) < EPS) return null;
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
