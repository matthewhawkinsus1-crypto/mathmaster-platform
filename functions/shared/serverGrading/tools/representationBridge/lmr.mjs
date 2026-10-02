/*
 * representationBridge — lmr mode graders: { [mode]: (question, work) => result }.
 * Every mode declared SHARED in ../../declarations/representationBridge/lmr.mjs
 * must have a grader here, and no other.
 *
 * THE MULTIPLE REPRESENTATIONS BOARD, MARKED ONCE.
 *
 * The board's Submit, QuestionEngine's recorded verdict and the server all run
 * this function. It owns no mathematics: every verdict — each card, each
 * context meaning, the domain and cross-representation consistency — is
 * scoreLinearMultipleRepresentations, the one definition the board always
 * used, with its validators, tolerances, exact-fraction parsing, Graph 3
 * anchor and requiredCards subset. This file only turns that score into the
 * shared result shape and says which parts are still empty.
 *
 *   score       correct parts / graded parts, all equally weighted (unchanged)
 *   isComplete  every required card has work and every graded context field
 *               is filled — the board's own "parts are still empty" rule
 *               (unfinishedLinearMultipleRepresentationsParts)
 */
import { gradedResult } from '../../gradingResult.mjs';
import {
  CARD_PART_KEYS,
  CARD_RESPONSE_FIELDS,
  LINE_BEARING_CARD_IDS,
  PART_LABELS,
  resolveRequiredCards,
  scoreLinearMultipleRepresentations,
  unfinishedLinearMultipleRepresentationsParts,
} from '../../../toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';

const CONSISTENCY_PART = 'crossRepresentationConsistency';
const GRAPH_FIELDS = Object.freeze(['graph1Points', 'graph2Points', 'graph3Points']);
const WORK_FIELDS = Object.freeze([
  'standardFormEquation', 'slopeInterceptEquation', 'pointSlopeEquation',
  'featureSlope', 'featureXIntercept', 'featureYIntercept', 'featurePoint1', 'featurePoint2',
  'tableRows', ...GRAPH_FIELDS,
  'contextIndependent', 'contextDependent', 'contextSlopeMeaning',
  'contextYInterceptMeaning', 'contextXInterceptMeaning', 'contextDomain',
]);
// part id -> the card that produces it (graph1 -> graphIntercepts, …)
const CARD_FOR_PART = Object.freeze(Object.fromEntries(Object.entries(CARD_PART_KEYS).map(([cardId, partId]) => [partId, cardId])));

/*
 * Only the board's own answer fields are read. A graph is a list of points on
 * the board; anything else in its place (a tampered response) is no points,
 * so it is marked as an empty graph instead of failing the whole board.
 */
const readBoardWork = (work) => {
  const board = {};
  WORK_FIELDS.forEach((field) => {
    if (work[field] !== undefined) board[field] = work[field];
  });
  GRAPH_FIELDS.forEach((field) => {
    board[field] = Array.isArray(board[field]) ? board[field] : [];
  });
  return board;
};

// What the student entered for a part, for the teacher's attempt view.
const partResponse = (partId, board) => {
  const cardId = CARD_FOR_PART[partId];
  if (cardId) {
    const fields = CARD_RESPONSE_FIELDS[cardId] || [];
    return fields.length === 1 ? board[fields[0]] ?? '' : fields.map((field) => board[field] ?? '');
  }
  if (partId === CONSISTENCY_PART) return '';
  return board[partId] ?? '';
};

const linearMultipleRepresentations = (question, work) => {
  const board = readBoardWork(work);
  const scored = scoreLinearMultipleRepresentations(question, board);
  const partIds = Object.keys(scored.parts || {});
  // No line can be derived from the question's source, so there is nothing to
  // mark against — not "incorrect".
  if (scored.error || !partIds.length) return { graded: false, reason: scored.error ? 'invalid-question' : 'no-graded-parts' };

  const unfinished = new Set(unfinishedLinearMultipleRepresentationsParts(question, board));
  const required = resolveRequiredCards(question);
  const linesUnfinished = LINE_BEARING_CARD_IDS
    .filter((cardId) => required.includes(cardId))
    .some((cardId) => unfinished.has(CARD_PART_KEYS[cardId]));

  return gradedResult({
    parts: partIds.map((id) => ({
      id,
      label: PART_LABELS[id] || id,
      // Consistency compares the line-bearing cards, so it is complete when
      // every one of them has work.
      isComplete: id === CONSISTENCY_PART ? !linesUnfinished : !unfinished.has(id),
      isCorrect: scored.parts[id] === true,
      response: partResponse(id, board),
    })),
    isComplete: unfinished.size === 0,
    isCorrect: scored.isCorrect === true,
    score: scored.score,
  });
};

export default {
  linearMultipleRepresentations,
};
