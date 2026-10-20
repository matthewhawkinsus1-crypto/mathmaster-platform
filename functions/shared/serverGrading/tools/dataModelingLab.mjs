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
 * input present AND not the lab's untouched starting state. The steppers
 * start filled, so a line fit the student only opened would otherwise be
 * complete. Every judgment — direction, strength, causation, model family,
 * prediction type — opens unanswered ('' — "Choose…", judgmentChoices.mjs):
 * unanswered is never filled and never matches a key, so it is neither
 * complete nor correct. Before that change the lab pre-selected positive /
 * moderate / association / linear / interpolation, and work an earlier client
 * saved at that start (a draft or checkpoint revision, say after Undo) still
 * holds them; such work that holds them in every graded input is untouched
 * too, so a deadline never submits it — or credits it whenever a pre-selection
 * happens to be right. Work from today's lab says its choices are the
 * student's own (OWN_CHOICES, judgmentChoices.mjs), so a student who chose
 * exactly those options is graded like any other. An explicit Check of
 * untouched work is still graded exactly as before.
 *
 * Nothing here reads a value the browser computed: the work is the lab's raw
 * inputs, and every expected value is recomputed from the question.
 */
import declaration from '../declarations/dataModelingLab.mjs';
import { bindToolGrader, toolModeSupport } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { correlation, linearRegression, parseNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import { choicesAreOwn } from '../../toolMath/shared/judgmentChoices.mjs';
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
  const slopeHolds = slope != null && Math.abs(slope - regression.m) <= slopeTolerance;
  const interceptHolds = intercept != null && Math.abs(intercept - regression.b) <= interceptTolerance;
  return {
    complete: slope != null && intercept != null,
    correct: slope != null && intercept != null && slopeHolds && interceptHolds,
    response: `m = ${entry(work.m)}, b = ${entry(work.b)}`,
    // Which half missed, for the screen's reason (missReason below).
    holds: slope != null && intercept != null ? { slope: slopeHolds, intercept: interceptHolds } : null,
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

/*
 * WHAT IN A MISSED PART HELD (student pass 3, wave 7; FEEDBACK_REASONS
 * survey row 5). "Still to fix: the fitted function" folded a right slope
 * with a wrong intercept into one line. Each phrase replaces the part's name
 * in that line and says which half to change; it names no value. A part with
 * both halves wrong, or a box left blank, keeps its name.
 */
const MISS_REASONS = Object.freeze({
  fit: { slope: 'the intercept b (your slope m is close enough)', intercept: 'the slope m (your intercept b is close enough)' },
  association: { interpretation: 'the causation choice (your direction and strength are right)', causation: 'the direction and strength (your causation choice is right)' },
  prediction: { value: 'the prediction type, interpolation or extrapolation (your predicted value is close enough)', type: 'the predicted value (your interpolation or extrapolation choice is right)' },
});

// The half that held names the other as the one to change.
const missReason = (id, holds) => {
  if (!holds || !MISS_REASONS[id]) return '';
  const held = Object.entries(holds).filter(([, ok]) => ok).map(([half]) => half);
  return held.length === 1 ? MISS_REASONS[id][held[0]] || '' : '';
};

const gradeMode = (mode) => (question, work, options = {}) => {
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
      const causationHolds = work.causation === (question.causationSupported ? 'causation' : 'association');
      const complete = read.complete && filled(work.causation);
      return {
        complete,
        correct: read.correct && causationHolds,
        response: `${read.response}, ${entry(work.causation)}`,
        holds: complete ? { interpretation: read.correct, causation: causationHolds } : null,
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
      const complete = predicted != null
        && (!asksPredictionType || filled(work.predictionType))
        && (fixedTarget || filled(work.predictionX));
      const valueHolds = predicted != null && Number.isFinite(expectedPrediction)
        && Math.abs(predicted - expectedPrediction) <= tolerance;
      const typeHolds = !asksPredictionType || work.predictionType === expectedType;
      return {
        complete,
        correct: valueHolds && typeHolds,
        response: `x = ${entry(fixedTarget ? question.predictionX : work.predictionX)}, y = ${entry(work.predictionY)}${asksPredictionType ? `, ${entry(work.predictionType)}` : ''}`,
        holds: complete && asksPredictionType ? { value: valueHolds, type: typeHolds } : null,
      };
    },
  };

  const requiredParts = dataModelingRequiredParts(mode, question);
  const results = requiredParts.map((id) => [id, checks[id]()]);
  const parts = results.map(([id, result]) => ({ id, label: PART_LABELS[id], isComplete: result.complete, isCorrect: result.correct === true, response: result.response }));
  // The screen's reasons (browser only; see dataModelingMissReasons). The
  // part records, the score and the verdict below never read them.
  if (options.missReasons) {
    return Object.fromEntries(results
      .filter(([, result]) => result.correct !== true)
      .map(([id, result]) => [id, missReason(id, result.holds)])
      .filter(([, reason]) => reason));
  }
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
  const holdsEveryGradedInput = (start) => [...gradedKeys].every((key) => entry(work[key]) === entry(start[key]));
  const untouched = holdsEveryGradedInput(dataModelingStartingWork(mode, question, { xs, regression, stepperPlan }))
    || (!choicesAreOwn(work)
      && holdsEveryGradedInput(dataModelingStartingWork(mode, question, { xs, regression, stepperPlan, preselected: true })));

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

const dataModelingGrader = bindToolGrader(declaration, 'dataModelingLab', Object.fromEntries(
  // Two arguments: the server's grade never asks for the screen's reasons.
  [...DATA_MODELING_MODES, DATA_MODELING_UNRECOGNIZED_MODE].map((mode) => [mode, (question, work) => gradeMode(mode)(question, work)]),
));

/**
 * The browser's reasons for the parts this work missed, `{ [partId]: phrase }`
 * (MISS_REASONS), for the lab's "Still to fix" line. Same mode, same checks
 * as the grade; nothing on the server calls it.
 */
export const dataModelingMissReasons = (question = {}, work = {}) => {
  const support = toolModeSupport(declaration, question);
  if (!support.supported || !work || typeof work !== 'object') return {};
  try {
    return gradeMode(support.mode)(question, work, { missReasons: true }) || {};
  } catch {
    return {};
  }
};

export default dataModelingGrader;
