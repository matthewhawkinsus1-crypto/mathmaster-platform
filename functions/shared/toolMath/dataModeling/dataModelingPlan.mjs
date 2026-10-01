/*
 * WHAT A DATA MODELING QUESTION ASKS FOR.
 *
 * Pure and import-free. DataModelingLab.jsx reads it to decide what to show,
 * the grading declaration (which sits in the student app's main bundle) reads
 * the mode catalog, and the shared grader
 * (functions/shared/serverGrading/tools/dataModelingLab.mjs) reads the rest —
 * so the screen, the mode the server grades and the parts it checks come from
 * one definition.
 *
 * BEYOND ITS MODE:
 *
 * `lineFit` is the hand-fit mode: slope and intercept steppers and a residual
 * plot. Authored questions also use it with a prediction target — "use the
 * regression calculator to find a linear model and use it to predict the score
 * for 7 hours" carries `predictionX: 7` and a `predictionTolerance` — and the
 * lab dropped the prediction on the floor: there was no field for it and it
 * was never graded (live QA, Algebra I DOL #2, Classwork Q6 and Practice Q10).
 *
 * A line fit that names a prediction target asks for the prediction. It does
 * not ask the student to classify it as interpolation or extrapolation — the
 * `*FitPrediction` modes do that, and their prompts say so.
 */

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

export const lineFitNamesPrediction = (mode, questionData = {}) => (
  mode === 'lineFit' && hasValue(questionData?.predictionX)
);

/**
 * lineFit begins as a student estimate, then may expose linear-regression
 * technology in the SAME workspace. The semantic fitDataModel action is the
 * signal that technology/model fitting is part of the authored task; no prompt
 * text or assignment title is inspected.
 */
export const lineFitUsesRegressionTechnology = (mode, questionData = {}) => (
  mode === 'lineFit'
  && Array.isArray(questionData?.studentActions)
  && questionData.studentActions.includes('fitDataModel')
);

/**
 * Number the panels a student can actually see, in order. Fixed numbers left a
 * line-fit question reading "1 · Scatter plot" then "3 · Residual evidence".
 */
export const numberVisiblePanels = (panels) => {
  const numbers = {};
  let next = 1;
  for (const [id, visible] of panels) {
    if (visible) {
      numbers[id] = next;
      next += 1;
    }
  }
  return numbers;
};

/*
 * THE LAB'S MODES, AND THE MODEL FAMILY EACH ONE NAMES.
 *
 * Null-prototype lookups, so a mode spelled like an Object method
 * ("constructor") is simply an unrecognized mode everywhere, rather than a
 * truthy prototype function in one reader and nothing in another.
 */
const lookup = (entries) => Object.freeze(Object.assign(Object.create(null), entries));

export const FIT_ONLY_MODELS = lookup({
  linearFit: 'linear',
  quadraticFit: 'quadratic',
  exponentialFit: 'exponential',
});

export const FIT_PREDICTION_MODELS = lookup({
  linearFitPrediction: 'linear',
  quadraticFitPrediction: 'quadratic',
  exponentialFitPrediction: 'exponential',
  squareRootFitPrediction: 'squareRoot',
});

export const FORCED_FIT_MODELS = lookup({
  ...FIT_ONLY_MODELS,
  ...FIT_PREDICTION_MODELS,
});

/** Every mode the lab renders a dedicated view for (src/tools/toolSchemas.js accepts exactly these). */
export const DATA_MODELING_MODES = Object.freeze([
  'full',
  'lineFit',
  ...Object.keys(FIT_ONLY_MODELS),
  ...Object.keys(FIT_PREDICTION_MODELS),
  'association',
  'correlation',
  'prediction',
  'modelCompare',
]);

/*
 * A MODE THE LAB DOES NOT RECOGNISE IS NOT THE FULL LAB.
 *
 * `questionData.mode || 'full'` only replaces a MISSING mode. Any other string
 * keeps its name, so every panel test fails: no answer control is shown, the
 * fit tolerances are the typed-fit ones rather than the stepper ones, and Check
 * grades the full lab's four parts on the lab's starting values. The server has
 * to grade that screen, not the full lab, so it is a mode of its own.
 */
export const DATA_MODELING_UNRECOGNIZED_MODE = 'unrecognized';

const KNOWN_MODES = new Set(DATA_MODELING_MODES);

/** The view DataModelingLab.jsx renders for this question. */
export const resolveDataModelingMode = (question = {}) => {
  const mode = question?.mode || 'full';
  return typeof mode === 'string' && KNOWN_MODES.has(mode) ? mode : DATA_MODELING_UNRECOGNIZED_MODE;
};

/** The lab's demonstration data, plotted when a question authors no points. */
export const DATA_MODELING_DEFAULT_POINTS = Object.freeze([[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]]);

/** The points the lab plots and models: `[x, y]` pairs, `{x, y}` objects read as numbers. */
export const dataModelingPoints = (question = {}) => (question?.points || DATA_MODELING_DEFAULT_POINTS).map((pair) => (
  Array.isArray(pair) ? pair : [Number(pair?.x), Number(pair?.y)]
));

/**
 * The parts one Check grades, in the order the lab reports them. Each part is
 * an equal share of the score.
 */
export const dataModelingRequiredParts = (mode, questionData = {}) => {
  if (mode === 'lineFit' || FIT_ONLY_MODELS[mode]) return lineFitNamesPrediction(mode, questionData) ? ['fit', 'prediction'] : ['fit'];
  if (FIT_PREDICTION_MODELS[mode]) return ['fit', 'prediction'];
  if (mode === 'association') return ['association'];
  if (mode === 'correlation') return ['correlation', 'correlationInterpretation'];
  if (mode === 'prediction') return ['prediction'];
  if (mode === 'modelCompare') return ['modelChoice'];
  return ['fit', 'association', 'modelChoice', 'prediction'];
};

/**
 * Is the prediction target the question's own x (shown read-only), rather than
 * an x the student chooses?
 */
export const dataModelingFixedPredictionTarget = (mode, questionData = {}) => Boolean(
  (FIT_PREDICTION_MODELS[mode] || lineFitNamesPrediction(mode, questionData))
  && questionData?.predictionX !== undefined
  && questionData?.predictionX !== null,
);

const tidy = (value) => Number(Number(value).toPrecision(12));

/**
 * The default slope and intercept tolerances of a stepper-driven line fit
 * (`full` and `lineFit`) when the question authors none.
 *
 * Exactly what src/platform/graph/graphScaleService.js `fitAdjustmentPlan`
 * returns as `slope.tolerance` / `intercept.tolerance`; that plan sizes the
 * steppers from them, so a student who steps onto the regression line is inside
 * the tolerance the grader applies. The plan lives in src/, which a Cloud
 * Function cannot import, so tests/tools/dataModelingLabSharedGrading.test.mjs
 * pins the two to each other.
 */
export const exploratoryLineFitTolerances = ({ targetSlope, xMin, xMax, yMin, yMax } = {}) => {
  const m = Number(targetSlope);
  const safeSlope = Number.isFinite(m) ? m : 0;
  const xSpan = Math.max(Math.abs(Number(xMax) - Number(xMin)), Number.EPSILON);
  const ySpan = Math.max(Math.abs(Number(yMax) - Number(yMin)), Number.EPSILON);
  const naturalSlope = ySpan / xSpan;
  return {
    slope: tidy(tidy(Math.max(0.01, naturalSlope * 0.08, Math.abs(safeSlope) * 0.06))),
    intercept: tidy(tidy(Math.max(0.1, ySpan * 0.06))),
  };
};
