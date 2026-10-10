/*
 * LINEAR TABLE WORKBENCH: THE WORKED SOLUTION STATES WHAT THE GRADER ACCEPTS.
 *
 * Once a linearTableWorkbench question is closed, QuestionEngine shows its
 * worked solution (src/tools/shared/toolSolutionReview.js →
 * src/tools/shared/reviews/linearTableWorkbenchReview.js). This file proves,
 * for every mode the shared grader grades (constantRate — linear and
 * nonlinear tables — deriveEquation and repairValue):
 *
 *   1. the review is text only, with items, steps and a check;
 *   2. the work it states — read back from its items exactly as a student
 *      would record the intervals, pick the classification and type m, b,
 *      the equation or the corrected value — is marked correct, every part,
 *      by the shared grader the server records with (gradeToolWork);
 *   3. it is the answer the mathematics gives (the grader's own helpers,
 *      derived independently here), not merely something inside a tolerance,
 *      and changing that answer makes the grader reject it;
 *   4. the registry index picks the builder up, and null, {} and malformed
 *      questions give null without throwing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as reviewModule from '../../src/tools/shared/reviews/linearTableWorkbenchReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel, TOOLS_WITH_SOLUTION_REVIEW_BUILDER } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5Core.js';
import { parseNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  findTableRepair,
  fitTableLine,
  intervalTruth,
  normalizeRows,
  tableClassification,
  validateLinearTableWorkbenchQuestion,
} from '../../functions/shared/toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';

const { buildLinearTableWorkbenchReview, implemented } = reviewModule;
const TOOL_ID = 'linearTableWorkbench';
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const q = (mode, rows, extra = {}) => ({ type: TOOL_ID, ...(mode === undefined ? {} : { mode }), rows, ...extra });
const pts = (...pairs) => pairs.map(([x, y]) => ({ x, y }));

/* ------------------------------------------------------------ fixtures */

// Teacher-authored questions as compileAuthoringIntentV5 delivers them.
const compiled = compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Rate of change from tables', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    questions: [
      { prompt: 'Is the rate of change in this table constant? Record intervals to prove it.', studentActions: ['proveConstantRate'], mode: 'constantRate', rows: pts([0, 4], [2, 10], [5, 19], [6, 22]), requiredComparisons: 3 },
      { prompt: 'Find the equation of the line this table represents.', studentActions: ['proveConstantRate'], mode: 'deriveEquation', rows: pts([-4, 1], [-1, -1], [2, -3], [5, -5]), requiredComparisons: 2 },
      { prompt: 'One value in this table was copied wrong. Find and fix it.', studentActions: ['proveConstantRate'], mode: 'repairValue', rows: pts([1, 7], [2, 10], [3, 14], [4, 16], [5, 19]), requiredComparisons: 2 },
    ],
  }],
});
const compiledQuestions = compiled.package.sections
  .flatMap((section) => section.questions)
  .filter((question) => question.type === TOOL_ID);
const compiledByMode = (mode) => compiledQuestions.find((question) => question.mode === mode);

const CONSTANT_RATE_LINEAR = [
  // tests/tools/linearTableWorkbenchSharedGrading LINEAR_Q: y = 2x + 3.
  ['equal spacing, 2 intervals', q('constantRate', pts([0, 3], [1, 5], [2, 7], [3, 9]), { requiredComparisons: 2 })],
  ['authored (compiled) y = 3x + 4, irregular spacing', compiledByMode('constantRate')],
  ['negative rate, 3 rows, all 3 pairs (default requiredComparisons)', q('constantRate', pts([-2, 10], [0, 6], [3, 0]))],
  ['fractional rate 1/2 as decimals', q('constantRate', pts([0, 0], [2, 1], [4, 2], [6, 3]), { requiredComparisons: 2 })],
  ['rows out of x order, given as [x, y] pairs', q('constantRate', [[3, 9], [0, 3], [1, 5], [2, 7]], { requiredComparisons: 3 })],
  ['no mode at all (the view and grader fall back to constantRate)', q(undefined, pts([1, 1], [4, 2], [7, 3], [10, 4]))],
  ['a misspelled mode (constantRate view)', q('constant-rate', pts([0, 5], [1, 5], [2, 5], [3, 5]), { requiredComparisons: 2 })],
  ['six rows, ten intervals (one step each, twelve steps)', q('constantRate', pts([0, 1], [1, 4], [2, 7], [3, 10], [4, 13], [5, 16]), { requiredComparisons: 10 })],
  ['six rows, twelve intervals (folded into one step so none is cut off)', q('constantRate', pts([0, 1], [1, 4], [2, 7], [3, 10], [4, 13], [5, 16]), { requiredComparisons: 12 })],
];

const CONSTANT_RATE_NONLINEAR = [
  // tests/tools/linearTableWorkbenchSharedGrading NONLINEAR_Q: rates 2, 2, then 5.
  ['rates 2, 2, 5 with 3 intervals', q('constantRate', pts([0, 0], [1, 2], [2, 4], [3, 9]), { requiredComparisons: 3 })],
  // The first two neighbouring intervals have the same rate: the review must swap in one that differs.
  ['rates 2, 2, 5 with only 2 intervals', q('constantRate', pts([0, 0], [1, 2], [2, 4], [3, 9]), { requiredComparisons: 2 })],
  ['y = x² (rates 1, 3, 5)', q('constantRate', pts([0, 0], [1, 1], [2, 4], [3, 9]), { requiredComparisons: 2 })],
  ['one interval required, but a changing rate needs two', q('constantRate', pts([0, 1], [1, 2], [2, 4], [3, 8]), { requiredComparisons: 1 })],
  ['exponential growth, decimals', q('constantRate', pts([0, 100], [1, 110], [2, 121], [3, 133.1]))],
];

const DERIVE_EQUATION = [
  // tests/tools/linearTableWorkbenchSharedGrading DERIVE_Q: y = −2x + 10 through irregular x-values.
  ['y = -2x + 10, irregular x', q('deriveEquation', pts([-3, 16], [1, 8], [4, 2], [9, -8]), { requiredComparisons: 2 })],
  // MathToolsLab's preview sample: y = -0.25x + 5.
  ['MathToolsLab sample y = -0.25x + 5', q('deriveEquation', pts([-2, 5.5], [1, 4.75], [4, 4], [7, 3.25]), { requiredComparisons: 3 })],
  // tests/tools/linearTableWorkbenchSharedGrading FRACTION_Q: y = x/2 + 1.
  ['y = x/2 + 1 (x = 0 row gives b)', q('deriveEquation', pts([0, 1], [2, 2], [4, 3], [6, 4]), { requiredComparisons: 2 })],
  ['authored (compiled) y = -(2/3)x - 5/3', compiledByMode('deriveEquation')],
  ['y = (1/3)x + 2/3: fractions no decimal can carry', q('deriveEquation', [[1, 1], [4, 2], [7, 3], [10, 4]])],
  ['horizontal line y = 4', q('deriveEquation', pts([-1, 4], [2, 4], [5, 4], [6, 4]), { requiredComparisons: 2 })],
  ['y = x - 3, rows out of order', q('deriveEquation', pts([5, 2], [-1, -4], [2, -1], [8, 5]), { requiredComparisons: 3 })],
];

const REPAIR_VALUE = [
  // tests/tools/linearTableWorkbenchSharedGrading REPAIR_Q: y = −2x + 10, row 3 mistyped as 99.
  ['y = -2x + 10, row 3 mistyped', q('repairValue', pts([-2, 14], [0, 10], [2, 99], [4, 2], [6, -2]), { requiredComparisons: 2 })],
  // REPAIR_FIRST_Q: the FIRST row is the broken one.
  ['y = 2x + 3, first row broken', q('repairValue', pts([0, 50], [1, 5], [2, 7], [3, 9], [4, 11]), { requiredComparisons: 2 })],
  ['authored (compiled) y = 3x + 4, row 3 broken', compiledByMode('repairValue')],
  ['corrected value is a fraction (10/3)', q('repairValue', pts([0, 2], [3, 3], [4, 9], [6, 4], [9, 5]), { requiredComparisons: 3 })],
  ['more intervals than the good rows can give (uses the broken row as printed)', q('repairValue', pts([0, -1], [1, 2], [2, 5], [3, 10]), { requiredComparisons: 5 })],
  // y = -2x + 8; the row with the largest x (Row 5) is broken.
  ['last row (in x order) broken, rows out of order', q('repairValue', pts([4, 0], [0, 8], [6, -4], [2, 4], [8, 0]), { requiredComparisons: 3 })],
];

/* ------------------------------------------------------- reading a review */

const CLASSIFICATION_FROM_TEXT = Object.freeze({
  'Constant rate (linear)': 'linear',
  'Not a constant rate (nonlinear)': 'nonlinear',
});

const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

/**
 * The work a student following the review would submit: every "Row a → Row b"
 * item recorded as an interval with the three values it states, the
 * classification button it names, and the typed answers it gives.
 */
const workFromReview = (model) => {
  const intervals = model.items.flatMap((item) => {
    const rowsMatch = item.label.match(/^Row (\d+) → Row (\d+)$/);
    if (!rowsMatch) return [];
    const values = item.value.match(/^Δx = (\S+), Δy = (\S+), rate = (\S+)$/);
    assert.ok(values, `interval item reads as Δx, Δy, rate: ${item.value}`);
    return [{ i: Number(rowsMatch[1]) - 1, j: Number(rowsMatch[2]) - 1, dx: values[1], dy: values[2], rate: values[3] }];
  });
  const classificationItem = model.items.find((item) => item.label.startsWith('Classification'));
  const offending = itemValue(model, 'Offending row');
  const corrected = model.items.find((item) => item.label.startsWith('Corrected y-value'));
  return {
    intervals,
    classification: CLASSIFICATION_FROM_TEXT[classificationItem?.value] || '',
    repairRowIndex: offending ? Number(offending.match(/^Row (\d+)$/)[1]) - 1 : null,
    repairedValue: corrected?.value ?? '',
    m: itemValue(model, 'Slope m') ?? '',
    b: itemValue(model, 'y-intercept b') ?? '',
    equation: itemValue(model, 'Equation') ?? '',
  };
};

const assertTextOnly = (model, label) => {
  assert.ok(model && typeof model === 'object', `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the review model's keys`);
  assert.equal(typeof model.title, 'string');
  assert.ok(model.title.length > 0);
  assert.ok(Array.isArray(model.items) && model.items.length >= 2, `${label}: items`);
  model.items.forEach((item) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value']);
    assert.equal(typeof item.label, 'string');
    assert.equal(typeof item.value, 'string');
    assert.ok(item.label && item.value, `${label}: a filled item`);
  });
  assert.ok(Array.isArray(model.steps) && model.steps.length >= 3, `${label}: steps`);
  assert.ok(model.steps.length <= 12, `${label}: no step is cut off by the 12-step limit`);
  model.steps.forEach((step) => assert.ok(typeof step === 'string' && step.length > 0));
  assert.equal(typeof model.why, 'string');
  assert.ok(model.why.length > 0, `${label}: a check`);
  assert.ok(model.note === null || typeof model.note === 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain data`);
};

/** The review as the platform builds it (the index) is exactly the builder's. */
const reviewOf = (question, label) => {
  const model = buildLinearTableWorkbenchReview(question);
  assertTextOnly(model, label);
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: the index serves this builder`);
  return model;
};

/** The grader marks the review's work correct and complete, every part. */
const assertGraderAccepts = (question, work, label) => {
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, true, `${label}: isCorrect (${JSON.stringify(result.parts)})`);
  assert.equal(result.isComplete, true, `${label}: isComplete`);
  result.parts.forEach((part) => assert.equal(part.isCorrect, true, `${label}: part ${part.id}`));
  return result;
};
const assertGraderRejects = (question, work, label) => {
  assert.equal(grade(question, work).isCorrect, false, `${label}: the grader rejects the changed answer`);
};

const value = (text) => parseNumericAnswer(text);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// "rate = 6 ÷ 2 = 3." in a worked step, or "rate = 3;" in the folded one.
const rateStated = (rate) => new RegExp(`rate = (?:\\S+ ÷ \\S+ = )?${escapeRegExp(rate.replace(/^-/, '−'))}[.;]`);

/** Every recorded interval is the grader's truth, from the smaller x to the larger x, and the pairs are distinct. */
const assertIntervalsAreTruth = (question, work, label) => {
  const rows = normalizeRows(question.rows);
  const keys = new Set();
  work.intervals.forEach((entry) => {
    const truth = intervalTruth(rows[entry.i], rows[entry.j]);
    assert.ok(truth, `${label}: a real interval`);
    assert.ok(rows[entry.i].x < rows[entry.j].x, `${label}: named from the smaller x to the larger x`);
    assert.ok(Math.abs(value(entry.dx) - truth.dx) < 1e-9, `${label}: Δx ${entry.dx}`);
    assert.ok(Math.abs(value(entry.dy) - truth.dy) < 1e-9, `${label}: Δy ${entry.dy}`);
    assert.ok(Math.abs(value(entry.rate) - truth.rate) < 1e-9, `${label}: rate ${entry.rate}`);
    keys.add([entry.i, entry.j].sort((a, b) => a - b).join(':'));
  });
  assert.equal(keys.size, work.intervals.length, `${label}: distinct row pairs`);
  const required = Number(question.requiredComparisons) || 3;
  assert.ok(work.intervals.length >= required, `${label}: at least ${required} intervals`);
};

/* ------------------------------------------------------------ the module */

test('the builder is implemented and the registry index serves it', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildLinearTableWorkbenchReview);
  assert.ok(TOOLS_WITH_SOLUTION_REVIEW_BUILDER.includes(TOOL_ID));
  assert.equal(compiledQuestions.length, 3, 'the authored assignment compiles to three workbench questions');
  compiledQuestions.forEach((question) => assert.deepEqual(validateLinearTableWorkbenchQuestion(question), [], question.prompt));
});

/* ------------------------------------------------------- constantRate */

test('constantRate, linear table: the recorded intervals and "linear" are what the grader accepts', () => {
  CONSTANT_RATE_LINEAR.forEach(([label, question]) => {
    assert.ok(question, label);
    assert.equal(tableClassification(normalizeRows(question.rows)), 'linear', `${label}: fixture is linear`);
    const model = reviewOf(question, label);
    const work = workFromReview(model);
    assert.equal(work.classification, 'linear', label);
    assertIntervalsAreTruth(question, work, label);
    assertGraderAccepts(question, work, label);
    // The other classification is wrong, and the grader says so.
    assertGraderRejects(question, { ...work, classification: 'nonlinear' }, `${label} / nonlinear`);
    // The steps compute with this table's own numbers and conclude.
    // Every recorded interval is worked in the steps with this table's numbers.
    work.intervals.forEach((entry) => assert.ok(
      model.steps.some((step) => step.includes(`Row ${entry.i + 1}`) && step.includes(`Row ${entry.j + 1}`) && rateStated(entry.rate).test(step)),
      `${label}: a step works Row ${entry.i + 1} → Row ${entry.j + 1}`,
    ));
    const [first] = work.intervals;
    assert.match(model.steps.at(-1), /constant, so the table is linear\.$/, `${label}: the last step concludes`);
    assert.ok(model.why.includes(`Δy ÷ Δx = ${first.rate.replace(/^-/, '−')},`), `${label}: the check names the one rate`);
  });
});

test('constantRate, nonlinear table: the review records two different rates — the evidence the grader requires', () => {
  CONSTANT_RATE_NONLINEAR.forEach(([label, question]) => {
    assert.equal(tableClassification(normalizeRows(question.rows)), 'nonlinear', `${label}: fixture is nonlinear`);
    const model = reviewOf(question, label);
    const work = workFromReview(model);
    assert.equal(work.classification, 'nonlinear', label);
    assertIntervalsAreTruth(question, work, label);
    const rates = new Set(work.intervals.map((entry) => value(entry.rate)));
    assert.ok(rates.size >= 2, `${label}: two recorded rates differ`);
    const result = assertGraderAccepts(question, work, label);
    assert.ok(result.parts.some((part) => part.id === 'nonconstantRateEvidence'), `${label}: the grader checked the changing-rate evidence`);
    assertGraderRejects(question, { ...work, classification: 'linear' }, `${label} / linear`);
    assert.match(model.steps.at(-1), /The rate changes, so the table is nonlinear\.$/, label);
  });
});

test('constantRate, nonlinear: when the first intervals share a rate, the review records one that differs', () => {
  const question = CONSTANT_RATE_NONLINEAR[1][1];
  const work = workFromReview(reviewOf(question, 'swap'));
  assert.deepEqual(work.intervals.map((entry) => [entry.i, entry.j]), [[0, 1], [2, 3]]);
  // Recording only the first two neighbouring intervals (both rate 2) is not enough evidence.
  const sameRate = { ...work, intervals: [{ i: 0, j: 1, dx: '1', dy: '2', rate: '2' }, { i: 1, j: 2, dx: '1', dy: '2', rate: '2' }] };
  assertGraderRejects(question, sameRate, 'two equal rates');
});

/* ----------------------------------------------------- deriveEquation */

test('deriveEquation: m, b and the equation are the fitted line, and the grader accepts them as typed', () => {
  DERIVE_EQUATION.forEach(([label, question]) => {
    assert.ok(question, label);
    const rows = normalizeRows(question.rows);
    const model = reviewOf(question, label);
    const work = workFromReview(model);
    assertIntervalsAreTruth(question, work, label);
    assert.equal(work.classification, 'linear', label);
    const fit = fitTableLine(rows);
    assert.ok(Math.abs(value(work.m) - fit.m) < 1e-9, `${label}: m ${work.m} is the slope`);
    assert.ok(Math.abs(value(work.b) - fit.b) < 1e-9, `${label}: b ${work.b} is the intercept`);
    // The equation passes through every row of the table.
    rows.forEach((row) => assert.ok(Math.abs(value(work.m) * row.x + value(work.b) - row.y) < 1e-9, `${label}: (${row.x}, ${row.y}) on the line`));
    assertGraderAccepts(question, work, label);
    // A wrong intercept is rejected — in the b box and in the equation.
    assertGraderRejects(question, { ...work, b: String(value(work.b) + 1) }, `${label} / b + 1`);
    assertGraderRejects(question, { ...work, equation: `${work.equation} + 1` }, `${label} / equation + 1`);
    assert.ok(model.steps.includes(`So the equation is ${work.equation.replace(/-/g, '−')}.`), `${label}: the steps arrive at the equation`);
    assert.match(model.why, /^Check with Row \d+ /, `${label}: the check substitutes a row`);
  });
});

test('deriveEquation: a fraction slope is stated as a fraction (no decimal the grader would accept exists)', () => {
  const question = DERIVE_EQUATION.find(([label]) => label.startsWith('y = (1/3)x'))[1];
  const work = workFromReview(reviewOf(question, '1/3'));
  assert.equal(work.m, '1/3');
  assert.equal(work.b, '2/3');
  assert.equal(work.equation, 'y = (1/3)x + 2/3');
  // Rounded to four places the equation is no longer the table's line.
  assertGraderRejects(question, { ...work, equation: 'y = 0.3333x + 0.6667' }, 'rounded equation');
  const compiledDerive = workFromReview(reviewOf(compiledByMode('deriveEquation'), 'compiled derive'));
  assert.deepEqual([compiledDerive.m, compiledDerive.b, compiledDerive.equation], ['-2/3', '-5/3', 'y = -(2/3)x - 5/3']);
});

/* -------------------------------------------------------- repairValue */

test('repairValue: the offending row and its corrected value are the derived repair, and the grader accepts them', () => {
  REPAIR_VALUE.forEach(([label, question]) => {
    assert.ok(question, label);
    const rows = normalizeRows(question.rows);
    const repair = findTableRepair(rows);
    assert.ok(repair, `${label}: fixture has one broken row`);
    const model = reviewOf(question, label);
    const work = workFromReview(model);
    assertIntervalsAreTruth(question, work, label);
    assert.equal(work.repairRowIndex, repair.offendingIndex, `${label}: the offending row`);
    assert.ok(Math.abs(value(work.repairedValue) - repair.correctedY) < 1e-9, `${label}: corrected ${work.repairedValue}`);
    // The repaired table is linear, and that is the classification stated.
    const repaired = rows.map((row, index) => (index === repair.offendingIndex ? { x: row.x, y: value(work.repairedValue) } : row));
    assert.equal(tableClassification(repaired), 'linear');
    assert.equal(work.classification, 'linear', label);
    assertGraderAccepts(question, work, label);
    assertGraderRejects(question, { ...work, repairedValue: String(value(work.repairedValue) + 1) }, `${label} / value + 1`);
    assertGraderRejects(question, { ...work, repairRowIndex: (repair.offendingIndex + 1) % rows.length }, `${label} / another row`);
    assert.ok(model.steps.some((step) => step.includes(`so Row ${repair.offendingIndex + 1} is the offending row`)), `${label}: a step names the row`);
    assert.ok(model.steps.some((step) => step.startsWith('Extend the rate') && step.endsWith(`That is the corrected value for Row ${repair.offendingIndex + 1}.`)), `${label}: a step computes the value`);
    assert.match(model.why, /^Check: from \(/, `${label}: the check recomputes a rate through the corrected row`);
  });
});

test('repairValue: a corrected value that is a fraction is stated exactly', () => {
  const question = REPAIR_VALUE.find(([label]) => label.startsWith('corrected value is a fraction'))[1];
  const work = workFromReview(reviewOf(question, '10/3'));
  assert.equal(work.repairedValue, '10/3');
  assert.equal(work.repairRowIndex, 2);
});

/* ------------------------------------------------------------ nothing */

test('null, {} and malformed questions give null without throwing', () => {
  const throwingRows = { type: TOOL_ID, mode: 'constantRate' };
  Object.defineProperty(throwingRows, 'rows', { enumerable: true, get() { throw new Error('unreadable rows'); } });
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['{}', {}],
    ['an array', []],
    ['a string', 'linearTableWorkbench'],
    ['a number', 42],
    ['rows not an array', q('constantRate', 'x,y')],
    ['two rows', q('constantRate', pts([0, 1], [1, 2]))],
    ['a non-numeric coordinate', q('constantRate', pts([0, 1], [1, 'two'], [2, 3]))],
    ['a repeated x (not a function)', q('constantRate', pts([0, 1], [1, 2], [1, 3], [2, 4]))],
    ['more intervals than row pairs (Check never enables)', q('constantRate', pts([0, 1], [1, 2], [2, 3]), { requiredComparisons: 4 })],
    ['deriveEquation without a constant rate', q('deriveEquation', pts([0, 0], [1, 1], [2, 4], [3, 9]))],
    ['repairValue on a table that is already linear', q('repairValue', pts([0, 1], [1, 3], [2, 5], [3, 7], [4, 9]), { requiredComparisons: 2 })],
    ['repairValue with two broken rows', q('repairValue', pts([0, 1], [1, 30], [2, 5], [3, 40], [4, 9]), { requiredComparisons: 2 })],
    ['repairValue with only three rows', q('repairValue', pts([0, 1], [1, 9], [2, 5]))],
    ['rows that throw when read', throwingRows],
  ];
  cases.forEach(([label, question]) => {
    assert.doesNotThrow(() => buildLinearTableWorkbenchReview(question), label);
    assert.equal(buildLinearTableWorkbenchReview(question), null, label);
    if (question && typeof question === 'object' && !Array.isArray(question) && label !== 'rows that throw when read') {
      assert.equal(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), null, `${label} via the index`);
    }
  });
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null);
});
