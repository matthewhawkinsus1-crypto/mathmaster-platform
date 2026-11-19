/*
 * HOW LARGE AN EXPRESSION MAY BE BEFORE mathjs IS ASKED TO SIMPLIFY IT.
 *
 * equivalence.mjs decides whether a student's expression is the key by
 * simplifying `(student) - (key)` and reading the result for `0`. mathjs's
 * simplify flattens every sum and product and tries every way of regrouping
 * it, so its cost is exponential in the length of a chain, and nothing in the
 * 300 characters an answer may hold (expressionSafety.mjs) stops a chain:
 *
 *   x/x/x/… 24 terms, 47 characters        2.8 s
 *   x^2+x^2+… 20 terms, 79 characters      2.2 s
 *   (x+1)(x+1)… 20 factors, 100 characters 3.1 s
 *   x*y/x*y/… 14 terms, 55 characters      5 s
 *   x1/x1/… 80 terms, 241 characters       does not finish
 *
 * (a developer machine, November 2026; a student's Chromebook is several
 * times slower). The grader fuzz harness found it (scripts/lib/graderFuzz):
 * the student's tab froze on Check, and the server, which marks a composed
 * question with this same code, held a function instance until its timeout.
 * Step Algebra met the same cost and bounds what a student may type
 * (serverGrading/stepAlgebraEquivalence.mjs STUDENT_EXPRESSION_BUDGET); this
 * is that measure for the difference equivalence.mjs builds, kept here so the
 * composed-workflow grader does not load Step Algebra's engine.
 *
 * A difference inside the budget is simplified exactly as before. Past it,
 * the two sides are first compared at fixed irregular points (compareAtSamples),
 * which is linear in their size:
 *
 *   they differ at a point    not equal, whatever simplify would have said:
 *                             this is every wrong answer, at once
 *   they agree at every point simplify is still asked while the chain is one
 *                             it finishes (SIMPLIFY_LIMIT), so the verdict is
 *                             the one it always gave; past that, where it
 *                             never gave one, agreeing everywhere is equal
 *   a point says nothing      (too few defined, or float values too close to
 *                             call): as above while simplify can be asked;
 *                             past that, not shown equal
 *
 * "Agree" is exact wherever it can be: a rational expression is evaluated in
 * fractions, so no tolerance stands in for equality (see compareAtSamples).
 *
 * So no verdict simplify gave in about a second changes, and no input stalls.
 * simplify does not expand or factor (`2(x+3)` is not `2x+6` to it), and the
 * points cannot tell those apart: only past SIMPLIFY_LIMIT, where there was no
 * verdict at all, does equal value alone decide.
 *
 * Pure, and imports nothing: it reads nodes equivalence.mjs has already parsed.
 */

/*
 * The longest flattened chain simplify is given, and the size of the whole
 * difference. The floor Step Algebra uses: over thousands of seeded
 * differences at this edge the slowest simplified in about a quarter of a
 * second here, against 1.3 s at a 14-link chain and no end at all past 40
 * (tests/platform/algebraicEquivalenceBudget.test.mjs holds the worst shapes
 * to a time). The node count is not what costs; it bounds the walk.
 */
export const SIMPLIFY_BUDGET = Object.freeze({ nodes: 200, chain: 10 });

/*
 * The longest chain simplify is asked about at all, and then only for sides
 * that agree at every sample point. The slowest seeded difference at 14 links
 * took 1.3 s here; at 16, several.
 */
export const SIMPLIFY_LIMIT = Object.freeze({ nodes: 200, chain: 14 });

const CHAIN_FAMILY = Object.freeze({ add: 'sum', subtract: 'sum', multiply: 'product', divide: 'product' });
const chainFamily = (node) => (node?.isOperatorNode ? CHAIN_FAMILY[node.fn] || null : null);
// Brackets and signs are transparent to the simplifier's flattening.
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

/** Node count and the longest flattened sum or product chain of a parsed expression. */
export const simplifyCost = (node) => {
  let nodes = 0;
  let chain = 1;
  const visit = (current) => {
    nodes += 1;
    const family = chainFamily(current);
    if (family) chain = Math.max(chain, chainLength(current, family));
    current.forEach(visit);
  };
  if (node) visit(node);
  return { nodes, chain };
};

/** May mathjs simplify this parsed expression, or would it take too long? */
export const withinSimplifyBudget = (node, budget = SIMPLIFY_BUDGET) => {
  const cost = simplifyCost(node);
  return cost.nodes <= budget.nodes && cost.chain <= budget.chain;
};

export const SAMPLED = Object.freeze({ EQUAL: 'equal', DIFFERENT: 'different', UNKNOWN: 'unknown' });

/**
 * How a difference past the budget is decided (the table above):
 * 'different', 'equal', or 'simplify' when mathjs should still be asked.
 */
export const decidePastBudget = (differenceNode, leftNode, rightNode, fraction = null) => {
  const sampled = compareAtSamples(leftNode, rightNode, fraction);
  if (sampled === SAMPLED.DIFFERENT) return SAMPLED.DIFFERENT;
  if (withinSimplifyBudget(differenceNode, SIMPLIFY_LIMIT)) return 'simplify';
  return sampled === SAMPLED.EQUAL ? SAMPLED.EQUAL : SAMPLED.DIFFERENT;
};

// Irregular, so no small-integer coincidence makes two expressions agree; of
// both signs and none zero or one, so a denominator or a root is defined at
// most of them. The same points Step Algebra samples at, as exact hundredths.
const SAMPLE_HUNDREDTHS = Object.freeze([137, -211, 373, 59, -429, 291, 517, -83, 193, -347, 461, 27]);
const MINIMUM_VALID_SAMPLES = 6;
const CONSTANT_NAMES = new Set(['e', 'pi', 'i', 'Infinity', 'NaN', 'true', 'false', 'null']);

/*
 * TWO WAYS TO READ A POINT, AND WHAT EACH IS EVIDENCE OF (PR #560 review).
 *
 * EXACTLY, in fractions, wherever the expression is rational (sums, products,
 * quotients, whole powers): the two values are the same fraction or they are
 * not. No tolerance, so a large shared term hides nothing: `10000000+x` and
 * `10000001+x` differ by exactly one at every point.
 *
 * IN FLOATING POINT, where a root, a logarithm, π or a fractional power makes
 * a fraction impossible. A real or a complex value counts (a root of a
 * negative number is a value both sides share, not a hole in the domain).
 * Rounding makes equal values differ a little, so there are two lines, not
 * one: past SCREEN the sides differ; within AGREE they agree; between the two
 * a point says nothing, and a comparison with such a point is 'unknown',
 * never 'equal'.
 */
const SCREEN_TOLERANCE = 1e-6;
const AGREE_TOLERANCE = 1e-12;
const POINT = Object.freeze({ AGREE: 'agree', DIFFER: 'differ', UNDEFINED: 'undefined', UNSURE: 'unsure' });

const lettersOf = (node) => {
  const names = new Set();
  node.traverse((child, path, parent) => {
    if (!child?.isSymbolNode || (parent?.isFunctionNode && path === 'fn') || CONSTANT_NAMES.has(child.name)) return;
    names.add(child.name);
  });
  return [...names];
};

// Fraction arithmetic is exact, so a tower of powers is exact and enormous:
// it is only tried where the powers are small whole numbers.
const MAX_EXACT_DEGREE = 64;
const exactDegree = (node) => {
  if (!node) return 1;
  if (node.isParenthesisNode) return exactDegree(node.content);
  if (node.isOperatorNode && node.fn === 'pow') {
    let exponent = node.args[1];
    while (exponent?.isParenthesisNode) exponent = exponent.content;
    if (exponent?.isOperatorNode && exponent.fn === 'unaryMinus') exponent = exponent.args[0];
    if (!exponent?.isConstantNode || !Number.isInteger(exponent.value) || exponent.value < 0) return Infinity;
    return exactDegree(node.args[0]) * Math.max(1, exponent.value);
  }
  let degree = 1;
  node.forEach((child) => { degree = Math.max(degree, exactDegree(child)); });
  return degree;
};

const isFraction = (value) => Boolean(value) && typeof value === 'object' && typeof value.equals === 'function' && 'n' in value && 'd' in value;

const exactAt = (code, scope) => {
  try {
    const value = code.evaluate({ ...scope });
    return isFraction(value) ? value : null;
  } catch {
    return null;
  }
};

/** A finite real or complex value as [re, im], or null. */
const floatAt = (code, scope) => {
  try {
    const value = code.evaluate({ ...scope });
    if (typeof value === 'number') return Number.isFinite(value) ? [value, 0] : null;
    if (value && typeof value === 'object' && typeof value.re === 'number' && typeof value.im === 'number') {
      return Number.isFinite(value.re) && Number.isFinite(value.im) ? [value.re, value.im] : null;
    }
    return null;
  } catch {
    return null;
  }
};

const naturalLog = (value) => (typeof value === 'number' && value > 0 ? Math.log(value) : Number.NaN);

const comparePoint = (left, right, exactScope, floatScope, tryExact) => {
  if (tryExact) {
    const a = exactAt(left, exactScope);
    const b = exactAt(right, exactScope);
    if (a && b) return a.equals(b) ? POINT.AGREE : POINT.DIFFER;
  }
  const a = floatAt(left, floatScope);
  const b = floatAt(right, floatScope);
  if (!a || !b) return POINT.UNDEFINED;
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const scale = Math.max(1, Math.hypot(a[0], a[1]), Math.hypot(b[0], b[1]));
  if (distance > SCREEN_TOLERANCE * scale) return POINT.DIFFER;
  return distance <= AGREE_TOLERANCE * scale ? POINT.AGREE : POINT.UNSURE;
};

/**
 * Two parsed expressions at the sample points: 'different' when a point both
 * are defined at disagrees, 'equal' when enough are defined and every one
 * agrees (exactly, or to the last digits a float keeps), 'unknown' otherwise.
 * `fraction` is the exact number constructor of the instance that parsed them.
 */
export function compareAtSamples(leftNode, rightNode, fraction = null) {
  let left;
  let right;
  try {
    left = leftNode.compile();
    right = rightNode.compile();
  } catch {
    return SAMPLED.UNKNOWN;
  }
  const letters = [...new Set([...lettersOf(leftNode), ...lettersOf(rightNode)])].sort();
  const tryExact = typeof fraction === 'function' && exactDegree(leftNode) <= MAX_EXACT_DEGREE && exactDegree(rightNode) <= MAX_EXACT_DEGREE;
  const points = letters.length ? SAMPLE_HUNDREDTHS.length : 1;
  let agreed = 0;
  let unsure = false;
  for (let sample = 0; sample < points; sample += 1) {
    const hundredths = letters.map((name, index) => [name, SAMPLE_HUNDREDTHS[(sample * 5 + index * 7) % SAMPLE_HUNDREDTHS.length]]);
    // `ln` is how a student writes the natural logarithm; mathjs only knows `log`.
    const floatScope = { ...(letters.includes('ln') ? {} : { ln: naturalLog }), ...Object.fromEntries(hundredths.map(([name, value]) => [name, value / 100])) };
    const exactScope = tryExact ? Object.fromEntries(hundredths.map(([name, value]) => [name, fraction(value, 100)])) : null;
    const point = comparePoint(left, right, exactScope, floatScope, tryExact);
    if (point === POINT.DIFFER) return SAMPLED.DIFFERENT;
    if (point === POINT.AGREE) agreed += 1;
    if (point === POINT.UNSURE) unsure = true;
  }
  if (unsure) return SAMPLED.UNKNOWN;
  return agreed >= (letters.length ? MINIMUM_VALID_SAMPLES : 1) ? SAMPLED.EQUAL : SAMPLED.UNKNOWN;
}

/** Are two parsed expressions shown equal for every value of every letter in them? */
export const sampledIdentity = (leftNode, rightNode, fraction = null) => compareAtSamples(leftNode, rightNode, fraction) === SAMPLED.EQUAL;
