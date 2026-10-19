/*
 * WHAT A LINEAR CARD IS CALLED, WHEREVER A STUDENT READS IT.
 *
 * The same words name a card on the board, in its accessible name, and in the
 * solution review shown once the question has closed
 * (src/tools/shared/toolSolutionReview.js). One map, so the review can never
 * call a card something the board did not.
 */
import { describeLinearCard } from '../../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import { spokenMathLabel } from '../../platform/language/mathSpeechLabel.js';

const POINT_KINDS = new Set(['point', 'xIntercept', 'yIntercept']);

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

/**
 * A card's spoken name: its kind, then what it says, in words (A11Y-3): "Slope-
 * intercept equation: y equals negative 2 over 3 x plus 4". A point card's kind
 * already says what it is, so its coordinates are not called "the point" a
 * second time: "x-intercept: 2, 0", not "x-intercept: the point 2, 0" (pass 3,
 * TOOL-7).
 */
export const spokenLinearCard = (card, { bounds = null } = {}) => {
  if (!card) return '';
  const spoken = spokenMathLabel(describeLinearCard(card, { bounds }));
  const words = POINT_KINDS.has(card.kind) ? spoken.replace(/^the point\s+/i, '') : spoken;
  return `${LINEAR_KIND_LABELS[card.kind] || card.kind}: ${words}`;
};
