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
  radicalFormMiss,
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

test('two roots in one term are one root: √2·∛2 retyped is not ⁶√32', () => {
  // Roots of different indices combine over a common index (the Rational
  // Exponents lesson), so a term with two roots still needs simplifying.
  assert.equal(same('\\sqrt{2}\\cdot\\sqrt[3]{2}', '\\sqrt[6]{32}'), false, 'the question retyped');
  assert.equal(same('\\sqrt[3]{2}\\sqrt{2}', '\\sqrt[6]{32}'), false);
  assert.equal(same('\\sqrt[4]{x^3}\\cdot\\sqrt[3]{x}', 'x\\sqrt[12]{x}'), false);
  assert.equal(same('\\sqrt{3}\\sqrt[3]{5}', '\\sqrt[6]{675}'), false);
  assert.equal(same('2^{\\frac{1}{2}}\\cdot2^{\\frac{1}{3}}', '2^{\\frac{5}{6}}'), false, 'in exponent form too');
  assert.equal(isSimplestRadicalForm('\\sqrt{2}\\sqrt[3]{2}'), false);
  assert.equal(same('\\sqrt[6]{32}', 'root(6)(32)'), true);
  assert.equal(same('x\\sqrt[12]{x}', 'x root(12)(x)'), true);
  assert.equal(same('2^{\\frac{5}{6}}', '2^{5/6}'), true);
  assert.equal(same('3\\sqrt{2}+\\sqrt[3]{2}', '\\sqrt[3]{2}+3\\sqrt{2}'), true, 'roots in different terms stay apart');
});

test('a decimal from a calculator is not the exact answer', () => {
  assert.equal(same('-6.7082', '-3\\sqrt{5}'), false);
  assert.equal(same('4.24', '3\\sqrt{2}'), false);
  assert.equal(same('0.142857', '\\frac{1}{7}'), false);
});

test('…however many digits it carries: the calculator\'s whole display is still not the answer', () => {
  // Each display agrees with its key to the last digit a computer keeps, so a
  // tolerance cannot refuse it; the notation and exact arithmetic do.
  assert.equal(same(String(-3 * Math.sqrt(5)), '-3\\sqrt{5}'), false);
  assert.equal(same(String(2 * Math.sqrt(3)), '2√3'), false);
  assert.equal(same(String(Math.sqrt(2) + 1), '\\sqrt{2}+1'), false);
  assert.equal(same(String(2 ** (2 / 3)), '2^{2/3}'), false, 'an exponent-form key');
  assert.equal(same(String(1 / 7), '\\frac{1}{7}'), false);
  assert.equal(same('0.142857142857142857142857', '1/7'), false);
  assert.equal(same(String(81 ** -0.25), '1/3'), false);
  assert.equal(same('0.9999999999999999', '1'), false);
  assert.equal(same('0.5\\sqrt{2}', '\\frac{\\sqrt{2}}{2}'), false, 'a decimal coefficient in a radical answer');
});

test('a decimal that is exactly the key\'s value is the exact answer', () => {
  assert.equal(same('0.25', '\\frac{1}{4}'), true);
  assert.equal(same('-0.2', '-\\frac{1}{5}'), true);
  assert.equal(same('0.015625', '1/64'), true);
  assert.equal(same('1.0', '1'), true);
  assert.equal(same('0.0156', '1/64'), false);
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
  // A whole and a fractional power of one letter are one power (Codex on #520).
  assert.equal(same('x\\cdot x^{\\frac{1}{12}}', 'x^{13/12}'), false);
  assert.equal(same('x^{1/12}x', 'x^{13/12}'), false, 'in either order');
  assert.equal(same('x^2x^{1/3}', 'x^{7/3}'), false);
  assert.equal(same('x^{\\frac{13}{12}}', 'x^{13/12}'), true);
  assert.equal(same('y\\cdot x^{1/3}', 'x^{1/3}y'), true, 'other letters are not the same base');
  assert.equal(same('6x\\sqrt{x}', '6x\\sqrt{x}'), true, 'a letter outside and under a root is simplest');
  assert.equal(same('n^{-8}', '\\frac{1}{n^{8}}'), false);
  assert.equal(same('9a^6b^{-8}', '\\frac{9a^{6}}{b^{8}}'), false);
});

test('absolute value is checked: the key\'s barred letters are also sampled negative', () => {
  assert.equal(same('10|x|y\\sqrt{3y}', '10\\left|x\\right|y\\sqrt{3y}'), true);
  assert.equal(same('10xy\\sqrt{3y}', '10\\left|x\\right|y\\sqrt{3y}'), false);
  assert.equal(same('5b^7k^5\\sqrt[4]{k^3}', '5|b^7|k^5\\sqrt[4]{k^3}'), false);
});

test('the bars of |m + c| are required too, however large c is (√((m + 3)²) is not m + 3)', () => {
  // m + c is positive at every small negative m, so a student who dropped
  // the bars agreed with the key wherever it was sampled.
  [1, 3, 5, 9].forEach((c) => {
    assert.equal(same(`m+${c}`, `|m+${c}|`), false, `m + ${c}`);
    assert.equal(same(`${c}+m`, `|m+${c}|`), false, `${c} + m`);
    assert.equal(same(`\\left|${c}+m\\right|`, `|m+${c}|`), true, `|${c} + m|`);
  });
  assert.equal(same('m-4', '|m-4|'), false);
  assert.equal(same('x+y', '|x+y|'), false);
  assert.equal(same('|x|^{3}', '|x^3|'), true);
  assert.equal(same('x^{2}\\left|x\\right|', '|x^3|'), true);
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

// THE FORMS THE LESSONS TEACH AS EQUAL (the owner, 2026-11-19; 2026-11-06
// re-walk of the Algebra II Honors Radicals lessons). Each was refused with
// "Equal, but not in simplest form", which none of them is.
test('a power of a root is the root of the power: (ⁿ√b)ᵐ for ⁿ√(bᵐ), and the reverse (L3 CW 5)', () => {
  // L3 PR 7, PR 3 and PR 9, as the math editor and a keyboard write them.
  assert.equal(same('\\left(\\sqrt[3]{V}\\right)^{2}', '∛(V^2)'), true);
  assert.equal(same('\\sqrt[3]{V}^{2}', '∛(V^2)'), true);
  assert.equal(same('(∛V)^2', 'root(3)(V^2)'), true);
  assert.equal(same('\\left(\\sqrt[5]{y}\\right)^{3}', 'root(5)(y^3)'), true);
  assert.equal(same('\\left(\\sqrt[6]{x}\\right)^{5}', 'root(6)(x^5)'), true);
  assert.equal(same('\\left(\\sqrt[3]{2x}\\right)^{2}', '\\sqrt[3]{4x^2}'), true, 'the number under the root is raised too');
  assert.equal(same('3\\left(\\sqrt[4]{y}\\right)^{3}', '3\\sqrt[4]{y^3}'), true);
  // A number's power under the root is the number (L3 PR 15's back-up step
  // writes 7^(2/3) as ∛(7²)), whichever side of the root the power is on.
  assert.equal(same('\\sqrt[4]{2^{3}}', 'root(4)(8)'), true);
  assert.equal(same('\\left(\\sqrt[4]{2}\\right)^{3}', 'root(4)(8)'), true);
  assert.equal(same('\\left(\\sqrt[4]{11}\\right)^{3}', 'root(4)(1331)'), true);
  assert.equal(same('\\sqrt[3]{7^2}', '∛(49)'), true);
  // The reverse: a key written as the root raised to the power.
  assert.equal(same('\\sqrt[3]{V^2}', '\\left(\\sqrt[3]{V}\\right)^{2}'), true);
  assert.equal(same('\\sqrt[4]{8}', '\\left(\\sqrt[4]{2}\\right)^{3}'), true);
  ['\\left(\\sqrt[3]{V}\\right)^{2}', '\\sqrt[4]{2^{3}}', '\\left(\\sqrt[4]{2}\\right)^{3}'].forEach((form) => assert.equal(isSimplestRadicalForm(form), true, form));
});

test('…only where it is still simplified: the power is judged under the root', () => {
  assert.equal(same('\\left(\\sqrt{x}\\right)^{3}', 'x\\sqrt{x}'), false, '√(x³) has a square to take out');
  assert.equal(same('\\left(\\sqrt[3]{4x}\\right)^{2}', '2\\sqrt[3]{2x^2}'), false, '∛(16x²) has a cube to take out');
  assert.equal(same('\\left(\\sqrt[6]{x}\\right)^{4}', '\\sqrt[3]{x^2}'), false, '⁶√(x⁴) is ∛(x²): the index is not the smallest');
  assert.equal(same('\\left(\\sqrt{2}\\right)^{2}', '2'), false);
  assert.equal(same('\\sqrt{2^{3}}', '2\\sqrt{2}'), false, '√8 has a square to take out');
  assert.equal(same('\\left(\\sqrt[3]{V}\\right)^{2}+\\sqrt[3]{V^2}', '2\\sqrt[3]{V^2}'), false, 'like radicals, however each is written');
  assert.equal(same('\\left(\\sqrt[3]{V}\\right)^{2}\\sqrt[3]{V}', 'V'), false, 'two roots in one term');
  assert.equal(same('\\left(2\\sqrt[3]{V}\\right)^{2}', '4\\sqrt[3]{V^2}'), false, 'a power of a product is still to work out');
  assert.equal(same('\\left(V^{\\frac{1}{3}}\\right)^{2}', 'V^{2/3}'), false, 'a power of a power is one power');
  assert.equal(same('\\left(\\sqrt[3]{V}\\right)^{2}', 'V^{2/3}'), false, 'the key\'s notation still decides');
  assert.equal(same('\\left(\\sqrt[3]{V}\\right)^{3}', '\\sqrt[3]{V^2}'), false, 'another value');
});

test('a unit fraction in front of a bracket is the bracket over its denominator: ½(√3 − 1) for (√3 − 1)/2 (L2 CW 11)', () => {
  const key = '(√3-1)/2';
  [
    '\\frac{1}{2}\\left(\\sqrt{3}-1\\right)', '1/2(\\sqrt{3}-1)', '\\left(\\frac{1}{2}\\right)\\left(\\sqrt{3}-1\\right)',
    '(\\sqrt{3}-1)\\cdot\\frac{1}{2}', '-\\frac{1}{2}\\left(1-\\sqrt{3}\\right)', '-\\frac{1-\\sqrt{3}}{2}', '-(1-\\sqrt{3})/2',
  ].forEach((form) => assert.equal(same(form, key), true, form));
  assert.equal(same('\\frac{1}{2}\\left(3+\\sqrt{5}\\right)', '(3+√5)/2'), true);
  assert.equal(same('\\frac{1}{39}\\left(25\\sqrt{3}-30\\right)', '(25√3-30)/39'), true);
  // The reverse: a key written with the fraction in front.
  assert.equal(same('\\frac{\\sqrt{3}-1}{2}', '\\frac{1}{2}\\left(\\sqrt{3}-1\\right)'), true);
  assert.equal(same('\\frac{\\sqrt{3}}{2}-\\frac{1}{2}', '\\frac{1}{2}\\left(\\sqrt{3}-1\\right)'), true);
  assert.equal(isSimplestRadicalForm('\\frac{1}{2}\\left(\\sqrt{3}-1\\right)'), true);
});

test('…but a whole number in front of a bracket is a product still to multiply out, and lowest terms still count', () => {
  assert.equal(same('-4(2+\\sqrt{3})', '-8-4\\sqrt{3}'), false, 'the question retyped (Radical Expressions Honors CW 6)');
  assert.equal(same('2(\\sqrt{3}-1)', '2\\sqrt{3}-2'), false);
  assert.equal(same('\\frac{7}{2}(3-\\sqrt{7})', '(21-7√7)/2'), false);
  assert.equal(same('7(3-\\sqrt{7})/2', '(21-7√7)/2'), false);
  assert.equal(same('-(1-\\sqrt{3})', '\\sqrt{3}-1'), false, 'a bracket with no fraction to stand for');
  assert.equal(same('\\frac{1}{2}(2\\sqrt{3}-2)', '\\sqrt{3}-1'), false, 'not in lowest terms');
  assert.equal(same('\\frac{1}{4}(2\\sqrt{3}-2)', '(√3-1)/2'), false, 'not in lowest terms');
  assert.equal(same('\\frac{1}{2}(\\sqrt{3}-1)/2', '(√3-1)/4'), false, 'a fraction of a fraction');
  assert.equal(same('\\frac{1}{2}\\left(\\frac{\\sqrt{3}}{2}-1\\right)', '(√3-2)/4'), false, 'a fraction inside the bracket');
  assert.equal(same('\\frac{1}{2}(\\sqrt{3}+\\sqrt{3})', '\\sqrt{3}'), false, 'like terms in the bracket');
  assert.equal(same('\\sqrt{2}(\\sqrt{3}-1)', '\\sqrt{6}-\\sqrt{2}'), false, 'a root in front is still to multiply out');
  assert.equal(same('\\frac{1}{2}(\\sqrt{3}-1)', '(√3-2)/2'), false, 'another value');
});

test('brackets that change nothing are not there: ∛((V)²)', () => {
  assert.equal(same('\\sqrt[3]{\\left(V\\right)^{2}}', 'root(3)(V^2)'), true);
  assert.equal(same('\\sqrt[3]{\\left(\\left(V\\right)^{2}\\right)}', 'root(3)(V^2)'), true);
  assert.equal(same('\\sqrt[3]{(2)(V^2)}', '∛(2V^2)'), true);
  assert.equal(same('((\\sqrt{3}-1))/2', '(√3-1)/2'), true);
  assert.equal(same('\\left(\\left(V\\right)\\right)^{\\frac{2}{3}}', 'V^{2/3}'), true);
  assert.equal(same('\\sqrt{\\left(\\left(2\\right)^{2}x\\right)}', '2\\sqrt{x}'), false, 'a square under the root, in brackets or not');
});

test('a decimal stays refused where the box compares form: w^0.5 for w^(1/2) (the decimal decision, 2026-11-19)', () => {
  assert.equal(same('w^{0.5}', 'w^{1/2}'), false);
  assert.equal(same('w^{0.5}', 'w^(1/2)'), false);
  assert.equal(same('0.5(\\sqrt{3}-1)', '(√3-1)/2'), false, 'a decimal coefficient in front of a bracket');
  assert.equal(same('\\sqrt[4]{2^{0.75}}', '\\sqrt[4]{2^{3/4}}'), false);
});

test('"not in simplest form" is said only when it is true', () => {
  // Equal, with a step of simplifying left in it.
  assert.equal(radicalFormMiss('\\sqrt{8}', '2\\sqrt{2}'), 'notSimplest');
  assert.equal(radicalFormMiss('\\left(\\sqrt{x}\\right)^{3}', 'x\\sqrt{x}'), 'notSimplest');
  assert.equal(radicalFormMiss('\\left(\\sqrt[6]{x}\\right)^{4}', '\\sqrt[3]{x^2}'), 'notSimplest');
  assert.equal(radicalFormMiss('-4(2+\\sqrt{3})', '-8-4\\sqrt{3}'), 'notSimplest');
  assert.equal(radicalFormMiss('\\frac{1}{2}(2\\sqrt{3}-2)', '\\sqrt{3}-1'), 'notSimplest');
  assert.equal(radicalFormMiss('3\\sqrt{5}-6\\sqrt{5}', '-3\\sqrt{5}'), 'notSimplest');
  assert.equal(radicalFormMiss('\\frac{2}{\\sqrt{3}}', '\\frac{2\\sqrt{3}}{3}'), 'notSimplest');
  assert.equal(radicalFormMiss('y^{\\frac{10}{14}}', 'y^{5/7}'), 'notSimplest');
  assert.equal(radicalFormMiss('\\left|\\sqrt{12x}\\right|', '2\\sqrt{3x}'), 'notSimplest', 'bars round a root this reader does not take, with a square left under it');
  // The forms the lessons teach are right: nothing to say.
  assert.equal(radicalFormMiss('\\left(\\sqrt[3]{V}\\right)^{2}', '∛(V^2)'), null);
  assert.equal(radicalFormMiss('\\sqrt[4]{2^{3}}', 'root(4)(8)'), null);
  assert.equal(radicalFormMiss('\\frac{1}{2}\\left(\\sqrt{3}-1\\right)', '(√3-1)/2'), null);
  assert.equal(radicalFormMiss('\\sqrt[3]{\\left(V\\right)^{2}}', 'root(3)(V^2)'), null);
  // Refused for another reason: never "not in simplest form".
  assert.equal(radicalFormMiss('w^{0.5}', 'w^(1/2)'), 'form', 'a decimal exponent: a form the box does not take');
  assert.equal(radicalFormMiss('0.5(\\sqrt{3}-1)', '(√3-1)/2'), 'form', 'a decimal, whose ½(√3 − 1) is right');
  assert.equal(radicalFormMiss('\\left|\\sqrt[5]{3}\\right|', '\\sqrt[5]{3}'), 'form', 'bars round a root: a form this reader does not take');
  assert.equal(radicalFormMiss('\\sqrt{3}', '2\\sqrt{2}'), null, 'a different value');
  assert.equal(radicalFormMiss('\\left(\\sqrt[3]{V}\\right)^{3}', '∛(V^2)'), null, 'a different value');
  assert.equal(radicalFormMiss('\\frac{1}{2}(\\sqrt{3}-1)', '(√3-2)/2'), null, 'a different value');
});

test('"a decimal approximation" is said only of a calculator\'s number', () => {
  assert.equal(radicalFormMiss('3.46', '2\\sqrt{3}'), 'decimal');
  assert.equal(radicalFormMiss('-6.7082', '-3\\sqrt{5}'), 'decimal');
  assert.equal(radicalFormMiss('0.5\\sqrt{2}', '\\frac{\\sqrt{2}}{2}'), 'form', '0.5√2 is exact: a decimal, not an approximation');
  assert.equal(radicalFormMiss('2^{0.5}', '\\sqrt{2}'), 'notation', '2^0.5 is exact, written as a power');
});

test('unreadable input is refused, never guessed', () => {
  assert.equal(parseRadicalExpression('x=\\sqrt{2}'), null);
  assert.equal(parseRadicalExpression('\\log(2)'), null);
  assert.equal(same('', '8\\sqrt{3}'), false);
  assert.equal(same('8\\sqrt{3}', ''), false);
});
