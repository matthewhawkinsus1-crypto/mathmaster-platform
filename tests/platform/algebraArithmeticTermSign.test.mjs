import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';
import {
  commitArithmetic,
  detectArithmeticProducts,
  openArithmetic,
  chooseArithmeticProduct,
  setArithmeticAnswer,
} from '../../src/algebraArithmeticModel.js';

// Live QA (Practice Q2, substitution into -3x - 3y = 1): after distributing,
// the student saw -3(2x), was prompted "3 × 2 =", typed the correct -6, and
// was told "Check the sign of the product." The minus had been split off the
// term and hidden from the prompt.

const equation = { left: '-3x - 3(-7) - 3(2x)', right: '1', variable: 'x' };

const leftValueAt = (text, x) => parse(text.replace(/(\d)\s*\(/g, '$1*(').replace(/(\d)x/g, '$1*x')).evaluate({ x });
const sameLeft = (a, b) => [-2, 0, 1, 3.5].every((x) => Math.abs(leftValueAt(a, x) - leftValueAt(b, x)) < 1e-9);

const candidateFor = (pattern) => detectArithmeticProducts(equation).find((candidate) => pattern.test(candidate.productLatex));

const answer = (candidate, value) => {
  let state = openArithmetic(equation);
  state = chooseArithmeticProduct(state, equation, candidate.id);
  return commitArithmetic(equation, setArithmeticAnswer(state, value));
};

test('the prompt for -3(2x) shows the negative factor the student sees', () => {
  const candidate = candidateFor(/\\times 2$/);
  assert.ok(candidate, 'a product candidate exists for -3(2x)');
  assert.match(candidate.productLatex, /^\\left\(-3\\right\) \\times 2$/);
});

test('-3 × 2 = -6 is accepted and the equation is unchanged in value', () => {
  const result = answer(candidateFor(/\\times 2$/), '-6');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(sameLeft(result.equation.left, equation.left), result.equation.left);
  assert.match(result.equation.left.replace(/\s/g, ''), /-6\*?x/);
});

test('6 for (-3) × 2 is flagged as a sign error', () => {
  assert.deepEqual(answer(candidateFor(/\\times 2$/), '6'), { ok: false, reason: 'sign' });
});

test('-3(-7) asks for (-3) × (-7) and accepts 21', () => {
  const candidate = candidateFor(/\\left\(-7\\right\)$/);
  assert.match(candidate.productLatex, /^\\left\(-3\\right\) \\times \\left\(-7\\right\)$/);
  const result = answer(candidate, '21');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(sameLeft(result.equation.left, equation.left), result.equation.left);
});

test('a positive product term is unchanged: 3(5) asks for 3 × 5', () => {
  const positive = { left: 'x + 3(5)', right: '20', variable: 'x' };
  const [candidate] = detectArithmeticProducts(positive);
  assert.equal(candidate.productLatex, '3 \\times 5');
});
