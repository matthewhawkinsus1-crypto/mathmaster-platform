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
