import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lineFromPoints,
  targetLineFromQuestion,
  constructionEvidence,
} from '../../src/tools/graphing2/graphingMath.js';
import {
  buildGraphingPrivateDefinition,
  gradeGraphingResponse,
  pathLineFromPoints,
  pathTargetLineFromQuestion,
  sanitizeGraphingPublicQuestion,
  validateGraphingResponse,
} from '../../functions/shared/pathGraphingGrading.mjs';

const QUESTIONS = [
  { mode: 'slopeIntercept', line: { m: 2, b: -3 } },
  { mode: 'throughPoints', givenPoints: [[-2, 5], [2, -3]] },
  { mode: 'pointSlope', point: [3, -1], slope: 2 },
  { mode: 'standardForm', standard: { A: 2, B: 1, C: 4 } },
  { mode: 'verticalHorizontal', orientation: 'vertical', value: -3 },
  { mode: 'verticalHorizontal', orientation: 'horizontal', value: 4 },
];

test('server and client derive the same target line in every Graphing2 mode', () => {
  QUESTIONS.forEach((question) => {
    assert.deepEqual(pathTargetLineFromQuestion(question), targetLineFromQuestion(question), JSON.stringify(question));
  });
});

test('server and client derive the same line from student points', () => {
  [
    [[0, 4], [2, 0]],
    [[-3, -2], [-3, 5]],
    [[0.5, 1.25], [2.5, 4.25]],
  ].forEach(([first, second]) => {
    assert.deepEqual(pathLineFromPoints(first, second), lineFromPoints(first, second));
  });
});

test('standard-form construction is graded from student points, not browser claims', () => {
  const question = { mode: 'standardForm', standard: { A: 2, B: 1, C: 4 } };
  const definition = buildGraphingPrivateDefinition(question);
  const right = gradeGraphingResponse(definition, {
    points: [[0, 4], [2, 0]],
    studentLine: { kind: 'vertical', x: 999 },
    isCorrect: false,
    score: 0,
  });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);

  const client = constructionEvidence([[0, 4], [2, 0]], targetLineFromQuestion(question), 0.12);
  assert.equal(right.isCorrect, client.isCorrect);
});

test('vertical and horizontal lines remain first-class constructions', () => {
  const vertical = buildGraphingPrivateDefinition({ mode: 'verticalHorizontal', orientation: 'vertical', value: 3 });
  assert.equal(gradeGraphingResponse(vertical, { points: [[3, -2], [3, 5]] }).isCorrect, true);
  assert.equal(gradeGraphingResponse(vertical, { points: [[3, -2], [4, 5]] }).isCorrect, false);

  const horizontal = buildGraphingPrivateDefinition({ mode: 'verticalHorizontal', orientation: 'horizontal', value: -2 });
  assert.equal(gradeGraphingResponse(horizontal, { points: [[-4, -2], [5, -2]] }).isCorrect, true);
  assert.equal(gradeGraphingResponse(horizontal, { points: [[-4, -2], [5, -1]] }).isCorrect, false);
});

test('coincident or incomplete point submissions fail closed without burning a valid grading attempt', () => {
  assert.equal(validateGraphingResponse({ points: [[0, 4]] }).valid, false);
  assert.equal(validateGraphingResponse({ points: [[0, 4], [0, 4]] }).valid, false);
});

test('public Graphing2 payload exposes only the conditions the student must graph', () => {
  const question = {
    prompt: 'Graph 2x + y = 4.',
    mode: 'standardForm',
    standard: { A: 2, B: 1, C: 4 },
    graphBounds: { xMin: -5, xMax: 5, yMin: -5, yMax: 6 },
    answer: 'must-not-leak',
    expected: { m: -2, b: 4 },
    solution: 'must-not-leak',
  };
  const publicQuestion = sanitizeGraphingPublicQuestion(question);
  assert.deepEqual(publicQuestion.standard, { A: 2, B: 1, C: 4 });
  const serialized = JSON.stringify(publicQuestion);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal(serialized.includes('expected'), false);
  assert.equal(serialized.includes('solution'), false);
});
