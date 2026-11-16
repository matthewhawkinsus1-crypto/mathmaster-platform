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
 *   too few points defined    as above while simplify can be asked; past
 *                             that, not shown equal
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
export const decidePastBudget = (differenceNode, leftNode, rightNode) => {
  const sampled = compareAtSamples(leftNode, rightNode);
  if (sampled === SAMPLED.DIFFERENT) return SAMPLED.DIFFERENT;
  if (withinSimplifyBudget(differenceNode, SIMPLIFY_LIMIT)) return 'simplify';
  return sampled === SAMPLED.EQUAL ? SAMPLED.EQUAL : SAMPLED.DIFFERENT;
};

// Irregular, so no small-integer coincidence makes two expressions agree; of
// both signs and none zero or one, so a denominator or a root is defined at
// most of them. The same points Step Algebra samples at.
const SAMPLE_VALUES = Object.freeze([1.37, -2.11, 3.73, 0.59, -4.29, 2.91, 5.17, -0.83, 1.93, -3.47, 4.61, 0.27]);
const MINIMUM_VALID_SAMPLES = 6;
const CONSTANT_NAMES = new Set(['e', 'pi', 'i', 'Infinity', 'NaN', 'true', 'false', 'null']);
// Looser than a typed number's tolerance: a long sum loses digits to rounding,
// and a false 'different' here would lower a verdict simplify used to give.
const TOLERANCE = 1e-6;

const lettersOf = (node) => {
  const names = new Set();
  node.traverse((child, path, parent) => {
    if (!child?.isSymbolNode || (parent?.isFunctionNode && path === 'fn') || CONSTANT_NAMES.has(child.name)) return;
    names.add(child.name);
  });
  return [...names];
};

const valueAt = (code, scope) => {
  try {
    const value = code.evaluate({ ...scope });
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const close = (left, right) => Math.abs(left - right) <= TOLERANCE * Math.max(1, Math.abs(left), Math.abs(right));

/**
 * Two parsed expressions at the sample points: 'different' when a point both
 * are defined at disagrees, 'equal' when enough are defined and all agree,
 * 'unknown' when too few are defined to say (or a side cannot be evaluated).
 */
export function compareAtSamples(leftNode, rightNode) {
  let left;
  let right;
  try {
    left = leftNode.compile();
    right = rightNode.compile();
  } catch {
    return SAMPLED.UNKNOWN;
  }
  const letters = [...new Set([...lettersOf(leftNode), ...lettersOf(rightNode)])].sort();
  if (!letters.length) {
    const a = valueAt(left, {});
    const b = valueAt(right, {});
    if (a === null || b === null) return SAMPLED.UNKNOWN;
    return close(a, b) ? SAMPLED.EQUAL : SAMPLED.DIFFERENT;
  }
  let valid = 0;
  for (let sample = 0; sample < SAMPLE_VALUES.length; sample += 1) {
    const scope = Object.fromEntries(letters.map((name, index) => [name, SAMPLE_VALUES[(sample * 5 + index * 7) % SAMPLE_VALUES.length]]));
    const a = valueAt(left, scope);
    const b = valueAt(right, scope);
    if (a === null || b === null) continue;
    if (!close(a, b)) return SAMPLED.DIFFERENT;
    valid += 1;
  }
  return valid >= MINIMUM_VALID_SAMPLES ? SAMPLED.EQUAL : SAMPLED.UNKNOWN;
}

/** Are two parsed expressions shown equal for every value of every letter in them? */
export const sampledIdentity = (leftNode, rightNode) => compareAtSamples(leftNode, rightNode) === SAMPLED.EQUAL;
