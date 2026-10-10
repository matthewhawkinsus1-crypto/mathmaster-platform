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
import { parse } from '../../algebra/safeMath.mjs';
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
} from '../../algebra/algebraAstEngine.mjs';

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
  preservesLinearDomain(expression)
  && isSimplifiedSlopeInterceptExpression(latexToExpression(expression), 'x')
  && writtenAsMxPlusB(latexToExpression(expression))
);

/*
 * The engine's structural check reads the right side through its additive
 * terms, so it also passes two shapes that only EQUAL mx + b: a negated group
 * whose distribution is still to do ("-(x + 1)") and a coefficient written
 * after the variable ("x*2 - 6"). An authored rewrite question can start from
 * either, so leaving one unchanged must not count as finished. Every ordering
 * the engine accepts on purpose ("3 - (5/2)x", "-(5/2)x + 3", "x/2 + 3",
 * "-(3 * x) - 6") still passes, and so does every spelling that IS mx + b:
 * b written as a negative number ("5x + -20") and a written coefficient of
 * one ("1x - 4", "-1x + 5", "(-1) * (x)"). The platform's answer check treats
 * that as the implied coefficient of one, and the Representation Bridge's
 * general-form stage — the other caller of describeRewriteGap — must keep
 * accepting "y = 1x - 4" as y = mx + b.
 */
const unwrapParens = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};
const isAdditiveNode = (node) => node?.type === 'OperatorNode' && ['add', 'subtract'].includes(node.fn) && node.args?.length === 2;
const holdsX = (node) => node.filter((child) => child.isSymbolNode && child.name === 'x').length > 0;

const writtenAsMxPlusB = (expression) => {
  let root;
  try { root = parse(String(expression)); } catch { return false; }
  let finished = true;
  root.traverse((raw) => {
    const node = unwrapParens(raw);
    if (!finished || node?.type !== 'OperatorNode') return;
    if (node.fn === 'unaryMinus' && isAdditiveNode(unwrapParens(node.args[0]))) finished = false;
    else if (node.fn === 'multiply' && node.args.length === 2) {
      const [first, second] = node.args;
      if (holdsX(first) && !holdsX(second)) finished = false;
    }
  });
  return finished;
};

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

/*
 * DOES A REWRITTEN EQUATION STILL DESCRIBE THE ORIGINAL LINE?
 *
 * The rewrite workspace only lets a student commit equivalence-preserving
 * steps, so on the device the current equation is always the original line in
 * a new form. A grader that is handed the equation as raw work cannot assume
 * that, so it checks it: the points that satisfy the ORIGINAL equation must
 * satisfy the rewritten one, and points just off it must not.
 *
 * Sampled, not symbolic, so every legitimate intermediate form passes — a
 * product with a variable factor (x(5x + 2y) = 6x), a quotient (6 − 5x)/2, a
 * factored right side — while a different line, or an identity such as 0 = 0
 * (which every point satisfies), fails. The sample coordinates are irrational
 * looking on purpose: a legitimate step can only add or remove solutions on a
 * special set (x = 0 after multiplying by x), and these never land on one.
 */
const ZERO_SET_COORDINATES = Object.freeze([-2.718, -0.577, 1.414, 3.142, 5.25]);
const ZERO_SET_PROBES = Object.freeze([-1.234, 2.345]);
const OFF_SET_OFFSETS = Object.freeze([0.618, -1.732]);

const compileEquationSides = (equation) => {
  try {
    const left = parse(latexToExpression(String(equation?.left ?? ''))).compile();
    const right = parse(latexToExpression(String(equation?.right ?? ''))).compile();
    return (x, y) => {
      try {
        const leftValue = Number(left.evaluate({ x, y }));
        const rightValue = Number(right.evaluate({ x, y }));
        if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
        return { residual: leftValue - rightValue, scale: Math.max(Math.abs(leftValue), Math.abs(rightValue)) };
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
};

const residualTolerance = (scale) => 1e-9 + 1e-7 * scale;
const isBalancedAt = (value) => value !== null && Math.abs(value.residual) <= residualTolerance(value.scale);
/*
 * Off the line, only floating-point noise counts as "balanced there". A
 * legitimate step can shrink how much the equation changes off the line far
 * below 1e-7 of its sides' size while keeping the line — every committed
 * "multiply both sides by x" scales the change by |x| at x = −0.577, and an
 * added term (+ 2y on both sides) inflates the sides without adding to the
 * change — so the on-line tolerance above would call such an equation an
 * identity. An identity reached in the workspace (0 = 0, (x − x)·… = 0)
 * changes by exactly nothing.
 */
const OFF_SET_RELATIVE_NOISE = 1e-12;
const isSolutionOffSet = (value) => value !== null && Math.abs(value.residual) <= OFF_SET_RELATIVE_NOISE * value.scale;

/**
 * Points on the solution set of an equation in x and y, found by fixing one
 * coordinate and solving for the other (the equation must be linear in that
 * other coordinate — every line is). Tries "solve for y" first, then "solve for
 * x" for a vertical line. Returns `{ axis, points }` or null when the equation
 * has no such sampleable solution set.
 */
export const sampleEquationZeroSet = (equation) => {
  const evaluate = compileEquationSides(equation);
  if (!evaluate) return null;
  const solveFor = (axis) => {
    const points = [];
    for (const fixed of ZERO_SET_COORDINATES) {
      const at = (free) => (axis === 'y' ? evaluate(fixed, free) : evaluate(free, fixed));
      const [low, high] = ZERO_SET_PROBES;
      const lowValue = at(low);
      const highValue = at(high);
      if (!lowValue || !highValue) return null;
      const change = highValue.residual - lowValue.residual;
      if (Math.abs(change) <= residualTolerance(Math.max(lowValue.scale, highValue.scale))) return null;
      const root = low - (lowValue.residual * (high - low)) / change;
      const point = axis === 'y' ? { x: fixed, y: root } : { x: root, y: fixed };
      if (!Number.isFinite(root) || !isBalancedAt(evaluate(point.x, point.y))) return null;
      points.push(point);
    }
    return { axis, points };
  };
  return solveFor('y') || solveFor('x');
};

/**
 * True when `equation` holds at every sampled point of `reference` (from
 * sampleEquationZeroSet) and fails just off it — the same solution set.
 */
export const equationKeepsZeroSet = (equation, reference) => {
  if (!reference || !Array.isArray(reference.points) || !reference.points.length) return false;
  const evaluate = compileEquationSides(equation);
  if (!evaluate) return false;
  return reference.points.every((point) => {
    if (!isBalancedAt(evaluate(point.x, point.y))) return false;
    return OFF_SET_OFFSETS.every((offset) => {
      const shifted = reference.axis === 'y' ? evaluate(point.x, point.y + offset) : evaluate(point.x + offset, point.y);
      // Undefined off the line is still "not a solution there".
      return !isSolutionOffSet(shifted);
    });
  });
};
