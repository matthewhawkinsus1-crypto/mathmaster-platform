/*
 * THE mathjs INSTANCE THAT READS STUDENT-TYPED TEXT.
 *
 * Since this branch the server grades student work, so text a student typed
 * is parsed and evaluated inside a Cloud Function instance that every other
 * student's grading shares while it stays warm. mathjs's default instance lets
 * an expression do far more than arithmetic:
 *
 *   createUnit("x")          adds a unit to the PROCESS-WIDE unit table, so a
 *                            later student's bare `x` can evaluate as a unit;
 *   typed.addConversion(...) rewires the type system for everyone;
 *   1:20000000, zeros(9e3,9e3), resize(...)
 *                            allocate in proportion to a typed number — one
 *                            response can exhaust the instance's memory;
 *   evaluate / parse / simplify / derivative / resolve
 *                            re-enter the parser from inside an expression.
 *
 * This module builds a separate instance, captures the functions MathMaster's
 * own code calls, and then replaces those names INSIDE the expression
 * namespace with functions that refuse (mathjs's documented hardening:
 * https://mathjs.org/docs/expressions/security.html). The captured functions
 * keep working for our code; an expression cannot reach the originals.
 *
 * Everything an algebra or tool grader legitimately evaluates — arithmetic,
 * powers, roots, trigonometry, logarithms, absolute value, constants, small
 * matrix and set literals — behaves exactly as on the default instance. The
 * configuration is mathjs's default.
 *
 * Every functions/shared module that parses or evaluates student text imports
 * from here instead of 'mathjs'; tests/platform/safeMath.test.mjs holds that.
 */
import { all, create } from 'mathjs';

const math = create(all);

// Captured before the namespace is locked. Each keeps the dependencies it was
// created with, so locking the expression namespace does not affect it.
const rawParse = math.parse;
const rawEvaluate = math.evaluate;
const rawCompile = math.compile;
const rawSimplify = math.simplify;
const fraction = math.fraction;
const format = math.format;

export const {
  AccessorNode,
  ArrayNode,
  ConditionalNode,
  ConstantNode,
  FunctionNode,
  IndexNode,
  Node,
  ObjectNode,
  OperatorNode,
  ParenthesisNode,
  RangeNode,
  RelationalNode,
  SymbolNode,
  isNode,
} = math;

/*
 * Names an expression may not call. Re-entrant or process-mutating functions,
 * and the functions that allocate in proportion to a number in the expression.
 */
export const REFUSED_EXPRESSION_FUNCTIONS = Object.freeze([
  // re-entrant / process-mutating
  'import', 'createUnit', 'reviver', 'replacer',
  'evaluate', 'parse', 'compile', 'simplify', 'simplifyConstant', 'simplifyCore',
  'derivative', 'resolve', 'rationalize', 'leafCount', 'symbolicEqual', 'help', 'chain',
  // allocation proportional to a typed number
  'range', 'zeros', 'ones', 'identity', 'resize', 'reshape', 'concat', 'kron',
  'matrixFromRows', 'matrixFromColumns', 'matrixFromFunction', 'diag', 'sparse',
  'random', 'randomInt', 'pickRandom', 'map', 'forEach', 'filter', 'apply',
  // CPU proportional to a typed number (seconds for a 20-character answer)
  'isPrime', 'combinations', 'combinationsWithRep', 'permutations', 'stirlingS2',
  'bellNumbers', 'catalan', 'composition', 'multinomial',
]);

// `config` and `typed` cannot be replaced in the namespace — every mathjs
// factory depends on them — so they are refused by name when the expression is
// parsed instead (below). `config({number: 'BigNumber'})` in one answer would
// otherwise switch number handling for every student graded after it.
export const REFUSED_EXPRESSION_SYMBOLS = Object.freeze(['config', 'typed', ...REFUSED_EXPRESSION_FUNCTIONS]);
const REFUSED = new Set(REFUSED_EXPRESSION_SYMBOLS);

const refuse = (name) => function refusedInStudentExpression() {
  throw new Error(`${name} is not available in an answer.`);
};

math.import(
  Object.fromEntries(REFUSED_EXPRESSION_FUNCTIONS.map((name) => [name, refuse(name)])),
  { override: true },
);

// Longer than any answer box the contract carries (1,000 characters per string,
// toolResponseContract.mjs), with room for LaTeX conversion.
export const MAX_EXPRESSION_LENGTH = 4_000;

// The largest power a constant may name: past ~1e308 a float is Infinity, and
// exact (fraction) simplification of `9^9^9` would build a number with hundreds
// of millions of digits — tens of seconds of CPU for an eight-character answer.
const MAX_CONSTANT_POWER_DIGITS = 308;

const isConstantSubtree = (node) => node.filter((child) => child.type === 'SymbolNode' || child.type === 'FunctionNode').length === 0;

// A constant subtree's value as a plain number, or null when it is not one (a
// matrix, a complex number, a string) or cannot be evaluated.
const constantNumber = (node) => {
  try {
    const value = node.compile().evaluate();
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
};

/** Would this constant SCALAR power be astronomically large? */
const oversizeConstantPower = (base, exponent) => {
  if (!isConstantSubtree(base) || !isConstantSubtree(exponent)) return false;
  const b = constantNumber(base);
  const e = constantNumber(exponent);
  if (b === null || e === null) return false;
  const magnitude = Math.abs(b);
  // An Infinity here is itself a tower that already overflowed.
  if (!Number.isFinite(magnitude) || !Number.isFinite(e)) return true;
  if (magnitude <= 1 || Number.isNaN(e)) return false;
  return Math.abs(e) * Math.log10(magnitude) > MAX_CONSTANT_POWER_DIGITS;
};

/**
 * Throw if a parsed expression names anything refused, builds a range,
 * assigns into a matrix index (`x[3000,3000] = 1` resizes x), calls anything
 * but a plain function name (`{a: det}["a"](...)` reaches a function by
 * lookup), builds an object, or names a constant power past ~1e308.
 */
const assertSafeNode = (root) => {
  root.traverse((node) => {
    if (node.type === 'SymbolNode' && REFUSED.has(node.name)) throw new Error(`${node.name} is not available in an answer.`);
    if (node.type === 'FunctionNode') {
      if (node.fn?.type !== 'SymbolNode') throw new Error('Only a named function can be called in an answer.');
      if (REFUSED.has(node.fn.name)) throw new Error(`${node.fn.name} is not available in an answer.`);
      if (node.fn.name === 'pow' && node.args.length === 2 && oversizeConstantPower(node.args[0], node.args[1])) {
        throw new Error('That number is too large to work with.');
      }
    }
    if (node.type === 'RangeNode') throw new Error('A range is not available in an answer.');
    if (node.type === 'AssignmentNode' && node.index) throw new Error('Assigning into a matrix is not available in an answer.');
    if (node.type === 'ObjectNode') throw new Error('An object is not available in an answer.');
    if (node.type === 'OperatorNode' && node.fn === 'pow' && oversizeConstantPower(node.args[0], node.args[1])) {
      throw new Error('That number is too large to work with.');
    }
  });
  return root;
};

const assertSafeText = (text) => {
  if (String(text).length > MAX_EXPRESSION_LENGTH) throw new Error('That answer is too long to read.');
};

/** mathjs `parse`, refusing what an answer may not contain. */
export const parse = (expression, options) => {
  if (Array.isArray(expression)) return expression.map((entry) => parse(entry, options));
  assertSafeText(expression);
  return assertSafeNode(options === undefined ? rawParse(expression) : rawParse(expression, options));
};

/** mathjs `compile`, through the same checks. */
export const compile = (expression) => {
  if (Array.isArray(expression)) return expression.map((entry) => compile(entry));
  return parse(expression).compile();
};

/** mathjs `evaluate`, through the same checks. */
export const evaluate = (expression, scope) => {
  if (Array.isArray(expression)) return expression.map((entry) => evaluate(entry, scope));
  if (typeof expression !== 'string') return scope === undefined ? rawEvaluate(expression) : rawEvaluate(expression, scope);
  parse(expression);
  return scope === undefined ? rawEvaluate(expression) : rawEvaluate(expression, scope);
};

/** mathjs `simplify`, through the same checks (constant folding evaluates). */
export const simplify = (expression, ...rest) => {
  if (typeof expression === 'string') parse(expression);
  else if (expression && typeof expression.traverse === 'function') assertSafeNode(expression);
  return rawSimplify(expression, ...rest);
};

export { format, fraction };

/** For tests: the hardened instance itself (never import it to evaluate). */
export const safeMathInstance = math;
export { rawEvaluate as unguardedEvaluateForTests };
