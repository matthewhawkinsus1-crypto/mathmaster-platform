import test from 'node:test';
import assert from 'node:assert/strict';
import { correlation, linearRegression } from '../../src/tools/shared/toolMath.js';
import {
  buildCandidateModels as clientBuildModels,
  chooseBestModel as clientChooseBest,
  correlationDescriptor as clientDescriptor,
  predictionKind as clientPredictionKind,
  quadraticRegression as clientQuadratic,
  exponentialRegression as clientExponential,
} from '../../src/tools/dataModeling/dataModelingMath.js';
import {
  buildDataModelingPrivateDefinition,
  buildPathCandidateModels,
  choosePathBestModel,
  gradeDataModelingResponse,
  pathCorrelation,
  pathCorrelationDescriptor,
  pathExponentialRegression,
  pathLinearRegression,
  pathPredictionKind,
  pathQuadraticRegression,
  sanitizeDataModelingPublicQuestion,
} from '../../functions/shared/pathDataModelingGrading.mjs';

const nearly = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(Number(a) - Number(b)) <= tolerance, `${a} != ${b}`);

const datasets = [
  [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]],
  [[0, 4], [1, 9], [2, 16], [3, 25], [4, 36]],
  [[0, 3], [1, 6], [2, 12], [3, 24], [4, 48]],
  [[-2, 8], [-1, 4], [0, 2], [1, 1], [2, 0.5]],
];

test('server correlation and linear regression remain in parity with the client math', () => {
  for (const points of datasets) {
    nearly(pathCorrelation(points), correlation(points));
    const server = pathLinearRegression(points);
    const client = linearRegression(points);
    nearly(server.m, client.m);
    nearly(server.b, client.b);
    nearly(server.r, client.r);
    assert.deepEqual(pathCorrelationDescriptor(server.r), clientDescriptor(client.r));
  }
});

test('server quadratic and exponential regressions remain in parity with client math', () => {
  for (const points of datasets) {
    const sq = pathQuadraticRegression(points);
    const cq = clientQuadratic(points);
    if (!sq || !cq) assert.equal(sq, cq);
    else {
      nearly(sq.a, cq.a);
      nearly(sq.b, cq.b);
      nearly(sq.c, cq.c);
    }

    const se = pathExponentialRegression(points);
    const ce = clientExponential(points);
    if (!se || !ce) assert.equal(se, ce);
    else {
      nearly(se.a, ce.a);
      nearly(se.base, ce.base);
    }
  }
});

test('server model-family comparison remains in parity with client best-model choice', () => {
  for (const points of datasets) {
    const linear = linearRegression(points);
    const clientModels = clientBuildModels(points, linear);
    const serverModels = buildPathCandidateModels(points);
    assert.deepEqual(serverModels.map((entry) => entry.id), clientModels.map((entry) => entry.id));
    assert.equal(choosePathBestModel(serverModels, 'rmse')?.id, clientChooseBest(clientModels, 'rmse')?.id);
    assert.equal(choosePathBestModel(serverModels, 'mae')?.id, clientChooseBest(clientModels, 'mae')?.id);
  }
});

test('prediction classification remains in parity with client interpolation/extrapolation logic', () => {
  const points = datasets[0];
  for (const x of [-2, 1, 3.5, 7, 10]) {
    assert.equal(pathPredictionKind(points, x), clientPredictionKind(points, x));
  }
});

test('line-fit, association, model-choice and prediction modes are server authoritative', () => {
  const points = datasets[0];
  const definition = buildDataModelingPrivateDefinition({ points, mode: 'full' });
  const best = definition.expectedModelId;
  const x = 4;
  const expectedPrediction = definition.expectedModel.id === 'linear'
    ? definition.expectedModel.model.m * x + definition.expectedModel.model.b
    : definition.expectedModel.id === 'quadratic'
      ? definition.expectedModel.model.a * x * x + definition.expectedModel.model.b * x + definition.expectedModel.model.c
      : definition.expectedModel.model.a * definition.expectedModel.model.base ** x;

  const result = gradeDataModelingResponse(definition, {
    m: definition.regression.m,
    b: definition.regression.b,
    direction: definition.descriptor.direction,
    strength: definition.descriptor.strength,
    causation: definition.causationExpected,
    modelChoice: best,
    predictionX: x,
    predictionY: expectedPrediction,
    predictionType: pathPredictionKind(points, x),
    isCorrect: false,
    score: 0,
  });
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
});

test('future A.4A correlation mode requires both numeric r and correct interpretation', () => {
  const points = datasets[0];
  const definition = buildDataModelingPrivateDefinition({ points, mode: 'correlation', correlationTolerance: 0.02 });

  const correct = gradeDataModelingResponse(definition, {
    r: definition.r + 0.01,
    direction: definition.descriptor.direction,
    strength: definition.descriptor.strength,
    causation: definition.causationExpected,
  });
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 1);

  const interpretationOnly = gradeDataModelingResponse(definition, {
    direction: definition.descriptor.direction,
    strength: definition.descriptor.strength,
    causation: definition.causationExpected,
  });
  assert.equal(interpretationOnly.isCorrect, false);
  assert.equal(interpretationOnly.score, 0.5);
});

test('mode-specific grading awards partial credit only for required parts', () => {
  const points = datasets[2];
  const association = buildDataModelingPrivateDefinition({ points, mode: 'association' });
  const assocResult = gradeDataModelingResponse(association, {
    direction: association.descriptor.direction,
    strength: association.descriptor.strength,
    causation: association.causationExpected,
    m: 999,
    b: 999,
  });
  assert.equal(assocResult.isCorrect, true);
  assert.equal(assocResult.score, 1);

  const modelCompare = buildDataModelingPrivateDefinition({ points, mode: 'modelCompare' });
  const wrongChoice = gradeDataModelingResponse(modelCompare, { modelChoice: modelCompare.expectedModelId === 'linear' ? 'quadratic' : 'linear' });
  assert.equal(wrongChoice.isCorrect, false);
  assert.equal(wrongChoice.score, 0);
});

test('public Data Modeling payload omits expected model, regression answers and private tolerances', () => {
  const question = {
    prompt: 'Fit the data.',
    mode: 'prediction',
    points: datasets[0],
    expectedModel: 'quadratic',
    slopeTolerance: 99,
    interceptTolerance: 99,
    predictionTolerance: 99,
    correlationTolerance: 99,
    causationSupported: true,
    predictionX: 8,
    startingModel: { m: 1, b: 2 },
    modelMetric: 'rmse',
    answer: 'must-not-leak',
  };
  const publicQuestion = sanitizeDataModelingPublicQuestion(question);
  assert.equal(publicQuestion.mode, 'prediction');
  assert.deepEqual(publicQuestion.points, datasets[0]);
  assert.equal(publicQuestion.predictionX, 8);
  assert.deepEqual(publicQuestion.startingModel, { m: 1, b: 2 });
  assert.equal('expectedModel' in publicQuestion, false);
  assert.equal('slopeTolerance' in publicQuestion, false);
  assert.equal('interceptTolerance' in publicQuestion, false);
  assert.equal('predictionTolerance' in publicQuestion, false);
  assert.equal('correlationTolerance' in publicQuestion, false);
  assert.equal('causationSupported' in publicQuestion, false);
  assert.equal('answer' in publicQuestion, false);
});
