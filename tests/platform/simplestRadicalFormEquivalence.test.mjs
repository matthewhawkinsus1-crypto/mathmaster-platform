/*
 * "SIMPLIFY" WITH RADICALS AND RATIONAL EXPONENTS (A2.7G): THE SAME VALUE, IN
 * SIMPLEST FORM, IN THE KEY'S NOTATION.
 *
 * Every key below is an answer printed in the Operations with Radical
 * Expressions and Rational Exponents lessons. The point of the comparator is
 * the middle ground between the ordinary grader (which refused 1 + √2 for
 * √2 + 1) and the equivalence modes (which accepted the question retyped).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSimplestRadicalForm,
  parseRadicalExpression,
  sameSimplestRadicalForm as same,
} from '../../functions/shared/simplestRadicalFormEquivalence.mjs';

test('any arrangement of a simplified answer is the same answer', () => {
  assert.equal(same('5b^4a^2\\sqrt{b}', '5a^2b^4\\sqrt{b}'), true);
  assert.equal(same('\\sqrt{b}\\cdot5a^2b^4', '5a^2b^4\\sqrt{b}'), true);
  assert.equal(same('5p^6m^{10}\\sqrt[3]{p^2}', '5m^{10}p^{6}\\sqrt[3]{p^{2}}'), true);
  assert.equal(same('1+\\sqrt{2}', '\\sqrt{2}+1'), true);
  assert.equal(same('16\\sqrt{5}+46', '46+16\\sqrt{5}'), true);
  assert.equal(same('9\\sqrt{5}+6\\sqrt{3}-3\\sqrt{15}-6', '6\\sqrt{3}-6+9\\sqrt{5}-3\\sqrt{15}'), true);
  assert.equal(same('\\frac{-1+\\sqrt{3}}{2}', '\\frac{\\sqrt{3}-1}{2}'), true);
  assert.equal(same('\\frac{\\sqrt{3}}{2}-\\frac{1}{2}', '\\frac{\\sqrt{3}-1}{2}'), true);
  assert.equal(same('\\frac{-30+25\\sqrt{3}}{39}', '\\frac{25\\sqrt{3}-30}{39}'), true);
  assert.equal(same('\\frac{2}{3}\\sqrt{3}', '\\frac{2\\sqrt{3}}{3}'), true);
  assert.equal(same('\\frac{y^4}{x^4}\\sqrt{x}', '\\frac{y^{4}\\sqrt{x}}{x^{4}}'), true);
  assert.equal(same('\\frac{z^2y^2}{x^5}', '\\frac{y^{2}z^{2}}{x^{5}}'), true);
  assert.equal(same('\\frac{1+2y^{\\frac{1}{2}}+y}{y-1}', '\\frac{y+2y^{1/2}+1}{y-1}'), true);
  assert.equal(same('\\sqrt[4]{k^3}5k^5\\left|b^7\\right|', '5|b^7|k^5\\sqrt[4]{k^3}'), true);
});

test('the question retyped, or anything still needing simplification, is not the answer', () => {
  assert.equal(same('\\sqrt{25a^4b^9}', '5a^2b^4\\sqrt{b}'), false, 'the question retyped');
  assert.equal(same('5a^2b^3\\sqrt{b^3}', '5a^2b^4\\sqrt{b}'), false, 'a square left under the root');
  assert.equal(same('5a^2b^2b^2\\sqrt{b}', '5a^2b^4\\sqrt{b}'), false, 'a letter written twice');
  assert.equal(same('\\sqrt{192}', '8\\sqrt{3}'), false, 'a perfect-square factor under the root');
  assert.equal(same('3\\sqrt{45}-5\\sqrt{80}+4\\sqrt{20}', '-3\\sqrt{5}'), false);
  assert.equal(same('3\\sqrt{5}-6\\sqrt{5}', '-3\\sqrt{5}'), false, 'like radicals not combined');
  assert.equal(same('6\\sqrt{3}-6+9\\sqrt{5}-3\\sqrt{3}\\sqrt{5}', '6\\sqrt{3}-6+9\\sqrt{5}-3\\sqrt{15}'), false, '√3·√5 is √15');
  assert.equal(same('5\\cdot10a', '50a'), false, 'arithmetic left undone');
  assert.equal(same('\\frac{1}{\\sqrt{2}-1}', '\\sqrt{2}+1'), false, 'a root in the denominator');
  assert.equal(same('\\frac{2}{\\sqrt{3}}', '\\frac{2\\sqrt{3}}{3}'), false);
  assert.equal(same('\\sqrt{\\frac{y^8}{x^7}}', '\\frac{y^{4}\\sqrt{x}}{x^{4}}'), false, 'a fraction under the root');
  assert.equal(same('\\frac{4\\sqrt{3}}{6}', '\\frac{2\\sqrt{3}}{3}'), false, 'not in lowest terms');
  assert.equal(same('\\frac{2\\sqrt{3}-2}{4}', '\\frac{\\sqrt{3}-1}{2}'), false);
  assert.equal(same('\\frac{x^2\\sqrt{x}}{x^4}', '\\frac{\\sqrt{x}}{x^2}'), false, 'a letter that divides above and below');
  assert.equal(same('\\sqrt[6]{4x^4}', '\\sqrt[3]{2x^2}'), false, 'the index is not the smallest');
  assert.equal(same('\\sqrt[3]{-16}', '-2\\sqrt[3]{2}'), false, 'a cube factor (and the sign) left under the root');
  assert.equal(same('\\frac{\\frac{1}{2}}{3}', '\\frac{1}{6}'), false, 'a complex fraction');
});

test('a decimal from a calculator is not the exact answer', () => {
  assert.equal(same('-6.7082', '-3\\sqrt{5}'), false);
  assert.equal(same('4.24', '3\\sqrt{2}'), false);
  assert.equal(same('0.142857', '\\frac{1}{7}'), false);
});

test('the key\'s notation decides radicals or rational exponents', () => {
  assert.equal(same('y^{\\frac{5}{7}}', 'y^{5/7}'), true);
  assert.equal(same('\\sqrt[7]{y^5}', 'y^{5/7}'), false, 'radical form for an exponent-form key');
  assert.equal(same('5a^2b^4b^{1/2}', '5a^2b^4\\sqrt{b}'), false, 'exponent form for a radical-form key');
  assert.equal(same('\\frac{\\sqrt[3]{x}}{x}', '\\frac{x^{1/3}}{x}'), false);
  assert.equal(same('2^{\\frac{1}{3}}', '\\sqrt[3]{2}'), false);
  assert.equal(same('2^{\\frac{1}{3}}', '2^{1/3}'), true);
});

test('rational exponents: positive, reduced, each base once, none in a denominator', () => {
  assert.equal(same('\\frac{x^{\\frac{1}{3}}}{x}', '\\frac{x^{1/3}}{x}'), true);
  assert.equal(same('x^{-\\frac{2}{3}}', '\\frac{x^{1/3}}{x}'), false);
  assert.equal(same('\\frac{1}{x^{\\frac{2}{3}}}', '\\frac{x^{1/3}}{x}'), false);
  assert.equal(same('y^{\\frac{10}{14}}', 'y^{5/7}'), false);
  assert.equal(same('y^{\\frac{1}{7}}y^{\\frac{4}{7}}', 'y^{5/7}'), false);
  assert.equal(same('n^{-8}', '\\frac{1}{n^{8}}'), false);
  assert.equal(same('9a^6b^{-8}', '\\frac{9a^{6}}{b^{8}}'), false);
});

test('absolute value is checked: the key\'s barred letters are also sampled negative', () => {
  assert.equal(same('10|x|y\\sqrt{3y}', '10\\left|x\\right|y\\sqrt{3y}'), true);
  assert.equal(same('10xy\\sqrt{3y}', '10\\left|x\\right|y\\sqrt{3y}'), false);
  assert.equal(same('5b^7k^5\\sqrt[4]{k^3}', '5|b^7|k^5\\sqrt[4]{k^3}'), false);
});

test('ASCII spellings of a key: √, sqrt( ), cbrt( ), ∛, ∜ and root(n)( )', () => {
  assert.equal(same('5a^{2}b^{4}\\sqrt{b}', '5a^2b^4√b'), true);
  assert.equal(same('4ab^2\\sqrt{15a}', '4ab^2√(15a)'), true);
  assert.equal(same('\\frac{\\sqrt[3]{6x^{2}}}{3x}', 'cbrt(6x^2)/(3x)'), true);
  assert.equal(same('5m^{10}p^6\\sqrt[3]{p^2}', '5m^10p^6cbrt(p^2)'), true);
  assert.equal(same('5|b^7|k^5\\sqrt[4]{k^3}', '5|b^7|k^5∜(k^3)'), true);
  assert.equal(same('\\sqrt[7]{a}', 'root(7)(a)'), true);
  assert.equal(same('8\\sqrt{3}', '8sqrt(3)'), true);
});

test('every printed lesson answer is itself in simplest form', () => {
  [
    '5a^2b^4\\sqrt{b}', '5m^{10}p^6\\sqrt[3]{p^2}', '4x^2y^5\\sqrt{y}', '5|b^7|k^5\\sqrt[4]{k^3}',
    '\\frac{y^4\\sqrt{x}}{x^4}', '\\frac{\\sqrt[3]{6x^2}}{3x}', '\\frac{x\\sqrt{xy}}{y^4}', '\\frac{2\\sqrt[3]{9y}}{3y}',
    '50a', '24a', '-3\\sqrt{5}', '8\\sqrt{3}', '6\\sqrt{3}-6+9\\sqrt{5}-3\\sqrt{15}',
    '10\\sqrt{5}-2\\sqrt{35}+20\\sqrt{6}-4\\sqrt{42}', '\\sqrt{2}+1', '\\frac{\\sqrt{3}-1}{2}',
    '4ab^2\\sqrt{15a}', '10|x|y\\sqrt{3y}', '24-6\\sqrt{3}+4\\sqrt{2}-\\sqrt{6}', '\\frac{25\\sqrt{3}-30}{39}',
    '\\frac{2\\sqrt{3}}{3}', '46+16\\sqrt{5}', '\\frac{b^4}{ac}', '\\frac{1}{n^8}', '\\frac{9a^6}{b^8}',
    '\\frac{y^2z^2}{x^5}', 'h^8', '\\frac{4r^4}{s^6}', 'y^{5/7}', '\\frac{x^{1/3}}{x}', 'x^{3/5}', '\\frac{y^{1/4}}{y}',
    '\\sqrt[3]{2}', '\\sqrt[3]{2x^2}', '\\sqrt[3]{4x}', '1', '\\frac{y+2y^{1/2}+1}{y-1}', '\\frac{x-2x^{1/2}+1}{x-1}',
    '11h^2', '-4ay^3', '\\frac{1}{2}b^2', '|m-4|',
  ].forEach((key) => assert.equal(isSimplestRadicalForm(key), true, key));
});

test('unreadable input is refused, never guessed', () => {
  assert.equal(parseRadicalExpression('x=\\sqrt{2}'), null);
  assert.equal(parseRadicalExpression('\\log(2)'), null);
  assert.equal(same('', '8\\sqrt{3}'), false);
  assert.equal(same('8\\sqrt{3}', ''), false);
});
