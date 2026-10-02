// THE CLIENT'S ONE MATHJS INSTANCE (src/platform/math/mathjs.js).
//
// `import { parse } from 'mathjs'` evaluates mathjs's prebuilt default
// instance, which builds every function up front: about 0.7 s of main thread
// on a 4x-throttled CPU before the sign-in screen (BUNDLE-1). The client uses
// `create(all)` instead, which builds each function on first use. These tests
// keep it that way, and check that the lazily built instance answers exactly
// as the default one: same parse trees, printing, values, simplification,
// derivatives and errors.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as defaultMath from 'mathjs';
import * as shim from '../../src/platform/math/mathjs.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHIM = 'src/platform/math/mathjs.js';

const sourceFiles = (dir) => readdirSync(path.join(repo, dir)).flatMap((name) => {
  const relative = path.join(dir, name);
  if (statSync(path.join(repo, relative)).isDirectory()) return sourceFiles(relative);
  return /\.(m?jsx?)$/.test(name) ? [relative] : [];
});

const MATHJS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]mathjs(?:\/[^'"]*)?['"]/m;

test('no client module imports mathjs except the one instance', () => {
  const offenders = sourceFiles('src')
    .filter((file) => file !== SHIM)
    .filter((file) => MATHJS_IMPORT.test(readFileSync(path.join(repo, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.deepEqual(offenders, [], `Import from ${SHIM} instead: importing 'mathjs' builds its prebuilt instance, every function at once.`);
});

test('the instance imports only create and all, so the prebuilt instance stays out of the build', () => {
  const code = readFileSync(path.join(repo, SHIM), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]mathjs['"]/g)];
  assert.equal(imports.length, 1);
  assert.deepEqual(imports[0][1].split(',').map((name) => name.trim()).filter(Boolean).sort(), ['all', 'create']);
  assert.equal([...code.matchAll(/['"]mathjs(?:\/[^'"]*)?['"]/g)].length, 1, 'one import of mathjs, and nothing else from it');
});

test('the client\'s functions and node classes come from the instance', () => {
  for (const name of ['parse', 'evaluate', 'simplify', 'compile', 'derivative', 'fraction']) {
    assert.equal(typeof shim[name], 'function', name);
  }
  assert.equal(shim.math.parse('x + 1').type, 'OperatorNode');
  const node = new shim.math.OperatorNode('+', 'add', [shim.parse('x'), new shim.math.ParenthesisNode(shim.parse('1'))]);
  assert.equal(node.toString(), 'x + (1)');
});

// What the client sends mathjs: student answers, authored expressions and the
// tools' own rewrites — fractions, signs, implicit products, powers,
// functions, relations, assignments and malformed input.
const CORPUS = [
  '1/2 + 1/3', '-3/4', '2/-3', '3/4x', '1/2 x', '(-2)^3', '-2^2', '3 - -2', '0.1 + 0.2', '1e-7 * 3',
  '2x + 3x', '3(x + 2)', '-(x - 4)', 'x/2 + x/3', '2x/4', 'a*b - b*a', 'x y', '2 pi r', '2(x+1)(x-1)',
  'x^2 - 5x + 6', '(x - 2)(x - 3)', '(4x^2 - 9)/(2x + 3)', '2^(x+1)', '3x^2 + 2x + 1', 'x^3 - 3x',
  'sqrt(16)', 'sqrt(-4)', 'abs(-3)', 'round(2.567, 2)', 'gcd(12, 18)', 'lcm(4, 6)', '5!', '7 mod 3',
  'log(100, 10)', 'log(e)', 'sin(pi/6)', 'e^2', 'pi', '1/0', '0/0', 'fraction(3, 4) + fraction(1, 4)',
  'y = 2x + 1', 'f(x) = x^2', 'x < 3', '2x + 1 >= 7', '2x+3<7', '[1, 2] + [3, 4]', '2 inch to cm',
  '2 +', '(()', 'x +* 2', 'undefinedFunction(2)', '−3', '',
];

const outcome = (instance, run) => {
  try {
    const value = run(instance);
    return { value: typeof value === 'string' ? value : instance.format(value, { precision: 14 }) };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
};

const VIEWS = {
  'parse → toString': (m, e) => m.parse(e).toString(),
  'parse → toString (as the tools print)': (m, e) => m.parse(e).toString({ parenthesis: 'auto', implicit: 'hide' }),
  'parse → toTex': (m, e) => m.parse(e).toTex(),
  evaluate: (m, e) => m.evaluate(e),
  'compile → evaluate with x, y': (m, e) => m.compile(e).evaluate({ x: 2, y: -3, a: 5, b: 7, r: 1 }),
  simplify: (m, e) => m.simplify(e).toString(),
  'simplify(parse(…))': (m, e) => m.simplify(m.parse(e)).toString({ parenthesis: 'auto', implicit: 'hide' }),
  'derivative in x': (m, e) => m.derivative(e, 'x').toString(),
};

for (const [view, run] of Object.entries(VIEWS)) {
  test(`answers as mathjs's default instance: ${view}`, () => {
    for (const expression of CORPUS) {
      // The client's forwarders against the default instance's own functions.
      const client = outcome(shim.math, () => run({ ...shim, format: shim.math.format, math: shim.math }, expression));
      const expected = outcome(defaultMath, (m) => run(m, expression));
      assert.deepEqual(client, expected, `${view} of ${JSON.stringify(expression)}`);
    }
  });
}

test('answers as mathjs\'s default instance: exact fractions', () => {
  const inputs = [[1, 3], [6, 8], [-3, 4], [3, -4], [0, 5], [10, 4], [1, 0], ['1/3'], ['6/8'], ['3/-4'], ['-0.75'], [0.75], ['x']];
  for (const args of inputs) {
    const client = outcome(shim.math, () => shim.fraction(...args).toFraction());
    const expected = outcome(defaultMath, (m) => m.fraction(...args).toFraction());
    assert.deepEqual(client, expected, `fraction(${args.map((arg) => JSON.stringify(arg)).join(', ')})`);
  }
});
