import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findTableRepair,
  intervalTruth,
  isCollinear,
  scoreLinearTableWorkbench,
  tableClassification,
  validateLinearTableWorkbenchQuestion,
} from '../../src/tools/linearTableWorkbench/linearTableWorkbenchMath.js';

const equalSpacing = [{ x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 9 }];
const irregularSpacing = [{ x: -3, y: 16 }, { x: 1, y: 8 }, { x: 4, y: 2 }, { x: 9, y: -8 }];
const negativeRate = [{ x: -2, y: 10 }, { x: 0, y: 6 }, { x: 3, y: 0 }];
const fractionalRate = [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 6, y: 3 }];
const nonlinear = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }];

test('constant rate with equal x spacing is recognized as linear', () => {
  assert.equal(tableClassification(equalSpacing), 'linear');
});

test('constant rate with irregular x spacing is still recognized as linear', () => {
  assert.equal(tableClassification(irregularSpacing), 'linear');
  const truth = intervalTruth(irregularSpacing[0], irregularSpacing[3]);
  assert.equal(truth.rate, -2);
});

test('negative rate tables classify as linear with a negative rate', () => {
  assert.equal(tableClassification(negativeRate), 'linear');
  const truth = intervalTruth(negativeRate[0], negativeRate[2]);
  assert.equal(truth.rate, -2);
});

test('fractional rate tables classify as linear with a non-integer rate', () => {
  assert.equal(tableClassification(fractionalRate), 'linear');
  const truth = intervalTruth(fractionalRate[0], fractionalRate[1]);
  assert.equal(truth.rate, 0.5);
});

test('a nonlinear table is not collinear', () => {
  assert.equal(tableClassification(nonlinear), 'nonlinear');
  assert.equal(isCollinear(nonlinear), false);
});

test('grading rejects the same row pair recorded twice as separate evidence', () => {
  const question = { type: 'linearTableWorkbench', mode: 'constantRate', rows: equalSpacing, requiredComparisons: 2 };
  const response = {
    evidence: [
      { i: 0, j: 1, dx: 1, dy: 2, rate: 2 },
      { i: 1, j: 0, dx: 1, dy: 2, rate: 2 }, // same unordered pair, order swapped
    ],
    classification: 'linear',
  };
  const result = scoreLinearTableWorkbench(question, response);
  assert.equal(result.parts.evidenceCount, false, 'a repeated pair must not count toward the required comparisons');
});

test('grading requires enough distinct, accurate evidence before rewarding classification alone', () => {
  const question = { type: 'linearTableWorkbench', mode: 'constantRate', rows: equalSpacing, requiredComparisons: 2 };
  const response = {
    evidence: [
      { i: 0, j: 1, dx: 1, dy: 2, rate: 2 },
      { i: 1, j: 2, dx: 1, dy: 2, rate: 2 },
    ],
    classification: 'linear',
  };
  const result = scoreLinearTableWorkbench(question, response);
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts.evidenceAccuracy, true);
});

test('grading accepts fractional interval entries typed as a/b', () => {
  const question = { type: 'linearTableWorkbench', mode: 'constantRate', rows: fractionalRate, requiredComparisons: 2 };
  const response = {
    evidence: [
      { i: 0, j: 1, dx: 2, dy: 1, rate: '1/2' },
      { i: 1, j: 2, dx: 2, dy: 1, rate: '1/2' },
    ],
    classification: 'linear',
  };
  const result = scoreLinearTableWorkbench(question, response);
  assert.equal(result.parts.evidenceAccuracy, true);
});

test('repairValue derives the offending row mathematically instead of trusting a flag', () => {
  // Every row fits y = -2x + 10 except row 2, which was mistyped.
  const rows = [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 99 }, { x: 4, y: 2 }, { x: 6, y: -2 }];
  const repair = findTableRepair(rows);
  assert.equal(repair.offendingIndex, 2);
  assert.equal(repair.correctedY, 6);
});

test('a table with no unique inconsistency has no derivable repair', () => {
  assert.equal(findTableRepair(equalSpacing.concat([{ x: 4, y: 11 }])), null, 'an already-linear table has nothing to repair');
  assert.equal(findTableRepair(nonlinear), null, 'more than one break cannot be uniquely repaired');
});

test('repairValue grading checks the identified row, corrected value, and post-repair classification', () => {
  const rows = [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 99 }, { x: 4, y: 2 }, { x: 6, y: -2 }];
  const question = { type: 'linearTableWorkbench', mode: 'repairValue', rows, requiredComparisons: 2 };
  const goodResponse = {
    evidence: [
      { i: 0, j: 1, dx: 2, dy: -4, rate: -2 },
      { i: 3, j: 4, dx: 2, dy: -4, rate: -2 },
    ],
    repairRowIndex: 2,
    repairedValue: 6,
    classification: 'linear',
  };
  const result = scoreLinearTableWorkbench(question, goodResponse);
  assert.equal(result.parts.repairIndex, true);
  assert.equal(result.parts.repairValue, true);
  assert.equal(result.parts.classification, true);
  assert.equal(result.isCorrect, true);

  const wrongIndexResponse = { ...goodResponse, repairRowIndex: 0 };
  const wrongResult = scoreLinearTableWorkbench(question, wrongIndexResponse);
  assert.equal(wrongResult.parts.repairIndex, false);
  assert.equal(wrongResult.isCorrect, false);
});

test('deriveEquation grading solves for m and b and checks the written equation', () => {
  const rows = [{ x: -3, y: 16 }, { x: 1, y: 8 }, { x: 4, y: 2 }, { x: 9, y: -8 }];
  const question = { type: 'linearTableWorkbench', mode: 'deriveEquation', rows, requiredComparisons: 2 };
  const response = {
    evidence: [
      { i: 0, j: 1, dx: 4, dy: -8, rate: -2 },
      { i: 2, j: 3, dx: 5, dy: -10, rate: -2 },
    ],
    classification: 'linear',
    m: -2,
    b: 10,
    equation: 'y = -2x + 10',
  };
  const result = scoreLinearTableWorkbench(question, response);
  assert.equal(result.parts.slope, true);
  assert.equal(result.parts.intercept, true);
  assert.equal(result.parts.equation, true);
  assert.equal(result.isCorrect, true);
});

test('validation blocks a malformed deriveEquation question instead of falling back to a default', () => {
  const errors = validateLinearTableWorkbenchQuestion({
    type: 'linearTableWorkbench', mode: 'deriveEquation', rows: nonlinear, requiredComparisons: 2,
  });
  assert.ok(errors.some((message) => /constant rate of change/.test(message)));
});

test('validation blocks repairValue authoring whose repair.rowIndex disagrees with the derived row', () => {
  const rows = [{ x: -2, y: 14 }, { x: 0, y: 10 }, { x: 2, y: 99 }, { x: 4, y: 2 }, { x: 6, y: -2 }];
  const errors = validateLinearTableWorkbenchQuestion({
    type: 'linearTableWorkbench', mode: 'repairValue', rows, requiredComparisons: 2, repair: { rowIndex: 0 },
  });
  assert.ok(errors.some((message) => /does not match the mathematically derived/.test(message)));
});

test('validation rejects duplicate x-values, too few rows, and out-of-range requiredComparisons', () => {
  assert.ok(validateLinearTableWorkbenchQuestion({ rows: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).length > 0);
  assert.ok(validateLinearTableWorkbenchQuestion({ rows: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 2 }] })
    .some((message) => /distinct x-values/.test(message)));
  assert.ok(validateLinearTableWorkbenchQuestion({ rows: equalSpacing, requiredComparisons: 99 })
    .some((message) => /cannot exceed/.test(message)));
});
