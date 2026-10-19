import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * AN EXACT QUOTIENT ACCEPTS THE UNREDUCED FRACTION.
 *
 * When g divides f exactly the grader's key is the polynomial f ÷ g, which has
 * no denominator. The shared grader now hands the matcher the quotient's
 * excluded values, so the quotient is compared as a rational function on its
 * domain: (x² − 1)/(x − 1) is x + 1 for x ≠ 1 and is right. A pole anywhere
 * else is still an extra hole, and a different function is still wrong.
 *
 * Expected verdicts come from mathjs: the answer's value against f(x)/g(x) at
 * points off the excluded set, and its denominator's zeros against the zeros
 * of g (math.polynomialRoot) — never from the module under test.
 */

const math = create(all);
const TOOL_ID = 'functionOperationsLab';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const quotientPart = (result) => result.parts.find((part) => part.id === 'quotient');

const SAMPLE_POINTS = [-3.7, -2.2, -0.6, 0.45, 1.3, 2.9, 5.1];
const explicitProducts = (text) => text.replace(/([\dx)])\s*\(/g, '$1*(');
// Coefficients highest power first, as the lab authors them.
const polynomialText = (coefficients) => coefficients
  .map((c, index) => `(${c})*x^${coefficients.length - 1 - index}`).join(' + ');
const zerosOf = (coefficients) => math.polynomialRoot(...[...coefficients].reverse())
  .filter((root) => typeof root === 'number');

const oracle = (answer, f, g) => {
  const fNode = math.parse(polynomialText(f));
  const gNode = math.parse(polynomialText(g));
  const node = math.parse(explicitProducts(answer));
  const denominator = node.type === 'OperatorNode' && node.op === '/' ? node.args[1] : math.parse('1');
  const excluded = zerosOf(g);
  const sameValues = SAMPLE_POINTS.every((x) => {
    const want = fNode.evaluate({ x }) / gNode.evaluate({ x });
    return Math.abs(node.evaluate({ x }) - want) <= 1e-9 * Math.max(1, Math.abs(want));
  });
  const extraHole = Array.from({ length: 81 }, (_, index) => -10 + index / 4)
    .some((x) => Math.abs(denominator.evaluate({ x })) < 1e-12 && !excluded.some((zero) => Math.abs(zero - x) < 1e-9));
  return { right: sameValues && !extraHole, excluded };
};

const CASES = [
  {
    label: '(x² − 1) ÷ (x − 1)',
    f: [1, 0, -1],
    g: [1, -1],
    answers: ['(x^2-1)/(x-1)', '((x+1)(x-1))/(x-1)', '(2x^2-2)/(2x-2)', 'x+1', '(x^2-2x-3)/(x-3)', '(x^2+1)/(x-1)', '(x^2-1)/(x+1)'],
  },
  {
    label: '(x³ − 6x² + 11x − 6) ÷ (x² − 3x + 2)',
    f: [1, -6, 11, -6],
    g: [1, -3, 2],
    answers: ['(x^3-6x^2+11x-6)/(x^2-3x+2)', '(x^2-4x+3)/(x-1)', '(x^2-5x+6)/(x-2)', 'x-3', '(x^2-8x+15)/(x-5)', '(x^2-4x+4)/(x-1)', '(x^3-6x^2+11x-6)/(x^2-3x+3)'],
  },
];

test('an exact quotient: unreduced and partly reduced fractions are right, other functions and extra holes wrong', () => {
  let newlyRight = 0;
  let wrong = 0;
  for (const { label, f, g, answers } of CASES) {
    const question = { type: TOOL_ID, questionId: 'k-fol-exact', prompt: 'Find the quotient.', f: { type: 'polynomial', coefficients: f }, g: { type: 'polynomial', coefficients: g }, operations: ['quotient'] };
    for (const answer of answers) {
      const { right, excluded } = oracle(answer, f, g);
      const restrictions = excluded.join(', ');
      const result = grade(question, { responses: { quotient: answer }, restrictions });
      assert.equal(quotientPart(result).isCorrect, right, `${label}: ${answer}`);
      assert.equal(result.isCorrect, right, `${label}: ${answer} (whole verdict)`);
      if (right && answer.includes('/')) newlyRight += 1;
      if (!right) wrong += 1;
    }
  }
  // The fixture exercises both directions.
  assert.ok(newlyRight >= 5, 'unreduced fractions are covered');
  assert.ok(wrong >= 5, 'wrong answers are covered');
});

test('an exact quotient: the excluded-values part is graded as before', () => {
  const question = { type: TOOL_ID, questionId: 'k-fol-exact', prompt: 'Find the quotient.', f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'polynomial', coefficients: [1, -1] }, operations: ['quotient'] };
  const result = grade(question, { responses: { quotient: '(x^2-1)/(x-1)' }, restrictions: '' });
  assert.equal(quotientPart(result).isCorrect, true);
  assert.equal(result.parts.find((part) => part.id === 'quotient-restrictions').isCorrect, false, 'x = 1 must still be stated');
  assert.equal(result.isCorrect, false);
});

test('a quotient that does not divide exactly keeps its verdicts', () => {
  // (x² − 1)/(x² + x): poles were already allowed at g's zeros −1 and 0.
  const question = { type: TOOL_ID, questionId: 'k-fol', prompt: 'Find the quotient.', f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'polynomial', coefficients: [1, 1, 0] }, operations: ['quotient'] };
  for (const answer of ['(x-1)/x', '(x^2-1)/(x^2+x)', '((x-1)(x-5))/(x(x-5))', 'x-1/x', '(x+1)/x']) {
    const { right } = oracle(answer, [1, 0, -1], [1, 1, 0]);
    assert.equal(quotientPart(grade(question, { responses: { quotient: answer }, restrictions: '-1, 0' })).isCorrect, right, answer);
  }
});
