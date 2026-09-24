import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exactMonomial,
  exactRationalFromExpression,
  gcdInteger,
  integerMonomialToExpression,
  makeRational,
  multiplyMonomials,
  primeFactorization,
  rationalToExpression,
  rationalToLatex,
  reducedNumberValue,
  signedFactorList,
} from '../../src/algebraExactRational.js';
import { parse } from 'mathjs';

test('prime factorization of a positive integer, with repeated primes', () => {
  assert.deepEqual(primeFactorization(15), { sign: 1, primes: [3, 5] });
  assert.deepEqual(primeFactorization(45), { sign: 1, primes: [3, 3, 5] });
  assert.deepEqual(primeFactorization(360), { sign: 1, primes: [2, 2, 2, 3, 3, 5] });
});

test('a negative integer keeps its sign as its own factor', () => {
  assert.deepEqual(primeFactorization(-45), { sign: -1, primes: [3, 3, 5] });
  assert.deepEqual(signedFactorList(-45), [-1, 3, 3, 5]);
  assert.deepEqual(signedFactorList(15), [3, 5]);
});

test('a prime is its own factorization', () => {
  assert.deepEqual(primeFactorization(7), { sign: 1, primes: [7] });
  assert.deepEqual(signedFactorList(97), [97]);
  assert.deepEqual(signedFactorList(-2), [-1, 2]);
});

test('1, -1 and 0 are handled without inventing factors', () => {
  assert.deepEqual(primeFactorization(1), { sign: 1, primes: [] });
  assert.deepEqual(signedFactorList(1), [1]);
  assert.deepEqual(primeFactorization(-1), { sign: -1, primes: [] });
  assert.deepEqual(signedFactorList(-1), [-1]);
  assert.deepEqual(primeFactorization(0), { sign: 0, primes: [] });
  assert.deepEqual(signedFactorList(0), [0]);
});

test('non-integers are refused, never converted through a decimal', () => {
  assert.equal(primeFactorization(2.5), null);
  assert.equal(primeFactorization(1e20), null);
  assert.equal(primeFactorization(Number.NaN), null);
  assert.equal(signedFactorList(20 / 9), null);
});

test('exact rationals are read from digits and stay fractions', () => {
  assert.deepEqual(exactRationalFromExpression('20/9'), { n: 20, d: 9 });
  assert.equal(rationalToExpression(exactRationalFromExpression('20/9')), '20/9');
  assert.equal(rationalToLatex(exactRationalFromExpression('20/9')), '\\frac{20}{9}');
  assert.deepEqual(exactRationalFromExpression('2.5'), { n: 5, d: 2 });
  assert.deepEqual(exactRationalFromExpression('6/2'), { n: 3, d: 1 });
  assert.deepEqual(exactRationalFromExpression('-(5/2)'), { n: -5, d: 2 });
  assert.deepEqual(exactRationalFromExpression('8/(-4)'), { n: -2, d: 1 });
  assert.equal(rationalToLatex(makeRational(-5, 2)), '-\\frac{5}{2}');
  assert.equal(exactRationalFromExpression('x/2'), null);
  assert.equal(exactRationalFromExpression('1/0'), null);
  // 1/3 + 1/3 + 1/3 is exactly 1, which float arithmetic cannot promise.
  assert.deepEqual(exactRationalFromExpression('1/3 + 1/3 + 1/3'), { n: 1, d: 1 });
});

test('reducedNumberValue reads the WRITTEN form: 6/2 and 10/4 are not finished', () => {
  const read = (text) => reducedNumberValue(parse(text));
  assert.deepEqual(read('3'), { n: 3, d: 1 });
  assert.deepEqual(read('-3'), { n: -3, d: 1 });
  assert.deepEqual(read('5/2'), { n: 5, d: 2 });
  assert.deepEqual(read('-5/2'), { n: -5, d: 2 });
  assert.deepEqual(read('20/9'), { n: 20, d: 9 });
  assert.equal(read('6/2'), null);
  assert.equal(read('10/4'), null);
  assert.equal(read('5/(-2)'), null);
  assert.equal(read('5/1'), null);
});

test('exact monomials: coefficient and integer powers, symbols never in a denominator', () => {
  assert.deepEqual(exactMonomial('15x'), { coefficient: { n: 15, d: 1 }, powers: { x: 1 } });
  assert.deepEqual(exactMonomial('-45'), { coefficient: { n: -45, d: 1 }, powers: {} });
  assert.deepEqual(exactMonomial('5 x / 2'), { coefficient: { n: 5, d: 2 }, powers: { x: 1 } });
  assert.deepEqual(exactMonomial('3 x^2'), { coefficient: { n: 3, d: 1 }, powers: { x: 2 } });
  assert.equal(exactMonomial('3/x'), null);
  assert.equal(exactMonomial('x + 1'), null);
  const product = multiplyMonomials(exactMonomial('15'), exactMonomial('x'));
  assert.equal(integerMonomialToExpression(product), '15 x');
  assert.equal(integerMonomialToExpression(exactMonomial('-x')), '-x');
  assert.equal(integerMonomialToExpression(exactMonomial('5x/2')), null);
  assert.equal(gcdInteger(-45, 15), 15);
});
