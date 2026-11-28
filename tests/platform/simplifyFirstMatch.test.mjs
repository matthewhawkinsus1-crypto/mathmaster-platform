/*
 * MATHJS'S simplify, LOOKING FOR THE FIRST MATCH OF A RULE AND NO OTHER
 * (issue #559).
 *
 * functions/shared/algebra/simplifyFirstMatch.mjs ports mathjs 15.2.0's
 * simplify with one change: where mathjs's applyRule builds every match of a
 * rule (every split of a flattened sum, every combination of its children's
 * matches, each written out as JSON to drop the repeats) and uses the first,
 * the port makes them one at a time in mathjs's order and stops at the first.
 * Where a later candidate could throw, it makes them all, as mathjs does.
 * These tests hold the port to:
 *
 *   1. mathjs's own answers, text and node structure or the error, for every
 *      kind of expression and every way simplify is called (scopes, rules of
 *      the caller's own, contexts, number types), including where mathjs
 *      throws on a candidate after the first;
 *   2. which search ran: the first match where nothing can throw, every
 *      match anywhere else;
 *   3. the work, the same on every machine: the nodes mathjs is asked to
 *      serialise or visit grow with a long side about as its square;
 *   4. both of the platform's instances (the graders' hardened one and the
 *      client's) built with it, and nothing else changed;
 *   5. the mathjs files it follows, pinned, so an upgrade of mathjs is ported
 *      again (or this module dropped, if mathjs has changed it).
 * tests/platform/simplifyRulesSweep.test.mjs compares both instances with
 * mathjs's own simplify over every expression the platform simplifies
 * (SIMPLIFY_SWEEP=full: 20,784 expressions, none differing, with this port).
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
import { withSimplifyFirstMatch } from '../../functions/shared/algebra/simplifyFirstMatch.mjs';
import { withSimplifyRulesParsedOnce } from '../../functions/shared/algebra/simplifyRulesParsedOnce.mjs';
import { createRng } from '../../scripts/lib/graderFuzz/prng.mjs';
import { safeMathInstance, simplify as safeSimplify } from '../../functions/shared/algebra/safeMath.mjs';
import { factories as clientFactories, math as clientMath } from '../../src/platform/math/mathjs.js';
import { countedWork, totalWork as total } from './helpers/simplifyWork.mjs';

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

const terms = (count, term) => Array.from({ length: count }, (_, index) => term(index)).join('');
// The shapes of a long side: like terms with different coefficients (a match
// of the like-terms rules at nearly every split), mixed letters, a division
// chain, and a chain of ones.
const LONG = Object.freeze({
  likeTerms: (count) => terms(count, (index) => `${index ? ' + ' : ''}${index + 2}x`),
  mixedLetters: (count) => terms(count, (index) => `${index ? ' + ' : ''}${index + 2}${'xyz'[index % 3]}`),
  divisions: (count) => terms(count, (index) => (index ? ` / ${index + 1}` : 'x')),
  ones: (count) => terms(count, (index) => (index ? ' + 1' : '2x')),
});

// Each kind of expression simplify meets: like terms, products, powers,
// fractions, distributions, functions, brackets, arrays, objects, indexes,
// relations, booleans, operators written as calls, constants it knows, and
// the long shapes.
const EXPRESSIONS = [
  'x', '3', '2x + 3x', 'x + x', 'x - x', '2x - 5x + 3', 'x * x', 'x * x * x', 'x^2 * x^3', 'x / x', '(2x) / 2', '2x / 4', '6x / (3x)',
  '3(x + 2)', '2(x + 3) - 4', '(x + 1)(x - 1)', '(x + 1)^2', 'x^0', 'x^1', '0 * x', '1 * x', '0 + x', '-(-x)', '-(x - y)', 'x - -y',
  '1/3 + 1/3', '0.1 + 0.2', '0.6(2x + 1)', '(2x + 1)/3 - 5', '5x + 3 - (2x + 12)', '7 - 2x - (3x + 2)', 'x/4 + 2', 'x/2 + x/3',
  'a b + a c', 'a*b + b*a', 'a + b + a + b', 'x y z + z y x', '2 l + 2 w - P', 'sqrt(4) + sqrt(x)^2', 'sqrt(x^2)', 'abs(-x)', 'log(e)', 'e^0 + pi * 1',
  'sin(x)^2 + cos(x)^2', 'f(x + x)', 'add(1, 2, x)', 'multiply(x, y, z)', 'unaryMinus(unaryMinus(x))', '[x + x, 2 * 3]', 'a[1 + 1]', '{p: x + x}',
  'x == x + 0', '2x + 3 < 7 + 0', 'x ? x + x : 1 * y', 'not not (x > 1)', 'true and x', 'x or false', 'x mod 1', '3!', '2 i * i', 'Infinity - Infinity', 'NaN + x',
  'x^-1 * x^3', '(x^2 - 1)/(x - 1)', 'n1 + n1', 'c1 * x + c1 * x',
  ...Object.values(LONG).flatMap((shape) => [shape(5), shape(9)]),
];

// What mathjs's search does on a candidate after the first, where the first
// already matched: the second split of x + 1 + "abc" matches (n1 = x + "abc"),
// and the third compares the rule's 1 with "abc", where `equal` throws. So
// mathjs's simplify throws, though the match it would use was found before;
// a search that stopped at the first would answer 5.
const THROWS_AFTER_THE_FIRST = Object.freeze({ expression: 'x + 1 + "abc"', rules: ['n1 + 1 -> 5'] });

// The ways the platform and mathjs call simplify, and rules of a caller's own
// (the last two are malformed: mathjs throws when its search reaches them).
const OWN_RULES = ['n1 + n1 -> 2 n1', { l: 'n1 * c1', r: 'c1 * n1' }, 'c1 * n1 + c2 * n1 -> (c1 + c2) * n1'];
const CALLS = [
  ['simplify(node)', (m, node) => m.simplify(node)],
  ['simplify(node, scope object)', (m, node) => m.simplify(node, { x: 2 })],
  ['simplify(node, scope Map)', (m, node) => m.simplify(node, new Map([['y', m.parse('3 z')]]))],
  ['simplify(node, an options object read as scope)', (m, node) => m.simplify(node, { anyReal: false })],
  ['simplify(node, {}, exactFractions false)', (m, node) => m.simplify(node, {}, { exactFractions: false })],
  ['simplify(node, rules)', (m, node) => m.simplify(node, m.simplify.rules)],
  ['simplify(node, rules, {}, realContext)', (m, node) => m.simplify(node, m.simplify.rules, {}, { context: m.simplify.realContext })],
  ['simplify(node, rules, {}, positiveContext)', (m, node) => m.simplify(node, m.simplify.rules, {}, { context: m.simplify.positiveContext })],
  ['simplify(node, rules, {}, a context of its own)', (m, node) => m.simplify(node, m.simplify.rules, {}, { context: { multiply: { commutative: false } } })],
  ['simplify(node, rules of its own)', (m, node) => m.simplify(node, OWN_RULES)],
  ['simplify(node, [simplifyCore, rules of its own], Map)', (m, node) => m.simplify(node, [m.simplifyCore, ...OWN_RULES], new Map())],
  ['simplify(node, a rule with an unknown wildcard)', (m, node) => m.simplify(node, ['q1 + n1 -> n1'])],
  ['simplify(node, a rule of three operands)', (m, node) => m.simplify(node, ['f(n1, n2, n3) -> n1'])],
];

const ported = () => create(withSimplifyFirstMatch(all));
const own = () => create(all);

test('the port answers exactly as mathjs\'s own simplify, for every kind of expression and every way it is called', () => {
  const mine = ported();
  const theirs = own();
  let compared = 0;
  for (const [name, call] of CALLS) {
    for (const expression of EXPRESSIONS) {
      // A fresh tree each: simplify flattens what it is handed in place.
      assert.deepEqual(answer(() => call(mine, mine.parse(expression))), answer(() => call(theirs, theirs.parse(expression))), `${name}: ${expression}`);
      compared += 1;
    }
  }
  // Texts, as the platform also hands them.
  for (const expression of EXPRESSIONS) {
    assert.deepEqual(answer(() => mine.simplify(expression)), answer(() => theirs.simplify(expression)), `simplify(text): ${expression}`);
    compared += 1;
  }
  assert.ok(compared > 1000, `${compared} answers compared`);
});

test('where mathjs throws on a candidate after the first match, the port throws too', () => {
  const { expression, rules } = THROWS_AFTER_THE_FIRST;
  const theirs = answer(() => own().simplify(expression, rules));
  assert.match(theirs.error || '', /Cannot convert "abc" to a number/, 'mathjs\'s own search reaches the string');
  assert.deepEqual(answer(() => ported().simplify(expression, rules)), theirs);
  // A string constant anywhere else in the expression changes nothing either.
  for (const text of ['"abc" + 2x + 3x', '2x + 3x + "1"', 'f("a") + x + x']) {
    assert.deepEqual(answer(() => ported().simplify(text)), answer(() => own().simplify(text)), text);
  }
});

test('the same under every number type', () => {
  for (const number of ['BigNumber', 'Fraction', 'bigint']) {
    const mine = ported();
    const theirs = own();
    mine.config({ number });
    theirs.config({ number });
    for (const expression of EXPRESSIONS) {
      assert.deepEqual(answer(() => mine.simplify(expression)), answer(() => theirs.simplify(expression)), `${number}: ${expression}`);
    }
  }
});


test('the first match is looked for where nothing can throw, and every match is made anywhere else', () => {
  const mine = ported();
  const theirs = own();
  const side = LONG.likeTerms(8);
  // Numbers only: no match is written out.
  assert.equal(countedWork(mine, () => mine.simplify(side)).serialised, 0);
  // mathjs's own writes out its matches: the count can tell them apart.
  assert.ok(countedWork(theirs, () => theirs.simplify(side)).serialised > 10_000);
  // A string constant, a rule mathjs's search would throw on, or a number
  // that is not a JavaScript number: mathjs's own search, every match.
  // (A string that simplify's constant folding reaches throws before any
  // rule is matched, in mathjs's own and here: one inside a function call
  // is left to the rules.)
  assert.ok(countedWork(mine, () => mine.simplify(`f("a") + ${side}`)).serialised > 0, 'a string constant');
  const big = ported();
  big.config({ number: 'BigNumber' });
  assert.ok(countedWork(big, () => big.simplify(side)).serialised > 0, 'BigNumber constants');
});

test('simplifying a longer side asks mathjs for about the square of the work, where its own search asked for far more', () => {
  for (const [name, math, simplifyIt] of [
    ['the client\'s', clientMath, (text) => clientMath.simplify(text)],
    ['the graders\'', safeMathInstance, (text) => safeSimplify(text)],
  ]) {
    simplifyIt('x + y');
    for (const [shape, side] of Object.entries(LONG)) {
      const work = (count) => total(countedWork(math, () => simplifyIt(side(count))));
      const [at8, at16, at32] = [work(8), work(16), work(32)];
      // Twice the terms, at most five times the work: each pass of simplify
      // walks the side, and a pass combines a term (4.4 times at most, here).
      // mathjs's own search asked for 10 to 13 times as much (likeTerms:
      // 57,631 at 8 terms, 625,348 at 16, 8,355,963 at 32, reopening a draft).
      assert.ok(at16 <= 5 * Math.max(at8, 1), `${name} ${shape}: ${at8} at 8 terms, ${at16} at 16`);
      assert.ok(at32 <= 5 * Math.max(at16, 1), `${name} ${shape}: ${at16} at 16 terms, ${at32} at 32`);
    }
  }
  // And mathjs's own, on the same count, does not hold to it: the test can fail.
  const theirs = own();
  const theirWork = (count) => total(countedWork(theirs, () => theirs.simplify(LONG.likeTerms(count))));
  const [own8, own16] = [theirWork(8), theirWork(16)];
  assert.ok(own16 > 5 * own8, `mathjs's own: ${own8} at 8 terms, ${own16} at 16`);
});

test('both of the platform\'s instances are built with it, and nothing else in them changes', () => {
  assert.notEqual(clientFactories.createSimplify, all.createSimplify);
  for (const factories of [clientFactories, withSimplifyFirstMatch(all)]) {
    assert.equal(factories.createSimplify.fn, 'simplify');
    assert.equal(factories.createSimplify.isFactory, true);
  }
  const factories = withSimplifyFirstMatch(all);
  assert.deepEqual(factories.createSimplify.dependencies, all.createSimplify.dependencies);
  assert.deepEqual(Object.keys(factories).sort(), Object.keys(all).sort());
  for (const [key, factory] of Object.entries(factories)) {
    if (key !== 'createSimplify') assert.equal(factory, all[key], key);
  }
  assert.ok(Object.isFrozen(factories));
  // Its rules and contexts are mathjs's own, as a fresh mathjs simplify has them.
  const mine = ported();
  const theirs = own();
  assert.equal(mine.simplify.rules.length, theirs.simplify.rules.length);
  mine.simplify.rules.forEach((rule, index) => {
    const theirRule = theirs.simplify.rules[index];
    if (typeof rule === 'function') assert.equal(rule.name, theirRule.name, `rule ${index}`);
    else assert.deepEqual(rule, theirRule, `rule ${index}`);
  });
  for (const context of ['defaultContext', 'realContext', 'positiveContext']) assert.deepEqual(mine.simplify[context], theirs.simplify[context], context);

  // Each instance runs the first-match search: a long side is written out nowhere.
  for (const [name, math, simplifyIt] of [
    ['the client\'s', clientMath, (text) => clientMath.simplify(text)],
    ['the graders\'', safeMathInstance, (text) => safeSimplify(text)],
  ]) {
    assert.equal(countedWork(math, () => simplifyIt(LONG.likeTerms(12))).serialised, 0, name);
    assert.deepEqual(answer(() => simplifyIt(LONG.likeTerms(12))), answer(() => theirs.simplify(LONG.likeTerms(12))), name);
  }
});

test('withSimplifyFirstMatch composes with withSimplifyRulesParsedOnce and withSimplifyCoreOnce, in any order', () => {
  const theirs = own();
  const orders = [
    withSimplifyRulesParsedOnce(withSimplifyFirstMatch(withSimplifyCoreOnce(all))),
    withSimplifyFirstMatch(withSimplifyRulesParsedOnce(withSimplifyCoreOnce(all))),
    withSimplifyCoreOnce(withSimplifyFirstMatch(withSimplifyRulesParsedOnce(all))),
  ];
  for (const factories of orders) {
    const math = create(factories);
    for (const expression of EXPRESSIONS) {
      assert.deepEqual(answer(() => math.simplify(expression)), answer(() => theirs.simplify(expression)), expression);
    }
    assert.equal(countedWork(math, () => math.simplify(LONG.likeTerms(12))).serialised, 0);
  }
});

/*
 * EACH WAY BACK TO MATHJS'S OWN SEARCH. The first match alone is the answer
 * only where no later candidate can throw. Each thing that sends a rule back
 * to every match is shown here answering as mathjs does, and, where the two
 * searches would part, that they would: a search that stopped at the first
 * would answer otherwise.
 */
test('a constant that is not a number sends the rule back to mathjs\'s own search', () => {
  // A string: mathjs's own throws on a candidate after the first match (above).
  const { expression, rules } = THROWS_AFTER_THE_FIRST;
  assert.match(answer(() => ported().simplify(expression, rules)).error || '', /Cannot convert "abc" to a number/);
  // The same rule with a number where the string was: the first match, and 5.
  assert.equal(ported().simplify('x + 1 + 7', rules).toString(), '5');
  // Constants of another number type: every match, and mathjs's answers.
  for (const number of ['BigNumber', 'Fraction', 'bigint']) {
    const mine = ported();
    const theirs = own();
    mine.config({ number });
    theirs.config({ number });
    const side = LONG.likeTerms(8);
    assert.ok(countedWork(mine, () => mine.simplify(side)).serialised > 0, `${number}: mathjs's own search ran`);
    assert.deepEqual(answer(() => mine.simplify(side)), answer(() => theirs.simplify(side)), number);
  }
});

test('a malformed rule sends the rule back to mathjs\'s own search', () => {
  for (const rules of [
    // A wildcard mathjs does not know.
    ['q1 + n1 -> n1'],
    // A function of three operands: mathjs's search throws when it meets a
    // call of another number of arguments, which a search that never got
    // there would not.
    ['f(n1, n2, n3) -> n1'],
    ['n1 + n2 + n3 -> n1', 'add(n1, n2, n3) -> n2'],
  ]) {
    for (const expression of ['x + y + z', 'f(a, b, c) + 1 + 2 + 3', 'f(a, b) + 1', 'g(x) + f(a, b, c)', LONG.likeTerms(6), '2x']) {
      assert.deepEqual(answer(() => ported().simplify(expression, rules)), answer(() => own().simplify(expression, rules)), `${rules.join(', ')}: ${expression}`);
    }
  }
  assert.match(answer(() => own().simplify('f(a, b) + 1', ['f(n1, n2, n3) -> n1'])).error || '', /non-binary associative/,
    'mathjs\'s own search throws on the three-operand rule');
  assert.equal(ported().simplify('g(x) + f(a, b, c)', ['f(n1, n2, n3) -> n1']).toString(), 'g(x) + a');
});

/*
 * A SEEDED CORPUS. Polynomials, rational expressions, radicals and long sides
 * of like terms (up to 41, the fuzz harness's case), drawn from a fixed seed,
 * each simplified by the port and by mathjs's own simplify on the instance
 * the platform had before it (with simplifyCoreOnce.mjs, whose answers are
 * mathjs's own: simplifyCoreOnce.test.mjs; plain mathjs takes 17 s for 24
 * terms). Text, printed text and node structure must be identical.
 */
const generatedCorpus = (rng) => {
  const variable = () => rng.pick(['x', 'x', 'y', 'n']);
  const coefficient = () => rng.pick([rng.int(1, 12), -rng.int(1, 9), `${rng.int(1, 9)}/${rng.int(2, 7)}`, `0.${rng.int(1, 9)}`]);
  const monomial = (v = variable()) => rng.pick([`${coefficient()} ${v}`, `${coefficient()} ${v}^${rng.int(2, 4)}`, `${rng.int(1, 20)}`, v]);
  const sum = (count, v) => Array.from({ length: count }, () => monomial(v)).join(rng.pick([' + ', ' - ']));
  const polynomial = () => rng.pick([
    () => sum(rng.int(2, 7)),
    () => `(${variable()} + ${rng.int(-6, 6)})(${variable()} - ${rng.int(1, 6)})`,
    () => `${coefficient()}(${sum(rng.int(2, 3), 'x')}) - ${monomial('x')}`,
    () => `(${sum(2, 'x')})^2`,
    () => `${sum(3, 'x')} = ${sum(2, 'x')}`,
  ])();
  const rational = () => rng.pick([
    () => `(${sum(rng.int(1, 3), 'x')}) / (${sum(rng.int(1, 2), 'x')})`,
    () => `${rng.int(1, 9)} / x + ${rng.int(1, 9)} / x - ${monomial('x')}`,
    () => `(x^2 - ${rng.int(1, 5) ** 2}) / (x - ${rng.int(1, 5)})`,
    () => `x / ${rng.int(2, 9)} + x / ${rng.int(2, 9)} + ${rng.int(1, 9)} / ${rng.int(2, 9)}`,
    () => `1 / (1 / x + 1 / ${rng.int(2, 6)})`,
  ])();
  const radical = () => rng.pick([
    () => `sqrt(${rng.int(1, 80)}) + ${rng.int(1, 5)} sqrt(${rng.int(2, 12)})`,
    () => `${rng.int(2, 6)} sqrt(${rng.int(2, 7)}) - sqrt(${rng.int(2, 7)}) * ${rng.int(1, 4)}`,
    () => `sqrt(x)^2 + sqrt(${rng.int(2, 50)} x^2)`,
    () => `nthRoot(${rng.int(2, 64)}, ${rng.int(2, 3)}) + x^(1/2) * x^(1/2)`,
    () => `(${rng.int(1, 5)} + sqrt(${rng.int(2, 9)}))(${rng.int(1, 5)} - sqrt(${rng.int(2, 9)}))`,
  ])();
  const drawn = [];
  for (let index = 0; index < 120; index += 1) drawn.push(polynomial(), rational(), radical());
  // Long sides of like terms with different coefficients, as a student keeps
  // them, and with the coefficients and letters drawn.
  for (const count of [6, 12, 24, 41]) {
    drawn.push(LONG.likeTerms(count));
    if (count <= 24) {
      drawn.push(terms(count, (index) => `${index ? rng.pick([' + ', ' - ']) : ''}${rng.int(1, 30)}${rng.pick(['x', 'y', 'x^2', ''])}`));
      drawn.push(LONG.mixedLetters(count), LONG.divisions(count));
    }
  }
  return drawn;
};

test('a seeded corpus of polynomials, rational expressions, radicals and long like-term sides simplifies exactly as with mathjs\'s own simplify', () => {
  const mine = create(withSimplifyFirstMatch(withSimplifyCoreOnce(all)));
  const theirs = create(withSimplifyCoreOnce(all));
  const corpus = generatedCorpus(createRng('simplifyFirstMatch-559'));
  assert.ok(corpus.length > 370, `${corpus.length} expressions`);
  let answered = 0;
  for (const expression of corpus) {
    const expected = answer(() => theirs.simplify(expression));
    assert.deepEqual(answer(() => mine.simplify(expression)), expected, expression);
    if (!expected.error) answered += 1;
  }
  assert.ok(answered > 0.9 * corpus.length, `${answered} of ${corpus.length} simplified without an error`);
});

/*
 * THE MATHJS VERSION. The port follows mathjs 15.2.0 (the files are pinned
 * below, too). Another version may change simplify's search or its rules:
 * re-check the port against it, then change this version and the pins.
 */
test('every copy of mathjs the platform loads is 15.2.0, the version the port was checked against', () => {
  const copies = new Set([
    path.dirname(createRequire(import.meta.url).resolve('mathjs/package.json')),
    path.dirname(createRequire(path.join(ROOT, 'functions/shared/algebra/safeMath.mjs')).resolve('mathjs/package.json')),
  ]);
  const functionsCopy = path.join(ROOT, 'functions/node_modules/mathjs');
  if (existsSync(functionsCopy)) copies.add(functionsCopy);
  for (const copy of copies) {
    const { version } = JSON.parse(readFileSync(path.join(copy, 'package.json'), 'utf8'));
    assert.equal(version, '15.2.0', `${path.relative(ROOT, copy)} is mathjs ${version}: functions/shared/algebra/simplifyFirstMatch.mjs was ported from 15.2.0's simplify; re-check the port against ${version} (or drop it, if mathjs now stops at the first match) before upgrading`);
  }
});

/*
 * THE MATHJS IT WAS PORTED FROM. The port follows mathjs 15.2.0's simplify
 * (lib/esm/function/algebra/simplify.js), the helpers it reads
 * (simplify/util.js, simplify/wildcards.js) and hasOwnProperty
 * (utils/object.js). A mathjs upgrade that changes any of them fails here:
 * port the change into simplifyFirstMatch.mjs, or, if mathjs no longer builds
 * every match to use the first, delete that module and its two uses
 * (safeMath.mjs, src/platform/math/mathjs.js).
 */
const PORTED_FROM = Object.freeze({
  'lib/esm/function/algebra/simplify.js': '60471bbcd0e50a1e1771fca01e750734a4281661068fc2b36a3d6d5fbbbb9e1e',
  'lib/esm/function/algebra/simplify/util.js': '38b62d251949a024234174176c5c6e3747356257add7b6224e8b3d67e87f0fc2',
  'lib/esm/function/algebra/simplify/wildcards.js': 'd3539a88b26c9f741796f55434c96681f3bea52c1227bfdcd7d0953f2fccd374',
  'lib/esm/utils/object.js': '6f58053daf066fe2e693641fe6e5bff939efe9e263b5d8e776a0f7a470e32425',
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
  for (const copy of copies) {
    for (const [file, sha256] of Object.entries(PORTED_FROM)) {
      const actual = createHash('sha256').update(readFileSync(path.join(copy, file))).digest('hex');
      assert.equal(actual, sha256, `${path.relative(ROOT, path.join(copy, file))} is not the file simplifyFirstMatch.mjs was ported from (mathjs ${JSON.parse(readFileSync(path.join(copy, 'package.json'), 'utf8')).version})`);
    }
  }
});
