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
import { OperatorNode, evaluate, fraction, parse } from 'mathjs';
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
    const protectedFractions = [];
    const protectedSource = String(side).replace(
      /\(\s*([+-]?(?:\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9_]*)\s*\/\s*[+-]?(?:\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9_]*))\s*\)/g,
      (_match, fractionText) => {
        const token = `__mm_fraction_${protectedFractions.length}__`;
        protectedFractions.push(fractionText);
        return token;
      },
    );

    let normalized = parse(protectedSource).toString({
      parenthesis: 'auto',
      implicit: 'show',
    });

    protectedFractions.forEach((fractionText, index) => {
      normalized = normalized.replace(
        `__mm_fraction_${index}__`,
        `(${fractionText.replace(/\s+/g, ' ').trim()})`,
      );
    });

    return normalized;
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
 * Presentation cleanup only. Preserve the student's algebraic form while
 * removing parser/serialization wrappers that do not change grouping.
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
 * Step Algebra reports an isolated side with its bookkeeping parentheses,
 * -(y) - (z) + (6). The same expression without redundant grouping, -y - z + 6,
 * is what a student reads and writes. Only grouping MathJS proves redundant
 * is dropped — never a term, a sign or a needed parenthesis — so the tree, and
 * the mathematics, are unchanged.
 */
export const presentableExpression = (expression) => {
  try {
    return parse(String(expression)).toString({ parenthesis: 'auto', implicit: 'hide' });
  } catch {
    return String(expression);
  }
};

/**
 * An equation as a student writes it, for DISPLAY only: a numeric factor sits
 * against what it multiplies — 2(-y - z + 6) - y + 3z = 9, not
 * 2 · (-y - z + 6) - y + 3 · z = 9. The stored text keeps its explicit
 * multiplication for the MathJS boundary; every parenthesis is kept.
 */
export const classroomEquationText = (equationText) => {
  const juxtapose = (node) => {
    const mapped = node.map((child) => juxtapose(child));
    if (mapped.type === 'OperatorNode' && mapped.fn === 'multiply' && mapped.args.length === 2 && !mapped.implicit) {
      const [factor, target] = mapped.args;
      const numericFactor = factor.type === 'ConstantNode'
        || (factor.type === 'OperatorNode' && factor.fn === 'unaryMinus' && factor.args[0]?.type === 'ConstantNode');
      const numericTarget = target.type === 'ConstantNode' || (target.type === 'ParenthesisNode' && target.content?.type === 'ConstantNode');
      if (numericFactor && !numericTarget) return new OperatorNode('*', 'multiply', mapped.args, true);
    }
    return mapped;
  };
  try {
    return String(equationText).split('=').map((side) => juxtapose(parse(side.trim())).toString({ parenthesis: 'keep', implicit: 'hide' })).join(' = ');
  } catch {
    return String(equationText);
  }
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

const splitAdditiveTermCount = (text) => {
  const count = (n) => {
    if (n.type === 'ParenthesisNode') return count(n.content);
    if (n.type === 'OperatorNode' && ['add', 'subtract'].includes(n.fn) && n.args.length === 2) return count(n.args[0]) + count(n.args[1]);
    return 1;
  };
  try {
    return count(parse(String(text)));
  } catch {
    return 1;
  }
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
  const isVariable = (n) => n?.type === 'SymbolNode' && n.name === variable;
  // A multi-term expression replacing a NEGATED variable (-x, or a - x) is
  // written with an explicit factor: -1(6 - y - z), a - 1(6 - y - z). Step
  // Algebra flattens a bare -(6 - y - z) into -6 + y + z for display, which
  // would distribute the negative for the student; as a product the group
  // stays whole and the -1 is offered to the student to distribute (#341).
  // Numbers and single terms are left alone — there is nothing to distribute.
  const groupedReplacement = splitAdditiveTermCount(replacementText) > 1;
  const substitute = (n) => {
    if (groupedReplacement && n.type === 'OperatorNode' && n.fn === 'unaryMinus' && isVariable(n.args[0])) {
      return parse(`-1 * (${replacementText})`);
    }
    if (groupedReplacement && n.type === 'OperatorNode' && n.fn === 'subtract' && n.args.length === 2 && isVariable(n.args[1])) {
      return new OperatorNode('-', 'subtract', [n.args[0].transform(substitute), parse(`1 * (${replacementText})`)]);
    }
    return isVariable(n) ? replacement : n;
  };
  const transformed = node.transform(substitute);

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
 * How many variables (and equations) an authored algebraic system has.
 *
 * Inferred, never authored: three equations in three variables is a 3×3
 * system, and everything else keeps the 2×2 behaviour it always had. When
 * `variables` is omitted, three equations default to x, y, z the same way two
 * default to x, y.
 */
export const algebraicSystemDimension = (questionData = {}) => {
  const equations = Array.isArray(questionData.equations) ? questionData.equations : null;
  const variables = Array.isArray(questionData.variables) ? questionData.variables : null;
  if (equations?.length === 3 && (!variables || variables.length === 3)) return 3;
  return 2;
};

const DEFAULT_VARIABLES = { 2: ['x', 'y'], 3: ['x', 'y', 'z'] };

/**
 * Authored config -> the normalized shape AlgebraicSystemMode reads.
 *
 * `equations` must be linear equation strings in `variables` — two of each
 * (default ['x','y']) or, since #341, three of each. `method` may force
 * 'substitution' or 'elimination', or leave the choice to the student with
 * 'studentChoice'. A 3×3 system is solved by substitution only: 3×3
 * elimination is not built, so it is never offered (see
 * `validateAlgebraicSystemAuthoring`).
 *
 * `coefficients` keeps its 2×2 `{ a, b, c }` shape for every existing caller;
 * `forms` is the dimension-agnostic `{ coefficients: { x, y, z }, constant }`.
 */
export const normalizeAlgebraicSystemConfig = (questionData = {}) => {
  const dimension = algebraicSystemDimension(questionData);
  const variables = Array.isArray(questionData.variables) && questionData.variables.length === dimension
    ? questionData.variables.map((value) => String(value).trim())
    : DEFAULT_VARIABLES[dimension];
  const equations = Array.isArray(questionData.equations) && questionData.equations.length === dimension
    ? questionData.equations.map(String)
    : ['x - 2y = -3', '3x + 5y = 24'];
  const coefficients = dimension === 2 ? equations.map((eq) => linearEquationCoefficients(eq, variables)) : null;
  const forms = equations.map((eq) => linearEquationForm(eq, variables));
  const authoredMethod = ['substitution', 'elimination', 'studentChoice'].includes(questionData.method)
    ? questionData.method
    : 'studentChoice';
  return {
    dimension,
    variables,
    equations,
    coefficients,
    forms,
    // 3×3 elimination does not exist yet; a 3×3 system never shows a method
    // choice it could not honour.
    method: dimension === 3 ? 'substitution' : authoredMethod,
    authoredMethod,
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


/* ==========================================================================
 * N-VARIABLE LINEAR SYSTEMS (#341)
 *
 * The 2×2 helpers above speak `{ a, b, c }`, which cannot name a third
 * variable. Everything below speaks a form keyed by the variable itself —
 *
 *   { coefficients: { x: 2, y: -1, z: 3 }, constant: 9 }   ≡   2x - y + 3z = 9
 *
 * — so a 3×3 system, the 2×2 system it reduces to, and any later N×N system
 * share one representation. Like everything in this module it answers
 * workflow questions ("is this what substituting x produced?", "does this
 * system have exactly one solution?") and never performs a student's algebra.
 * ========================================================================== */

export const SUPPORTED_ALGEBRAIC_DIMENSIONS = Object.freeze([2, 3]);

const tidy = (value) => {
  const rounded = Math.round(Number(value) * 1e9) / 1e9;
  return Object.is(rounded, -0) || Math.abs(rounded) < EPS ? 0 : rounded;
};

/**
 * `{ coefficients, constant }` for a linear equation in an ordered variable
 * list, or null when the equation is not linear in exactly those variables
 * (a nonlinear term, an unknown symbol, or no single equals sign).
 *
 * Same sampling technique as `linearEquationCoefficients`, generalised: the
 * value at the origin and at each unit vector fixes an affine form, and two
 * off-axis probes reject anything that only looks affine at those points.
 */
export const linearEquationForm = (text, variables = ['x', 'y']) => {
  const vars = (variables || []).map(String);
  if (!vars.length) return null;
  try {
    const { left, right } = splitEquation(text);
    const difference = parse(`(${left}) - (${right})`).compile();
    const at = (scope) => Number(difference.evaluate(scope));
    const origin = Object.fromEntries(vars.map((name) => [name, 0]));
    const c0 = at(origin);
    const coefficients = {};
    vars.forEach((name) => { coefficients[name] = at({ ...origin, [name]: 1 }) - c0; });
    if (![c0, ...Object.values(coefficients)].every(Number.isFinite)) return null;
    const probes = [
      vars.map((_, index) => index + 2),
      vars.map((_, index) => ((index % 2 ? -1 : 1) * (3 * index + 5)) / 2),
    ];
    for (const probe of probes) {
      const scope = Object.fromEntries(vars.map((name, index) => [name, probe[index]]));
      const expected = c0 + vars.reduce((sum, name, index) => sum + coefficients[name] * probe[index], 0);
      const actual = at(scope);
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-6 * Math.max(1, Math.abs(expected))) return null;
    }
    return {
      coefficients: Object.fromEntries(vars.map((name) => [name, tidy(coefficients[name])])),
      constant: tidy(-c0),
    };
  } catch {
    return null;
  }
};

/**
 * A number the way a student writes it: 3, -1, 7/3 — never 2.3333333333333335.
 * Solved values are floats once MathJS has evaluated them; showing that float
 * on a token, or substituting it back into an equation, would hand the student
 * a rounding artefact instead of their own exact answer.
 */
export const exactNumberText = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const clean = tidy(number);
  if (Number.isInteger(clean)) return String(clean);
  try {
    const exact = fraction(clean);
    const numerator = Number(exact.s) * Number(exact.n);
    const denominator = Number(exact.d);
    if (denominator <= 10000 && Math.abs(numerator / denominator - clean) < 1e-9) return `${numerator}/${denominator}`;
  } catch {
    // Fall through to the decimal.
  }
  return String(clean);
};

const coefficientDisplay = (value) => {
  const magnitude = Math.abs(tidy(value));
  if (Math.abs(magnitude - 1) < EPS) return '';
  const text = exactNumberText(magnitude);
  return text.includes('/') ? `(${text})` : text;
};

/**
 * Ordinary classroom notation for a form: `2x - y + 3z = 9`, `5y = 10`,
 * `-(1/2)x + z = 0`. Zero terms are omitted, a unit coefficient is implied, a
 * negative is written as subtraction — never `5 · y`, `+ -3z` or `1x`.
 */
export const formatLinearForm = (form, variables) => {
  const vars = variables || Object.keys(form?.coefficients || {});
  let left = '';
  vars.forEach((name) => {
    const value = tidy(form?.coefficients?.[name] ?? 0);
    if (value === 0) return;
    const term = `${coefficientDisplay(value)}${name}`;
    if (!left) left = `${value < 0 ? '-' : ''}${term}`;
    else left += ` ${value < 0 ? '-' : '+'} ${term}`;
  });
  return `${left || '0'} = ${exactNumberText(tidy(form?.constant ?? 0))}`;
};

/** The variables a linear equation actually depends on (nonzero coefficient), in list order. */
export const variablesWithNonzeroCoefficient = (text, variables) => {
  const form = linearEquationForm(text, variables);
  if (!form) return [];
  return variables.filter((name) => form.coefficients[name] !== 0);
};

/**
 * Whether the variable is WRITTEN in the equation — the question a drop target
 * asks. Differs from a nonzero coefficient only for something like x - x.
 */
export const equationMentionsVariable = (text, variable) => {
  try {
    const { left, right } = splitEquation(text);
    return [left, right].some((side) => parse(side).filter((node) => node.isSymbolNode && node.name === variable).length > 0);
  } catch {
    return false;
  }
};

/**
 * Do two linear forms describe the same equation (one is a nonzero multiple of
 * the other)? `2(6 - y - z) - y + 3z = 9` and `-3y + z = -3` do; so does
 * `3y - z = 3`, because multiplying both sides by -1 is a legitimate move.
 */
export const linearFormsEquivalent = (formA, formB, variables) => {
  if (!formA || !formB) return false;
  const a = [...variables.map((name) => formA.coefficients[name] ?? 0), formA.constant];
  const b = [...variables.map((name) => formB.coefficients[name] ?? 0), formB.constant];
  const pivot = a.findIndex((value) => Math.abs(value) > EPS);
  if (pivot < 0) return b.every((value) => Math.abs(value) <= EPS);
  if (Math.abs(b[pivot]) <= EPS) return false;
  const ratio = b[pivot] / a[pivot];
  return a.every((value, index) => Math.abs(value * ratio - b[index]) <= 1e-7 * Math.max(1, Math.abs(b[index])));
};

/**
 * Rank analysis of a square or rectangular linear system.
 *
 *   unique    exactly one solution — returned in `solution`
 *   none      inconsistent: some row reduces to 0 = nonzero
 *   infinite  consistent but dependent: fewer pivots than variables
 *
 * Gaussian elimination with partial pivoting on the augmented matrix. The
 * student never sees this: it gates authoring and grades the final answer.
 */
export const classifyLinearSystem = (forms, variables) => {
  if (!Array.isArray(forms) || forms.some((form) => !form)) return { type: 'invalid', rank: 0, augmentedRank: 0 };
  const n = variables.length;
  const rows = forms.map((form) => [...variables.map((name) => Number(form.coefficients[name] ?? 0)), Number(form.constant)]);
  const tolerance = 1e-9 * Math.max(1, ...rows.flat().map((value) => Math.abs(value)));
  const pivotColumns = [];
  let row = 0;
  for (let column = 0; column < n && row < rows.length; column += 1) {
    let best = row;
    for (let candidate = row + 1; candidate < rows.length; candidate += 1) {
      if (Math.abs(rows[candidate][column]) > Math.abs(rows[best][column])) best = candidate;
    }
    if (Math.abs(rows[best][column]) <= tolerance) continue;
    [rows[row], rows[best]] = [rows[best], rows[row]];
    const pivot = rows[row][column];
    rows[row] = rows[row].map((value) => value / pivot);
    for (let other = 0; other < rows.length; other += 1) {
      if (other === row) continue;
      const factor = rows[other][column];
      if (Math.abs(factor) <= 0) continue;
      rows[other] = rows[other].map((value, index) => value - factor * rows[row][index]);
    }
    pivotColumns.push(column);
    row += 1;
  }
  const rank = pivotColumns.length;
  const inconsistent = rows.slice(rank).some((values) => Math.abs(values[n]) > tolerance);
  const augmentedRank = rank + (inconsistent ? 1 : 0);
  if (inconsistent) return { type: 'none', rank, augmentedRank };
  if (rank < n) return { type: 'infinite', rank, augmentedRank };
  const solution = {};
  pivotColumns.forEach((column, index) => { solution[variables[column]] = tidy(rows[index][n]); });
  return { type: 'unique', rank, augmentedRank, solution };
};

/**
 * Teacher-facing validation for an authored algebraic system, 2×2 or 3×3.
 *
 * Returns `{ dimension, errors, warnings }`. It is the single place that
 * decides what the 3×3 workflow can honestly run:
 *
 *   - equation and variable counts must match, and be 2 or 3;
 *   - every equation must be linear in exactly the authored variables;
 *   - a 3×3 system must have exactly one solution. Substituting through a
 *     dependent or inconsistent 3×3 system reaches an identity or a
 *     contradiction part-way through, and the workflow does not yet teach how
 *     to interpret that — so it is refused here, before a student sees it,
 *     instead of being misgraded later;
 *   - 3×3 elimination is not built, so it is an error; 'studentChoice' on a
 *     3×3 system is allowed but only substitution will be offered (warning).
 *
 * 2×2 dependent/inconsistent systems stay valid: the 2×2 workflow already
 * interprets 0 = 0 and 0 = c with the student.
 */
export const validateAlgebraicSystemAuthoring = (questionData = {}) => {
  const errors = [];
  const warnings = [];
  const rawVariables = Array.isArray(questionData.variables) ? questionData.variables : null;
  const rawEquations = Array.isArray(questionData.equations) ? questionData.equations : null;
  const dimension = rawEquations && [2, 3].includes(rawEquations.length) ? rawEquations.length : (rawVariables?.length === 3 ? 3 : 2);
  const variables = rawVariables || DEFAULT_VARIABLES[dimension];
  const countWord = dimension === 3 ? 'three' : 'two';

  if (variables.length !== dimension || variables.some((value) => typeof value !== 'string' || !value.trim()) || new Set(variables.map((value) => value.trim())).size !== variables.length) {
    errors.push(rawEquations && rawVariables && rawEquations.length !== rawVariables.length
      ? `systemsWorkspace algebraic mode needs the same number of equations and variables (got ${rawEquations.length} equations and ${rawVariables.length} variables).`
      : `systemsWorkspace algebraic mode requires exactly ${countWord} distinct non-empty variable names.`);
  }
  if (!rawEquations || !SUPPORTED_ALGEBRAIC_DIMENSIONS.includes(rawEquations.length) || rawEquations.some((equation) => typeof equation !== 'string' || !equation.trim())) {
    errors.push(`systemsWorkspace algebraic mode requires exactly ${countWord} non-empty equation strings${rawEquations && !SUPPORTED_ALGEBRAIC_DIMENSIONS.includes(rawEquations.length) ? ` (2×2 or 3×3 only; got ${rawEquations.length})` : ''}.`);
  } else if (variables.length === dimension) {
    const trimmed = variables.map((value) => String(value).trim());
    rawEquations.forEach((equation, index) => {
      if (!linearEquationForm(equation, trimmed)) {
        errors.push(`systemsWorkspace algebraic equation ${index + 1} must be linear in the ${countWord} authored variables.`);
      }
    });
  }
  if (questionData.method != null && !['substitution', 'elimination', 'studentChoice'].includes(questionData.method)) {
    errors.push('systemsWorkspace algebraic method must be substitution, elimination, or studentChoice.');
  }
  if (dimension === 3) {
    if (questionData.method === 'elimination') {
      errors.push('3×3 algebraic systems support substitution only; 3×3 elimination is not available yet. Use method "substitution".');
    } else if (questionData.method === 'studentChoice') {
      warnings.push('3×3 algebraic systems are solved by substitution; the method choice will not be shown to students.');
    }
    if (!errors.length) {
      const trimmed = variables.map((value) => String(value).trim());
      const classification = classifyLinearSystem(rawEquations.map((equation) => linearEquationForm(equation, trimmed)), trimmed);
      if (classification.type !== 'unique') {
        errors.push(`3×3 algebraic systems must have exactly one solution; this system is ${classification.type === 'none' ? 'inconsistent (no solution)' : 'dependent (infinitely many solutions)'}. Dependent and inconsistent 3×3 systems are not supported by the substitution workflow yet.`);
      }
    }
  }
  if (questionData.requireVerification != null && typeof questionData.requireVerification !== 'boolean') {
    errors.push('systemsWorkspace algebraic requireVerification must be boolean when supplied.');
  }
  if (questionData.askEfficiency != null && typeof questionData.askEfficiency !== 'boolean') {
    errors.push('systemsWorkspace algebraic askEfficiency must be boolean when supplied.');
  }
  return { dimension, errors, warnings };
};
