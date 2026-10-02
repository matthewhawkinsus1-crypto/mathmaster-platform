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

/*
 * BUILT ON FIRST USE.
 *
 * `create(all)` only registers mathjs's factories; each function is built the
 * first time something asks for it. Building the ones captured below, the
 * expression-node classes and the locked namespace costs a few hundred
 * milliseconds of main thread on a slow Chromebook, and this module is in the
 * browser's first load — so the first load paid it before the sign-in screen
 * appeared, though nothing parses a student's text until a question is
 * answered (BUNDLE-1). So the instance is locked the first time anything here
 * is asked to read, compile, evaluate or simplify (`hardened`, below): still
 * before any expression is parsed, so no expression ever runs in an unlocked
 * namespace. The node classes are built when a node is first constructed.
 */
const math = create(all);

let hardened = null;
const hardenedMath = () => {
  if (hardened) return hardened;
  // Captured before the namespace is locked. Each keeps the dependencies it
  // was created with, so locking the expression namespace does not affect it.
  const captured = {
    rawParse: math.parse,
    rawEvaluate: math.evaluate,
    rawSimplify: math.simplify,
    fraction: math.fraction,
    format: math.format,
  };
  math.import(
    // The refusals are module constants (below); this runs after the module has loaded.
    Object.fromEntries(REFUSED_EXPRESSION_FUNCTIONS.map((name) => [name, refuse(name)])),
    { override: true },
  );
  hardened = captured;
  return hardened;
};

// `new OperatorNode(...)` makes the real mathjs node, its class built on first
// use: a constructor that returns an object hands `new` that object.
const nodeClass = (name) => function MathNode(...args) { return new math[name](...args); };
export const AccessorNode = nodeClass('AccessorNode');
export const ArrayNode = nodeClass('ArrayNode');
export const ConditionalNode = nodeClass('ConditionalNode');
export const ConstantNode = nodeClass('ConstantNode');
export const FunctionNode = nodeClass('FunctionNode');
export const IndexNode = nodeClass('IndexNode');
export const Node = nodeClass('Node');
export const ObjectNode = nodeClass('ObjectNode');
export const OperatorNode = nodeClass('OperatorNode');
export const ParenthesisNode = nodeClass('ParenthesisNode');
export const RangeNode = nodeClass('RangeNode');
export const RelationalNode = nodeClass('RelationalNode');
export const SymbolNode = nodeClass('SymbolNode');
export const isNode = (value) => math.isNode(value);

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
  const { rawParse } = hardenedMath();
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
  const { rawEvaluate } = hardenedMath();
  if (typeof expression !== 'string') return scope === undefined ? rawEvaluate(expression) : rawEvaluate(expression, scope);
  parse(expression);
  return scope === undefined ? rawEvaluate(expression) : rawEvaluate(expression, scope);
};

/** mathjs `simplify`, through the same checks (constant folding evaluates). */
export const simplify = (expression, ...rest) => {
  const { rawSimplify } = hardenedMath();
  if (typeof expression === 'string') parse(expression);
  else if (expression && typeof expression.traverse === 'function') assertSafeNode(expression);
  return rawSimplify(expression, ...rest);
};

/** mathjs `fraction` and `format`, from the locked instance. */
export const fraction = (...args) => hardenedMath().fraction(...args);
export const format = (...args) => hardenedMath().format(...args);

/** For tests: the hardened instance itself (never import it to evaluate). Locked on first read. */
export const safeMathInstance = new Proxy(math, { get: (target, key) => { hardenedMath(); return Reflect.get(target, key); } });
export const unguardedEvaluateForTests = (...args) => hardenedMath().rawEvaluate(...args);
