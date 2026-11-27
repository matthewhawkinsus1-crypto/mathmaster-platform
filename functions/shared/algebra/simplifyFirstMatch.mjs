/*
 * MATHJS'S simplify, LOOKING FOR THE FIRST MATCH OF A RULE AND NO OTHER
 * (issue #559, what was left after simplifyCoreOnce.mjs).
 *
 * simplify applies each of its rules at every node of the expression. To
 * apply one, mathjs's applyRule asks `_ruleMatch` for the ways the rule's
 * left side matches the node and uses the first (`_ruleMatch(…)[0]`). But
 * `_ruleMatch` builds every way: a flattened sum of k terms is tried as each
 * of its k splits (one term, and the sum of the rest), each child's matches
 * are combined with every other child's (a cartesian product), and every
 * match made is written out as JSON (`mergeChildMatches`) to drop the
 * repeats. A match holds whole subtrees, so each one costs as much as the
 * side it came from. A Step Algebra side of like terms with different
 * coefficients (2x + 3x + 4x + …) has a match for nearly every split, so
 * simplifying it cost about the cube of its length: reopening a draft that
 * held such an operand took 1.7 s at 24 terms and 11 s at 41 in node (a
 * Chromebook is several times slower), and a 47-link division chain 3.7 s.
 *
 * Here the matches are made one at a time, in mathjs's own order, and the
 * search stops at the first, which is the one applyRule uses. Nothing else
 * differs, so every answer is mathjs's own:
 *   - the order is mathjs's: the splits in turn, each child's matches in
 *     turn, combined first child outermost, as `combineChildMatches` folds
 *     them; a child with no match stops the search where mathjs's does, and
 *     a commutative pair is tried reversed exactly when mathjs tries it;
 *   - dropping repeats never removes the first of them, and a repeat (the
 *     same JSON) conflicts with a match exactly when its first does, so the
 *     first match mathjs keeps is the first made here;
 *   - building a match changes nothing: it reads the nodes and makes new ones.
 * The one way the two could differ is a throw. mathjs makes every match, so
 * a candidate after the first that throws (`equal(1, "abc")` cannot compare,
 * a rule with three operands, a wildcard mathjs does not know) throws there
 * and not here. So the first match is looked for only where nothing can
 * throw: every constant in the expression and in the rule a number, every
 * operator node of the rule with at most two operands, and every symbol in
 * it one mathjs knows. Anywhere else the rule is matched by mathjs's own
 * code, every match and all, ported unchanged below (`allMatches`).
 *
 * It is mathjs's code, ported line for line (mathjs 15.2.0, Apache-2.0,
 * lib/esm/function/algebra/simplify.js and simplify/util.js), with mathjs's
 * own pieces wherever it hands them out: the rules (`simplify.rules`) and the
 * three contexts are read from mathjs's own simplify, built from the same
 * dependencies, so they are the same objects. tests/platform/
 * simplifyFirstMatch.test.mjs holds the port to mathjs's answers, pins the
 * mathjs files it follows (so an upgrade is re-ported, or this module dropped
 * if mathjs has changed it), and counts the work.
 *
 * Imports nothing: like simplifyCoreOnce.mjs it is handed mathjs's
 * factories, and the instance's own node classes and functions.
 */

// The constants a rule may name (simplify.js SUPPORTED_CONSTANTS).
const SUPPORTED_CONSTANTS = Object.freeze({
  true: true, false: true, e: true, i: true, Infinity: true, LN2: true, LN10: true,
  LOG2E: true, LOG10E: true, NaN: true, phi: true, pi: true, SQRT1_2: true, SQRT2: true, tau: true,
});
// The wildcards `_ruleMatch` reads, by the one or two letters it switches on.
const WILDCARDS = new Set(['n', '_p', 'c', 'cl', 'v', 'vl', 'cd', 'vd', 'ce', 've']);
const wildcardKind = (name) => (name[1] >= 'a' && name[1] <= 'z' ? name.substring(0, 2) : name[0]);

// utils/object.js, as mathjs writes it (a falsy object is returned as it is).
const hasOwnProperty = (object, property) => object && Object.hasOwnProperty.call(object, property);
const isNodeOf = (flag) => (x) => Boolean(x && x[flag] === true && x.constructor.prototype.isNode === true);
const isConstantNode = isNodeOf('isConstantNode');
const isFunctionNode = isNodeOf('isFunctionNode');
const isOperatorNode = isNodeOf('isOperatorNode');
const isParenthesisNode = isNodeOf('isParenthesisNode');
const isSymbolNode = isNodeOf('isSymbolNode');
// simplify/wildcards.js
const isVariableNode = isSymbolNode;
const isNumericNode = (x) => isConstantNode(x) || (isOperatorNode(x) && x.isUnary() && isConstantNode(x.args[0]));
const isConstantExpression = (x) => {
  if (isConstantNode(x)) return true;
  if ((isFunctionNode(x) || isOperatorNode(x)) && x.args.every(isConstantExpression)) return true;
  if (isParenthesisNode(x) && isConstantExpression(x.content)) return true;
  return false;
};

/*
 * WHERE THE FIRST MATCH IS THE WHOLE ANSWER.
 *
 * `_ruleMatch` reads, of the expression, the nodes reached through operator
 * and function operands, and of each the `value` (a constant's, compared with
 * `equal`; any other node's is undefined, which `equal` reads as unequal).
 * `equal` of two numbers, or of a number and undefined, never throws.
 */
const matchedValueIsSafe = (value) => value === undefined || typeof value === 'number';
const expressionIsSafe = (root) => {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') return false;
    if (!matchedValueIsSafe(node.value)) return false;
    if ((isOperatorNode(node) || isFunctionNode(node)) && Array.isArray(node.args)) pending.push(...node.args);
  }
  return true;
};
// A rule's side: its constants numbers, its operator and function nodes of
// one or two operands, its symbols ones `_ruleMatch` knows.
const ruleSideIsSafe = (root) => {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') return false;
    if (isConstantNode(node)) {
      if (typeof node.value !== 'number') return false;
    } else if (isSymbolNode(node)) {
      const name = node.name;
      if (typeof name !== 'string' || name.length === 0) return false;
      if (!SUPPORTED_CONSTANTS[name] && !WILDCARDS.has(wildcardKind(name))) return false;
    } else if (isOperatorNode(node) || isFunctionNode(node)) {
      if (!Array.isArray(node.args) || node.args.length > 2) return false;
      pending.push(...node.args);
    } else if (!matchedValueIsSafe(node.value)) {
      return false;
    }
  }
  return true;
};
// Every side of a canonical rule that applyRule matches or puts in.
const ruleIsSafe = (rule) => [rule, rule.expanded, rule.expandedNC1, rule.expandedNC2]
  .filter(Boolean)
  .every((side) => ruleSideIsSafe(side.l) && ruleSideIsSafe(side.r));

/*
 * The matches of a search made one at a time, kept as they are made: the
 * cartesian product reads the matches of a later child once for each match
 * of the one before it, and must not make them again.
 */
class MatchList {
  constructor(iterator) {
    this.iterator = iterator;
    this.made = [];
    this.done = false;
  }

  at(index) {
    while (!this.done && this.made.length <= index) {
      const next = this.iterator.next();
      if (next.done) this.done = true;
      else this.made.push(next.value);
    }
    return this.made[index];
  }

  get empty() {
    return this.at(0) === undefined;
  }

  * [Symbol.iterator]() {
    for (let index = 0; this.at(index) !== undefined; index += 1) yield this.made[index];
  }
}

/**
 * mathjs's factories (`all`) with simplify's replaced by one that looks for
 * the first match of each rule (above). Pass the result to mathjs's `create`,
 * or to the other `with…` wrappers.
 */
export const withSimplifyFirstMatch = (factories) => {
  const { createSimplify } = factories;
  const createSimplifyFirstMatch = (scope) => {
    const {
      typed,
      parse,
      equal,
      resolve,
      AccessorNode,
      ArrayNode,
      ConstantNode,
      FunctionNode,
      IndexNode,
      ObjectNode,
      OperatorNode,
      ParenthesisNode,
      SymbolNode,
      replacer,
    } = scope;
    // mathjs's own simplify: its rules and contexts are this one's.
    const mathjsOwn = createSimplify(scope);
    const { defaultContext, realContext, positiveContext } = mathjsOwn;

    /* ------------------------------------------------ simplify/util.js */

    const defaultName = 'defaultF';
    function hasProperty(nodeOrName, property, context = defaultContext) {
      let name = defaultName;
      if (typeof nodeOrName === 'string') {
        name = nodeOrName;
      } else if (isOperatorNode(nodeOrName)) {
        name = nodeOrName.fn.toString();
      } else if (isFunctionNode(nodeOrName)) {
        name = nodeOrName.name;
      } else if (isParenthesisNode(nodeOrName)) {
        name = 'paren';
      }
      if (hasOwnProperty(context, name)) {
        const properties = context[name];
        if (hasOwnProperty(properties, property)) {
          return properties[property];
        }
        if (hasOwnProperty(defaultContext, name)) {
          return defaultContext[name][property];
        }
      }
      if (hasOwnProperty(context, defaultName)) {
        const properties = context[defaultName];
        if (hasOwnProperty(properties, property)) {
          return properties[property];
        }
        return defaultContext[defaultName][property];
      }
      if (hasOwnProperty(defaultContext, name)) {
        const properties = defaultContext[name];
        if (hasOwnProperty(properties, property)) {
          return properties[property];
        }
      }
      return defaultContext[defaultName][property];
    }
    const isCommutative = (node, context = defaultContext) => hasProperty(node, 'commutative', context);
    const isAssociative = (node, context = defaultContext) => hasProperty(node, 'associative', context);

    function mergeContext(primary, secondary) {
      const merged = { ...primary };
      for (const prop in secondary) {
        if (hasOwnProperty(primary, prop)) {
          merged[prop] = { ...secondary[prop], ...primary[prop] };
        } else {
          merged[prop] = secondary[prop];
        }
      }
      return merged;
    }

    function allChildren(node, context) {
      let op;
      const children = [];
      const findChildren = (parent) => {
        for (let i = 0; i < parent.args.length; i++) {
          const child = parent.args[i];
          if (isOperatorNode(child) && op === child.op) {
            findChildren(child);
          } else {
            children.push(child);
          }
        }
      };
      if (isAssociative(node, context)) {
        op = node.op;
        findChildren(node);
        return children;
      }
      return node.args;
    }

    function flatten(node, context) {
      if (!node.args || node.args.length === 0) {
        return node;
      }
      node.args = allChildren(node, context);
      for (let i = 0; i < node.args.length; i++) {
        flatten(node.args[i], context);
      }
      return undefined;
    }

    function createMakeNodeFunction(node) {
      if (isOperatorNode(node)) {
        return (args) => {
          try {
            return new OperatorNode(node.op, node.fn, args, node.implicit);
          } catch (err) {
            console.error(err);
            return [];
          }
        };
      }
      return (args) => new FunctionNode(new SymbolNode(node.name), args);
    }

    function unflattenr(node, context) {
      if (!node.args || node.args.length === 0) {
        return;
      }
      const makeNode = createMakeNodeFunction(node);
      const l = node.args.length;
      for (let i = 0; i < l; i++) {
        unflattenr(node.args[i], context);
      }
      if (l > 2 && isAssociative(node, context)) {
        let curnode = node.args.pop();
        while (node.args.length > 0) {
          curnode = makeNode([node.args.pop(), curnode]);
        }
        node.args = curnode.args;
      }
    }

    function unflattenl(node, context) {
      if (!node.args || node.args.length === 0) {
        return;
      }
      const makeNode = createMakeNodeFunction(node);
      const l = node.args.length;
      for (let i = 0; i < l; i++) {
        unflattenl(node.args[i], context);
      }
      if (l > 2 && isAssociative(node, context)) {
        let curnode = node.args.shift();
        while (node.args.length > 0) {
          curnode = makeNode([curnode, node.args.shift()]);
        }
        node.args = curnode.args;
      }
    }

    /* ------------------------------------------------------ simplify.js */

    function removeParens(node) {
      return node.transform((child) => (isParenthesisNode(child) ? removeParens(child.content) : child));
    }

    let lastsym = 0;
    const getExpandPlaceholderSymbol = () => new SymbolNode(`_p${lastsym++}`);

    function canonicalizeRule(ruleObject, context) {
      const newRule = {};
      if (ruleObject.s) {
        const lr = ruleObject.s.split('->');
        if (lr.length === 2) {
          newRule.l = lr[0];
          newRule.r = lr[1];
        } else {
          throw SyntaxError(`Could not parse rule: ${ruleObject.s}`);
        }
      } else {
        newRule.l = ruleObject.l;
        newRule.r = ruleObject.r;
      }
      newRule.l = removeParens(parse(newRule.l));
      newRule.r = removeParens(parse(newRule.r));
      for (const prop of ['imposeContext', 'repeat', 'assuming']) {
        if (prop in ruleObject) {
          newRule[prop] = ruleObject[prop];
        }
      }
      if (ruleObject.evaluate) {
        newRule.evaluate = parse(ruleObject.evaluate);
      }
      if (isAssociative(newRule.l, context)) {
        const nonCommutative = !isCommutative(newRule.l, context);
        let leftExpandsym;
        if (nonCommutative) leftExpandsym = getExpandPlaceholderSymbol();
        const makeNode = createMakeNodeFunction(newRule.l);
        const expandsym = getExpandPlaceholderSymbol();
        newRule.expanded = {};
        newRule.expanded.l = makeNode([newRule.l, expandsym]);
        flatten(newRule.expanded.l, context);
        unflattenr(newRule.expanded.l, context);
        newRule.expanded.r = makeNode([newRule.r, expandsym]);
        if (nonCommutative) {
          newRule.expandedNC1 = {};
          newRule.expandedNC1.l = makeNode([leftExpandsym, newRule.l]);
          newRule.expandedNC1.r = makeNode([leftExpandsym, newRule.r]);
          newRule.expandedNC2 = {};
          newRule.expandedNC2.l = makeNode([leftExpandsym, newRule.expanded.l]);
          newRule.expandedNC2.r = makeNode([leftExpandsym, newRule.expanded.r]);
        }
      }
      return newRule;
    }

    function buildRules(rules, context) {
      const ruleSet = [];
      for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        let newRule;
        const ruleType = typeof rule;
        switch (ruleType) {
          case 'string':
            rule = { s: rule };
          /* falls through */
          case 'object':
            newRule = canonicalizeRule(rule, context);
            break;
          case 'function':
            newRule = rule;
            break;
          default:
            throw TypeError(`Unsupported type of rule: ${ruleType}`);
        }
        ruleSet.push(newRule);
      }
      return ruleSet;
    }

    function simplifyExpression(expr, rules, scopeMap = new Map(), options = {}) {
      const debug = options.consoleDebug;
      rules = buildRules(rules || simplify.rules, options.context);
      let res = resolve(expr, scopeMap);
      res = removeParens(res);
      const visited = {};
      let str = res.toString({ parenthesis: 'all' });
      while (!visited[str]) {
        visited[str] = true;
        lastsym = 0;
        let laststr = str;
        if (debug) console.log('Working on: ', str);
        for (let i = 0; i < rules.length; i++) {
          let rulestr = '';
          if (typeof rules[i] === 'function') {
            res = rules[i](res, options);
            if (debug) rulestr = rules[i].name;
          } else {
            flatten(res, options.context);
            // The first match is the whole answer only where no later
            // candidate could throw (above): for this rule on this
            // expression, as it stands before the rule is applied. Applying
            // it brings in only the rule's own nodes and the expression's.
            const firstOnly = ruleIsSafe(rules[i]) && expressionIsSafe(res);
            res = applyRule(res, rules[i], options.context, firstOnly);
            if (debug) {
              rulestr = `${rules[i].l.toString()} -> ${rules[i].r.toString()}`;
            }
          }
          if (debug) {
            const newstr = res.toString({ parenthesis: 'all' });
            if (newstr !== laststr) {
              console.log('Applying', rulestr, 'produced', newstr);
              laststr = newstr;
            }
          }
          unflattenl(res, options.context);
        }
        str = res.toString({ parenthesis: 'all' });
      }
      return res;
    }

    function mapRule(nodes, rule, context, firstOnly) {
      let resNodes = nodes;
      if (nodes) {
        for (let i = 0; i < nodes.length; ++i) {
          const newNode = applyRule(nodes[i], rule, context, firstOnly);
          if (newNode !== nodes[i]) {
            if (resNodes === nodes) {
              resNodes = nodes.slice();
            }
            resNodes[i] = newNode;
          }
        }
      }
      return resNodes;
    }

    function applyRule(node, rule, context, firstOnly) {
      if (rule.assuming) {
        for (const symbol in rule.assuming) {
          for (const property in rule.assuming[symbol]) {
            if (hasProperty(symbol, property, context) !== rule.assuming[symbol][property]) {
              return node;
            }
          }
        }
      }
      const mergedContext = mergeContext(rule.imposeContext, context);
      let res = node;
      if (res instanceof OperatorNode || res instanceof FunctionNode) {
        const newArgs = mapRule(res.args, rule, context, firstOnly);
        if (newArgs !== res.args) {
          res = res.clone();
          res.args = newArgs;
        }
      } else if (res instanceof ParenthesisNode) {
        if (res.content) {
          const newContent = applyRule(res.content, rule, context, firstOnly);
          if (newContent !== res.content) {
            res = new ParenthesisNode(newContent);
          }
        }
      } else if (res instanceof ArrayNode) {
        const newItems = mapRule(res.items, rule, context, firstOnly);
        if (newItems !== res.items) {
          res = new ArrayNode(newItems);
        }
      } else if (res instanceof AccessorNode) {
        let newObj = res.object;
        if (res.object) {
          newObj = applyRule(res.object, rule, context, firstOnly);
        }
        let newIndex = res.index;
        if (res.index) {
          newIndex = applyRule(res.index, rule, context, firstOnly);
        }
        if (newObj !== res.object || newIndex !== res.index) {
          res = new AccessorNode(newObj, newIndex);
        }
      } else if (res instanceof IndexNode) {
        const newDims = mapRule(res.dimensions, rule, context, firstOnly);
        if (newDims !== res.dimensions) {
          res = new IndexNode(newDims);
        }
      } else if (res instanceof ObjectNode) {
        let changed = false;
        const newProps = {};
        for (const prop in res.properties) {
          newProps[prop] = applyRule(res.properties[prop], rule, context, firstOnly);
          if (newProps[prop] !== res.properties[prop]) {
            changed = true;
          }
        }
        if (changed) {
          res = new ObjectNode(newProps);
        }
      }

      // Here mathjs takes `_ruleMatch(…)[0]`.
      const firstMatch = (ruleSide) => (firstOnly
        ? firstMatchOf(ruleSide, res, mergedContext)
        : allMatches(ruleSide, res, mergedContext)[0]);
      let repl = rule.r;
      let matches = firstMatch(rule.l);
      if (!matches && rule.expanded) {
        repl = rule.expanded.r;
        matches = firstMatch(rule.expanded.l);
      }
      if (!matches && rule.expandedNC1) {
        repl = rule.expandedNC1.r;
        matches = firstMatch(rule.expandedNC1.l);
        if (!matches) {
          repl = rule.expandedNC2.r;
          matches = firstMatch(rule.expandedNC2.l);
        }
      }
      if (matches) {
        const implicit = res.implicit;
        res = repl.clone();
        if (implicit && 'implicit' in repl) {
          res.implicit = true;
        }
        res = res.transform((child) => {
          if (child.isSymbolNode && hasOwnProperty(matches.placeholders, child.name)) {
            return matches.placeholders[child.name].clone();
          }
          return child;
        });
      }
      if (rule.repeat && res !== node) {
        res = applyRule(res, rule, context, firstOnly);
      }
      return res;
    }

    // mathjs's getSplits, one split at a time, in its order.
    function* splitsOf(node, context) {
      const makeNode = createMakeNodeFunction(node);
      if (isCommutative(node, context)) {
        for (let i = 0; i < node.args.length; i++) {
          const rightArgs = node.args.slice(0);
          rightArgs.splice(i, 1);
          const right = rightArgs.length === 1 ? rightArgs[0] : makeNode(rightArgs);
          yield makeNode([node.args[i], right]);
        }
      } else {
        for (let i = 1; i < node.args.length; i++) {
          let left = node.args[0];
          if (i > 1) {
            left = makeNode(node.args.slice(0, i));
          }
          const rightArgs = node.args.slice(i);
          const right = rightArgs.length === 1 ? rightArgs[0] : makeNode(rightArgs);
          yield makeNode([left, right]);
        }
      }
    }

    function mergeMatch(match1, match2) {
      const res = { placeholders: {} };
      if (!match1.placeholders && !match2.placeholders) {
        return res;
      } else if (!match1.placeholders) {
        return match2;
      } else if (!match2.placeholders) {
        return match1;
      }
      for (const key in match1.placeholders) {
        if (hasOwnProperty(match1.placeholders, key)) {
          res.placeholders[key] = match1.placeholders[key];
          if (hasOwnProperty(match2.placeholders, key)) {
            if (!exactMatch(match1.placeholders[key], match2.placeholders[key])) {
              return null;
            }
          }
        }
      }
      for (const key in match2.placeholders) {
        if (hasOwnProperty(match2.placeholders, key)) {
          res.placeholders[key] = match2.placeholders[key];
        }
      }
      return res;
    }

    /* ------------------------------- every match: mathjs's own search */

    function combineChildMatches(list1, list2) {
      const res = [];
      if (list1.length === 0 || list2.length === 0) {
        return res;
      }
      for (let i1 = 0; i1 < list1.length; i1++) {
        for (let i2 = 0; i2 < list2.length; i2++) {
          const merged = mergeMatch(list1[i1], list2[i2]);
          if (merged) {
            res.push(merged);
          }
        }
      }
      return res;
    }

    function mergeChildMatches(childMatches) {
      if (childMatches.length === 0) {
        return childMatches;
      }
      const sets = childMatches.reduce(combineChildMatches);
      const uniqueSets = [];
      const unique = {};
      for (let i = 0; i < sets.length; i++) {
        const s = JSON.stringify(sets[i], replacer);
        if (!unique[s]) {
          unique[s] = true;
          uniqueSets.push(sets[i]);
        }
      }
      return uniqueSets;
    }

    // A rule symbol's match of one node: a list of one match, or none.
    // Shared by both searches, as mathjs's `_ruleMatch` reads it.
    function symbolMatch(rule, node) {
      const res = [{ placeholders: {} }];
      if (rule.name.length === 0) {
        throw new Error('Symbol in rule has 0 length...!?');
      }
      if (SUPPORTED_CONSTANTS[rule.name]) {
        if (rule.name !== node.name) {
          return [];
        }
        return res;
      }
      switch (wildcardKind(rule.name)) {
        case 'n':
        case '_p':
          res[0].placeholders[rule.name] = node;
          break;
        case 'c':
        case 'cl':
          if (isConstantNode(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        case 'v':
          if (!isConstantNode(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        case 'vl':
          if (isVariableNode(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        case 'cd':
          if (isNumericNode(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        case 'vd':
          if (!isNumericNode(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        case 'ce':
          if (isConstantExpression(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        case 've':
          if (!isConstantExpression(node)) res[0].placeholders[rule.name] = node;
          else return [];
          break;
        default:
          throw new Error(`Invalid symbol in rule: ${rule.name}`);
      }
      return res;
    }

    const sameOperator = (rule, node) => (rule instanceof OperatorNode
      ? rule.op === node.op && rule.fn === node.fn
      : rule.name === node.name);
    const bothOperators = (rule, node) => (rule instanceof OperatorNode && node instanceof OperatorNode)
      || (rule instanceof FunctionNode && node instanceof FunctionNode);
    const matchesInPlace = (rule, node, context, isSplit) => (node.args.length === 1 && rule.args.length === 1)
      || (!isAssociative(node, context) && node.args.length === rule.args.length)
      || isSplit;

    /** mathjs's `_ruleMatch`: every match of `rule` at `node`, in order, repeats dropped. */
    function allMatches(rule, node, context, isSplit) {
      let res = [{ placeholders: {} }];
      if (bothOperators(rule, node)) {
        if (!sameOperator(rule, node)) {
          return [];
        }
        if (matchesInPlace(rule, node, context, isSplit)) {
          let childMatches = [];
          for (let i = 0; i < rule.args.length; i++) {
            const childMatch = allMatches(rule.args[i], node.args[i], context);
            if (childMatch.length === 0) {
              break;
            }
            childMatches.push(childMatch);
          }
          if (childMatches.length !== rule.args.length) {
            if (!isCommutative(node, context) || rule.args.length === 1) {
              return [];
            }
            if (rule.args.length > 2) {
              throw new Error('permuting >2 commutative non-associative rule arguments not yet implemented');
            }
            const leftMatch = allMatches(rule.args[0], node.args[1], context);
            if (leftMatch.length === 0) {
              return [];
            }
            const rightMatch = allMatches(rule.args[1], node.args[0], context);
            if (rightMatch.length === 0) {
              return [];
            }
            childMatches = [leftMatch, rightMatch];
          }
          res = mergeChildMatches(childMatches);
        } else if (node.args.length >= 2 && rule.args.length === 2) {
          let splitMatches = [];
          for (const split of splitsOf(node, context)) {
            splitMatches = splitMatches.concat(allMatches(rule, split, context, true));
          }
          return splitMatches;
        } else if (rule.args.length > 2) {
          throw Error(`Unexpected non-binary associative function: ${rule.toString()}`);
        } else {
          return [];
        }
      } else if (rule instanceof SymbolNode) {
        return symbolMatch(rule, node);
      } else if (rule instanceof ConstantNode) {
        if (!equal(rule.value, node.value)) {
          return [];
        }
      } else {
        return [];
      }
      return res;
    }

    /* ------------------------------ one match at a time: the same order */

    // combineChildMatches folded over the children, first child outermost,
    // without making a combination before it is asked for.
    function* combinedMatches(lists) {
      for (const first of lists[0]) {
        if (lists.length === 1) yield first;
        else yield* combinedWith(lists, 1, first);
      }
    }
    // `merged` is a combination of lists[0 .. index - 1], made in turn.
    function* combinedWith(lists, index, merged) {
      for (const next of lists[index]) {
        const combined = mergeMatch(merged, next);
        if (!combined) continue;
        if (index === lists.length - 1) yield combined;
        else yield* combinedWith(lists, index + 1, combined);
      }
    }

    /** `allMatches`, made one at a time. Only where nothing can throw (above). */
    function* eachMatch(rule, node, context, isSplit) {
      if (bothOperators(rule, node)) {
        if (!sameOperator(rule, node)) {
          return;
        }
        if (matchesInPlace(rule, node, context, isSplit)) {
          // mathjs makes each child's matches in turn and stops at the first
          // child that has none; here a child's search starts, and is known
          // to have a match, in the same turn.
          let childMatches = [];
          for (let i = 0; i < rule.args.length; i++) {
            const childMatch = new MatchList(eachMatch(rule.args[i], node.args[i], context));
            if (childMatch.empty) {
              break;
            }
            childMatches.push(childMatch);
          }
          if (childMatches.length !== rule.args.length) {
            if (!isCommutative(node, context) || rule.args.length === 1) {
              return;
            }
            const leftMatch = new MatchList(eachMatch(rule.args[0], node.args[1], context));
            if (leftMatch.empty) {
              return;
            }
            const rightMatch = new MatchList(eachMatch(rule.args[1], node.args[0], context));
            if (rightMatch.empty) {
              return;
            }
            childMatches = [leftMatch, rightMatch];
          }
          // A repeat mathjs drops comes after its first, and merges as it
          // does: the first match here is the first mathjs keeps.
          if (childMatches.length) yield* combinedMatches(childMatches);
        } else if (node.args.length >= 2 && rule.args.length === 2) {
          for (const split of splitsOf(node, context)) {
            yield* eachMatch(rule, split, context, true);
          }
        }
        return;
      }
      if (rule instanceof SymbolNode) {
        yield* symbolMatch(rule, node);
      } else if (rule instanceof ConstantNode) {
        if (equal(rule.value, node.value)) yield { placeholders: {} };
      }
    }

    function firstMatchOf(rule, node, context) {
      const next = eachMatch(rule, node, context).next();
      return next.done ? undefined : next.value;
    }

    function exactMatch(p, q) {
      if (p instanceof ConstantNode && q instanceof ConstantNode) {
        if (!equal(p.value, q.value)) {
          return false;
        }
      } else if (p instanceof SymbolNode && q instanceof SymbolNode) {
        if (p.name !== q.name) {
          return false;
        }
      } else if ((p instanceof OperatorNode && q instanceof OperatorNode) || (p instanceof FunctionNode && q instanceof FunctionNode)) {
        if (p instanceof OperatorNode) {
          if (p.op !== q.op || p.fn !== q.fn) {
            return false;
          }
        } else if (p instanceof FunctionNode) {
          if (p.name !== q.name) {
            return false;
          }
        }
        if (p.args.length !== q.args.length) {
          return false;
        }
        for (let i = 0; i < p.args.length; i++) {
          if (!exactMatch(p.args[i], q.args[i])) {
            return false;
          }
        }
      } else {
        return false;
      }
      return true;
    }

    /* --------------------------------------------- the typed function */

    // mathjs's signatures. Where mathjs converts a plain object scope to a Map
    // while it makes them (utils/map.js createMap, which it does not export),
    // the object is handed as it is to `resolve`, the only reader of the
    // scope, which converts it with that same createMap ('Node, Object').
    const simplify = typed('simplify', {
      Node: simplifyExpression,
      'Node, Map | Object': (expr, scopeMap) => simplifyExpression(expr, false, scopeMap),
      'Node, Map | Object, Object': (expr, scopeMap, options) => simplifyExpression(expr, false, scopeMap, options),
      'Node, Array': simplifyExpression,
      'Node, Array, Map | Object': simplifyExpression,
      'Node, Array, Map | Object, Object': simplifyExpression,
    });
    simplify.defaultContext = defaultContext;
    simplify.realContext = realContext;
    simplify.positiveContext = positiveContext;
    simplify.rules = mathjsOwn.rules;
    return simplify;
  };
  // A mathjs factory, as mathjs's `factory()` makes one, with simplify's own
  // name and dependencies.
  createSimplifyFirstMatch.isFactory = true;
  createSimplifyFirstMatch.fn = createSimplify.fn;
  createSimplifyFirstMatch.dependencies = [...createSimplify.dependencies];
  return Object.freeze({ ...factories, createSimplify: createSimplifyFirstMatch });
};
