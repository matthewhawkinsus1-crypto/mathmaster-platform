/*
 * WHAT A DATA MODELING QUESTION ASKS FOR, BEYOND ITS MODE.
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
