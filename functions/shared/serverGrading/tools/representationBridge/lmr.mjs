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
 *
 * PROCESS MODE (`interactionMode: "process"`). The key-fact cards — slope,
 * x-intercept, y-intercept, two points — are not read from boxes at all. The
 * work carries the student's process log (`processLog`), and
 * scoreLinearMultipleRepresentationsProcess re-marks every piece of it against
 * THIS question: a fact counts only when valid work from a method this board
 * offers established it, and only if it is right. A representation the
 * student's facts had not opened is marked as empty. Everything else — the
 * validators, the context, the consistency check, equal weighting — is the
 * Worksheet board's scoring, run on the board the student earned. Each fact
 * part's response names the method ("2 — Graph → rise/run between two
 * points"), so a teacher reads how a fact was established, not just that it
 * was.
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
import { isProcessModeQuestion } from '../../../toolMath/representationBridge/lmrProcessModel.mjs';
import {
  establishedPoints,
  methodLabelFor,
  processFactText,
  processPartResponse,
  scoreLinearMultipleRepresentationsProcess,
  unfinishedLinearMultipleRepresentationsProcessParts,
} from '../../../toolMath/representationBridge/lmrProcessVerify.mjs';

const CONSISTENCY_PART = 'crossRepresentationConsistency';
const GRAPH_FIELDS = Object.freeze(['graph1Points', 'graph2Points', 'graph3Points']);
const WORK_FIELDS = Object.freeze([
  'standardFormEquation', 'slopeInterceptEquation', 'pointSlopeEquation',
  'featureSlope', 'featureXIntercept', 'featureYIntercept', 'featurePoint1', 'featurePoint2',
  'tableRows', ...GRAPH_FIELDS,
  'contextIndependent', 'contextDependent', 'contextSlopeMeaning',
  'contextYInterceptMeaning', 'contextXInterceptMeaning', 'contextDomain',
  // Process Mode: the student's process evidence. Read only for a question
  // in Process Mode; a Worksheet question never looks at it.
  'processLog',
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

// How each fact was established, in a teacher's words — the evidence a
// gradebook keeps beside the verdict. Labels only: no ids, no answer key.
const FACT_LABELS = Object.freeze({ slope: 'Slope', yIntercept: 'y-intercept', xIntercept: 'x-intercept', siEquation: 'Slope-intercept form from their algebra' });
const processDetail = (scored) => {
  const process = scored?.process;
  if (!process) return null;
  const facts = Object.entries(FACT_LABELS)
    .filter(([fact]) => process.facts?.[fact])
    .map(([fact, label]) => ({ label, response: processPartResponse(scored, fact) || '', method: methodLabelFor(process.facts[fact]), verified: process.facts[fact].correct === true, tries: process.facts[fact].tries || 0 }));
  const points = establishedPoints(process).map((record) => ({ label: 'Point on the line', response: processFactText(record), method: methodLabelFor(record), verified: record.correct === true }));
  return { interactionMode: 'process', stale: process.stale === true, facts, points, locked: (scored.locked || []).map((cardId) => PART_LABELS[CARD_PART_KEYS[cardId]] || cardId) };
};

const linearMultipleRepresentations = (question, work) => {
  const board = readBoardWork(work);
  const processMode = isProcessModeQuestion(question);
  const scored = processMode ? scoreLinearMultipleRepresentationsProcess(question, board) : scoreLinearMultipleRepresentations(question, board);
  const partIds = Object.keys(scored.parts || {});
  // No line can be derived from the question's source, so there is nothing to
  // mark against — not "incorrect".
  if (scored.error || !partIds.length) return { graded: false, reason: scored.error ? 'invalid-question' : 'no-graded-parts' };

  // In Process Mode the board that counts is the one the student EARNED:
  // established facts in the fact cards, nothing in a card no fact opened.
  const shown = processMode ? scored.board : board;
  const unfinished = new Set(processMode
    ? unfinishedLinearMultipleRepresentationsProcessParts(question, board, scored)
    : unfinishedLinearMultipleRepresentationsParts(question, board));
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
      response: (processMode ? processPartResponse(scored, id) : null) ?? partResponse(id, shown),
    })),
    isComplete: unfinished.size === 0,
    isCorrect: scored.isCorrect === true,
    score: scored.score,
    ...(processMode ? { detail: processDetail(scored) } : {}),
  });
};

export default {
  linearMultipleRepresentations,
};
