/*
 * Shared grader for the `dataModelingLab` registry tool — run by the browser
 * tool for its feedback, by QuestionEngine for the recorded verdict, and by
 * the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from DataModelingLab.jsx's Check handler:
 *
 *   - the same points (the authored pairs, or the lab's demonstration set),
 *     regression, candidate families, best family by `modelMetric`, and r;
 *   - the same required parts per mode, each an equal share of the score, and
 *     correct only when every part is;
 *   - the same tolerances: stepper fits (`full`, `lineFit`) use the steppers'
 *     own default tolerances, typed lines max(0.2, 12% of |m|) and 0.8, the
 *     forced families their per-coefficient floors, r 0.03, and a prediction
 *     max(0.5, 8% of the expected value) — each replaced by the question's
 *     authored tolerance exactly as the lab reads it;
 *   - the same parsing: a box counts as answered only when parseNumericAnswer
 *     reads a number from it, so a cleared box is blank, never 0.
 *
 * Completeness (what a deadline may submit for the student) is every graded
 * input present AND not the lab's untouched starting state. The steppers, the
 * association selects and the model-family radio all start filled, so an
 * association or model-family question the student only opened would
 * otherwise be complete — and, whenever the pre-selected choice happens to be
 * right, auto-submitted as correct. An explicit Check of untouched work is
 * still graded exactly as before.
 *
 * Nothing here reads a value the browser computed: the work is the lab's raw
 * inputs, and every expected value is recomputed from the question.
 */
import declaration from '../declarations/dataModelingLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { correlation, linearRegression, parseNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  predictionKind,
} from '../../toolMath/dataModeling/dataModelingMath.mjs';
import {
  DATA_MODELING_MODES,
  DATA_MODELING_UNRECOGNIZED_MODE,
  FORCED_FIT_MODELS,
  dataModelingFixedPredictionTarget,
  dataModelingPoints,
  dataModelingRequiredParts,
  dataModelingStartingWork,
  exploratoryLineFitPlan,
  lineFitNamesPrediction,
} from '../../toolMath/dataModeling/dataModelingPlan.mjs';

const entry = (value) => (value === null || value === undefined ? '' : String(value));
const filled = (value) => entry(value).trim() !== '';
const answered = (value) => parseNumericAnswer(value) != null;

// An authored coefficient tolerance wins (even 0); otherwise the larger of a
// floor and a share of the expected coefficient.
const fitCoefficientTolerance = (expected, authored, floor, relative = 0.05) => {
  const explicit = Number(authored);
  if (Number.isFinite(explicit)) return Math.abs(explicit);
  const value = Number(expected);
  return Number.isFinite(value) ? Math.max(floor, Math.abs(value) * relative) : floor;
};

const within = (answer, expected, tolerance) => Math.abs(Number(answer) - Number(expected)) <= tolerance;

// The work keys of the fitted function, by the family the mode names (a line
// otherwise).
const FIT_KEYS = Object.freeze({
  quadratic: ['a', 'b', 'c'],
  exponential: ['a', 'base'],
  squareRoot: ['a', 'h', 'k'],
  linear: ['m', 'b'],
});
const fitKeys = (mode) => FIT_KEYS[FORCED_FIT_MODELS[mode] || 'linear'];

/*
 * The fitted function, read in the family the mode names. The work keeps the
 * keys the lab has always sent (My Math Path's grader reads the same ones), so
 * `a`/`b`/`c` are a quadratic's coefficients in a quadratic mode, and `m`/`b`
 * the line's slope and intercept wherever the model is a line.
 */
const fitPart = (question, work, mode, { regression, expectedModel, stepperPlan }) => {
  const family = FORCED_FIT_MODELS[mode];
  const expected = expectedModel?.model || {};
  if (family === 'quadratic') {
    const complete = [work.a, work.b, work.c].every(answered);
    return {
      complete,
      correct: complete
        && within(work.a, expected.a, fitCoefficientTolerance(expected.a, question.quadraticATolerance, 0.03))
        && within(work.b, expected.b, fitCoefficientTolerance(expected.b, question.quadraticBTolerance, 0.08))
        && within(work.c, expected.c, fitCoefficientTolerance(expected.c, question.quadraticCTolerance, 0.2)),
      response: `a = ${entry(work.a)}, b = ${entry(work.b)}, c = ${entry(work.c)}`,
    };
  }
  if (family === 'exponential') {
    const complete = [work.a, work.base].every(answered);
    return {
      complete,
      correct: complete
        && within(work.a, expected.a, fitCoefficientTolerance(expected.a, question.exponentialATolerance, 0.08))
        && within(work.base, expected.base, fitCoefficientTolerance(expected.base, question.exponentialBaseTolerance, 0.02, 0.03)),
      response: `a = ${entry(work.a)}, base = ${entry(work.base)}`,
    };
  }
  if (family === 'squareRoot') {
    const complete = [work.a, work.h, work.k].every(answered);
    return {
      complete,
      correct: complete
        && within(work.a, expected.a, fitCoefficientTolerance(expected.a, question.squareRootATolerance, 0.05))
        && within(work.h, expected.h, fitCoefficientTolerance(expected.h, question.squareRootHTolerance, 0.05, 0.02))
        && within(work.k, expected.k, fitCoefficientTolerance(expected.k, question.squareRootKTolerance, 0.08, 0.03)),
      response: `a = ${entry(work.a)}, h = ${entry(work.h)}, k = ${entry(work.k)}`,
    };
  }
  // A line. The stepper fits (`full`, `lineFit`) are judged with the
  // steppers' own tolerances; a typed line with the typed-fit ones.
  const slopeTolerance = Number(question.slopeTolerance ?? (stepperPlan ? stepperPlan.slope.tolerance : Math.max(0.2, Math.abs(regression.m) * 0.12)));
  const interceptTolerance = Number(question.interceptTolerance ?? (stepperPlan ? stepperPlan.intercept.tolerance : 0.8));
  const slope = parseNumericAnswer(work.m);
  const intercept = parseNumericAnswer(work.b);
  return {
    complete: slope != null && intercept != null,
    correct: slope != null && intercept != null
      && Math.abs(slope - regression.m) <= slopeTolerance
      && Math.abs(intercept - regression.b) <= interceptTolerance,
    response: `m = ${entry(work.m)}, b = ${entry(work.b)}`,
  };
};

const PART_LABELS = Object.freeze({
  fit: 'Fitted function',
  correlation: 'Correlation coefficient r',
  correlationInterpretation: 'Direction and strength',
  association: 'Association and causation',
  modelChoice: 'Model family',
  prediction: 'Prediction',
});

const gradeMode = (mode) => (question, work) => {
  const points = dataModelingPoints(question);
  const regression = linearRegression(points);
  const candidateModels = buildCandidateModels(points, regression);
  const bestModel = chooseBestModel(candidateModels, question.modelMetric || 'rmse');
  const r = correlation(points);
  const descriptor = correlationDescriptor(r);
  // A mode that names a family grades that family; otherwise the authored
  // family, or the best fit by the question's metric.
  const expectedModelId = FORCED_FIT_MODELS[mode] || question.expectedModel || bestModel?.id || 'linear';
  const expectedModel = candidateModels.find((candidate) => candidate.id === expectedModelId) || candidateModels[0];

  const lineFitPrediction = lineFitNamesPrediction(mode, question);
  const fixedTarget = dataModelingFixedPredictionTarget(mode, question);
  // A line fit's prediction is not classified; every other prediction is.
  const asksPredictionType = !lineFitPrediction;

  // The steppers of a hand-fit line: their default tolerances and the line
  // they start on — the same plan the lab sizes them from.
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const stepperPlan = mode === 'lineFit' || mode === 'full'
    ? exploratoryLineFitPlan({
      targetSlope: regression.m,
      targetIntercept: regression.b,
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
      slopeTolerance: question.slopeTolerance,
      interceptTolerance: question.interceptTolerance,
      slopeStep: question.slopeStep,
      interceptStep: question.interceptStep,
      challengeClicks: question.fitChallengeClicks,
    })
    : null;

  const interpretation = () => ({
    complete: filled(work.direction) && filled(work.strength),
    correct: work.direction === descriptor.direction && work.strength === descriptor.strength,
    response: `${entry(work.direction)}, ${entry(work.strength)}`,
  });

  const checks = {
    fit: () => fitPart(question, work, mode, { regression, expectedModel, stepperPlan }),
    correlationInterpretation: interpretation,
    association: () => {
      const read = interpretation();
      return {
        complete: read.complete && filled(work.causation),
        correct: read.correct && work.causation === (question.causationSupported ? 'causation' : 'association'),
        response: `${read.response}, ${entry(work.causation)}`,
      };
    },
    correlation: () => {
      const entered = parseNumericAnswer(work.r);
      const tolerance = Number(question.correlationTolerance ?? 0.03);
      return {
        complete: entered != null,
        correct: entered != null && Math.abs(entered - r) <= tolerance,
        response: entry(work.r),
      };
    },
    modelChoice: () => ({
      complete: filled(work.modelChoice),
      correct: work.modelChoice === expectedModelId,
      response: entry(work.modelChoice),
    }),
    prediction: () => {
      // An authored target is the question's own x, shown read-only, so it is
      // graded at that x whatever x the work names. Otherwise x is the
      // student's choice, and a cleared x box reads as 0, as the lab reads it.
      // A null x is the lab's NaN after JSON (its default x when a plotted x
      // is not a number): NaN, which the lab never marked correct — not
      // Number(null), which is 0.
      const studentX = work.predictionX === null ? Number.NaN : work.predictionX;
      const predictionX = fixedTarget ? question.predictionX : studentX;
      const expectedPrediction = lineFitPrediction
        // A line-fit prediction is made with a LINEAR model, whatever family
        // happens to fit these points best.
        ? regression.m * Number(predictionX) + regression.b
        : (expectedModel?.predict || (() => Number.NaN))(Number(predictionX));
      const expectedType = predictionKind(points, predictionX);
      const tolerance = Number(question.predictionTolerance ?? Math.max(0.5, Math.abs(expectedPrediction) * 0.08));
      const predicted = parseNumericAnswer(work.predictionY);
      return {
        complete: predicted != null
          && (!asksPredictionType || filled(work.predictionType))
          && (fixedTarget || filled(work.predictionX)),
        correct: predicted != null && Number.isFinite(expectedPrediction)
          && Math.abs(predicted - expectedPrediction) <= tolerance
          && (!asksPredictionType || work.predictionType === expectedType),
        response: `x = ${entry(fixedTarget ? question.predictionX : work.predictionX)}, y = ${entry(work.predictionY)}${asksPredictionType ? `, ${entry(work.predictionType)}` : ''}`,
      };
    },
  };

  const requiredParts = dataModelingRequiredParts(mode, question);
  const parts = requiredParts.map((id) => {
    const result = checks[id]();
    return { id, label: PART_LABELS[id], isComplete: result.complete, isCorrect: result.correct === true, response: result.response };
  });
  const correctCount = parts.filter((part) => part.isCorrect).length;

  // Every input the graded parts read, and whether each still holds the
  // lab's starting value.
  const gradedKeys = new Set(requiredParts.flatMap((id) => ({
    fit: fitKeys(mode),
    association: ['direction', 'strength', 'causation'],
    correlationInterpretation: ['direction', 'strength'],
    correlation: ['r'],
    modelChoice: ['modelChoice'],
    prediction: [
      'predictionY',
      ...(asksPredictionType ? ['predictionType'] : []),
      ...(fixedTarget ? [] : ['predictionX']),
    ],
  })[id]));
  const start = dataModelingStartingWork(mode, question, { xs, regression, stepperPlan });
  const untouched = [...gradedKeys].every((key) => entry(work[key]) === entry(start[key]));

  return gradedResult({
    parts,
    // Complete: every graded input present, and not the untouched lab.
    isComplete: parts.every((part) => part.isComplete) && !untouched,
    // The lab's verdict: correct when every part is, scored as the share of
    // correct parts. Completeness is reported, not required — an explicit
    // Check on a half-finished (or untouched) lab is still marked, while a
    // deadline submits only complete work.
    isCorrect: correctCount === parts.length,
    score: correctCount / parts.length,
  });
};

export default bindToolGrader(declaration, 'dataModelingLab', Object.fromEntries(
  [...DATA_MODELING_MODES, DATA_MODELING_UNRECOGNIZED_MODE].map((mode) => [mode, gradeMode(mode)]),
));
