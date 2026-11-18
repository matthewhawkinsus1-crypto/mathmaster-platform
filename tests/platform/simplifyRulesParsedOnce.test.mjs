/*
 * MATHJS'S SIMPLIFY READS ITS DEFAULT RULES FROM TEXT ONCE AN INSTANCE.
 *
 * mathjs's simplify parses the text of its 51 written rules again on every
 * call, on every simplify a grader or Step Algebra makes.
 * functions/shared/algebra/simplifyRulesParsedOnce.mjs gives both of the
 * platform's instances (the shared graders' hardened one,
 * functions/shared/algebra/safeMath.mjs, and the client's,
 * src/platform/math/mathjs.js) mathjs's own simplify with a parser that keeps
 * each default rule's tree. These tests hold it to:
 *
 *   1. each default rule's text parsed once per instance, on its first
 *      simplify, never at import and never again while its configuration
 *      stands; a caller's own rules parsed as mathjs parses them;
 *   2. every instance with its own trees, frozen, never handed out;
 *   3. the hardened instance's rules read with the parser it was built with,
 *      before its namespace is locked, and out of an answer's reach;
 *   4. mathjs's own answers, text and node structure, for every call shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { all, create } from 'mathjs';

import { withSimplifyRulesParsedOnce } from '../../functions/shared/algebra/simplifyRulesParsedOnce.mjs';
import { safeMathInstance, simplify as safeSimplify } from '../../functions/shared/algebra/safeMath.mjs';
import { factories as clientFactories, math as clientMath, simplify as clientSimplify } from '../../src/platform/math/mathjs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A fresh instance whose simplify parses rule text through a parser that
// records what it parsed and the tree it made. `parse` is the instance's own,
// unrecorded, for a test's own nodes.
const recorded = (factories) => {
  const math = create(factories);
  const parsed = [];
  const parse = math.parse;
  math.import({ parse: (...args) => { const tree = parse(...args); parsed.push({ text: args[0], tree }); return tree; } }, { override: true });
  return { math, parsed, parse };
};

// The text of each written rule, as mathjs reads a rule: 'l -> r', { s }, or { l, r }.
const writtenRuleTexts = (rules) => rules
  .map((rule) => (typeof rule === 'string' ? { s: rule } : rule))
  .filter((rule) => rule && typeof rule === 'object')
  .flatMap((rule) => (rule.s ? rule.s.split('->') : [rule.l, rule.r]));

// Text and node structure: what a caller can tell apart.
const answer = (run) => {
  try {
    const node = run();
    return { text: node.toString(), printed: node.toString({ parenthesis: 'auto', implicit: 'hide' }), structure: JSON.stringify(node) };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
};

const allNodes = (node) => node.filter(() => true);
const frozenThrough = (tree) => allNodes(tree).every((node) => Object.isFrozen(node)
  && Object.values(node).filter(Array.isArray).every((list) => Object.isFrozen(list)));

const EXPRESSIONS = [
  '2x + 3x', 'x * x', '(x + 1)^2 - (x^2 + 2x + 1)', '3/4 x - 1/2', 'sqrt(8)', '2(x - 3) - (2x - 6)', 'x^2 * x^3',
  'log(e)', 'log(x^2)', '(2x + 4)/2', '5 - 3(2 - x)', '(x - 2)(x + 3)', 'n + n', '1 * n', '-(x - 4)', 'x/x',
  '0.4 x + 0.1', '2x + 1 < 7', 'x^-1 * x^3', 'a b - b a', '(x^2)^3', 'nthRoot(27, 3) x', 'x - (y + z)',
];

test('an instance parses each default rule\'s text once, on its first simplify, and never again', () => {
  const { math, parsed, parse } = recorded(withSimplifyRulesParsedOnce(all));
  const written = writtenRuleTexts(math.simplify.rules);
  assert.equal(parsed.length, 0, 'nothing is parsed before the first simplify');

  math.simplify('2x + 3x');
  const texts = parsed.map((entry) => entry.text);
  assert.deepEqual([...texts].sort(), [...new Set(written)].sort(), 'the first simplify parses each distinct rule text');
  assert.equal(texts.length, new Set(texts).size, 'and each of them once');

  parsed.length = 0;
  for (const expression of EXPRESSIONS) {
    math.simplify(expression);
    math.simplify(parse(expression));
    math.simplify(expression, {}, { exactFractions: false });
    math.simplify(expression, { y: 2 });
    math.simplify(expression, {}, { context: math.simplify.realContext });
  }
  // (mathjs's resolve parses a scope's values; only rule text is counted.)
  assert.deepEqual(parsed.map((entry) => entry.text).filter((text) => written.includes(text)), [], 'no default rule text is parsed again, whatever the options, scope or context');

  // What this saves: mathjs's own simplify parses every written rule on every
  // call. (Should a mathjs release stop doing that, this module can go.)
  const stock = recorded(all);
  stock.math.simplify('2x + 3x');
  stock.parsed.length = 0;
  stock.math.simplify('x * x');
  assert.equal(stock.parsed.length, written.length, 'mathjs parses all of its written rules on each call');
});

test('a caller\'s own rules are parsed as mathjs parses them, on every call, and never kept', () => {
  const { math, parsed } = recorded(withSimplifyRulesParsedOnce(all));
  const stock = create(all);
  const written = writtenRuleTexts(stock.simplify.rules);
  math.simplify('x');
  const own = ['n1 + n1 -> 2 * n1', { l: 'n1 * 1', r: 'n1' }, { s: 'n1 - n1 -> 0 * n1', repeat: true }];
  const ownTexts = writtenRuleTexts(own);
  assert.ok(ownTexts.every((text) => !written.includes(text)));
  for (const round of [1, 2]) {
    parsed.length = 0;
    assert.deepEqual(answer(() => math.simplify('y + y - z * 1', own)), answer(() => stock.simplify('y + y - z * 1', own)), `round ${round}`);
    assert.deepEqual(parsed.map((entry) => entry.text).sort(), [...ownTexts].sort(), `round ${round}: each of its texts parsed again`);
    assert.ok(parsed.every((entry) => !Object.isFrozen(entry.tree)), 'and none of them kept');
  }
  // A caller's rule written as a default one is: the same tree, copied the
  // same way. (Each instance is given its own rules: a function rule works
  // on its own instance's nodes, so another's would match nothing here.)
  const shared = (m) => [{ l: 'n*n', r: 'n^2' }, { s: 'n-n -> 0', repeat: true }, ...m.simplify.rules.slice(0, 3)];
  parsed.length = 0;
  assert.deepEqual(answer(() => math.simplify('y * y / -z + w - w', shared(math))), answer(() => stock.simplify('y * y / -z + w - w', shared(stock))));
  assert.deepEqual(parsed.map((entry) => entry.text), [], 'its texts are the defaults\', kept');
});

test('every instance reads its own rules, with its own node classes', () => {
  const first = recorded(withSimplifyRulesParsedOnce(all));
  const second = recorded(withSimplifyRulesParsedOnce(all));
  first.math.simplify('2x + 3x');
  assert.ok(first.parsed.length > 0);
  assert.equal(second.parsed.length, 0);
  second.math.simplify('2x + 3x');
  assert.equal(second.parsed.length, first.parsed.length, 'a second instance parses its rules for itself');
  assert.ok(second.parsed.every((entry, index) => entry.tree !== first.parsed[index].tree));

  // What simplify builds from its rules is built from the instance's own node
  // classes: a rule read by another instance would match none of its nodes.
  const instances = [
    ['a fresh instance', first.math, (text) => first.math.simplify(text)],
    ['the client\'s instance', clientMath, (text) => clientSimplify(text)],
    ['the hardened instance', safeMathInstance, (text) => safeSimplify(text)],
  ];
  for (const [name, instance, simplify] of instances) {
    for (const expression of EXPRESSIONS) {
      const result = simplify(expression);
      assert.ok(allNodes(result).every((node) => node instanceof instance.Node), `${name}: ${expression}`);
    }
  }
});

test('kept rule trees are frozen, and never handed out in an answer', () => {
  const { math, parsed } = recorded(withSimplifyRulesParsedOnce(all));
  math.simplify('2x + 3x');
  const kept = parsed.map((entry) => entry.tree);
  assert.ok(kept.length > 90);
  assert.ok(kept.every(frozenThrough), 'every kept tree, every node and list in it, is frozen');
  const sum = kept.find((tree) => tree.type === 'OperatorNode' && tree.args.length === 2);
  assert.throws(() => { sum.args.push(sum.args[0]); }, TypeError);
  assert.throws(() => { sum.op = '-'; }, TypeError);
  assert.throws(() => { sum.args[0] = sum.args[1]; }, TypeError);

  // Simplify hands out copies: no answer holds a kept node (a caller, or the
  // next simplify, may change the nodes it is given).
  const stock = create(all);
  for (const expression of [...EXPRESSIONS, ...writtenRuleTexts(stock.simplify.rules)]) {
    const result = answer(() => math.simplify(expression));
    assert.deepEqual(result, answer(() => stock.simplify(expression)), expression);
    if (!result.error) assert.ok(allNodes(math.simplify(expression)).every((node) => !Object.isFrozen(node)), expression);
  }
});

test('the kept trees follow the instance\'s configuration', () => {
  for (const number of ['BigNumber', 'Fraction', 'bigint']) {
    const { math, parsed } = recorded(withSimplifyRulesParsedOnce(all));
    const stock = create(all);
    EXPRESSIONS.forEach((expression) => math.simplify(expression));
    math.config({ number });
    stock.config({ number });
    parsed.length = 0;
    for (const expression of EXPRESSIONS) {
      assert.deepEqual(answer(() => math.simplify(expression)), answer(() => stock.simplify(expression)), `${number}: ${expression}`);
    }
    assert.ok(parsed.length > 90, `${number}: the rules are read again under the new configuration`);
  }
});

test('options, a scope, a context and a caller\'s rules get mathjs\'s own answers, before and after the rules are kept', () => {
  const math = create(withSimplifyRulesParsedOnce(all));
  const stock = create(all);
  const nonCommutative = { multiply: { commutative: false } };
  const calls = [
    (m, e) => m.simplify(e),
    (m, e) => m.simplify(m.parse(e)),
    (m, e) => m.simplify(e, {}, { exactFractions: false }),
    (m, e) => m.simplify(e, {}, { fractionsLimit: 10 }),
    (m, e) => m.simplify(e, { x: 2 }),
    (m, e) => m.simplify(e, new Map([['y', m.parse('x + 1')]])),
    (m, e) => m.simplify(e, {}, { context: m.simplify.realContext }),
    (m, e) => m.simplify(e, {}, { context: m.simplify.positiveContext }),
    (m, e) => m.simplify(e, {}, { context: nonCommutative }),
    (m, e) => m.simplify(e, [m.simplifyCore, 'n*n -> n^2', { l: 'n+n', r: '2*n' }]),
    (m, e) => m.simplify(e, m.simplify.rules, {}, { context: nonCommutative }),
    (m, e) => m.simplify(e, [...m.simplify.rules].reverse().filter((rule) => typeof rule !== 'function')),
  ];
  // Every call shape, in two orders, so each meets the kept trees both before
  // and after the others have used them.
  for (const order of [calls, [...calls].reverse()]) {
    for (const expression of EXPRESSIONS) {
      order.forEach((call, index) => {
        assert.deepEqual(answer(() => call(math, expression)), answer(() => call(stock, expression)), `call ${index}: ${expression}`);
      });
    }
  }
});

test('the hardened instance reads its rules with its own parser, before it is locked, and an answer reaches neither', () => {
  // A fresh process: the first thing asked of the graders' instance is a simplify.
  const first = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { simplify, evaluate, safeMathInstance } = await import(${JSON.stringify(path.join(ROOT, 'functions/shared/algebra/safeMath.mjs'))});
    const refused = (run) => { try { run(); return false; } catch { return true; } };
    console.log(JSON.stringify({
      simplified: simplify('2x + 3x').toString(),
      again: simplify('n + n').toString(),
      namespaceSimplify: refused(() => safeMathInstance.simplify('x + x')),
      namespaceParse: refused(() => safeMathInstance.parse('x')),
      expressionSimplify: refused(() => evaluate('simplify("x + x")')),
      expressionRules: refused(() => evaluate('simplify.rules')),
    }));
  `], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout.trim()), {
    simplified: '5 * x', again: '2 * n',
    namespaceSimplify: true, namespaceParse: true, expressionSimplify: true, expressionRules: true,
  });

  // A student's answer that is written as a rule is read as an answer, by the
  // checked parser, and what comes back is a copy, never a kept tree.
  const stock = create(all);
  for (const text of ['n + n', 'n1*n3 + n2*n3', 'vd*cd', 'log(e)', 'n/n1^n2']) {
    const result = safeSimplify(text);
    assert.equal(JSON.stringify(result), JSON.stringify(stock.simplify(text)), text);
    assert.ok(allNodes(result).every((node) => !Object.isFrozen(node)), text);
  }
  assert.throws(() => safeSimplify('simplify("x")'), /not available in an answer/);
});

test('both instances are built from these factories, which change nothing but simplify', () => {
  const factories = withSimplifyRulesParsedOnce(all);
  assert.deepEqual(Object.keys(factories).sort(), Object.keys(all).sort());
  for (const [key, factory] of Object.entries(factories)) {
    if (key === 'createSimplify') continue;
    assert.equal(factory, all[key], key);
  }
  assert.notEqual(factories.createSimplify, all.createSimplify);
  assert.equal(factories.createSimplify.fn, 'simplify');
  assert.equal(factories.createSimplify.isFactory, true);
  assert.deepEqual(factories.createSimplify.dependencies, [...all.createSimplify.dependencies, 'math'].sort());
  // The client's instance is created from them (idleMathSteps.js builds ahead
  // from the same list), and its simplify is the one they make.
  assert.equal(clientFactories.createSimplify.fn, 'simplify');
  assert.notEqual(clientFactories.createSimplify, all.createSimplify);
  assert.deepEqual(answer(() => clientMath.simplify('2x + 3x')), answer(() => create(all).simplify('2x + 3x')));
});
