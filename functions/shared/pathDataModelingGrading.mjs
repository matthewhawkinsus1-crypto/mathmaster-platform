// Server-safe grading helper for Data Modeling Lab.
//
// This mirrors the existing client mathematics without importing browser code
// into Cloud Functions. Parity tests compare the two implementations directly.
// The browser may display points, modes and requested prediction inputs; the
// server recomputes all regression/correlation/model-choice answers.

const EPS = 1e-9;
const finite = (value) => Number.isFinite(Number(value));
const list = (value) => (Array.isArray(value) ? value : []);
const mean = (values = []) => values.length
  ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
  : 0;

export const cleanPathDataPoints = (points = []) => list(points)
  .map((pair) => (Array.isArray(pair)
    ? [Number(pair?.[0]), Number(pair?.[1])]
    : [Number(pair?.x), Number(pair?.y)]))
  .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

export const pathCorrelation = (points = []) => {
  const clean = cleanPathDataPoints(points);
  if (clean.length < 2) return 0;
  const xs = clean.map(([x]) => x);
  const ys = clean.map(([, y]) => y);
  const mx = mean(xs);
  const my = mean(ys);
  let numerator = 0;
  let xSq = 0;
  let ySq = 0;
  clean.forEach(([x, y]) => {
    const dx = x - mx;
    const dy = y - my;
    numerator += dx * dy;
    xSq += dx * dx;
    ySq += dy * dy;
  });
  const denominator = Math.sqrt(xSq * ySq);
  return denominator ? numerator / denominator : 0;
};

export const pathLinearRegression = (points = []) => {
  const clean = cleanPathDataPoints(points);
  if (clean.length < 2) return { m: 0, b: mean(clean.map(([, y]) => y)), r: 0 };
  const xs = clean.map(([x]) => x);
  const ys = clean.map(([, y]) => y);
  const mx = mean(xs);
  const my = mean(ys);
  let numerator = 0;
  let denominator = 0;
  clean.forEach(([x, y]) => {
    numerator += (x - mx) * (y - my);
    denominator += (x - mx) ** 2;
  });
  const m = denominator ? numerator / denominator : 0;
  return { m, b: my - m * mx, r: pathCorrelation(clean) };
};

const solve3x3 = (matrix, vector) => {
  const a = matrix.map((row, index) => [...row.map(Number), Number(vector[index])]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < EPS) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j < 4; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j < 4; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return [a[0][3], a[1][3], a[2][3]];
};

export const pathQuadraticRegression = (points = []) => {
  const clean = cleanPathDataPoints(points);
  if (clean.length < 3) return null;
  const sx = clean.reduce((sum, [x]) => sum + x, 0);
  const sx2 = clean.reduce((sum, [x]) => sum + x ** 2, 0);
  const sx3 = clean.reduce((sum, [x]) => sum + x ** 3, 0);
  const sx4 = clean.reduce((sum, [x]) => sum + x ** 4, 0);
  const sy = clean.reduce((sum, [, y]) => sum + y, 0);
  const sxy = clean.reduce((sum, [x, y]) => sum + x * y, 0);
  const sx2y = clean.reduce((sum, [x, y]) => sum + x ** 2 * y, 0);
  const coeffs = solve3x3(
    [[sx4, sx3, sx2], [sx3, sx2, sx], [sx2, sx, clean.length]],
    [sx2y, sxy, sy],
  );
  return coeffs ? { a: coeffs[0], b: coeffs[1], c: coeffs[2] } : null;
};

export const pathExponentialRegression = (points = []) => {
  const clean = cleanPathDataPoints(points).filter(([, y]) => y > 0);
  if (clean.length < 2) return null;
  const mx = mean(clean.map(([x]) => x));
  const ml = mean(clean.map(([, y]) => Math.log(y)));
  let numerator = 0;
  let denominator = 0;
  clean.forEach(([x, y]) => {
    numerator += (x - mx) * (Math.log(y) - ml);
    denominator += (x - mx) ** 2;
  });
  if (Math.abs(denominator) < EPS) return null;
  const logBase = numerator / denominator;
  return { a: Math.exp(ml - logBase * mx), base: Math.exp(logBase) };
};

const predictLinear = (model, x) => Number(model.m) * Number(x) + Number(model.b);
const predictQuadratic = (model, x) => Number(model.a) * Number(x) ** 2 + Number(model.b) * Number(x) + Number(model.c);
const predictExponential = (model, x) => Number(model.a) * Number(model.base) ** Number(x);

export const pathModelMetrics = (points = [], predict) => {
  const clean = cleanPathDataPoints(points);
  if (!clean.length || typeof predict !== 'function') return { mae: Number.NaN, rmse: Number.NaN, sse: Number.NaN };
  const residuals = clean.map(([x, y]) => y - Number(predict(x)));
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  return {
    mae: residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length,
    rmse: Math.sqrt(sse / residuals.length),
    sse,
  };
};

export const buildPathCandidateModels = (points = []) => {
  const clean = cleanPathDataPoints(points);
  const models = [];
  const linear = pathLinearRegression(clean);
  if (linear) {
    const predict = (x) => predictLinear(linear, x);
    models.push({ id: 'linear', model: linear, predict, metrics: pathModelMetrics(clean, predict) });
  }
  const quadratic = pathQuadraticRegression(clean);
  if (quadratic) {
    const predict = (x) => predictQuadratic(quadratic, x);
    models.push({ id: 'quadratic', model: quadratic, predict, metrics: pathModelMetrics(clean, predict) });
  }
  const exponential = pathExponentialRegression(clean);
  if (exponential && finite(exponential.a) && finite(exponential.base)) {
    const predict = (x) => predictExponential(exponential, x);
    models.push({ id: 'exponential', model: exponential, predict, metrics: pathModelMetrics(clean, predict) });
  }
  return models;
};

export const choosePathBestModel = (models = [], metric = 'rmse') => {
  const valid = list(models).filter((entry) => Number.isFinite(entry.metrics?.[metric]));
  if (!valid.length) return null;
  return valid.reduce((best, current) => current.metrics[metric] < best.metrics[metric] ? current : best);
};

export const pathCorrelationDescriptor = (r) => {
  const value = Number(r);
  if (!Number.isFinite(value)) return { direction: 'none', strength: 'none' };
  const abs = Math.abs(value);
  return {
    direction: value > 0.05 ? 'positive' : value < -0.05 ? 'negative' : 'none',
    strength: abs >= 0.8 ? 'strong' : abs >= 0.5 ? 'moderate' : abs >= 0.2 ? 'weak' : 'none',
  };
};

export const pathPredictionKind = (points = [], x) => {
  const clean = cleanPathDataPoints(points);
  if (!clean.length || !finite(x)) return 'unknown';
  const xs = clean.map(([px]) => px);
  const value = Number(x);
  return value >= Math.min(...xs) && value <= Math.max(...xs) ? 'interpolation' : 'extrapolation';
};

const FIT_PREDICTION_MODES = Object.freeze({
  linearFitPrediction: 'linear',
  quadraticFitPrediction: 'quadratic',
  exponentialFitPrediction: 'exponential',
});

const supportedDataModelingModes = new Set([
  'full',
  'lineFit',
  'association',
  'correlation',
  'prediction',
  'modelCompare',
  ...Object.keys(FIT_PREDICTION_MODES),
]);

const requiredPartsForMode = (mode) => {
  if (mode === 'lineFit') return ['fit'];
  if (FIT_PREDICTION_MODES[mode]) return ['fit', 'prediction'];
  if (mode === 'association') return ['association'];
  if (mode === 'correlation') return ['correlation', 'correlationInterpretation'];
  if (mode === 'prediction') return ['prediction'];
  if (mode === 'modelCompare') return ['modelChoice'];
  return ['fit', 'association', 'modelChoice', 'prediction'];
};

const coefficientTolerance = (expected, authored, floor, relative = 0.05) => {
  if (finite(authored)) return Math.abs(Number(authored));
  const value = Number(expected);
  return Number.isFinite(value) ? Math.max(floor, Math.abs(value) * relative) : floor;
};

export const buildDataModelingPrivateDefinition = (question = {}) => {
  const points = cleanPathDataPoints(question.points);
  const regression = pathLinearRegression(points);
  const candidateModels = buildPathCandidateModels(points);
  const metric = ['rmse', 'mae', 'sse'].includes(String(question.modelMetric)) ? String(question.modelMetric) : 'rmse';
  const bestModel = choosePathBestModel(candidateModels, metric);
  const mode = supportedDataModelingModes.has(String(question.mode))
    ? String(question.mode)
    : 'full';
  // A TEKS-specific fit mode names the family the student must write. That is
  // stronger than "pick the best model": A.4C, A.8B and A.9E each name the
  // model family in the standard itself.
  const forcedModelId = FIT_PREDICTION_MODES[mode] || null;
  const expectedModelId = forcedModelId
    || (['linear', 'quadratic', 'exponential'].includes(String(question.expectedModel))
      ? String(question.expectedModel)
      : bestModel?.id || 'linear');
  const expectedModel = candidateModels.find((entry) => entry.id === expectedModelId) || null;
  const r = pathCorrelation(points);
  const descriptor = pathCorrelationDescriptor(r);
  const predictionX = finite(question.predictionX) ? Number(question.predictionX) : null;
  const model = expectedModel?.model || {};
  return {
    mode,
    points,
    regression,
    r,
    descriptor,
    causationExpected: question.causationSupported === true ? 'causation' : 'association',
    expectedModelId,
    expectedModel: expectedModel ? { id: expectedModel.id, model: expectedModel.model } : null,
    requiredParts: requiredPartsForMode(mode),
    predictionX,
    slopeTolerance: coefficientTolerance(regression.m, question.slopeTolerance, 0.2, 0.12),
    interceptTolerance: coefficientTolerance(regression.b, question.interceptTolerance, 0.8, 0.08),
    quadraticTolerance: {
      a: coefficientTolerance(model.a, question.quadraticATolerance, 0.03),
      b: coefficientTolerance(model.b, question.quadraticBTolerance, 0.08),
      c: coefficientTolerance(model.c, question.quadraticCTolerance, 0.2),
    },
    exponentialTolerance: {
      a: coefficientTolerance(model.a, question.exponentialATolerance, 0.08),
      base: coefficientTolerance(model.base, question.exponentialBaseTolerance, 0.02, 0.03),
    },
    correlationTolerance: finite(question.correlationTolerance) ? Math.abs(Number(question.correlationTolerance)) : 0.03,
    predictionTolerance: finite(question.predictionTolerance) ? Math.abs(Number(question.predictionTolerance)) : null,
  };
};

export const dataModelingDefinitionIsGradable = (definition = {}) => (
  cleanPathDataPoints(definition.points).length >= 2
  && definition.regression
  && definition.expectedModel
  && list(definition.requiredParts).length > 0
);

const predictFromStoredModel = (entry, x) => {
  if (!entry || !finite(x)) return Number.NaN;
  if (entry.id === 'linear') return predictLinear(entry.model, x);
  if (entry.id === 'quadratic') return predictQuadratic(entry.model, x);
  if (entry.id === 'exponential') return predictExponential(entry.model, x);
  return Number.NaN;
};

export const gradeDataModelingResponse = (definition = {}, raw = {}) => {
  if (!dataModelingDefinitionIsGradable(definition)) {
    return { isCorrect: false, score: 0, rejected: true, reason: 'ungradable_data_modeling_definition', parts: {} };
  }
  const results = {};
  const m = Number(raw.m);
  const b = Number(raw.b);
  if (definition.expectedModelId === 'quadratic' && FIT_PREDICTION_MODES[definition.mode]) {
    const a = Number(raw.a);
    const qb = Number(raw.b);
    const qc = Number(raw.c);
    const expected = definition.expectedModel?.model || {};
    results.fit = [a, qb, qc].every(Number.isFinite)
      && Math.abs(a - Number(expected.a)) <= definition.quadraticTolerance.a
      && Math.abs(qb - Number(expected.b)) <= definition.quadraticTolerance.b
      && Math.abs(qc - Number(expected.c)) <= definition.quadraticTolerance.c;
  } else if (definition.expectedModelId === 'exponential' && FIT_PREDICTION_MODES[definition.mode]) {
    const a = Number(raw.a);
    const base = Number(raw.base);
    const expected = definition.expectedModel?.model || {};
    results.fit = Number.isFinite(a) && Number.isFinite(base)
      && Math.abs(a - Number(expected.a)) <= definition.exponentialTolerance.a
      && Math.abs(base - Number(expected.base)) <= definition.exponentialTolerance.base;
  } else {
    results.fit = Number.isFinite(m) && Number.isFinite(b)
      && Math.abs(m - definition.regression.m) <= definition.slopeTolerance
      && Math.abs(b - definition.regression.b) <= definition.interceptTolerance;
  }

  results.association = String(raw.direction) === definition.descriptor.direction
    && String(raw.strength) === definition.descriptor.strength
    && String(raw.causation) === definition.causationExpected;

  const enteredR = Number(raw.r);
  results.correlation = Number.isFinite(enteredR)
    && Math.abs(enteredR - definition.r) <= definition.correlationTolerance;

  results.modelChoice = String(raw.modelChoice) === definition.expectedModelId;

  const rawPredictionX = Number(raw.predictionX);
  // If the author supplied a target x, it is part of the question and cannot
  // be replaced by the browser with an easier value. This closes a real Path
  // grading hole: previously the server graded whatever x the client chose.
  const predictionX = definition.predictionX ?? rawPredictionX;
  const predictionY = Number(raw.predictionY);
  const fixedXMatches = definition.predictionX == null
    || (Number.isFinite(rawPredictionX) && Math.abs(rawPredictionX - definition.predictionX) <= 1e-9);
  const expectedPrediction = predictFromStoredModel(definition.expectedModel, predictionX);
  const defaultPredictionTolerance = Number.isFinite(expectedPrediction)
    ? Math.max(0.5, Math.abs(expectedPrediction) * 0.08)
    : Number.NaN;
  const predictionTolerance = definition.predictionTolerance ?? defaultPredictionTolerance;
  results.prediction = fixedXMatches
    && Number.isFinite(predictionX) && Number.isFinite(predictionY)
    && Number.isFinite(expectedPrediction) && Number.isFinite(predictionTolerance)
    && Math.abs(predictionY - expectedPrediction) <= predictionTolerance
    && String(raw.predictionType) === pathPredictionKind(definition.points, predictionX);

  const required = list(definition.requiredParts);
  const correctCount = required.filter((part) => results[part]).length;
  return {
    isCorrect: correctCount === required.length,
    score: required.length ? correctCount / required.length : 0,
    rejected: false,
    reason: null,
    parts: results,
    expectedPrediction: Number.isFinite(expectedPrediction) ? expectedPrediction : null,
    expectedPredictionType: pathPredictionKind(definition.points, predictionX),
  };
};

export const sanitizeDataModelingPublicQuestion = (question = {}) => ({
  prompt: String(question.prompt || ''),
  mode: supportedDataModelingModes.has(String(question.mode))
    ? String(question.mode)
    : 'full',
  points: cleanPathDataPoints(question.points),
  ...(question.startingModel && typeof question.startingModel === 'object'
    ? { startingModel: { m: Number(question.startingModel.m), b: Number(question.startingModel.b) } }
    : {}),
  ...(finite(question.predictionX) ? { predictionX: Number(question.predictionX) } : {}),
  ...(question.modelMetric ? { modelMetric: String(question.modelMetric) } : {}),
  ...(question.context && typeof question.context === 'object' ? { context: question.context } : {}),
});
