/*
 * MATHJS'S simplifyCore, SIMPLIFYING EACH NODE ONCE (issue #559).
 *
 * simplify begins every pass with simplifyCore. mathjs 15.2.0's simplifyCore
 * starts a node whose operator it calls "trivial" (+, *, a unary +, a bracket)
 * by simplifying its first child, in case that child is its only one: a
 * trivial operator of one argument is just that argument. When the node has
 * two children, as every link of a sum or a product does, that result is
 * dropped, and the node's own case simplifies the same child again. mathjs
 * reads 2x + 1 + 1 + 1 as ((2x + 1) + 1) + 1, so a link's first child is the
 * whole chain before it, and each link doubles the work: 2^(n-1) - 1 visits
 * for n terms. A Step Algebra side grows a term with each balanced move kept
 * as written, and a move simplifies its sides, so a draft reopened with a move
 * in progress, and the move itself, cost about twice as much for each term the
 * side gained (in node, reopening took 0.9 s at 18 terms, 2.6 s at 20 and 42 s
 * at 24; a Chromebook is several times slower). A run of - or / is not
 * trivial and never doubled, which is why a side of + 2 - 2 + 2 … stayed fast.
 *
 * Here the first child is simplified only when it is the only child, where
 * its result is used. Nothing else differs: the dropped call made new nodes
 * and touched none it was given but an operator-named call it rewrote into
 * binary form, add(a, b, c) → add(a, c + b), which the kept call then finds
 * already rewritten and reads the same way. So every answer, text and node
 * structure, is mathjs's own, and n terms cost n - 1 visits: a draft with 24
 * terms on a side reopens in well under a tenth of a second.
 *
 * It is mathjs's code, ported line for line (mathjs 15.2.0, Apache-2.0,
 * lib/esm/function/algebra/simplifyCore.js), with two lookups mathjs keeps
 * private and does not export:
 *   - which operators are trivial, commutative or associative, mathjs's own
 *     default table (simplify/util.js); a caller that hands simplifyCore a
 *     context of its own is answered by mathjs's own simplifyCore, unchanged;
 *   - which function names are operators (add(a, b) is a + b), asked of
 *     mathjs's own simplifyCore, once per name.
 * tests/platform/simplifyCoreOnce.test.mjs holds the port to mathjs's
 * answers, pins the mathjs files it follows (so an upgrade is re-ported, or
 * this module dropped if mathjs has fixed it), and counts the visits.
 *
 * Imports nothing: like simplifyRulesParsedOnce.mjs it is handed mathjs's
 * factories, and the instance's own node classes and functions.
 */

// mathjs's default context (simplify/util.js), for the three properties
// simplifyCore reads. A name not listed is read as `defaultF`.
const DEFAULT_CONTEXT = Object.freeze({
  add: Object.freeze({ trivial: true, commutative: true, associative: true }),
  unaryPlus: Object.freeze({ trivial: true, commutative: true, associative: true }),
  subtract: Object.freeze({ trivial: false, commutative: false, associative: false }),
  multiply: Object.freeze({ trivial: true, commutative: true, associative: true }),
  divide: Object.freeze({ trivial: false, commutative: false, associative: false }),
  paren: Object.freeze({ trivial: true, commutative: true, associative: false }),
  defaultF: Object.freeze({ trivial: false, commutative: false, associative: false }),
});

const OPERATOR_NAMES_KEPT = 256;

const isNodeOf = (flag) => (x) => Boolean(x && x[flag] === true && x.constructor.prototype.isNode === true);
const isAccessorNode = isNodeOf('isAccessorNode');
const isArrayNode = isNodeOf('isArrayNode');
const isConstantNode = isNodeOf('isConstantNode');
const isFunctionNode = isNodeOf('isFunctionNode');
const isIndexNode = isNodeOf('isIndexNode');
const isObjectNode = isNodeOf('isObjectNode');
const isOperatorNode = isNodeOf('isOperatorNode');
const isParenthesisNode = isNodeOf('isParenthesisNode');

// mathjs's hasProperty with its default context.
const propertyName = (node) => {
  if (isOperatorNode(node)) return node.fn.toString();
  if (isFunctionNode(node)) return node.name;
  if (isParenthesisNode(node)) return 'paren';
  return 'defaultF';
};
const hasDefaultProperty = (node, property) => {
  const name = propertyName(node);
  const properties = Object.prototype.hasOwnProperty.call(DEFAULT_CONTEXT, name) ? DEFAULT_CONTEXT[name] : DEFAULT_CONTEXT.defaultF;
  return properties[property];
};

/**
 * mathjs's factories (`all`) with simplifyCore's replaced by this port, which
 * simplify (its first rule) and rationalize then use. Pass the result to
 * mathjs's `create`, alone or with withSimplifyRulesParsedOnce.
 */
export const withSimplifyCoreOnce = (factories) => {
  const { createSimplifyCore } = factories;
  const createSimplifyCoreOnce = (scope) => {
    const {
      typed, equal, isZero,
      AccessorNode, ArrayNode, ConstantNode, FunctionNode, IndexNode, ObjectNode, OperatorNode, SymbolNode,
    } = scope;
    // mathjs's own simplifyCore, built the first time it is needed.
    let mathjsSimplifyCore = null;
    const mathjsOwn = () => {
      if (!mathjsSimplifyCore) mathjsSimplifyCore = createSimplifyCore(scope);
      return mathjsSimplifyCore;
    };
    // mathjs's getOperator(name), read from what its simplifyCore makes of a
    // call to `name` with two arguments: an operator node of that name, or
    // not. Kept per name, for as many names as a session plausibly meets.
    const operators = new Map();
    const getOperator = (name) => {
      if (typeof name !== 'string' || !name) return null;
      if (operators.has(name)) return operators.get(name);
      const made = mathjsOwn()(new FunctionNode(new SymbolNode(name), [new SymbolNode('a'), new SymbolNode('b')]));
      const op = isOperatorNode(made) && made.fn === name ? made.op : null;
      if (operators.size < OPERATOR_NAMES_KEPT) operators.set(name, op);
      return op;
    };

    const node0 = new ConstantNode(0);
    const node1 = new ConstantNode(1);
    const nodeT = new ConstantNode(true);
    const nodeF = new ConstantNode(false);
    const isAlwaysBoolean = (node) => isOperatorNode(node) && ['and', 'not', 'or'].includes(node.op);

    // mathjs's _simplifyCore, line for line, but for the first child of a
    // trivial node (marked). Its only option is a context, and a call with one
    // is answered by mathjs's own (below), so none is passed down here.
    function _simplifyCore(nodeToSimplify) {
      if (hasDefaultProperty(nodeToSimplify, 'trivial')) {
        if (isFunctionNode(nodeToSimplify) && nodeToSimplify.args.length === 1) {
          return _simplifyCore(nodeToSimplify.args[0]);
        }
        // mathjs simplifies the first child here, then again below whenever
        // there is a second: simplified only when it is the only child.
        let onlyChild = null;
        let childCount = 0;
        nodeToSimplify.forEach((child) => {
          childCount += 1;
          if (childCount === 1) onlyChild = child;
        });
        if (childCount === 1) return _simplifyCore(onlyChild);
      }
      let node = nodeToSimplify;
      if (isFunctionNode(node)) {
        const op = getOperator(node.name);
        if (op) {
          if (node.args.length > 2 && hasDefaultProperty(node, 'associative')) {
            while (node.args.length > 2) {
              const last = node.args.pop();
              const seclast = node.args.pop();
              node.args.push(new OperatorNode(op, node.name, [last, seclast]));
            }
          }
          node = new OperatorNode(op, node.name, node.args);
        } else {
          return new FunctionNode(_simplifyCore(node.fn), node.args.map((n) => _simplifyCore(n)));
        }
      }
      if (isOperatorNode(node) && node.isUnary()) {
        const a0 = _simplifyCore(node.args[0]);
        if (node.op === '~') {
          if (isOperatorNode(a0) && a0.isUnary() && a0.op === '~') return a0.args[0];
        }
        if (node.op === 'not') {
          if (isOperatorNode(a0) && a0.isUnary() && a0.op === 'not') {
            if (isAlwaysBoolean(a0.args[0])) return a0.args[0];
          }
        }
        let finish = true;
        if (node.op === '-') {
          if (isOperatorNode(a0)) {
            if (a0.isBinary() && a0.fn === 'subtract') {
              node = new OperatorNode('-', 'subtract', [a0.args[1], a0.args[0]]);
              finish = false;
            }
            if (a0.isUnary() && a0.op === '-') return a0.args[0];
          }
        }
        if (finish) return new OperatorNode(node.op, node.fn, [a0]);
      }
      if (isOperatorNode(node) && node.isBinary()) {
        const a0 = _simplifyCore(node.args[0]);
        let a1 = _simplifyCore(node.args[1]);
        if (node.op === '+') {
          if (isConstantNode(a0) && isZero(a0.value)) return a1;
          if (isConstantNode(a1) && isZero(a1.value)) return a0;
          if (isOperatorNode(a1) && a1.isUnary() && a1.op === '-') {
            a1 = a1.args[0];
            node = new OperatorNode('-', 'subtract', [a0, a1]);
          }
        }
        if (node.op === '-') {
          if (isOperatorNode(a1) && a1.isUnary() && a1.op === '-') {
            return _simplifyCore(new OperatorNode('+', 'add', [a0, a1.args[0]]));
          }
          if (isConstantNode(a0) && isZero(a0.value)) {
            return _simplifyCore(new OperatorNode('-', 'unaryMinus', [a1]));
          }
          if (isConstantNode(a1) && isZero(a1.value)) return a0;
          return new OperatorNode(node.op, node.fn, [a0, a1]);
        }
        if (node.op === '*') {
          if (isConstantNode(a0)) {
            if (isZero(a0.value)) return node0;
            if (equal(a0.value, 1)) return a1;
          }
          if (isConstantNode(a1)) {
            if (isZero(a1.value)) return node0;
            if (equal(a1.value, 1)) return a0;
            if (hasDefaultProperty(node, 'commutative')) {
              return new OperatorNode(node.op, node.fn, [a1, a0], node.implicit); // constants on left
            }
          }
          return new OperatorNode(node.op, node.fn, [a0, a1], node.implicit);
        }
        if (node.op === '/') {
          if (isConstantNode(a0) && isZero(a0.value)) return node0;
          if (isConstantNode(a1) && equal(a1.value, 1)) return a0;
          return new OperatorNode(node.op, node.fn, [a0, a1]);
        }
        if (node.op === '^') {
          if (isConstantNode(a1)) {
            if (isZero(a1.value)) return node1;
            if (equal(a1.value, 1)) return a0;
          }
        }
        if (node.op === 'and') {
          if (isConstantNode(a0)) {
            if (a0.value) {
              if (isAlwaysBoolean(a1)) return a1;
              if (isConstantNode(a1)) return a1.value ? nodeT : nodeF;
            } else {
              return nodeF;
            }
          }
          if (isConstantNode(a1)) {
            if (a1.value) {
              if (isAlwaysBoolean(a0)) return a0;
            } else {
              return nodeF;
            }
          }
        }
        if (node.op === 'or') {
          if (isConstantNode(a0)) {
            if (a0.value) return nodeT;
            if (isAlwaysBoolean(a1)) return a1;
          }
          if (isConstantNode(a1)) {
            if (a1.value) return nodeT;
            if (isAlwaysBoolean(a0)) return a0;
          }
        }
        return new OperatorNode(node.op, node.fn, [a0, a1]);
      }
      if (isOperatorNode(node)) {
        return new OperatorNode(node.op, node.fn, node.args.map((a) => _simplifyCore(a)));
      }
      if (isArrayNode(node)) {
        return new ArrayNode(node.items.map((n) => _simplifyCore(n)));
      }
      if (isAccessorNode(node)) {
        return new AccessorNode(_simplifyCore(node.object), _simplifyCore(node.index));
      }
      if (isIndexNode(node)) {
        return new IndexNode(node.dimensions.map((n) => _simplifyCore(n)));
      }
      if (isObjectNode(node)) {
        const newProps = {};
        for (const prop in node.properties) {
          newProps[prop] = _simplifyCore(node.properties[prop]);
        }
        return new ObjectNode(newProps);
      }
      // cannot simplify
      return node;
    }

    // A context of the caller's own changes what is trivial: mathjs's own
    // simplifyCore answers it.
    const simplifyCore = (node, options = {}) => (
      (options ? options.context : undefined) === undefined ? _simplifyCore(node) : mathjsOwn()(node, options)
    );
    return typed('simplifyCore', {
      Node: (node) => simplifyCore(node),
      'Node,Object': (node, options) => simplifyCore(node, options),
    });
  };
  // A mathjs factory, as mathjs's `factory()` makes one, with simplifyCore's
  // own name and dependencies.
  createSimplifyCoreOnce.isFactory = true;
  createSimplifyCoreOnce.fn = createSimplifyCore.fn;
  createSimplifyCoreOnce.dependencies = [...createSimplifyCore.dependencies];
  return Object.freeze({ ...factories, createSimplifyCore: createSimplifyCoreOnce });
};
