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
  squareRootRegression as clientSquareRoot,
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
  pathSquareRootRegression,
  sanitizeDataModelingPublicQuestion,
} from '../../functions/shared/pathDataModelingGrading.mjs';

const nearly = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(Number(a) - Number(b)) <= tolerance, `${a} != ${b}`);

const datasets = [
  [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]],
  [[0, 4], [1, 9], [2, 16], [3, 25], [4, 36]],
  [[0, 3], [1, 6], [2, 12], [3, 24], [4, 48]],
  [[-2, 8], [-1, 4], [0, 2], [1, 1], [2, 0.5]],
];

test('Firestore-safe {x,y} point objects grade identically to array pairs', () => {
  const arrays = [[0, 2], [1, 5], [2, 8], [3, 11]];
  const objects = arrays.map(([x, y]) => ({ x, y }));
  nearly(pathCorrelation(objects), pathCorrelation(arrays));
  const fromObjects = buildDataModelingPrivateDefinition({
    points: objects,
    mode: 'linearFitPrediction',
    predictionX: 5,
  });
  const fromArrays = buildDataModelingPrivateDefinition({
    points: arrays,
    mode: 'linearFitPrediction',
    predictionX: 5,
  });
  nearly(fromObjects.expectedModel.model.m, fromArrays.expectedModel.model.m);
  nearly(fromObjects.expectedModel.model.b, fromArrays.expectedModel.model.b);
  assert.deepEqual(sanitizeDataModelingPublicQuestion({ points: objects }).points, arrays);
});

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

test('server quadratic, exponential, and square-root regressions remain in parity with client math', () => {
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

    const ss = pathSquareRootRegression(points);
    const cs = clientSquareRoot(points);
    if (!ss || !cs) assert.equal(ss, cs);
    else {
      nearly(ss.a, cs.a);
      nearly(ss.h, cs.h);
      nearly(ss.k, cs.k);
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

  const causationIsOutsideA4A = gradeDataModelingResponse(definition, {
    r: definition.r,
    direction: definition.descriptor.direction,
    strength: definition.descriptor.strength,
    causation: definition.causationExpected === 'association' ? 'causation' : 'association',
  });
  assert.equal(causationIsOutsideA4A.isCorrect, true, 'A.4A grades r plus direction/strength, not a separate causation claim');
  assert.equal(causationIsOutsideA4A.score, 1);

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

test('A.4C linear fit mode requires the written regression function and the fixed prediction', () => {
  const points = [[0, 2], [1, 5], [2, 8], [3, 11]];
  const definition = buildDataModelingPrivateDefinition({
    points,
    mode: 'linearFitPrediction',
    predictionX: 5,
    predictionTolerance: 0.01,
  });
  assert.equal(definition.expectedModelId, 'linear');
  nearly(definition.expectedModel.model.m, 3);
  nearly(definition.expectedModel.model.b, 2);

  const right = gradeDataModelingResponse(definition, {
    m: 3,
    b: 2,
    predictionX: 5,
    predictionY: 17,
    predictionType: 'extrapolation',
  });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);

  const changedTarget = gradeDataModelingResponse(definition, {
    m: 3,
    b: 2,
    predictionX: 3,
    predictionY: 11,
    predictionType: 'interpolation',
  });
  assert.equal(changedTarget.isCorrect, false, 'the browser cannot replace the authored prediction x');
  assert.equal(changedTarget.score, 0.5);
});

test('A.8B quadratic fit mode grades all three written coefficients plus prediction', () => {
  const points = [-2, -1, 0, 1, 2].map((x) => [x, 2 * x * x - 3 * x + 4]);
  const definition = buildDataModelingPrivateDefinition({
    points,
    mode: 'quadraticFitPrediction',
    predictionX: 3,
    predictionTolerance: 0.01,
  });
  assert.equal(definition.expectedModelId, 'quadratic');
  nearly(definition.expectedModel.model.a, 2);
  nearly(definition.expectedModel.model.b, -3);
  nearly(definition.expectedModel.model.c, 4);

  const right = gradeDataModelingResponse(definition, {
    a: 2,
    b: -3,
    c: 4,
    predictionX: 3,
    predictionY: 13,
    predictionType: 'extrapolation',
  });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);

  const suppliedOnlyPrediction = gradeDataModelingResponse(definition, {
    a: 1,
    b: 0,
    c: 0,
    predictionX: 3,
    predictionY: 13,
    predictionType: 'extrapolation',
  });
  assert.equal(suppliedOnlyPrediction.isCorrect, false);
  assert.equal(suppliedOnlyPrediction.score, 0.5);
});

test('A.9E exponential fit mode supports decay as well as growth', () => {
  const points = [[0, 3], [1, 1.5], [2, 0.75], [3, 0.375], [4, 0.1875]];
  const definition = buildDataModelingPrivateDefinition({
    points,
    mode: 'exponentialFitPrediction',
    predictionX: 5,
    predictionTolerance: 0.001,
  });
  assert.equal(definition.expectedModelId, 'exponential');
  nearly(definition.expectedModel.model.a, 3);
  nearly(definition.expectedModel.model.base, 0.5);

  const right = gradeDataModelingResponse(definition, {
    a: 3,
    base: 0.5,
    predictionX: 5,
    predictionY: 0.09375,
    predictionType: 'extrapolation',
  });
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);

  const growthBase = gradeDataModelingResponse(definition, {
    a: 3,
    base: 1.5,
    predictionX: 5,
    predictionY: 0.09375,
    predictionType: 'extrapolation',
  });
  assert.equal(growthBase.isCorrect, false);
  assert.equal(growthBase.score, 0.5);
});

test('blank or null prediction targets are never coerced to x = 0', () => {
  const points = [[0, 2], [1, 5], [2, 8], [3, 11]];
  const nullTarget = buildDataModelingPrivateDefinition({
    points,
    mode: 'linearFitPrediction',
    predictionX: null,
  });
  const blankTarget = buildDataModelingPrivateDefinition({
    points,
    mode: 'linearFitPrediction',
    predictionX: '',
  });

  assert.equal(nullTarget.predictionX, null);
  assert.equal(blankTarget.predictionX, null);
  assert.equal('predictionX' in sanitizeDataModelingPublicQuestion({ points, predictionX: null }), false);
  assert.equal('predictionX' in sanitizeDataModelingPublicQuestion({ points, predictionX: '' }), false);
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
    quadraticATolerance: 11,
    quadraticBTolerance: 12,
    quadraticCTolerance: 13,
    exponentialATolerance: 14,
    exponentialBaseTolerance: 15,
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
  assert.equal('quadraticATolerance' in publicQuestion, false);
  assert.equal('quadraticBTolerance' in publicQuestion, false);
  assert.equal('quadraticCTolerance' in publicQuestion, false);
  assert.equal('exponentialATolerance' in publicQuestion, false);
  assert.equal('exponentialBaseTolerance' in publicQuestion, false);
  assert.equal('answer' in publicQuestion, false);
});

test('A2.4E square-root technology fits endpoint-anchored table data and securely grades all parameters', () => {
  const points = [0, 1, 4, 9, 16].map((offset) => [2 + offset, -3 * Math.sqrt(offset) + 5]);
  const client = clientSquareRoot(points);
  const server = pathSquareRootRegression(points);
  assert.ok(client && server);
  nearly(client.a, -3);
  nearly(client.h, 2);
  nearly(client.k, 5);
  nearly(server.a, client.a);
  nearly(server.h, client.h);
  nearly(server.k, client.k);

  const definition = buildDataModelingPrivateDefinition({
    points,
    mode: 'squareRootFitPrediction',
    predictionX: 27,
    predictionTolerance: 0.001,
  });
  assert.equal(definition.expectedModelId, 'squareRoot');
  nearly(definition.expectedModel.model.a, -3);
  nearly(definition.expectedModel.model.h, 2);
  nearly(definition.expectedModel.model.k, 5);

  const right = gradeDataModelingResponse(definition, {
    a: -3,
    h: 2,
    k: 5,
    predictionX: 27,
    predictionY: -10,
    predictionType: 'extrapolation',
  });
  assert.equal(right.rejected, false);
  assert.equal(right.isCorrect, true);
  assert.equal(right.score, 1);

  const wrongH = gradeDataModelingResponse(definition, {
    a: -3,
    h: 3,
    k: 5,
    predictionX: 27,
    predictionY: -10,
    predictionType: 'extrapolation',
  });
  assert.equal(wrongH.isCorrect, false);
  assert.equal(wrongH.score, 0.5);
});

test('square-root fit uses the whole table for a rather than one hand-picked point', () => {
  const points = [
    [1, 4],
    [2, 6.05],
    [5, 8.10],
    [10, 10.02],
    [17, 12.08],
  ];
  const fit = pathSquareRootRegression(points);
  assert.ok(fit);
  nearly(fit.h, 1);
  nearly(fit.k, 4);
  assert.ok(fit.a > 1.99 && fit.a < 2.04);

  const publicQuestion = sanitizeDataModelingPublicQuestion({
    prompt: 'Use square-root regression technology.',
    mode: 'squareRootFitPrediction',
    points,
    predictionX: 26,
    squareRootATolerance: 999,
    squareRootHTolerance: 999,
    squareRootKTolerance: 999,
    expectedModel: 'squareRoot',
  });
  assert.equal(publicQuestion.mode, 'squareRootFitPrediction');
  assert.deepEqual(publicQuestion.points, points);
  assert.equal('expectedModel' in publicQuestion, false);
  assert.equal('squareRootATolerance' in publicQuestion, false);
  assert.equal('squareRootHTolerance' in publicQuestion, false);
  assert.equal('squareRootKTolerance' in publicQuestion, false);
});

test('A2.8B fit-only modes grade regression coefficients without requiring prediction', () => {
  const quadraticPoints = [-2, -1, 0, 1, 2].map((x, index) => {
    const residuals = [1, -2, 0, 2, -1];
    return [x, 2 * x * x - 3 * x + 4 + residuals[index]];
  });
  const quadratic = buildDataModelingPrivateDefinition({
    points: quadraticPoints,
    mode: 'quadraticFit',
    quadraticATolerance: 0.001,
    quadraticBTolerance: 0.001,
    quadraticCTolerance: 0.001,
  });
  assert.equal(quadratic.mode, 'quadraticFit');
  assert.equal(quadratic.expectedModelId, 'quadratic');
  assert.deepEqual(quadratic.requiredParts, ['fit']);
  nearly(quadratic.expectedModel.model.a, 2);
  nearly(quadratic.expectedModel.model.b, -3);
  nearly(quadratic.expectedModel.model.c, 4);

  const quadraticRight = gradeDataModelingResponse(quadratic, { a: 2, b: -3, c: 4 });
  assert.equal(quadraticRight.isCorrect, true);
  assert.equal(quadraticRight.score, 1);
  assert.equal(quadraticRight.parts.prediction, false, 'prediction is computed but must not be required');

  const quadraticWrong = gradeDataModelingResponse(quadratic, { a: 2, b: 3, c: 4 });
  assert.equal(quadraticWrong.isCorrect, false);
  assert.equal(quadraticWrong.score, 0);

  const exponentialPoints = [
    [0, 8.16],
    [1, 11.76],
    [2, 18.36],
    [3, 26.46],
    [4, 41.31],
  ];
  const exponential = buildDataModelingPrivateDefinition({
    points: exponentialPoints,
    mode: 'exponentialFit',
  });
  assert.equal(exponential.mode, 'exponentialFit');
  assert.equal(exponential.expectedModelId, 'exponential');
  assert.deepEqual(exponential.requiredParts, ['fit']);
  assert.ok(exponential.expectedModel.model.a > 0);
  assert.ok(exponential.expectedModel.model.base > 1);

  const exponentialRight = gradeDataModelingResponse(exponential, {
    a: exponential.expectedModel.model.a,
    base: exponential.expectedModel.model.base,
  });
  assert.equal(exponentialRight.isCorrect, true);
  assert.equal(exponentialRight.score, 1);

  const exponentialWrong = gradeDataModelingResponse(exponential, {
    a: exponential.expectedModel.model.a,
    base: exponential.expectedModel.model.base + 0.5,
  });
  assert.equal(exponentialWrong.isCorrect, false);
  assert.equal(exponentialWrong.score, 0);

  const quadraticPublic = sanitizeDataModelingPublicQuestion({
    points: quadraticPoints,
    mode: 'quadraticFit',
    expectedModel: 'quadratic',
    predictionX: null,
  });
  assert.equal(quadraticPublic.mode, 'quadraticFit');
  assert.equal('expectedModel' in quadraticPublic, false);
  assert.equal('predictionX' in quadraticPublic, false);
});
