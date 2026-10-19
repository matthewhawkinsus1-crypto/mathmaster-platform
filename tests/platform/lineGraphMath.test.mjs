import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import {
  LineGraphMathError,
  containsPoint,
  describeLine,
  horizontalLine,
  latticePointsInView,
  lineFromCoefficients,
  lineFromPointSlope,
  lineFromSlopeIntercept,
  lineThroughPoints,
  parallelLines,
  sameLine,
  slopeOf,
  verticalLine,
  xInterceptOf,
  yInterceptOf,
} from '../../functions/shared/lineGraphMath.mjs';
import {
  BUILD_PROBLEM,
  NUMBER_STYLE,
  POINT_SLOPE_LAYOUT,
  SLOPE_INTERCEPT_ORDER,
  buildPreview,
  lineFromBuildFields,
  parseLineNumber,
  pointSlopeTokens,
  presentEquation,
  slopeInterceptTokens,
  specialTokens,
  standardTokens,
  terminatingDecimal,
} from '../../functions/shared/lineGraphForms.mjs';
import { createRng } from '../../functions/shared/seededRandom.mjs';
import { lineOfText } from './helpers/lineEquationOracle.mjs';

/*
 * EXACT LINES. Every grade in Graph the Line is a comparison of two integer
 * triples, so the triple must be canonical: one line, one triple, however it
 * was built.
 */

const rng = createRng('line-math-tests');
const randomPoint = (limit = 9) => ({ x: rng.int(-limit, limit), y: rng.int(-limit, limit) });

test('a line has exactly one triple, whichever two of its points built it', () => {
  for (let trial = 0; trial < 400; trial += 1) {
    const first = randomPoint();
    let second = randomPoint();
    while (second.x === first.x && second.y === first.y) second = randomPoint();
    const line = lineThroughPoints(first, second);
    const view = { xMin: -30, xMax: 30, yMin: -30, yMax: 30 };
    const points = latticePointsInView(line, view);
    assert.ok(points.length >= 2, 'the two building points are grid points of the line');
    // Every pair of its grid points rebuilds the identical triple.
    for (let index = 0; index + 1 < points.length; index += 3) {
      assert.deepEqual(lineThroughPoints(points[index], points[index + 1]), line);
      assert.deepEqual(lineThroughPoints(points[index + 1], points[index]), line);
    }
    // Canonical: reduced, and the first non-zero of (a, b) positive.
    const divisor = [line.a, line.b, line.c].reduce((acc, value) => {
      let [p, q] = [Math.abs(acc), Math.abs(value)];
      while (q) [p, q] = [q, p % q];
      return p;
    }, 0);
    assert.equal(divisor, 1);
    assert.ok(line.a > 0 || (line.a === 0 && line.b > 0));
  }
});

test('every way of writing a line builds the same triple', () => {
  const line = lineFromSlopeIntercept(Q.rat(2, 3), -1);
  assert.deepEqual(lineFromPointSlope({ x: 3, y: 1 }, Q.rat(2, 3)), line);
  assert.deepEqual(lineFromCoefficients(2, -3, 3), line);
  assert.deepEqual(lineFromCoefficients(-4, 6, -6), line);
  assert.deepEqual(lineFromCoefficients(Q.rat(2, 3), -1, 1), line);
  assert.deepEqual(lineThroughPoints({ x: 0, y: -1 }, { x: 3, y: 1 }), line);
  assert.deepEqual(line, { a: 2, b: -3, c: 3 });
});

test('slope and intercepts are read back exactly; vertical and horizontal lines are ordinary lines', () => {
  const line = lineFromCoefficients(2, 3, 9);
  assert.deepEqual(slopeOf(line), Q.rat(-2, 3));
  assert.deepEqual(yInterceptOf(line), Q.rat(3));
  assert.deepEqual(xInterceptOf(line), Q.rat(9, 2));

  const vertical = verticalLine(-3);
  assert.equal(slopeOf(vertical), null);
  assert.equal(yInterceptOf(vertical), null);
  assert.deepEqual(xInterceptOf(vertical), Q.rat(-3));
  assert.equal(describeLine(vertical).vertical, true);

  const horizontal = horizontalLine(4);
  assert.deepEqual(slopeOf(horizontal), Q.rat(0));
  assert.equal(xInterceptOf(horizontal), null);
  assert.deepEqual(yInterceptOf(horizontal), Q.rat(4));
  assert.equal(describeLine(horizontal).horizontal, true);

  assert.ok(parallelLines(lineFromSlopeIntercept(2, 1), lineFromSlopeIntercept(2, -5)));
  assert.ok(!parallelLines(lineFromSlopeIntercept(2, 1), lineFromSlopeIntercept(2, 1)), 'a line is not parallel to itself');
  assert.ok(parallelLines(verticalLine(1), verticalLine(2)));
});

test('the same point twice is no line, and no x or y term is no line', () => {
  assert.equal(lineThroughPoints({ x: 2, y: 2 }, { x: 2, y: 2 }), null);
  assert.throws(() => lineFromCoefficients(0, 0, 5), LineGraphMathError);
});

test('grid points of a line in a view are exactly the grid points that lie on it', () => {
  const view = { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };
  const lines = [
    lineFromSlopeIntercept(Q.rat(2, 3), -1),
    lineFromSlopeIntercept(Q.rat(1, 2), Q.rat(3, 2)),
    lineFromCoefficients(2, 3, 9),
    verticalLine(5),
    horizontalLine(-7),
    lineFromSlopeIntercept(5, 9),
  ];
  for (const line of lines) {
    for (const inset of [0, 1]) {
      const brute = [];
      for (let x = view.xMin + inset; x <= view.xMax - inset; x += 1) {
        for (let y = view.yMin + inset; y <= view.yMax - inset; y += 1) {
          if (containsPoint(line, { x, y })) brute.push(`${x},${y}`);
        }
      }
      const listed = latticePointsInView(line, view, { inset }).map((point) => `${point.x},${point.y}`);
      assert.deepEqual([...listed].sort(), [...brute].sort());
    }
  }
});

/*
 * HOW AN EQUATION IS WRITTEN. The text a student reads is checked two ways:
 * against the exact strings a teacher would write, and — for every shape —
 * by an oracle that evaluates the text as arithmetic (no code from the forms
 * module) and recovers the line it describes.
 */

const cases = [
  { tokens: slopeInterceptTokens({ m: 2, b: -3 }), text: 'y = 2x − 3', latex: 'y = 2x - 3', speech: 'y equals 2 x minus 3', line: lineFromSlopeIntercept(2, -3) },
  { tokens: slopeInterceptTokens({ m: -1, b: 4 }), text: 'y = −x + 4', latex: 'y = -x + 4', speech: 'y equals negative x plus 4', line: lineFromSlopeIntercept(-1, 4) },
  { tokens: slopeInterceptTokens({ m: Q.rat(2, 3), b: -1 }), text: 'y = (2/3)x − 1', latex: 'y = \\frac{2}{3}x - 1', speech: 'y equals 2 thirds x minus 1', line: lineFromSlopeIntercept(Q.rat(2, 3), -1) },
  { tokens: slopeInterceptTokens({ m: Q.rat(-3, 4), b: 0 }), text: 'y = −(3/4)x', latex: 'y = -\\frac{3}{4}x', speech: 'y equals negative 3 fourths x', line: lineFromSlopeIntercept(Q.rat(-3, 4), 0) },
  { tokens: slopeInterceptTokens({ m: -2, b: 4, order: SLOPE_INTERCEPT_ORDER.CONSTANT_FIRST }), text: 'y = 4 − 2x', latex: 'y = 4 - 2x', speech: 'y equals 4 minus 2 x', line: lineFromSlopeIntercept(-2, 4) },
  { tokens: slopeInterceptTokens({ m: Q.rat(1, 2), b: -2, style: NUMBER_STYLE.DECIMAL }), text: 'y = 0.5x − 2', latex: 'y = 0.5x - 2', speech: 'y equals 0.5 x minus 2', line: lineFromSlopeIntercept(Q.rat(1, 2), -2) },
  { tokens: slopeInterceptTokens({ m: Q.rat(1, 2), b: Q.rat(3, 2) }), text: 'y = (1/2)x + 3/2', latex: 'y = \\frac{1}{2}x + \\frac{3}{2}', speech: 'y equals 1 half x plus 3 halves', line: lineFromSlopeIntercept(Q.rat(1, 2), Q.rat(3, 2)) },
  { tokens: standardTokens({ A: 2, B: 3, C: 6 }), text: '2x + 3y = 6', latex: '2x + 3y = 6', speech: '2 x plus 3 y equals 6', line: lineFromCoefficients(2, 3, 6) },
  { tokens: standardTokens({ A: 4, B: -6, C: -12 }), text: '4x − 6y = −12', latex: '4x - 6y = -12', speech: '4 x minus 6 y equals negative 12', line: lineFromCoefficients(2, -3, -6) },
  { tokens: standardTokens({ A: 1, B: -1, C: 3 }), text: 'x − y = 3', latex: 'x - y = 3', speech: 'x minus y equals 3', line: lineFromCoefficients(1, -1, 3) },
  { tokens: standardTokens({ A: 3, B: -2, C: 0 }), text: '3x − 2y = 0', latex: '3x - 2y = 0', speech: '3 x minus 2 y equals 0', line: lineFromCoefficients(3, -2, 0) },
  { tokens: standardTokens({ A: 0, B: 2, C: -6 }), text: '2y = −6', latex: '2y = -6', speech: '2 y equals negative 6', line: horizontalLine(-3) },
  { tokens: pointSlopeTokens({ x1: 4, y1: -3, m: -2 }), text: 'y + 3 = −2(x − 4)', latex: 'y + 3 = -2(x - 4)', speech: 'y plus 3 equals negative 2 times the quantity x minus 4', line: lineFromPointSlope({ x: 4, y: -3 }, -2) },
  { tokens: pointSlopeTokens({ x1: -2, y1: 1, m: Q.rat(2, 3) }), text: 'y − 1 = (2/3)(x + 2)', latex: 'y - 1 = \\frac{2}{3}(x + 2)', speech: 'y minus 1 equals 2 thirds times the quantity x plus 2', line: lineFromPointSlope({ x: -2, y: 1 }, Q.rat(2, 3)) },
  { tokens: pointSlopeTokens({ x1: 1, y1: -4, m: -1 }), text: 'y + 4 = −(x − 1)', latex: 'y + 4 = -(x - 1)', speech: 'y plus 4 equals negative 1 times the quantity x minus 1', line: lineFromPointSlope({ x: 1, y: -4 }, -1) },
  { tokens: pointSlopeTokens({ x1: 3, y1: 0, m: 2 }), text: 'y = 2(x − 3)', latex: 'y = 2(x - 3)', speech: 'y equals 2 times the quantity x minus 3', line: lineFromPointSlope({ x: 3, y: 0 }, 2) },
  { tokens: pointSlopeTokens({ x1: 0, y1: 4, m: 3 }), text: 'y − 4 = 3x', latex: 'y - 4 = 3x', speech: 'y minus 4 equals 3 x', line: lineFromPointSlope({ x: 0, y: 4 }, 3) },
  { tokens: pointSlopeTokens({ x1: -1, y1: -3, m: 2, layout: POINT_SLOPE_LAYOUT.SOLVED_FOR_Y }), text: 'y = 2(x + 1) − 3', latex: 'y = 2(x + 1) - 3', speech: 'y equals 2 times the quantity x plus 1, minus 3', line: lineFromPointSlope({ x: -1, y: -3 }, 2) },
  { tokens: specialTokens({ axis: 'y', value: -2 }), text: 'y = −2', latex: 'y = -2', speech: 'y equals negative 2', line: horizontalLine(-2) },
  { tokens: specialTokens({ axis: 'x', value: 5 }), text: 'x = 5', latex: 'x = 5', speech: 'x equals 5', line: verticalLine(5) },
];

test('equations are written the way a teacher writes them, on every surface', () => {
  for (const entry of cases) {
    const written = presentEquation(entry.tokens);
    assert.equal(written.text, entry.text);
    assert.equal(written.latex, entry.latex);
    assert.equal(written.speech, entry.speech);
  }
});

test('the written text describes the line that is graded (independent oracle)', () => {
  for (const entry of cases) {
    const written = presentEquation(entry.tokens);
    assert.ok(sameLine(lineOfText(written.text), entry.line), `${written.text} is not the graded line`);
  }
  // And the oracle itself can fail: a sign slip is a different line.
  assert.ok(!sameLine(lineOfText('y + 3 = −2(x + 4)'), lineFromPointSlope({ x: 4, y: -3 }, -2)));
});

test('terminating decimals are written exactly; others are not decimals', () => {
  assert.equal(terminatingDecimal(Q.rat(5, 2)), '2.5');
  assert.equal(terminatingDecimal(Q.rat(-3, 4)), '-0.75');
  assert.equal(terminatingDecimal(Q.rat(1, 20)), '0.05');
  assert.equal(terminatingDecimal(Q.rat(7)), '7');
  assert.equal(terminatingDecimal(Q.rat(1, 3)), null);
});

/*
 * READING A TYPED ANSWER. Students type whole numbers, fractions and
 * terminating decimals, with either minus sign; anything else is unreadable,
 * never guessed at.
 */

test('a typed number is read exactly, or not at all', () => {
  const read = (text) => {
    const value = parseLineNumber(text);
    return value ? Q.format(value) : null;
  };
  assert.equal(read('3'), '3');
  assert.equal(read(' -3 '), '-3');
  assert.equal(read('−3'), '-3');
  assert.equal(read('+4'), '4');
  assert.equal(read('2/3'), '2/3');
  assert.equal(read('-2/3'), '-2/3');
  assert.equal(read('2/-3'), '-2/3');
  assert.equal(read('4/6'), '2/3');
  assert.equal(read('0.5'), '1/2');
  assert.equal(read('.25'), '1/4');
  assert.equal(read('-1.5'), '-3/2');
  assert.equal(read('(-3)'), '-3');
  assert.equal(read('0'), '0');
  // Spaces beside a sign, slash or bracket are fine; between digits they are
  // not — "1 1/2" read as 11/2 would grade a mixed number as eleven halves.
  assert.equal(read('- 3'), '-3');
  assert.equal(read('2 / 3'), '2/3');
  for (const bad of ['', ' ', '2/0', '1/2/3', 'abc', '5.', '2x', '--3', '1 1/2', '1 2', '9999999', '0.12345']) {
    assert.equal(read(bad), null, `"${bad}" must not be read`);
  }
});

test('the boxes of a form build its line, and say what to fix when they cannot', () => {
  assert.ok(sameLine(lineFromBuildFields('slopeIntercept', { m: '2/3', b: '-1' }).line, lineFromSlopeIntercept(Q.rat(2, 3), -1)));
  assert.ok(sameLine(lineFromBuildFields('slopeIntercept', { m: '0.5', b: '−2' }).line, lineFromSlopeIntercept(Q.rat(1, 2), -2)));
  assert.ok(sameLine(lineFromBuildFields('pointSlope', { x1: '4', y1: '-3', m: '-2' }).line, lineFromPointSlope({ x: 4, y: -3 }, -2)));
  assert.ok(sameLine(lineFromBuildFields('standard', { A: '4', B: '-6', C: '-12' }).line, lineFromCoefficients(2, -3, -6)));

  assert.deepEqual(lineFromBuildFields('slopeIntercept', { m: '2', b: '' }), { problem: BUILD_PROBLEM.UNREADABLE, field: 'b' });
  assert.deepEqual(lineFromBuildFields('standard', { A: '1/2', B: '3', C: '6' }), { problem: BUILD_PROBLEM.WHOLE_NUMBERS, field: 'A' });
  assert.deepEqual(lineFromBuildFields('standard', { A: '0', B: '0', C: '6' }), { problem: BUILD_PROBLEM.NOT_A_LINE, field: 'A' });
  assert.deepEqual(lineFromBuildFields('nonsense', {}), { problem: BUILD_PROBLEM.UNREADABLE, field: null });
});

test('the preview writes what was typed the conventional way', () => {
  assert.equal(buildPreview('slopeIntercept', { m: '2', b: '-3' }).text, 'y = 2x − 3');
  assert.equal(buildPreview('pointSlope', { y1: '-3', m: '2', x1: '1' }).text, 'y + 3 = 2(x − 1)');
  assert.equal(buildPreview('standard', { A: '2', B: '-3', C: '6' }).text, '2x − 3y = 6');
  assert.equal(buildPreview('slopeIntercept', { m: '0', b: '4' }).text, 'y = 4');
  assert.equal(buildPreview('slopeIntercept', { m: '2', b: '' }), null);
  assert.equal(buildPreview('standard', { A: '0', B: '0', C: '1' }), null);
});
