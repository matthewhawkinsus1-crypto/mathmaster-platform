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

import { readGraphPointCoordinates } from '../../src/graphPointUtils.js';

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

test('CoordinatePlane prop contract: workspaces pass points and onMovePoint, never plottedPoints', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  // Strict regression assertion: plottedPoints is obsolete and must not be passed
  assert.doesNotMatch(boardSrc, /plottedPoints=/);

  // Each interactive workspace binds points and onMovePoint
  assert.match(boardSrc, /points=\{graph1Points\}/);
  assert.match(boardSrc, /points=\{graph2Points\}/);
  assert.match(boardSrc, /points=\{graph3Points\}/);
  assert.match(boardSrc, /onMovePoint=\{/);
  assert.match(boardSrc, /snapStep=\{graphSnapStep\}/);

  // Points format contract: verify readGraphPointCoordinates consumed by CoordinatePlane
  // accepts the board's point format [[x, y], ...]
  const samplePoints = [[2, -2], [4, -1]];
  for (const pt of samplePoints) {
    const coords = readGraphPointCoordinates(pt);
    assert.deepEqual(coords, pt);
  }
});

test('Given graph source contract: renders read-only CoordinatePlane when source is a graph', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  // Banner conditionally renders CoordinatePlane for graph source
  assert.match(boardSrc, /givenKind === 'graph'/);
  assert.match(boardSrc, /pointHoverEnabled=\{false\}/);
  assert.match(boardSrc, /lines=\{canonicalFacts\.displayLine/);
  // Banner renders MathDisplay when source is an equation/scenario
  assert.match(boardSrc, /<MathDisplay value=\{givenDisplay\}/);
});

test('Two Points GIVEN contract: read-only badge and adjusted features count when twoPoints is source', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  assert.match(boardSrc, /givenKind === 'twoPoints' \? 3 : 4/);
  assert.match(boardSrc, /givenKind === 'twoPoints' \? \(\s*<span[^>]*>GIVEN<\/span>/);
  assert.match(boardSrc, /canonicalFacts\.twoPoints/);
});

test('Collapsible card UX: panels expand/collapse with summary while preserving work', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  // Card expansion state and toggle handler
  assert.match(boardSrc, /usePersistentToolState\('expandedCards'/);
  assert.match(boardSrc, /const toggleCard =/);

  // Collapsed state renders compact preview
  assert.match(boardSrc, /!expandedCards\.graph1/);
  assert.match(boardSrc, /points plotted/);

  // Work inputs are bound to persistent tool state so toggling never unmounts/resets drafts
  assert.match(boardSrc, /usePersistentToolState\('standardFormEquation'/);
  assert.match(boardSrc, /usePersistentToolState\('tableRows'/);
  assert.match(boardSrc, /usePersistentToolState\('graph1Points'/);
});

test('Graph enlargement contract: full-tool workspace includes task, plane, controls, and check', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  // State exists for enlarged modal
  assert.match(boardSrc, /const \[enlargedGraph, setEnlargedGraph\] = useState\(null\)/);

  // Workspace enlargement renders full context: method title, instruction, plane, and controls
  assert.match(boardSrc, /role="dialog"/);
  assert.match(boardSrc, /aria-label=\{`Enlarged \$\{enlargedGraphConfig\.title\}`\}/);
  assert.match(boardSrc, /enlargedGraphConfig\.title/);
  assert.match(boardSrc, /enlargedGraphConfig\.taskInstruction/);
  assert.match(boardSrc, /enlargeable=\{false\}/); // Inner plane does not enlarge itself
  assert.match(boardSrc, /aria-label="Close enlarged graph"/);
});

test('Scenario context contract: dynamic progress counter and x-intercept meaning', () => {
  const boardSrc = source('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx');
  // Dynamic context progress count
  assert.match(boardSrc, /const contextTotal = contextKeys\.length/);
  assert.match(boardSrc, /const contextDone = contextKeys\.filter/);
  assert.match(boardSrc, /Context \{contextDone\}\/\{contextTotal\}/);

  // Includes x-intercept meaning in state and rendering
  assert.match(boardSrc, /usePersistentToolState\('contextXInterceptMeaning'/);
  assert.match(boardSrc, /xInterceptMeaning/);

  // Choice banks render dropdowns
  assert.match(boardSrc, /<select/);
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
