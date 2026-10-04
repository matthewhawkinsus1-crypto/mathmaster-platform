/*
 * IS THE STUDENT'S FINAL EQUATION (OR RELATION) STILL THE QUESTION'S?
 *
 * The Step Algebra workspaces only commit balanced, solution-preserving moves,
 * so in the browser "the variable is isolated" has always implied "and it is
 * the right answer". A server cannot take that on trust: the final equation
 * arrives as data. So the shared grader checks the one thing the workspace's
 * process guaranteed — that the final state has the SAME SOLUTIONS as the
 * authoritative question's original equation — directly from the two states.
 *
 *   equations   the isolated side, substituted back into the original, makes
 *               the two sides identically equal (every other letter sampled);
 *               a linear standard-form target is checked as a nonzero constant
 *               multiple of the original.
 *   relations   the solution set of the final relation (values, intervals,
 *               "no solution", "all real numbers") equals the original's. The
 *               original's own crossing points are found by a FIXED scan of
 *               the original alone; the truth of both relations is then
 *               compared at every one of the student's endpoints (exactly as
 *               written — never rounded onto a nearby crossing point), at
 *               every crossing point no endpoint stands for, and in every
 *               region between and beyond them.
 *
 * Deterministic: fixed sample points, fixed scan windows, no randomness — the
 * browser and the server reach the same verdict from the same states.
 *
 * BOUNDED. A response is data a tampered client can shape, and mathjs's
 * simplifier is super-linear in the length of a sum or product chain (a
 * 20-term sum takes seconds, a 30-term one minutes). Every student expression
 * is therefore refused — before any engine sees it — unless it is plain
 * algebra within a complexity budget (`studentExpressionBudget`) sized from the
 * AUTHORITATIVE question, never from the work. The relation scan is sized from
 * the original alone, so a forged far-away endpoint can neither coarsen it nor
 * hide a missing boundary.
 *
 * Pure: the hardened mathjs instance (../algebra/safeMath.mjs) and the shared
 * algebra engine only.
 */
import { ParenthesisNode, parse } from '../algebra/safeMath.mjs';
import { simplifyExpression } from '../algebra/algebraAstEngine.mjs';
import {
  relationStateContainsAbsoluteValue,
  verifyRelationCandidate,
} from '../toolMath/algebra-relations/algebraRelationFoundation.mjs';

const CONSTANT_NAMES = new Set(['e', 'pi']);
// Deliberately irregular, non-integer sample values: an expression that only
// agrees with the original at a handful of tidy integers cannot pass.
const SAMPLE_VALUES = Object.freeze([1.37, -2.11, 3.73, 0.59, -4.29, 2.91, 5.17, -0.83, 1.93, -3.47, 4.61, 0.27]);
const MINIMUM_VALID_SAMPLES = 6;
// Two values the workspace computes for the same quantity agree to floating
// error (~1e-15). A forged "nearly right" value does not get the benefit of a
// loose tolerance.
const IDENTITY_TOLERANCE = 1e-9;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const relativelyClose = (left, right, tolerance = IDENTITY_TOLERANCE) => (
  Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right))
);

const parseNode = (text) => {
  try {
    return parse(String(text ?? ''));
  } catch {
    return null;
  }
};

// --- Student text is data ---------------------------------------------------------

/*
 * Nothing a response carries reaches mathjs evaluate, compile or simplify
 * unless it is plain algebra: numbers, letters, + - * / ^, grouping and a
 * short list of school functions. A forged `createUnit(...)`, `import(...)`,
 * assignment, range (`1:1e9`), matrix or string literal is refused before any
 * engine sees it — on the server it would otherwise run inside the grading
 * process.
 */
const SAFE_OPERATORS = new Set(['add', 'subtract', 'multiply', 'divide', 'unaryMinus', 'unaryPlus', 'pow']);
// Pure scalar functions of school mathematics only — never one that reaches
// the parser, the unit table, the type system or allocates (safeMath.mjs).
const SAFE_FUNCTIONS = new Set([
  'abs', 'sqrt', 'cbrt', 'nthRoot', 'nthroot', 'exp', 'log', 'log10', 'log2', 'ln',
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan',
]);
const MAX_EXPRESSION_LENGTH = 1000;

/*
 * THE COMPLEXITY BUDGET. The floor is far above any state a school equation
 * passes through on the balance (authored sides are a handful of terms; the
 * workspace forces numeric sides to be simplified and structural pairs to be
 * cancelled, so a side only grows by the terms a student adds without
 * combining) and low enough that the engine's worst case at the floor stays
 * well under a second. An authored question larger than the floor raises the
 * budget to its own size: the author's equation is trusted, the student's
 * text is not.
 *
 * MEASURED, NOT GUESSED (mathjs simplify, one call, on the shapes that cost
 * the most). Its cost grows steeply with the chain length, and a term that
 * holds a letter in a denominator (or under a negative or fractional power)
 * makes every other term of the sum part of a common-denominator rewrite:
 *
 *   chain 12, 12 reciprocal terms  `2/(x - 1) - 3/(x - 2) - ...`   ~3 s
 *   chain 12, no reciprocal term   `(x - 0)^3 - (x - 1)^3 - ...`   ~0.8 s
 *   chain 10, 1 reciprocal term    plus nine cubed binomials        ~1.2 s
 *   chain 10, no reciprocal term   (the worst shape found)          ~0.35 s
 *   chain  8, 3 reciprocal terms   (the worst shape found)          ~0.3 s
 *
 * So the floor is a 10-link chain, or an 8-link chain once the expression
 * holds a reciprocal term, with at most 3 of those. A grading simplifies each
 * side at most twice and each authored prompt answer once; the worst whole
 * grading measured (both sides and three prompt answers at the worst shape)
 * took ~1.5 s, against 6-15 s at the earlier 12-link floor.
 */
export const STUDENT_EXPRESSION_BUDGET = Object.freeze({ nodes: 200, depth: 24, chain: 10, reciprocalChain: 8, reciprocals: 3 });

const CHAIN_FAMILY = Object.freeze({ add: 'sum', subtract: 'sum', multiply: 'product', divide: 'product' });
const chainFamily = (node) => (node?.isOperatorNode ? CHAIN_FAMILY[node.fn] || null : null);
// Parentheses and signs are transparent to the simplifier's flattening.
const unwrapChainLink = (node) => {
  let current = node;
  while (current?.isParenthesisNode || (current?.isOperatorNode && (current.fn === 'unaryMinus' || current.fn === 'unaryPlus'))) {
    current = current.isParenthesisNode ? current.content : current.args[0];
  }
  return current;
};
const chainLength = (node, family) => {
  const inner = unwrapChainLink(node);
  if (chainFamily(inner) !== family) return 1;
  return inner.args.reduce((total, arg) => total + chainLength(arg, family), 0);
};

/** Does this subtree hold a letter (never a function's own name, e or pi)? */
const holdsLetter = (node) => {
  let found = false;
  node?.traverse((child, path, parent) => {
    if (found || !child?.isSymbolNode) return;
    if (parent?.isFunctionNode && path === 'fn') return;
    if (CONSTANT_NAMES.has(child.name)) return;
    found = true;
  });
  return found;
};
const isNaturalExponent = (node) => {
  let current = node;
  while (current?.isParenthesisNode) current = current.content;
  return Boolean(current?.isConstantNode) && Number.isInteger(current.value) && current.value >= 0;
};
// A letter in a denominator, or under a negative or fractional power: the
// terms the simplifier must bring over a common denominator.
const isReciprocalLink = (node) => Boolean(node?.isOperatorNode) && (
  (node.fn === 'divide' && holdsLetter(node.args[1]))
  || (node.fn === 'pow' && holdsLetter(node.args[0]) && !isNaturalExponent(node.args[1]))
);

/**
 * Node count, nesting depth, the longest flattened sum or product chain, and
 * how many reciprocal terms (a letter in a denominator or under a negative or
 * fractional power) the expression holds.
 */
export const expressionComplexity = (node) => {
  let nodes = 0;
  let depth = 0;
  let chain = 1;
  let reciprocals = 0;
  const visit = (current, level) => {
    nodes += 1;
    depth = Math.max(depth, level);
    const family = chainFamily(current);
    if (family) chain = Math.max(chain, chainLength(current, family));
    if (isReciprocalLink(current)) reciprocals += 1;
    current.forEach((child) => visit(child, level + 1));
  };
  if (node) visit(node, 1);
  return { nodes, depth, chain, reciprocals };
};

/**
 * The budget for student expressions answering these AUTHORED expressions:
 * the floor, or the largest authored expression's own size when that is
 * larger. Reciprocal terms move between sides as a formula is rearranged
 * (1/f = 1/u + 1/v solved for u ends as u = 1 / (1/f - 1/v)), so their
 * allowance is every authored reciprocal plus one.
 */
export const studentExpressionBudget = (...authored) => {
  const measures = authored.flat()
    .map((source) => (typeof source === 'string' && source.length <= 4 * MAX_EXPRESSION_LENGTH ? parseNode(source) : null))
    .filter(Boolean)
    .map(expressionComplexity);
  const largest = (key) => Math.max(0, ...measures.map((measure) => measure[key]));
  const total = (key) => measures.reduce((sum, measure) => sum + measure[key], 0);
  return Object.freeze({
    nodes: Math.max(STUDENT_EXPRESSION_BUDGET.nodes, 2 * largest('nodes')),
    depth: Math.max(STUDENT_EXPRESSION_BUDGET.depth, largest('depth') + 4),
    chain: Math.max(STUDENT_EXPRESSION_BUDGET.chain, largest('chain')),
    reciprocalChain: Math.max(STUDENT_EXPRESSION_BUDGET.reciprocalChain, largest('chain')),
    reciprocals: Math.max(STUDENT_EXPRESSION_BUDGET.reciprocals, total('reciprocals') + 1),
  });
};

/** Is this student text plain algebra, inside the budget? */
export const isSafeStudentExpression = (source, budget = STUDENT_EXPRESSION_BUDGET) => {
  const raw = String(source ?? '');
  if (!raw.trim() || raw.length > MAX_EXPRESSION_LENGTH) return false;
  let node;
  try {
    node = parse(raw);
  } catch {
    return false;
  }
  let count = 0;
  let safe = true;
  node.traverse((child, path, parent) => {
    count += 1;
    if (!safe) return;
    if (count > budget.nodes) { safe = false; return; }
    if (child.isParenthesisNode) return;
    if (child.isConstantNode) { safe = typeof child.value === 'number'; return; }
    if (child.isSymbolNode) {
      if (parent?.isFunctionNode && path === 'fn') { safe = SAFE_FUNCTIONS.has(child.name); return; }
      safe = /^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(child.name);
      return;
    }
    if (child.isOperatorNode) { safe = SAFE_OPERATORS.has(child.fn); return; }
    if (child.isFunctionNode) { safe = Boolean(child.fn?.isSymbolNode) && SAFE_FUNCTIONS.has(child.fn.name); return; }
    safe = false;
  });
  if (!safe) return false;
  const measure = expressionComplexity(node);
  const reciprocals = budget.reciprocals ?? STUDENT_EXPRESSION_BUDGET.reciprocals;
  const chain = measure.reciprocals > 0
    ? Math.min(budget.chain, budget.reciprocalChain ?? STUDENT_EXPRESSION_BUDGET.reciprocalChain)
    : budget.chain;
  return measure.nodes <= budget.nodes
    && measure.depth <= budget.depth
    && measure.chain <= chain
    && measure.reciprocals <= reciprocals;
};

// --- Evaluation -------------------------------------------------------------------

/** Variable names in an expression — never a function's own name, never e or pi. */
export const freeSymbols = (node) => {
  if (!node) return [];
  const names = new Set();
  node.traverse((child, path, parent) => {
    if (!child?.isSymbolNode) return;
    if (parent?.isFunctionNode && path === 'fn') return;
    if (CONSTANT_NAMES.has(child.name)) return;
    names.add(child.name);
  });
  return [...names];
};

const compiled = (node) => {
  if (!node) return null;
  try {
    return node.compile();
  } catch {
    return null;
  }
};

const valueAt = (code, scope) => {
  if (!code) return null;
  try {
    const raw = code.evaluate({ ...scope });
    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const sampleScope = (symbols, sample) => Object.fromEntries(symbols.map((name, index) => [
  name,
  SAMPLE_VALUES[(sample * 5 + index * 7) % SAMPLE_VALUES.length],
]));

/** Replace every occurrence of `variable` with the expression `replacement`. */
const substitute = (node, variable, replacement) => node.transform((child, path, parent) => {
  if (child?.isSymbolNode && child.name === variable && !(parent?.isFunctionNode && path === 'fn')) {
    return new ParenthesisNode(replacement.cloneDeep());
  }
  return child;
});

/**
 * The sampled comparison behind identicallyEqual, keeping apart the two ways
 * it can fail to show equality: 'different' (a defined sample disagrees —
 * the expressions are not equal) and 'unknown' (too few defined samples, or
 * an expression that cannot be evaluated). Exported for the server's step
 * verification (stepAlgebraStepVerification.mjs), which only needs a slower
 * check when the answer is 'unknown'.
 */
export const IDENTITY = Object.freeze({ EQUAL: 'equal', DIFFERENT: 'different', UNKNOWN: 'unknown' });

export const compareIdentically = (leftNode, rightNode) => {
  const left = compiled(leftNode);
  const right = compiled(rightNode);
  if (!left || !right) return IDENTITY.UNKNOWN;
  const symbols = [...new Set([...freeSymbols(leftNode), ...freeSymbols(rightNode)])];
  if (!symbols.length) {
    const a = valueAt(left, {});
    const b = valueAt(right, {});
    if (a === null || b === null) return IDENTITY.UNKNOWN;
    return relativelyClose(a, b) ? IDENTITY.EQUAL : IDENTITY.DIFFERENT;
  }
  let valid = 0;
  for (let sample = 0; sample < SAMPLE_VALUES.length; sample += 1) {
    const scope = sampleScope(symbols, sample);
    const a = valueAt(left, scope);
    const b = valueAt(right, scope);
    if (a === null || b === null) continue;
    if (!relativelyClose(a, b)) return IDENTITY.DIFFERENT;
    valid += 1;
  }
  return valid >= MINIMUM_VALID_SAMPLES ? IDENTITY.EQUAL : IDENTITY.UNKNOWN;
};

/**
 * Are two expressions equal for every value of every letter in them? Sampled
 * at fixed irregular points; a sample where either side is undefined (a zero
 * denominator) is skipped, and too few defined samples is "not shown equal".
 */
export const identicallyEqual = (leftNode, rightNode) => compareIdentically(leftNode, rightNode) === IDENTITY.EQUAL;

// --- Equations ----------------------------------------------------------------------

const isolatedSide = (equation, variable) => {
  const isVariable = (side) => {
    try {
      return simplifyExpression(side) === variable;
    } catch {
      return false;
    }
  };
  if (isVariable(equation.left)) return equation.right;
  if (isVariable(equation.right)) return equation.left;
  return null;
};

/**
 * Two linear equations in several letters are the same equation exactly when
 * one's (left - right) is a nonzero constant multiple of the other's.
 */
const proportionalEquations = (original, final) => {
  const originalNode = parseNode(`(${original.left}) - (${original.right})`);
  const finalNode = parseNode(`(${final.left}) - (${final.right})`);
  const originalCode = compiled(originalNode);
  const finalCode = compiled(finalNode);
  if (!originalCode || !finalCode) return false;
  const symbols = [...new Set([...freeSymbols(originalNode), ...freeSymbols(finalNode)])];
  if (!symbols.length) return false;
  let ratio = null;
  let valid = 0;
  for (let sample = 0; sample < SAMPLE_VALUES.length; sample += 1) {
    const scope = sampleScope(symbols, sample);
    const a = valueAt(originalCode, scope);
    const b = valueAt(finalCode, scope);
    if (a === null || b === null) continue;
    if (Math.abs(a) <= 1e-12) {
      if (Math.abs(b) > 1e-9) return false;
      valid += 1;
      continue;
    }
    const k = b / a;
    if (ratio === null) {
      if (Math.abs(k) <= 1e-12) return false;
      ratio = k;
    } else if (!relativelyClose(k, ratio)) {
      return false;
    }
    valid += 1;
  }
  return ratio !== null && valid >= MINIMUM_VALID_SAMPLES;
};

/**
 * Does the final equation have the original equation's solutions, for the
 * question's own objective?
 *
 *   original, final: { left, right } as the workspace stores them
 *   objective: the AUTHORITATIVE objective (parseEquationInput(question))
 */
export const equationMatchesOriginal = ({ original, final, objective = {}, variable = 'x' } = {}) => {
  if (!original || !final) return false;
  if (objective.kind === 'linearStandardForm') return proportionalEquations(original, final);
  const target = String(objective.variable || variable || 'x');
  const isolated = isolatedSide(final, target);
  if (isolated === null) return false;
  const value = parseNode(isolated);
  const left = parseNode(original.left);
  const right = parseNode(original.right);
  if (!value || !left || !right) return false;
  if (freeSymbols(value).includes(target)) return false;
  return identicallyEqual(substitute(left, target, value), substitute(right, target, value));
};

/** The isolated side's numeric value (no letters), or null. */
export const isolatedNumericValue = (final, variable) => {
  const isolated = isolatedSide(final, String(variable || 'x'));
  const node = isolated === null ? null : parseNode(isolated);
  if (!node || freeSymbols(node).length) return null;
  return valueAt(compiled(node), {});
};

// --- One-variable relations -----------------------------------------------------------

/*
 * WHERE THE ORIGINAL RELATION'S TRUTH CAN CHANGE: a fixed scan of the
 * ORIGINAL alone. The fine window resolves the boundaries school relations
 * have; the wider windows find a boundary far from zero (0.001x < 5000). None
 * is sized by the student's values — a forged endpoint at 1e300 used to stretch
 * the one window until the original's real boundaries fell between its grid
 * points, and a wrong answer with that extra branch was marked correct.
 */
const SCAN_WINDOWS = Object.freeze([
  Object.freeze({ range: 50, steps: 4000, fine: true }),
  Object.freeze({ range: 5e3, steps: 1000, fine: false }),
  Object.freeze({ range: 5e5, steps: 1000, fine: false }),
  Object.freeze({ range: 5e7, steps: 1000, fine: false }),
  Object.freeze({ range: 5e9, steps: 1000, fine: false }),
  Object.freeze({ range: 1e12, steps: 1000, fine: false }),
]);
/** A solution value or endpoint beyond this is not one the scan can confirm. */
export const MAX_SOLUTION_MAGNITUDE = 1e12;
const MERGE_TOLERANCE = 1e-6;
// Floating error between two computations of the same number.
const EXACT_TOLERANCE = 1e-12;
const BISECTION_LIMIT = 200;

const bisectRoot = (at, lo0, hi0, flo0) => {
  let lo = lo0;
  let hi = hi0;
  let flo = flo0;
  for (let step = 0; step < BISECTION_LIMIT; step += 1) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    const fm = at(mid);
    if (fm === null) return null;
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return (lo + hi) / 2;
};

/**
 * Every real root of f on one window: sign changes (bisected to convergence;
 * a pole, where |f| blows up instead of vanishing, is rejected) — and, in the
 * fine window, exact grid zeros and touching roots (local minima of |f| that
 * reach zero, such as (x - 3)^2). `identity` is true when f vanishes
 * everywhere it is defined in the window.
 */
const scanWindow = (code, variable, { range, steps, fine }) => {
  const at = (x) => valueAt(code, { [variable]: x });
  const xs = [];
  const fs = [];
  for (let index = 0; index <= steps; index += 1) {
    const x = -range + (2 * range * index) / steps;
    xs.push(x);
    fs.push(at(x));
  }
  const finite = fs.filter((value) => value !== null);
  if (!finite.length) return { roots: [], identity: false };
  const scale = Math.max(...finite.map(Math.abs));
  if (fine && scale <= 1e-9) return { roots: [], identity: true };
  const roots = [];
  for (let index = 0; index <= steps; index += 1) {
    // A wide window's scale is dominated by its far ends, so there only an
    // exact zero counts as a grid root.
    const value = fs[index];
    if (value !== null && (value === 0 || (fine && Math.abs(value) <= 1e-12 * scale))) roots.push(xs[index]);
  }
  for (let index = 0; index < steps; index += 1) {
    const a = fs[index];
    const b = fs[index + 1];
    if (a === null || b === null || a === 0 || b === 0 || Math.sign(a) === Math.sign(b)) continue;
    const root = bisectRoot(at, xs[index], xs[index + 1], a);
    if (root === null) continue;
    const residual = at(root);
    if (residual !== null && Math.abs(residual) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b))) roots.push(root);
  }
  if (fine) {
    for (let index = 1; index < steps; index += 1) {
      const [a, b, c] = [fs[index - 1], fs[index], fs[index + 1]];
      if (a === null || b === null || c === null) continue;
      if (Math.sign(a) !== Math.sign(b) || Math.sign(b) !== Math.sign(c)) continue;
      if (!(Math.abs(b) <= Math.abs(a) && Math.abs(b) <= Math.abs(c))) continue;
      // Golden-section search for the minimum of |f| on [x(i-1), x(i+1)].
      let lo = xs[index - 1];
      let hi = xs[index + 1];
      const ratio = (Math.sqrt(5) - 1) / 2;
      for (let step = 0; step < 90; step += 1) {
        const m1 = hi - ratio * (hi - lo);
        const m2 = lo + ratio * (hi - lo);
        const f1 = at(m1);
        const f2 = at(m2);
        if (f1 === null || f2 === null) break;
        if (Math.abs(f1) <= Math.abs(f2)) hi = m2; else lo = m1;
      }
      const minimum = (lo + hi) / 2;
      const residual = at(minimum);
      if (residual !== null && Math.abs(residual) <= 1e-10 * scale) roots.push(minimum);
    }
  }
  return { roots, identity: false };
};

/** The difference functions whose zeros are where a relation's truth can change. */
const crossingFunctions = (state) => (state?.branches || []).flatMap((branch) => {
  const expressions = Array.isArray(branch?.expressions) ? branch.expressions : [];
  return expressions.slice(0, -1).map((expression, index) => parseNode(`(${expression}) - (${expressions[index + 1]})`));
});

const relationHasOnlyVariable = (state, variable) => (state?.branches || []).every((branch) => (
  (branch?.expressions || []).every((expression) => {
    const node = parseNode(expression);
    return Boolean(node) && freeSymbols(node).every((name) => name === variable);
  })
));

const mergedPoints = (values, tolerance = MERGE_TOLERANCE) => {
  const sorted = values.filter(isFiniteNumber).sort((left, right) => left - right);
  const merged = [];
  sorted.forEach((point) => {
    if (!merged.length || !relativelyClose(merged[merged.length - 1], point, tolerance)) merged.push(point);
  });
  return merged;
};

/** Is `value` itself a crossing point of the relation — two adjacent sides equal there? */
const crossesAt = (state, variable, value) => (state?.branches || []).some((branch) => {
  const nodes = (branch?.expressions || []).map(parseNode);
  const values = nodes.map((node) => valueAt(compiled(node), { [variable]: value }));
  return values.slice(0, -1).some((left, index) => {
    const right = values[index + 1];
    return left !== null && right !== null && relativelyClose(left, right, EXACT_TOLERANCE * 1e3);
  });
});

/** Every point where the ORIGINAL relation's truth may change. */
const criticalPoints = (original, variable) => {
  const points = [];
  let identity = true;
  for (const node of crossingFunctions(original)) {
    const code = compiled(node);
    SCAN_WINDOWS.forEach((window) => {
      const scan = scanWindow(code, variable, window);
      if (window.fine && !scan.identity) identity = false;
      points.push(...scan.roots);
    });
  }
  return { points: mergedPoints(points), identity };
};

const nearest = (points, value) => points.find((point) => relativelyClose(point, value, MERGE_TOLERANCE)) ?? null;

const FALLBACK_PROBES = Object.freeze([-1e11, -1e3, -1.37, 0.59, 2.91, 1e3, 1e11]);

/** One probe beyond each end and one between every pair of neighbouring points. */
const probesAround = (points) => {
  if (!points.length) return [...FALLBACK_PROBES];
  const probes = [points[0] - 1 - Math.abs(points[0]), points[points.length - 1] + 1 + Math.abs(points[points.length - 1])];
  for (let index = 0; index < points.length - 1; index += 1) probes.push((points[index] + points[index + 1]) / 2);
  return probes;
};

/**
 * Every way of writing each |u| in one branch's expressions as +u or -u — the
 * sign branches the workspace's "reverse absolute value" step produces. Empty
 * when the branch holds no absolute value (or more than four).
 */
const absoluteSignBranches = (nodes) => {
  let count = 0;
  nodes.forEach((node) => node.traverse((child) => {
    if (child?.isFunctionNode && child.fn?.name === 'abs') count += 1;
  }));
  if (count === 0 || count > 4) return [];
  const variants = [];
  for (let signs = 0; signs < (1 << count); signs += 1) {
    let seen = 0;
    variants.push(nodes.map((node) => node.transform((child) => {
      if (child?.isFunctionNode && child.fn?.name === 'abs' && child.args?.length === 1) {
        const negative = (signs >> seen) & 1;
        seen += 1;
        const inner = new ParenthesisNode(child.args[0].cloneDeep());
        return negative ? parse(`-(${inner.content.toString()})`) : inner;
      }
      return child;
    })));
  }
  return variants;
};

/**
 * With every |u| written as +u or -u, does some choice of signs make the
 * original relation's equalities hold at `value`? A legitimate extraneous
 * candidate always comes from such a branch; an invented one does not.
 */
const absoluteBranchCandidate = (original, variable, value) => (original?.branches || []).some((branch) => {
  const nodes = (branch?.expressions || []).map(parseNode);
  if (nodes.some((node) => !node)) return false;
  return absoluteSignBranches(nodes).some((replaced) => {
    const values = replaced.map((node) => valueAt(compiled(node), { [variable]: value }));
    if (values.some((entry) => entry === null)) return false;
    return values.slice(0, -1).every((entry, index) => relativelyClose(entry, values[index + 1], 1e-8));
  });
});

/**
 * Both relations judged at each point. A point where the original is
 * undefined (outside a square root's domain) is not a comparison; `compared`
 * counts the ones that were.
 */
const compareTruth = (original, final, variable, points) => {
  let compared = 0;
  for (const point of points) {
    const expected = verifyRelationCandidate(original, point, variable);
    if (expected === null) continue;
    if (verifyRelationCandidate(final, point, variable) !== expected) return { agrees: false, compared };
    compared += 1;
  }
  return { agrees: true, compared };
};

const withinScan = (value) => isFiniteNumber(value) && Math.abs(value) <= MAX_SOLUTION_MAGNITUDE;

const POLYNOMIAL_OPERATORS = new Set(['add', 'subtract', 'multiply', 'unaryMinus', 'unaryPlus']);
const MAX_POLYNOMIAL_EXPONENT = 10;

/**
 * Is this expression a polynomial in `variable`: numbers, the variable,
 * + − ×, division only BY a number, and whole-number powers? Then it is
 * defined for every real number, and two such expressions agree everywhere
 * exactly when they are identically equal.
 */
const isPolynomialIn = (node, variable) => {
  let polynomial = true;
  node.traverse((child) => {
    if (!polynomial) return;
    if (child.isConstantNode) polynomial = typeof child.value === 'number';
    else if (child.isSymbolNode) polynomial = child.name === variable;
    else if (child.isParenthesisNode) polynomial = true;
    else if (child.isOperatorNode && POLYNOMIAL_OPERATORS.has(child.fn)) polynomial = true;
    else if (child.isOperatorNode && child.fn === 'divide') polynomial = freeSymbols(child.args[1]).length === 0;
    else if (child.isOperatorNode && child.fn === 'pow') {
      const exponent = child.args[1]?.isConstantNode ? child.args[1].value : null;
      polynomial = Number.isInteger(exponent) && exponent >= 0 && exponent <= MAX_POLYNOMIAL_EXPONENT;
    } else polynomial = false;
  });
  return polynomial;
};

/**
 * "All real numbers" for an equation between polynomials: true exactly when
 * its sides are identically equal; null when the relation is not one (an
 * inequality, an absolute value, a variable in a denominator…), which keeps
 * the region scan below. Judged this way rather than by that scan's far
 * probes (±1e11), where floating error in a coefficient such as 5/3 makes
 * −(5/4)x − (5/3)x = −(35/12)x read false.
 */
const polynomialIdentity = (original, variable) => {
  const branches = original?.branches || [];
  if (branches.length !== 1) return null;
  const [branch] = branches;
  if (!(branch.relations || []).length || !branch.relations.every((relation) => relation === '=')) return null;
  const nodes = (branch.expressions || []).map(parseNode);
  if (nodes.some((node) => !node || !isPolynomialIn(node, variable))) return null;
  const verdicts = nodes.slice(0, -1).map((node, index) => compareIdentically(node, nodes[index + 1]));
  if (verdicts.includes(IDENTITY.UNKNOWN)) return null;
  return verdicts.every((verdict) => verdict === IDENTITY.EQUAL);
};

/**
 * Does the final relation state have exactly the original relation's solution
 * set? `summary` is relationSolutionSummary(final).
 *
 *   values        every value solves the original — or, for an absolute-value
 *                 original, is an extraneous candidate of one of its sign
 *                 branches — and no solution of the original is missing;
 *   exactValues   the same, evaluated; with other letters present, each value
 *                 substituted back makes the original hold identically;
 *   intervals /   the original and final agree at each of the student's own
 *   special       endpoints (judged AT that endpoint), at every crossing point
 *                 of the original no endpoint stands for, and in every region
 *                 between and beyond them.
 *
 * A value or endpoint beyond MAX_SOLUTION_MAGNITUDE is not confirmed.
 */
export const relationMatchesOriginal = ({ original, final, summary } = {}) => {
  if (!original || !final || !summary?.solved) return false;
  const variable = String(original.variable || 'x');
  const hasAbsolute = relationStateContainsAbsoluteValue(original);

  if (!relationHasOnlyVariable(original, variable)) {
    // A literal relation: only an isolated symbolic solution can be checked.
    // Each value, substituted back, must make the original's equalities hold
    // identically — or, for an absolute value, one of its sign branches: the
    // workspace splits |x - h| = k into x = h + k OR x = h - k, and |k| = k
    // holds only for k >= 0, so the original itself never holds identically.
    if (summary.kind !== 'exactValues') return false;
    if ((original.branches || []).length !== 1) return false;
    const [branch] = original.branches;
    const nodes = (branch.expressions || []).map(parseNode);
    if (nodes.some((node) => !node) || (branch.relations || []).some((relation) => relation !== '=')) return false;
    const signBranches = hasAbsolute ? absoluteSignBranches(nodes) : [];
    return summary.exactValues.every((expression) => {
      const value = parseNode(expression);
      if (!value || freeSymbols(value).includes(variable)) return false;
      const holds = (sides) => sides.slice(0, -1).every((node, index) => identicallyEqual(
        substitute(node, variable, value),
        substitute(sides[index + 1], variable, value),
      ));
      return holds(nodes) || signBranches.some(holds);
    });
  }

  if (summary.kind === 'values' || summary.kind === 'exactValues') {
    const values = summary.kind === 'values'
      ? summary.values
      : summary.exactValues.map((expression) => {
        const node = parseNode(expression);
        return node && !freeSymbols(node).length ? valueAt(compiled(node), {}) : null;
      });
    if (!values.length || !values.every(withinScan)) return false;
    const solves = (value) => verifyRelationCandidate(original, value, variable) === true;
    const legitimate = values.every((value) => solves(value) || (hasAbsolute && absoluteBranchCandidate(original, variable, value)));
    if (!legitimate) return false;
    const { points, identity } = criticalPoints(original, variable);
    if (identity) return false;
    const solutions = values.filter(solves);
    // No solution of the original may be missing from the final values.
    if (points.some((point) => solves(point) && nearest(solutions, point) === null)) return false;
    // Isolated values: the original must hold nowhere between them.
    return probesAround(mergedPoints([...points, ...values])).every((probe) => verifyRelationCandidate(original, probe, variable) !== true);
  }

  if (summary.kind === 'special' && summary.special === 'allReals' && !hasAbsolute) {
    const identity = polynomialIdentity(original, variable);
    if (identity !== null) return identity;
  }

  if (summary.kind === 'intervals' || summary.kind === 'special') {
    const endpoints = summary.kind === 'intervals'
      ? summary.intervals.flatMap((interval) => [interval.min, interval.max]).filter(isFiniteNumber)
      : [];
    if (!endpoints.every(withinScan)) return false;
    const { points } = criticalPoints(original, variable);
    // A crossing point of the original is judged AT the student's endpoint
    // only when that endpoint is itself a crossing point of the original (to
    // floating error) — the exact boundary, written as the student wrote it.
    // Every other crossing point is judged where it is, so a boundary that is
    // merely close to the right one (0.3333333 for 1/3) is still wrong.
    const boundaries = endpoints.filter((endpoint) => crossesAt(original, variable, endpoint));
    const unrepresented = points.filter((point) => nearest(boundaries, point) === null);
    if (!compareTruth(original, final, variable, [...endpoints, ...unrepresented]).agrees) return false;
    const regions = compareTruth(original, final, variable, probesAround(mergedPoints([...endpoints, ...unrepresented], EXACT_TOLERANCE)));
    return regions.agrees && regions.compared > 0;
  }

  return false;
};
