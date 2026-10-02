import test from 'node:test';
import assert from 'node:assert/strict';
import { targetLineFromQuestion } from '../../src/tools/graphing2/graphingMath.js';
import { evaluateConstruction, resolveConstructionPolicy } from '../../src/tools/graphing2/constructionPolicy.js';

// 1. slopeIntercept + equivalentLine continues accepting any two valid points.
test('slopeIntercept equivalentLine (default) accepts any two valid points on the line', () => {
  const question = { mode: 'slopeIntercept', line: { m: 2, b: -1 } };
  const target = targetLineFromQuestion(question);
  const evidence = evaluateConstruction([[3, 5], [5, 9]], question, target);
  assert.equal(evidence.isCorrect, true);
  assert.equal(evidence.strategy, 'equivalentLine');
});

// 2. slopeIntercept + formAware: correct final line but missing y-intercept => not full credit.
test('slopeIntercept formAware rejects a correct line that never plots the y-intercept', () => {
  const question = { mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware' } };
  const target = targetLineFromQuestion(question);
  const evidence = evaluateConstruction([[3, 5], [5, 9]], question, target);
  assert.equal(evidence.isCorrect, false);
  assert.equal(evidence.anchorSatisfied, false);
  assert.equal(evidence.category, 'correctLineMissingAnchor');
});

// 3. slopeIntercept + formAware: y-intercept + valid slope step => correct.
test('slopeIntercept formAware accepts the y-intercept plus a valid second point', () => {
  const question = { mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware' } };
  const target = targetLineFromQuestion(question);
  const evidence = evaluateConstruction([[0, -1], [5, 9]], question, target);
  assert.equal(evidence.isCorrect, true);
  assert.equal(evidence.anchorSatisfied, true);
  assert.equal(evidence.category, 'correct');
});

// 4. pointSlope + formAware: student must deliberately use the given point.
test('pointSlope formAware rejects two valid points that skip the given point', () => {
  const question = { mode: 'pointSlope', point: [2, 3], slope: -1, constructionPolicy: { strategy: 'formAware' } };
  const target = targetLineFromQuestion(question);
  const skippedAnchor = evaluateConstruction([[0, 5], [5, 0]], question, target);
  assert.equal(skippedAnchor.isCorrect, false);
  assert.equal(skippedAnchor.anchorSatisfied, false);

  const usedAnchor = evaluateConstruction([[2, 3], [5, 0]], question, target);
  assert.equal(usedAnchor.isCorrect, true);
  assert.equal(usedAnchor.anchorSatisfied, true);
});

// 5. standardForm + formAware: correct x/y intercepts => correct.
test('standardForm formAware requires both intercepts, not just any two points on the line', () => {
  const question = { mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware' } };
  const target = targetLineFromQuestion(question);

  const withIntercepts = evaluateConstruction([[2, 0], [0, 4]], question, target);
  assert.equal(withIntercepts.isCorrect, true);
  assert.deepEqual(withIntercepts.interceptEvidence.xIntercept.satisfied, true);
  assert.deepEqual(withIntercepts.interceptEvidence.yIntercept.satisfied, true);

  const withoutIntercepts = evaluateConstruction([[1, 2], [3, -2]], question, target);
  assert.equal(withoutIntercepts.isCorrect, false);
  assert.equal(withoutIntercepts.category, 'correctLineMissingAnchor');
});

// 6. vertical/horizontal special cases do not create impossible intercept requirements.
test('standardForm formAware degenerates gracefully for horizontal and vertical lines', () => {
  const horizontalQuestion = { mode: 'standardForm', standard: { A: 0, B: 2, C: 8 }, constructionPolicy: { strategy: 'formAware' } };
  const horizontalTarget = targetLineFromQuestion(horizontalQuestion);
  const horizontalEvidence = evaluateConstruction([[0, 4], [3, 4]], horizontalQuestion, horizontalTarget);
  assert.equal(horizontalEvidence.isCorrect, true);
  assert.equal(Object.keys(horizontalEvidence.interceptEvidence).length, 1);
  assert.ok(horizontalEvidence.interceptEvidence.yIntercept);

  const verticalQuestion = { mode: 'standardForm', standard: { A: 2, B: 0, C: 6 }, constructionPolicy: { strategy: 'formAware' } };
  const verticalTarget = targetLineFromQuestion(verticalQuestion);
  const verticalEvidence = evaluateConstruction([[3, 0], [3, 5]], verticalQuestion, verticalTarget);
  assert.equal(verticalEvidence.isCorrect, true);
  assert.ok(verticalEvidence.interceptEvidence.xIntercept);

  // verticalHorizontal mode is unaffected by a formAware policy — it already
  // requires the two defining points via legacy grading.
  const verticalHorizontalQuestion = { mode: 'verticalHorizontal', orientation: 'horizontal', value: 5, constructionPolicy: { strategy: 'formAware' } };
  const vhTarget = targetLineFromQuestion(verticalHorizontalQuestion);
  const vhEvidence = evaluateConstruction([[0, 5], [3, 5]], verticalHorizontalQuestion, vhTarget);
  assert.equal(vhEvidence.isCorrect, true);
  assert.equal(vhEvidence.anchorSatisfied, null);
});

// 7. minimumPoints = 3 works correctly.
test('minimumPoints = 3 requires the y-intercept plus two additional collinear points', () => {
  const question = { mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } };
  assert.equal(resolveConstructionPolicy(question).minimumPoints, 3);
  const target = targetLineFromQuestion(question);

  const threePoints = evaluateConstruction([[0, -1], [1, 1], [2, 3]], question, target);
  assert.equal(threePoints.isCorrect, true);

  const onlyTwoPoints = evaluateConstruction([[0, -1], [1, 1]], question, target);
  assert.equal(onlyTwoPoints.isCorrect, false);
});

// Legacy default (no constructionPolicy at all) keeps identical scoring.
test('a question with no constructionPolicy field defaults to equivalentLine strategy', () => {
  const question = { mode: 'slopeIntercept', line: { m: 1, b: 4 } };
  assert.deepEqual(resolveConstructionPolicy(question), { strategy: 'equivalentLine', requiredAnchor: 'auto', minimumPoints: 2 });
});

// Duplicate points are called out under formAware, distinctly from "wrong line".
test('formAware distinguishes a duplicated point from a wrong line', () => {
  const question = { mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware' } };
  const target = targetLineFromQuestion(question);
  const duplicate = evaluateConstruction([[0, -1], [0, -1]], question, target);
  assert.equal(duplicate.isCorrect, false);
  assert.equal(duplicate.category, 'duplicatePoint');
});

test('factoredLinear derives its line and requires deliberate x-intercept plus slope evidence', () => {
  const question = { mode: 'factoredLinear', factored: { a: 5, c: 6 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'xIntercept', minimumPoints: 2 } };
  const target = targetLineFromQuestion(question);
  assert.deepEqual(target, { kind: 'slopeIntercept', m: 5, b: -30 });
  assert.equal(evaluateConstruction([[5, -5], [7, 5]], question, target).category, 'correctLineMissingAnchor');
  assert.equal(evaluateConstruction([[6, 0], [7, 4]], question, target).category, 'correctAnchorWrongSlope');
  assert.equal(evaluateConstruction([[6, 0], [7, 5]], question, target).isCorrect, true);
});

test('factoredLinear supports negative and rational values and minimumPoints 3', () => {
  const cases = [
    [{ a: -2, c: 3 }, [[3, 0], [4, -2], [5, -4]]],
    [{ a: 0.5, c: -2 }, [[-2, 0], [0, 1], [2, 2]]],
  ];
  for (const [factored, points] of cases) {
    const question = { mode: 'factoredLinear', factored, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'xIntercept', minimumPoints: 3 } };
    assert.equal(evaluateConstruction(points, question, targetLineFromQuestion(question)).isCorrect, true);
  }
});

// --- Additive exports the shared grader and the component both read --------

test('evaluateConstructionDetail carries exactly evaluateConstruction\'s result, plus its checks', async () => {
  const { evaluateConstructionDetail } = await import('../../src/tools/graphing2/constructionPolicy.js');
  const cases = [
    [{ mode: 'slopeIntercept', line: { m: 2, b: -1 } }, [[3, 5], [5, 9]]],
    [{ mode: 'slopeIntercept', line: { m: 2, b: -1 } }, [[0, -1], [0, -1]]],
    [{ mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware' } }, [[3, 5], [5, 9]]],
    [{ mode: 'standardForm', standard: { A: 2, B: 1, C: 4 }, constructionPolicy: { strategy: 'formAware' } }, [[2, 0], [0, 4]]],
    [{ mode: 'factoredLinear', factored: { a: 5, c: 6 }, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }, [[6, 0], [7, 5], [7, 5]]],
  ];
  for (const [question, points] of cases) {
    const target = targetLineFromQuestion(question);
    const detail = evaluateConstructionDetail(points, question, target);
    assert.deepEqual(detail.evidence, evaluateConstruction(points, question, target));
    assert.equal(detail.legacy, detail.evidence.strategy !== 'formAware');
  }
  const coincident = evaluateConstructionDetail([[0, -1], [0, -1]], { mode: 'slopeIntercept', line: { m: 2, b: -1 } }, { kind: 'slopeIntercept', m: 2, b: -1 });
  assert.equal(coincident.coincident, true);
  assert.equal(coincident.evidence.score, 0.25);
  const formAware = evaluateConstructionDetail([[3, 5], [5, 9]], { mode: 'slopeIntercept', line: { m: 2, b: -1 }, constructionPolicy: { strategy: 'formAware' } }, { kind: 'slopeIntercept', m: 2, b: -1 });
  assert.deepEqual([formAware.lineCorrect, formAware.hasMinimumPoints, formAware.requiredAdditional], [true, true, 1]);
  assert.deepEqual(formAware.anchorPointIndex, [-1]);
});

test('the Check gate: required points, and a line through the first two', async () => {
  const { constructionReadyToCheck, requiredConstructionPointCount, constructionToleranceFor } = await import('../../src/tools/graphing2/constructionPolicy.js');
  const line = { mode: 'slopeIntercept', line: { m: 2, b: -1 } };
  const three = { ...line, constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } };
  assert.equal(requiredConstructionPointCount(line), 2);
  assert.equal(requiredConstructionPointCount({ ...line, constructionPolicy: { strategy: 'equivalentLine', minimumPoints: 3 } }), 2);
  assert.equal(requiredConstructionPointCount(three), 3);
  assert.equal(requiredConstructionPointCount({ mode: 'throughPoints', constructionPolicy: { strategy: 'formAware', minimumPoints: 3 } }), 3);
  assert.equal(constructionReadyToCheck([], line), false);
  assert.equal(constructionReadyToCheck([[0, 0]], line), false);
  assert.equal(constructionReadyToCheck([[0, 0], [0, 0]], line), false);
  assert.equal(constructionReadyToCheck([[0, 0], [1, 5]], line), true);
  assert.equal(constructionReadyToCheck([[0, -1], [1, 1]], three), false);
  assert.equal(constructionReadyToCheck([[0, -1], [0, -1], [1, 1]], three), false);
  assert.equal(constructionReadyToCheck([[0, -1], [1, 1], [2, 3]], three), true);
  assert.equal(constructionToleranceFor(line), 0.12);
  assert.equal(constructionToleranceFor({ tolerance: 0.5 }), 0.5);
  assert.equal(constructionToleranceFor({ tolerance: '0.3' }), 0.3);
});

test('the target line after the tool\'s own default: y = 1.5x - 2 only for an unauthored slope-intercept question', async () => {
  const { graphingTargetLine, withDefaultTargetLine } = await import('../../src/tools/graphing2/graphingMath.js');
  assert.deepEqual(graphingTargetLine({}), { kind: 'slopeIntercept', m: 1.5, b: -2 });
  assert.deepEqual(graphingTargetLine({ mode: 'slopeIntercept' }), { kind: 'slopeIntercept', m: 1.5, b: -2 });
  assert.deepEqual(graphingTargetLine({ line: { m: 1, b: 4 } }), { kind: 'slopeIntercept', m: 1, b: 4 });
  assert.equal(graphingTargetLine({ mode: 'unknown' }), null, 'no default outside slopeIntercept');
  assert.equal(graphingTargetLine({ mode: 'slopeIntercept', line: {} }), null, 'an authored but empty line is not replaced');
  const authored = { mode: 'pointSlope', point: [2, 3], slope: -1 };
  assert.equal(withDefaultTargetLine(authored), authored);
});
