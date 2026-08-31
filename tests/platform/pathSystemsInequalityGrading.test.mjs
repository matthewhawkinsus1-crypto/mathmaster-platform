import test from 'node:test';
import assert from 'node:assert/strict';
import { satisfiesLinearInequality as clientSatisfies } from '../../src/tools/systemsWorkspace/systemsMath.js';
import {
  buildSystemsInequalityPrivateDefinition,
  gradeSystemsInequalityResponse,
  sanitizeSystemsInequalityPublicQuestion,
  satisfiesPathLinearInequality,
  satisfiesPathInequalitySystem,
  systemsInequalityDefinitionIsGradable,
  validateSystemsInequalityResponse,
} from '../../functions/shared/pathSystemsInequalityGrading.mjs';

const inequalities = [
  { m: 1, b: 1, relation: '>=' },
  { m: -0.5, b: 6, relation: '<=' },
];

const question = {
  prompt: 'Find the feasible region.',
  mode: 'inequalities',
  inequalities,
  testPoint: { x: 2, y: 4 },
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  context: { scenario: 'Production constraints' },
  answer: 'must-not-leak',
};

test('server inequality predicate stays in parity with the existing client math', () => {
  const relations = ['>', '>=', '<', '<='];
  for (const relation of relations) {
    const ineq = { m: -1.5, b: 4, relation };
    const points = [
      { x: -2, y: 8 },
      { x: 0, y: 4 },
      { x: 3, y: -1 },
      { x: 2.5, y: 0.25 },
    ];
    for (const point of points) {
      assert.equal(
        satisfiesPathLinearInequality(ineq, point.x, point.y),
        clientSatisfies(ineq, point.x, point.y),
        `${relation} disagreed at (${point.x}, ${point.y})`,
      );
    }
  }
});

test('private definition recomputes whether the marked point is feasible', () => {
  const definition = buildSystemsInequalityPrivateDefinition(question);
  assert.equal(systemsInequalityDefinitionIsGradable(definition), true);
  assert.equal(definition.expectedTestPoint, true);
  assert.equal(satisfiesPathInequalitySystem(inequalities, { x: 2, y: 4 }), true);
  assert.equal(satisfiesPathInequalitySystem(inequalities, { x: -6, y: 10 }), false);
});

test('server grader ignores client correctness claims and grades both parts itself', () => {
  const definition = buildSystemsInequalityPrivateDefinition(question);

  const fullyCorrect = gradeSystemsInequalityResponse(definition, {
    testChoice: 'yes',
    candidate: { x: 2, y: 4 },
    isCorrect: false,
    score: 0,
  });
  assert.equal(fullyCorrect.isCorrect, true);
  assert.equal(fullyCorrect.score, 1);
  assert.deepEqual(fullyCorrect.parts, [
    { id: 'test-point', isCorrect: true },
    { id: 'candidate-point', isCorrect: true },
  ]);

  const onePart = gradeSystemsInequalityResponse(definition, {
    testChoice: 'no',
    candidate: { x: 2, y: 4 },
    isCorrect: true,
    score: 1,
  });
  assert.equal(onePart.isCorrect, false);
  assert.equal(onePart.score, 0.5);

  const wrongCandidate = gradeSystemsInequalityResponse(definition, {
    testChoice: 'yes',
    candidate: { x: -6, y: 10 },
  });
  assert.equal(wrongCandidate.isCorrect, false);
  assert.equal(wrongCandidate.score, 0.5);
});

test('A.3D construction mode grades boundary points, line style and shading instead of showing the answer', () => {
  const definition = buildSystemsInequalityPrivateDefinition({
    mode: 'inequalities',
    interaction: 'construct',
    ask: ['construction'],
    inequalities: [{ m: 2, b: -1, relation: '>' }],
    graph: { xMin: -5, xMax: 5, yMin: -6, yMax: 8 },
  });
  assert.equal(systemsInequalityDefinitionIsGradable(definition), true);

  const right = gradeSystemsInequalityResponse(definition, {
    construction: [{
      points: [{ x: 0, y: -1 }, { x: 2, y: 3 }],
      boundaryStyle: 'dashed',
      shade: 'above',
    }],
    isCorrect: false,
    score: 0,
  });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
  assert.deepEqual(right.parts, [
    { id: 'boundary-1', isCorrect: true },
    { id: 'boundary-style-1', isCorrect: true },
    { id: 'shade-1', isCorrect: true },
  ]);

  const wrongStyle = gradeSystemsInequalityResponse(definition, {
    construction: [{
      points: [{ x: 0, y: -1 }, { x: 2, y: 3 }],
      boundaryStyle: 'solid',
      shade: 'above',
    }],
  });
  assert.equal(wrongStyle.isCorrect, false);
  assert.equal(wrongStyle.score, 2 / 3);
});

test('A.3H construction mode requires every boundary before the overlap can be correct', () => {
  const definition = buildSystemsInequalityPrivateDefinition({
    interaction: 'construct',
    ask: ['construction'],
    inequalities,
  });
  const right = gradeSystemsInequalityResponse(definition, {
    construction: [
      {
        points: [{ x: 0, y: 1 }, { x: 2, y: 3 }],
        boundaryStyle: 'solid',
        shade: 'above',
      },
      {
        points: [{ x: 0, y: 6 }, { x: 2, y: 5 }],
        boundaryStyle: 'solid',
        shade: 'below',
      },
    ],
  });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);
  assert.equal(right.parts.length, 6);

  const missingSecond = gradeSystemsInequalityResponse(definition, {
    construction: [{
      points: [{ x: 0, y: 1 }, { x: 2, y: 3 }],
      boundaryStyle: 'solid',
      shade: 'above',
    }],
  });
  assert.equal(missingSecond.rejected, true);
  assert.equal(missingSecond.reason, 'malformed_response');
});

test('malformed inequality responses fail closed', () => {
  assert.equal(validateSystemsInequalityResponse(null).valid, false);
  assert.equal(validateSystemsInequalityResponse({ testChoice: 'maybe', candidate: { x: 2, y: 4 } }).valid, false);
  assert.equal(validateSystemsInequalityResponse({ testChoice: 'yes', candidate: { x: '', y: 4 } }).valid, false);

  const definition = buildSystemsInequalityPrivateDefinition(question);
  const result = gradeSystemsInequalityResponse(definition, { testChoice: 'yes', candidate: { x: null, y: 4 } });
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'malformed_response');
});

test('public inequality payload contains the question but no answer/verdict data', () => {
  const publicQuestion = sanitizeSystemsInequalityPublicQuestion(question);
  assert.equal(publicQuestion.mode, 'inequalities');
  assert.equal(publicQuestion.interaction, 'analyze');
  assert.deepEqual(publicQuestion.ask, ['testPoint', 'candidate']);
  assert.deepEqual(publicQuestion.inequalities, inequalities);
  assert.deepEqual(publicQuestion.testPoint, { x: 2, y: 4 });
  assert.deepEqual(publicQuestion.graph, { xMin: -6, xMax: 8, yMin: -4, yMax: 10 });
  assert.equal('answer' in publicQuestion, false);
  assert.equal('expectedTestPoint' in publicQuestion, false);
  assert.equal('isCorrect' in publicQuestion, false);
});
