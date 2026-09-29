import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCrossRepresentationConsistency,
  deriveLinearMultipleRepresentations,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  formatNormalizedStandard,
  normalizeStandardCoefficients,
  parseNumericOrFraction,
  parseOrderedPair,
  parsePointSlopeForm,
  parseInequalityDomain,
  resolveLinearMultipleRepresentationsGraphBounds,
  resolveSnapStep,
  scoreLinearMultipleRepresentations,
  validateContextField,
  validateDomainField,
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

// -----------------------------------------------------------------------------
// 11. Graph 3 Anchor Handling: Cases A, B, and C
// -----------------------------------------------------------------------------
test('graph 3: Case A - given anchor in question source is strictly required', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'pointSlope', equation: 'y + 2 = 1/2(x - 2)', point: [2, -2] },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  // Correct: plots given anchor [2, -2] and slope step [4, -1]
  const resValid = evaluateGraph3PointSlope([[2, -2], [4, -1]], derived, [2, -2]);
  assert.equal(resValid.isCorrect, true);

  // Incorrect: plots other points on line ([0, -3] and [6, 0]) without given anchor
  const resMissingAnchor = evaluateGraph3PointSlope([[0, -3], [6, 0]], derived, [2, -2]);
  assert.equal(resMissingAnchor.isCorrect, false);
  assert.equal(resMissingAnchor.category, 'correctLineMissingAnchor');
});

test('graph 3: Case B - student-authored point-slope anchor is required', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  // Student authored point-slope using point (4, -1): y + 1 = 1/2(x - 4)
  const studentPoint = [4, -1];

  // Plotted [4, -1] and [6, 0]
  const valid = evaluateGraph3PointSlope([[4, -1], [6, 0]], derived, studentPoint);
  assert.equal(valid.isCorrect, true);

  // Plotted [2, -2] and [6, 0] (missing authored anchor [4, -1])
  const invalid = evaluateGraph3PointSlope([[2, -2], [6, 0]], derived, studentPoint);
  assert.equal(invalid.isCorrect, false);
  assert.equal(invalid.category, 'correctLineMissingAnchor');
});

test('graph 3: Case C - free-order graphing before point-slope authoring', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  // Student opens Graph 3 FIRST: studentPoint is null.
  // Student plots (2, -2) and (4, -1) on the line.
  const res = evaluateGraph3PointSlope([[2, -2], [4, -1]], derived, null);
  assert.equal(res.isCorrect, true);
  assert.equal(res.isFreeChoice, true);
  assert.deepEqual(res.anchorPoint, [2, -2]);
});

// -----------------------------------------------------------------------------
// 12. Table String Coherence & Cross-Representation Consistency
// -----------------------------------------------------------------------------
test('cross-representation consistency: string table inputs parse and participate', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const representations = {
    slopeInterceptEquation: 'y = 1/2x - 3',
    tableRows: [
      { x: '0', y: '-3' },
      { x: '2', y: '-2' },
      { x: '4', y: '-1' },
      { x: '6', y: '0' },
    ],
  };
  const result = checkCrossRepresentationConsistency(representations, derived);
  assert.equal(result.isConsistent, true);
  assert.equal(result.completedLineCount, 2);
  assert.equal(result.disagreements.length, 0);
});

test('cross-representation consistency: detects non-collinear or conflicting table rows', () => {
  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  const representations = {
    slopeInterceptEquation: 'y = 1/2x - 3',
    tableRows: [
      { x: '0', y: '0' },
      { x: '2', y: '2' },
      { x: '4', y: '4' },
    ],
  };
  const result = checkCrossRepresentationConsistency(representations, derived);
  assert.equal(result.isConsistent, false);
  assert.ok(result.disagreements.length > 0);
  assert.match(result.disagreements[0], /define different lines/i);
});

// -----------------------------------------------------------------------------
// 13. Internal Consistency of Mistaken Representations
// -----------------------------------------------------------------------------
test('internal consistency: student with mistaken line consistent across forms earns consistency credit', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' }, // canonical line: y = 1/2x - 3
  };
  // Student mistakenly believes line is y = 2x - 3, but is internally consistent:
  const studentWork = {
    slopeInterceptEquation: 'y = 2x - 3',
    pointSlopeEquation: 'y - 1 = 2(x - 2)', // point (2, 1), slope 2: y - 1 = 2x - 4 => y = 2x - 3
    featureSlope: '2',
    featureXIntercept: '(1.5, 0)',
    featureYIntercept: '(0, -3)',
    featurePoint1: '(0, -3)',
    featurePoint2: '(1, -1)',
    tableRows: [
      { x: '0', y: '-3' },
      { x: '1', y: '-1' },
      { x: '2', y: '1' },
      { x: '3', y: '3' },
    ],
    graph2Points: [[0, -3], [1, -1]],
  };

  const consistency = checkCrossRepresentationConsistency(studentWork);
  assert.equal(consistency.isConsistent, true);
  assert.ok(consistency.completedLineCount >= 4);

  // In full scoring, individual representations fail against canonical line,
  // but crossRepresentationConsistency is awarded true!
  const scoreResult = scoreLinearMultipleRepresentations(q, studentWork);
  assert.equal(scoreResult.parts.slopeIntercept, false);
  assert.equal(scoreResult.parts.pointSlope, false);
  assert.equal(scoreResult.parts.crossRepresentationConsistency, true);
});

test('internal consistency: contradictory representations are flagged with disagreement', () => {
  const studentWork = {
    slopeInterceptEquation: 'y = 2x - 3',
    pointSlopeEquation: 'y - 1 = 3(x - 2)', // slope 3 contradicts slope 2
  };
  const consistency = checkCrossRepresentationConsistency(studentWork);
  assert.equal(consistency.isConsistent, false);
  assert.equal(consistency.disagreements.length, 1);
  assert.match(consistency.disagreements[0], /Slope-Intercept Form and Point-Slope Form define different lines/);
});

// -----------------------------------------------------------------------------
// 14. Context Semantic Validation & X-Intercept Meaning
// -----------------------------------------------------------------------------
test('context semantic validation: choice bank, accepted answers, normalization, and x-intercept meaning', () => {
  // Choice bank
  const choiceBankSpec = { choices: ['Time in hours', 'Height in inches'], answer: 'Time in hours' };
  assert.equal(validateContextField('Time in hours', choiceBankSpec).valid, true);
  assert.equal(validateContextField('Height in inches', choiceBankSpec).valid, false);

  // Accepted answers array
  const acceptedAnswersSpec = { acceptedAnswers: ['burn rate', 'rate candle burns', 'inches per hour'] };
  assert.equal(validateContextField('burn rate', acceptedAnswersSpec).valid, true);
  assert.equal(validateContextField('rate candle burns', acceptedAnswersSpec).valid, true);
  assert.equal(validateContextField('  Inches per hour. ', acceptedAnswersSpec).valid, true); // Case & whitespace trimmed
  assert.equal(validateContextField('starting height', acceptedAnswersSpec).valid, false);

  // x-intercept meaning
  const xIntSpec = { acceptedAnswers: ['time until burned out', 'hours until height is 0', 'when candle is gone'] };
  assert.equal(validateContextField('time until burned out', xIntSpec).valid, true);
  assert.equal(validateContextField('hours until height is 0', xIntSpec).valid, true);
});

// -----------------------------------------------------------------------------
// 15. Rational-Aware SnapStep Resolution
// -----------------------------------------------------------------------------
test('resolveSnapStep: fractional slopes and intercepts resolve correct grid step', () => {
  // Slope 1/2 => snapStep 0.5
  const halfDerived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  assert.equal(resolveSnapStep({}, halfDerived), 0.5);

  // Slope 3/4 with integer intercept => snapStep 0.25
  const quarterDerived = { slopeFraction: { n: 3, d: 4 }, yInterceptFraction: { n: 3, d: 1 }, zeroFraction: { n: -4, d: 1 } };
  assert.equal(resolveSnapStep({}, quarterDerived), 0.25);

  // Multiple denominators (4 and 3) => LCM(4, 3) = 12 => snapStep 0.0833
  const multiDerived = { slopeFraction: { n: 3, d: 4 }, yInterceptFraction: { n: 1, d: 1 }, zeroFraction: { n: -4, d: 3 } };
  assert.equal(resolveSnapStep({}, multiDerived), 0.0833);

  // Integer line => snapStep 1
  const integerDerived = deriveLinearMultipleRepresentations({
    source: { kind: 'slopeIntercept', equation: 'y = 2x + 4' },
  });
  assert.equal(resolveSnapStep({}, integerDerived), 1);

  // Explicit snapStep takes precedence
  assert.equal(resolveSnapStep({ snapStep: 0.1 }, halfDerived), 0.1);
});

// -----------------------------------------------------------------------------
// 16. MathLive LaTeX Unwrapping
// -----------------------------------------------------------------------------
test('LaTeX unwrapping: parses fractions, coordinates, and equations from MathInput', () => {
  assert.equal(parseNumericOrFraction('\\frac{1}{2}')?.number, 0.5);
  assert.equal(parseNumericOrFraction('-\\frac{3}{4}')?.number, -0.75);

  assert.deepEqual(parseOrderedPair('(\\frac{1}{2}, -3)'), [0.5, -3]);
  assert.deepEqual(parseOrderedPair('\\left(2, -\\frac{3}{2}\\right)'), [2, -1.5]);

  const derived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });

  // Slope with LaTeX fraction
  assert.equal(validateSlopeEntry('\\frac{1}{2}', derived).isCorrect, true);

  // Slope-intercept with LaTeX
  assert.equal(validateSlopeInterceptEntry('y = \\frac{1}{2}x - 3', derived).isCorrect, true);

  // Point-slope with LaTeX
  assert.equal(validatePointSlopeEntry('y + 2 = \\frac{1}{2}(x - 2)', derived).isCorrect, true);
});

// -----------------------------------------------------------------------------
// 17. Scenario Authoring Intent V5 Compilation and Scoring
// -----------------------------------------------------------------------------
test('V5 compiler compiles scenario intent and scores 100% when all parts including context are answered', () => {
  const v5 = {
    schemaVersion: 5,
    assignment: { title: 'Scenario Board', courseId: 'algebra1', assignmentType: 'notesClasswork' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.2B',
        prompt: 'A candle is 18 inches tall and burns at 2 inches per hour.',
        studentActions: ['connectMultipleRepresentations'],
        mode: 'linearMultipleRepresentations',
        source: {
          kind: 'scenario',
          prompt: 'A candle is 18 inches tall and burns at 2 inches per hour.',
          m: -2,
          b: 18,
          context: {
            independentQuantity: 'Time (hours)',
            dependentQuantity: 'Height (inches)',
            slopeMeaning: 'Rate candle burns',
            yInterceptMeaning: 'Initial height',
            xInterceptMeaning: 'Time until burned out',
          },
        },
      }],
    }],
  };

  const compiled = compileAuthoringIntentV5(v5);
  const q = compiled.package.sections[0].questions[0];
  assert.equal(q.type, 'representationBridge');
  assert.equal(q.mode, 'linearMultipleRepresentations');
  assert.equal(q.source.kind, 'scenario');
  assert.ok(q.context || q.source.context);

  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.slopeNumber, -2);
  assert.equal(derived.yInterceptNumber, 18);
  assert.equal(derived.zeroNumber, 9);

  const fullResponse = {
    standardFormEquation: '2x + y = 18',
    slopeInterceptEquation: 'y = -2x + 18',
    pointSlopeEquation: 'y - 14 = -2(x - 2)',
    featureSlope: '-2',
    featureXIntercept: '(9, 0)',
    featureYIntercept: '(0, 18)',
    featurePoint1: '(2, 14)',
    featurePoint2: '(4, 10)',
    tableRows: [
      { x: 0, y: 18 },
      { x: 2, y: 14 },
      { x: 4, y: 10 },
      { x: 6, y: 6 },
    ],
    graph1Points: [[9, 0], [0, 18]],
    graph2Points: [[0, 18], [1, 16]],
    graph3Points: [[2, 14], [3, 12]],
    contextIndependent: 'Time (hours)',
    contextDependent: 'Height (inches)',
    contextSlopeMeaning: 'Rate candle burns',
    contextYInterceptMeaning: 'Initial height',
    contextXInterceptMeaning: 'Time until burned out',
  };

  const result = scoreLinearMultipleRepresentations(q, fullResponse);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  assert.equal(result.parts.contextIndependent, true);
  assert.equal(result.parts.contextDependent, true);
  assert.equal(result.parts.contextSlopeMeaning, true);
  assert.equal(result.parts.contextYInterceptMeaning, true);
  assert.equal(result.parts.contextXInterceptMeaning, true);
});

// -----------------------------------------------------------------------------
// 18. Given Graph Line Format
// -----------------------------------------------------------------------------
test('given graph source: produces numeric CoordinatePlane line values (not Fraction object or NaN)', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'graph', line: { m: 0.5, b: -3 } },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.ok(derived.displayLine);
  assert.equal(typeof derived.displayLine.m, 'number');
  assert.equal(typeof derived.displayLine.b, 'number');
  assert.equal(derived.displayLine.m, 0.5);
  assert.equal(derived.displayLine.b, -3);
  assert.equal(Number.isNaN(derived.displayLine.m), false);
  assert.equal(Number.isNaN(derived.displayLine.b), false);
});

// -----------------------------------------------------------------------------
// 19. Two-Points Source: Given, Not Re-entered
// -----------------------------------------------------------------------------
test('twoPoints source: Two Points feature is given and not re-entered or scored', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'twoPoints', points: [[6, 0], [0, -3]] },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.isValid, true);
  assert.ok(derived.twoPoints);
  assert.deepEqual(derived.twoPoints.point1, [6, 0]);
  assert.deepEqual(derived.twoPoints.point2, [0, -3]);

  // Student completes forms, slope, intercepts, table, and graphs,
  // but leaves featurePoint1 and featurePoint2 blank because they were given!
  const response = {
    standardFormEquation: 'x - 2y = 6',
    slopeInterceptEquation: 'y = 1/2x - 3',
    pointSlopeEquation: 'y + 3 = 1/2(x - 0)',
    featureSlope: '1/2',
    featureXIntercept: '(6, 0)',
    featureYIntercept: '(0, -3)',
    featurePoint1: '',
    featurePoint2: '',
    tableRows: [{ x: 0, y: -3 }, { x: 2, y: -2 }, { x: 4, y: -1 }, { x: 6, y: 0 }],
    graph1Points: [[6, 0], [0, -3]],
    graph2Points: [[0, -3], [2, -2]],
    graph3Points: [[0, -3], [2, -2]],
  };

  const result = scoreLinearMultipleRepresentations(q, response);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  // parts.twoPoints should not be required or scored
  assert.equal(result.parts.twoPoints, undefined);
  // The given points participate in cross-representation consistency
  assert.equal(result.parts.crossRepresentationConsistency, true);
});

// -----------------------------------------------------------------------------
// 20. Default Graph Bounds for Large/Offset Lines
// -----------------------------------------------------------------------------
test('default graph bounds: resolves bounds containing required intercepts for y = x - 20', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'slopeIntercept', equation: 'y = x - 20' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.zeroNumber, 20);
  assert.equal(derived.yInterceptNumber, -20);

  const bounds = resolveLinearMultipleRepresentationsGraphBounds(q, derived);
  // Bounds must comfortably contain (20, 0) and (0, -20)
  assert.ok(bounds.xMin <= 0 && bounds.xMax >= 20);
  assert.ok(bounds.yMin <= -20 && bounds.yMax >= 0);
});

// -----------------------------------------------------------------------------
// 21. Authored Graph Bounds Preflight
// -----------------------------------------------------------------------------
test('preflight: rejects authored graphBounds that exclude required anchors', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'slopeIntercept', equation: 'y = x - 20' },
    graphBounds: { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }, // Excludes (20, 0) and (0, -20)
  };
  const errors = validateLinearMultipleRepresentationsQuestion(q);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((err) => /x-intercept/i.test(err)));
  assert.ok(errors.some((err) => /y-intercept/i.test(err)));
});

// -----------------------------------------------------------------------------
// 22. Malformed Source Table Preflight
// -----------------------------------------------------------------------------
test('preflight: rejects table source with non-finite or null cell', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'table',
      rows: [
        { x: 0, y: -3 },
        { x: null, y: -2 },
        { x: 4, y: -1 },
      ],
    },
  };
  const errors = validateLinearMultipleRepresentationsQuestion(q);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((err) => /finite numerical coordinates in every row/i.test(err)));
});

// -----------------------------------------------------------------------------
// 23. Domain Evaluation: Array, String Inequality, and Choice Bank
// -----------------------------------------------------------------------------
test('domain validation: accepts inequality notation, arrays, choice banks, and normalized formats', () => {
  // Expected array [0, 9]
  assert.equal(validateDomainField('0 <= x <= 9', [0, 9]).isCorrect, true);
  assert.equal(validateDomainField('0 ≤ x ≤ 9', [0, 9]).isCorrect, true);
  assert.equal(validateDomainField('0 \\le x \\le 9', [0, 9]).isCorrect, true);
  assert.equal(validateDomainField('[0, 9]', [0, 9]).isCorrect, true);
  assert.equal(validateDomainField([0, 9], [0, 9]).isCorrect, true);
  assert.equal(validateDomainField('0 <= x <= 12', [0, 9]).isCorrect, false);

  // Expected string inequality
  assert.equal(validateDomainField('0 <= x <= 9', '0 ≤ x ≤ 9').isCorrect, true);
  assert.equal(validateDomainField('0 ≤ x ≤ 9', '0 <= x <= 9').isCorrect, true);

  // Expected choice bank object
  const choiceBank = { choices: ['0 ≤ x ≤ 9', 'x ≥ 0', '0 ≤ y ≤ 18'], answer: '0 ≤ x ≤ 9' };
  assert.equal(validateDomainField('0 ≤ x ≤ 9', choiceBank).isCorrect, true);
  assert.equal(validateDomainField('x ≥ 0', choiceBank).isCorrect, false);
});

// -----------------------------------------------------------------------------
// 24. Graph 3 Fractional Point on Integer Line
// -----------------------------------------------------------------------------
test('graph 3: accepts and calculates grid snap for student-chosen fractional point on integer line', () => {
  // Line with integer slope and integer intercepts: y = 2x - 4 has m=2, b=-4, x_int=2
  const integerLineQ = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'slopeIntercept', equation: 'y = 2x - 4' },
  };
  const integerDerived = deriveLinearMultipleRepresentations(integerLineQ);
  assert.equal(integerDerived.slopeNumber, 2);
  assert.equal(integerDerived.yInterceptNumber, -4);
  assert.equal(integerDerived.zeroNumber, 2);
  // Base snap step without student point is 1
  assert.equal(resolveSnapStep(integerLineQ, integerDerived), 1);

  // Student authors valid point-slope form with fractional point: (0.5, -3)
  const fracPoint = [0.5, -3];
  assert.equal(resolveSnapStep(integerLineQ, integerDerived, [fracPoint]), 0.5);

  // Target line y = 2x + 1 from reviewer prompt:
  // Student authors valid point-slope form: y - 2 = 2(x - 1/2)
  // which uses point (1/2, 2) on the line
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'slopeIntercept', equation: 'y = 2x + 1' },
  };
  const derived = deriveLinearMultipleRepresentations(q);
  assert.equal(derived.slopeNumber, 2);
  assert.equal(derived.yInterceptNumber, 1);

  const studentPoint = [0.5, 2];
  const snapWithStudentPoint = resolveSnapStep(q, derived, [studentPoint]);
  assert.equal(snapWithStudentPoint, 0.5);

  // If student authors smaller fraction e.g. (1/4, 1.5), snap step adjusts via LCM
  const quarterPoint = [0.25, 1.5];
  assert.equal(resolveSnapStep(q, derived, [quarterPoint]), 0.25);

  // Student plots their chosen point (0.5, 2) and step point (1.5, 4)
  const g3Res = evaluateGraph3PointSlope([[0.5, 2], [1.5, 4]], derived, studentPoint);
  assert.equal(g3Res.isCorrect, true);
  assert.deepEqual(g3Res.anchorPoint, [0.5, 2]);
});

// -----------------------------------------------------------------------------
// 25. Given Point-Slope Source Equation Preserves Anchor Point
// -----------------------------------------------------------------------------
test('given point-slope source equation preserves anchor for snap step and graph evaluation', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'pointSlope',
      equation: 'y - 2 = 2(x - 1/2)',
    },
  };

  const canonicalFacts = deriveLinearMultipleRepresentations(q);
  // Assert canonicalFacts.sourcePoint is [0.5, 2]
  assert.deepEqual(canonicalFacts.sourcePoint, [0.5, 2]);

  // Assert Graph 3 snap step allows 0.5
  const snapStep = resolveSnapStep(q, canonicalFacts);
  assert.equal(snapStep, 0.5);

  // Assert Graph 3 accepts [(0.5, 2), (1.5, 4)]
  const g3Res = evaluateGraph3PointSlope([[0.5, 2], [1.5, 4]], canonicalFacts, canonicalFacts.sourcePoint);
  assert.equal(g3Res.isCorrect, true);
  assert.deepEqual(g3Res.anchorPoint, [0.5, 2]);

  // Also in full scoreLinearMultipleRepresentations
  const scoreResult = scoreLinearMultipleRepresentations(q, {
    graph3Points: [[0.5, 2], [1.5, 4]],
  });
  assert.equal(scoreResult.parts.graph3, true);
});

// -----------------------------------------------------------------------------
// 26. Given Point-Slope Equation Large Anchor Expands Automatic Bounds
// -----------------------------------------------------------------------------
test('given point-slope equation with large anchor expands automatic graph bounds', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'pointSlope',
      equation: 'y - 100 = 1(x - 100)',
    },
  };

  const canonicalFacts = deriveLinearMultipleRepresentations(q);
  assert.deepEqual(canonicalFacts.sourcePoint, [100, 100]);

  const bounds = resolveLinearMultipleRepresentationsGraphBounds(q, canonicalFacts);
  // Assert automatic graph bounds contain (100, 100)
  assert.ok(bounds.xMin <= 100 && bounds.xMax >= 100, `x bounds [${bounds.xMin}, ${bounds.xMax}] must contain 100`);
  assert.ok(bounds.yMin <= 100 && bounds.yMax >= 100, `y bounds [${bounds.yMin}, ${bounds.yMax}] must contain 100`);
});

// -----------------------------------------------------------------------------
// 27. Preflight Rejects Authored Bounds That Exclude Given Point-Slope Anchor
// -----------------------------------------------------------------------------
test('preflight rejects authored graphBounds that exclude given point-slope anchor equation', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'pointSlope',
      equation: 'y - 100 = 1(x - 100)',
    },
    graphBounds: {
      xMin: -8,
      xMax: 8,
      yMin: -8,
      yMax: 8,
    },
  };

  const errors = validateLinearMultipleRepresentationsQuestion(q);
  assert.ok(errors.length > 0);
  assert.ok(errors.some((err) => /point-slope point/i.test(err)));
});

