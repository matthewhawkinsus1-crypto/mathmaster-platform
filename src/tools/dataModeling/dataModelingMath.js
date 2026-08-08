const EPS = 1e-9;

export const mean = (values = []) => values.length
  ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
  : 0;

export const predictLinear = (model, x) => Number(model.m) * Number(x) + Number(model.b);
export const predictQuadratic = (model, x) => Number(model.a) * Number(x) ** 2 + Number(model.b) * Number(x) + Number(model.c);
export const predictExponential = (model, x) => Number(model.a) * Number(model.base) ** Number(x);

const solve3x3 = (matrix, vector) => {
  const a = matrix.map((row, i) => [...row.map(Number), Number(vector[i])]);
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

export const quadraticRegression = (points = []) => {
  const clean = points
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (clean.length < 3) return null;

  const sx = clean.reduce((s, [x]) => s + x, 0);
  const sx2 = clean.reduce((s, [x]) => s + x ** 2, 0);
  const sx3 = clean.reduce((s, [x]) => s + x ** 3, 0);
  const sx4 = clean.reduce((s, [x]) => s + x ** 4, 0);
  const sy = clean.reduce((s, [, y]) => s + y, 0);
  const sxy = clean.reduce((s, [x, y]) => s + x * y, 0);
  const sx2y = clean.reduce((s, [x, y]) => s + x ** 2 * y, 0);
  const coeffs = solve3x3(
    [[sx4, sx3, sx2], [sx3, sx2, sx], [sx2, sx, clean.length]],
    [sx2y, sxy, sy],
  );
  if (!coeffs) return null;
  return { a: coeffs[0], b: coeffs[1], c: coeffs[2] };
};

export const exponentialRegression = (points = []) => {
  const clean = points
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && y > 0);
  // HIGH-01: a log transform is only defined for y > 0, so non-positive points
  // are filtered rather than used to reject the whole dataset — one stray zero
  // used to make an otherwise clean exponential set unfittable. `droppedPoints`
  // is reported so a caller can tell the student the fit ignored some data
  // instead of silently fitting a subset.
  if (clean.length < 2) return null;
  const droppedPoints = points.length - clean.length;
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
  return { a: Math.exp(ml - logBase * mx), base: Math.exp(logBase), droppedPoints };
};

export const modelMetrics = (points = [], predict) => {
  if (!points.length || typeof predict !== 'function') return { mae: Number.NaN, rmse: Number.NaN, sse: Number.NaN };
  const residuals = points.map(([x, y]) => Number(y) - Number(predict(Number(x))));
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  return {
    mae: residuals.reduce((sum, value) => sum + Math.abs(value), 0) / residuals.length,
    rmse: Math.sqrt(sse / residuals.length),
    sse,
  };
};

export const buildCandidateModels = (points = [], linearModel = null) => {
  const models = [];
  if (linearModel) {
    const predict = (x) => predictLinear(linearModel, x);
    models.push({ id: 'linear', label: 'Linear', model: linearModel, predict, metrics: modelMetrics(points, predict) });
  }
  const quadratic = quadraticRegression(points);
  if (quadratic) {
    const predict = (x) => predictQuadratic(quadratic, x);
    models.push({ id: 'quadratic', label: 'Quadratic', model: quadratic, predict, metrics: modelMetrics(points, predict) });
  }
  const exponential = exponentialRegression(points);
  if (exponential && Number.isFinite(exponential.a) && Number.isFinite(exponential.base)) {
    const predict = (x) => predictExponential(exponential, x);
    models.push({ id: 'exponential', label: 'Exponential', model: exponential, predict, metrics: modelMetrics(points, predict) });
  }
  return models;
};

export const chooseBestModel = (models = [], metric = 'rmse') => {
  const valid = models.filter((entry) => Number.isFinite(entry.metrics?.[metric]));
  if (!valid.length) return null;
  return valid.reduce((best, current) => current.metrics[metric] < best.metrics[metric] ? current : best);
};

export const correlationDescriptor = (r) => {
  const value = Number(r);
  if (!Number.isFinite(value)) return { direction: 'none', strength: 'none' };
  const abs = Math.abs(value);
  const direction = value > 0.05 ? 'positive' : value < -0.05 ? 'negative' : 'none';
  const strength = abs >= 0.8 ? 'strong' : abs >= 0.5 ? 'moderate' : abs >= 0.2 ? 'weak' : 'none';
  return { direction, strength };
};

export const predictionKind = (points = [], x) => {
  if (!points.length || !Number.isFinite(Number(x))) return 'unknown';
  const xs = points.map(([px]) => Number(px));
  const value = Number(x);
  return value >= Math.min(...xs) && value <= Math.max(...xs) ? 'interpolation' : 'extrapolation';
};
