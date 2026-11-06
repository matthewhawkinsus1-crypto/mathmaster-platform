// The typed spellings the equivalence sweep builds as right answers and the
// near misses it builds beside them (scripts/lib/typedAnswerSpellings.mjs,
// grader spellings 2026-11). A spelling the sweep builds as RIGHT that is
// another answer would push a grader to accept a wrong one, so each class is
// held to the mathematics: every right spelling has the key's value at every
// sampled point, and every near miss differs from it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { create, all } from 'mathjs';

import { TYPED_SPELLING_CLASSES, typedNearMissesOf, typedSpellingsOf } from '../../scripts/lib/typedAnswerSpellings.mjs';

const math = create(all, { number: 'number' });

/** A spelling as mathjs reads it, or null when it holds what it does not read. */
const forMathjs = (text) => {
  let value = String(text)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (power) => `^(${[...power].map((c) => (c === '⁻' ? '-' : '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c))).join('')})`)
    .replace(/[·×]|\\cdot|\\times/g, '*')
    .replace(/π|\\pi/g, ' pi ')
    .replace(/\\le(q)?(?![a-z])/g, '<=').replace(/\\ge(q)?(?![a-z])/g, '>=').replace(/≤/g, '<=').replace(/≥/g, '>=');
  for (let guard = 0; guard < 6; guard += 1) {
    value = value.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))').replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)').replace(/\^\{([^{}]*)\}/g, '^($1)');
  }
  value = value.replace(/\|([^|]+)\|/g, 'abs($1)').replace(/(\d)\s*([A-Za-z(])/g, '$1*$2').replace(/\)\s*([A-Za-z(\d])/g, ')*$1')
    // A letter before a bracket is a product here (x(x+3)), unless it ends a call's name.
    .replace(/(?<![A-Za-z])([A-Za-z])\s*\(/g, '$1*(')
    // …and letters side by side are a product (3yx^2), names apart.
    .replace(/[A-Za-z]{2,}/g, (run) => (/^(?:sqrt|abs|pi|log|ln|exp)$/.test(run) ? run : [...run].join('*')));
  return /[\\{}]/.test(value) ? null : value;
};
// Every letter a key holds gets a value (a name before its bracket, f(x), reads as a product on both sides alike).
const POINTS = [
  { x: 1.37, y: -0.61, r: 2.3, n: 3.1, t: 0.7, a: 1.9, b: -1.3, f: 0.8 },
  { x: -2.11, y: 0.43, r: 0.9, n: 1.7, t: 2.2, a: -0.6, b: 2.4, f: 1.6 },
];
const valueAt = (text, scope) => {
  const expression = forMathjs(text);
  if (expression === null) return null;
  const sides = expression.split(/<=|>=|=|<|>/);
  try {
    return sides.map((side) => math.evaluate(side, { ...scope }));
  } catch {
    return null;
  }
};
// The same value at every sampled point where both are real numbers (a root of
// a negative number is not compared), and at one point at least.
const sameValueEverywhere = (left, right) => {
  let compared = 0;
  const same = POINTS.every((scope) => {
    const a = valueAt(left, scope);
    const b = valueAt(right, scope);
    if (!a || !b || a.length !== b.length) return false;
    if (![...a, ...b].every((value) => typeof value === 'number' && Number.isFinite(value))) return true;
    compared += 1;
    return a.every((value, index) => Math.abs(value - b[index]) < 1e-9);
  });
  return same && compared > 0;
};
const relationOf = (text) => (String(text).match(/<=|>=|≤|≥|\\le|\\ge|=|<|>/) || [''])[0].replace(/≤|\\le/, '<=').replace(/≥|\\ge/, '>=');

const KEYS = [
  'y=2x+3', '2x-3', '(x+2)(x+3)', 'x(x+3)', '3/4', '-3/4', '5', '0.75', 'x<=5', 'x>=-2', '2\\sqrt{3}+5',
  'y=x^2-6x+1', '3x^2y', 'y=1/2x+3', '\\frac{1}{2}', 'f(x)=2(x-4)^2-3', '2*x+3', '2\\cdot x', '-2x+3',
  'x-3+y', '31/2', 'y=-3(x-2)^2+5', 'a^2+b^2', '4\\pi r^2', 'x^2+ 0x- 1=0', '6x^3\\sqrt{x}', 'y=80(1.5)^t',
];
const FREE = { inputProfile: 'expression', formAsked: false, fractionAsked: false };

test('every right spelling the sweep builds has the key\'s value, relation for relation', () => {
  let checked = 0;
  for (const key of KEYS) {
    for (const { spelling, spellingClass } of typedSpellingsOf(key, FREE)) {
      if (forMathjs(spelling) === null || forMathjs(key) === null) continue;
      checked += 1;
      assert.equal(relationOf(spelling), relationOf(key), `${spellingClass}: ${spelling} keeps ${key}'s relation`);
      assert.ok(sameValueEverywhere(spelling, key), `${spellingClass}: ${spelling} is ${key}`);
    }
  }
  assert.ok(checked > 120, `the classes were exercised (${checked} spellings)`);
});

test('every near miss the sweep builds is another answer', () => {
  let checked = 0;
  for (const key of KEYS) {
    for (const { miss, spellingClass } of typedNearMissesOf(key, FREE)) {
      if (forMathjs(miss) === null || forMathjs(key) === null) continue;
      checked += 1;
      const sameRelation = relationOf(miss) === relationOf(key);
      assert.ok(!sameRelation || !sameValueEverywhere(miss, key), `${spellingClass}: ${miss} is not ${key}`);
    }
  }
  assert.ok(checked > 20, `the near misses were exercised (${checked})`);
});

test('each class spells what a student types', () => {
  const spelled = (cls, text) => TYPED_SPELLING_CLASSES[cls](text).filter((value) => value && value !== text);
  assert.deepEqual(spelled('spaces', 'y=2x-3'), ['y = 2x - 3']);
  assert.deepEqual(spelled('spaces', 'x^-2+3'), ['x^-2 + 3'], 'a sign keeps its number');
  assert.deepEqual(spelled('leading +', '1/x^6'), ['+1/x^6']);
  assert.deepEqual(spelled('leading +', '∅'), []);
  assert.deepEqual(spelled('superscripts', 'y=x^2-x^{-1}'), ['y=x²-x⁻¹']);
  assert.deepEqual(spelled('superscripts', '10^{-3}/2'), [], 'never before a slash');
  assert.deepEqual(spelled('product signs', '2(x+1)'), ['2*(x+1)', '2·(x+1)', '2×(x+1)']);
  assert.deepEqual(spelled('product signs', 'L=10\\log_{10}(I)'), [], 'a call keeps its bracket');
  assert.deepEqual(spelled('product signs', '(-inf,1)U(8,inf)'), [], 'an interval holds no product');
  assert.deepEqual(spelled('implicit products', '2*x+(x+1)*(x-2)'), ['2x+(x+1)(x-2)']);
  assert.deepEqual(spelled('implicit products', 'p*i'), [], 'p·i is not pi');
  assert.deepEqual(spelled('redundant brackets', 'x-(2)'), ['(x-(2))']);
  assert.deepEqual(spelled('redundant brackets', 'y=2x-3'), ['y=(2x-3)', 'y=2x+(-3)']);
  assert.deepEqual(spelled('redundant brackets', 'abs(x-30)=5'), [], 'a call or a bound alone is not bracketed');
  assert.deepEqual(spelled('fractions', '-3/4'), ['-\\frac{3}{4}', '-\\dfrac{3}{4}']);
  assert.deepEqual(spelled('fractions', 'y=3/4x'), [], 'a denominator before a letter keeps its slash');
  assert.deepEqual(spelled('relation keys', 'x<=5'), ['x≤5', 'x\\le 5', 'x\\leq 5']);
  assert.deepEqual(spelled('relation keys', 'x≥-2'), ['x>=-2']);
  assert.deepEqual(spelled('reordered sums', 'y=2x-3'), ['y=-3+2x']);
  assert.deepEqual(spelled('reordered sums', 'x-1/x+1'), [], 'a plain-text quotient moves nothing (GR04)');
  assert.deepEqual(spelled('reordered products', '(x-2)(x-7)'), ['(x-7)(x-2)']);
  assert.deepEqual(spelled('reordered products', '6x^3\\sqrt{x}'), ['6\\sqrt{x}x^3']);
  assert.deepEqual(spelled('reordered products', 'x(x+3)'), [], 'a letter before its bracket stays there');
  assert.deepEqual(spelled('decimals', '3/4'), ['0.75']);
  assert.deepEqual(spelled('decimals', '1/3'), [], 'a fraction that does not end has no decimal');
  assert.deepEqual(spelled('zero terms', 'x^2+ 0x- 1=0'), ['x^2-1=0']);
  assert.deepEqual(spelled('zero terms', 'x^2+0.5x-1=0'), []);
});

test('a reordered sum or product only where nothing asks for a form, a decimal only where nothing asks for a fraction, and nothing for a choice', () => {
  const classes = (field, text) => new Set(typedSpellingsOf(text, field).map(({ spellingClass }) => spellingClass));
  assert.equal(classes(FREE, 'y=(x-2)(x+3)').has('reordered products'), true);
  assert.equal(classes({ ...FREE, formAsked: true }, 'y=(x-2)(x+3)').has('reordered products'), false);
  assert.equal(classes({ ...FREE, formAsked: true }, '2x+3').has('reordered sums'), false);
  assert.equal(classes(FREE, '3/4').has('decimals'), true);
  assert.equal(classes({ ...FREE, fractionAsked: true }, '3/4').has('decimals'), false);
  assert.equal(classes({ ...FREE, equivalence: 'modelEquation' }, '1/4+1/8=1/t').has('decimals'), false);
  assert.deepEqual(typedSpellingsOf('2x+3', { ...FREE, inputProfile: 'choice' }), []);
  assert.deepEqual(typedSpellingsOf('2x+3', { ...FREE, options: ['2x+4'] }), []);
  assert.deepEqual(typedNearMissesOf('2x-3', { ...FREE, inputProfile: 'choice' }), []);
});

test('each class has near misses of its own', () => {
  const missed = (text) => Object.fromEntries(typedNearMissesOf(text, FREE).map(({ miss, spellingClass }) => [spellingClass, miss]));
  assert.equal(missed('31/2').spaces, '3 1/2');
  assert.equal(missed('31/10').spaces, undefined, '3 1/10 is 31/10');
  assert.equal(missed('x^2+1').superscripts, 'x^3+1');
  assert.equal(missed('-2x+3')['redundant brackets'], '-(2x+3)');
  assert.equal(missed('y=-3x+ 0')['redundant brackets'], undefined, '-(3x + 0) is -3x + 0');
  assert.equal(missed('3/4').fractions, '4/3');
  assert.equal(missed('3/4').decimals, '3.4');
  assert.equal(missed('x<=5')['relation keys'], 'x>=5');
  assert.equal(missed('2x-3')['reordered sums'], '3-2x');
  assert.equal(missed('3x^2y')['reordered products'], '3xy^2');
});

test('mixed coordinates: a pair\'s improper coordinate as the mixed number a student writes, only in a pair field', () => {
  // (platform-polish-3: a pair box reads a mixed number in a coordinate.)
  const PAIR = { inputProfile: 'orderedPair' };
  const spelled = (field, text) => typedSpellingsOf(text, field).filter(({ spellingClass }) => spellingClass === 'mixed coordinates').map(({ spelling }) => spelling);
  assert.deepEqual(spelled(PAIR, '(4/3,5/3)'), ['(1 1/3, 1 2/3)', '(1\\frac{1}{3},1\\frac{2}{3})']);
  assert.deepEqual(spelled(PAIR, '(-16/3, 7/3)'), ['(-5 1/3, 2 1/3)', '(-5\\frac{1}{3},2\\frac{1}{3})'], 'the sign in front of the whole part');
  assert.deepEqual(spelled(PAIR, '(1.4,0.4)'), ['(1 2/5, 0.4)', '(1\\frac{2}{5},0.4)'], 'a decimal with a short denominator; a proper one stays');
  assert.deepEqual(spelled(PAIR, '(2,3)'), [], 'whole numbers have none');
  assert.deepEqual(spelled({ answerFormat: 'orderedPair' }, '(4/3,5/3)').length, 2, 'a lesson field declares it with answerFormat');
  assert.deepEqual(spelled({ inputProfile: 'interval' }, '(4/3,5/3)'), [], 'an interval is not a pair');
  assert.deepEqual(spelled(FREE, '(4/3,5/3)'), []);
  // Every spelling is the key's point, coordinate by coordinate.
  const value = (coordinate) => {
    const mixed = /^(-?)(\d+)(?: |\\frac\{)(\d+)(?:\/|\}\{)(\d+)\}?$/.exec(coordinate.trim());
    if (mixed) return (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]));
    const fraction = /^(-?\d+)\/(\d+)$/.exec(coordinate.trim());
    return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(coordinate);
  };
  const point = (text) => text.slice(1, -1).split(',').map(value);
  for (const key of ['(4/3,5/3)', '(-16/3, 7/3)', '(1.4,0.4)', '(-2.5,9/4)']) {
    for (const spelling of spelled(PAIR, key)) {
      point(spelling).forEach((coordinate, index) => assert.ok(Math.abs(coordinate - point(key)[index]) < 1e-12, `${spelling} is ${key}`));
    }
    // …and every near miss of the class is another point.
    for (const { miss } of typedNearMissesOf(key, PAIR).filter(({ spellingClass }) => spellingClass === 'mixed coordinates')) {
      assert.ok(point(miss).some((coordinate, index) => Math.abs(coordinate - point(key)[index]) > 1e-9), `${miss} is not ${key}`);
    }
  }
  const misses = typedNearMissesOf('(-16/3, 7/3)', PAIR).filter(({ spellingClass }) => spellingClass === 'mixed coordinates').map(({ miss }) => miss);
  assert.deepEqual(misses, ['(-16 1/3, 7/3)', '(-4 2/3, 7/3)', '(-16/3, 7 1/3)'], 'the numerator for the whole part; the sign for the whole part only');
  assert.deepEqual(typedNearMissesOf('(4/3,5/3)', { inputProfile: 'interval' }).filter(({ spellingClass }) => spellingClass === 'mixed coordinates'), []);
});
