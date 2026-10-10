import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { buildDataModelingLabReview } from '../../src/tools/shared/reviews/dataModelingLabReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

/*
 * JOB K AUDIT — THE DATA MODELING LAB'S WORKED SOLUTION, RECOMPUTED.
 *
 * Job A shipped buildDataModelingLabReview without the independent
 * mathematics review it planned. This file is that review. Over seeded data
 * sets in every mode the lab renders (full, lineFit with and without a
 * prediction, the three fit-only and four fit-and-predict families,
 * association, correlation, prediction, modelCompare) — whole numbers, one- to
 * four-place decimals, negatives, linear / quadratic / exponential /
 * square-root / scattered shapes, repeated x-values, a stray non-positive y,
 * every metric, authored families, causation flags and prediction targets
 * inside, outside and between the data — it builds the review and recomputes
 * what it shows with exact fractions (mathjs in Fraction mode) or plain
 * floating point, never with the lab's helpers:
 *
 *   - every fitted coefficient (least squares written out here: the line, the
 *     3×3 normal equations solved by elimination, the log-linear exponential,
 *     the endpoint-anchored square root), r, its direction and strength (the
 *     lab's 0.05 / 0.2 / 0.5 / 0.8 edges), each family's RMSE / MAE / SSE and
 *     the family with the smallest, the prediction and its type;
 *   - every printed number is the true value rounded to the digits it shows,
 *     and "=" only where it is exact;
 *   - every written-out substitution ("ŷ = …", "b = ȳ − m·x̄ = …",
 *     "a = e^(…)", "r ≈ A ÷ √(B · C)", the normal equations) evaluates to
 *     what it is set equal to;
 *   - the equation item is the coefficient items;
 *   - the reading sentences are true of the r they print;
 *   - the shared grader marks the stated work correct;
 *   - display hygiene; and a null review only where there is no one answer
 *     the lab could be explained by.
 */

const TOOL_ID = 'dataModelingLab';
const math = create(all, { number: 'Fraction' });
const fmath = create(all);

/* ------------------------------------------------------------ the draws */

const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const intIn = (rand, low, high) => low + Math.floor(rand() * (high - low + 1));
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const round = (value, places) => Number(value.toFixed(places)) + 0;

const xValues = (rand, n) => {
  const style = pick(rand, ['consecutive', 'spaced', 'decimal', 'negative', 'repeated', 'years']);
  // Calendar years: x near 2000, where sums of x⁴ are about 1e14.
  if (style === 'years') {
    const start = intIn(rand, 1985, 2015);
    const step = pick(rand, [1, 2, 3]);
    return Array.from({ length: n }, (_, index) => start + step * index);
  }
  if (style === 'consecutive') return Array.from({ length: n }, (_, index) => index + intIn(rand, 0, 1));
  if (style === 'spaced') return Array.from({ length: n }, (_, index) => 2 * index + 1);
  if (style === 'decimal') return Array.from({ length: n }, (_, index) => round(0.5 * index + 0.25 * intIn(rand, 0, 1), 2));
  if (style === 'negative') return Array.from({ length: n }, (_, index) => index - Math.floor(n / 2));
  // A repeated x (never the smallest, so a square root keeps one endpoint).
  const xs = Array.from({ length: n }, (_, index) => index + 1);
  xs[n - 1] = xs[n - 2];
  return xs;
};

const SHAPES = {
  linear: (rand, x, places) => round(intIn(rand, -4, 4) * 0.5 * x + intIn(rand, -5, 5) + (rand() - 0.5) * 2, places),
  quadratic: (rand, x, places) => round(0.8 * x * x - 1.5 * x + 2 + (rand() - 0.5), places),
  exponential: (rand, x, places) => round(3 * 1.6 ** x * (1 + (rand() - 0.5) * 0.1), places),
  decay: (rand, x, places) => round(50 * 0.7 ** x * (1 + (rand() - 0.5) * 0.1), places),
  squareRoot: (rand, x, places) => round(2 * Math.sqrt(Math.max(0, x + 1)) + 1 + (rand() - 0.5) * 0.4, places),
  scattered: (rand, x, places) => round(rand() * 10, places),
};

const drawPoints = (rand) => {
  const n = intIn(rand, 3, 9);
  const xs = xValues(rand, n);
  const shape = pick(rand, Object.keys(SHAPES));
  const places = pick(rand, [0, 1, 1, 2, 2, 3, 4]);
  // A shape is drawn in x − x₀ (x₀ = 1980 for calendar years), so its values stay in range.
  const origin = xs[0] > 1000 ? 1980 + intIn(rand, 0, 5) : 0;
  const points = xs.map((x) => [x, SHAPES[shape](rand, origin ? (x - origin) / 5 : x, places)]);
  const style = rand();
  // Authored as {x, y} objects, or as typed text ("3.5"), now and then.
  if (style < 0.15) return points.map(([x, y]) => ({ x, y }));
  if (style < 0.22) return points.map(([x, y]) => [String(x), String(y)]);
  return points;
};

const MODES = [
  'full', 'lineFit', 'linearFit', 'quadraticFit', 'exponentialFit',
  'linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction', 'squareRootFitPrediction',
  'association', 'correlation', 'prediction', 'modelCompare',
];

const drawQuestion = (rand, mode) => {
  const points = drawPoints(rand);
  const xs = points.map((point) => Number(Array.isArray(point) ? point[0] : point.x));
  const question = { type: TOOL_ID, ...(mode === 'full' && rand() < 0.3 ? {} : { mode }), points };
  const target = pick(rand, ['none', 'inside', 'outside', 'decimal', 'negative']);
  const asksTarget = ['full', 'prediction'].includes(mode) || mode.endsWith('FitPrediction') || (mode === 'lineFit' && rand() < 0.5);
  if (asksTarget && target !== 'none') {
    question.predictionX = target === 'inside' ? xs[intIn(rand, 0, xs.length - 1)]
      : target === 'outside' ? Math.max(...xs) + intIn(rand, 1, 4)
        : target === 'decimal' ? round(Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs) + 2), 2)
          : Math.min(...xs) - intIn(rand, 1, 3);
  }
  if (['full', 'association'].includes(mode) && rand() < 0.4) question.causationSupported = rand() < 0.5;
  if (['full', 'prediction', 'modelCompare'].includes(mode)) {
    if (rand() < 0.3) question.modelMetric = pick(rand, ['rmse', 'mae', 'sse']);
    if (rand() < 0.25) question.expectedModel = pick(rand, ['linear', 'quadratic', 'exponential', 'squareRoot']);
  }
  if (mode === 'lineFit' && rand() < 0.3) question.studentActions = ['fitDataModel'];
  // Tight authored tolerances, so the review must show more digits to be accepted.
  if (rand() < 0.2) {
    Object.assign(question, pick(rand, [
      { predictionTolerance: 0.001 },
      { correlationTolerance: 0.0005 },
      { slopeTolerance: 0.001, interceptTolerance: 0.001 },
      { quadraticATolerance: 0.0001, quadraticBTolerance: 0.0001, quadraticCTolerance: 0.0001 },
      { exponentialATolerance: 0.0001, exponentialBaseTolerance: 0.00001 },
      { squareRootATolerance: 0.0001 },
    ]));
  }
  return question;
};

/* ------------------------------------------------- independent mathematics */

const F = (value) => math.fraction(typeof value === 'number'
  ? value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 })
  : String(value));
const fsum = (values) => values.reduce((total, value) => math.add(total, value), F(0));

// Solve a square system of Fractions by Gauss–Jordan elimination; null when singular.
const solveExact = (matrix, vector) => {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  const size = rows.length;
  for (let col = 0; col < size; col += 1) {
    const pivot = rows.findIndex((row, index) => index >= col && !math.equal(row[col], 0));
    if (pivot < 0) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = math.divide(rows[row][col], rows[col][col]);
      rows[row] = rows[row].map((value, index) => math.subtract(value, math.multiply(factor, rows[col][index])));
    }
  }
  return rows.map((row, index) => math.divide(row[size], row[index]));
};

const truth = (question) => {
  const points = question.points.map((point) => (Array.isArray(point) ? point : [point.x, point.y])).map(([x, y]) => [Number(x), Number(y)]);
  const X = points.map(([x]) => F(x));
  const Yv = points.map(([, y]) => F(y));
  const n = points.length;
  const xBar = math.divide(fsum(X), n);
  const yBar = math.divide(fsum(Yv), n);
  const sxx = fsum(X.map((x) => math.square(math.subtract(x, xBar))));
  const syy = fsum(Yv.map((y) => math.square(math.subtract(y, yBar))));
  const sxy = fsum(X.map((x, index) => math.multiply(math.subtract(x, xBar), math.subtract(Yv[index], yBar))));
  if (math.equal(sxx, 0) || math.equal(syy, 0)) return { points, degenerate: true };
  const m = math.divide(sxy, sxx);
  const b = math.subtract(yBar, math.multiply(m, xBar));
  const r = Math.sign(Number(sxy)) * Math.sqrt(Number(math.divide(math.square(sxy), math.multiply(sxx, syy))));

  const families = {};
  families.linear = { coefficients: { m: Number(m), b: Number(b) }, exact: { m, b }, predict: (x) => Number(m) * x + Number(b) };
  const power = (k) => fsum(X.map((x) => math.pow(x, k)));
  const powerY = (k) => fsum(X.map((x, index) => math.multiply(math.pow(x, k), Yv[index])));
  const sums = { sx: power(1), sx2: power(2), sx3: power(3), sx4: power(4), sy: fsum(Yv), sxy: powerY(1), sx2y: powerY(2) };
  const quad = solveExact(
    [[sums.sx4, sums.sx3, sums.sx2], [sums.sx3, sums.sx2, sums.sx], [sums.sx2, sums.sx, F(n)]],
    [sums.sx2y, sums.sxy, sums.sy],
  );
  if (quad) {
    const [qa, qb, qc] = quad.map(Number);
    families.quadratic = { coefficients: { a: qa, b: qb, c: qc }, exact: { a: quad[0], b: quad[1], c: quad[2] }, sums, predict: (x) => qa * x * x + qb * x + qc };
  }
  const positive = points.filter(([, y]) => y > 0);
  if (positive.length >= 2) {
    const ux = positive.map(([x]) => x);
    const logs = positive.map(([, y]) => Math.log(y));
    const mx = fmath.mean(ux);
    const ml = fmath.mean(logs);
    const den = fmath.sum(ux.map((x) => (x - mx) ** 2));
    // The lab works in floating point: an a or base that overflows (decreasing
    // calendar-year data, a ≈ e^2000) is no family it can fit or show.
    if (den > 1e-9 && Number.isFinite(Math.exp(fmath.sum(ux.map((x, index) => (x - mx) * (logs[index] - ml))) / den)) && Number.isFinite(Math.exp(ml - (fmath.sum(ux.map((x, index) => (x - mx) * (logs[index] - ml))) / den) * mx))) {
      const slope = fmath.sum(ux.map((x, index) => (x - mx) * (logs[index] - ml))) / den;
      const a = Math.exp(ml - slope * mx);
      const base = Math.exp(slope);
      families.exponential = { coefficients: { a, base }, logs, mx, ml, slope, dropped: points.filter(([, y]) => !(y > 0)), predict: (x) => a * base ** x };
    }
  }
  const minX = Math.min(...points.map(([x]) => x));
  const atMin = points.filter(([x]) => x === minX);
  const beyond = points.filter(([x]) => x > minX);
  if (atMin.length === 1 && beyond.length >= 2) {
    const [h, k] = atMin[0];
    const num = fmath.sum(beyond.map(([x, y]) => Math.sqrt(x - h) * (y - k)));
    const den = fmath.sum(beyond.map(([x]) => x - h));
    const a = num / den;
    families.squareRoot = { coefficients: { a, h, k }, num, den, predict: (x) => (x < h ? Number.NaN : a * Math.sqrt(x - h) + k) };
  }
  Object.values(families).forEach((family) => {
    const residuals = points.map(([x, y]) => y - family.predict(x));
    const sse = fmath.sum(residuals.map((value) => value ** 2));
    family.metrics = { sse, rmse: Math.sqrt(sse / n), mae: fmath.sum(residuals.map(Math.abs)) / n };
  });
  return { points, n, xBar, yBar, sxx, syy, sxy, m, b, r, families, minX, maxX: Math.max(...points.map(([x]) => x)) };
};

// The lab's reading of r, written out: |r| ≥ 0.8 strong, ≥ 0.5 moderate, ≥ 0.2 weak; beyond ±0.05 a direction.
const reading = (r) => ({
  direction: r > 0.05 ? 'Positive' : r < -0.05 ? 'Negative' : 'No clear direction',
  strength: Math.abs(r) >= 0.8 ? 'Strong' : Math.abs(r) >= 0.5 ? 'Moderate' : Math.abs(r) >= 0.2 ? 'Weak' : 'None',
});

const FORCED = {
  linearFit: 'linear', quadraticFit: 'quadratic', exponentialFit: 'exponential',
  linearFitPrediction: 'linear', quadraticFitPrediction: 'quadratic', exponentialFitPrediction: 'exponential', squareRootFitPrediction: 'squareRoot',
};
const LABELS = { linear: 'Linear', quadratic: 'Quadratic', exponential: 'Exponential', squareRoot: 'Square Root' };
const PARTS = (mode, question) => {
  const lineFitPrediction = mode === 'lineFit' && question.predictionX !== undefined;
  if (mode === 'lineFit' || ['linearFit', 'quadraticFit', 'exponentialFit'].includes(mode)) return lineFitPrediction ? ['fit', 'prediction'] : ['fit'];
  if (mode.endsWith('FitPrediction')) return ['fit', 'prediction'];
  if (mode === 'association') return ['association'];
  if (mode === 'correlation') return ['correlation'];
  if (mode === 'prediction') return ['prediction'];
  if (mode === 'modelCompare') return ['modelChoice'];
  return ['fit', 'association', 'modelChoice', 'prediction'];
};

/* ------------------------------------------------------------ reading the page */

const num = (text) => Number(String(text).replace(/[()]/g, '').replace(/−/g, '-'));
const decimals = (text) => (String(text).split('.')[1] || '').length;
const halfUlp = (text) => 0.5 * 10 ** -decimals(text);
const rounds = (text, value) => Math.abs(num(text) - value) <= halfUlp(text) * (1 + 1e-9) + 1e-12 * Math.abs(value);
// Exact: equal as fractions where the true value is a Fraction, else to float noise.
const exactly = (text, value) => (value && typeof value === 'object'
  ? math.equal(F(String(text).replace(/[()]/g, '').replace(/−/g, '-')), value)
  : Math.abs(num(text) - Number(value)) <= 1e-10 * Math.abs(Number(value)) + 1e-300);

// A printed value against its true value: "=" only when exact, "≈" the true value rounded.
const assertRel = (label, relation, text, value) => {
  if (relation === '=') assert.ok(exactly(text, value), `${label}: "= ${text}" is exact (true ${Number(value)})`);
  // "≈" for a value that happens to be exact is not false (the lab compares
  // floating-point values, so 27.749000000000002 reads "≈ 27.749"): only rounding is checked.
  else assert.ok(rounds(text, Number(value)), `${label}: "≈ ${text}" rounds ${Number(value)}`);
};

// A written-out expression's value against what it is set equal to: "=" to
// float noise, "≈" within half a unit of the stated value's last place.
const assertWritten = (label, value, relation, text) => {
  const gap = Math.abs(value - num(text));
  if (relation === '=') assert.ok(gap <= 1e-9 * Math.max(1, Math.abs(value)), `${label} (it is ${value})`);
  else assert.ok(gap <= halfUlp(text) * (1 + 1e-6) + 1e-12 * Math.abs(value), `${label} (it is ${value})`);
};

// A written-out expression, evaluated as a reader would.
const evaluate = (expression) => fmath.evaluate(expression
  .replace(/−/g, '-').replace(/·/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/√/g, 'sqrt'));

const HYGIENE = [
  [/NaN|undefined|Infinity|null|\[object/, 'a broken value'],
  [/\d[eE][+-]?\d/, 'exponent notation'],
  [/\+ [−-]|[−-] [−-]|--|−−|[−-]\(−|\+ \(−/, 'a doubled sign'],
  [/(?<![\d.])[−-]0(?![.\d])/, 'a negative zero'],
  [/(?<![\d.])1x|(?<![\d.])1√|(?<![\d.])0x/, 'a 1x or 0x coefficient'],
];
const assertHygiene = (label, text) => {
  HYGIENE.forEach(([pattern, what]) => assert.doesNotMatch(text, pattern, `${label}: ${what}`));
};

const OPTION = {
  Direction: ['direction', { Positive: 'positive', Negative: 'negative', 'No clear direction': 'none' }],
  Strength: ['strength', { Strong: 'strong', Moderate: 'moderate', Weak: 'weak', None: 'none' }],
  'What the data can justify': ['causation', { 'An association / relationship': 'association', 'A cause-and-effect conclusion': 'causation' }],
  'Model family': ['modelChoice', { Linear: 'linear', Quadratic: 'quadratic', Exponential: 'exponential', 'Square Root': 'squareRoot' }],
  'This prediction is': ['predictionType', { Interpolation: 'interpolation', Extrapolation: 'extrapolation' }],
};
const FIELD = {
  'Slope m': 'm', 'Intercept b': 'b', 'a (x² coefficient)': 'a', 'b (x coefficient)': 'b', 'c (constant)': 'c',
  'a (value at x = 0)': 'a', 'Base b': 'base', 'a (scale)': 'a', 'h (endpoint x)': 'h', 'k (endpoint y)': 'k',
  'Correlation coefficient r': 'r', 'Predict at x =': 'predictionX', 'Predicted y': 'predictionY',
};

const itemsOf = (model) => Object.fromEntries(model.items.map((item) => [item.label, item.value]));

const workOf = (model, question, xs) => {
  const work = {
    r: '', direction: '', strength: '', causation: '', modelChoice: '',
    predictionX: question.predictionX ?? Math.ceil(Math.max(...xs, 1) + 1), predictionY: '', predictionType: '', choicesOwn: true,
  };
  model.items.forEach(({ label, value }) => {
    if (OPTION[label]) work[OPTION[label][0]] = OPTION[label][1][value];
    else if (FIELD[label]) work[FIELD[label]] = value;
  });
  return work;
};

// The equation item, read back to its coefficients.
const equationCoefficients = (family, text) => {
  const body = text.replace(/^y = /, '').replace(/−/g, '-').replace(/ ([+-]) /g, ' $1');
  if (family === 'exponential') {
    const match = body.match(/^(-?[\d.]+)\(([\d.]+)\)\^x$/);
    return match && { a: Number(match[1]), base: Number(match[2]) };
  }
  if (family === 'squareRoot') {
    const match = body.match(/^(-?[\d.]*)√\(x(?: ([+-])([\d.]+))?\)(?: ([+-])([\d.]+))?$/);
    if (!match) return null;
    const a = match[1] === '' ? 1 : match[1] === '-' ? -1 : Number(match[1]);
    return { a, h: match[2] ? (match[2] === '-' ? 1 : -1) * Number(match[3]) : 0, k: match[4] ? (match[4] === '-' ? -1 : 1) * Number(match[5]) : 0 };
  }
  // A polynomial: terms in x², x and a constant.
  const terms = { 2: 0, 1: 0, 0: 0 };
  const tokens = body.split(' ');
  for (const token of tokens) {
    const match = token.match(/^([+-]?)([\d.]*)(x²|x)?$/);
    if (!match || (match[2] === '' && !match[3])) return null;
    const coefficient = (match[1] === '-' ? -1 : 1) * (match[2] === '' ? 1 : Number(match[2]));
    terms[match[3] === 'x²' ? 2 : match[3] === 'x' ? 1 : 0] += coefficient;
  }
  return family === 'quadratic' ? { a: terms[2], b: terms[1], c: terms[0] } : { m: terms[1], b: terms[0] };
};

/* ------------------------------------------------------------ the audit */

const FAMILY_ITEMS = {
  linear: { m: 'Slope m', b: 'Intercept b' },
  quadratic: { a: 'a (x² coefficient)', b: 'b (x coefficient)', c: 'c (constant)' },
  exponential: { a: 'a (value at x = 0)', base: 'Base b' },
  squareRoot: { a: 'a (scale)', h: 'h (endpoint x)', k: 'k (endpoint y)' },
};
const EQUATION_ITEM = { linear: 'Line of best fit', quadratic: 'Quadratic model', exponential: 'Exponential model', squareRoot: 'Square-root model' };

const auditOne = (label, question) => {
  const mode = question.mode || 'full';
  const t = truth(question);
  const model = buildDataModelingLabReview(question);
  const parts = PARTS(mode, question);
  const metric = question.modelMetric || 'rmse';
  const fromBest = !FORCED[mode] && !question.expectedModel;
  const ranked = t.degenerate ? [] : Object.entries(t.families).sort(([, l], [, r]) => l.metrics[metric] - r.metrics[metric]);
  const bestId = ranked[0]?.[0];
  const expectedId = FORCED[mode] || question.expectedModel || bestId;
  const needsExpected = parts.includes('modelChoice') || (parts.includes('prediction') && !(mode === 'lineFit')) || (parts.includes('fit') && FORCED[mode] && FORCED[mode] !== 'linear');
  const predictionX = question.predictionX ?? Math.ceil(Math.max(...t.points.map(([x]) => x), 1) + 1);

  if (model === null) {
    // Honest only when there is no one answer: degenerate data, a family the
    // data cannot be fitted with, a near-tie for "best", or a square root
    // asked left of its endpoint.
    const reasons = [];
    if (t.points.length < 3) reasons.push('fewer than three points');
    if (t.degenerate) reasons.push('degenerate');
    if (!t.degenerate && needsExpected && !t.families[expectedId]) reasons.push('no such family');
    if (!t.degenerate && needsExpected && fromBest && ranked.length > 1) {
      const [first, second] = ranked.map(([, family]) => family.metrics[metric]);
      if (Math.abs(second - first) <= 1e-6 * Math.max(1, first)) reasons.push('a tie');
    }
    if (!t.degenerate && parts.includes('prediction') && expectedId === 'squareRoot' && predictionX < t.families.squareRoot?.coefficients.h) reasons.push('left of the endpoint');
    if (!t.degenerate && parts.includes('prediction') && expectedId && t.families[expectedId] && !Number.isFinite(t.families[expectedId].predict(predictionX))) reasons.push('no prediction');
    // An exponential shown (fitted, or predicted with) whose a is below 1e-36
    // (calendar-year x: a ≈ e^(−170); 40 decimals keep under 4 significant
    // figures of it), or whose a or base is ≥ 1e21 (exponent notation), cannot be typed.
    const shownFamilies = [FORCED[mode], parts.includes('prediction') && mode !== 'lineFit' ? expectedId : null];
    const exponential = t.families?.exponential?.coefficients;
    if (!t.degenerate && shownFamilies.includes('exponential') && exponential && (exponential.a < 1e-36 || exponential.a >= 1e21 || exponential.base >= 1e21)) reasons.push('an exponential no one can type');
    assert.ok(reasons.length, `${label}: null with an answer to explain`);
    return `null (${reasons[0]})`;
  }
  assert.ok(!t.degenerate, `${label}: degenerate data has no review`);
  const items = itemsOf(model);
  const text = [...model.items.map((item) => item.value), ...model.steps, model.why, model.note || ''].join(' | ');
  assertHygiene(`${label} — ${text}`, text);

  // The shared grader marks the stated work correct.
  const work = workOf(model, question, t.points.map(([x]) => x));
  const result = gradeToolWork({ toolId: TOOL_ID, question, work });
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, true, `${label}: the stated work is correct (${JSON.stringify(result.parts)})`);

  const steps = model.steps.join(' ');

  // The fitted function: each coefficient, the equation, and the working.
  if (parts.includes('fit')) {
    const family = FORCED[mode] || 'linear';
    const fit = t.families[family];
    Object.entries(FAMILY_ITEMS[family]).forEach(([key, itemLabel]) => {
      assert.ok(rounds(items[itemLabel], fit.coefficients[key]), `${label}: ${key} = ${items[itemLabel]} rounds ${fit.coefficients[key]}`);
    });
    const parsed = equationCoefficients(family, items[EQUATION_ITEM[family]]);
    assert.ok(parsed, `${label}: the equation reads (${items[EQUATION_ITEM[family]]})`);
    Object.entries(FAMILY_ITEMS[family]).forEach(([key, itemLabel]) => {
      assert.ok(Math.abs(parsed[key] - num(items[itemLabel])) < 1e-12, `${label}: the equation's ${key} is the item's (${items[EQUATION_ITEM[family]]})`);
    });

    if (family === 'linear') {
      const means = steps.match(/x̄ ([=≈]) (\S+) ÷ (\d+) ([=≈]) (\S+) and ȳ ([=≈]) (\S+) ÷ (\d+) ([=≈]) (\S+?)\.(?=\s|$)/);
      assert.ok(means, `${label}: the means step`);
      assertRel(`${label}: Σx`, means[1], means[2], math.multiply(t.xBar, t.n));
      assertRel(`${label}: x̄`, means[4], means[5], t.xBar);
      assertRel(`${label}: Σy`, means[6], means[7], math.multiply(t.yBar, t.n));
      assertRel(`${label}: ȳ`, means[9], means[10], t.yBar);
      const ls = steps.match(/Sxy = Σ\(x − x̄\)\(y − ȳ\) ([=≈]) (\S+) and Sxx = Σ\(x − x̄\)² ([=≈]) (\S+), so the slope is m = Sxy ÷ Sxx ([=≈]) (\S+?)\.(?=\s|$)/);
      assert.ok(ls, `${label}: the least-squares step`);
      assertRel(`${label}: Sxy`, ls[1], ls[2], t.sxy);
      assertRel(`${label}: Sxx`, ls[3], ls[4], t.sxx);
      assertRel(`${label}: m`, ls[5], ls[6], t.m);
      // b = ȳ − m·x̄ R1 Y − M(X) R2 B: R1 "=" only with Y, M and X exact, R2 "=" only when that arithmetic is B.
      // Written out (b = ȳ − m·x̄ R1 Y − M(X) R2 B), or the formula alone (b = ȳ − m·x̄ R B).
      const intercept = steps.match(/b = ȳ − m·x̄ ([=≈]) (\S+) − (\S+)\((\S+)\) ([=≈]) (\S+?)\.(?=\s|$)/)
        || [...(steps.match(/b = ȳ − m·x̄ ([=≈]) (\S+?)\.(?=\s|$)/) || [])].flatMap((part, index) => (index === 2 ? [undefined, undefined, undefined, '≈', part] : [part]));
      assert.ok(intercept.length, `${label}: the intercept step`);
      if (intercept[2] === undefined) assertRel(`${label}: b`, intercept[1], intercept[6], t.b);
      const [, r1, yShown, mShown, xShown, r2, bShown] = intercept;
      assert.ok(rounds(bShown, Number(t.b)) || exactly(bShown, t.b), `${label}: b ${bShown} vs ${Number(t.b)}`);
      const writtenOut = yShown !== undefined;
      if (writtenOut && r1 === '=') assert.ok(exactly(yShown, t.yBar) && exactly(mShown, t.m) && exactly(xShown, t.xBar), `${label}: ${intercept[0]} — "=" with rounded values`);
      const substituted = num(yShown) - num(mShown) * num(xShown);
      if (writtenOut) {
        if (r2 === '=') assert.ok(Math.abs(substituted - num(bShown)) <= 1e-9 * Math.max(1, Math.abs(substituted)), `${label}: ${intercept[0]} — the substitution is ${substituted}`);
        // "≈": the written arithmetic rounds to the b it states.
        else assert.ok(Math.abs(substituted - num(bShown)) <= halfUlp(bShown) * (1 + 1e-9) + 1e-12 * Math.abs(substituted), `${label}: ${intercept[0]} — the substitution is ${substituted}`);
      }
      if (r1 === '=' && r2 === '=') assert.ok(exactly(bShown, t.b), `${label}: b is exact`);
      // The formula alone is used only where the written arithmetic would not round to b.
      if (!writtenOut) {
        const yText = steps.match(/ȳ [=≈] \S+ ÷ \d+ [=≈] (\S+?)\.(?=\s|$)/)[1];
        const xText = steps.match(/x̄ [=≈] \S+ ÷ \d+ [=≈] (\S+) and/)[1];
        const written = num(yText) - num(items['Slope m']) * num(xText);
        assert.ok(!rounds(bShown, written), `${label}: the arithmetic ${yText} − ${items['Slope m']}(${xText}) rounds to ${bShown}, so it could be shown`);
      }
      const check = model.why.match(/at x = x̄ ([=≈]) (\S+) the line gives (?:(.+?)(?: \(its coefficients to more places\))? ([=≈]) (\S+) ([=≈]) ȳ|ȳ \(b = ȳ − m·x̄ makes it so\))/);
      assert.ok(check, `${label}: the mean-point check`);
      assertRel(`${label}: x̄ in the check`, check[1], check[2], t.xBar);
      if (check[3]) {
        assertWritten(`${label}: ${check[0]}`, evaluate(check[3]), check[4], check[5]);
        assertRel(`${label}: ȳ in the check`, check[6], check[5], t.yBar);
      }
    }
    if (family === 'quadratic') {
      const sums = steps.match(/Σx ([=≈]) (\S+), Σx² ([=≈]) (\S+), Σx³ ([=≈]) (\S+), Σx⁴ ([=≈]) (\S+), Σy ([=≈]) (\S+), Σxy ([=≈]) (\S+) and Σx²y ([=≈]) (\S+?)\.(?=\s|$)/);
      assert.ok(sums, `${label}: the sums`);
      ['sx', 'sx2', 'sx3', 'sx4', 'sy', 'sxy', 'sx2y'].forEach((key, index) => {
        assertRel(`${label}: ${key}`, sums[2 * index + 1], sums[2 * index + 2], fit.sums[key]);
      });
      const roundedSums = sums.filter((part, index) => index % 2 === 1).some((relation) => relation === '≈');
      assert.equal(/to the rounding of those sums/.test(steps), roundedSums, `${label}: the system says when its sums are rounded`);
      const system = steps.match(/It solves(?: \(to the rounding of those sums\))? (.+?) = (\S+), (.+?) = (\S+) and (.+?) = (\S+?)\.(?=\s|$)/);
      assert.ok(system, `${label}: the normal equations`);
      const [a, b, c] = ['a', 'b', 'c'].map((key) => fit.coefficients[key]);
      [[1, 2], [3, 4], [5, 6]].forEach(([left, right]) => {
        // "18a − 8b + 6c": signed terms, a zero one left out, a 1 written as the bare letter.
        const terms = { a: '0', b: '0', c: '0' };
        const tokens = system[left].replace(/^−/, '− ').replace(/^(?![−+] )/, '+ ').match(/[−+] [\d.]*[abc]/g) || [];
        assert.equal(tokens.join(' '), system[left].replace(/^−/, '− ').replace(/^(?![−+] )/, '+ '), `${label}: an equation in a, b and c (${system[left]})`);
        tokens.forEach((token) => {
          const [, sign, digits, letter] = token.match(/^([−+]) ([\d.]*)([abc])$/);
          terms[letter] = `${sign === '−' ? '-' : ''}${digits === '' ? '1' : digits}`;
        });
        const lhs = num(terms.a) * a + num(terms.b) * b + num(terms.c) * c;
        // Exact sums: the fitted a, b, c solve it. Rounded ones: to that rounding.
        const slack = roundedSums ? halfUlp(terms.a) * Math.abs(a) + halfUlp(terms.b) * Math.abs(b) + halfUlp(terms.c) * Math.abs(c) + halfUlp(system[right]) : 0;
        assert.ok(Math.abs(lhs - num(system[right])) <= slack * 1.001 + 1e-6 * Math.max(1, Math.abs(lhs)), `${label}: the fitted a, b, c solve ${system[left]} = ${system[right]}`);
      });
      const solution = steps.match(/a ([=≈]) (\S+), b ([=≈]) (\S+) and c ([=≈]) (\S+), so/);
      assert.ok(solution, `${label}: the solution`);
      assertRel(`${label}: a`, solution[1], solution[2], fit.exact.a);
      assertRel(`${label}: b`, solution[3], solution[4], fit.exact.b);
      assertRel(`${label}: c`, solution[5], solution[6], fit.exact.c);
    }
    if (family === 'exponential') {
      const logs = steps.match(/For the points used, ln y ≈ (.+?)\.(?=\s|$)/);
      if (logs) logs[1].split(', ').forEach((value, index) => assert.ok(rounds(value, fit.logs[index]), `${label}: ln y ${value} vs ${fit.logs[index]}`));
      const ls = steps.match(/x̄ ([=≈]) (\S+), the mean of ln y ≈ (\S+), and the slope ln b = .+? ≈ (\S+?)\.(?=\s|$)/);
      assert.ok(ls, `${label}: the log-linear step`);
      assertRel(`${label}: x̄ of the points used`, ls[1], ls[2], fit.mx);
      assert.ok(rounds(ls[3], fit.ml), `${label}: mean ln y`);
      assert.ok(rounds(ls[4], fit.slope), `${label}: ln b`);
      const back = steps.match(/So b = e\^(\(ln b\)|\S+) ≈ (\S+) and a = e\^\((.+?)\) ≈ (\S+), giving/);
      assert.ok(back, `${label}: b and a from the line`);
      // b and a from the PRINTED slope and means, as a student re-derives
      // them, round to the b and a printed — or the step names the formula.
      if (back[1] !== '(ln b)') assertWritten(`${label}: e^${back[1]} ≈ ${back[2]}`, Math.exp(num(back[1])), '≈', back[2]);
      if (back[3] !== 'mean of ln y − ln b·x̄') assertWritten(`${label}: e^(${back[3]}) ≈ ${back[4]}`, evaluate(`exp(${back[3]})`), '≈', back[4]);
      assert.ok(rounds(back[2], fit.coefficients.base), `${label}: b ${back[2]}`);
      assert.ok(rounds(back[4], fit.coefficients.a), `${label}: a ${back[4]}`);
      if (fit.dropped.length) assert.match(steps, /left out because ln y needs y > 0/, `${label}: the dropped points are named`);
    }
    if (family === 'squareRoot') {
      const ratio = steps.match(/a = Σ√\(x − h\)\(y − k\) ÷ Σ\(x − h\) ([=≈]) (\S+) ÷ (\S+) ([=≈]) (\S+?)\.(?=\s|$)/);
      assert.ok(ratio, `${label}: the least-squares a`);
      assert.ok(rounds(ratio[2], fit.num) || exactly(ratio[2], fit.num), `${label}: Σ√(x − h)(y − k) ${ratio[2]} vs ${fit.num}`);
      assert.ok(rounds(ratio[3], fit.den) || exactly(ratio[3], fit.den), `${label}: Σ(x − h) ${ratio[3]} vs ${fit.den}`);
      assertRel(`${label}: a`, ratio[4], ratio[5], fit.coefficients.a);
      assert.match(steps, new RegExp(`\\(${items['h (endpoint x)'].replace('-', '−').replace('.', '\\.')}, ${items['k (endpoint y)'].replace('-', '−').replace('.', '\\.')}\\)`), `${label}: the endpoint`);
    }
  }

  // r and its reading.
  if (parts.some((part) => ['correlation', 'association'].includes(part))) {
    const want = reading(t.r);
    assert.equal(items.Direction, want.direction, `${label}: direction (r = ${t.r})`);
    assert.equal(items.Strength, want.strength, `${label}: strength (r = ${t.r})`);
    const formula = steps.match(/r = Sxy ÷ √\(Sxx·Syy\) ≈ (\S+) ÷ √\((\S+) · (\S+)\) ([=≈]) (\S+?)(?:[,;]|\.(?=\s|$))/);
    assert.ok(formula, `${label}: the r formula`);
    assert.ok(rounds(formula[1], Number(t.sxy)) || exactly(formula[1], t.sxy), `${label}: Sxy in r`);
    assert.ok(rounds(formula[2], Number(t.sxx)) || exactly(formula[2], t.sxx), `${label}: Sxx in r`);
    assert.ok(rounds(formula[3], Number(t.syy)) || exactly(formula[3], t.syy), `${label}: Syy in r`);
    const rText = formula[5].replace(/−/g, '-');
    assert.ok(Math.abs(num(rText) - t.r) <= halfUlp(rText) * (1 + 1e-9), `${label}: r ${rText} rounds ${t.r}`);
    if (parts.includes('correlation')) assert.equal(items['Correlation coefficient r'], rText, `${label}: the item is the r worked`);
    assert.deepEqual(reading(num(rText)), want, `${label}: the printed r ${rText} reads as the true r`);
    assert.ok(Math.abs(num(rText)) < 1 || Math.abs(t.r) === 1, `${label}: never a false ±1`);
    const size = steps.match(/\|r\| = (\S+) is/);
    assert.ok(size && num(size[1]) === Math.abs(num(rText)), `${label}: |r| is the printed r's size`);
  }
  if (parts.includes('association')) {
    assert.equal(items['What the data can justify'], question.causationSupported ? 'A cause-and-effect conclusion' : 'An association / relationship', `${label}: causation`);
  }

  // The model family and each family's error.
  if (parts.includes('modelChoice')) {
    assert.equal(items['Model family'], LABELS[expectedId], `${label}: the family`);
    const listed = [...steps.matchAll(/(Linear|Quadratic|Exponential|Square Root) ([=≈]) (\S+?)(?:,|\.(?=\s|$))/g)];
    assert.equal(listed.length, Object.keys(t.families).length, `${label}: every family's error is listed`);
    listed.forEach(([, family, relation, value]) => {
      const id = Object.keys(LABELS).find((key) => LABELS[key] === family);
      const metricValue = t.families[id].metrics[metric];
      if (relation === '=') assert.ok(Math.abs(num(value) - metricValue) <= 1e-9 * Math.max(1, metricValue), `${label}: ${family} = ${value} vs ${metricValue}`);
      else assert.ok(rounds(value, metricValue), `${label}: ${family} ≈ ${value} vs ${metricValue}`);
    });
    if (fromBest) {
      const chosen = listed.find(([, family]) => family === LABELS[expectedId]);
      listed.filter(([, family]) => family !== LABELS[expectedId] && !(expectedId === 'linear' && family === 'Quadratic' && /tie/.test(steps)))
        .forEach(([, family, , value]) => assert.ok(num(value) > num(chosen[3]), `${label}: ${family}'s ${value} is visibly larger than ${chosen[3]}`));
    }
  }

  // The prediction.
  if (parts.includes('prediction')) {
    const lineFitPrediction = mode === 'lineFit';
    const family = lineFitPrediction ? 'linear' : expectedId;
    const expected = t.families[family].predict(predictionX);
    assert.equal(num(items['Predict at x =']), Number(predictionX), `${label}: the x`);
    const predicted = items['Predicted y'];
    assert.ok(rounds(predicted, expected) || exactly(predicted, expected), `${label}: ŷ ${predicted} vs ${expected}`);
    const substitution = steps.match(/Substitute x = ([^\s:,]+)[^:]*: ŷ = (.+?) ([=≈]) (\S+?)\.(?: |$)/);
    assert.ok(substitution, `${label}: the substitution`);
    const value = evaluate(substitution[2]);
    if (substitution[3] === '=') assert.ok(Math.abs(value - num(substitution[4])) <= 1e-9 * Math.max(1, Math.abs(value)), `${label}: ${substitution[0]} (${value})`);
    // "≈": the written arithmetic, done by a reader, rounds to the ŷ it states.
    else assert.ok(Math.abs(value - num(substitution[4])) <= halfUlp(substitution[4]) * (1 + 1e-6) + 1e-12 * Math.abs(value), `${label}: ${substitution[0]} evaluates to ${value}`);
    if (!lineFitPrediction) {
      const inside = predictionX >= t.minX && predictionX <= t.maxX;
      assert.equal(items['This prediction is'], inside ? 'Interpolation' : 'Extrapolation', `${label}: the type`);
      const range = steps.match(/run from (\S+) to (\S+); x = (\S+) is (inside|outside)/);
      assert.ok(range && num(range[1]) === t.minX && num(range[2]) === t.maxX && range[4] === (inside ? 'inside' : 'outside'), `${label}: the range sentence`);
    }
  }

  // The "ŷ = … against the observed y" checks.
  [...model.why.matchAll(/at x = (\S+) the model gives ŷ (?:= (.+?)(?: \(its coefficients to more places\))? )?([=≈]) (\S+) against the observed y = (\S+), a residual of (\S+?)(?:,|\.(?=\s|$))/g)].forEach((check) => {
    const [, x, expression, relation, fitted, observed, residual] = check;
    // Written out, its own arithmetic gives the ŷ it states ("=" exactly, "≈" to ŷ's last place).
    if (expression) assertWritten(`${label}: ${check[0]}`, evaluate(expression), relation, fitted);
    else assert.equal(relation, '≈', `${label}: ${check[0]}`);
    assert.ok(t.points.some(([px, py]) => px === num(x) && py === num(observed)), `${label}: (${x}, ${observed}) is a data point`);
    assert.ok(Math.abs(num(residual) - (num(observed) - num(fitted))) <= 2 * halfUlp(fitted) + halfUlp(residual) + 1e-9, `${label}: residual ${residual} = ${observed} − ${fitted}`);
  });
  return 'review';
};

test('data modeling review: every mode over seeded draws, recomputed independently', () => {
  const tally = {};
  const failures = {};
  MODES.forEach((mode, modeIndex) => {
    const rand = prng(7700 + modeIndex);
    for (let index = 0; index < 220; index += 1) {
      const question = drawQuestion(rand, mode);
      const label = `${mode}#${index} ${JSON.stringify(question)}`;
      try {
        const outcome = auditOne(label, question);
        tally[`${mode}:${outcome}`] = (tally[`${mode}:${outcome}`] || 0) + 1;
      } catch (error) {
        // Every distinct defect, not only the first: grouped by its message
        // with this draw's label and numbers taken out.
        const kind = String(error.message).replace(label, '').replace(/[−-]?\d+(\.\d+)?(e[+-]?\d+)?/g, '#').slice(0, 160);
        (failures[kind] ||= []).push(`${error.message.length > 900 ? `${error.message.slice(0, 300)} … ${error.message.slice(-500)}` : error.message}${error.message.includes(label) ? '' : ` [${label}] ${String(error.stack).split('\n')[1]}`}`);
      }
    }
  });
  const report = Object.entries(failures).map(([kind, list]) => `${list.length}× ${kind}\n    e.g. ${list[0]}`);
  assert.equal(report.length, 0, `defects:\n${report.join('\n')}`);
  if (process.env.KAUDIT_TALLY) console.log(JSON.stringify(tally));
  MODES.forEach((mode) => assert.ok((tally[`${mode}:review`] || 0) >= 150, `${mode} reviewed (${JSON.stringify(tally)})`));
});

/* ------------------------------------------- the defects this audit found */

const reviewOf = (question) => buildDataModelingLabReview({ type: TOOL_ID, ...question });
const itemValue = (model, label) => model.items.find((item) => item.label === label)?.value;

test('data modeling review: a sum of authored values is never a rounded number set "=" to it', () => {
  // Σy = −6.7938 was printed "ȳ = −6.794 ÷ 3".
  const line = reviewOf({ mode: 'lineFit', points: [[-1, -1.9175], [0, -1.0598], [1, -3.8165]] });
  assert.match(line.steps[0], /ȳ = −6\.7938 ÷ 3 ≈ −2\.265/);
  // Σx² = 2.1875 was printed "Σx² = 2.188", and the normal equations with it.
  const quadratic = reviewOf({ mode: 'quadraticFit', points: [[0.25, 2], [0.75, 2], [1.25, 1]] });
  assert.match(quadratic.steps[0], /Σx² = 2\.1875, Σx³ = 2\.390625, Σx⁴ = 2\.76171875/);
  assert.match(quadratic.steps[1], /^It solves 2\.76171875a \+ 2\.390625b \+ 2\.1875c = 2\.8125,/);
  // A sum that does not terminate within twelve places is "≈", and the system says it is rounded.
  const fine = reviewOf({ mode: 'quadraticFit', points: [[0.1234, 1], [0.5678, 2], [0.9123, 5], [1.3579, 4]] });
  assert.match(fine.steps[0], /Σx⁴ ≈ /);
  assert.match(fine.steps[1], /^It solves \(to the rounding of those sums\) /);
  // The exponential's x̄ of 17/6 was "x̄ = 2.833".
  const exponential = reviewOf({ mode: 'exponentialFit', points: [[0, 49.8], [2, 23.5], [2, 25.5], [3, 17.3], [4, 12.4], [6, 5.7]] });
  assert.match(exponential.steps[1], /x̄ ≈ 2\.833,/);
  [line, quadratic, fine, exponential].forEach((model, index) => auditOne(`sums #${index}`, [
    { type: TOOL_ID, mode: 'lineFit', points: [[-1, -1.9175], [0, -1.0598], [1, -3.8165]] },
    { type: TOOL_ID, mode: 'quadraticFit', points: [[0.25, 2], [0.75, 2], [1.25, 1]] },
    { type: TOOL_ID, mode: 'quadraticFit', points: [[0.1234, 1], [0.5678, 2], [0.9123, 5], [1.3579, 4]] },
    { type: TOOL_ID, mode: 'exponentialFit', points: [[0, 49.8], [2, 23.5], [2, 25.5], [3, 17.3], [4, 12.4], [6, 5.7]] },
  ][index]) && assert.ok(model));
});

test('data modeling review: "b = ȳ − m·x̄ = …" is "=" only where the shown arithmetic is exact', () => {
  // x̄ = 5/3: "b = ȳ − m·x̄ = 7 − 3(1.667) = 2" was false twice over (7 − 3·1.667 = 1.999).
  const model = reviewOf({ mode: 'linearFit', points: [[1, 5], [2, 8], [2, 8]] });
  assert.match(model.steps[2], /b = ȳ − m·x̄ ≈ 7 − 3\(1\.667\) ≈ 2\./);
  // "3(1.667) + 2 ≈ 7" was false too (it is 7.001), and no more places in m and
  // b mend a rounded x̄: the check names the reason instead of the arithmetic.
  assert.match(model.why, /at x = x̄ ≈ 1\.667 the line gives ȳ \(b = ȳ − m·x̄ makes it so\)/);
  // Exact means keep "=" throughout.
  const exact = reviewOf({ mode: 'lineFit', points: [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]] });
  assert.match(exact.steps[0], /x̄ = 28 ÷ 7 = 4/);
});

test('data modeling review: the substitution\'s own arithmetic gives the ŷ it states', () => {
  // 3.091(1.596)^13 is 1347.49; the review said "≈ 1350.667".
  const question = { type: TOOL_ID, mode: 'exponentialFitPrediction', points: [[1, 5], [3, 12], [5, 33], [7, 84], [9, 203]], predictionX: 13 };
  const model = buildDataModelingLabReview(question);
  assert.equal(itemValue(model, 'Predicted y'), '1350.667');
  assert.equal(itemValue(model, 'Base b'), '1.596', 'the answer typed into the lab is unchanged');
  const step = model.steps.find((text) => text.startsWith('Substitute'));
  const [, expression, shownY] = step.match(/ŷ = (.+?) ≈ (\S+?)\.$/);
  assert.equal(Number(evaluate(expression).toFixed(3)), Number(shownY), step);
  auditOne('exponential at x = 13', question);
});

test('data modeling review: data and targets are quoted as authored, never rounded', () => {
  // The residual check said "the observed y = 50.977" of the point (0, 50.9766).
  const exponential = reviewOf({ mode: 'exponentialFit', points: [[-1, 68.7341], [0, 50.9766], [1, 33.2791]] });
  assert.match(exponential.why, /against the observed y = 50\.9766,/);
  // The endpoint h and the prediction target were rounded to 1.235 and 2.268.
  const root = reviewOf({ mode: 'squareRootFitPrediction', points: [[1.2345, 1], [3, 3.1], [6, 5], [11, 7.1]], predictionX: 2.2675 });
  assert.equal(itemValue(root, 'h (endpoint x)'), '1.2345');
  assert.equal(itemValue(root, 'Predict at x ='), '2.2675');
  assert.match(root.steps[0], /smallest x: \(1\.2345, 1\)/);
  assert.match(root.steps.join(' '), /x-values run from 1\.2345 to 11; x = 2\.2675 is inside/);
  auditOne('square root at 2.2675', { type: TOOL_ID, mode: 'squareRootFitPrediction', points: [[1.2345, 1], [3, 3.1], [6, 5], [11, 7.1]], predictionX: 2.2675 });
});

test('data modeling review: a zero coefficient is left out of the equation', () => {
  // A horizontal regression line was "y = 0x + 1.667".
  const flat = reviewOf({ mode: 'lineFit', points: [[0, 2], [1, 1], [2, 2]] });
  assert.equal(itemValue(flat, 'Line of best fit'), 'y = 1.667');
  assert.equal(itemValue(flat, 'Slope m'), '0', 'the lab still takes m = 0');
  // Collinear data in a quadratic fit was "y = 0x² + 1.6x + 3".
  const straight = reviewOf({ mode: 'quadraticFit', points: [[0.25, 3.4], [0.5, 3.8], [1, 4.6]] });
  assert.equal(itemValue(straight, 'Quadratic model'), 'y = 1.6x + 3');
  assert.equal(itemValue(straight, 'a (x² coefficient)'), '0');
  auditOne('flat line', { type: TOOL_ID, mode: 'lineFit', points: [[0, 2], [1, 1], [2, 2]] });
  auditOne('straight quadratic', { type: TOOL_ID, mode: 'quadraticFit', points: [[0.25, 3.4], [0.5, 3.8], [1, 4.6]] });
});

test('data modeling review: points on one line have r = ±1, not −0.9999999999999999', () => {
  const model = reviewOf({ mode: 'correlation', points: [[1, 3], [2, -1], [2, -1]] });
  assert.equal(itemValue(model, 'Correlation coefficient r'), '-1');
  auditOne('perfect negative', { type: TOOL_ID, mode: 'correlation', points: [[1, 3], [2, -1], [2, -1]] });
  // A near-perfect r is still never shown as 1.
  assert.notEqual(itemValue(reviewOf({ mode: 'correlation', points: [[1, 2], [2, 4.001], [3, 6], [4, 8]] }), 'Correlation coefficient r'), '1');
});

test('data modeling review: edge cases recomputed, and null only where nothing honest can be said', () => {
  const edges = [
    ['negative x and y', { mode: 'full', points: [[-3, -7], [-2, -4.5], [-1, -3], [0, -1], [1, 1.5]], predictionX: -4 }],
    ['an exact line ties the quadratic', { mode: 'modelCompare', points: [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]] }],
    ['exact quadratic, mae', { mode: 'prediction', points: [[-2, 4], [-1, 1], [0, 0], [1, 1], [2, 4]], modelMetric: 'mae', predictionX: 3 }],
    ['decay with a stray zero', { mode: 'exponentialFitPrediction', points: [[0, 50], [1, 31], [2, 0], [3, 12.1], [4, 7.6]], predictionX: 2.5 }],
    ['square root at its endpoint', { mode: 'squareRootFitPrediction', points: [[0, 1], [1, 3], [4, 5], [9, 7]], predictionX: 0 }],
    ['correlation near 0', { mode: 'correlation', points: [[-2, 5], [-1, 3], [0, 7], [1, 3], [2, 5.01]] }],
    ['association, causation authored', { mode: 'association', points: [[1, 62], [2, 70], [3, 71], [4, 80], [5, 86]], causationSupported: true }],
    ['string coordinates', { mode: 'linearFitPrediction', points: [['1', '2.5'], ['2', '4'], ['3', '6.5']], predictionX: '4' }],
    ['line fit with a target', { mode: 'lineFit', points: [[1, 62], [2, 70], [3, 71], [4, 80], [5, 86]], predictionX: 7, predictionTolerance: 0.001 }],
    ['tight quadratic tolerances', { mode: 'quadraticFitPrediction', points: [[0, 1], [1, 2.2], [2, 5.1], [3, 9.8], [4, 17.2]], predictionX: 6, quadraticATolerance: 0.00001, predictionTolerance: 0.0001 }],
  ];
  edges.forEach(([label, question]) => assert.equal(auditOne(label, { type: TOOL_ID, ...question }), 'review', label));
  const nulls = [
    ['every x the same (a vertical line)', { mode: 'lineFit', points: [[2, 1], [2, 3], [2, 5]] }],
    ['every y the same (no r)', { mode: 'correlation', points: [[1, 4], [2, 4], [3, 4]] }],
    ['two points', { mode: 'linearFit', points: [[1, 2], [2, 3]] }],
    ['a square root with two endpoint rows', { mode: 'squareRootFitPrediction', points: [[2, 1], [2, 2], [6, 5], [11, 7]], predictionX: 20 }],
    ['a square root asked left of its endpoint', { mode: 'squareRootFitPrediction', points: [[2, 1], [3, 3.1], [6, 5], [11, 7.1]], predictionX: 1 }],
    ['an exponential with no positive y', { mode: 'exponentialFit', points: [[0, -1], [1, -2], [2, -4]] }],
    ['a "best" family that ties another', { mode: 'modelCompare', points: [[1, 34.6], [2, 23.9], [2, 24.8]] }],
  ];
  nulls.forEach(([label, question]) => {
    assert.equal(buildDataModelingLabReview({ type: TOOL_ID, ...question }), null, label);
    assert.match(auditOne(label, { type: TOOL_ID, ...question }), /^null \(/, `${label}: honest`);
  });
});

/* ------------------------------------- calendar-year data (verifier round) */

const YEARS_QUADRATIC = [[2002, 48.9], [2005, 52.9], [2008, 61.8], [2011, 63.15], [2014, 69], [2017, 71.6], [2020, 82], [2023, 87.1], [2026, 99], [2029, 111.29], [2032, 116], [2035, 127.73]];

test('data modeling grader: the quadratic fit of calendar-year data is the exact least-squares fit', () => {
  // Solved in raw x (Σx⁴ ≈ 2e14) the fit came back with c = 159344.2297
  // (exactly 159344.1445635…), and the exact answer was marked wrong.
  const exact = truth({ points: YEARS_QUADRATIC }).families.quadratic.exact;
  const question = { type: TOOL_ID, mode: 'quadraticFit', points: YEARS_QUADRATIC, quadraticATolerance: 0.0001, quadraticBTolerance: 0.0001, quadraticCTolerance: 0.0001 };
  const typed = { a: Number(exact.a).toFixed(10), b: Number(exact.b).toFixed(7), c: Number(exact.c).toFixed(6) };
  const graded = gradeToolWork({ toolId: TOOL_ID, question, work: { ...workOf({ items: [] }, question, [2002]), ...typed } });
  assert.equal(graded.isCorrect, true, `the exact fit ${JSON.stringify(typed)} is accepted (${JSON.stringify(graded.parts)})`);
  const model = buildDataModelingLabReview(question);
  assert.ok(rounds(itemValue(model, 'c (constant)'), Number(exact.c)), `c ${itemValue(model, 'c (constant)')} vs ${Number(exact.c)}`);
  auditOne('years quadratic, tight tolerances', question);
  // 1988…1998 data had no quadratic at all (a pivot below 1e-9 in raw x).
  const short = [[1988, 47.4], [1990, 50.21], [1992, 55], [1994, 66.3], [1996, 64], [1998, 74.98]];
  const fit = buildDataModelingLabReview({ type: TOOL_ID, mode: 'quadraticFit', points: short });
  assert.ok(fit, 'a quadratic of six calendar-year points exists');
  const shortExact = truth({ points: short }).families.quadratic.coefficients;
  assert.ok(rounds(itemValue(fit, 'a (x² coefficient)'), shortExact.a) && rounds(itemValue(fit, 'b (x coefficient)'), shortExact.b) && rounds(itemValue(fit, 'c (constant)'), shortExact.c));
  // With the quadratic back, the comparison lists all four families.
  const compare = buildDataModelingLabReview({ type: TOOL_ID, mode: 'modelCompare', points: short });
  assert.match(compare.steps[0], /Quadratic [=≈] /);
  auditOne('years model comparison', { type: TOOL_ID, mode: 'modelCompare', points: short });
});

test('data modeling review: the residual check\'s own arithmetic gives the ŷ it states, signed like an equation', () => {
  // "0.04026(2020)² + (−160.167)(2020) + 159344.23 ≈ 81.853" is 83.794.
  const model = reviewOf({ mode: 'quadraticFit', points: YEARS_QUADRATIC });
  const [, expression, relation, fitted] = model.why.match(/the model gives ŷ = (.+?)(?: \(its coefficients to more places\))? ([=≈]) (\S+) against/);
  assertWritten(model.why, evaluate(expression), relation, fitted);
  assert.doesNotMatch(model.why, /\+ \(−/);
  // "3.435(1.134)^2.25 ≈ 4.562" was 4.5583 (seeded exponential draw).
  const exponential = reviewOf({ mode: 'exponentialFit', points: [[0.5, 2.1], [1.25, 3.9], [2.25, 4.6], [3, 6.2], [4, 8.9]] });
  const check = exponential.why.match(/the model gives ŷ = (.+?)(?: \(its coefficients to more places\))? ([=≈]) (\S+) against/);
  assertWritten(exponential.why, evaluate(check[1]), check[2], check[3]);
  // The normal equations are signed too: "18a − 8b + 6c", not "18a + (−8)b + 6c".
  const signed = reviewOf({ mode: 'quadraticFit', points: [[-2, -4.75], [-1, 0.24], [0, -3.8], [1, 5.34]] });
  assert.match(signed.steps[1], /^It solves 18a − 8b \+ 6c = −13\.42, −8a \+ 6b − 2c = 14\.6 and 6a − 2b \+ 4c = −2\.97\.$/);
});

test('data modeling review: an exponential whose a no one can type is not shown', () => {
  // a ≈ e^(−170): "y = 0(1.091)^x" and "ŷ = 0(1.0911…)^2001.5 ≈ 86.736".
  const question = { type: TOOL_ID, mode: 'exponentialFitPrediction', points: [[1995, 50.04], [1996, 50.93], [1997, 61], [1998, 65], [1999, 69.69], [2000, 74], [2001, 85.9], [2002, 91], [2003, 95], [2004, 107.75], [2005, 115.65], [2006, 128], [2007, 144.6], [2008, 152.8]], predictionX: 2001.5 };
  assert.equal(buildDataModelingLabReview(question), null);
  assert.match(auditOne('years exponential', question), /^null \(an exponential no one can type\)/);
  // Fitted alone it read "y = 0(1.091)^x" with "a (value at x = 0): 0".
  assert.equal(reviewOf({ mode: 'exponentialFit', points: question.points }), null);
  // a ≈ 2.3e-40 keeps one significant figure in 40 decimals: no review either.
  assert.equal(reviewOf({ mode: 'prediction', points: [[1997, 9], [2000, 1], [2003, 6], [2006, 8], [2009, 7], [2012, 7]], predictionX: 2001.52, expectedModel: 'exponential' }), null);
  // The same growth measured from 1995 is an ordinary exponential with a review.
  const shifted = { ...question, points: question.points.map(([x, y]) => [x - 1995, y]), predictionX: 6.5 };
  assert.equal(auditOne('years exponential from 0', shifted), 'review');
});
