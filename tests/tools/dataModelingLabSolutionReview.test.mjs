/*
 * DATA MODELING LAB: THE WORKED SOLUTION STATES WHAT THE GRADER ACCEPTS.
 *
 * Once a question is closed, QuestionEngine shows its worked solution
 * (src/tools/shared/toolSolutionReview.js). For the Data Modeling Lab that is
 * src/tools/shared/reviews/dataModelingLabReview.js. This file proves, over
 * the seed bank's own generated instances and hand-authored questions for the
 * modes the bank does not use:
 *
 *   1. the review is text only, with items, steps and a check;
 *   2. the answer it states — read back from its items, the way a student
 *      would type it into the lab — is marked correct by the shared grader
 *      (gradeToolWork), every part of it;
 *   3. it is the answer the mathematics gives (an independent derivation from
 *      the same helpers), not merely something inside a tolerance;
 *   4. the hand-fit window it quotes for a stepper line fit is the grader's;
 *   5. the registry index picks the builder up, and malformed questions give
 *      null without throwing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as reviewModule from '../../src/tools/shared/reviews/dataModelingLabReview.js';
import { TOOL_REVIEW_BUILDERS } from '../../src/tools/shared/reviews/index.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { samplePathInstances } from '../../functions/shared/pathQuestionGeneration.mjs';
import { OWN_CHOICES, UNANSWERED } from '../../functions/shared/toolMath/shared/judgmentChoices.mjs';
import { correlation, linearRegression, parseNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  predictionKind,
} from '../../functions/shared/toolMath/dataModeling/dataModelingMath.mjs';
import {
  DATA_MODELING_MODES,
  FORCED_FIT_MODELS,
  dataModelingPoints,
  dataModelingRequiredParts,
  lineFitNamesPrediction,
} from '../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';

const { buildDataModelingLabReview, implemented } = reviewModule;
const TOOL_ID = 'dataModelingLab';
const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

/* ------------------------------------------------------------ fixtures */

// The seed bank's Data Modeling families, each sampled several times.
const seedDocs = [
  'seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json',
  'seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json',
].flatMap((path) => read(path).documents).filter((doc) => doc?.type === TOOL_ID);

const seedQuestions = seedDocs.flatMap((doc) => samplePathInstances(doc, 6).map((generated, index) => {
  assert.ok(generated.question, `${doc.id} generates (${generated.reason})`);
  return { label: `${doc.id}#${index}`, question: generated.question };
}));

const DEMO = [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]];
const NEGATIVE = [[1, 9], [2, 7], [3, 8], [4, 5], [5, 6], [6, 3], [7, 5]];
const MODERATE = [[1, 2], [2, 1], [3, 4], [4, 3], [5, 6], [6, 3], [7, 5]];
const QUADRATIC = [[0, 1], [1, 2.2], [2, 5.1], [3, 9.8], [4, 17.2], [5, 26]];
const EXPONENTIAL = [[0, 2], [1, 3.1], [2, 4.4], [3, 6.9], [4, 10.1], [5, 15.3]];
const SCATTERED = [[1, 5], [2, 1], [3, 6], [4, 2], [5, 5], [6, 1]];
const STUDY = [[1, 62], [2, 70], [3, 71], [4, 80], [5, 86]];

const q = (mode, extra) => ({ type: TOOL_ID, ...(mode ? { mode } : {}), ...extra });

// Modes the seed bank does not use, as teachers author them (MathToolsLab's
// sample, the draft-persistence scene, authoring-intent compiles).
const authoredQuestions = [
  ['full / MathToolsLab sample', q('full', { points: DEMO, causationSupported: false, expectedModel: 'linear', predictionX: 8 })],
  ['full / draft scene', q('full', { prompt: 'Describe the association and predict.', points: [[1, 2], [2, 4.2], [3, 5.8], [4, 8.1], [5, 9.9]] })],
  ['full / no mode, causation supported', q(undefined, { points: STUDY, causationSupported: true, predictionX: 3.5 })],
  ['full / exact line', q('full', { points: [[0, 3], [1, 5], [2, 7], [3, 9], [4, 11]], predictionX: 6 })],
  ['lineFit / hand fit', q('lineFit', { points: DEMO })],
  ['lineFit / regression technology + prediction', q('lineFit', { points: STUDY, studentActions: ['fitDataModel'], predictionX: 7, predictionTolerance: 0.5 })],
  ['lineFit / authored tolerances', q('lineFit', { points: NEGATIVE, slopeTolerance: 0.05, interceptTolerance: 0.1 })],
  ['linearFit / object points', q('linearFit', { points: [{ x: 1, y: 2 }, { x: 2, y: 4.1 }, { x: 3, y: 5.9 }, { x: 4, y: 8.2 }, { x: 5, y: 9.7 }] })],
  ['quadraticFit', q('quadraticFit', { points: QUADRATIC })],
  ['exponentialFit / decay', q('exponentialFit', { points: [[0, 50], [1, 31], [2, 19.5], [3, 12.1], [4, 7.6], [5, 4.8]] })],
  ['exponentialFitPrediction / stray zero', q('exponentialFitPrediction', { points: [[0, 50], [1, 31], [2, 0], [3, 12.1], [4, 7.6], [5, 4.8]], predictionX: 6 })],
  ['linearFitPrediction / student x', q('linearFitPrediction', { points: STUDY })],
  ['quadraticFitPrediction / interpolation', q('quadraticFitPrediction', { points: [[-2, 9], [-1, 2], [0, 1], [1, 6], [2, 13]], predictionX: 0.5 })],
  ['squareRootFitPrediction', q('squareRootFitPrediction', { points: [[2, 1], [3, 3.1], [6, 5], [11, 7.1], [18, 9]], predictionX: 27 })],
  ['association / negative', q('association', { points: NEGATIVE })],
  ['association / moderate', q('association', { points: MODERATE })],
  ['association / causation supported', q('association', { points: STUDY, causationSupported: true })],
  ['association / scattered', q('association', { points: SCATTERED })],
  ['correlation / weak negative', q('correlation', { points: SCATTERED })],
  ['correlation / authored tolerance', q('correlation', { points: STUDY, correlationTolerance: 0.001 })],
  ['prediction / best family', q('prediction', { points: QUADRATIC })],
  ['prediction / interpolation', q('prediction', { points: DEMO, predictionX: 4.5 })],
  ['prediction / authored family', q('prediction', { points: EXPONENTIAL, expectedModel: 'exponential', predictionX: 7 })],
  ['prediction / mae metric', q('prediction', { points: [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1], [6, 25], [7, 14]], modelMetric: 'mae', predictionX: 5.5 })],
  ['modelCompare / quadratic', q('modelCompare', { points: QUADRATIC })],
  ['modelCompare / exponential', q('modelCompare', { points: [[0, 1], [1, 2], [2, 4], [3, 8.1], [4, 15.8]] })],
  ['modelCompare / exact line ties the quadratic', q('modelCompare', { points: [[1, 2], [2, 4], [3, 6], [4, 8], [5, 10]] })],
  ['modelCompare / authored family over the metric', q('modelCompare', { points: DEMO, expectedModel: 'linear' })],
].map(([label, question]) => ({ label, question }));

/* ------------------------------------------------------------ helpers */

const assertTextOnly = (model, label) => {
  assert.ok(model && typeof model === 'object', `${label}: a review`);
  assert.deepEqual(Object.keys(model).sort(), ['items', 'note', 'steps', 'title', 'why'], `${label}: the review model's keys`);
  assert.equal(typeof model.title, 'string', `${label}: title`);
  assert.ok(Array.isArray(model.items) && model.items.length > 0, `${label}: items`);
  model.items.forEach((item, index) => {
    assert.deepEqual(Object.keys(item).sort(), ['label', 'value'], `${label}: item ${index} shape`);
    assert.equal(typeof item.label, 'string', `${label}: item ${index} label`);
    assert.equal(typeof item.value, 'string', `${label}: item ${index} value`);
    assert.ok(item.value.length > 0 && !/undefined|NaN|null|Infinity|\[object/.test(item.value), `${label}: item ${index} says something real (${item.value})`);
  });
  assert.ok(Array.isArray(model.steps) && model.steps.length > 0 && model.steps.length <= 12, `${label}: one to twelve steps`);
  model.steps.forEach((step, index) => {
    assert.equal(typeof step, 'string', `${label}: step ${index}`);
    assert.ok(!/undefined|NaN|null|Infinity|\[object/.test(step), `${label}: step ${index} is real text (${step})`);
  });
  assert.equal(typeof model.why, 'string', `${label}: a check`);
  assert.ok(!/undefined|NaN|null|Infinity|\[object/.test(model.why), `${label}: the check is real text`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note`);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${label}: plain data only`);
};

// The lab's fields, by the label the review gives each, and its option labels.
const LABEL_KEYS = {
  'Slope m': 'm',
  'Intercept b': 'b',
  'a (x² coefficient)': 'a',
  'b (x coefficient)': 'b',
  'c (constant)': 'c',
  'a (value at x = 0)': 'a',
  'Base b': 'base',
  'a (scale)': 'a',
  'h (endpoint x)': 'h',
  'k (endpoint y)': 'k',
  'Correlation coefficient r': 'r',
  Direction: 'direction',
  Strength: 'strength',
  'What the data can justify': 'causation',
  'Model family': 'modelChoice',
  'Predict at x =': 'predictionX',
  'Predicted y': 'predictionY',
  'This prediction is': 'predictionType',
};
const OPTION_KEYS = {
  direction: { Positive: 'positive', Negative: 'negative', 'No clear direction': 'none' },
  strength: { Strong: 'strong', Moderate: 'moderate', Weak: 'weak', None: 'none' },
  causation: { 'An association / relationship': 'association', 'A cause-and-effect conclusion': 'causation' },
  modelChoice: { Linear: 'linear', Quadratic: 'quadratic', Exponential: 'exponential', 'Square Root': 'squareRoot' },
  predictionType: { Interpolation: 'interpolation', Extrapolation: 'extrapolation' },
};
const EQUATION_LABELS = new Set(['Line of best fit', 'Quadratic model', 'Exponential model', 'Square-root model']);

const labStartX = (question) => question.predictionX ?? Math.ceil(Math.max(...dataModelingPoints(question).map(([x]) => Number(x)), 1) + 1);

/** The work a student enters by typing exactly what the review states. */
const workFromReview = (model, question) => {
  const work = {
    r: '',
    direction: UNANSWERED,
    strength: UNANSWERED,
    causation: UNANSWERED,
    modelChoice: UNANSWERED,
    predictionX: labStartX(question),
    predictionY: '',
    predictionType: UNANSWERED,
    ...OWN_CHOICES,
  };
  for (const item of model.items) {
    if (EQUATION_LABELS.has(item.label)) continue;
    const key = LABEL_KEYS[item.label];
    assert.ok(key, `the review's item "${item.label}" is one of the lab's fields`);
    if (OPTION_KEYS[key]) {
      assert.ok(item.value in OPTION_KEYS[key], `"${item.value}" is one of the lab's ${key} options`);
      work[key] = OPTION_KEYS[key][item.value];
    } else {
      assert.ok(parseNumericAnswer(item.value) != null, `${item.label} is a number a student can type (${item.value})`);
      work[key] = item.value;
    }
  }
  return work;
};

/** The answer, derived independently from the same mathematics. */
const derivedAnswer = (question) => {
  const mode = question.mode || 'full';
  const points = dataModelingPoints(question);
  const regression = linearRegression(points);
  const candidates = buildCandidateModels(points, regression);
  const best = chooseBestModel(candidates, question.modelMetric || 'rmse');
  const family = FORCED_FIT_MODELS[mode] || 'linear';
  const expectedId = FORCED_FIT_MODELS[mode] || question.expectedModel || best?.id || 'linear';
  const expected = candidates.find((candidate) => candidate.id === expectedId);
  const r = correlation(points);
  const x = Number(labStartX(question));
  const lineFit = lineFitNamesPrediction(mode, question);
  return {
    fit: family === 'linear' ? { m: regression.m, b: regression.b } : expected.model,
    r,
    ...correlationDescriptor(r),
    causation: question.causationSupported ? 'causation' : 'association',
    modelChoice: expectedId,
    predictionX: x,
    predictionY: lineFit ? regression.m * x + regression.b : expected.predict(x),
    predictionType: lineFit ? UNANSWERED : predictionKind(points, x),
  };
};

const near = (stated, exact, relative = 1e-3) => Math.abs(Number(stated) - exact) <= relative * Math.max(1, Math.abs(exact));

const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });

/** Every assertion one reviewed question must pass; returns its work. */
const checkReview = ({ label, question }) => {
  const model = buildDataModelingLabReview(question);
  assertTextOnly(model, label);
  const mode = question.mode || 'full';
  const parts = dataModelingRequiredParts(mode, question);

  // The stated answer is what the shared grader marks correct, part by part.
  const work = workFromReview(model, question);
  const result = grade(question, work);
  assert.equal(result.graded, true, `${label}: graded (${result.reason})`);
  assert.deepEqual(result.parts.map((part) => part.id), parts, `${label}: the parts this mode grades`);
  result.parts.forEach((part) => assert.equal(part.isCorrect, true, `${label}: ${part.id} as the review states it (${part.response})`));
  assert.equal(result.isCorrect, true, `${label}: the review's answer is correct`);

  // ...and it is the derived answer, not merely inside a tolerance.
  const answer = derivedAnswer(question);
  if (parts.includes('fit')) {
    for (const [key, exact] of Object.entries(answer.fit)) {
      if (key === 'r') continue;
      assert.ok(near(work[key], exact), `${label}: ${key} = ${work[key]} is the fitted ${exact}`);
    }
  }
  if (parts.includes('correlation')) assert.ok(near(work.r, answer.r), `${label}: r = ${work.r} is ${answer.r}`);
  if (parts.some((part) => ['correlation', 'correlationInterpretation', 'association'].includes(part))) {
    assert.equal(work.direction, answer.direction, `${label}: direction`);
    assert.equal(work.strength, answer.strength, `${label}: strength`);
  }
  if (parts.includes('association')) assert.equal(work.causation, answer.causation, `${label}: causation`);
  if (parts.includes('modelChoice')) assert.equal(work.modelChoice, answer.modelChoice, `${label}: model family`);
  if (parts.includes('prediction')) {
    assert.ok(near(work.predictionX, answer.predictionX, 1e-9), `${label}: predicted at the lab's x`);
    assert.ok(near(work.predictionY, answer.predictionY), `${label}: ŷ = ${work.predictionY} is ${answer.predictionY}`);
    assert.equal(work.predictionType, answer.predictionType, `${label}: prediction type`);
  }

  // The worked steps carry this question's own result.
  const stepsText = model.steps.join(' ').replace(/−/g, '-');
  const shownKeys = ['m', 'b', 'a', 'c', 'base', 'h', 'k', 'r', 'predictionY'].filter((key) => key in work && work[key] !== '' && model.items.some((item) => LABEL_KEYS[item.label] === key));
  shownKeys.forEach((key) => assert.ok(stepsText.includes(String(work[key])), `${label}: the steps arrive at ${key} = ${work[key]}`));

  // The index picks the builder up; the page gets exactly this model.
  assert.deepEqual(buildToolSolutionReviewModel({ ...question, toolId: TOOL_ID }), model, `${label}: through the registry`);
  return { model, work };
};

/* --------------------------------------------------------------- tests */

test('the builder is implemented and the registry index serves it', () => {
  assert.equal(implemented, true);
  assert.equal(TOOL_REVIEW_BUILDERS[TOOL_ID], buildDataModelingLabReview);
  assert.equal(reviewModule.default, buildDataModelingLabReview);
});

test('every seed-bank Data Modeling instance reviews with the answer the shared grader accepts', () => {
  assert.ok(seedDocs.length >= 25, `found the seed bank's Data Modeling families (${seedDocs.length})`);
  const modes = new Set();
  for (const fixture of seedQuestions) {
    checkReview(fixture);
    modes.add(fixture.question.mode);
  }
  // The bank's modes: correlation and every regression fit.
  for (const mode of ['correlation', 'linearFit', 'quadraticFit', 'exponentialFit', 'linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction', 'squareRootFitPrediction']) {
    assert.ok(modes.has(mode), `the bank exercised ${mode}`);
  }
});

test('authored questions in every mode review with the answer the shared grader accepts', () => {
  const modes = new Set();
  for (const fixture of authoredQuestions) {
    checkReview(fixture);
    modes.add(fixture.question.mode || 'full');
  }
  assert.deepEqual([...modes].sort(), [...DATA_MODELING_MODES].sort(), 'every mode the lab renders has a review');
});

test('a changed answer is not what the review states: the grader rejects it', () => {
  const flips = {
    direction: (value) => (value === 'positive' ? 'negative' : 'positive'),
    strength: (value) => (value === 'strong' ? 'weak' : 'strong'),
    causation: (value) => (value === 'causation' ? 'association' : 'causation'),
    modelChoice: (value) => (value === 'linear' ? 'quadratic' : 'linear'),
    predictionType: (value) => (value === 'interpolation' ? 'extrapolation' : 'interpolation'),
  };
  let rejected = 0;
  for (const fixture of [...authoredQuestions, ...seedQuestions.filter((_, index) => index % 5 === 0)]) {
    const { model, work } = checkReview(fixture);
    for (const item of model.items) {
      const key = LABEL_KEYS[item.label];
      if (!key || key === 'predictionX') continue;
      const changed = flips[key]
        ? flips[key](work[key])
        : String(Number(work[key]) + Math.max(5, Math.abs(Number(work[key]))));
      const result = grade(fixture.question, { ...work, [key]: changed });
      assert.equal(result.isCorrect, false, `${fixture.label}: ${key} = ${changed} instead of ${work[key]} is wrong`);
      rejected += 1;
    }
  }
  assert.ok(rejected > 100, `checked ${rejected} wrong answers`);
});

test('the hand-fit window the review quotes for a stepper line fit is the grader\'s', () => {
  const steppers = authoredQuestions.filter(({ question }) => ['lineFit', 'full', undefined].includes(question.mode));
  assert.ok(steppers.length >= 5);
  for (const { label, question } of steppers) {
    const model = buildDataModelingLabReview(question);
    const match = model.note.match(/slope is within ([\d.]+) of (−?[\d.]+) and its intercept within ([\d.]+) of (−?[\d.]+)/);
    assert.ok(match, `${label}: the note gives the window (${model.note})`);
    const [slopeTolerance, interceptTolerance] = [Number(match[1]), Number(match[3])];
    const { m, b } = linearRegression(dataModelingPoints(question));
    const fitAccepted = (slope, intercept) => grade(question, { ...workFromReview(model, question), m: String(slope), b: String(intercept) })
      .parts.find((part) => part.id === 'fit').isCorrect;
    assert.equal(fitAccepted(m + 0.98 * slopeTolerance, b), true, `${label}: a slope just inside the quoted window counts`);
    assert.equal(fitAccepted(m - 1.02 * slopeTolerance, b), false, `${label}: a slope just outside it does not`);
    assert.equal(fitAccepted(m, b - 0.98 * interceptTolerance), true, `${label}: an intercept just inside counts`);
    assert.equal(fitAccepted(m, b + 1.02 * interceptTolerance), false, `${label}: an intercept just outside does not`);
  }
});

test('the review reads the question it is given: worked numbers, the causation flag and a student-chosen x', () => {
  const demo = buildDataModelingLabReview(q('lineFit', { points: DEMO }));
  assert.ok(demo.steps[0].includes('x̄ = 28 ÷ 7 = 4'), 'the means of these seven points');
  assert.ok(demo.steps[1].includes('Sxy = Σ(x − x̄)(y − ȳ) = 36') && demo.steps[1].includes('Sxx = Σ(x − x̄)² = 28'), 'their sums');

  const observational = buildDataModelingLabReview(q('association', { points: STUDY }));
  const experiment = buildDataModelingLabReview(q('association', { points: STUDY, causationSupported: true }));
  assert.equal(observational.items.at(-1).value, 'An association / relationship');
  assert.equal(experiment.items.at(-1).value, 'A cause-and-effect conclusion');

  // The full lab and the prediction mode let the student choose x: the review
  // says so instead of presenting the lab's starting x as the only answer.
  const chosen = buildDataModelingLabReview(q('prediction', { points: DEMO, predictionX: 4.5 }));
  assert.match(chosen.note, /You could choose any x/);
  assert.match(chosen.note, /x = 4\.5/);
  const fixed = buildDataModelingLabReview(q('linearFitPrediction', { points: DEMO, predictionX: 9 }));
  assert.equal(fixed.note, null, 'an authored, read-only target is the only x');
  assert.equal(fixed.items.find((item) => item.label === 'Predict at x =').value, '9');
});

test('malformed, degenerate and unexplainable questions give null and never throw', () => {
  const throwing = { type: TOOL_ID, mode: 'full', get points() { throw new Error('boom'); } };
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['array', []],
    ['string', 'dataModelingLab'],
    ['number', 42],
    ['the demonstration data (no authored points)', q('full', {})],
    ['points not a list', q('full', { points: 'x' })],
    ['two points', q('linearFit', { points: [[1, 2], [2, 3]] })],
    ['a blank y', q('linearFit', { points: [[1, 2], [2, ''], [3, 4]] })],
    ['a non-numeric x', q('linearFit', { points: [[1, 2], ['two', 3], [3, 4]] })],
    ['a null point', q('linearFit', { points: [[1, 2], null, [3, 4]] })],
    ['an object coordinate', q('linearFit', { points: [{ x: {}, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 4 }] })],
    ['every x the same', q('linearFit', { points: [[2, 1], [2, 3], [2, 5]] })],
    ['every y the same', q('correlation', { points: [[1, 4], [2, 4], [3, 4]] })],
    ['an unrecognised mode', q('bogusMode', { points: DEMO })],
    ['an authored family the lab cannot fit', q('modelCompare', { points: DEMO, expectedModel: 'cubic' })],
    ['an unknown metric', q('modelCompare', { points: DEMO, modelMetric: 'r2' })],
    ['a square root with two endpoint rows', q('squareRootFitPrediction', { points: [[2, 1], [2, 2], [6, 5], [11, 7]], predictionX: 20 })],
    ['a square-root prediction left of the endpoint', q('squareRootFitPrediction', { points: [[2, 1], [3, 3.1], [6, 5], [11, 7.1]], predictionX: 0 })],
    ['an exponential fit with no positive y', q('exponentialFit', { points: [[0, -1], [1, -2], [2, -4]] })],
    ['causation written as "false"', q('association', { points: STUDY, causationSupported: 'false' })],
    ['a blank prediction target', q('quadraticFitPrediction', { points: QUADRATIC, predictionX: '' })],
    ['a throwing getter', throwing],
  ];
  for (const [label, question] of cases) {
    let model;
    assert.doesNotThrow(() => { model = buildDataModelingLabReview(question); }, label);
    assert.equal(model, null, `${label}: no review`);
  }
  assert.equal(buildToolSolutionReviewModel({ toolId: TOOL_ID }), null, 'the registry path gives null too');
  assert.equal(buildToolSolutionReviewModel({ type: TOOL_ID, mode: 'association', points: STUDY, causationSupported: 'false' }), null);
});
