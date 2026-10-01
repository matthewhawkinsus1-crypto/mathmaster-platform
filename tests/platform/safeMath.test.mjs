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

test('an over-long answer is refused before it is parsed', () => {
  assert.throws(() => evaluate(`${'1+'.repeat(3000)}1`));
  assert.equal(evaluate(`${'1+'.repeat(100)}1`), 101);
});

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(m?js)$/.test(entry.name) ? [full] : [];
});

test('every functions/shared module reads mathematics through the hardened instance', () => {
  const offenders = walk(path.join(ROOT, 'functions/shared'))
    .filter((file) => !file.endsWith(path.join('algebra', 'safeMath.mjs')))
    .filter((file) => /from\s+['"]mathjs['"]|require\(\s*['"]mathjs['"]\s*\)|import\(\s*['"]mathjs['"]\s*\)/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  assert.deepEqual(offenders, [], 'import parse/evaluate/compile/simplify from functions/shared/algebra/safeMath.mjs instead');
});
