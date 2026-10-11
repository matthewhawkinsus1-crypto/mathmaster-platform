/*
 * K job follow-up, tool-graders lane: four grader defects the audit found,
 * each fixed at its root and checked here against mathematics recomputed
 * independently (fraction.js for lines and regression, mathjs for complex
 * arithmetic and equivalence).
 *
 *   graphing2           equivalentLine accepted a point off the target line
 *   complexPlaneLab     an operation the lab does not offer graded as multiply
 *   stepAlgebra2        rewriteLinearForm called "-(x+1)" and "x*2 - 6"
 *                       finished, so an unchanged authored equation passed
 *                       ("1x + 2" IS mx + b and stays finished, here and in
 *                       the Representation Bridge's general-form stage)
 *   regressionCalculator the correlation stage did not check the run's own
 *                       table, m or b (My Math Path's grader does)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fraction from 'fraction.js';
import { all, create } from 'mathjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { evaluateConstruction } from '../../functions/shared/toolMath/graphing2/constructionPolicy.mjs';
import { linesEquivalent, lineFromPoints, graphingTargetLine } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import {
  buildRegressionCalculatorPrivateDefinition,
  gradeRegressionCalculatorResponse,
} from '../../functions/shared/pathRegressionCalculatorGrading.mjs';

const math = create(all);
const F = (value, denominator) => (denominator === undefined ? new Fraction(value) : new Fraction(value, denominator));
const partOf = (result, id) => result.parts.find((part) => part.id === id);

/* ── graphing2: equivalentLine ─────────────────────────────────────────── */

// The target y = mx + b through two given points, exactly.
const exactLine = ([x1, y1], [x2, y2]) => {
  const m = F(y2).sub(y1).div(F(x2).sub(x1));
  return { m, b: F(y1).sub(m.mul(x1)) };
};
const offBy = (line, [x, y]) => Math.abs(F(y).sub(line.m.mul(x).add(line.b)).valueOf());
const graph = (question, points) => gradeToolWork({ toolId: 'graphing2', question: { type: 'graphing2', ...question }, work: { points } });

test('graphing2: a point one snap step off the target line is not the target line', () => {
  const given = [[-1, 6], [4, -2]];
  const question = { mode: 'throughPoints', givenPoints: given };
  const target = exactLine(...given); // y = -8/5 x + 22/5
  const plotted = [[-1, 6], [4, -1.5]];
  assert.equal(offBy(target, plotted[1]), 0.5, 'the second point is half a unit off the line');
  // Why it used to pass: the plotted line's slope and intercept are each
  // within the m/b tolerance of the target's.
  const studentLine = exactLine(...plotted);
  assert.ok(Math.abs(studentLine.m.sub(target.m).valueOf()) <= 0.12 && Math.abs(studentLine.b.sub(target.b).valueOf()) <= 0.24);
  assert.equal(linesEquivalent(lineFromPoints(...plotted), graphingTargetLine(question), 0.12), true);

  const result = graph(question, plotted);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(partOf(result, 'point-2').isCorrect, false);
  assert.equal(result.score, 0.5, 'one of the two points is on the line');
  // The Representation Bridge and the LMR board grade through the same call.
  assert.equal(evaluateConstruction(plotted, question, graphingTargetLine(question), 0.12).isCorrect, false);
});

test('graphing2: standard form 5x + 6y = −7, a near line through one off-grid point is refused', () => {
  const question = { mode: 'standardForm', standard: { A: 5, B: 6, C: -7 } };
  const target = { m: F(-5, 6), b: F(-7, 6) };
  // (1, −2) is on the line; (−5, 3.5) is half a unit above it (the line has y = 3 there).
  const plotted = [[1, -2], [-5, 3.5]];
  assert.equal(linesEquivalent(lineFromPoints(...plotted), graphingTargetLine(question), 0.12), true, 'inside the m/b tolerance');
  assert.equal(offBy(target, plotted[0]), 0);
  assert.ok(offBy(target, plotted[1]) > 0.12);
  const result = graph(question, plotted);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0.5);
});

test('graphing2: every pair of distinct snap-grid points ON the line, in either order, is still correct', () => {
  const cases = [
    { question: { mode: 'throughPoints', givenPoints: [[-1, 6], [4, -2]] }, line: exactLine([-1, 6], [4, -2]) },
    { question: { mode: 'standardForm', standard: { A: 5, B: 6, C: -7 } }, line: { m: F(-5, 6), b: F(-7, 6) } },
    { question: { mode: 'slopeIntercept', line: { m: 1.5, b: -2 } }, line: { m: F(3, 2), b: F(-2) } },
    { question: { mode: 'pointSlope', point: [2, 1], slope: -0.5 }, line: { m: F(-1, 2), b: F(2) } },
  ];
  cases.forEach(({ question, line }) => {
    const onLine = [];
    for (let x = F(-10); x.compare(10) <= 0; x = x.add(F(1, 2))) {
      const y = line.m.mul(x).add(line.b);
      if (Number(y.mul(2).d) === 1 && Math.abs(y.valueOf()) <= 10) onLine.push([x.valueOf(), y.valueOf()]);
    }
    assert.ok(onLine.length >= 3, `${question.mode}: grid points on the line`);
    let pairs = 0;
    onLine.forEach((first, i) => onLine.forEach((second, j) => {
      if (i === j) return;
      pairs += 1;
      const result = graph(question, [first, second]);
      assert.equal(result.isCorrect, true, `${question.mode}: ${JSON.stringify([first, second])}`);
      assert.equal(result.score, 1);
    }));
    assert.ok(pairs >= 6);
  });
});

test('graphing2: over every half-unit grid pair, "correct" now means both points on the line (and the line)', () => {
  const question = { mode: 'throughPoints', givenPoints: [[-1, 6], [4, -2]] };
  const line = exactLine([-1, 6], [4, -2]);
  // Every half-unit grid point within a unit (vertically) of the line.
  const grid = [];
  for (let x = -3; x <= 6; x += 0.5) {
    const near = Math.round(line.m.mul(x).add(line.b).valueOf() * 2) / 2;
    for (let dy = -1; dy <= 1; dy += 0.5) grid.push([x, near + dy]);
  }
  let correct = 0;
  let refused = 0;
  for (let i = 0; i < grid.length; i += 1) {
    for (let j = 0; j < grid.length; j += 1) {
      if (i === j) continue;
      const points = [grid[i], grid[j]];
      const result = graph(question, points);
      const bothOn = points.every((point) => offBy(line, point) <= 0.12);
      if (result.isCorrect) {
        correct += 1;
        assert.ok(bothOn, `accepted ${JSON.stringify(points)} with a point off the line`);
      } else if (!bothOn && lineFromPoints(...points) && linesEquivalent(lineFromPoints(...points), graphingTargetLine(question), 0.12)) {
        refused += 1;
      }
    }
  }
  assert.ok(correct > 0, 'the sweep reaches correct constructions');
  assert.ok(refused > 0, 'the sweep reaches near lines the m/b tolerance alone would accept');
});

/* ── complexPlaneLab: operations ───────────────────────────────────────── */

const lab = (question, work) => gradeToolWork({ toolId: 'complexPlaneLab', question: { type: 'complexPlaneLab', mode: 'operations', ...question }, work });

test('complexPlaneLab: add, subtract and multiply are each graded as themselves', () => {
  const z = { re: 2, im: 3 };
  const w = { re: -1, im: 2 };
  const zc = math.complex(z.re, z.im);
  const wc = math.complex(w.re, w.im);
  const expected = { add: math.add(zc, wc), subtract: math.subtract(zc, wc), multiply: math.multiply(zc, wc) };
  Object.entries(expected).forEach(([operation, value]) => {
    const right = lab({ z, w, operation }, { real: String(value.re), imaginary: String(value.im) });
    assert.equal(right.isCorrect, true, operation);
    Object.entries(expected).filter(([other]) => other !== operation).forEach(([other, wrong]) => {
      if (math.equal(wrong, value)) return;
      assert.equal(lab({ z, w, operation }, { real: String(wrong.re), imaginary: String(wrong.im) }).isCorrect, false, `${operation} is not graded as ${other}`);
    });
  });
  // The lab's default operation is multiply.
  assert.equal(lab({ z, w }, { real: String(expected.multiply.re), imaginary: String(expected.multiply.im) }).isCorrect, true);
});

test('complexPlaneLab: an operation the lab does not offer is refused, never graded as multiply', () => {
  const z = { re: 4, im: 2 };
  const w = { re: 1, im: -1 };
  const product = math.multiply(math.complex(4, 2), math.complex(1, -1));
  const quotient = math.divide(math.complex(4, 2), math.complex(1, -1));
  ['divide', 'power', 'conjugate'].forEach((operation) => {
    [product, quotient].forEach((value) => {
      const result = lab({ z, w, operation }, { real: String(value.re), imaginary: String(value.im) });
      assert.equal(result.graded, false, operation);
      assert.equal(result.reason, 'invalid-question', operation);
      assert.equal(result.isCorrect, false, operation);
    });
  });
});

/* ── stepAlgebra2: rewriteLinearForm ───────────────────────────────────── */

const rewrite = (equation, finalEquation) => {
  const [left, right] = finalEquation.split('=').map((side) => side.trim());
  return gradeToolWork({
    toolId: 'stepAlgebra2',
    question: { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation },
    work: { equation: { left, right }, steps: [] },
  });
};
// The same line, recomputed with mathjs: right sides agree at sampled x.
const sameRightSide = (a, b) => [-3, -1, 0, 2, 5].every((x) => Math.abs(math.evaluate(a.replace(/(\d)x/g, '$1*x'), { x }) - math.evaluate(b.replace(/(\d)x/g, '$1*x'), { x })) < 1e-9);

test('stepAlgebra2: an authored equation that only EQUALS mx + b is not finished when left unchanged', () => {
  [
    ['y = -(x+1)', 'y = -x - 1'],
    ['y = x*2 - 6', 'y = 2x - 6'],
    ['y = x*(-3) + 1', 'y = -3x + 1'],
  ].forEach(([authored, finished]) => {
    assert.ok(sameRightSide(authored.split('=')[1], finished.split('=')[1]), `${authored} and ${finished} are one line`);
    const unchanged = rewrite(authored, authored);
    assert.equal(unchanged.isCorrect, false, `${authored} left unchanged`);
    assert.equal(partOf(unchanged, 'same-line').isCorrect, true);
    assert.equal(partOf(unchanged, 'target-form').isCorrect, false);
    assert.equal(unchanged.score, 0.75, 'equivalent but not yet in the form');
    const done = rewrite(authored, finished);
    assert.equal(done.isCorrect, true, `${authored} → ${finished}`);
    assert.equal(done.score, 1);
  });
});

test('stepAlgebra2: every way of writing mx + b the platform accepts on purpose still finishes', () => {
  [
    ['2y = 4x - 6', 'y = 2x - 3'],
    ['2y = 4x - 6', 'y = 2*x - 3'],
    ['2y = 4x - 6', 'y = -3 + 2x'],
    ['2y = 4x - 6', 'y = 2x + -3'], // the Representation Bridge accepts b written as a negative
    ['2y = 6 - 5x', 'y = 3 - (5/2)x'],
    ['2y = 6 - 5x', 'y = -(5/2)x + 3'],
    ['2y = x + 6', 'y = x/2 + 3'],
    ['2y = -6x - 12', 'y = -(3 * x) - 6'],
    ['y - 1 = -2x', 'y = (-2)x + 1'],
    ['y + 2 = x', 'y = x - 2'],
    ['-y = x', 'y = -x'],
    ['y - 5 = 0', 'y = 5'],
    // A written coefficient of one is still y = mx + b (the platform's answer
    // check calls it the implied coefficient of one), so these finish too,
    // including the side the workspace leaves after × (−1) on −y = x.
    ['y = 1x + 2', 'y = 1x + 2'],
    ['y = -1x + 4', 'y = -1x + 4'],
    ['2y = 2x + 6', 'y = 1*x + 3'],
    ['-y = x', 'y = (-1) * (x)'],
    ['-y = x - 3', 'y = (-1)x + 3'],
  ].forEach(([authored, finished]) => {
    const result = rewrite(authored, finished);
    assert.equal(result.isCorrect, true, `${authored} → ${finished}`);
  });
});

test('representationBridge: a slope of one written as "1x" is still accepted as y = mx + b', () => {
  // Rows (0, −4), (2, −2), (4, 0), (6, 2): slope and intercept recomputed exactly.
  const rows = [[0, -4], [2, -2], [4, 0], [6, 2]];
  const slope = F(rows[1][1] - rows[0][1], rows[1][0] - rows[0][0]);
  const intercept = F(rows[0][1]).sub(slope.mul(rows[0][0]));
  assert.equal(slope.valueOf(), 1);
  assert.equal(intercept.valueOf(), -4);
  rows.forEach(([x, y]) => assert.equal(slope.mul(x).add(intercept).valueOf(), y));
  const question = {
    id: 'kfollow-rb-unit-slope',
    type: 'representationBridge',
    mode: 'linear',
    source: { kind: 'table', rows: rows.map(([x, y]) => ({ x, y })) },
    context: {
      inputLabel: 'a', outputLabel: 'b', inputUnit: 'u', outputUnit: 'v', rateUnit: 'v per u',
      rateMeaning: 'r', yInterceptMeaning: 'yi', zeroMeaning: 'z',
    },
    requiredStages: ['generalForm'],
    requiredComparisons: 3,
    graphBounds: { xMin: -2, xMax: 8, yMin: -10, yMax: 10 },
    feedbackTiming: 'checkpoint',
  };
  const grade = (equation) => gradeToolWork({
    toolId: 'representationBridge', question, work: { generalForm: { m: '1', b: '-4', equation } },
  });
  ['y = x - 4', 'y = 1x - 4', 'y = -4 + 1x', 'y = 1*x - 4'].forEach((equation) => {
    const result = grade(equation);
    assert.equal(result.isCorrect, true, equation);
    assert.equal(partOf(result, 'generalForm').isCorrect, true, equation);
  });
  // Not the form: a negated group still to distribute.
  assert.equal(partOf(grade('y = -(-x + 4)'), 'generalForm').isCorrect, false);
});

/* ── regressionCalculator: the correlation stage ───────────────────────── */

const SOURCE = [[1, 2], [2, 4], [3, 5], [4, 8]];
const exactRegression = (pairs) => {
  const n = pairs.length;
  const xBar = pairs.reduce((sum, [x]) => sum.add(x), F(0)).div(n);
  const yBar = pairs.reduce((sum, [, y]) => sum.add(y), F(0)).div(n);
  const sxx = pairs.reduce((sum, [x]) => sum.add(F(x).sub(xBar).pow(2)), F(0));
  const syy = pairs.reduce((sum, [, y]) => sum.add(F(y).sub(yBar).pow(2)), F(0));
  const sxy = pairs.reduce((sum, [x, y]) => sum.add(F(x).sub(xBar).mul(F(y).sub(yBar))), F(0));
  const m = sxy.div(sxx);
  return { m: m.valueOf(), b: yBar.sub(m.mul(xBar)).valueOf(), r: Math.sign(sxy.valueOf()) * Math.sqrt(sxy.pow(2).div(sxx.mul(syy)).valueOf()) };
};
const regressionQuestion = { type: 'regressionCalculator', sourceData: SOURCE, sourceMode: 'data', requireInterpretation: true };
const regressionWork = (run) => ({ table: SOURCE, regressionRun: run, interpretation: { direction: 'positive', strength: 'strong' }, processEvidence: [] });
const gradeLab = (run) => gradeToolWork({ toolId: 'regressionCalculator', question: regressionQuestion, work: regressionWork(run) });
const gradePath = (run) => gradeRegressionCalculatorResponse(buildRegressionCalculatorPrivateDefinition(regressionQuestion), regressionWork(run));

test('regressionCalculator: the run the calculator executes is correct on both graders', () => {
  const stats = exactRegression(SOURCE);
  const run = { operation: 'linearRegression', table: SOURCE.map((pair) => [...pair]), ...stats, r2: stats.r ** 2 };
  const result = gradeLab(run);
  assert.equal(result.isCorrect, true);
  assert.equal(gradePath(run).isCorrect, true);
});

test('regressionCalculator: the correlation stage checks the run\'s own m, b and r, as My Math Path does', () => {
  const stats = exactRegression(SOURCE);
  const base = { operation: 'linearRegression', table: SOURCE.map((pair) => [...pair]), ...stats };
  const variants = {
    'wrong m': { ...base, m: stats.m + 0.5 },
    'wrong b': { ...base, b: stats.b - 1 },
    'm missing': { ...base, m: undefined },
    'r only': { operation: 'linearRegression', table: base.table, r: stats.r },
    // A run on another table whose r happens to equal the source's: y doubled.
    'stale table, same r': { operation: 'linearRegression', table: SOURCE.map(([x, y]) => [x, 2 * y]), ...exactRegression(SOURCE.map(([x, y]) => [x, 2 * y])) },
  };
  assert.ok(Math.abs(variants['stale table, same r'].r - stats.r) < 1e-12, 'scaling y keeps r');
  Object.entries(variants).forEach(([name, run]) => {
    const lab = gradeLab(run);
    const path = gradePath(run);
    assert.equal(partOf(lab, 'correlation-produced').isCorrect, false, `${name}: lab`);
    assert.equal(lab.isCorrect, false, `${name}: lab verdict`);
    assert.deepEqual(lab.parts.map((part) => part.isCorrect), path.parts.map((part) => part.isCorrect), `${name}: lab and Path agree stage by stage`);
  });
});

test('graphing2: a target no snapped point reaches keeps the line rule, so the question still has a right answer', () => {
  // y = 2.3 and y = 3x + 0.2 on the tool's 0.5 grid (non-integer intercept): at every
  // half-unit x the line sits 0.2 off the nearest half-unit y, beyond the 0.12 point
  // tolerance, so no construction can put both points on the line.
  const horizontal = { mode: 'verticalHorizontal', orientation: 'horizontal', value: 2.3 };
  const steep = { mode: 'slopeIntercept', line: { m: 3, b: 0.2 } };
  for (let x = -20; x <= 20; x += 0.5) {
    assert.ok(Math.abs(Math.round(2.3 / 0.5) * 0.5 - 2.3) > 0.12);
    const y = 3 * x + 0.2;
    assert.ok(Math.abs(Math.round(y / 0.5) * 0.5 - y) > 0.12, `x = ${x}`);
  }
  // The nearest grid lines, as before the both-points rule: right.
  assert.equal(graph(horizontal, [[0, 2.5], [1, 2.5]]).isCorrect, true);
  assert.equal(graph(steep, [[0, 0], [1, 3]]).isCorrect, true);
  // A different line is still wrong.
  assert.equal(graph(horizontal, [[0, 3], [1, 3]]).isCorrect, false);
  assert.equal(graph(steep, [[0, 0], [1, 2]]).isCorrect, false);
  // A reachable target keeps the both-points rule (the first test above).
  assert.equal(graph({ mode: 'throughPoints', givenPoints: [[-1, 6], [4, -2]] }, [[-1, 6], [4, -1.5]]).isCorrect, false);
});

test('graphing2: reachability is judged inside the question\'s own window, not beyond it', () => {
  // y = 0.01x + 0.25 on the 0.5 grid, drawn on x, y in [-10, 10]: inside the window
  // y stays in [0.15, 0.35], at least 0.15 from any half-unit, so no snapped point
  // is on the line there (x = 20 would reach 0.45, but the student cannot plot it).
  const question = { mode: 'slopeIntercept', line: { m: 0.01, b: 0.25 }, graphBounds: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 } };
  for (let x = -10; x <= 10; x += 0.5) {
    const y = 0.01 * x + 0.25;
    assert.ok(Math.abs(Math.round(y / 0.5) * 0.5 - y) > 0.12, `x = ${x}`);
  }
  assert.equal(graph(question, [[-10, 0], [10, 0.5]]).isCorrect, true, 'the nearest constructible line is right, as on main');
  assert.equal(graph(question, [[-10, 0], [10, 2]]).isCorrect, false, 'a different line is still wrong');
});

test('complexPlaneLab: legacy spellings of multiplication stay gradable, as the screen shows them (×)', () => {
  // (2 + 3i)(−1 + 2i) = −2 + 4i − 3i + 6i² = −8 + i.
  const z = { re: 2, im: 3 };
  const w = { re: -1, im: 2 };
  for (const operation of ['multiplication', 'product', 'Multiply', 'times']) {
    const result = gradeToolWork({ toolId: 'complexPlaneLab', question: { type: 'complexPlaneLab', mode: 'operations', operation, z, w }, work: { real: '-8', imaginary: '1' } });
    assert.equal(result.graded, true, operation);
    assert.equal(result.isCorrect, true, operation);
  }
  const divide = gradeToolWork({ toolId: 'complexPlaneLab', question: { type: 'complexPlaneLab', mode: 'operations', operation: 'divide', z, w }, work: { real: '-8', imaginary: '1' } });
  assert.notEqual(divide.isCorrect, true, 'divide is still never graded as multiply');
});
