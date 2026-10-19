import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRegressionCalculatorReview,
  implemented,
} from '../../src/tools/shared/reviews/regressionCalculatorReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  REGRESSION_OPERATION,
  buildRegressionCalculatorWork,
} from '../../functions/shared/serverGrading/tools/regressionCalculator.mjs';
import { regressionCalculatorStats } from '../../functions/shared/toolMath/regressionCalculator/regressionCalculatorMath.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';
import { PATH_TOOL_QUESTIONS } from '../platform/fixtures/pathToolQuestions.mjs';

/*
 * THE REGRESSION REVIEW STATES WHAT THE SHARED GRADER ACCEPTS.
 *
 * Once a Regression Calculator question is closed, its review lists the table,
 * the line of best fit, r and — when the question asks for it — the direction
 * and strength, with the worked steps that reach them. Every review here is
 * turned back into the work a student following it would submit (the table it
 * lists, the regression the calculator runs on that table, the choices it
 * names) and graded by the shared grader the server records with; it must come
 * back correct. Both graded modes are covered — `data` (pairs listed) and
 * `scatterplot` (pairs plotted, coordinates hidden) — with and without the
 * interpretation, across every strength band and both sides of each band edge.
 */

const TOOL_ID = 'regressionCalculator';

const CHOICE_VALUES = {
  Positive: 'positive', Negative: 'negative', Strong: 'strong', Moderate: 'moderate', Weak: 'weak', None: 'none',
};

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

// The table the review tells the student to enter, read back from its text.
const statedTable = (model) => [...itemValue(model, 'Table (x₁, y₁)').matchAll(/\(([^,()]+), ([^,()]+)\)/g)]
  .map(([, x, y]) => [Number(x), Number(y)]);

// The r the review prints, read back from its text.
const statedR = (model) => {
  const match = itemValue(model, 'Correlation coefficient').match(/^r [=≈] (\S+)$/);
  assert.ok(match, 'the review states r');
  return Number(match[1]);
};

// The calculator's execute(): the run it stores for y₁ ~ mx₁ + b on a table.
const runOn = (table) => {
  const stats = regressionCalculatorStats(table);
  return stats ? { operation: REGRESSION_OPERATION, table: table.map((pair) => [...pair]), ...stats, r2: stats.r ** 2 } : null;
};

// The work a student who follows the review submits: the stated table (rows
// in reverse — order is free), the regression on it, and the stated choices.
const workFromReview = (model, overrides = {}) => {
  const table = statedTable(model).reverse();
  return buildRegressionCalculatorWork({
    table,
    regressionRun: runOn(table),
    direction: CHOICE_VALUES[itemValue(model, 'Direction')] || '',
    strength: CHOICE_VALUES[itemValue(model, 'Strength')] || '',
    ...overrides,
  });
};

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

// The grader's bands (serverGrading/tools/regressionCalculator.mjs describeCorrelation).
const bandOf = (r) => (Math.abs(r) >= 0.8 ? 'Strong' : Math.abs(r) >= 0.5 ? 'Moderate' : Math.abs(r) >= 0.1 ? 'Weak' : 'None');

const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the model shape`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.items.length >= 4, `${label}: items`);
  model.items.forEach((item) => {
    assert.equal(typeof item.label, 'string');
    assert.equal(typeof item.value, 'string');
    assert.ok(item.label && item.value, `${label}: no empty item`);
  });
  assert.ok(model.steps.length >= 5, `${label}: steps`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 20, `${label}: each step is a sentence`));
  assert.ok(typeof model.why === 'string' && model.why.length > 20, `${label}: why`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain text, nothing else`);
  assert.doesNotMatch(JSON.stringify(model), /NaN|undefined|Infinity|\[object/, `${label}: no broken value`);
};

// Where the review writes out its arithmetic, that arithmetic is right:
//   b = ȳ − m·x̄ = Y − M(X) = B      and      M(X) ± B = Y = ȳ
const number = (text) => Number(text.replace(/^\((.*)\)$/, '$1'));
const assertShownArithmetic = (model, label) => {
  let checked = 0;
  model.steps.forEach((step) => {
    const intercept = step.match(/b = ȳ − m·x̄ = (\S+) − (\S+)\((\S+)\) = (\S+?),? so/);
    if (!intercept) return;
    const [, y, m, x, b] = intercept;
    assert.ok(Math.abs(number(y) - number(m) * number(x) - number(b)) < 1e-9, `${label}: ${intercept[0]}`);
    checked += 1;
  });
  const meanPoint = model.why.match(/gives (\S+)\((\S+)\) ([+−]) (\S+) = (\S+) = ȳ/);
  if (meanPoint) {
    const [, m, x, sign, b, y] = meanPoint;
    const value = number(m) * number(x) + (sign === '−' ? -1 : 1) * number(b);
    assert.ok(Math.abs(value - number(y)) < 1e-9, `${label}: ${meanPoint[0]}`);
    checked += 1;
  }
  return checked;
};

const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Statistics', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    questions: [
      {
        prompt: 'Study hours vs. quiz score: enter the data, run a linear regression and interpret r.',
        studentActions: ['calculate correlation'],
        sourceData: [[1, 62], [2, 68], [3, 71], [4, 79], [5, 84], [6, 90]],
      },
      {
        prompt: 'Read the scatterplot, enter the points, run a linear regression and interpret r.',
        studentActions: ['calculate correlation', 'read graph'],
        sourceData: [[1, 9], [2, 7.5], [3, 6], [5, 2.2], [6, 1]],
        graphBounds: { xMin: 0, xMax: 7, yMin: 0, yMax: 10 },
      },
      {
        prompt: 'Enter the enrollment data and calculate r.',
        studentActions: ['calculate correlation'],
        requireInterpretation: false,
        sourceData: [[2000, 12.5], [2002, 13.1], [2004, 15.2], [2006, 14.8], [2008, 17.3], [2010, 18.0]],
      },
    ],
  }],
}).package.sections[0].questions;

// Realistic questions, every mode and every strength band.
const QUESTIONS = [
  { label: 'Path fixture (scatterplot, strong positive)', question: PATH_TOOL_QUESTIONS.regressionCalculator, mode: 'scatterplot', band: 'Strong' },
  { label: 'V5 data mode (strong positive)', question: compiled[0], mode: 'data', band: 'Strong' },
  { label: 'V5 read-graph (scatterplot, strong negative)', question: compiled[1], mode: 'scatterplot', band: 'Strong' },
  { label: 'V5 r only (no interpretation)', question: compiled[2], mode: 'data', band: null },
  {
    label: 'moderate positive, interpretation by default',
    question: { type: TOOL_ID, prompt: 'Run a linear regression and interpret r.', sourceData: [[1, 2], [2, 5], [3, 3], [4, 7], [5, 4], [6, 8]] },
    mode: 'data',
    band: 'Moderate',
  },
  {
    label: 'weak negative, legacy points key',
    question: { type: TOOL_ID, prompt: 'Run a linear regression and interpret r.', points: [{ x: 1, y: 5 }, { x: 2, y: 3 }, { x: 3, y: 6 }, { x: 4, y: 2 }, { x: 5, y: 5 }, { x: 6, y: 4 }] },
    mode: 'data',
    band: 'Weak',
  },
  {
    label: 'no correlation, scatterplot',
    question: { type: TOOL_ID, sourceMode: 'scatterplot', sourceData: [[1, 3], [2, 7], [3, 5], [4, 2], [5, 6], [6, 4]], requireInterpretation: true },
    mode: 'scatterplot',
    band: 'None',
  },
  {
    label: 'r exactly 0.8 (band edge)',
    question: { type: TOOL_ID, sourceData: [[-1, -7], [1, 1], [-1, -1], [1, 7]] },
    mode: 'data',
    band: 'Strong',
  },
  {
    // The grader reads sourceData before points; so must the review.
    label: 'sourceData wins over a stale points list',
    question: { type: TOOL_ID, sourceData: [[1, 10], [2, 8], [3, 7], [4, 3]], points: [[1, 1], [2, 2], [3, 3]] },
    mode: 'data',
    band: 'Strong',
  },
];

test('the regression review is implemented and the review index picks it up', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildRegressionCalculatorReview);
});

QUESTIONS.forEach(({ label, question, mode, band }) => {
  test(`regression review — ${label}: text only, worked, and accepted by the shared grader`, () => {
    const model = buildRegressionCalculatorReview(question);
    assertTextOnly(model, label);
    assert.equal(grade(question, workFromReview(model)).mode, mode, `${label}: the mode the grader marks`);

    // The steps work THIS question's numbers: every pair, and the r it states.
    const table = statedTable(model);
    const source = (question.sourceData || question.points).map((point) => (Array.isArray(point) ? point : [point.x, point.y]));
    assert.deepEqual(table, source, `${label}: the stated table is the source, pair for pair`);
    table.forEach(([x, y]) => assert.ok(model.steps[0].includes(`(${x}, ${y})`), `${label}: step 1 lists (${x}, ${y})`));
    assert.equal(/scatterplot/.test(model.steps[0]), mode === 'scatterplot', `${label}: step 1 reads the view the student saw`);
    assert.ok(model.steps.some((step) => step.includes(String(statedR(model)))), `${label}: a step reaches the stated r`);

    // Following the review is correct work: every stage, full score.
    const followed = grade(question, workFromReview(model));
    assert.equal(followed.graded, true, `${label}: graded`);
    assert.equal(followed.isCorrect, true, `${label}: the review's answer is accepted`);
    assert.equal(followed.score, 1);
    assert.ok(followed.parts.every((part) => part.isCorrect), `${label}: every stage passes`);

    // The printed (rounded) r is itself within the grader's tolerance.
    assert.equal(grade(question, workFromReview(model, { regressionRun: { ...runOn(table), r: statedR(model) } })).isCorrect, true,
      `${label}: the stated r is accepted as the produced correlation`);

    // The interpretation is stated exactly when the grader marks one.
    if (band) {
      assert.equal(followed.parts.length, 4);
      assert.equal(itemValue(model, 'Strength'), band, `${label}: the strength band`);
      assert.equal(bandOf(statedR(model)), band, `${label}: the printed r sits in the band the review names`);
      // A wrong band or a wrong direction is refused — the check above can fail.
      ['strong', 'moderate', 'weak', 'none'].filter((strength) => strength !== CHOICE_VALUES[band]).forEach((strength) => {
        assert.equal(grade(question, workFromReview(model, { strength })).isCorrect, false, `${label}: ${strength} is refused`);
      });
      ['positive', 'negative', 'none'].filter((direction) => direction !== CHOICE_VALUES[itemValue(model, 'Direction')]).forEach((direction) => {
        assert.equal(grade(question, workFromReview(model, { direction })).isCorrect, false, `${label}: ${direction} is refused`);
      });
    } else {
      assert.equal(followed.parts.length, 3);
      assert.equal(itemValue(model, 'Direction'), undefined, `${label}: no interpretation when none is asked`);
      assert.equal(itemValue(model, 'Strength'), undefined);
    }

    // One misread value and the table stage fails: the stated table is the key.
    const [first, ...rest] = statedTable(model);
    const misread = [[first[0], first[1] + 1], ...rest];
    assert.equal(grade(question, workFromReview(model, { table: misread, regressionRun: runOn(misread) })).isCorrect, false);

    assertShownArithmetic(model, label);

    // The registry index serves this same model.
    assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model);
    assert.deepEqual(buildToolSolutionReviewModel(question), model, `${label}: found by question type`);
  });
});

test('regression review: the stated line, r and check are the regression of the source', () => {
  const question = compiled[0];
  const model = buildRegressionCalculatorReview(question);
  const stats = regressionCalculatorStats(question.sourceData);
  // y = 5.45714x + 56.8, r ≈ 0.9967 for the study-hours data.
  const line = itemValue(model, 'Line of best fit').match(/^y [=≈] (\S+)x \+ (\S+)$/);
  assert.ok(line, 'the line is written y = mx + b');
  assert.ok(Math.abs(Number(line[1]) - stats.m) <= 5e-6, 'm to 5 places');
  assert.ok(Math.abs(Number(line[2]) - stats.b) <= 5e-6, 'b to 5 places');
  assert.ok(Math.abs(statedR(model) - stats.r) <= 5e-5, 'r to 4 places');
  assert.match(model.why, /mean point \(x̄, ȳ\) = \(3\.5, 75\.6667\)|mean point \(x̄, ȳ\) ≈ \(3\.5, 75\.6667\)/);

  // An exact question shows its substitution in full.
  const exact = buildRegressionCalculatorReview({ sourceData: [[1, 2], [2, 4], [3, 5], [4, 8]] });
  assert.equal(itemValue(exact, 'Line of best fit'), 'y = 1.9x');
  assert.ok(exact.steps.some((step) => step.includes('m = Sxy ÷ Sxx = 9.5 ÷ 5 = 1.9')));
  assert.ok(exact.steps.some((step) => step.includes('b = ȳ − m·x̄ = 4.75 − 1.9(2.5) = 0')));
  assert.match(exact.why, /1\.9\(2\.5\) \+ 0 = 4\.75 = ȳ/);
  assert.equal(assertShownArithmetic(exact, 'y = 1.9x'), 2);

  // A negative intercept and a negative slope keep their signs in the check.
  const falling = buildRegressionCalculatorReview({ sourceData: [[1, 1], [2, 3], [3, 5]] });
  assert.equal(itemValue(falling, 'Line of best fit'), 'y = 2x − 1');
  assert.match(falling.why, /2\(2\) − 1 = 3 = ȳ/);
  assert.equal(assertShownArithmetic(falling, 'y = 2x − 1'), 2);
  const negative = buildRegressionCalculatorReview({ sourceData: [[0, 6], [1, 4], [2, 2]] });
  assert.equal(itemValue(negative, 'Line of best fit'), 'y = -2x + 6');
  assert.ok(negative.steps.some((step) => step.includes('b = ȳ − m·x̄ = 4 − (-2)(1) = 6')));
  assert.equal(assertShownArithmetic(negative, 'y = -2x + 6'), 2);
});

// Four points whose r is t: x and z are orthogonal, zero-mean and equal length.
const X = [-1, 1, -1, 1];
const Z = [-1, -1, 1, 1];
const withR = (t) => X.map((x, index) => [x, t * x + Math.sqrt(1 - t * t) * Z[index]]);

test('regression review: every band edge, both signs, states the band the grader accepts', () => {
  [0.05, 0.0999, 0.1001, 0.4999, 0.5001, 0.7999, 0.79999, 0.8001].flatMap((t) => [t, -t]).forEach((t) => {
    const question = { type: TOOL_ID, sourceData: withR(t) };
    assert.ok(Math.abs(regressionCalculatorStats(question.sourceData).r - t) < 1e-9, `the data has r = ${t}`);
    const model = buildRegressionCalculatorReview(question);
    assertTextOnly(model, `r = ${t}`);
    assert.equal(grade(question, workFromReview(model)).isCorrect, true, `r = ${t}: the stated interpretation is accepted`);
    // The printed r never rounds across the edge it is explained by.
    assert.equal(bandOf(statedR(model)), itemValue(model, 'Strength'), `r = ${t}: printed ${statedR(model)}`);
  });
  // 0.79999 is not shown as 0.8000.
  assert.equal(statedR(buildRegressionCalculatorReview({ sourceData: withR(0.79999) })), 0.79999);
});

test('regression review: null — never a guess — where nothing honest can be said', () => {
  // r a hair under 0.5: the grader wants Weak, but no rounding of r a student
  // could read shows it below 0.5. The review declines rather than print
  // "r ≈ 0.5 … Weak".
  const hair = { type: TOOL_ID, sourceData: withR(0.5 - 1e-10) };
  assert.equal(buildRegressionCalculatorReview(hair), null);
  assert.equal(grade(hair, buildRegressionCalculatorWork({
    table: hair.sourceData, regressionRun: runOn(hair.sourceData), direction: 'positive', strength: 'weak',
  })).isCorrect, true, 'the grader does call it weak');

  // No r exists: the grader accepts nothing, so there is no answer to show.
  [
    { label: 'every x the same', sourceData: [[1, 2], [1, 3], [1, 4]] },
    { label: 'every y the same', sourceData: [[1, 2], [2, 2], [3, 2]] },
    { label: 'one point', sourceData: [[1, 2]] },
  ].forEach(({ label, sourceData }) => {
    const question = { type: TOOL_ID, sourceData };
    assert.equal(buildRegressionCalculatorReview(question), null, label);
    assert.equal(buildToolSolutionReviewModel(question), null, label);
    const best = grade(question, buildRegressionCalculatorWork({
      table: sourceData,
      regressionRun: { operation: REGRESSION_OPERATION, table: sourceData, m: 0, b: 0, r: 1, r2: 1 },
      direction: 'positive',
      strength: 'strong',
    }));
    assert.equal(best.isCorrect, false, `${label}: the grader accepts nothing`);
  });
});

test('regression review: null, {} and malformed input give null without throwing', () => {
  const throwing = Object.defineProperty({ toolId: TOOL_ID }, 'sourceData', {
    enumerable: true,
    get() { throw new Error('unreadable'); },
  });
  [
    null, undefined, {}, [], 'regression', 42,
    { sourceData: [] }, { sourceData: 'not points' }, { sourceData: { x: 1, y: 2 } },
    { sourceData: [{ x: 'a', y: 'b' }, { x: Number.NaN, y: 1 }, [1]] },
    { sourceData: [[1, Symbol('x')], [2, 3], [3, 4]] },
    throwing,
  ].forEach((input, index) => {
    assert.doesNotThrow(() => buildRegressionCalculatorReview(input), `malformed input #${index}`);
    assert.equal(buildRegressionCalculatorReview(input), null, `malformed input #${index}`);
  });
  assert.equal(buildToolSolutionReviewModel(throwing), null);
  [null, {}, { sourceData: [] }].forEach((input) => {
    assert.equal(buildToolSolutionReviewModel({ ...input, toolId: TOOL_ID }), null);
  });
});
