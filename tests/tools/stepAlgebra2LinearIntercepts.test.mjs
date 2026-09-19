import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInterceptOperation,
  buildInterceptEvidence,
  buildSubstitutionState,
  choicePlacementMismatch,
  evaluateInterceptStage,
  expectedInterceptPoint,
  initialInterceptWork,
  parseNumericMath,
  resolveStandardCoefficients,
  shouldShowConceptRedirect,
  solverIsSolved,
  stageOnWrongInterceptPath,
} from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';

const standard = { A: 3, B: 4, C: 24 };

const solvedStage = ({ kind = 'x', zeroVariable, point }) => {
  const state = buildSubstitutionState(standard, zeroVariable);
  const divisor = kind === 'x' ? 3 : 4;
  const solved = applyInterceptOperation(state, 'divide', divisor);
  return {
    conceptualZeroChoice: zeroVariable,
    placedZeroVariable: zeroVariable,
    committed: true,
    solverState: solved,
    workHistory: [{ operation: 'divide', operand: divisor, before: state, after: solved }],
    point: { x: String(point[0]), y: String(point[1]) },
    completed: false,
    checked: false,
  };
};

test('linearIntercepts derives the expected points from standard form', () => {
  assert.deepEqual(expectedInterceptPoint(standard, 'x'), [8, 0]);
  assert.deepEqual(expectedInterceptPoint(standard, 'y'), [0, 6]);
  assert.deepEqual(resolveStandardCoefficients({ equation: '3x + 4y = 24' }), standard);
});

test('fractional intercept input accepts MathInput-style fractions', () => {
  assert.equal(parseNumericMath('\\frac{5}{4}'), 1.25);
  assert.deepEqual(expectedInterceptPoint({ A: 4, B: 6, C: 5 }, 'x'), [1.25, 0]);
  assert.deepEqual(expectedInterceptPoint({ A: 4, B: 6, C: 5 }, 'y'), [0, 5 / 6]);
});

test('student can deliberately choose and place zero on the wrong variable', () => {
  const stage = {
    ...initialInterceptWork().x,
    conceptualZeroChoice: 'x',
    placedZeroVariable: 'x',
    committed: true,
    solverState: buildSubstitutionState(standard, 'x'),
    workHistory: [],
  };
  assert.equal(choicePlacementMismatch(stage), false);
  assert.equal(stageOnWrongInterceptPath(stage, 'x'), true);
  assert.equal(shouldShowConceptRedirect(stage, 'x', 'delayed'), false);

  stage.workHistory = [{ operation: 'divide' }];
  assert.equal(shouldShowConceptRedirect(stage, 'x', 'delayed'), true);
  assert.equal(shouldShowConceptRedirect(stage, 'x', 'checkpoint'), false);
  assert.equal(shouldShowConceptRedirect(stage, 'x', 'submitOnly'), false);
});

test('choice/action mismatch is separate from a conceptual wrong path', () => {
  const stage = {
    ...initialInterceptWork().x,
    conceptualZeroChoice: 'y',
    placedZeroVariable: 'x',
  };
  assert.equal(choicePlacementMismatch(stage), true);
});

test('correct x-intercept requires zero choice, algebra, and the ordered pair', () => {
  const stage = solvedStage({ kind: 'x', zeroVariable: 'y', point: [8, 0] });
  assert.equal(solverIsSolved(stage.solverState), true);
  assert.equal(evaluateInterceptStage(stage, standard, 'x').isCorrect, true);

  const wrongPair = { ...stage, point: { x: '8', y: '6' } };
  const outcome = evaluateInterceptStage(wrongPair, standard, 'x');
  assert.equal(outcome.scalarCorrect, true);
  assert.equal(outcome.pointCorrect, false);
  assert.equal(outcome.isCorrect, false);
});

test('a mathematically valid wrong intercept remains wrong for the requested target', () => {
  const stage = solvedStage({ kind: 'y', zeroVariable: 'x', point: [0, 6] });
  const outcome = evaluateInterceptStage(stage, standard, 'x');
  assert.equal(outcome.solved, true);
  assert.equal(outcome.isCorrect, false);
  assert.equal(outcome.correctPlacement, false);
});

test('negative coefficients preserve the correct intercepts', () => {
  const negative = { A: -3, B: 6, C: 12 };
  assert.deepEqual(expectedInterceptPoint(negative, 'x'), [-4, 0]);
  assert.deepEqual(expectedInterceptPoint(negative, 'y'), [0, 2]);
});

test('structured evidence retains both independent intercept work paths', () => {
  const work = {
    activeKind: 'y',
    x: { ...solvedStage({ kind: 'x', zeroVariable: 'y', point: [8, 0] }), completed: true },
    y: { ...solvedStage({ kind: 'y', zeroVariable: 'x', point: [0, 6] }), completed: true },
  };
  const evidence = buildInterceptEvidence(work, standard);
  assert.deepEqual(evidence.xIntercept.point, [8, 0]);
  assert.deepEqual(evidence.yIntercept.point, [0, 6]);
  assert.equal(evidence.xIntercept.placedZeroVariable, 'y');
  assert.equal(evidence.yIntercept.placedZeroVariable, 'x');
});

test('tool schema validates linearIntercepts and rejects unsupported one-variable lines', () => {
  const valid = validateToolQuestion({
    toolId: 'stepAlgebra2',
    mode: 'linearIntercepts',
    standard,
    feedbackTiming: 'delayed',
    alignments: [{ framework: 'teks', code: 'A.3C' }],
  });
  assert.equal(valid.isValid, true, valid.errors.join('\n'));

  const special = validateToolQuestion({
    toolId: 'stepAlgebra2',
    mode: 'linearIntercepts',
    standard: { A: 4, B: 0, C: 8 },
  });
  assert.equal(special.isValid, false);
  assert.ok(special.errors.some((message) => /nonzero x- and y-coefficients/.test(message)));

  const timing = validateToolQuestion({
    toolId: 'stepAlgebra2',
    mode: 'linearIntercepts',
    standard,
    feedbackTiming: 'instantAnswer',
  });
  assert.equal(timing.isValid, false);
  assert.ok(timing.errors.some((message) => /feedbackTiming/.test(message)));
});
