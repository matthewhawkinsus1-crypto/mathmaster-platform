import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deriveLinearMultipleRepresentations,
  evaluateGraph1Intercepts,
  evaluateGraph2SlopeIntercept,
  evaluateGraph3PointSlope,
  scoreLinearMultipleRepresentations,
  validatePointSlopeEntry,
  validateSlopeEntry,
  validateSlopeInterceptEntry,
  validateTableEntry,
  validateTwoPointsEntry,
  validateXInterceptEntry,
  validateYInterceptEntry,
} from '../../src/tools/representationBridge/linearMultipleRepresentationsMath.js';

const source = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');

// -----------------------------------------------------------------------------
// Component Wiring & Source Contract
// -----------------------------------------------------------------------------
test('RepresentationBridge delegates to LinearMultipleRepresentationsBoard when mode is linearMultipleRepresentations', () => {
  const bridgeSrc = source('src/tools/representationBridge/RepresentationBridge.jsx');
  assert.match(bridgeSrc, /import LinearMultipleRepresentationsBoard from '\.\/LinearMultipleRepresentationsBoard\.jsx'/);
  assert.match(bridgeSrc, /if \(questionData\.mode === 'linearMultipleRepresentations'\)/);
  assert.match(bridgeSrc, /return <LinearMultipleRepresentationsBoard questionData=\{questionData\} onAction=\{onAction\} \/>/);
});

test('Free-order board architecture: cards are never gated by previous stages', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  // Free-order: does NOT have stageBlocked or sequential gating
  assert.doesNotMatch(boardSrc, /stageBlocked/);
  // All three graphs are rendered simultaneously in the board
  assert.match(boardSrc, /Graph 1: Intercepts Method/);
  assert.match(boardSrc, /Graph 2: Slope-Intercept Method/);
  assert.match(boardSrc, /Graph 3: Point-Slope Method/);
  // Card checks do not block or disable any card
  assert.match(boardSrc, /checkCard\('standardForm'/);
  assert.match(boardSrc, /checkCard\('slopeIntercept'/);
  assert.match(boardSrc, /checkCard\('pointSlope'/);
});

test('Three independent graph persistence namespaces', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  assert.match(boardSrc, /usePersistentToolState\('graph1Points', \[\]\)/);
  assert.match(boardSrc, /usePersistentToolState\('graph2Points', \[\]\)/);
  assert.match(boardSrc, /usePersistentToolState\('graph3Points', \[\]\)/);
});

test('Final graph comparison overlay only appears when all three graphs are complete', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  assert.match(boardSrc, /const allGraphsCorrect = Boolean\(/);
  assert.match(boardSrc, /liveResult\.parts\.graph1 && liveResult\.parts\.graph2 && liveResult\.parts\.graph3/);
  assert.match(boardSrc, /\{allGraphsCorrect && \(/);
  assert.match(boardSrc, /All Three Methods Trace the Identical Line!/);
});

test('Responsive layout contract: tracks contract to mobile Work View surface', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  assert.match(boardSrc, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(min\(380px, 100%\), 1fr\)\)'/);
});

// -----------------------------------------------------------------------------
// Core Acceptance Integration Test
// -----------------------------------------------------------------------------
test('Core Acceptance Test: Student completes representations in arbitrary free order', () => {
  // STARTING REPRESENTATION:
  // 2x - 4y = 12
  const question = {
    mode: 'linearMultipleRepresentations',
    source: { kind: 'standardForm', equation: '2x - 4y = 12' },
    feedbackTiming: 'guided',
  };

  const derived = deriveLinearMultipleRepresentations(question);
  assert.equal(derived.isValid, true);
  assert.equal(derived.slopeNumber, 0.5);
  assert.equal(derived.zeroNumber, 6);
  assert.equal(derived.yInterceptNumber, -3);

  // Student Draft State initially empty
  const studentWork = {
    standardFormEquation: '',
    slopeInterceptEquation: '',
    pointSlopeEquation: '',
    featureSlope: '',
    featureXIntercept: '',
    featureYIntercept: '',
    featurePoint1: '',
    featurePoint2: '',
    tableRows: [],
    graph1Points: [],
    graph2Points: [],
    graph3Points: [],
  };

  // 1 & 2. Student opens Point-Slope FIRST and enters valid point-slope equation
  studentWork.pointSlopeEquation = 'y + 2 = 1/2(x - 2)';
  const psCheck = validatePointSlopeEntry(studentWork.pointSlopeEquation, derived);
  assert.equal(psCheck.isCorrect, true);
  assert.deepEqual(psCheck.point, [2, -2]);

  // 3 & 4. Student jumps to Table and enters 4 valid points
  studentWork.tableRows = [
    { x: 0, y: -3 },
    { x: 2, y: -2 },
    { x: 4, y: -1 },
    { x: 6, y: 0 },
  ];
  const tableCheck = validateTableEntry(studentWork.tableRows, derived);
  assert.equal(tableCheck.isCorrect, true);

  // 5 & 6. Student jumps to Graph 2 BEFORE Graph 1 and plots slope-intercept evidence
  // (0, -3) and rise 1, run 2 => (2, -2)
  studentWork.graph2Points = [[0, -3], [2, -2]];
  const g2Check = evaluateGraph2SlopeIntercept(studentWork.graph2Points, derived);
  assert.equal(g2Check.isCorrect, true);

  // 7. Student later determines intercepts
  studentWork.featureXIntercept = '(6, 0)';
  studentWork.featureYIntercept = '(0, -3)';
  assert.equal(validateXInterceptEntry(studentWork.featureXIntercept, derived).isCorrect, true);
  assert.equal(validateYInterceptEntry(studentWork.featureYIntercept, derived).isCorrect, true);

  // 8. Complete Graph 1 using intercepts
  studentWork.graph1Points = [[6, 0], [0, -3]];
  const g1Check = evaluateGraph1Intercepts(studentWork.graph1Points, derived);
  assert.equal(g1Check.isCorrect, true);

  // 9. Complete Graph 3 using their chosen point-slope point (2, -2) and slope step (4, -1)
  studentWork.graph3Points = [[2, -2], [4, -1]];
  const g3Check = evaluateGraph3PointSlope(studentWork.graph3Points, derived, [2, -2]);
  assert.equal(g3Check.isCorrect, true);

  // All three graphs are now complete and correct
  assert.equal(g1Check.isCorrect && g2Check.isCorrect && g3Check.isCorrect, true);

  // 10. Finish remaining cards: slope, two points, slope-intercept
  studentWork.featureSlope = '1/2';
  studentWork.featurePoint1 = '(2, -2)';
  studentWork.featurePoint2 = '(4, -1)';
  studentWork.slopeInterceptEquation = 'y = 1/2x - 3';

  assert.equal(validateSlopeEntry(studentWork.featureSlope, derived).isCorrect, true);
  assert.equal(validateTwoPointsEntry(studentWork.featurePoint1, studentWork.featurePoint2, derived).isCorrect, true);
  assert.equal(validateSlopeInterceptEntry(studentWork.slopeInterceptEquation, derived).isCorrect, true);

  // 11. Final full board submission
  const finalResult = scoreLinearMultipleRepresentations(question, studentWork);
  assert.equal(finalResult.isCorrect, true);
  assert.equal(finalResult.score, 1);
  assert.equal(finalResult.parts.crossRepresentationConsistency, true);
  assert.equal(finalResult.parts.graph1, true);
  assert.equal(finalResult.parts.graph2, true);
  assert.equal(finalResult.parts.graph3, true);
  assert.equal(finalResult.parts.slopeIntercept, true);
  assert.equal(finalResult.parts.pointSlope, true);
  assert.equal(finalResult.parts.table, true);
});
