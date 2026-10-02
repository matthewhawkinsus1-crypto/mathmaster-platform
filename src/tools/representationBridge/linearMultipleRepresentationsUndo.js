/*
 * WHOLE-BOARD UNDO FOR THE MULTIPLE REPRESENTATIONS BOARD (PQ-009).
 *
 * The board is one answer built in eleven cards: three equations, four key
 * features, a table, three graphs and, for a story, six meanings. The platform
 * Undo takes back the student's last edit anywhere on it, one step at a time,
 * through the shared `useMathUndoHistory` stack. This module is the part of that
 * which is about the board, kept out of the component so node can test it:
 *
 *   WHAT IS IN THE HISTORY. The mathematics and nothing else. `checkedCards`
 *   records which work the student pressed Check on — a verdict is recomputed
 *   from it — so a snapshot that carried it would let Undo un-check a card, or
 *   bring back "✓ Correct" for work that was never checked. `expandedCards` is
 *   presentation. Neither is in `BOARD_UNDO_FIELDS`, so neither can be
 *   restored or erased by an Undo.
 *
 *   WHERE A CHANGE IS. One Undo for the whole board can change a card the
 *   student is not looking at — a folded panel, a graph below the fold — and
 *   then they see nothing happen. Every field maps to the card that shows it,
 *   so the board can open it, bring it into view and say what changed.
 *
 * Pure: no React, no DOM.
 */
import { mathematicalSnapshot } from '../../platform/workView/mathUndoStack.js';
import { CARD_PART_KEYS, PART_LABELS } from './linearMultipleRepresentationsMath.js';

/*
 * Field → the card that shows it, and the board's open/closed key for the
 * panel (or graph card) that card sits in. In board order, which is also the
 * order changes are named in.
 */
const FIELD_PLACES = Object.freeze({
  standardFormEquation: { cardId: 'standardForm', expandKey: 'equationForms' },
  slopeInterceptEquation: { cardId: 'slopeIntercept', expandKey: 'equationForms' },
  pointSlopeEquation: { cardId: 'pointSlope', expandKey: 'equationForms' },
  featureSlope: { cardId: 'slope', expandKey: 'features' },
  featureXIntercept: { cardId: 'xIntercept', expandKey: 'features' },
  featureYIntercept: { cardId: 'yIntercept', expandKey: 'features' },
  featurePoint1: { cardId: 'twoPoints', expandKey: 'features' },
  featurePoint2: { cardId: 'twoPoints', expandKey: 'features' },
  tableRows: { cardId: 'table', expandKey: 'table' },
  graph1Points: { cardId: 'graphIntercepts', expandKey: 'graph1' },
  graph2Points: { cardId: 'graphSlopeIntercept', expandKey: 'graph2' },
  graph3Points: { cardId: 'graphPointSlope', expandKey: 'graph3' },
  contextIndependent: { cardId: 'context', expandKey: 'context' },
  contextDependent: { cardId: 'context', expandKey: 'context' },
  contextSlopeMeaning: { cardId: 'context', expandKey: 'context' },
  contextYInterceptMeaning: { cardId: 'context', expandKey: 'context' },
  contextXInterceptMeaning: { cardId: 'context', expandKey: 'context' },
  contextDomain: { cardId: 'context', expandKey: 'context' },
});

/** Everything a student builds on the board — the whole of what Undo records. */
export const BOARD_UNDO_FIELDS = Object.freeze(Object.keys(FIELD_PLACES));

/** The graph field Graph N's own Undo filters the shared history to. */
export const graphUndoField = (graphKey) => `${graphKey}Points`;

/**
 * The board's mathematical state, in exactly the shape Undo records. Anything
 * else in `response` — a verdict, a fingerprint, which panels are open — is
 * left behind.
 */
export const boardUndoState = (response = {}) => Object.fromEntries(
  BOARD_UNDO_FIELDS.map((field) => [field, response?.[field]]),
);

// The name a student reads for the place a field lives: the card's classroom
// name, and for a meaning the question it answers.
const placeLabel = (field) => {
  const { cardId } = FIELD_PLACES[field];
  return cardId === 'context' ? PART_LABELS[field] : PART_LABELS[CARD_PART_KEYS[cardId]];
};

/** Every board field whose value differs between two states, in board order. */
export const changedBoardFields = (before, after) => (
  before && after
    ? BOARD_UNDO_FIELDS.filter((field) => mathematicalSnapshot(before[field]) !== mathematicalSnapshot(after[field]))
    : []
);

/**
 * The places that differ between two board states, one per card or meaning, in
 * board order: `{ field, cardId, expandKey, label }`. `field` is the first
 * field that changed there (the one to bring into view).
 */
export const boardUndoChanges = (before, after) => {
  const seen = new Set();
  return changedBoardFields(before, after).flatMap((field) => {
    const label = placeLabel(field);
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ field, ...FIELD_PLACES[field], label }];
  });
};

const joinLabels = (changes) => {
  const labels = changes.map((change) => change.label);
  return labels.length <= 1 ? (labels[0] || '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
};

/** What a screen reader hears after an Undo: the place it changed, once. */
export const describeBoardUndo = (changes = []) => (
  changes.length ? `Undid your last change to ${joinLabels(changes)}.` : ''
);

/** The Undo button's title: what the next press will change. */
export const boardUndoTitle = (changes = []) => (
  changes.length ? `Undo your last change to ${joinLabels(changes)}` : 'Undo your last change on this board'
);
