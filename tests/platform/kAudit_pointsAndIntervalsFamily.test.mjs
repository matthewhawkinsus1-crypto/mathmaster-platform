/*
 * JOB K AUDIT: THE "POINTS AND INTERVALS" SUPPORT FAMILY
 * (src/platform/supports/families/pointsAndIntervals.js).
 *
 * Defects found by recomputing every hint, back-up step and worked sibling
 * with mathjs over the Path number-line templates, generated points and number
 * lines, and Step Algebra inequalities of every linear shape:
 *
 *   1. x inside brackets (9(x − 8) < −4, (x + 3)/2 > 4) was read as the expanded
 *      9x − 72: the hint said "72 is subtracted … add 72 on both sides", a
 *      number nowhere on screen, and the back-up marked "Divide both sides by
 *      9" WRONG and "Add 72" as the first move, when dividing first is the
 *      natural method.
 *   2. A key whose pieces touch at a kept end (x ≤ 2 or x > 2 graphs as the
 *      whole line) was said to have "two separate pieces", in the hints, the
 *      back-up and a sibling built the same way.
 *   3. x on both sides with a negative right coefficient read "subtract -2x
 *      from both sides".
 *   4. An inequality that is already x alone after the constants
 *      (x + 3 − 3 > 5) got a back-up about dividing, which it never needs.
 *   5. The same, with x inside brackets ((x + 3) > 5, -2(x + 1) + 3x > 4):
 *      the bracket back-up said "you divide or multiply by a positive number".
 *   6. The bracket hint said "undo what is done to the whole bracket" when x
 *      is also outside the brackets (only distributing works) or when nothing
 *      is done to the brackets at all.
 *
 * Every expected value is computed here with mathjs, never with the family.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import * as pointsAndIntervals from '../../src/platform/supports/families/pointsAndIntervals.js';

const math = create(all);

const relationOf = (source) => source.match(/<=|>=|<|>/)[0];
const sidesOf = (source) => source.split(/<=|>=|<|>/).map((side) => side.trim());
// The left side minus the right side as c1·x + c0, computed by mathjs.
const linearParts = (source) => {
  const [left, right] = sidesOf(source);
  const difference = math.compile(`(${left}) - (${right})`);
  const c0 = difference.evaluate({ x: 0 });
  return { c1: difference.evaluate({ x: 1 }) - c0, c0 };
};
const texts = (question) => {
  const backUp = pointsAndIntervals.backUpQuestion(question);
  return { hints: pointsAndIntervals.hints(question), backUp, all: [...pointsAndIntervals.hints(question), ...(backUp ? [backUp.prompt, ...backUp.options] : [])] };
};
const numberWritten = (line, value) => new RegExp(`(^|[^\\d.])${String(value).replace('.', '\\.')}(?![\\d.]*\\d)`).test(line.replace(/−/g, '-'));

test('x inside brackets: no expanded number off the screen, and no move named "first" when either order works', () => {
  const GROUPED = ['9(x - 8) < -4', '3(x + 12) > 5', '-2(x + 12) <= 20', '7(x + 13) >= 11', '(x + 3)/2 > 4', '-3(x - 4) <= 6', '2(x + 1) > x - 3'];
  for (const source of GROUPED) {
    const question = { type: 'stepAlgebra', prompt: 'Solve.', equation: source };
    assert.ok(pointsAndIntervals.matches(question), `${source}: owned`);
    const { c1 } = linearParts(source);
    // The constant the expansion of the variable side carries, e.g. 9(x - 8) -> -72.
    const [left, right] = sidesOf(source);
    const variableSide = /x/.test(left) ? left : right;
    const expandedConstant = math.evaluate(variableSide, { x: 0 });
    const onScreen = (source.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const { backUp, all: lines } = texts(question);
    if (!onScreen.includes(Math.abs(expandedConstant)) && expandedConstant !== 0) {
      lines.forEach((line) => assert.ok(!numberWritten(line, Math.abs(expandedConstant)), `${source}: "${line}" names ${Math.abs(expandedConstant)}, which is not on screen`));
    }
    if (backUp) {
      // The only back-up that is true whatever order the student works in: the symbol flips iff the x-coefficient is negative.
      assert.deepEqual([...backUp.options].sort(), ['It flips', 'It stays the same'], `${source}: ${backUp.prompt}`);
      assert.equal(backUp.correct, c1 < 0 ? 'It flips' : 'It stays the same', `${source}: coefficient ${c1}`);
    }
  }
});

test('pieces that touch at a kept end are one piece: never called separate', () => {
  const question = {
    type: 'intervalNumberLine',
    prompt: 'Graph $x ≤ 2 or x > 2$ on the number line.',
    intervals: [{ min: '-inf', max: 2, maxClosed: true }, { min: 2, max: 'inf', minClosed: false }],
    ask: ['graph', 'interval'],
  };
  // Precondition, by sampling: the union has no gap.
  const inSet = (x) => math.evaluate('x <= 2 or x > 2', { x });
  for (let x = -20; x <= 20; x += 0.25) assert.equal(inSet(x), true, `x = ${x} is in the union`);
  const { all: lines } = texts(question);
  const sibling = pointsAndIntervals.similarProblem(question, { seed: 1 });
  [...lines, ...(sibling ? [sibling.prompt, ...sibling.steps, sibling.answer] : [])]
    .forEach((line) => assert.doesNotMatch(line, /separate pieces|∪/, `"${line}"`));
});

test('gathering x-terms names the true move, with no "subtract -"', () => {
  let named = 0;
  for (const source of ['3x + 2 > -2x - 13', '4x - 1 <= -3x + 20', '-x + 6 >= -5x - 2']) {
    const question = { type: 'stepAlgebra', prompt: 'Solve.', equation: source };
    const rightCoefficient = math.evaluate(sidesOf(source)[1], { x: 1 }) - math.evaluate(sidesOf(source)[1], { x: 0 });
    assert.ok(rightCoefficient < 0, `precondition: ${source} has a negative x-term on the right`);
    const { hints } = texts(question);
    hints.forEach((hint) => assert.doesNotMatch(hint, /subtract\s+[-−]/i, `${source}: "${hint}"`));
    const gather = hints.find((hint) => /gather/i.test(hint) && /both sides\.$/.test(hint) && /\d/.test(hint.split(':').pop()));
    if (gather) {
      named += 1;
      const size = Math.abs(rightCoefficient);
      assert.match(gather, new RegExp(`add ${size === 1 ? '' : size}x to both sides`), `${source}: ${gather}`);
    }
  }
  assert.ok(named >= 2, `the numbered move is checked on real items (${named})`);
});

test('an inequality already x alone after the constants gets no back-up about dividing', () => {
  const source = 'x + 3 - 3 > 5';
  const { c1 } = linearParts(source);
  assert.equal(c1, 1, 'precondition: the coefficient of x is 1');
  const question = { type: 'stepAlgebra', prompt: 'Solve.', equation: source };
  assert.ok(pointsAndIntervals.matches(question));
  const { backUp } = texts(question);
  if (backUp) assert.doesNotMatch([backUp.prompt, ...backUp.options].join(' '), /divide|multiply/i, backUp.prompt);
});

test('x inside brackets with a coefficient of 1 gets no back-up about dividing or multiplying', () => {
  let checked = 0;
  for (const source of ['(x + 3) > 5', '(x + 3) - 2 > 5', '2 + (x - 5) < 4', '3 > (x - 4)', '-2(x + 1) + 3x > 4', '4(x - 1) - 3x <= 2']) {
    const { c1 } = linearParts(source);
    assert.equal(c1 > 0 ? c1 : -c1, 1, `precondition: ${source} has x-coefficient ±1 (${c1})`);
    if (c1 !== 1) continue;
    const question = { type: 'stepAlgebra', prompt: 'Solve.', equation: source };
    assert.ok(pointsAndIntervals.matches(question), `${source}: owned`);
    const { backUp } = texts(question);
    if (backUp) assert.doesNotMatch([backUp.prompt, ...backUp.options].join(' '), /divide|multiply/i, `${source}: ${backUp.prompt}`);
    checked += 1;
  }
  assert.ok(checked >= 5, `checked ${checked}`);
  // Control: a negated bracket does need the flip, and keeps that back-up.
  const negated = texts({ type: 'stepAlgebra', prompt: 'Solve.', equation: '-(x - 3) > 2' }).backUp;
  assert.equal(negated && negated.correct, linearParts('-(x - 3) > 2').c1 < 0 ? 'It flips' : 'It stays the same');
});

test('the bracket hint offers "undo the whole bracket" only when something is done to a bracket holding every x', () => {
  // Independent reading: x outside any bracket, or a bracket with nothing
  // multiplying, dividing or negating it.
  const stripped = (source) => source.replace(/\([^()]*\)/g, '#');
  const UNDO = /undo what is done to the whole bracket/i;
  for (const source of ['2(x + 1) + 3x > 7', '-2(x + 1) + 3x > 4', '(x + 3) > 5', '(2x) + 3 > 7', '2 + (x - 5) < 4', '3 > (x - 4)']) {
    const xOutside = /x/.test(stripped(source));
    const untouched = !/[\d)x*/^-]\s*\(/.test(source) && !/\)\s*[\d(x*/^]/.test(source);
    assert.ok(xOutside || untouched, `precondition: ${source}`);
    const { hints } = texts({ type: 'stepAlgebra', prompt: 'Solve.', equation: source });
    hints.forEach((hint) => assert.doesNotMatch(hint, UNDO, `${source}: "${hint}"`));
    assert.ok(hints.some((hint) => /bracket/i.test(hint)), `${source}: still names the brackets`);
  }
  // Control: a multiplied bracket keeps the either-order hint.
  assert.ok(texts({ type: 'stepAlgebra', prompt: 'Solve.', equation: '9(x - 8) < -4' }).hints.some((hint) => UNDO.test(hint)));
});
