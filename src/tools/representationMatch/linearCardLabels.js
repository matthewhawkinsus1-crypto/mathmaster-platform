/*
 * WHAT A LINEAR CARD IS CALLED, WHEREVER A STUDENT READS IT.
 *
 * The same words name a card on the board, in its accessible name, and in the
 * solution review shown once the question has closed
 * (src/tools/shared/toolSolutionReview.js). One map, so the review can never
 * call a card something the board did not.
 */
export const LINEAR_KIND_LABELS = Object.freeze({
  slopeIntercept: 'Slope-intercept equation',
  factoredLinear: 'Factored form',
  pointSlope: 'Point-slope equation',
  standard: 'Standard-form equation',
  graph: 'Graph',
  slope: 'Slope',
  point: 'Point',
  xIntercept: 'x-intercept',
  yIntercept: 'y-intercept',
  context: 'Situation',
  table: 'Table',
});

/** The window a graph card is drawn in when the question names none. */
export const DEFAULT_LINEAR_GRAPH_BOUNDS = Object.freeze({ xMin: -8, xMax: 8, yMin: -8, yMax: 8 });
