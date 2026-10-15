import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { sameCommutativeModelEquation, sameIntervalNotation, sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

/*
 * JOB P, ITEMS 2 AND 5 — right answers the shared equivalence layer marked
 * wrong.
 *
 * Every case is graded three ways, the ways a student is graded:
 *   - My Math Path: mathPath.gradePathToolResponse on a field-graded item,
 *     with the Path's own tolerance (0 unless the item sets one);
 *   - assignments: answerUtils.matchesFieldAnswer;
 *   - sameValue itself.
 * Each acceptance has near misses beside it that must stay wrong.
 *
 * scripts/sweep-equivalence-verdicts.mjs runs the same graders, old code
 * against new, over every key in every bank (see the Job P handoff).
 */

const pathVerdict = async (key, response, extra = {}) => {
  const result = await mathPath.gradePathToolResponse(
    { fields: [{ id: 'answer', expected: key, ...extra }] },
    { responses: { answer: response } },
  );
  return result.fieldResults[0].isCorrect;
};

const gradedEveryWay = async (key, response, extra = {}) => ({
  path: await pathVerdict(key, response, extra),
  assignment: matchesFieldAnswer(response, { answer: key }),
  sameValue: sameValue(response, key),
});

const accepts = async (key, response) => {
  assert.deepEqual(await gradedEveryWay(key, response), { path: true, assignment: true, sameValue: true }, `${JSON.stringify(response)} for ${JSON.stringify(key)}`);
};
const rejects = async (key, response) => {
  assert.deepEqual(await gradedEveryWay(key, response), { path: false, assignment: false, sameValue: false }, `${JSON.stringify(response)} must stay wrong for ${JSON.stringify(key)}`);
};

test('item 2: interval notation with fraction endpoints, typed exactly as the key or as the keypad sends it', async () => {
  for (const [key, response] of [
    ['(1/2, 3]', '(1/2, 3]'],
    ['(1/2, 3]', '\\left(\\frac{1}{2},3\\right]'],
    ['[-3/4, \\infty)', '[-0.75,∞)'],
    ['(-inf, -2/3) U (5/2, inf)', '(-∞,-\\frac{2}{3})\\cup(\\frac{5}{2},\\infty)'],
    // The keypad puts the sign inside the fraction (Codex review of #484).
    ['(-1/2, 3]', '(\\frac{-1}{2},3]'],
    ['(-1/2, 3]', '(\\frac{1}{-2},3]'],
  ]) {
    assert.equal(sameIntervalNotation(response, key, 0), true, `${response} for ${key}`);
    assert.equal(await pathVerdict(key, response, { equivalence: 'interval' }), true, `Path: ${response} for ${key}`);
  }
  for (const [key, response] of [
    ['(1/2, 3]', '[1/2, 3]'],
    ['(1/2, 3]', '(1/3, 3]'],
    ['(1/3, 3]', '(0.3333, 3]'], // the Path's tolerance is 0: a rounded third is not a third
    ['(1/2, 3]', '(1/2, 3)'],
    ['(1/2, 3]', '(1/0, 3]'],
    ['(1/2, 3]', '(\\frac{-1}{2},3]'],
    ['(-1/2, 3]', '(\\frac{-1}{0},3]'],
  ]) {
    assert.equal(await pathVerdict(key, response, { equivalence: 'interval' }), false, `Path: ${response} must stay wrong for ${key}`);
  }
});

test('item 5: keypad radicals, exponent braces, absolute value bars, pi', async () => {
  await accepts('2sqrt(3)', '2\\sqrt{3}');
  await accepts('2sqrt(3)', '2\\sqrt3');
  await accepts('2sqrt(3)', '2√3');
  await accepts('5(4)^(n-1)', '5(4)^{n-1}');
  await accepts('|x-3|', 'abs(x-3)');
  await accepts('y=|x-3|+2', 'y=abs(x-3)+2');
  await accepts('|x-3|', '\\lvert x-3\\rvert');
  await accepts('2pi', '2\\pi');
  await accepts('2π', '2\\pi');
  await accepts('A=pi r^2', 'A=\\pi r^{2}');
  await rejects('2sqrt(3)', '3\\sqrt{2}');
  await rejects('2sqrt(3)', '2\\sqrt{3}+1');
  await rejects('5(4)^(n-1)', '5(4)^{n+1}');
  await rejects('5(4)^(n-1)', '5(4)^n-1');
  await rejects('|x-3|', 'abs(x+3)');
  await rejects('|x-3|', 'x-3');
  await rejects('2pi', '2\\pi r');
  await rejects('2pi', '\\pi');
  // `pi` inside a word is not the constant.
  await rejects('2pi', '2spin');
});

test('item 5: an ordered pair is compared coordinate by coordinate', async () => {
  await accepts('(0.5,3)', '(1/2,3)');
  await accepts('(1/2,3)', '(0.5, 3)');
  await accepts('(-2/3,1)', '\\left(-\\frac{2}{3},1\\right)');
  await rejects('(0.5,3)', '(3,1/2)');
  await rejects('(0.5,3)', '(1/2,-3)');
  await rejects('(0.5,3)', '[1/2,3]');
  await rejects('(0.5,3)', '(1/2,3,0)');
  // The Path's tolerance is 0: a rounded third is not a third.
  assert.equal(await pathVerdict('(1/3,2)', '(0.333,2)'), false);
});

test('item 5: a number box answered with %, $ or "x ="', async () => {
  await accepts('25', '25%');
  await accepts('25', '25\\%');
  await accepts('25%', '25');
  await accepts('12.5', '$12.50');
  await accepts('12.5', '\\$12.50');
  await accepts('5', 'x=5');
  await accepts('-3/4', 'x=-\\frac{3}{4}');
  await rejects('25', '2.5%');
  await rejects('0.25', '25%'); // a percent sign is not read as "divide by 100"
  await rejects('12.5', '$1250');
  await rejects('12.5', '12.50$');
  await rejects('5', 'x=6');
  await rejects('5', 'x+1=6'); // only a one-letter name on the left
  await rejects('5', 'xy=5');
  await rejects('5', '5=x+0'); // a key that is a number is not read as an equation
  // The other way round stays as it was: a key that IS an equation.
  assert.equal(sameValue('5', 'x=5'), false);
});

test('item 5: the same equation with its sides swapped, and vertex form with the constant first', async () => {
  await accepts('x=5', '5=x');
  await accepts('y=2x+1', '2x+1=y');
  await accepts('y=2(x-4)^2-3', 'y=-3+2(x-4)^2');
  await accepts('f(x)=-(x+1)^2+5', 'f(x)=5-(x+1)^2');
  await accepts('y=2(x-4)^2-3', '-3+2(x-4)^2=y');
  await rejects('x=5', '5=-x');
  await rejects('y=2x+1', '2x+1=x');
  await rejects('y=2(x-4)^2-3', 'y=3+2(x-4)^2');
  await rejects('y=2(x-4)^2-3', 'y=-3+2(x+4)^2');
  await rejects('f(x)=-(x+1)^2+5', 'f(x)=5+(x+1)^2');
  // Reordering whole terms keeps each term's form: standard form is still
  // not vertex form.
  await rejects('y=2(x-4)^2-3', 'y=2x^2-16x+29');
  // Only a constant term moves: reordering terms with a variable stays the
  // opt-in modelEquation comparison's job.
  assert.equal(sameValue('1/b+1/a=1/t', '1/a+1/b=1/t'), false);
  assert.equal(sameValue('y=3+x^2-2x', 'y=x^2-2x+3'), true, 'expanded polynomial, as before');
  assert.equal(sameValue('y=-3+(x-4)^2\cdot 2', 'y=2(x-4)^2-3'), false);
  // Bars group like brackets: |x+2|-3 is not |x-3|+2 reordered.
  await rejects('y=|x-3|+2', 'y=|x+2|-3');
});

test('item 5: \\land / \\lor, and chained against "and" compound inequalities', async () => {
  await accepts('x<-1 or x>2', 'x<-1\\lor x>2');
  await accepts('x<-1 or x>2', 'x>2 or x<-1');
  await accepts('-1<x<2', 'x>-1\\land x<2');
  await accepts('-1<x<2', 'x>-1 and x<2');
  await accepts('-1<x<2', '-1<x\\text{ and }x<2');
  await accepts('-1<=x<2', 'x>=-1 and x<2');
  await accepts('x>-1 and x<2', '-1<x<2');
  await rejects('-1<x<2', 'x>-1 or x<2'); // every real number
  await rejects('-1<x<2', 'x>=-1 and x<2');
  await rejects('-1<x<2', 'x>-1 and x<3');
  await rejects('x<-1 or x>2', 'x<-1\\land x>2'); // no number at all
  await rejects('x<-1 or x>2', 'x<=-1 or x>2');
  await rejects('x<-1 or x>2', 'y<-1 or y>2');
  await rejects('-1<x<2', 'x>-1 and y<2');
});

test('plain-text quotients with ambiguous precedence keep their old verdict', async () => {
  // Job K, 2d: accepted before, accepted now; x - 1/x stays wrong.
  assert.equal(sameValue('x^2-1/x^2+x', 'x^2-1/x^2+x'), true);
  assert.equal(sameValue('x-1/x', '(x-1)/x'), false);
});

// The independent verifier's counterexamples, each a wrong answer an earlier
// draft of this change let through. Each must stay wrong.
test('verifier counterexamples stay wrong', async () => {
  await rejects('5+|1-|x-2||', '|1-|x+5-2||'); // nested bars: no term may move
  await rejects('y=4+|2-|x-1||', 'y=|2-|x+4-1||');
  await rejects('$5', '5%'); // a percent is not dollars
  await rejects('25%', '$25');
  await rejects('(5,3)', '(5%,3)');
  await rejects('π', 'p i'); // p times i
  await rejects('\\pi', 'p i');
  // Plain-text quotients keep their old verdict: no term moves past a '/'.
  await rejects('x-1/x+1', '1+x-1/x');
  await rejects('x^2-1/x^2+1', '1+x^2-1/x^2');
  await rejects('y=x-1/x+1', 'y=1+x-1/x');
  // Unwrapping a negative exponent must not expose its minus to term sorting.
  assert.equal(sameCommutativeModelEquation('A=x^(-2)+y^(-1)', 'A=x^(-1)+y^(-2)'), false);
  assert.equal(sameCommutativeModelEquation('P=2^(-b)+3^(-a)', 'P=2^(-a)+3^(-b)'), false);
  // A stacked fraction is not a plain-text quotient: the constant may still move.
  await accepts('y=\\frac{1}{2}(x-4)^2-3', 'y=-3+\\frac{1}{2}(x-4)^2');
});

