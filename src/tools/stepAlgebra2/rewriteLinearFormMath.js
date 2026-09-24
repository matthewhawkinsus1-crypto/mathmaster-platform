// Pure helpers for StepAlgebra2's rewriteLinearForm mode.
//
// This mode reuses the platform's existing algebra AST engine
// (src/algebraAstEngine.js, built on mathjs) for parsing, balanced
// operations, and equivalence checking rather than building a second
// parser. Two small gaps that engine leaves open for a genuinely
// two-variable rewrite (as opposed to solving a single-variable equation)
// are filled here:
//
//   - `expressionsEquivalentInXY` samples BOTH x and y. The engine's own
//     `expressionsEquivalent` only substitutes one named variable, which is
//     enough while solving ax + b = c but throws away information whenever
//     a rewrite step still has both x and y present on one side.
//   - `isSimplifiedSlopeInterceptForm` / `isFactoredLinearForm` recognize
//     "y = mx + b" and "y = a(x - c)" *structurally*, never by comparing the
//     student's text with mathjs's own simplify() ordering (which would reject
//     a correct "y = -(5/2)x + 3"). Both delegate to the engine's
//     isSimplifiedSlopeInterceptExpression / isFactoredLinearExpression — the
//     same checks the Step Algebra workspace this mode now hosts completes on —
//     adding only the linear-domain guard.
import { parse } from 'mathjs';
import {
  applyBalancedOperation,
  equationToLatex,
  expressionToLatex,
  isFactoredLinearExpression,
  isSimplifiedSlopeInterceptExpression,
  latexToExpression,
  parseEquationInput,
  parseOperationOperand,
  simplifyExpression,
} from '../../algebraAstEngine.js';

export const SUPPORTED_TARGET_FORMS = ['slopeIntercept', 'factoredLinear'];

const symbolsOf = (expression) => {
  try {
    return [...new Set(parse(String(expression)).filter((node) => node.isSymbolNode).map((node) => node.name))];
  } catch {
    return [];
  }
};

const containsVariableDenominator = (node) => {
  if (!node) return false;
  if (node.type === 'OperatorNode' && node.fn === 'divide') {
    const denominatorSymbols = node.args[1].filter((child) => child.isSymbolNode).map((child) => child.name);
    if (denominatorSymbols.some((name) => ['x', 'y'].includes(name))) return true;
  }
  return (node.args || []).some(containsVariableDenominator) || (node.content ? containsVariableDenominator(node.content) : false);
};

export const preservesLinearDomain = (expression) => {
  try { return !containsVariableDenominator(parse(String(expression))); } catch { return false; }
};

/**
 * Structurally requires a reduced nonzero number times a parenthesized
 * (x +/- number): y = a(x - c). The mature Step Algebra engine owns this
 * definition (`isFactoredLinearExpression`) so the workspace and this check
 * cannot disagree about when factored form is finished.
 */
export const isFactoredLinearForm = (expression) => (
  preservesLinearDomain(expression) && isFactoredLinearExpression(latexToExpression(expression), 'x')
);

/**
 * True when `expression` is already written as a slope-intercept right-hand
 * side: a single x-term, a single constant, or the sum/difference of the two
 * in either order — e.g. "-(5/2)x + 3", "3 - (5/2)x", "(5/7)x + 11/7". False
 * for a form that is mathematically equivalent but still needs a
 * transformation the student has to perform, such as an un-distributed product
 * ("-(2/3)(x+3)+7"), a single fraction spanning the whole numerator
 * ("(6-5x)/2"), or an unreduced fraction ("6/2 - 5x/2"). Delegates to the
 * engine's `isSimplifiedSlopeInterceptExpression`, the same check the Step
 * Algebra workspace completes on.
 */
export const isSimplifiedSlopeInterceptForm = (expression) => (
  preservesLinearDomain(expression) && isSimplifiedSlopeInterceptExpression(latexToExpression(expression), 'x')
);

export const buildInitialEquationState = (questionData = {}) => {
  const parsed = parseEquationInput({
    equation: questionData.equation,
    equationLatex: questionData.equationLatex,
    leftExpression: questionData.leftExpression,
    rightExpression: questionData.rightExpression,
    objective: {
      kind: questionData.targetForm || 'slopeIntercept',
      variable: 'y',
      requireSimplifiedFinalForm: false,
    },
  });
  return { left: parsed.left, right: parsed.right, variable: parsed.variable, objective: parsed.objective };
};

// Symmetric-difference equivalence sampled over BOTH x and y, falling back to
// symbolic simplification first exactly as the single-variable engine helper
// does — the numeric pass only matters when mathjs cannot reduce the
// difference to a literal 0 (e.g. an unresolved rational form).
export const expressionsEquivalentInXY = (leftExpression, rightExpression) => {
  try {
    const left = latexToExpression(leftExpression);
    const right = latexToExpression(rightExpression);
    if (!preservesLinearDomain(left) || !preservesLinearDomain(right)) return false;
    try {
      if (simplifyExpression(`(${left}) - (${right})`) === '0') return true;
    } catch {
      // fall through to numeric sampling
    }
    const symbols = [...new Set([...symbolsOf(left), ...symbolsOf(right)])].filter((name) => !['e', 'pi'].includes(name));
    const unexpected = symbols.filter((name) => !['x', 'y'].includes(name));
    if (unexpected.length) return false;
    const samples = [-3, -1, 2, 5];
    return samples.every((x) => samples.every((y) => {
      const scope = { x, y };
      const leftValue = Number(parse(left).evaluate(scope));
      const rightValue = Number(parse(right).evaluate(scope));
      return Number.isFinite(leftValue) && Number.isFinite(rightValue) && Math.abs(leftValue - rightValue) <= 1e-6;
    }));
  } catch {
    return false;
  }
};

export const applyRewriteBalancedOperation = (equationState, operation, operand) => (
  applyBalancedOperation({ equationState, operation, operand })
);

/**
 * Checks a student-authored equivalent rewrite of one or both sides (used for
 * distributing, combining like terms, and simplifying rational coefficients —
 * moves that are not a balanced operation on both sides at once). Returns the
 * next equation state on success, or { ok: false, side } naming the first
 * side whose rewrite was not equivalent to what is currently there.
 */
export const checkSideRewrite = (equationState, scope, studentExpressions) => {
  const sides = scope === 'both' ? ['left', 'right'] : [scope];
  const next = { ...equationState };
  for (const side of sides) {
    const raw = typeof studentExpressions === 'string' ? studentExpressions : studentExpressions?.[side];
    if (raw == null || String(raw).trim() === '') return { ok: false, side, reason: 'empty' };
    let parsedOperand;
    try {
      parsedOperand = parseOperationOperand(raw);
    } catch {
      return { ok: false, side, reason: 'invalid' };
    }
    if (!preservesLinearDomain(parsedOperand.expression)) return { ok: false, side, reason: 'domainChange' };
    if (!expressionsEquivalentInXY(parsedOperand.expression, equationState[side])) {
      return { ok: false, side, reason: 'notEquivalent' };
    }
    next[side] = parsedOperand.expression;
  }
  return { ok: true, equationState: next };
};

/**
 * What is still missing before a rewriteLinearForm/slopeIntercept response is
 * complete, or null when it already is:
 *   'isolateVariable'    — the left side is not exactly y yet
 *   'variableOnBothSides' — y still appears on the right side
 *   'needsSimplification' — right side is equivalent but not yet in mx + b form
 */
export const describeRewriteGap = (equationState) => {
  const variable = equationState.objective?.variable || 'y';
  let leftIsVariable = false;
  try { leftIsVariable = simplifyExpression(equationState.left) === variable; } catch { leftIsVariable = false; }
  if (!leftIsVariable) return 'isolateVariable';
  if (symbolsOf(equationState.right).includes(variable)) return 'variableOnBothSides';
  if (!preservesLinearDomain(equationState.right)) return 'domainChange';
  if (equationState.objective?.kind === 'factoredLinear') {
    if (!isFactoredLinearForm(equationState.right)) return 'needsFactoring';
  } else if (!isSimplifiedSlopeInterceptForm(equationState.right)) return 'needsSimplification';
  return null;
};

export const isRewriteComplete = (equationState) => describeRewriteGap(equationState) === null;

export const formatEquationLatex = (equationState) => equationToLatex(equationState);
export const formatSideLatex = (expression) => expressionToLatex(expression);
