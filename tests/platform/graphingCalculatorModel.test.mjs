// THE GRAPHING CALCULATOR'S MATHEMATICS (src/platform/assessment/graphingCalculatorModel.js).
//
// What a student types into the secure practice test's graphing calculator is
// read as mathematics and never run as code: mathjs parses it, an allowlist
// checks the tree, and plain closures over Math.* compute it. These tests hold
// the three promises that makes — it graphs what a student means, it refuses
// everything that is not plain mathematics with a sentence they can act on,
// and nothing typed can make it do unbounded work.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANGLE_MODES, DEFAULT_VIEWPORT, ENTRY_KINDS, GRAPHING_LIMITS, evaluateAt, formatNumber, normalizeEntryText,
  panViewport, parseGraphEntries, parseGraphEntry, readNumberEntry, tableOfValues, zoomViewport,
} from '../../src/platform/assessment/graphingCalculatorModel.js';
import { executableSource } from './helpers/sourceContract.mjs';

const at = (text, xs, options) => {
  const entry = parseGraphEntry(text, options);
  assert.equal(entry.kind, ENTRY_KINDS.FUNCTION, `${text}: ${entry.error || entry.kind}`);
  return xs.map((x) => entry.evaluate(x));
};
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);

test('the ways a student writes a graph all graph, as functions of x', () => {
  assert.deepEqual(at('y = 2x + 1', [-2, 0, 3]), [-3, 1, 7]);
  assert.deepEqual(at('Y = 2X + 1', [1]), [3], 'a phone capitalising the first letter changes nothing');
  assert.deepEqual(at('x^2 - 3', [-2, 0, 2]), [1, -3, 1], 'a bare expression in x is graphed');
  assert.deepEqual(at('f(x) = x^2', [3]), [9]);
  assert.deepEqual(at('y = 3', [-5, 5]), [3, 3], 'y = a number is a horizontal line');
  assert.deepEqual(at('x(x + 1)', [2]), [6], 'x(…) is a product, as on paper');
  assert.deepEqual(at('1/2x', [4]), [2], '1/2x is (1/2)x — the platform\'s typed-fraction reading');
  assert.deepEqual(at('2x²', [3]), [18]);
  assert.deepEqual(at('|x - 2|', [0, 5]), [2, 3]);
  assert.deepEqual(at('||x| - 2|', [-1]), [1]);
  assert.deepEqual(at('√x', [9]), [3]);
  assert.deepEqual(at('y = −x + 4', [1]), [3], 'a phone\'s minus sign');
  assert.deepEqual(at('y = 2·x ÷ 4', [2]), [1]);
  close(at('y = log(x)', [100])[0], 2, 'log is base 10');
  close(at('ln(x)', [Math.E])[0], 1, 'ln is natural');
  close(at('log(x, 2)', [8])[0], 3, 'log with a base');
  close(at('e^x', [1])[0], Math.E, 'e');
  close(at('2pi x', [1])[0], 2 * Math.PI, 'pi');
});

test('x = a number is a vertical line, and a line without x is a value', () => {
  assert.deepEqual(parseGraphEntry('x = 4'), { kind: ENTRY_KINDS.VERTICAL, text: 'x = 4', x: 4 });
  assert.equal(parseGraphEntry('x = 2 + 2').x, 4);
  assert.equal(parseGraphEntry('x = 3x').kind, ENTRY_KINDS.ERROR);
  assert.deepEqual(parseGraphEntry('(3 + 4)/2'), { kind: ENTRY_KINDS.VALUE, text: '(3 + 4)/2', value: 3.5 });
  assert.equal(parseGraphEntry('2^10').value, 1024);
  assert.equal(parseGraphEntry('sqrt(2)^2').value, 2.0000000000000004);
  assert.equal(parseGraphEntry('   ').kind, ENTRY_KINDS.EMPTY);
});

test('Degrees mode converts exactly where an angle goes in or comes out', () => {
  close(parseGraphEntry('sin(30)', { angleMode: ANGLE_MODES.DEGREES }).value, 0.5, 'sin 30°');
  close(parseGraphEntry('cos(60)', { angleMode: ANGLE_MODES.DEGREES }).value, 0.5, 'cos 60°');
  close(parseGraphEntry('asin(1)', { angleMode: ANGLE_MODES.DEGREES }).value, 90, 'asin 1 in degrees');
  close(parseGraphEntry('sin(pi/6)').value, 0.5, 'radians by default');
  close(parseGraphEntry('sqrt(16)', { angleMode: ANGLE_MODES.DEGREES }).value, 4, 'non-trig functions untouched');
});

test('undefined points are gaps, never Infinity or a complex number', () => {
  const sqrt = parseGraphEntry('sqrt(x)');
  assert.equal(sqrt.evaluate(-4), null);
  assert.equal(sqrt.evaluate(4), 2);
  const reciprocal = parseGraphEntry('1/x');
  assert.equal(reciprocal.evaluate(0), null);
  assert.equal(evaluateAt(reciprocal, 2), 0.5);
  assert.equal(evaluateAt(parseGraphEntry('5'), 2), null, 'a value line has no y at x');
  assert.equal(parseGraphEntry('1/0').kind, ENTRY_KINDS.ERROR);
  assert.equal(parseGraphEntry('sqrt(-1)').kind, ENTRY_KINDS.ERROR);
  assert.equal(parseGraphEntry('asin(2)').kind, ENTRY_KINDS.ERROR);
});

test('anything that is not plain mathematics is refused, with a sentence to act on', () => {
  const refused = [
    // assignment and definitions
    'a = 5', 'y = mx + b', 'g = 2', 'x == 1',
    // mathjs's own functions and objects
    'import(1)', 'evaluate("1")', 'createUnit("foo")', 'parse("x")', 'simplify(x)', 'derivative(x^2, x)', 'compile("x")',
    'config({})', 'typed(1)', 'help(sin)',
    // structures and syntax that are not arithmetic
    '[1, 2]', '{a: 1}', 'x.y', 'x[1]', '1:3', 'x ? 1 : 2', 'x; y', '"abc"', 'true', 'null', 'x\'',
    // operators outside + − × ÷ ^
    '3!', 'x % 2', '2 mod 3', 'x & 1', 'x or 1', 'not x', 'x xor 1', '5 to cm', 'x .* 2',
    // units, unknown names, inequalities, broken lines
    '2 cm', 'sin x', 'f(2)', 'x < 3', 'y >= 2x', 'x != 1', '|x', 'y =', '= 5', '3.5.2', '1e400',
  ];
  for (const text of refused) {
    const entry = parseGraphEntry(text);
    assert.equal(entry.kind, ENTRY_KINDS.ERROR, `${text} must be refused, got ${entry.kind}`);
    assert.ok(typeof entry.error === 'string' && entry.error.length > 10 && !/undefined|TypeError|SyntaxError/.test(entry.error), `${text}: "${entry.error}" is not a sentence for a student`);
    assert.equal(entry.evaluate, undefined, `${text}: a refused line computes nothing`);
  }
  // Refused by the allowlist itself, not by an accident further down: a
  // mathjs function is named as not one of this calculator's.
  for (const text of ['import(1)', 'evaluate("1")', 'createUnit("foo")', 'simplify(x)']) {
    const entry = parseGraphEntry(text);
    assert.equal(entry.code, 'unknown-function', text);
    assert.match(entry.error, /sin, cos, tan, sqrt/);
  }
  assert.equal(parseGraphEntry('a = 5').code, 'left-side');
  assert.equal(parseGraphEntry('x % 2').code, 'unsupported-operator');
  assert.equal(parseGraphEntry('[1, 2]').code, 'unsupported');
});

test('f(x) = … labels a graph and defines nothing another line can call', () => {
  const [definition, use, other] = parseGraphEntries(['f(x) = x^2', 'f(3)', 'g(x) = f(x) + 1']);
  assert.equal(definition.kind, ENTRY_KINDS.FUNCTION);
  assert.equal(definition.label, 'f(x)');
  assert.equal(use.kind, ENTRY_KINDS.ERROR, 'no scope carries f from one line to the next');
  assert.equal(other.kind, ENTRY_KINDS.ERROR);
});

test('typing cannot make it do unbounded work', () => {
  assert.equal(parseGraphEntry('x+'.repeat(60) + 'x').code, 'too-long', 'more than 120 characters');
  const nodes = parseGraphEntry('1+'.repeat(52) + '1');
  assert.equal(nodes.kind, ENTRY_KINDS.ERROR, `${(52 * 2) + 1} chars but over ${GRAPHING_LIMITS.maxNodes} nodes`);
  assert.equal(parseGraphEntry('('.repeat(GRAPHING_LIMITS.maxDepth) + 'x' + ')'.repeat(GRAPHING_LIMITS.maxDepth)).kind, ENTRY_KINDS.FUNCTION);
  assert.equal(parseGraphEntry('('.repeat(GRAPHING_LIMITS.maxDepth + 1) + 'x' + ')'.repeat(GRAPHING_LIMITS.maxDepth + 1)).code, 'too-deep');
  assert.equal(parseGraphEntries(Array.from({ length: 20 }, () => 'x')).length, GRAPHING_LIMITS.maxEntries);
  const square = parseGraphEntry('x^2');
  assert.equal(tableOfValues(square, { rows: 10000 }).length, GRAPHING_LIMITS.maxTableRows);
  assert.deepEqual(tableOfValues(square, { step: 0 }), []);
  assert.deepEqual(tableOfValues(square, { start: 'abc' }), []);
  assert.deepEqual(tableOfValues(square, { start: 1e9 }), []);
  assert.deepEqual(tableOfValues(parseGraphEntry('7'), {}), [], 'only a graphed line has a table');
  assert.equal(GRAPHING_LIMITS.maxInputLength, 120);
});

test('the table of values steps cleanly and reports gaps', () => {
  assert.deepEqual(tableOfValues(parseGraphEntry('y = 2x + 1')), [-3, -2, -1, 0, 1, 2, 3].map((x) => ({ x, y: 2 * x + 1 })));
  assert.deepEqual(tableOfValues(parseGraphEntry('x^2'), { start: 0, step: 0.1, rows: 4 }).map((row) => row.x), [0, 0.1, 0.2, 0.3]);
  assert.deepEqual(tableOfValues(parseGraphEntry('1/x'), { start: -1, step: 1, rows: 3 }).map((row) => row.y), [-1, null, 1]);
});

test('numbers read the way a calculator shows them', () => {
  assert.equal(formatNumber(3.5), '3.5');
  assert.equal(formatNumber(-2.5), '−2.5');
  assert.equal(formatNumber(1 / 3), '0.3333333333');
  assert.equal(formatNumber(0.49999999999999994), '0.5');
  assert.equal(formatNumber(1e12), '1 × 10^12');
  assert.equal(formatNumber(-1e-7), '−1 × 10^−7');
  assert.equal(formatNumber(null), 'undefined');
  assert.equal(formatNumber(NaN), 'undefined');
  assert.equal(formatNumber(0), '0');
});

test('zoom and pan move the view and stop at the limits', () => {
  assert.deepEqual(zoomViewport(DEFAULT_VIEWPORT, 0.5), [-5, 5, 5, -5]);
  assert.deepEqual(zoomViewport(DEFAULT_VIEWPORT, 2), [-20, 20, 20, -20]);
  assert.deepEqual(panViewport(DEFAULT_VIEWPORT, 0.25, 0), [-5, 10, 15, -10]);
  assert.deepEqual(panViewport(DEFAULT_VIEWPORT, 0, -0.5), [-10, 0, 10, -20]);
  const tiny = [-0.0004, 0.0004, 0.0004, -0.0004];
  assert.deepEqual(zoomViewport(tiny, 0.5), tiny, 'no zooming in past the limit');
  const huge = [-9e5, 9e5, 9e5, -9e5];
  assert.deepEqual(zoomViewport(huge, 2), huge, 'no zooming out past the limit');
  assert.deepEqual(panViewport([9e5, 10, 9.9e5, -10], 1, 0), [9e5, 10, 9.9e5, -10], 'no panning off the plane');
  assert.deepEqual(zoomViewport(DEFAULT_VIEWPORT, -1), [...DEFAULT_VIEWPORT]);
});

test('normalization is typing only — the symbols a phone or a math keyboard makes', () => {
  assert.equal(normalizeEntryText('Y = −2X² + π'), 'y = -2x^2 + pi');
  assert.equal(normalizeEntryText('√(x+1) · 3 ÷ 2'), 'sqrt(x+1) * 3 / 2');
  assert.equal(normalizeEntryText('|x - 1| + |x|'), 'abs(x - 1) + abs(x)');
});

test('it never runs what was typed as code, and uses mathjs only to parse', () => {
  const source = readFileSync(new URL('../../src/platform/assessment/graphingCalculatorModel.js', import.meta.url), 'utf8');
  const code = executableSource(source);
  assert.doesNotMatch(code, /\beval\s*\(|new\s+Function\b|\bFunction\s*\(|setTimeout\s*\(\s*['"`]/, 'no eval, no Function constructor');
  const imports = [...code.matchAll(/^\s*import\s+[^;]+;/gm)].map((match) => match[0].trim());
  assert.deepEqual(imports, ["import { parse } from '../math/mathjs.js';"], 'the only thing taken from mathjs is its parser');
  assert.doesNotMatch(code, /\bmath\.(evaluate|compile)|\.compile\(\)|\.evaluate\(\s*\{/, 'mathjs\'s evaluator is never called');
  // The allowlist is the whole surface: every operator and function by name.
  const operators = code.match(/const OPERATORS = Object\.freeze\(\{([\s\S]*?)\}\);/)[1];
  assert.deepEqual([...operators.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]), ['add', 'subtract', 'multiply', 'divide', 'pow']);
});

test('a hostile line leaves no trace on the page', () => {
  const before = Object.keys(globalThis).sort();
  for (const text of ['import({x: 1}, {override: true})', 'createUnit("x")', 'x = 5', 'f(x) = x', 'evaluate("a = 1")']) parseGraphEntry(text);
  assert.deepEqual(Object.keys(globalThis).sort(), before);
  assert.equal(parseGraphEntry('x').evaluate(2), 2, 'x still means x');
});

test('a negative base with an odd-denominator exponent has its real root, as on a TI or Desmos', () => {
  // y = x^(1/3) is drawn on both sides of the axis, not only for x ≥ 0.
  assert.deepEqual(at('y = x^(1/3)', [-8, -1, 0, 1, 8]), [-2, -1, 0, 1, 2]);
  assert.deepEqual(at('x^(-1/3)', [-8, 8]), [-0.5, 0.5]);
  for (const [x, expected] of [[-8, 4], [8, 4]]) close(at('x^(2/3)', [x])[0], expected, `x^(2/3) at ${x} is never negative`);
  close(at('x^(5/3)', [-8])[0], -32, 'an odd numerator keeps the sign');
  assert.equal(parseGraphEntry('(-8)^(1/3)').value, -2);
  assert.equal(parseGraphEntry('(-2)^2').value, 4, 'whole powers unchanged');
  // An even root of a negative stays undefined, as everywhere.
  assert.deepEqual(at('x^(1/2)', [-4, 4]), [null, 2]);
  assert.equal(parseGraphEntry('(-2)^0.5').kind, ENTRY_KINDS.ERROR);
  assert.equal(parseGraphEntry('(-8)^(1/4)').kind, ENTRY_KINDS.ERROR);
});

test('tan is undefined at its asymptotes, in degrees and in radians — never a 16-digit number', () => {
  const tan90 = parseGraphEntry('tan(90)', { angleMode: ANGLE_MODES.DEGREES });
  assert.equal(tan90.kind, ENTRY_KINDS.ERROR);
  assert.equal(tan90.code, 'undefined');
  assert.equal(parseGraphEntry('tan(270)', { angleMode: ANGLE_MODES.DEGREES }).kind, ENTRY_KINDS.ERROR);
  assert.equal(parseGraphEntry('tan(pi/2)').kind, ENTRY_KINDS.ERROR);
  close(parseGraphEntry('tan(45)', { angleMode: ANGLE_MODES.DEGREES }).value, 1, 'tan 45°');
  close(parseGraphEntry('tan(pi/4)').value, 1, 'tan π/4');
  assert.equal(parseGraphEntry('y = tan(x)').evaluate(Math.PI / 2), null, 'a gap on the graph');
  close(parseGraphEntry('y = tan(x)').evaluate(1), Math.tan(1), 'elsewhere unchanged');
});

test('the trace and table boxes read numbers the way a line does, and an empty box is no number', () => {
  assert.equal(readNumberEntry('1/2'), 0.5);
  assert.equal(readNumberEntry('−3'), -3);
  assert.equal(readNumberEntry(' 2pi '), 2 * Math.PI);
  close(readNumberEntry('sqrt(2)'), Math.SQRT2, 'a root');
  for (const text of ['', '   ', 'x', 'y = 2', 'abc', '3,5', null, undefined]) assert.equal(readNumberEntry(text), null, JSON.stringify(text));
  const line = parseGraphEntry('y = 2x + 1');
  assert.deepEqual(tableOfValues(line, { start: null, step: 1 }), [], 'an empty start is not 0');
  assert.deepEqual(tableOfValues(line, { start: '', step: 1 }), []);
  assert.deepEqual(tableOfValues(line, { start: 0, step: null }), [], 'nor an empty step');
  assert.deepEqual(tableOfValues(line, { start: readNumberEntry('1/2'), step: readNumberEntry('1/2'), rows: 3 }).map((row) => row.y), [2, 3, 4]);
});

