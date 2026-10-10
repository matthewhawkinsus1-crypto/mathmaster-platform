// THE CALCULATOR'S EXACT FRACTION IS ALWAYS THE TRUE VALUE OF WHAT WAS TYPED.
//
// Job K audit of evaluateCalculatorExpressionExact (d4e427c). Thousands of
// seeded random expressions are built as trees, typed with the fewest
// parentheses standard precedence allows (-2^2 is -(2^2), 2^3^2 is 2^(3^2),
// a/b/c is (a/b)/c), and evaluated here with fraction.js from the tree —
// never with the module's helpers or mathjs's parser. Every fraction shown
// must be that value, reduced, sign on the numerator, never for an integer,
// and equal to the decimal beside it to the 12 digits the calculator shows.
//
// Three defects this found, each failing on the old code:
//   - a typed number a double cannot hold (100000000000000000001,
//     0.10000000000000000001) was read through the double: 1/3 and 3/10
//     were shown for values that are neither;
//   - the decimal check was absolute, so a small result the float path got
//     wrong in the 9th digit still showed a fraction it does not equal;
//   - ((1.000000001^64)^64)^4 built an exact numerator of millions of digits
//     and froze the page for over a minute.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import Fraction from 'fraction.js';
import { all, create } from 'mathjs';
import { evaluateCalculatorExpression, evaluateCalculatorExpressionExact } from '../../src/platform/policies/calculatorExpression.js';

const exactMath = create(all, { number: 'Fraction' });
const LIMIT = 1_000_000_000n;

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A typed number and its exact value, read from its digits with BigInt.
const literal = (text) => {
  const [, whole, part = '', exp = '0'] = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  const shift = Number(exp) - part.length;
  const digits = BigInt(`${whole}${part}` || '0');
  const value = shift < 0 ? new Fraction(digits, 10n ** BigInt(-shift)) : new Fraction(digits * 10n ** BigInt(shift));
  // A double that cannot hold the typed number exactly.
  return { kind: 'num', text, value, lossy: !literalFromDouble(Number(text)).equals(value) };
};
const literalFromDouble = (number) => {
  if (!Number.isFinite(number)) return new Fraction(-1);
  const text = String(number);
  const [, mantissa, exp = '0'] = /^([\d.]+)(?:e([+-]?\d+))?$/.exec(text);
  const [whole, part = ''] = mantissa.split('.');
  const shift = Number(exp) - part.length;
  const digits = BigInt(`${whole}${part}`);
  return shift < 0 ? new Fraction(digits, 10n ** BigInt(-shift)) : new Fraction(digits * 10n ** BigInt(shift));
};

const pick = (random, list) => list[Math.floor(random() * list.length)];
const integer = (random, max) => Math.floor(random() * (max + 1));

const LEAVES = [
  (r) => literal(String(integer(r, 12))),
  (r) => literal(String(integer(r, 12))),
  (r) => literal(String(integer(r, 999999))),
  (r) => literal(`${integer(r, 9)}.${integer(r, 99)}`),
  (r) => literal(pick(r, ['0.1', '0.2', '0.3', '0.7', '.5', '.25', '1.1', '2.75', '0.125', '0.001'])),
  (r) => literal(pick(r, ['2e3', '1.5e-2', '1e-3', '3E2', '2.5e+1'])),
  (r) => literal(pick(r, ['100000000000000000001', '0.10000000000000000001', '9007199254740993', '123456789012345678'])),
];

const leaf = (random) => (random() < 0.85 ? LEAVES[integer(random, 3)] : pick(random, LEAVES))(random);

const build = (random, depth) => {
  if (depth <= 0 || random() < 0.25) return leaf(random);
  const roll = random();
  if (roll < 0.12) return { kind: 'neg', arg: build(random, depth - 1) };
  if (roll < 0.24) {
    const exponent = random() < 0.9 ? integer(random, 8) - 4 : pick(random, [0, 63, 64, 65, -64, -70]);
    return { kind: 'pow', base: build(random, depth - 2), exponent: exponent < 0 ? { kind: 'neg', arg: literal(String(-exponent)) } : literal(String(exponent)) };
  }
  if (roll < 0.28) return { kind: 'fn', name: pick(random, ['sqrt', 'abs', 'sin', 'ln', 'log']), arg: build(random, depth - 1) };
  if (roll < 0.30) return { kind: 'const', name: pick(random, ['pi', 'e']) };
  if (roll < 0.32) return { kind: 'pow', base: build(random, depth - 1), exponent: { kind: 'op', op: '/', left: literal('1'), right: literal(String(2 + integer(random, 2))) } };
  return { kind: 'op', op: pick(random, ['+', '-', '*', '/']), left: build(random, depth - 1), right: build(random, depth - 1) };
};

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, pow: 4, atom: 5 };
const precedence = (node) => (node.kind === 'op' ? PRECEDENCE[node.op] : node.kind === 'neg' ? PRECEDENCE.neg : node.kind === 'pow' ? PRECEDENCE.pow : PRECEDENCE.atom);

const render = (node, random) => {
  const wrap = (child, minimum) => {
    const text = render(child, random);
    return precedence(child) < minimum || random() < 0.05 ? `(${text})` : text;
  };
  switch (node.kind) {
    case 'num': return node.text;
    case 'const': return node.name;
    case 'fn': return `${node.name}(${render(node.arg, random)})`;
    case 'neg': return `-${wrap(node.arg, PRECEDENCE.neg + 1)}`;
    case 'pow': return `${wrap(node.base, PRECEDENCE.atom)}^${wrap(node.exponent, PRECEDENCE.atom)}`;
    default: {
      const p = PRECEDENCE[node.op];
      const spaced = random() < 0.5 ? ` ${node.op} ` : node.op;
      return `${wrap(node.left, p)}${spaced}${wrap(node.right, p + 1)}`;
    }
  }
};

// { value: Fraction } | { irrational } | { undefined } — from the tree.
const evaluateTree = (node) => {
  switch (node.kind) {
    case 'num': return { value: node.value, lossy: node.lossy };
    case 'const': case 'fn': return { irrational: true };
    case 'neg': {
      const arg = evaluateTree(node.arg);
      return arg.value ? { ...arg, value: arg.value.neg() } : arg;
    }
    case 'pow': {
      const base = evaluateTree(node.base);
      const exponent = evaluateTree(node.exponent);
      if (!base.value || !exponent.value) return base.value ? exponent : base;
      if (exponent.value.d !== 1n) return { irrational: true };
      if (base.value.n === 0n && exponent.value.s < 0n) return { undefined: true };
      const power = Number(exponent.value.s * exponent.value.n);
      // Beyond the exact walk's bounds the module may decline; it may never be wrong.
      const bits = (base.value.n.toString(2).length + base.value.d.toString(2).length) * Math.abs(power);
      const huge = Math.abs(power) > 64 || bits > 4096;
      if (bits > 20000) return { irrational: true, huge: true };
      return { value: base.value.pow(power), lossy: base.lossy || exponent.lossy, huge: base.huge || exponent.huge || huge };
    }
    default: {
      const left = evaluateTree(node.left);
      const right = evaluateTree(node.right);
      if (left.undefined || right.undefined) return { undefined: true };
      if (!left.value || !right.value) return { irrational: true, huge: left.huge || right.huge };
      if (node.op === '/' && right.value.n === 0n) return { undefined: true };
      const value = node.op === '+' ? left.value.add(right.value)
        : node.op === '-' ? left.value.sub(right.value)
          : node.op === '*' ? left.value.mul(right.value) : left.value.div(right.value);
      return { value, lossy: left.lossy || right.lossy, huge: left.huge || right.huge };
    }
  }
};

const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));
const shownDecimal = (value) => Number(Number(value.n * value.s) / Number(value.d)).toPrecision(12);

const outcome = (fn) => {
  try { return { result: fn() }; } catch (error) { return { error: error.message }; }
};

// One expression checked against its independent value. Returns what was shown.
const audit = (expression, expected) => {
  const decimal = outcome(() => evaluateCalculatorExpression(expression, 'basic'));
  const exact = outcome(() => evaluateCalculatorExpressionExact(expression, 'basic'));
  if (decimal.error) {
    assert.equal(exact.error, decimal.error, `${expression}: an error on the decimal path is the exact path's error`);
    return 'error';
  }
  assert.equal(exact.error, undefined, `${expression}: ${exact.error}`);
  const { value, decimal: text, fraction } = exact.result;
  assert.equal(value, decimal.result, `${expression}: the decimal is the calculator's own`);
  assert.equal(text, String(value));
  if (fraction === null) {
    const integer = expected.value && expected.value.d === 1n;
    const tooBig = expected.value && (expected.value.n > LIMIT || expected.value.d > LIMIT);
    const differs = expected.value && Number(shownDecimal(expected.value)) !== value;
    if (expected.value && !integer && !tooBig && !differs && !expected.lossy && !expected.huge) {
      assert.fail(`${expression}: ${expected.value.toFraction()} (${value}) is a fraction the calculator should show`);
    }
    return 'none';
  }
  assert.ok(expected.value, `${expression}: ${fraction} shown for a value with no exact fraction`);
  assert.match(fraction, /^-?[1-9]\d*\/[1-9]\d*$/, `${expression}: sign on the numerator`);
  const [numerator, denominator] = fraction.split('/').map(BigInt);
  assert.ok(denominator > 1n, `${expression}: an integer has no fraction`);
  assert.equal(gcd(numerator < 0n ? -numerator : numerator, denominator), 1n, `${expression}: ${fraction} is reduced`);
  assert.equal(fraction, expected.value.toFraction(), `${expression}: the exact value of what was typed`);
  assert.equal(Number(shownDecimal(expected.value)), value, `${expression}: ${fraction} is the decimal shown, to 12 digits`);
  return 'shown';
};

test('thousands of random expressions: every fraction shown is the exact value, reduced, and the decimal beside it', () => {
  const random = mulberry32(20261010);
  const tally = { shown: 0, none: 0, error: 0 };
  for (let index = 0; index < 4000; index += 1) {
    const tree = build(random, 2 + integer(random, 3));
    const expression = render(tree, random);
    if (expression.length > 180) continue;
    tally[audit(expression, evaluateTree(tree))] += 1;
  }
  // The run is not vacuous: most cases show a fraction, and some take each other path.
  assert.ok(tally.shown > 1000, JSON.stringify(tally));
  assert.ok(tally.none > 300 && tally.error > 20, JSON.stringify(tally));
});

test('precedence and associativity are the decimal evaluator\'s', () => {
  const cases = {
    '-2^2': new Fraction(-4),
    '2^3^2': new Fraction(512),
    '2^-2^2': new Fraction(1, 16),
    '1/2/3': new Fraction(1, 6),
    '1-1/3-1/6': new Fraction(1, 2),
    '-1/3': new Fraction(-1, 3),
    '(-1/2)^3': new Fraction(-1, 8),
    '-(1/2)^2': new Fraction(-1, 4),
    '(2/3)^-2': new Fraction(9, 4),
    '0^0': new Fraction(1),
    '1/3*3': new Fraction(1),
  };
  Object.entries(cases).forEach(([expression, value]) => audit(expression, { value }));
  // Implicit multiplication follows mathjs's own reading: fraction mode is the oracle.
  ['6/2(1+2)', '2(3)/4', '1/2(3)', '(1/3)(1/4)', '2(1/3)^2'].forEach((expression) => {
    audit(expression, { value: exactMath.evaluate(expression) });
  });
});

test('a typed number the double cannot hold is never read as the double', () => {
  // 100000000000000000001/300000000000000000000 is not 1/3; the old code said it was.
  assert.equal(evaluateCalculatorExpressionExact('100000000000000000001/300000000000000000000', 'basic').fraction, null);
  assert.equal(evaluateCalculatorExpressionExact('0.10000000000000000001*3', 'basic').fraction, null);
  assert.equal(evaluateCalculatorExpressionExact('1e-400/3 + 1/3', 'basic').fraction, null);
  // An exponent form a double holds exactly still has its fraction.
  assert.equal(evaluateCalculatorExpressionExact('1e-3/3', 'basic').fraction, '1/3000');
  assert.equal(evaluateCalculatorExpressionExact('2e+3/7', 'basic').fraction, '2000/7');
});

test('no fraction beside a decimal it does not equal to the digits shown', () => {
  // The float path loses digits to cancellation; the exact 1/3000 is not 0.000333333328366.
  const result = evaluateCalculatorExpressionExact('(1/3 + 1e8 - 1e8)/1000', 'basic');
  assert.notEqual(result.value, Number((1 / 3000).toPrecision(12)));
  assert.equal(result.fraction, null);
  assert.equal(evaluateCalculatorExpressionExact('(1/7+10^6-10^6)/10^4', 'basic').fraction, null);
});

test('a huge exact intermediate is declined, not computed', () => {
  // In a child process with a deadline: the old code did not fail, it hung.
  const moduleUrl = new URL('../../src/platform/policies/calculatorExpression.js', import.meta.url).href;
  const script = `
    const { evaluateCalculatorExpressionExact } = await import(${JSON.stringify(moduleUrl)});
    const fractions = ['((1.000000001^64)^64)^4', '((((((1.000000001^64)^64)^64)^64)^64)^64)', '((0.5^64)^64)^64']
      .map((expression) => evaluateCalculatorExpressionExact(expression, 'basic').fraction);
    process.stdout.write(JSON.stringify(fractions));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.signal, null, 'the exact walk did not finish within 10 s');
  assert.equal(run.stdout, '[null,null,null]', run.stderr);
});
