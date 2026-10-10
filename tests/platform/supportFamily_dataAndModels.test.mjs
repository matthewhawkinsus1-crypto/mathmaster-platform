/*
 * THE dataAndModels SUPPORT FAMILY, ON REAL ITEMS.
 *
 * src/platform/supports/families/dataAndModels.js gives the platform Hint
 * control, "Try a similar one" and the inclusion "Let's back up" step their
 * content for the complex plane lab, the exponential ↔ log bridge, the
 * regression calculator and the data modeling lab. Every item here is one a
 * student can actually be given:
 *
 *   - the Path bank's dataModelingLab templates (Algebra I and II: correlation,
 *     linear / quadratic / exponential fits, every *FitPrediction mode, the
 *     square-root fits), generated with generatePathInstanceWithRetries, 50
 *     seeds each, so every variant and edge of the generator is reached
 *     (negative and near-zero correlation, decay and growth, a = −1, b = 0);
 *   - SAMPLE_BATCH_A / SAMPLE_BATCH_C / SAMPLE_MISSING_MATH_TOOLS (every
 *     complexPlaneLab and exponentialLogBridge mode, dataModelingLab
 *     modelCompare / prediction), the regression calculator's Path fixture,
 *     and V5 documents compiled with compileAuthoringIntentV5 — the way an
 *     authored item reaches a classroom;
 *   - authored items of the same shapes drawn with a seeded generator (at
 *     least 50 per shape), covering the edge cases: zero, negative and
 *     fractional parameters, a = −1, h = 0 / k = 0, repeated, real and
 *     complex roots, negative and huge rotations, decay bases, negative,
 *     weak and missing correlation, extrapolation and interpolation.
 *
 * Every answer the tests compare against is computed INDEPENDENTLY of the
 * family, with mathjs, from the authored fields and the tool's documented
 * defaults: complex arithmetic, logarithms, least squares (normal equations
 * solved with lusolve), r, RMSE, the graders' tolerances and cut-offs. The
 * worked siblings are re-solved the same way from their own prompts, and every
 * arithmetic equality a sibling step states ("(13 - 5) ÷ √4 = 8 ÷ 2 = 4") is
 * evaluated.
 *
 * Mutation-checked (each went red, then was restored):
 *   - choose() returned the numbered spelling unconditionally (guard
 *     bypassed) → the stable-ladder / leak test, the platform-ladder test and
 *     the "verdict never shapes the help" test fail;
 *   - the correlation-strength hint was made to end with a verdict word
 *     ("… follow a line (strong)") → the hints test fails (names a choice;
 *     the platform guard also drops that rung only when "strong" is right);
 *   - the complex multiply sibling's stated real part was negated → the
 *     sibling re-solve fails;
 *   - the 2-place rounding was removed from roundingForms → the
 *     expectedValues coverage test fails ("0.98" for r = 0.9812 is no longer
 *     caught), and with it the leak tests.
 *   Fixes after verification, each mutation-checked the same way:
 *   - the MAE rungs reverted to "compare RMSE" → the "help leads to the right
 *     answer" test fails (on an MAE item the smallest RMSE picks another family);
 *   - the signed imaginary part −b/2a dropped from quadraticRoots answers →
 *     the expectedValues coverage test fails ("-2" for −1 ± 2i);
 *   - the correlation bands spelled "0.80 / 0.50 / 0.20" again → no sibling
 *     for an item whose r rounds to a cut-off (the sibling test fails);
 *   - the sibling-answer tolerance check removed → the sibling test fails (a
 *     sibling's r within the grader's 0.03 of this item's r);
 *   - "Work out 3^2" restored in solveLogarithmic → the right-answer test fails;
 *   - the model Check rung used for correlation / modelCompare too, or the
 *     square-root shape dropped from the shape rung → the right-answer test fails;
 *   - a tying family's prediction not listed → the expectedValues test fails;
 *   - trailing-zero spellings ("20.00") dropped → the expectedValues test fails.
 *   Tried and NOT red: removing modelCompare's "authored model must be the
 *   best" check — the authored-wrong item is still declined by the earlier
 *   metric-consistency check, so that check is redundant, not untested.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as family from '../../src/platform/supports/families/dataAndModels.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const math = create(all);

/* ------------------------------------------------------------ helpers */

const mulberry = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const pick = (random, values) => values[Math.floor(random() * values.length)];
const int = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const ascii = (value) => String(value).replace(/[−–]/g, '-');
const clean = (value) => (Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/** Every spelling of a number that a leak could use. */
const numberSpellings = (value) => {
  const out = new Set();
  const v = clean(value);
  if (Number.isInteger(v)) out.add(String(v));
  [2, 3, 4].forEach((p) => {
    out.add(String(Number(v.toFixed(p)) || 0));
    // With its trailing zeros too ("0.80"): a student or the tool may show it so.
    out.add(Number(v.toFixed(p)) === 0 ? (0).toFixed(p) : v.toFixed(p));
  });
  for (let d = 2; d <= 100; d += 1) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9 && math.gcd(Math.abs(n), d) === 1) {
      out.add(`${n}/${d}`);
      break;
    }
  }
  return [...out].flatMap((s) => (s.includes('-') ? [s, s.replace('-', '−')] : [s]));
};

/* ------------------------------------------------------------ the independent oracle */
/*
 * Each oracle reads ONLY the authored fields, with the tool's documented
 * defaults, and returns:
 *   numbers  [{ value, tol }]  what the student types (and the grader's tolerance)
 *   complex  [math.complex]    complex results, for "a + bi" spellings
 *   words    [text]            the right choice words (lower case)
 *   choices  [text]            every choice word the task offers
 *   points   [[x, y]]          hidden data points (scatterplot source)
 *   model    data-modeling extras
 */

const ROTATION_LABELS = ['no net rotation', '90° counterclockwise', '180°', '90° clockwise'];
const C = (value, fallback) => {
  const source = value || fallback;
  return math.complex(Number(source.re ?? 0), Number(source.im ?? 0));
};
const roundComplex = (z) => math.complex(clean(Number(z.re.toFixed(9))), clean(Number(z.im.toFixed(9))));

const complexOracle = (q) => {
  const mode = q.mode || 'features';
  const tol = 0.01;
  const nums = (...values) => values.map((value) => ({ value: clean(value), tol }));
  if (mode === 'features') {
    const z = C(q.z, { re: 3, im: -4 });
    const conj = math.conj(z);
    return { numbers: [{ value: math.abs(z), tol }, ...nums(conj.re, conj.im)], complex: [conj], words: [], choices: [] };
  }
  if (mode === 'operations') {
    const z = C(q.z, { re: 2, im: 3 });
    const w = C(q.w, { re: -1, im: 2 });
    const op = q.operation || 'multiply';
    const result = roundComplex(op === 'add' ? math.add(z, w) : op === 'subtract' ? math.subtract(z, w) : math.multiply(z, w));
    return { numbers: nums(result.re, result.im), complex: [result], words: [], choices: [] };
  }
  if (mode === 'division') {
    const z = C(q.z, { re: 4, im: 2 });
    const w = C(q.w, { re: 1, im: -1 });
    const conj = math.conj(w);
    const quotient = roundComplex(math.divide(z, w));
    return { numbers: nums(conj.re, conj.im, quotient.re, quotient.im), complex: [quotient, conj], words: [], choices: [] };
  }
  if (mode === 'powers') {
    const z = C(q.z, { re: 1, im: 1 });
    const n = Number(q.exponent ?? 3);
    let power = math.complex(1, 0);
    for (let k = 0; k < n; k += 1) power = math.multiply(power, z);
    power = roundComplex(power);
    return { numbers: [...nums(power.re, power.im), { value: math.abs(power), tol: 0.02 }], complex: [power], words: [], choices: [] };
  }
  if (mode === 'rotation') {
    const z = C(q.z, { re: 3, im: 1 });
    const turns = Number(q.quarterTurns ?? 1);
    const result = roundComplex(math.multiply(z, math.pow(math.complex(0, 1), turns)));
    const label = ROTATION_LABELS[((turns % 4) + 4) % 4];
    return { numbers: nums(result.re, result.im), complex: [result], words: [label], choices: ROTATION_LABELS, turns: ((turns % 4) + 4) % 4 };
  }
  const a = Number(q.quadratic?.a ?? 1);
  const b = Number(q.quadratic?.b ?? 2);
  const c = Number(q.quadratic?.c ?? 5);
  const root = math.sqrt(math.complex(b * b - 4 * a * c, 0));
  const roots = [math.divide(math.add(-b, root), 2 * a), math.divide(math.subtract(-b, root), 2 * a)].map(roundComplex);
  // The student types each root's real part and SIGNED imaginary part (r1Re, r1Im, r2Re, r2Im).
  return { numbers: roots.flatMap((r) => nums(r.re, r.im)), complex: roots, words: [], choices: [], discriminant: b * b - 4 * a * c };
};

const expSpec = (q) => {
  const source = q.function || q.exponential || { a: q.a, base: q.base, h: q.h, k: q.k };
  return { a: Number(source.a ?? 1), base: Number(source.base ?? 2), h: Number(source.h ?? 0), k: Number(source.k ?? 0) };
};
const fOf = (spec, x) => spec.a * spec.base ** (x - spec.h) + spec.k;

const expLogOracle = (q) => {
  const mode = q.mode || 'equivalentForms';
  const tol = 0.01;
  const nums = (...values) => values.map((value) => ({ value: clean(value), tol }));
  if (mode === 'equivalentForms') {
    const base = Number(q.base ?? 2);
    const x = Number(q.exponent ?? 3);
    return { numbers: nums(x, base ** x), complex: [], words: [], choices: [] };
  }
  const eq = q.equation || {};
  if (mode === 'solveExponential') {
    const base = Number(eq.base ?? q.base ?? 2);
    const m = Number(eq.m ?? 2);
    const c = Number(eq.c ?? -1);
    const rhs = Number(eq.rhs ?? 16);
    const k = clean(math.log(rhs, base));
    return { numbers: nums(k, (k - c) / m), complex: [], words: [], choices: [] };
  }
  if (mode === 'solveLogarithmic') {
    const base = Number(eq.base ?? q.base ?? 3);
    const m = Number(eq.m ?? 2);
    const c = Number(eq.c ?? 1);
    const y = Number(eq.result ?? 2);
    const argument = base ** y;
    return { numbers: nums(argument, (argument - c) / m), complex: [], words: [], choices: [] };
  }
  const spec = expSpec(q);
  if (mode === 'inverse') {
    const x0 = Number(q.x ?? 2);
    const side = spec.a > 0 ? 'greater' : 'less';
    return { numbers: nums(x0, spec.k), complex: [], words: [side, `x ${spec.a > 0 ? '>' : '<'} ${spec.k}`], choices: ['greater', 'less', `x > ${spec.k}`, `x < ${spec.k}`], spec };
  }
  const x = Number(q.x ?? 1);
  const y = q.y !== undefined && q.y !== null ? Number(q.y) : fOf(spec, Number(q.inverseSeedX ?? x + 1));
  return { numbers: nums(x, y), complex: [], words: [], choices: [], spec };
};

/* Least squares, r, and the four lab families, from scratch. */
const pointsOf = (raw) => (raw || []).map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.x), Number(p.y)]));
const stats = (pts) => {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const mx = math.mean(xs);
  const my = math.mean(ys);
  const sxx = math.sum(xs.map((x) => (x - mx) ** 2));
  const syy = math.sum(ys.map((y) => (y - my) ** 2));
  const sxy = math.sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const m = sxy / sxx;
  return { m, b: my - m * mx, r: sxy / Math.sqrt(sxx * syy), mx, my };
};
const fitLinear = (pts) => {
  const { m, b } = stats(pts);
  return { model: { m, b }, predict: (x) => m * x + b };
};
const fitQuadratic = (pts) => {
  const A = pts.map(([x]) => [x * x, x, 1]);
  const At = math.transpose(A);
  const [[a], [b], [c]] = math.lusolve(math.multiply(At, A), math.multiply(At, pts.map(([, y]) => [y])));
  return { model: { a, b, c }, predict: (x) => a * x * x + b * x + c };
};
const fitExponential = (pts) => {
  const positive = pts.filter(([, y]) => y > 0);
  if (positive.length < 2) return null;
  const { m, b } = stats(positive.map(([x, y]) => [x, Math.log(y)]));
  const a = Math.exp(b);
  const base = Math.exp(m);
  return { model: { a, base }, predict: (x) => a * base ** x };
};
const fitSquareRoot = (pts) => {
  const sorted = [...pts].sort((l, r) => l[0] - r[0]);
  const h = sorted[0][0];
  if (sorted.filter(([x]) => x === h).length !== 1 || sorted.length < 3) return null;
  const k = sorted[0][1];
  const rest = sorted.slice(1);
  const a = math.sum(rest.map(([x, y]) => Math.sqrt(x - h) * (y - k))) / math.sum(rest.map(([x]) => x - h));
  return { model: { a, h, k }, predict: (x) => (x < h ? NaN : a * Math.sqrt(x - h) + k) };
};
const FITTERS = { linear: fitLinear, quadratic: fitQuadratic, exponential: fitExponential, squareRoot: fitSquareRoot };
const rmseOf = (pts, predict) => Math.sqrt(math.mean(pts.map(([x, y]) => (y - predict(x)) ** 2)));
const maeOf = (pts, predict) => math.mean(pts.map(([x, y]) => Math.abs(y - predict(x))));
const sseOf = (pts, predict) => math.sum(pts.map(([x, y]) => (y - predict(x)) ** 2));
const familiesFor = (pts) => Object.entries(FITTERS)
  .map(([id, fit]) => {
    const fitted = fit(pts);
    if (!fitted || !Object.values(fitted.model).every(Number.isFinite)) return null;
    return { id, ...fitted, rmse: rmseOf(pts, fitted.predict), mae: maeOf(pts, fitted.predict), sse: sseOf(pts, fitted.predict) };
  })
  .filter(Boolean);

const CALC_WORDS = ['positive', 'negative', 'none', 'strong', 'moderate', 'weak'];
const calculatorReading = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});
const labReading = (r) => ({
  direction: r > 0.05 ? 'positive' : r < -0.05 ? 'negative' : 'none',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.2 ? 'weak' : 'none',
});
const LAB_CORRELATION_WORDS = ['positive', 'negative', 'no clear direction', 'none', 'strong', 'moderate', 'weak'];
const FAMILY_WORDS = ['linear', 'quadratic', 'exponential', 'square root', 'square-root', 'squareroot'];
const TYPE_WORDS = ['interpolation', 'extrapolation'];

const regressionOracle = (q) => {
  const pts = pointsOf(q.sourceData || q.points);
  const { m, b, r } = stats(pts);
  const tol = 0.0005;
  const reading = calculatorReading(r);
  return {
    numbers: [{ value: r, tol }, { value: m, tol }, { value: b, tol }, { value: r * r, tol }],
    complex: [],
    words: q.requireInterpretation === false ? [] : [reading.direction, reading.strength],
    choices: CALC_WORDS,
    points: q.sourceMode === 'scatterplot' ? pts : [],
    r,
  };
};

const FORCED = { linearFit: 'linear', quadraticFit: 'quadratic', exponentialFit: 'exponential', linearFitPrediction: 'linear', quadraticFitPrediction: 'quadratic', exponentialFitPrediction: 'exponential', squareRootFitPrediction: 'squareRoot' };
const tolerance = (value, authored, floor, relative = 0.05) => (authored !== undefined && authored !== null && Number.isFinite(Number(authored)) ? Math.abs(Number(authored)) : Math.max(floor, Math.abs(value) * relative));
const tidy = (value) => Number(Number(value).toPrecision(12));

const dataOracle = (q) => {
  const mode = q.mode || 'full';
  const pts = pointsOf(q.points);
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const lin = stats(pts);
  const forced = FORCED[mode];
  const families = familiesFor(pts);
  // The lab and the grader rank the families by the question's own modelMetric.
  const metric = q.modelMetric || 'rmse';
  const best = families.reduce((winner, entry) => (entry[metric] < winner[metric] ? entry : winner));
  const expectedId = forced || q.expectedModel || best.id;
  const expected = families.find((entry) => entry.id === expectedId);
  const numbers = [];
  const words = [];
  const choices = [];
  const fitMode = Boolean(forced) || mode === 'lineFit';
  if (fitMode) {
    const familyId = forced || 'linear';
    const fitted = familyId === 'linear' ? { m: lin.m, b: lin.b } : expected.model;
    if (familyId === 'quadratic') {
      numbers.push({ value: fitted.a, tol: tolerance(fitted.a, q.quadraticATolerance, 0.03) }, { value: fitted.b, tol: tolerance(fitted.b, q.quadraticBTolerance, 0.08) }, { value: fitted.c, tol: tolerance(fitted.c, q.quadraticCTolerance, 0.2) });
    } else if (familyId === 'exponential') {
      numbers.push({ value: fitted.a, tol: tolerance(fitted.a, q.exponentialATolerance, 0.08) }, { value: fitted.base, tol: tolerance(fitted.base, q.exponentialBaseTolerance, 0.02, 0.03) });
    } else if (familyId === 'squareRoot') {
      numbers.push({ value: fitted.a, tol: tolerance(fitted.a, q.squareRootATolerance, 0.05) }, { value: fitted.h, tol: tolerance(fitted.h, q.squareRootHTolerance, 0.05, 0.02) }, { value: fitted.k, tol: tolerance(fitted.k, q.squareRootKTolerance, 0.08, 0.03) });
    } else if (mode === 'lineFit') {
      // The steppers' own default tolerances (graphScaleService fitAdjustmentPlan).
      const xSpan = Math.max(...xs) - Math.min(...xs);
      const ySpan = Math.max(...ys) - Math.min(...ys);
      const slopeTol = q.slopeTolerance ?? tidy(Math.max(0.01, (ySpan / xSpan) * 0.08, Math.abs(lin.m) * 0.06));
      const interceptTol = q.interceptTolerance ?? tidy(Math.max(0.1, ySpan * 0.06));
      numbers.push({ value: lin.m, tol: Number(slopeTol) }, { value: lin.b, tol: Number(interceptTol) });
    } else {
      numbers.push({ value: lin.m, tol: Number(q.slopeTolerance ?? Math.max(0.2, Math.abs(lin.m) * 0.12)) }, { value: lin.b, tol: Number(q.interceptTolerance ?? 0.8) });
    }
  }
  if (mode === 'correlation') {
    numbers.push({ value: lin.r, tol: Number(q.correlationTolerance ?? 0.03) });
    const reading = labReading(lin.r);
    words.push(reading.direction, reading.strength);
    choices.push(...LAB_CORRELATION_WORDS);
  }
  if (mode === 'modelCompare') {
    words.push(expectedId, { linear: 'linear', quadratic: 'quadratic', exponential: 'exponential', squareRoot: 'square root' }[expectedId]);
    choices.push(...FAMILY_WORDS);
  }
  const predicts = Boolean(FORCED[mode] && mode.endsWith('Prediction')) || mode === 'prediction' || (mode === 'lineFit' && q.predictionX !== undefined && q.predictionX !== null && String(q.predictionX).trim() !== '');
  let prediction = null;
  if (predicts) {
    const x = Number(q.predictionX ?? Math.ceil(Math.max(...xs, 1) + 1));
    const value = mode === 'lineFit' ? lin.m * x + lin.b : expected.predict(x);
    numbers.push({ value, tol: Number(q.predictionTolerance ?? Math.max(0.5, Math.abs(value) * 0.08)) });
    const inside = x >= Math.min(...xs) && x <= Math.max(...xs);
    prediction = { x, value, inside, typed: mode !== 'lineFit' };
    if (mode !== 'lineFit') {
      words.push(inside ? 'interpolation' : 'extrapolation');
      choices.push(...TYPE_WORDS);
    }
  }
  return { numbers, complex: [], words, choices, points: [], families, best, expectedId, prediction, r: lin.r, metric };
};

const oracleFor = (q) => {
  const type = q.type || q.toolId;
  if (type === 'complexPlaneLab') return complexOracle(q);
  if (type === 'exponentialLogBridge') return expLogOracle(q);
  if (type === 'regressionCalculator') return regressionOracle(q);
  return dataOracle(q);
};

/* ------------------------------------------------------------ the corpus */

const ITEMS = [];
const add = (name, question) => ITEMS.push({ name, question });

// Real samples.
['SAMPLE_BATCH_A_DEEP_DIVE.json', 'SAMPLE_BATCH_C_DEEP_DIVE.json', 'SAMPLE_MISSING_MATH_TOOLS.json'].forEach((file) => {
  readJson(file).questions
    .filter((q) => ['complexPlaneLab', 'exponentialLogBridge'].includes(q.toolId) || (q.toolId === 'dataModelingLab' && ['modelCompare', 'prediction'].includes(q.mode)))
    .forEach((q) => add(`${file} ${q.toolId} ${q.mode || '(default)'}`, q));
});
// The regression calculator's Path fixture (tests/platform/fixtures/pathToolQuestions.mjs).
add('Path fixture regressionCalculator scatterplot', {
  type: 'regressionCalculator',
  prompt: 'Read the scatterplot, enter the ordered pairs, run linear regression, and interpret the produced correlation.',
  sourceData: [[1, 2], [2, 4], [3, 5], [4, 8]],
  sourceMode: 'scatterplot',
  sourceGraphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 },
  requireInterpretation: true,
});
// The Path bank's data modeling templates, 50 seeds each.
const PATH_TEMPLATES = ['algebra1', 'algebra2'].flatMap((course) => readJson(`seed/pathQuestionBank/${course}_pathQuestionBank_seed.json`).documents
  .filter((document) => document.type === 'dataModelingLab'));
PATH_TEMPLATES.forEach((document) => {
  for (let seed = 0; seed < 50; seed += 1) {
    const { question } = generatePathInstanceWithRetries(document, `dataAndModels-${seed}`);
    if (question) add(`${document.id} #${seed}`, question);
  }
});
// V5 documents.
const v5 = (questions) => compileAuthoringIntentV5({
  schemaVersion: 5,
  assignment: { title: 'Data and models', courseId: 'algebra2', assignmentType: 'notesClasswork' },
  sections: [{ role: 'classwork', questions }],
}).package.sections[0].questions;
const V5_ITEMS = v5([
  { questionId: 'c1', prompt: 'Multiply the complex numbers.', studentActions: ['complexOperations'], z: { re: 2, im: -3 }, w: { re: 1, im: 4 }, operation: 'multiply', mode: 'operations' },
  { questionId: 'c2', prompt: 'Find |z| and the conjugate.', studentActions: ['analyzeComplex'], z: { re: -5, im: 12 } },
  { questionId: 'e1', prompt: 'Solve the exponential equation.', studentActions: ['solveExponential'], equation: { base: 3, m: 1, c: 2, rhs: 81 } },
  { questionId: 'e2', prompt: 'Solve the logarithmic equation.', studentActions: ['solveLogarithmic'], equation: { base: 2, m: 3, c: -1, result: 3 } },
  { questionId: 'e3', prompt: 'Give the inverse features.', studentActions: ['exponentialLogBridge'], mode: 'inverse', function: { type: 'exponential', a: 2, base: 2, h: 1, k: -3 }, x: 3 },
  { questionId: 'r1', prompt: 'Run a linear regression and interpret r.', studentActions: ['calculateCorrelation'], points: [[1, 3], [2, 5], [3, 4], [4, 8], [5, 9]] },
  { questionId: 'r2', prompt: 'Read the scatterplot, run a regression and interpret r.', studentActions: ['readGraph', 'calculateCorrelation'], points: [[1, 9], [2, 7], [3, 7], [4, 4]] },
  { questionId: 'd1', prompt: 'Fit a line by hand and predict at x = 6.', studentActions: ['fitDataModel'], points: [[1, 2], [2, 4], [3, 5], [4, 8]], predictionX: 6 },
  { questionId: 'd2', prompt: 'Predict with the best model.', studentActions: ['predictFromModel'], points: [[1, 2], [2, 4], [3, 5], [4, 8]] },
]);
V5_ITEMS.forEach((q) => add(`V5 ${q.type} ${q.mode || ''} ${q.questionId || ''}`, q));

// Authored items of every claimed shape, drawn with a seeded generator.
const DEC = [0.5, -1.5, 0.25, 2.5];
const part = (random) => (random() < 0.15 ? pick(random, DEC) : random() < 0.12 ? 0 : int(random, -9, 9));
const complexItem = (random, mode) => {
  if (mode === 'features') return { type: 'complexPlaneLab', mode, z: { re: part(random), im: part(random) } };
  if (mode === 'operations') {
    const operation = pick(random, ['add', 'subtract', 'multiply', undefined]);
    return { type: 'complexPlaneLab', mode, ...(operation ? { operation } : {}), z: { re: part(random), im: part(random) }, w: { re: part(random), im: part(random) } };
  }
  if (mode === 'division') {
    let w = { re: part(random), im: part(random) };
    if (!w.re && !w.im) w = { re: 1, im: -2 };
    return { type: 'complexPlaneLab', mode, z: { re: part(random), im: part(random) }, w };
  }
  if (mode === 'powers') return { type: 'complexPlaneLab', mode, z: { re: int(random, -3, 3), im: pick(random, [1, -1, 2, -2, 0, 3]) }, exponent: int(random, 2, 6) };
  if (mode === 'rotation') return { type: 'complexPlaneLab', mode, z: { re: part(random), im: part(random) }, quarterTurns: int(random, -6, 13) };
  const kind = pick(random, ['complex', 'real', 'repeated', 'irrational']);
  const a = pick(random, [1, 2, -1, 3, 0.5, -2]);
  if (kind === 'repeated') {
    const r = int(random, -4, 4);
    return { type: 'complexPlaneLab', mode, quadratic: { a, b: -2 * a * r, c: a * r * r } };
  }
  if (kind === 'real') {
    const r1 = int(random, -5, 5);
    const r2 = int(random, -5, 5);
    return { type: 'complexPlaneLab', mode, quadratic: { a, b: -a * (r1 + r2), c: a * r1 * r2 } };
  }
  return { type: 'complexPlaneLab', mode, quadratic: { a, b: int(random, -6, 6), c: int(random, kind === 'complex' ? 4 : -6, 12) } };
};
const expLogItem = (random, mode) => {
  if (mode === 'equivalentForms') return { type: 'exponentialLogBridge', mode, base: pick(random, [2, 3, 5, 10, 0.5, 4]), exponent: int(random, -3, 6) };
  if (mode === 'solveExponential') {
    const base = pick(random, [2, 3, 5, 0.5]);
    return { type: 'exponentialLogBridge', mode, equation: { base, m: pick(random, [1, 2, 3, -1, -2, 0.5]), c: int(random, -4, 4), rhs: base ** int(random, -3, 6) } };
  }
  if (mode === 'solveLogarithmic') return { type: 'exponentialLogBridge', mode, equation: { base: pick(random, [2, 3, 5, 10, 0.5]), m: pick(random, [1, 2, 3, -1, 0.5]), c: int(random, -5, 5), result: int(random, -2, 4) } };
  const spec = { a: pick(random, [1, 2, -1, -3, 0.5]), base: pick(random, [2, 3, 0.5]), h: int(random, -3, 3), k: int(random, -5, 5) };
  const holder = pick(random, ['function', 'exponential', 'flat', 'typed']);
  const fields = holder === 'flat' ? spec : holder === 'typed' ? { function: { type: 'exponential', ...spec } } : { [holder]: spec };
  if (mode === 'inverse') return { type: 'exponentialLogBridge', mode, ...fields, x: int(random, -2, 4) };
  const x = int(random, -2, 4);
  const item = { type: 'exponentialLogBridge', mode, ...fields, x };
  if (random() < 0.5) item.y = fOf(spec, int(random, -1, 4));
  return item;
};
const regressionItem = (random) => {
  const n = int(random, 4, 8);
  const slope = pick(random, [2, -3, 0.5, -1, 0, 4]);
  const noise = pick(random, [0, 1, 3, 8]);
  const sourceData = Array.from({ length: n }, (_, i) => [i + int(random, 0, 1) * 0.5 + i, Math.round(slope * i + int(random, -noise, noise) + 10)]);
  return { type: 'regressionCalculator', prompt: 'Enter the data, run a linear regression, and interpret r.', sourceData, sourceMode: pick(random, ['data', 'scatterplot', undefined]), requireInterpretation: random() < 0.8 };
};
const dataItem = (random, mode) => {
  const shape = pick(random, ['quadratic', 'exponential', 'line']);
  const xs = [0, 1, 2, 3, 4, 5].slice(0, int(random, 5, 6));
  const a = pick(random, [1, 2, -1, 3]);
  const points = xs.map((x) => {
    if (shape === 'quadratic') return [x, a * (x - 2) ** 2 + int(random, 0, 1) + 3];
    if (shape === 'exponential') return [x, Number((3 * 2 ** x * (1 + int(random, -1, 1) * 0.04)).toFixed(3))];
    return [x, 2 * x + 1 + int(random, -2, 2)];
  });
  if (mode === 'lineFit') {
    const item = { type: 'dataModelingLab', mode, points: xs.map((x) => [x, pick(random, [3, -2, 0.5]) * x + int(random, -3, 3)]) };
    if (random() < 0.6) item.predictionX = pick(random, [2.5, 7, -1, 10]);
    return item;
  }
  const item = { type: 'dataModelingLab', mode, points };
  if (mode === 'prediction' && random() < 0.5) item.predictionX = pick(random, [7, 2.5, 9]);
  return item;
};

/*
 * Model choice by the question's own modelMetric ('mae' / 'sse'): scattered
 * data, half of it with one outlier, so the MAE-best and RMSE-best families
 * sometimes differ — the case where help that compares the wrong error leads
 * a student to the wrong family.
 */
const metricItem = (random, mode, modelMetric) => {
  const n = int(random, 5, 7);
  const points = Array.from({ length: n }, (_, x) => [x, Math.round((1 + random() * 20) * 10) / 10]);
  if (random() < 0.5) points[int(random, 0, n - 1)][1] += 15;
  const item = { type: 'dataModelingLab', mode, modelMetric, points };
  if (mode === 'prediction' && random() < 0.5) item.predictionX = pick(random, [7, 2.5, 9]);
  return item;
};
const bestBy = (pts, metric) => familiesFor(pts).reduce((winner, entry) => (entry[metric] < winner[metric] ? entry : winner)).id;
[['modelCompare', 'mae'], ['prediction', 'mae'], ['modelCompare', 'sse']].forEach(([mode, metric]) => {
  const random = mulberry(`${mode}${metric}`.length * 104729);
  let claimed = 0;
  let disagreeing = 0;
  for (let attempt = 0; attempt < 40000 && (claimed < 40 || (metric === 'mae' && disagreeing < 8)); attempt += 1) {
    const question = metricItem(random, mode, metric);
    if (!family.matches(question)) continue;
    const differs = bestBy(pointsOf(question.points), metric) !== bestBy(pointsOf(question.points), 'rmse');
    if (claimed >= 40 && !differs) continue;
    claimed += 1;
    if (differs) disagreeing += 1;
    add(`authored dataModel ${mode} ${metric} #${attempt}${differs ? ' (MAE and RMSE rank differently)' : ''}`, question);
  }
});
// The verifier's reproductions: MAE picks the square root, RMSE the quadratic;
// a square-root-shaped modelCompare; r on a strength cut-off to two places.
add('modelCompare by MAE, where RMSE ranks differently', { type: 'dataModelingLab', mode: 'modelCompare', modelMetric: 'mae', points: [[0, 6.2], [1, 28.1], [2, 7.6], [3, 8.3], [4, 13.9]] });
add('modelCompare whose best family is the square root', { type: 'dataModelingLab', mode: 'modelCompare', points: [[1, 3], [2, 5.1], [5, 6.9], [10, 9.1], [17, 10.9]] });
[
  [[1, 18], [2, 23], [3, 19], [4, 25], [5, 26]], // r = 0.7986 → "0.80"
  [[1, 16], [2, 12], [3, 13], [4, 13], [5, 10]], // r = −0.8023 → "-0.80"
  [[1, 18], [2, 28], [3, 33], [4, 32], [5, 24], [6, 40], [7, 28]], // r = 0.4960 → "0.50"
  [[1, 22], [2, 17], [3, 11], [4, 7], [5, 17], [6, 13]], // r = −0.4959 → "-0.50"
  [[1, 24], [2, 32], [3, 21], [4, 20], [5, 27], [6, 31]], // r = 0.2016 → "0.20"
  [[1, 11], [2, 21], [3, 9], [4, 15], [5, 11]], // r = −0.1987 → "-0.20"
].forEach((points, index) => {
  add(`correlation on a strength cut-off #${index}`, { type: 'dataModelingLab', mode: 'correlation', points });
  add(`regression on a strength cut-off #${index}`, { type: 'regressionCalculator', prompt: 'Enter the data, run a linear regression, and interpret r.', sourceData: points });
});

const SYNTHETIC = [
  ...['features', 'operations', 'division', 'powers', 'rotation', 'quadraticRoots'].map((mode) => ['complex', mode, (random) => complexItem(random, mode)]),
  ...['equivalentForms', 'solveExponential', 'solveLogarithmic', 'inverse', 'composition'].map((mode) => ['expLog', mode, (random) => expLogItem(random, mode)]),
  ['regression', 'calculator', regressionItem],
  ...['modelCompare', 'prediction', 'lineFit'].map((mode) => ['dataModel', mode, (random) => dataItem(random, mode)]),
];
SYNTHETIC.forEach(([shape, mode, make]) => {
  const random = mulberry(`${shape}${mode}`.length * 7919);
  let claimed = 0;
  for (let attempt = 0; attempt < 400 && claimed < 60; attempt += 1) {
    const question = make(random);
    if (!family.matches(question)) continue;
    claimed += 1;
    add(`authored ${shape} ${mode} #${attempt}`, question);
  }
});

const kindOf = (item) => family.questionKind(item.question);

/* ------------------------------------------------------------ independent answer checks */

const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const fromSuper = (value) => value.split('').map((character) => SUPER[character] ?? character).join('');

/** A plain number spelling ("-3", "3/4", "\frac{3}{4}", ".5", "√8", "2√2", "sqrt(8)"), or null. */
const numberOf = (raw) => {
  const value = ascii(raw).replace(/\s+/g, '');
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return Number(value);
  let match = /^(-?\d+)\/(\d+)$/.exec(value);
  if (match) return Number(match[1]) / Number(match[2]);
  match = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(value);
  if (match) return (match[1] ? -1 : 1) * Number(match[2]) / Number(match[3]);
  match = /^(-?\d*)(?:√|sqrt|\\sqrt)[({]?(\d+)[)}]?$/.exec(value);
  if (match) return (match[1] === '' ? 1 : match[1] === '-' ? -1 : Number(match[1])) * Math.sqrt(Number(match[2]));
  return null;
};
const decimalsOf = (raw) => (/^-?\d*\.(\d+)$/.exec(ascii(raw).trim())?.[1].length ?? 0);
/** "3 - 4i", "-i", "2i", "1/3 + 2/3i" → complex, or null. */
const complexOf = (raw) => {
  const value = ascii(raw).trim();
  const piece = (s) => (s === '' ? 1 : Number(math.evaluate(s)));
  let match = /^(-?[\d./]*)i$/.exec(value);
  if (match) return math.complex(0, match[1] === '-' ? -1 : piece(match[1]));
  match = /^(-?[\d./]+)\s*([+-])\s*([\d./]*)i$/.exec(value);
  if (match) return math.complex(piece(match[1]), (match[2] === '-' ? -1 : 1) * piece(match[3]));
  const real = numberOf(value);
  return real === null ? null : math.complex(real, 0);
};
const sameComplex = (a, b, tol = 0.006) => Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;

/** Is this expectedValues entry a real answer of the question (oracle)? */
const isRealAnswer = (entry, oracle) => {
  const value = ascii(entry).trim();
  const lower = value.toLowerCase();
  if (oracle.words.some((word) => word.toLowerCase() === lower || word.toLowerCase().replace('°', ' degrees') === lower)) return true;
  if (oracle.words.some((word) => ascii(word).replace(/\s+/g, '') === value.replace(/\s+/g, ''))) return true;
  const number = numberOf(value);
  if (number !== null) {
    // Within the grader's tolerance, or the value rounded to the places the
    // spelling shows (at least two: "-1" is r = -0.9987 to two places).
    const window = (tol) => Math.max(tol, /^-?[\d.]+$/.test(value) ? 0.5 * 10 ** -Math.max(2, decimalsOf(value)) : 0) + 1e-9;
    return oracle.numbers.some((answer) => Math.abs(number - answer.value) <= window(answer.tol));
  }
  const pair = /^\((-?[\d.]+),\s?(-?[\d.]+)\)$/.exec(value);
  if (pair) return oracle.points.some(([x, y]) => near(x, Number(pair[1])) && near(y, Number(pair[2])));
  if (/^y\s?=/.test(value) && oracle.families) {
    // A fitted equation with 2-place coefficients: it must agree with the
    // oracle's own fit of that family to within that rounding.
    const rhs = value.replace(/^y\s?=\s?/, '').replace(/x²/g, 'x^2').replace(/(\d)\(/g, '$1*(').replace(/(\d)x/g, '$1*x');
    const familyId = /\^x/.test(rhs) ? 'exponential' : /x\^2/.test(rhs) ? 'quadratic' : 'linear';
    const fitted = familyId === 'linear' ? fitLinear(oracle.pointsRaw) : oracle.families.find((entry) => entry.id === familyId);
    return [0, 1, -1, 2].every((x) => {
      const expected = fitted.predict(x);
      const allowance = familyId === 'exponential' ? 0.02 * Math.max(1, Math.abs(expected)) * (1 + Math.abs(x)) : 0.006 * (1 + Math.abs(x) + x * x);
      return Math.abs(math.evaluate(rhs, { x }) - expected) <= allowance;
    });
  }
  if (/[±]/.test(value)) {
    const [left, right] = value.split('±').map((s) => s.trim());
    return [`${left} + ${right}`, `${left} - ${right}`].every((form) => oracle.complex.some((c) => sameComplex(complexOf(form), c)));
  }
  const complex = complexOf(value);
  if (complex) return oracle.complex.some((c) => sameComplex(complex, c));
  return false;
};

/** Every spelling of every oracle answer a leak could use. */
const answerSpellings = (oracle) => [...oracle.numbers.flatMap((answer) => numberSpellings(answer.value)), ...oracle.words];
const containsAnswer = (textValue, oracle) => hintRevealsAnswer(textValue, answerSpellings(oracle));
const namesChoice = (textValue, oracle) => oracle.choices.some((word) => textValue.toLowerCase().includes(word.toLowerCase()));
/** A number in the text the grader would accept for an answer (|n| against |answer|). */
const quotesAcceptedNumber = (textValue, oracle) => [
  ...[...ascii(textValue).matchAll(/\d+(?:\.\d+)?/g)].map((match) => [Number(match[0]), (match[0].split('.')[1] || '').length]),
  // A fraction is also the one number it names: "3/4" is 0.75.
  ...[...ascii(textValue).matchAll(/(\d+(?:\.\d+)?)\/(\d+)/g)].filter((match) => Number(match[2])).map((match) => [Number(match[1]) / Number(match[2]), 0]),
].some(([number, places]) => oracle.numbers.some((answer) => Math.abs(number - Math.abs(answer.value)) <= Math.max(answer.tol, places ? 0.5 * 10 ** -places : 1e-9) + 1e-12));

const ORACLES = new Map();
const oracleOf = (item) => {
  if (!ORACLES.has(item)) {
    const oracle = oracleFor(item.question);
    oracle.mode = item.question.mode || (item.question.type === 'dataModelingLab' || item.question.toolId === 'dataModelingLab' ? 'full' : '');
    oracle.pointsRaw = pointsOf(item.question.points || item.question.sourceData || []);
    oracle.points = oracle.points || [];
    ORACLES.set(item, oracle);
  }
  return ORACLES.get(item);
};

/* ------------------------------------------------------------ sibling re-solve */

/** Every "a = b = c" chain of plain arithmetic in a step, evaluated. Returns [checked, failures]. */
const checkArithmetic = (step) => {
  const failures = [];
  let checked = 0;
  const normalized = ascii(step)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (power) => `^(${fromSuper(power)})`)
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/·/g, '*')
    .replace(/√\(/g, ' sqrt(').replace(/√(\d+(?:\.\d+)?)/g, ' sqrt($1)');
  const arithmetic = /^[\d\s.+\-*/^()i]*(?:sqrt\([\d\s.+\-*/^()]*\)[\d\s.+\-*/^()i]*)*$/;
  const clauses = normalized.split(/[;:]|,\s|\bso\b|\band\b|\bgives\b|\bthen\b|\bwhich\b|\bmeans\b/);
  for (const clause of clauses) {
    const parts = clause.split(/(=|≈)/);
    const sides = [];
    for (let index = 0; index < parts.length; index += 2) sides.push({ value: parts[index].trim().replace(/\.$/, ''), approx: parts[index - 1] === '≈' });
    for (let index = 0; index + 1 < sides.length; index += 1) {
      const left = sides[index].value;
      const right = sides[index + 1].value;
      if (!left || !right || !arithmetic.test(left) || !arithmetic.test(right) || /^[\s()]*$/.test(left) || /^[\s()]*$/.test(right)) continue;
      if (/\bi\b|\di/.test(left + right) && !/[+\-*/^]/.test(left + right) && !/^\s*-?\d/.test(left)) continue;
      let l;
      let r;
      try {
        l = math.complex(math.evaluate(left));
        r = math.complex(math.evaluate(right));
      } catch {
        continue;
      }
      checked += 1;
      const places = /\.(\d+)\s*$/.exec(right)?.[1].length ?? 0;
      const tol = sides[index + 1].approx ? 0.5 * 10 ** -places + 1e-9 : 1e-6 * Math.max(1, math.abs(r));
      if (Math.abs(l.re - r.re) > tol || Math.abs(l.im - r.im) > tol) failures.push(`${left} = ${right}`);
    }
  }
  return [checked, failures];
};

const pairsIn = (value) => [...ascii(value).matchAll(/\((-?[\d.]+), (-?[\d.]+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const fieldOf = (value, name) => {
  const match = new RegExp(`\\b${name} [=≈] (-?[\\d./]+)`).exec(ascii(value));
  return match ? Number(math.evaluate(match[1])) : null;
};

/** Re-solve the sibling from its prompt alone; throws (assert) when its answer is wrong. */
const resolveSibling = (kind, example, label, metric = 'rmse') => {
  const prompt = ascii(example.prompt);
  const answerText = ascii(example.answer);
  const fail = (message) => assert.fail(`${label}: ${message}\n${example.prompt}\n${example.answer}`);
  const shape = kind.split('.')[0];
  if (shape === 'complex') {
    const sub = kind.split('.')[1];
    if (sub === 'features') {
      const z = complexOf(/z = (.+?), find/.exec(prompt)[1]);
      const magnitude = /\|z\| = (√\d+ ≈ [\d.]+|-?[\d./]+)/.exec(answerText)[1];
      const stated = magnitude.includes('≈') ? Number(magnitude.split('≈')[1]) : Number(math.evaluate(magnitude));
      if (Math.abs(stated - math.abs(z)) > 0.006) fail('|z|');
      const conj = complexOf(/z̄ = (.+?) \(/.exec(answerText)[1]);
      if (!sameComplex(conj, math.conj(z), 1e-9)) fail('conjugate');
      return;
    }
    if (['add', 'subtract', 'multiply'].includes(sub)) {
      let truth;
      if (sub === 'multiply') {
        const [, z, w] = /^Multiply \((.+?)\)\((.+?)\)\./.exec(prompt);
        truth = math.multiply(complexOf(z), complexOf(w));
      } else {
        const [, z, sign, w] = /^Find \((.+?)\) ([+-]) \((.+?)\)\./.exec(prompt);
        truth = sign === '+' ? math.add(complexOf(z), complexOf(w)) : math.subtract(complexOf(z), complexOf(w));
      }
      if (!sameComplex(complexOf(/^(.+?) \(real part/.exec(answerText)[1]), truth, 1e-9)) fail('result');
      return;
    }
    if (sub === 'division') {
      const [, z, w] = /^Divide \((.+?)\) ÷ \((.+?)\)\./.exec(prompt);
      const [, conj, quotient] = /w̄ = (.+?); quotient (.+?) \(real/.exec(answerText);
      if (!sameComplex(complexOf(conj), math.conj(complexOf(w)), 1e-9)) fail('conjugate');
      if (!sameComplex(complexOf(quotient), math.divide(complexOf(z), complexOf(w)), 1e-9)) fail('quotient');
      return;
    }
    if (sub === 'powers') {
      const [, z, n] = /^For z = (.+?), find z([⁰¹²³⁴⁵⁶⁷⁸⁹]+) /.exec(example.prompt);
      const power = math.pow(complexOf(z), Number(fromSuper(n)));
      const [, result, magnitude] = /= (.+?); \|z\S+\| = (.+)$/.exec(fromSuper(ascii(example.answer)));
      if (!sameComplex(complexOf(result), power, 1e-6)) fail('power');
      const stated = magnitude.includes('≈') ? Number(magnitude.split('≈')[1]) : Number(math.evaluate(magnitude));
      if (Math.abs(stated - math.abs(power)) > 0.006) fail('magnitude');
      return;
    }
    if (sub === 'rotation') {
      const [, z, q] = /^Multiply z = (.+?) by i\^(-?\d+)\./.exec(prompt);
      const truth = math.multiply(complexOf(z), math.pow(math.complex(0, 1), Number(q)));
      const [, result, phrase] = /^(.+?); net rotation: (.+)$/.exec(answerText);
      if (!sameComplex(complexOf(result), truth, 1e-9)) fail('rotated point');
      const turns = ((Number(q) % 4) + 4) % 4;
      if (!phrase.startsWith(['zero', 'one', 'two', 'three'][turns])) fail('net rotation');
      return;
    }
    // quadraticRoots
    const polynomial = /^Find both roots of (.+?), giving/.exec(prompt)[1].replace(/x²/g, 'x^2');
    const p = (x) => math.evaluate(polynomial.replace(/(\d)x/g, '$1*x'), { x });
    const c = p(0);
    const a = (p(1) + p(-1)) / 2 - c;
    const b = (p(1) - p(-1)) / 2;
    const root = math.sqrt(math.complex(b * b - 4 * a * c, 0));
    const roots = [math.divide(math.add(-b, root), 2 * a), math.divide(math.subtract(-b, root), 2 * a)];
    const stated = answerText.replace(/\s*\(.*\)$/, '').split(' and ').map((s) => complexOf(s.trim()));
    if (!roots.every((r) => stated.some((s) => sameComplex(s, r, 1e-9)))) fail('roots');
    return;
  }
  if (shape === 'expLog') {
    const sub = kind.split('.')[1];
    if (sub === 'equivalentForms') {
      const [, b, x] = /^Write (\d+)\^(-?\d+) as/.exec(prompt);
      const [, v, logged] = /= (-?[\d./]+) and log_\d+\([\d./-]+\) = (-?\d+)$/.exec(answerText);
      if (!near(Number(math.evaluate(v)), Number(b) ** Number(x), 1e-9) || Number(logged) !== Number(x)) fail('forms');
      return;
    }
    if (sub === 'solveExponential') {
      const [, b, exponent, rhs] = /^Solve (\d+)\^\((.+?)\) = (-?[\d./]+) for x/.exec(prompt);
      const k = clean(Math.log(Number(math.evaluate(rhs))) / Math.log(Number(b)));
      const e = (x) => math.evaluate(exponent.replace(/(\d)x/g, '$1*x'), { x });
      const x = (k - e(0)) / (e(1) - e(0));
      if (!near(fieldOf(answerText, 'x'), x, 1e-9) || !near(Number(/= (-?\d+);/.exec(answerText)[1]), k, 1e-9)) fail('solution');
      return;
    }
    if (sub === 'solveLogarithmic') {
      const [, b, argument, y] = /^Solve log_(\d+)\((.+?)\) = (-?\d+) for x/.exec(prompt);
      const value = Number(b) ** Number(y);
      const e = (x) => math.evaluate(argument.replace(/(\d)x/g, '$1*x'), { x });
      const x = (value - e(0)) / (e(1) - e(0));
      if (!near(fieldOf(answerText, 'argument'), value, 1e-9) || !near(fieldOf(answerText, 'x'), x, 1e-9)) fail('solution');
      return;
    }
    const definition = /For f\(x\) = (.+?), find/.exec(prompt)[1].replace(/·/g, '*');
    const f = (x) => math.evaluate(definition.replace(/(\d)\(/g, '$1*('), { x });
    const k = f(-80);
    if (sub === 'inverse') {
      const x0 = Number(math.evaluate(/f⁻¹\(f\((-?[\d./]+)\)\)/.exec(prompt)[1]));
      const [, output, input] = /^f⁻¹\((-?[\d./]+)\) = (-?[\d./]+);/.exec(answerText);
      if (!near(Number(math.evaluate(output)), f(x0), 1e-9) || !near(Number(math.evaluate(input)), x0)) fail('inverse value');
      if (!near(Number(/vertical asymptote x = (-?[\d.]+)/.exec(answerText)[1]), k, 1e-6)) fail('asymptote');
      const above = f(0) > k;
      if (!answerText.endsWith(`x ${above ? '>' : '<'} ${clean(k)}`)) fail('domain side');
      return;
    }
    const [x0, y0] = /f⁻¹\(f\((-?[\d./]+)\)\) and f\(f⁻¹\((-?[\d./]+)\)\)/.exec(prompt).slice(1).map((v) => Number(math.evaluate(v)));
    if ((y0 - k) * (f(0) - k) <= 0) fail('y is not in the range of f');
    const [first, second] = /= (-?[\d./]+); f\(f⁻¹\(-?[\d./]+\)\) = (-?[\d./]+)$/.exec(answerText).slice(1).map((v) => Number(math.evaluate(v)));
    if (!near(first, x0) || !near(second, y0)) fail('compositions');
    return;
  }
  const pts = pairsIn(prompt);
  const lin = stats(pts);
  const linearStated = () => {
    const match = /y = (-?[\d.]+)x ([+-]) ([\d.]+)/.exec(answerText);
    return { m: Number(match[1]), b: (match[2] === '-' ? -1 : 1) * Number(match[3]) };
  };
  const checkRange = (x) => {
    const inside = x >= Math.min(...pts.map(([px]) => px)) && x <= Math.max(...pts.map(([px]) => px));
    if (answerText.includes('lies inside') !== inside || (!inside && !answerText.includes('lies beyond'))) fail('inside or beyond');
  };
  const checkBands = (r, cuts) => {
    if (!answerText.includes(r > 0 ? 'above zero' : 'below zero')) fail('direction');
    const size = Math.abs(r);
    const band = size >= cuts[0] ? 'top strength band' : size >= cuts[1] ? 'middle strength band' : 'lowest strength band';
    if (!answerText.includes(band)) fail('strength band');
  };
  if (/run a linear regression, and interpret r/.test(prompt)) {
    const stated = linearStated();
    if (!near(stated.m, lin.m, 5e-5) || !near(stated.b, lin.b, 5e-5)) fail('line');
    if (!near(fieldOf(answerText, 'r'), lin.r, 5e-5)) fail('r');
    checkBands(lin.r, [0.8, 0.5, 0.1]);
    return;
  }
  if (prompt.startsWith('Calculate r for the data')) {
    if (!near(fieldOf(answerText, 'r'), lin.r, 5e-5)) fail('r');
    checkBands(lin.r, [0.8, 0.5, 0.2]);
    return;
  }
  const families = familiesFor(pts);
  if (prompt.startsWith('Which model family fits') || prompt.startsWith('Use the model family that fits')) {
    // The sibling's table lists the error this question ranks by (MAE, or RMSE for rmse / sse).
    const shown = metric === 'mae' ? 'mae' : 'rmse';
    const best = families.reduce((winner, entry) => (entry[shown] < winner[shown] ? entry : winner));
    const FORMS = { linear: 'y = mx + b', quadratic: 'y = ax² + bx + c', exponential: 'y = a·bˣ', squareRoot: 'y = a√(x − h) + k' };
    const stepTable = example.steps.find((s) => s.includes(`: ${shown.toUpperCase()} `));
    if (!stepTable) fail(`the table lists ${shown.toUpperCase()}`);
    families.forEach((entry) => {
      const stated = new RegExp(`${FORMS[entry.id].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ${shown.toUpperCase()} (\\d+(?:\\.\\d+)?)`).exec(stepTable);
      if (!stated || Math.abs(Number(stated[1]) - entry[shown]) > 0.0051) fail(`${shown} of ${entry.id}`);
    });
    if (prompt.startsWith('Which')) {
      if (!example.answer.includes(FORMS[best.id])) fail('best family');
      return;
    }
    const x = Number(/predict y at x = (-?\d+(?:\.\d+)?)/.exec(prompt)[1]);
    if (!near(Number(math.evaluate(/^y = (-?[\d./]+) at/.exec(answerText)[1])), best.predict(x), 1e-6)) fail('prediction');
    checkRange(x);
    return;
  }
  const xMatch = /predict y at x = (-?\d+(?:\.\d+)?)/.exec(prompt);
  let predicted;
  if (/^(Use linear regression on|Fit a line by hand to)/.test(prompt)) {
    const stated = linearStated();
    if (!near(stated.m, lin.m, 5e-5) || !near(stated.b, lin.b, 5e-5)) fail('line');
    predicted = (x) => lin.m * x + lin.b;
  } else {
    const familyId = prompt.startsWith('Use quadratic') ? 'quadratic' : prompt.startsWith('Use exponential') ? 'exponential' : 'squareRoot';
    const fitted = families.find((entry) => entry.id === familyId);
    const coefficient = (name) => {
      const match = new RegExp(`\\b${name} = (-?[\\d./]+)`).exec(/\((a = .+?)\)/.exec(answerText)[1]);
      return Number(math.evaluate(match[1]));
    };
    const keys = { quadratic: ['a', 'b', 'c'], exponential: ['a', 'b'], squareRoot: ['a', 'h', 'k'] }[familyId];
    const truth = { quadratic: fitted.model, exponential: { a: fitted.model.a, b: fitted.model.base }, squareRoot: fitted.model }[familyId];
    keys.forEach((key) => {
      if (!near(coefficient(key), truth[key], 1e-6)) fail(`${familyId} ${key}`);
    });
    predicted = fitted.predict;
  }
  if (xMatch) {
    const x = Number(xMatch[1]);
    const stated = Number(math.evaluate(/y ≈ (-?[\d./]+) at x/.exec(answerText)[1]));
    if (!near(stated, predicted(x), 5e-5 * Math.max(1, Math.abs(predicted(x))))) fail('prediction');
    if (/inside or beyond/.test(prompt)) checkRange(x);
  }
};

/* ------------------------------------------------------------ the tests */

const HINT_COUNTS = {
  'complex.features': 4, 'complex.add': 3, 'complex.subtract': 3, 'complex.multiply': 4, 'complex.division': 5, 'complex.powers': 4, 'complex.rotation': 4, 'complex.quadraticRoots': 5,
  'expLog.equivalentForms': 4, 'expLog.solveExponential': 4, 'expLog.solveLogarithmic': 4, 'expLog.inverse': 4, 'expLog.composition': 4,
  'regression.data': 5, 'regression.scatterplot': 5,
  'dataModel.correlation': 4, 'dataModel.linearFit': 3, 'dataModel.quadraticFit': 3, 'dataModel.exponentialFit': 3,
  'dataModel.linearFitPrediction': 5, 'dataModel.quadraticFitPrediction': 5, 'dataModel.exponentialFitPrediction': 5, 'dataModel.squareRootFitPrediction': 5,
  'dataModel.modelCompare': 4, 'dataModel.prediction': 4, 'dataModel.lineFit': 5,
};

test('the corpus: real items of every claimed shape, and at least 50 of each generated shape', () => {
  const counts = {};
  ITEMS.forEach((item) => {
    assert.ok(family.matches(item.question), `${item.name} is claimed`);
    counts[kindOf(item)] = (counts[kindOf(item)] || 0) + 1;
  });
  Object.keys(HINT_COUNTS).filter((kind) => kind !== 'dataModel.lineFit' || true).forEach((kind) => assert.ok((counts[kind] || 0) >= 3, `${kind}: ${counts[kind] || 0} items`));
  ['correlation', 'linearFit', 'quadraticFit', 'exponentialFit', 'linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction', 'squareRootFitPrediction', 'modelCompare', 'prediction', 'lineFit']
    .forEach((mode) => assert.ok(counts[`dataModel.${mode}`] >= 50, `dataModel.${mode}: ${counts[`dataModel.${mode}`]}`));
  ['features', 'division', 'powers', 'rotation', 'quadraticRoots'].forEach((sub) => assert.ok(counts[`complex.${sub}`] >= 50, `complex.${sub}: ${counts[`complex.${sub}`]}`));
  assert.ok((counts['complex.add'] || 0) + (counts['complex.subtract'] || 0) + (counts['complex.multiply'] || 0) >= 50);
  ['equivalentForms', 'solveExponential', 'solveLogarithmic', 'inverse', 'composition'].forEach((sub) => assert.ok(counts[`expLog.${sub}`] >= 50, `expLog.${sub}: ${counts[`expLog.${sub}`]}`));
  assert.ok((counts['regression.data'] || 0) + (counts['regression.scatterplot'] || 0) >= 50);
  // Edge cases are really there.
  const has = (predicate, label) => assert.ok(ITEMS.some(predicate), label);
  has((item) => kindOf(item) === 'complex.quadraticRoots' && oracleOf(item).discriminant === 0, 'a repeated root');
  has((item) => kindOf(item) === 'complex.quadraticRoots' && oracleOf(item).discriminant > 0, 'real roots');
  has((item) => kindOf(item) === 'complex.quadraticRoots' && Number(item.question.quadratic?.a) === -1, 'a = −1');
  has((item) => kindOf(item) === 'complex.rotation' && Number(item.question.quarterTurns) < 0, 'a negative rotation');
  has((item) => kindOf(item) === 'complex.features' && (Number(item.question.z?.re) === 0 || Number(item.question.z?.im) === 0), 'a zero part');
  has((item) => kindOf(item) === 'complex.division' && !Number.isInteger(Number(item.question.z?.re)), 'a fractional part');
  has((item) => kindOf(item) === 'expLog.inverse' && expSpec(item.question).a < 0, 'a negative a (inverse domain to the left)');
  has((item) => kindOf(item) === 'expLog.inverse' && expSpec(item.question).k === 0 && expSpec(item.question).h === 0, 'h = 0 and k = 0');
  has((item) => kindOf(item) === 'expLog.equivalentForms' && Number(item.question.exponent) < 0, 'a negative exponent');
  has((item) => kindOf(item) === 'expLog.solveExponential' && Number(item.question.equation?.base) < 1, 'a decay base');
  has((item) => kindOf(item) === 'dataModel.correlation' && oracleOf(item).r < -0.8, 'a strong negative correlation');
  has((item) => kindOf(item) === 'dataModel.correlation' && Math.abs(oracleOf(item).r) < 0.8, 'a weaker correlation');
  has((item) => kindOf(item).startsWith('regression') && Math.abs(oracleOf(item).r) < 0.1, 'no linear correlation');
  has((item) => kindOf(item).startsWith('regression') && oracleOf(item).r < -0.5, 'a negative regression');
  has((item) => kindOf(item) === 'dataModel.exponentialFitPrediction' && oracleOf(item).families.find((f) => f.id === 'exponential').model.base < 1, 'exponential decay');
  has((item) => kindOf(item) === 'dataModel.exponentialFitPrediction' && oracleOf(item).families.find((f) => f.id === 'exponential').model.base > 1, 'exponential growth');
  has((item) => oracleOf(item).prediction?.inside === true, 'an interpolation');
  has((item) => oracleOf(item).prediction?.inside === false, 'an extrapolation');
});

test('familyFor(): every claimed item is owned by this family, and no earlier family claims it', () => {
  ITEMS.forEach((item) => assert.equal(familyFor(item.question), family, `${item.name} → ${familyFor(item.question)?.family}`));
});

test('what cannot be explained correctly, and what earlier families own, is not claimed', () => {
  const batchD = readJson('SAMPLE_BATCH_D_DEEP_DIVE.json').questions;
  const missing = readJson('SAMPLE_MISSING_MATH_TOOLS.json').questions;
  const batchA = readJson('SAMPLE_BATCH_A_DEEP_DIVE.json').questions;
  const typedLinear = v5([{ questionId: 'lin', prompt: 'Inverse.', studentActions: ['exponentialLogBridge'], mode: 'inverse', function: { a: 2, base: 2, h: 1, k: -3 }, x: 3 }])[0];
  assert.equal(typedLinear.function.type, 'linear', 'the V5 compiler turns an untyped function into a linear spec');
  const notOurs = [
    ...batchD.filter((q) => q.toolId === 'representationMatch').map((q) => [`representationMatch ${q.mode}`, q]),
    ...missing.filter((q) => q.toolId === 'representationMatch').map((q) => ['representationMatch (missing tools)', q]),
    ['expressionMeaning', { type: 'expressionMeaning', expressions: [{ id: 'r', expression: '15', unit: 'dollars per shirt', contextMeaning: 'price', mathRole: 'slope' }, { id: 'c', expression: '-45', unit: 'dollars', contextMeaning: 'cost', mathRole: 'constant' }], choiceBanks: { units: ['dollars per shirt', 'dollars'], contextMeanings: ['price', 'cost'], mathRoles: ['slope', 'constant'] } }],
    ['dataModelingLab full (causation is an authored flag)', batchA.find((q) => q.toolId === 'dataModelingLab' && q.mode === 'full')],
    ['dataModelingLab default mode (full)', missing.find((q) => q.toolId === 'dataModelingLab')],
    ['dataModelingLab association', { type: 'dataModelingLab', mode: 'association', points: [[1, 2], [2, 3], [3, 5], [4, 6]], causationSupported: false }],
    ['dataModelingLab unrecognised mode', { type: 'dataModelingLab', mode: 'Correlation', points: [[1, 2], [2, 3], [3, 5]] }],
    ['modelCompare whose authored model is not the best fit', { type: 'dataModelingLab', mode: 'modelCompare', points: [[0, 1], [1, 4], [2, 9], [3, 16], [4, 25]], expectedModel: 'linear' }],
    ['exponential fit with a non-positive y', { type: 'dataModelingLab', mode: 'exponentialFit', points: [[0, -1], [1, 2], [2, 4], [3, 8]] }],
    ['V5 inverse whose function compiled to a linear spec', typedLinear],
    ['solveExponential with no real solution', { type: 'exponentialLogBridge', mode: 'solveExponential', equation: { base: 2, m: 1, c: 0, rhs: -8 } }],
    ['solveExponential whose right side is not a power of the base', { type: 'exponentialLogBridge', mode: 'solveExponential', equation: { base: 2, m: 1, c: 0, rhs: 10 } }],
    ['solveLogarithmic with a fractional result', { type: 'exponentialLogBridge', mode: 'solveLogarithmic', equation: { base: 4, m: 1, c: 0, result: 0.5 } }],
    ['exponentialLogBridge unknown mode', { type: 'exponentialLogBridge', mode: 'graph', base: 2, exponent: 3 }],
    ['composition with y outside the range of f', { type: 'exponentialLogBridge', mode: 'composition', function: { a: 1, base: 2, h: 0, k: 5 }, x: 1, y: 2 }],
    ['complex unknown operation', { type: 'complexPlaneLab', mode: 'operations', operation: 'divide', z: { re: 1, im: 1 }, w: { re: 1, im: -1 } }],
    ['complex power below 2', { type: 'complexPlaneLab', mode: 'powers', z: { re: 1, im: 1 }, exponent: 1 }],
    ['complex division by zero', { type: 'complexPlaneLab', mode: 'division', z: { re: 1, im: 1 }, w: { re: 0, im: 0 } }],
    ['complex unknown mode', { type: 'complexPlaneLab', mode: 'polar', z: { re: 1, im: 1 } }],
    ['complex quadratic with a = 0', { type: 'complexPlaneLab', mode: 'quadraticRoots', quadratic: { a: 0, b: 2, c: 1 } }],
    ['regression with fewer than three points', { type: 'regressionCalculator', sourceData: [[1, 2], [2, 3]] }],
    ['regression with constant y', { type: 'regressionCalculator', sourceData: [[1, 2], [2, 2], [3, 2]] }],
    ['nothing', null],
  ];
  for (const [name, question] of notOurs) {
    assert.ok(name === 'nothing' || question, `${name} exists`);
    assert.equal(family.matches(question), false, name);
    assert.deepEqual(family.hints(question), [], name);
    assert.deepEqual(family.expectedValues(question), [], name);
    assert.equal(family.similarProblem(question), null, name);
    assert.equal(family.backUpQuestion(question), null, name);
    if (question) assert.notEqual(familyFor(question), family, `${name}: not given to this family`);
  }
  // Items an earlier family owns stay with it.
  [...batchA, ...missing].filter((q) => ['inverseCompositionLab', 'systemsWorkspace'].includes(q.toolId)).forEach((q) => {
    assert.equal(family.matches(q), false, q.toolId);
    assert.notEqual(familyFor(q), family, q.toolId);
  });
});

test('expectedValues(): every entry is a real answer, and every answer is listed in a spelling the guard catches', () => {
  for (const item of ITEMS) {
    const values = family.expectedValues(item.question);
    const oracle = oracleOf(item);
    assert.ok(values.length, `${item.name}: some answers`);
    values.forEach((value) => assert.ok(isRealAnswer(value, oracle), `${item.name}: "${value}" is not an answer (${JSON.stringify(oracle.numbers)})`));
    oracle.numbers.forEach((answer) => {
      // Two and three places (a value exactly halfway between two roundings is
      // skipped at that precision: either rounding is a fair spelling).
      const tie = (places) => Math.abs(Math.abs(answer.value * 10 ** places) % 1 - 0.5) < 1e-6;
      // Each with and without its trailing zeros ("0.8" and "0.80").
      const spellings = [2, 3].filter((places) => !tie(places)).flatMap((places) => {
        const rounded = Number(answer.value.toFixed(places));
        return [String(rounded || 0), rounded === 0 ? (0).toFixed(places) : answer.value.toFixed(places)];
      });
      if (Number.isInteger(clean(answer.value))) spellings.push(String(clean(answer.value)));
      spellings.forEach((spelling) => assert.equal(hintRevealsAnswer(`Look: ${spelling}.`, values), true, `${item.name}: ${spelling} is caught by ${JSON.stringify(values.slice(0, 12))}`));
    });
    oracle.words.forEach((word) => assert.ok(values.some((value) => value.toLowerCase() === word.toLowerCase()), `${item.name}: names "${word}"`));
    oracle.points.forEach(([x, y]) => assert.equal(hintRevealsAnswer(`(${x}, ${y})`, values), true, `${item.name}: hidden point (${x}, ${y})`));
  }
});

test('hints(): a stable ladder that never contains an answer, a number the grader would accept, or any choice word', () => {
  for (const item of ITEMS) {
    const hints = family.hints(item.question);
    const oracle = oracleOf(item);
    // lineFit has one more rung when it names a prediction target.
    const expected = HINT_COUNTS[kindOf(item)] - (kindOf(item) === 'dataModel.lineFit' && !oracle.prediction ? 1 : 0);
    assert.equal(hints.length, expected, `${item.name}: no rung dropped (${hints.length})`);
    hints.forEach((hint) => {
      assert.equal(containsAnswer(hint, oracle), false, `${item.name}: "${hint}" contains an answer`);
      assert.equal(quotesAcceptedNumber(hint, oracle), false, `${item.name}: "${hint}" quotes a number the grader would accept`);
      assert.equal(namesChoice(hint, oracle), false, `${item.name}: "${hint}" names a choice`);
    });
    assert.ok(hints[hints.length - 1].startsWith('Check'), `${item.name}: the ladder ends with its check`);
  }
});

test('hints(): the help leads to the right answer — the error the question ranks by, the shapes it can choose, a check that applies', () => {
  const ranked = ITEMS.filter((item) => ['dataModel.modelCompare', 'dataModel.prediction'].includes(kindOf(item)));
  assert.ok(ranked.some((item) => item.question.modelMetric === 'mae' && bestBy(pointsOf(item.question.points), 'mae') !== bestBy(pointsOf(item.question.points), 'rmse')), 'an MAE item where RMSE ranks differently is claimed');
  for (const item of ranked) {
    const oracle = oracleOf(item);
    const ladder = family.hints(item.question).join(' ');
    // Following the ladder ("the smallest <metric>") must land on the family the grader marks.
    const named = /smallest (MAE|RMSE)/.exec(ladder)?.[1];
    assert.ok(named, `${item.name}: the ladder names the error to compare`);
    const followed = bestBy(oracle.pointsRaw, named.toLowerCase());
    assert.equal(followed, oracle.expectedId, `${item.name}: the smallest ${named} picks ${followed}, the grader marks ${oracle.expectedId}`);
    if (oracle.metric === 'mae') assert.doesNotMatch(ladder, /smaller the RMSE|smallest RMSE/, `${item.name}: an MAE question is not told to compare RMSE`);
  }
  for (const item of ITEMS.filter((entry) => kindOf(entry) === 'dataModel.modelCompare')) {
    const shapeRung = family.hints(item.question).find((hint) => /shape of the data/.test(hint));
    // Each family the lab can choose has its shape described: line, parabola, constant factor, square root.
    [/straight/, /U\b/, /constant factor/, /steeply at first and then more and more gently/].forEach((pattern) => assert.match(shapeRung, pattern, item.name));
  }
  for (const item of ITEMS.filter((entry) => kindOf(entry) === 'dataModel.correlation' || kindOf(entry) === 'dataModel.modelCompare')) {
    // No model is written in these modes, so the check cannot be about "your model's value".
    assert.doesNotMatch(family.hints(item.question).at(-1), /your model/, item.name);
  }
  for (const item of ITEMS.filter((entry) => kindOf(entry) === 'expLog.solveLogarithmic')) {
    // The argument's value b^y is a graded answer: no rung writes it, not even unevaluated.
    const eq = item.question.equation || {};
    const b = Number(eq.base ?? item.question.base ?? 3);
    const y = Number(eq.result ?? 2);
    family.hints(item.question).forEach((hint) => assert.equal(new RegExp(`\\(?${b}\\)?\\^\\(?${y}\\b`).test(ascii(hint)), false, `${item.name}: "${hint}" writes ${b}^${y}`));
  }
});

test('hints(): the problem\'s own numbers are quoted wherever that is safe', () => {
  const quoted = (item, pattern) => family.hints(item.question).some((hint) => pattern.test(hint));
  const batchC = ITEMS.filter((item) => item.name.startsWith('SAMPLE_BATCH_C'));
  const solveExp = batchC.find((item) => kindOf(item) === 'expLog.solveExponential');
  assert.ok(quoted(solveExp, /Write 32 as a power of 2\./), 'solveExponential quotes 2^(2x − 1) = 32');
  const solveLog = batchC.find((item) => kindOf(item) === 'expLog.solveLogarithmic');
  assert.ok(quoted(solveLog, /log_3\(2x \+ 1\) = 2/), 'solveLogarithmic quotes its equation');
  const noisy = ITEMS.find((item) => item.name.startsWith('mm_A_4C_v2_linear-regression-noisy') && quoted(item, /Use all 7 data points/));
  assert.ok(noisy, 'a regression ladder quotes its own data');
  // And every numbered hint that IS quoted is checked by the leak test above.
  const anyNumbered = ITEMS.filter((item) => family.hints(item.question).some((hint) => /\d/.test(hint.replace(/[²³⁴ⁿ₁₂]/g, ''))));
  assert.ok(anyNumbered.length >= 100, `${anyNumbered.length} items get a numbered hint`);
});

test('buildQuestionHints(): the platform ladder carries this family\'s hints and none of it states an answer', () => {
  for (const item of ITEMS) {
    const ladder = buildQuestionHints(item.question);
    const oracle = oracleOf(item);
    const fromFamily = ladder.filter((hint) => hint.source === 'family').map((hint) => hint.text);
    const room = 6 - ladder.filter((hint) => hint.source === 'authored').length;
    assert.deepEqual(fromFamily, family.hints(item.question).slice(0, room), `${item.name}: the family's hints, in order`);
    ladder.forEach((hint) => assert.equal(containsAnswer(hint.text, oracle), false, `${item.name}: ladder "${hint.text}"`));
  }
});

test('backUpQuestion(): two choices about the first move, the right one among them, none an answer or a choice word', () => {
  for (const item of ITEMS) {
    const step = family.backUpQuestion(item.question);
    const oracle = oracleOf(item);
    assert.ok(step, `${item.name}: a back-up step`);
    assert.equal(step.options.length, 2);
    assert.ok(step.options.includes(step.correct));
    [step.prompt, ...step.options].forEach((part) => {
      assert.equal(containsAnswer(part, oracle), false, `${item.name}: "${part}"`);
      assert.equal(quotesAcceptedNumber(part, oracle), false, `${item.name}: "${part}" quotes an accepted number`);
      assert.equal(namesChoice(part, oracle), false, `${item.name}: "${part}" names a choice`);
    });
    const platform = backUpStepFor(item.question);
    assert.equal(platform.source, 'family', item.name);
    assert.equal(platform.prompt, step.prompt);
  }
});

test('similarProblem(): a worked sibling with new numbers, re-solved from its own prompt, that never states this question\'s answer', () => {
  const offered = {};
  for (const item of ITEMS) {
    const oracle = oracleOf(item);
    const kind = kindOf(item);
    offered[kind] = offered[kind] || [0, 0];
    offered[kind][1] += 1;
    const example = buildSimilarWorkedExample(item.question, { seed: 1 });
    if (!example) continue;
    offered[kind][0] += 1;
    assert.equal(similarExampleIsSafe(item.question, example), true, item.name);
    const all = [example.prompt, ...example.steps, example.answer];
    all.forEach((part) => {
      assert.equal(containsAnswer(part, oracle), false, `${item.name}: sibling "${part}" contains an answer`);
      assert.equal(namesChoice(part, oracle), false, `${item.name}: sibling "${part}" names a choice`);
    });
    assert.notEqual(example.prompt, item.question.prompt);
    resolveSibling(kind, example, item.name, oracle.metric);
    // Nothing the sibling states as its answer is a number the grader would accept here.
    assert.equal(quotesAcceptedNumber(example.answer, oracle), false, `${item.name}: sibling answer "${example.answer}" states a number the grader would accept`);
    let checked = 0;
    example.steps.forEach((step) => {
      const [count, failures] = checkArithmetic(step);
      checked += count;
      assert.deepEqual(failures, [], `${item.name}: step "${step}"`);
    });
    assert.ok(checked >= 1, `${item.name}: the sibling's steps state computed values (${example.steps.join(' | ')})`);
  }
  // Whether a sibling is offered must not depend on r sitting on a strength
  // cut-off: the band boundaries a sibling explains are not spelled in digits.
  ITEMS.filter((item) => / on a strength cut-off/.test(item.name)).forEach((item) => {
    assert.ok(buildSimilarWorkedExample(item.question, { seed: 1 }), `${item.name}: a sibling is offered`);
  });
  Object.entries(offered).forEach(([kind, [shown, total]]) => assert.ok(shown >= Math.ceil(total * 0.75), `${kind}: a sibling for ${shown} of ${total} (${JSON.stringify(offered)})`));
});

test('similarProblem(): deterministic in seed and question, and seeds can differ', () => {
  const sample = ITEMS.filter((_, index) => index % 17 === 0);
  let differs = 0;
  for (const item of sample) {
    const first = family.similarProblem(item.question, { seed: 4 });
    assert.deepEqual(family.similarProblem(item.question, { seed: 4 }), first, item.name);
    const other = family.similarProblem(item.question, { seed: 11 });
    if (first && other && first.prompt !== other.prompt) differs += 1;
  }
  assert.ok(differs >= sample.length / 3, `${differs} of ${sample.length} differ between seeds`);
});

test('the verdict never shapes the help: items differing only in their verdict get the same ladder and back-up', () => {
  // The same data, mirrored (y → −y), flips the correlation's direction and
  // keeps every other number's size; the ladder must not change at all.
  const base = ITEMS.filter((item) => kindOf(item) === 'dataModel.correlation').slice(0, 40);
  for (const item of base) {
    const mirrored = { ...item.question, points: pointsOf(item.question.points).map(([x, y]) => ({ x, y: -y })), prompt: 'Calculate r and describe it.' };
    const original = { ...item.question, prompt: 'Calculate r and describe it.' };
    assert.deepEqual(family.hints(mirrored), family.hints(original), item.name);
    assert.deepEqual(family.backUpQuestion(mirrored), family.backUpQuestion(original), item.name);
  }
  // The inverse's domain side flips with the sign of a.
  const inverse = ITEMS.filter((item) => kindOf(item) === 'expLog.inverse').slice(0, 30);
  for (const item of inverse) {
    const spec = expSpec(item.question);
    const flipped = { type: 'exponentialLogBridge', mode: 'inverse', function: { ...spec, a: -spec.a }, x: item.question.x };
    const kept = { type: 'exponentialLogBridge', mode: 'inverse', function: { ...spec }, x: item.question.x };
    const plain = (hints) => hints.map((hint) => hint.replace(/-?\d+(\.\d+)?/g, '#'));
    assert.deepEqual(plain(family.hints(flipped)), plain(family.hints(kept)), item.name);
    assert.deepEqual(family.backUpQuestion(flipped), family.backUpQuestion(kept), item.name);
  }
});
