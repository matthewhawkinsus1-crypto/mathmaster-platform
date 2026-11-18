/*
 * MATHJS'S simplifyCore, SIMPLIFYING EACH NODE ONCE (issue #559).
 *
 * functions/shared/algebra/simplifyCoreOnce.mjs ports mathjs 15.2.0's
 * simplifyCore with one change: the first child of a trivial node (a sum, a
 * product, a unary plus, a bracket) is simplified only when it is the node's
 * only child. mathjs simplified it there and again in the binary case, so each
 * link of a sum or product chain doubled the work. These tests hold the port to:
 *
 *   1. mathjs's own answers, text and node structure, for every kind of node
 *      and every way it is called (options, contexts, number types), alone and
 *      as simplify's first rule;
 *   2. one visit per node: n - 1 for a sum of n terms, where mathjs's own takes
 *      2^(n-1) - 1 (a count, the same on every machine);
 *   3. both of the platform's instances (the graders' hardened one and the
 *      client's) built with it, and nothing else changed;
 *   4. the mathjs files it follows, pinned, so an upgrade of mathjs is ported
 *      again (or this module dropped, if mathjs has fixed it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, create } from 'mathjs';

import { withSimplifyCoreOnce } from '../../functions/shared/algebra/simplifyCoreOnce.mjs';
import { withSimplifyRulesParsedOnce } from '../../functions/shared/algebra/simplifyRulesParsedOnce.mjs';
import { safeMathInstance, simplify as safeSimplify, parse as safeParse } from '../../functions/shared/algebra/safeMath.mjs';
import { factories as clientFactories, math as clientMath } from '../../src/platform/math/mathjs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Text and node structure: what a caller can tell apart.
const answer = (run) => {
  try {
    const node = run();
    return { text: node.toString(), printed: node.toString({ parenthesis: 'auto', implicit: 'hide' }), structure: JSON.stringify(node) };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
};

const chain = (terms, op = '+', term = (index) => `a${index + 1}`) => Array.from({ length: terms }, (_, index) => term(index)).join(` ${op} `);

// Every branch of simplifyCore: each operator with 0 and 1 on either side,
// signs, double negations, booleans, bitwise, operators written as calls (of
// every arity, an associative one of more than two arguments, a method),
// functions, brackets, arrays, objects, indexes, implicit products, and chains.
const EXPRESSIONS = [
  'x', '3', '0 + x', 'x + 0', 'x + -y', 'x - -y', '0 - x', 'x - 0', 'x - y', '-(x - y)', '-(-x)', '-(2x)', '+x', '+(+x)', '((x))', '(0 + x)',
  '0 * x', 'x * 0', '1 * x', 'x * 1', 'x * 2', '2 x', 'x y', '2 (x + 1)', '(x + 1) 3', '0 / x', 'x / 1', 'x / 2', 'x ^ 0', 'x ^ 1', 'x ^ 2', '0 ^ x',
  '~~x', '~x', 'not not (x > 1)', 'not not x', 'not x', 'true and (x > 1)', 'true and true', 'true and x', 'false and x', 'x and true', 'x and false',
  'true or x', 'false or (x > 1)', 'false or x', 'x or true', 'x or false', 'x or (y and true)',
  'add(1, 2, x)', 'add(x)', 'add()', 'add(0, x)', 'multiply(x)', 'multiply(2, x, 1)', 'multiply(x, y, z, w)', 'unaryMinus(x)', 'unaryMinus(unaryMinus(x))', 'unaryPlus(x)',
  'subtract(x, 0)', 'subtract(x)', 'divide(0, x)', 'pow(x, 1)', 'and(true, x > 1)', 'or(false, x)', 'not(not(x > 1))', 'bitNot(bitNot(x))', 'dotMultiply(x, 1)',
  'mod(x, 1)', 'equal(x, 0 + y)', 'factorial(x + 0)', 'ctranspose(x)', 'nullish(x, 0 + 1)', 'to(x, cm)', 'f(0 + x)', 'sqrt(0 + x)', 'nthRoot(x * 1, 3)', 'abs(-(-x))',
  'a.add(1, 2)', '[0 + x, 1 * y]', 'a[1 * 2]', '{p: 0 + x, q: y * 1}', 'x == 0 + y', '2x + 3 < 7 + 0', 'x ? 0 + y : z * 1', 'x = 0 + y', '3!', '5 mod 1',
  '2x + 1 + 1 - 3', '(2x + 1 + 1 + 1) - (3)', '(2) * (2x + 1 + 1)', '(2x + 1 + 1) / (2)', '3x + 6 - 2 + 2 - 2', '0.5x + 0.1 + 0.2', 'x / 2 / 2 / 2',
  '1/3 + 1/3', '0.1 + 0.2', '2 / x + 1 + 1', '(x + 1)(x - 1) - x^2 + 1', 'x^-1 * x^3', 'log(e)', 'e^0 + pi * 1',
  chain(12), chain(12, '*'), chain(12, '-'), chain(12, '/'), `2x${' + 1'.repeat(14)}`, `2x${' * 2'.repeat(14)}`, `(${chain(8)}) * (${chain(6, '*')})`,
];
// What simplify, which runs simplifyCore at the start of every pass, is
// compared on: a node of each kind and the chains (simplify is slow enough
// that the whole list, many times over, would make a slow test; mathjs's own
// answers to simplify are also held, for both instances, by
// mathjsInstance.test.mjs and simplifyRulesParsedOnce.test.mjs).
const SIMPLIFIED = [
  '0 + x', 'x - -y', '-(x - y)', '2 (x + 1)', 'x * 1', 'x ^ 1', 'not not (x > 1)', 'x or false', 'add(1, 2, x)', 'multiply(x)', 'unaryMinus(unaryMinus(x))',
  'sqrt(0 + x)', '[0 + x, 1 * y]', '2x + 1 + 1 - 3', '3x + 6 - 2 + 2 - 2', '0.5x + 0.1 + 0.2', '1/3 + 1/3', '(x + 1)(x - 1) - x^2 + 1',
  chain(12), chain(12, '*'), `2x${' + 1'.repeat(14)}`, `2x${' * 2'.repeat(14)}`,
];

// Nodes no parse makes, which simplify makes: a sum or product of one or of
// three arguments.
const builtNodes = (math) => {
  const { OperatorNode, SymbolNode, ConstantNode } = math;
  return [
    new OperatorNode('+', 'add', [new SymbolNode('x')]),
    new OperatorNode('*', 'multiply', [new ConstantNode(0)]),
    new OperatorNode('+', 'add', [new SymbolNode('x'), new ConstantNode(0), new SymbolNode('y')]),
    new OperatorNode('*', 'multiply', [new ConstantNode(1), new SymbolNode('x'), new ConstantNode(2)], true),
    new OperatorNode('+', 'add', []),
  ];
};

const ported = () => create(withSimplifyCoreOnce(all));
const own = () => create(all);

const CALLS = [
  ['simplifyCore(node)', (m, node) => m.simplifyCore(node)],
  ['simplifyCore(node, {})', (m, node) => m.simplifyCore(node, {})],
  ['simplifyCore(node, realContext)', (m, node) => m.simplifyCore(node, { context: m.simplify.realContext })],
  ['simplifyCore(node, positiveContext)', (m, node) => m.simplifyCore(node, { context: m.simplify.positiveContext })],
  ['simplifyCore(node, a context of its own)', (m, node) => m.simplifyCore(node, { context: { add: { trivial: false }, multiply: { commutative: false } } })],
  ['simplify(node)', (m, node) => m.simplify(node)],
  ['simplify(node, rules, {}, a context)', (m, node) => m.simplify(node, m.simplify.rules, {}, { context: m.simplify.realContext })],
  ['simplify(node, [simplifyCore])', (m, node) => m.simplify(node, [m.simplifyCore])],
];

test('the port answers exactly as mathjs\'s own simplifyCore, for every kind of node and every way it is called', () => {
  const mine = ported();
  const theirs = own();
  let compared = 0;
  for (const [name, call] of CALLS) {
    for (const expression of name.startsWith('simplify(') ? SIMPLIFIED : EXPRESSIONS) {
      // A fresh tree each: simplifyCore rewrites an operator written as a call
      // (add(1, 2, x)) in place.
      const expected = answer(() => call(theirs, theirs.parse(expression)));
      assert.deepEqual(answer(() => call(mine, mine.parse(expression))), expected, `${name}: ${expression}`);
      compared += 1;
    }
    builtNodes(theirs).forEach((node, index) => {
      assert.deepEqual(answer(() => call(mine, builtNodes(mine)[index])), answer(() => call(theirs, node)), `${name}: built node ${index}`);
      compared += 1;
    });
  }
  assert.ok(compared > 600, `${compared} answers compared`);
});

test('the same under every number type', () => {
  for (const number of ['BigNumber', 'Fraction', 'bigint']) {
    const mine = ported();
    const theirs = own();
    mine.config({ number });
    theirs.config({ number });
    for (const [name, call] of CALLS.slice(0, 2)) {
      for (const expression of EXPRESSIONS) {
        assert.deepEqual(answer(() => call(mine, mine.parse(expression))), answer(() => call(theirs, theirs.parse(expression))), `${number} ${name}: ${expression}`);
      }
    }
    for (const expression of SIMPLIFIED.slice(0, 12)) {
      assert.deepEqual(answer(() => mine.simplify(expression)), answer(() => theirs.simplify(expression)), `${number} simplify: ${expression}`);
    }
  }
});

// How many times simplifyCore asks a sum for its children: once for each
// visit of a trivial node, the only place it asks.
const sumVisits = (math, work) => {
  const prototype = math.OperatorNode.prototype;
  const forEach = prototype.forEach;
  let visits = 0;
  prototype.forEach = function countedForEach(callback) {
    if (this.fn === 'add' || this.fn === 'multiply') visits += 1;
    return forEach.call(this, callback);
  };
  try {
    work();
  } finally {
    prototype.forEach = forEach;
  }
  return visits;
};

test('each node of a chain is visited once: n - 1 visits for n terms, where mathjs\'s own makes 2^(n-1) - 1', () => {
  const mine = ported();
  const theirs = own();
  for (const terms of [2, 3, 5, 8, 12, 16, 24, 48, 96]) {
    for (const op of ['+', '*']) {
      assert.equal(sumVisits(mine, () => mine.simplifyCore(mine.parse(chain(terms, op)))), terms - 1, `${terms} terms joined by ${op}`);
    }
  }
  // What it was: each link doubled the visits of the chain before it.
  for (const terms of [2, 3, 5, 8, 12]) {
    assert.equal(sumVisits(theirs, () => theirs.simplifyCore(theirs.parse(chain(terms)))), 2 ** (terms - 1) - 1, `mathjs's own, ${terms} terms`);
  }
  // A run of - or / was never doubled: neither is trivial.
  for (const op of ['-', '/']) {
    assert.equal(sumVisits(theirs, () => theirs.simplifyCore(theirs.parse(chain(16, op)))), 0, `mathjs's own, 16 terms joined by ${op}`);
  }
});

test('both of the platform\'s instances are built with it, and nothing else in them changes', () => {
  // The client's: its factories carry the port, every other factory mathjs's own.
  assert.notEqual(clientFactories.createSimplifyCore, all.createSimplifyCore);
  assert.equal(clientFactories.createSimplifyCore.fn, 'simplifyCore');
  assert.equal(clientFactories.createSimplifyCore.isFactory, true);
  assert.deepEqual(clientFactories.createSimplifyCore.dependencies, all.createSimplifyCore.dependencies);
  const factories = withSimplifyCoreOnce(all);
  assert.deepEqual(Object.keys(factories).sort(), Object.keys(all).sort());
  for (const [key, factory] of Object.entries(factories)) {
    if (key !== 'createSimplifyCore') assert.equal(factory, all[key], key);
  }
  assert.ok(Object.isFrozen(factories));
  // A short chain first: with mathjs's own simplifyCore a long one would run for minutes.
  assert.equal(sumVisits(clientMath, () => clientMath.simplifyCore(clientMath.parse(chain(10)))), 9, 'the client\'s simplifyCore, 10 terms');
  assert.equal(sumVisits(clientMath, () => clientMath.simplifyCore(clientMath.parse(chain(24)))), 23, 'the client\'s simplifyCore, 24 terms');

  // Through simplify, whose first rule it is (the graders' hardened instance
  // refuses simplifyCore inside an answer, so it is only reached this way).
  // An instance's first simplify also walks the rules' trees as it reads them,
  // and the graders' screens each expression it is handed (assertSafeNode),
  // so what is held is the growth: each 6 more terms cost the same, where
  // mathjs's own simplifyCore made 2^17 visits for 18 terms in its first pass
  // (and 2^35 for 36, which is why the short ones are asked first).
  for (const [name, math, simplifyIt] of [
    ['the client\'s', clientMath, (text) => clientMath.simplify(clientMath.parse(text))],
    ['the graders\'', safeMathInstance, (text) => safeSimplify(safeParse(text))],
  ]) {
    simplifyIt('x + y');
    const visits = (terms) => sumVisits(math, () => simplifyIt(chain(terms)));
    const [v6, v12, v18] = [6, 12, 18].map(visits);
    assert.equal(v18 - v12, v12 - v6, `${name} simplify: ${v6}, ${v12}, ${v18} visits for 6, 12, 18 terms`);
    const v36 = visits(36);
    assert.equal(v36 - v18, 3 * (v12 - v6), `${name} simplify: ${v36} visits for 36 terms`);
    assert.ok(v36 <= 3 * 36, `${name} simplify: ${v36} visits for 36 terms`);
  }
  assert.throws(() => safeSimplify('simplifyCore(x)'), /not available in an answer/);

  // And with it, both answer as mathjs's own instance does (the graders' where
  // its screen lets an expression through at all: it refuses a method call,
  // an assignment and an object in an answer, as it always has).
  const theirs = own();
  const SCREENED = /not available in an answer|Only a named function|An object is not|Assigning into/;
  let screened = 0;
  for (const expression of SIMPLIFIED) {
    assert.deepEqual(answer(() => clientMath.simplify(expression)), answer(() => theirs.simplify(expression)), `client: ${expression}`);
    const graders = answer(() => safeSimplify(expression));
    if (SCREENED.test(graders.error || '')) {
      screened += 1;
      continue;
    }
    assert.deepEqual(graders, answer(() => theirs.simplify(expression)), `graders: ${expression}`);
  }
  assert.ok(screened < 2, `${screened} expressions screened`);
});

test('withSimplifyCoreOnce composes with withSimplifyRulesParsedOnce, either way round', () => {
  const theirs = own();
  for (const factories of [withSimplifyRulesParsedOnce(withSimplifyCoreOnce(all)), withSimplifyCoreOnce(withSimplifyRulesParsedOnce(all))]) {
    const math = create(factories);
    for (const expression of SIMPLIFIED) {
      assert.deepEqual(answer(() => math.simplify(expression)), answer(() => theirs.simplify(expression)), expression);
    }
    assert.equal(sumVisits(math, () => math.simplifyCore(math.parse(chain(10)))), 9);
    assert.equal(sumVisits(math, () => math.simplifyCore(math.parse(chain(30)))), 29);
  }
});

/*
 * THE MATHJS IT WAS PORTED FROM. The port follows mathjs 15.2.0's
 * simplifyCore (lib/esm/function/algebra/simplifyCore.js) and the default
 * context it reads (simplify/util.js). A mathjs upgrade that changes either
 * fails here: port the change into simplifyCoreOnce.mjs, or, if mathjs no
 * longer simplifies a trivial node's first child twice, delete that module
 * and its two uses (safeMath.mjs, src/platform/math/mathjs.js).
 */
const PORTED_FROM = Object.freeze({
  'lib/esm/function/algebra/simplifyCore.js': '9c7932905ce8b37a6752d8eb21d58265b8081dd9d144bbc3f142193cad1e1e17',
  'lib/esm/function/algebra/simplify/util.js': '38b62d251949a024234174176c5c6e3747356257add7b6224e8b3d67e87f0fc2',
});

test('the mathjs files the port follows are the ones it was ported from, in every copy of mathjs the platform loads', () => {
  // The client (Vite dedupes mathjs to the root copy) and the tests load the
  // root copy; the shared graders, run by Functions, load functions'.
  const copies = new Set([
    path.dirname(createRequire(import.meta.url).resolve('mathjs/package.json')),
    path.dirname(createRequire(path.join(ROOT, 'functions/shared/algebra/safeMath.mjs')).resolve('mathjs/package.json')),
  ]);
  const functionsCopy = path.join(ROOT, 'functions/node_modules/mathjs');
  if (existsSync(functionsCopy)) copies.add(functionsCopy);
  assert.ok(copies.size >= 1);
  for (const copy of copies) {
    for (const [file, sha256] of Object.entries(PORTED_FROM)) {
      const actual = createHash('sha256').update(readFileSync(path.join(copy, file))).digest('hex');
      assert.equal(actual, sha256, `${path.relative(ROOT, path.join(copy, file))} is not the file simplifyCoreOnce.mjs was ported from (mathjs ${JSON.parse(readFileSync(path.join(copy, 'package.json'), 'utf8')).version})`);
    }
  }
});
