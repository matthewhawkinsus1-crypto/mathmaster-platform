/*
 * DATA MODELING LAB: ONE VERDICT, WHEREVER THE WORK IS MARKED.
 *
 * The lab's Check used to compute its verdict inline in DataModelingLab.jsx,
 * and the server could only keep that verdict. It now asks the shared grader
 * (functions/shared/serverGrading/tools/dataModelingLab.mjs), the same pure
 * function the server runs on the raw work. This file proves:
 *
 *   1. EXTRACTION PARITY — the shared grader reproduces the lab's previous
 *      inline Check (transcribed below as `legacyCheck`, verbatim from the
 *      component before the extraction) part for part and score for score,
 *      over every mode, many data sets, authored and unauthored questions,
 *      and correct / wrong / blank / alternate-form inputs;
 *   2. BROWSER = SERVER — the browser path (gradeToolCheck) and the server path
 *      (gradeServerResponse over the JSON the device sends) agree exactly;
 *   3. the declaration renders the same mode the lab does, including an
 *      unrecognised mode, which is NOT the full lab;
 *   4. per mode: correct, incorrect, partial, tampered, equivalent forms,
 *      unauthored defaults, and a changed key changes the verdict;
 *   5. the component is wired to the grader and submits no answer key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import dataModelingGrader from '../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import { GRADING_MANIFEST, TOOL_GRADING_DECLARATIONS } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { fitAdjustmentPlan } from '../../src/platform/graph/graphScaleService.js';
import { correlation, linearRegression, parseNumericAnswer, round } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  predictionKind,
} from '../../functions/shared/toolMath/dataModeling/dataModelingMath.mjs';
import {
  DATA_MODELING_MODES,
  FIT_PREDICTION_MODELS,
  dataModelingFixedPredictionTarget,
  dataModelingRequiredParts,
  exploratoryLineFitTolerances,
  lineFitNamesPrediction,
} from '../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';
import {
  buildDataModelingPrivateDefinition,
  gradeDataModelingResponse,
} from '../../functions/shared/pathDataModelingGrading.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const COMPONENT = stripComments(read('src/tools/dataModeling/DataModelingLab.jsx'));

/* ------------------------------------------------------------------------ *
 * THE LAB BEFORE THE EXTRACTION — transcribed verbatim from
 * DataModelingLab.jsx (initial state + Check handler) as it stood before the
 * verdict moved into the shared grader. It is the oracle for parity: nothing
 * here may be "fixed" to match the grader.
 * ------------------------------------------------------------------------ */
const LEGACY_DEFAULT_POINTS = [[1,2],[2,3],[3,5],[4,5],[5,7],[6,8],[7,10]];
const LEGACY_FIT_ONLY_MODELS = { linearFit: 'linear', quadraticFit: 'quadratic', exponentialFit: 'exponential' };
const LEGACY_FIT_PREDICTION_MODELS = { linearFitPrediction: 'linear', quadraticFitPrediction: 'quadratic', exponentialFitPrediction: 'exponential', squareRootFitPrediction: 'squareRoot' };
const LEGACY_FORCED_FIT_MODELS = { ...LEGACY_FIT_ONLY_MODELS, ...LEGACY_FIT_PREDICTION_MODELS };
const legacyFitCoefficientTolerance = (expected, authored, floor, relative = 0.05) => {
  const explicit = Number(authored);
  if (Number.isFinite(explicit)) return Math.abs(explicit);
  const value = Number(expected);
  return Number.isFinite(value) ? Math.max(floor, Math.abs(value) * relative) : floor;
};
const legacyModelFunction = (entry) => entry?.predict || (() => Number.NaN);

// Memoised per question object (the fixtures never mutate one), so the
// boundary search below can afford thousands of legacy Checks.
const legacyContextCache = new WeakMap();
const legacyContext = (questionData) => {
  if (!legacyContextCache.has(questionData)) legacyContextCache.set(questionData, computeLegacyContext(questionData));
  return legacyContextCache.get(questionData);
};
const computeLegacyContext = (questionData) => {
  const points = (questionData.points || LEGACY_DEFAULT_POINTS).map((pair) => (
    Array.isArray(pair) ? pair : [Number(pair?.x), Number(pair?.y)]
  ));
  const mode = questionData.mode || 'full';
  const lineFitPrediction = lineFitNamesPrediction(mode, questionData);
  const regression = linearRegression(points);
  const candidateModels = buildCandidateModels(points, regression);
  const bestModel = chooseBestModel(candidateModels, questionData.modelMetric || 'rmse');
  const r = correlation(points);
  const descriptor = correlationDescriptor(r);
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const forcedModelId = LEGACY_FORCED_FIT_MODELS[mode] || null;
  const exploratoryLineFit = mode === 'lineFit' || mode === 'full';
  const fitControls = fitAdjustmentPlan({
    targetSlope: regression.m,
    targetIntercept: regression.b,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    slopeTolerance: exploratoryLineFit ? questionData.slopeTolerance : undefined,
    interceptTolerance: exploratoryLineFit ? questionData.interceptTolerance : undefined,
    slopeStep: questionData.slopeStep,
    interceptStep: questionData.interceptStep,
    challengeClicks: questionData.fitChallengeClicks,
  });
  return { points, mode, lineFitPrediction, regression, candidateModels, bestModel, r, descriptor, xs, forcedModelId, exploratoryLineFit, fitControls };
};

/** The lab's state before the student touches anything (usePersistentToolState initial values). */
const legacyInitialState = (questionData) => {
  const { mode, regression, xs, forcedModelId, exploratoryLineFit, fitControls } = legacyContext(questionData);
  const startingModel = questionData.startingModel || {};
  return {
    m: startingModel.m ?? (exploratoryLineFit ? fitControls.slope.start : (forcedModelId === 'linear' ? 1 : round(regression.m * 0.75, 2))),
    b: startingModel.b ?? (exploratoryLineFit ? fitControls.intercept.start : (forcedModelId === 'linear' ? 0 : round(regression.b + 1, 2))),
    direction: 'positive',
    strength: 'moderate',
    causation: 'association',
    modelChoice: 'linear',
    predictionX: questionData.predictionX ?? Math.ceil(Math.max(...xs, 1) + 1),
    predictionY: '',
    predictionType: LEGACY_FIT_PREDICTION_MODELS[mode] ? '' : 'interpolation',
    correlationEntry: '',
    quadraticA: startingModel.a ?? '',
    quadraticB: startingModel.b ?? '',
    quadraticC: startingModel.c ?? '',
    exponentialA: startingModel.a ?? '',
    exponentialBase: startingModel.base ?? '',
    squareRootA: startingModel.a ?? '',
    squareRootH: startingModel.h ?? '',
    squareRootK: startingModel.k ?? '',
  };
};

/** The lab's former Check handler. */
const legacyCheck = (questionData, state) => {
  const { points, mode, lineFitPrediction, regression, candidateModels, bestModel, r, descriptor, forcedModelId, exploratoryLineFit, fitControls } = legacyContext(questionData);
  const { m, b, direction, strength, causation, modelChoice, predictionX, predictionY, predictionType, correlationEntry,
    quadraticA, quadraticB, quadraticC, exponentialA, exponentialBase, squareRootA, squareRootH, squareRootK } = state;
  const expectedModelId = forcedModelId || questionData.expectedModel || bestModel?.id || 'linear';
  const expectedModel = candidateModels.find((entry) => entry.id === expectedModelId) || candidateModels[0];
  const expectedPrediction = lineFitPrediction
    ? regression.m * Number(predictionX) + regression.b
    : (expectedModel ? legacyModelFunction(expectedModel)(Number(predictionX)) : Number.NaN);
  const expectedPredictionType = predictionKind(points, predictionX);
  const requiredParts = mode === 'lineFit' || LEGACY_FIT_ONLY_MODELS[mode] ? (lineFitPrediction ? ['fit', 'prediction'] : ['fit'])
    : LEGACY_FIT_PREDICTION_MODELS[mode] ? ['fit', 'prediction']
      : mode === 'association' ? ['association']
        : mode === 'correlation' ? ['correlation', 'correlationInterpretation']
          : mode === 'prediction' ? ['prediction']
            : mode === 'modelCompare' ? ['modelChoice']
              : ['fit', 'association', 'modelChoice', 'prediction'];
  const asksPredictionType = !lineFitPrediction;

  const results = {};
  const slopeTolerance = Number(questionData.slopeTolerance ?? (exploratoryLineFit ? fitControls.slope.tolerance : Math.max(0.2, Math.abs(regression.m) * 0.12)));
  const interceptTolerance = Number(questionData.interceptTolerance ?? (exploratoryLineFit ? fitControls.intercept.tolerance : 0.8));
  const fitSlope = parseNumericAnswer(m);
  const fitIntercept = parseNumericAnswer(b);
  if ((mode === 'quadraticFitPrediction' || mode === 'quadraticFit')) {
    const expected = expectedModel?.model || {};
    results.fit = [quadraticA, quadraticB, quadraticC].every((value) => parseNumericAnswer(value) != null)
      && Math.abs(Number(quadraticA) - Number(expected.a)) <= legacyFitCoefficientTolerance(expected.a, questionData.quadraticATolerance, 0.03)
      && Math.abs(Number(quadraticB) - Number(expected.b)) <= legacyFitCoefficientTolerance(expected.b, questionData.quadraticBTolerance, 0.08)
      && Math.abs(Number(quadraticC) - Number(expected.c)) <= legacyFitCoefficientTolerance(expected.c, questionData.quadraticCTolerance, 0.2);
  } else if ((mode === 'exponentialFitPrediction' || mode === 'exponentialFit')) {
    const expected = expectedModel?.model || {};
    results.fit = parseNumericAnswer(exponentialA) != null && parseNumericAnswer(exponentialBase) != null
      && Math.abs(Number(exponentialA) - Number(expected.a)) <= legacyFitCoefficientTolerance(expected.a, questionData.exponentialATolerance, 0.08)
      && Math.abs(Number(exponentialBase) - Number(expected.base)) <= legacyFitCoefficientTolerance(expected.base, questionData.exponentialBaseTolerance, 0.02, 0.03);
  } else if (mode === 'squareRootFitPrediction') {
    const expected = expectedModel?.model || {};
    results.fit = [squareRootA, squareRootH, squareRootK].every((value) => parseNumericAnswer(value) != null)
      && Math.abs(Number(squareRootA) - Number(expected.a)) <= legacyFitCoefficientTolerance(expected.a, questionData.squareRootATolerance, 0.05)
      && Math.abs(Number(squareRootH) - Number(expected.h)) <= legacyFitCoefficientTolerance(expected.h, questionData.squareRootHTolerance, 0.05, 0.02)
      && Math.abs(Number(squareRootK) - Number(expected.k)) <= legacyFitCoefficientTolerance(expected.k, questionData.squareRootKTolerance, 0.08, 0.03);
  } else {
    results.fit = fitSlope != null && fitIntercept != null
      && Math.abs(fitSlope - regression.m) <= slopeTolerance
      && Math.abs(fitIntercept - regression.b) <= interceptTolerance;
  }
  results.correlationInterpretation = direction === descriptor.direction && strength === descriptor.strength;
  results.association = results.correlationInterpretation && causation === (questionData.causationSupported ? 'causation' : 'association');
  const enteredCorrelation = parseNumericAnswer(correlationEntry);
  const correlationTolerance = Number(questionData.correlationTolerance ?? 0.03);
  results.correlation = enteredCorrelation != null
    && Math.abs(enteredCorrelation - r) <= correlationTolerance;
  results.modelChoice = modelChoice === expectedModelId;
  const predictionTolerance = Number(questionData.predictionTolerance ?? Math.max(0.5, Math.abs(expectedPrediction) * 0.08));
  const predicted = parseNumericAnswer(predictionY);
  results.prediction = predicted != null && Number.isFinite(expectedPrediction)
    && Math.abs(predicted - expectedPrediction) <= predictionTolerance
    && (!asksPredictionType || predictionType === expectedPredictionType);

  const scored = requiredParts.map((part) => results[part]);
  const score = scored.filter(Boolean).length / scored.length;
  return { isCorrect: score === 1, score, results, requiredParts };
};

/* ------------------------------------------------------------------------ *
 * The work the lab now submits, built from its state the way
 * DataModelingLab.jsx builds it (a source contract below pins the component
 * to this shape).
 * ------------------------------------------------------------------------ */
const componentWork = (questionData, state) => {
  const mode = questionData.mode || 'full';
  const fitWork = (mode === 'quadraticFitPrediction' || mode === 'quadraticFit')
    ? { a: state.quadraticA, b: state.quadraticB, c: state.quadraticC }
    : (mode === 'exponentialFitPrediction' || mode === 'exponentialFit')
      ? { a: state.exponentialA, base: state.exponentialBase }
      : mode === 'squareRootFitPrediction'
        ? { a: state.squareRootA, h: state.squareRootH, k: state.squareRootK }
        : { m: state.m, b: state.b };
  return {
    ...(dataModelingRequiredParts(mode, questionData).includes('fit') ? fitWork : {}),
    r: state.correlationEntry,
    direction: state.direction,
    strength: state.strength,
    causation: state.causation,
    modelChoice: state.modelChoice,
    predictionX: state.predictionX,
    predictionY: state.predictionY,
    predictionType: state.predictionType,
  };
};

/** A state that answers every part correctly (the test knows the key; the work never carries it). */
const correctState = (questionData) => {
  const context = legacyContext(questionData);
  const { points, mode, lineFitPrediction, regression, candidateModels, bestModel, r, descriptor, forcedModelId } = context;
  const state = legacyInitialState(questionData);
  const expectedModelId = forcedModelId || questionData.expectedModel || bestModel?.id || 'linear';
  const expectedModel = candidateModels.find((entry) => entry.id === expectedModelId) || candidateModels[0];
  const model = expectedModel.model;
  const x = state.predictionX;
  const prediction = lineFitPrediction ? regression.m * Number(x) + regression.b : expectedModel.predict(Number(x));
  return {
    ...state,
    m: round(regression.m, 3),
    b: round(regression.b, 3),
    quadraticA: String(round(model.a, 4)),
    quadraticB: String(round(model.b, 4)),
    quadraticC: String(round(model.c, 4)),
    exponentialA: String(round(model.a, 4)),
    exponentialBase: String(round(model.base, 4)),
    squareRootA: String(round(model.a, 4)),
    squareRootH: String(round(model.h, 4)),
    squareRootK: String(round(model.k, 4)),
    direction: descriptor.direction,
    strength: descriptor.strength,
    causation: questionData.causationSupported ? 'causation' : 'association',
    modelChoice: expectedModelId,
    correlationEntry: r.toFixed(3),
    predictionY: String(round(prediction, 3)),
    predictionType: predictionKind(points, x),
    mode,
  };
};

const browserGrade = (question, work) => gradeToolCheck(dataModelingGrader, question, work);
const serverGrade = (browser, question) => gradeServerResponse({
  question,
  response: JSON.parse(JSON.stringify(browser.toolResponse)),
});

const comparable = (result) => ({
  isCorrect: result.isCorrect,
  isComplete: result.isComplete,
  score: result.score,
  parts: result.parts,
});

/** Browser and server agree exactly, and the grader agrees with the legacy Check. */
const assertParity = (question, state, label) => {
  const work = componentWork(question, state);
  // An authored target is shown read-only, so the lab's own box always held
  // the question's x. Work naming another x is tampered: the lab could not
  // have produced it, and the grader marks the question's x regardless.
  const mode = question.mode || 'full';
  const shown = dataModelingFixedPredictionTarget(mode, question) ? { ...state, predictionX: question.predictionX } : state;
  const legacy = legacyCheck(question, shown);
  const browser = browserGrade(question, work);
  assert.equal(browser.graded, true, `${label}: graded (${browser.reason})`);
  assert.equal(browser.isCorrect, legacy.isCorrect, `${label}: isCorrect matches the lab's former Check`);
  assert.equal(browser.score, legacy.score, `${label}: score matches the lab's former Check`);
  assert.deepEqual(browser.parts.map((part) => part.id), legacy.requiredParts, `${label}: the same graded parts`);
  assert.deepEqual(
    browser.parts.map((part) => part.isCorrect),
    legacy.requiredParts.map((part) => Boolean(legacy.results[part])),
    `${label}: the same per-part verdicts`,
  );
  const server = serverGrade(browser, question);
  assert.equal(server.graded, true, `${label}: the server grades it (${server.reason})`);
  assert.deepEqual(comparable(server), comparable(browser), `${label}: browser and server agree`);
  return browser;
};

/* ------------------------------------------------------------------------ *
 * Data sets and questions.
 * ------------------------------------------------------------------------ */
const DATA = {
  unauthored: undefined,
  linearNoisy: [[1, 3.1], [2, 4.9], [3, 7.2], [4, 8.8], [5, 11.1], [6, 13]],
  quadratic: [[0, 1], [1, 2.2], [2, 5.1], [3, 9.8], [4, 17.2], [5, 26]],
  exponential: [[0, 2], [1, 3.1], [2, 4.4], [3, 6.9], [4, 10.1], [5, 15.3]],
  squareRoot: [[2, 1], [3, 3.1], [6, 5], [11, 7.1], [18, 9]],
  negative: [[1, 9], [2, 7], [3, 8], [4, 5], [5, 6], [6, 3], [7, 5]],
  scattered: [[1, 5], [2, 1], [3, 6], [4, 2], [5, 5], [6, 1]],
  objectPoints: [{ x: 1, y: 2 }, { x: 2, y: 4.1 }, { x: 3, y: 5.9 }, { x: 4, y: 8.2 }, { x: 5, y: 9.7 }],
  largeScale: [[1400, 450], [1800, 520], [2200, 610], [2600, 715], [3000, 930], [3400, 1000]],
  // RMSE names the quadratic best, MAE the exponential.
  outlier: [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1], [6, 25], [7, 14]],
  // Decay: a base below 2/3, where the base tolerance's 0.02 floor binds.
  decay: [[0, 50], [1, 31], [2, 19.5], [3, 12.1], [4, 7.6], [5, 4.8]],
};

const MODES = [...DATA_MODELING_MODES, 'bogusMode', undefined, ''];

const questionsFor = (mode) => {
  const out = [];
  for (const [dataName, points] of Object.entries(DATA)) {
    const base = { type: 'dataModelingLab', ...(mode === undefined ? {} : { mode }), ...(points ? { points } : {}) };
    out.push({ label: `${String(mode)}/${dataName}`, question: base });
    out.push({ label: `${String(mode)}/${dataName}/predict-12`, question: { ...base, predictionX: 12, causationSupported: true } });
    out.push({ label: `${String(mode)}/${dataName}/mae`, question: { ...base, modelMetric: 'mae' } });
    out.push({
      label: `${String(mode)}/${dataName}/authored`,
      question: {
        ...base,
        predictionX: 3,
        predictionTolerance: 0.4,
        slopeTolerance: 0.05,
        interceptTolerance: 0.1,
        correlationTolerance: 0.01,
        quadraticATolerance: 0.02,
        exponentialBaseTolerance: 0.01,
        squareRootHTolerance: 0,
        expectedModel: 'quadratic',
        modelMetric: 'mae',
        causationSupported: 'true',
      },
    });
  }
  return out;
};

const ALL_QUESTIONS = MODES.flatMap(questionsFor);

// Alternative values for each state field — wrong, blank, other spellings.
const variationsOf = (state) => [
  ['untouched', (question) => legacyInitialState(question)],
  ['correct', () => state],
  ['blank-m', () => ({ ...state, m: '' })],
  ['m-fraction', () => ({ ...state, m: `${Math.round(Number(state.m) * 4)}/4` })],
  ['m-off', () => ({ ...state, m: Number(state.m) + 0.3 })],
  ['b-off', () => ({ ...state, b: Number(state.b) - 1.5 })],
  ['m-string', () => ({ ...state, m: ` ${state.m} ` })],
  ['quadratic-b-blank', () => ({ ...state, quadraticB: '' })],
  ['quadratic-a-off', () => ({ ...state, quadraticA: String(Number(state.quadraticA) + 0.2) })],
  ['quadratic-fraction', () => ({ ...state, quadraticA: '1/2' })],
  ['exponential-base-off', () => ({ ...state, exponentialBase: String(Number(state.exponentialBase) * 1.1) })],
  ['square-root-h-off', () => ({ ...state, squareRootH: String(Number(state.squareRootH) + 1) })],
  ['square-root-k-blank', () => ({ ...state, squareRootK: '' })],
  ['only-the-fit', () => ({ ...state, direction: state.direction === 'positive' ? 'negative' : 'positive', modelChoice: state.modelChoice === 'linear' ? 'exponential' : 'linear', predictionY: '' })],
  ['direction-wrong', () => ({ ...state, direction: state.direction === 'positive' ? 'negative' : 'positive' })],
  ['strength-wrong', () => ({ ...state, strength: state.strength === 'weak' ? 'strong' : 'weak' })],
  ['strength-blank', () => ({ ...state, strength: '' })],
  ['causation-flipped', () => ({ ...state, causation: state.causation === 'causation' ? 'association' : 'causation' })],
  ['model-wrong', () => ({ ...state, modelChoice: state.modelChoice === 'linear' ? 'exponential' : 'linear' })],
  ['r-blank', () => ({ ...state, correlationEntry: '' })],
  ['r-off', () => ({ ...state, correlationEntry: String(Number(state.correlationEntry) + 0.05) })],
  ['r-unicode-minus', () => ({ ...state, correlationEntry: String(state.correlationEntry).replace('-', '−') })],
  ['prediction-blank', () => ({ ...state, predictionY: '' })],
  ['prediction-off', () => ({ ...state, predictionY: String(Number(state.predictionY) + 5) })],
  ['prediction-number', () => ({ ...state, predictionY: Number(state.predictionY) })],
  ['prediction-type-flipped', () => ({ ...state, predictionType: state.predictionType === 'interpolation' ? 'extrapolation' : 'interpolation' })],
  ['prediction-type-blank', () => ({ ...state, predictionType: '' })],
  ['prediction-x-moved', () => ({ ...state, predictionX: 2 })],
  ['prediction-x-cleared', () => ({ ...state, predictionX: '' })],
  ['prediction-x-string', () => ({ ...state, predictionX: String(state.predictionX) })],
  ['steps-nan', () => ({ ...state, m: Number.NaN, b: Number.POSITIVE_INFINITY })],
];

/* ------------------------------------------------------------------------ */

test('the declaration grades every mode on the server, and the grader binds every mode', () => {
  const declaration = TOOL_GRADING_DECLARATIONS.dataModelingLab;
  assert.equal(GRADING_MANIFEST.dataModelingLab, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'full');
  assert.deepEqual(Object.keys(declaration.modes).sort(), [...DATA_MODELING_MODES, 'unrecognized'].sort());
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is server graded`);
    assert.equal(typeof dataModelingGrader.modeGraders[mode], 'function', `${mode} has a grade function`);
  }
});

test('the declaration resolves the mode the lab renders, and an unknown mode is not the full lab', () => {
  const declaration = TOOL_GRADING_DECLARATIONS.dataModelingLab;
  const cases = [
    [{}, 'full'],
    [{ mode: '' }, 'full'],
    [{ mode: null }, 'full'],
    [{ mode: 'full' }, 'full'],
    [{ mode: 'lineFit' }, 'lineFit'],
    [{ mode: 'squareRootFitPrediction' }, 'squareRootFitPrediction'],
    [{ mode: 'modelCompare' }, 'modelCompare'],
    [{ mode: 'bogusMode' }, 'unrecognized'],
    [{ mode: ' full' }, 'unrecognized'],
    [{ mode: 'Full' }, 'unrecognized'],
    [{ mode: 'constructor' }, 'unrecognized'],
    [{ mode: 5 }, 'unrecognized'],
  ];
  for (const [question, expected] of cases) {
    assert.equal(resolveToolMode(declaration, question), expected, JSON.stringify(question));
  }
  // The lab: `questionData.mode || 'full'`, and every mode it branches on is a
  // declared mode — so any other string reaches the reduced screen that the
  // `unrecognized` mode grades.
  assert.match(COMPONENT, /const mode = questionData\.mode \|\| 'full';/);
  const branched = new Set([
    ...[...COMPONENT.matchAll(/mode === '([A-Za-z]+)'/g)].map((match) => match[1]),
    ...[...COMPONENT.matchAll(/\[((?:'[A-Za-z]+',\s*)+'[A-Za-z]+')\]\.includes\(mode\)/g)]
      .flatMap((match) => match[1].split(',').map((name) => name.trim().replace(/'/g, ''))),
  ]);
  assert.ok(branched.size >= 8, 'found the lab\'s mode branches');
  for (const name of branched) assert.ok(DATA_MODELING_MODES.includes(name), `${name} is a declared mode`);
  const tasks = COMPONENT.match(/const MODE_TASKS = \{([^\n]*)\};/)[1];
  const taskModes = [...tasks.matchAll(/'([A-Za-z]+)':/g)].map((match) => match[1]);
  assert.deepEqual([...taskModes].sort(), [...DATA_MODELING_MODES].sort(), 'every mode with its own task text is a declared mode');
  // An unrecognised mode keeps the typed-fit tolerance (not the steppers') and
  // the full lab's four parts — exactly what the lab did.
  const points = DATA.linearNoisy;
  const regression = linearRegression(points);
  const slightlyOff = { m: regression.m + 0.2, b: regression.b, r: '', direction: 'positive', strength: 'strong', causation: 'association', modelChoice: 'linear', predictionX: 7, predictionY: '', predictionType: 'extrapolation' };
  const asFull = browserGrade({ type: 'dataModelingLab', points }, slightlyOff);
  const asUnknown = browserGrade({ type: 'dataModelingLab', points, mode: 'bogusMode' }, slightlyOff);
  assert.deepEqual(asUnknown.parts.map((part) => part.id), ['fit', 'association', 'modelChoice', 'prediction']);
  assert.equal(asFull.parts[0].isCorrect, false, 'the stepper tolerance (about 0.16 here) rejects a slope 0.2 off');
  assert.equal(asUnknown.parts[0].isCorrect, true, 'the typed-fit tolerance max(0.2, 12% of m) ≈ 0.24 accepts it');
});

test('extraction parity: the shared grader reproduces the lab\'s former Check, and browser = server', () => {
  let fixtures = 0;
  const seenScores = new Set();
  for (const { label, question } of ALL_QUESTIONS) {
    const state = correctState(question);
    // A variation of a field this mode does not send (a quadratic box in a
    // line mode) yields work already checked; the verdict is a function of
    // (question, work), so each distinct work is checked once.
    const seenWork = new Set();
    for (const [variation, build] of variationsOf(state)) {
      const varied = build(question);
      const key = JSON.stringify(componentWork(question, varied), (_, value) => (typeof value === 'number' && !Number.isFinite(value) ? String(value) : value));
      if (seenWork.has(key)) continue;
      seenWork.add(key);
      const browser = assertParity(question, varied, `${label}/${variation}`);
      seenScores.add(browser.score);
      fixtures += 1;
    }
  }
  assert.ok(fixtures > 3000, `exercised ${fixtures} fixtures`);
  // The grid really exercises partial credit, not just right/wrong.
  for (const score of [0, 0.25, 0.5, 0.75, 1]) assert.ok(seenScores.has(score), `a fixture scored ${score}`);
});

/*
 * TOLERANCE BOUNDARIES, FOUND BY THE LEGACY CHECK AND HELD BY THE GRADER.
 *
 * For every typed number a mode grades, walk the answer away from the key
 * until the lab's former Check stops accepting it, bisect to the exact edge,
 * and require the shared grader to accept just inside it and reject just
 * outside it. A floor, a relative share or a default changed anywhere moves an
 * edge somewhere in this sweep.
 */
const GRADED_NUMBERS = {
  line: [['m', 'fit'], ['b', 'fit']],
  quadratic: [['quadraticA', 'fit'], ['quadraticB', 'fit'], ['quadraticC', 'fit']],
  exponential: [['exponentialA', 'fit'], ['exponentialBase', 'fit']],
  squareRoot: [['squareRootA', 'fit'], ['squareRootH', 'fit'], ['squareRootK', 'fit']],
};
const gradedNumbersFor = (question) => {
  const mode = question.mode || 'full';
  const parts = legacyCheck(question, legacyInitialState(question)).requiredParts;
  const fields = [];
  if (parts.includes('fit')) {
    const family = mode.startsWith('quadratic') ? 'quadratic' : mode.startsWith('exponential') ? 'exponential' : mode === 'squareRootFitPrediction' ? 'squareRoot' : 'line';
    fields.push(...GRADED_NUMBERS[family]);
  }
  if (parts.includes('correlation')) fields.push(['correlationEntry', 'correlation']);
  if (parts.includes('prediction')) fields.push(['predictionY', 'prediction']);
  return fields;
};
const shift = (value, delta) => (typeof value === 'number' ? value + delta : String(Number(value) + delta));

test('tolerance boundaries: the grader accepts and rejects exactly where the lab did', () => {
  let edges = 0;
  const datasets = ['unauthored', 'linearNoisy', 'quadratic', 'exponential', 'decay', 'squareRoot', 'outlier', 'largeScale'];
  for (const mode of [...DATA_MODELING_MODES, 'bogusMode']) {
    for (const { label, question } of questionsFor(mode)) {
      if (!datasets.some((name) => label === `${mode}/${name}` || label.startsWith(`${mode}/${name}/`))) continue;
      const shown = { ...correctState(question) };
      for (const [field, part] of gradedNumbersFor(question)) {
        const accepted = (delta) => Boolean(legacyCheck(question, { ...shown, [field]: shift(shown[field], delta) }).results[part]);
        for (const direction of [1, -1]) {
          if (!accepted(0)) continue;
          let inside = 0;
          let outside = 1e-3 * direction;
          while (accepted(outside) && Math.abs(outside) < 1e7) {
            inside = outside;
            outside *= 2;
          }
          if (accepted(outside)) continue;
          for (let step = 0; step < 60 && Math.abs(outside - inside) > 1e-12 * Math.max(1, Math.abs(outside)); step += 1) {
            const middle = (inside + outside) / 2;
            if (accepted(middle)) inside = middle; else outside = middle;
          }
          const gradeAt = (delta) => dataModelingGrader.grade(question, componentWork(question, { ...shown, [field]: shift(shown[field], delta) }))
            .parts.find((entry) => entry.id === part).isCorrect;
          assert.equal(gradeAt(inside), true, `${label} ${field} ${direction > 0 ? '+' : '-'}: accepted just inside the lab's edge (${inside})`);
          assert.equal(gradeAt(outside), false, `${label} ${field} ${direction > 0 ? '+' : '-'}: rejected just outside the lab's edge (${outside})`);
          edges += 1;
        }
      }
    }
  }
  assert.ok(edges > 400, `checked ${edges} tolerance edges`);
});

test('the stepper tolerance the grader applies is the one the lab sizes its steppers from', () => {
  for (const [name, points] of Object.entries(DATA)) {
    const pairs = (points || LEGACY_DEFAULT_POINTS).map((pair) => (Array.isArray(pair) ? pair : [pair.x, pair.y]));
    const xs = pairs.map(([x]) => Number(x));
    const ys = pairs.map(([, y]) => Number(y));
    const regression = linearRegression(pairs);
    const bounds = { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
    const plan = fitAdjustmentPlan({ targetSlope: regression.m, targetIntercept: regression.b, ...bounds });
    const tolerances = exploratoryLineFitTolerances({ targetSlope: regression.m, ...bounds });
    assert.equal(tolerances.slope, plan.slope.tolerance, `${name}: slope tolerance`);
    assert.equal(tolerances.intercept, plan.intercept.tolerance, `${name}: intercept tolerance`);
    // A student who steps onto the regression line is correct; the untouched
    // starting line is not.
    const question = { type: 'dataModelingLab', mode: 'lineFit', ...(points ? { points } : {}) };
    assert.equal(browserGrade(question, { m: plan.slope.target, b: plan.intercept.target }).isCorrect, true, `${name}: target reachable`);
    assert.equal(browserGrade(question, { m: plan.slope.start, b: plan.intercept.start }).isCorrect, false, `${name}: start is not an answer`);
  }
  // Degenerate data stays degenerate in both.
  const degenerate = exploratoryLineFitTolerances({ targetSlope: Number.NaN, xMin: Number.NaN, xMax: 1, yMin: 0, yMax: 1 });
  const degeneratePlan = fitAdjustmentPlan({ targetSlope: Number.NaN, targetIntercept: 0, xMin: Number.NaN, xMax: 1, yMin: 0, yMax: 1 });
  assert.ok(Number.isNaN(degenerate.slope) && Number.isNaN(degeneratePlan.slope.tolerance));
});

/* ---------------------------- per-mode cases ---------------------------- */

const POINTS = DATA.linearNoisy;
const REG = linearRegression(POINTS);
const R = correlation(POINTS);

const MODE_CASES = {
  full: {
    question: { type: 'dataModelingLab', mode: 'full', points: POINTS, predictionX: 8 },
    // The best family by RMSE for this data is (narrowly) quadratic.
    partial: (work) => ({ ...work, modelChoice: 'exponential', predictionY: '' }),
    partialScore: 0.5,
  },
  lineFit: {
    question: { type: 'dataModelingLab', mode: 'lineFit', points: POINTS, predictionX: 8, studentActions: ['fitDataModel'] },
    partial: (work) => ({ ...work, predictionY: '' }),
    partialScore: 0.5,
  },
  linearFit: { question: { type: 'dataModelingLab', mode: 'linearFit', points: POINTS } },
  quadraticFit: { question: { type: 'dataModelingLab', mode: 'quadraticFit', points: DATA.quadratic } },
  exponentialFit: { question: { type: 'dataModelingLab', mode: 'exponentialFit', points: DATA.exponential } },
  linearFitPrediction: {
    question: { type: 'dataModelingLab', mode: 'linearFitPrediction', points: POINTS, predictionX: 10 },
    partial: (work) => ({ ...work, predictionType: 'interpolation' }),
    partialScore: 0.5,
  },
  quadraticFitPrediction: {
    question: { type: 'dataModelingLab', mode: 'quadraticFitPrediction', points: DATA.quadratic, predictionX: 3.5 },
    partial: (work) => ({ ...work, c: '' }),
    partialScore: 0.5,
  },
  exponentialFitPrediction: {
    question: { type: 'dataModelingLab', mode: 'exponentialFitPrediction', points: DATA.exponential, predictionX: 7 },
    partial: (work) => ({ ...work, predictionY: '1' }),
    partialScore: 0.5,
  },
  squareRootFitPrediction: {
    question: { type: 'dataModelingLab', mode: 'squareRootFitPrediction', points: DATA.squareRoot, predictionX: 27 },
    partial: (work) => ({ ...work, h: '0' }),
    partialScore: 0.5,
  },
  association: {
    question: { type: 'dataModelingLab', mode: 'association', points: POINTS, causationSupported: false },
    // A linear rescaling keeps direction and strength; the causation key does not.
    alter: (question) => ({ ...question, causationSupported: true }),
  },
  correlation: {
    question: { type: 'dataModelingLab', mode: 'correlation', points: POINTS, correlationTolerance: 0.01 },
    alter: (question) => ({ ...question, points: question.points.map(([x, y]) => [x, -y]) }),
    partial: (work) => ({ ...work, strength: 'weak' }),
    partialScore: 0.5,
  },
  prediction: { question: { type: 'dataModelingLab', mode: 'prediction', points: POINTS, predictionX: 4.5, expectedModel: 'linear' } },
  modelCompare: {
    question: { type: 'dataModelingLab', mode: 'modelCompare', points: DATA.quadratic },
    alter: (question) => ({ ...question, points: DATA.exponential }),
  },
  unrecognized: {
    question: { type: 'dataModelingLab', mode: 'bogusMode', points: POINTS, predictionX: 8 },
    partial: (work) => ({ ...work, predictionY: '' }),
    partialScore: 0.75,
  },
};

test('every mode has its cases here', () => {
  assert.deepEqual(Object.keys(MODE_CASES).sort(), Object.keys(TOOL_GRADING_DECLARATIONS.dataModelingLab.modes).sort());
});

for (const [mode, spec] of Object.entries(MODE_CASES)) {
  const { question } = spec;
  const correctWork = () => componentWork(question, correctState(question));

  test(`${mode}: fully correct work is correct and complete, on both paths`, () => {
    const result = assertParity(question, correctState(question), `${mode}/correct`);
    assert.equal(result.isCorrect, true);
    assert.equal(result.score, 1);
    assert.equal(result.isComplete, true);
    assert.equal(dataModelingGrader.grade(question, componentWork(question, correctState(question))).mode, mode);
    assert.deepEqual(result.parts.map((part) => part.id), dataModelingRequiredParts(question.mode, question));
  });

  test(`${mode}: incorrect work is incorrect`, () => {
    const wrong = {
      ...correctWork(),
      m: 99, b: -99, a: '99', c: '99', base: '9', h: '99', k: '99',
      r: '0.01', direction: 'none', strength: 'none', causation: 'causation', modelChoice: 'squareRoot',
      predictionY: '-500', predictionType: 'unknown',
    };
    const browser = browserGrade(question, wrong);
    assert.equal(browser.isCorrect, false);
    assert.equal(browser.score, 0);
    assert.ok(browser.parts.every((part) => part.isCorrect === false));
    assert.deepEqual(comparable(serverGrade(browser, question)), comparable(browser));
  });

  test(`${mode}: partial and incomplete work`, () => {
    if (spec.partial) {
      const partial = browserGrade(question, spec.partial(correctWork()));
      assert.equal(partial.isCorrect, false);
      assert.equal(partial.score, spec.partialScore, 'each part is an equal share of the score');
      assert.deepEqual(comparable(serverGrade(partial, question)), comparable(partial));
    }
    // Every box blank: graded (an explicit Check is marked), incomplete, wrong.
    const blank = Object.fromEntries(Object.keys(correctWork()).map((key) => [key, '']));
    const result = browserGrade(question, blank);
    assert.equal(result.graded, true);
    assert.equal(result.isComplete, false, 'a blank lab is never complete — a deadline will not submit it');
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
    assert.deepEqual(comparable(serverGrade(result, question)), comparable(result));
  });

  test(`${mode}: tampered or malformed work cannot claim a verdict`, () => {
    const work = correctWork();
    // Injected verdicts and keys are dropped before grading.
    const injected = {
      ...spec.partial ? spec.partial(work) : { ...work, predictionY: '-500', m: 99, a: '99', r: '0.9999', modelChoice: 'none', direction: 'none' },
      isCorrect: true, score: 1, correct: true, checks: [true], expected: { m: 1 }, answerKey: 'x', solution: 'y',
    };
    const honest = { ...injected };
    for (const key of ['isCorrect', 'score', 'correct', 'checks', 'expected', 'answerKey', 'solution']) delete honest[key];
    const tampered = browserGrade(question, injected);
    assert.deepEqual(comparable(tampered), comparable(browserGrade(question, honest)), 'a claimed verdict changes nothing');
    assert.equal(tampered.isCorrect, false);
    assert.deepEqual(comparable(serverGrade(tampered, question)), comparable(tampered));
    // Wrong types are graded as wrong, never crash.
    const wrongTypes = Object.fromEntries(Object.keys(work).map((key) => [key, { nested: [key] }]));
    const typed = browserGrade(question, wrongTypes);
    assert.equal(typed.graded, true);
    assert.equal(typed.isCorrect, false);
    // Not an object at all: no verdict.
    for (const bad of [null, [], 'm=1', 7]) {
      const result = browserGrade(question, bad);
      assert.equal(result.graded, false, `${JSON.stringify(bad)} is not gradable`);
      assert.equal(result.isCorrect, false);
    }
    // Oversize: refused, not truncated into something else.
    const oversize = browserGrade(question, { ...work, padding: Array.from({ length: 300 }, () => 'x'.repeat(100)) });
    assert.equal(oversize.graded, false);
    assert.equal(oversize.reason, 'oversize-response');
    // A response for another tool, or none, is refused by the server.
    assert.equal(gradeServerResponse({ question, response: { ...JSON.parse(JSON.stringify(tampered.toolResponse)), toolId: 'complexPlaneLab' } }).reason, 'response-tool-mismatch');
    assert.equal(gradeServerResponse({ question, response: { kind: 'opaque', value: JSON.stringify(work) } }).graded, false);
  });

  test(`${mode}: a changed key changes the verdict (discrimination)`, () => {
    const work = correctWork();
    assert.equal(browserGrade(question, work).isCorrect, true);
    const altered = spec.alter
      ? spec.alter(question)
      : { ...question, points: question.points.map(([x, y]) => [x, Number(y) * 1.6 + 7]) };
    const result = browserGrade(altered, work);
    assert.equal(result.isCorrect, false, 'the same work against different data is wrong');
    assert.deepEqual(comparable(serverGrade(result, altered)), comparable(result));
  });
}

/* ------------------------- specific behaviours ------------------------- */

test('equivalent forms the lab accepts: fractions, spaces, unicode minus, numbers or strings', () => {
  const question = { type: 'dataModelingLab', mode: 'linearFitPrediction', points: [[0, 1], [2, 2], [4, 3], [6, 4]], predictionX: 3 };
  // y = 0.5x + 1 exactly; at x = 3 the prediction is 2.5 (interpolation).
  const forms = [
    { m: '1/2', b: '1', predictionY: '5/2' },
    { m: 0.5, b: 1, predictionY: 2.5 },
    { m: ' 0.5 ', b: '1.0', predictionY: '2.50' },
    { m: '.5', b: '+1', predictionY: '2.5' },
  ];
  for (const form of forms) {
    const result = browserGrade(question, { ...form, predictionX: 3, predictionType: 'interpolation' });
    assert.equal(result.isCorrect, true, JSON.stringify(form));
    assert.deepEqual(comparable(serverGrade(result, question)), comparable(result));
  }
  const negative = { type: 'dataModelingLab', mode: 'linearFit', points: [[0, 1], [1, 0], [2, -1], [3, -2]] };
  assert.equal(browserGrade(negative, { m: '−1', b: '1' }).isCorrect, true, 'a typed unicode minus reads as negative');
  // Quadratic coefficients are compared with Number(), as the lab compares them:
  // a fraction there is not accepted (the lab's number inputs cannot hold one).
  const quadratic = { type: 'dataModelingLab', mode: 'quadraticFit', points: [[0, 0], [1, 0.5], [2, 2], [3, 4.5], [4, 8]] };
  assert.equal(browserGrade(quadratic, { a: '0.5', b: '0', c: '0' }).isCorrect, true);
  assert.equal(browserGrade(quadratic, { a: '1/2', b: '0', c: '0' }).isCorrect, false);
  // Order of the candidate families never matters: the choice is graded by id.
  assert.equal(browserGrade({ type: 'dataModelingLab', mode: 'modelCompare', points: quadratic.points }, { modelChoice: 'quadratic' }).isCorrect, true);
});

test('a cleared box is blank, never 0 (the old Number() wire format scored it as 0)', () => {
  // r ≈ 0 for this data, so a response that turned a blank r into 0 would pass.
  const question = { type: 'dataModelingLab', mode: 'correlation', points: [[1, 1], [2, 3], [3, 1], [4, 3], [5, 3], [6, 1], [7, 3], [8, 1]] };
  const r = correlation(question.points);
  assert.ok(Math.abs(r) < 0.03);
  const blank = browserGrade(question, { r: '', direction: 'none', strength: 'none' });
  assert.equal(blank.parts.find((part) => part.id === 'correlation').isCorrect, false);
  assert.equal(blank.isComplete, false);
  assert.equal(browserGrade(question, { r: '0', direction: 'none', strength: 'none' }).isCorrect, true);
  // A blank coefficient with an expected value of 0 is still blank.
  const quadratic = { type: 'dataModelingLab', mode: 'quadraticFit', points: [[0, 0], [1, 0.5], [2, 2], [3, 4.5], [4, 8]] };
  assert.equal(browserGrade(quadratic, { a: '0.5', b: '', c: '' }).isCorrect, false);
});

test('an authored prediction x is graded at the question\'s x; an open one at the student\'s', () => {
  const points = DATA.linearNoisy;
  const regression = linearRegression(points);
  const at = (x) => String(round(regression.m * x + regression.b, 3));
  // Fixed (read-only) target: moving x in the work does not move the target.
  const fixed = { type: 'dataModelingLab', mode: 'linearFitPrediction', points, predictionX: 12 };
  assert.equal(dataModelingFixedPredictionTarget(fixed.mode, fixed), true);
  const honest = { m: round(regression.m, 3), b: round(regression.b, 3), predictionX: 12, predictionY: at(12), predictionType: 'extrapolation' };
  assert.equal(browserGrade(fixed, honest).isCorrect, true);
  const moved = { ...honest, predictionX: 3, predictionY: at(3), predictionType: 'interpolation' };
  assert.equal(browserGrade(fixed, moved).parts[1].isCorrect, false, 'a tampered x cannot swap in an easier target');
  // Open target (`prediction` mode asks the student to enter x): graded at the
  // x the student chose, as the lab always did.
  const open = { type: 'dataModelingLab', mode: 'prediction', points, predictionX: 12, expectedModel: 'linear' };
  assert.equal(dataModelingFixedPredictionTarget(open.mode, open), false);
  assert.equal(browserGrade(open, { predictionX: '3', predictionY: at(3), predictionType: 'interpolation' }).isCorrect, true);
  const cleared = browserGrade(open, { predictionX: '', predictionY: at(0), predictionType: 'extrapolation' });
  assert.equal(cleared.isCorrect, true, 'a cleared x reads as 0, exactly as the lab read it');
  assert.equal(cleared.isComplete, false, 'but it is not complete work for a deadline');
});

test('a line-fit prediction is graded against the LINEAR model even when a quadratic fits best', () => {
  // Exactly quadratic data: the best family is quadratic, the line is y = 6x − 7.
  const points = [[1, 1], [2, 4], [3, 9], [4, 16], [5, 25]];
  assert.equal(chooseBestModel(buildCandidateModels(points, linearRegression(points))).id, 'quadratic');
  const question = { type: 'dataModelingLab', mode: 'lineFit', points, predictionX: 7 };
  assert.deepEqual(dataModelingRequiredParts('lineFit', question), ['fit', 'prediction']);
  const regression = linearRegression(points);
  const line = { m: regression.m, b: regression.b, predictionX: 7, predictionY: '' };
  const linear = browserGrade(question, { ...line, predictionY: '35' });
  assert.deepEqual(linear.parts.map((part) => [part.id, part.isCorrect]), [['fit', true], ['prediction', true]]);
  assert.equal(browserGrade(question, { ...line, predictionY: '49' }).parts[1].isCorrect, false, 'the quadratic\'s value is not the line\'s');
  // It is not classified: no interpolation/extrapolation select is shown.
  assert.equal(browserGrade(question, { ...line, predictionY: '35', predictionType: 'nonsense' }).isCorrect, true);
  const blank = browserGrade(question, line);
  assert.equal(blank.score, 0.5);
  assert.equal(blank.isComplete, false);
  // Without a target, a line fit grades only the fit.
  assert.deepEqual(browserGrade({ ...question, predictionX: '' }, line).parts.map((part) => part.id), ['fit']);
  // The regression-technology button puts round(regression, 3) in the steppers: correct.
  assert.equal(browserGrade({ ...question, predictionX: undefined, studentActions: ['fitDataModel'] }, { m: round(regression.m, 3), b: round(regression.b, 3) }).isCorrect, true);
});

test('unauthored questions use the lab\'s defaults', () => {
  // No points: the lab's demonstration data. No mode: the full lab. No metric:
  // RMSE. No expected family: the best fit. No causation flag: association.
  const question = { type: 'dataModelingLab' };
  const state = correctState(question);
  const result = assertParity(question, state, 'unauthored');
  assert.equal(result.isCorrect, true);
  assert.equal(dataModelingGrader.grade(question, componentWork(question, state)).mode, 'full');
  const best = chooseBestModel(buildCandidateModels(LEGACY_DEFAULT_POINTS, linearRegression(LEGACY_DEFAULT_POINTS)), 'rmse');
  assert.equal(state.modelChoice, best.id);
  assert.equal(browserGrade(question, { ...componentWork(question, state), causation: 'causation' }).parts[1].isCorrect, false);
  // The default prediction x is one past the data: an extrapolation.
  assert.equal(state.predictionX, 8);
  assert.equal(state.predictionType, 'extrapolation');
  // causationSupported is read as the lab reads it (truthy).
  assert.equal(browserGrade({ ...question, mode: 'association', causationSupported: 'yes' }, { direction: state.direction, strength: state.strength, causation: 'causation' }).isCorrect, true);
  // A different metric can name a different best family.
  const metricQuestion = { type: 'dataModelingLab', mode: 'modelCompare', points: DATA.exponential, modelMetric: 'mae' };
  const metricBest = chooseBestModel(buildCandidateModels(DATA.exponential, linearRegression(DATA.exponential)), 'mae').id;
  assert.equal(browserGrade(metricQuestion, { modelChoice: metricBest }).isCorrect, true);
});

test('specific keys discriminate: causation, expected family, prediction x, tolerances', () => {
  const association = { type: 'dataModelingLab', mode: 'association', points: POINTS };
  const descriptor = correlationDescriptor(R);
  const answer = { direction: descriptor.direction, strength: descriptor.strength, causation: 'association' };
  assert.equal(browserGrade(association, answer).isCorrect, true);
  assert.equal(browserGrade({ ...association, causationSupported: true }, answer).isCorrect, false);

  const compare = { type: 'dataModelingLab', mode: 'modelCompare', points: POINTS };
  const best = chooseBestModel(buildCandidateModels(POINTS, REG)).id;
  assert.equal(browserGrade(compare, { modelChoice: best }).isCorrect, true);
  const other = best === 'linear' ? 'quadratic' : 'linear';
  assert.equal(browserGrade({ ...compare, expectedModel: other }, { modelChoice: best }).isCorrect, false);

  const fixed = { type: 'dataModelingLab', mode: 'linearFitPrediction', points: POINTS, predictionX: 10 };
  const work = componentWork(fixed, correctState(fixed));
  assert.equal(browserGrade(fixed, work).isCorrect, true);
  assert.equal(browserGrade({ ...fixed, predictionX: 20 }, work).isCorrect, false);

  const correlationQ = { type: 'dataModelingLab', mode: 'correlation', points: POINTS };
  const near = { r: String(R + 0.02), direction: descriptor.direction, strength: descriptor.strength };
  assert.equal(browserGrade(correlationQ, near).isCorrect, true);
  assert.equal(browserGrade({ ...correlationQ, correlationTolerance: 0.01 }, near).isCorrect, false);
});

test('realistic maximal work is bounded and carries nothing the contract drops', () => {
  for (const { question } of ALL_QUESTIONS) {
    const work = componentWork(question, correctState(question));
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, [], `${question.mode}: no student field uses a reserved key`);
    assert.equal(bounded.truncated, false);
    assert.ok(JSON.stringify(bounded.work).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  }
  const longest = {
    m: '-123456.789012', b: '-123456.789012', a: '-123456.789012', c: '-123456.789012', base: '1.0000001', h: '-1000', k: '-1000',
    r: '-0.999999', direction: 'negative', strength: 'moderate', causation: 'association', modelChoice: 'exponential',
    predictionX: '-123456.789', predictionY: '-123456.789012', predictionType: 'extrapolation',
  };
  assert.ok(JSON.stringify(longest).length < 1000);
  assert.deepEqual(boundToolWork(longest).dropped, []);
});

test('My Math Path still reads the work the lab sends (the keys did not change)', () => {
  // Path grades the same raw work with its own grader (pathDataModelingGrading.mjs).
  const cases = [
    { type: 'dataModelingLab', mode: 'linearFitPrediction', points: POINTS, predictionX: 10, slopeTolerance: 0.2, interceptTolerance: 0.5 },
    { type: 'dataModelingLab', mode: 'quadraticFitPrediction', points: DATA.quadratic, predictionX: 3.5 },
    { type: 'dataModelingLab', mode: 'exponentialFitPrediction', points: DATA.exponential, predictionX: 7 },
    { type: 'dataModelingLab', mode: 'squareRootFitPrediction', points: DATA.squareRoot, predictionX: 27 },
    { type: 'dataModelingLab', mode: 'correlation', points: POINTS },
    { type: 'dataModelingLab', mode: 'association', points: POINTS },
    { type: 'dataModelingLab', mode: 'modelCompare', points: DATA.quadratic },
  ];
  for (const question of cases) {
    const work = componentWork(question, correctState(question));
    assert.equal(browserGrade(question, work).isCorrect, true, `${question.mode}: shared grader`);
    const path = gradeDataModelingResponse(buildDataModelingPrivateDefinition(question), JSON.parse(JSON.stringify(work)));
    assert.equal(path.isCorrect, true, `${question.mode}: Path grader reads the same keys`);
  }
});

/* ------------------------- component wiring ------------------------- */

test('the lab\'s Check grades only through the shared grader and submits no answer key', () => {
  assert.match(COMPONENT, /import dataModelingGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/dataModelingLab\.mjs';/);
  assert.match(COMPONENT, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  const checkStart = COMPONENT.indexOf('const check = () => {');
  assert.notEqual(checkStart, -1);
  const check = COMPONENT.slice(checkStart, COMPONENT.indexOf('\n  };', checkStart));
  assert.match(check, /const result = gradeToolCheck\(dataModelingGrader, questionData, work\);/);
  assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode, parts: result\.parts \}\);/);
  // No verdict of its own and no key material in the submission.
  assert.doesNotMatch(check, /expected|regression|descriptor|Tolerance|score ===|results\./);
  for (const gone of [/const expectedPrediction\b/, /const expectedModelId\b/, /const requiredParts\b/, /fitCoefficientTolerance/, /correlationDescriptor/]) {
    assert.doesNotMatch(COMPONENT, gone, `${gone} — the verdict lives in the shared grader`);
  }
  // Feedback lists the parts the grader marked wrong.
  assert.match(COMPONENT, /const missed = parts\.filter\(\(part\) => !part\.isCorrect\)\.map\(\(part\) => part\.id\);/);
});

test('the lab reports and submits the same raw work, in the shape the grader reads', () => {
  const start = COMPONENT.indexOf('const fitWork =');
  assert.notEqual(start, -1);
  const block = COMPONENT.slice(start, COMPONENT.indexOf('const check = () => {', start));
  assert.match(block, /\{ a: quadraticA, b: quadraticB, c: quadraticC \}/);
  assert.match(block, /\{ a: exponentialA, base: exponentialBase \}/);
  assert.match(block, /\{ a: squareRootA, h: squareRootH, k: squareRootK \}/);
  assert.match(block, /: \{ m, b \};/);
  assert.match(block, /dataModelingRequiredParts\(mode, questionData\)\.includes\('fit'\) \? fitWork : \{\}/);
  for (const field of ['r: correlationEntry', 'direction', 'strength', 'causation', 'modelChoice', 'predictionX', 'predictionY', 'predictionType']) {
    assert.match(block, new RegExp(`\\n\\s*${field},\\n`), `${field} is in the work`);
  }
  // Raw values: a cleared box must not become 0 on the way to the grader.
  assert.doesNotMatch(block, /Number\(/);
  assert.match(block, /useReportToolWork\(work\);/);
  // The read-only prediction target is the plan's, the same one the grader uses.
  assert.match(COMPONENT, /const fixedPredictionTarget = dataModelingFixedPredictionTarget\(mode, questionData\);/);
  assert.match(COMPONENT, /readOnly=\{fixedPredictionTarget\}/);
  // The lab shows its prediction-type select exactly when the grader checks it.
  assert.match(COMPONENT, /const asksPredictionType = !lineFitPrediction;/);
  assert.equal(FIT_PREDICTION_MODELS.constructor, undefined, 'mode lookups have no prototype');
});
