import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardHasWork,
  cardResponseKey,
  checkCrossRepresentationConsistency,
  deriveLinearMultipleRepresentations,
  describeGivenRepresentation,
  formatCoordinateText,
  graphFeedbackMessage,
  refineSnapStep,
  resolveAuthoredSnapStep,
  resolveGraph3Anchor,
  resolveGraphSnapSteps,
  resolveRequiredCards,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  expandGraphBoundsForAnchor,
  parseNumericOrFraction,
  parseOrderedPair,
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
// Every point a graph REQUIRES must be a multiple of that graph's snap step,
// and a slope step (whole rise, whole run) from it must land on the grid too.
const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;

test('resolveSnapStep: the grid reaches every required intercept and is no finer than it needs to be', () => {
  // 2x - 4y = 12: slope 1/2 but intercepts (6, 0) and (0, -3) are whole, and
  // rise 1 / run 2 is a whole step. Whole numbers, as the plane promises.
  const halfDerived = deriveLinearMultipleRepresentations({
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
  });
  assert.equal(resolveSnapStep({}, halfDerived), 1);

  // An intercept between gridlines refines the grid: y = 3/4x + 3 has x-intercept -4 (whole)…
  const quarterDerived = { xInterceptPoint: [-4, 0], yInterceptPoint: [0, 3] };
  assert.equal(resolveSnapStep({}, quarterDerived), 1);
  // …but x-intercept -4/3 and y-intercept 1/2 need a grid of sixths.
  const mixed = { xInterceptPoint: [-4 / 3, 0], yInterceptPoint: [0, 0.5] };
  const mixedStep = resolveSnapStep({}, mixed);
  assert.ok(Math.abs(mixedStep - 1 / 6) < 1e-9);
  for (const point of [mixed.xInterceptPoint, mixed.yInterceptPoint]) {
    assert.ok(point.every((value) => onGrid(value, mixedStep)), `(${point}) is plottable on a ${mixedStep} grid`);
  }

  // Integer line => snapStep 1
  const integerDerived = deriveLinearMultipleRepresentations({
    source: { kind: 'slopeIntercept', equation: 'y = 2x + 4' },
  });
  assert.equal(resolveSnapStep({}, integerDerived), 1);

  // An explicit snapStep is kept when it already reaches everything required.
  assert.equal(resolveSnapStep({ snapStep: 0.1 }, halfDerived), 0.1);

  // Mutation guard: the refinement is what makes a half-unit intercept reachable.
  assert.equal(onGrid(0.5, 1), false);
});

test('ISSUE B: an explicit snapStep never makes a valid point-slope anchor unplottable on Graph 3', () => {
  const q = { mode: 'linearMultipleRepresentations', source: { kind: 'slopeIntercept', equation: 'y = x' }, snapStep: 1 };
  const facts = deriveLinearMultipleRepresentations(q);
  const equation = 'y - 1/2 = x - 1/2';

  // The student's equation is correct point-slope form…
  assert.equal(validatePointSlopeEntry(equation, facts).isCorrect, true);
  // …so Graph 3 must start from (1/2, 1/2)…
  const anchor = resolveGraph3Anchor(q, facts, equation);
  assert.deepEqual(anchor, { point: [0.5, 0.5], origin: 'student' });
  // …and its grid refines to halves so that point can be plotted.
  const steps = resolveGraphSnapSteps(q, facts, anchor.point);
  assert.equal(steps.graph3, 0.5);
  assert.ok(anchor.point.every((value) => onGrid(value, steps.graph3)));
  // Graphs 1 and 2 keep the author's whole-number grid: (0, 0) needs nothing finer.
  assert.equal(steps.graph1, 1);
  assert.equal(steps.graph2, 1);
  // The whole construction is then gradeable: anchor + slope step (1, 1).
  const plotted = [[0.5, 0.5], [1.5, 1.5]];
  assert.ok(plotted.flat().every((value) => onGrid(value, steps.graph3)));
  assert.equal(evaluateGraph3PointSlope(plotted, facts, anchor.point).isCorrect, true);
  assert.equal(scoreLinearMultipleRepresentations(q, { pointSlopeEquation: equation, graph3Points: plotted }).parts.graph3, true);
});

test('ISSUE B: Graph 3 uses the coarsest common grid of the authored step and the anchor', () => {
  // base 1, anchor denominator 2 => 1/2
  assert.equal(refineSnapStep(1, [[0.5, 3]]), 0.5);
  // base 1/4, anchor denominator 2 => keep 1/4 (1/2 is already reachable)
  assert.equal(refineSnapStep(0.25, [[0.5, 3]]), 0.25);
  // base 1/5, anchor denominator 2 => 1/10 (the common grid)
  assert.ok(Math.abs(refineSnapStep(0.2, [[0.5, 3]]) - 0.1) < 1e-12);
  // base 1/3 (authored as a fraction string), anchor 1/2 => 1/6
  const q = { snapStep: '1/3' };
  assert.ok(Math.abs(refineSnapStep(resolveAuthoredSnapStep(q), [[0.5, 1]]) - 1 / 6) < 1e-9);
  // whole-number anchor: unchanged
  assert.equal(refineSnapStep(1, [[3, -2]]), 1);
  // a coarse author grid of 2 still reaches an anchor at (3, 4)
  assert.equal(refineSnapStep(2, [[3, 4]]), 1);
  // a grid too fine to aim at falls back to twentieths (within graph tolerance)
  assert.equal(refineSnapStep(1, [[1 / 3, 1 / 7]]), 0.05);
});

test('Graph 3 never adopts a student point that is not on the line', () => {
  const q = { mode: 'linearMultipleRepresentations', source: { kind: 'standardForm', equation: '2x - 4y = 12' } };
  const facts = deriveLinearMultipleRepresentations(q);
  // (2, 5) is not on y = 1/2x - 3. A parallel line through it must NOT earn Graph 3.
  const wrong = 'y - 5 = 1/2(x - 2)';
  const anchor = resolveGraph3Anchor(q, facts, wrong);
  assert.equal(anchor.origin, 'free');
  assert.equal(anchor.point, null);
  assert.deepEqual(anchor.offLinePoint, [2, 5]);
  const parallel = [[2, 5], [4, 6]];
  const scored = scoreLinearMultipleRepresentations(q, { pointSlopeEquation: wrong, graph3Points: parallel });
  assert.equal(scored.parts.graph3, false, 'a parallel line through an off-line point is not Graph 3');
  // Mutation guard: passing the off-line point straight through (the old
  // behaviour) grades the parallel line as correct — which is the bug.
  assert.equal(evaluateGraph3PointSlope(parallel, facts, [2, 5]).isCorrect, true);
  // A given point-slope anchor always wins over whatever the student typed.
  const given = { mode: 'linearMultipleRepresentations', source: { kind: 'pointSlope', equation: 'y - 2 = -1(x - 3)' } };
  assert.deepEqual(resolveGraph3Anchor(given, deriveLinearMultipleRepresentations(given), 'y - 0 = -1(x - 5)'), { point: [3, 2], origin: 'given' });
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

// -----------------------------------------------------------------------------
// 28. Student-Chosen Point-Slope Anchor Expands Graph 3 Bounds
// -----------------------------------------------------------------------------
test('student-chosen point-slope anchor expands Graph 3 bounds without blowing up Graph 1 or 2', () => {
  const targetQ = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'slopeIntercept',
      equation: 'y = x',
    },
    graphBounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
  };

  const canonicalFacts = deriveLinearMultipleRepresentations(targetQ);
  assert.equal(canonicalFacts.isValid, true);
  assert.equal(canonicalFacts.slopeNumber, 1);

  // Student enters point-slope equation with anchor (100, 100)
  const studentPsEquation = 'y - 100 = x - 100';
  const psValidation = validatePointSlopeEntry(studentPsEquation, canonicalFacts);
  assert.equal(psValidation.isCorrect, true);
  assert.deepEqual(psValidation.point, [100, 100]);

  // Base bounds for Graph 1 and Graph 2
  const baseBounds = resolveLinearMultipleRepresentationsGraphBounds(targetQ, canonicalFacts);
  assert.deepEqual(baseBounds, { xMin: -8, xMax: 8, yMin: -8, yMax: 8 });

  // Graph 3 expands specifically to include (100, 100) and room for second point (101, 101)
  const g3Bounds = expandGraphBoundsForAnchor(baseBounds, psValidation.point, canonicalFacts);
  assert.ok(g3Bounds.xMin <= 100 && g3Bounds.xMax >= 100, `Graph 3 x bounds must contain 100, got [${g3Bounds.xMin}, ${g3Bounds.xMax}]`);
  assert.ok(g3Bounds.yMin <= 100 && g3Bounds.yMax >= 100, `Graph 3 y bounds must contain 100, got [${g3Bounds.yMin}, ${g3Bounds.yMax}]`);
  // Ensure second slope point (101, 101) or (99, 99) also fits
  assert.ok(g3Bounds.xMax >= 101, 'Graph 3 xMax allows plotting second point');
  assert.ok(g3Bounds.yMax >= 101, 'Graph 3 yMax allows plotting second point');

  // Verify Graph 1 and 2 do NOT adopt the giant window
  assert.equal(baseBounds.xMax, 8);
  assert.equal(baseBounds.yMax, 8);

  // Student can plot anchor (100, 100) and slope point (101, 101)
  const g3Eval = evaluateGraph3PointSlope([[100, 100], [101, 101]], canonicalFacts, psValidation.point);
  assert.equal(g3Eval.isCorrect, true);
});

// -----------------------------------------------------------------------------
// 29. Domain Endpoint Inclusivity Preservation
// -----------------------------------------------------------------------------
test('domain endpoint inclusivity: distinguishes strict vs non-strict inequalities and open vs closed intervals', () => {
  // Expected closed interval: [0, 9] / 0 <= x <= 9
  assert.equal(validateDomainField('0 <= x <= 9', '0 <= x <= 9').isCorrect, true);
  assert.equal(validateDomainField('0 ≤ x ≤ 9', '0 <= x <= 9').isCorrect, true);
  assert.equal(validateDomainField('[0, 9]', '0 <= x <= 9').isCorrect, true);
  assert.equal(validateDomainField('[0, 9]', [0, 9]).isCorrect, true);

  // MUST NOT match closed interval when student gives strict inequality / open interval
  assert.equal(validateDomainField('0 < x < 9', '0 <= x <= 9').isCorrect, false);
  assert.equal(validateDomainField('(0, 9)', '0 <= x <= 9').isCorrect, false);
  assert.equal(validateDomainField('0 < x < 9', [0, 9]).isCorrect, false);
  assert.equal(validateDomainField('(0, 9)', [0, 9]).isCorrect, false);

  // Mixed intervals: [0, 9) and 0 <= x < 9
  assert.equal(validateDomainField('[0, 9)', '0 <= x < 9').isCorrect, true);
  assert.equal(validateDomainField('0 <= x < 9', '[0, 9)').isCorrect, true);
  assert.equal(validateDomainField('0 <= x < 9', '0 <= x <= 9').isCorrect, false);
  assert.equal(validateDomainField('[0, 9)', '[0, 9]').isCorrect, false);
  assert.equal(validateDomainField('(0, 9]', '0 < x <= 9').isCorrect, true);
  assert.equal(validateDomainField('(0, 9]', '(0, 9)').isCorrect, false);
});

// -----------------------------------------------------------------------------
// 30. Graph Source Preflight: Validates Collinear Points and Line Consistency
// -----------------------------------------------------------------------------
test('graph source preflight: verifies collinearity, finiteness, and line consistency', () => {
  // 1. 3 collinear graph points => pass
  const collinear3 = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'graph',
      points: [[0, 0], [1, 1], [2, 2]],
    },
  };
  assert.deepEqual(validateLinearMultipleRepresentationsQuestion(collinear3), []);

  // 2. Third point off line => fail
  const thirdOffLine = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'graph',
      points: [[0, 0], [1, 1], [2, 5]],
    },
  };
  const offLineErrors = validateLinearMultipleRepresentationsQuestion(thirdOffLine);
  assert.ok(offLineErrors.length > 0);
  assert.ok(offLineErrors.some((err) => /same line/i.test(err)));

  // 3. Malformed/non-finite point => fail
  const nonFinitePt = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'graph',
      points: [[0, 0], [1, NaN]],
    },
  };
  const nonFiniteErrors = validateLinearMultipleRepresentationsQuestion(nonFinitePt);
  assert.ok(nonFiniteErrors.length > 0);
  assert.ok(nonFiniteErrors.some((err) => /finite/i.test(err)));

  // 4. source.line plus matching points => pass
  const matchingLineAndPoints = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'graph',
      line: { m: 1, b: 0 },
      points: [[0, 0], [2, 2]],
    },
  };
  assert.deepEqual(validateLinearMultipleRepresentationsQuestion(matchingLineAndPoints), []);

  // 5. source.line plus contradictory points => fail
  const contradictoryLineAndPoints = {
    mode: 'linearMultipleRepresentations',
    source: {
      kind: 'graph',
      line: { m: 2, b: 3 }, // line is y = 2x + 3
      points: [[0, 0], [1, 1]], // points are on y = x
    },
  };
  const contradictoryErrors = validateLinearMultipleRepresentationsQuestion(contradictoryLineAndPoints);
  assert.ok(contradictoryErrors.length > 0);
  assert.ok(contradictoryErrors.some((err) => /same relationship/i.test(err)));
});


// -----------------------------------------------------------------------------
// ISSUE A: the GIVEN representation looks like what the author wrote
// -----------------------------------------------------------------------------
const given = (source, extra = {}) => describeGivenRepresentation({ mode: 'linearMultipleRepresentations', source, ...extra });

test('ISSUE A standardForm: authored coefficients stay 2x - 4y = 12, never the normalised x - 2y = 6', () => {
  const fromCoefficients = given({ kind: 'standardForm', A: 2, B: -4, C: 12 });
  assert.equal(fromCoefficients.kind, 'equation');
  assert.equal(fromCoefficients.latex, '2x - 4y = 12');
  assert.equal(given({ kind: 'standardForm', equation: '2x - 4y = 12' }).latex, '2x - 4y = 12');
  // Grading still normalises internally.
  assert.equal(deriveLinearMultipleRepresentations({ source: { kind: 'standardForm', A: 2, B: -4, C: 12 } }).standardEquation, 'x - 2y = 6');
  // Unit and negative coefficients read like classroom mathematics.
  assert.equal(given({ kind: 'standardForm', A: -1, B: 1, C: -3 }).latex, '-x + y = -3');
  assert.equal(given({ kind: 'standardForm', A: 3, B: 1, C: 0 }).latex, '3x + y = 0');
});

test('ISSUE A slopeIntercept: authored equation preserved; m/b rendered as exact fractions', () => {
  assert.equal(given({ kind: 'slopeIntercept', equation: 'y = -2x + 4' }).latex, 'y = -2x + 4');
  assert.equal(given({ kind: 'slopeIntercept', m: 0.5, b: -3 }).latex, 'y = \\frac{1}{2}x - 3');
  assert.equal(given({ kind: 'slopeIntercept', m: -0.75, b: 2 }).latex, 'y = -\\frac{3}{4}x + 2');
  assert.equal(given({ kind: 'slopeIntercept', m: 1, b: 0 }).latex, 'y = x');
  assert.equal(given({ kind: 'slopeIntercept', m: -1, b: 4 }).latex, 'y = -x + 4');
  assert.doesNotMatch(given({ kind: 'slopeIntercept', m: 1 / 3, b: 1 }).latex, /0\.33/);
});

test('ISSUE A pointSlope: the AUTHORED point is the point shown', () => {
  // Authored equation: verbatim.
  assert.equal(given({ kind: 'pointSlope', equation: 'y + 2 = 1/2(x - 2)' }).latex, 'y + 2 = 1/2(x - 2)');
  // Authored point + slope: built around THAT point, never the y-intercept.
  const built = given({ kind: 'pointSlope', point: [2, -2], m: 0.5 });
  assert.equal(built.latex, 'y + 2 = \\frac{1}{2}(x - 2)');
  assert.deepEqual(built.point, [2, -2]);
  assert.doesNotMatch(built.latex, /y \+ 3|x - 0/);
  // Zero and fractional coordinates keep the point visible.
  assert.equal(given({ kind: 'pointSlope', point: [0, 5], m: -2 }).latex, 'y - 5 = -2(x - 0)');
  assert.equal(given({ kind: 'pointSlope', point: [-1.5, 0], m: 3 }).latex, 'y - 0 = 3(x + \\frac{3}{2})');
  assert.equal(given({ kind: 'pointSlope', equation: 'y - 2 = -1(x - 3)' }).point.join(','), '3,2');
});

test('ISSUE A twoPoints: both authored points are shown read-only', () => {
  const desc = given({ kind: 'twoPoints', points: [[-2, -5], [4, -2]] });
  assert.equal(desc.kind, 'points');
  assert.deepEqual(desc.points.map((point) => point.latex), ['(-2, -5)', '(4, -2)']);
  const first = given({ kind: 'twoPoints', first: [0, 1], second: ['1/2', 2] });
  assert.deepEqual(first.points.map((point) => point.latex), ['(0, 1)', '(\\frac{1}{2}, 2)']);
});

test('ISSUE A table: the GIVEN table carries every authored row, fractions exact', () => {
  const rows = [{ x: -1, y: -9 }, { x: 1, y: -3 }, { x: 3, y: 3 }, { x: 5, y: 9 }];
  const desc = given({ kind: 'table', rows });
  assert.equal(desc.kind, 'table');
  assert.deepEqual(desc.rows, rows.map((row) => ({ xLatex: String(row.x), yLatex: String(row.y) })));
  // A fraction string is exact data, shown stacked, and a valid source.
  const thirds = { mode: 'linearMultipleRepresentations', source: { kind: 'table', rows: [{ x: '1/3', y: 2 }, { x: 1, y: 4 }, { x: 2, y: 7 }] } };
  assert.equal(describeGivenRepresentation(thirds).rows[0].xLatex, '\\frac{1}{3}');
  assert.deepEqual(validateLinearMultipleRepresentationsQuestion(thirds), []);
  assert.equal(deriveLinearMultipleRepresentations(thirds).slopeNumber, 3);
  // Array-shaped rows describe the same table.
  assert.deepEqual(given({ kind: 'table', rows: [[0, 1], [1, 3], [2, 5]] }).rows.map((row) => row.yLatex), ['1', '3', '5']);
});

test('ISSUE A table: a repeated x-value is rejected (it is not a function table)', () => {
  const errors = validateLinearMultipleRepresentationsQuestion({
    mode: 'linearMultipleRepresentations',
    source: { kind: 'table', rows: [{ x: 1, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 4 }] },
  });
  assert.ok(errors.some((error) => /different x-value/.test(error)));
});

test('ISSUE A graph: the given graph carries its authored points and the line', () => {
  const desc = given({ kind: 'graph', points: [[0, 1], [3, -1]] });
  assert.equal(desc.kind, 'graph');
  assert.deepEqual(desc.points, [[0, 1], [3, -1]]);
  assert.ok(Math.abs(desc.line.m - (-2 / 3)) < 1e-9);
  assert.equal(desc.line.b, 1);
  const lineOnly = given({ kind: 'graph', line: { m: 2, b: -1 } });
  assert.deepEqual(lineOnly.points, []);
  assert.deepEqual(lineOnly.line, { m: 2, b: -1 });
});

test('ISSUE A scenario: the story is prose, and a scenario without one is rejected', () => {
  const text = 'A candle is 18 inches tall when it is lit. It burns down 2 inches every hour.';
  const desc = given({ kind: 'scenario', prompt: text, m: -2, b: 18 });
  assert.equal(desc.kind, 'scenario');
  assert.equal(desc.text, text);
  assert.equal(desc.latex, undefined, 'a word problem is never handed to the math renderer as one expression');
  const errors = validateLinearMultipleRepresentationsQuestion({ mode: 'linearMultipleRepresentations', source: { kind: 'scenario', m: -2, b: 18 } });
  assert.ok(errors.some((error) => /source\.prompt/.test(error)));
});

// -----------------------------------------------------------------------------
// requiredCards: a shorter board (DOL) grades only what it asks for
// -----------------------------------------------------------------------------
test('requiredCards: resolves ids and categories, and always drops the GIVEN card', () => {
  const standard = { source: { kind: 'standardForm', equation: '2x - 4y = 12' } };
  assert.equal(resolveRequiredCards(standard).includes('standardForm'), false);
  assert.equal(resolveRequiredCards(standard).length, 10);
  assert.deepEqual(resolveRequiredCards({ ...standard, requiredCards: ['graphs', 'slope'] }), ['slope', 'graphIntercepts', 'graphSlopeIntercept', 'graphPointSlope']);
  assert.equal(resolveRequiredCards({ source: { kind: 'table', rows: [] }, requiredCards: ['table', 'slope'] }).includes('table'), false);
});

test('requiredCards: scoring grades exactly the asked-for cards; validation rejects unknown ids', () => {
  const q = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'scenario', prompt: 'A tank holds 24 liters and drains 3 liters per minute.', m: -3, b: 24 },
    requiredCards: ['slopeIntercept', 'standardForm', 'slope', 'xIntercept', 'yIntercept', 'graphSlopeIntercept'],
  };
  assert.deepEqual(validateLinearMultipleRepresentationsQuestion(q), []);
  const result = scoreLinearMultipleRepresentations(q, {
    slopeInterceptEquation: 'y = -3x + 24',
    standardFormEquation: '3x + y = 24',
    featureSlope: '-3',
    featureXIntercept: '(8, 0)',
    featureYIntercept: '(0, 24)',
    graph2Points: [[0, 24], [1, 21]],
  });
  assert.deepEqual(Object.keys(result.parts).sort(), ['crossRepresentationConsistency', 'graph2', 'slope', 'slopeIntercept', 'standardForm', 'xIntercept', 'yIntercept'].sort());
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  const unknown = validateLinearMultipleRepresentationsQuestion({ ...q, requiredCards: ['slope', 'graph4'] });
  assert.ok(unknown.some((error) => /graph4/.test(error)));
  const onlyGiven = validateLinearMultipleRepresentationsQuestion({ mode: 'linearMultipleRepresentations', source: { kind: 'table', rows: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }] }, requiredCards: ['table'] });
  assert.ok(onlyGiven.some((error) => /nothing to build/.test(error)));
});

test('a stored Check verdict is keyed to the exact work it saw', () => {
  const before = { featureSlope: '\\frac{1}{2}' };
  const after = { featureSlope: '3' };
  assert.notEqual(cardResponseKey('slope', before), cardResponseKey('slope', after));
  // Graph 3 is keyed on its points; its verdict is re-judged against the current anchor.
  const g3 = { graph3Points: [[2, -2], [4, -1]], pointSlopeEquation: 'y + 2 = 1/2(x - 2)' };
  assert.equal(cardResponseKey('graphPointSlope', g3), cardResponseKey('graphPointSlope', { ...g3, pointSlopeEquation: 'y + 3 = 1/2(x)' }));
  assert.notEqual(cardResponseKey('graphPointSlope', g3), cardResponseKey('graphPointSlope', { ...g3, graph3Points: [[2, -2]] }));
  // Unrelated edits do not.
  assert.equal(cardResponseKey('slope', before), cardResponseKey('slope', { ...before, featureXIntercept: '(6, 0)' }));
  assert.equal(cardHasWork('table', { tableRows: [{ x: '0', y: '1' }, { x: '1', y: '3' }, { x: '', y: '' }] }), false);
  assert.equal(cardHasWork('graphIntercepts', { graph1Points: [[6, 0], [0, -3]] }), true);
});

test('student-facing messages use exact fractions and name what to reconsider', () => {
  const facts = deriveLinearMultipleRepresentations({ source: { kind: 'standardForm', equation: '2x - 4y = 12' } });
  assert.equal(formatCoordinateText(1 / 3), '1/3');
  assert.match(validatePointSlopeEntry('y - 1/3 = 1/2(x - 1/3)', facts).error, /\(1\/3, 1\/3\)/);
  assert.doesNotMatch(validateTableEntry([{ x: '1/3', y: '0' }, { x: 0, y: -3 }, { x: 2, y: -2 }, { x: 4, y: -1 }], facts).error, /0\.333/);
  for (const message of [
    validateSlopeEntry('2', facts).error,
    validateXInterceptEntry('(5, 0)', facts).error,
    validateStandardFormEntry('x - 2y = 7', facts).error,
  ]) assert.doesNotMatch(message, /target line/);
  // Graph feedback distinguishes the method's anchor from the slope step.
  const g2 = evaluateGraph2SlopeIntercept([[2, -2], [4, -1]], facts);
  assert.match(graphFeedbackMessage('graph2', [[2, -2], [4, -1]], g2), /starts at the y-intercept/);
  const g2Slope = evaluateGraph2SlopeIntercept([[0, -3], [1, -1]], facts);
  assert.match(graphFeedbackMessage('graph2', [[0, -3], [1, -1]], g2Slope), /rise and run/);
  assert.equal(graphFeedbackMessage('graph1', [[6, 0]], null), 'Plot one more point.');
});
