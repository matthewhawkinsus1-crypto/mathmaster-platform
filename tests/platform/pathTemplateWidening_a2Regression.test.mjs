// Widened A2.8B / A2.8C regression templates (My Math Path recap withholding).
//
// These five dataModelingLab families already drew varied data, but the
// question a student is shown was a fixed sentence: the recap probe
// (tests/platform/pathRecapWithheld.test.mjs) saw 1-3 distinct questions in 30
// draws. The prompts now carry what actually varies — the five observations for
// the integer linear/quadratic data, and a growth or decay context for the
// exponential data (whose noisy outputs are not clean enough to print in prose).
//
// This file proves, against the DRAFT source of truth:
//   * each template draws at least 8 distinct questions in the 30 probe seeds;
//   * for 120+ draws every expected answer is recomputed by an independent
//     mathjs least-squares / log-linear fit of the student's visible data, the
//     solution text agrees with it, and the production grader accepts it;
//   * the lab's autoscaled window contains every observation;
//   * no public field names the interpolation/extrapolation verdict that the
//     prediction items grade;
//   * identity, difficulty and grading fields are unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as math from 'mathjs';

import {
  effectivePathVariants,
  generatePathInstance,
  placeholdersUsed,
} from '../../functions/shared/pathQuestionGeneration.mjs';
import { RECAP_INSTANCE_DRAWS, RECAP_MIN_DISTINCT_INSTANCES } from '../../functions/shared/pathRecapWithheld.mjs';
import { fitDataBounds } from '../../src/platform/graph/graphScaleService.js';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// Resolved from this file, not the process cwd, so the test runs from any directory.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DRAFTS = { 'A2.8B': 'drafts/fidelity-v2/algebra2/A2.8B.json', 'A2.8C': 'drafts/fidelity-v2/algebra2/A2.8C.json' };
const loadDraftDocs = () => Object.values(DRAFTS).flatMap((path) => JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')).documents);
const draftDocs = loadDraftDocs();
const template = (id) => {
  const found = draftDocs.find((doc) => doc.id === id);
  assert.ok(found, `${id} is in the draft source`);
  return found;
};

const IDS = [
  'mm_A2_8B_v2_exponential-regression-decay-noisy',
  'mm_A2_8B_v2_exponential-regression-growth-noisy',
  'mm_A2_8B_v2_linear-regression-noisy',
  'mm_A2_8B_v2_quadratic-regression-noisy',
  'mm_A2_8C_v2_prediction-model-variants',
];

// The recap probe's own notion of "the same question".
const contentKey = (question) => JSON.stringify({
  p: question.prompt,
  s: question.stimulus,
  sc: question.scenario,
  c: (Array.isArray(question.choices) ? question.choices : [])
    .map((choice) => (choice && typeof choice === 'object') ? (choice.text ?? choice.label ?? choice.latex ?? choice.value ?? '') : choice),
  f: (Array.isArray(question.responseFields) ? question.responseFields : [])
    .map((field) => (field && typeof field === 'object') ? (field.label ?? field.prompt ?? '') : field),
});

// ---- independent oracle (mathjs normal equations; no platform regression code) ----
const leastSquares = (rows, ys) => {
  const X = math.matrix(rows);
  const Xt = math.transpose(X);
  return math.lusolve(math.multiply(Xt, X), math.multiply(Xt, math.matrix(ys))).toArray().map((row) => row[0]);
};
const oracleFit = (kind, points) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  if (kind === 'linear') {
    const [b, m] = leastSquares(xs.map((x) => [1, x]), ys);
    return { m, b, at: (x) => m * x + b };
  }
  if (kind === 'quadratic') {
    const [c, b, a] = leastSquares(xs.map((x) => [1, x, x * x]), ys);
    return { a, b, c, at: (x) => a * x * x + b * x + c };
  }
  assert.ok(ys.every((y) => y > 0), 'exponential regression needs positive outputs');
  const [logA, logBase] = leastSquares(xs.map((x) => [1, x]), ys.map((y) => math.log(y)));
  const a = math.exp(logA);
  const base = math.exp(logBase);
  return { a, base, at: (x) => a * base ** x };
};
const kindOf = (mode) => (String(mode).startsWith('linear') ? 'linear' : String(mode).startsWith('quadratic') ? 'quadratic' : 'exponential');
const near = (left, right, epsilon = 1e-6) => Math.abs(Number(left) - Number(right)) <= epsilon;

test('each widened A2 regression template draws at least 8 distinct questions in the 30 recap probe draws', (t) => {
  for (const id of IDS) {
    const seen = new Set();
    for (let draw = 0; draw < RECAP_INSTANCE_DRAWS; draw += 1) {
      const generated = generatePathInstance(template(id), `recap-probe-${draw}`);
      assert.ok(generated.question, `${id} probe ${draw}: ${generated.reason}`);
      seen.add(contentKey(generated.question));
    }
    t.diagnostic(`${id}: ${seen.size} distinct of ${RECAP_INSTANCE_DRAWS}`);
    assert.ok(seen.size >= RECAP_MIN_DISTINCT_INSTANCES, `${id} drew only ${seen.size} distinct questions`);
  }
});

test('every draw is issuable, mathematically correct by an independent fit, and accepted by the production grader', async () => {
  for (const id of IDS) {
    const plan = await mathPath.buildTemplateIssuePlan(template(id), { samples: 30 });
    assert.equal(plan.issuable, true, `${id} certification: ${plan.reason}`);

    const coverage = new Set();
    for (let draw = 0; draw < 120; draw += 1) {
      const generated = generatePathInstance(template(id), `widening-oracle-${draw}`);
      assert.ok(generated.question, `${id} draw ${draw}: ${generated.reason}`);
      const question = generated.question;
      const parameters = generated.parameters;
      const label = `${id} draw ${draw}`;
      coverage.add(question.coverageKey ?? 'base');
      assert.deepEqual([...placeholdersUsed(question)], [], `${label} left a placeholder unbound`);

      const issue = await mathPath.buildIssuePlan(question);
      assert.equal(issue.issuable, true, `${label}: ${issue.reason}`);
      const publicTool = issue.toolPayload.tool;
      const points = publicTool.points;
      assert.deepEqual(points.map(([x]) => x), [-2, -1, 0, 1, 2], `${label} x-values`);
      assert.ok(points.every(([, y]) => Number.isFinite(y)), `${label} finite data`);

      const kind = kindOf(question.mode);
      const fit = oracleFit(kind, points);
      if (kind === 'linear') {
        assert.ok(near(fit.m, parameters.m) && near(fit.b, parameters.b), `${label} fit ${fit.m},${fit.b} vs ${parameters.m},${parameters.b}`);
      } else if (kind === 'quadratic') {
        assert.ok(near(fit.a, parameters.a) && near(fit.b, parameters.b) && near(fit.c, parameters.c), `${label} quadratic fit`);
      } else {
        assert.ok(near(fit.a, parameters.a) && near(fit.base, parameters.base), `${label} exponential fit ${fit.a},${fit.base}`);
        if (id.includes('decay')) assert.ok(fit.base > 0 && fit.base < 1, `${label} decay base`);
        else assert.ok(fit.base > 1, `${label} growth base`);
      }
      // Overdetermined, genuinely noisy data: regression, not interpolation through the points.
      assert.ok(points.some(([x, y]) => Math.abs(y - fit.at(x)) > 1e-6), `${label} data lies exactly on the model`);

      // The solution text states the oracle's coefficients.
      const review = JSON.stringify(question.solutionReview);
      // A2.8C is written as a textbook would (#469 review): no "1x", no "+ 0", no "+(-8)".
      const coefficient = (value) => (Math.abs(value) === 1 ? (value < 0 ? '-' : '') : String(value));
      const constant = (value) => (value === 0 ? '' : `${value < 0 ? '-' : '+'} ${Math.abs(value)}`);
      const written = id.startsWith('mm_A2_8C_') ? `y=${coefficient(parameters.m)}x${constant(parameters.b)}` : `y=${parameters.m}x+(${parameters.b})`;
      if (kind === 'linear') assert.ok(review.includes(written), `${label} linear solution text`);
      if (kind === 'quadratic' && !question.predictionX) {
        assert.ok(review.includes(`a=${parameters.a}, b=${parameters.b}, and c=${parameters.c}`), `${label} quadratic solution text`);
      }

      // Observations quoted in the prompt are exactly the table.
      const quoted = [...String(question.prompt).matchAll(/\$\((-?\d+),(-?\d+(?:\.\d+)?)\)\$/g)]
        .map((match) => [Number(match[1]), Number(match[2])]);
      if (kind !== 'exponential') assert.deepEqual(quoted, points, `${label} prompt data`);
      else assert.equal(quoted.length, 0, `${label} exponential prompt prints no raw data`);

      // The lab draws its window from the data (fitDataBounds); every observation is inside it.
      const xWindow = fitDataBounds(points.map(([x]) => x), { include: [0] });
      const yWindow = fitDataBounds(points.map(([, y]) => y), { include: [0] });
      for (const [x, y] of points) {
        assert.ok(x >= xWindow.min && x <= xWindow.max && y >= yWindow.min && y <= yWindow.max, `${label} (${x},${y}) outside window`);
      }

      const raw = kind === 'linear'
        ? { m: Number(fit.m.toFixed(3)), b: Number(fit.b.toFixed(3)) }
        : kind === 'quadratic'
          ? { a: Number(fit.a.toFixed(3)), b: Number(fit.b.toFixed(3)), c: Number(fit.c.toFixed(3)) }
          : { a: Number(fit.a.toFixed(3)), base: Number(fit.base.toFixed(3)) };

      if (question.predictionX != null) {
        const x = Number(question.predictionX);
        const predicted = fit.at(x);
        assert.ok(near(predicted, parameters.pred), `${label} prediction ${predicted} vs {{pred}} ${parameters.pred}`);
        assert.ok(review.includes(`Prediction ${parameters.pred} at x=${x}`), `${label} prediction summary`);
        assert.match(String(question.prompt), new RegExp(`x=${String(x).replace('.', '\\.')}\\b`), `${label} prompt names the target x`);
        // The classification is a graded part: nothing the student sees may state it.
        assert.doesNotMatch(`${question.prompt} ${JSON.stringify(publicTool.context || {})}`, /interpolat|extrapolat/i, `${label} reveals the prediction verdict`);
        Object.assign(raw, {
          predictionX: x,
          predictionY: Number(predicted.toFixed(3)),
          predictionType: x >= -2 && x <= 2 ? 'interpolation' : 'extrapolation',
        });
      }

      const graded = await mathPath.gradePathToolResponse(issue.privateGrading, { raw });
      assert.equal(graded.isCorrect, true, `${label} production grader rejected ${JSON.stringify(raw)}: ${JSON.stringify(graded.parts)}`);
      const wrong = { ...raw };
      if ('m' in wrong) wrong.m += 1; else wrong.a += 1;
      const wrongGraded = await mathPath.gradePathToolResponse(issue.privateGrading, { raw: wrong });
      assert.equal(wrongGraded.isCorrect, false, `${label} accepted a wrong coefficient`);
    }
    if (id === 'mm_A2_8C_v2_prediction-model-variants') {
      assert.deepEqual([...coverage].sort(), ['predict-exponential', 'predict-linear', 'predict-quadratic']);
    }
  }
});

// Committed values (HEAD before widening). Identity, difficulty and grading shape must not move.
const PINNED = {
  'mm_A2_8B_v2_exponential-regression-decay-noisy': { familyId: 'mathmaster:A2.8B:v2-exponential-regression-decay-noisy', alignmentKeys: ['texas:A2.8B'], assessedConstruct: 'A2.8B', representation: 'context', taskType: 'application', difficultyBand: 4, mode: 'exponentialFit' },
  'mm_A2_8B_v2_exponential-regression-growth-noisy': { familyId: 'mathmaster:A2.8B:v2-exponential-regression-growth-noisy', alignmentKeys: ['texas:A2.8B'], assessedConstruct: 'A2.8B', representation: 'table', taskType: 'procedural', difficultyBand: 3, mode: 'exponentialFit' },
  'mm_A2_8B_v2_linear-regression-noisy': { familyId: 'mathmaster:A2.8B:v2-linear-regression-noisy', alignmentKeys: ['texas:A2.8B'], assessedConstruct: 'A2.8B', representation: 'table', taskType: 'procedural', difficultyBand: 3, mode: 'linearFit' },
  'mm_A2_8B_v2_quadratic-regression-noisy': { familyId: 'mathmaster:A2.8B:v2-quadratic-regression-noisy', alignmentKeys: ['texas:A2.8B'], assessedConstruct: 'A2.8B', representation: 'multipleRepresentation', taskType: 'procedural', difficultyBand: 3, mode: 'quadraticFit' },
  'mm_A2_8C_v2_prediction-model-variants': { familyId: 'mathmaster:A2.8C:v2-prediction-model-variants', alignmentKeys: ['texas:A2.8C'], assessedConstruct: 'A2.8C', representation: 'multipleRepresentation', taskType: 'modeling', difficultyBand: 3 },
};
// familyVersion 4: raised with the widening so the recap can tell old draws from new (review of #464, m1).
const COMMON = { familyVersion: 4, courseId: 'algebra2', type: 'dataModelingLab', questionType: 'response', dok: 2, activityRole: 'practice', calculatorPolicy: 'graphing' };
const PINNED_VARIANTS = {
  'mm_A2_8B_v2_linear-regression-noisy': [
    { coverageKey: 'core-d2b3', difficultyBand: 3, dok: 2 },
    { coverageKey: 'adaptive-d2b2-small-linear-regression', representation: 'table', taskType: 'procedural', difficultyBand: 2, dok: 2 },
  ],
  'mm_A2_8C_v2_prediction-model-variants': [
    { coverageKey: 'predict-linear', mode: 'linearFitPrediction', difficultyBand: 2, predictionX: 4 },
    { coverageKey: 'predict-quadratic', mode: 'quadraticFitPrediction', difficultyBand: 3, predictionX: 0.5 },
    { coverageKey: 'predict-exponential', mode: 'exponentialFitPrediction', difficultyBand: 4, predictionX: 3 },
  ],
};

test('identity, difficulty and grading fields keep their committed values', () => {
  for (const id of IDS) {
    const doc = template(id);
    const expected = { id, ...COMMON, ...PINNED[id] };
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(doc[key], value, `${id}.${key}`);
    if (!('mode' in PINNED[id])) assert.equal('mode' in doc, false, `${id} has no family-level mode`);
    const variants = (doc.variants || []).map((variant) => Object.fromEntries(
      ['coverageKey', 'mode', 'representation', 'taskType', 'difficultyBand', 'dok', 'predictionX']
        .filter((key) => key in variant).map((key) => [key, variant[key]]),
    ));
    assert.deepEqual(variants, PINNED_VARIANTS[id] || [], `${id} variants`);
  }
});

// The numbers a student fits (parameter ranges, noise formulas, tolerances, x-values)
// are exactly the committed ones; only the added context parameter and the
// float-cleaned {{pred}} display value differ.
const committedDocs = () => {
  try {
    return Object.values(DRAFTS).flatMap((path) => JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).documents);
  } catch {
    return null;
  }
};
const mathBearing = ({ template: effective }) => {
  const out = {};
  for (const [key, value] of Object.entries(effective)) {
    if (/Tolerance$|^points$|^predictionX$|^mode$/.test(key)) out[key] = value;
  }
  const { scenario: _scenario, ...parameters } = effective.generator.parameters;
  const { pred: _pred, ...derived } = effective.generator.derived;
  return { ...out, parameters, derived };
};

test('fitted numbers, tolerances and x-values match the committed templates', (t) => {
  const committed = committedDocs();
  if (!committed) { t.skip('git history unavailable'); return; }
  for (const id of IDS) {
    const before = committed.find((doc) => doc.id === id);
    assert.ok(before, `${id} exists at HEAD`);
    assert.deepEqual(effectivePathVariants(template(id)).map(mathBearing), effectivePathVariants(before).map(mathBearing), id);
  }
});

// The test resolves its files from its own location: run from another directory it
// still reads the drafts and still compares against git (instead of silently skipping).
test('draft and committed sources load independently of the working directory', () => {
  const previous = process.cwd();
  process.chdir(tmpdir());
  try {
    assert.deepEqual(loadDraftDocs().map((doc) => doc.id), draftDocs.map((doc) => doc.id));
    let gitAvailable = true;
    try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { gitAvailable = false; }
    if (gitAvailable) assert.ok(committedDocs(), 'git show HEAD:<draft> works from outside the repository');
  } finally {
    process.chdir(previous);
  }
});

// The context parameter is drawn after the numeric ones, so every seed still draws
// the committed a, base and q (and the committed variant): previews and plans keyed
// by an existing seed show the same data as before the widening.
test('the added context does not shift the seeded numeric draws', (t) => {
  const committed = committedDocs();
  if (!committed) { t.skip('git history unavailable'); return; }
  for (const id of IDS) {
    const before = committed.find((doc) => doc.id === id);
    for (const variant of [template(id), ...(template(id).variants || [])]) {
      const names = Object.keys(variant.generator?.parameters || {});
      if (names.includes('scenario')) assert.equal(names.at(-1), 'scenario', `${id}: scenario is drawn last`);
    }
    for (let draw = 0; draw < 60; draw += 1) {
      const seed = `recap-probe-${draw}`;
      // {{pred}} is the same value with its float noise rounded away (3 dp).
      const { scenario: _now, pred: predNow, ...now } = generatePathInstance(template(id), seed).parameters;
      const { scenario: _then, pred: predThen, ...then } = generatePathInstance(before, seed).parameters;
      assert.deepEqual(now, then, `${id} ${seed}`);
      if (predThen !== undefined) assert.ok(Math.abs(predNow - predThen) < 5e-4, `${id} ${seed} pred`);
    }
  }
});

// Contexts must make sense for the drawn values (growth factor 1.4-2 or decay factor
// 0.5-0.8 per unit, values from about 1.4 to 384) and for the observation at x = -2.
test('exponential contexts are realistic for the drawn rates and for x = -2', () => {
  const contexts = IDS.flatMap((id) => [template(id), ...(template(id).variants || [])])
    .flatMap((variant) => variant.generator?.parameters?.scenario?.values || []);
  assert.ok(contexts.length >= 48);
  for (const text of contexts) {
    assert.match(text, /; x (is|counts) .+/, `says what x means: ${text}`);
    // A process that starts at an event must start before the first reading at x = -2.
    if (/disinfectant|dose/.test(text)) assert.match(text, /before the first/, text);
    // Slow processes cannot double per unit in the units offered.
    assert.doesNotMatch(text, /lichen|sourdough|decades/, text);
    // A depth reference must keep x = -2 under the surface.
    if (/depth/.test(text)) {
      const reference = Number(/reference depth of (\d+(?:\.\d+)?) m/.exec(text)?.[1]);
      assert.ok(reference - 2 > 0, `x=-2 is below the surface: ${text}`);
    }
  }
});
