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
//   - `isSimplifiedSlopeInterceptForm` recognizes "y = mx + b" *structurally*
//     (an additive chain of a bare/coefficient x-term and a constant) without
//     demanding the student's text match mathjs's own internal simplify()
//     ordering, which is not how any textbook writes a line and would reject
//     perfectly correct student answers such as "y = -(5/2)x + 3".
import { parse } from 'mathjs';
import {
  applyBalancedOperation,
  equationToLatex,
  expressionToLatex,
  latexToExpression,
  parseEquationInput,
  parseOperationOperand,
  simplifyExpression,
} from '../../algebraAstEngine.js';

export const SUPPORTED_TARGET_FORMS = ['slopeIntercept'];

const symbolsOf = (expression) => {
  try {
    return [...new Set(parse(String(expression)).filter((node) => node.isSymbolNode).map((node) => node.name))];
  } catch {
    return [];
  }
};

const unwrapParens = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

// A "simple x term" is a bare x, a bare number, or a product/quotient of the
// two (a rational coefficient on x) — never a factor that is itself still an
// unresolved sum, which is what an un-distributed or un-combined term looks
// like structurally.
const isSimpleXTerm = (node) => {
  const current = unwrapParens(node);
  if (!current) return false;
  if (current.type === 'ConstantNode') return true;
  if (current.type === 'SymbolNode') return current.name === 'x';
  if (current.type === 'OperatorNode' && current.fn === 'unaryMinus' && current.args.length === 1) {
    return isSimpleXTerm(current.args[0]);
  }
  if (current.type === 'OperatorNode' && (current.fn === 'multiply' || current.fn === 'divide')) {
    return current.args.every((arg) => {
      const inner = unwrapParens(arg);
      if (inner?.type === 'OperatorNode' && ['add', 'subtract'].includes(inner.fn)) return false;
      return isSimpleXTerm(inner);
    });
  }
  return false;
};

/**
 * True when `expression` is already written as a slope-intercept right-hand
 * side: a single x-term, a single constant, or the sum/difference of the two
 * — e.g. "-(5/2)x + 3", "3 - (5/2)x", "(5/7)x + 11/7". False for a form that
 * is mathematically equivalent but still needs a transformation the student
 * has to perform, such as an un-distributed product ("-(2/3)(x+3)+7") or a
 * single fraction spanning the whole numerator ("(6-5x)/2").
 */
export const isSimplifiedSlopeInterceptForm = (expression) => {
  try {
    const node = unwrapParens(parse(String(expression)));
    if (node.type === 'OperatorNode' && (node.fn === 'add' || node.fn === 'subtract') && node.args.length === 2) {
      return node.args.every((term) => isSimpleXTerm(term));
    }
    return isSimpleXTerm(node);
  } catch {
    return false;
  }
};

export const buildInitialEquationState = (questionData = {}) => {
  const parsed = parseEquationInput({
    equation: questionData.equation,
    equationLatex: questionData.equationLatex,
    leftExpression: questionData.leftExpression,
    rightExpression: questionData.rightExpression,
    objective: {
      kind: 'slopeIntercept',
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
  if (!isSimplifiedSlopeInterceptForm(equationState.right)) return 'needsSimplification';
  return null;
};

export const isRewriteComplete = (equationState) => describeRewriteGap(equationState) === null;

export const formatEquationLatex = (equationState) => equationToLatex(equationState);
export const formatSideLatex = (expression) => expressionToLatex(expression);
