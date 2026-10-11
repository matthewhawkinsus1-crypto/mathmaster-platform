const EPS = 1e-9;

export const mean = (values = []) => values.length
  ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
  : 0;

export const predictLinear = (model, x) => Number(model.m) * Number(x) + Number(model.b);
export const predictQuadratic = (model, x) => Number(model.a) * Number(x) ** 2 + Number(model.b) * Number(x) + Number(model.c);
export const predictExponential = (model, x) => Number(model.a) * Number(model.base) ** Number(x);
export const predictSquareRoot = (model, x) => {
  const value = Number(x);
  const h = Number(model.h);
  if (!Number.isFinite(value) || !Number.isFinite(h) || value < h) return Number.NaN;
  return Number(model.a) * Math.sqrt(value - h) + Number(model.k);
};

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

/*
 * Least-squares quadratic y = ax² + bx + c.
 *
 * The normal equations are solved in u = (x − x̄) ÷ s (s = the largest
 * |x − x̄|), then expanded back to x. Solved in raw x they are hopeless in
 * floating point for calendar-year data: Σx⁴ is about 2e14 when x is about
 * 2000, so 2002…2035 data came back with c off by 0.085 (the grader then
 * rejected the exact fit a calculator gives) and 1988…1998 data with no
 * quadratic at all. Centred and scaled, the matrix entries are between 0 and
 * n, so the singularity test (fewer than three distinct x) is a fixed size.
 */
export const quadraticRegression = (points = []) => {
  const clean = points
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (clean.length < 3) return null;

  const center = mean(clean.map(([x]) => x));
  const spread = Math.max(...clean.map(([x]) => Math.abs(x - center)));
  if (!(spread > 0)) return null;
  const scaled = clean.map(([x, y]) => [(x - center) / spread, y]);
  const su = scaled.reduce((s, [u]) => s + u, 0);
  const su2 = scaled.reduce((s, [u]) => s + u ** 2, 0);
  const su3 = scaled.reduce((s, [u]) => s + u ** 3, 0);
  const su4 = scaled.reduce((s, [u]) => s + u ** 4, 0);
  const sy = scaled.reduce((s, [, y]) => s + y, 0);
  const suy = scaled.reduce((s, [u, y]) => s + u * y, 0);
  const su2y = scaled.reduce((s, [u, y]) => s + u ** 2 * y, 0);
  const coeffs = solve3x3(
    [[su4, su3, su2], [su3, su2, su], [su2, su, clean.length]],
    [su2y, suy, sy],
  );
  if (!coeffs) return null;
  // y = A·u² + B·u + C with u = (x − x̄) ÷ s, expanded in x.
  const a = coeffs[0] / spread ** 2;
  const slope = coeffs[1] / spread;
  return { a, b: slope - 2 * a * center, c: a * center ** 2 - slope * center + coeffs[2] };
};

export const exponentialRegression = (points = []) => {
  const clean = points
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && y > 0);
  // HIGH-01: a log transform is only defined for y > 0, so non-positive points
  // are filtered rather than used to reject the whole dataset — one stray zero
  // used to make an otherwise clean exponential set unfittable.
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

/**
 * Endpoint-anchored square-root regression for y = a*sqrt(x-h)+k.
 *
 * Algebra II A2.4E tables include the endpoint as the smallest x-value.
 * Technology identifies that endpoint (h,k), then fits a by least squares
 * across EVERY remaining observation. This is deliberately deterministic so
 * browser and server can reproduce the same fitted model exactly.
 */
export const squareRootRegression = (points = []) => {
  const clean = points
    .map(([x, y]) => [Number(x), Number(y)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .sort((left, right) => left[0] - right[0]);
  if (clean.length < 3) return null;

  const h = clean[0][0];
  const endpointRows = clean.filter(([x]) => Math.abs(x - h) <= EPS);
  if (endpointRows.length !== 1) return null;
  const k = endpointRows[0][1];

  let numerator = 0;
  let denominator = 0;
  let usable = 0;
  clean.forEach(([x, y]) => {
    if (x <= h + EPS) return;
    const root = Math.sqrt(x - h);
    numerator += root * (y - k);
    denominator += root * root;
    usable += 1;
  });
  if (usable < 2 || Math.abs(denominator) < EPS) return null;
  const a = numerator / denominator;
  return Number.isFinite(a) ? { a, h, k } : null;
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
  const squareRoot = squareRootRegression(points);
  if (squareRoot && [squareRoot.a, squareRoot.h, squareRoot.k].every(Number.isFinite)) {
    const predict = (x) => predictSquareRoot(squareRoot, x);
    models.push({ id: 'squareRoot', label: 'Square Root', model: squareRoot, predict, metrics: modelMetrics(points, predict) });
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

/*
 * r IS NEVER SHOWN AS A PERFECT 1 UNLESS IT IS ONE.
 *
 * Rounded to three places, r = 0.99966 printed "r = 1" beside the regression
 * line (live QA, Algebra I DOL #2 practice-hours data) — telling students the
 * five points sat exactly on a line when they do not. Keep adding places until
 * the shown value is not ±1; only an exactly perfect fit reads as one.
 */
export const formatCorrelation = (r) => {
  const value = Number(r);
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) === 1) return value > 0 ? '1' : '-1';
  for (let places = 3; places <= 6; places += 1) {
    const text = value.toFixed(places);
    if (Math.abs(Number(text)) < 1) return text;
  }
  return value > 0 ? '0.999999' : '-0.999999';
};

export const predictionKind = (points = [], x) => {
  if (!points.length || !Number.isFinite(Number(x))) return 'unknown';
  const xs = points.map(([px]) => Number(px));
  const value = Number(x);
  return value >= Math.min(...xs) && value <= Math.max(...xs) ? 'interpolation' : 'extrapolation';
};
