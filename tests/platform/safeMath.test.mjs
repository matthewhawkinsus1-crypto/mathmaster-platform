/*
 * STUDENT-TYPED TEXT CANNOT REACH OUTSIDE ITS OWN ANSWER.
 *
 * The server now evaluates what students type, inside Cloud Function
 * instances shared by every student graded while they are warm. These tests
 * hold functions/shared/algebra/safeMath.mjs to three things:
 *
 *   1. ordinary mathematics evaluates exactly as on mathjs's default instance;
 *   2. nothing an expression can name mutates the process (units, config, the
 *      type system) or allocates in proportion to a typed number;
 *   3. every functions/shared module that parses or evaluates text goes
 *      through it rather than importing 'mathjs' directly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as defaultMath from 'mathjs';

import {
  REFUSED_EXPRESSION_SYMBOLS,
  compile,
  evaluate,
  parse,
  safeMathInstance,
  simplify,
} from '../../functions/shared/algebra/safeMath.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const ORDINARY = [
  '2+3*4', '-(3-5)/2', '2^10', 'sqrt(16)', 'nthRoot(27, 3)', 'abs(-3.5)', '3!', 'mod(7, 3)',
  'sin(pi/2)', 'cos(0)', 'tan(pi/4)', 'log(e)', 'log(100, 10)', 'log10(1000)', 'exp(1)',
  '1/3 + 1/6', '0.1 + 0.2', 'round(2.567, 2)', 'floor(-2.5)', 'ceil(2.1)', 'max(1, 5, 3)', 'min(4, -2)',
  'x^2 + 2x + 1', '(x - 3)(x + 2)', 'y - 2 * (x - 1)', 'n > 0 ? n : 0', 'pi', 'e', 'i^2', 'sqrt(-4)',
  '[1, 2, 3]', 'det([[1, 2], [3, 4]])', 'inv([[1, 2], [3, 4]])', '[[1, 2], [3, 4]]^2', 'sum([1, 2, 3])', 'mean([2, 4])',
  'x == 2', '3 < 4', 'x * 2 / 4', '2x', '-x^2',
];
const SCOPE = { x: 2, y: 5, n: 3 };
const comparable = (value) => defaultMath.format(value, { precision: 14 });

test('ordinary mathematics evaluates exactly as on the default mathjs instance', () => {
  ORDINARY.forEach((expression) => {
    assert.equal(comparable(evaluate(expression, { ...SCOPE })), comparable(defaultMath.evaluate(expression, { ...SCOPE })), expression);
    assert.equal(comparable(compile(expression).evaluate({ ...SCOPE })), comparable(defaultMath.evaluate(expression, { ...SCOPE })), `compiled ${expression}`);
    assert.equal(parse(expression).toString(), defaultMath.parse(expression).toString(), `parsed ${expression}`);
  });
  assert.equal(simplify('2x + 3x').toString(), defaultMath.simplify('2x + 3x').toString());
  assert.equal(simplify(parse('x * 1 + 0')).toString(), defaultMath.simplify('x * 1 + 0').toString());
});

const HOSTILE = [
  'createUnit("lb2")', 'config({number: "BigNumber"})', 'a = config; a({number: "BigNumber"})',
  'typed.clear()', 'f = typed; f.clear()', 'import({sqrt: 1}, {override: true})',
  '1:20000000', 'size(1:5)', 'zeros(5000, 5000)', 'ones(9000)', 'identity(9000)', 'resize([1], [100000000])',
  'range(1, 100000000)', 'random()', 'map([1, 2], f(x) = x)', 'concat([1], [2])',
  'evaluate("1 + 1")', 'parse("x")', 'compile("x")', 'simplify("x + x")', 'derivative("x^2", "x")', 'resolve(x, {x: 1})',
  // Found by the tool reviews: index-assignment resizes a matrix in proportion
  // to the index; a lookup reaches a function no name check sees; exact
  // simplification of a constant tower builds a number with millions of
  // digits; number-theory and combinatorics functions run for seconds.
  'x = [1]; x[3000, 3000] = 1', '{a: det}["a"]([[1, 2], [3, 4]])', '{a: 1}',
  'y + 9^9^9 - 9^9^9', 'x^(9^9^9)', 'pow(9, 9^9)', '2^2^2^2^2', '10^-400',
  'isPrime(9007199254740881)', 'combinations(10000000, 5000000)', 'permutations(170)',
  'stirlingS2(2000, 1000)', 'bellNumbers(300)', 'catalan(5000)', 'multinomial([500, 500])',
];

test('an expression cannot mutate the process or allocate in proportion to a typed number', () => {
  HOSTILE.forEach((expression) => {
    assert.throws(() => evaluate(expression), undefined, `evaluate ${expression}`);
    assert.throws(() => parse(expression), undefined, `parse ${expression}`);
    assert.throws(() => compile(expression), undefined, `compile ${expression}`);
    assert.throws(() => simplify(expression), undefined, `simplify ${expression}`);
  });
  // Nothing leaked into either instance.
  assert.equal(evaluate('0.1 + 0.2'), 0.30000000000000004, 'number handling is still IEEE doubles');
  assert.equal(safeMathInstance.config().number, 'number');
  assert.throws(() => defaultMath.unit('1 lb2'));
  assert.throws(() => safeMathInstance.unit('1 lb2'));
  assert.equal(typeof safeMathInstance.add(1, 2), 'number', 'the type system still works');
  assert.ok(REFUSED_EXPRESSION_SYMBOLS.includes('config') && REFUSED_EXPRESSION_SYMBOLS.includes('typed'));
});

test('what the new refusals leave alone: equations, function notation, ordinary powers', () => {
  // `y = 2x + 1` and `f(x) = x^2` parse as assignments; tools read them.
  assert.equal(parse('y = 2x + 1').toString(), defaultMath.parse('y = 2x + 1').toString());
  assert.equal(parse('f(x) = x^2').toString(), defaultMath.parse('f(x) = x^2').toString());
  ['2^10', '10^-3', '(1/2)^100', 'x^(2^3)', '1.05^30', '9^9', 'e^700', '(x+1)^40'].forEach((expression) => {
    assert.equal(parse(expression).toString(), defaultMath.parse(expression).toString(), expression);
  });
  assert.equal(evaluate('9^9'), 387420489);
  assert.equal(simplify('x^(2^3)').toString(), defaultMath.simplify('x^(2^3)').toString());
});

test('an over-long answer is refused before it is parsed', () => {
  assert.throws(() => evaluate(`${'1+'.repeat(3000)}1`));
  assert.equal(evaluate(`${'1+'.repeat(100)}1`), 101);
});

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(m?js)$/.test(entry.name) ? [full] : [];
});

test('the hardened instance is built and locked on first use, never before it reads text', () => {
  // safeMath.mjs is in the browser's first load. Building its functions and
  // node classes and locking its namespace at import cost a few hundred ms of
  // main thread before the sign-in screen on a slow Chromebook (BUNDLE-1), so
  // all of it waits for the first parse, compile, evaluate or simplify.
  const code = fs.readFileSync(path.join(ROOT, 'functions/shared/algebra/safeMath.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const start = code.indexOf('const hardenedMath = () => {');
  const end = code.indexOf('\n};', start);
  assert.ok(start > -1 && end > start, 'the first-use lock');
  const lock = code.slice(start, end);
  assert.match(lock, /math\.import\(/);
  for (const name of ['parse', 'evaluate', 'simplify', 'fraction', 'format']) assert.match(lock, new RegExp(`math\\.${name}\\b`), name);
  const outside = code.slice(0, start) + code.slice(end);
  assert.doesNotMatch(outside, /math\.(parse|evaluate|simplify|fraction|format|import)\b/, 'nothing else builds or locks the instance at import');
  assert.doesNotMatch(outside, /=\s*math;|\}\s*=\s*math\b/, 'no node class is read from the instance at import');
  // ...and the very first thing a fresh process asks of it is already refused.
  const first = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { evaluate, parse } = await import(${JSON.stringify(path.join(ROOT, 'functions/shared/algebra/safeMath.mjs'))});
    let refused = false;
    try { evaluate('createUnit("knot")'); } catch { refused = true; }
    console.log(JSON.stringify({ refused, ordinary: evaluate('2+3*4'), parsed: parse('x^2 + 1').toString() }));
  `], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(JSON.parse(first.stdout.trim()), { refused: true, ordinary: 14, parsed: 'x ^ 2 + 1' });
});

test('every functions/shared module reads mathematics through the hardened instance', () => {
  const offenders = walk(path.join(ROOT, 'functions/shared'))
    .filter((file) => !file.endsWith(path.join('algebra', 'safeMath.mjs')))
    .filter((file) => /from\s+['"]mathjs['"]|require\(\s*['"]mathjs['"]\s*\)|import\(\s*['"]mathjs['"]\s*\)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  assert.deepEqual(offenders, [], 'import parse/evaluate/compile/simplify from functions/shared/algebra/safeMath.mjs instead');
});
