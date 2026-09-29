import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveLinearMultipleRepresentations,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  formatNormalizedStandard,
  normalizeStandardCoefficients,
  parsePointSlopeForm,
  scoreLinearMultipleRepresentations,
  validateLinearMultipleRepresentationsQuestion,
  validatePointSlopeEntry,
  validateSlopeEntry,
  validateSlopeInterceptEntry,
  validateStandardFormEntry,
  validateTableEntry,
  validateTwoPointsEntry,
  validateXInterceptEntry,
  validateYInterceptEntry,
} from '../../src/tools/representationBridge/linearMultipleRepresentationsMath.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

// -----------------------------------------------------------------------------
// 1. Canonical line derivation from every supported source kind
// -----------------------------------------------------------------------------
test('canonical line derivation: standardForm source equation', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.canonicalLine.m.n, 1);
  assert.equal(derived.canonicalLine.m.d, 2);
  assert.equal(derived.yInterceptNumber, -3);
  assert.equal(derived.zeroNumber, 6);
  assert.deepEqual(derived.standard, { A: 1, B: -2, C: 6 });
  assert.equal(derived.standardEquation, 'x - 2y = 6');
});

test('canonical line derivation: standardForm source coefficients A, B, C', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', A: 3, B: 2, C: 12 },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, -1.5);
  assert.equal(derived.yInterceptNumber, 6);
  assert.equal(derived.zeroNumber, 4);
});

test('canonical line derivation: slopeIntercept source', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'slopeIntercept', equation: 'y = 1/2x - 3' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.yInterceptNumber, -3);
  assert.equal(derived.zeroNumber, 6);
});

test('canonical line derivation: pointSlope source', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'pointSlope', equation: 'y + 2 = 1/2(x - 2)' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.yInterceptNumber, -3);
  assert.equal(derived.zeroNumber, 6);
});

test('canonical line derivation: twoPoints source', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'twoPoints', points: [[6, 0], [0, -3]] },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.yInterceptNumber, -3);
  assert.equal(derived.zeroNumber, 6);
});

test('canonical line derivation: table source', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'table',
      rows: [
        { x: 0, y: -3 },
        { x: 2, y: -2 },
        { x: 4, y: -1 },
        { x: 6, y: 0 },
      ],
    },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.yInterceptNumber, -3);
  assert.equal(derived.zeroNumber, 6);
});

test('canonical line derivation: graph source', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'graph', points: [[6, 0], [0, -3]] },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.yInterceptNumber, -3);
});

test('canonical line derivation: scenario source (candle problem)', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'scenario',
      prompt: 'A candle is 18 inches tall when it is lit and burns down at a constant rate of 2 inches per hour.',
      m: -2,
      b: 18,
    },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, -2);
  assert.equal(derived.yInterceptNumber, 18);
  assert.equal(derived.zeroNumber, 9);
});

test('vertical lines are explicitly rejected with a clear message', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'twoPoints', points: [[3, 1], [3, 5]] },
  };
  const errors = validateLinearMultipleRepresentationsQuestion(q);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((msg) => /vertical/i.test(msg)));
});

test('horizontal lines are explicitly rejected with a clear message', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'twoPoints', points: [[1, 4], [5, 4]] },
  };
  const errors = validateLinearMultipleRepresentationsQuestion(q);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((msg) => /nonzero/i.test(msg)));
});

// -----------------------------------------------------------------------------
// 2. Standard Form structural and normalization validation
// -----------------------------------------------------------------------------
test('standard form: normalized Ax + By = C accepted', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validateStandardFormEntry('x - 2y = 6', derived);
  assert.equal(res.isCorrect, true);
  assert.deepEqual(res.standard, { A: 1, B: -2, C: 6 });
});

test('standard form: unreduced equation is rejected with reduction instruction', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validateStandardFormEntry('2x - 4y = 12', derived);
  assert.equal(res.isCorrect, false);
  assert.match(res.error, /common factor/i);
});

test('standard form: negative leading coefficient is rejected with instruction', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validateStandardFormEntry('-x + 2y = -6', derived);
  assert.equal(res.isCorrect, false);
  assert.match(res.error, /positive leading coefficient/i);
});

test('standard form: slope-intercept equation is rejected as wrong structure', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validateStandardFormEntry('y = 1/2x - 3', derived);
  assert.equal(res.isCorrect, false);
  assert.match(res.error, /standard form/i);
});

// -----------------------------------------------------------------------------
// 3. Slope-Intercept Form structural validation
// -----------------------------------------------------------------------------
test('slope-intercept: correct y = mx + b accepted', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validateSlopeInterceptEntry('y = 1/2x - 3', derived);
  assert.equal(res.isCorrect, true);
});

test('slope-intercept: equivalent standard form rejected as wrong structure', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validateSlopeInterceptEntry('x - 2y = 6', derived);
  assert.equal(res.isCorrect, false);
  assert.match(res.error, /slope-intercept/i);
});

// -----------------------------------------------------------------------------
// 4. Point-Slope Form: multiple valid equations & point validation
// -----------------------------------------------------------------------------
test('point-slope: accepts multiple valid points on the line', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  // Points on line y = 1/2x - 3:
  // (2, -2)
  assert.equal(validatePointSlopeEntry('y + 2 = 1/2(x - 2)', derived).isCorrect, true);
  // (8, 1)
  assert.equal(validatePointSlopeEntry('y - 1 = 1/2(x - 8)', derived).isCorrect, true);
  // (6, 0)
  assert.equal(validatePointSlopeEntry('y - 0 = 1/2(x - 6)', derived).isCorrect, true);
  assert.equal(validatePointSlopeEntry('y = 1/2(x - 6)', derived).isCorrect, true);
  // (0, -3)
  assert.equal(validatePointSlopeEntry('y + 3 = 1/2x', derived).isCorrect, true);
  // (4, -1)
  assert.equal(validatePointSlopeEntry('y + 1 = 1/2(x - 4)', derived).isCorrect, true);
});

test('point-slope: rejects point that does not lie on the line', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  // (3, -2) is not on y = 1/2x - 3 (1/2*3 - 3 = -1.5 != -2)
  const res = validatePointSlopeEntry('y + 2 = 1/2(x - 3)', derived);
  assert.equal(res.isCorrect, false);
  assert.match(res.error, /does not lie on this line/i);
});

test('point-slope: rejects incorrect slope', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validatePointSlopeEntry('y + 2 = 2(x - 2)', derived);
  assert.equal(res.isCorrect, false);
  assert.match(res.error, /slope/i);
});

test('point-slope: rejects slope-intercept form as wrong structure', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const res = validatePointSlopeEntry('y = 1/2x - 3', derived);
  assert.equal(res.isCorrect, false);
});

// -----------------------------------------------------------------------------
// 5. Exact fraction handling
// -----------------------------------------------------------------------------
test('exact fraction preservation: 1/2 is not coerced to floating decimal in display', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  assert.equal(derived.slopeFraction.n, 1);
  assert.equal(derived.slopeFraction.d, 2);
  assert.match(derived.slopeInterceptEquation, /1\/2x/);
  assert.doesNotMatch(derived.slopeInterceptEquation, /0\.5/);
});

// -----------------------------------------------------------------------------
// 6. Features validation
// -----------------------------------------------------------------------------
test('features: slope accepts fraction and equivalent decimal', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  assert.equal(validateSlopeEntry('1/2', derived).isCorrect, true);
  assert.equal(validateSlopeEntry('0.5', derived).isCorrect, true);
  assert.equal(validateSlopeEntry('2/4', derived).isCorrect, true);
  assert.equal(validateSlopeEntry('1/3', derived).isCorrect, false);
});

test('features: x-intercept requires valid ordered pair (6, 0)', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  assert.equal(validateXInterceptEntry('(6, 0)', derived).isCorrect, true);
  assert.equal(validateXInterceptEntry('6, 0', derived).isCorrect, true);
  assert.equal(validateXInterceptEntry('(6, 1)', derived).isCorrect, false);
  assert.equal(validateXInterceptEntry('(0, 6)', derived).isCorrect, false);
});

test('features: y-intercept requires valid ordered pair (0, -3)', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  assert.equal(validateYInterceptEntry('(0, -3)', derived).isCorrect, true);
  assert.equal(validateYInterceptEntry('(-3, 0)', derived).isCorrect, false);
});

test('features: two points requires two distinct points on the line', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  // Valid points (2, -2) and (4, -1)
  assert.equal(validateTwoPointsEntry('(2, -2)', '(4, -1)', derived).isCorrect, true);
  // Duplicate points
  assert.equal(validateTwoPointsEntry('(2, -2)', '(2, -2)', derived).isCorrect, false);
  // Off-line point (1, 1)
  assert.equal(validateTwoPointsEntry('(2, -2)', '(1, 1)', derived).isCorrect, false);
});

// -----------------------------------------------------------------------------
// 7. Table validation
// -----------------------------------------------------------------------------
test('table: 4 valid points on line pass, invalid or fewer points fail', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const validRows = [
    { x: 0, y: -3 },
    { x: 2, y: -2 },
    { x: 4, y: -1 },
    { x: 6, y: 0 },
  ];
  assert.equal(validateTableEntry(validRows, derived, 4).isCorrect, true);

  // Too few rows
  assert.equal(validateTableEntry(validRows.slice(0, 3), derived, 4).isCorrect, false);

  // Repeated x
  const repeatedX = [
    { x: 0, y: -3 },
    { x: 0, y: -3 },
    { x: 4, y: -1 },
    { x: 6, y: 0 },
  ];
  assert.equal(validateTableEntry(repeatedX, derived, 4).isCorrect, false);

  // Point off line
  const offLine = [
    { x: 0, y: -3 },
    { x: 2, y: 5 },
    { x: 4, y: -1 },
    { x: 6, y: 0 },
  ];
  assert.equal(validateTableEntry(offLine, derived, 4).isCorrect, false);
});

// -----------------------------------------------------------------------------
// 8. Graph Method Evidence (Three Independent Graphs)
// -----------------------------------------------------------------------------
test('graph 1: requires both actual intercepts as method evidence', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  // Correct intercepts: (6, 0) and (0, -3)
  const correct = evaluateGraph1Intercepts([[6, 0], [0, -3]], derived);
  assert.equal(correct.isCorrect, true);

  // Two arbitrary correct points on the line: (2, -2) and (4, -1) -> rejected for method evidence
  const wrongEvidence = evaluateGraph1Intercepts([[2, -2], [4, -1]], derived);
  assert.equal(wrongEvidence.isCorrect, false);
  assert.equal(wrongEvidence.category, 'correctLineMissingAnchor');
});

test('graph 2: requires y-intercept and slope-step evidence', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  // y-intercept (0, -3) and rise 1, run 2 => (2, -2)
  const correct = evaluateGraph2SlopeIntercept([[0, -3], [2, -2]], derived);
  assert.equal(correct.isCorrect, true);

  // Arbitrary two points without y-intercept: (2, -2) and (4, -1)
  const wrongEvidence = evaluateGraph2SlopeIntercept([[2, -2], [4, -1]], derived);
  assert.equal(wrongEvidence.isCorrect, false);
  assert.equal(wrongEvidence.category, 'correctLineMissingAnchor');
});

test('graph 3: requires student point from point-slope form and slope step', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  // Student chose point (2, -2). Plotted (2, -2) and (4, -1)
  const correct = evaluateGraph3PointSlope([[2, -2], [4, -1]], derived, [2, -2]);
  assert.equal(correct.isCorrect, true);

  // Student chose (2, -2) but plotted other points without (2, -2)
  const wrongAnchor = evaluateGraph3PointSlope([[0, -3], [6, 0]], derived, [2, -2]);
  assert.equal(wrongAnchor.isCorrect, false);
  assert.equal(wrongAnchor.category, 'correctLineMissingAnchor');
});

// -----------------------------------------------------------------------------
// 9. Full Board Scoring and Cross-Representation Inconsistency
// -----------------------------------------------------------------------------
test('scoreLinearMultipleRepresentations: full correct submission passes with 100%', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  };
  const response = {
    slopeInterceptEquation: 'y = 1/2x - 3',
    pointSlopeEquation: 'y + 2 = 1/2(x - 2)',
    featureSlope: '1/2',
    featureXIntercept: '(6, 0)',
    featureYIntercept: '(0, -3)',
    featurePoint1: '(2, -2)',
    featurePoint2: '(4, -1)',
    tableRows: [{ x: 0, y: -3 }, { x: 2, y: -2 }, { x: 4, y: -1 }, { x: 6, y: 0 }],
    graph1Points: [[6, 0], [0, -3]],
    graph2Points: [[0, -3], [2, -2]],
    graph3Points: [[2, -2], [4, -1]],
  };
  const result = scoreLinearMultipleRepresentations(q, response);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  assert.equal(result.parts.crossRepresentationConsistency, true);
});

test('scoreLinearMultipleRepresentations: inconsistent representations lose consistency credit and report mismatch', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  };
  const response = {
    slopeInterceptEquation: 'y = 1/2x - 3', // m = 1/2, b = -3
    pointSlopeEquation: 'y - 1 = 2(x - 1)',  // m = 2, b = -1 (contradicts slope-intercept)
    featureSlope: '1/2',
    featureXIntercept: '(6, 0)',
    featureYIntercept: '(0, -3)',
    featurePoint1: '(2, -2)',
    featurePoint2: '(4, -1)',
    tableRows: [{ x: 0, y: -3 }, { x: 2, y: -2 }, { x: 4, y: -1 }, { x: 6, y: 0 }],
    graph1Points: [[6, 0], [0, -3]],
    graph2Points: [[0, -3], [2, -2]],
    graph3Points: [[2, -2], [4, -1]],
  };
  const result = scoreLinearMultipleRepresentations(q, response);
  assert.equal(result.isCorrect, false);
  assert.equal(result.parts.pointSlope, false);
  assert.equal(result.parts.crossRepresentationConsistency, false);
  assert.ok(result.evidence.crossRepresentationConsistency.disagreements.length > 0);
});

// -----------------------------------------------------------------------------
// 10. V5 / Preflight Authoring Configuration
// -----------------------------------------------------------------------------
test('V5 compiler compiles linearMultipleRepresentations intent to representationBridge', () => {
  const v5 = {
    schemaVersion: 5,
    assignment: { title: 'Board test', courseId: 'algebra1', assignmentType: 'notesClasswork' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.2B',
        prompt: 'Connect multiple representations of this linear relationship.',
        studentActions: ['connectMultipleRepresentations'],
        mode: 'linearMultipleRepresentations',
        source: { kind: 'standardForm', equation: '2x - 4y = 12' },
        feedbackTiming: 'guided',
      }],
    }],
  };
  const compiled = compileAuthoringIntentV5(v5);
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'representationBridge');
  assert.equal(question.mode, 'linearMultipleRepresentations');
  assert.equal(validateToolQuestion(question).isValid, true);
  assert.doesNotThrow(() => validateAssignmentQuestions([question]));
});
