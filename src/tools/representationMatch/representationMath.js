import { evaluateFunctionSpec, nearlyEqual, round } from '../shared/toolMath.js';
import {
  canonicalFromEquationText,
  canonicalFromPointSlope,
  canonicalFromSlopeIntercept,
  linesEquivalent as canonicalLinesEquivalent,
} from '../shared/linearEquations.js';

export const buildDefaultRepresentationSets = () => ([
  { id: 'linear', equation: 'y = 2x + 1', table: '(0,1), (1,3), (2,5)', context: 'Starts at 1 and increases by 2 each step.', graphSpec: { type: 'linear', a: 2, h: 0, k: 1 } },
  { id: 'quadratic', equation: 'y = x²', table: '(-2,4), (-1,1), (0,0), (1,1)', context: 'Symmetric growth from a minimum at the origin.', graphSpec: { type: 'quadratic', a: 1, h: 0, k: 0 } },
  { id: 'exponential', equation: 'y = 2ˣ', table: '(0,1), (1,2), (2,4), (3,8)', context: 'Doubles for each increase of 1 in x.', graphSpec: { type: 'exponential', a: 1, h: 0, k: 0, base: 2 } },
]);

export const scoreRepresentationMatch = (targetId, selections = {}, kinds = ['equation', 'table', 'context']) => {
  const checks = kinds.map((kind) => selections[kind] === targetId);
  return { checks, score: checks.filter(Boolean).length / Math.max(1, checks.length), isCorrect: checks.every(Boolean) };
};

export const mismatchedRepresentationKinds = (targetId, mixed = {}, kinds = ['equation', 'table', 'context']) =>
  kinds.filter((kind) => mixed[kind + 'Id'] != null && mixed[kind + 'Id'] !== targetId);

export const tableRowsForFunction = (spec = {}, xValues = [-2, -1, 0, 1, 2]) =>
  xValues.map((x) => [Number(x), round(evaluateFunctionSpec(spec, Number(x)), 6)]).filter(([, y]) => Number.isFinite(y));

export const findTableMismatchIndexes = (spec = {}, rows = [], tolerance = 1e-6) => rows.reduce((indexes, row, index) => {
  if (!Array.isArray(row) || row.length !== 2) return [...indexes, index];
  const x = Number(row[0]);
  const y = Number(row[1]);
  const expected = evaluateFunctionSpec(spec, x);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(expected) || !nearlyEqual(y, expected, tolerance)) return [...indexes, index];
  return indexes;
}, []);

export const representationById = (sets = [], id) => sets.find((item) => item.id === id) || null;

export const mixedRepresentationCards = (sets = [], mixed = {}, kinds = ['equation', 'table', 'context']) => kinds.map((kind) => {
  const sourceId = mixed[kind + 'Id'];
  const source = representationById(sets, sourceId);
  return { kind, sourceId, value: source?.[kind] ?? '' };
});

// --- linearConnections ------------------------------------------------
//
// Every card kind a linearConnections set may expose. "graph" and the four
// numeric kinds are read as-is; the three equation kinds are free text in
// whatever surface form the author chose ("y=-2x+5", "y-1=-2(x-2)",
// "2x+y=5") because canonicalFromEquationText resolves any of them to the
// same line without needing to know which form it is looking at.
export const LINEAR_CARD_KINDS = ['slopeIntercept', 'pointSlope', 'standard', 'graph', 'slope', 'point', 'xIntercept', 'yIntercept', 'context'];

const linearCardValue = (set = {}, kind) => {
  if (kind === 'graph') return set.graphSpec ?? null;
  return set[kind];
};

const hasLinearCardValue = (value) => (
  Array.isArray(value) ? value.length === 2 && value.every((entry) => Number.isFinite(Number(entry)))
    : typeof value === 'number' ? Number.isFinite(value)
      : typeof value === 'object' ? Boolean(value)
        : value != null && String(value).trim() !== ''
);

/** The canonical line a linearConnections set describes, preferring whichever
 * explicit field can determine it — an equation string, then slope+point,
 * then a linear graphSpec. Used for authoring validation and for detecting an
 * intentionally mismatched card, never for scoring the plain grouping task
 * (there, the authored set membership itself is the ground truth). */
export const canonicalLineForSet = (set = {}) => {
  if (set.slopeIntercept) { const line = canonicalFromEquationText(set.slopeIntercept); if (line) return line; }
  if (set.standard) { const line = canonicalFromEquationText(set.standard); if (line) return line; }
  if (set.pointSlope) { const line = canonicalFromEquationText(set.pointSlope); if (line) return line; }
  if (Number.isFinite(Number(set.slope)) && Array.isArray(set.point)) {
    const line = canonicalFromPointSlope(set.point, Number(set.slope));
    if (line) return line;
  }
  if (set.graphSpec?.type === 'linear') {
    const a = Number(set.graphSpec.a ?? 1);
    const h = Number(set.graphSpec.h ?? 0);
    const k = Number(set.graphSpec.k ?? 0);
    if ([a, h, k].every(Number.isFinite)) return canonicalFromSlopeIntercept(a, k - a * h);
  }
  return null;
};

/** Build the shuffleable card deck for the "group the representations" task:
 * one card per (set, kind) pair that the set actually supplies. */
export const buildLinearConnectionCards = (sets = [], kinds = LINEAR_CARD_KINDS) => {
  const cards = [];
  sets.forEach((set) => {
    kinds.forEach((kind) => {
      const value = linearCardValue(set, kind);
      if (!hasLinearCardValue(value)) return;
      cards.push({ id: `${set.id}:${kind}`, setId: set.id, kind, value });
    });
  });
  return cards;
};

// A small deterministic PRNG so the card order is stable for a given question
// (same seed every render/reload) without persisting the shuffled order.
export const shuffleLinearConnectionCards = (cards, seed = 1) => {
  const shuffled = [...cards];
  let state = Number(seed) || 1;
  const nextRandom = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Scores a student's card -> slot assignment by comparing the PARTITION it
 * induces to the partition induced by each card's true source set, rather
 * than comparing slot labels directly — "Line A" and "Line B" are the
 * student's own labels and may not land in the same order the sets were
 * authored in, and this should not matter.
 */
export const scoreLinearConnectionGrouping = (cards, assignments = {}) => {
  let correctPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      totalPairs += 1;
      const sameActual = cards[i].setId === cards[j].setId;
      const sameAssigned = assignments[cards[i].id] != null && assignments[cards[i].id] === assignments[cards[j].id];
      if (sameActual === sameAssigned) correctPairs += 1;
    }
  }
  const fullyAssigned = cards.length > 0 && cards.every((card) => assignments[card.id] != null);
  const score = totalPairs ? correctPairs / totalPairs : 0;
  return { score, isCorrect: fullyAssigned && correctPairs === totalPairs, fullyAssigned, correctPairs, totalPairs };
};

/**
 * Finds the card(s) that do not match the majority canonical line among a set
 * of cards nominally describing the same line — the error-analysis task. The
 * mismatch is DERIVED by canonicalizing and comparing every card, never
 * looked up from an authored "this one is wrong" flag, so a bad rewrite is
 * caught the same way a student's own bad rewrite would be.
 */
export const findLinearMismatch = (cards = []) => {
  const canonical = cards.map((card) => canonicalFromEquationText(card.value));
  const groups = [];
  canonical.forEach((line, index) => {
    if (!line) return;
    const group = groups.find((candidate) => canonicalLinesEquivalent(candidate.line, line));
    if (group) group.indexes.push(index); else groups.push({ line, indexes: [index] });
  });
  groups.sort((a, b) => b.indexes.length - a.indexes.length);
  const majority = groups[0] || null;
  const mismatchIndexes = cards.map((_, index) => index).filter((index) => !majority?.indexes.includes(index));
  return { mismatchIndexes, majorityLine: majority?.line || null, mismatchIds: mismatchIndexes.map((index) => cards[index].id) };
};

export const scoreLinearMismatchSelection = (cards, selectedId) => {
  const { mismatchIds } = findLinearMismatch(cards);
  const ok = mismatchIds.length === 1 && selectedId === mismatchIds[0];
  return { ok, expectedId: mismatchIds.length === 1 ? mismatchIds[0] : null, mismatchIds };
};
